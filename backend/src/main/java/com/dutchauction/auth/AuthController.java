package com.dutchauction.auth;

import com.dutchauction.common.ApiException;
import com.dutchauction.common.UuidV7;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {
    private static final Pattern LOGIN_ID = Pattern.compile("^[A-Za-z0-9]{4,20}$");
    private static final BCryptPasswordEncoder ENCODER = new BCryptPasswordEncoder();

    public record Credentials(String loginId, String password) {}

    private final UserRepository users;
    private final SessionStore sessions;

    public AuthController(UserRepository users, SessionStore sessions) {
        this.users = users;
        this.sessions = sessions;
    }

    private static void validateLoginId(String loginId) {
        if (loginId == null || !LOGIN_ID.matcher(loginId).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LOGIN_ID", "아이디는 영문·숫자 4~20자입니다.");
        }
    }

    @GetMapping("/auth/check-id")
    public Map<String, Boolean> checkId(@RequestParam(defaultValue = "") String loginId) {
        validateLoginId(loginId);
        return Map.of("available", !users.loginIdTaken(loginId));
    }

    @PostMapping("/auth/signup")
    public ResponseEntity<Map<String, Boolean>> signup(@RequestBody Credentials body) {
        String loginId = body == null ? null : body.loginId();
        String password = body == null || body.password() == null ? "" : body.password();
        validateLoginId(loginId);
        // BCrypt는 72바이트까지만 사용하므로 상한을 둔다
        if (password.length() < 8 || password.length() > 72) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD", "비밀번호는 8자 이상이어야 합니다.");
        }
        if (users.loginIdTaken(loginId)) {
            throw new ApiException(HttpStatus.CONFLICT, "LOGIN_ID_TAKEN", "이미 사용 중인 아이디입니다.");
        }
        try {
            users.insert(UuidV7.generate(), loginId, ENCODER.encode(password));
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "LOGIN_ID_TAKEN", "이미 사용 중인 아이디입니다.");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("ok", true));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<Map<String, String>> login(@RequestBody Credentials body) {
        String loginId = body == null || body.loginId() == null ? "" : body.loginId();
        String password = body == null || body.password() == null ? "" : body.password();
        UserRepository.UserRow user = users.findByLoginId(loginId)
                .filter(u -> ENCODER.matches(password, u.passwordHash()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS",
                        "아이디 또는 비밀번호가 올바르지 않습니다."));
        String sid = sessions.create(user.id());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, sessions.loginCookie(sid))
                .body(Map.of("loginId", user.loginId()));
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Map<String, Boolean>> logout(HttpServletRequest request) {
        sessions.sidFrom(request).ifPresent(sessions::destroy);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, sessions.logoutCookie())
                .body(Map.of("ok", true));
    }

    @GetMapping("/me")
    public Map<String, String> me(HttpServletRequest request) {
        UUID userId = sessions.userIdFrom(request).orElseThrow(ApiException::unauthorized);
        String loginId = users.findLoginId(userId).orElseThrow(ApiException::unauthorized);
        return Map.of("userId", userId.toString(), "loginId", loginId);
    }
}
