# MUSINSA STANDARD 목 데이터 (상품 100개)

S3 이미지 버킷에 올린 상품 이미지 100개에 맞춘 목 데이터입니다. 하루 회차 1개에 100개를 모두 넣습니다.

| 파일 | 설명 |
|---|---|
| `generate_seed_sql.py` | `manifest.csv` → `seed_musinsa_100.sql` 생성기 (카테고리 매핑, 시작가 추정) |
| `seed_musinsa_100.sql` | 생성된 SQL. 직접 고치지 말고 생성기를 고친 뒤 다시 만들 것 |
| `run_seed.sh` | EKS 에서 실행 (클러스터 안 1회용 Job 으로 RDS 에 psql 실행) |

## 실행

이미지 주소는 `<IMAGE_BASE>/<상품ID>.webp` 로 만들어집니다. 버킷에 `images/7049131.webp` 처럼 올렸다면 `IMAGE_BASE` 는 `https://<버킷 도메인>/images` 입니다.

**EKS (RDS)**
```bash
IMAGE_BASE=https://<이미지 버킷 도메인>/images ./scripts/seed/musinsa/run_seed.sh
# 시작 시각 지정 (없으면 실행 시점 + 10분)
IMAGE_BASE=... STARTS_AT='2026-11-20 20:00:00+09' ./scripts/seed/musinsa/run_seed.sh
```

**로컬 (docker compose 의 db)**
```bash
psql -h localhost -U postgres -d dutch_auction \
  -v image_base=https://<이미지 버킷 도메인>/images \
  -f scripts/seed/musinsa/seed_musinsa_100.sql
```
로컬에서 `SEED_ENABLED=true` 로 앱을 띄우면 DemoSeeder 가 모든 데이터를 지우므로, 이 스크립트는 앱이 뜬 뒤에 실행하세요.

## 동작

- 브랜드 `MUSINSA STANDARD` 가 없으면 만듭니다.
- 시작 시각의 날짜(서울 기준)에 회차가 없으면 만듭니다. 10초 주기 1.02% 인하, 20분 진행 (앱 기본값과 같음)
- 같은 날 **다른 브랜드** 회차가 이미 있으면 중단합니다 (회차는 하루 1개, 회차당 브랜드 1개)
- 같은 날 다시 실행하면 중복 없이 그대로, 다른 날로 실행하면 그 회차에 100개가 새로 들어갑니다
- 기존 사용자·낙찰·다른 회차는 건드리지 않고, 전체가 한 트랜잭션이라 실패하면 아무것도 들어가지 않습니다

## 데이터 기준

**카테고리** (무신사 카테고리 → DB)

| 무신사 | DB | 개수 |
|---|---|---|
| 아우터, 의류 중 재킷·윈드브레이커 등 | outer | 4 |
| 의류 (팬츠·슬랙스·데님 등) | bottom | 16 |
| 의류 (그 외) | top | 1 |
| 신발/신발용품 | shoes | 20 |
| 가방/지갑, 모자, 소품 | acc | 59 |

**시작가**: 원본 데이터에 가격이 없어 품목 키워드별 가격대로 추정한 **예시 값**입니다 (실제 판매가 아님).
9,900 ~ 122,900원. 규칙은 `generate_seed_sql.py` 의 `PRICE_RULES` 참고.

## 다시 만들기

```bash
python3 scripts/seed/musinsa/generate_seed_sql.py <manifest.csv 경로> > scripts/seed/musinsa/seed_musinsa_100.sql
```
