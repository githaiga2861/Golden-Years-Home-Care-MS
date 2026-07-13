import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when the app has been pointed at a Supabase project. */
export const isConfigured = Boolean(url && key)

export const supabase = isConfigured
  ? createClient(url, key)
  : null
