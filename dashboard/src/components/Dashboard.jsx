import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Cpu, RefreshCw, Wifi } from 'lucide-react'
import { supabase } from '../supabaseClient'
import Header from './Header'
import MetricCards from './MetricCards'
import WeightChart from './WeightChart'
import ReadingsTable from './ReadingsTable'

const LIMITE = 15

export default function Dashboard({ session }) {
  const [lecturas, setLecturas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [realtimeOk, setRealtimeOk] = useState(false)
  const [error, setError] = useState('')
  const channelRef = useRef(null)

  const cargarLecturas = useCallback(async () => {
    const { data, error } = await supabase
      .from('lecturas_iot')
      .select('*, estaciones_autocobro(codigo_estacion, ubicacion)')
      .order('created_at', { ascending: false })
      .limit(LIMITE)

    if (error) {
      setError(error.message)
      setCargando(false)
      return
    }
    setError('')
    setLecturas(data || [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargarLecturas()

    // Suscripción en vivo a nuevas lecturas del nodo ESP32
    const channel = supabase
      .channel('lecturas-iot-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings' }
        (payload) => {
          setLecturas((prev) => [payload.new, ...prev].slice(0, LIMITE))
        }
      )
      .subscribe((status) => {
        setRealtimeOk(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    // Respaldo por polling cada 10 s por si Realtime no está habilitado
    const intervalo = setInterval(cargarLecturas, 10000)

    return () => {
      clearInterval(intervalo)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [cargarLecturas])

  async function cerrarSesion() {
    await supabase.auth.signOut()
    window.location.reload()
  }

  const ultima = lecturas[0]

  return (
    <div className="app-shell">
      <Header
        session={session}
        realtimeOk={realtimeOk}
        onLogout={cerrarSesion}
      />

      {error && (
        <div className="config-warning">
          No se pudieron cargar las lecturas: {error}
        </div>
      )}

      <MetricCards ultima={ultima} />

      <div className="main-grid">
        <WeightChart lecturas={lecturas} />

        <section className="panel">
          <h2>
            <Cpu size={19} /> Estado del Sistema
          </h2>
          <ul className="info-list">
            <li>
              <span className="muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <Wifi size={15} /> Realtime
              </span>
              <span className={`status-pill ${realtimeOk ? '' : 'error'}`}>
                {realtimeOk ? 'Conectado' : 'Polling'}
              </span>
            </li>
            <li>
              <span className="muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <Activity size={15} /> Lecturas cargadas
              </span>
              <strong>{lecturas.length}</strong>
            </li>
            <li>
              <span className="muted">Última validación</span>
              <span
                className={`status-pill ${
                  ultima?.estado_validacion === 'CORRECTO'
                    ? ''
                    : ultima?.estado_validacion?.startsWith('ERROR')
                      ? 'error'
                      : 'wait'
                }`}
              >
                {ultima?.estado_validacion || 'Sin datos'}
              </span>
            </li>
            <li>
              <span className="muted">Estación</span>
              <strong>
                {ultima?.estaciones_autocobro?.codigo_estacion || 'CAJA_IOT_01'}
              </strong>
            </li>
          </ul>

          <button
            className="btn-primary"
            style={{ marginTop: 18 }}
            onClick={cargarLecturas}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <RefreshCw size={16} /> Actualizar ahora
            </span>
          </button>
        </section>
      </div>

      <ReadingsTable lecturas={lecturas} cargando={cargando} />
    </div>
  )
}
