import { useRef, useState } from 'react'
import { CreditCard, Fingerprint, ShieldCheck } from 'lucide-react'
import './TiltedCard.css'

export default function TiltedCard({
  className = '',
  amount = 0,
  method = 'Tarjeta Débito / Crédito',
  customer = 'CLIENTE UCB',
  authorizationCode = 'AUTH-000000'
}) {
  const [flipped, setFlipped] = useState(false)
  const tiltRef = useRef(null)

  function handlePointerMove(event) {
    const card = tiltRef.current
    if (!card) return

    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))

    card.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(2)}deg`)
    card.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`)
    card.style.setProperty('--mx', `${(x * 100).toFixed(2)}%`)
    card.style.setProperty('--my', `${(y * 100).toFixed(2)}%`)
  }

  function resetTilt() {
    const card = tiltRef.current
    if (!card) return

    card.style.setProperty('--rx', '0deg')
    card.style.setProperty('--ry', '0deg')
    card.style.setProperty('--mx', '50%')
    card.style.setProperty('--my', '50%')
  }

  function toggleFlip() {
    setFlipped((current) => !current)
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggleFlip()
  }

  return (
    <div
      className={`tilted-card-scene${className ? ` ${className}` : ''}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
      onClick={toggleFlip}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? 'Ver el anverso de la tarjeta' : 'Girar la tarjeta para ver el resumen de pago'}
    >
      <div ref={tiltRef} className="tilted-card-tilt">
        <div className={`tilted-card${flipped ? ' is-flipped' : ''}`}>
          <div className="tilted-card-face tilted-card-front">
            <span className="tilted-card-glare" aria-hidden="true" />

            <div className="tilted-card-top">
              <span className="tilted-card-brand">AUTOCOBRO SMART PAY</span>
              <span className="tilted-card-status">
                <span className="tilted-card-dot" />
                Activa
              </span>
            </div>

            <div className="tilted-card-chip-row">
              <span className="tilted-card-chip">
                <Fingerprint size={24} />
              </span>
              <span className="tilted-card-verified">
                <ShieldCheck size={14} />
                Verified
              </span>
            </div>

            <div className="tilted-card-number">•••• •••• •••• 4289</div>

            <div className="tilted-card-bottom">
              <div>
                <span>TITULAR</span>
                <strong>{customer}</strong>
              </div>
              <div>
                <span>VENCE</span>
                <strong>12/28</strong>
              </div>
              <CreditCard size={26} />
            </div>

            <span className="tilted-card-floating-label">Autocobro Smart Pay • Activa</span>
            <span className="tilted-card-hint">Toca para girar</span>
          </div>

          <div className="tilted-card-face tilted-card-back">
            <span className="tilted-card-glare" aria-hidden="true" />

            <div className="tilted-card-back-head">
              <span>RESUMEN DE PAGO</span>
              <ShieldCheck size={18} />
            </div>

            <div className="tilted-card-back-amount">
              <span>Total</span>
              <strong>Bs. {Number(amount).toFixed(2)}</strong>
            </div>

            <div className="tilted-card-back-row">
              <span>Método</span>
              <strong>{method}</strong>
            </div>

            <div className="tilted-card-back-row">
              <span>Estado</span>
              <strong className="ok">Aprobado</strong>
            </div>

            <div className="tilted-card-auth">
              <span>CÓDIGO DE AUTORIZACIÓN</span>
              <strong>{authorizationCode}</strong>
            </div>

            <span className="tilted-card-hint">Toca para volver</span>
          </div>
        </div>
      </div>
    </div>
  )
}
