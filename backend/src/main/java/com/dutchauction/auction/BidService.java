package com.dutchauction.auction;

import com.dutchauction.common.ApiException;
import com.dutchauction.event.EventPublisher;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * 입찰 = 즉시 낙찰.
 * 1) Redis SET NX로 선착순 1명만 통과 (경쟁 요청을 DB까지 보내지 않음)
 * 2) DB에서 조건부 UPDATE + INSERT 한 문장으로 확정 (Redis 없이도 1명만 성공)
 * 낙찰가는 클라이언트 값이 아니라 서버가 요청을 받은 시각으로 계산한다.
 */
@Service
public class BidService {
    public record BidResult(UUID itemId, long winningPrice, Instant wonAt) {}

    private final AuctionRepository auctions;
    private final StringRedisTemplate redis;
    private final EventPublisher events;

    public BidService(AuctionRepository auctions, StringRedisTemplate redis, EventPublisher events) {
        this.auctions = auctions;
        this.redis = redis;
        this.events = events;
    }

    private static ApiException alreadySold(String message) {
        return new ApiException(HttpStatus.CONFLICT, "ALREADY_SOLD", message);
    }

    public BidResult bid(UUID itemId, UUID userId) {
        AuctionRepository.ItemDetailRow item = auctions.findDetail(itemId).orElseThrow(ApiException::notFound);

        Instant now = Instant.now();
        if (now.isBefore(item.startsAt())) {
            throw new ApiException(HttpStatus.CONFLICT, "NOT_STARTED", "아직 경매가 시작되지 않았습니다.");
        }
        if (!now.isBefore(item.endsAt())) {
            throw new ApiException(HttpStatus.CONFLICT, "ENDED", "경매가 종료되었습니다.");
        }
        if (!"listed".equals(item.status())) {
            throw alreadySold("이미 낙찰된 물품입니다.");
        }

        String lockKey = "bid:lock:" + itemId;
        Boolean acquired = redis.opsForValue().setIfAbsent(lockKey, userId.toString(), Duration.ofSeconds(10));
        if (!Boolean.TRUE.equals(acquired)) {
            throw alreadySold("다른 사용자가 먼저 낙찰받았습니다.");
        }

        long price = PriceCalculator.priceAt(item.startPrice(), item.startsAt(), now, item.dropIntervalSec());
        try {
            if (!auctions.confirmAward(itemId, userId, price, now)) {
                throw alreadySold("다른 사용자가 먼저 낙찰받았습니다.");
            }
        } catch (RuntimeException e) {
            if (!(e instanceof ApiException)) {
                redis.delete(lockKey);   // DB 오류면 잠금을 풀어 다른 사용자가 다시 시도할 수 있게
            }
            throw e;
        }

        // 낙찰이 확정되면 잠금을 유지해 이후 요청도 Redis에서 바로 거절
        redis.expire(lockKey, Duration.ofHours(24));
        events.sold(item.auctionId(), itemId);
        return new BidResult(itemId, price, now);
    }
}
