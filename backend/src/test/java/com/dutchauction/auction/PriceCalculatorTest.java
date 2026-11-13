package com.dutchauction.auction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * shared/price-cases.csv: 정확한 분수 계산으로 만든 기준값. 웹(frontend)도 같은 파일로 테스트해 서버·화면 가격이 일치함을 보장한다.
 */
class PriceCalculatorTest {
    private static final Instant START = Instant.parse("2026-11-09T11:00:00Z");

    @Test
    void matchesSharedCases() throws IOException {
        List<String> lines = Files.readAllLines(Path.of("..", "shared", "price-cases.csv"));
        for (String line : lines.subList(1, lines.size())) {
            String[] p = line.split(",");
            long expected = Long.parseLong(p[3]);
            long actual = PriceCalculator.priceAt(Long.parseLong(p[0]), START,
                    START.plusMillis(Long.parseLong(p[1])), Integer.parseInt(p[2]));
            assertEquals(expected, actual, line);
        }
    }

    @Test
    void ruleOf1_02PercentIn20Minutes() {
        long start = 289_000;
        assertEquals(86_700, PriceCalculator.minPrice(start));                                      // 30%
        assertEquals(start, PriceCalculator.priceAt(start, START, START.plusSeconds(9), 10));      // 첫 10초는 시작가
        assertEquals(286_050, PriceCalculator.priceAt(start, START, START.plusSeconds(10), 10));   // 1회 인하 (1.02%)
        assertEquals(87_080, PriceCalculator.priceAt(start, START, START.plusSeconds(1170), 10));  // 117회
        assertEquals(86_700, PriceCalculator.priceAt(start, START, START.plusSeconds(1180), 10));  // 118회 = 최소가 (19분 40초)
        assertEquals(86_700, PriceCalculator.priceAt(start, START, START.plusSeconds(1190), 10));  // 종료 전 마지막 구간도 최소가
    }

    @Test
    void rejectsInvalidInterval() {
        assertThrows(IllegalArgumentException.class, () -> PriceCalculator.priceAt(100, START, START, 0));
    }
}
