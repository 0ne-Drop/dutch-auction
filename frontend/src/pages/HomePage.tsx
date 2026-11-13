import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, categoryLabel } from '../lib/api'
import type { PublicItem, TodayResponse } from '../lib/api'
import { useAuctionEvents, useMe, useServerNow } from '../lib/hooks'
import { durationLabel, hms, openLabel } from '../lib/time'
import { MenuDrawer } from '../components/MenuDrawer'
import { ItemImage } from '../components/ItemImage'
import { CloseIcon, LockIcon, MenuIcon } from '../components/icons'

type Phase = 'before' | 'live' | 'ended'

/** 홈: 가격 정보는 표시하지 않는다(가격은 입찰 페이지에서만). API도 가격을 내려주지 않는다. */
export function HomePage() {
  const [params] = useSearchParams()
  const category = params.get('category')
  const { me, loaded, refresh } = useMe()
  const now = useServerNow()
  const [data, setData] = useState<TodayResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    api<TodayResponse>(`/auctions/today${qs}`)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e.message))
  }, [category])

  useAuctionEvents(data?.auction?.id, (ev) => {
    setData((d) => {
      if (!d) return d
      const items = d.items.map((it): PublicItem => {
        if (ev.type === 'sold' && it.id === ev.itemId) return { ...it, status: 'sold' }
        if (ev.type === 'ended' && ev.unsoldItemIds.includes(it.id)) return { ...it, status: 'unsold' }
        return it
      })
      return { ...d, items }
    })
  })

  const auction = data?.auction
  const startsAt = auction ? Date.parse(auction.startsAt) : 0
  const endsAt = auction ? Date.parse(auction.endsAt) : 0
  const phase: Phase | null = !auction || now === null ? null : now < startsAt ? 'before' : now < endsAt ? 'live' : 'ended'

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    await refresh()
  }

  const pill = 'flex h-9 items-center rounded-full border border-ink px-3.5 text-sm font-medium'

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-2">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="메뉴 열기" className="flex h-11 w-11 items-center justify-center">
          <MenuIcon />
        </button>
        <Link to="/" className="text-[17px] font-bold tracking-tight">더치 옥션</Link>
        {!loaded ? (
          <span className="h-9 w-[72px]" aria-hidden />
        ) : me ? (
          <button type="button" onClick={logout} className={pill}>로그아웃</button>
        ) : (
          <Link to="/login" className={pill}>로그인</Link>
        )}
      </header>

      <MenuDrawer open={menuOpen} onClose={closeMenu} loggedIn={Boolean(me)} />

      <main className="flex flex-1 flex-col pb-6">
        {error && <p className="m-4 rounded-lg bg-panel p-4 text-sm text-danger">{error}</p>}

        {data && !auction && (
          <section className="mx-4 mt-4 rounded-xl border border-line bg-panel p-5">
            <p className="text-xs font-medium text-sub">오늘의 경매 브랜드</p>
            <p className="mt-2 text-lg font-bold">오늘은 진행하는 경매가 없습니다</p>
            <p className="mt-1 text-[13px] text-sub">메뉴에서 진행 예정 브랜드를 확인하세요.</p>
          </section>
        )}

        {auction && (
          <>
            <section className="mx-4 mt-4 flex flex-col gap-2 rounded-xl border border-line bg-panel p-5">
              <p className="text-xs font-medium text-sub">오늘의 경매 브랜드</p>
              <p className="text-2xl font-bold">{auction.brandName}</p>
              <p className="text-[13px] text-sub">
                {openLabel(auction.startsAt)} 오픈 · {durationLabel(auction.startsAt, auction.endsAt)} 진행
              </p>
            </section>

            <div role="timer" className="mx-4 mt-3 flex flex-col items-center gap-0.5 rounded-xl bg-ink px-4 py-3.5 text-white">
              {phase === null && <TimerLabel label="불러오는 중" value="--:--:--" />}
              {phase === 'before' && <TimerLabel label="시작까지" value={hms(startsAt - now!)} />}
              {phase === 'live' && <TimerLabel label="종료까지" value={hms(endsAt - now!)} />}
              {phase === 'ended' && <TimerLabel label="오늘의 경매가 종료되었습니다" value="00:00:00" />}
            </div>

            <div className="flex items-baseline justify-between px-4 pb-2.5 pt-5">
              <h2 className="text-[17px] font-bold">경매 물품</h2>
              <span className="text-[13px] text-sub">{data?.totalItems}개 동시 진행</span>
            </div>

            {category && (
              <div className="px-4 pb-3">
                <Link to="/" className="inline-flex h-8 items-center gap-1 rounded-full bg-ink pl-3 pr-2 text-[13px] text-white">
                  {categoryLabel(category) ?? category}
                  <span className="sr-only">필터 해제</span>
                  <CloseIcon size={16} />
                </Link>
              </div>
            )}

            {data?.items.length === 0 && (
              <p className="mx-4 rounded-lg border border-dashed border-field p-6 text-center text-sm text-sub">
                이 카테고리의 물품이 없습니다.
              </p>
            )}

            <ul className="grid grid-cols-2 gap-3 px-4">
              {data?.items.map((it) => (
                <li key={it.id}>
                  <ItemCard item={it} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  )
}

function TimerLabel({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-[13px] font-medium text-[#d9d9d9]">{label}</span>
      <span className="tabular text-[40px] font-bold leading-[1.15] tracking-[1px]">{value}</span>
    </>
  )
}

function ItemCard({ item }: { item: PublicItem }) {
  const closed = item.status !== 'listed'
  return (
    <Link to={`/items/${item.id}`} className="flex flex-col gap-1.5">
      <div className="relative aspect-square overflow-hidden rounded-[10px] border border-line">
        <ItemImage src={item.imageUrl} alt={item.name} className="h-full w-full" />
        {closed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <span className="rounded-full bg-white px-3 py-1 text-[13px] font-bold">
              {item.status === 'sold' ? '낙찰 완료' : '유찰'}
            </span>
          </div>
        )}
      </div>
      <span className="text-sm font-medium leading-snug">{item.name}</span>
      <span className="inline-flex items-center gap-1 text-xs text-mute">
        <LockIcon />
        {closed ? '경매 종료' : '가격은 입찰 페이지에서 공개'}
      </span>
    </Link>
  )
}
