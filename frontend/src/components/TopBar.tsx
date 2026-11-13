import { Link } from 'react-router-dom'
import { BackIcon } from './icons'

/** 뒤로 가기 + 제목 헤더 */
export function TopBar({ title, backTo }: { title: string; backTo: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-line bg-white px-2">
      <Link to={backTo} aria-label="뒤로 가기" className="flex h-11 w-11 items-center justify-center">
        <BackIcon />
      </Link>
      <h1 className="text-base font-medium">{title}</h1>
    </header>
  )
}
