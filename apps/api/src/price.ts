import { AUCTION_RULE } from './config.js';

/**
 * 더치 옥션 현재가.
 *   P(n) = max(min, floor10(start × (1 − 0.005)^n))
 *   n = floor(시작 후 경과 초 / DB의 price_drop_interval_sec)
 * 웹앱(apps/web/lib/price.ts)과 같은 공식. 낙찰가는 항상 서버 시각으로 계산한다.
 */
export function priceAt(startPrice: number, minPrice: number, startsAt: Date, at: Date, priceDropIntervalSec: number): number {
  if (!Number.isInteger(priceDropIntervalSec) || priceDropIntervalSec <= 0) {
    throw new RangeError('priceDropIntervalSec must be a positive integer');
  }
  const steps = Math.floor((at.getTime() - startsAt.getTime()) / (priceDropIntervalSec * 1000));
  if (steps <= 0) return startPrice;
  const raw = startPrice * Math.pow(1 - AUCTION_RULE.dropRatePerStep, steps);
  const unit = AUCTION_RULE.priceUnit;
  return Math.max(minPrice, Math.floor(raw / unit) * unit);
}

