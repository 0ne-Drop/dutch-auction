package com.dutchauction.auction;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuctionRepository {

    public record AuctionRow(UUID id, LocalDate auctionDate, Instant startsAt, Instant endsAt, String brandName) {}

    /** 공개 목록용: 가격 정보 없음 */
    public record PublicItemRow(UUID id, String name, String imageUrl, String category, String status) {}

    /** 입찰 페이지용: 가격 정보 포함 (로그인 사용자에게만) */
    public record ItemDetailRow(UUID id, String name, String imageUrl, String category, String status,
                                UUID auctionId, Instant startsAt, Instant endsAt, int dropIntervalSec,
                                String brandName, long startPrice, Long winningPrice, Instant wonAt,
                                UUID winnerUserId) {}

    public record WinRow(UUID id, String name, String imageUrl, String brandName, long winningPrice, Instant wonAt) {}

    public record SweptRow(UUID itemId, UUID auctionId) {}

    private final NamedParameterJdbcTemplate jdbc;

    public AuctionRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    static Instant instant(ResultSet rs, String col) throws SQLException {
        OffsetDateTime t = rs.getObject(col, OffsetDateTime.class);
        return t == null ? null : t.toInstant();
    }

    static OffsetDateTime utc(Instant t) {
        return OffsetDateTime.ofInstant(t, ZoneOffset.UTC);
    }

    public Optional<AuctionRow> findByDate(LocalDate date) {
        return jdbc.query("""
                SELECT a.auction_id, a.auction_date, a.starts_at, a.ends_at, b.name AS brand_name
                  FROM auction a JOIN brand b ON b.brand_id = a.brand_id
                 WHERE a.auction_date = :date
                """, Map.of("date", date), (rs, i) -> new AuctionRow(
                rs.getObject("auction_id", UUID.class), rs.getObject("auction_date", LocalDate.class),
                instant(rs, "starts_at"), instant(rs, "ends_at"), rs.getString("brand_name"))).stream().findFirst();
    }

    public List<AuctionRow> findUpcoming(LocalDate after, int limit) {
        return jdbc.query("""
                SELECT a.auction_id, a.auction_date, a.starts_at, a.ends_at, b.name AS brand_name
                  FROM auction a JOIN brand b ON b.brand_id = a.brand_id
                 WHERE a.auction_date > :after
                 ORDER BY a.auction_date
                 LIMIT :limit
                """, Map.of("after", after, "limit", limit), (rs, i) -> new AuctionRow(
                rs.getObject("auction_id", UUID.class), rs.getObject("auction_date", LocalDate.class),
                instant(rs, "starts_at"), instant(rs, "ends_at"), rs.getString("brand_name")));
    }

    public List<PublicItemRow> findPublicItems(UUID auctionId, String category) {
        Map<String, Object> params = new HashMap<>();
        params.put("auctionId", auctionId);
        String categoryFilter = "";
        if (category != null) {
            categoryFilter = " AND category = :category";
            params.put("category", category);
        }
        return jdbc.query("""
                SELECT item_id, name, image_url, category, status
                  FROM item
                 WHERE auction_id = :auctionId AND deleted_at IS NULL""" + categoryFilter + """

                 ORDER BY created_at, item_id
                """, params, (rs, i) -> new PublicItemRow(
                rs.getObject("item_id", UUID.class), rs.getString("name"), rs.getString("image_url"),
                rs.getString("category"), rs.getString("status")));
    }

    public int countItems(UUID auctionId) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM item WHERE auction_id = :auctionId AND deleted_at IS NULL
                """, Map.of("auctionId", auctionId), Integer.class);
        return n == null ? 0 : n;
    }

    public Optional<ItemDetailRow> findDetail(UUID itemId) {
        return jdbc.query("""
                SELECT i.item_id, i.name, i.image_url, i.category, i.status, i.start_price,
                       a.auction_id, a.starts_at, a.ends_at, a.price_drop_interval_sec,
                       b.name AS brand_name,
                       w.winning_price, w.won_at, w.winner_user_id
                  FROM item i
                  JOIN auction a ON a.auction_id = i.auction_id
                  JOIN brand b   ON b.brand_id = a.brand_id
                  LEFT JOIN award w ON w.item_id = i.item_id
                 WHERE i.item_id = :itemId AND i.deleted_at IS NULL
                """, Map.of("itemId", itemId), (rs, i) -> new ItemDetailRow(
                rs.getObject("item_id", UUID.class), rs.getString("name"), rs.getString("image_url"),
                rs.getString("category"), rs.getString("status"),
                rs.getObject("auction_id", UUID.class), instant(rs, "starts_at"), instant(rs, "ends_at"),
                rs.getInt("price_drop_interval_sec"), rs.getString("brand_name"),
                rs.getLong("start_price"),
                rs.getObject("winning_price") == null ? null : rs.getLong("winning_price"),
                instant(rs, "won_at"), rs.getObject("winner_user_id", UUID.class))).stream().findFirst();
    }

    /**
     * 낙찰 확정: 상태 변경과 낙찰 기록을 한 문장으로 실행.
     * 이미 낙찰·유찰됐으면 0행 → false. (Redis 잠금이 없어도 DB 제약만으로 1명만 성공)
     */
    public boolean confirmAward(UUID itemId, UUID userId, long price, Instant wonAt) {
        List<UUID> rows = jdbc.queryForList("""
                WITH sold AS (
                    UPDATE item SET status = 'sold'
                     WHERE item_id = :itemId AND status = 'listed' AND deleted_at IS NULL
                    RETURNING item_id
                )
                INSERT INTO award (item_id, winner_user_id, winning_price, won_at)
                SELECT item_id, :userId, :price, :wonAt FROM sold
                RETURNING item_id
                """, Map.of("itemId", itemId, "userId", userId, "price", price, "wonAt", utc(wonAt)), UUID.class);
        return !rows.isEmpty();
    }

    public List<WinRow> findWins(UUID userId) {
        return jdbc.query("""
                SELECT i.item_id, i.name, i.image_url, b.name AS brand_name, w.winning_price, w.won_at
                  FROM award w
                  JOIN item i    ON i.item_id = w.item_id
                  JOIN auction a ON a.auction_id = i.auction_id
                  JOIN brand b   ON b.brand_id = a.brand_id
                 WHERE w.winner_user_id = :userId
                 ORDER BY w.won_at DESC
                """, Map.of("userId", userId), (rs, i) -> new WinRow(
                rs.getObject("item_id", UUID.class), rs.getString("name"), rs.getString("image_url"),
                rs.getString("brand_name"), rs.getLong("winning_price"), instant(rs, "won_at")));
    }

    /** 종료 시각이 지난 회차의 미낙찰 물품을 유찰 처리 */
    public List<SweptRow> markUnsold() {
        return jdbc.query("""
                UPDATE item SET status = 'unsold'
                 WHERE status = 'listed' AND deleted_at IS NULL
                   AND auction_id IN (SELECT auction_id FROM auction WHERE ends_at <= now())
                RETURNING item_id, auction_id
                """, Map.of(), (rs, i) -> new SweptRow(
                rs.getObject("item_id", UUID.class), rs.getObject("auction_id", UUID.class)));
    }
}
