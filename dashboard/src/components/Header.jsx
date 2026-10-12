import { LogOut, ShoppingCart, Radio } from 'lucide-react'

export default function Header({ session, realtimeOk, onLogout }) {
  const email = session?.user?.email || 'usuario'
  const nombre =
    session?.user?.user_metadata?.nombre_completo ||
    email.split('@')[0]

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.25)',
            display: 'grid',
            placeItems: 'center'
          }}
        >
          <ShoppingCart size={26} />
        </div>
        <div>
          <h1>Estación de Autocobro - Telemetría IoT</h1>
          <p>
            Universidad Católica Boliviana &latine; Dashboard en tiempo real
          </p>
        </div>
      </div>

      <div className="header-right">
        <span className="user-chip">
          <span className={`live-dot ${realtimeOk ? '' : 'off'}`} />
          <Radio size={15} />
          {nombre}
        </span>
        <button className="btn-ghost" onClick={onLogout}>
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </div>
    </header>
  )
}
