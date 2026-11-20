// Tabella alimenti (valori per 100 g) e calcolo dei valori nutrizionali di una ricetta.
import { supabase } from './supabase'
import type { Ingrediente, Nutrizione } from './ricette'

export interface Alimento {
  nome: string
  kcal: number
  proteine_g: number
  carboidrati_g: number
  grassi_g: number
  fibre_g: number
  grammi_per_pezzo: number | null
  reparto: string | null
}

let cache: Promise<Map<string, Alimento>> | null = null

export function caricaAlimenti(): Promise<Map<string, Alimento>> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await supabase.from('alimenti').select('*').order('nome')
      if (error) {
        cache = null
        throw error
      }
      return new Map((data as Alimento[]).map((a) => [a.nome.toLowerCase(), a]))
    })()
  }
  return cache
}

const OLIO = /olio/i

/** Grammi stimati di un ingrediente. `prima` è la versione precedente (per riusarne il peso unitario). */
export function grammiIngrediente(i: Ingrediente, a: Alimento | undefined, prima?: Ingrediente): number | null {
  if (i.unita === 'q.b.' || i.quantita == null) return null
  const q = i.quantita
  // peso unitario già stimato nella ricetta originale, se l'unità non è cambiata
  const unitario =
    prima && prima.unita === i.unita && prima.quantita && prima.grammi ? prima.grammi / prima.quantita : null
  switch (i.unita) {
    case 'g':
    case 'ml':
      return q
    case 'pz':
      return unitario != null ? q * unitario : a?.grammi_per_pezzo != null ? q * a.grammi_per_pezzo : null
    case 'cucchiaio':
      return q * (unitario ?? (OLIO.test(i.nome) ? 13 : 15))
    case 'cucchiaino':
      return q * (unitario ?? (OLIO.test(i.nome) ? 4.5 : 5))
    case 'spicchio':
      return q * (unitario ?? 3)
    default:
      return unitario != null ? q * unitario : null
  }
}

export interface RisultatoCalcolo {
  porzione: Nutrizione
  mancanti: string[] // ingredienti non trovati in tabella o senza peso
}

export function calcolaNutrizione(ingredienti: Ingrediente[], porzioni: number, alimenti: Map<string, Alimento>): RisultatoCalcolo {
  const tot = { kcal: 0, proteine_g: 0, carboidrati_g: 0, grassi_g: 0, fibre_g: 0 }
  const mancanti: string[] = []
  for (const i of ingredienti) {
    if (!i.nome.trim() || i.unita === 'q.b.' || i.quantita == null) continue
    const a = alimenti.get(i.nome.trim().toLowerCase())
    const g = i.grammi ?? grammiIngrediente(i, a)
    if (!a || g == null) {
      if (!/^acqua$/i.test(i.nome.trim())) mancanti.push(i.nome.trim())
      continue
    }
    tot.kcal += (a.kcal * g) / 100
    tot.proteine_g += (a.proteine_g * g) / 100
    tot.carboidrati_g += (a.carboidrati_g * g) / 100
    tot.grassi_g += (a.grassi_g * g) / 100
    tot.fibre_g += (a.fibre_g * g) / 100
  }
  const p = Math.max(1, porzioni)
  return {
    porzione: {
      kcal: Math.round(tot.kcal / p / 10) * 10,
      proteine_g: Math.round((tot.proteine_g / p) * 10) / 10,
      carboidrati_g: Math.round((tot.carboidrati_g / p) * 10) / 10,
      grassi_g: Math.round((tot.grassi_g / p) * 10) / 10,
      fibre_g: Math.round((tot.fibre_g / p) * 10) / 10,
    },
    mancanti,
  }
}
