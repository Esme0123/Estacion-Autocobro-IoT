import { useRef } from 'react'
import './TiltGlare.css'

export default function TiltGlare({
  as: Tag = 'div',
  children,
  className = '',
  maxTilt = 6,
  glare = true
}) {
  const cardRef = useRef(null)

  function handlePointerMove(event) {
    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const tilt = Number(maxTilt) || 6
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))

    card.style.setProperty('--rx', `${((0.5 - y) * tilt).toFixed(2)}deg`)
    card.style.setProperty('--ry', `${((x - 0.5) * tilt).toFixed(2)}deg`)
    card.style.setProperty('--mx', `${(x * 100).toFixed(2)}%`)
    card.style.setProperty('--my', `${(y * 100).toFixed(2)}%`)
  }

  function resetTilt() {
    const card = cardRef.current
    if (!card) return

    card.style.setProperty('--rx', '0deg')
    card.style.setProperty('--ry', '0deg')
    card.style.setProperty('--mx', '50%')
    card.style.setProperty('--my', '50%')
  }

  return (
    <Tag
      ref={cardRef}
      className={`tilt-glare${className ? ` ${className}` : ''}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      {glare && <span className="tilt-glare-light" aria-hidden="true" />}
      {children}
    </Tag>
  )
}
