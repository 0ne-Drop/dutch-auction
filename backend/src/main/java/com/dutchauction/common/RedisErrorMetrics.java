package com.dutchauction.common;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.stereotype.Component;

/**
 * Redis 타임아웃·연결 오류 수 (모니터링 S10).
 * Prometheus: redis_client_errors_total{type="timeout"|"connection"}
 * Lettuce 기본 메트릭(lettuce_command_*)에는 실패한 명령이 따로 집계되지 않아서 직접 셈.
 */
@Component
public class RedisErrorMetrics {
    private final Counter timeouts;
    private final Counter connectionFailures;

    public RedisErrorMetrics(MeterRegistry registry) {
        this.timeouts = Counter.builder("redis.client.errors")
                .description("Redis 명령 타임아웃·연결 실패 수")
                .tag("type", "timeout")
                .register(registry);
        this.connectionFailures = Counter.builder("redis.client.errors")
                .description("Redis 명령 타임아웃·연결 실패 수")
                .tag("type", "connection")
                .register(registry);
    }

    /** Redis 오류이면 세고 true. 아니면 false. */
    public boolean record(Throwable error) {
        for (Throwable t = error; t != null; t = t.getCause()) {
            // Spring Data Redis 가 Lettuce 의 RedisCommandTimeoutException 을 QueryTimeoutException 으로 바꿔 던짐
            if (t instanceof QueryTimeoutException
                    || t.getClass().getName().equals("io.lettuce.core.RedisCommandTimeoutException")) {
                timeouts.increment();
                return true;
            }
            if (t instanceof RedisConnectionFailureException
                    || t.getClass().getName().equals("io.lettuce.core.RedisConnectionException")) {
                connectionFailures.increment();
                return true;
            }
            if (t.getCause() == t) break;
        }
        return false;
    }
}
