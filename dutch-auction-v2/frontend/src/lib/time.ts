const seoul = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ...opts })

const parts = (fmt: Intl.DateTimeFormat, d: Date) =>
  Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>

export function hms(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0')).join(':')
}

export function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 11월 9일 (월) 20:00 */
export function openLabel(iso: string) {
  const d = new Date(iso)
  const date = seoul({ month: 'long', day: 'numeric', weekday: 'short' }).format(d)
  const time = seoul({ hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date} ${time}`
}

/** 11.10 (화) 20:00 */
export function shortDateTime(iso: string) {
  const p = parts(seoul({ month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }), new Date(iso))
  return `${p.month}.${p.day} (${p.weekday}) ${p.hour}:${p.minute}`
}

/** 2026.11.09 20:01:12 */
export function fullDateTime(iso: string) {
  const p = parts(
    seoul({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    new Date(iso),
  )
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}:${p.second}`
}

/** DB의 시작·종료 시각 차이: "20분" */
export function durationLabel(startsAt: string, endsAt: string) {
  const seconds = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h && `${h}시간`, m && `${m}분`, s && `${s}초`].filter(Boolean).join(' ')
}
