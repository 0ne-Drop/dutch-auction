# AWS 배포 안내 (3티어)

```
사용자 ─ CloudFront ─┬─ /*      → S3 (frontend/dist, OAC로 비공개 버킷)
                     └─ /api/*  → ALB → EKS (backend Pod) ─┬─ RDS PostgreSQL (Multi-AZ)
                                                           └─ ElastiCache Redis
```

## 1. 프론트엔드: S3 + CloudFront

```bash
cd frontend && npm ci && npm run build
aws s3 sync dist/ s3://<버킷>/ --delete --exclude "index.html" --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html s3://<버킷>/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id <ID> --paths "/index.html"
```

CloudFront 설정:

| 항목 | 값 | 이유 |
| --- | --- | --- |
| 기본 동작(`/*`) 원본 | S3 버킷 (OAC) | 정적 파일 |
| `/api/*` 동작 원본 | ALB | 웹과 API가 같은 도메인 → 세션 쿠키를 CORS 없이 사용 |
| `/api/*` 캐시 정책 | CachingDisabled | 가격·입찰은 캐시 금지 |
| `/api/*` 원본 요청 정책 | AllViewerExceptHostHeader (쿠키·쿼리 전달) | 세션 쿠키 전달 |
| `/api/*` 허용 메서드 | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE | 로그인·입찰 |
| 사용자 정의 오류 응답 | 403·404 → `/index.html`, 200 | SPA 라우팅(`/items/…` 새로고침) |
| 원본 응답 제한 시간 | 기본 30초 유지 | 백엔드가 SSE에 15초마다 ping을 보냄 |

## 2. 백엔드: EKS

- 이미지: `backend/Dockerfile` → ECR
- 프로브: `livenessProbe` → `/actuator/health/liveness`, `readinessProbe` → `/actuator/health/readiness`(DB·Redis 포함)
- 무중단 배포: `server.shutdown=graceful`, `terminationGracePeriodSeconds: 30`, `preStop` sleep 5~10초, 롤링 `maxUnavailable: 0`
- 오픈 전 예약 확장: KEDA cron으로 오픈 10분 전 replicas 증가, 종료 후 감소
- 다중 AZ: `topologySpreadConstraints`, `PodDisruptionBudget`
- 유찰 처리는 Redis 잠금으로 Pod 1개만 실행되므로 replicas를 늘려도 안전
- ALB 유휴 제한 시간(기본 60초)은 SSE ping(15초)보다 길어 그대로 사용 가능

## 3. 데이터

- RDS PostgreSQL 16 (Multi-AZ), 스키마는 앱 시작 시 Flyway가 적용
- ElastiCache Redis: 세션·입찰 잠금·접속자 수·이벤트 pub/sub
- 비밀값(DB 비밀번호 등)은 Secrets Manager → External Secrets 등으로 환경 변수 주입

## 환경 변수 (backend)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | `jdbc:postgresql://localhost:5432/dutch_auction` | JDBC 주소 |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | `postgres` / `postgres` | DB 계정 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 주소 |
| `COOKIE_SECURE` | `false` | HTTPS 운영 시 `true` |
| `SEED_ENABLED` / `SEED_START_IN` | `false` / `60` | 데모 데이터 생성(기존 데이터 삭제) — 운영에서는 끔 |
| `DB_POOL_SIZE` | `20` | 커넥션 풀 크기 |
