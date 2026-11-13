export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** 같은 도메인의 /api 로 요청 (운영: CloudFront → ALB, 개발: vite 프록시 → Spring Boot) */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? 'ERROR', body.message ?? '요청을 처리하지 못했습니다.')
  }
  return body as T
}

export type ItemStatus = 'listed' | 'sold' | 'unsold'

export interface AuctionSummary {
  id: string
  auctionDate: string
  startsAt: string
  endsAt: string
  brandName: string
}

/** 공개 목록: 가격 정보 없음 */
export interface PublicItem {
  id: string
  name: string
  imageUrl: string
  category: string
  status: ItemStatus
}

export interface TodayResponse {
  auction: AuctionSummary | null
  items: PublicItem[]
  totalItems: number
}

/** 입찰 페이지 상세: 로그인 사용자에게만, 가격 포함 */
export interface ItemDetail extends PublicItem {
  auctionId: string
  brandName: string
  startsAt: string
  endsAt: string
  priceDropIntervalSec: number
  startPrice: number
  minPrice: number
  winningPrice: number | null
  wonAt: string | null
  wonByMe: boolean
}

export interface Upcoming {
  id: string
  auctionDate: string
  startsAt: string
  brandName: string
}

export interface Win {
  id: string
  name: string
  imageUrl: string
  brandName: string
  winningPrice: number
  wonAt: string
}

export interface Me {
  userId: string
  loginId: string
}

export const CATEGORIES = [
  { code: 'outer', label: '아우터' },
  { code: 'top', label: '상의' },
  { code: 'bottom', label: '하의' },
  { code: 'shoes', label: '신발' },
  { code: 'acc', label: '잡화' },
] as const

export const categoryLabel = (code: string | null) => CATEGORIES.find((c) => c.code === code)?.label ?? null
