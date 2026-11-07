# 더치 옥션 서비스 테이블 명세

공통 규칙
- 모든 기본 키는 애플리케이션에서 생성한 UUIDv7(`uuid` 타입)입니다.
- 시각은 `timestamptz`(UTC 저장, 화면 표시 시 Asia/Seoul 변환), 금액은 원 단위 `numeric(12,0)`입니다.
- 현재가·남은 시간 등 실시간 값은 저장하지 않고 Redis/애플리케이션에서 계산합니다. 가격 인하율(초당 0.5%)은 애플리케이션 상수입니다.

### brand (브랜드)

| 컬럼 | 타입 | 제약 조건 | 설명 |
| --- | --- | --- | --- |
| brand_id | uuid | 기본 키 | 브랜드 식별자 |
| name | text | NOT NULL, UNIQUE(대소문자 무시), CHECK 공백 불가 | 브랜드명 |
| created_at | timestamptz | NOT NULL, 기본값 now() | 등록 시각 |

### auction (경매 회차)

| 컬럼 | 타입 | 제약 조건 | 설명 |
| --- | --- | --- | --- |
| auction_id | uuid | 기본 키 | 회차 식별자 |
| brand_id | uuid | NOT NULL, 외래 키 → brand (ON DELETE RESTRICT) | 이 회차의 브랜드. 회차당 1브랜드입니다. |
| auction_date | date | NOT NULL, UNIQUE, CHECK starts_at의 서울 날짜와 일치 | 경매일. UNIQUE로 하루 1회차를 보장합니다. |
| starts_at | timestamptz | NOT NULL | 회차 내 모든 물품의 공통 시작 시각 |
| ends_at | timestamptz | NOT NULL, CHECK ends_at > starts_at | 종료 시각. 이때까지 낙찰되지 않은 물품은 유찰 처리합니다. |
| price_drop_interval_sec | integer | NOT NULL, CHECK > 0 | 가격 인하 주기(초) |
| created_at | timestamptz | NOT NULL, 기본값 now() | 등록 시각 |

### item (경매 물품)

| 컬럼 | 타입 | 제약 조건 | 설명 |
| --- | --- | --- | --- |
| item_id | uuid | 기본 키 | 물품 식별자. 물품 1개 = 경매 1건입니다. |
| auction_id | uuid | NOT NULL, 외래 키 → auction (ON DELETE RESTRICT) | 소속 회차. 한 물품은 하나의 회차에서만 경매됩니다. 브랜드는 회차를 통해 정해집니다. |
| name | text | NOT NULL, CHECK 공백 불가 | 물품명 |
| category | text | NOT NULL, CHECK IN ('outer', 'top', 'bottom', 'shoes', 'acc') | 물품 카테고리. outer: 아우터, top: 상의, bottom: 하의, shoes: 신발, acc: 잡화 |
| image_url | text | NOT NULL, CHECK `https://`로 시작하고 공백 없음 | 물품 대표 이미지 URL. 이미지 파일은 S3 등 오브젝트 스토리지에 두고 DB에는 URL만 저장합니다. |
| start_price | numeric(12,0) | NOT NULL, CHECK start_price > min_price | 시작가(최고가) |
| min_price | numeric(12,0) | NOT NULL, CHECK min_price > 0 | 최소 입찰가. 가격은 이 값 아래로 내려가지 않습니다. |
| status | text | NOT NULL, 기본값 'listed', CHECK IN ('listed', 'sold', 'unsold') | 낙찰 여부. listed: 낙찰 전, sold: 낙찰, unsold: 유찰 |
| created_at | timestamptz | NOT NULL, 기본값 now() | 등록 시각 |
| deleted_at | timestamptz | NULL 허용 | 논리 삭제 시각. NULL이면 삭제되지 않은 물품입니다. |

추가 제약: UNIQUE (item_id, status) — award가 (item_id, 'sold')를 외래 키로 참조하기 위한 대상 키입니다.
트리거: status가 'sold'인데 award 행이 없으면 커밋 시점에 거부합니다(지연 제약 트리거).

### award (낙찰)

| 컬럼 | 타입 | 제약 조건 | 설명 |
| --- | --- | --- | --- |
| item_id | uuid | 기본 키, 외래 키 → item (ON DELETE RESTRICT) | 낙찰된 물품. 기본 키이므로 물품 1개당 낙찰은 1건입니다. |
| item_status | text | NOT NULL, 기본값 'sold', CHECK = 'sold' | (item_id, item_status) 복합 외래 키 → item(item_id, status). sold인 물품에만 낙찰 행이 생기고, 낙찰 후에는 물품 상태를 바꿀 수 없습니다. |
| winner_user_id | uuid | NOT NULL, 외래 키 → app_user (ON DELETE RESTRICT) | 낙찰자 |
| winning_price | numeric(12,0) | NOT NULL, CHECK > 0 | 낙찰가. 트리거로 물품의 min_price 이상 start_price 이하인지 검사합니다. |
| won_at | timestamptz | NOT NULL | 낙찰 일시. 트리거로 회차의 starts_at~ends_at 안인지 검사합니다. |

### app_user (사용자)

| 컬럼 | 타입 | 제약 조건 | 설명 |
| --- | --- | --- | --- |
| app_user_id | uuid | 기본 키 | 사용자 식별자 (`user`는 PostgreSQL 예약어라 app_user를 사용합니다) |
| login_id | text | NOT NULL, UNIQUE(대소문자 무시, 탈퇴하지 않은 사용자 사이에서), CHECK 공백 불가 | 로그인 아이디 |
| password_hash | text | NOT NULL | 비밀번호 해시(argon2id 또는 bcrypt). 원문은 저장하지 않습니다. |
| created_at | timestamptz | NOT NULL, 기본값 now() | 가입 시각 |
| deleted_at | timestamptz | NULL 허용 | 탈퇴(논리 삭제) 시각. NULL이면 활성 사용자입니다. |

### 인덱스

| 테이블 | 인덱스 | 용도 |
| --- | --- | --- |
| brand | UNIQUE (lower(name)) | 브랜드명 중복 방지 |
| auction | (brand_id) | 외래 키 조회 |
| item | (auction_id, category) WHERE deleted_at IS NULL | 경매 메인 화면: 회차의 물품 목록, 카테고리 필터 |
| award | (winner_user_id, won_at DESC) | 사용자 낙찰 목록 |
| app_user | UNIQUE (lower(login_id)) WHERE deleted_at IS NULL | 로그인 아이디 중복 방지 |
