package com.dutchauction.seed;

import com.dutchauction.auction.AuctionRule;
import com.dutchauction.common.UuidV7;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 데모 데이터 생성 (app.seed.enabled=true 일 때만). 기존 데이터와 Redis 세션·잠금·접속자를 모두 지운다.
 * 브랜드·물품·가격은 모두 예시. 데모 계정: demo / demo1234
 * 오늘의 경매: app.seed.start-in-sec 초 뒤 시작, 10초 주기 1.02% 인하, 20분 진행(19분 40초에 최소가 도달)
 */
@Component
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true")
public class DemoSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private record DemoItem(String category, String name, String imageLabel, long startPrice) {}

    private static final List<String> BRANDS = List.of("솔트앤파인", "그레이포레스트", "라벤더힐", "블루하버");
    private static final List<DemoItem> ITEMS = List.of(
            new DemoItem("outer", "울 블렌드 싱글 코트", "Coat", 289_000),
            new DemoItem("outer", "라이트 다운 패딩 점퍼", "Padding", 239_000),
            new DemoItem("top", "케이블 니트 스웨터", "Knit", 129_000),
            new DemoItem("top", "옥스포드 버튼다운 셔츠", "Shirt", 79_000),
            new DemoItem("bottom", "와이드 울 슬랙스", "Slacks", 99_000),
            new DemoItem("bottom", "세미 와이드 데님 팬츠", "Denim", 89_000),
            new DemoItem("shoes", "스웨이드 첼시 부츠", "Boots", 199_000),
            new DemoItem("acc", "램스울 머플러", "Muffler", 59_000));

    private final NamedParameterJdbcTemplate jdbc;
    private final StringRedisTemplate redis;
    private final long startInSec;

    public DemoSeeder(NamedParameterJdbcTemplate jdbc, StringRedisTemplate redis,
                      @Value("${app.seed.start-in-sec:60}") long startInSec) {
        this.jdbc = jdbc;
        this.redis = redis;
        this.startInSec = startInSec;
    }

    private static OffsetDateTime utc(Instant t) {
        return OffsetDateTime.ofInstant(t, ZoneOffset.UTC);
    }

    private static String imageUrl(String label) {
        return "https://placehold.co/600x600/e9e9e9/555555/png?text=" + URLEncoder.encode(label, StandardCharsets.UTF_8);
    }

    private void insertAuction(UUID auctionId, UUID brandId, Instant startsAt) {
        jdbc.update("""
                INSERT INTO auction (auction_id, brand_id, auction_date, starts_at, ends_at, price_drop_interval_sec)
                VALUES (:id, :brandId, :date, :startsAt, :endsAt, :interval)
                """, Map.of(
                "id", auctionId, "brandId", brandId,
                "date", LocalDate.ofInstant(startsAt, SEOUL),
                "startsAt", utc(startsAt),
                "endsAt", utc(startsAt.plusSeconds(AuctionRule.DEFAULT_DURATION_SEC)),
                "interval", AuctionRule.DEFAULT_DROP_INTERVAL_SEC));
    }

    @Override
    public void run(String... args) {
        jdbc.getJdbcTemplate().execute("TRUNCATE award, item, auction, app_user, brand");
        for (String pattern : List.of("session:*", "bid:lock:*", "viewers:*")) {
            Set<String> keys = redis.keys(pattern);
            if (keys != null && !keys.isEmpty()) redis.delete(keys);
        }

        List<UUID> brandIds = new ArrayList<>();
        for (String name : BRANDS) {
            UUID id = UuidV7.generate();
            brandIds.add(id);
            jdbc.update("INSERT INTO brand (brand_id, name) VALUES (:id, :name)", Map.of("id", id, "name", name));
        }

        // 오늘의 경매: 초 단위로 맞춘 시작 시각
        Instant now = Instant.now();
        Instant startsAt = Instant.ofEpochSecond(now.getEpochSecond() + startInSec);
        UUID todayId = UuidV7.generate();
        insertAuction(todayId, brandIds.get(0), startsAt);
        for (DemoItem item : ITEMS) {
            jdbc.update("""
                    INSERT INTO item (item_id, auction_id, name, image_url, category, start_price)
                    VALUES (:id, :auctionId, :name, :imageUrl, :category, :startPrice)
                    """, Map.of("id", UuidV7.generate(), "auctionId", todayId, "name", item.name(),
                    "imageUrl", imageUrl(item.imageLabel()), "category", item.category(),
                    "startPrice", item.startPrice()));
        }

        // 진행 예정 회차: 내일부터 매일 서울 기준 20:00
        LocalDate today = LocalDate.ofInstant(now, SEOUL);
        for (int i = 1; i < BRANDS.size(); i++) {
            Instant s = ZonedDateTime.of(today.plusDays(i).atTime(20, 0), SEOUL).toInstant();
            insertAuction(UuidV7.generate(), brandIds.get(i), s);
        }

        jdbc.update("INSERT INTO app_user (app_user_id, login_id, password_hash) VALUES (:id, 'demo', :hash)",
                Map.of("id", UuidV7.generate(), "hash", new BCryptPasswordEncoder().encode("demo1234")));

        log.info("seeded: 오늘의 경매({}) 시작 {} / 데모 계정 demo / demo1234", BRANDS.get(0), startsAt);
    }
}
