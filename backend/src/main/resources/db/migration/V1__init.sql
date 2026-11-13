-- =====================================================================
-- 더치 옥션 v2 스키마 (Flyway V1)
-- 원칙: 3NF / 제약조건으로 업무 규칙 보장 / UUIDv7(앱 생성) / NOT NULL 기본
--       timestamptz(UTC) / numeric(12,0) 원 단위 / text + CHECK 상태값
--       실시간 값(현재가·남은 시간·접속자 수)은 저장하지 않음
--
-- 가격 정책(애플리케이션 상수, AuctionRule):
--   인하율 1.02%(복리), 최소가 = 시작가의 30%(10원 단위 내림), 10원 단위 내림
-- 회차 설정(DB): 인하 주기 price_drop_interval_sec(기본 10초), 진행 시간 ends_at - starts_at(기본 20분)
-- =====================================================================

-- ---------------------------------------------------------------------
-- brand (브랜드)
-- ---------------------------------------------------------------------
CREATE TABLE brand (
    brand_id    uuid        PRIMARY KEY,
    name        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT brand_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX brand_name_uq ON brand (lower(name));

-- ---------------------------------------------------------------------
-- auction (경매 회차): 하루 1회차, 회차당 1브랜드, 모든 물품 동시 시작
-- ---------------------------------------------------------------------
CREATE TABLE auction (
    auction_id               uuid        PRIMARY KEY,
    brand_id                 uuid        NOT NULL REFERENCES brand (brand_id) ON DELETE RESTRICT,
    auction_date             date        NOT NULL,
    starts_at                timestamptz NOT NULL,
    ends_at                  timestamptz NOT NULL,
    price_drop_interval_sec  integer     NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT auction_date_uq          UNIQUE (auction_date),
    CONSTRAINT auction_period_chk       CHECK (ends_at > starts_at),
    CONSTRAINT auction_interval_chk     CHECK (price_drop_interval_sec > 0),
    CONSTRAINT auction_date_matches_chk
        CHECK (auction_date = (starts_at AT TIME ZONE 'Asia/Seoul')::date)
);
CREATE INDEX auction_brand_id_idx ON auction (brand_id);

-- ---------------------------------------------------------------------
-- app_user (사용자) — "user"는 PostgreSQL 예약어
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
    app_user_id    uuid        PRIMARY KEY,
    login_id       text        NOT NULL,
    password_hash  text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz NULL,

    CONSTRAINT app_user_login_id_not_blank CHECK (btrim(login_id) <> '')
);
CREATE UNIQUE INDEX app_user_login_id_uq ON app_user (lower(login_id)) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- item (경매 물품): 물품 1개 = 경매 1건, 하나의 회차에만 속함
-- 최소가는 시작가의 30%로 계산되므로 저장하지 않음 (min_price 컬럼 없음)
-- ---------------------------------------------------------------------
CREATE TABLE item (
    item_id      uuid           PRIMARY KEY,
    auction_id   uuid           NOT NULL REFERENCES auction (auction_id) ON DELETE RESTRICT,
    name         text           NOT NULL,
    image_url    text           NOT NULL,
    category     text           NOT NULL,
    start_price  numeric(12,0)  NOT NULL,
    status       text           NOT NULL DEFAULT 'listed',
    created_at   timestamptz    NOT NULL DEFAULT now(),
    deleted_at   timestamptz    NULL,

    CONSTRAINT item_name_not_blank   CHECK (btrim(name) <> ''),
    CONSTRAINT item_category_chk     CHECK (category IN ('outer', 'top', 'bottom', 'shoes', 'acc')),
    CONSTRAINT item_image_url_chk    CHECK (image_url ~ '^https://\S+$'),
    CONSTRAINT item_status_chk       CHECK (status IN ('listed', 'sold', 'unsold')),
    CONSTRAINT item_start_price_chk  CHECK (start_price >= 100),
    CONSTRAINT item_id_status_uq     UNIQUE (item_id, status)   -- award 복합 FK 대상
);
CREATE INDEX item_auction_id_idx ON item (auction_id, category) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- award (낙찰): 낙찰 시에만 행 생성, 물품 1개당 1건
-- ---------------------------------------------------------------------
CREATE TABLE award (
    item_id         uuid           PRIMARY KEY,
    item_status     text           NOT NULL DEFAULT 'sold',
    winner_user_id  uuid           NOT NULL REFERENCES app_user (app_user_id) ON DELETE RESTRICT,
    winning_price   numeric(12,0)  NOT NULL,
    won_at          timestamptz    NOT NULL,

    CONSTRAINT award_item_status_chk   CHECK (item_status = 'sold'),
    CONSTRAINT award_winning_price_chk CHECK (winning_price > 0),
    CONSTRAINT award_item_fk FOREIGN KEY (item_id, item_status)
        REFERENCES item (item_id, status) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX award_winner_user_id_idx ON award (winner_user_id, won_at DESC);

-- 테이블을 넘나드는 규칙은 CHECK로 표현할 수 없어 트리거로 보장
-- (a) 낙찰가는 [최소가(시작가의 30%, 10원 내림), 시작가], 낙찰 일시는 회차 기간 안
CREATE FUNCTION award_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    i item%ROWTYPE;
    a auction%ROWTYPE;
    min_price numeric(12,0);
BEGIN
    SELECT * INTO i FROM item    WHERE item_id    = NEW.item_id;
    SELECT * INTO a FROM auction WHERE auction_id = i.auction_id;
    min_price := floor(i.start_price * 3 / 100) * 10;
    IF NEW.winning_price NOT BETWEEN min_price AND i.start_price THEN
        RAISE EXCEPTION 'winning_price % out of range [%, %]', NEW.winning_price, min_price, i.start_price;
    END IF;
    IF NEW.won_at < a.starts_at OR NEW.won_at >= a.ends_at THEN
        RAISE EXCEPTION 'won_at % outside auction period', NEW.won_at;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER award_validate_trg BEFORE INSERT OR UPDATE ON award
    FOR EACH ROW EXECUTE FUNCTION award_validate();

-- (b) item.status = 'sold' 이면 커밋 시점에 award 행이 반드시 있어야 함
CREATE FUNCTION item_sold_requires_award() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'sold' AND NOT EXISTS (SELECT 1 FROM award WHERE item_id = NEW.item_id) THEN
        RAISE EXCEPTION 'item % is sold but has no award', NEW.item_id;
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER item_sold_requires_award_trg
    AFTER INSERT OR UPDATE OF status ON item
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION item_sold_requires_award();
