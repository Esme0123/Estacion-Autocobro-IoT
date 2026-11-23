import { useState } from 'react'
import { BarChart3, ShoppingCart, LogIn, UserPlus, Shield, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { ROLE, normalizeRole, getHomePath } from '../utils/roles'

const DEMO_USERS = {
  [ROLE.CLIENTE]: { id: 'demo-cliente-id', email: 'cliente@ucb.edu.bo', nombre: 'Cliente Autocobro' },
  [ROLE.GERENTE]: { id: 'demo-gerente-id', email: 'gerente@ucb.edu.bo', nombre: 'Gerente de Cajas' },
  [ROLE.ADMIN]: { id: 'demo-admin-id', email: 'admin@ucb.edu.bo', nombre: 'Administrador General' }
}

export default function AuthScreen({ onAuth }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState(ROLE.CLIENTE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const limpiarMensajes = () => {
    setError('')
    setOk('')
  }

  // Ingreso Rápido para Demostraciones
  function handleQuickDemo(selectedRole) {
    const normalized = normalizeRole(selectedRole)
    const demo = DEMO_USERS[normalized]
    const demoUser = {
      id: demo.id,
      email: demo.email,
      user_metadata: {
        nombre_completo: demo.nombre,
        rol: normalized
      }
    }
    const demoSession = {
      user: demoUser,
      access_token: 'demo-token-' + Date.now()
    }
    onAuth?.(demoSession, normalized)
    navigate(getHomePath(normalized), { replace: true })
  }

  async function handleLogin(e) {
    e.preventDefault()
    limpiarMensajes()
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      setLoading(false)

      if (error) {
        setError('Error al iniciar sesión: ' + error.message)
        return
      }

      const userRole = normalizeRole(data.session?.user?.user_metadata?.rol || ROLE.CLIENTE)
      onAuth?.(data.session, userRole)
      navigate(getHomePath(userRole), { replace: true })
    } catch (err) {
      setLoading(false)
      setError('Excepción en autenticación: ' + err.message)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    limpiarMensajes()
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nombre_completo: nombre, rol }
        }
      })

      setLoading(false)

      if (error) {
        setError('Error al registrar cuenta: ' + error.message)
        return
      }

      if (!data.session) {
        setOk('¡Cuenta creada exitosamente! Revisa tu bandeja para confirmar el correo o ingresa con los botones de demo rápida.')
        setTab('login')
        return
      }

      const normalized = normalizeRole(rol)
      onAuth?.(data.session, normalized)
      navigate(getHomePath(normalized), { replace: true })
    } catch (err) {
      setLoading(false)
      setError('Excepción en registro: ' + err.message)
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-icon" style={{ margin: '0 auto', width: 56, height: 56 }}>
            <ShoppingCart size={30} />
          </div>
          <h1>Estación de Autocobro IoT</h1>
          <p>Universidad Católica Boliviana &bull; Ingeniería de Sistemas</p>
        </div>

        {/* ACCESO RÁPIDO PARA PRESENTACIONES Y EVALUACIÓN */}
        <div className="quick-demo-roles">
          <p>⚡ Acceso Rápido de Evaluación (3 Roles):</p>
          <div className="demo-buttons-grid">
            <button
              type="button"
              className="demo-btn cajero"
              onClick={() => handleQuickDemo(ROLE.CLIENTE)}
              title="Entrar al Flujo Guiado de Autocobro con Balanza Anti-Fraude"
            >
              <ShoppingCart size={18} color="var(--mint-dark)" />
              <span>🛒 Rol Cliente</span>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>Terminal Autocobro</small>
            </button>

            <button
              type="button"
              className="demo-btn gerente"
              onClick={() => handleQuickDemo(ROLE.GERENTE)}
              title="Supervisión en Vivo de Cajas y Sensores IoT"
            >
              <Shield size={18} color="#925d10" />
              <span>🛡️ Rol Gerente</span>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>Supervisión de Cajas</small>
            </button>

            <button
              type="button"
              className="demo-btn admin"
              onClick={() => handleQuickDemo(ROLE.ADMIN)}
              title="Entrar al Panel de Control de Ventas, Inventario y Telemetría IoT"
            >
              <BarChart3 size={18} color="var(--coral)" />
              <span>📊 Rol Admin</span>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>Ventas & Gestión Total</small>
            </button>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <div style={{
            fontSize: 12,
            background: 'var(--cream)',
            border: '1px solid var(--peach)',
            padding: 10,
            borderRadius: 8,
            marginBottom: 16,
            color: '#8c681f'
          }}>
            <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            Conectado a credenciales locales / modo demo.
          </div>
        )}

        <div className="tabs">
          <button
            type="button"
            className={tab === 'login' ? 'active' : ''}
            onClick={() => {
              setTab('login')
              limpiarMensajes()
            }}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            className={tab === 'register' ? 'active' : ''}
            onClick={() => {
              setTab('register')
              limpiarMensajes()
            }}
          >
            Crear Cuenta
          </button>
        </div>

        {error && <div className="alert error">{error}</div>}
        {ok && <div className="alert success">{ok}</div>}

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister}>
          {tab === 'register' && (
            <>
              <div className="field">
                <label htmlFor="nombre">Nombre completo</label>
                <input
                  id="nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Esmeralda Medina"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="rol">Rol del Sistema</label>
                <select
                  id="rol"
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                >
                  <option value="cliente">Cliente (Caja Autocobro)</option>
                  <option value="gerente">Gerente (Supervisión de Cajas)</option>
                  <option value="admin">Admin (Ventas &amp; Gestión Total)</option>
                </select>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@ucb.edu.bo"
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? (
              <span>Autenticando...</span>
            ) : tab === 'login' ? (
              <>
                <LogIn size={17} />
                <span>Ingresar al Sistema</span>
              </>
            ) : (
              <>
                <UserPlus size={17} />
                <span>Registrar Cuenta</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
