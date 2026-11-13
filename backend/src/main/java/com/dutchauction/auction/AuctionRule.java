package com.dutchauction.auction;

import java.util.List;
import java.util.Map;

/**
 * 경매 가격 정책 (애플리케이션 상수, DB에 저장하지 않음).
 * 웹(frontend/src/lib/price.ts)과 값이 같아야 하며, shared/price-cases.csv 테스트로 일치를 확인한다.
 */
public final class AuctionRule {
    private AuctionRule() {}

    /** 인하 주기마다 현재가의 1.02% 인하 (복리) → 분자/분모로 정확히 계산: × 0.9898 = 4949/5000 */
    public static final int DROP_NUMERATOR = 4949;
    public static final int DROP_DENOMINATOR = 5000;

    /** 최소가 = 시작가의 30% (10원 단위 내림) */
    public static final int MIN_PRICE_PERCENT = 30;

    /** 가격 단위: 10원 내림 */
    public static final long PRICE_UNIT = 10;

    /** 회차 생성 기본값 (실행 중에는 DB의 회차 설정을 사용): 10초 주기, 20분 진행.
     *  1.02%면 118회 인하(19분 40초)에 최소가 도달 → 마지막 20초 동안 최소가로 입찰 가능 */
    public static final int DEFAULT_DROP_INTERVAL_SEC = 10;
    public static final int DEFAULT_DURATION_SEC = 20 * 60;

    public static final List<Map<String, String>> CATEGORIES = List.of(
            Map.of("code", "outer", "label", "아우터"),
            Map.of("code", "top", "label", "상의"),
            Map.of("code", "bottom", "label", "하의"),
            Map.of("code", "shoes", "label", "신발"),
            Map.of("code", "acc", "label", "잡화"));

    public static boolean isCategory(String code) {
        return code != null && CATEGORIES.stream().anyMatch(c -> c.get("code").equals(code));
    }
}
