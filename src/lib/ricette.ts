import DOMPurify from 'dompurify'
import { marked } from 'marked'

export const CATEGORIE = ['pranzo', 'cena', 'cena post palestra', 'pranzo ufficio'] as const
export type Categoria = (typeof CATEGORIE)[number]

export const ETICHETTA_CATEGORIA: Record<Categoria, string> = {
  pranzo: 'Pranzo',
  cena: 'Cena',
  'cena post palestra': 'Post palestra',
  'pranzo ufficio': 'Pranzo ufficio',
}

export const UNITA = ['g', 'ml', 'pz', 'cucchiaio', 'cucchiaino', 'spicchio', 'q.b.'] as const

export interface Ingrediente {
  nome: string
  quantita: number | null
  unita: string
  grammi: number | null
  reparto: string
  gruppo: string | null
  opzionale: boolean
}

export interface Nutrizione {
  kcal: number
  proteine_g: number
  carboidrati_g: number
  grassi_g: number
  fibre_g: number
}

export interface Variante {
  nome: string
  porzioni: number
  giorni: string[]
  quando: string
  istruzioni: string
  ingredienti_extra: Ingrediente[]
  nutrizione_porzione: Nutrizione
}

export interface PranzoUfficio {
  porzioni: number
  ingredienti_base: Ingrediente[]
  varianti: Variante[]
  conservazione_giorni: number
  riscaldamento: string
}

export interface Ricetta {
  id: string
  stato: 'proposta' | 'accettata'
  origine: 'instagram' | 'manuale'
  titolo: string
  categorie: Categoria[]
  tag: string[]
  tipo_piatto: string | null
  porzioni: number
  tempo_totale_min: number | null
  tempo_attivo_min: number | null
  kcal: number | null
  proteine_g: number | null
  carboidrati_g: number | null
  grassi_g: number | null
  fibre_g: number | null
  ingredienti: Ingrediente[]
  pranzo_ufficio: PranzoUfficio | null
  testo_md: string | null
  fonte_profilo: string | null
  fonte_url: string | null
  data_aggiunta: string
  creata_il: string
  creata_da?: string | null
}

export const CAMPI_ELENCO =
  'id, stato, titolo, categorie, tag, tipo_piatto, porzioni, tempo_totale_min, kcal, proteine_g, carboidrati_g, grassi_g, fonte_profilo, data_aggiunta, creata_il'

const FRAZIONI: [number, string][] = [
  [0.25, '¼'],
  [0.33, '⅓'],
  [0.5, '½'],
  [0.67, '⅔'],
  [0.75, '¾'],
]

function frazione(x: number): string {
  const intero = Math.floor(x)
  const resto = x - intero
  if (resto < 0.12) return String(intero || (x > 0 ? '¼' : '0'))
  if (resto > 0.88) return String(intero + 1)
  let migliore = FRAZIONI[0]
  for (const f of FRAZIONI) if (Math.abs(f[0] - resto) < Math.abs(migliore[0] - resto)) migliore = f
  return intero ? `${intero}${migliore[1]}` : migliore[1]
}

const PLURALE: Record<string, string> = { cucchiaio: 'cucchiai', cucchiaino: 'cucchiaini', spicchio: 'spicchi' }

/** Quantità leggibile, moltiplicata per il fattore delle porzioni. */
export function quantitaLeggibile(i: Ingrediente, fattore: number): string {
  if (i.quantita == null || i.unita === 'q.b.') return 'q.b.'
  const q = i.quantita * fattore
  if (i.unita === 'g' || i.unita === 'ml') {
    const passo = q >= 100 ? 5 : 1
    const v = Math.max(passo, Math.round(q / passo) * passo)
    return v >= 1000 && i.unita === 'g' ? `${(v / 1000).toLocaleString('it-IT')} kg` : `${v} ${i.unita}`
  }
  const testo = frazione(q)
  if (i.unita === 'pz') return testo
  const unita = q > 1.12 ? PLURALE[i.unita] ?? i.unita : i.unita
  return `${testo} ${unita}`
}

/** Raggruppa gli ingredienti mantenendo l'ordine dei gruppi. */
export function perGruppo(ingredienti: Ingrediente[]): [string | null, Ingrediente[]][] {
  const gruppi: [string | null, Ingrediente[]][] = []
  for (const i of ingredienti) {
    const ultimo = gruppi[gruppi.length - 1]
    if (ultimo && ultimo[0] === (i.gruppo ?? null)) ultimo[1].push(i)
    else gruppi.push([i.gruppo ?? null, [i]])
  }
  return gruppi
}

export interface Sezione {
  titolo: string
  html: string
}

/** Sezioni "## ..." del markdown, escluse quelle già mostrate dall'app (ingredienti). */
export function sezioniMarkdown(md: string | null): Sezione[] {
  if (!md) return []
  const parti = md.split(/^## /m).slice(1)
  return parti
    .map((p) => {
      const a = p.indexOf('\n')
      const titolo = (a === -1 ? p : p.slice(0, a)).trim()
      const corpo = a === -1 ? '' : p.slice(a + 1)
      return { titolo, html: DOMPurify.sanitize(marked.parse(corpo, { async: false }) as string) }
    })
    .filter((s) => !/^ingredienti/i.test(s.titolo))
}

export function minuti(m: number | null): string | null {
  if (!m) return null
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
