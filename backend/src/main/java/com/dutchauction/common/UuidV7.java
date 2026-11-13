package com.dutchauction.common;

import java.security.SecureRandom;
import java.util.UUID;

/** UUIDv7 생성기 (RFC 9562): 앞 48비트 = Unix 밀리초, 나머지 = 난수. 리전 간 조정 없이 앱에서 발급. */
public final class UuidV7 {
    private static final SecureRandom RANDOM = new SecureRandom();

    private UuidV7() {}

    public static UUID generate() {
        long millis = System.currentTimeMillis();
        long randA = RANDOM.nextInt(1 << 12);          // 12비트
        long randB = RANDOM.nextLong() & 0x3FFFFFFFFFFFFFFFL; // 62비트

        long msb = (millis & 0xFFFFFFFFFFFFL) << 16;     // 48비트 시각
        msb |= 0x7000L;                                  // 버전 7
        msb |= randA;
        long lsb = 0x8000000000000000L | randB;          // variant 10
        return new UUID(msb, lsb);
    }
}
