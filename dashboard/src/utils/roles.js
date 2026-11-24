export const ROLE = {
  CLIENTE: 'cliente',
  GERENTE: 'gerente',
  ADMIN: 'admin'
}

export const ROLE_META = {
  [ROLE.CLIENTE]: {
    label: 'Cliente Autocobro',
    shortLabel: 'Cliente',
    emoji: '🛒',
    home: '/cajero',
    badgeClass: 'role-cliente'
  },
  [ROLE.GERENTE]: {
    label: 'Gerente de Cajas',
    shortLabel: 'Gerente',
    emoji: '🛡️',
    home: '/gerente',
    badgeClass: 'role-gerente'
  },
  [ROLE.ADMIN]: {
    label: 'Administrador',
    shortLabel: 'Admin',
    emoji: '📊',
    home: '/admin',
    badgeClass: 'role-admin'
  }
}

const ADMIN_ALIASES = ['admin', 'administrador', 'direccion', 'dirección']
const GERENTE_ALIASES = ['gerente', 'supervisor', 'supervisor de tienda', 'manager', 'gerente_cajas']

export function normalizeRole(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (ADMIN_ALIASES.includes(raw)) return ROLE.ADMIN
  if (GERENTE_ALIASES.includes(raw)) return ROLE.GERENTE
  return ROLE.CLIENTE
}

export function getRoleMeta(value) {
  return ROLE_META[normalizeRole(value)]
}

export function getHomePath(value) {
  return getRoleMeta(value).home
}

export function isDemoSession(session) {
  const userId = session?.user?.id
  const token = session?.access_token
  return Boolean(
    (typeof userId === 'string' && userId.startsWith('demo-')) ||
    (typeof token === 'string' && token.startsWith('demo-token-'))
  )
}
