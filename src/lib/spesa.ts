// Calcolo della lista della spesa a partire dal menu della settimana.
import type { Ingrediente, PranzoUfficio } from './ricette'

export const REPARTI = [
  'Frutta e verdura',
  'Carne e pesce',
  'Latticini e uova',
  'Pane e sostituti',
  'Pasta riso e cereali',
  'Legumi e conserve',
  'Surgelati',
  'Olio condimenti e spezie',
  'Altro',
] as const

export interface RicettaSpesa {
  id: string
  porzioni: number
  ingredienti: Ingrediente[]
  pranzo_ufficio: PranzoUfficio | null
}

export interface RigaMenuSpesa {
  ricetta_id: string | null
  variante_ufficio: string | null
  porzioni: Record<string, number>
}

export interface VoceDispensa {
  nome: string
  quantita: number | null
  unita: string | null
}

export interface VoceCalcolata {
  nome: string
  quantita: number | null // null = q.b.
  unita: string | null // 'g' | 'ml' | 'pz' | 'spicchio' | null
  reparto: string
}

const IGNORA = new Set(['acqua'])

export const chiave = (nome: string) => nome.trim().toLowerCase()

interface Accumulo {
  nome: string
  reparto: string
  g: number // grammi (o ml) totali
  conGrammi: boolean
  pz: number
  spicchi: number
  soloPz: boolean
  qb: boolean
  ml: boolean
}

function accumula(mappa: Map<string, Accumulo>, i: Ingrediente, fattore: number) {
  const k = chiave(i.nome)
  if (!k || IGNORA.has(k)) return
  const a =
    mappa.get(k) ??
    ({ nome: i.nome.trim(), reparto: i.reparto || 'Altro', g: 0, conGrammi: false, pz: 0, spicchi: 0, soloPz: true, qb: false, ml: false } as Accumulo)
  mappa.set(k, a)
  if (i.unita === 'q.b.' || i.quantita == null) {
    a.qb = true
    return
  }
  const q = i.quantita * fattore
  if (i.unita === 'pz') {
    a.pz += q
    if (i.grammi) {
      a.g += i.grammi * fattore
      a.conGrammi = true
    }
    return
  }
  if (i.unita === 'spicchio') {
    a.spicchi += q
    a.soloPz = false
    return
  }
  a.soloPz = false
  if (i.unita === 'g' || i.unita === 'ml') {
    a.g += q
    a.conGrammi = true
    if (i.unita === 'ml') a.ml = true
  } else if (i.grammi) {
    // cucchiai e cucchiaini: si comprano a peso
    a.g += i.grammi * fattore
    a.conGrammi = true
  } else {
    a.qb = true
  }
}

/** Somma gli ingredienti del menu. Il pranzo ufficio conta una volta sola (base per 4 + extra delle varianti). */
export function calcolaSpesa(
  righe: RigaMenuSpesa[],
  ricette: Map<string, RicettaSpesa>,
  ricettaUfficioId: string | null,
): VoceCalcolata[] {
  const mappa = new Map<string, Accumulo>()
  let ufficioContato = false
  for (const r of righe) {
    const ric = r.ricetta_id ? ricette.get(r.ricetta_id) : undefined
    if (!ric) continue
    if (r.variante_ufficio && ric.pranzo_ufficio && ric.id === ricettaUfficioId) {
      if (!ufficioContato) {
        ufficioContato = true
        for (const i of ric.pranzo_ufficio.ingredienti_base) accumula(mappa, i, 1)
        for (const v of ric.pranzo_ufficio.varianti) for (const i of v.ingredienti_extra) accumula(mappa, i, 1)
      }
      continue
    }
    const tot = Object.values(r.porzioni ?? {}).reduce((s, q) => s + (q || 0), 0)
    if (!tot) continue
    const fattore = tot / (ric.porzioni || 2)
    for (const i of ric.ingredienti) accumula(mappa, i, fattore)
  }

  const voci: VoceCalcolata[] = []
  for (const a of mappa.values()) {
    if (a.soloPz && a.pz > 0) voci.push({ nome: a.nome, quantita: arrotondaPezzi(a.pz), unita: 'pz', reparto: a.reparto })
    else if (a.conGrammi && a.g > 0) voci.push({ nome: a.nome, quantita: arrotondaGrammi(a.g), unita: a.ml ? 'ml' : 'g', reparto: a.reparto })
    else if (a.spicchi > 0) voci.push({ nome: a.nome, quantita: Math.ceil(a.spicchi), unita: 'spicchio', reparto: a.reparto })
    else if (a.pz > 0) voci.push({ nome: a.nome, quantita: arrotondaPezzi(a.pz), unita: 'pz', reparto: a.reparto })
    else if (a.qb) voci.push({ nome: a.nome, quantita: null, unita: null, reparto: a.reparto })
  }
  return voci.sort((x, y) => x.nome.localeCompare(y.nome))
}

function arrotondaGrammi(g: number) {
  if (g >= 100) return Math.ceil(g / 10) * 10
  return Math.ceil(g / 5) * 5
}

function arrotondaPezzi(p: number) {
  return Math.ceil(p * 4 - 0.01) / 4 // al quarto superiore
}

/** Toglie quello che c'è in dispensa. Una voce di dispensa senza quantità vale "ce l'ho". */
export function togliDispensa(voci: VoceCalcolata[], dispensa: VoceDispensa[]): VoceCalcolata[] {
  const d = new Map(dispensa.map((x) => [chiave(x.nome), x]))
  const out: VoceCalcolata[] = []
  for (const v of voci) {
    const x = d.get(chiave(v.nome))
    if (!x) {
      out.push(v)
      continue
    }
    if (x.quantita == null || v.quantita == null) continue
    if ((x.unita ?? '') !== (v.unita ?? '')) {
      out.push(v)
      continue
    }
    const resto = v.quantita - x.quantita
    if (resto > 0) out.push({ ...v, quantita: v.unita === 'pz' ? arrotondaPezzi(resto) : arrotondaGrammi(resto) })
  }
  return out
}

const FRAZ: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }

export function quantitaSpesa(q: number | null, unita: string | null): string {
  if (q == null) return 'q.b.'
  if (unita === 'g' || unita === 'ml') {
    if (q >= 1000) return `${(Math.round(q / 50) / 20).toLocaleString('it-IT')} ${unita === 'g' ? 'kg' : 'l'}`
    return `${q} ${unita}`
  }
  const intero = Math.floor(q)
  const resto = (q - intero).toFixed(2).replace(/0$/, '')
  const testo = (intero || '') + (FRAZ[String(Number(resto))] ?? '') || '0'
  if (unita === 'spicchio') return `${testo} ${q > 1 ? 'spicchi' : 'spicchio'}`
  if (unita === 'pz') return `${testo}`
  return `${testo}${unita ? ' ' + unita : ''}`
}
