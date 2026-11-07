# 더치 옥션 — 이월상품 역경매 모바일 웹앱

하루 한 브랜드의 이월상품을 같은 시각에 동시에 경매합니다. 가격은 시작가에서 1초마다 직전 가격의 0.5%씩(복리) 내려가고, 가장 먼저 "지금 낙찰받기"를 누른 1명이 그 순간 가격에 낙찰받습니다.

## 실행

### 방법 1. Docker Compose

```bash
docker compose up --build
```

- 웹앱: http://localhost:3000 (휴대폰 화면 폭으로 보면 가장 자연스럽습니다)
- API: http://localhost:4000/api
- 데모 계정: `demo` / `demo1234`
- api 컨테이너가 뜰 때마다 데모 데이터를 다시 만들고, **60초 뒤 시작하는 오늘의 경매**를 준비합니다. 시작 시각을 바꾸려면 `docker-compose.yml`의 `SEED_START_IN`(초)을 고치세요.

> **주의**
> - api 컨테이너가 재시작되면 **모든 사용자·낙찰 기록과 Redis 세션·잠금이 지워집니다.** 테스트 결과는 재시작 전에 기록하세요.
> - `db/schema.sql`은 DB 볼륨이 **처음 만들어질 때만** 적용됩니다. 스키마를 바꿨다면 `docker compose down -v`로 볼륨을 지우고 다시 띄우세요.
> - 웹의 API 프록시 주소(`API_ORIGIN`)는 **빌드할 때** 정해집니다. 바꾸면 `--build`로 다시 빌드하세요.
> - 호스트에서 PostgreSQL(5432)이나 Redis(6379)가 이미 실행 중이면 포트가 충돌합니다.

### 방법 2. 직접 실행 (Node 22, PostgreSQL 16, Redis 7)

```bash
npm run install:all
createdb dutch_auction                 # DATABASE_URL 기본값: postgres://postgres@localhost:5432/dutch_auction
npm run db:init                        # db/schema.sql 적용 (기존 테이블 삭제)
npm run seed -- --start-in 60          # 60초 뒤 시작하는 오늘의 경매 + 예정 브랜드 + 데모 계정
npm run dev:api                        # http://localhost:4000
npm run dev:web                        # http://localhost:3000
```

### 환경 변수

| 변수 | 대상 | 기본값 | 설명 |
|---|---|---|---|
| `DATABASE_URL` | api | `postgres://postgres@localhost:5432/dutch_auction` | PostgreSQL 접속 주소 |
| `REDIS_URL` | api | `redis://localhost:6379` | Redis 접속 주소 |
| `API_PORT` | api | `4000` | API 포트 |
| `COOKIE_SECURE` | api | `false` | HTTPS 배포 시 `true` |
| `LOG_LEVEL` | api | `info` | Fastify 로그 레벨 |
| `SEED_START_IN` | api(Docker) | 없음 | 값이 있으면 컨테이너 시작 시 seed 실행(초 뒤 경매 시작) |
| `API_ORIGIN` | web(빌드 시) | `http://localhost:4000` | `/api/*` 프록시 대상 |

### 동시 입찰 테스트

경매가 진행 중일 때(시작 전이면 시작까지 기다림) N명이 같은 물품에 동시에 입찰해 정확히 1명만 낙찰되는지 확인합니다.

```bash
npm run test:race -- 50                          # 직접 실행 시
docker compose exec api npm run test:race -- 50  # Docker 실행 시
```

- 실행할 때마다 아직 낙찰되지 않은 첫 물품을 사용합니다. 물품 8개를 다 쓰거나 경매(5분)가 끝나면 seed를 다시 실행하세요.

## 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 웹앱 | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 | 모바일 웹앱, `proxy.ts`로 로그인 게이트를 서버에서 처리 |
| API | Fastify 5 (TypeScript, Node.js 22) | 가볍고 빠름. SSE 같은 장시간 연결을 다루기 쉬움 |
| DB | PostgreSQL 16 + Kysely | 확정한 DDL(복합 FK, 지연 트리거, 부분 인덱스)을 그대로 쓰고 쿼리는 타입 안전하게 |
| 실시간·세션 | Redis 7 | 입찰 선착순 잠금, 세션 저장, 낙찰 이벤트 pub/sub |
| 실시간 전달 | SSE | 가격은 서버 시각으로 클라이언트가 계산하고, 낙찰·유찰 같은 상태 변화만 서버가 보냄 |

## 구조

```
docker-compose.yml            db · redis · api · web
db/schema.sql                 확정 DDL
docs/                         ERD 명세(erd_spec.md), ERD 그림(erd.mmd, erd.png)
apps/api/src
  index.ts                    Fastify 서버
  routes/auth.ts              회원가입·로그인·로그아웃·내 정보 (세션 쿠키 + Redis)
  routes/auction.ts           오늘의 경매, 예정 브랜드, 물품 상세, 입찰, 내 낙찰 목록
  events.ts                   SSE 이벤트, 종료된 회차 유찰 처리(2초 주기)
  price.ts                    가격 공식 (웹과 동일)
  scripts/                    init-db, seed, race-test
apps/web
  proxy.ts                    /items/*, /wins 로그인 게이트
  app/page.tsx                홈 (오늘의 브랜드, 시계, 물품 그리드, 햄버거 메뉴)
  app/login, app/signup       로그인, 회원가입
  app/items/[id]              경매물품 입찰
  app/wins                    내 낙찰 물품
  lib/price.ts, lib/hooks.ts  가격 계산, 서버 시각 동기화, SSE 구독
```

## API

모든 경로는 `/api` 아래에 있습니다. 🔒는 로그인(세션 쿠키 `sid`)이 필요합니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/time` | 서버 시각(ms). 클라이언트 시계 보정용 |
| GET | `/categories` | 카테고리 목록 |
| GET | `/auctions/today?category=` | 오늘의 경매와 물품 목록 |
| GET | `/auctions/upcoming` | 진행 예정 브랜드(최대 10개) |
| GET | `/auctions/:id/events` | SSE: `sold`, `ended` 이벤트 |
| GET | `/auth/check-id?loginId=` | 아이디 중복 확인 |
| POST | `/auth/signup` | 회원가입 `{ loginId, password }` |
| POST | `/auth/login` | 로그인, 세션 쿠키 발급 |
| POST | `/auth/logout` | 로그아웃 |
| GET | `/me` | 내 정보 |
| GET 🔒 | `/items/:id` | 물품 상세 |
| POST 🔒 | `/items/:id/bid` | 입찰(= 즉시 낙찰) |
| GET 🔒 | `/me/wins` | 내 낙찰 물품 |

주요 오류 코드

| HTTP | 코드 | 상황 |
|---|---|---|
| 400 | `INVALID_LOGIN_ID`, `INVALID_PASSWORD` | 아이디(영문·숫자 4~20자), 비밀번호(8~72자) 형식 오류 |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | 로그인 필요, 아이디·비밀번호 불일치 |
| 404 | `NOT_FOUND` | 물품 없음 |
| 409 | `NOT_STARTED`, `ENDED`, `ALREADY_SOLD` | 시작 전, 종료 후, 이미 낙찰 |
| 409 | `LOGIN_ID_TAKEN` | 이미 사용 중인 아이디 |

## 경매 규칙 (코드 상수)

- 진행 시간 5분, 1초마다 직전 가격의 0.5% 인하(복리), 10원 단위 내림, 최소 입찰가 아래로 내려가지 않음
  - `현재가 = max(최소 입찰가, 10원 단위 내림(시작가 × 0.995^경과초))`
- 상수 위치: `apps/api/src/config.ts`의 `AUCTION_RULE`, `apps/web/lib/price.ts` (두 곳을 함께 고쳐야 합니다)
- 낙찰가는 클라이언트가 보낸 값이 아니라 **서버가 요청을 받은 시각**으로 계산합니다.
- 낙찰 확정: Redis `SET NX`로 첫 요청만 통과 → DB에서 `UPDATE item … WHERE status='listed'` + `INSERT award`를 한 문장으로 실행. Redis 잠금이 어긋나더라도 DB 조건부 UPDATE와 `award` 기본 키가 최종적으로 낙찰자를 1명으로 보장합니다.
- 종료 시각이 지나면 미낙찰 물품은 2초 안에 `unsold`(유찰)로 바뀝니다.

## 알려진 한계

- Redis 장애 시 DB 단독 경로로 넘어가는 폴백이 없습니다. 세션도 Redis에 있어 로그인과 입찰이 모두 실패합니다.
- 관리자 화면이 없어 물품 등록은 seed 스크립트로 합니다.

## 시드 데이터

브랜드명·물품·가격은 모두 예시입니다. 물품 이미지는 `placehold.co`의 자리 표시 이미지 URL이며, 불러오지 못하면 회색 "이미지 없음"으로 표시됩니다.
