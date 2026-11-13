import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { TopBar } from '../components/TopBar'

const field = 'h-12 rounded-[10px] border border-field px-3.5 text-[15px] outline-none focus:border-ink'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!loginId || !password) {
      setError('아이디와 비밀번호를 입력하세요.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await api('/auth/login', { method: 'POST', json: { loginId, password } })
      navigate(safeNext, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <>
      <TopBar title="로그인" backTo="/" />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 px-6 pt-12">
        <h2 className="text-2xl font-bold leading-[1.35]">
          오늘의 경매에
          <br />
          참여하려면 로그인하세요
        </h2>
        <p className="mb-4 text-sm text-sub">
          {params.get('signedUp') ? '가입이 완료되었습니다. 로그인해 주세요.' : '로그인 후 물품 가격 확인과 입찰을 이용할 수 있습니다.'}
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-id" className="text-[13px] font-medium">아이디</label>
          <input id="login-id" autoComplete="username" placeholder="아이디 입력" value={loginId}
            onChange={(e) => { setLoginId(e.target.value); setError(null) }} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-pw" className="text-[13px] font-medium">비밀번호</label>
          <input id="login-pw" type="password" autoComplete="current-password" placeholder="비밀번호 입력" value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null) }} className={field} />
        </div>
        <p role="alert" className="min-h-[18px] text-[13px] text-danger">{error}</p>

        <button type="submit" disabled={pending} className="h-[52px] rounded-[10px] bg-ink text-base font-medium text-white disabled:opacity-60">
          {pending ? '로그인 중…' : '로그인'}
        </button>

        <div className="mt-2 flex justify-center gap-1.5 text-sm">
          <span className="text-sub">아직 회원이 아니신가요?</span>
          <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium underline">회원가입</Link>
        </div>
      </form>
    </>
  )
}
