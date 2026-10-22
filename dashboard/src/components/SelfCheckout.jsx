import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Barcode,
  Radio,
  Scale,
  ShieldCheck,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  QrCode,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  PackageCheck,
  LogOut,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import { supabase, recordCompletedPurchase } from '../supabaseClient'

// Generador de sonidos limpios con Web Audio API para simular el hardware
function playBeep(freq = 880, type = 'sine', duration = 0.12) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch {}
}

export default function SelfCheckout({ products, onStockUpdated }) {
  // Estado del Carrito
  const [cart, setCart] = useState([])
  const [searchInput, setSearchInput] = useState('')
  
  // Báscula HX711 (Peso medido en tiempo real en gramos)
  const [measuredWeightG, setMeasuredWeightG] = useState(0)
  const [lastScannedTag, setLastScannedTag] = useState(null)
  const [rfidActivePing, setRfidActivePing] = useState(false)
  
  // Modales y Flujo
  const [step, setStep] = useState('CART') // 'CART' | 'PAYMENT' | 'EXIT'
  const [paymentMethod, setPaymentMethod] = useState('TARJETA') // 'TARJETA' | 'QR'
  const [isProcessingPay, setIsProcessingPay] = useState(false)
  const [completedOrder, setCompletedOrder] = useState(null)
  
  // Sensores de salida (Magnético / Proximidad)
  const [exitDetected, setExitDetected] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  // -------------------------------------------------------------
  // CÁLCULO DE PESOS Y VERIFICACIÓN ANTI-FRAUDE (±10g)
  // -------------------------------------------------------------
  const expectedTotalWeightG = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.expected_weight_g * item.quantity), 0)
  }, [cart])

  const weightDifferenceG = Math.abs(measuredWeightG - expectedTotalWeightG)
  const isWeightValid = cart.length > 0 && weightDifferenceG <= 10.0

  const cartTotalAmount = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0)
  }, [cart])

  // -------------------------------------------------------------
  // ESCUCHA REALTIME DE TABLA SENSOR_READINGS (ESP32)
  // -------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('kiosk-sensor-readings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings' },
        (payload) => {
          const newReading = payload.new
          handleIncomingReading(newReading)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [products, cart, expectedTotalWeightG])

  function handleIncomingReading(reading) {
    if (!reading) return

    // 1. Detección de RFID RC522
    if (reading.sensor_type === 'rc522' && reading.rfid_uid) {
      setLastScannedTag(reading.rfid_uid)
      setRfidActivePing(true)
      setTimeout(() => setRfidActivePing(false), 1200)
      playBeep(920, 'sine', 0.15)
      addProductByCode(reading.rfid_uid)
    }

    // 2. Báscula HX711
    if (reading.sensor_type === 'hx711' || reading.sensor_type === 'weight') {
      const val = parseFloat(reading.numeric_value ?? 0)
      setMeasuredWeightG(val)
      playBeep(520, 'triangle', 0.08)
    }

    // 3. Sensor de Salida (Magnético / Proximidad)
    if (
      reading.sensor_type === 'magnetico' ||
      reading.sensor_type === 'proximidad' ||
      reading.sensor_type === 'exit'
    ) {
      if (reading.numeric_value === 1 || reading.numeric_value > 0) {
        setExitDetected(true)
        playBeep(1200, 'sine', 0.3)
      }
    }
  }

  // -------------------------------------------------------------
  // OPERACIONES DE CARRITO
  // -------------------------------------------------------------
  function addProductByCode(code) {
  if (!code) return
  
  const cleaned = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

  const found = products.find((p) => {
    const prodBarcode = (p.barcode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const prodRfid = (p.rfid_uid || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    return prodBarcode === cleaned || prodRfid === cleaned || p.name?.toUpperCase().includes(cleaned)
  })

    if (!found) {
      showToast(`No se encontró producto con código: ${code}`, 'error')
      playBeep(320, 'square', 0.2)
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === found.id)
      if (existing) {
        return prev.map((item) =>
          item.id === found.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, { ...found, quantity: 1 }]
    })

    showToast(`✓ Agregado: ${found.name} (+${found.expected_weight_g}g)`)
    setSearchInput('')
  }

  function updateQuantity(id, delta) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta
            return newQty > 0 ? { ...item, quantity: newQty } : null
          }
          return item
        })
        .filter(Boolean)
    )
  }

  function removeItem(id) {
    setCart((prev) => prev.filter((item) => item.id !== id))
  }

  function clearCart() {
    setCart([])
    setMeasuredWeightG(0)
    setLastScannedTag(null)
  }

  // -------------------------------------------------------------
  // CONTROLES DE SIMULACIÓN DIRECTA DE BALANZA
  // -------------------------------------------------------------
  function simularColocarPesoExacto() {
    setMeasuredWeightG(expectedTotalWeightG)
    playBeep(780, 'sine', 0.12)
    showToast(`⚖️ Balanza ajustada al peso exacto: ${expectedTotalWeightG} g`)
  }

  function simularPesoDesviadoFraude() {
    const errorWeight = expectedTotalWeightG + 45.0
    setMeasuredWeightG(errorWeight)
    playBeep(280, 'sawtooth', 0.25)
    showToast(`⚠️ Peso incorrecto simulado: ${errorWeight} g (Fraude)`, 'error')
  }

  function simularVaciarBalanza() {
    setMeasuredWeightG(0)
    showToast('🧹 Balanza tarada a 0 g')
  }

  // -------------------------------------------------------------
  // PROCESO DE PAGO Y DESCUENTO DE STOCK
  // -------------------------------------------------------------
  async function handleConfirmPayment() {
    if (cart.length === 0) return
    setIsProcessingPay(true)

    try {
      const purchaseResult = await recordCompletedPurchase({
        items: cart,
        total: cartTotalAmount,
        paymentMethod,
        measuredWeightG
      })

      playBeep(1040, 'sine', 0.2)
      setTimeout(() => playBeep(1320, 'sine', 0.3), 150)

      setCompletedOrder(purchaseResult)
      setIsProcessingPay(false)
      setStep('EXIT')
      setExitDetected(false)
      onStockUpdated?.()
    } catch (err) {
      console.error('Error procesando pago:', err)
      setIsProcessingPay(false)
      showToast('Error al confirmar la transacción', 'error')
    }
  }

  // Finalizar ciclo de salida tras retiro de productos
  function handleFinishCheckout() {
    clearCart()
    setStep('CART')
    setCompletedOrder(null)
    setExitDetected(false)
    showToast('Estación reiniciada lista para el próximo cliente', 'success')
  }

  return (
    <div className="checkout-container">
      {/* Toast Notice */}
      {toast && (
        <div className={`toast-notice ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Barra de Progreso del Flujo */}
      <div className="steps-progress">
        <div className={`step-item ${step === 'CART' ? 'active' : 'completed'}`}>
          <div className="step-num">1</div>
          <span>Escanear y Registrar</span>
        </div>
        <div className="step-separator" />
        <div className={`step-item ${isWeightValid ? 'completed' : step === 'CART' ? 'active' : ''}`}>
          <div className="step-num">2</div>
          <span>Validación Báscula Anti-Fraude</span>
        </div>
        <div className="step-separator" />
        <div className={`step-item ${step === 'PAYMENT' ? 'active' : step === 'EXIT' ? 'completed' : ''}`}>
          <div className="step-num">3</div>
          <span>Pago (Tarjeta / QR)</span>
        </div>
        <div className="step-separator" />
        <div className={`step-item ${step === 'EXIT' ? 'active' : ''}`}>
          <div className="step-num">4</div>
          <span>Liberación de Salida</span>
        </div>
      </div>

      {/* VISTA PRINCIPAL: PASO 1 Y 2 */}
      {step === 'CART' && (
        <div className="checkout-grid">
          {/* COLUMNA IZQUIERDA: ZONA DE ESCANEO Y VERIFICACIÓN DE BALANZA */}
          <div className="kiosk-panel">
            <h2 className="panel-title">
              <Barcode size={22} color="var(--coral)" />
              1. Escaneo de Productos (RFID RC522 / Código)
            </h2>

            {/* Escáner Visual y RFID Live */}
            <div className="scanner-box">
              <div className="rfid-live-beacon">
                <span className="beacon-pill">
                  <Radio size={14} color={rfidActivePing ? 'var(--coral)' : '#925d10'} />
                  {rfidActivePing ? '¡Etiqueta RFID detectada!' : 'Antena RFID RC522 en espera...'}
                </span>
                {lastScannedTag && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                    Último Tag: <code>{lastScannedTag}</code>
                  </span>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  addProductByCode(searchInput)
                }}
                className="scanner-input-group"
              >
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Escanee con pistola o escriba código / tag RFID..."
                  autoFocus
                />
                <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '0 20px' }}>
                  Agregar
                </button>
              </form>

              {/* Botones de Escaneo Rápido de Demostración */}
              <div className="quick-scan-chips">
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginRight: 4 }}>
                  Demostración rápida:
                </span>
                {products.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProductByCode(p.rfid_uid || p.barcode)}
                    className="chip-tag"
                    title={`Tag: ${p.rfid_uid} | Peso: ${p.expected_weight_g}g`}
                  >
                    <span>{p.image_url || '📦'}</span>
                    <span>{p.name.split(' ')[0]}</span>
                    <small style={{ color: 'var(--muted)' }}>({p.expected_weight_g}g)</small>
                  </button>
                ))}
              </div>
            </div>

            {/* ZONA ANTI-FRAUDE: BALANZA HX711 */}
            <h2 className="panel-title" style={{ marginTop: 10 }}>
              <Scale size={22} color="var(--coral)" />
              2. Verificación Anti-Fraude de Báscula (HX711)
            </h2>

            <div className={`scale-monitor-card ${isWeightValid ? 'verified' : 'error'}`}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isWeightValid ? (
                    <>
                      <ShieldCheck size={20} color="var(--mint-dark)" />
                      <span style={{ color: 'var(--mint-dark)' }}>
                        ✓ Peso Verificado (Tolerancia ±10g Cumplida)
                      </span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={20} color="var(--coral-dark)" />
                      <span style={{ color: 'var(--coral-dark)' }}>
                        ⚠️ Por favor coloque el producto en la báscula
                      </span>
                    </>
                  )}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                  Margen: ±10 g
                </span>
              </div>

              {/* Comparador de Pesos */}
              <div className="scale-metrics-grid">
                <div className="scale-metric-box">
                  <span>Peso Esperado</span>
                  <strong>{expectedTotalWeightG.toFixed(1)} g</strong>
                </div>
                <div className="scale-metric-box">
                  <span>Peso en Báscula</span>
                  <strong style={{ color: isWeightValid ? 'var(--mint-dark)' : 'var(--coral)' }}>
                    {measuredWeightG.toFixed(1)} g
                  </strong>
                </div>
                <div className="scale-metric-box">
                  <span>Diferencia</span>
                  <strong style={{ color: weightDifferenceG <= 10 ? 'var(--mint-dark)' : 'var(--coral)' }}>
                    {weightDifferenceG.toFixed(1)} g
                  </strong>
                </div>
              </div>

              <p style={{ fontSize: 12, color: 'var(--ink-secondary)', margin: '6px 0 10px' }}>
                {isWeightValid
                  ? 'El peso físico en la celda de carga coincide con el cálculo del carrito. Botón de pago habilitado.'
                  : cart.length === 0
                    ? 'Agregue productos al carrito para iniciar la verificación de peso.'
                    : `Diferencia de peso de ${weightDifferenceG.toFixed(1)}g excede la tolerancia permitida de ±10g.`}
              </p>

              {/* Acciones de Simulación Rápida de Báscula para la Demostración */}
              <div className="scale-actions-row">
                <button
                  type="button"
                  onClick={simularColocarPesoExacto}
                  className="scale-action-btn"
                  title="Calibra el peso medido exactamente igual al esperado del carrito"
                >
                  ⚖️ Colocar Peso Exacto ({expectedTotalWeightG}g)
                </button>
                <button
                  type="button"
                  onClick={simularPesoDesviadoFraude}
                  className="scale-action-btn"
                  style={{ color: 'var(--coral-dark)' }}
                  title="Simula que el cliente colocó un producto de peso diferente"
                >
                  ⚠️ Simular Fraude (+45g)
                </button>
                <button
                  type="button"
                  onClick={simularVaciarBalanza}
                  className="scale-action-btn"
                  title="Quitar peso de la plataforma"
                >
                  🧹 Tara / Vaciar (0g)
                </button>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: CARRITO DE COMPRAS Y TOTAL */}
          <div className="kiosk-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 className="panel-title" style={{ margin: 0, padding: 0, border: 'none' }}>
                <ShoppingCart size={22} color="var(--coral)" />
                Carrito de Compra ({cart.length})
              </h2>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Trash2 size={13} /> Vaciar
                </button>
              )}
            </div>

            {/* Listado de Productos en Carrito */}
            <div className="cart-table-wrapper">
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--muted)' }}>
                  <ShoppingCart size={44} style={{ opacity: 0.25, margin: '0 auto 12px' }} />
                  <p style={{ fontWeight: 700, fontSize: 15 }}>Su carrito está vacío</p>
                  <p style={{ fontSize: 13, marginTop: 4 }}>
                    Escanee un producto o use los botones de demostración rápida para comenzar.
                  </p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="cart-item-row">
                    <div className="item-info">
                      <div className="item-avatar">{item.image_url || '📦'}</div>
                      <div className="item-meta">
                        <h4>{item.name}</h4>
                        <p>
                          Bs. {item.price.toFixed(2)} &bull; {item.expected_weight_g} g c/u
                        </p>
                      </div>
                    </div>

                    <div className="item-controls">
                      <div className="qty-pill">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => updateQuantity(item.id, -1)}
                        >
                          <Minus size={13} />
                        </button>
                        <span className="qty-val">{item.quantity}</span>
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => updateQuantity(item.id, 1)}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <div className="item-price">
                        Bs. {(item.price * item.quantity).toFixed(2)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Tarjeta de Resumen y Total */}
            <div className="cart-total-card">
              <div className="total-line">
                <span>Subtotal ({cart.reduce((a, c) => a + c.quantity, 0)} artículos)</span>
                <span>Bs. {cartTotalAmount.toFixed(2)}</span>
              </div>
              <div className="total-line">
                <span>Peso Total Estimado</span>
                <span>{expectedTotalWeightG.toFixed(1)} g</span>
              </div>
              <div className="total-line grand-total">
                <span>Total a Pagar</span>
                <span>Bs. {cartTotalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Botón de Proceder al Pago (Condicionado al peso válido) */}
            <button
              type="button"
              disabled={!isWeightValid}
              onClick={() => setStep('PAYMENT')}
              className={isWeightValid ? 'btn-mint' : 'btn-primary'}
              style={{
                width: '100%',
                padding: '16px',
                fontSize: 16,
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10
              }}
            >
              {isWeightValid ? (
                <>
                  <Sparkles size={18} />
                  <span>Proceder al Pago (Peso Correcto)</span>
                  <ArrowRight size={18} />
                </>
              ) : (
                <>
                  <ShieldAlert size={18} />
                  <span>Coloque los productos en la báscula para pagar</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* PASO 3: MODAL DE PAGO (TARJETA / QR) */}
      {step === 'PAYMENT' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
              Seleccione su Método de Pago
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Total a cancelar: <strong style={{ color: 'var(--ink)' }}>Bs. {cartTotalAmount.toFixed(2)}</strong>
            </p>

            <div className="payment-method-selector">
              <button
                type="button"
                className={`payment-method-btn ${paymentMethod === 'TARJETA' ? 'selected' : ''}`}
                onClick={() => setPaymentMethod('TARJETA')}
              >
                <CreditCard size={26} color={paymentMethod === 'TARJETA' ? 'var(--coral)' : 'var(--muted)'} />
                <span>Tarjeta Débito / Crédito</span>
              </button>
              <button
                type="button"
                className={`payment-method-btn ${paymentMethod === 'QR' ? 'selected' : ''}`}
                onClick={() => setPaymentMethod('QR')}
              >
                <QrCode size={26} color={paymentMethod === 'QR' ? 'var(--coral)' : 'var(--muted)'} />
                <span>Pago QR Simple</span>
              </button>
            </div>

            {paymentMethod === 'TARJETA' ? (
              <div className="credit-card-mockup">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>AUTOCOBRO SMART PAY</span>
                  <CreditCard size={20} />
                </div>
                <div style={{ fontSize: 18, letterSpacing: 3, fontWeight: 700, marginBottom: 14 }}>
                  •••• •••• •••• 4289
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.85 }}>
                  <span>TITULAR: CLIENTE UCB</span>
                  <span>VENCE: 12/28</span>
                </div>
              </div>
            ) : (
              <div className="qr-code-wrapper">
                <div style={{
                  width: 140,
                  height: 140,
                  margin: '0 auto 12px',
                  background: '#1e293b',
                  borderRadius: 8,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: 8,
                  textAlign: 'center'
                }}>
                  [ QR SIMPLE BANCARIO ]
                  <br />
                  Bs. {cartTotalAmount.toFixed(2)}
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                  Escanee con la app de su banco preferido (Bnb, BCP, Banco Unión, Mercantil)
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setStep('CART')}
                disabled={isProcessingPay}
              >
                Volver al Carrito
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 2, background: 'var(--mint)', color: '#0d5442' }}
                onClick={handleConfirmPayment}
                disabled={isProcessingPay}
              >
                {isProcessingPay ? 'Procesando Transacción...' : `Confirmar Pago Bs. ${cartTotalAmount.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASO 4: LIBERACIÓN DE SALIDA (SENSORES DE SALIDA) */}
      {step === 'EXIT' && (
        <div className="exit-release-screen">
          <div className="exit-icon-circle">
            <PackageCheck size={44} />
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>
            ¡Gracias por su compra!
          </h2>
          <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 440, margin: '0 auto 20px' }}>
            Pago aprobado exitosamente. Comprobante de transacción #{completedOrder?.id || Date.now()}.
          </p>

          <div style={{
            background: exitDetected ? 'var(--mint-light)' : 'var(--cream-light)',
            border: `2px solid ${exitDetected ? 'var(--mint)' : 'var(--peach)'}`,
            borderRadius: 'var(--radius-md)',
            padding: 20,
            marginBottom: 24,
            textAlign: 'center'
          }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: exitDetected ? 'var(--mint-dark)' : '#925d10', marginBottom: 6 }}>
              {exitDetected
                ? '✓ Sensor Detectó Retiro: Artículos retirados de la bandeja.'
                : '🔔 Por favor retire sus productos de la bandeja de pesaje'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Monitoreando sensores infrarrojo / magnético de la compuerta de salida...
            </p>

            {!exitDetected && (
              <button
                type="button"
                onClick={() => setExitDetected(true)}
                className="scale-action-btn"
                style={{ marginTop: 12, background: '#fff', borderColor: 'var(--peach)' }}
              >
                🚪 Simular Retiro de Productos (Sensor Proximidad / Magnético)
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn-primary"
            style={{ maxWidth: 300, margin: '0 auto' }}
            onClick={handleFinishCheckout}
          >
            Finalizar y Salir
          </button>
        </div>
      )}
    </div>
  )
}
