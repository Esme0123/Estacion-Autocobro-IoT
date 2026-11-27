import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import AdminSidebar from './AdminSidebar'

// Map route paths to breadcrumb labels
const BREADCRUMBS = {
  '/admin': [{ label: 'Admin' }, { label: 'Resumen' }],
  '/admin/productos': [{ label: 'Admin' }, { label: 'Gestión' }, { label: 'Productos' }],
  '/admin/ventas': [{ label: 'Admin' }, { label: 'Gestión' }, { label: 'Ventas' }],
  '/admin/iot': [{ label: 'Admin' }, { label: 'Monitoreo IoT' }, { label: 'Resumen de Sensores' }],
  '/admin/lecturas': [{ label: 'Admin' }, { label: 'Monitoreo IoT' }, { label: 'Lecturas de Sensores' }]
}

const PAGE_TITLES = {
  '/admin': 'Resumen',
  '/admin/productos': 'Productos',
  '/admin/ventas': 'Ventas',
  '/admin/iot': 'Resumen de Sensores',
  '/admin/lecturas': 'Lecturas de Sensores'
}

export default function AdminLayout({
  children,
  session,
  role,
  onLogout,
  onToggleSimulator,
  isSimulatorOpen,
  realtimeOk
}) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const crumbs = BREADCRUMBS[location.pathname] || [{ label: 'Admin' }]
  const pageTitle = PAGE_TITLES[location.pathname] || 'Admin'

  return (
    <div className={`admin-layout${collapsed ? ' sidebar-is-collapsed' : ''}`}>
      <AdminSidebar
        session={session}
        role={role}
        onLogout={onLogout}
        onToggleSimulator={onToggleSimulator}
        isSimulatorOpen={isSimulatorOpen}
        realtimeOk={realtimeOk}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
      />

      <div className="admin-main">
        {/* Top header */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>

            <div>
              <h1 className="admin-page-title">{pageTitle}</h1>
              <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
                {crumbs.map((crumb, i) => (
                  <span key={i} className="admin-breadcrumb-item">
                    {crumb.label}
                    {i < crumbs.length - 1 && (
                      <span className="admin-breadcrumb-sep">/</span>
                    )}
                  </span>
                ))}
              </nav>
            </div>
          </div>

          <div className="admin-topbar-right">
            <div className="admin-realtime-pill" title="Estado Realtime Supabase">
              <span className={`realtime-dot${realtimeOk ? ' ok' : ''}`} />
              <span>{realtimeOk ? 'Realtime' : 'Polling'}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="admin-content">
          {children}
        </main>
      </div>
    </div>
  )
}
