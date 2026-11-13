package com.dutchauction.event;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 이 서버(Pod)에 연결된 SSE 클라이언트 목록. Redis 채널 auction:* 메시지를 받아 해당 회차 구독자에게 전달한다.
 * 서버가 여러 대여도 모든 서버가 같은 Redis 채널을 구독하므로 모든 사용자가 이벤트를 받는다.
 */
@Component
public class SseHub implements MessageListener {
    private static final long TIMEOUT_MS = Duration.ofMinutes(30).toMillis();

    private final Map<String, Set<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(String auctionId) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        emitters.compute(auctionId, (id, set) -> {
            if (set == null) set = ConcurrentHashMap.newKeySet();
            set.add(emitter);
            return set;
        });
        Runnable remove = () -> removeEmitter(auctionId, emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(e -> remove.run());
        try {
            emitter.send(SseEmitter.event().reconnectTime(2000).comment("connected"));
        } catch (IOException | IllegalStateException e) {
            remove.run();
        }
        return emitter;
    }

    private void removeEmitter(String auctionId, SseEmitter emitter) {
        // Serialize removal with subscription so a new subscriber cannot be orphaned.
        emitters.computeIfPresent(auctionId, (id, set) -> {
            set.remove(emitter);
            return set.isEmpty() ? null : set;
        });
    }

    private void broadcast(String auctionId, String json) {
        Set<SseEmitter> set = emitters.get(auctionId);
        if (set == null) return;
        for (SseEmitter emitter : set) {
            try {
                emitter.send(SseEmitter.event().data(json, MediaType.TEXT_PLAIN));
            } catch (IOException | IllegalStateException e) {
                removeEmitter(auctionId, emitter);
            }
        }
    }

    /** Redis pub/sub 수신 */
    @Override
    public void onMessage(Message message, byte[] pattern) {
        String channel = new String(message.getChannel(), StandardCharsets.UTF_8);
        String body = new String(message.getBody(), StandardCharsets.UTF_8);
        if (channel.startsWith(EventPublisher.CHANNEL_PREFIX)) {
            broadcast(channel.substring(EventPublisher.CHANNEL_PREFIX.length()), body);
        }
    }

    /** 프록시·로드밸런서(CloudFront 기본 30초)가 유휴 연결을 끊지 않도록 15초마다 ping */
    @Scheduled(fixedRate = 15_000)
    public void ping() {
        for (Map.Entry<String, Set<SseEmitter>> entry : emitters.entrySet()) {
            Set<SseEmitter> set = entry.getValue();
            for (SseEmitter emitter : set) {
                try {
                    emitter.send(SseEmitter.event().comment("ping"));
                } catch (IOException | IllegalStateException e) {
                    removeEmitter(entry.getKey(), emitter);
                }
            }
        }
    }
}
