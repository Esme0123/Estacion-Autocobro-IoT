import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  RefreshCw,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  ShoppingBag,
  Clock,
  Layers,
  ArrowUpDown,
  Minus
} from 'lucide-react'
import GlassIcon from '../GlassIcon'
import TiltGlare from '../TiltGlare'
import {
  supabase,
  saveProductToDB,
  deleteProductFromDB,
  getPurchasesFromDB
} from '../../supabaseClient'
import {
  TIMEZONE,
  getDateRange,
  toLaPazDateInput,
  isPaidPurchase,
  getPurchaseFinishedDate,
  getPurchaseStartedDate,
  formatExactDateTimeLaPaz,
  formatShortDateTimeLaPaz,
  formatBs
} from '../../utils/resumenAnalytics'

export default function ProductosPage({
  products = [],
  onProductsChanged,
  purchases: initialPurchases = []
}) {
  // -------------------------------------------------------------
  // 1. SELECTOR DE PERÍODO TEMPORAL (America/La_Paz UTC-4)
  // -------------------------------------------------------------
  const [datePreset, setDatePreset] = useState('7_DIAS')
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

  const activeRange = useMemo(() => {
    return getDateRange(datePreset, appliedCustomStart, appliedCustomEnd)
  }, [datePreset, appliedCustomStart, appliedCustomEnd])

  const handleApplyCustomDates = (e) => {
    e.preventDefault()
    if (!customStart || !customEnd) return
    if (customStart > customEnd) {
      alert('La fecha de inicio no puede ser posterior a la fecha final.')
      return
    }
    setAppliedCustomStart(customStart)
    setAppliedCustomEnd(customEnd)
    setDatePreset('PERSONALIZADO')
  }

  // -------------------------------------------------------------
  // 2. ESTADO DE COMPRAS (PARA RENDIMIENTO DE PRODUCTOS)
  // -------------------------------------------------------------
  const [purchasesList, setPurchasesList] = useState(initialPurchases)
  const [loadingSales, setLoadingSales] = useState(false)

  const loadSalesData = useCallback(async () => {
    setLoadingSales(true)
    try {
      const data = await getPurchasesFromDB(200)
      if (data && data.length > 0) {
        setPurchasesList(data)
      } else if (initialPurchases && initialPurchases.length > 0) {
        setPurchasesList(initialPurchases)
      }
    } catch (err) {
      console.warn('Error cargando ventas para cálculo de rendimiento:', err)
      if (initialPurchases && initialPurchases.length > 0) {
        setPurchasesList(initialPurchases)
      } else {
        try {
          const local = JSON.parse(localStorage.getItem('local_purchases') || '[]')
          setPurchasesList(local)
        } catch (e) {}
      }
    } finally {
      setLoadingSales(false)
    }
  }, [initialPurchases])

  useEffect(() => {
    loadSalesData()
  }, [loadSalesData])

  // Suscripción Realtime a compras
  useEffect(() => {
    const channel = supabase
      .channel('productos-sales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => {
        loadSalesData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadSalesData])

  // Sincronizar si cambian las compras iniciales recibidas
  useEffect(() => {
    if (initialPurchases && initialPurchases.length > 0) {
      setPurchasesList(prev => (prev && prev.length > 0 ? prev : initialPurchases))
    }
  }, [initialPurchases])

  // -------------------------------------------------------------
  // 3. TARJETAS DE RESUMEN DE PRODUCTOS (SIN STOCK)
  // - Productos registrados
  // - Productos activos
  // - Productos inactivos
  // -------------------------------------------------------------
  const summaryCounts = useMemo(() => {
    const total = products.length
    const active = products.filter(p => p.active !== false).length
    const inactive = total - active
    return { total, active, inactive }
  }, [products])

  // -------------------------------------------------------------
  // 4. CÁLCULO DE RENDIMIENTO POR PRODUCTO
  // Solo compras con status pagada (COMPLETED / pagada)
  // -------------------------------------------------------------
  const productMetrics = useMemo(() => {
    const startMs = activeRange.currentStart.getTime()
    const endMs = activeRange.currentEnd.getTime()

    // Estructura por ID de producto
    const metricsMap = {}
    products.forEach(p => {
      metricsMap[p.id] = {
        periodUnits: 0,
        periodRevenue: 0,
        allTimeUnits: 0,
        allTimeRevenue: 0,
        allTimePurchasesCount: 0,
        recentPurchases: [] // compras que contienen este producto
      }
    })

    // Procesar todas las compras pagadas
    purchasesList.forEach(pur => {
      if (!isPaidPurchase(pur)) return

      const fDate = getPurchaseFinishedDate(pur) || getPurchaseStartedDate(pur)
      if (!fDate) return
      const t = fDate.getTime()
      const inPeriod = t >= startMs && t < endMs

      const items = pur.purchase_items || []
      const matchedProductsInThisPurchase = new Set()

      items.forEach(item => {
        // Enlazar item con producto por ID o por nombre
        let targetProduct = null
        if (item.product_id != null) {
          targetProduct = products.find(p => p.id === item.product_id)
        }
        if (!targetProduct && item.product_name) {
          targetProduct = products.find(
            p => p.name?.toLowerCase().trim() === item.product_name?.toLowerCase().trim()
          )
        }

        if (targetProduct) {
          const pid = targetProduct.id
          if (!metricsMap[pid]) {
            metricsMap[pid] = {
              periodUnits: 0,
              periodRevenue: 0,
              allTimeUnits: 0,
              allTimeRevenue: 0,
              allTimePurchasesCount: 0,
              recentPurchases: []
            }
          }

          const qty = parseInt(item.quantity, 10) || 1
          const subtotal = parseFloat(item.subtotal || item.unit_price * qty || 0)

          // Métricas del período seleccionado
          if (inPeriod) {
            metricsMap[pid].periodUnits += qty
            metricsMap[pid].periodRevenue += subtotal
          }

          // Métricas acumuladas históricas
          metricsMap[pid].allTimeUnits += qty
          metricsMap[pid].allTimeRevenue += subtotal

          matchedProductsInThisPurchase.add(pid)

          // Registrar en compras recientes del producto
          metricsMap[pid].recentPurchases.push({
            purchaseId: pur.id,
            purchaseDate: fDate,
            productName: item.product_name || targetProduct.name,
            quantity: qty,
            unitPrice: parseFloat(item.unit_price || 0),
            subtotal,
            measuredWeightG: item.measured_weight_g != null ? parseFloat(item.measured_weight_g) : null,
            status: pur.status
          })
        }
      })

      // Conteo de compras pagadas distintas que contienen este producto
      matchedProductsInThisPurchase.forEach(pid => {
        if (metricsMap[pid]) {
          metricsMap[pid].allTimePurchasesCount += 1
        }
      })
    })

    // Ordenar compras recientes de cada producto de más reciente a más antigua
    Object.keys(metricsMap).forEach(pid => {
      metricsMap[pid].recentPurchases.sort(
        (a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime()
      )
    })

    return metricsMap
  }, [products, purchasesList, activeRange])

  // -------------------------------------------------------------
  // 5. RANKINGS DE RENDIMIENTO Y PRODUCTOS SIN VENTAS
  // - Más vendidos (por unidades)
  // - Mayores ingresos (por Bs.)
  // - Productos sin ventas (activos con 0 ventas en el período)
  // -------------------------------------------------------------
  const [rankingMode, setRankingMode] = useState('units') // 'units' | 'revenue'

  const rankedProducts = useMemo(() => {
    return products
      .map(p => {
        const m = productMetrics[p.id] || { periodUnits: 0, periodRevenue: 0 }
        return {
          ...p,
          periodUnits: m.periodUnits,
          periodRevenue: m.periodRevenue
        }
      })
      .filter(p => (rankingMode === 'units' ? p.periodUnits > 0 : p.periodRevenue > 0))
      .sort((a, b) => {
        if (rankingMode === 'revenue') {
          return b.periodRevenue - a.periodRevenue
        }
        return b.periodUnits - a.periodUnits
      })
  }, [products, productMetrics, rankingMode])

  // Productos activos que no registraron ventas en el período seleccionado
  const noSalesActiveProducts = useMemo(() => {
    return products.filter(p => {
      if (p.active === false) return false
      const m = productMetrics[p.id]
      return !m || m.periodUnits === 0
    })
  }, [products, productMetrics])

  // -------------------------------------------------------------
  // 6. FILTRO Y PAGINACIÓN DEL CATÁLOGO DE PRODUCTOS
  // -------------------------------------------------------------
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODOS') // 'TODOS' | 'ACTIVOS' | 'INACTIVOS'
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, datePreset, appliedCustomStart, appliedCustomEnd])

  const filteredProducts = useMemo(() => {
    const raw = searchTerm.trim().toLowerCase()
    return products.filter(p => {
      // Filtro de estado
      if (statusFilter === 'ACTIVOS' && p.active === false) return false
      if (statusFilter === 'INACTIVOS' && p.active !== false) return false

      // Filtro de búsqueda
      if (raw) {
        const matchName = p.name?.toLowerCase().includes(raw)
        const matchBarcode = p.barcode?.toLowerCase().includes(raw)
        const matchRfid = p.rfid_uid?.toLowerCase().includes(raw)
        const matchDesc = p.description?.toLowerCase().includes(raw)
        if (!matchName && !matchBarcode && !matchRfid && !matchDesc) {
          return false
        }
      }
      return true
    })
  }, [products, searchTerm, statusFilter])

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredProducts.slice(start, start + itemsPerPage)
  }, [filteredProducts, currentPage, itemsPerPage])

  // -------------------------------------------------------------
  // 7. MODALES: DETALLE DE PRODUCTO Y CRUD (CREAR / EDITAR)
  // -------------------------------------------------------------
  const [selectedProductForDetail, setSelectedProductForDetail] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)

  // Formulario CRUD (Sin campo de stock)
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    rfid_uid: '',
    price: '',
    expected_weight_g: '',
    active: true,
    description: '',
    image_url: '📦'
  })

  function openCreateModal() {
    setEditingProduct(null)
    setFormData({
      name: '',
      barcode: '',
      rfid_uid: '',
      price: '',
      expected_weight_g: '',
      active: true,
      description: '',
      image_url: '📦'
    })
    setIsModalOpen(true)
  }

  function openEditModal(prod) {
    setEditingProduct(prod)
    setFormData({
      name: prod.name,
      barcode: prod.barcode || '',
      rfid_uid: prod.rfid_uid || '',
      price: prod.price,
      expected_weight_g: prod.expected_weight_g,
      active: prod.active ?? true,
      description: prod.description || '',
      image_url: prod.image_url || '📦'
    })
    setIsModalOpen(true)
  }

  async function handleSubmitProduct(e) {
    e.preventDefault()
    const payload = {
      ...(editingProduct?.id ? { id: editingProduct.id } : {}),
      name: formData.name,
      barcode: formData.barcode,
      rfid_uid: formData.rfid_uid || formData.barcode,
      price: parseFloat(formData.price),
      expected_weight_g: parseFloat(formData.expected_weight_g),
      active: formData.active,
      description: formData.description,
      image_url: formData.image_url || '📦'
    }
    await saveProductToDB(payload)
    setIsModalOpen(false)
    onProductsChanged?.()
  }

  async function handleDeleteProduct(id) {
    if (!window.confirm('¿Desea eliminar este producto del catálogo?')) return
    await deleteProductFromDB(id)
    onProductsChanged?.()
  }

  // Tecla Escape para cerrar modales
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedProductForDetail(null)
        setIsModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="productos-page">
      {/* =========================================================
          1. HEADER Y SELECTOR DE PERÍODO TEMPORAL
         ========================================================= */}
      <div className="resumen-top-bar" style={{ marginBottom: 20 }}>
        <div className="resumen-title-group">
          <h1>Gestión de Productos</h1>
          <p>Catálogo maestro de artículos, rendimiento de ventas y análisis de demanda.</p>
        </div>

        <div className="resumen-actions-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="resumen-date-presets" role="group" aria-label="Selector de período de rendimiento">
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
              onClick={() => {
                loadSalesData()
                onProductsChanged?.()
              }}
              disabled={loadingSales}
              title="Refrescar datos en vivo"
              style={{ fontSize: 12, padding: '7px 12px' }}
            >
              <RefreshCw size={13} className={loadingSales ? 'spin-icon' : ''} />
              <span>{loadingSales ? 'Actualizando...' : 'Actualizar'}</span>
            </button>
          </div>

          {/* Formulario de fechas personalizadas */}
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

          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={12} color="var(--peach)" />
            <span>
              Período de análisis: <strong>{activeRange.label}</strong> (America/La_Paz UTC-4)
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================
          2. TARJETAS DE RESUMEN DE PRODUCTOS CON TILT + GLARE
         ========================================================= */}
      <div className="resumen-kpis-grid" style={{ marginBottom: 24 }}>
        {/* KPI 1: Productos registrados */}
        <TiltGlare maxTilt={5}>
          <div className="kpi-stat-card ingresos">
            <div className="kpi-stat-header">
              <h3>Productos registrados</h3>
              <GlassIcon icon={Package} color="sunny" size={44} />
            </div>
            <div className="kpi-stat-body">
              <div className="kpi-stat-value">
                {summaryCounts.total}{' '}
                <small style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>ítems</small>
              </div>
              <div style={{ fontSize: 12, color: '#8c7374', marginTop: 4 }}>
                Total de productos en la base de datos
              </div>
            </div>
          </div>
        </TiltGlare>

        {/* KPI 2: Productos activos */}
        <TiltGlare maxTilt={5}>
          <div className="kpi-stat-card ventas">
            <div className="kpi-stat-header">
              <h3>Productos activos</h3>
              <GlassIcon icon={CheckCircle} color="mint" size={44} />
            </div>
            <div className="kpi-stat-body">
              <div className="kpi-stat-value" style={{ color: '#136350' }}>
                {summaryCounts.active}{' '}
                <small style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>disponibles</small>
              </div>
              <div style={{ fontSize: 12, color: '#8c7374', marginTop: 4 }}>
                Habilitados para autocobro en la estación IoT
              </div>
            </div>
          </div>
        </TiltGlare>

        {/* KPI 3: Productos inactivos */}
        <TiltGlare maxTilt={5}>
          <div className="kpi-stat-card ticket">
            <div className="kpi-stat-header">
              <h3>Productos inactivos</h3>
              <GlassIcon icon={Minus} color="coral" size={44} />
            </div>
            <div className="kpi-stat-body">
              <div className="kpi-stat-value" style={{ color: '#8a3333' }}>
                {summaryCounts.inactive}{' '}
                <small style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>deshabilitados</small>
              </div>
              <div style={{ fontSize: 12, color: '#8c7374', marginTop: 4 }}>
                Fuera de línea o pausados temporalmente
              </div>
            </div>
          </div>
        </TiltGlare>
      </div>

      {/* =========================================================
          3. RENDIMIENTO DE PRODUCTOS EN EL PERÍODO
         ========================================================= */}
      <div className="product-performance-section">
        <div className="product-performance-header">
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
              Rendimiento en el Período Evaluado
            </h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Basado exclusivamente en compras con estado <strong>Pagada</strong> entre el inicio y fin del período.
            </span>
          </div>

          {/* Selector de modo de ranking */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: 3, borderRadius: 'var(--radius-full)' }}>
            <button
              type="button"
              className={`ventas-status-pill ${rankingMode === 'units' ? 'active' : ''}`}
              onClick={() => setRankingMode('units')}
              style={{ fontSize: 11, padding: '5px 12px' }}
            >
              Más vendidos (Unidades)
            </button>
            <button
              type="button"
              className={`ventas-status-pill ${rankingMode === 'revenue' ? 'active' : ''}`}
              onClick={() => setRankingMode('revenue')}
              style={{ fontSize: 11, padding: '5px 12px' }}
            >
              Mayores ingresos (Bs.)
            </button>
          </div>
        </div>

        <div className="product-performance-grid">
          {/* Columna Izquierda: Ranking (Más vendidos o Mayores ingresos) */}
          <div className="product-ranking-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink)' }}>
                {rankingMode === 'units' ? 'Ranking: Más Vendidos' : 'Ranking: Mayores Ingresos'}
              </strong>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {rankedProducts.length} {rankedProducts.length === 1 ? 'producto' : 'productos'} con ventas
              </span>
            </div>

            {rankedProducts.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                <ShoppingBag size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.5 }} />
                No se registraron ventas pagadas de productos en el período seleccionado.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                {(() => {
                  const topSlice = rankedProducts.slice(0, 5)
                  const maxVal = Math.max(
                    1,
                    ...topSlice.map(p => (rankingMode === 'units' ? p.periodUnits : p.periodRevenue))
                  )
                  return topSlice.map((p, index) => {
                    const badgeClass =
                      index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : ''
                    const curVal = rankingMode === 'units' ? p.periodUnits : p.periodRevenue
                    const pct = Math.min(100, Math.max(8, Math.round((curVal / maxVal) * 100)))

                    return (
                      <div
                        key={p.id}
                        className="product-ranking-row"
                        onClick={() => setSelectedProductForDetail(p)}
                        style={{ cursor: 'pointer', position: 'relative' }}
                        title="Clic para ver detalle del producto"
                      >
                        <div
                          className="product-ranking-progress-bar"
                          style={{ width: `${pct}%` }}
                          aria-hidden="true"
                        />

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, position: 'relative', zIndex: 1 }}>
                          <div className={`product-ranking-badge ${badgeClass}`}>#{index + 1}</div>
                          <span style={{ fontSize: 20 }}>{p.image_url || '📦'}</span>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 800, fontSize: 13, color: '#3b2829', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 11, color: '#8c7374' }}>
                              Código: {p.barcode || 'N/A'}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}>
                          {rankingMode === 'units' ? (
                            <>
                              <strong style={{ display: 'block', color: '#3b2829', fontSize: 13, fontWeight: 800 }}>
                                {p.periodUnits} uds
                              </strong>
                              <small style={{ color: '#8c7374', fontSize: 11, fontWeight: 600 }}>
                                {formatBs(p.periodRevenue)}
                              </small>
                            </>
                          ) : (
                            <>
                              <strong style={{ display: 'block', color: 'var(--coral-dark)', fontSize: 13, fontWeight: 800 }}>
                                {formatBs(p.periodRevenue)}
                              </strong>
                              <small style={{ color: '#8c7374', fontSize: 11, fontWeight: 600 }}>
                                {p.periodUnits} uds vendidas
                              </small>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>

          {/* Columna Derecha: Productos sin ventas */}
          <div className="product-no-sales-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink)' }}>
                Productos Activos Sin Ventas
              </strong>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {noSalesActiveProducts.length} {noSalesActiveProducts.length === 1 ? 'artículo' : 'artículos'}
              </span>
            </div>

            {noSalesActiveProducts.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', background: '#ffffff', borderRadius: 'var(--radius-sm)', border: '1px solid #e2e8f0', color: 'var(--mint-dark)', fontSize: 13 }}>
                <CheckCircle size={28} style={{ margin: '0 auto 8px', display: 'block' }} />
                <strong>¡Excelente rendimiento!</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Todos los productos activos registraron ventas en este período.
                </p>
              </div>
            ) : (
              <div className="product-no-sales-list">
                {noSalesActiveProducts.map((p) => (
                  <div
                    key={p.id}
                    className="product-no-sales-item"
                    onClick={() => setSelectedProductForDetail(p)}
                    style={{ cursor: 'pointer' }}
                    title="Clic para ver detalle"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 18 }}>{p.image_url || '📦'}</span>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {p.barcode || 'Sin código'}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>
                        0 ventas
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================
          4. CATÁLOGO DE PRODUCTOS (TABLA CRUD AMPLIADA)
         ========================================================= */}
      <div className="recent-sales-section" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Barra de herramientas */}
        <div className="ventas-filter-controls-bar">
          {/* Búsqueda */}
          <div className="ventas-search-box">
            <Search size={15} className="ventas-search-icon" />
            <input
              type="text"
              className="ventas-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, código de barras o RFID..."
            />
          </div>

          {/* Filtros de estado */}
          <div className="ventas-status-filter-pills" role="group" aria-label="Filtrar por estado">
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginRight: 4 }}>
              Catálogo:
            </span>
            {[
              { id: 'TODOS', label: 'Todos' },
              { id: 'ACTIVOS', label: 'Activos' },
              { id: 'INACTIVOS', label: 'Inactivos' }
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                className={`ventas-status-pill ${statusFilter === st.id ? 'active' : ''}`}
                onClick={() => setStatusFilter(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Botón de Agregar Producto */}
          <button
            type="button"
            className="btn-primary"
            style={{ width: 'auto', padding: '8px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13, gap: 6 }}
            onClick={openCreateModal}
          >
            <Plus size={15} />
            <span>Nuevo Producto</span>
          </button>
        </div>

        {/* Tabla de Productos */}
        <div className="data-table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table className="custom-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Producto</th>
                <th>Código Barra / RFID</th>
                <th>Precio actual</th>
                <th>Peso esperado</th>
                <th>Unidades vendidas</th>
                <th>Ingresos período</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <Package size={34} color="var(--border)" />
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)' }}>
                        No se encontraron productos que coincidan con la búsqueda o filtro.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p) => {
                  const m = productMetrics[p.id] || { periodUnits: 0, periodRevenue: 0 }
                  const isActive = p.active !== false

                  return (
                    <tr
                      key={p.id}
                      className="purchase-row-clickable"
                      onClick={() => setSelectedProductForDetail(p)}
                      title="Clic para ver estadísticas detalladas"
                    >
                      <td>
                        <strong style={{ fontFamily: 'monospace', color: 'var(--ink)', fontSize: 13 }}>
                          #{p.id}
                        </strong>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 22 }}>{p.image_url || '📦'}</span>
                          <div>
                            <strong style={{ display: 'block', fontSize: 13, color: 'var(--ink)' }}>
                              {p.name}
                            </strong>
                            <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                              {p.description || 'Sin descripción'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>
                          <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 3 }}>
                            {p.barcode || 'N/A'}
                          </code>
                          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                            Tag: {p.rfid_uid || 'N/A'}
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong style={{ color: 'var(--ink)', fontSize: 13 }}>
                          {formatBs(p.price)}
                        </strong>
                      </td>
                      <td>
                        <span style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>
                          {p.expected_weight_g} g
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: m.periodUnits > 0 ? 'var(--ink)' : 'var(--muted)', fontSize: 13 }}>
                          {m.periodUnits} uds
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: m.periodRevenue > 0 ? 'var(--coral-dark)' : 'var(--muted)', fontSize: 13 }}>
                          {formatBs(m.periodRevenue)}
                        </strong>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: isActive ? 'var(--mint-light)' : '#f1f5f9',
                            color: isActive ? 'var(--mint-dark)' : 'var(--muted)'
                          }}
                        >
                          {isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedProductForDetail(p)}
                            className="btn-ghost"
                            style={{ padding: '6px 10px', fontSize: 12 }}
                            title="Ver detalles y compras del producto"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="btn-ghost"
                            style={{ padding: '6px 10px', fontSize: 12 }}
                            title="Editar producto"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p.id)}
                            className="btn-ghost"
                            style={{ padding: '6px 10px', color: 'var(--coral)', fontSize: 12 }}
                            title="Eliminar producto"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de paginación */}
        <div className="table-pagination-bar">
          <div>
            Mostrando{' '}
            <strong>
              {filteredProducts.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
            </strong>{' '}
            a{' '}
            <strong>
              {Math.min(currentPage * itemsPerPage, filteredProducts.length)}
            </strong>{' '}
            de <strong>{filteredProducts.length}</strong> productos registrados
          </div>

          <div className="pagination-controls">
            <button
              type="button"
              className="pagination-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            >
              <ChevronLeft size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
              Anterior
            </button>
            <span style={{ fontWeight: 700, color: 'var(--ink)', padding: '0 8px' }}>
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              className="pagination-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            >
              Siguiente
              <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 2 }} />
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================
          5. MODAL DE DETALLE DE PRODUCTO Y RENDIMIENTO
         ========================================================= */}
      {selectedProductForDetail && (() => {
        const p = selectedProductForDetail
        const m = productMetrics[p.id] || {
          periodUnits: 0,
          periodRevenue: 0,
          allTimeUnits: 0,
          allTimeRevenue: 0,
          allTimePurchasesCount: 0,
          recentPurchases: []
        }
        const avgUnits =
          m.allTimePurchasesCount > 0 ? (m.allTimeUnits / m.allTimePurchasesCount).toFixed(1) : '0.0'

        return (
          <div
            className="purchase-detail-modal-overlay"
            onClick={() => setSelectedProductForDetail(null)}
          >
            <div
              className="purchase-detail-modal-container"
              style={{ maxWidth: 700 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-detail-modal-title"
            >
              {/* Header */}
              <div className="purchase-detail-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 32 }}>{p.image_url || '📦'}</span>
                  <div>
                    <h2 id="product-detail-modal-title" style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
                      {p.name}
                    </h2>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Código: <code>{p.barcode || 'N/A'}</code> | Tag RFID: <code>{p.rfid_uid || 'N/A'}</code>
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: p.active !== false ? 'var(--mint-light)' : '#f1f5f9',
                      color: p.active !== false ? 'var(--mint-dark)' : 'var(--muted)'
                    }}
                  >
                    {p.active !== false ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProductForDetail(null)}
                    className="btn-ghost"
                    style={{ padding: 6, borderRadius: '50%', minWidth: 'auto', border: 'none' }}
                    title="Cerrar ventana"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="purchase-detail-modal-body">
                {/* Cuadrícula de información del producto y métricas de venta */}
                <div className="purchase-meta-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div className="purchase-meta-item">
                    <span className="meta-label">Precio Catálogo</span>
                    <span className="meta-value">{formatBs(p.price)}</span>
                  </div>

                  <div className="purchase-meta-item">
                    <span className="meta-label">Peso Esperado</span>
                    <span className="meta-value">{p.expected_weight_g} g</span>
                  </div>

                  <div className="purchase-meta-item">
                    <span className="meta-label">Promedio por Compra</span>
                    <span className="meta-value">{avgUnits} uds / compra</span>
                  </div>

                  <div className="purchase-meta-item">
                    <span className="meta-label">Ventas en Período</span>
                    <span className="meta-value" style={{ color: 'var(--ink)' }}>
                      {m.periodUnits} uds ({formatBs(m.periodRevenue)})
                    </span>
                  </div>

                  <div className="purchase-meta-item">
                    <span className="meta-label">Total Unidades (Histórico)</span>
                    <span className="meta-value" style={{ color: 'var(--ink)' }}>
                      {m.allTimeUnits} unidades
                    </span>
                  </div>

                  <div className="purchase-meta-item">
                    <span className="meta-label">Ingresos Totales (Histórico)</span>
                    <span className="meta-value" style={{ color: 'var(--coral-dark)', fontWeight: 800 }}>
                      {formatBs(m.allTimeRevenue)}
                    </span>
                  </div>
                </div>

                {/* Historial de Compras Recientes con este producto */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink)' }}>
                      Compras Recientes con este Producto ({m.recentPurchases.length})
                    </h4>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Datos históricos guardados en <code>purchase_items</code>
                    </span>
                  </div>

                  {m.recentPurchases.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: 8, color: 'var(--muted)', fontSize: 13 }}>
                      Este producto no registra compras pagadas aún en el sistema.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                      <table className="purchase-items-table">
                        <thead>
                          <tr>
                            <th>Compra</th>
                            <th>Fecha</th>
                            <th>Nombre en Venta</th>
                            <th style={{ textAlign: 'center' }}>Cantidad</th>
                            <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                            <th style={{ textAlign: 'right' }}>Peso Medido</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.recentPurchases.slice(0, 15).map((rec, idx) => (
                            <tr key={`${rec.purchaseId}-${idx}`}>
                              <td>
                                <strong style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                  #{rec.purchaseId}
                                </strong>
                              </td>
                              <td style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                                {formatShortDateTimeLaPaz(rec.purchaseDate)}
                              </td>
                              <td style={{ fontSize: 12, fontWeight: 600 }}>
                                {rec.productName}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                                  x{rec.quantity}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontSize: 12 }}>
                                {formatBs(rec.unitPrice)}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ink)', fontSize: 12 }}>
                                {formatBs(rec.subtotal)}
                              </td>
                              <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                                {rec.measuredWeightG != null ? `${rec.measuredWeightG} g` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="purchase-detail-modal-footer">
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Período evaluado: {activeRange.label} (America/La_Paz)
                </span>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setSelectedProductForDetail(null)}
                  style={{ width: 'auto', padding: '8px 20px' }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* =========================================================
          6. MODAL CRUD: CREAR / EDITAR PRODUCTO (SIN STOCK)
         ========================================================= */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>
              {editingProduct ? 'Editar Producto' : 'Nuevo Producto en Catálogo'}
            </h2>
            <form onSubmit={handleSubmitProduct}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 10, marginBottom: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Ícono / Emoji</label>
                  <input
                    type="text"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    maxLength={2}
                    style={{ textAlign: 'center', fontSize: 22 }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Nombre del Producto *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej. Leche Entera 1 Litro"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Código de Barras *</label>
                  <input
                    type="text"
                    required
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="7771234001"
                  />
                </div>
                <div className="field">
                  <label>Tag RFID (RC522) *</label>
                  <input
                    type="text"
                    required
                    value={formData.rfid_uid}
                    onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value })}
                    placeholder="TAG_LECHE_1L"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Precio (Bs.) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="7.50"
                  />
                </div>
                <div className="field">
                  <label>Masa Esperada (g) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={formData.expected_weight_g}
                    onChange={(e) => setFormData({ ...formData, expected_weight_g: e.target.value })}
                    placeholder="1025.0"
                  />
                </div>
              </div>

              <div className="field">
                <label>Descripción</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detalles del producto o presentación"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <input
                  type="checkbox"
                  id="activeProd"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  style={{ width: 'auto', cursor: 'pointer' }}
                />
                <label htmlFor="activeProd" style={{ margin: 0, textTransform: 'none', cursor: 'pointer', fontSize: 13 }}>
                  Producto activo y disponible para autocobro
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-ghost" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}>
                  {editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
