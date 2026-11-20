import { createClient } from '@supabase/supabase-js'

// Chiave "publishable": è pensata per stare nel browser. I dati sono protetti
// dalle regole di Row Level Security definite in supabase/migrations.
export const SUPABASE_URL = 'https://gfjxzraddkxjzncjxfjm.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hUUZ6wzVtmMwG3irEWSNzg_r7IxO4rk'

// Letti PRIMA che il client consumi il link (conferma email / nuova password)
const hashIniziale = window.location.hash
export const daLinkEmail = /access_token=|error_description=/.test(hashIniziale)
export const linkDiRecupero = /type=recovery/.test(hashIniziale)
export const erroreDaLink: string | null = (() => {
  const m = hashIniziale.match(/error_description=([^&]+)/)
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null
})()

// flowType "implicit": i link nelle email funzionano anche se aperti in un browser
// diverso da quello in cui sono stati richiesti.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
})

/** Messaggio leggibile da un errore Supabase/Postgres. */
export function messaggioErrore(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Qualcosa è andato storto. Riprova.'
}
