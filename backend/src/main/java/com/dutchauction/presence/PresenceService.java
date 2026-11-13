package com.dutchauction.presence;

import java.time.Duration;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * 입찰 페이지 접속자 수.
 * 화면이 경매 시작 기준 0초·5초·10초…에 하트비트를 보내면 Redis 정렬 집합 viewers:{itemId}에
 * (사용자 ID, 마지막 하트비트 시각)을 기록하고, 시작 1초 뒤부터 5초 단위(1초·6초·11초…)로 집계를 읽는다.
 * 최근 12초 안에 하트비트를 보낸 사용자 수를 센다. 같은 사용자가 탭을 여러 개 열어도 1명.
 * 서버가 여러 대여도 Redis 한 곳에서 세므로 값이 같다.
 */
@Service
public class PresenceService {
    static final long ACTIVE_WINDOW_MS = 12_000;   // 하트비트 5초 × 2 + 여유

    private final StringRedisTemplate redis;

    public PresenceService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    private static String key(UUID itemId) { return "viewers:" + itemId; }

    public long heartbeat(UUID itemId, UUID userId) {
        String key = key(itemId);
        long now = System.currentTimeMillis();
        redis.opsForZSet().add(key, userId.toString(), now);
        redis.opsForZSet().removeRangeByScore(key, 0, now - ACTIVE_WINDOW_MS);
        redis.expire(key, Duration.ofMinutes(1));
        Long count = redis.opsForZSet().zCard(key);
        return count == null ? 0 : count;
    }

    /** 화면 갱신용: 집계만 한다(하트비트 기록 없음). 시작 1초 뒤부터 5초 단위로 호출된다. */
    public long count(UUID itemId) {
        String key = key(itemId);
        redis.opsForZSet().removeRangeByScore(key, 0, System.currentTimeMillis() - ACTIVE_WINDOW_MS);
        Long count = redis.opsForZSet().zCard(key);
        return count == null ? 0 : count;
    }

    public void leave(UUID itemId, UUID userId) {
        redis.opsForZSet().remove(key(itemId), userId.toString());
    }
}
