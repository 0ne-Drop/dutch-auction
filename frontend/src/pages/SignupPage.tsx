import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { TopBar } from '../components/TopBar'

const field = 'h-12 min-w-0 rounded-[10px] border border-field px-3.5 text-[15px] outline-none focus:border-ink'
const LOGIN_ID_RE = /^[A-Za-z0-9]{4,20}$/

type IdCheck = { state: 'idle' } | { state: 'ok'; id: string } | { state: 'error'; message: string }

export function SignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [idCheck, setIdCheck] = useState<IdCheck>({ state: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const mismatch = password2.length > 0 && password !== password2

  async function checkId() {
    if (!LOGIN_ID_RE.test(loginId)) {
      setIdCheck({ state: 'error', message: '아이디는 영문·숫자 4~20자입니다.' })
      return
    }
    try {
      const { available } = await api<{ available: boolean }>(`/auth/check-id?loginId=${encodeURIComponent(loginId)}`)
      setIdCheck(available ? { state: 'ok', id: loginId } : { state: 'error', message: '이미 사용 중인 아이디입니다.' })
    } catch (e) {
      setIdCheck({ state: 'error', message: (e as Error).message })
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!(idCheck.state === 'ok' && idCheck.id === loginId)) return setError('아이디 중복 확인을 해 주세요.')
    if (password.length < 8) return setError('비밀번호는 8자 이상이어야 합니다.')
    if (password !== password2) return setError('비밀번호가 일치하지 않습니다.')
    setPending(true)
    setError(null)
    try {
      await api('/auth/signup', { method: 'POST', json: { loginId, password } })
      const qs = new URLSearchParams({ signedUp: '1', ...(next ? { next } : {}) })
      navigate(`/login?${qs}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <>
      <TopBar title="회원가입" backTo="/login" />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 px-6 pt-8">
        <h2 className="text-[22px] font-bold">아이디와 비밀번호만 있으면 됩니다</h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="su-id" className="text-[13px] font-medium">아이디</label>
          <div className="flex gap-2">
            <input id="su-id" autoComplete="username" placeholder="영문·숫자 4~20자" value={loginId}
              onChange={(e) => { setLoginId(e.target.value.trim()); setIdCheck({ state: 'idle' }); setError(null) }}
              className={`${field} flex-1`} />
            <button type="button" onClick={checkId} className="h-12 shrink-0 rounded-[10px] border border-ink px-3.5 text-sm font-medium">
              중복 확인
            </button>
          </div>
          <p className={`min-h-[18px] text-xs ${idCheck.state === 'error' ? 'text-danger' : 'text-sub'}`} aria-live="polite">
            {idCheck.state === 'ok' && '사용 가능한 아이디입니다.'}
            {idCheck.state === 'error' && idCheck.message}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="su-pw" className="text-[13px] font-medium">비밀번호</label>
          <input id="su-pw" type="password" autoComplete="new-password" placeholder="8자 이상" value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null) }} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="su-pw2" className="text-[13px] font-medium">비밀번호 확인</label>
          <input id="su-pw2" type="password" autoComplete="new-password" placeholder="비밀번호 다시 입력" value={password2}
            onChange={(e) => { setPassword2(e.target.value); setError(null) }} className={field} />
          <p className="min-h-[18px] text-xs text-danger">{mismatch && '비밀번호가 일치하지 않습니다.'}</p>
        </div>

        <p role="alert" className="min-h-[18px] text-[13px] text-danger">{error}</p>
        <button type="submit" disabled={pending} className="h-[52px] rounded-[10px] bg-ink text-base font-medium text-white disabled:opacity-60">
          {pending ? '가입 중…' : '가입하기'}
        </button>
        <p className="text-center text-xs text-mute">가입 후 로그인 화면으로 이동합니다</p>
      </form>
    </>
  )
}
