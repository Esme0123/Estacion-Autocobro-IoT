import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Scale,
  Activity,
  DoorClosed,
  Radio,
  RefreshCw,
  Cpu,
  CheckCircle,
  AlertTriangle,
  MinusCircle,
  XCircle,
  ShieldCheck,
  ArrowRight,
  Clock,
  ChevronRight
} from 'lucide-react'
import { supabase } from '../../supabaseClient'
import {
  DEFAULT_SENSOR_DEVICES,
  getSensorHealth,
  parseProximityState,
  parseMagneticState,
  getReadingDetails,
  formatExactDateTimeLaPaz,
  getRelativeTime
} from '../../utils/sensorAnalytics'

export default function IoTResumen({ readings: initialReadings = [], onRefresh, loadingReadings }) {
  const [devices, setDevices] = useState(DEFAULT_SENSOR_DEVICES)
  const [latestReadings, setLatestReadings] = useState({})
  const [recentEvents, setRecentEvents] = useState([])
  const [loading, setLoading] = useState(true)

  // -------------------------------------------------------------
  // CARGA DE DISPOSITIVOS REGISTRADOS (sensor_devices)
  // -------------------------------------------------------------
  const loadDevices = useCallback(async () => {
    try {
      const res = await supabase.from('sensor_devices').select('*').order('id', { ascending: true })
      if (!res.error && res.data && res.data.length > 0) {
        return res.data
      }
    } catch (e) {}
    return DEFAULT_SENSOR_DEVICES
  }, [])

  // -------------------------------------------------------------
  // CARGA DEL ÚLTIMO ESTADO POR SENSOR
  // -------------------------------------------------------------
  const loadLatestStates = useCallback(async (currentDevices) => {
    const latestMap = {}

    await Promise.all(
      currentDevices.map(async (dev) => {
        try {
          const res = await supabase
            .from('sensor_readings')
            .select('*')
            .eq('sensor_type', dev.sensor_type)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!res.error && res.data) {
            latestMap[dev.sensor_type] = res.data
          }
        } catch (e) {}
      })
    )

    // Fallback local si faltan datos
    try {
      const local = JSON.parse(localStorage.getItem('local_readings') || '[]')
      currentDevices.forEach((dev) => {
        if (!latestMap[dev.sensor_type]) {
          const match = local.find((r) => r.sensor_type === dev.sensor_type)
          if (match) latestMap[dev.sensor_type] = match
        }
      })
    } catch (e) {}

    return latestMap
  }, [])

  // -------------------------------------------------------------
  // CARGA DE LOS ÚLTIMOS 10 EVENTOS UNIFICADOS
  // -------------------------------------------------------------
  const loadRecentEvents = useCallback(async () => {
    try {
      const res = await supabase
        .from('sensor_readings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (!res.error && res.data && res.data.length > 0) {
        return res.data
      }
    } catch (e) {}

    // Fallback a lecturas pasadas por props o local
    try {
      const local = JSON.parse(localStorage.getItem('local_readings') || '[]')
      if (local.length > 0) {
        return local
          .slice()
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)
      }
    } catch (e) {}

    return initialReadings.slice(0, 10)
  }, [initialReadings])

  // -------------------------------------------------------------
  // DISPATCHER PRINCIPAL
  // -------------------------------------------------------------
  const reloadData = useCallback(async () => {
    setLoading(true)
    try {
      const devList = await loadDevices()
      setDevices(devList)

      const [latestMap, eventsList] = await Promise.all([
        loadLatestStates(devList),
        loadRecentEvents()
      ])

      setLatestReadings(latestMap)
      setRecentEvents(eventsList)
    } catch (err) {
      console.error('Error cargando resumen de sensores:', err)
    } finally {
      setLoading(false)
    }
  }, [loadDevices, loadLatestStates, loadRecentEvents])

  useEffect(() => {
    reloadData()
  }, [reloadData])

  // -------------------------------------------------------------
  // SUSCRIPCIÓN EN TIEMPO REAL
  // -------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('iot-resumen-realtime-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_readings' }, (payload) => {
        const newReading = payload.new
        if (!newReading) return

        // Actualizar último estado del sensor
        if (newReading.sensor_type) {
          setLatestReadings((prev) => ({
            ...prev,
            [newReading.sensor_type]: newReading
          }))
        }

        // Agregar a la lista de actividad reciente (máximo 10)
        setRecentEvents((prev) => [newReading, ...prev.filter((r) => r.id !== newReading.id)].slice(0, 10))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // -------------------------------------------------------------
  // RESUMEN COMPACTO DEL SISTEMA
  // -------------------------------------------------------------
  const summaryCounts = useMemo(() => {
    const totalDevices = devices.length
    let enabledDevices = 0
    let recentlyActiveDevices = 0
    let inactiveOrNoDataDevices = 0

    devices.forEach((dev) => {
      const isEnabled = dev.active !== false
      if (isEnabled) enabledDevices++

      const latest = latestReadings[dev.sensor_type]
      const health = getSensorHealth(dev, latest)

      if (health.key === 'activo') {
        recentlyActiveDevices++
      } else if (health.key === 'sin_actividad' || health.key === 'sin_datos') {
        inactiveOrNoDataDevices++
      }
    })

    return {
      totalDevices,
      enabledDevices,
      recentlyActiveDevices,
      inactiveOrNoDataDevices
    }
  }, [devices, latestReadings])

  return (
    <div className="sensor-readings-dashboard">
      {/* =========================================================
          HEADER & CONTROLES
         ========================================================= */}
      <div className="resumen-top-bar">
        <div className="resumen-title-group">
          <h1>Resumen de Sensores</h1>
          <p>Supervisión del estado operacional y comunicación de los dispositivos IoT en la estación.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={reloadData}
            disabled={loading}
            title="Refrescar estado de sensores"
            style={{ fontSize: 12, padding: '7px 14px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
            <span>{loading ? 'Cargando...' : 'Actualizar'}</span>
          </button>

          <Link
            to="/admin/lecturas"
            className="btn-primary"
            style={{ width: 'auto', padding: '8px 16px', fontSize: 13, borderRadius: 'var(--radius-sm)' }}
          >
            <span>Ver análisis detallado</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* =========================================================
          RESUMEN COMPACTO (4 MÉTRICAS DE HARDWARE)
         ========================================================= */}
      <div className="metric-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="pastel-metric-card peach">
          <div className="metric-info">
            <h3>Dispositivos Registrados</h3>
            <p>{summaryCounts.totalDevices}</p>
          </div>
          <Cpu size={32} color="#925d10" />
        </div>

        <div className="pastel-metric-card mint">
          <div className="metric-info">
            <h3>Dispositivos Habilitados</h3>
            <p>{summaryCounts.enabledDevices}</p>
          </div>
          <CheckCircle size={32} color="var(--mint-dark)" />
        </div>

        <div className="pastel-metric-card mint">
          <div className="metric-info">
            <h3>Recientemente Activos (&lt; 24h)</h3>
            <p>{summaryCounts.recentlyActiveDevices}</p>
          </div>
          <Activity size={32} color="var(--mint-dark)" />
        </div>

        <div className="pastel-metric-card coral">
          <div className="metric-info">
            <h3>Sin Datos o Inactivos</h3>
            <p>{summaryCounts.inactiveOrNoDataDevices}</p>
          </div>
          <AlertTriangle size={32} color="var(--coral-dark)" />
        </div>
      </div>

      {/* =========================================================
          CUATRO TARJETAS COMPACTAS DE SENSORES
         ========================================================= */}
      <div className="iot-sensors-grid">
        {devices.map((dev) => {
          const latest = latestReadings[dev.sensor_type]
          const health = getSensorHealth(dev, latest)

          let IconComponent = Activity
          let iconColor = 'var(--mint-dark)'
          let stateLabel = 'Sin datos'
          let stateColor = 'var(--muted)'

          if (dev.sensor_type === 'hx711' || dev.sensor_type === 'weight') {
            IconComponent = Scale
            iconColor = '#925d10'
            stateLabel = latest ? `${parseFloat(latest.numeric_value ?? 0).toFixed(1)} ${latest.metadata?.unit || 'g'}` : 'Sin datos'
            stateColor = '#925d10'
          } else if (dev.sensor_type === 'proximidad') {
            IconComponent = Activity
            iconColor = 'var(--mint-dark)'
            const p = parseProximityState(latest)
            stateLabel = latest ? p.label : 'Sin datos'
            stateColor = p.isPresent ? '#0d5442' : 'var(--muted)'
          } else if (dev.sensor_type === 'magnetico') {
            IconComponent = DoorClosed
            iconColor = 'var(--coral-dark)'
            const m = parseMagneticState(latest)
            stateLabel = latest ? m.label : 'Sin datos'
            stateColor = m.isOpen ? 'var(--coral-dark)' : '#0d5442'
          } else if (dev.sensor_type === 'rc522') {
            IconComponent = Radio
            iconColor = '#8c681f'
            stateLabel = latest ? 'Lectura de tag registrada' : 'Sin datos'
            stateColor = '#8c681f'
          }

          return (
            <div key={dev.id || dev.sensor_type} className="sensor-card" style={{ background: '#fff' }}>
              <div>
                <div className="sensor-card-top">
                  <div className="sensor-card-name">
                    <IconComponent size={18} color={iconColor} />
                    <span>{dev.name || dev.sensor_type}</span>
                  </div>
                  <span className={health.className}>{health.label}</span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Estado configurado:</span>
                  <strong style={{ color: dev.active !== false ? 'var(--mint-dark)' : 'var(--coral-dark)' }}>
                    {dev.active !== false ? 'Habilitado' : 'Deshabilitado'}
                  </strong>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)' }}>
                  Última Lectura / Estado
                </span>
                <div className="sensor-card-value" style={{ color: stateColor, fontWeight: 800 }}>
                  {stateLabel}
                </div>
              </div>

              <div className="sensor-card-times">
                <span className="relative">⏱ {latest ? getRelativeTime(latest.created_at) : 'Sin eventos'}</span>
                <span>Exacta: {latest ? formatExactDateTimeLaPaz(latest.created_at) : '—'}</span>
              </div>

              <div style={{ paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                <Link
                  to={`/admin/lecturas?sensor=${dev.sensor_type}`}
                  className="btn-ghost"
                  style={{ width: '100%', justifyContent: 'center', fontSize: 11, padding: '6px 10px', fontWeight: 700 }}
                >
                  <span>Ver historial en Lecturas</span>
                  <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {/* =========================================================
          TABLA UNIFICADA DE ACTIVIDAD RECIENTE (ÚLTIMOS 8-10 EVENTOS)
         ========================================================= */}
      <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: 22, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="var(--coral)" />
              Actividad Reciente Unificada (Últimos {recentEvents.length} eventos en vivo)
            </h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0 0 0' }}>
              Transmisiones registradas en tiempo real a través de todos los sensores físicos conectados.
            </p>
          </div>

          <Link
            to="/admin/lecturas"
            className="btn-ghost"
            style={{ fontSize: 12, fontWeight: 700 }}
          >
            <span>Ver historial completo y análisis</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        <div className="data-table-wrapper" style={{ boxShadow: 'none' }}>
          <table className="custom-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Fecha / Hora (La Paz)</th>
                <th>Dispositivo</th>
                <th>Sensor</th>
                <th>Estado / Evento</th>
                <th>Valor Numérico</th>
                <th>Unidad</th>
                <th>Recencia</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                    No se han registrado eventos recientes en la estación.
                  </td>
                </tr>
              ) : (
                recentEvents.map((r, i) => {
                  const details = getReadingDetails(r)
                  return (
                    <tr key={r.id || i}>
                      <td>
                        <strong>{details.exactTime}</strong>
                      </td>
                      <td>
                        <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                          {details.deviceId}
                        </code>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background:
                              details.sensorType === 'rc522'
                                ? 'var(--cream)'
                                : details.sensorType === 'hx711'
                                  ? 'var(--peach-light)'
                                  : details.sensorType === 'magnetico'
                                    ? 'var(--coral-light)'
                                    : 'var(--mint-light)',
                            color:
                              details.sensorType === 'rc522'
                                ? '#8c681f'
                                : details.sensorType === 'hx711'
                                  ? '#925d10'
                                  : details.sensorType === 'magnetico'
                                    ? 'var(--coral-dark)'
                                    : 'var(--mint-dark)'
                          }}
                        >
                          {details.sensorName}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{details.eventState}</span>
                      </td>
                      <td>
                        <strong>{details.displayValue}</strong>
                      </td>
                      <td>
                        <span style={{ color: 'var(--muted)' }}>{details.displayUnit}</span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 11 }}>
                        ⏱ {details.relativeTime}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
