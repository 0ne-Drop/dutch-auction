package com.dutchauction;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DutchAuctionApplication {
    public static void main(String[] args) {
        SpringApplication.run(DutchAuctionApplication.class, args);
    }
}
