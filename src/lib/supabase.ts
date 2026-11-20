import { createClient } from '@supabase/supabase-js'

// Chiave "publishable": è pensata per stare nel browser. I dati sono protetti
// dalle regole di Row Level Security definite in supabase/migrations.
export const SUPABASE_URL = 'https://gfjxzraddkxjzncjxfjm.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hUUZ6wzVtmMwG3irEWSNzg_r7IxO4rk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Messaggio leggibile da un errore Supabase/Postgres. */
export function messaggioErrore(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Qualcosa è andato storto. Riprova.'
}
