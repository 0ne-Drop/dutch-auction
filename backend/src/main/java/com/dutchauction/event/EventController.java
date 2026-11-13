package com.dutchauction.event;

import java.util.UUID;
import com.dutchauction.common.ApiException;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** 경매 이벤트 구독 (SSE). 로그인 불필요, 가격 정보 없음. */
@RestController
public class EventController {
    private final SseHub hub;

    public EventController(SseHub hub) {
        this.hub = hub;
    }

    @GetMapping(path = "/api/auctions/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@PathVariable String id) {
        try {
            return hub.subscribe(UUID.fromString(id).toString());
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound();
        }
    }
}
