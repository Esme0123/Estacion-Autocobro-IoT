import { useState } from 'react'
import { X, Radio, Scale, ShieldAlert, CheckCircle, Send, Cpu, Sliders } from 'lucide-react'
import { insertSensorReading } from '../supabaseClient'

export default function IoTSimulatorDrawer({ isOpen, onClose, products, onReadingEmitted }) {
  const [selectedTag, setSelectedTag] = useState(products[0]?.rfid_uid || 'TAG_LECHE_1L')
  const [customWeight, setCustomWeight] = useState(1025)
  const [statusMsg, setStatusMsg] = useState('')

  if (!isOpen) return null

  const showFeedback = (msg) => {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(''), 3000)
  }

  // 1. Simular Escaneo RFID RC522
  async function emitirRFID(tag) {
    const uid = tag || selectedTag
    const product = products.find(p => p.rfid_uid === uid || p.barcode === uid)
    const reading = await insertSensorReading({
      sensor_type: 'rc522',
      rfid_uid: uid,
      numeric_value: 0,
      metadata: { product_name: product?.name || 'Desconocido', simulated: true }
    })
    showFeedback(`📡 RFID emitido: ${uid}`)
    onReadingEmitted?.(reading)
  }

  // 2. Simular Balanza HX711
  async function emitirPeso(gramos) {
    const val = parseFloat(gramos ?? customWeight)
    const reading = await insertSensorReading({
      sensor_type: 'hx711',
      numeric_value: val,
      metadata: { unit: 'g', simulated: true }
    })
    showFeedback(`⚖️ Balanza HX711: ${val} g`)
    onReadingEmitted?.(reading)
  }

  // 3. Simular Sensor de Salida (Proximidad / Magnético)
  async function emitirSensorSalida() {
    const reading = await insertSensorReading({
      sensor_type: 'proximidad',
      numeric_value: 1,
      metadata: { event: 'Bandeja liberada / Productos retirados', simulated: true }
    })
    showFeedback(`🚪 Sensor de Salida activado`)
    onReadingEmitted?.(reading)
  }

  return (
    <div className="iot-sim-dock">
      <div className="iot-sim-card">
        <div className="sim-header">
          <h4>
            <Cpu size={16} />
            Consola ESP32 (MicroPython IoT)
          </h4>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          Simula eventos de telemetría HTTP POST hacia Supabase como si vinieran del firmware <code>main.py</code>.
        </p>

        {statusMsg && (
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            background: 'var(--mint)',
            color: '#064e3b',
            padding: '6px 10px',
            borderRadius: 6,
            marginBottom: 10,
            textAlign: 'center'
          }}>
            {statusMsg}
          </div>
        )}

        <div className="sim-btn-row">
          {/* SECCIÓN RFID */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, background: '#fff' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--coral-dark)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Radio size={13} /> Lector RFID RC522
            </span>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                style={{ flex: 1, padding: 6, fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
              >
                {products.map(p => (
                  <option key={p.id} value={p.rfid_uid || p.barcode}>
                    {p.name} ({p.expected_weight_g}g)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => emitirRFID()}
                style={{
                  background: 'var(--coral)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Disparar
              </button>
            </div>
          </div>

          {/* SECCIÓN BALANZA HX711 */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, background: '#fff' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#925d10', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Scale size={13} /> Báscula HX711 (Peso en Gramos)
            </span>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                type="number"
                value={customWeight}
                onChange={(e) => setCustomWeight(e.target.value)}
                placeholder="Gramos"
                style={{ width: 90, padding: 6, fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
              <button
                type="button"
                onClick={() => emitirPeso(customWeight)}
                style={{
                  flex: 1,
                  background: 'var(--peach)',
                  color: '#704207',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Emitir Peso
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => emitirPeso(0)}
                style={{ flex: 1, fontSize: 10, padding: 4, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}
              >
                Vaciar (0g)
              </button>
              <button
                type="button"
                onClick={() => emitirPeso(parseFloat(customWeight || 1000) + 35)}
                style={{ flex: 1, fontSize: 10, padding: 4, background: 'var(--coral-light)', border: '1px solid var(--coral)', color: 'var(--coral-dark)', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
              >
                +35g (Fraude)
              </button>
            </div>
          </div>

          {/* SECCIÓN SENSOR SALIDA */}
          <button
            type="button"
            onClick={emitirSensorSalida}
            className="sim-trigger-btn"
            style={{ background: 'var(--mint-light)', borderColor: 'var(--mint)' }}
          >
            <span>🚪 Simular Retiro / Salida (Magnético/Proximidad)</span>
            <Send size={13} color="var(--mint-dark)" />
          </button>
        </div>
      </div>
    </div>
  )
}
