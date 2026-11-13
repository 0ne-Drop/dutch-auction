import { describe, expect, it } from 'vitest'
import { displayTick, heartbeatTick, msUntilNextDisplay } from './presence'

const S = Date.parse('2026-11-09T11:00:00Z')

describe('presence schedule', () => {
  it('does not display before start + 1s', () => {
    expect(displayTick(S, S - 60_000)).toBeNull()
    expect(displayTick(S, S)).toBeNull()
    expect(displayTick(S, S + 999)).toBeNull()
  })

  it('refreshes display at start+1s, +6s, +11s …', () => {
    expect(displayTick(S, S + 1_000)).toBe(0)
    expect(displayTick(S, S + 5_999)).toBe(0)
    expect(displayTick(S, S + 6_000)).toBe(1)
    expect(displayTick(S, S + 11_000)).toBe(2)
    // 경계마다 번호가 정확히 한 번씩 바뀌는지
    const changes: number[] = []
    let prev: number | null = null
    for (let t = S; t <= S + 21_000; t += 250) {
      const d = displayTick(S, t)
      if (d !== null && d !== prev) changes.push((t - S) / 1000)
      prev = d
    }
    expect(changes).toEqual([1, 6, 11, 16, 21])
  })

  it('sends heartbeats 1s before each display refresh (0s, 5s, 10s …), also before start', () => {
    expect(heartbeatTick(S, S - 1)).toBe(-1)
    expect(heartbeatTick(S, S)).toBe(0)
    expect(heartbeatTick(S, S + 4_999)).toBe(0)
    expect(heartbeatTick(S, S + 5_000)).toBe(1)
    expect(heartbeatTick(S, S - 5_000)).toBe(-1)
  })

  it('counts down to the next display refresh', () => {
    expect(msUntilNextDisplay(S, S - 2_000)).toBe(3_000)
    expect(msUntilNextDisplay(S, S + 1_000)).toBe(5_000)
    expect(msUntilNextDisplay(S, S + 3_500)).toBe(2_500)
  })
})
