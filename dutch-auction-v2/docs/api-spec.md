# 더치 옥션 v2 API 명세

- 기본 경로 `/api`, JSON. 날짜·시각은 ISO 8601 UTC 문자열, 금액은 원 단위 정수.
- 인증: `sid` 세션 쿠키(httpOnly, SameSite=Lax, 7일). 세션은 Redis `session:{sid}`.
- 오류: `{ "error": "<코드>", "message": "<사용자용 문장>" }`
- **가격 노출 원칙:** 가격은 🔒 표시 중 `GET /items/{id}`, `POST /items/{id}/bid`, `GET /me/wins`에서만 내려간다. 공개 API와 SSE에는 가격이 없다.

| ID | 메서드·경로 | 로그인 | 설명 |
| --- | --- | --- | --- |
| F-01 | `GET /time` | | 서버 시각 `{ now }` (ms) |
| F-02 | `GET /categories` | | 카테고리 목록 |
| F-03 | `GET /auth/check-id?loginId=` | | 아이디 중복 확인 `{ available }` |
| F-04 | `POST /auth/signup` | | `{ loginId, password }` → 201 |
| F-05 | `POST /auth/login` | | 세션 쿠키 발급 `{ loginId }` |
| F-06 | `POST /auth/logout` | | 세션 삭제 |
| F-07 | `GET /me` | 🔒 | `{ userId, loginId }` |
| F-08 | `GET /auctions/today?category=` | | 오늘의 경매 + 물품 목록 (**가격 없음**) |
| F-09 | `GET /auctions/upcoming` | | 진행 예정 브랜드 (최대 10) |
| F-10 | `GET /items/{id}` | 🔒 | 입찰 페이지 상세 (**가격 포함**) |
| F-11 | `POST /items/{id}/bid` | 🔒 | 입찰 = 즉시 낙찰 |
| F-12 | `POST /items/{id}/presence` | 🔒 | 접속 신호(하트비트): 경매 시작 기준 0초·5초·10초… |
| F-12b | `GET /items/{id}/presence` | 🔒 | 접속자 수 조회 `{ viewers }`: 시작 1초 뒤부터 5초 단위(1초·6초·11초…) |
| F-13 | `POST /items/{id}/presence/leave` | 🔒 | 페이지 이탈 시 즉시 제외 |
| F-14 | `GET /me/wins` | 🔒 | 내 낙찰 물품 (본인 낙찰가 포함) |
| F-15 | `GET /auctions/{id}/events` | | SSE: `sold`, `ended` (**가격 없음**) |
| B-01 | (백그라운드 2초) | | 종료 회차 유찰 처리, Redis 잠금으로 Pod 1개만 실행 |
| — | `GET /actuator/health/liveness`, `/readiness` | | EKS 프로브 (readiness는 DB·Redis 포함) |

## 응답 예시

**F-08 오늘의 경매 (공개)**
```json
{
  "auction": { "id": "…", "auctionDate": "2026-11-09", "startsAt": "…Z", "endsAt": "…Z", "brandName": "솔트앤파인" },
  "items": [ { "id": "…", "name": "울 블렌드 싱글 코트", "imageUrl": "https://…", "category": "outer", "status": "listed" } ],
  "totalItems": 8
}
```

**F-10 입찰 페이지 상세 (로그인)**
```json
{
  "id": "…", "name": "울 블렌드 싱글 코트", "imageUrl": "https://…", "category": "outer", "status": "listed",
  "auctionId": "…", "brandName": "솔트앤파인", "startsAt": "…Z", "endsAt": "…Z",
  "priceDropIntervalSec": 10, "startPrice": 289000, "minPrice": 86700,
  "winningPrice": null, "wonAt": null, "wonByMe": false
}
```

**F-15 SSE 이벤트 (공개)**
```
data: {"type":"sold","itemId":"…"}
data: {"type":"ended","unsoldItemIds":["…","…"]}
```
입찰 페이지는 이벤트를 받으면 F-10을 다시 호출해 낙찰가를 받는다. 15초마다 `: ping` 주석으로 연결 유지.

## 가격 규칙

```
n      = floor((서버 시각 - starts_at) / price_drop_interval_sec)
현재가 = max(최소가, floor10(시작가 × 0.9898ⁿ))    ← 1.02% 인하, 정수 연산(시작가 × 4949ⁿ ÷ 5000ⁿ)
최소가 = floor10(시작가 × 30%)
```
- 기본 회차(10초·20분): 118번째 인하(19분 40초)에 최소가 도달, 마지막 20초는 최소가로 입찰 가능
- 입찰 가능: `starts_at ≤ 서버 시각 < ends_at`, 상태 `listed`
- 낙찰가는 클라이언트 값이 아니라 서버가 요청을 받은 시각으로 계산

## 접속자 수 갱신 일정 (서버 시각 기준)
- 접속 신호(POST): 시작 기준 0초·5초·10초… (시작 전에도 같은 간격, 페이지에 들어오면 즉시 1번)
- 화면 갱신(GET): 시작 1초 뒤부터 5초 단위 → 1초·6초·11초… (중간에 들어오면 즉시 1번 읽고 이후 같은 일정)
- 신호보다 1초 늦게 읽어, 같은 순간 들어온 모든 사용자의 신호가 반영된 뒤 집계한다
- 시작 1초 전까지는 표시하지 않음, 경매 종료 후 멈추고 마지막 값 유지
- 집계 기준: 최근 12초 안에 신호를 보낸 사용자 수(같은 사용자의 여러 탭은 1명)

## 입찰(F-11) 처리 순서
1. 물품 조회 → 시작 전 `409 NOT_STARTED`, 종료 후 `409 ENDED`, 이미 낙찰·유찰 `409 ALREADY_SOLD`
2. Redis `SET bid:lock:{itemId} NX PX 10000` 실패 → `409 ALREADY_SOLD`
3. 서버 시각으로 낙찰가 계산
4. `UPDATE item … WHERE status='listed'` + `INSERT award`를 한 문장으로 실행, 0행이면 `409 ALREADY_SOLD`
5. 성공: 잠금 24시간 유지, `sold` 이벤트 발행 / DB 오류: 잠금 해제

## 오류 코드
| HTTP | 코드 |
| --- | --- |
| 400 | `INVALID_LOGIN_ID`, `INVALID_PASSWORD` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 404 | `NOT_FOUND` |
| 409 | `LOGIN_ID_TAKEN`, `NOT_STARTED`, `ENDED`, `ALREADY_SOLD` |
| 500 | `SERVER_ERROR` |

## Redis 키
| 키 | 용도 | 만료 |
| --- | --- | --- |
| `session:{sid}` | 세션 → 사용자 ID | 7일 |
| `bid:lock:{itemId}` | 선착순 잠금 | 10초, 낙찰 시 24시간 |
| `viewers:{itemId}` (정렬 집합) | 접속자: 사용자 ID → 마지막 하트비트(ms) | 1분(하트비트마다 갱신) |
| `sweeper:lock` | 유찰 처리 단일 실행 | 1.8초 |
| 채널 `auction:{auctionId}` | 낙찰·유찰 이벤트 pub/sub | — |
