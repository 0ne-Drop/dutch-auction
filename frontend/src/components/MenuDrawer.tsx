import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, CATEGORIES } from '../lib/api'
import type { Upcoming } from '../lib/api'
import { shortDateTime } from '../lib/time'
import { ChevronIcon, CloseIcon } from './icons'

export function MenuDrawer({ open, onClose, loggedIn }: { open: boolean; onClose: () => void; loggedIn: boolean }) {
  const [upcoming, setUpcoming] = useState<Upcoming[] | null>(null)

  useEffect(() => {
    if (!open) return
    api<Upcoming[]>('/auctions/upcoming').then(setUpcoming).catch(() => setUpcoming([]))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const chip = 'flex h-9 items-center rounded-full border border-field px-3.5 text-[13px]'

  return (
    <div className="fixed inset-0 z-50 flex justify-center" role="dialog" aria-modal="true" aria-label="전체 메뉴">
      <div className="relative flex h-full w-full max-w-[430px]">
        <nav className="relative z-10 flex h-full w-[300px] flex-col overflow-y-auto bg-white">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-5 pr-2">
            <span className="text-[17px] font-bold">더치 옥션</span>
            <button type="button" onClick={onClose} aria-label="메뉴 닫기" className="flex h-11 w-11 items-center justify-center">
              <CloseIcon />
            </button>
          </div>

          <section className="px-5 pb-2 pt-5">
            <h2 className="mb-2 text-[13px] font-medium text-sub">물품 카테고리</h2>
            <div className="flex flex-wrap gap-2">
              <Link to="/" onClick={onClose} className={chip}>전체</Link>
              {CATEGORIES.map((c) => (
                <Link key={c.code} to={`/?category=${c.code}`} onClick={onClose} className={chip}>
                  {c.label}
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-3 border-t border-line-soft px-5 pb-2 pt-5">
            <h2 className="mb-1 text-[13px] font-medium text-sub">진행 예정 브랜드</h2>
            {upcoming === null && <p className="py-3 text-[13px] text-mute">불러오는 중…</p>}
            {upcoming?.length === 0 && <p className="py-3 text-[13px] text-mute">예정된 경매가 없습니다.</p>}
            <ul>
              {upcoming?.map((u) => (
                <li key={u.id} className="flex h-[52px] items-center justify-between border-b border-line-soft">
                  <span className="text-[15px] font-medium">{u.brandName}</span>
                  <span className="tabular text-[13px] text-sub">{shortDateTime(u.startsAt)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-3 border-t border-line-soft p-5">
            <Link
              to="/wins"
              onClick={onClose}
              className="flex h-[52px] items-center justify-between rounded-[10px] border border-ink px-4 text-[15px] font-medium"
            >
              <span>내 낙찰 물품</span>
              <ChevronIcon />
            </Link>
            {!loggedIn && <p className="mt-2 text-xs text-mute">로그인 후 이용할 수 있습니다</p>}
          </section>
        </nav>
        <button type="button" aria-label="메뉴 닫기" onClick={onClose} className="absolute inset-0 bg-black/45" />
      </div>
    </div>
  )
}
