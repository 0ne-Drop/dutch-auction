package com.dutchauction.event;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * 낙찰·유찰 이벤트를 Redis 채널 auction:{auctionId}로 발행한다.
 * SSE는 비로그인 사용자도 구독하므로 이벤트에는 가격을 넣지 않는다.
 * (가격이 필요한 입찰 페이지는 이벤트를 받은 뒤 로그인 API로 다시 조회)
 * UUID만 들어가므로 JSON을 직접 만든다(직렬화 라이브러리에 의존하지 않음).
 */
@Component
public class EventPublisher {
    public static final String CHANNEL_PREFIX = "auction:";

    private final StringRedisTemplate redis;

    public EventPublisher(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void sold(UUID auctionId, UUID itemId) {
        redis.convertAndSend(CHANNEL_PREFIX + auctionId, "{\"type\":\"sold\",\"itemId\":\"" + itemId + "\"}");
    }

    public void ended(UUID auctionId, List<UUID> unsoldItemIds) {
        String ids = unsoldItemIds.stream().map(id -> "\"" + id + "\"").collect(Collectors.joining(","));
        redis.convertAndSend(CHANNEL_PREFIX + auctionId, "{\"type\":\"ended\",\"unsoldItemIds\":[" + ids + "]}");
    }
}
