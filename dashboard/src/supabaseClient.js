import { createClient } from '@supabase/supabase-js'

// Las credenciales se leen desde variables de entorno (Vite).
// En el repositorio público se usan placeholders por ciberseguridad.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://tu-proyecto.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'tu_anon_key_publica'

export const isSupabaseConfigured =
  !SUPABASE_URL.includes('tu-proyecto') && !SUPABASE_ANON_KEY.includes('tu_anon')

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
