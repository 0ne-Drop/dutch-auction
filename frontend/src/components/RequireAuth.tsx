import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useMe } from '../lib/hooks'

/**
 * 로그인 게이트: 로그인하지 않았으면 로그인 페이지로 보내고, 로그인 후 원래 페이지로 돌아오게 한다.
 * 정적 사이트라 서버에서 막을 수 없으므로 화면에서 확인한다. 실제 보호는 API가 401로 한다(가격 데이터는 API가 내려주지 않음).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loaded } = useMe()
  const location = useLocation()
  if (!loaded) return <p className="p-6 text-sm text-mute">불러오는 중…</p>
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <>{children}</>
}
