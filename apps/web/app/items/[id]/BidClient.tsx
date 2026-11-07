"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Item } from "@/lib/api";
import { hms, ms, priceAt, won } from "@/lib/price";
import { useAuctionEvents, useServerNow } from "@/lib/hooks";
import { ItemImage } from "@/components/ItemImage";
import { BackIcon } from "@/components/icons";

type Result = { kind: "won"; price: number } | { kind: "lost"; message: string } | null;

export function BidClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const now = useServerNow(200);
  const [item, setItem] = useState<Item | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const load = useCallback(async () => {
    try {
      setItem(await api<Item>(`/items/${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/items/${id}`)}`);
        return;
      }
      setLoadError((e as Error).message);
    }
  }, [id, router]);
  useEffect(() => {
    load();
  }, [load]);

  useAuctionEvents(item?.auctionId, (ev) => {
    if (ev.type === "sold" && ev.itemId === id) {
      setItem((it) => (it ? { ...it, status: "sold", winningPrice: ev.winningPrice, wonAt: ev.wonAt } : it));
    }
    if (ev.type === "ended" && ev.unsoldItemIds.includes(id)) {
      setItem((it) => (it ? { ...it, status: "unsold" } : it));
    }
  });

  if (loadError) {
    return (
      <>
        <Header title="경매 물품" />
        <p className="m-5 rounded-lg bg-panel p-4 text-sm text-danger">{loadError}</p>
      </>
    );
  }
  if (!item) {
    return (
      <>
        <Header title="" />
        <p className="p-6 text-sm text-mute">불러오는 중…</p>
      </>
    );
  }

  const startsAt = new Date(item.startsAt).getTime();
  const endsAt = new Date(item.endsAt).getTime();
  const t = now ?? startsAt - 1;
  const phase = t < startsAt ? "before" : t < endsAt ? "live" : "ended";
  const current = priceAt(item.startPrice, item.minPrice, startsAt, t);
  const shownPrice = item.status === "sold" && item.winningPrice !== null ? item.winningPrice : current;
  const dropRatio = (item.startPrice - shownPrice) / (item.startPrice - item.minPrice);
  const canBid = item.status === "listed" && phase === "live" && now !== null && !pending;

  const badge =
    item.status === "sold" ? "낙찰 완료" : item.status === "unsold" ? "유찰" : phase === "before" ? "시작 전" : phase === "live" ? "진행 중" : "종료";

  async function bid() {
    if (!canBid) return;
    setPending(true);
    try {
      const res = await api<{ winningPrice: number; wonAt: string }>(`/items/${id}/bid`, { method: "POST" });
      setItem((it) => (it ? { ...it, status: "sold", winningPrice: res.winningPrice, wonAt: res.wonAt, wonByMe: true } : it));
      setResult({ kind: "won", price: res.winningPrice });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/items/${id}`)}`);
        return;
      }
      setResult({ kind: "lost", message: (e as Error).message });
      load();
    } finally {
      setPending(false);
    }
  }

  let cta: string;
  if (pending) cta = "낙찰 처리 중…";
  else if (item.status === "sold") cta = item.wonByMe ? "내가 낙찰받은 물품입니다" : "다른 사용자가 낙찰받았습니다";
  else if (item.status === "unsold") cta = "유찰된 물품입니다";
  else if (phase === "before") cta = `시작 전 · 시작가 ${won(item.startPrice)}`;
  else if (phase === "ended") cta = "경매가 종료되었습니다";
  else cta = `${won(current)}에 지금 낙찰받기`;

  return (
    <>
      <Header title={item.brandName} />

      <div className="relative aspect-[390/300] w-full shrink-0 overflow-hidden border-b border-line">
        <ItemImage src={item.imageUrl} alt={item.name} className="h-full w-full" />
      </div>

      <div className="flex flex-col gap-3.5 px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{item.name}</h2>
          <span className="shrink-0 rounded-full border border-ink px-2.5 py-1 text-xs font-medium">{badge}</span>
        </div>

        <div className="flex flex-col gap-2.5 rounded-xl border border-line p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-sub">{item.status === "sold" ? "낙찰가" : "현재가"}</span>
            <span className="tabular text-[30px] font-bold" aria-live="off">{won(shownPrice)}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded bg-[#e6e6e6]"
            role="progressbar"
            aria-label="시작가 대비 하락 정도"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(dropRatio * 100)}
          >
            <div className="h-2 bg-sub transition-[width] duration-200" style={{ width: `${Math.min(100, dropRatio * 100)}%` }} />
          </div>
          <div className="tabular flex justify-between text-xs text-sub">
            <span>최소 입찰가 {won(item.minPrice)}</span>
            <span>시작가 {won(item.startPrice)}</span>
          </div>
        </div>

        <div className="rounded-[10px] bg-panel p-3">
          <p className="text-xs text-sub">{phase === "before" ? "시작까지" : "남은 시간"}</p>
          <p className="tabular text-xl font-bold">
            {now === null ? "--:--" : phase === "before" ? hms(startsAt - t) : phase === "live" ? ms(endsAt - t) : "00:00"}
          </p>
        </div>

        {result?.kind === "lost" && (
          <p role="alert" className="rounded-[10px] border border-danger/40 bg-[#fdf2f1] p-3 text-[13px] text-danger">
            {result.message}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-line bg-white px-5 pb-6 pt-3">
        <button
          type="button"
          onClick={bid}
          disabled={!canBid}
          className="tabular h-14 rounded-xl bg-ink text-[17px] font-bold text-white disabled:bg-[#9a9a9a]"
        >
          {cta}
        </button>
        <p className="text-center text-xs text-mute">누르는 순간의 가격으로 즉시 낙찰됩니다. 가장 먼저 누른 1명만 낙찰됩니다.</p>
      </div>

      {result?.kind === "won" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" role="dialog" aria-modal="true" aria-labelledby="won-title">
          <div className="w-full max-w-[340px] rounded-2xl bg-white p-6 text-center">
            <p id="won-title" className="text-lg font-bold">낙찰되었습니다</p>
            <p className="mt-1 text-sm text-sub">{item.name}</p>
            <p className="tabular mt-4 text-3xl font-bold">{won(result.price)}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Link href="/wins" className="flex h-12 items-center justify-center rounded-[10px] bg-ink font-medium text-white">
                내 낙찰 물품 보기
              </Link>
              <button type="button" onClick={() => setResult(null)} className="h-12 rounded-[10px] border border-line font-medium">
                계속 둘러보기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-line bg-white px-2">
      <Link href="/" aria-label="홈으로" className="flex h-11 w-11 items-center justify-center">
        <BackIcon />
      </Link>
      <h1 className="text-base font-medium">{title}</h1>
    </header>
  );
}
