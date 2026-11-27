package com.dutchauction.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.RedisReadOnlyException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.RedisSystemException;

class RedisRetryTest {

    @Test
    void retriesFailoverErrorsUntilSuccess() {
        RedisRetry retry = new RedisRetry(Duration.ofSeconds(5));
        AtomicInteger calls = new AtomicInteger();

        String result = retry.call("test", () -> {
            int n = calls.incrementAndGet();
            if (n == 1) throw new RedisSystemException("Error in execution",
                    new RedisReadOnlyException("READONLY You can't write against a read only replica."));
            if (n == 2) throw new RedisSystemException("Error in execution",
                    new RedisCommandExecutionException("NOREPLICAS Not enough good replicas to write."));
            return "ok";
        });

        assertEquals("ok", result);
        assertEquals(3, calls.get());
    }

    @Test
    void doesNotRetryOtherErrors() {
        RedisRetry retry = new RedisRetry(Duration.ofSeconds(5));
        AtomicInteger calls = new AtomicInteger();
        RedisSystemException error = new RedisSystemException("Error in execution",
                new RedisCommandExecutionException("WRONGTYPE Operation against a key holding the wrong kind of value"));

        RuntimeException thrown = assertThrows(RuntimeException.class, () -> retry.call("test", () -> {
            calls.incrementAndGet();
            throw error;
        }));

        assertSame(error, thrown);
        assertEquals(1, calls.get());
    }

    @Test
    void givesUpAfterMaxWait() {
        RedisRetry retry = new RedisRetry(Duration.ofMillis(500));
        AtomicInteger calls = new AtomicInteger();
        long start = System.currentTimeMillis();

        assertThrows(QueryTimeoutException.class, () -> retry.run("test", () -> {
            calls.incrementAndGet();
            throw new QueryTimeoutException("timeout");
        }));

        assertTrue(System.currentTimeMillis() - start < 1500);
        assertTrue(calls.get() >= 2);
    }

    @Test
    void classifiesTransientErrors() {
        assertTrue(RedisRetry.isTransient(new RedisConnectionFailureException("refused")));
        assertTrue(RedisRetry.isTransient(new QueryTimeoutException("timeout")));
        assertTrue(RedisRetry.isTransient(new RedisSystemException("x",
                new RedisCommandExecutionException("LOADING Redis is loading the dataset in memory"))));
        assertFalse(RedisRetry.isTransient(new IllegalArgumentException("bad")));
    }
}
