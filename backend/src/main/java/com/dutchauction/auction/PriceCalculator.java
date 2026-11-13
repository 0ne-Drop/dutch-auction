package com.dutchauction.auction;

import java.math.BigInteger;
import java.time.Instant;

/**
 * 더치 옥션 현재가 계산.
 *
 *   n      = floor((기준 시각 - 시작 시각) / 인하 주기)
 *   현재가 = max(최소가, floor10(시작가 × 0.9898ⁿ))   (1.02% 복리 인하)
 *   최소가 = floor10(시작가 × 30%)
 *
 * 부동소수점 오차로 서버와 웹의 10원 단위 결과가 어긋나지 않도록 정수(BigInteger)로 정확히 계산한다.
 * 웹은 같은 계산을 BigInt로 한다. 낙찰가는 항상 서버 시각으로 이 함수를 다시 계산해 정한다.
 */
public final class PriceCalculator {
    private PriceCalculator() {}

    /** 0.9898ⁿ < 0.3 이 되는 n은 118이므로, 이보다 훨씬 큰 n은 계산할 필요 없이 최소가 */
    private static final long MAX_STEPS = 1000;

    public static long minPrice(long startPrice) {
        return Math.floorDiv(startPrice * AuctionRule.MIN_PRICE_PERCENT, 100 * AuctionRule.PRICE_UNIT) * AuctionRule.PRICE_UNIT;
    }

    public static long steps(Instant startsAt, Instant at, int dropIntervalSec) {
        if (dropIntervalSec <= 0) {
            throw new IllegalArgumentException("dropIntervalSec must be positive");
        }
        long elapsedMs = at.toEpochMilli() - startsAt.toEpochMilli();
        if (elapsedMs <= 0) return 0;
        return Math.floorDiv(elapsedMs, dropIntervalSec * 1000L);
    }

    public static long priceAt(long startPrice, Instant startsAt, Instant at, int dropIntervalSec) {
        long n = steps(startsAt, at, dropIntervalSec);
        long min = minPrice(startPrice);
        if (n <= 0) return startPrice;
        if (n > MAX_STEPS) return min;

        BigInteger numerator = BigInteger.valueOf(startPrice)
                .multiply(BigInteger.valueOf(AuctionRule.DROP_NUMERATOR).pow((int) n));
        BigInteger denominator = BigInteger.valueOf(AuctionRule.DROP_DENOMINATOR).pow((int) n)
                .multiply(BigInteger.valueOf(AuctionRule.PRICE_UNIT));
        long floored = numerator.divide(denominator).longValueExact() * AuctionRule.PRICE_UNIT;
        return Math.max(min, floored);
    }
}
