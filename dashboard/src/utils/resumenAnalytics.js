// ============================================================================
// RESUMEN ANALYTICS & DATE UTILITIES - ESTACIÓN AUTOCOBRO IOT
// Zona Horaria: America/La_Paz (UTC-4)
// ============================================================================

export const TIMEZONE = 'America/La_Paz'
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

/**
 * Obtiene los componentes de fecha/hora desglosados en la zona horaria America/La_Paz.
 */
export function getLaPazParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date)

  const m = {}
  parts.forEach((p) => {
    m[p.type] = p.value
  })

  return {
    year: parseInt(m.year, 10),
    month: parseInt(m.month, 10),
    day: parseInt(m.day, 10),
    hour: parseInt(m.hour, 10),
    minute: parseInt(m.minute, 10),
    second: parseInt(m.second, 10)
  }
}

/**
 * Construye un objeto Date en UTC correspondiente al instante exacto (y, m, d, h, min, s)
 * en la zona horaria America/La_Paz (fija en UTC-4).
 */
export function makeLaPazDate(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute, second))
}

/**
 * Convierte un objeto Date o ISO string a formato YYYY-MM-DD en America/La_Paz
 */
export function toLaPazDateInput(date = new Date()) {
  const parts = getLaPazParts(date instanceof Date ? date : new Date(date))
  const y = parts.year
  const m = String(parts.month).padStart(2, '0')
  const d = String(parts.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Calcula los límites de rango de fechas [start, end) inclusivo al inicio, exclusivo al final,
 * y su respectivo período precedente equivalente.
 */
export function getDateRange(preset, customStart = null, customEnd = null) {
  const lp = getLaPazParts()
  const { year, month, day } = lp

  let currentStart
  let currentEnd
  let precedingStart
  let precedingEnd
  let grouping = 'day' // 'hour' | 'day' | 'week'
  let label = ''

  switch (preset) {
    case 'HOY': {
      label = 'Hoy'
      grouping = 'hour'
      currentStart = makeLaPazDate(year, month, day, 0, 0, 0)
      currentEnd = makeLaPazDate(year, month, day + 1, 0, 0, 0)
      precedingStart = makeLaPazDate(year, month, day - 1, 0, 0, 0)
      precedingEnd = makeLaPazDate(year, month, day, 0, 0, 0)
      break
    }
    case '7_DIAS': {
      label = 'Últimos 7 días'
      grouping = 'day'
      currentStart = makeLaPazDate(year, month, day - 6, 0, 0, 0)
      currentEnd = makeLaPazDate(year, month, day + 1, 0, 0, 0)
      precedingStart = makeLaPazDate(year, month, day - 13, 0, 0, 0)
      precedingEnd = makeLaPazDate(year, month, day - 6, 0, 0, 0)
      break
    }
    case '30_DIAS': {
      label = 'Últimos 30 días'
      grouping = 'day'
      currentStart = makeLaPazDate(year, month, day - 29, 0, 0, 0)
      currentEnd = makeLaPazDate(year, month, day + 1, 0, 0, 0)
      precedingStart = makeLaPazDate(year, month, day - 59, 0, 0, 0)
      precedingEnd = makeLaPazDate(year, month, day - 29, 0, 0, 0)
      break
    }
    case 'ESTE_MES': {
      label = 'Este mes'
      grouping = 'day'
      currentStart = makeLaPazDate(year, month, 1, 0, 0, 0)
      currentEnd = makeLaPazDate(year, month + 1, 1, 0, 0, 0)
      precedingStart = makeLaPazDate(year, month - 1, 1, 0, 0, 0)
      precedingEnd = makeLaPazDate(year, month, 1, 0, 0, 0)
      break
    }
    case 'MES_ANTERIOR': {
      label = 'Mes anterior'
      grouping = 'day'
      currentStart = makeLaPazDate(year, month - 1, 1, 0, 0, 0)
      currentEnd = makeLaPazDate(year, month, 1, 0, 0, 0)
      precedingStart = makeLaPazDate(year, month - 2, 1, 0, 0, 0)
      precedingEnd = makeLaPazDate(year, month - 1, 1, 0, 0, 0)
      break
    }
    case 'PERSONALIZADO':
    default: {
      label = 'Personalizado'
      if (customStart && customEnd) {
        const [sy, sm, sd] = customStart.split('-').map(Number)
        const [ey, em, ed] = customEnd.split('-').map(Number)
        currentStart = makeLaPazDate(sy, sm, sd, 0, 0, 0)
        // End boundary exclusive (+1 day from end date)
        currentEnd = makeLaPazDate(ey, em, ed + 1, 0, 0, 0)
      } else {
        currentStart = makeLaPazDate(year, month, day - 6, 0, 0, 0)
        currentEnd = makeLaPazDate(year, month, day + 1, 0, 0, 0)
      }

      const durationMs = currentEnd.getTime() - currentStart.getTime()
      precedingStart = new Date(currentStart.getTime() - durationMs)
      precedingEnd = new Date(currentStart.getTime())

      const durationDays = durationMs / (1000 * 60 * 60 * 24)
      if (durationDays <= 1.05) {
        grouping = 'hour'
      } else if (durationDays <= 31) {
        grouping = 'day'
      } else {
        grouping = 'week'
      }
      break
    }
  }

  return {
    preset,
    label,
    grouping,
    currentStart,
    currentEnd,
    precedingStart,
    precedingEnd
  }
}

/**
 * Determina si una compra está pagada/completada.
 */
export function isPaidPurchase(purchase) {
  if (!purchase) return false
  const s = String(purchase.status || '').toLowerCase().trim()
  return s === 'pagada' || s === 'completed' || s === 'paid' || s === 'completada'
}

/**
 * Obtiene la fecha de finalización (finished_at) para ventas pagadas,
 * con fallback a created_at si finished_at no estuviera presente.
 */
export function getPurchaseFinishedDate(purchase) {
  if (!purchase) return null
  const raw = purchase.finished_at || purchase.created_at
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Obtiene la fecha de inicio (started_at) para actividad de compra,
 * con fallback a created_at si started_at no estuviera presente.
 */
export function getPurchaseStartedDate(purchase) {
  if (!purchase) return null
  const raw = purchase.started_at || purchase.created_at
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Calcula el porcentaje de cambio entre el período actual y el período precedente.
 */
export function calcPercentageChange(current, preceding) {
  if (preceding === 0) {
    if (current === 0) return { pct: 0, text: '0.0%', dir: 'neutral' }
    return { pct: 100, text: '+100%', dir: 'up' }
  }
  const diff = ((current - preceding) / preceding) * 100
  const dir = diff > 0.05 ? 'up' : diff < -0.05 ? 'down' : 'neutral'
  const sign = diff > 0 ? '+' : ''
  return {
    pct: diff,
    text: `${sign}${diff.toFixed(1)}%`,
    dir
  }
}

/**
 * Calcula los 3 KPIs principales de ventas (Ingresos, Ventas, Ticket Promedio)
 * y su comparación contra el período precedente equivalente.
 */
export function calculateSalesKPIs(purchases, currentStart, currentEnd, precedingStart, precedingEnd) {
  const cStart = currentStart.getTime()
  const cEnd = currentEnd.getTime()
  const pStart = precedingStart.getTime()
  const pEnd = precedingEnd.getTime()

  let currentRevenue = 0
  let currentCount = 0
  let precedingRevenue = 0
  let precedingCount = 0

  let inProgressCount = 0
  let precedingInProgressCount = 0

  purchases.forEach((p) => {
    const isPaid = isPaidPurchase(p)
    const st = String(p.status || '').toLowerCase().trim()
    const isCancelled = st === 'cancelled' || st === 'cancelada'

    if (isPaid) {
      const finishedDate = getPurchaseFinishedDate(p)
      if (finishedDate) {
        const t = finishedDate.getTime()
        const total = parseFloat(p.total) || 0

        if (t >= cStart && t < cEnd) {
          currentRevenue += total
          currentCount += 1
        } else if (t >= pStart && t < pEnd) {
          precedingRevenue += total
          precedingCount += 1
        }
      }
    } else if (!isCancelled) {
      // Compra en curso / pendiente: filtrar por started_at
      const startedDate = getPurchaseStartedDate(p)
      if (startedDate) {
        const t = startedDate.getTime()
        if (t >= cStart && t < cEnd) {
          inProgressCount += 1
        } else if (t >= pStart && t < pEnd) {
          precedingInProgressCount += 1
        }
      }
    }
  })

  const currentAverage = currentCount > 0 ? currentRevenue / currentCount : 0
  const precedingAverage = precedingCount > 0 ? precedingRevenue / precedingCount : 0

  return {
    currentRevenue,
    currentCount,
    currentAverage,
    precedingRevenue,
    precedingCount,
    precedingAverage,
    inProgressCount,
    precedingInProgressCount,
    revenueChange: calcPercentageChange(currentRevenue, precedingRevenue),
    countChange: calcPercentageChange(currentCount, precedingCount),
    averageChange: calcPercentageChange(currentAverage, precedingAverage)
  }
}

/**
 * Construye la serie temporal para el gráfico "Evolución de ventas"
 * agrupando por hora, día o semana y rellenando fechas faltantes con 0.
 */
export function buildSalesEvolutionChart(purchases, currentStart, currentEnd, grouping) {
  const buckets = []
  const cStart = currentStart.getTime()
  const cEnd = currentEnd.getTime()

  if (grouping === 'hour') {
    // 24 cubos de 1 hora
    const lp = getLaPazParts(currentStart)
    for (let h = 0; h < 24; h++) {
      const bStart = makeLaPazDate(lp.year, lp.month, lp.day, h, 0, 0)
      const bEnd = makeLaPazDate(lp.year, lp.month, lp.day, h + 1, 0, 0)
      const label = `${String(h).padStart(2, '0')}:00`
      buckets.push({
        label,
        startMs: bStart.getTime(),
        endMs: bEnd.getTime(),
        revenue: 0,
        count: 0
      })
    }
  } else if (grouping === 'week') {
    // Cubos de 7 días
    let curMs = cStart
    let weekIndex = 1
    while (curMs < cEnd) {
      const nextMs = Math.min(curMs + 7 * 24 * 60 * 60 * 1000, cEnd)
      const curDate = new Date(curMs)
      const nextDate = new Date(nextMs - 1)
      const labelStart = curDate.toLocaleDateString('es-BO', { timeZone: TIMEZONE, day: 'numeric', month: 'short' })
      const labelEnd = nextDate.toLocaleDateString('es-BO', { timeZone: TIMEZONE, day: 'numeric', month: 'short' })
      const label = `${labelStart} - ${labelEnd}`

      buckets.push({
        label,
        startMs: curMs,
        endMs: nextMs,
        revenue: 0,
        count: 0
      })
      curMs = nextMs
      weekIndex++
    }
  } else {
    // Agrupación por día (default para períodos <= 30 días)
    let curMs = cStart
    while (curMs < cEnd) {
      const nextMs = curMs + 24 * 60 * 60 * 1000
      const curDate = new Date(curMs)
      const label = curDate.toLocaleDateString('es-BO', {
        timeZone: TIMEZONE,
        day: 'numeric',
        month: 'short'
      })
      buckets.push({
        label,
        startMs: curMs,
        endMs: nextMs,
        revenue: 0,
        count: 0
      })
      curMs = nextMs
    }
  }

  // Acumular ventas en los cubos
  purchases.forEach((p) => {
    if (!isPaidPurchase(p)) return
    const finishedDate = getPurchaseFinishedDate(p)
    if (!finishedDate) return
    const t = finishedDate.getTime()
    if (t < cStart || t >= cEnd) return

    const total = parseFloat(p.total) || 0
    const bucket = buckets.find((b) => t >= b.startMs && t < b.endMs)
    if (bucket) {
      bucket.revenue += total
      bucket.count += 1
    }
  })

  return {
    labels: buckets.map((b) => b.label),
    revenueData: buckets.map((b) => parseFloat(b.revenue.toFixed(2))),
    countData: buckets.map((b) => b.count)
  }
}

/**
 * Construye los datos para el gráfico horizontal "Productos más vendidos" (Top 5)
 * permitiendo alternar entre 'units' e 'revenue'.
 */
export function buildTopProductsChart(purchases, currentStart, currentEnd, mode = 'units', productsCatalog = []) {
  const cStart = currentStart.getTime()
  const cEnd = currentEnd.getTime()
  const map = {}

  purchases.forEach((p) => {
    if (!isPaidPurchase(p)) return
    const finishedDate = getPurchaseFinishedDate(p)
    if (!finishedDate) return
    const t = finishedDate.getTime()
    if (t < cStart || t >= cEnd) return

    const items = p.purchase_items || []
    items.forEach((item) => {
      const prodName =
        item.product_name ||
        productsCatalog.find((prod) => prod.id === item.product_id)?.name ||
        `Producto #${item.product_id || item.id}`
      const qty = parseInt(item.quantity, 10) || 1
      const subtotal = parseFloat(item.subtotal || item.unit_price * qty || 0)

      if (!map[prodName]) {
        map[prodName] = { name: prodName, units: 0, revenue: 0 }
      }
      map[prodName].units += qty
      map[prodName].revenue += subtotal
    })
  })

  const list = Object.values(map)
  // Ordenar descendente según el modo seleccionado
  if (mode === 'revenue') {
    list.sort((a, b) => b.revenue - a.revenue)
  } else {
    list.sort((a, b) => b.units - a.units)
  }

  const top5 = list.slice(0, 5)

  return {
    hasData: top5.length > 0,
    labels: top5.map((item) => item.name),
    data: top5.map((item) => (mode === 'revenue' ? parseFloat(item.revenue.toFixed(2)) : item.units)),
    fullItems: top5
  }
}

/**
 * Evalúa el estado de comunicación y lectura reciente de un dispositivo sensor.
 * Reglas:
 * - Deshabilitado: sensor_devices.active = false
 * - Sin datos: No existen lecturas en sensor_readings
 * - Activo: Configurado activo y última lectura recibida en <= 24 horas
 * - Sin actividad reciente: Configurado activo pero última lectura recibida > 24 horas
 */
export function getSensorStatusInfo(device, latestReading) {
  const isDeviceActive = device.active !== false

  if (!isDeviceActive) {
    return {
      statusKey: 'disabled',
      statusLabel: 'Deshabilitado',
      badgeClass: 'status-badge disabled',
      configuredLabel: 'Inactivo / Deshabilitado',
      readingDisplay: 'Sin transmisión requerida',
      exactTime: '—',
      relativeTime: '—'
    }
  }

  if (!latestReading || !latestReading.created_at) {
    return {
      statusKey: 'no_data',
      statusLabel: 'Sin datos',
      badgeClass: 'status-badge nodata',
      configuredLabel: 'Activo en sistema',
      readingDisplay: 'Aún no se registran eventos',
      exactTime: 'Sin registros',
      relativeTime: 'Nunca'
    }
  }

  const readingMs = new Date(latestReading.created_at).getTime()
  const nowMs = Date.now()
  const diffMs = nowMs - readingMs
  const isRecent = diffMs <= TWENTY_FOUR_HOURS_MS

  const statusKey = isRecent ? 'active' : 'stale'
  const statusLabel = isRecent ? 'Activo' : 'Sin actividad reciente'
  const badgeClass = isRecent ? 'status-badge active' : 'status-badge stale'

  // Información específica por tipo de sensor
  let readingDisplay = ''
  const sensorType = (device.sensor_type || '').toLowerCase()

  if (sensorType === 'hx711' || sensorType === 'weight') {
    const unit = latestReading.metadata?.unit || 'g'
    const val = parseFloat(latestReading.numeric_value ?? 0).toFixed(1)
    readingDisplay = `${val} ${unit}`
  } else if (sensorType === 'proximidad') {
    if (latestReading.metadata?.event) {
      readingDisplay = latestReading.metadata.event
    } else if (latestReading.numeric_value !== undefined && latestReading.numeric_value !== null) {
      const num = parseFloat(latestReading.numeric_value)
      if (num === 1) {
        readingDisplay = 'Presencia detectada'
      } else if (num === 0) {
        readingDisplay = 'Sin presencia / Despejado'
      } else {
        readingDisplay = `${num.toFixed(1)} cm (Detección)`
      }
    } else {
      readingDisplay = 'Evento de proximidad registrado'
    }
  } else if (sensorType === 'magnetico') {
    const val = parseInt(latestReading.numeric_value, 10)
    const st = String(latestReading.metadata?.state || latestReading.metadata?.estado || '').toLowerCase()
    if (val === 1 || st === 'open' || st === 'abierta' || st === 'abierto') {
      readingDisplay = 'Puerta abierta'
    } else {
      readingDisplay = 'Puerta cerrada'
    }
  } else if (sensorType === 'rc522') {
    // Lector RFID: mostrar evento SIN exponer el rfid_uid
    readingDisplay = 'Lectura de tag RFID registrada'
  } else {
    readingDisplay = `Valor: ${latestReading.numeric_value ?? '-'}`
  }

  const exactTime = formatExactDateTimeLaPaz(latestReading.created_at)
  const relativeTime = getRelativeTime(latestReading.created_at)

  return {
    statusKey,
    statusLabel,
    badgeClass,
    configuredLabel: 'Activo en sistema',
    readingDisplay,
    exactTime,
    relativeTime
  }
}

/**
 * Traduce el estado de una compra al español con su clase visual correspondiente.
 */
export function translatePurchaseStatus(status) {
  const s = String(status || '').toLowerCase().trim()
  if (s === 'pagada' || s === 'completed' || s === 'paid' || s === 'completada') {
    return { label: 'Pagada', className: 'purchase-badge success', key: 'pagada' }
  }
  if (s === 'iniciada' || s === 'started' || s === 'init') {
    return { label: 'Iniciada', className: 'purchase-badge info', key: 'iniciada' }
  }
  if (s === 'en proceso' || s === 'en_proceso' || s === 'in_progress' || s === 'processing') {
    return { label: 'En proceso', className: 'purchase-badge in-progress', key: 'en proceso' }
  }
  if (s === 'pending' || s === 'pendiente') {
    return { label: 'Pendiente', className: 'purchase-badge warning', key: 'pendiente' }
  }
  if (s === 'cancelled' || s === 'cancelada') {
    return { label: 'Cancelada', className: 'purchase-badge error', key: 'cancelada' }
  }
  return { label: status || 'Registrada', className: 'purchase-badge neutral', key: s }
}

/**
 * Formato de fecha exacto en La Paz (es-BO)
 */
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

/**
 * Formato de fecha legible corta en La Paz (ej: 22/11/2026 19:40)
 */
export function formatShortDateTimeLaPaz(dateStr) {
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
    hour12: true
  })
}

/**
 * Calcula un tiempo relativo en español ("Hace 5 min", "Hace 2 h", etc.)
 */
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
 * Formatea un valor monetario en bolivianos (Bs. XX.XX)
 */
export function formatBs(amount) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount || 0)
  return `Bs. ${num.toFixed(2)}`
}
