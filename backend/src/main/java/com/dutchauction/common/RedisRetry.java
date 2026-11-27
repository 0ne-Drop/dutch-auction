package com.dutchauction.common;

import java.time.Duration;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.stereotype.Component;

/**
 * Redis Sentinel 장애 조치(약 5~10초) 동안 잠깐 나는 오류를 재시도한다.
 *
 * 장애 조치 중 나는 오류
 *   - 연결 실패·명령 타임아웃: 마스터가 죽었고 Sentinel 이 아직 새 마스터를 정하지 않음
 *   - READONLY: 강등된 옛 마스터에 쓰기를 보냄 (Sentinel 이 연결을 끊으면 새 마스터로 재연결)
 *   - NOREPLICAS: 새 마스터에 복제본이 아직 붙지 않음 (min-replicas-to-write)
 *   - LOADING·MASTERDOWN·TRYAGAIN: 복제 동기화 중
 * 위 오류만 다시 시도하고, 그 밖의 오류(잘못된 명령 등)는 바로 던진다.
 * 가상 스레드에서 돌아서 기다리는 동안 OS 스레드를 잡지 않는다.
 */
@Component
public class RedisRetry {
    private static final Logger log = LoggerFactory.getLogger(RedisRetry.class);
    private static final long FIRST_BACKOFF_MS = 200;
    private static final long MAX_BACKOFF_MS = 1000;

    private final long maxWaitMs;

    public RedisRetry(@Value("${app.redis-retry.max-wait:10s}") Duration maxWait) {
        this.maxWaitMs = maxWait.toMillis();
    }

    /** op 는 로그에 남길 이름. 재시도 시간(max-wait)이 지나면 마지막 오류를 그대로 던진다. */
    public <T> T call(String op, Supplier<T> action) {
        long deadline = System.currentTimeMillis() + maxWaitMs;
        long backoff = FIRST_BACKOFF_MS;
        int attempt = 1;
        while (true) {
            try {
                T result = action.get();
                if (attempt > 1) log.info("redis {} succeeded after {} attempts", op, attempt);
                return result;
            } catch (RuntimeException e) {
                long now = System.currentTimeMillis();
                if (!isTransient(e) || now + backoff >= deadline) throw e;
                log.warn("redis {} failed (attempt {}), retrying in {}ms: {}", op, attempt, backoff, rootMessage(e));
                sleep(backoff);
                backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
                attempt++;
            }
        }
    }

    public void run(String op, Runnable action) {
        call(op, () -> {
            action.run();
            return null;
        });
    }

    /** 장애 조치 중 잠깐 나는 오류이면 true */
    static boolean isTransient(Throwable error) {
        for (Throwable t = error; t != null; t = t.getCause()) {
            if (t instanceof QueryTimeoutException || t instanceof RedisConnectionFailureException) return true;
            String type = t.getClass().getName();
            if (type.equals("io.lettuce.core.RedisCommandTimeoutException")
                    || type.equals("io.lettuce.core.RedisConnectionException")
                    || type.equals("io.lettuce.core.RedisReadOnlyException")
                    || type.equals("io.lettuce.core.RedisLoadingException")) {
                return true;
            }
            String msg = t.getMessage();
            if (msg != null && (msg.startsWith("READONLY") || msg.startsWith("NOREPLICAS")
                    || msg.startsWith("LOADING") || msg.startsWith("MASTERDOWN") || msg.startsWith("TRYAGAIN"))) {
                return true;
            }
            if (t.getCause() == t) break;
        }
        return false;
    }

    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) t = t.getCause();
        return t.getClass().getSimpleName() + ": " + t.getMessage();
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted while waiting for Redis failover", e);
        }
    }
}
