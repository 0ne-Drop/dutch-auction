-- =====================================================================
-- 목 데이터: MUSINSA STANDARD 상품 100개 → 오늘의 경매 1회차
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
SELECT md5('seed:brand:' || lower('MUSINSA STANDARD'))::uuid, 'MUSINSA STANDARD'
WHERE NOT EXISTS (SELECT 1 FROM brand WHERE lower(name) = lower('MUSINSA STANDARD'));

-- 2) 회차 (starts_at 의 서울 기준 날짜)
DO $$
DECLARE
    v_starts  timestamptz := current_setting('seed.starts_at')::timestamptz;
    v_date    date        := (v_starts AT TIME ZONE 'Asia/Seoul')::date;
    v_brand   uuid        := (SELECT brand_id FROM brand WHERE lower(name) = lower('MUSINSA STANDARD'));
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
    (  0, 7049131, '[알레산드로 푼제티] 아비스 카고 팬츠 [그레이]', 'bottom', 48900),
    (  1, 7329812, '[JAPAN Fabric][플러스] 어센틱 치노 팬츠 [다크 그레이]', 'bottom', 48900),
    (  2, 7109312, 'M-51 카고 팬츠 [올리브]', 'bottom', 51900),
    (  3, 7288549, '[시티 레저] 와플 긴소매 티셔츠 [블랙]', 'top', 37900),
    (  4, 7007946, '더블 브러쉬드 원 턱 와이드 밴딩 팬츠 [브라운]', 'bottom', 39900),
    (  5, 7090085, '[챔피온 컬래버] 루나 다이드 커브드 스웨트 팬츠 [차콜 그레이]', 'bottom', 51900),
    (  6, 3411538, '나일론 파라슈트 팬츠 [블랙]', 'bottom', 42900),
    (  7, 7060798, '[With CTR] [시티 레저] 스트럭처드 벨티드 카고 팬츠 [블랙]', 'bottom', 48900),
    (  8, 7049153, '[이도현 PICK] [시티 레저] 벨티드 커브드 팬츠 [그레이]', 'bottom', 55900),
    (  9, 1627892, '레플리카 퍼티그 팬츠 [카키]', 'bottom', 45900),
    ( 10, 4056413, '와이드 데님 팬츠 [로우 블랙]', 'bottom', 55900),
    ( 11, 5698886, '[이도현 PICK] 스트라이프 엑스트라 와이드 투 턱 히든 밴딩 슬랙스 [차콜 그레이]', 'bottom', 55900),
    ( 12, 7049135, '[알레산드로 푼제티] 아비스 윈드브레이커 [블랙]', 'outer', 75900),
    ( 13, 4326418, '[시티 레저] 폴라 플리스 벨티드 팬츠 [그레이]', 'bottom', 42900),
    ( 14, 2268294, '레귤러 핏 데님 팬츠 [블랙]', 'bottom', 49900),
    ( 15, 7044552, '속기모 벨티드 유틸리티 팬츠 [블랙]', 'bottom', 39900),
    ( 16, 3404705, '[시티 레저] CN 와이드 벨티드 파라슈트 팬츠 [블랙]', 'bottom', 45900),
    ( 17, 1176331, '와이드 코듀로이 팬츠 [브라운]', 'bottom', 42900),
    ( 18, 1180665, '샤기 플리스 집업 재킷 [블랙]', 'outer', 89900),
    ( 19, 5311465, '코듀로이 패딩 뮬 [블랙]', 'shoes', 42900),
    ( 20, 2101924, '[이도현 PICK] 플레인 더비 슈즈 [블랙]', 'shoes', 92900),
    ( 21, 2101922, '플레인 첼시 부츠 [블랙]', 'shoes', 95900),
    ( 22, 3775047, '키높이 하프 인솔 3팩 [블랙/화이트/탠 브라운]', 'shoes', 9900),
    ( 23, 3559722, '윈터 퍼그 부츠 [라이트 브라운]', 'shoes', 89900),
    ( 24, 4537764, '패딩 캠프 슬립온 [블랙]', 'shoes', 39900),
    ( 25, 6717414, '레이싱 스니커즈 [블랙]', 'shoes', 59900),
    ( 26, 4261318, '오솔라이트 인솔 2팩 [블랙/블랙]', 'shoes', 12900),
    ( 27, 6032909, '스웨이드 뮬 [토프]', 'shoes', 45900),
    ( 28, 4952725, '라운드 더비 스니커즈 [블랙]', 'shoes', 82900),
    ( 29, 2741208, '라운드 더비 슈즈 [블랙]', 'shoes', 79900),
    ( 30, 4606826, '라운드 토 코만도 솔 더비 슈즈 [블랙]', 'shoes', 85900),
    ( 31, 5862872, '스웨이드 더비 슈즈 [다크 브라운]', 'shoes', 85900),
    ( 32, 5862868, '티롤리안 슈즈 [블랙]', 'shoes', 62900),
    ( 33, 5862870, '스웨이드 클래식 페니 로퍼 [다크 브라운]', 'shoes', 79900),
    ( 34, 3918413, '볼륨 라운드 더비 슈즈 [블랙]', 'shoes', 85900),
    ( 35, 2731466, '미니멀 유팁 더비 슈즈 [블랙]', 'shoes', 85900),
    ( 36, 6032904, '모즈 스니커즈 [블랙]', 'shoes', 59900),
    ( 37, 2355318, '세미 드레스 페니 로퍼 [블랙]', 'shoes', 79900),
    ( 38, 6409275, '[이도현 PICK] 빈티지 더비 슈즈 [블랙]', 'shoes', 89900),
    ( 39, 6707819, '[헬리녹스 컬래버] 듀러블 백팩 16L [블랙]', 'acc', 65900),
    ( 40, 4677936, 'TR 미니멀 크로스 백 [블랙]', 'acc', 39900),
    ( 41, 6830657, '신세틱 스웨이드 메신저백 [브라운]', 'acc', 45900),
    ( 42, 2410297, '코듀라 버티컬 지퍼 백팩 [블랙]', 'acc', 52900),
    ( 43, 5167729, '립스탑 패커블 토트 백 [블랙]', 'acc', 42900),
    ( 44, 6659333, '신세틱 레더 쇼퍼백 [블랙]', 'acc', 45900),
    ( 45, 6659250, '신세틱 레더 스퀘어 호보백 [블랙]', 'acc', 39900),
    ( 46, 2926616, '사피아노 레더 비즈니스 카드 지갑 [블랙]', 'acc', 35900),
    ( 47, 4641096, '[시티 레저] 립스탑 커브드 포켓 하이킹 백팩 [블랙]', 'acc', 49900),
    ( 48, 3352486, '사피아노 레더 버티컬 폴드 카드 지갑 [블랙]', 'acc', 32900),
    ( 49, 1867755, '사피아노 레더 반지갑 [블랙]', 'acc', 29900),
    ( 50, 1867754, '사피아노 레더 카드 지갑', 'acc', 35900),
    ( 51, 4647080, '나일론 플랩 카고 백팩 [블랙]', 'acc', 55900),
    ( 52, 6707822, '[헬리녹스 컬래버] 듀러블 웨이스트백 [블랙]', 'acc', 55900),
    ( 53, 4677934, '헤비 캔버스 스퀘어 토트 백 [블랙]', 'acc', 42900),
    ( 54, 2771598, '신세틱 레더 호보 크로스 백', 'acc', 39900),
    ( 55, 3052875, '크링클 미니 호보 크로스 백 [블랙]', 'acc', 39900),
    ( 56, 4641082, '크링클 페들러 백 [블랙]', 'acc', 42900),
    ( 57, 2219059, '코듀라 유틸리티 슬링 백 [블랙]', 'acc', 42900),
    ( 58, 1604114, '코듀라 메신저 백_라지 [블랙]', 'acc', 45900),
    ( 59, 3352487, '램스킨 터치 글러브 [블랙]', 'acc', 25900),
    ( 60, 1094749, '라이트웨이트 미들 삭스 7팩 [블랙]', 'acc', 15900),
    ( 61, 5279545, '[이도현 PICK] 신세틱 스웨이드 웨스턴 벨트_25mm', 'acc', 42900),
    ( 62, 1220731, '사피아노 신세틱 레더 벨트_30mm', 'acc', 32900),
    ( 63, 1640887, '사피아노 레더 벨트_30mm', 'acc', 32900),
    ( 64, 4052934, '오토매틱 실크 솔리드 넥타이 [블랙]', 'acc', 24900),
    ( 65, 1010295, '실크 솔리드 넥타이 [블랙]', 'acc', 24900),
    ( 66, 1092995, '미들 삭스 7팩 [블랙]', 'acc', 18900),
    ( 67, 2559402, '[이도현 PICK] 이탈리안 레더 웨스턴 벨트_25mm', 'acc', 39900),
    ( 68, 1267912, '슬리핑 삭스 4팩 [모노]', 'acc', 15900),
    ( 69, 5179030, '[이도현 PICK] 울 스탠다드 솔리드 넥타이 [블랙]', 'acc', 37900),
    ( 70, 1031294, '[이도현 PICK] 레더 드레스 벨트_30mm', 'acc', 45900),
    ( 71, 991339, '라이트웨이트 크루 삭스 7팩 [화이트]', 'acc', 15900),
    ( 72, 3020250, '실크 내로우 솔리드 넥타이 [블랙]', 'acc', 24900),
    ( 73, 746159, '크루 삭스 7팩 [블랙]', 'acc', 18900),
    ( 74, 1010298, '실크 레지멘탈 넥타이 [네이비]', 'acc', 24900),
    ( 75, 1548409, '스퀘어 이탈리안 레더 벨트_30mm', 'acc', 32900),
    ( 76, 5869973, '스네이크 체인 네크리스 [실버]', 'acc', 25900),
    ( 77, 7134518, '엘라스틱 웨빙 벨트_30mm [블랙/실버]', 'acc', 35900),
    ( 78, 1259822, '토 삭스 4팩 [블랙]', 'acc', 18900),
    ( 79, 1215265, '니트 워치 캡 [블랙]', 'acc', 22900),
    ( 80, 1388932, '빅 사이즈 코튼 볼캡 [블랙]', 'acc', 22900),
    ( 81, 5205821, '폴라 플리스 풀 페이스 바라클라바 [블랙]', 'acc', 25900),
    ( 82, 5179367, '[시티 레저] 폴라 플리스 트루퍼 햇 [블랙]', 'acc', 28900),
    ( 83, 5205820, '[시티 레저] 폴라 플리스 바라클라바 [블랙]', 'acc', 22900),
    ( 84, 5788202, '[시티 레저] 트레일 볼 캡 [블랙]', 'acc', 25900),
    ( 85, 7095688, '[챔피온 컬래버] 피그먼트 다이드 비니 [차콜 그레이]', 'acc', 30900),
    ( 86, 4393121, '16W 코듀로이 빅 사이즈 볼캡 [블랙]', 'acc', 25900),
    ( 87, 2122539, '볼드 니트 비니 [블랙]', 'acc', 17900),
    ( 88, 6788212, '[SSG랜더스 컬래버] 피그먼트 다이드 볼캡 [차콜 그레이]', 'acc', 32900),
    ( 89, 4323446, '[시티 레저] CN 리버서블 카고 트루퍼 햇 [블랙]', 'acc', 28900),
    ( 90, 3518274, 'TR 미니멀 볼캡 [블랙]', 'acc', 19900),
    ( 91, 1156575, '코튼 워시드 볼캡 [블랙]', 'acc', 19900),
    ( 92, 3876528, '[시티 레저] CN 라운드 버킷 햇 [블랙]', 'acc', 22900),
    ( 93, 3518281, '나일론 트루퍼 햇 [블랙]', 'acc', 25900),
    ( 94, 2122533, '오버사이즈 코듀로이 버킷 햇 [블랙]', 'acc', 22900),
    ( 95, 734900, '베이식 코튼 볼캡 [블랙]', 'acc', 25900),
    ( 96, 2046489, '오버사이즈 코튼 버킷 햇 [블랙]', 'acc', 22900),
    ( 97, 1225219, '베이식 코튼 버킷 햇 [블랙]', 'acc', 25900),
    ( 98, 4356796, '[시티 레저] 후디드 라이트 다운 재킷 [클라우디 블루]', 'outer', 122900),
    ( 99, 5755268, '[이도현 PICK] US ARMY 탱커 재킷 [베이지]', 'outer', 105900)
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

