import { useMemo } from 'react'
import './SplitFlapText.css'

export default function SplitFlapText({
  text = '',
  compact = false,
  size = 'md',
  variant = 'default',
  className = '',
  ariaLabel
}) {
  const value = String(text ?? '').toUpperCase()
  const chars = useMemo(() => Array.from(value), [value])

  return (
    <div
      className={`split-flap split-flap-${variant} split-flap-${size}${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={ariaLabel || value}
      aria-live="polite"
    >
      {chars.map((char, index) => {
        if (char === ' ') {
          return (
            <span
              key={`space-${value}-${index}`}
              className="split-flap-space"
              aria-hidden="true"
            />
          )
        }

        return (
          <span
            key={`${value}-${index}-${char}`}
            className="split-flap-tile"
            style={{ animationDelay: `${index * 28}ms` }}
            aria-hidden="true"
          >
            <span className="split-flap-char">{char}</span>
          </span>
        )
      })}
    </div>
  )
}
