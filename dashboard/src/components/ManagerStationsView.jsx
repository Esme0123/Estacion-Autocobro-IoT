import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Cpu,
  DoorClosed,
  Gauge,
  LockKeyhole,
  Power,
  Radio,
  RefreshCw,
  Scale,
  ShieldCheck,
  Unlock,
  Wifi,
  WifiOff
} from 'lucide-react'
import { supabase, getSensorReadingsFromDB } from '../supabaseClient'
import { formatExactDateTimeLaPaz, getRelativeTime } from '../utils/sensorAnalytics'
import SplitFlapText from './SplitFlapText'
import GlassIcon from './GlassIcon'
import TiltGlare from './TiltGlare'
import './ManagerStationsView.css'

const STATION_ID = 'CAJA_IOT_01'

const SENSOR_META = {
  rc522: { label: 'RC522', name: 'Lector RFID', Icon: Radio },
  hx711: { label: 'HX711', name: 'Báscula', Icon: Scale },
  proximidad: { label: 'Proximidad IR', name: 'Proximidad', Icon: Activity },
  magnetico: { label: 'Magnético', name: 'Puerta', Icon: DoorClosed }
}

const STATUS_META = {
  libre: { label: 'Libre', className: 'libre' },
  escaneando: { label: 'Escaneando', className: 'escaneando' },
  alerta: { label: 'Alerta Anti-Fraude', className: 'alerta' },
  pagando: { label: 'Pagando', className: 'pagando' },
  en_espera: { label: 'En espera', className: 'espera' }
}

function normalizeSensorType(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'weight') return 'hx711'
  if (raw === 'infrarrojo' || raw === 'ir') return 'proximidad'
  return raw
}

function buildInitialStations() {
  return [
    {
      id: STATION_ID,
      name: 'Caja 1 · Pasillo Central',
      status: 'libre',
      weight: 0,
      lastTag: null,
      lastActivity: null,
      presence: false,
      doorOpen: false,
      sensors: { rc522: 'activo', hx711: 'activo', proximidad: 'activo', magnetico: 'activo' }
    },
    {
      id: 'CAJA_IOT_02',
      name: 'Caja 2 · Pasillo Lateral',
      status: 'en_espera',
      weight: 0,
      lastTag: null,
      lastActivity: null,
      presence: false,
      doorOpen: false,
      sensors: { rc522: 'espera', hx711: 'espera', proximidad: 'espera', magnetico: 'espera' }
    },
    {
      id: 'CAJA_IOT_03',
      name: 'Caja 3 · Express',
      status: 'en_espera',
      weight: 0,
      lastTag: null,
      lastActivity: null,
      presence: false,
      doorOpen: false,
      sensors: { rc522: 'espera', hx711: 'espera', proximidad: 'espera', magnetico: 'espera' }
    }
  ]
}

function sensorStatusLabel(value) {
  if (value === 'activo') return 'Activo'
  if (value === 'espera') return 'En espera'
  if (value === 'sin_datos') return 'Sin datos'
  return 'Inactivo'
}

function describeReading(reading) {
  const type = normalizeSensorType(reading?.sensor_type)
  const value = parseFloat(reading?.numeric_value ?? 0)

  if (type === 'hx711') return `${value.toFixed(1)} g`
  if (type === 'rc522') return reading?.rfid_uid ? `Tag ${reading.rfid_uid}` : 'Lectura de tag'
  if (type === 'proximidad') return value > 0 ? 'Presencia detectada' : 'Sin presencia'
  if (type === 'magnetico') return value > 0 ? 'Puerta abierta' : 'Puerta cerrada'
  return '—'
}

export default function ManagerStationsView({ realtimeOk }) {
  const [stations, setStations] = useState(buildInitialStations)
  const [readings, setReadings] = useState([])
  const [latestReadings, setLatestReadings] = useState({})
  const [loading, setLoading] = useState(true)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3600)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const applyReading = useCallback((reading, stationId = STATION_ID) => {
    if (!reading) return
    const type = normalizeSensorType(reading.sensor_type)
    if (!type) return

    const value = parseFloat(reading.numeric_value ?? 0)
    const createdAt = reading.created_at || new Date().toISOString()

    setStations((prev) =>
      prev.map((station) => {
        if (station.id !== stationId) return station

        const next = {
          ...station,
          lastActivity: createdAt,
          sensors: { ...station.sensors, [type]: 'activo' }
        }

        if (type === 'hx711') {
          next.weight = Number.isFinite(value) ? value : 0
          if (station.status !== 'alerta') {
            next.status = next.weight > 0 ? 'escaneando' : station.status === 'pagando' ? 'pagando' : 'libre'
          }
        }

        if (type === 'rc522') {
          if (reading.rfid_uid) next.lastTag = reading.rfid_uid
          if (station.status !== 'alerta' && station.status !== 'pagando') {
            next.status = 'escaneando'
          }
        }

        if (type === 'proximidad') next.presence = value > 0
        if (type === 'magnetico') next.doorOpen = value > 0

        return next
      })
    )
  }, [])

  const loadFeed = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSensorReadingsFromDB(40)
      const list = Array.isArray(data) ? data : []

      setReadings(list)

      const latest = {}
      list.forEach((reading) => {
        const type = normalizeSensorType(reading.sensor_type)
        if (type && !latest[type]) latest[type] = reading
      })
      setLatestReadings(latest)

      // Aplicar de más antiguo a más reciente para que gane la última lectura.
      ;[...list].reverse().forEach((reading) => applyReading(reading))
    } finally {
      setLoading(false)
    }
  }, [applyReading])

  useEffect(() => {
    loadFeed()

    const channel = supabase
      .channel('manager-stations-live-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings' },
        (payload) => {
          const reading = payload.new
          if (!reading) return

          setReadings((prev) => [reading, ...prev.filter((item) => item.id !== reading.id)].slice(0, 40))

          const type = normalizeSensorType(reading.sensor_type)
          if (type) {
            setLatestReadings((prev) => ({ ...prev, [type]: reading }))
          }

          applyReading(reading)
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadFeed, applyReading])

  // Polling de respaldo si Realtime no está disponible.
  useEffect(() => {
    if (realtimeConnected) return
    const interval = setInterval(() => loadFeed(), 30000)
    return () => clearInterval(interval)
  }, [realtimeConnected, loadFeed])

  const summary = useMemo(() => {
    return stations.reduce(
      (acc, station) => {
        if (station.status === 'alerta') acc.alerts += 1
        if (station.status === 'libre') acc.free += 1
        if (station.status === 'escaneando' || station.status === 'pagando') acc.busy += 1
        return acc
      },
      { alerts: 0, free: 0, busy: 0 }
    )
  }, [stations])

  function updateStation(id, updater) {
    setStations((prev) => prev.map((station) => (station.id === id ? updater(station) : station)))
  }

  function handleUnlock(id) {
    updateStation(id, (station) => ({ ...station, status: 'libre', weight: 0 }))
    showToast(`🔓 ${id}: caja autorizada y desbloqueada`)
  }

  function handleTare(id) {
    updateStation(id, (station) => ({
      ...station,
      weight: 0,
      status: station.status === 'alerta' ? 'alerta' : 'libre'
    }))
    showToast(`⚖️ ${id}: báscula tarada remotamente a 0 g`)
  }

  function handleRestart(id) {
    updateStation(id, (station) => ({
      ...station,
      status: 'libre',
      weight: 0,
      lastTag: null,
      presence: false,
      doorOpen: false,
      sensors:
        station.id === STATION_ID
          ? { rc522: 'activo', hx711: 'activo', proximidad: 'activo', magnetico: 'activo' }
          : { rc522: 'espera', hx711: 'espera', proximidad: 'espera', magnetico: 'espera' }
    }))
    showToast(`🔄 ${id}: estación reiniciada correctamente`)
  }

  function handleSimulateAlert(id) {
    updateStation(id, (station) => ({
      ...station,
      status: 'alerta',
      weight: Math.max(0, Number(station.weight) || 0) + 45
    }))
    showToast(`⚠️ ${id}: alerta anti-fraude simulada (+45 g)`, 'error')
  }

  return (
    <div className="manager-screen">
      <div className="manager-view">
      <header className="manager-header">
        <div className="manager-hero">
          <GlassIcon color="mint" size="lg" icon={ShieldCheck} label="Supervisión de cajas" />
          <div className="manager-hero-copy">
            <span className="manager-eyebrow">Gerente de Cajas · Supervisión operativa</span>
            <h1>Supervisión de Cajas en Vivo</h1>
            <p>
              Monitoreo de estaciones de autocobro, básculas HX711, tags RFID y sensores de salida.
              Sin acceso a reportes financieros ni métricas ejecutivas de ventas.
            </p>
          </div>
        </div>

        <div className="manager-header-actions">
          <div className="manager-summary-pills">
            <span className="manager-summary-pill free">
              <span className="summary-dot" />
              {summary.free} libres
            </span>
            <span className="manager-summary-pill busy">
              <span className="summary-dot" />
              {summary.busy} activas
            </span>
            <span className="manager-summary-pill alert">
              <span className="summary-dot" />
              {summary.alerts} alertas
            </span>
          </div>

          <span className={`manager-realtime ${realtimeConnected || realtimeOk ? 'on' : 'off'}`}>
            <span className="realtime-dot" />
            {realtimeConnected || realtimeOk ? <Wifi size={14} /> : <WifiOff size={14} />}
            {realtimeConnected || realtimeOk ? 'Tiempo real' : 'Polling'}
          </span>

          <button
            type="button"
            className="manager-refresh-btn"
            onClick={loadFeed}
            disabled={loading}
            title="Actualizar lecturas de sensores"
          >
            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
            <span>{loading ? 'Actualizando...' : 'Actualizar'}</span>
          </button>
        </div>
      </header>

      {toast && (
        <div className={`manager-toast ${toast.type}`}>
          {toast.type === 'error' ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}
          <span>{toast.message}</span>
        </div>
      )}

      <section className="manager-stations-grid" aria-label="Estaciones de autocobro">
        {stations.map((station) => {
          const statusMeta = STATUS_META[station.status] || STATUS_META.libre
          const isAlert = station.status === 'alerta'
          const tone = isAlert ? 'coral' : station.status === 'libre' ? 'mint' : 'peach'
          const glassColor = tone

          return (
            <TiltGlare
              as="article"
              key={station.id}
              className={`station-card status-${statusMeta.className} tone-${tone}`}
              maxTilt={6}
            >
              <header className="station-card-header">
                <div className="station-title">
                  <GlassIcon color={glassColor} size="md" icon={Cpu} label={`Estación ${station.id}`} />
                  <div>
                    <h2>{station.id}</h2>
                    <p>{station.name}</p>
                  </div>
                </div>
                <span className={`station-status ${statusMeta.className}`}>
                  {isAlert ? <AlertTriangle size={12} /> : <Gauge size={12} />}
                  {statusMeta.label}
                </span>
              </header>

              <div className="station-metrics">
                <div className="station-metric metric-flap">
                  <span>Peso en báscula</span>
                  <SplitFlapText
                    text={`${station.weight.toFixed(1)} G`}
                    size="sm"
                    variant="mint"
                    ariaLabel={`Peso en báscula: ${station.weight.toFixed(1)} gramos`}
                  />
                </div>
                <div className="station-metric metric-flap">
                  <span>Último tag RFID</span>
                  <SplitFlapText
                    text={station.lastTag || 'SIN TAG'}
                    size="sm"
                    variant="sunny"
                    ariaLabel={`Último tag RFID: ${station.lastTag || 'sin tag'}`}
                  />
                </div>
                <div className="station-metric">
                  <span>Presencia / Puerta</span>
                  <strong>
                    {station.presence ? 'Cliente detectado' : 'Sin presencia'} ·{' '}
                    {station.doorOpen ? 'Puerta abierta' : 'Puerta cerrada'}
                  </strong>
                </div>
                <div className="station-metric">
                  <span>Última actividad</span>
                  <strong>{station.lastActivity ? getRelativeTime(station.lastActivity) : 'Sin eventos'}</strong>
                </div>
              </div>

              <div className="station-sensors">
                {Object.entries(SENSOR_META).map(([type, meta]) => {
                  const Icon = meta.Icon
                  const sensorState = station.sensors[type] || 'sin_datos'
                  return (
                    <span key={type} className={`sensor-chip ${sensorState}`} title={`${meta.name}: ${sensorStatusLabel(sensorState)}`}>
                      <span className="sensor-dot" />
                      <Icon size={13} />
                      <span>{meta.label}</span>
                      <small>{sensorStatusLabel(sensorState)}</small>
                    </span>
                  )
                })}
              </div>

              <div className="station-actions">
                <button
                  type="button"
                  className="station-action unlock"
                  onClick={() => handleUnlock(station.id)}
                  disabled={!isAlert}
                  title={isAlert ? 'Autorizar y desbloquear la caja' : 'Solo disponible durante una alerta'}
                >
                  <Unlock size={14} />
                  <span>Autorizar / Desbloquear</span>
                </button>
                <button
                  type="button"
                  className="station-action tare"
                  onClick={() => handleTare(station.id)}
                  title="Tarar la báscula HX711 remotamente"
                >
                  <Scale size={14} />
                  <span>Tarar Báscula</span>
                </button>
                <button
                  type="button"
                  className="station-action restart"
                  onClick={() => handleRestart(station.id)}
                  title="Reiniciar la estación y sus sensores"
                >
                  <Power size={14} />
                  <span>Reiniciar Estación</span>
                </button>
                <button
                  type="button"
                  className="station-action danger"
                  onClick={() => handleSimulateAlert(station.id)}
                  title="Simular una alerta de peso para la demostración"
                >
                  <LockKeyhole size={14} />
                  <span>Simular Alerta</span>
                </button>
              </div>
            </TiltGlare>
          )
        })}
      </section>

      <section className="manager-feed" aria-label="Feed técnico de sensores">
        <div className="manager-feed-header">
          <div className="manager-feed-title">
            <GlassIcon color="coral" size="md" icon={Activity} label="Feed técnico de sensores" />
            <div>
              <h2>Lecturas de Sensores · Feed Técnico</h2>
              <p>
                Últimas transmisiones de los sensores físicos de la estación.
                {latestReadings.hx711 && (
                  <> Peso actual: <strong>{parseFloat(latestReadings.hx711.numeric_value ?? 0).toFixed(1)} g</strong>.</>
                )}
              </p>
            </div>
          </div>
          <div className="manager-feed-actions">
            <span className="manager-feed-count">{readings.length} eventos</span>
            <button
              type="button"
              className="manager-refresh-btn"
              onClick={loadFeed}
              disabled={loading}
              title="Refrescar feed técnico"
            >
              <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
              <span>Refrescar</span>
            </button>
          </div>
        </div>

        <div className="manager-table-wrapper">
          <table className="manager-table">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Estación</th>
                <th>Sensor</th>
                <th>Lectura / Evento</th>
                <th>Recencia</th>
              </tr>
            </thead>
            <tbody>
              {readings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="manager-table-empty">
                    No se registran lecturas de sensores todavía.
                  </td>
                </tr>
              ) : (
                readings.slice(0, 15).map((reading, index) => {
                  const type = normalizeSensorType(reading.sensor_type)
                  const meta = SENSOR_META[type]
                  return (
                    <tr key={reading.id || `${reading.created_at}-${index}`}>
                      <td>{reading.created_at ? formatExactDateTimeLaPaz(reading.created_at) : '—'}</td>
                      <td>
                        <code>{STATION_ID}</code>
                      </td>
                      <td>
                        <span className={`feed-sensor ${type || 'unknown'}`}>
                          <span className="feed-sensor-dot" />
                          {meta ? meta.name : reading.sensor_type || 'Sensor'}
                        </span>
                      </td>
                      <td>{describeReading(reading)}</td>
                      <td>{reading.created_at ? getRelativeTime(reading.created_at) : '—'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </div>
  )
}
