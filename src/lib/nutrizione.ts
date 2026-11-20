// Calcolo del fabbisogno e degli obiettivi di macro. Sono stime indicative.

export type Sesso = 'M' | 'F'
export type Obiettivo = 'dimagrire' | 'mantenere' | 'aumentare'

export const LIVELLI_ATTIVITA: { valore: number; etichetta: string; descrizione: string }[] = [
  { valore: 1.2, etichetta: 'Sedentario', descrizione: 'lavoro da seduto, poco movimento' },
  { valore: 1.375, etichetta: 'Leggero', descrizione: 'allenamento 1-2 volte a settimana' },
  { valore: 1.55, etichetta: 'Moderato', descrizione: 'allenamento 3-4 volte a settimana' },
  { valore: 1.725, etichetta: 'Attivo', descrizione: 'allenamento 5-6 volte a settimana' },
  { valore: 1.9, etichetta: 'Molto attivo', descrizione: 'allenamento quotidiano intenso o lavoro fisico' },
]

export interface DatiProfilo {
  sesso: Sesso | null
  data_nascita: string | null
  altezza_cm: number | null
  peso_kg: number | null
  attivita: number | null
  obiettivo: Obiettivo | null
  quota_pranzo_cena: number
  kcal_manuale: number | null
  proteine_g_manuale: number | null
  carboidrati_g_manuale: number | null
  grassi_g_manuale: number | null
}

export interface Obiettivi {
  kcal: number
  proteine_g: number
  carboidrati_g: number
  grassi_g: number
}

export interface Calcolo {
  completo: boolean
  eta: number | null
  bmr: number | null
  tdee: number | null
  calcolati: Obiettivi | null
  giornalieri: Obiettivi | null // con i valori manuali applicati
  pranzoCena: Obiettivi | null // quota coperta da pranzo + cena
  limitato: boolean // il deficit è stato limitato per non scendere troppo
}

export function eta(dataNascita: string | null, oggi = new Date()): number | null {
  if (!dataNascita) return null
  const d = new Date(dataNascita)
  if (Number.isNaN(d.getTime())) return null
  let a = oggi.getFullYear() - d.getFullYear()
  const m = oggi.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && oggi.getDate() < d.getDate())) a--
  return a
}

/** Metabolismo basale secondo Mifflin-St Jeor. */
export function bmr(sesso: Sesso, peso: number, altezza: number, anni: number): number {
  return 10 * peso + 6.25 * altezza - 5 * anni + (sesso === 'M' ? 5 : -161)
}

const VARIAZIONE: Record<Obiettivo, number> = { dimagrire: -0.17, mantenere: 0, aumentare: 0.1 }
const PROTEINE_PER_KG: Record<Obiettivo, number> = { dimagrire: 1.8, mantenere: 1.6, aumentare: 1.8 }
const QUOTA_GRASSI = 0.28

export function calcola(p: DatiProfilo): Calcolo {
  const anni = eta(p.data_nascita)
  const completo = !!(p.sesso && anni && p.altezza_cm && p.peso_kg && p.attivita && p.obiettivo)
  let calcolati: Obiettivi | null = null
  let b: number | null = null
  let tdee: number | null = null
  let limitato = false
  if (completo) {
    b = bmr(p.sesso!, p.peso_kg!, p.altezza_cm!, anni!)
    tdee = b * p.attivita!
    let kcal = tdee * (1 + VARIAZIONE[p.obiettivo!])
    // In deficit non si scende sotto il metabolismo basale né sotto una soglia minima
    const minimo = Math.max(b, p.sesso === 'M' ? 1500 : 1200)
    if (kcal < minimo) {
      kcal = minimo
      limitato = true
    }
    const proteine = PROTEINE_PER_KG[p.obiettivo!] * p.peso_kg!
    const grassi = (kcal * QUOTA_GRASSI) / 9
    const carboidrati = Math.max(0, (kcal - proteine * 4 - grassi * 9) / 4)
    calcolati = {
      kcal: Math.round(kcal / 10) * 10,
      proteine_g: Math.round(proteine),
      carboidrati_g: Math.round(carboidrati),
      grassi_g: Math.round(grassi),
    }
  }
  // Valori manuali: quelli non impostati si ricalcolano a partire dalle kcal scelte
  const kcalG = p.kcal_manuale ?? calcolati?.kcal ?? null
  let giornalieri: Obiettivi | null = null
  if (kcalG != null) {
    const prot =
      p.proteine_g_manuale ?? (p.peso_kg && p.obiettivo ? PROTEINE_PER_KG[p.obiettivo] * p.peso_kg : (kcalG * 0.2) / 4)
    const grassi = p.grassi_g_manuale ?? (kcalG * QUOTA_GRASSI) / 9
    const carbo = p.carboidrati_g_manuale ?? Math.max(0, (kcalG - prot * 4 - grassi * 9) / 4)
    giornalieri = {
      kcal: Math.round(kcalG),
      proteine_g: Math.round(prot),
      carboidrati_g: Math.round(carbo),
      grassi_g: Math.round(grassi),
    }
  }
  const q = p.quota_pranzo_cena
  const pranzoCena = giornalieri
    ? {
        kcal: Math.round((giornalieri.kcal * q) / 10) * 10,
        proteine_g: Math.round(giornalieri.proteine_g * q),
        carboidrati_g: Math.round(giornalieri.carboidrati_g * q),
        grassi_g: Math.round(giornalieri.grassi_g * q),
      }
    : null
  return {
    completo,
    eta: anni,
    bmr: b ? Math.round(b) : null,
    tdee: tdee ? Math.round(tdee) : null,
    calcolati,
    giornalieri,
    pranzoCena,
    limitato,
  }
}
