package com.dutchauction.event;

import com.dutchauction.auction.AuctionRepository;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 종료된 회차의 미낙찰 물품을 2초마다 유찰 처리하고 ended 이벤트를 보낸다.
 * Pod가 여러 개여도 Redis 잠금으로 한 번에 한 Pod만 실행한다(중복 실행 방지).
 */
@Component
public class UnsoldSweeper {
    private static final Logger log = LoggerFactory.getLogger(UnsoldSweeper.class);
    private static final String LOCK_KEY = "sweeper:lock";

    private final AuctionRepository auctions;
    private final EventPublisher events;
    private final StringRedisTemplate redis;

    public UnsoldSweeper(AuctionRepository auctions, EventPublisher events, StringRedisTemplate redis) {
        this.auctions = auctions;
        this.events = events;
        this.redis = redis;
    }

    @Scheduled(fixedDelay = 2_000)
    public void sweep() {
        try {
            Boolean locked = redis.opsForValue().setIfAbsent(LOCK_KEY, "1", Duration.ofMillis(1_800));
            if (!Boolean.TRUE.equals(locked)) return;

            Map<UUID, List<UUID>> byAuction = new LinkedHashMap<>();
            for (AuctionRepository.SweptRow row : auctions.markUnsold()) {
                byAuction.computeIfAbsent(row.auctionId(), k -> new ArrayList<>()).add(row.itemId());
            }
            byAuction.forEach(events::ended);
        } catch (RuntimeException e) {
            log.warn("unsold sweep failed: {}", e.getMessage());
        }
    }
}
