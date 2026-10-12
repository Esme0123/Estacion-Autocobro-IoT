import { QrCode, Scale, Ruler, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'

function estadoInfo(estado) {
  switch (estado) {
    case 'CORRECTO':
      return { cls: 'accent-mint', label: 'CORRECTO' }
    case 'ERROR_PESO':
    case 'ERROR_LECTURA':
      return { cls: 'accent-coral', label: estado }
    default:
      return { cls: 'accent-cream', label: estado || 'ESPERANDO' }
  }
}

export default function MetricCards({ ultima }) {
  const codigo = ultima?.codigo_escaneado || '-'
  const peso = ultima?.peso_medido_g ?? '-'
  const distancia = ultima?.distancia_cm ?? '-'
  const estado = ultima?.estado_validacion || 'ESPERANDO'
  const info = estadoInfo(estado)

  const IconoEstado =
    estado === 'CORRECTO'
      ? ShieldCheck
      : estado.startsWith('ERROR')
        ? ShieldAlert
        : ShieldQuestion

  return (
    <div className="grid-cards">
      <div className="metric-card accent-coral">
        <div className="metric-head">
          <span className="metric-title">Último Código</span>
          <span className="metric-icon">
            <QrCode size={18} />
          </span>
        </div>
        <div className="metric-value">{codigo}</div>
      </div>

      <div className="metric-card accent-peach">
        <div className="metric-head">
          <span className="metric-title">Peso Detectado</span>
          <span className="metric-icon">
            <Scale size={18} />
          </span>
        </div>
        <div className="metric-value">
          {peso} <small>g</small>
        </div>
      </div>

      <div className="metric-card accent-cream">
        <div className="metric-head">
          <span className="metric-title">Distancia Presencia</span>
          <span className="metric-icon">
            <Ruler size={18} />
          </span>
        </div>
        <div className="metric-value">
          {distancia} <small>cm</small>
        </div>
      </div>

      <div className={`metric-card ${info.cls}`}>
        <div className="metric-head">
          <span className="metric-title">Estado Validación</span>
          <span className="metric-icon">
            <IconoEstado size={18} />
          </span>
        </div>
        <div className="metric-value" style={{ fontSize: 21 }}>
          {info.label}
        </div>
      </div>
    </div>
  )
}
