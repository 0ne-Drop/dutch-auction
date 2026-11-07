/** 서버(apps/api/src/price.ts)와 같은 공식. 화면 표시용이며, 낙찰가는 서버가 다시 계산한다. */
export const AUCTION_RULE = { dropRatePerStep: 0.005, priceUnit: 10 };

export function priceAt(startPrice: number, minPrice: number, startsAtMs: number, nowMs: number, priceDropIntervalSec: number) {
  if (!Number.isInteger(priceDropIntervalSec) || priceDropIntervalSec <= 0) {
    throw new RangeError('priceDropIntervalSec must be a positive integer');
  }
  const steps = Math.floor((nowMs - startsAtMs) / (priceDropIntervalSec * 1000));
  if (steps <= 0) return startPrice;
  const raw = startPrice * Math.pow(1 - AUCTION_RULE.dropRatePerStep, steps);
  return Math.max(minPrice, Math.floor(raw / AUCTION_RULE.priceUnit) * AUCTION_RULE.priceUnit);
}

/** DB의 시작·종료 시각 차이를 표시한다. */
export function durationLabel(startsAt: string, endsAt: string) {
  const seconds = (Date.parse(endsAt) - Date.parse(startsAt)) / 1000;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Number((seconds % 60).toFixed(3));
  return [hours && `${hours}시간`, minutes && `${minutes}분`, rest && `${rest}초`].filter(Boolean).join(" ");
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
