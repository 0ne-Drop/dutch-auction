import { useState } from 'react'

/** 물품 이미지. 불러오지 못하면 회색 자리 표시로 대체 */
export function ItemImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-ph text-xs text-mute ${className}`} role="img" aria-label={alt}>
        이미지 없음
      </div>
    )
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={`bg-ph object-cover ${className}`} />
}
