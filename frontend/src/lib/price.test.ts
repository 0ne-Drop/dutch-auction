import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { minPrice, priceAt } from './price'

// 서버(JUnit PriceCalculatorTest)와 같은 기준 파일로 검증 → 서버와 화면의 가격이 항상 일치
const csv = readFileSync(fileURLToPath(new URL('../../../shared/price-cases.csv', import.meta.url)), 'utf8')
const START = Date.parse('2026-11-09T11:00:00Z')

describe('priceAt', () => {
  it('matches shared cases', () => {
    const rows = csv.trim().split('\n').slice(1)
    expect(rows.length).toBeGreaterThan(300)
    for (const row of rows) {
      const [start, elapsed, interval, expected] = row.split(',').map(Number)
      expect(priceAt(start, START, START + elapsed, interval), row).toBe(expected)
    }
  })

  it('follows the 1.02% / 20-minute rule (min price from 19:40)', () => {
    expect(minPrice(289000)).toBe(86700)
    expect(priceAt(289000, START, START + 9_000, 10)).toBe(289000)
    expect(priceAt(289000, START, START + 10_000, 10)).toBe(286050)
    expect(priceAt(289000, START, START + 1_170_000, 10)).toBe(87080)
    expect(priceAt(289000, START, START + 1_180_000, 10)).toBe(86700)
    expect(priceAt(289000, START, START + 1_190_000, 10)).toBe(86700)
  })

  it('rejects invalid intervals', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => priceAt(100, START, START + 1000, bad)).toThrow(RangeError)
    }
  })
})
