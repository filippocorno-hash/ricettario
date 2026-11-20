// Date locali in formato AAAA-MM-GG (senza conversioni di fuso orario).

export function isoLocale(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${g}`
}

export function daIso(s: string): Date {
  const [a, m, g] = s.split('-').map(Number)
  return new Date(a, m - 1, g)
}

export function aggiungiGiorni(s: string, n: number): string {
  const d = daIso(s)
  d.setDate(d.getDate() + n)
  return isoLocale(d)
}

/** Lunedì della settimana che contiene la data. */
export function lunediDi(d: Date = new Date()): string {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (c.getDay() + 6) % 7 // 0 = lunedì
  c.setDate(c.getDate() - dow)
  return isoLocale(c)
}

export const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'] as const

export function etichettaGiorno(s: string): string {
  return daIso(s).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function etichettaSettimana(lunedi: string): string {
  const da = daIso(lunedi)
  const a = daIso(aggiungiGiorni(lunedi, 6))
  const f = (d: Date, mese: boolean) => d.toLocaleDateString('it-IT', mese ? { day: 'numeric', month: 'short' } : { day: 'numeric' })
  return da.getMonth() === a.getMonth() ? `${f(da, false)}–${f(a, true)}` : `${f(da, true)} – ${f(a, true)}`
}
