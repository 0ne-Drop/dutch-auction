import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Win } from '../lib/api'
import { won } from '../lib/price'
import { fullDateTime } from '../lib/time'
import { TopBar } from '../components/TopBar'
import { ItemImage } from '../components/ItemImage'

/** 내 낙찰 물품: 본인 구매 내역이라 낙찰가를 표시한다. */
export function WinsPage() {
  const [wins, setWins] = useState<Win[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Win[]>('/me/wins').then(setWins).catch((e) => setError(e.message))
  }, [])

  return (
    <>
      <TopBar title="내 낙찰 물품" backTo="/" />
      {error && <p className="m-5 rounded-lg bg-panel p-4 text-sm text-danger">{error}</p>}
      {wins === null && !error && <p className="p-6 text-sm text-mute">불러오는 중…</p>}
      {wins && (
        <>
          <p className="px-5 pb-2 pt-4 text-[13px] text-sub">총 {wins.length}건 · 최근 낙찰순</p>
          {wins.length === 0 ? (
            <div className="mx-5 mt-4 rounded-[10px] border border-dashed border-[#b4b4b4] p-6 text-center text-[13px] text-sub">
              <p>아직 낙찰받은 물품이 없습니다.</p>
              <Link to="/" className="mt-3 inline-block font-medium text-ink underline">오늘의 경매 보러 가기</Link>
            </div>
          ) : (
            <ul className="px-5">
              {wins.map((w) => (
                <li key={w.id} className="flex gap-3.5 border-b border-line-soft py-3.5">
                  <ItemImage src={w.imageUrl} alt={w.name} className="h-[84px] w-[84px] shrink-0 rounded-lg border border-line" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs text-sub">{w.brandName}</span>
                    <span className="text-[15px] font-medium">{w.name}</span>
                    <span className="tabular text-base font-bold">낙찰가 {won(w.winningPrice)}</span>
                    <span className="tabular text-xs text-mute">{fullDateTime(w.wonAt)} 낙찰</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
