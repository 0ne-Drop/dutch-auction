export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/dutch_auction',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  sessionTtlSec: 60 * 60 * 24 * 7,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};

/** 경매 규칙: 애플리케이션 상수 (DB에 저장하지 않음) */
export const AUCTION_RULE = {
  durationSec: 5 * 60,      // 5분 진행
  dropRatePerSec: 0.005,    // 1초마다 현재가의 0.5% 인하 (복리)
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
