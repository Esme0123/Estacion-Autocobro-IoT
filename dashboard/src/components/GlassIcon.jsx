import './GlassIcon.css'

export default function GlassIcon({
  icon: Icon,
  children,
  color = 'mint',
  size = 'md',
  className = '',
  label
}) {
  const isNumeric = typeof size === 'number'
  const sizeClass = isNumeric ? '' : `glass-icon-${size}`
  const colorKey = color === 'sunny' ? 'sun' : color
  const colorClass = `glass-icon-${colorKey}`

  const style = isNumeric
    ? {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${Math.round(size * 0.35)}px`
      }
    : undefined

  const iconSize = isNumeric ? Math.round(size * 0.48) : undefined

  return (
    <span
      className={`glass-icon ${colorClass} ${sizeClass}${className ? ` ${className}` : ''}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <span className="glass-icon-sheen" aria-hidden="true" />
      <span className="glass-icon-content" aria-hidden="true">
        {Icon ? <Icon size={iconSize} /> : children}
      </span>
    </span>
  )
}

