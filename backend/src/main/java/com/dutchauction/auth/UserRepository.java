package com.dutchauction.auth;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    public record UserRow(UUID id, String loginId, String passwordHash) {}

    private final NamedParameterJdbcTemplate jdbc;

    public UserRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean loginIdTaken(String loginId) {
        Boolean taken = jdbc.queryForObject("""
                SELECT EXISTS (
                  SELECT 1 FROM app_user WHERE lower(login_id) = lower(:loginId) AND deleted_at IS NULL)
                """, Map.of("loginId", loginId), Boolean.class);
        return Boolean.TRUE.equals(taken);
    }

    public void insert(UUID id, String loginId, String passwordHash) {
        jdbc.update("""
                INSERT INTO app_user (app_user_id, login_id, password_hash) VALUES (:id, :loginId, :hash)
                """, Map.of("id", id, "loginId", loginId, "hash", passwordHash));
    }

    public Optional<UserRow> findByLoginId(String loginId) {
        List<UserRow> rows = jdbc.query("""
                SELECT app_user_id, login_id, password_hash FROM app_user
                 WHERE lower(login_id) = lower(:loginId) AND deleted_at IS NULL
                """, Map.of("loginId", loginId),
                (rs, i) -> new UserRow(rs.getObject("app_user_id", UUID.class), rs.getString("login_id"), rs.getString("password_hash")));
        return rows.stream().findFirst();
    }

    public Optional<String> findLoginId(UUID id) {
        List<String> rows = jdbc.queryForList("""
                SELECT login_id FROM app_user WHERE app_user_id = :id AND deleted_at IS NULL
                """, Map.of("id", id), String.class);
        return rows.stream().findFirst();
    }
}
