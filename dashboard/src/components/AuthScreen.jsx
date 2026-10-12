import { useState } from 'react'
import { ShoppingCart, LogIn, UserPlus } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../supabaseClient'

export default function AuthScreen({ onAuth }) {
  const [tab, setTab] = useState('login')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState('CLIENTE')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const limpiarMensajes = () => {
    setError('')
    setOk('')
  }

  async function handleLogin(e) {
    e.preventDefault()
    limpiarMensajes()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    setLoading(false)
    if (error) {
      setError('Error al iniciar sesión: ' + error.message)
      return
    }
    onAuth?.(data.session)
  }

  async function handleRegister(e) {
    e.preventDefault()
    limpiarMensajes()
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre_completo: nombre, rol }
      }
    })
    setLoading(false)
    if (error) {
      setError('Error al crear la cuenta: ' + error.message)
      return
    }
    if (!data.session) {
      setOk('Cuenta creada. Revisa tu correo para confirmar el registro.')
      setTab('login')
      return
    }
    onAuth?.(data.session)
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark">
            <ShoppingCart size={26} />
          </div>
          <div>
            <h1>Estación de Autocobro IoT</h1>
            <p className="subtitle" style={{ margin: 0 }}>
              Universidad Católica Boliviana &middot; IoT
            </p>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <div className="config-warning">
            Configura tus credenciales en <code>.env</code> (VITE_SUPABASE_URL y
            VITE_SUPABASE_ANON_KEY).
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
                <label htmlFor="rol">Rol</label>
                <select
                  id="rol"
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                >
                  <option value="CLIENTE">Cliente</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="ADMIN">Administrador</option>
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
              <span className="spinner" style={{ margin: '0 auto' }} />
            ) : tab === 'login' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <LogIn size={17} /> Ingresar al Dashboard
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <UserPlus size={17} /> Registrar cuenta
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
