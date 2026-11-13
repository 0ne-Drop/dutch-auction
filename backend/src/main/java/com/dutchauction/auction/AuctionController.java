package com.dutchauction.auction;

import com.dutchauction.auth.AuthInterceptor;
import com.dutchauction.common.ApiException;
import com.dutchauction.presence.PresenceService;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 가격 노출 원칙: 가격(시작가·최소가·낙찰가)은 로그인한 사용자의 입찰 페이지(/api/items/{id})와
 * 본인의 낙찰 목록(/api/me/wins)에서만 내려준다. 공개 API(오늘의 경매, 예정 브랜드, SSE)에는 가격이 없다.
 * 날짜·시각은 ISO 8601 문자열로 내려준다(Jackson 설정에 의존하지 않도록).
 */
@RestController
@RequestMapping("/api")
public class AuctionController {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final AuctionRepository auctions;
    private final BidService bidService;
    private final PresenceService presence;

    public AuctionController(AuctionRepository auctions, BidService bidService, PresenceService presence) {
        this.auctions = auctions;
        this.bidService = bidService;
        this.presence = presence;
    }

    private static UUID parseId(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound();
        }
    }

    private static Map<String, Object> auctionJson(AuctionRepository.AuctionRow a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.id().toString());
        m.put("auctionDate", a.auctionDate().toString());
        m.put("startsAt", a.startsAt().toString());
        m.put("endsAt", a.endsAt().toString());
        m.put("brandName", a.brandName());
        return m;
    }

    @GetMapping("/time")
    public Map<String, Long> time() {
        return Map.of("now", System.currentTimeMillis());
    }

    @GetMapping("/categories")
    public List<Map<String, String>> categories() {
        return AuctionRule.CATEGORIES;
    }

    /** 홈: 오늘의 경매 (로그인 불필요, 가격 정보 없음) */
    @GetMapping("/auctions/today")
    public Map<String, Object> today(@RequestParam(required = false) String category) {
        Map<String, Object> body = new HashMap<>();
        var auction = auctions.findByDate(LocalDate.now(SEOUL));
        if (auction.isEmpty()) {
            body.put("auction", null);
            body.put("items", List.of());
            body.put("totalItems", 0);
            return body;
        }
        var a = auction.get();
        String filter = AuctionRule.isCategory(category) ? category : null;
        List<Map<String, Object>> items = auctions.findPublicItems(a.id(), filter).stream().map(it -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", it.id().toString());
            m.put("name", it.name());
            m.put("imageUrl", it.imageUrl());
            m.put("category", it.category());
            m.put("status", it.status());
            return m;
        }).toList();
        body.put("auction", auctionJson(a));
        body.put("items", items);
        body.put("totalItems", auctions.countItems(a.id()));
        return body;
    }

    /** 햄버거 메뉴: 진행 예정 브랜드 */
    @GetMapping("/auctions/upcoming")
    public List<Map<String, Object>> upcoming() {
        return auctions.findUpcoming(LocalDate.now(SEOUL), 10).stream().map(a -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", a.id().toString());
            m.put("auctionDate", a.auctionDate().toString());
            m.put("startsAt", a.startsAt().toString());
            m.put("brandName", a.brandName());
            return m;
        }).toList();
    }

    /** 입찰 페이지 상세 (로그인 필요, 가격 포함) */
    @GetMapping("/items/{id}")
    public Map<String, Object> item(@PathVariable String id, @RequestAttribute(AuthInterceptor.USER_ID) UUID userId) {
        var it = auctions.findDetail(parseId(id)).orElseThrow(ApiException::notFound);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", it.id().toString());
        m.put("name", it.name());
        m.put("imageUrl", it.imageUrl());
        m.put("category", it.category());
        m.put("status", it.status());
        m.put("auctionId", it.auctionId().toString());
        m.put("brandName", it.brandName());
        m.put("startsAt", it.startsAt().toString());
        m.put("endsAt", it.endsAt().toString());
        m.put("priceDropIntervalSec", it.dropIntervalSec());
        m.put("startPrice", it.startPrice());
        m.put("minPrice", PriceCalculator.minPrice(it.startPrice()));
        m.put("winningPrice", it.winningPrice());
        m.put("wonAt", it.wonAt() == null ? null : it.wonAt().toString());
        m.put("wonByMe", userId.equals(it.winnerUserId()));
        return m;
    }

    /** 입찰 (= 즉시 낙찰) */
    @PostMapping("/items/{id}/bid")
    public Map<String, Object> bid(@PathVariable String id, @RequestAttribute(AuthInterceptor.USER_ID) UUID userId) {
        var result = bidService.bid(parseId(id), userId);
        return Map.of("itemId", result.itemId().toString(),
                "winningPrice", result.winningPrice(),
                "wonAt", result.wonAt().toString());
    }

    /** 접속 신호(하트비트): 화면이 경매 시작 기준 0초·5초·10초…에 호출 */
    @PostMapping("/items/{id}/presence")
    public Map<String, Long> heartbeat(@PathVariable String id, @RequestAttribute(AuthInterceptor.USER_ID) UUID userId) {
        return Map.of("viewers", presence.heartbeat(parseId(id), userId));
    }

    /** 접속자 수 조회(집계만): 화면이 경매 시작 1초 뒤부터 5초 단위(1초·6초·11초…)로 호출 */
    @GetMapping("/items/{id}/presence")
    public Map<String, Long> viewers(@PathVariable String id) {
        return Map.of("viewers", presence.count(parseId(id)));
    }

    /** 입찰 페이지를 떠날 때 즉시 접속자 수에서 빠지도록 */
    @PostMapping("/items/{id}/presence/leave")
    public Map<String, Boolean> leave(@PathVariable String id, @RequestAttribute(AuthInterceptor.USER_ID) UUID userId) {
        presence.leave(parseId(id), userId);
        return Map.of("ok", true);
    }

    /** 내 낙찰 물품 (본인 구매 내역이라 낙찰가 포함) */
    @GetMapping("/me/wins")
    public List<Map<String, Object>> wins(@RequestAttribute(AuthInterceptor.USER_ID) UUID userId) {
        return auctions.findWins(userId).stream().map(w -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", w.id().toString());
            m.put("name", w.name());
            m.put("imageUrl", w.imageUrl());
            m.put("brandName", w.brandName());
            m.put("winningPrice", w.winningPrice());
            m.put("wonAt", w.wonAt().toString());
            return m;
        }).toList();
    }
}
