// ============================================================================
// SENSOR ANALYTICS & DIAGNOSTICS - ESTACIÓN AUTOCOBRO IOT
// Zona Horaria: America/La_Paz (UTC-4)
// ============================================================================

export const TIMEZONE = 'America/La_Paz'
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export const DEFAULT_SENSOR_DEVICES = [
  {
    id: 1,
    name: 'Balanza',
    sensor_type: 'hx711',
    gpio: 'GPIO 4 / 5 (DT/SCK)',
    description: 'Báscula de celda de carga HX711 para verificación de peso',
    active: true
  },
  {
    id: 2,
    name: 'Sensor de Proximidad',
    sensor_type: 'proximidad',
    gpio: 'GPIO 17 / 2 (Trig/Echo)',
    description: 'Sensor infrarrojo / ultrasónico de detección de presencia de cliente',
    active: true
  },
  {
    id: 3,
    name: 'Sensor Magnético',
    sensor_type: 'magnetico',
    gpio: 'GPIO 14',
    description: 'Sensor magnético reed switch para monitoreo de puerta de estación',
    active: true
  },
  {
    id: 4,
    name: 'Lector RFID',
    sensor_type: 'rc522',
    gpio: 'SPI (GPIO 18, 19, 23, 5)',
    description: 'Lector de tarjetas y tags RFID RC522 (13.56 MHz)',
    active: true
  }
]

/**
 * Calcula los límites de tiempo para el selector de período histórico.
 */
export function getSensorPeriodRange(preset, customStart = null, customEnd = null) {
  const now = new Date()
  let start
  let end = new Date(now)
  let grouping = 'hour' // 'hour' | 'day'
  let label = ''

  if (preset === '24_HORAS') {
    label = 'Últimas 24 horas'
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    grouping = 'hour'
  } else if (preset === '7_DIAS') {
    label = 'Últimos 7 días'
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    grouping = 'day'
  } else if (preset === '30_DIAS') {
    label = 'Últimos 30 días'
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    grouping = 'day'
  } else if (preset === 'PERSONALIZADO') {
    label = 'Personalizado'
    if (customStart && customEnd) {
      // YYYY-MM-DD
      const [sy, sm, sd] = customStart.split('-').map(Number)
      const [ey, em, ed] = customEnd.split('-').map(Number)
      start = new Date(Date.UTC(sy, sm - 1, sd, 4, 0, 0)) // 00:00:00 La Paz (UTC-4)
      end = new Date(Date.UTC(ey, em - 1, ed + 1, 4, 0, 0)) // Fin de día inclusivo
    } else {
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    grouping = diffDays <= 2 ? 'hour' : 'day'
  } else {
    label = 'Últimas 24 horas'
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    grouping = 'hour'
  }

  return { preset, label, start, end, grouping }
}

/**
 * Determina si una lectura de sensor pertenece al período de tiempo activo.
 * - Para períodos predefinidos continuos ('24_HORAS', '7_DIAS', '30_DIAS'),
 *   verifica que la lectura haya ocurrido después de la fecha de inicio del período móvil.
 * - Para 'PERSONALIZADO', valida que esté estrictamente en el intervalo [start, end).
 */
export function isReadingInPeriod(reading, activePeriod) {
  if (!reading || !reading.created_at) return false
  const t = new Date(reading.created_at).getTime()
  if (isNaN(t)) return false

  const startMs = activePeriod.start instanceof Date
    ? activePeriod.start.getTime()
    : new Date(activePeriod.start).getTime()

  if (activePeriod.preset === 'PERSONALIZADO') {
    const endMs = activePeriod.end instanceof Date
      ? activePeriod.end.getTime()
      : new Date(activePeriod.end).getTime()
    return t >= startMs && t < endMs
  }

  // Para ventanas continuas (24_HORAS, 7_DIAS, 30_DIAS):
  // La lectura pertenece al período si su timestamp es posterior al inicio.
  // Se añade 60 segundos de tolerancia a futuro para compensar diferencias de reloj del cliente.
  return t >= startMs && t <= Date.now() + 60 * 1000
}

/**
 * Determina el estado de salud de comunicación de un sensor.
 */
export function getSensorHealth(device, latestReading) {
  if (device.active === false) {
    return {
      key: 'deshabilitado',
      label: 'Deshabilitado',
      className: 'health-badge disabled',
      description: 'Dispositivo configurado como inactivo'
    }
  }

  if (!latestReading || !latestReading.created_at) {
    return {
      key: 'sin_datos',
      label: 'Sin datos',
      className: 'health-badge nodata',
      description: 'No existen lecturas registradas'
    }
  }

  const readingMs = new Date(latestReading.created_at).getTime()
  const nowMs = Date.now()
  const diffMs = nowMs - readingMs

  if (diffMs <= TWENTY_FOUR_HOURS_MS) {
    return {
      key: 'activo',
      label: 'Activo',
      className: 'health-badge active',
      description: 'Transmisión reciente (< 24 h)'
    }
  }

  return {
    key: 'sin_actividad',
    label: 'Sin actividad reciente',
    className: 'health-badge stale',
    description: 'Última lectura hace más de 24 horas'
  }
}

// ----------------------------------------------------------------------------
// A. BALANZA (HX711) - CÁLCULOS ESTADÍSTICOS Y GRÁFICOS
// ----------------------------------------------------------------------------
export function calculateWeightStats(readings) {
  const numericList = readings
    .map(r => parseFloat(r.numeric_value))
    .filter(val => !isNaN(val) && val >= 0)

  const count = numericList.length
  if (count === 0) {
    return {
      totalCount: 0,
      avgWeight: 0,
      minWeight: 0,
      maxWeight: 0,
      highestWeight: 0,
      stdDev: null,
      anomalyPercent: null
    }
  }

  let sum = 0
  let min = numericList[0]
  let max = numericList[0]

  for (let i = 0; i < count; i++) {
    const val = numericList[i]
    sum += val
    if (val < min) min = val
    if (val > max) max = val
  }

  const avg = sum / count

  // Desviación estándar (si count >= 2)
  let stdDev = null
  let anomalyPercent = null

  if (count >= 2) {
    const variance = numericList.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / (count - 1)
    stdDev = Math.sqrt(variance)

    // Anomalías estadísticas: Lecturas con Z-score > 2 (si count >= 5 y stdDev > 0)
    if (count >= 5 && stdDev > 0.001) {
      const anomalyCount = numericList.filter(val => Math.abs(val - avg) / stdDev > 2).length
      anomalyPercent = (anomalyCount / count) * 100
    } else {
      anomalyPercent = 0
    }
  }

  return {
    totalCount: count,
    avgWeight: avg,
    minWeight: min,
    maxWeight: max,
    highestWeight: max,
    stdDev,
    anomalyPercent
  }
}

/**
 * Gráfico 1 Balanza: Evolución del peso a lo largo del tiempo.
 */
export function buildWeightTimelineChart(readings) {
  // Ordenar cronológicamente (más antiguo a más reciente)
  const sorted = [...readings].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const labels = sorted.map(r => formatShortTimeLaPaz(r.created_at))
  const data = sorted.map(r => parseFloat(r.numeric_value) || 0)
  const fullTimestamps = sorted.map(r => formatExactDateTimeLaPaz(r.created_at))
  const units = sorted.map(r => r.metadata?.unit || 'g')

  return {
    hasData: sorted.length > 0,
    labels,
    datasets: [
      {
        label: 'Peso Medido (g)',
        data,
        borderColor: '#de7272',
        backgroundColor: 'rgba(222, 114, 114, 0.15)',
        fill: true,
        tension: 0.2,
        pointBackgroundColor: '#de7272',
        pointBorderColor: '#fff',
        pointRadius: sorted.length > 30 ? 2 : 4,
        pointHoverRadius: 6,
        borderWidth: 2
      }
    ],
    fullTimestamps,
    units
  }
}

/**
 * Gráfico 2 Balanza: Histograma de distribución de valores de peso.
 */
export function buildWeightDistributionChart(readings) {
  const numericList = readings
    .map(r => parseFloat(r.numeric_value))
    .filter(val => !isNaN(val) && val >= 0)

  if (numericList.length === 0) {
    return { hasData: false, labels: [], datasets: [] }
  }

  // Rangos de peso basados en los datos (0-200g, 200-500g, 500-1000g, 1000-1500g, >1500g)
  const bins = [
    { label: '0 - 200g', min: 0, max: 200, count: 0 },
    { label: '201 - 500g', min: 200.001, max: 500, count: 0 },
    { label: '501 - 1000g', min: 500.001, max: 1000, count: 0 },
    { label: '1001 - 1500g', min: 1000.001, max: 1500, count: 0 },
    { label: '> 1500g', min: 1500.001, max: Infinity, count: 0 }
  ]

  numericList.forEach(val => {
    for (const bin of bins) {
      if (val >= bin.min && val <= bin.max) {
        bin.count++
        break
      }
    }
  })

  return {
    hasData: true,
    labels: bins.map(b => b.label),
    datasets: [
      {
        label: 'Número de mediciones',
        data: bins.map(b => b.count),
        backgroundColor: ['#ffca88', '#b4e4d6', '#de7272', '#ffb3ba', '#bae1ff'],
        borderRadius: 6
      }
    ]
  }
}

// ----------------------------------------------------------------------------
// B. SENSOR DE PROXIMIDAD - CÁLCULOS Y GRÁFICOS
// ----------------------------------------------------------------------------
export function parseProximityState(reading) {
  if (!reading) return { isPresent: false, label: 'Sin presencia' }

  // 1. Verificar metadata o evento explícito
  const evt = String(reading.metadata?.event || '').toLowerCase()
  if (evt.includes('liberada') || evt.includes('retirado') || evt.includes('ausente') || evt.includes('despejado')) {
    return { isPresent: false, label: 'Sin presencia' }
  }
  if (evt.includes('detectado') || evt.includes('presencia') || evt.includes('ocupado')) {
    return { isPresent: true, label: 'Presencia detectada' }
  }

  // 2. Verificar state
  const stateStr = String(reading.state || '').toLowerCase()
  if (stateStr === 'detectado' || stateStr === 'presente' || stateStr === 'active') {
    return { isPresent: true, label: 'Presencia detectada' }
  }
  if (stateStr === 'despejado' || stateStr === 'ausente') {
    return { isPresent: false, label: 'Sin presencia' }
  }

  // 3. Verificar numeric_value (1 = detectado, 0 = no detectado; o distancia cm: si > 0 y <= 40 cm = cliente frente al kiosko)
  const num = parseFloat(reading.numeric_value)
  if (!isNaN(num)) {
    if (num === 1) return { isPresent: true, label: 'Presencia detectada' }
    if (num === 0) return { isPresent: false, label: 'Sin presencia' }
    if (num > 0 && num <= 45) return { isPresent: true, label: `Presencia detectada (${num.toFixed(1)} cm)` }
    if (num > 45) return { isPresent: false, label: `Sin presencia (${num.toFixed(1)} cm)` }
  }

  return { isPresent: false, label: 'Sin presencia' }
}

export function calculateProximityStats(readings) {
  const total = readings.length
  let presenceCount = 0
  let absenceCount = 0
  let lastPresenceTime = null
  const hourlyCount = {}

  readings.forEach(r => {
    const { isPresent } = parseProximityState(r)
    if (isPresent) {
      presenceCount++
      const d = new Date(r.created_at)
      if (!lastPresenceTime || d.getTime() > new Date(lastPresenceTime).getTime()) {
        lastPresenceTime = r.created_at
      }
    } else {
      absenceCount++
    }

    // Contar eventos por hora del día en La Paz
    const parts = getLaPazHourParts(r.created_at)
    if (parts) {
      const hLabel = `${String(parts.hour).padStart(2, '0')}:00`
      hourlyCount[hLabel] = (hourlyCount[hLabel] || 0) + 1
    }
  })

  // Encontrar hora más activa
  let mostActiveHour = '—'
  let maxEvents = 0
  Object.entries(hourlyCount).forEach(([hour, count]) => {
    if (count > maxEvents) {
      maxEvents = count
      mostActiveHour = `${hour} (${count} eventos)`
    }
  })

  return {
    totalEvents: total,
    presenceCount,
    absenceCount,
    mostActiveHour,
    lastPresenceTime: lastPresenceTime ? formatExactDateTimeLaPaz(lastPresenceTime) : 'Sin detecciones recientes'
  }
}

/**
 * Gráfico 1 Proximidad: Actividad de presencia en escala de tiempo (Escalón 0 ó 1).
 */
export function buildProximityTimelineChart(readings) {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const labels = sorted.map(r => formatShortTimeLaPaz(r.created_at))
  const data = sorted.map(r => (parseProximityState(r).isPresent ? 1 : 0))
  const fullTimestamps = sorted.map(r => formatExactDateTimeLaPaz(r.created_at))
  const stateLabels = sorted.map(r => parseProximityState(r).label)

  return {
    hasData: sorted.length > 0,
    labels,
    datasets: [
      {
        label: 'Estado de presencia',
        data,
        borderColor: '#1b7a63',
        backgroundColor: 'rgba(180, 228, 214, 0.4)',
        stepped: true,
        fill: true,
        borderWidth: 2,
        pointBackgroundColor: '#1b7a63',
        pointBorderColor: '#fff',
        pointRadius: sorted.length > 30 ? 2 : 4
      }
    ],
    fullTimestamps,
    stateLabels
  }
}

/**
 * Gráfico 2 Proximidad: Eventos por hora distinguiendo presencia de ausencia.
 */
export function buildProximityHourlyBars(readings) {
  const hours = []
  for (let h = 0; h < 24; h++) {
    hours.push(String(h).padStart(2, '0') + ':00')
  }

  const presenceData = new Array(24).fill(0)
  const absenceData = new Array(24).fill(0)

  readings.forEach(r => {
    const parts = getLaPazHourParts(r.created_at)
    if (parts && parts.hour >= 0 && parts.hour < 24) {
      if (parseProximityState(r).isPresent) {
        presenceData[parts.hour]++
      } else {
        absenceData[parts.hour]++
      }
    }
  })

  return {
    hasData: readings.length > 0,
    labels: hours,
    datasets: [
      {
        label: 'Presencia detectada',
        data: presenceData,
        backgroundColor: '#b4e4d6',
        borderRadius: 4
      },
      {
        label: 'Sin presencia / Despejado',
        data: absenceData,
        backgroundColor: '#cbd5e1',
        borderRadius: 4
      }
    ]
  }
}

// ----------------------------------------------------------------------------
// C. SENSOR MAGNÉTICO (PUERTA) - CÁLCULOS Y GRÁFICOS
// ----------------------------------------------------------------------------
export function parseMagneticState(reading) {
  if (!reading) return { isOpen: false, label: 'Puerta cerrada' }

  const num = parseInt(reading.numeric_value, 10)
  const st = String(reading.state || reading.metadata?.state || reading.metadata?.estado || '').toLowerCase()

  if (num === 1 || st === 'open' || st === 'abierta' || st === 'abierto') {
    return { isOpen: true, label: 'Puerta abierta' }
  }

  return { isOpen: false, label: 'Puerta cerrada' }
}

export function calculateMagneticStats(readings) {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const total = sorted.length
  let openCount = 0
  let closedCount = 0
  let lastOpenTime = null

  const openDurationsSeconds = []

  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i]
    const { isOpen } = parseMagneticState(curr)

    if (isOpen) {
      openCount++
      lastOpenTime = curr.created_at

      // Si el siguiente evento inmediato es un cierre, calcular duración
      if (i + 1 < sorted.length) {
        const next = sorted[i + 1]
        const nextState = parseMagneticState(next)
        if (!nextState.isOpen) {
          const t1 = new Date(curr.created_at).getTime()
          const t2 = new Date(next.created_at).getTime()
          const diffSec = (t2 - t1) / 1000
          // Duración lógica entre 1s y 600s (10 minutos máx para evitar sesgos de eventos desconectados)
          if (diffSec > 0 && diffSec <= 600) {
            openDurationsSeconds.push(diffSec)
          }
        }
      }
    } else {
      closedCount++
    }
  }

  let avgOpenDuration = 'Datos insuficientes'
  if (openDurationsSeconds.length > 0) {
    const avgSec = openDurationsSeconds.reduce((a, b) => a + b, 0) / openDurationsSeconds.length
    if (avgSec < 60) {
      avgOpenDuration = `${Math.round(avgSec)} s`
    } else {
      avgOpenDuration = `${(avgSec / 60).toFixed(1)} min`
    }
  }

  return {
    totalChanges: total,
    openCount,
    closedCount,
    timeSinceLastOpen: lastOpenTime ? getRelativeTime(lastOpenTime) : 'Sin aperturas registradas',
    avgOpenDuration
  }
}

/**
 * Gráfico 1 Magnético: Historial de apertura y cierre (Escalón 1 = Abierta, 0 = Cerrada).
 */
export function buildMagneticTimelineChart(readings) {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const labels = sorted.map(r => formatShortTimeLaPaz(r.created_at))
  const data = sorted.map(r => (parseMagneticState(r).isOpen ? 1 : 0))
  const fullTimestamps = sorted.map(r => formatExactDateTimeLaPaz(r.created_at))
  const stateLabels = sorted.map(r => parseMagneticState(r).label)

  return {
    hasData: sorted.length > 0,
    labels,
    datasets: [
      {
        label: 'Estado de la puerta',
        data,
        borderColor: '#de7272',
        backgroundColor: 'rgba(222, 114, 114, 0.25)',
        stepped: true,
        fill: true,
        borderWidth: 2,
        pointBackgroundColor: '#de7272',
        pointBorderColor: '#fff',
        pointRadius: sorted.length > 30 ? 2 : 4
      }
    ],
    fullTimestamps,
    stateLabels
  }
}

/**
 * Gráfico 2 Magnético: Cambios de estado (Aperturas y Cierres) por hora o día.
 */
export function buildMagneticChangesBar(readings, grouping = 'hour') {
  if (grouping === 'hour') {
    const labels = []
    for (let h = 0; h < 24; h++) {
      labels.push(String(h).padStart(2, '0') + ':00')
    }
    const openData = new Array(24).fill(0)
    const closeData = new Array(24).fill(0)

    readings.forEach(r => {
      const parts = getLaPazHourParts(r.created_at)
      if (parts && parts.hour >= 0 && parts.hour < 24) {
        if (parseMagneticState(r).isOpen) {
          openData[parts.hour]++
        } else {
          closeData[parts.hour]++
        }
      }
    })

    return {
      hasData: readings.length > 0,
      labels,
      datasets: [
        {
          label: 'Aperturas',
          data: openData,
          backgroundColor: '#de7272',
          borderRadius: 4
        },
        {
          label: 'Cierres',
          data: closeData,
          backgroundColor: '#b4e4d6',
          borderRadius: 4
        }
      ]
    }
  }

  // Agrupación por día (para períodos de 7 ó 30 días)
  const dayMap = {}
  readings.forEach(r => {
    const dayKey = formatDayKeyLaPaz(r.created_at)
    if (!dayMap[dayKey]) {
      dayMap[dayKey] = { open: 0, close: 0 }
    }
    if (parseMagneticState(r).isOpen) {
      dayMap[dayKey].open++
    } else {
      dayMap[dayKey].close++
    }
  })

  const labels = Object.keys(dayMap)
  return {
    hasData: labels.length > 0,
    labels,
    datasets: [
      {
        label: 'Aperturas',
        data: labels.map(k => dayMap[k].open),
        backgroundColor: '#de7272',
        borderRadius: 4
      },
      {
        label: 'Cierres',
        data: labels.map(k => dayMap[k].close),
        backgroundColor: '#b4e4d6',
        borderRadius: 4
      }
    ]
  }
}

// ----------------------------------------------------------------------------
// D. LECTOR RFID (RC522) - CÁLCULOS Y GRÁFICOS (SIN EXPONER UID)
// ----------------------------------------------------------------------------
export function calculateRfidStats(readings, periodHours = 24) {
  const total = readings.length
  const ratePerHour = periodHours > 0 ? (total / periodHours).toFixed(1) : 0

  let latestTimestamp = 'Sin lecturas'
  const hourlyCount = {}

  readings.forEach(r => {
    const d = new Date(r.created_at)
    if (latestTimestamp === 'Sin lecturas' || d.getTime() > new Date(latestTimestamp).getTime()) {
      latestTimestamp = r.created_at
    }

    const parts = getLaPazHourParts(r.created_at)
    if (parts) {
      const hLabel = `${String(parts.hour).padStart(2, '0')}:00`
      hourlyCount[hLabel] = (hourlyCount[hLabel] || 0) + 1
    }
  })

  let mostActivePeriod = '—'
  let maxCount = 0
  Object.entries(hourlyCount).forEach(([period, count]) => {
    if (count > maxCount) {
      maxCount = count
      mostActivePeriod = `${period} (${count} escaneos)`
    }
  })

  return {
    totalEvents: total,
    ratePerHour,
    mostActivePeriod,
    latestTimestamp: latestTimestamp !== 'Sin lecturas' ? formatExactDateTimeLaPaz(latestTimestamp) : 'Sin eventos registrados'
  }
}

/**
 * Gráfico 1 RFID: Lecturas a lo largo del tiempo (barras por hora o día).
 */
export function buildRfidHourlyBarChart(readings, grouping = 'hour') {
  if (grouping === 'hour') {
    const labels = []
    for (let h = 0; h < 24; h++) {
      labels.push(String(h).padStart(2, '0') + ':00')
    }
    const data = new Array(24).fill(0)

    readings.forEach(r => {
      const parts = getLaPazHourParts(r.created_at)
      if (parts && parts.hour >= 0 && parts.hour < 24) {
        data[parts.hour]++
      }
    })

    return {
      hasData: readings.length > 0,
      labels,
      datasets: [
        {
          label: 'Escaneos RFID',
          data,
          backgroundColor: '#ffca88',
          borderRadius: 4
        }
      ]
    }
  }

  // Por día
  const dayMap = {}
  readings.forEach(r => {
    const dayKey = formatDayKeyLaPaz(r.created_at)
    dayMap[dayKey] = (dayMap[dayKey] || 0) + 1
  })

  const labels = Object.keys(dayMap)
  return {
    hasData: labels.length > 0,
    labels,
    datasets: [
      {
        label: 'Escaneos RFID',
        data: labels.map(k => dayMap[k]),
        backgroundColor: '#ffca88',
        borderRadius: 4
      }
    ]
  }
}

/**
 * Gráfico 2 RFID: Línea de tiempo de actividad de lectura (sin exponer UIDs).
 */
export function buildRfidActivityTimelineChart(readings) {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const labels = sorted.map(r => formatShortTimeLaPaz(r.created_at))
  // Magnitud constante o frecuencia acumulada
  const data = sorted.map((_, idx) => idx + 1)
  const fullTimestamps = sorted.map(r => formatExactDateTimeLaPaz(r.created_at))

  return {
    hasData: sorted.length > 0,
    labels,
    datasets: [
      {
        label: 'Total acumulado de eventos de lectura',
        data,
        borderColor: '#925d10',
        backgroundColor: 'rgba(255, 202, 136, 0.2)',
        fill: true,
        tension: 0.15,
        borderWidth: 2,
        pointBackgroundColor: '#925d10',
        pointBorderColor: '#fff',
        pointRadius: sorted.length > 30 ? 2 : 4
      }
    ],
    fullTimestamps
  }
}

// ----------------------------------------------------------------------------
// UTILIDADES DE FORMATO DE FECHA EN LA PAZ (UTC-4)
// ----------------------------------------------------------------------------
export function getLaPazHourParts(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hour12: false
  }).formatToParts(d)

  const p = parts.find(item => item.type === 'hour')
  return p ? { hour: parseInt(p.value, 10) } : null
}

export function formatDayKeyLaPaz(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-BO', {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'short'
  })
}

export function formatShortTimeLaPaz(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('es-BO', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function formatExactDateTimeLaPaz(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-BO', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

export function getRelativeTime(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const time = d.getTime()
  if (isNaN(time)) return '—'
  const diffSec = Math.floor((Date.now() - time) / 1000)

  if (diffSec < 0) return 'Recién'
  if (diffSec < 45) return 'Hace unos segundos'
  if (diffSec < 90) return 'Hace 1 minuto'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `Hace ${diffHour} h`
  const diffDays = Math.floor(diffHour / 24)
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 30) return `Hace ${diffDays} días`
  return `Hace ${Math.floor(diffDays / 30)} mes(es)`
}


/**
 * Traduce e interpreta una fila de sensor_readings para visualización unificada en tablas y listas.
 * NUNCA expone el RFID UID.
 */
export function getReadingDetails(reading) {
  if (!reading) {
    return {
      sensorName: 'Desconocido',
      sensorType: 'desconocido',
      eventState: 'Sin datos',
      displayValue: '—',
      displayUnit: '—',
      exactTime: '—',
      relativeTime: '—',
      deviceId: 'CAJA_IOT_01',
      badgeClass: 'neutral'
    }
  }

  const type = (reading.sensor_type || '').toLowerCase()
  let sensorName = 'Sensor IoT'
  let eventState = 'Lectura registrada'
  let displayValue = reading.numeric_value !== null && reading.numeric_value !== undefined ? String(reading.numeric_value) : '—'
  let displayUnit = reading.metadata?.unit || '—'
  let badgeClass = 'neutral'

  if (type === 'hx711' || type === 'weight') {
    sensorName = 'Balanza HX711'
    const num = parseFloat(reading.numeric_value)
    eventState = !isNaN(num) && num > 0 ? 'Pesaje en bandeja' : 'Bandeja vacía (0 g)'
    displayValue = !isNaN(num) ? num.toFixed(1) : '—'
    displayUnit = reading.metadata?.unit || 'g'
    badgeClass = 'peach'
  } else if (type === 'proximidad') {
    sensorName = 'Proximidad IR'
    const pState = parseProximityState(reading)
    eventState = pState.label
    badgeClass = pState.isPresent ? 'mint' : 'neutral'

    const num = parseFloat(reading.numeric_value)
    if (!isNaN(num) && num > 1) {
      displayValue = num.toFixed(1)
      displayUnit = reading.metadata?.unit || 'cm'
    } else {
      displayValue = pState.isPresent ? '1' : '0'
      displayUnit = '—'
    }
  } else if (type === 'magnetico') {
    sensorName = 'Sensor Magnético'
    const mState = parseMagneticState(reading)
    eventState = mState.label
    badgeClass = mState.isOpen ? 'coral' : 'mint'
    displayValue = mState.isOpen ? '1 (Abierta)' : '0 (Cerrada)'
    displayUnit = '—'
  } else if (type === 'rc522') {
    sensorName = 'Lector RFID RC522'
    eventState = 'Lectura de tag RFID registrada'
    badgeClass = 'cream'
    displayValue = 'Tag verificado'
    displayUnit = '—'
    // IMPORTANTE: Nunca se expone el rfid_uid bajo ninguna circunstancia.
  }

  return {
    sensorName,
    sensorType: type,
    eventState,
    displayValue,
    displayUnit,
    exactTime: formatExactDateTimeLaPaz(reading.created_at),
    relativeTime: getRelativeTime(reading.created_at),
    deviceId: reading.device_id || 'CAJA_IOT_01',
    badgeClass
  }
}
