# 더치 옥션 v2 — 3티어 (Vite + React 정적 웹 / Spring Boot / PostgreSQL·Redis)

하루 한 브랜드의 이월상품을 같은 시각에 동시에 경매합니다. 가격은 **10초마다 1.02%씩(복리)** 내려가고 **20분** 동안 진행되며, **최소가는 시작가의 30%**입니다. 19분 40초에 최소가에 도달해 마지막 20초 동안은 최소가로 살 수 있습니다. 가장 먼저 "지금 낙찰받기"를 누른 1명이 그 순간 가격에 낙찰받습니다.

| 티어 | 로컬 | 운영(AWS) |
| --- | --- | --- |
| 프레젠테이션 | `frontend/` 정적 빌드 → nginx | S3 + CloudFront |
| 애플리케이션 | `backend/` Spring Boot 4.1 (Java 21) | ALB + EKS |
| 데이터 | PostgreSQL 16, Redis 7 | RDS PostgreSQL, ElastiCache Redis |

## 바로 실행

### 방법 1. Docker Compose

```bash
docker compose up --build
```

- 웹: http://localhost:3000 · API: http://localhost:8080/api · 헬스체크: http://localhost:8080/actuator/health
- 데모 계정 `demo` / `demo1234`
- api 컨테이너가 시작할 때마다 데이터를 초기화하고 **60초 뒤 시작하는 오늘의 경매**를 만듭니다.

### 방법 2. 직접 실행 (Java 21, Node 22, PostgreSQL 16, Redis 7)

```bash
# DB·Redis
createdb dutch_auction                    # 또는 docker compose up -d db redis

# 백엔드 (터미널 1) — 첫 실행 시 Gradle이 의존성을 내려받습니다
cd backend
DATABASE_USERNAME=$(whoami) DATABASE_PASSWORD= SEED_ENABLED=true SEED_START_IN=60 ./gradlew bootRun

# 프론트엔드 (터미널 2) — /api 를 8080으로 프록시
cd frontend
npm install
npm run dev                               # http://localhost:5173
```

DB 접속 정보는 환경 변수로 바꿉니다: `DATABASE_URL`(기본 `jdbc:postgresql://localhost:5432/dutch_auction`), `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `REDIS_URL`. Homebrew PostgreSQL은 사용자명이 맥 계정명이라 위처럼 지정합니다.

## 테스트

```bash
cd backend && ./gradlew test               # 가격 계산 (shared/price-cases.csv 399건)
cd frontend && npm test                    # 같은 파일로 화면 가격 계산 검증 → 서버·화면 일치 보장
node scripts/race-test.mjs 50              # 백엔드 실행 중: 동시 입찰 1명 낙찰, 공개 API 가격 비노출, 접속자 수
```

## 이번 버전의 변경 사항

1. **가격 규칙:** 10초마다 1.02% 복리 인하, 20분 진행, 최소가 = 시작가의 30%(10원 단위 내림). 118번째 인하(19분 40초)에 최소가에 도달하고 종료까지 최소가를 유지합니다.
   - 인하율·최소가 비율은 앱 상수(`AuctionRule.java`, `frontend/src/lib/price.ts`), 인하 주기·진행 시간은 DB 회차 설정(기본 10초·20분).
   - 최소가가 시작가에서 계산되므로 `item.min_price` 컬럼을 삭제했습니다(제3정규형).
   - 서버와 화면은 부동소수점 대신 정수(BigInteger/BigInt)로 정확히 계산하고, 같은 기준 파일로 테스트합니다.
2. **입찰 페이지 접속자 수:** 경매 시작 1초 뒤부터 5초 단위(1초·6초·11초…)로 모든 사용자 화면이 같은 순간에 갱신됩니다(서버 시각 기준). 접속 신호는 그보다 1초 앞선 0초·5초·10초…에 보내 집계가 먼저 반영되게 했습니다. 서버는 Redis에서 최근 12초 안의 사용자 수를 셉니다. 같은 사용자의 여러 탭은 1명, 페이지를 떠나면 즉시 빠집니다.
3. **가격은 입찰 페이지에서만:** 홈·메뉴·공개 API·실시간 이벤트(SSE)에서 가격을 모두 제거했습니다. 가격은 로그인한 사용자의 입찰 페이지 API(`/api/items/{id}`)와 본인 낙찰 목록(`/api/me/wins`)에서만 내려갑니다.

## 구조

```
backend/                                   Spring Boot 4.1, Java 21, Gradle
  src/main/java/com/dutchauction/
    auction/  AuctionRule(가격 정책) PriceCalculator AuctionRepository BidService AuctionController
    auth/     AuthController SessionStore(Redis 세션) AuthInterceptor WebConfig UserRepository
    event/    EventPublisher SseHub(SSE + Redis pub/sub) EventController UnsoldSweeper(유찰, 단일 실행)
    presence/ PresenceService(접속자 수)
    seed/     DemoSeeder(SEED_ENABLED=true일 때만)
  src/main/resources/db/migration/V1__init.sql   Flyway 스키마
frontend/                                  Vite + React 19 + TypeScript + Tailwind, 정적 빌드(dist/)
  src/pages/  HomePage LoginPage SignupPage BidPage WinsPage
  nginx.conf                               CloudFront 동작(/api 분기, SPA 라우팅) 로컬 재현
shared/price-cases.csv                     서버·화면 공용 가격 기준값
scripts/race-test.mjs                      동시 입찰·가격 비노출·접속자 수 확인
docs/                                      API 명세, 테이블 명세, AWS 배포 안내
```
