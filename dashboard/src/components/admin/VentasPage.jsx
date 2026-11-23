import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  DollarSign,
  Receipt,
  CreditCard,
  Calendar,
  RefreshCw,
  Search,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  ShoppingBag,
  Package,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { supabase, getPurchasesFromDB } from '../../supabaseClient'
import {
  TIMEZONE,
  getDateRange,
  toLaPazDateInput,
  isPaidPurchase,
  getPurchaseFinishedDate,
  getPurchaseStartedDate,
  translatePurchaseStatus,
  formatExactDateTimeLaPaz,
  formatShortDateTimeLaPaz,
  formatBs
} from '../../utils/resumenAnalytics'

export default function VentasPage({
  purchases: initialPurchases = [],
  onRefresh: parentOnRefresh,
  loadingPurchases: parentLoading = false
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

  // -------------------------------------------------------------
  // 2. ESTADO DE DATOS (SUPABASE + REALTIME + FALLBACK)
  // -------------------------------------------------------------
  const [purchasesList, setPurchasesList] = useState(initialPurchases)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Carga local de compras completas
  const loadPurchases = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const data = await getPurchasesFromDB(150)
      if (data && data.length > 0) {
        setPurchasesList(data)
      } else if (initialPurchases && initialPurchases.length > 0) {
        setPurchasesList(initialPurchases)
      }
    } catch (err) {
      console.warn('Error cargando historial de ventas:', err)
      if (initialPurchases && initialPurchases.length > 0) {
        setPurchasesList(initialPurchases)
      } else {
        try {
          const local = JSON.parse(localStorage.getItem('local_purchases') || '[]')
          setPurchasesList(local)
        } catch (e) {
          setErrorMsg('No se pudieron recuperar las compras registradas.')
        }
      }
    } finally {
      setLoading(false)
    }
  }, [initialPurchases])

  // Sincronizar si las props iniciales cambian
  useEffect(() => {
    if (initialPurchases && initialPurchases.length > 0) {
      setPurchasesList(prev => {
        if (!prev || prev.length === 0) return initialPurchases
        // Mantener la versión más rica o actualizada
        return prev
      })
    }
  }, [initialPurchases])

  // Cargar compras al montar
  useEffect(() => {
    loadPurchases()
  }, [loadPurchases])

  // Suscripción Realtime en Supabase
  useEffect(() => {
    const channel = supabase
      .channel('ventas-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => {
        loadPurchases()
        if (parentOnRefresh) parentOnRefresh()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadPurchases, parentOnRefresh])

  // -------------------------------------------------------------
  // 3. FILTROS DE TABLA (ESTADO, BÚSQUEDA Y PAGINACIÓN)
  // -------------------------------------------------------------
  const [statusFilter, setStatusFilter] = useState('TODAS')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Restablecer paginación al cambiar cualquier filtro
  useEffect(() => {
    setCurrentPage(1)
  }, [datePreset, appliedCustomStart, appliedCustomEnd, statusFilter, searchTerm])

  const handleApplyCustomDates = (e) => {
    e.preventDefault()
    if (!customStart || !customEnd) return
    if (customStart > customEnd) {
      alert('La fecha inicial no puede ser posterior a la fecha final.')
      return
    }
    setAppliedCustomStart(customStart)
    setAppliedCustomEnd(customEnd)
    setDatePreset('PERSONALIZADO')
  }

  // -------------------------------------------------------------
  // 4. LÓGICA DE FILTRADO POR PERÍODO Y EVALUACIÓN DE KPIS
  // Regla: finished_at para pagadas, started_at para pendientes/en proceso
  // -------------------------------------------------------------
  const getPurchaseEffectiveDate = useCallback((purchase) => {
    if (!purchase) return null
    if (isPaidPurchase(purchase)) {
      return getPurchaseFinishedDate(purchase) || getPurchaseStartedDate(purchase)
    }
    return getPurchaseStartedDate(purchase) || getPurchaseFinishedDate(purchase)
  }, [])

  // Compras dentro del período seleccionado
  const periodPurchases = useMemo(() => {
    const startMs = activeRange.currentStart.getTime()
    const endMs = activeRange.currentEnd.getTime()

    return purchasesList.filter((p) => {
      const effDate = getPurchaseEffectiveDate(p)
      if (!effDate) return false
      const t = effDate.getTime()
      return t >= startMs && t < endMs
    })
  }, [purchasesList, activeRange, getPurchaseEffectiveDate])

  // Métricas del Resumen para el período:
  // - Ingresos: Suma de purchases.total de pagadas (excluyendo canceladas)
  // - Ventas realizadas: Conteo de pagadas (excluyendo canceladas)
  // - Ticket promedio: Ingresos pagados / Conteo de ventas pagadas
  const summaryKpis = useMemo(() => {
    let revenue = 0
    let paidCount = 0

    periodPurchases.forEach((p) => {
      if (isPaidPurchase(p)) {
        revenue += parseFloat(p.total) || 0
        paidCount += 1
      }
    })

    const averageTicket = paidCount > 0 ? revenue / paidCount : 0

    return {
      revenue,
      paidCount,
      averageTicket
    }
  }, [periodPurchases])

  // -------------------------------------------------------------
  // 5. FILTRADO COMPLETO PARA LA TABLA DE HISTORIAL
  // -------------------------------------------------------------
  const filteredPurchases = useMemo(() => {
    const rawQuery = searchTerm.trim().toLowerCase().replace(/^#/, '')

    return periodPurchases.filter((p) => {
      // 1. Filtro por Estado
      if (statusFilter !== 'TODAS') {
        const info = translatePurchaseStatus(p.status)
        const matchStatus =
          info.key === statusFilter.toLowerCase() ||
          info.label.toLowerCase() === statusFilter.toLowerCase()
        if (!matchStatus) return false
      }

      // 2. Filtro por Búsqueda (ID, Cliente, Método o Artículo)
      if (rawQuery) {
        const idMatch = String(p.id).toLowerCase().includes(rawQuery)
        const clientMatch = p.customer_id && String(p.customer_id).toLowerCase().includes(rawQuery)
        const itemMatch = p.purchase_items?.some((it) =>
          it.product_name?.toLowerCase().includes(rawQuery)
        )
        if (!idMatch && !clientMatch && !itemMatch) {
          return false
        }
      }

      return true
    })
  }, [periodPurchases, statusFilter, searchTerm])

  // Ordenamiento: más recientes primero
  const sortedPurchases = useMemo(() => {
    return [...filteredPurchases].sort((a, b) => {
      const tA = (getPurchaseStartedDate(a) || getPurchaseFinishedDate(a))?.getTime() || 0
      const tB = (getPurchaseStartedDate(b) || getPurchaseFinishedDate(b))?.getTime() || 0
      return tB - tA
    })
  }, [filteredPurchases])

  // Paginación
  const totalPages = Math.ceil(sortedPurchases.length / itemsPerPage) || 1
  const paginatedPurchases = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return sortedPurchases.slice(start, start + itemsPerPage)
  }, [sortedPurchases, currentPage, itemsPerPage])

  // -------------------------------------------------------------
  // 6. MODAL DE DETALLE DE COMPRA
  // -------------------------------------------------------------
  const [selectedPurchase, setSelectedPurchase] = useState(null)
  const [loadingItems, setLoadingItems] = useState(false)
  const [detailItems, setDetailItems] = useState([])

  const handleOpenDetail = useCallback(async (purchase) => {
    setSelectedPurchase(purchase)
    if (purchase.purchase_items && purchase.purchase_items.length > 0) {
      setDetailItems(purchase.purchase_items)
      return
    }

    // Si no vinieron los items anidados, intentar consultarlos directamente
    setLoadingItems(true)
    try {
      const { data, error } = await supabase
        .from('purchase_items')
        .select('*')
        .eq('purchase_id', purchase.id)

      if (!error && data && data.length > 0) {
        setDetailItems(data)
      } else {
        setDetailItems([])
      }
    } catch (e) {
      setDetailItems([])
    } finally {
      setLoadingItems(false)
    }
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedPurchase(null)
    setDetailItems([])
  }, [])

  // Cerrar modal con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleCloseDetail()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCloseDetail])

  const isLoadingTotal = loading || parentLoading

  return (
    <div className="ventas-page">
      {/* =========================================================
          1. HEADER Y SELECTOR DE PERÍODO
         ========================================================= */}
      <div className="resumen-top-bar" style={{ marginBottom: 20 }}>
        <div className="resumen-title-group">
          <h1>Gestión de Ventas</h1>
          <p>Supervisa compras, inspecciona transacciones y consulta el desglose de artículos vendidos.</p>
        </div>

        <div className="resumen-actions-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="resumen-date-presets" role="group" aria-label="Selector de período de ventas">
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
                loadPurchases()
                if (parentOnRefresh) parentOnRefresh()
              }}
              disabled={isLoadingTotal}
              title="Actualizar transacciones en vivo"
              style={{ fontSize: 12, padding: '7px 12px' }}
            >
              <RefreshCw size={13} className={isLoadingTotal ? 'spin-icon' : ''} />
              <span>{isLoadingTotal ? 'Actualizando...' : 'Actualizar'}</span>
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
              Período activo: <strong>{activeRange.label}</strong> (Hora de Bolivia / America/La_Paz)
            </span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: '10px 16px', background: 'var(--coral-light)', color: 'var(--coral-dark)', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          {errorMsg}
        </div>
      )}

      {/* =========================================================
          2. SUMMARY CARDS (INGRESOS, VENTAS REALIZADAS, TICKET PROMEDIO)
         ========================================================= */}
      <div className="resumen-kpis-grid" style={{ marginBottom: 24 }}>
        {/* KPI 1: Ingresos */}
        <div className="kpi-stat-card ingresos">
          <div className="kpi-stat-header">
            <h3>Ingresos</h3>
            <div className="kpi-stat-icon-wrapper">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="kpi-stat-body">
            <div className="kpi-stat-value">{formatBs(summaryKpis.revenue)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Total de compras pagadas en el período
            </div>
          </div>
        </div>

        {/* KPI 2: Ventas realizadas */}
        <div className="kpi-stat-card ventas">
          <div className="kpi-stat-header">
            <h3>Ventas realizadas</h3>
            <div className="kpi-stat-icon-wrapper">
              <Receipt size={20} />
            </div>
          </div>
          <div className="kpi-stat-body">
            <div className="kpi-stat-value">
              {summaryKpis.paidCount}{' '}
              <small style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>
                {summaryKpis.paidCount === 1 ? 'venta pagada' : 'ventas pagadas'}
              </small>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Excluye canceladas y compras pendientes
            </div>
          </div>
        </div>

        {/* KPI 3: Ticket promedio */}
        <div className="kpi-stat-card ticket">
          <div className="kpi-stat-header">
            <h3>Ticket promedio</h3>
            <div className="kpi-stat-icon-wrapper">
              <CreditCard size={20} />
            </div>
          </div>
          <div className="kpi-stat-body">
            <div className="kpi-stat-value">{formatBs(summaryKpis.averageTicket)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Ingresos entre compras pagadas
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          3. HISTORIAL DE COMPRAS (TABLA PRINCIPAL CON FILTROS)
         ========================================================= */}
      <div className="recent-sales-section" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Barra de Filtros y Búsqueda */}
        <div className="ventas-filter-controls-bar">
          {/* Búsqueda por ID / Cliente */}
          <div className="ventas-search-box">
            <Search size={15} className="ventas-search-icon" />
            <input
              type="text"
              className="ventas-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por ID (#123), cliente o producto..."
            />
          </div>

          {/* Filtro de Estado en Pills */}
          <div className="ventas-status-filter-pills" role="group" aria-label="Filtrar por estado">
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginRight: 4 }}>
              Estado:
            </span>
            {[
              { id: 'TODAS', label: 'Todas' },
              { id: 'INICIADA', label: 'Iniciada' },
              { id: 'EN PROCESO', label: 'En proceso' },
              { id: 'PENDIENTE', label: 'Pendiente' },
              { id: 'PAGADA', label: 'Pagada' },
              { id: 'CANCELADA', label: 'Cancelada' }
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
        </div>

        {/* Tabla de Historial */}
        <div className="data-table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table className="custom-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha de inicio</th>
                <th>Fecha de finalización</th>
                <th>Total</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPurchases.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <ShoppingBag size={34} color="var(--border)" />
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)' }}>
                        No se encontraron compras en el período o criterio seleccionado.
                      </p>
                      <span style={{ fontSize: 12 }}>
                        Intenta ampliar el rango de fechas o cambiar el estado en los filtros superiores.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedPurchases.map((pur) => {
                  const statusInfo = translatePurchaseStatus(pur.status)
                  const startedStr = pur.started_at || pur.created_at
                  const finishedStr = pur.finished_at || (isPaidPurchase(pur) ? pur.created_at : null)

                  return (
                    <tr
                      key={pur.id}
                      className="purchase-row-clickable"
                      onClick={() => handleOpenDetail(pur)}
                      title="Clic para ver detalle completo"
                    >
                      <td>
                        <strong style={{ fontFamily: 'monospace', color: 'var(--ink)', fontSize: 13 }}>
                          #{pur.id}
                        </strong>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <Clock size={13} color="var(--muted)" />
                          <span>{formatShortDateTimeLaPaz(startedStr)}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 13, color: finishedStr ? 'var(--ink)' : 'var(--muted)' }}>
                          {finishedStr ? formatShortDateTimeLaPaz(finishedStr) : '—'}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: 'var(--coral-dark)', fontSize: 14 }}>
                          {formatBs(pur.total)}
                        </strong>
                      </td>
                      <td>
                        <span className={statusInfo.className}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenDetail(pur)
                          }}
                          style={{ fontSize: 12, padding: '5px 10px', gap: 6 }}
                        >
                          <Eye size={13} />
                          <span>Ver detalle</span>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de Paginación */}
        <div className="table-pagination-bar">
          <div>
            Mostrando{' '}
            <strong>
              {sortedPurchases.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
            </strong>{' '}
            a{' '}
            <strong>
              {Math.min(currentPage * itemsPerPage, sortedPurchases.length)}
            </strong>{' '}
            de <strong>{sortedPurchases.length}</strong> transacciones encontradas
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
          4. MODAL DE DETALLE DE COMPRA
         ========================================================= */}
      {selectedPurchase && (
        <div className="purchase-detail-modal-overlay" onClick={handleCloseDetail}>
          <div
            className="purchase-detail-modal-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-detail-title"
          >
            {/* Header */}
            <div className="purchase-detail-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--peach-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#925d10'
                  }}
                >
                  <Receipt size={18} />
                </div>
                <div>
                  <h2 id="purchase-detail-title" style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
                    Detalle de Transacción #{selectedPurchase.id}
                  </h2>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Registro histórico y desglose de mercadería
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={translatePurchaseStatus(selectedPurchase.status).className}>
                  {translatePurchaseStatus(selectedPurchase.status).label}
                </span>
                <button
                  type="button"
                  onClick={handleCloseDetail}
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
              {/* Metadatos de la Compra */}
              <div className="purchase-meta-grid">
                <div className="purchase-meta-item">
                  <span className="meta-label">ID de Transacción</span>
                  <span className="meta-value" style={{ fontFamily: 'monospace' }}>#{selectedPurchase.id}</span>
                </div>

                <div className="purchase-meta-item">
                  <span className="meta-label">Estado</span>
                  <span className="meta-value">
                    <span className={translatePurchaseStatus(selectedPurchase.status).className}>
                      {translatePurchaseStatus(selectedPurchase.status).label}
                    </span>
                  </span>
                </div>

                <div className="purchase-meta-item">
                  <span className="meta-label">Fecha de Inicio</span>
                  <span className="meta-value">
                    {formatExactDateTimeLaPaz(selectedPurchase.started_at || selectedPurchase.created_at)}
                  </span>
                </div>

                <div className="purchase-meta-item">
                  <span className="meta-label">Fecha de Finalización</span>
                  <span className="meta-value">
                    {selectedPurchase.finished_at
                      ? formatExactDateTimeLaPaz(selectedPurchase.finished_at)
                      : (isPaidPurchase(selectedPurchase) ? formatExactDateTimeLaPaz(selectedPurchase.created_at) : 'En curso / Pendiente')}
                  </span>
                </div>

                <div className="purchase-meta-item">
                  <span className="meta-label">Cliente</span>
                  <span className="meta-value">
                    {selectedPurchase.customer_id || 'Cliente General'}
                  </span>
                </div>

                <div className="purchase-meta-item">
                  <span className="meta-label">Peso Medido en Balanza (HX711)</span>
                  <span className="meta-value">
                    {selectedPurchase.measured_weight_g ?? selectedPurchase.total_weight ?? '0'} g
                  </span>
                </div>

                <div className="purchase-meta-item">
                  <span className="meta-label">Total Liquidado</span>
                  <span className="meta-value" style={{ color: 'var(--coral-dark)', fontSize: 16, fontWeight: 800 }}>
                    {formatBs(selectedPurchase.total)}
                  </span>
                </div>
              </div>

              {/* Artículos Adquiridos */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink)' }}>
                    Artículos Registrados ({detailItems.length})
                  </h4>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Valores guardados al momento de la venta
                  </span>
                </div>

                {loadingItems ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Cargando artículos de la compra...
                  </div>
                ) : detailItems.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: 8, color: 'var(--muted)', fontSize: 13 }}>
                    No se encontraron detalles de artículos asociados a esta compra.
                  </div>
                ) : (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    <table className="purchase-items-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th style={{ textAlign: 'center' }}>Cantidad</th>
                          <th style={{ textAlign: 'right' }}>Peso Medido</th>
                          <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                          <th style={{ textAlign: 'right' }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailItems.map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                {item.product_name || `Item #${item.product_id || idx + 1}`}
                              </div>
                              {item.product_id && (
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                  Código ID: {item.product_id}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 12 }}>
                                x{item.quantity}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--ink-secondary)' }}>
                              {item.measured_weight_g != null ? `${item.measured_weight_g} g` : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {formatBs(item.unit_price)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                              {formatBs(item.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2} style={{ color: 'var(--ink-secondary)' }}>
                            Total de unidades: <strong>{detailItems.reduce((acc, it) => acc + (it.quantity || 1), 0)}</strong>
                          </td>
                          <td colSpan={2} style={{ textAlign: 'right', color: 'var(--ink)' }}>
                            Total de la Compra:
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--coral-dark)', fontSize: 15 }}>
                            {formatBs(selectedPurchase.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="purchase-detail-modal-footer">
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                Horario registrado en America/La_Paz (UTC-4)
              </span>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCloseDetail}
                style={{ width: 'auto', padding: '8px 20px' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
