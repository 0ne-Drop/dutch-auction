import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import type { ItemDetail } from '../lib/api'
import { useAuctionEvents, usePresence, useServerNow } from '../lib/hooks'
import { priceAt, won } from '../lib/price'
import { hms, mmss } from '../lib/time'
import { ItemImage } from '../components/ItemImage'
import { BackIcon, EyeIcon } from '../components/icons'

type Result = { kind: 'won'; price: number } | { kind: 'lost'; message: string } | null

/** 경매물품 입찰 페이지: 가격은 이 화면에서만 보여 준다. 접속자 수는 5초마다 갱신. */
export function BidPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const now = useServerNow(200)
  const [item, setItem] = useState<ItemDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Result>(null)
  // 접속자 수: 시작 1초 뒤부터 5초 단위로 갱신 (서버 시각 기준)
  const viewers = usePresence(item?.id, item ? Date.parse(item.startsAt) : undefined, item ? Date.parse(item.endsAt) : undefined)

  const load = useCallback(async () => {
    try {
      setItem(await api<ItemDetail>(`/items/${id}`))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        navigate(`/login?next=${encodeURIComponent(`/items/${id}`)}`, { replace: true })
        return
      }
      setLoadError((e as Error).message)
    }
  }, [id, navigate])

  useEffect(() => {
    load()
  }, [load])

  // 공개 이벤트에는 가격이 없으므로, 이 물품이 낙찰·유찰되면 로그인 API로 다시 조회
  useAuctionEvents(item?.auctionId, (ev) => {
    if ((ev.type === 'sold' && ev.itemId === id) || (ev.type === 'ended' && ev.unsoldItemIds.includes(id))) load()
  })


  if (loadError) {
    return (
      <>
        <Header title="경매 물품" />
        <p className="m-5 rounded-lg bg-panel p-4 text-sm text-danger">{loadError}</p>
      </>
    )
  }
  if (!item) {
    return (
      <>
        <Header title="" />
        <p className="p-6 text-sm text-mute">불러오는 중…</p>
      </>
    )
  }

  const startsAt = Date.parse(item.startsAt)
  const endsAt = Date.parse(item.endsAt)
  const t = now ?? startsAt - 1
  const phase = t < startsAt ? 'before' : t < endsAt ? 'live' : 'ended'
  const current = priceAt(item.startPrice, startsAt, Math.min(t, endsAt), item.priceDropIntervalSec)
  const shownPrice = item.status === 'sold' && item.winningPrice !== null ? item.winningPrice : current
  const dropRatio = (item.startPrice - shownPrice) / (item.startPrice - item.minPrice)
  const nextDropInMs = item.priceDropIntervalSec * 1000 - ((t - startsAt) % (item.priceDropIntervalSec * 1000))
  const canBid = item.status === 'listed' && phase === 'live' && now !== null && !pending

  const badge =
    item.status === 'sold' ? '낙찰 완료' : item.status === 'unsold' ? '유찰' : phase === 'before' ? '시작 전' : phase === 'live' ? '진행 중' : '종료'

  async function bid() {
    if (!canBid) return
    setPending(true)
    try {
      const res = await api<{ winningPrice: number; wonAt: string }>(`/items/${id}/bid`, { method: 'POST' })
      setItem((it) => (it ? { ...it, status: 'sold', winningPrice: res.winningPrice, wonAt: res.wonAt, wonByMe: true } : it))
      setResult({ kind: 'won', price: res.winningPrice })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        navigate(`/login?next=${encodeURIComponent(`/items/${id}`)}`, { replace: true })
        return
      }
      setResult({ kind: 'lost', message: (e as Error).message })
      load()
    } finally {
      setPending(false)
    }
  }

  let cta: string
  if (pending) cta = '낙찰 처리 중…'
  else if (item.status === 'sold') cta = item.wonByMe ? '내가 낙찰받은 물품입니다' : '다른 사용자가 낙찰받았습니다'
  else if (item.status === 'unsold') cta = '유찰된 물품입니다'
  else if (phase === 'before') cta = `시작 전 · 시작가 ${won(item.startPrice)}`
  else if (phase === 'ended') cta = '경매가 종료되었습니다'
  else cta = `${won(current)}에 지금 낙찰받기`

  return (
    <>
      <Header title={item.brandName} />

      <div className="relative aspect-[390/300] w-full shrink-0 overflow-hidden border-b border-line">
        <ItemImage src={item.imageUrl} alt={item.name} className="h-full w-full" />
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-[13px] font-medium text-white" aria-live="polite">
          <EyeIcon />
          <span className="tabular">{viewers !== null ? `${viewers.toLocaleString('ko-KR')}명이 보고 있어요` : now !== null && now < startsAt + 1000 ? '경매 시작 후 접속자 표시' : '접속자 확인 중'}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{item.name}</h2>
          <span className="shrink-0 rounded-full border border-ink px-2.5 py-1 text-xs font-medium">{badge}</span>
        </div>

        <div className="flex flex-col gap-2.5 rounded-xl border border-line p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-sub">{item.status === 'sold' ? '낙찰가' : '현재가'}</span>
            <span className="tabular text-[30px] font-bold">{won(shownPrice)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-[#e6e6e6]" role="progressbar" aria-label="시작가 대비 하락 정도"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(dropRatio * 100)}>
            <div className="h-2 bg-sub transition-[width] duration-200" style={{ width: `${Math.min(100, dropRatio * 100)}%` }} />
          </div>
          <div className="tabular flex justify-between text-xs text-sub">
            <span>최소가 {won(item.minPrice)}</span>
            <span>시작가 {won(item.startPrice)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[10px] bg-panel p-3">
            <p className="text-xs text-sub">{phase === 'before' ? '시작까지' : '남은 시간'}</p>
            <p className="tabular text-xl font-bold">
              {now === null ? '--:--' : phase === 'before' ? hms(startsAt - t) : phase === 'live' ? mmss(endsAt - t) : '00:00'}
            </p>
          </div>
          <div className="rounded-[10px] bg-panel p-3">
            <p className="text-xs text-sub">다음 인하까지</p>
            <p className="tabular text-xl font-bold">
              {phase === 'live' && item.status === 'listed' && shownPrice > item.minPrice ? `${Math.ceil(nextDropInMs / 1000)}초` : '-'}
            </p>
          </div>
        </div>

        {result?.kind === 'lost' && (
          <p role="alert" className="rounded-[10px] border border-danger/40 bg-[#fdf2f1] p-3 text-[13px] text-danger">{result.message}</p>
        )}
      </div>

      <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-line bg-white px-5 pb-6 pt-3">
        <button type="button" onClick={bid} disabled={!canBid}
          className="tabular h-14 rounded-xl bg-ink text-[17px] font-bold text-white disabled:bg-[#9a9a9a]">
          {cta}
        </button>
        <p className="text-center text-xs text-mute">누르는 순간의 가격으로 즉시 낙찰됩니다. 가장 먼저 누른 1명만 낙찰됩니다.</p>
      </div>

      {result?.kind === 'won' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" role="dialog" aria-modal="true" aria-labelledby="won-title">
          <div className="w-full max-w-[340px] rounded-2xl bg-white p-6 text-center">
            <p id="won-title" className="text-lg font-bold">낙찰되었습니다</p>
            <p className="mt-1 text-sm text-sub">{item.name}</p>
            <p className="tabular mt-4 text-3xl font-bold">{won(result.price)}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Link to="/wins" className="flex h-12 items-center justify-center rounded-[10px] bg-ink font-medium text-white">내 낙찰 물품 보기</Link>
              <button type="button" onClick={() => setResult(null)} className="h-12 rounded-[10px] border border-line font-medium">계속 둘러보기</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Header({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-line bg-white px-2">
      <Link to="/" aria-label="홈으로" className="flex h-11 w-11 items-center justify-center">
        <BackIcon />
      </Link>
      <h1 className="text-base font-medium">{title}</h1>
    </header>
  )
}
