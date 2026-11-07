/** 서버(apps/api/src/price.ts)와 같은 공식. 화면 표시용이며, 낙찰가는 서버가 다시 계산한다. */
export const AUCTION_RULE = { durationSec: 300, dropRatePerSec: 0.005, priceUnit: 10 };

export function priceAt(startPrice: number, minPrice: number, startsAtMs: number, nowMs: number) {
  const elapsedSec = Math.floor((nowMs - startsAtMs) / 1000);
  if (elapsedSec <= 0) return startPrice;
  const raw = startPrice * Math.pow(1 - AUCTION_RULE.dropRatePerSec, elapsedSec);
  return Math.max(minPrice, Math.floor(raw / AUCTION_RULE.priceUnit) * AUCTION_RULE.priceUnit);
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function hms(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

export function ms(msLeft: number) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const seoul = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...opts });

/** 11월 6일 (금) 20:00 */
export function openLabel(iso: string) {
  const d = new Date(iso);
  const date = seoul({ month: "long", day: "numeric", weekday: "short" }).format(d);
  const time = seoul({ hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date} ${time}`;
}

/** 11.07 (토) 20:00 */
export function shortDateTime(iso: string) {
  const d = new Date(iso);
  const parts = Object.fromEntries(
    seoul({ month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.month}.${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}`;
}

/** 2026.11.06 20:01:12 */
export function fullDateTime(iso: string) {
  const d = new Date(iso);
  const p = Object.fromEntries(
    seoul({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
