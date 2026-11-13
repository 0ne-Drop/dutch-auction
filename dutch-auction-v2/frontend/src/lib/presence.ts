/**
 * 입찰 페이지 접속자 수 갱신 일정 (모두 서버 시각 기준, 모든 사용자에게 같은 순간에 갱신).
 *
 *   접속 신호(하트비트): 시작 시각 기준 0초, 5초, 10초 … (시작 전에도 같은 간격으로 보내 미리 집계)
 *   화면 갱신          : 시작 1초 뒤부터 5초 단위 → 1초, 6초, 11초 …
 *
 * 화면 갱신을 하트비트보다 1초 늦게 해서, 같은 순간에 들어온 모든 사용자의 신호가
 * 서버에 반영된 뒤에 인원을 읽는다. 경매가 끝나면 둘 다 멈춘다.
 */
export const PRESENCE_PERIOD_MS = 5000
export const PRESENCE_DISPLAY_DELAY_MS = 1000

/** 지금 속한 하트비트 구간 번호 (구간이 바뀌면 신호를 보낸다) */
export function heartbeatTick(startsAtMs: number, nowMs: number): number {
  return Math.floor((nowMs - startsAtMs) / PRESENCE_PERIOD_MS)
}

/** 지금 속한 화면 갱신 구간 번호. 시작 1초 전까지는 null(아직 표시하지 않음) */
export function displayTick(startsAtMs: number, nowMs: number): number | null {
  const sinceFirst = nowMs - (startsAtMs + PRESENCE_DISPLAY_DELAY_MS)
  if (sinceFirst < 0) return null
  return Math.floor(sinceFirst / PRESENCE_PERIOD_MS)
}

/** 다음 화면 갱신까지 남은 ms (표시용). 시작 전이면 첫 갱신(시작 1초 뒤)까지 */
export function msUntilNextDisplay(startsAtMs: number, nowMs: number): number {
  const first = startsAtMs + PRESENCE_DISPLAY_DELAY_MS
  if (nowMs < first) return first - nowMs
  return PRESENCE_PERIOD_MS - ((nowMs - first) % PRESENCE_PERIOD_MS)
}
