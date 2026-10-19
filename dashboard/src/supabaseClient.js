import { createClient } from '@supabase/supabase-js'

// Normalización de la URL de Supabase para evitar sufijos '/rest/v1' que invalidan el SDK
const rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tu-proyecto.supabase.co'
const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').trim()
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'tu_anon_key_publica').trim()

export const isSupabaseConfigured =
  !cleanUrl.includes('tu-proyecto') &&
  !supabaseKey.includes('tu_anon') &&
  supabaseKey.length > 20

export const supabase = createClient(cleanUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// Catálogo base predeterminado alineado con los datos reales en PostgreSQL
export const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: 'Arroz 1 kg',
    barcode: '100001',
    rfid_uid: '100001',
    price: 8.5,
    expected_weight_g: 1000.0,
    stock: 30,
    active: true,
    description: 'Arroz de grano largo 1 kg',
    image_url: '🌾'
  },
  {
    id: 2,
    name: 'Azucar 1 kg',
    barcode: '100002',
    rfid_uid: '100002',
    price: 7.0,
    expected_weight_g: 1000.0,
    stock: 25,
    active: true,
    description: 'Azúcar blanca refinada 1 kg',
    image_url: '🍬'
  },
  {
    id: 3,
    name: 'Fideos 400 g',
    barcode: '100003',
    rfid_uid: '100003',
    price: 5.5,
    expected_weight_g: 400.0,
    stock: 40,
    active: true,
    description: 'Fideos en paquete de 400 g',
    image_url: '🍝'
  }
]

// -------------------------------------------------------------
// SERVICIOS DE PRODUCTOS (INVENTARIO CRUD)
// -------------------------------------------------------------
export async function getProductsFromDB() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true })

    if (error || !data || data.length === 0) {
      const local = localStorage.getItem('local_products')
      if (local) {
        try { return JSON.parse(local) } catch {}
      }
      return DEFAULT_PRODUCTS
    }

    const normalized = data.map((p, idx) => ({
      ...p,
      rfid_uid: p.barcode || `TAG_${p.id}`,
      stock: DEFAULT_PRODUCTS[idx]?.stock ?? 20, // Stock manejado en cliente (no existe columna en tabla)
      image_url: DEFAULT_PRODUCTS.find(dp => dp.barcode === p.barcode)?.image_url || '📦'
    }))
    localStorage.setItem('local_products', JSON.stringify(normalized))
    return normalized
  } catch (err) {
    console.warn('Error fetching products from Supabase, using fallback:', err)
    const local = localStorage.getItem('local_products')
    return local ? JSON.parse(local) : DEFAULT_PRODUCTS
  }
}

export async function saveProductToDB(product) {
  let savedProduct = { ...product }
  
  try {
    // Mapeo exacto de los campos de la tabla `products`
    const payload = {
      name: product.name,
      barcode: product.barcode || product.rfid_uid,
      price: parseFloat(product.price),
      expected_weight_g: parseFloat(product.expected_weight_g || 0),
      active: product.active ?? true,
      description: product.description || ''
    }

    if (product.id && typeof product.id === 'number') {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', product.id)
        .select()
        .maybeSingle() // <-- .maybeSingle() previene el error PGRST116 / 406

      if (!error && data) {
        savedProduct = { ...savedProduct, ...data }
      } else if (error) {
        console.warn('Error al actualizar producto en Supabase:', error.message)
      }
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert([payload])
        .select()
        .maybeSingle() // <-- .maybeSingle() previene el error PGRST116 / 406

      if (!error && data) {
        savedProduct = { ...savedProduct, ...data }
      } else {
        if (error) console.warn('Error al insertar producto en Supabase:', error.message)
        savedProduct.id = Date.now()
      }
    }
  } catch (err) {
    console.warn('Error guardando en Supabase, guardando localmente:', err)
    if (!savedProduct.id) savedProduct.id = Date.now()
  }

  // Actualizar copia local con stock virtual
  try {
    const local = JSON.parse(localStorage.getItem('local_products') || '[]')
    const idx = local.findIndex(p => p.id === savedProduct.id)
    if (idx >= 0) {
      local[idx] = { ...local[idx], ...savedProduct }
    } else {
      local.push(savedProduct)
    }
    localStorage.setItem('local_products', JSON.stringify(local))
  } catch {}

  return savedProduct
}

export async function deleteProductFromDB(id) {
  try {
    await supabase.from('products').delete().eq('id', id)
  } catch (err) {
    console.warn('Error eliminando de Supabase:', err)
  }

  try {
    const local = JSON.parse(localStorage.getItem('local_products') || '[]')
    const filtered = local.filter(p => p.id !== id)
    localStorage.setItem('local_products', JSON.stringify(filtered))
  } catch {}
}

// -------------------------------------------------------------
// SERVICIOS DE COMPRAS Y SALIDA DE MERCADERÍA
// -------------------------------------------------------------
export async function getPurchasesFromDB() {
  try {
    const { data: purchases, error } = await supabase
      .from('purchases')
      .select('*, purchase_items(*)')
      .order('started_at', { ascending: false })
      .limit(30)

    if (error || !purchases || purchases.length === 0) {
      const local = localStorage.getItem('local_purchases')
      return local ? JSON.parse(local) : []
    }
    return purchases
  } catch (err) {
    console.warn('Error fetching purchases:', err)
    const local = localStorage.getItem('local_purchases')
    return local ? JSON.parse(local) : []
  }
}

export async function recordCompletedPurchase({ items, total, paymentMethod, measuredWeightG, customerId }) {
  // `status` debe respetar el CHECK de PostgreSQL ('pagada')
  const purchasePayload = {
    total: parseFloat(total),
    status: 'pagada',
    customer_id: customerId || null,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString()
  }

  let purchaseId = Date.now()

  try {
    const { data: createdPurchase, error: pError } = await supabase
      .from('purchases')
      .insert([purchasePayload])
      .select()
      .maybeSingle() // <-- .maybeSingle() evita excepciones de 0 filas

    if (!pError && createdPurchase) {
      purchaseId = createdPurchase.id

      // `product_name` es una columna NOT NULL en `purchase_items`
      const itemsPayload = items.map(item => ({
        purchase_id: purchaseId,
        product_id: typeof item.id === 'number' ? item.id : null,
        product_name: item.name || 'Producto General',
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
        subtotal: parseFloat((item.price * item.quantity).toFixed(2)),
        measured_weight_g: parseFloat((item.expected_weight_g || 0) * item.quantity)
      }))

      await supabase.from('purchase_items').insert(itemsPayload)
    } else if (pError) {
      console.warn('Error insertando compra en Supabase:', pError.message)
    }
  } catch (err) {
    console.warn('Error al registrar compra en Supabase, procesando local:', err)
  }

  // Actualización de inventario local
  try {
    const local = JSON.parse(localStorage.getItem('local_products') || JSON.stringify(DEFAULT_PRODUCTS))
    const updated = local.map(prod => {
      const itemSold = items.find(i => i.id === prod.id)
      if (itemSold) {
        const newStock = Math.max(0, (prod.stock ?? 20) - itemSold.quantity)
        return { ...prod, stock: newStock }
      }
      return prod
    })
    localStorage.setItem('local_products', JSON.stringify(updated))
  } catch {}

  // Guardar historial local
  const localPurchase = {
    id: purchaseId,
    total: parseFloat(total),
    status: 'pagada',
    payment_method: paymentMethod || 'TARJETA',
    measured_weight_g: measuredWeightG || 0,
    started_at: new Date().toISOString(),
    purchase_items: items.map(i => ({
      id: Date.now() + Math.random(),
      purchase_id: purchaseId,
      product_id: i.id,
      product_name: i.name,
      quantity: i.quantity,
      unit_price: i.price,
      subtotal: (i.price * i.quantity).toFixed(2),
      measured_weight_g: (i.expected_weight_g || 0) * i.quantity
    }))
  }

  try {
    const history = JSON.parse(localStorage.getItem('local_purchases') || '[]')
    history.unshift(localPurchase)
    localStorage.setItem('local_purchases', JSON.stringify(history.slice(0, 50)))
  } catch {}

  return localPurchase
}

// -------------------------------------------------------------
// SERVICIOS DE TELEMETRÍA IOT (SENSOR_READINGS)
// -------------------------------------------------------------
export async function getSensorReadingsFromDB(limit = 20) {
  try {
    const { data, error } = await supabase
      .from('sensor_readings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data || data.length === 0) {
      const local = localStorage.getItem('local_readings')
      return local ? JSON.parse(local) : []
    }
    return data
  } catch (err) {
    console.warn('Error fetching sensor readings:', err)
    const local = localStorage.getItem('local_readings')
    return local ? JSON.parse(local) : []
  }
}

export async function insertSensorReading({ sensor_type, numeric_value, rfid_uid, device_id = 1, metadata = {} }) {
  // `sensor_type` debe cumplir con la restricción CHECK de PostgreSQL
  const validSensorType = ['magnetico', 'proximidad', 'hx711', 'rc522'].includes(sensor_type)
    ? sensor_type
    : 'rc522'

  const reading = {
    sensor_type: validSensorType,
    numeric_value: typeof numeric_value === 'number' ? numeric_value : parseFloat(numeric_value || 0),
    rfid_uid: rfid_uid || null,
    device_id: typeof device_id === 'number' ? device_id : 1, // Exige tipo BIGINT
    metadata
  }

  try {
    const { data, error } = await supabase
      .from('sensor_readings')
      .insert([reading])
      .select()
      .maybeSingle() // <-- .maybeSingle() previene el error PGRST116 / 406

    if (!error && data) return data
  } catch (err) {
    console.warn('Error inserting reading to Supabase:', err)
  }

  // Backup local
  try {
    const local = JSON.parse(localStorage.getItem('local_readings') || '[]')
    reading.id = Date.now()
    reading.created_at = new Date().toISOString()
    local.unshift(reading)
    localStorage.setItem('local_readings', JSON.stringify(local.slice(0, 50)))
  } catch {}

  return reading
}