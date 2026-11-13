package com.dutchauction.event;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
public class RedisEventConfig {

    @Bean
    public RedisMessageListenerContainer auctionEventListener(RedisConnectionFactory factory, SseHub hub) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        container.addMessageListener(hub, new PatternTopic(EventPublisher.CHANNEL_PREFIX + "*"));
        return container;
    }
}
