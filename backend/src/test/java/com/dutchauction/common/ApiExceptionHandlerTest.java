package com.dutchauction.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.Test;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

class ApiExceptionHandlerTest {
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new TestController())
            .setControllerAdvice(new ApiExceptionHandler(new RedisErrorMetrics(registry))).build();

    @Test
    void disconnectedSseRequestDoesNotWriteJsonError() throws Exception {
        MvcResult result = mvc.perform(get("/test/disconnect"))
                .andExpect(request().asyncStarted()).andReturn();
        result.getAsyncResult();

        mvc.perform(asyncDispatch(result))
                .andExpect(r -> assertInstanceOf(AsyncRequestNotUsableException.class,
                        r.getResolvedException()))
                .andExpect(content().string(""));
    }

    @Test
    void unexpectedErrorsStillReturnJsonServerError() throws Exception {
        mvc.perform(get("/test/error"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.error").value("SERVER_ERROR"));
    }

    @Test
    void redisTimeoutIsCounted() throws Exception {
        mvc.perform(get("/test/redis-timeout")).andExpect(status().isInternalServerError());
        mvc.perform(get("/test/error")).andExpect(status().isInternalServerError());

        assertEquals(1.0, registry.get("redis.client.errors").tag("type", "timeout").counter().count());
        assertEquals(0.0, registry.get("redis.client.errors").tag("type", "connection").counter().count());
    }

    @RestController
    static class TestController {
        @GetMapping("/test/disconnect")
        Callable<String> disconnect(HttpServletResponse response) {
            response.setContentType(MediaType.TEXT_EVENT_STREAM_VALUE);
            return () -> {
                throw new AsyncRequestNotUsableException("Client disconnected", new IOException("Broken pipe"));
            };
        }

        @GetMapping("/test/redis-timeout")
        String redisTimeout() {
            throw new QueryTimeoutException("Redis command timed out");
        }

        @GetMapping("/test/error")
        String error() {
            throw new IllegalStateException("Unexpected failure");
        }
    }
}
