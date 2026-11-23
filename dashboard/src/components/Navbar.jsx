import { Link } from 'react-router-dom'
import { ShoppingCart, Cpu, LogOut } from 'lucide-react'
import { getRoleMeta } from '../utils/roles'

export default function Navbar({ session, role, onLogout, realtimeOk }) {
  const roleMeta = getRoleMeta(role)
  const userName =
    session?.user?.user_metadata?.nombre_completo ||
    session?.user?.email?.split('@')[0] ||
    roleMeta.label

  return (
    <nav className="main-navbar">
      <Link to={roleMeta.home} className="nav-brand">
        <div className="brand-icon">
          <ShoppingCart size={24} />
        </div>
        <div className="brand-text">
          <h1>Estación Autocobro IoT</h1>
          <p>Universidad Católica Boliviana &bull; IoT</p>
        </div>
      </Link>

      <div className="nav-actions">
        <span
          className={`role-badge ${roleMeta.badgeClass}`}
          title={`Rol actual: ${roleMeta.label}${userName ? ` · ${userName}` : ''}`}
        >
          <span className="role-badge-emoji">{roleMeta.emoji}</span>
          <span>{roleMeta.label}</span>
        </span>

        <div className="station-pill" title="Estación IoT asignada al ESP32">
          <span
            className={`live-dot ${realtimeOk ? '' : 'off'}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: realtimeOk ? 'var(--mint)' : 'var(--coral)',
              display: 'inline-block'
            }}
          />
          <Cpu size={14} />
          <span>CAJA_IOT_01</span>
        </div>

        <button type="button" className="btn-ghost" onClick={onLogout} title="Cerrar Sesión">
          <LogOut size={15} />
          <span>Salir</span>
        </button>
      </div>
    </nav>
  )
}
