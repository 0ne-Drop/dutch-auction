/**
 * 서버(backend AuctionRule·PriceCalculator)와 같은 공식. 화면 표시용이며 낙찰가는 서버가 다시 계산한다.
 *   n      = floor((기준 시각 - 시작 시각) / 인하 주기)
 *   현재가 = max(최소가, floor10(시작가 × 0.9898ⁿ))   (1.02% 복리 인하)
 *   최소가 = floor10(시작가 × 30%)
 * 부동소수점 오차로 서버와 10원 단위가 어긋나지 않도록 BigInt로 정확히 계산한다.
 */
export const AUCTION_RULE = {
  dropNumerator: 4949n, // 1.02% 인하 → × 0.9898
  dropDenominator: 5000n,
  minPricePercent: 30n,
  priceUnit: 10n,
} as const

const MAX_STEPS = 1000

export function minPrice(startPrice: number): number {
  const s = BigInt(startPrice)
  return Number(((s * AUCTION_RULE.minPricePercent) / (100n * AUCTION_RULE.priceUnit)) * AUCTION_RULE.priceUnit)
}

export function steps(startsAtMs: number, nowMs: number, dropIntervalSec: number): number {
  if (!Number.isInteger(dropIntervalSec) || dropIntervalSec <= 0) {
    throw new RangeError('dropIntervalSec must be a positive integer')
  }
  const elapsed = nowMs - startsAtMs
  if (elapsed <= 0) return 0
  return Math.floor(elapsed / (dropIntervalSec * 1000))
}

export function priceAt(startPrice: number, startsAtMs: number, nowMs: number, dropIntervalSec: number): number {
  const n = steps(startsAtMs, nowMs, dropIntervalSec)
  const min = minPrice(startPrice)
  if (n <= 0) return startPrice
  if (n > MAX_STEPS) return min
  const big = BigInt(n)
  const numerator = BigInt(startPrice) * AUCTION_RULE.dropNumerator ** big
  const denominator = AUCTION_RULE.dropDenominator ** big * AUCTION_RULE.priceUnit
  const floored = Number((numerator / denominator) * AUCTION_RULE.priceUnit)
  return Math.max(min, floored)
}

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
