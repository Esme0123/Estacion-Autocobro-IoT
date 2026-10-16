import { createClient } from '@supabase/supabase-js'

// Normalización de la URL de Supabase para evitar sufijos '/rest/v1' que invalidan el SDK
const rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tu-proyecto.supabase.co'
const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').trim()
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'tu_anon_key_publica').trim()

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

// Catálogo base predeterminado para garantizar operación continua, pruebas y modo demostración
export const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: 'Leche Entera 1 Litro',
    barcode: '7771234001',
    rfid_uid: 'TAG_LECHE_1L',
    price: 7.5,
    expected_weight_g: 1025.0,
    stock: 40,
    active: true,
    description: 'Leche pasteurizada en bolsa de 1000 ml',
    image_url: '🥛'
  },
  {
    id: 2,
    name: 'Pan de Molde 500g',
    barcode: '7771234002',
    rfid_uid: 'TAG_PAN_500G',
    price: 12.0,
    expected_weight_g: 510.0,
    stock: 8, // Stock bajo (< 10) para alertar al Gerente
    active: true,
    description: 'Pan blanco rebanado familiar',
    image_url: '🍞'
  },
  {
    id: 3,
    name: 'Galletas de Chocolate 200g',
    barcode: '7771234003',
    rfid_uid: 'TAG_GALLETAS',
    price: 5.5,
    expected_weight_g: 210.0,
    stock: 60,
    active: true,
    description: 'Galletas rellenas con crema de cacao',
    image_url: '🍪'
  },
  {
    id: 4,
    name: 'Jugo de Naranja 1 Litro',
    barcode: '7771234004',
    rfid_uid: 'TAG_JUGO_1L',
    price: 10.0,
    expected_weight_g: 1060.0,
    stock: 25,
    active: true,
    description: 'Jugo 100% natural sin pulpa',
    image_url: '🧃'
  },
  {
    id: 5,
    name: 'Café Tostado y Molido 250g',
    barcode: '7771234005',
    rfid_uid: 'TAG_CAFE_250G',
    price: 28.0,
    expected_weight_g: 265.0,
    stock: 5, // Stock crítico (< 10)
    active: true,
    description: 'Café arábica de altura yungueño',
    image_url: '☕'
  },
  {
    id: 6,
    name: 'Manzanas Rojas 1 kg',
    barcode: '7771234006',
    rfid_uid: 'TAG_MANZANAS_1KG',
    price: 14.0,
    expected_weight_g: 1005.0,
    stock: 32,
    active: true,
    description: 'Manzanas rojas frescas de exportación',
    image_url: '🍎'
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
      // Fallback a almacenamiento local o productos por defecto
      const local = localStorage.getItem('local_products')
      if (local) {
        try { return JSON.parse(local) } catch {}
      }
      return DEFAULT_PRODUCTS
    }

    // Normalizar atributos en caso de que falten en columnas
    const normalized = data.map((p, idx) => ({
      ...p,
      rfid_uid: p.rfid_uid || p.barcode || `TAG_${p.id}`,
      stock: typeof p.stock === 'number' ? p.stock : (DEFAULT_PRODUCTS[idx]?.stock ?? 20),
      image_url: p.image_url || DEFAULT_PRODUCTS.find(dp => dp.barcode === p.barcode)?.image_url || '📦'
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
    const payload = {
      name: product.name,
      barcode: product.barcode,
      price: parseFloat(product.price),
      expected_weight_g: parseFloat(product.expected_weight_g),
      active: product.active ?? true,
      description: product.description || ''
    }

    if (product.id && typeof product.id === 'number') {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', product.id)
        .select()
        .single()

      if (!error && data) {
        savedProduct = { ...savedProduct, ...data }
      }
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert([payload])
        .select()
        .single()

      if (!error && data) {
        savedProduct = { ...savedProduct, ...data }
      } else {
        savedProduct.id = Date.now()
      }
    }
  } catch (err) {
    console.warn('Error guardando en Supabase, guardando localmente:', err)
    if (!savedProduct.id) savedProduct.id = Date.now()
  }

  // Actualizar copia en localStorage
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
      .order('created_at', { ascending: false })
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
  const purchasePayload = {
    total: parseFloat(total),
    status: 'COMPLETED',
    customer_id: customerId || null,
    created_at: new Date().toISOString()
  }

  let purchaseId = Date.now()

  try {
    const { data: createdPurchase, error: pError } = await supabase
      .from('purchases')
      .insert([purchasePayload])
      .select()
      .single()

    if (!pError && createdPurchase) {
      purchaseId = createdPurchase.id

      // Insertar items
      const itemsPayload = items.map(item => ({
        purchase_id: purchaseId,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
        subtotal: parseFloat((item.price * item.quantity).toFixed(2)),
        measured_weight_g: parseFloat(item.expected_weight_g * item.quantity),
        created_at: new Date().toISOString()
      }))

      await supabase.from('purchase_items').insert(itemsPayload)
    }
  } catch (err) {
    console.warn('Error al registrar compra en Supabase, procesando local:', err)
  }

  // Descontar automáticamente el stock de los productos
  try {
    const local = JSON.parse(localStorage.getItem('local_products') || JSON.stringify(DEFAULT_PRODUCTS))
    const updated = local.map(prod => {
      const itemSold = items.find(i => i.id === prod.id)
      if (itemSold) {
        const newStock = Math.max(0, (prod.stock ?? 20) - itemSold.quantity)
        // Intentar actualizar también en Supabase si la columna existe
        supabase.from('products').update({ stock: newStock }).eq('id', prod.id).then(() => {}).catch(() => {})
        return { ...prod, stock: newStock }
      }
      return prod
    })
    localStorage.setItem('local_products', JSON.stringify(updated))
  } catch {}

  // Guardar historial local de compras
  const localPurchase = {
    id: purchaseId,
    total: parseFloat(total),
    status: 'COMPLETED',
    payment_method: paymentMethod || 'TARJETA',
    measured_weight_g: measuredWeightG || 0,
    created_at: new Date().toISOString(),
    purchase_items: items.map(i => ({
      id: Date.now() + Math.random(),
      purchase_id: purchaseId,
      product_id: i.id,
      product_name: i.name,
      quantity: i.quantity,
      unit_price: i.price,
      subtotal: (i.price * i.quantity).toFixed(2),
      measured_weight_g: i.expected_weight_g * i.quantity
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

export async function insertSensorReading({ sensor_type, numeric_value, rfid_uid, device_id = 'CAJA_IOT_01', metadata = {} }) {
  const reading = {
    sensor_type,
    numeric_value: typeof numeric_value === 'number' ? numeric_value : parseFloat(numeric_value || 0),
    rfid_uid: rfid_uid || null,
    device_id,
    metadata,
    created_at: new Date().toISOString()
  }

  try {
    const { data, error } = await supabase
      .from('sensor_readings')
      .insert([reading])
      .select()
      .single()

    if (!error && data) return data
  } catch (err) {
    console.warn('Error inserting reading to Supabase:', err)
  }

  // Backup en localStorage para simulación y offline
  try {
    const local = JSON.parse(localStorage.getItem('local_readings') || '[]')
    reading.id = Date.now()
    local.unshift(reading)
    localStorage.setItem('local_readings', JSON.stringify(local.slice(0, 50)))
  } catch {}

  return reading
}
