export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/dutch_auction',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  sessionTtlSec: 60 * 60 * 24 * 7,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};

/** 가격 공식의 공통 정책. 회차의 주기와 기간은 DB 값을 사용한다. */
export const AUCTION_RULE = {
  dropRatePerStep: 0.005,   // DB에 저장된 인하 주기마다 0.5% 인하 (복리)
  priceUnit: 10,            // 10원 단위 내림
};

export const CATEGORIES = [
  { code: 'outer', label: '아우터' },
  { code: 'top', label: '상의' },
  { code: 'bottom', label: '하의' },
  { code: 'shoes', label: '신발' },
  { code: 'acc', label: '잡화' },
] as const;

export type CategoryCode = (typeof CATEGORIES)[number]['code'];
export const isCategory = (v: unknown): v is CategoryCode =>
  typeof v === 'string' && CATEGORIES.some((c) => c.code === v);
