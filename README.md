# 더치 옥션 — 이월상품 역경매 모바일 웹앱

하루 한 브랜드의 이월상품을 같은 시각에 동시에 경매합니다. 가격은 시작가에서 1초마다 0.5%씩 내려가고, 가장 먼저 "지금 낙찰받기"를 누른 1명이 그 순간 가격에 낙찰받습니다.

## 실행

### 방법 1. Docker Compose (권장)

```bash
docker compose up --build
```

- 웹앱: http://localhost:3000 (휴대폰 화면 폭으로 보면 가장 자연스럽습니다)
- 데모 계정: `demo` / `demo1234`
- api 컨테이너가 뜰 때마다 데모 데이터를 다시 만들고, **60초 뒤 시작하는 오늘의 경매**를 준비합니다. 시작 시각을 바꾸려면 `docker-compose.yml`의 `SEED_START_IN`(초)을 고치세요.

### 방법 2. 직접 실행 (Node 22, PostgreSQL 16, Redis 7)

```bash
npm run install:all
createdb dutch_auction                 # DATABASE_URL 기본값: postgres://postgres@localhost:5432/dutch_auction
npm run db:init                        # db/schema.sql 적용 (기존 테이블 삭제)
npm run seed -- --start-in 60          # 60초 뒤 시작하는 오늘의 경매 + 예정 브랜드 + 데모 계정
npm run dev:api                        # http://localhost:4000
npm run dev:web                        # http://localhost:3000
```

환경 변수: `DATABASE_URL`, `REDIS_URL`, `API_PORT`(기본 4000), `API_ORIGIN`(웹 → API 프록시 대상, 기본 http://localhost:4000), `COOKIE_SECURE`(HTTPS 배포 시 `true`).

### 동시 입찰 테스트

경매가 진행 중일 때 50명이 같은 물품에 동시에 입찰해 정확히 1명만 낙찰되는지 확인합니다.

```bash
npm run test:race -- 50
```

## 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 웹앱 | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 | 모바일 웹앱, `proxy.ts`로 로그인 게이트를 서버에서 처리 |
| API | Fastify 5 (TypeScript) | 가볍고 빠름. SSE 같은 장시간 연결을 다루기 쉬움 |
| DB | PostgreSQL 16 + Kysely | 확정한 DDL(복합 FK, 지연 트리거)을 그대로 쓰고 쿼리는 타입 안전하게 |
| 실시간·세션 | Redis 7 | 입찰 선착순 잠금, 세션 저장, 낙찰 이벤트 pub/sub |
| 실시간 전달 | SSE | 가격은 서버 시각으로 클라이언트가 계산하고, 낙찰·유찰 같은 상태 변화만 서버가 보냄 |

## 구조

```
db/schema.sql                 확정 DDL (+ item.category)
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

## 경매 규칙 (코드 상수)

- 진행 시간 5분, 1초마다 현재가의 0.5% 인하: `현재가 = max(최소 입찰가, 10원 단위 내림(시작가 × 0.995^경과초))`
- 상수 위치: `apps/api/src/config.ts`의 `AUCTION_RULE`, `apps/web/lib/price.ts`
- 낙찰가는 클라이언트가 보낸 값이 아니라 **서버가 요청을 받은 시각**으로 계산합니다.
- 낙찰 확정: Redis `SET NX`로 첫 요청만 통과 → DB에서 `UPDATE item … WHERE status='listed'` + `INSERT award`를 한 문장으로 실행. Redis가 없어도 DB 제약만으로 1명만 성공합니다.
- 종료 시각이 지나면 미낙찰 물품은 `unsold`(유찰)로 바뀝니다.

## 시드 데이터

브랜드명·물품·가격은 모두 예시입니다. 물품 이미지는 `placehold.co`의 자리 표시 이미지 URL이며, 불러오지 못하면 회색 "이미지 없음"으로 표시됩니다.
