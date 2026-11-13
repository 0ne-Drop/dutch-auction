import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { Me } from './api'
import { displayTick, heartbeatTick } from './presence'

/**
 * 서버 시각 동기화. 가격과 남은 시간은 모두 이 시각으로 계산한다
 * (사용자 기기 시계가 틀려도 모든 사람에게 같은 가격이 보이도록).
 */
let offsetMs = 0
let offsetPromise: Promise<void> | null = null

function syncOffset() {
  offsetPromise ??= (async () => {
    try {
      const t0 = Date.now()
      const { now } = await api<{ now: number }>('/time')
      const t1 = Date.now()
      offsetMs = now - (t0 + t1) / 2
    } catch {
      offsetPromise = null
    }
  })()
  return offsetPromise
}

export function useServerNow(intervalMs = 250) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    syncOffset().then(() => alive && setNow(Date.now() + offsetMs))
    const id = setInterval(() => setNow(Date.now() + offsetMs), intervalMs)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [intervalMs])
  return now
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null)
  const [loaded, setLoaded] = useState(false)
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'))
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) console.error(e)
      setMe(null)
    } finally {
      setLoaded(true)
    }
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { me, loaded, refresh }
}

/** 공개 이벤트: 가격 없음. 가격이 필요하면 받은 뒤 로그인 API로 다시 조회한다. */
export type AuctionEvent = { type: 'sold'; itemId: string } | { type: 'ended'; unsoldItemIds: string[] }

/** 낙찰·유찰 이벤트 구독 (SSE). 연결이 끊기면 브라우저가 자동으로 다시 연결한다. */
export function useAuctionEvents(auctionId: string | null | undefined, onEvent: (e: AuctionEvent) => void) {
  const handler = useRef(onEvent)
  useEffect(() => {
    handler.current = onEvent
  })
  useEffect(() => {
    if (!auctionId) return
    const es = new EventSource(`/api/auctions/${auctionId}/events`)
    es.onmessage = (msg) => {
      try {
        handler.current(JSON.parse(msg.data))
      } catch {
        /* 잘못된 메시지는 무시 */
      }
    }
    return () => es.close()
  }, [auctionId])
}

/** 서버 시각 (ms). useServerNow와 같은 보정값을 쓴다. */
export function serverNow() {
  return Date.now() + offsetMs
}

/**
 * 입찰 페이지 접속자 수 (일정은 lib/presence.ts).
 * - 접속 신호: 시작 기준 0초·5초·10초…에 POST (페이지에 들어오면 즉시 1번 더)
 * - 화면 갱신: 시작 1초 뒤부터 5초 단위(1초·6초·11초…)에 GET. 경기 중간에 들어오면 즉시 1번 읽고 이후 같은 일정
 * - 경매가 끝나면 멈추고 마지막 값을 유지. 페이지를 떠나면 즉시 제외 요청
 */
export function usePresence(itemId: string | undefined, startsAtMs: number | undefined, endsAtMs: number | undefined) {
  const [viewers, setViewers] = useState<number | null>(null)
  useEffect(() => {
    if (!itemId || startsAtMs === undefined || endsAtMs === undefined) return
    let alive = true
    let lastBeat: number | null = null
    let lastDisplay: number | null = null

    const beat = () => api(`/items/${itemId}/presence`, { method: 'POST' }).catch(() => {})
    const read = () =>
      api<{ viewers: number }>(`/items/${itemId}/presence`)
        .then((r) => alive && setViewers(r.viewers))
        .catch(() => {})

    const tick = () => {
      const now = serverNow()
      if (now >= endsAtMs) return
      const b = heartbeatTick(startsAtMs, now)
      if (b !== lastBeat) {
        lastBeat = b
        beat()
      }
      const d = displayTick(startsAtMs, now)
      if (d !== null && d !== lastDisplay) {
        lastDisplay = d
        read()
      }
    }

    syncOffset().then(() => alive && tick())
    const id = setInterval(tick, 200)
    const leave = () => {
      fetch(`/api/items/${itemId}/presence/leave`, { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {})
    }
    window.addEventListener('pagehide', leave)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [itemId, startsAtMs, endsAtMs])
  return viewers
}
