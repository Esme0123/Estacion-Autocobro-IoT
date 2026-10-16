import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShoppingCart, LayoutDashboard, Cpu, LogOut, Radio, User, Sliders } from 'lucide-react'

export default function Navbar({ session, role, onLogout, onToggleSimulator, isSimulatorOpen, realtimeOk }) {
  const location = useLocation()
  const isCajero = location.pathname.startsWith('/cajero')
  const isAdmin = location.pathname.startsWith('/admin')

  const userName =
    session?.user?.user_metadata?.nombre_completo ||
    session?.user?.email?.split('@')[0] ||
    (role === 'ADMIN' ? 'Gerente General' : 'Cliente Autocobro')

  return (
    <nav className="main-navbar">
      <Link to="/" className="nav-brand">
        <div className="brand-icon">
          <ShoppingCart size={24} />
        </div>
        <div className="brand-text">
          <h1>Estación Autocobro IoT</h1>
          <p>Universidad Católica Boliviana &bull; IoT</p>
        </div>
      </Link>

      <div className="nav-roles">
        <Link
          to="/cajero"
          className={`role-btn ${isCajero ? 'active' : ''}`}
          title="Flujo Guiado de Compra para el Cliente"
        >
          <ShoppingCart size={16} />
          <span>🛍️ Modo Cajero (Cliente)</span>
        </Link>
        <Link
          to="/admin"
          className={`role-btn ${isAdmin ? 'active' : ''}`}
          title="Gestión de Inventario, Ventas y Telemetría IoT"
        >
          <LayoutDashboard size={16} />
          <span>📊 Modo Gerente (Admin)</span>
        </Link>
      </div>

      <div className="nav-actions">
        <div className="station-pill" title="Estación IoT conectada al ESP32">
          <Cpu size={14} />
          <span>CAJA_IOT_01</span>
        </div>

        <button
          type="button"
          onClick={onToggleSimulator}
          className={`sim-toggle-btn ${isSimulatorOpen ? 'active' : ''}`}
          title="Abrir consola de simulación de sensores ESP32"
        >
          <Sliders size={14} />
          <span>🕹️ Simulador IoT</span>
        </button>

        <div className="user-chip" title={userName}>
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
          <User size={14} />
          <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userName}
          </span>
        </div>

        <button type="button" className="btn-ghost" onClick={onLogout} title="Cerrar Sesión">
          <LogOut size={15} />
          <span>Salir</span>
        </button>
      </div>
    </nav>
  )
}
