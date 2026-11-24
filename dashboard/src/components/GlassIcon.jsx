import './GlassIcon.css'

export default function GlassIcon({
  icon: Icon,
  children,
  color = 'mint',
  size = 'md',
  className = '',
  label
}) {
  return (
    <span
      className={`glass-icon glass-icon-${color} glass-icon-${size}${className ? ` ${className}` : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <span className="glass-icon-sheen" aria-hidden="true" />
      <span className="glass-icon-content" aria-hidden="true">
        {Icon ? <Icon /> : children}
      </span>
    </span>
  )
}
