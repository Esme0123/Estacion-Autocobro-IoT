import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Activity,
  Cpu,
  RefreshCw,
  Scale,
  DoorClosed,
  Radio,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  MinusCircle,
  XCircle,
  Info,
  TrendingUp,
  BarChart2,
  Sliders,
  ShieldCheck,
  Maximize2,
  Layers,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react'
import {
  Chart as ChartJS,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

import { supabase } from '../../supabaseClient'
import {
  TIMEZONE,
  DEFAULT_SENSOR_DEVICES,
  getSensorPeriodRange,
  getSensorHealth,
  calculateWeightStats,
  buildWeightTimelineChart,
  buildWeightDistributionChart,
  parseProximityState,
  calculateProximityStats,
  buildProximityTimelineChart,
  buildProximityHourlyBars,
  parseMagneticState,
  calculateMagneticStats,
  buildMagneticTimelineChart,
  buildMagneticChangesBar,
  calculateRfidStats,
  buildRfidHourlyBarChart,
  buildRfidActivityTimelineChart,
  getReadingDetails,
  formatExactDateTimeLaPaz,
  getRelativeTime
} from '../../utils/sensorAnalytics'

ChartJS.register(
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
)

const ITEMS_PER_PAGE = 10

export default function SensorReadingsPage({ readings: initialReadings = [], onRefresh, loadingReadings }) {
  const [searchParams, setSearchParams] = useSearchParams()

  // --------------------------------------------------------------------------
  // 1. ESTADO DE FILTROS: PERÍODO Y TIPO DE SENSOR
  // --------------------------------------------------------------------------
  const [periodPreset, setPeriodPreset] = useState('24_HORAS') // '24_HORAS' | '7_DIAS' | '30_DIAS' | 'PERSONALIZADO'
  const [sensorFilter, setSensorFilter] = useState(() => searchParams.get('sensor') || 'todos')

  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0])
  const [appliedCustomStart, setAppliedCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [appliedCustomEnd, setAppliedCustomEnd] = useState(() => new Date().toISOString().split('T')[0])

  // Estado de paginación para la tabla de lecturas
  const [tablePage, setTablePage] = useState(1)

  // Sincronizar parámetro URL si cambia
  useEffect(() => {
    const param = searchParams.get('sensor')
    if (param && ['hx711', 'proximidad', 'magnetico', 'rc522'].includes(param)) {
      setSensorFilter(param)
    }
  }, [searchParams])

  const handleSensorFilterChange = (type) => {
    setSensorFilter(type)
    setTablePage(1)
    if (type === 'todos') {
      searchParams.delete('sensor')
      setSearchParams(searchParams)
    } else {
      setSearchParams({ sensor: type })
    }
  }

  // Período activo calculado
  const activePeriod = useMemo(() => {
    return getSensorPeriodRange(
      periodPreset,
      periodPreset === 'PERSONALIZADO' ? appliedCustomStart : null,
      periodPreset === 'PERSONALIZADO' ? appliedCustomEnd : null
    )
  }, [periodPreset, appliedCustomStart, appliedCustomEnd])

  // Reset de página si cambia el período
  useEffect(() => {
    setTablePage(1)
  }, [periodPreset, appliedCustomStart, appliedCustomEnd])

  // --------------------------------------------------------------------------
  // 2. ESTADO DE DISPOSITIVOS Y LECTURAS
  // --------------------------------------------------------------------------
  const [devices, setDevices] = useState(DEFAULT_SENSOR_DEVICES)
  const [latestReadings, setLatestReadings] = useState({}) // { [sensor_type]: reading }
  const [historicalReadings, setHistoricalReadings] = useState([]) // Lecturas dentro del período
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // --------------------------------------------------------------------------
  // CARGA DE DISPOSITIVOS REGISTRADOS (sensor_devices)
  // --------------------------------------------------------------------------
  const loadDevices = useCallback(async () => {
    try {
      const res = await supabase.from('sensor_devices').select('*').order('id', { ascending: true })
      if (!res.error && res.data && res.data.length > 0) {
        return res.data
      }
    } catch (e) {}
    return DEFAULT_SENSOR_DEVICES
  }, [])

  // --------------------------------------------------------------------------
  // CARGA DEL ÚLTIMO ESTADO CONOCIDO (INDEPENDIENTE DEL FILTRO DE FECHAS)
  // --------------------------------------------------------------------------
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

    // Fallback a lecturas locales si faltan datos
    try {
      const local = JSON.parse(localStorage.getItem('local_readings') || '[]')
      currentDevices.forEach((dev) => {
        if (!latestMap[dev.sensor_type]) {
          const match = local.find(
            (r) =>
              r.sensor_type === dev.sensor_type ||
              String(r.device_id) === String(dev.id) ||
              String(r.device_id) === String(dev.sensor_type)
          )
          if (match) latestMap[dev.sensor_type] = match
        }
      })
    } catch (e) {}

    return latestMap
  }, [])

  // --------------------------------------------------------------------------
  // CARGA DE LECTURAS HISTÓRICAS PARA EL PERÍODO SELECCIONADO
  // --------------------------------------------------------------------------
  const loadHistoricalData = useCallback(async (periodStart, periodEnd) => {
    try {
      const res = await supabase
        .from('sensor_readings')
        .select('*')
        .gte('created_at', periodStart.toISOString())
        .lt('created_at', periodEnd.toISOString())
        .order('created_at', { ascending: false }) // Newest first
        .limit(1000)

      if (!res.error && res.data) {
        return res.data
      }
    } catch (e) {}

    // Fallback local
    try {
      const local = JSON.parse(localStorage.getItem('local_readings') || '[]')
      const pStart = periodStart.getTime()
      const pEnd = periodEnd.getTime()
      return local
        .filter((r) => {
          const t = new Date(r.created_at).getTime()
          return t >= pStart && t < pEnd
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } catch (e) {
      return []
    }
  }, [])

  // --------------------------------------------------------------------------
  // DISPATCHER PRINCIPAL DE CARGA
  // --------------------------------------------------------------------------
  const reloadAll = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')

    try {
      const devList = await loadDevices()
      setDevices(devList)

      const [latestMap, historyList] = await Promise.all([
        loadLatestStates(devList),
        loadHistoricalData(activePeriod.start, activePeriod.end)
      ])

      setLatestReadings(latestMap)
      setHistoricalReadings(historyList)
    } catch (err) {
      console.error('Error cargando lecturas de sensores:', err)
      setErrorMsg('No se pudieron obtener todas las lecturas del servidor.')
    } finally {
      setLoading(false)
    }
  }, [loadDevices, loadLatestStates, loadHistoricalData, activePeriod])

  useEffect(() => {
    reloadAll()
  }, [reloadAll])

  // --------------------------------------------------------------------------
  // 3. SUSCRIPCIÓN EN TIEMPO REAL (SUPABASE REALTIME)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('sensor-readings-page-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_readings' }, (payload) => {
        const newReading = payload.new
        if (!newReading) return

        // 1. Actualizar inmediatamente el último estado del sensor correspondiente
        const type = newReading.sensor_type
        if (type) {
          setLatestReadings((prev) => ({
            ...prev,
            [type]: newReading
          }))
        }

        // 2. Si la nueva lectura cae dentro del período histórico actual, integrarla al inicio (newest first)
        const t = new Date(newReading.created_at).getTime()
        if (t >= activePeriod.start.getTime() && t < activePeriod.end.getTime()) {
          setHistoricalReadings((prev) => [newReading, ...prev.filter((r) => r.id !== newReading.id)])
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activePeriod])

  // --------------------------------------------------------------------------
  // AGRUPACIÓN DE LECTURAS HISTÓRICAS POR DISPOSITIVO/TIPO
  // --------------------------------------------------------------------------
  const readingsBySensor = useMemo(() => {
    const map = {
      hx711: [],
      proximidad: [],
      magnetico: [],
      rc522: []
    }

    historicalReadings.forEach((r) => {
      const type = (r.sensor_type || '').toLowerCase()
      if (type === 'hx711' || type === 'weight') {
        map.hx711.push(r)
      } else if (type === 'proximidad') {
        map.proximidad.push(r)
      } else if (type === 'magnetico') {
        map.magnetico.push(r)
      } else if (type === 'rc522') {
        map.rc522.push(r)
      }
    })

    return map
  }, [historicalReadings])

  // --------------------------------------------------------------------------
  // TABLA DE LECTURAS FILTRADA Y PAGINADA (NEWEST FIRST)
  // --------------------------------------------------------------------------
  const filteredTableReadings = useMemo(() => {
    if (sensorFilter === 'todos') {
      return historicalReadings
    }
    return historicalReadings.filter((r) => {
      const type = (r.sensor_type || '').toLowerCase()
      if (sensorFilter === 'hx711') return type === 'hx711' || type === 'weight'
      return type === sensorFilter
    })
  }, [historicalReadings, sensorFilter])

  const totalTablePages = useMemo(() => {
    return Math.ceil(filteredTableReadings.length / ITEMS_PER_PAGE) || 1
  }, [filteredTableReadings])

  const pagedTableReadings = useMemo(() => {
    const startIndex = (tablePage - 1) * ITEMS_PER_PAGE
    return filteredTableReadings.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredTableReadings, tablePage])

  // --------------------------------------------------------------------------
  // ESTADO GENERAL DEL SISTEMA (CONTEO DE ESTADOS DE SALUD)
  // --------------------------------------------------------------------------
  const systemHealthSummary = useMemo(() => {
    const counts = {
      activo: 0,
      sin_actividad: 0,
      sin_datos: 0,
      deshabilitado: 0
    }

    devices.forEach((dev) => {
      const latest = latestReadings[dev.sensor_type]
      const health = getSensorHealth(dev, latest)
      if (counts[health.key] !== undefined) {
        counts[health.key]++
      }
    })

    return counts
  }, [devices, latestReadings])

  // --------------------------------------------------------------------------
  // CÁLCULOS ANALÍTICOS Y GRÁFICOS POR SENSOR
  // --------------------------------------------------------------------------

  // A. Balanza HX711
  const hx711Device = devices.find((d) => d.sensor_type === 'hx711') || {
    id: 1,
    name: 'Balanza',
    sensor_type: 'hx711',
    active: true
  }
  const hx711Latest = latestReadings.hx711
  const hx711Health = getSensorHealth(hx711Device, hx711Latest)
  const hx711Stats = useMemo(() => calculateWeightStats(readingsBySensor.hx711), [readingsBySensor.hx711])
  const hx711TimelineChart = useMemo(() => buildWeightTimelineChart(readingsBySensor.hx711), [readingsBySensor.hx711])
  const hx711DistChart = useMemo(() => buildWeightDistributionChart(readingsBySensor.hx711), [readingsBySensor.hx711])

  // B. Sensor de Proximidad
  const proxDevice = devices.find((d) => d.sensor_type === 'proximidad') || {
    id: 2,
    name: 'Sensor de Proximidad',
    sensor_type: 'proximidad',
    active: true
  }
  const proxLatest = latestReadings.proximidad
  const proxHealth = getSensorHealth(proxDevice, proxLatest)
  const proxState = parseProximityState(proxLatest)
  const proxStats = useMemo(() => calculateProximityStats(readingsBySensor.proximidad), [readingsBySensor.proximidad])
  const proxTimelineChart = useMemo(() => buildProximityTimelineChart(readingsBySensor.proximidad), [readingsBySensor.proximidad])
  const proxHourlyBars = useMemo(() => buildProximityHourlyBars(readingsBySensor.proximidad), [readingsBySensor.proximidad])

  // C. Sensor Magnético (Puerta)
  const magDevice = devices.find((d) => d.sensor_type === 'magnetico') || {
    id: 3,
    name: 'Sensor Magnético',
    sensor_type: 'magnetico',
    active: true
  }
  const magLatest = latestReadings.magnetico
  const magHealth = getSensorHealth(magDevice, magLatest)
  const magState = parseMagneticState(magLatest)
  const magStats = useMemo(() => calculateMagneticStats(readingsBySensor.magnetico), [readingsBySensor.magnetico])
  const magTimelineChart = useMemo(() => buildMagneticTimelineChart(readingsBySensor.magnetico), [readingsBySensor.magnetico])
  const magChangesBar = useMemo(() => buildMagneticChangesBar(readingsBySensor.magnetico, activePeriod.grouping), [readingsBySensor.magnetico, activePeriod.grouping])

  // D. Lector RFID RC522
  const rfidDevice = devices.find((d) => d.sensor_type === 'rc522') || {
    id: 4,
    name: 'Lector RFID',
    sensor_type: 'rc522',
    active: true
  }
  const rfidLatest = latestReadings.rc522
  const rfidHealth = getSensorHealth(rfidDevice, rfidLatest)
  const rfidStats = useMemo(() => {
    const diffHours = (activePeriod.end.getTime() - activePeriod.start.getTime()) / (1000 * 60 * 60)
    return calculateRfidStats(readingsBySensor.rc522, diffHours)
  }, [readingsBySensor.rc522, activePeriod])
  const rfidHourlyBars = useMemo(() => buildRfidHourlyBarChart(readingsBySensor.rc522, activePeriod.grouping), [readingsBySensor.rc522, activePeriod.grouping])
  const rfidActivityTimeline = useMemo(() => buildRfidActivityTimelineChart(readingsBySensor.rc522), [readingsBySensor.rc522])

  // Manejador del rango personalizado
  const handleApplyCustomDates = (e) => {
    e.preventDefault()
    if (!customStart || !customEnd) return
    if (customStart > customEnd) {
      alert('La fecha inicial no puede ser posterior a la fecha final.')
      return
    }
    setAppliedCustomStart(customStart)
    setAppliedCustomEnd(customEnd)
    setPeriodPreset('PERSONALIZADO')
  }

  // --------------------------------------------------------------------------
  // RENDERIZADO PRINCIPAL
  // --------------------------------------------------------------------------
  return (
    <div className="sensor-readings-dashboard">
      {/* ======================================================================
          1. HEADER Y SELECTOR DE PERÍODO + FILTRO DE SENSOR
         ====================================================================== */}
      <div className="resumen-top-bar">
        <div className="resumen-title-group">
          <h1>Lecturas de sensores</h1>
          <p>Monitoreo detallado y análisis del comportamiento de los dispositivos.</p>
        </div>

        <div className="resumen-actions-group">
          {/* Controles de período histórico */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="resumen-date-presets" role="group" aria-label="Selector de período histórico">
              <button
                type="button"
                className={`resumen-preset-pill ${periodPreset === '24_HORAS' ? 'active' : ''}`}
                onClick={() => setPeriodPreset('24_HORAS')}
              >
                Últimas 24 horas
              </button>
              <button
                type="button"
                className={`resumen-preset-pill ${periodPreset === '7_DIAS' ? 'active' : ''}`}
                onClick={() => setPeriodPreset('7_DIAS')}
              >
                Últimos 7 días
              </button>
              <button
                type="button"
                className={`resumen-preset-pill ${periodPreset === '30_DIAS' ? 'active' : ''}`}
                onClick={() => setPeriodPreset('30_DIAS')}
              >
                Últimos 30 días
              </button>
              <button
                type="button"
                className={`resumen-preset-pill ${periodPreset === 'PERSONALIZADO' ? 'active' : ''}`}
                onClick={() => setPeriodPreset('PERSONALIZADO')}
              >
                Personalizado
              </button>
            </div>

            <button
              type="button"
              className="btn-ghost"
              onClick={reloadAll}
              disabled={loading}
              title="Refrescar telemetría en tiempo real"
              style={{ fontSize: 12, padding: '7px 12px' }}
            >
              <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
              <span>{loading ? 'Cargando...' : 'Actualizar'}</span>
            </button>
          </div>

          {/* Filtro por tipo de sensor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Filter size={12} />
              Filtrar sensor:
            </span>
            <div className="sensor-type-filters" role="group" aria-label="Filtro por tipo de sensor">
              <button
                type="button"
                className={`sensor-type-pill ${sensorFilter === 'todos' ? 'active' : ''}`}
                onClick={() => handleSensorFilterChange('todos')}
              >
                Todos
              </button>
              <button
                type="button"
                className={`sensor-type-pill ${sensorFilter === 'hx711' ? 'active' : ''}`}
                onClick={() => handleSensorFilterChange('hx711')}
              >
                Balanza (HX711)
              </button>
              <button
                type="button"
                className={`sensor-type-pill ${sensorFilter === 'proximidad' ? 'active' : ''}`}
                onClick={() => handleSensorFilterChange('proximidad')}
              >
                Proximidad
              </button>
              <button
                type="button"
                className={`sensor-type-pill ${sensorFilter === 'magnetico' ? 'active' : ''}`}
                onClick={() => handleSensorFilterChange('magnetico')}
              >
                Magnético (Puerta)
              </button>
              <button
                type="button"
                className={`sensor-type-pill ${sensorFilter === 'rc522' ? 'active' : ''}`}
                onClick={() => handleSensorFilterChange('rc522')}
              >
                RFID (RC522)
              </button>
            </div>
          </div>

          {periodPreset === 'PERSONALIZADO' && (
            <form onSubmit={handleApplyCustomDates} className="resumen-custom-date-box" style={{ marginTop: 6 }}>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Desde:</span>
              <input
                type="date"
                required
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Hasta:</span>
              <input
                type="date"
                required
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
              <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '5px 14px' }}>
                Aplicar
              </button>
            </form>
          )}

          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Calendar size={12} color="var(--peach)" />
            <span>
              Período histórico: <strong>{activePeriod.label}</strong> (Los estados en vivo y última marca de tiempo no se filtran)
            </span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: '10px 16px', background: 'var(--coral-light)', color: 'var(--coral-dark)', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          {errorMsg}
        </div>
      )}

      {/* ======================================================================
          BARRA DE ESTADO GENERAL DEL SISTEMA
         ====================================================================== */}
      <div className="sensor-system-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={20} color="var(--mint-dark)" />
          <div>
            <strong style={{ fontSize: 13, color: 'var(--ink)', display: 'block' }}>Estado Global del Hardware IoT</strong>
            <small style={{ color: 'var(--muted)', fontSize: 11 }}>
              Evaluación de 4 dispositivos físicos conectados a la estación
            </small>
          </div>
        </div>

        <div className="sensor-health-summary">
          <span className="health-summary-pill active" title="Transmisión recibida en las últimas 24 horas">
            <CheckCircle size={12} />
            <span>{systemHealthSummary.activo} Activo(s)</span>
          </span>

          <span className="health-summary-pill stale" title="Configurado activo pero sin eventos en más de 24 horas">
            <AlertTriangle size={12} />
            <span>{systemHealthSummary.sin_actividad} Sin actividad reciente</span>
          </span>

          <span className="health-summary-pill nodata" title="Aún no existen registros para el sensor">
            <MinusCircle size={12} />
            <span>{systemHealthSummary.sin_datos} Sin datos</span>
          </span>

          <span className="health-summary-pill disabled" title="Sensor desactivado en sensor_devices">
            <XCircle size={12} />
            <span>{systemHealthSummary.deshabilitado} Deshabilitado</span>
          </span>
        </div>
      </div>

      {/* ======================================================================
          2. SECCIÓN A: BALANZA — HX711 (SI CORRESPONDE AL FILTRO)
         ====================================================================== */}
      {(sensorFilter === 'todos' || sensorFilter === 'hx711') && (
        <section className="sensor-device-section hx711" id="sensor-hx711">
          <div className="sensor-section-header">
            <div className="sensor-title-row">
              <div className="sensor-icon-box hx711">
                <Scale size={24} />
              </div>
              <div className="sensor-info-header">
                <h2>
                  Balanza — HX711
                  <small style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>(Celda de carga)</small>
                </h2>
                <p>Mide la masa total colocada sobre la bandeja de pesaje anti-fraude del kiosko.</p>
              </div>
            </div>

            <div className="sensor-status-badges">
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: '#f8fafc', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                Config: {hx711Device.active !== false ? 'Habilitado' : 'Deshabilitado'}
              </span>
              <span className={hx711Health.className}>
                {hx711Health.label}
              </span>
            </div>
          </div>

          {/* Tarjeta de Estado Actual */}
          <div className="sensor-state-banner">
            <div className="state-item">
              <span className="state-label">Último Peso Medido</span>
              <div className="state-value-primary" style={{ color: '#925d10' }}>
                {hx711Latest ? `${parseFloat(hx711Latest.numeric_value ?? 0).toFixed(1)} ${hx711Latest.metadata?.unit || 'g'}` : 'Sin datos'}
              </div>
            </div>

            <div className="state-item">
              <span className="state-label">Última Transmisión</span>
              <div className="state-time-exact">
                {hx711Latest ? formatExactDateTimeLaPaz(hx711Latest.created_at) : '—'}
              </div>
              <div className="state-time-relative">
                ⏱ {hx711Latest ? getRelativeTime(hx711Latest.created_at) : 'Sin eventos'}
              </div>
            </div>

            <div className="state-item">
              <span className="state-label">Salud de Comunicación</span>
              <span className={hx711Health.className} style={{ width: 'fit-content' }}>
                {hx711Health.description}
              </span>
            </div>

            <div className="state-item">
              <span className="state-label">Mapeo de Hardware</span>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                {hx711Device.gpio || 'GPIO 4 (DT) / GPIO 5 (SCK)'}
              </div>
            </div>
          </div>

          {/* Gráficos Históricos Balanza */}
          <div className="sensor-charts-grid">
            {/* Gráfico 1: Evolución del peso */}
            <div className="sensor-chart-card">
              <div className="sensor-chart-header">
                <h3>
                  <TrendingUp size={15} color="#de7272" />
                  1. Evolución del peso en el tiempo
                </h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{readingsBySensor.hx711.length} eventos</span>
              </div>

              <div className="sensor-chart-box">
                {!hx711TimelineChart.hasData ? (
                  <div className="sensor-chart-empty">
                    <Scale size={28} color="#cbd5e1" />
                    <p>No se registran eventos de pesaje en el período seleccionado.</p>
                  </div>
                ) : (
                  <Line
                    data={{
                      labels: hx711TimelineChart.labels,
                      datasets: hx711TimelineChart.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            title: (ctx) => hx711TimelineChart.fullTimestamps[ctx[0].dataIndex] || '',
                            label: (ctx) => {
                              const val = ctx.parsed.y
                              const unit = hx711TimelineChart.units[ctx.dataIndex] || 'g'
                              return `Peso medido: ${val.toFixed(1)} ${unit}`
                            }
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: { callback: (v) => `${v} g` },
                          grid: { color: 'rgba(0,0,0,0.05)' }
                        },
                        x: {
                          grid: { display: false },
                          ticks: { maxRotation: 45, minRotation: 0 }
                        }
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {/* Gráfico 2: Distribución de mediciones */}
            <div className="sensor-chart-card">
              <div className="sensor-chart-header">
                <h3>
                  <BarChart2 size={15} color="#925d10" />
                  2. Distribución de mediciones (Rangos de peso)
                </h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Histograma</span>
              </div>

              <div className="sensor-chart-box">
                {!hx711DistChart.hasData ? (
                  <div className="sensor-chart-empty">
                    <BarChart2 size={28} color="#cbd5e1" />
                    <p>Datos insuficientes para generar el histograma de pesos.</p>
                  </div>
                ) : (
                  <Bar
                    data={{
                      labels: hx711DistChart.labels,
                      datasets: hx711DistChart.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => `${ctx.parsed.y} mediciones registradas en este rango`
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          grid: { color: 'rgba(0,0,0,0.05)' }
                        },
                        x: {
                          grid: { display: false }
                        }
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Métricas Estadísticas de Balanza */}
          <div className="sensor-stats-bar">
            <div className="sensor-stat-box">
              <span>Total Mediciones</span>
              <strong>{hx711Stats.totalCount}</strong>
              <small>eventos registrados</small>
            </div>
            <div className="sensor-stat-box">
              <span>Peso Promedio</span>
              <strong>{hx711Stats.totalCount > 0 ? `${hx711Stats.avgWeight.toFixed(1)} g` : '—'}</strong>
              <small>media observada</small>
            </div>
            <div className="sensor-stat-box">
              <span>Peso Mínimo</span>
              <strong>{hx711Stats.totalCount > 0 ? `${hx711Stats.minWeight.toFixed(1)} g` : '—'}</strong>
              <small>medición menor</small>
            </div>
            <div className="sensor-stat-box">
              <span>Peso Máximo</span>
              <strong>{hx711Stats.totalCount > 0 ? `${hx711Stats.maxWeight.toFixed(1)} g` : '—'}</strong>
              <small>medición mayor</small>
            </div>
            <div className="sensor-stat-box">
              <span>Desv. Estándar (σ)</span>
              <strong>{hx711Stats.stdDev !== null ? `±${hx711Stats.stdDev.toFixed(1)} g` : 'N/A'}</strong>
              <small>{hx711Stats.totalCount >= 2 ? 'dispersión normal' : 'requiere ≥ 2 datos'}</small>
            </div>
            <div className="sensor-stat-box">
              <span title="Variaciones atípicas por dispersión estadística, no implican error de hardware">Lecturas inusuales (Z &gt; 2)</span>
              <strong style={{ color: hx711Stats.anomalyPercent && hx711Stats.anomalyPercent > 0 ? 'var(--coral)' : 'var(--ink)' }}>
                {hx711Stats.anomalyPercent !== null ? `${hx711Stats.anomalyPercent.toFixed(1)}%` : 'N/A'}
              </strong>
              <small>{hx711Stats.totalCount >= 5 ? 'variación atípica' : 'requiere ≥ 5 datos'}</small>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================================
          2. SECCIÓN B: SENSOR DE PROXIMIDAD — INFRARROJO / ULTRASONIDO
         ====================================================================== */}
      {(sensorFilter === 'todos' || sensorFilter === 'proximidad') && (
        <section className="sensor-device-section proximidad" id="sensor-proximidad">
          <div className="sensor-section-header">
            <div className="sensor-title-row">
              <div className="sensor-icon-box proximidad">
                <Activity size={24} />
              </div>
              <div className="sensor-info-header">
                <h2>
                  Sensor de Proximidad — Infrarrojo / HC-SR04
                </h2>
                <p>Supervisa la presencia o ausencia de clientes frente a la estación de autocobro.</p>
              </div>
            </div>

            <div className="sensor-status-badges">
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: '#f8fafc', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                Config: {proxDevice.active !== false ? 'Habilitado' : 'Deshabilitado'}
              </span>
              <span className={proxHealth.className}>
                {proxHealth.label}
              </span>
            </div>
          </div>

          {/* Tarjeta de Estado Actual */}
          <div className="sensor-state-banner">
            <div className="state-item">
              <span className="state-label">Estado Actual Detectado</span>
              <div className="state-value-primary" style={{ color: proxState.isPresent ? '#0d5442' : 'var(--muted)' }}>
                {proxLatest ? proxState.label : 'Sin datos'}
              </div>
            </div>

            <div className="state-item">
              <span className="state-label">Último Evento</span>
              <div className="state-time-exact">
                {proxLatest ? formatExactDateTimeLaPaz(proxLatest.created_at) : '—'}
              </div>
              <div className="state-time-relative">
                ⏱ {proxLatest ? getRelativeTime(proxLatest.created_at) : 'Sin eventos'}
              </div>
            </div>

            <div className="state-item">
              <span className="state-label">Salud de Comunicación</span>
              <span className={proxHealth.className} style={{ width: 'fit-content' }}>
                {proxHealth.description}
              </span>
            </div>

            <div className="state-item">
              <span className="state-label">Mapeo de Hardware</span>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                {proxDevice.gpio || 'GPIO 17 (Trig) / GPIO 2 (Echo)'}
              </div>
            </div>
          </div>

          {/* Gráficos Históricos Proximidad */}
          <div className="sensor-charts-grid">
            {/* Gráfico 1: Actividad de presencia (Escalón) */}
            <div className="sensor-chart-card">
              <div className="sensor-chart-header">
                <h3>
                  <Activity size={15} color="var(--mint-dark)" />
                  1. Actividad de presencia (Línea de tiempo)
                </h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>1 = Presencia / 0 = Despejado</span>
              </div>

              <div className="sensor-chart-box">
                {!proxTimelineChart.hasData ? (
                  <div className="sensor-chart-empty">
                    <Activity size={28} color="#cbd5e1" />
                    <p>No se registran transiciones de presencia en este período.</p>
                  </div>
                ) : (
                  <Line
                    data={{
                      labels: proxTimelineChart.labels,
                      datasets: proxTimelineChart.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            title: (ctx) => proxTimelineChart.fullTimestamps[ctx[0].dataIndex] || '',
                            label: (ctx) => `Estado: ${proxTimelineChart.stateLabels[ctx.dataIndex]}`
                          }
                        }
                      },
                      scales: {
                        y: {
                          min: -0.1,
                          max: 1.1,
                          ticks: {
                            stepSize: 1,
                            callback: (v) => (v === 1 ? 'Detectado' : v === 0 ? 'Sin presencia' : '')
                          },
                          grid: { color: 'rgba(0,0,0,0.05)' }
                        },
                        x: {
                          grid: { display: false },
                          ticks: { maxRotation: 45, minRotation: 0 }
                        }
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {/* Gráfico 2: Eventos por hora */}
            <div className="sensor-chart-card">
              <div className="sensor-chart-header">
                <h3>
                  <BarChart2 size={15} color="#1b7a63" />
                  2. Detecciones vs. Ausencias por hora
                </h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>24 horas del día</span>
              </div>

              <div className="sensor-chart-box">
                {!proxHourlyBars.hasData ? (
                  <div className="sensor-chart-empty">
                    <BarChart2 size={28} color="#cbd5e1" />
                    <p>Sin eventos de proximidad en el período.</p>
                  </div>
                ) : (
                  <Bar
                    data={{
                      labels: proxHourlyBars.labels,
                      datasets: proxHourlyBars.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        x: { stacked: true, grid: { display: false } },
                        y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Métricas Estadísticas de Proximidad */}
          <div className="sensor-stats-bar">
            <div className="sensor-stat-box">
              <span>Total Eventos</span>
              <strong>{proxStats.totalEvents}</strong>
              <small>cambios de estado</small>
            </div>
            <div className="sensor-stat-box">
              <span>Detecciones de Presencia</span>
              <strong style={{ color: 'var(--mint-dark)' }}>{proxStats.presenceCount}</strong>
              <small>clientes frente al puesto</small>
            </div>
            <div className="sensor-stat-box">
              <span>Eventos de Ausencia</span>
              <strong>{proxStats.absenceCount}</strong>
              <small>estación despejada</small>
            </div>
            <div className="sensor-stat-box">
              <span>Hora Más Activa</span>
              <strong>{proxStats.mostActiveHour}</strong>
              <small>mayor interacción</small>
            </div>
            <div className="sensor-stat-box" style={{ gridColumn: 'span 2' }}>
              <span>Última Presencia Detectada</span>
              <strong>{proxStats.lastPresenceTime}</strong>
              <small>marca temporal confirmada</small>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================================
          2. SECCIÓN C: SENSOR MAGNÉTICO — PUERTA DE LA ESTACIÓN
         ====================================================================== */}
      {(sensorFilter === 'todos' || sensorFilter === 'magnetico') && (
        <section className="sensor-device-section magnetico" id="sensor-magnetico">
          <div className="sensor-section-header">
            <div className="sensor-title-row">
              <div className="sensor-icon-box magnetico">
                <DoorClosed size={24} />
              </div>
              <div className="sensor-info-header">
                <h2>
                  Sensor Magnético — Puerta de Salida
                </h2>
                <p>Monitorea la apertura y cierre de la compuerta de liberación de artículos tras el pago.</p>
              </div>
            </div>

            <div className="sensor-status-badges">
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: '#f8fafc', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                Config: {magDevice.active !== false ? 'Habilitado' : 'Deshabilitado'}
              </span>
              <span className={magHealth.className}>
                {magHealth.label}
              </span>
            </div>
          </div>

          {/* Tarjeta de Estado Actual */}
          <div className="sensor-state-banner">
            <div className="state-item">
              <span className="state-label">Estado de la Puerta</span>
              <div className="state-value-primary" style={{ color: magState.isOpen ? 'var(--coral-dark)' : '#0d5442' }}>
                {magLatest ? magState.label : 'Sin datos'}
              </div>
            </div>

            <div className="state-item">
              <span className="state-label">Último Cambio de Estado</span>
              <div className="state-time-exact">
                {magLatest ? formatExactDateTimeLaPaz(magLatest.created_at) : '—'}
              </div>
              <div className="state-time-relative">
                ⏱ {magLatest ? getRelativeTime(magLatest.created_at) : 'Sin eventos'}
              </div>
            </div>

            <div className="state-item">
              <span className="state-label">Salud de Comunicación</span>
              <span className={magHealth.className} style={{ width: 'fit-content' }}>
                {magHealth.description}
              </span>
            </div>

            <div className="state-item">
              <span className="state-label">Mapeo de Hardware</span>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                {magDevice.gpio || 'GPIO 14 (Reed Switch)'}
              </div>
            </div>
          </div>

          {/* Gráficos Históricos Magnético */}
          <div className="sensor-charts-grid">
            {/* Gráfico 1: Historial de apertura y cierre (Escalón) */}
            <div className="sensor-chart-card">
              <div className="sensor-chart-header">
                <h3>
                  <DoorClosed size={15} color="var(--coral)" />
                  1. Historial de apertura y cierre
                </h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>1 = Abierta / 0 = Cerrada</span>
              </div>

              <div className="sensor-chart-box">
                {!magTimelineChart.hasData ? (
                  <div className="sensor-chart-empty">
                    <DoorClosed size={28} color="#cbd5e1" />
                    <p>No se registran cambios de estado de la puerta en este período.</p>
                  </div>
                ) : (
                  <Line
                    data={{
                      labels: magTimelineChart.labels,
                      datasets: magTimelineChart.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            title: (ctx) => magTimelineChart.fullTimestamps[ctx[0].dataIndex] || '',
                            label: (ctx) => `Compuerta: ${magTimelineChart.stateLabels[ctx.dataIndex]}`
                          }
                        }
                      },
                      scales: {
                        y: {
                          min: -0.1,
                          max: 1.1,
                          ticks: {
                            stepSize: 1,
                            callback: (v) => (v === 1 ? 'Abierta' : v === 0 ? 'Cerrada' : '')
                          },
                          grid: { color: 'rgba(0,0,0,0.05)' }
                        },
                        x: {
                          grid: { display: false },
                          ticks: { maxRotation: 45, minRotation: 0 }
                        }
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {/* Gráfico 2: Cambios de estado (Aperturas vs Cierres) */}
            <div className="sensor-chart-card">
              <div className="sensor-chart-header">
                <h3>
                  <BarChart2 size={15} color="var(--coral-dark)" />
                  2. Cambios de estado (Aperturas y Cierres)
                </h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {activePeriod.grouping === 'hour' ? 'Por hora' : 'Por día'}
                </span>
              </div>

              <div className="sensor-chart-box">
                {!magChangesBar.hasData ? (
                  <div className="sensor-chart-empty">
                    <BarChart2 size={28} color="#cbd5e1" />
                    <p>Sin transiciones de compuerta en el período.</p>
                  </div>
                ) : (
                  <Bar
                    data={{
                      labels: magChangesBar.labels,
                      datasets: magChangesBar.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Métricas Estadísticas de Magnético */}
          <div className="sensor-stats-bar">
            <div className="sensor-stat-box">
              <span>Total Cambios</span>
              <strong>{magStats.totalChanges}</strong>
              <small>eventos de puerta</small>
            </div>
            <div className="sensor-stat-box">
              <span>Aperturas</span>
              <strong style={{ color: 'var(--coral)' }}>{magStats.openCount}</strong>
              <small>accesos concedidos</small>
            </div>
            <div className="sensor-stat-box">
              <span>Cierres</span>
              <strong style={{ color: 'var(--mint-dark)' }}>{magStats.closedCount}</strong>
              <small>bloqueos de seguridad</small>
            </div>
            <div className="sensor-stat-box">
              <span>Última Apertura</span>
              <strong>{magStats.timeSinceLastOpen}</strong>
              <small>recencia de apertura</small>
            </div>
            <div className="sensor-stat-box">
              <span>Duración Prom. Abierta</span>
              <strong>{magStats.avgOpenDuration}</strong>
              <small>entre apertura y cierre</small>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================================
          2. SECCIÓN D: LECTOR RFID — RC522 (SIN EXPONER UID)
         ====================================================================== */}
      {(sensorFilter === 'todos' || sensorFilter === 'rc522') && (
        <section className="sensor-device-section rc522" id="sensor-rc522">
          <div className="sensor-section-header">
            <div className="sensor-title-row">
              <div className="sensor-icon-box rc522">
                <Radio size={24} />
              </div>
              <div className="sensor-info-header">
                <h2>
                  Lector RFID — RC522
                  <small style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>(13.56 MHz SPI)</small>
                </h2>
                <p>Detecta el acercamiento de etiquetas RFID adheridas a los artículos para su registro.</p>
              </div>
            </div>

            <div className="sensor-status-badges">
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: '#f8fafc', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                Config: {rfidDevice.active !== false ? 'Habilitado' : 'Deshabilitado'}
              </span>
              <span className={rfidHealth.className}>
                {rfidHealth.label}
              </span>
            </div>
          </div>

          {/* Tarjeta de Estado Actual */}
          <div className="sensor-state-banner">
            <div className="state-item">
              <span className="state-label">Último Evento Registrado</span>
              <div className="state-value-primary" style={{ color: '#925d10', fontSize: 16 }}>
                {rfidLatest ? 'Lectura de tag RFID registrada' : 'Sin datos'}
              </div>
            </div>

            <div className="state-item">
              <span className="state-label">Marca de Tiempo</span>
              <div className="state-time-exact">
                {rfidLatest ? formatExactDateTimeLaPaz(rfidLatest.created_at) : '—'}
              </div>
              <div className="state-time-relative">
                ⏱ {rfidLatest ? getRelativeTime(rfidLatest.created_at) : 'Sin eventos'}
              </div>
            </div>

            <div className="state-item">
              <span className="state-label">Salud de Comunicación</span>
              <span className={rfidHealth.className} style={{ width: 'fit-content' }}>
                {rfidHealth.description}
              </span>
            </div>

            <div className="state-item">
              <span className="state-label">Mapeo de Hardware</span>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                {rfidDevice.gpio || 'SPI: MISO, MOSI, SCK, CS'}
              </div>
            </div>
          </div>

          {/* Gráficos Históricos RFID */}
          <div className="sensor-charts-grid">
            {/* Gráfico 1: Lecturas a lo largo del tiempo */}
            <div className="sensor-chart-card">
              <div className="sensor-chart-header">
                <h3>
                  <BarChart2 size={15} color="#925d10" />
                  1. Lecturas RFID a lo largo del tiempo
                </h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {activePeriod.grouping === 'hour' ? 'Frecuencia por hora' : 'Frecuencia por día'}
                </span>
              </div>

              <div className="sensor-chart-box">
                {!rfidHourlyBars.hasData ? (
                  <div className="sensor-chart-empty">
                    <Radio size={28} color="#cbd5e1" />
                    <p>No se registran escaneos RFID en este período.</p>
                  </div>
                ) : (
                  <Bar
                    data={{
                      labels: rfidHourlyBars.labels,
                      datasets: rfidHourlyBars.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => `${ctx.parsed.y} lecturas de tag detectadas`
                          }
                        }
                      },
                      scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {/* Gráfico 2: Actividad de lectura acumulada */}
            <div className="sensor-chart-card">
              <div className="sensor-chart-header">
                <h3>
                  <Activity size={15} color="#8c681f" />
                  2. Actividad de escaneo secuencial
                </h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Eventos cronológicos</span>
              </div>

              <div className="sensor-chart-box">
                {!rfidActivityTimeline.hasData ? (
                  <div className="sensor-chart-empty">
                    <Activity size={28} color="#cbd5e1" />
                    <p>Sin actividad secuencial registrada.</p>
                  </div>
                ) : (
                  <Line
                    data={{
                      labels: rfidActivityTimeline.labels,
                      datasets: rfidActivityTimeline.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            title: (ctx) => rfidActivityTimeline.fullTimestamps[ctx[0].dataIndex] || '',
                            label: (ctx) => `Escaneo acumulado #${ctx.parsed.y} (Tag verificado)`
                          }
                        }
                      },
                      scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } }
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Métricas Estadísticas de RFID */}
          <div className="sensor-stats-bar">
            <div className="sensor-stat-box">
              <span>Total Escaneos</span>
              <strong>{rfidStats.totalEvents}</strong>
              <small>eventos de lectura</small>
            </div>
            <div className="sensor-stat-box">
              <span>Tasa de Escaneos</span>
              <strong>{rfidStats.ratePerHour}</strong>
              <small>eventos por hora prom.</small>
            </div>
            <div className="sensor-stat-box">
              <span>Período Más Activo</span>
              <strong>{rfidStats.mostActivePeriod}</strong>
              <small>pico de lecturas</small>
            </div>
            <div className="sensor-stat-box" style={{ gridColumn: 'span 2' }}>
              <span>Última Lectura Registrada</span>
              <strong>{rfidStats.latestTimestamp}</strong>
              <small>marca de tiempo confirmada</small>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================================
          3. TABLA PAGINADA DE REGISTRO HISTÓRICO DE LECTURAS (NEWEST FIRST)
         ====================================================================== */}
      <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: 22, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="var(--mint-dark)" />
              Registro Histórico de Lecturas (sensor_readings)
            </h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0 0 0' }}>
              Mostrando eventos cronológicos ordenados de más reciente a más antiguo según los filtros seleccionados.
            </p>
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            {filteredTableReadings.length} lectura(s) encontrada(s)
          </div>
        </div>

        <div className="data-table-wrapper" style={{ boxShadow: 'none' }}>
          <table className="custom-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Fecha / Hora (La Paz)</th>
                <th>Dispositivo</th>
                <th>Tipo de Sensor</th>
                <th>Evento / Estado</th>
                <th>Valor Numérico</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              {pagedTableReadings.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                    No se encontraron lecturas que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                pagedTableReadings.map((r, i) => {
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
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de Paginación */}
        {filteredTableReadings.length > ITEMS_PER_PAGE && (
          <div className="table-pagination-bar">
            <span>
              Mostrando {Math.min((tablePage - 1) * ITEMS_PER_PAGE + 1, filteredTableReadings.length)} a{' '}
              {Math.min(tablePage * ITEMS_PER_PAGE, filteredTableReadings.length)} de {filteredTableReadings.length} lecturas
            </span>

            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-btn"
                disabled={tablePage <= 1}
                onClick={() => setTablePage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft size={13} style={{ verticalAlign: 'middle' }} />
                <span>Anterior</span>
              </button>

              <span style={{ fontWeight: 700, padding: '0 6px', color: 'var(--ink)' }}>
                Página {tablePage} de {totalTablePages}
              </span>

              <button
                type="button"
                className="pagination-btn"
                disabled={tablePage >= totalTablePages}
                onClick={() => setTablePage((p) => Math.min(p + 1, totalTablePages))}
              >
                <span>Siguiente</span>
                <ChevronRight size={13} style={{ verticalAlign: 'middle' }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
