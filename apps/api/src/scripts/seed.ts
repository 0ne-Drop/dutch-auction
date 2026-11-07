/**
 * 데모 데이터 생성. 브랜드·물품·가격은 모두 예시 데이터입니다.
 *   npm run seed                 → 오늘의 경매가 60초 뒤 시작
 *   npm run seed -- --start-in 0 → 지금 바로 시작
 *
 * 데모 계정: demo / demo1234
 */
import { v7 as uuidv7 } from 'uuid';
import { db, pool } from '../db.js';
import { hashPassword } from '../auth.js';
import { redis } from '../redis.js';

const argIdx = process.argv.indexOf('--start-in');
const startInSec = argIdx > -1 ? Number(process.argv[argIdx + 1]) : 60;

// 데모 생성 시에만 사용하는 기본값. 실행 시 가격과 기간은 저장된 DB 값을 참조한다.
const SEED_DEFAULTS = { durationSec: 300, priceDropIntervalSec: 1 };
const auctionEndsAt = (start: Date) => new Date(start.getTime() + SEED_DEFAULTS.durationSec * 1000);

const seoulDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d); // YYYY-MM-DD

const img = (label: string) =>
  `https://placehold.co/600x600/e9e9e9/555555/png?text=${encodeURIComponent(label)}`;

const BRANDS = ['솔트앤파인', '그레이포레스트', '라벤더힐', '블루하버'];

const TODAY_ITEMS: Array<[string, string, string, number, number]> = [
  // [category, name, image label, start_price, min_price]
  ['outer', '울 블렌드 싱글 코트', 'Coat', 289000, 89000],
  ['outer', '라이트 다운 패딩 점퍼', 'Padding', 239000, 79000],
  ['top', '케이블 니트 스웨터', 'Knit', 129000, 39000],
  ['top', '옥스포드 버튼다운 셔츠', 'Shirt', 79000, 25000],
  ['bottom', '와이드 울 슬랙스', 'Slacks', 99000, 32000],
  ['bottom', '세미 와이드 데님 팬츠', 'Denim', 89000, 29000],
  ['shoes', '스웨이드 첼시 부츠', 'Boots', 199000, 69000],
  ['acc', '램스울 머플러', 'Muffler', 59000, 19000],
];

await db.deleteFrom('award').execute();
await db.deleteFrom('item').execute();
await db.deleteFrom('auction').execute();
await db.deleteFrom('brand').execute();
await db.deleteFrom('app_user').execute();
const sessionKeys = await redis.keys('session:*');
const lockKeys = await redis.keys('bid:lock:*');
if (sessionKeys.length || lockKeys.length) await redis.del(...sessionKeys, ...lockKeys);

const brandIds = BRANDS.map(() => uuidv7());
await db
  .insertInto('brand')
  .values(BRANDS.map((name, i) => ({ brand_id: brandIds[i], name })))
  .execute();

// 오늘의 경매
const now = new Date();
const startsAt = new Date(Math.ceil((now.getTime() + startInSec * 1000) / 1000) * 1000);
const todayAuctionId = uuidv7();
await db
  .insertInto('auction')
  .values({
    auction_id: todayAuctionId,
    brand_id: brandIds[0],
    auction_date: seoulDate(startsAt),
    starts_at: startsAt,
    ends_at: auctionEndsAt(startsAt),
    price_drop_interval_sec: SEED_DEFAULTS.priceDropIntervalSec,
  })
  .execute();

await db
  .insertInto('item')
  .values(
    TODAY_ITEMS.map(([category, name, label, start, min]) => ({
      item_id: uuidv7(),
      auction_id: todayAuctionId,
      name,
      image_url: img(label),
      category,
      start_price: start,
      min_price: min,
    })),
  )
  .execute();

// 진행 예정 경매: 내일부터 하루씩, 서울 기준 20:00
for (let i = 1; i < BRANDS.length; i++) {
  const day = new Date(now.getTime() + i * 86_400_000);
  const date = seoulDate(day);
  const s = new Date(`${date}T20:00:00+09:00`);
  await db
    .insertInto('auction')
    .values({
      auction_id: uuidv7(),
      brand_id: brandIds[i],
      auction_date: date,
      starts_at: s,
      ends_at: auctionEndsAt(s),
      price_drop_interval_sec: SEED_DEFAULTS.priceDropIntervalSec,
    })
    .execute();
}

await db
  .insertInto('app_user')
  .values({ app_user_id: uuidv7(), login_id: 'demo', password_hash: await hashPassword('demo1234') })
  .execute();

console.log(`seeded: 오늘의 경매(${BRANDS[0]}) 시작 ${startsAt.toISOString()} / 데모 계정 demo / demo1234`);
await redis.quit();
await pool.end();
