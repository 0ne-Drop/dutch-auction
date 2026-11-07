export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? "ERROR", body.message ?? "요청을 처리하지 못했습니다.");
  }
  return body as T;
}

export type ItemStatus = "listed" | "sold" | "unsold";

export interface AuctionSummary {
  id: string;
  auctionDate: string;
  startsAt: string;
  endsAt: string;
  brandName: string;
}

export interface Item {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
  startPrice: number;
  minPrice: number;
  status: ItemStatus;
  auctionId: string;
  startsAt: string;
  endsAt: string;
  brandName: string;
  winningPrice: number | null;
  wonAt: string | null;
  wonByMe?: boolean;
}

export interface TodayResponse {
  auction: AuctionSummary | null;
  items: Item[];
  totalItems?: number;
}

export interface Upcoming {
  id: string;
  auctionDate: string;
  startsAt: string;
  brandName: string;
}

export interface Win {
  id: string;
  name: string;
  imageUrl: string;
  brandName: string;
  winningPrice: number;
  wonAt: string;
}

export const CATEGORIES = [
  { code: "outer", label: "아우터" },
  { code: "top", label: "상의" },
  { code: "bottom", label: "하의" },
  { code: "shoes", label: "신발" },
  { code: "acc", label: "잡화" },
] as const;

export const categoryLabel = (code: string | null) =>
  CATEGORIES.find((c) => c.code === code)?.label ?? null;
