package com.dutchauction.auth;

import com.dutchauction.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/** 로그인 필수 경로: 세션이 없으면 401. 있으면 요청 속성 userId에 사용자 ID를 넣는다. */
@Component
public class AuthInterceptor implements HandlerInterceptor {
    public static final String USER_ID = "userId";

    private final SessionStore sessions;

    public AuthInterceptor(SessionStore sessions) {
        this.sessions = sessions;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        UUID userId = sessions.userIdFrom(request).orElseThrow(ApiException::unauthorized);
        request.setAttribute(USER_ID, userId);
        return true;
    }
}
