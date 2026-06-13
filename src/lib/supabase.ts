import { createClient } from '@supabase/supabase-js'

// Strip any char outside printable ASCII (e.g. invisible BOM U+FEFF from env file encoding)
function ascii(s: string) { return s.replace(/[^\x20-\x7e]/g, '') }

export const supabaseUrl = ascii(String(import.meta.env.VITE_SUPABASE_URL ?? ''))
export const supabaseKey = ascii(String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''))

export const supabase = createClient(supabaseUrl, supabaseKey)
