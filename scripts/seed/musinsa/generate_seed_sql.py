#!/usr/bin/env python3
"""
MUSINSA STANDARD 상품 100개(manifest.csv)로 목 데이터 SQL 을 만든다.

사용: python3 generate_seed_sql.py <manifest.csv> > seed_musinsa_100.sql

- 카테고리: 무신사 카테고리(한글) + 상품명 키워드 → DB 카테고리(outer, top, bottom, shoes, acc)
- 시작가: 원본 데이터에 가격이 없어서 품목별 가격대로 추정 (예시 값, 실제 판매가 아님)
- 이미지 주소: SQL 실행 시 psql 변수 image_base 로 받음 (<image_base>/<상품ID>.webp)
"""
import csv
import sys

# ---- 카테고리 매핑 -----------------------------------------------------------
OUTER_WORDS = ["재킷", "자켓", "윈드브레이커", "코트", "패딩", "다운", "점퍼", "블루종", "파카", "아노락", "베스트", "가디건"]
BOTTOM_WORDS = ["팬츠", "슬랙스", "진", "데님", "쇼츠", "반바지", "스커트", "트라우저", "조거"]

def db_category(musinsa_category: str, name: str) -> str:
    if musinsa_category == "아우터":
        return "outer"
    if musinsa_category == "의류":
        if any(w in name for w in OUTER_WORDS):
            return "outer"
        if any(w in name for w in BOTTOM_WORDS):
            return "bottom"
        return "top"
    if musinsa_category == "신발/신발용품":
        return "shoes"
    if musinsa_category in ("가방/지갑", "모자", "소품"):
        return "acc"
    raise SystemExit(f"알 수 없는 카테고리: {musinsa_category} ({name})")

# ---- 시작가 추정 (원) ---------------------------------------------------------
# (키워드, 가격). 앞에 있는 키워드가 먼저 적용됨
PRICE_RULES = {
    "outer": [("다운", 119_900), ("윈드브레이커", 69_900), ("패딩", 109_900), ("코트", 139_900), ("재킷", 89_900), ("자켓", 89_900)],
    "top": [("니트", 39_900), ("스웨터", 39_900), ("가디건", 45_900), ("셔츠", 34_900),
            ("후드", 45_900), ("스웨트", 39_900), ("맨투맨", 35_900), ("티셔츠", 19_900)],
    "bottom": [("데님", 49_900), ("진", 49_900), ("카고", 45_900), ("치노", 42_900),
               ("슬랙스", 39_900), ("스웨트", 35_900), ("쇼츠", 25_900)],
    "shoes": [("인솔", 9_900), ("삭스", 9_900), ("부츠", 89_900), ("더비", 79_900), ("로퍼", 79_900),
              ("스니커즈", 59_900), ("뮬", 39_900), ("슬립온", 39_900), ("슬리퍼", 29_900)],
    "acc": [("백팩", 49_900), ("지갑", 29_900), ("백", 39_900), ("토트", 39_900), ("벨트", 29_900),
            ("넥타이", 24_900), ("머플러", 29_900), ("글러브", 19_900), ("장갑", 19_900),
            ("삭스", 12_900), ("양말", 12_900), ("바라클라바", 19_900), ("캡", 19_900),
            ("햇", 22_900), ("비니", 17_900)],
}
DEFAULT_PRICE = {"outer": 89_900, "top": 29_900, "bottom": 39_900, "shoes": 59_900, "acc": 19_900}

def start_price(category: str, name: str, product_id: int) -> int:
    base = next((p for w, p in PRICE_RULES[category] if w in name), DEFAULT_PRICE[category])
    if "컬래버" in name or "PICK" in name:
        base += 10_000
    # 같은 가격대가 너무 겹치지 않게 상품 ID로 0/3,000/6,000원 차이를 둠 (항상 같은 결과)
    return base + (product_id % 3) * 3_000

def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"

def main(path: str) -> None:
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    if len(rows) != 100:
        print(f"-- 경고: 상품 수가 {len(rows)}개", file=sys.stderr)
    brands = {r["brand"] for r in rows}
    if len(brands) != 1:
        raise SystemExit(f"브랜드가 하나여야 함 (회차당 1브랜드): {brands}")
    brand = brands.pop()

    values = []
    for i, r in enumerate(rows):
        pid = int(r["product_id"])
        cat = db_category(r["category"], r["product_name"])
        values.append(f"    ({i:3d}, {pid}, {sql_str(r['product_name'])}, '{cat}', {start_price(cat, r['product_name'], pid)})")

    print(TEMPLATE.replace("@@BRAND@@", sql_str(brand)).replace("@@ROWS@@", ",\n".join(values)).replace("@@COUNT@@", str(len(rows))))

TEMPLATE = r"""-- =====================================================================
-- 목 데이터: MUSINSA STANDARD 상품 @@COUNT@@개 → 오늘의 경매 1회차
-- generate_seed_sql.py 로 만든 파일 (직접 고치지 말고 생성기를 고칠 것)
--
-- 실행 (psql 변수):
--   image_base (필수)  이미지 주소 앞부분. 최종 주소 = <image_base>/<상품ID>.webp
--                      예) https://<이미지 버킷 도메인>/images
--   starts_at  (선택)  경매 시작 시각. 없으면 지금부터 10분 뒤 (분 단위로 맞춤)
--                      예) '2026-11-20 20:00:00+09'
--
-- 동작:
--   - 브랜드 MUSINSA STANDARD 가 없으면 만듦
--   - starts_at 날짜(서울 기준)의 회차가 없으면 만듦 (10초 주기, 20분 진행: 앱 기본값과 같음)
--     같은 날 다른 브랜드 회차가 이미 있으면 중단 (회차는 하루 1개, 회차당 브랜드 1개)
--   - 물품을 넣음. 물품 ID는 (회차 날짜, 상품 ID)로 정해짐
--     → 같은 날 다시 실행해도 중복되지 않고, 다른 날로 실행하면 그 회차에 100개가 새로 들어감
--   - 기존 사용자·낙찰·다른 회차는 건드리지 않음
--   - 전체가 한 트랜잭션: 중간에 실패하면 아무것도 들어가지 않음
-- =====================================================================
\set ON_ERROR_STOP on

\if :{?image_base}
\else
  \echo 'image_base 변수가 필요합니다. 예: psql -v image_base=https://<이미지 도메인>/images -f seed_musinsa_100.sql'
  \quit
\endif
\if :{?starts_at}
\else
  \set starts_at ''
\endif

BEGIN;

-- 실행 값 확인 (https 로 시작해야 item.image_url 제약을 통과함)
SELECT set_config('seed.image_base', rtrim(:'image_base', '/'), true),
       set_config('seed.starts_at',
                  COALESCE(NULLIF(:'starts_at', '')::timestamptz,
                           date_trunc('minute', now()) + interval '10 minutes')::text, true);

DO $$
BEGIN
    IF current_setting('seed.image_base') !~ '^https://\S+$' THEN
        RAISE EXCEPTION 'image_base 는 https:// 로 시작해야 합니다: %', current_setting('seed.image_base');
    END IF;
END $$;

-- 1) 브랜드
INSERT INTO brand (brand_id, name)
SELECT md5('seed:brand:' || lower(@@BRAND@@))::uuid, @@BRAND@@
WHERE NOT EXISTS (SELECT 1 FROM brand WHERE lower(name) = lower(@@BRAND@@));

-- 2) 회차 (starts_at 의 서울 기준 날짜)
DO $$
DECLARE
    v_starts  timestamptz := current_setting('seed.starts_at')::timestamptz;
    v_date    date        := (v_starts AT TIME ZONE 'Asia/Seoul')::date;
    v_brand   uuid        := (SELECT brand_id FROM brand WHERE lower(name) = lower(@@BRAND@@));
    v_existing auction%ROWTYPE;
BEGIN
    SELECT * INTO v_existing FROM auction WHERE auction_date = v_date;
    IF FOUND THEN
        IF v_existing.brand_id <> v_brand THEN
            RAISE EXCEPTION '% 회차가 이미 다른 브랜드로 있습니다 (auction_id=%). starts_at 을 다른 날로 주세요',
                v_date, v_existing.auction_id;
        END IF;
        RAISE NOTICE '% 회차가 이미 있어 그대로 사용 (auction_id=%, 시작 %)', v_date, v_existing.auction_id, v_existing.starts_at;
    ELSE
        INSERT INTO auction (auction_id, brand_id, auction_date, starts_at, ends_at, price_drop_interval_sec)
        VALUES (md5('seed:auction:' || v_date)::uuid, v_brand, v_date,
                v_starts, v_starts + interval '20 minutes', 10);
        RAISE NOTICE '% 회차 생성: 시작 %, 종료 %', v_date, v_starts, v_starts + interval '20 minutes';
    END IF;
END $$;

-- 3) 물품 (순서 = manifest 순서. 목록 화면은 created_at 순이라 0.001초씩 차이를 둠)
INSERT INTO item (item_id, auction_id, name, image_url, category, start_price, created_at)
SELECT md5('seed:item:' || a.auction_date || ':' || s.product_id)::uuid,
       a.auction_id,
       s.name,
       current_setting('seed.image_base') || '/' || s.product_id || '.webp',
       s.category,
       s.start_price,
       now() + s.seq * interval '1 millisecond'
FROM (VALUES
@@ROWS@@
) AS s (seq, product_id, name, category, start_price)
JOIN auction a
  ON a.auction_date = (current_setting('seed.starts_at')::timestamptz AT TIME ZONE 'Asia/Seoul')::date
ON CONFLICT (item_id) DO NOTHING;

-- 결과
SELECT a.auction_date AS 회차, b.name AS 브랜드, a.starts_at AS 시작, a.ends_at AS 종료,
       count(i.*) AS 물품수
FROM auction a
JOIN brand b USING (brand_id)
LEFT JOIN item i ON i.auction_id = a.auction_id AND i.deleted_at IS NULL
WHERE a.auction_date = (current_setting('seed.starts_at')::timestamptz AT TIME ZONE 'Asia/Seoul')::date
GROUP BY 1, 2, 3, 4;

SELECT i.category AS 카테고리, count(*) AS 개수, min(i.start_price) AS 최저가, max(i.start_price) AS 최고가
FROM item i
JOIN auction a ON a.auction_id = i.auction_id
WHERE a.auction_date = (current_setting('seed.starts_at')::timestamptz AT TIME ZONE 'Asia/Seoul')::date
  AND i.deleted_at IS NULL
GROUP BY 1 ORDER BY 1;

COMMIT;
"""

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("사용: python3 generate_seed_sql.py <manifest.csv> > seed_musinsa_100.sql")
    main(sys.argv[1])
