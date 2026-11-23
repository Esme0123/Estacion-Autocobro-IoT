import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Receipt,
  Cpu,
  Activity,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  LogOut,
  Sliders,
  X
} from 'lucide-react'

// Navigation structure
const NAV = [
  {
    section: 'General',
    items: [
      { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true }
    ]
  },
  {
    section: 'Gestión',
    items: [
      { to: '/admin/productos', label: 'Productos', icon: Package },
      { to: '/admin/ventas', label: 'Ventas', icon: Receipt }
    ]
  },
  {
    section: 'Monitoreo IoT',
    items: [
      { to: '/admin/iot', label: 'Resumen de Sensores', icon: Cpu },
      { to: '/admin/lecturas', label: 'Lecturas de Sensores', icon: Activity }
    ]
  }
]

function NavItem({ item, collapsed }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `admin-sidebar-item${isActive ? ' active' : ''}`
      }
    >
      <Icon size={18} className="sidebar-icon" />
      {!collapsed && <span className="sidebar-label">{item.label}</span>}
    </NavLink>
  )
}

export default function AdminSidebar({
  session,
  role,
  onLogout,
  onToggleSimulator,
  isSimulatorOpen,
  realtimeOk,
  mobileOpen,
  onMobileClose,
  collapsed,
  onToggleCollapse
}) {
  const userName =
    session?.user?.user_metadata?.nombre_completo ||
    session?.user?.email?.split('@')[0] ||
    (role === 'ADMIN' ? 'Gerente General' : 'Administrador')

  const userInitial = userName.charAt(0).toUpperCase()

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'admin-sidebar',
          collapsed ? 'collapsed' : '',
          mobileOpen ? 'mobile-open' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Logo / App Name */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <ShoppingCart size={20} />
            </div>
            {!collapsed && (
              <div className="sidebar-logo-text">
                <span className="sidebar-app-name">Autocobro IoT</span>
                <span className="sidebar-app-sub">UCB · Panel Admin</span>
              </div>
            )}
          </div>

          {/* Mobile close button */}
          <button
            type="button"
            className="sidebar-mobile-close"
            onClick={onMobileClose}
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV.map((group) => (
            <div key={group.section} className="sidebar-group">
              {!collapsed && (
                <span className="sidebar-section-label">{group.section}</span>
              )}
              {group.items.map((item) => (
                <NavItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        {/* IoT Simulator button */}
        <div className="sidebar-tools">
          <button
            type="button"
            onClick={onToggleSimulator}
            title={collapsed ? 'Simulador IoT' : undefined}
            className={`sidebar-tool-btn${isSimulatorOpen ? ' active' : ''}`}
          >
            <Sliders size={16} />
            {!collapsed && <span>Simulador IoT</span>}
          </button>
        </div>

        {/* Profile + Logout */}
        <div className="sidebar-footer">
          <div
            className="sidebar-user"
            title={collapsed ? userName : undefined}
          >
            <div className="sidebar-avatar">{userInitial}</div>
            {!collapsed && (
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{userName}</span>
                <span className="sidebar-user-role">
                  {realtimeOk ? '● En línea' : '○ Sin realtime'}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onLogout}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className="sidebar-logout-btn"
          >
            <LogOut size={15} />
            {!collapsed && <span>Salir</span>}
          </button>
        </div>

        {/* Collapse toggle — desktop only */}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>
    </>
  )
}
