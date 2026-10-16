import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { supabase, getProductsFromDB, isSupabaseConfigured } from './supabaseClient'
import Navbar from './components/Navbar'
import AuthScreen from './components/AuthScreen'
import SelfCheckout from './components/SelfCheckout'
import AdminSuite from './components/AdminSuite'
import IoTSimulatorDrawer from './components/IoTSimulatorDrawer'

function AppContent({ session, setSession, role, setRole }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [realtimeOk, setRealtimeOk] = useState(false)
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false)

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
    setRole(null)
    localStorage.removeItem('demo_role')
    localStorage.removeItem('demo_session')
    navigate('/login')
  }

  // Notificación al emitir una lectura en el simulador
  function handleReadingEmitted() {
    // Si la lectura afecta el inventario o productos, se recarga
    reloadProducts()
  }

  const isLoginPage = location.pathname === '/login'

  return (
    <div>
      {!isLoginPage && (
        <Navbar
          session={session}
          role={role}
          onLogout={handleLogout}
          onToggleSimulator={() => setIsSimulatorOpen(!isSimulatorOpen)}
          isSimulatorOpen={isSimulatorOpen}
          realtimeOk={realtimeOk}
        />
      )}

      <Routes>
        <Route
          path="/login"
          element={
            session ? (
              <Navigate to={role === 'ADMIN' ? '/admin' : '/cajero'} replace />
            ) : (
              <AuthScreen
                onAuth={(newSession, newRole) => {
                  setSession(newSession)
                  const r = newRole || newSession?.user?.user_metadata?.rol || 'CLIENTE'
                  setRole(r)
                  localStorage.setItem('demo_session', JSON.stringify(newSession))
                  localStorage.setItem('demo_role', r)
                }}
              />
            )
          }
        />

        <Route
          path="/cajero"
          element={
            <SelfCheckout
              products={products}
              onStockUpdated={reloadProducts}
            />
          }
        />

        <Route
          path="/admin"
          element={
            <AdminSuite
              products={products}
              onProductsChanged={reloadProducts}
            />
          }
        />

        {/* Redirección por defecto */}
        <Route
          path="*"
          element={<Navigate to={session ? (role === 'ADMIN' ? '/admin' : '/cajero') : '/login'} replace />}
        />
      </Routes>

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
  const [role, setRole] = useState('CLIENTE')
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    // 1. Verificar sesión persistente en Supabase Auth
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session)
        const userRole = data.session?.user?.user_metadata?.rol || 'CLIENTE'
        setRole(userRole)
      } else {
        // Verificar sesión demo previa en localStorage
        const storedDemo = localStorage.getItem('demo_session')
        const storedRole = localStorage.getItem('demo_role')
        if (storedDemo) {
          try {
            setSession(JSON.parse(storedDemo))
            setRole(storedRole || 'CLIENTE')
          } catch {}
        }
      }
      setInitializing(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        setSession(newSession)
        const userRole = newSession?.user?.user_metadata?.rol || 'CLIENTE'
        setRole(userRole)
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
