package com.dutchauction.auth;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final AuthInterceptor authInterceptor;

    public WebConfig(AuthInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 가격이 들어 있는 물품 상세·입찰·접속자 수, 내 낙찰 목록은 로그인 필수
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/items/**", "/api/me/**");
    }
}
