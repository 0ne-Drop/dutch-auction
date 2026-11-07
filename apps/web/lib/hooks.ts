"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/**
 * 서버 시각 동기화. 가격과 남은 시간은 모두 이 시각으로 계산한다
 * (사용자 기기 시계가 틀려도 모든 사람에게 같은 가격이 보이도록).
 */
let offsetMs = 0;
let offsetPromise: Promise<void> | null = null;

function syncOffset() {
  offsetPromise ??= (async () => {
    try {
      const t0 = Date.now();
      const { now } = await api<{ now: number }>("/time");
      const t1 = Date.now();
      offsetMs = now - (t0 + t1) / 2;
    } catch {
      offsetPromise = null;
    }
  })();
  return offsetPromise;
}

export function useServerNow(intervalMs = 250) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    syncOffset().then(() => alive && setNow(Date.now() + offsetMs));
    const id = setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

export interface Me {
  userId: string;
  loginId: string;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/me"));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      setMe(null);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { me, loaded, refresh };
}

export type AuctionEvent =
  | { type: "sold"; itemId: string; winningPrice: number; wonAt: string }
  | { type: "ended"; unsoldItemIds: string[] };

/** 낙찰·유찰 이벤트 구독 (SSE). 연결이 끊기면 브라우저가 자동으로 다시 연결한다. */
export function useAuctionEvents(auctionId: string | null | undefined, onEvent: (e: AuctionEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!auctionId) return;
    const es = new EventSource(`/api/auctions/${auctionId}/events`);
    es.onmessage = (msg) => {
      try {
        handler.current(JSON.parse(msg.data));
      } catch {
        /* ignore malformed */
      }
    };
    return () => es.close();
  }, [auctionId]);
}
