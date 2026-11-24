import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { supabase, getProductsFromDB, getUserProfileRole } from './supabaseClient'
import Navbar from './components/Navbar'
import AuthScreen from './components/AuthScreen'
import SelfCheckout from './components/SelfCheckout'
import AdminSuite from './components/AdminSuite'
import ManagerStationsView from './components/ManagerStationsView'
import IoTSimulatorDrawer from './components/IoTSimulatorDrawer'
import TutorialModal, { TUTORIAL_STORAGE_KEY } from './components/TutorialModal'
import { ROLE, normalizeRole, getHomePath, isDemoSession } from './utils/roles'

// sessionStorage puede fallar en navegación privada estricta: no debe romper el login.
function tutorialAlreadyShown() {
  try {
    return sessionStorage.getItem(TUTORIAL_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markTutorialAsShown() {
  try {
    sessionStorage.setItem(TUTORIAL_STORAGE_KEY, '1')
  } catch {}
}

function resetTutorialFlag() {
  try {
    sessionStorage.removeItem(TUTORIAL_STORAGE_KEY)
  } catch {}
}

function AppContent({ session, setSession, role, setRole }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [realtimeOk, setRealtimeOk] = useState(false)
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const currentRole = normalizeRole(role)
  const isCliente = currentRole === ROLE.CLIENTE
  const isGerente = currentRole === ROLE.GERENTE
  const isAdmin = currentRole === ROLE.ADMIN

  const reloadProducts = useCallback(async () => {
    const list = await getProductsFromDB()
    setProducts(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    reloadProducts()

    // Suscripción Realtime a cambios en la tabla products
    const channel = supabase
      .channel('app-products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        reloadProducts()
      })
      .subscribe((status) => {
        setRealtimeOk(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [reloadProducts])

  async function handleLogout() {
    try {
      await supabase.auth.signOut()
    } catch {}
    setSession(null)
    setRole(ROLE.CLIENTE)
    setTutorialOpen(false)
    resetTutorialFlag()
    localStorage.removeItem('demo_role')
    localStorage.removeItem('demo_session')
    navigate('/login', { replace: true })
  }

  function handleAuth(newSession, newRole) {
    const isDemo = isDemoSession(newSession)
    const normalized = normalizeRole(newRole || ROLE.CLIENTE)

    setSession(newSession)
    setRole(normalized)
    if (isDemo) {
      localStorage.setItem('demo_session', JSON.stringify(newSession))
      localStorage.setItem('demo_role', normalized)
    } else {
      localStorage.removeItem('demo_session')
      localStorage.removeItem('demo_role')
    }

    // Tutorial automático SOLO para Cliente, una vez por inicio de sesión.
    if (normalized === ROLE.CLIENTE && !tutorialAlreadyShown()) {
      markTutorialAsShown()
      setTutorialOpen(true)
    }

    navigate(getHomePath(normalized), { replace: true })
  }

  // Salvaguarda: el tutorial nunca se muestra a Admin/Gerente.
  useEffect(() => {
    if (!isCliente) setTutorialOpen(false)
  }, [isCliente])

  // Protección estricta de vistas: cada rol queda confinado a su propia ruta,
  // aunque el usuario intente cambiar la URL manualmente.
  useEffect(() => {
    if (!session || location.pathname === '/login') return

    if (isCliente && location.pathname !== '/cajero') {
      navigate('/cajero', { replace: true })
    } else if (isGerente && location.pathname !== '/gerente') {
      navigate('/gerente', { replace: true })
    } else if (isAdmin && !location.pathname.startsWith('/admin')) {
      navigate('/admin', { replace: true })
    }
  }, [session, isCliente, isGerente, isAdmin, location.pathname, navigate])

  function handleShowTutorial() {
    if (isCliente) setTutorialOpen(true)
  }

  // Notificación al emitir una lectura en el simulador
  function handleReadingEmitted() {
    reloadProducts()
  }

  const isLoginPage = location.pathname === '/login'
  const isAdminPage = location.pathname.startsWith('/admin')

  return (
    <div>
      {!isLoginPage && !isAdminPage && (
        <Navbar
          session={session}
          role={currentRole}
          onLogout={handleLogout}
          realtimeOk={realtimeOk}
        />
      )}

      <Routes>
        <Route
          path="/login"
          element={
            session ? (
              <Navigate to={getHomePath(currentRole)} replace />
            ) : (
              <AuthScreen onAuth={handleAuth} />
            )
          }
        />

        <Route
          path="/cajero"
          element={
            !session ? (
              <Navigate to="/login" replace />
            ) : !isCliente ? (
              <Navigate to={getHomePath(currentRole)} replace />
            ) : (
              <SelfCheckout
                products={products}
                onStockUpdated={reloadProducts}
                role={currentRole}
                onShowTutorial={handleShowTutorial}
              />
            )
          }
        />

        <Route
          path="/gerente"
          element={
            !session ? (
              <Navigate to="/login" replace />
            ) : !isGerente ? (
              <Navigate to={getHomePath(currentRole)} replace />
            ) : (
              <ManagerStationsView realtimeOk={realtimeOk} />
            )
          }
        />

        <Route
          path="/admin/*"
          element={
            !session ? (
              <Navigate to="/login" replace />
            ) : !isAdmin ? (
              <Navigate to={getHomePath(currentRole)} replace />
            ) : (
              <AdminSuite
                products={products}
                onProductsChanged={reloadProducts}
                session={session}
                role={currentRole}
                onLogout={handleLogout}
                onToggleSimulator={() => setIsSimulatorOpen(!isSimulatorOpen)}
                isSimulatorOpen={isSimulatorOpen}
                realtimeOk={realtimeOk}
              />
            )
          }
        />

        {/* Redirección por defecto */}
        <Route
          path="*"
          element={<Navigate to={session ? getHomePath(currentRole) : '/login'} replace />}
        />
      </Routes>

      {/* Tutorial de autocobro (solo Cliente, automático o reabierto manualmente) */}
      <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      {/* Consola Flotante de Simulación IoT ESP32 */}
      <IoTSimulatorDrawer
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        products={products}
        onReadingEmitted={handleReadingEmitted}
      />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(ROLE.CLIENTE)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    // 1. Verificar sesión persistente en Supabase Auth
    supabase.auth.getSession().then(async ({ data }) => {
      if (data?.session) {
        if (isDemoSession(data.session)) {
          const storedRole = localStorage.getItem('demo_role')
          setSession(data.session)
          setRole(normalizeRole(storedRole || ROLE.CLIENTE))
        } else {
          // Sesión real Supabase: consultar public.profiles
          const profileRole = await getUserProfileRole(data.session.user.id)
          if (profileRole) {
            setSession(data.session)
            setRole(normalizeRole(profileRole))
          } else {
            console.warn('No se pudo recuperar el perfil del usuario desde public.profiles. Cerrando sesión.')
            try { await supabase.auth.signOut() } catch {}
            setSession(null)
            setRole(ROLE.CLIENTE)
            localStorage.removeItem('demo_role')
            localStorage.removeItem('demo_session')
          }
        }
      } else {
        // Verificar sesión demo previa en localStorage
        const storedDemo = localStorage.getItem('demo_session')
        const storedRole = localStorage.getItem('demo_role')
        if (storedDemo) {
          try {
            setSession(JSON.parse(storedDemo))
            setRole(normalizeRole(storedRole || ROLE.CLIENTE))
          } catch {}
        }
      }
      setInitializing(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (newSession) {
        if (isDemoSession(newSession)) {
          setSession(newSession)
          const storedRole = localStorage.getItem('demo_role')
          setRole(normalizeRole(storedRole || ROLE.CLIENTE))
        } else {
          const profileRole = await getUserProfileRole(newSession.user.id)
          if (profileRole) {
            setSession(newSession)
            setRole(normalizeRole(profileRole))
          } else {
            setSession(null)
            setRole(ROLE.CLIENTE)
          }
        }
      } else {
        setSession(null)
        setRole(ROLE.CLIENTE)
      }
    })

    return () => {
      listener?.subscription?.unsubscribe()
    }
  }, [])

  if (initializing) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontWeight: 600 }}>Iniciando Estación de Autocobro IoT...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <AppContent
        session={session}
        setSession={setSession}
        role={role}
        setRole={setRole}
      />
    </BrowserRouter>
  )
}
