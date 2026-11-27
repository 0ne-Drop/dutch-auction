package com.dutchauction.auth;

import com.dutchauction.common.RedisRetry;
import io.lettuce.core.api.async.BaseRedisAsyncCommands;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Redis 세션: session:{sid} → 사용자 ID. 쿠키 sid(httpOnly, SameSite=Lax)로 전달. 서버 여러 대가 공유.
 *
 * Redis 장애 조치 대비
 *   - 세션 읽기·쓰기·삭제는 RedisRetry 로 감싼다: 마스터가 바뀌는 몇 초 동안 오류 대신 응답이 늦어진다.
 *   - 로그인 시 WAIT 1 으로 복제본 1개 이상이 세션을 받았는지 확인한 뒤 응답한다:
 *     응답 직후 마스터가 죽어도 승격된 복제본에 세션이 남는다.
 */
@Component
public class SessionStore {
    public static final String COOKIE_NAME = "sid";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Logger log = LoggerFactory.getLogger(SessionStore.class);

    private final StringRedisTemplate redis;
    private final RedisRetry retry;
    private final boolean cookieSecure;
    private final Duration ttl;
    private final long replicaWaitMs;
    private final boolean sentinelMode;

    public SessionStore(StringRedisTemplate redis,
                        RedisRetry retry,
                        @Value("${app.cookie-secure:false}") boolean cookieSecure,
                        @Value("${app.session-ttl-days:7}") long ttlDays,
                        @Value("${app.session-replica-wait:100ms}") Duration replicaWait,
                        @Value("${spring.data.redis.sentinel.master:}") String sentinelMaster) {
        this.redis = redis;
        this.retry = retry;
        this.cookieSecure = cookieSecure;
        this.ttl = Duration.ofDays(ttlDays);
        this.replicaWaitMs = replicaWait.toMillis();
        this.sentinelMode = !sentinelMaster.isBlank();
    }

    private static String key(String sid) { return "session:" + sid; }

    public String create(UUID userId) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String sid = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        retry.run("session create", () -> redis.opsForValue().set(key(sid), userId.toString(), ttl));
        waitForReplica();
        return sid;
    }

    /**
     * WAIT 1 {replicaWaitMs}: 방금 쓴 세션이 복제본 1개 이상에 복사될 때까지 기다린다 (보통 1ms 안쪽).
     * 확인하지 못해도 로그인은 실패시키지 않는다: 세션은 마스터에 이미 있고,
     * min-replicas-to-write 1 이라 복제본이 붙어 있을 때만 쓰기가 성공한다.
     * 단일 Redis(로컬)는 복제본이 없어 항상 0 이므로 경고를 남기지 않는다.
     */
    private void waitForReplica() {
        if (replicaWaitMs <= 0) return;
        try {
            Long acked = redis.execute((RedisCallback<Long>) conn -> {
                if (!(conn.getNativeConnection() instanceof BaseRedisAsyncCommands<?, ?> cmds)) return null;
                try {
                    return cmds.waitForReplication(1, replicaWaitMs).get(replicaWaitMs + 1000, TimeUnit.MILLISECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return null;
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            });
            if (acked != null && acked == 0 && sentinelMode) {
                log.warn("session written but no replica acknowledged within {}ms", replicaWaitMs);
            }
        } catch (RuntimeException e) {
            log.warn("WAIT for session replication failed: {}", e.getMessage());
        }
    }

    public void destroy(String sid) {
        if (sid != null) retry.run("session destroy", () -> redis.delete(key(sid)));
    }

    public Optional<String> sidFrom(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return Optional.empty();
        for (Cookie c : cookies) {
            if (COOKIE_NAME.equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) {
                return Optional.of(c.getValue());
            }
        }
        return Optional.empty();
    }

    public Optional<UUID> userIdFrom(HttpServletRequest request) {
        return sidFrom(request)
                .map(sid -> retry.call("session read", () -> redis.opsForValue().get(key(sid))))
                .map(UUID::fromString);
    }

    public String loginCookie(String sid) {
        return ResponseCookie.from(COOKIE_NAME, sid)
                .httpOnly(true).secure(cookieSecure).sameSite("Lax").path("/").maxAge(ttl)
                .build().toString();
    }

    public String logoutCookie() {
        return ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true).secure(cookieSecure).sameSite("Lax").path("/").maxAge(0)
                .build().toString();
    }
}
