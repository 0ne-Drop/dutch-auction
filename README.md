# 더치 옥션 v2 — 3티어 (Vite + React 정적 웹 / Spring Boot / PostgreSQL·Redis)

하루 한 브랜드의 이월상품을 같은 시각에 동시에 경매합니다. 가격은 **10초마다 1.02%씩(복리)** 내려가고 **20분** 동안 진행되며, **최소가는 시작가의 30%**입니다. 19분 40초에 최소가에 도달해 마지막 20초 동안은 최소가로 살 수 있습니다. 가장 먼저 "지금 낙찰받기"를 누른 1명이 그 순간 가격에 낙찰받습니다.

| 티어 | 로컬 | 운영(AWS) |
| --- | --- | --- |
| 프레젠테이션 | `frontend/` 정적 빌드 → nginx | S3 + CloudFront |
| 애플리케이션 | `backend/` Spring Boot 4.1 (Java 21) | ALB + EKS |
| 데이터 | RDS PostgreSQL (Bastion SSH 터널), Redis 7 | RDS PostgreSQL 18, EKS Redis (Sentinel) |

## 데이터베이스

DB 는 로컬에 두지 않고 **RDS PostgreSQL** 하나를 씁니다. 스키마는 앱이 기동할 때 Flyway(`V1__init.sql`)가 만들고, 데이터는 시드 SQL 로 넣습니다.

- 접속 정보는 환경 변수로만 받습니다: `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`. **기본값이 없어서** 값이 없으면 앱이 기동하지 않습니다.
- RDS 는 SSL 접속만 받으므로 URL 에 `sslmode=require` 를 붙입니다. 예) `jdbc:postgresql://<RDS 엔드포인트>:5432/OnedropDB?sslmode=require`
- EKS 에서는 `api-secret`(Secret)이 세 값을 주입합니다 (`dutch-auction-cicd`).
- 커넥션 풀은 `DB_POOL_SIZE`(기본 5)입니다. RDS(db.t4g.micro)의 `max_connections` 가 79 이므로 Pod 수 × 풀 크기가 이를 넘지 않게 합니다.
- 경매 회차·물품 데이터는 [`scripts/seed/musinsa/`](scripts/seed/musinsa/README.md) 의 SQL 로 넣습니다. 회차는 하루 1개이고, 그날(서울 기준) 회차만 홈에 보입니다.
- RDS 는 프라이빗 서브넷에 있어 노트북에서 바로 접속할 수 없습니다. 지금은 CloudShell(VPC 환경)에서 `psql` 로 접속하고, Bastion 을 만든 뒤에는 SSH 터널로 접속합니다.

## 바로 실행

먼저 Bastion SSH 터널을 열고 `.env` 를 만듭니다.

```bash
ssh -N -L 15432:<RDS 엔드포인트>:5432 ec2-user@<Bastion 공인 IP>   # 터미널을 열어 둔 채로
cp .env.example .env                                               # DATABASE_USERNAME, DATABASE_PASSWORD 채우기
```

> 로컬 앱도 실제 RDS 에 접속합니다. 개발 브랜치의 새 Flyway 마이그레이션, 유찰 처리(2초 주기), `race-test` 가 그 DB 의 데이터를 바꿉니다.

### 방법 1. Docker Compose

```bash
docker compose up --build
```

- 웹: http://localhost:3000 · API: http://localhost:8080/api · 헬스체크: http://localhost:8080/actuator/health
- 컨테이너는 `host.docker.internal:15432` 로 호스트의 터널에 접속합니다(`docker-compose.yml`).

### 방법 2. 직접 실행 (Java 21, Node 22, Redis 7)

```bash
# Redis
docker compose up -d redis                # 또는 로컬에 설치한 Redis

# 백엔드 (터미널 1) — 첫 실행 시 Gradle이 의존성을 내려받습니다
cd backend
set -a; source ../.env; set +a
./gradlew bootRun

# 프론트엔드 (터미널 2) — /api 를 8080으로 프록시
cd frontend
npm install
npm run dev                               # http://localhost:5173
```

Redis 는 `REDIS_HOST`(기본 `localhost`), `REDIS_PORT`(기본 `6379`) 로 단일 서버에 접속합니다. EKS 에서는 `SPRING_DATA_REDIS_SENTINEL_MASTER`, `SPRING_DATA_REDIS_SENTINEL_NODES`, `SPRING_DATA_REDIS_PASSWORD` 가 주어져 Sentinel 모드로 동작합니다.

## 테스트

```bash
cd backend && ./gradlew test               # 가격 계산 (shared/price-cases.csv 399건)
cd frontend && npm test                    # 같은 파일로 화면 가격 계산 검증 → 서버·화면 일치 보장
node scripts/race-test.mjs 50              # 백엔드 실행 중: 동시 입찰 1명 낙찰, 공개 API 가격 비노출, 접속자 수
```

`race-test` 는 회원을 실제로 가입시키고 물품을 낙찰 처리합니다. 운영 DB(`OnedropDB`)에 붙은 API 에서는 실행하지 마세요.

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
  src/main/resources/db/migration/V1__init.sql   Flyway 스키마
frontend/                                  Vite + React 19 + TypeScript + Tailwind, 정적 빌드(dist/)
  src/pages/  HomePage LoginPage SignupPage BidPage WinsPage
  nginx.conf                               CloudFront 동작(/api 분기, SPA 라우팅) 로컬 재현
shared/price-cases.csv                     서버·화면 공용 가격 기준값
scripts/race-test.mjs                      동시 입찰·가격 비노출·접속자 수 확인
scripts/seed/musinsa/                      RDS 에 넣는 목 데이터 (MUSINSA STANDARD 상품 100개)
.env.example                               로컬 실행용 RDS 접속 정보 예시
docs/                                      API 명세, 테이블 명세, AWS 배포 안내
```
