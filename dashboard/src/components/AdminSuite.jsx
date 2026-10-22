import { useState, useEffect, useMemo } from 'react'
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertTriangle,
  CheckCircle,
  FileText,
  DollarSign,
  Scale,
  Activity,
  Radio,
  Cpu,
  Layers,
  ArrowUpDown,
  RefreshCw,
  Sliders,
  TrendingUp,
  Receipt
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
import {
  saveProductToDB,
  deleteProductFromDB,
  getPurchasesFromDB,
  getSensorReadingsFromDB,
  supabase
} from '../supabaseClient'

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

export default function AdminSuite({ products, onProductsChanged }) {
  const [activeTab, setActiveTab] = useState('inventory') // 'inventory' | 'sales' | 'telemetry'

  // Búsqueda y Filtros de Inventario
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStockLow, setFilterStockLow] = useState(false)

  // Modales de Producto (Crear / Editar)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    rfid_uid: '',
    price: '',
    expected_weight_g: '',
    stock: '',
    active: true,
    description: '',
    image_url: '📦'
  })

  // Historial de Compras (Salida de Mercadería)
  const [purchases, setPurchases] = useState([])
  const [loadingPurchases, setLoadingPurchases] = useState(false)

  // Telemetría IoT en Vivo
  const [readings, setReadings] = useState([])
  const [loadingReadings, setLoadingReadings] = useState(false)

  // Cargar datos
  useEffect(() => {
    loadPurchases()
    loadTelemetry()

    // Suscripción Realtime a nuevas compras y lecturas
    const channelPurchases = supabase
      .channel('admin-purchases-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchases' }, () => {
        loadPurchases()
      })
      .subscribe()

    const channelSensors = supabase
      .channel('admin-sensor-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_readings' }, (payload) => {
        setReadings(prev => [payload.new, ...prev].slice(0, 30))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channelPurchases)
      supabase.removeChannel(channelSensors)
    }
  }, [])

  async function loadPurchases() {
    setLoadingPurchases(true)
    const data = await getPurchasesFromDB()
    setPurchases(data || [])
    setLoadingPurchases(false)
  }

  async function loadTelemetry() {
    setLoadingReadings(true)
    const data = await getSensorReadingsFromDB(30)
    setReadings(data || [])
    setLoadingReadings(false)
  }

  // -------------------------------------------------------------
  // ACCIONES CRUD DE PRODUCTOS
  // -------------------------------------------------------------
  function openCreateModal() {
    setEditingProduct(null)
    setFormData({
      name: '',
      barcode: '',
      rfid_uid: '',
      price: '',
      expected_weight_g: '',
      stock: 20,
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
      stock: prod.stock ?? 0,
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
      stock: parseInt(formData.stock, 10) || 0,
      active: formData.active,
      description: formData.description,
      image_url: formData.image_url || '📦'
    }

    await saveProductToDB(payload)
    setIsModalOpen(false)
    onProductsChanged?.()
  }

  async function handleDeleteProduct(id) {
    if (!window.confirm('¿Desea eliminar este producto del inventario?')) return
    await deleteProductFromDB(id)
    onProductsChanged?.()
  }

  // Filtro de productos
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch =
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcode?.includes(searchTerm) ||
        p.rfid_uid?.toLowerCase().includes(searchTerm.toLowerCase())
      if (filterStockLow) {
        return matchSearch && (p.stock ?? 0) < 10
      }
      return matchSearch
    })
  }, [products, searchTerm, filterStockLow])

  // Métricas generales de Inventario
  const totalStockUnits = useMemo(() => {
    return products.reduce((acc, p) => acc + (p.stock ?? 0), 0)
  }, [products])

  const lowStockCount = useMemo(() => {
    return products.filter(p => (p.stock ?? 0) < 10).length
  }, [products])

  const totalInventoryValue = useMemo(() => {
    return products.reduce((acc, p) => acc + ((p.stock ?? 0) * (p.price ?? 0)), 0)
  }, [products])

  const totalSalesRevenue = useMemo(() => {
    return purchases.reduce((acc, p) => acc + (parseFloat(p.total) || 0), 0)
  }, [purchases])

  // -------------------------------------------------------------
  // CONFIGURACIÓN DE GRÁFICOS (CHART.JS)
  // -------------------------------------------------------------
  const weightChartData = useMemo(() => {
    const weightReadings = readings
      .filter(r => r.sensor_type === 'hx711' || r.sensor_type === 'weight')
      .slice(0, 15)
      .reverse()

    return {
      labels: weightReadings.map(r => new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
      datasets: [
        {
          label: 'Peso HX711 Medido (g)',
          data: weightReadings.map(r => parseFloat(r.numeric_value ?? 0)),
          borderColor: '#de7272',
          backgroundColor: 'rgba(180, 228, 214, 0.45)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#ffca88',
          pointBorderColor: '#fff',
          pointRadius: 5,
          borderWidth: 3
        }
      ]
    }
  }, [readings])

  const sensorActivityData = useMemo(() => {
    const rc522Count = readings.filter(r => r.sensor_type === 'rc522').length
    const hx711Count = readings.filter(r => r.sensor_type === 'hx711' || r.sensor_type === 'weight').length
    const proximityCount = readings.filter(r => r.sensor_type === 'proximidad' || r.sensor_type === 'magnetico').length

    return {
      labels: ['RFID RC522', 'Báscula HX711', 'Proximidad/Salida'],
      datasets: [
        {
          label: 'Eventos Detectados',
          data: [rc522Count, hx711Count, proximityCount],
          backgroundColor: ['#de7272', '#ffca88', '#b4e4d6'],
          borderRadius: 8
        }
      ]
    }
  }, [readings])

  return (
    <div className="admin-container">
      {/* Pestañas de Navegación del Panel de Administración */}
      <div className="admin-tabs-nav">
        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`admin-nav-tab ${activeTab === 'inventory' ? 'active' : ''}`}
        >
          <Package size={18} />
          <span>📦 Gestión de Inventario (CRUD)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`admin-nav-tab ${activeTab === 'sales' ? 'active' : ''}`}
        >
          <Receipt size={18} />
          <span>🧾 Control de Salida de Mercadería ({purchases.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('telemetry')}
          className={`admin-nav-tab ${activeTab === 'telemetry' ? 'active' : ''}`}
        >
          <TrendingUp size={18} />
          <span>📈 Dashboard Telemetría IoT en Vivo</span>
        </button>
      </div>

      {/* =========================================================
          PESTAÑA 1: GESTIÓN DE INVENTARIO (CRUD)
         ========================================================= */}
      {activeTab === 'inventory' && (
        <div>
          {/* Tarjetas de Métricas de Inventario */}
          <div className="metric-cards-grid">
            <div className="pastel-metric-card peach">
              <div className="metric-info">
                <h3>Total Productos</h3>
                <p>{products.length}</p>
              </div>
              <Package size={32} color="#925d10" />
            </div>

            <div className="pastel-metric-card mint">
              <div className="metric-info">
                <h3>Stock Total en Bodega</h3>
                <p>{totalStockUnits} <small style={{ fontSize: 14 }}>uds</small></p>
              </div>
              <Layers size={32} color="var(--mint-dark)" />
            </div>

            <div className="pastel-metric-card coral">
              <div className="metric-info">
                <h3>Stock Bajo Crítico (&lt; 10)</h3>
                <p>{lowStockCount}</p>
              </div>
              <AlertTriangle size={32} color="var(--coral-dark)" />
            </div>

            <div className="pastel-metric-card cream">
              <div className="metric-info">
                <h3>Valor de Inventario</h3>
                <p>Bs. {totalInventoryValue.toFixed(2)}</p>
              </div>
              <DollarSign size={32} color="#8c681f" />
            </div>
          </div>

          {/* Barra de Acciones y Filtros */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--muted)' }} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nombre, código de barra o tag RFID..."
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 36px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1.5px solid var(--border)',
                    fontSize: 13
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setFilterStockLow(!filterStockLow)}
                className={`btn-ghost ${filterStockLow ? 'active' : ''}`}
                style={{
                  background: filterStockLow ? 'var(--coral-light)' : '#fff',
                  borderColor: filterStockLow ? 'var(--coral)' : 'var(--border)',
                  color: filterStockLow ? 'var(--coral-dark)' : 'var(--muted)',
                  fontWeight: 700
                }}
              >
                <AlertTriangle size={15} />
                <span>Solo Stock Bajo ({lowStockCount})</span>
              </button>
            </div>

            <button
              type="button"
              className="btn-primary"
              style={{ width: 'auto', padding: '10px 20px', borderRadius: 'var(--radius-sm)' }}
              onClick={openCreateModal}
            >
              <Plus size={16} />
              <span>Agregar Nuevo Producto</span>
            </button>
          </div>

          {/* Tabla CRUD de Productos */}
          <div className="data-table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Producto</th>
                  <th>Código Barra / RFID</th>
                  <th>Precio (Bs.)</th>
                  <th>Peso Esperado (g)</th>
                  <th>Stock Disponible</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                      No se encontraron productos que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const isLow = (p.stock ?? 0) < 10
                    return (
                      <tr key={p.id}>
                        <td><strong>#{p.id}</strong></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 22 }}>{p.image_url || '📦'}</span>
                            <div>
                              <strong style={{ display: 'block', fontSize: 13 }}>{p.name}</strong>
                              <small style={{ color: 'var(--muted)' }}>{p.description || 'Sin descripción'}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12 }}>
                            <code>{p.barcode || 'N/A'}</code>
                            <div style={{ color: 'var(--muted)', fontSize: 11 }}>Tag: {p.rfid_uid || 'N/A'}</div>
                          </div>
                        </td>
                        <td>
                          <strong style={{ color: 'var(--ink)' }}>Bs. {p.price?.toFixed(2)}</strong>
                        </td>
                        <td>
                          <span>{p.expected_weight_g} g</span>
                        </td>
                        <td>
                          <span className={`badge-stock ${isLow ? 'low' : 'normal'}`}>
                            {isLow ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
                            {p.stock ?? 0} unidades {isLow && '(Bajo)'}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: p.active !== false ? 'var(--mint-light)' : '#f1f5f9',
                            color: p.active !== false ? 'var(--mint-dark)' : 'var(--muted)'
                          }}>
                            {p.active !== false ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => openEditModal(p)}
                              className="btn-ghost"
                              style={{ padding: '6px 10px' }}
                              title="Editar precio, peso y stock"
                            >
                              <Edit2 size={13} /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p.id)}
                              className="btn-ghost"
                              style={{ padding: '6px 10px', color: 'var(--coral)' }}
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
        </div>
      )}

      {/* =========================================================
          PESTAÑA 2: CONTROL DE SALIDA DE MERCADERÍA (HISTORIAL)
         ========================================================= */}
      {activeTab === 'sales' && (
        <div>
          <div className="metric-cards-grid">
            <div className="pastel-metric-card mint">
              <div className="metric-info">
                <h3>Total Recaudado</h3>
                <p>Bs. {totalSalesRevenue.toFixed(2)}</p>
              </div>
              <DollarSign size={32} color="var(--mint-dark)" />
            </div>

            <div className="pastel-metric-card peach">
              <div className="metric-info">
                <h3>Compras Registradas</h3>
                <p>{purchases.length}</p>
              </div>
              <Receipt size={32} color="#925d10" />
            </div>

            <div className="pastel-metric-card cream">
              <div className="metric-info">
                <h3>Ticket Promedio</h3>
                <p>
                  Bs. {purchases.length > 0 ? (totalSalesRevenue / purchases.length).toFixed(2) : '0.00'}
                </p>
              </div>
              <TrendingUp size={32} color="#8c681f" />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800 }}>Registro en Vivo de Salida de Artículos y Tickets</h3>
            <button type="button" onClick={loadPurchases} className="btn-ghost" style={{ fontSize: 12 }}>
              <RefreshCw size={13} /> Actualizar Historial
            </button>
          </div>

          <div className="data-table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Transacción</th>
                  <th>Fecha y Hora</th>
                  <th>Método de Pago</th>
                  <th>Peso Registrado</th>
                  <th>Productos Vendidos</th>
                  <th>Total Pagado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                      Aún no hay compras registradas en el sistema.
                    </td>
                  </tr>
                ) : (
                  purchases.map((pur) => (
                    <tr key={pur.id}>
                      <td><strong>#{pur.id}</strong></td>
                      <td>
  {pur.created_at && !isNaN(new Date(pur.created_at).getTime())
    ? new Date(pur.created_at).toLocaleString('es-BO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : 'Reciente'}
</td>
                      <td>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'var(--peach-light)',
                          color: '#925d10'
                        }}>
                          {pur.payment_method || 'TARJETA'}
                        </span>
                      </td>
                      <td>{pur.measured_weight_g ?? pur.total_weight ?? '0'} g</td>
                      <td>
                        <div style={{ fontSize: 12 }}>
                          {pur.purchase_items?.map((item, idx) => (
                            <span key={idx} style={{ display: 'inline-block', marginRight: 8, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                              {item.product_name || `Item #${item.product_id}`} (x{item.quantity})
                            </span>
                          )) || 'Detalle no disponible'}
                        </div>
                      </td>
                      <td>
                        <strong style={{ color: 'var(--coral-dark)', fontSize: 14 }}>
                          Bs. {parseFloat(pur.total).toFixed(2)}
                        </strong>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'var(--mint-light)',
                          color: 'var(--mint-dark)'
                        }}>
                          {pur.status || 'COMPLETED'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================
          PESTAÑA 3: DASHBOARD DE TELEMETRÍA IOT (TIEMPO REAL)
         ========================================================= */}
      {activeTab === 'telemetry' && (
        <div>
          {/* Tarjetas Superiores Pastel */}
          <div className="metric-cards-grid">
            <div className="pastel-metric-card peach">
              <div className="metric-info">
                <h3>Total Recaudado</h3>
                <p>Bs. {totalSalesRevenue.toFixed(2)}</p>
              </div>
              <DollarSign size={30} color="#925d10" />
            </div>

            <div className="pastel-metric-card mint">
              <div className="metric-info">
                <h3>Ventas Exitosas</h3>
                <p>{purchases.length}</p>
              </div>
              <CheckCircle size={30} color="var(--mint-dark)" />
            </div>

            <div className="pastel-metric-card coral">
              <div className="metric-info">
                <h3>Alertas Anti-Fraude</h3>
                <p>
                  {readings.filter(r => r.metadata?.simulated === true && r.numeric_value > 1500).length}
                </p>
              </div>
              <AlertTriangle size={30} color="var(--coral-dark)" />
            </div>

            <div className="pastel-metric-card cream">
              <div className="metric-info">
                <h3>Lecturas Telemetría</h3>
                <p>{readings.length}</p>
              </div>
              <Activity size={30} color="#8c681f" />
            </div>
          </div>

          {/* Grilla de Gráficos Dinámicos (Chart.js) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, marginBottom: 24 }}>
            <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: 20, border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Scale size={18} color="var(--coral)" />
                Curva de Pesaje en Vivo Báscula HX711 (g)
              </h3>
              <div style={{ height: 260 }}>
                <Line
                  data={weightChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                      x: { grid: { display: false } }
                    }
                  }}
                />
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: 20, border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radio size={18} color="#925d10" />
                Frecuencia por Tipo de Sensor IoT
              </h3>
              <div style={{ height: 260 }}>
                <Bar
                  data={sensorActivityData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                      x: { grid: { display: false } }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Feed en vivo de la tabla sensor_readings */}
          <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: 20, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={18} color="var(--mint-dark)" />
                Feed en Vivo de Telemetría ESP32 (sensor_readings)
              </h3>
              <button type="button" onClick={loadTelemetry} className="btn-ghost" style={{ fontSize: 12 }}>
                <RefreshCw size={13} /> Refrescar Feed
              </button>
            </div>

            <div className="data-table-wrapper" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Fecha / Hora</th>
                    <th>Tipo Sensor</th>
                    <th>Valor Numérico</th>
                    <th>Tag / UID</th>
                    <th>Dispositivo</th>
                    <th>Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                        No hay lecturas recientes recibidas de la estación.
                      </td>
                    </tr>
                  ) : (
                    readings.map((r, i) => (
                      <tr key={r.id || i}>
                        <td>{new Date(r.created_at).toLocaleTimeString()}</td>
                        <td>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: r.sensor_type === 'rc522' ? 'var(--coral-light)' : r.sensor_type === 'hx711' ? 'var(--peach-light)' : 'var(--mint-light)',
                            color: r.sensor_type === 'rc522' ? 'var(--coral-dark)' : r.sensor_type === 'hx711' ? '#925d10' : 'var(--mint-dark)'
                          }}>
                            {r.sensor_type}
                          </span>
                        </td>
                        <td><strong>{r.numeric_value ?? '-'}</strong></td>
                        <td><code>{r.rfid_uid || '—'}</code></td>
                        <td>{r.device_id || 'CAJA_IOT_01'}</td>
                        <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {JSON.stringify(r.metadata || {})}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL CREAR / EDITAR PRODUCTO (CRUD INVENTARIO)
         ========================================================= */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>
              {editingProduct ? 'Editar Producto' : 'Nuevo Producto en Inventario'}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
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
                <div className="field">
                  <label>Stock Disponible *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="40"
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
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: 'auto', padding: '10px 24px' }}
                >
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
