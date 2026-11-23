import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react'
import './TutorialModal.css'

// Clave de sesión: el tutorial se muestra una sola vez por cada inicio de sesión
// del cliente. App.jsx la escribe al abrir y la borra al cerrar sesión.
export const TUTORIAL_STORAGE_KEY = 'tutorial_autocobro_shown'
export const TUTORIAL_TOTAL_STEPS = 6

// Los seis pasos del flujo de autocobro. Los archivos actuales del proyecto
// viven en /public/tutorial como JPG con nombres heredados (paso2b, paso3a...).
// Si se reemplazan por /tutorial/paso1.png ... /tutorial/paso6.png, solo hay
// que actualizar la propiedad `image` de cada paso.
const STEPS = [
  {
    image: '/tutorial/paso1.jpg',
    title: 'Escanea tu producto',
    description: 'Pasa el código de barras por el lector o acerca la etiqueta al sensor RFID RC522. Escucharás un "bip" de confirmación.'
  },
  {
    image: '/tutorial/paso2.jpg',
    title: 'Coloca todo en la báscula',
    description: 'Cada producto debe descansar sobre la báscula HX711. Si el peso no coincide con tu carrito, el pago se bloquea.'
  },
  {
    image: '/tutorial/paso2b.jpg',
    title: 'Verifica el peso',
    description: 'Cuando el peso medido coincide con lo esperado (±10 g), la báscula se desbloquea en verde y podrás continuar.'
  },
  {
    image: '/tutorial/paso3a.jpg',
    title: 'Realiza el pago',
    description: 'Elige tarjeta débito/crédito o pago QR simple. La pantalla te mostrará la confirmación de la transacción.'
  },
  {
    image: '/tutorial/paso3b.jpg',
    title: 'Si el pago falla',
    description: 'Verifica los datos de tu tarjeta o intenta con el código QR. El carrito se conserva para que reintentes sin volver a escanear.'
  },
  {
    image: '/tutorial/paso4.jpg',
    title: 'Retira y sal del local',
    description: 'Lleva tus productos y cruza la compuerta de salida. El sensor de proximidad la abrirá automáticamente.'
  }
]

export default function TutorialModal({ open, onClose }) {
  const [step, setStep] = useState(1)
  const [imageError, setImageError] = useState(false)
  const cardRef = useRef(null)

  const close = useCallback(() => {
    onClose?.()
  }, [onClose])

  const goPrev = () => setStep((prev) => Math.max(1, prev - 1))
  const goNext = () => setStep((prev) => Math.min(TUTORIAL_TOTAL_STEPS, prev + 1))

  // Cada vez que se abre el modal se vuelve al primer paso
  useEffect(() => {
    if (open) {
      setStep(1)
      setImageError(false)
    }
  }, [open])

  useEffect(() => {
    setImageError(false)
  }, [step])

  // Bloqueo del scroll de fondo + navegación con teclado
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        close()
      } else if (event.key === 'ArrowRight') {
        setStep((prev) => Math.min(TUTORIAL_TOTAL_STEPS, prev + 1))
      } else if (event.key === 'ArrowLeft') {
        setStep((prev) => Math.max(1, prev - 1))
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    cardRef.current?.focus?.()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, close])

  if (!open) return null

  const current = STEPS[step - 1]
  const isLastStep = step === TUTORIAL_TOTAL_STEPS

  return (
    <div
      className="tutorial-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className="tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-caption"
        ref={cardRef}
        tabIndex={-1}
      >
        {/* Barra superior con cierre / saltar */}
        <div className="tutorial-topbar">
          <span className="tutorial-topbar-badge">Guía de autocobro</span>
          <button
            type="button"
            className="tutorial-skip"
            onClick={close}
            aria-label="Saltar tutorial"
          >
            <span>Saltar tutorial</span>
            <X size={14} />
          </button>
        </div>

        {/* Cabecera: retroceder, título, avanzar */}
        <header className="tutorial-header">
          <button
            type="button"
            className="tutorial-nav-btn tutorial-nav-prev"
            onClick={goPrev}
            disabled={step === 1}
            aria-label="Paso anterior"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="tutorial-heading">
            <h2 id="tutorial-title">TUTORIAL DE AUTOCOBRO</h2>
            <p>
              PASO {step} DE {TUTORIAL_TOTAL_STEPS}
            </p>
          </div>

          <button
            type="button"
            className="tutorial-nav-btn tutorial-nav-next"
            onClick={goNext}
            disabled={isLastStep}
            aria-label="Paso siguiente"
          >
            <ChevronRight size={24} />
          </button>
        </header>

        {/* Stepper de 6 pasos */}
        <div className="tutorial-stepper">
          {STEPS.map((item, index) => {
            const number = index + 1
            const state = number < step ? 'completed' : number === step ? 'current' : 'pending'

            return (
              <Fragment key={item.title}>
                {index > 0 && (
                  <span className={`tutorial-step-line ${index < step ? 'active' : ''}`} />
                )}
                <button
                  type="button"
                  className={`tutorial-step-dot ${state}`}
                  onClick={() => setStep(number)}
                  tabIndex={-1}
                  aria-label={`Ir al paso ${number}`}
                >
                  {number}
                </button>
              </Fragment>
            )
          })}
        </div>

        {/* Imagen del paso */}
        <div className="tutorial-figure">
          {imageError ? (
            <div className="tutorial-image-fallback">
              <span className="tutorial-image-fallback-icon">🖼️</span>
              <strong>Imagen del paso {step} no disponible</strong>
              <small>Agrega la imagen en public/tutorial/</small>
            </div>
          ) : (
            <img
              key={current.image}
              src={current.image}
              alt={`Paso ${step}: ${current.title}`}
              className="tutorial-image"
              onError={() => setImageError(true)}
            />
          )}
        </div>

        <p className="tutorial-caption" id="tutorial-caption">
          <strong>{current.title}.</strong> {current.description}
        </p>

        {isLastStep ? (
          <button type="button" className="tutorial-finish-btn" onClick={close}>
            <Sparkles size={19} />
            <span>¡Entendido, empezar a comprar!</span>
            <ChevronRight size={19} />
          </button>
        ) : (
          <p className="tutorial-hint">
            Usa las flechas para recorrer los {TUTORIAL_TOTAL_STEPS} pasos del autocobro.
          </p>
        )}
      </div>
    </div>
  )
}
