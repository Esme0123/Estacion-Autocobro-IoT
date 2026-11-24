import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign,
  Receipt,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  RefreshCw,
  Scale,
  Activity,
  DoorClosed,
  DoorOpen,
  Radio,
  Package,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react'
import GlassIcon from '../GlassIcon'
import SplitFlapText from '../SplitFlapText'
import TiltGlare from '../TiltGlare'
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
  getDateRange,
  toLaPazDateInput,
  calculateSalesKPIs,
  buildSalesEvolutionChart,
  buildTopProductsChart,
  getSensorStatusInfo,
  translatePurchaseStatus,
  formatExactDateTimeLaPaz,
  formatShortDateTimeLaPaz,
  getRelativeTime,
  formatBs,
  getPurchaseStartedDate
} from '../../utils/resumenAnalytics'

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

export default function AdminResumen({
  products: initialProducts = [],
  purchases: initialPurchases = [],
  readings: initialReadings = []
}) {
  // -------------------------------------------------------------
  // ESTADO DE FILTROS TEMPORALES
  // -------------------------------------------------------------
  const [datePreset, setDatePreset] = useState('7_DIAS') // 'HOY' | '7_DIAS' | '30_DIAS' | 'ESTE_MES' | 'MES_ANTERIOR' | 'PERSONALIZADO'
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return toLaPazDateInput(d)
  })
  const [customEnd, setCustomEnd] = useState(() => toLaPazDateInput(new Date()))
  const [appliedCustomStart, setAppliedCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return toLaPazDateInput(d)
  })
  const [appliedCustomEnd, setAppliedCustomEnd] = useState(() => toLaPazDateInput(new Date()))

  // Alternador de métrica de productos más vendidos ('units' | 'revenue')
  const [topProductsMetric, setTopProductsMetric] = useState('units')

  // -------------------------------------------------------------
  // ESTADO DE DATOS OPERACIONALES
  // -------------------------------------------------------------
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const [productsCatalog, setProductsCatalog] = useState(initialProducts)
  const [periodPurchases, setPeriodPurchases] = useState(initialPurchases)
  const [recentTransactions, setRecentTransactions] = useState([])
  const [realtimeConnected, setRealtimeConnected] = useState(true)

  // Guardias de concurrencia y sincronización
  const isRefreshingRef = useRef(false)

  // Estado IoT
  const [iotDevices, setIotDevices] = useState([
    { id: 'hx711', name: 'Balanza', sensor_type: 'hx711', active: true },
    { id: 'proximidad', name: 'Proximidad', sensor_type: 'proximidad', active: true },
    { id: 'magnetico', name: 'Puerta', sensor_type: 'magnetico', active: true },
    { id: 'rc522', name: 'Lector RFID', sensor_type: 'rc522', active: true }
  ])
  const [latestReadingsBySensor, setLatestReadingsBySensor] = useState({})

  // Cálculo del rango activo y precedente en America/La_Paz
  const activeRange = useMemo(() => {
    return getDateRange(
      datePreset,
      datePreset === 'PERSONALIZADO' ? appliedCustomStart : null,
      datePreset === 'PERSONALIZADO' ? appliedCustomEnd : null
    )
  }, [datePreset, appliedCustomStart, appliedCustomEnd])

  // Ref mutable para que los suscriptores Realtime siempre consulten el rango vigente
  const activeRangeRef = useRef(activeRange)
  useEffect(() => {
    activeRangeRef.current = activeRange
  }, [activeRange])

  // -------------------------------------------------------------
  // CARGA DE DATOS DE VENTAS (SUPABASE + FALLBACK)
  // -------------------------------------------------------------
  const loadSalesData = useCallback(async (precedingStart, currentEnd) => {
    let sales = null

    // Buscamos compras con un margen anterior para incluir compras iniciadas
    // antes de precedingStart pero finalizadas dentro del período, así como compras en curso.
    const queryBufferStart = new Date(precedingStart.getTime() - 24 * 3600 * 1000)

    try {
      const res = await supabase
        .from('purchases')
        .select('id, total, status, started_at, finished_at, customer_id, purchase_items(id, product_id, product_name, quantity, subtotal)')
        .gte('started_at', queryBufferStart.toISOString())
        .lt('started_at', currentEnd.toISOString())
        .order('started_at', { ascending: false })

      if (!res.error && res.data) {
        sales = res.data
      }
    } catch (e) {
      // Ignorar e intentar consulta abierta
    }

    // Si falló el filtro de started_at, intentar consulta general ordenada
    if (!sales) {
      try {
        const res = await supabase
          .from('purchases')
          .select('id, total, status, started_at, finished_at, customer_id, purchase_items(id, product_id, product_name, quantity, subtotal)')
          .order('started_at', { ascending: false })
          .limit(1000)

        if (!res.error && res.data) {
          sales = res.data
        }
      } catch (e) {}
    }

    // Fallback a compras locales si Supabase no está configurado o falla
    if (!sales || sales.length === 0) {
      try {
        const local = JSON.parse(localStorage.getItem('local_purchases') || '[]')
        if (local.length > 0) {
          sales = local
        }
      } catch (e) {}
    }

    return sales || []
  }, [])

  // -------------------------------------------------------------
  // CARGA DE TRANSACCIONES RECIENTES (5 MÁS RECIENTES POR started_at)
  // -------------------------------------------------------------
  const loadRecentPurchases = useCallback(async () => {
    try {
      const res = await supabase
        .from('purchases')
        .select('id, total, status, started_at, finished_at, customer_id')
        .order('started_at', { ascending: false })
        .limit(5)

      if (!res.error && res.data && res.data.length > 0) {
        return res.data
      }
    } catch (e) {}

    // Fallback local
    try {
      const local = JSON.parse(localStorage.getItem('local_purchases') || '[]')
      return local
        .slice()
        .sort((a, b) => {
          const tA = getPurchaseStartedDate(a)?.getTime() || 0
          const tB = getPurchaseStartedDate(b)?.getTime() || 0
          return tB - tA
        })
        .slice(0, 5)
    } catch (e) {
      return []
    }
  }, [])

  // -------------------------------------------------------------
  // CARGA DE PRODUCTOS (CATÁLOGO ACTIVO / INACTIVO)
  // -------------------------------------------------------------
  const loadProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, active, created_at')
        .order('id', { ascending: true })

      if (!error && data && data.length > 0) {
        return data
      }
    } catch (e) {}

    try {
      const local = JSON.parse(localStorage.getItem('local_products') || '[]')
      if (local.length > 0) return local
    } catch (e) {}

    return initialProducts || []
  }, [initialProducts])

  // -------------------------------------------------------------
  // CARGA DE ESTADO IOT (sensor_devices + sensor_readings)
  // -------------------------------------------------------------
  const loadIoTStatus = useCallback(async () => {
    // 1. Obtener dispositivos registrados
    let devices = null
    try {
      const res = await supabase.from('sensor_devices').select('*')
      if (!res.error && res.data && res.data.length > 0) {
        devices = res.data
      }
    } catch (e) {}

    if (!devices || devices.length === 0) {
      devices = [
        { id: 'hx711', name: 'Balanza', sensor_type: 'hx711', active: true },
        { id: 'proximidad', name: 'Proximidad', sensor_type: 'proximidad', active: true },
        { id: 'magnetico', name: 'Puerta', sensor_type: 'magnetico', active: true },
        { id: 'rc522', name: 'Lector RFID', sensor_type: 'rc522', active: true }
      ]
    }

    // 2. Obtener última lectura para cada dispositivo
    const readingsMap = {}
    await Promise.all(
      devices.map(async (dev) => {
        try {
          const { data, error } = await supabase
            .from('sensor_readings')
            .select('*')
            .eq('sensor_type', dev.sensor_type)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!error && data) {
            readingsMap[dev.sensor_type] = data
          }
        } catch (e) {}
      })
    )

    // Fallback a lecturas locales si faltan datos
    try {
      const local = JSON.parse(localStorage.getItem('local_readings') || '[]')
      devices.forEach((dev) => {
        if (!readingsMap[dev.sensor_type]) {
          const match = local.find((r) => r.sensor_type === dev.sensor_type)
          if (match) readingsMap[dev.sensor_type] = match
        }
      })
    } catch (e) {}

    return { devices, readingsMap }
  }, [])

  // -------------------------------------------------------------
  // ACTUALIZACIONES SELECTIVAS / DIRIGIDAS (SIN RELOAD COMPLETO)
  // -------------------------------------------------------------
  const reloadSales = useCallback(async () => {
    try {
      const range = activeRangeRef.current
      const sales = await loadSalesData(range.precedingStart, range.currentEnd)
      setPeriodPurchases(sales)
    } catch (e) {}
  }, [loadSalesData])

  const reloadRecent = useCallback(async () => {
    try {
      const recent = await loadRecentPurchases()
      setRecentTransactions(recent)
    } catch (e) {}
  }, [loadRecentPurchases])

  const reloadProductsCatalog = useCallback(async () => {
    try {
      const prods = await loadProducts()
      setProductsCatalog(prods)
    } catch (e) {}
  }, [loadProducts])

  // -------------------------------------------------------------
  // FUNCIÓN PRINCIPAL DE CARGA Y MANUAL REFRESH
  // -------------------------------------------------------------
  const reloadDashboardData = useCallback(async (isManual = false) => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true
    setLoading(true)
    setErrorMsg('')

    try {
      const range = activeRangeRef.current
      const [salesData, recentList, prodsList, iotData] = await Promise.all([
        loadSalesData(range.precedingStart, range.currentEnd),
        loadRecentPurchases(),
        loadProducts(),
        loadIoTStatus()
      ])

      setPeriodPurchases(salesData)
      setRecentTransactions(recentList)
      setProductsCatalog(prodsList)
      setIotDevices(iotData.devices)
      setLatestReadingsBySensor(iotData.readingsMap)
    } catch (err) {
      console.error('Error cargando datos del Resumen:', err)
      setErrorMsg('No se pudieron sincronizar todos los datos en tiempo real.')
    } finally {
      setLoading(false)
      isRefreshingRef.current = false
    }
  }, [loadSalesData, loadRecentPurchases, loadProducts, loadIoTStatus])

  // Carga inicial y al cambiar rango de fechas
  useEffect(() => {
    reloadDashboardData()
  }, [activeRange, reloadDashboardData])

  // -------------------------------------------------------------
  // SUSCRIPCIÓN MULTIPLEXADA EN TIEMPO REAL (SUPABASE REALTIME)
  // -------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('admin-resumen-realtime-feed')
      // 1. Cambios en compras (INSERT, UPDATE de estado pagada/cancelada, DELETE)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchases' },
        () => {
          reloadSales()
          reloadRecent()
        }
      )
      // 2. Cambios en ítems de compras (afectan ranking de productos y totales de venta)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_items' },
        () => {
          reloadSales()
        }
      )
      // 3. Cambios en catálogo de productos (afectan conteo activo/inactivo y nombres de ranking)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          reloadProductsCatalog()
        }
      )
      // 4. Nuevas lecturas de sensores ESP32 (actualización instantánea de tarjetas IoT)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings' },
        (payload) => {
          const newReading = payload.new
          if (!newReading) return
          const rawType = (newReading.sensor_type || '').toLowerCase().trim()
          const type = rawType === 'weight' ? 'hx711' : rawType
          if (type) {
            setLatestReadingsBySensor((prev) => ({
              ...prev,
              [type]: newReading
            }))
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeConnected(false)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [reloadSales, reloadRecent, reloadProductsCatalog])

  // Polling de respaldo cada 30 segundos SOLO si Realtime se desconectó
  useEffect(() => {
    if (realtimeConnected) return
    const interval = setInterval(() => {
      reloadDashboardData(false)
    }, 30000)
    return () => clearInterval(interval)
  }, [realtimeConnected, reloadDashboardData])

  // -------------------------------------------------------------
  // CÁLCULOS DE KPIS Y GRÁFICOS
  // -------------------------------------------------------------
  const kpis = useMemo(() => {
    return calculateSalesKPIs(
      periodPurchases,
      activeRange.currentStart,
      activeRange.currentEnd,
      activeRange.precedingStart,
      activeRange.precedingEnd
    )
  }, [periodPurchases, activeRange])

  // Gráfico Evolución de Ventas
  const salesEvolutionData = useMemo(() => {
    const raw = buildSalesEvolutionChart(
      periodPurchases,
      activeRange.currentStart,
      activeRange.currentEnd,
      activeRange.grouping
    )

    return {
      labels: raw.labels,
      datasets: [
        {
          label: 'Ingresos Pagados (Bs.)',
          data: raw.revenueData,
          borderColor: '#de7272',
          backgroundColor: 'rgba(222, 114, 114, 0.22)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#de7272',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2.5,
          pointRadius: raw.labels.length > 20 ? 3 : 5,
          borderWidth: 2.5
        }
      ],
      counts: raw.countData
    }
  }, [periodPurchases, activeRange])

  // Gráfico Productos Más Vendidos (Top 5)
  const topProductsData = useMemo(() => {
    return buildTopProductsChart(
      periodPurchases,
      activeRange.currentStart,
      activeRange.currentEnd,
      topProductsMetric,
      productsCatalog
    )
  }, [periodPurchases, activeRange, topProductsMetric, productsCatalog])

  // Resumen de Productos (Activos / Inactivos)
  const productSummary = useMemo(() => {
    const total = productsCatalog.length
    const active = productsCatalog.filter((p) => p.active !== false).length
    const inactive = total - active
    return { total, active, inactive }
  }, [productsCatalog])

  // Manejo de aplicación de fechas personalizadas
  const handleApplyCustomDates = (e) => {
    e.preventDefault()
    if (!customStart || !customEnd) return
    if (customStart > customEnd) {
      alert('La fecha de inicio no puede ser posterior a la fecha de fin.')
      return
    }
    setAppliedCustomStart(customStart)
    setAppliedCustomEnd(customEnd)
    setDatePreset('PERSONALIZADO')
  }

  // -------------------------------------------------------------
  // RENDERIZADO
  // -------------------------------------------------------------
  return (
    <div className="resumen-dashboard">
      {/* =========================================================
          1. HEADER & DATE FILTERS
         ========================================================= */}
      <div className="resumen-top-bar">
        <div className="resumen-title-group">
          <h1>Resumen general</h1>
          <p>Estado y rendimiento de tu mercado.</p>
        </div>

        <div className="resumen-actions-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="resumen-date-presets" role="group" aria-label="Selector de período">
              <button
                type="button"
                className={`resumen-preset-pill ${datePreset === 'HOY' ? 'active' : ''}`}
                onClick={() => setDatePreset('HOY')}
              >
                Hoy
              </button>
              <button
                type="button"
                className={`resumen-preset-pill ${datePreset === '7_DIAS' ? 'active' : ''}`}
                onClick={() => setDatePreset('7_DIAS')}
              >
                Últimos 7 días
              </button>
              <button
                type="button"
                className={`resumen-preset-pill ${datePreset === '30_DIAS' ? 'active' : ''}`}
                onClick={() => setDatePreset('30_DIAS')}
              >
                Últimos 30 días
              </button>
              <button
                type="button"
                className={`resumen-preset-pill ${datePreset === 'ESTE_MES' ? 'active' : ''}`}
                onClick={() => setDatePreset('ESTE_MES')}
              >
                Este mes
              </button>
              <button
                type="button"
                className={`resumen-preset-pill ${datePreset === 'MES_ANTERIOR' ? 'active' : ''}`}
                onClick={() => setDatePreset('MES_ANTERIOR')}
              >
                Mes anterior
              </button>
              <button
                type="button"
                className={`resumen-preset-pill ${datePreset === 'PERSONALIZADO' ? 'active' : ''}`}
                onClick={() => setDatePreset('PERSONALIZADO')}
              >
                Personalizado
              </button>
            </div>

            <button
              type="button"
              className="btn-ghost"
              onClick={() => reloadDashboardData(true)}
              disabled={loading}
              title="Refrescar datos en vivo"
              style={{ fontSize: 12, padding: '7px 12px' }}
            >
              <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
              <span>{loading ? 'Cargando...' : 'Actualizar'}</span>
            </button>
          </div>

          {/* Formulario de Rango Personalizado */}
          {datePreset === 'PERSONALIZADO' && (
            <form onSubmit={handleApplyCustomDates} className="resumen-custom-date-box">
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

          {/* Badge informativo de período activo en La Paz */}
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={12} color="var(--peach)" />
            <span>
              Período evaluado: <strong>{activeRange.label}</strong> (Hora de Bolivia / America/La_Paz)
            </span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: '10px 16px', background: 'var(--coral-light)', color: 'var(--coral-dark)', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          {errorMsg}
        </div>
      )}

      {/* =========================================================
          2. SALES KPIS (3 TARJETAS COMPACTAS CON TILT + GLARE)
         ========================================================= */}
      <div className="resumen-kpis-grid">
        {/* KPI 1: Ingresos */}
        <TiltGlare maxTilt={5}>
          <div className="kpi-stat-card ingresos">
            <div className="kpi-stat-header">
              <h3>Ingresos</h3>
              <GlassIcon icon={DollarSign} color="sunny" size={44} />
            </div>
            <div className="kpi-stat-body">
              <div className="kpi-stat-value">{formatBs(kpis.currentRevenue)}</div>
              <div className="kpi-stat-trend">
                <span className={`trend-badge ${kpis.revenueChange.dir}`}>
                  {kpis.revenueChange.dir === 'up' && <TrendingUp size={12} />}
                  {kpis.revenueChange.dir === 'down' && <TrendingDown size={12} />}
                  {kpis.revenueChange.dir === 'neutral' && <Minus size={12} />}
                  {kpis.revenueChange.text}
                </span>
                <span className="trend-reference">
                  vs. anterior ({formatBs(kpis.precedingRevenue)})
                </span>
              </div>
            </div>
          </div>
        </TiltGlare>

        {/* KPI 2: Ventas realizadas */}
        <TiltGlare maxTilt={5}>
          <div className="kpi-stat-card ventas">
            <div className="kpi-stat-header">
              <h3>Ventas realizadas</h3>
              <GlassIcon icon={Receipt} color="mint" size={44} />
            </div>
            <div className="kpi-stat-body">
              <div className="kpi-stat-value">
                {kpis.currentCount}{' '}
                <small style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>ventas</small>
              </div>
              {kpis.inProgressCount > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a06b52', marginTop: 2 }}>
                  ⏱ {kpis.inProgressCount} en proceso
                </div>
              )}
              <div className="kpi-stat-trend">
                <span className={`trend-badge ${kpis.countChange.dir}`}>
                  {kpis.countChange.dir === 'up' && <TrendingUp size={12} />}
                  {kpis.countChange.dir === 'down' && <TrendingDown size={12} />}
                  {kpis.countChange.dir === 'neutral' && <Minus size={12} />}
                  {kpis.countChange.text}
                </span>
                <span className="trend-reference">
                  vs. anterior ({kpis.precedingCount} ventas)
                </span>
              </div>
            </div>
          </div>
        </TiltGlare>

        {/* KPI 3: Ticket promedio */}
        <TiltGlare maxTilt={5}>
          <div className="kpi-stat-card ticket">
            <div className="kpi-stat-header">
              <h3>Ticket promedio</h3>
              <GlassIcon icon={CreditCard} color="coral" size={44} />
            </div>
            <div className="kpi-stat-body">
              <div className="kpi-stat-value">{formatBs(kpis.currentAverage)}</div>
              <div className="kpi-stat-trend">
                <span className={`trend-badge ${kpis.averageChange.dir}`}>
                  {kpis.averageChange.dir === 'up' && <TrendingUp size={12} />}
                  {kpis.averageChange.dir === 'down' && <TrendingDown size={12} />}
                  {kpis.averageChange.dir === 'neutral' && <Minus size={12} />}
                  {kpis.averageChange.text}
                </span>
                <span className="trend-reference">
                  vs. anterior ({formatBs(kpis.precedingAverage)})
                </span>
              </div>
            </div>
          </div>
        </TiltGlare>
      </div>

      {/* =========================================================
          3. SALES ANALYTICS (2-COLUMN CHART SECTION)
         ========================================================= */}
      <div className="resumen-analytics-grid">
        {/* Left: Evolución de ventas */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h3 className="analytics-card-title">
              <TrendingUp size={16} color="var(--coral)" />
              Evolución de ventas
            </h3>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: '#f1f5f9', padding: '3px 8px', borderRadius: 4 }}>
              {activeRange.grouping === 'hour'
                ? 'Agrupado por hora'
                : activeRange.grouping === 'week'
                  ? 'Agrupado por semana'
                  : 'Agrupado por día'}
            </span>
          </div>

          <div className="chart-wrapper">
            <Line
              data={salesEvolutionData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const idx = ctx.dataIndex
                        const rev = ctx.parsed.y || 0
                        const cnt = salesEvolutionData.counts[idx] || 0
                        return [
                          `Ingresos: Bs. ${rev.toFixed(2)}`,
                          `Ventas pagadas: ${cnt} ${cnt === 1 ? 'venta' : 'ventas'}`
                        ]
                      }
                    }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: (v) => `Bs. ${v}`,
                      color: '#6b5657',
                      font: { weight: '600', size: 11 }
                    },
                    grid: { color: 'rgba(255, 202, 136, 0.25)' }
                  },
                  x: {
                    grid: { color: 'rgba(255, 202, 136, 0.15)' },
                    ticks: { maxRotation: 45, minRotation: 0, color: '#6b5657', font: { weight: '600', size: 11 } }
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Right: Productos más vendidos */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h3 className="analytics-card-title">
              <Package size={16} color="#925d10" />
              Productos más vendidos (Top 5)
            </h3>

            {/* Alternador de métrica: Unidades vs Ingresos */}
            <div className="analytics-toggle-pill">
              <button
                type="button"
                className={`analytics-toggle-btn ${topProductsMetric === 'units' ? 'active' : ''}`}
                onClick={() => setTopProductsMetric('units')}
              >
                Unidades
              </button>
              <button
                type="button"
                className={`analytics-toggle-btn ${topProductsMetric === 'revenue' ? 'active' : ''}`}
                onClick={() => setTopProductsMetric('revenue')}
              >
                Ingresos (Bs.)
              </button>
            </div>
          </div>

          <div className="chart-wrapper">
            {!topProductsData.hasData ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--muted)',
                  fontSize: 13,
                  gap: 8
                }}
              >
                <Package size={32} color="#cbd5e1" />
                <p>No se registraron ventas de productos en este período.</p>
              </div>
            ) : (
              <Bar
                data={{
                  labels: topProductsData.labels,
                  datasets: [
                    {
                      label: topProductsMetric === 'revenue' ? 'Ingresos (Bs.)' : 'Unidades Vendidas',
                      data: topProductsData.data,
                      backgroundColor: ['#ffca88', '#b4e4d6', '#de7272', '#ffb3ba', '#bae1ff'],
                      borderRadius: 6
                    }
                  ]
                }}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => {
                          const val = ctx.parsed.x || 0
                          if (topProductsMetric === 'revenue') {
                            return `Ingresos generados: Bs. ${val.toFixed(2)}`
                          }
                          return `Unidades vendidas: ${val} uds.`
                        }
                      }
                    }
                  },
                  scales: {
                    x: {
                      beginAtZero: true,
                      grid: { color: 'rgba(0,0,0,0.05)' },
                      ticks: {
                        callback: (v) => (topProductsMetric === 'revenue' ? `Bs. ${v}` : `${v}`)
                      }
                    },
                    y: {
                      grid: { display: false },
                      ticks: {
                        font: { weight: '600', size: 11 }
                      }
                    }
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* =========================================================
          4. PRODUCT & TRANSACTION INFORMATION
         ========================================================= */}
      <div className="resumen-info-grid">
        {/* Resumen de Productos (Catálogo) */}
        <div className="product-summary-card">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={17} color="var(--mint-dark)" />
                Resumen de Productos
              </h3>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                Catálogo Maestro
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              Supervisión de disponibilidad de artículos habilitados para el flujo de autocobro.
            </p>

            <div className="product-stat-boxes">
              <div className="product-stat-box active-prod">
                <span>Productos Activos</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong>{productSummary.active}</strong>
                  <CheckCircle size={22} color="var(--mint-dark)" />
                </div>
              </div>

              <div className="product-stat-box inactive-prod">
                <span>Productos Inactivos</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong>{productSummary.inactive}</strong>
                  <Minus size={22} color="var(--muted)" />
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink-secondary)', background: '#fafbfd', padding: 10, borderRadius: 6, border: '1px solid #f1f5f9' }}>
              Total registrados en base de datos: <strong>{productSummary.total} productos</strong>
            </div>
          </div>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            <Link
              to="/admin/productos"
              className="btn-ghost"
              style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }}
            >
              <span>Administrar catálogo de productos</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Transacciones Recientes (5 compras ordenadas por started_at) */}
        <div className="product-summary-card">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Receipt size={17} color="var(--coral-dark)" />
                Transacciones Recientes
              </h3>
              <Link
                to="/admin/ventas"
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span>Ver historial completo</span>
                <ChevronRight size={13} />
              </Link>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 14px 0' }}>
              Últimas 5 operaciones registradas en la estación (ordenadas por inicio).
            </p>

            <div className="data-table-wrapper" style={{ boxShadow: 'none' }}>
              <table className="custom-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha / Hora</th>
                    <th>Total</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                        No hay transacciones recientes registradas.
                      </td>
                    </tr>
                  ) : (
                    recentTransactions.map((pur) => {
                      const statusInfo = translatePurchaseStatus(pur.status)
                      const startedDate = getPurchaseStartedDate(pur)
                      const dateDisplay = startedDate ? formatShortDateTimeLaPaz(startedDate) : 'Reciente'

                      return (
                        <tr key={pur.id}>
                          <td><strong>#{pur.id}</strong></td>
                          <td style={{ color: 'var(--muted)' }}>{dateDisplay}</td>
                          <td>
                            <strong style={{ color: 'var(--ink)' }}>
                              {formatBs(pur.total)}
                            </strong>
                          </td>
                          <td>
                            <span className={statusInfo.className}>
                              {statusInfo.label}
                            </span>
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
      </div>

      {/* =========================================================
          5. ESTADO DEL SISTEMA IOT (INDEPENDIENTE DEL FILTRO DE FECHAS)
         ========================================================= */}
      <div className="iot-status-section">
        <div className="iot-status-header">
          <div className="iot-status-title-group">
            <h2>Estado del sistema IoT</h2>
            <p>
              Supervisión de recencia de comunicación y último valor registrado en la estación.
              (Los sensores transmiten por evento o cambio de estado).
            </p>
          </div>

          <div className="iot-status-actions">
            <Link to="/admin/iot" className="btn-ghost" style={{ fontSize: 12 }}>
              <Activity size={13} />
              <span>Resumen de Sensores</span>
            </Link>
            <Link to="/admin/lecturas" className="btn-ghost" style={{ fontSize: 12 }}>
              <Clock size={13} />
              <span>Lecturas de Sensores</span>
            </Link>
          </div>
        </div>

        <div className="iot-sensors-grid">
          {iotDevices.map((dev) => {
            const latest = latestReadingsBySensor[dev.sensor_type]
            const info = getSensorStatusInfo(dev, latest)

            // Ícono y color GlassIcon por sensor
            let SensorIcon = Activity
            let iconColor = 'mint'
            if (dev.sensor_type === 'hx711' || dev.sensor_type === 'weight') {
              SensorIcon = Scale
              iconColor = 'peach'
            } else if (dev.sensor_type === 'proximidad') {
              SensorIcon = Activity
              iconColor = 'mint'
            } else if (dev.sensor_type === 'magnetico') {
              SensorIcon = DoorOpen
              iconColor = 'coral'
            } else if (dev.sensor_type === 'rc522') {
              SensorIcon = Radio
              iconColor = 'sunny'
            }

            const hasValidData = Boolean(latest && info.readingDisplay && info.readingDisplay !== 'Sin datos' && dev.active !== false)
            const splitFlapVariant = hasValidData ? 'mint' : 'sunny'

            return (
              <div key={dev.id || dev.sensor_type} className="sensor-card">
                <div>
                  <div className="sensor-card-top">
                    <div className="sensor-card-name">
                      <GlassIcon icon={SensorIcon} color={iconColor} size={38} />
                      <span style={{ fontWeight: 800, color: '#3b2829' }}>{dev.name || dev.sensor_type}</span>
                    </div>
                    <span className={info.badgeClass}>{info.statusLabel}</span>
                  </div>

                  <div style={{ fontSize: 11, color: '#8c7374', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Configuración:</span>
                    <strong style={{ color: dev.active !== false ? '#3b2829' : 'var(--coral-dark)' }}>
                      {info.configuredLabel}
                    </strong>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#8c7374', letterSpacing: '0.4px', display: 'block', marginBottom: 4 }}>
                    Última Lectura / Estado
                  </span>
                  <div className="sensor-card-value">
                    <SplitFlapText
                      size="sm"
                      variant={splitFlapVariant}
                      text={info.readingDisplay || 'SIN DATOS'}
                      compact
                    />
                  </div>
                </div>

                <div className="sensor-card-times">
                  <span className="relative">⏱ {info.relativeTime}</span>
                  <span>Exacta: {info.exactTime}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
