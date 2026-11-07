import { AUCTION_RULE } from './config.js';

/**
 * 더치 옥션 현재가.
 *   P(t) = max(min, floor10(start × (1 − 0.005)^t)),  t = 시작 후 경과 초(정수)
 * 웹앱(apps/web/lib/price.ts)과 같은 공식. 낙찰가는 항상 서버 시각으로 계산한다.
 */
export function priceAt(startPrice: number, minPrice: number, startsAt: Date, at: Date): number {
  const elapsedSec = Math.floor((at.getTime() - startsAt.getTime()) / 1000);
  if (elapsedSec <= 0) return startPrice;
  const raw = startPrice * Math.pow(1 - AUCTION_RULE.dropRatePerSec, elapsedSec);
  const unit = AUCTION_RULE.priceUnit;
  return Math.max(minPrice, Math.floor(raw / unit) * unit);
}

export function auctionEndsAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + AUCTION_RULE.durationSec * 1000);
}
