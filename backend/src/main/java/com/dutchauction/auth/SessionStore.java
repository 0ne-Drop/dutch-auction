package com.dutchauction.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/** Redis 세션: session:{sid} → 사용자 ID. 쿠키 sid(httpOnly, SameSite=Lax)로 전달. 서버 여러 대가 공유. */
@Component
public class SessionStore {
    public static final String COOKIE_NAME = "sid";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final StringRedisTemplate redis;
    private final boolean cookieSecure;
    private final Duration ttl;

    public SessionStore(StringRedisTemplate redis,
                        @Value("${app.cookie-secure:false}") boolean cookieSecure,
                        @Value("${app.session-ttl-days:7}") long ttlDays) {
        this.redis = redis;
        this.cookieSecure = cookieSecure;
        this.ttl = Duration.ofDays(ttlDays);
    }

    private static String key(String sid) { return "session:" + sid; }

    public String create(UUID userId) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String sid = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        redis.opsForValue().set(key(sid), userId.toString(), ttl);
        return sid;
    }

    public void destroy(String sid) {
        if (sid != null) redis.delete(key(sid));
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
                .map(sid -> redis.opsForValue().get(key(sid)))
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
