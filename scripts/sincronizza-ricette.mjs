// Sincronizza la cartella ricette/ con Supabase.
// Gira nel workflow GitHub "Sincronizza ricette" con la chiave segreta SUPABASE_SECRET_KEY.
// Il repository è pubblico: non stampare mai la chiave né dati personali nei log.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const SUPABASE_URL = 'https://gfjxzraddkxjzncjxfjm.supabase.co'
// Il segreto incollato può contenere spazi, a capo o anche la versione mascherata della
// chiave: si tiene solo un token valido (sb_secret_... o una chiave legacy JWT).
const KEY = (process.env.SUPABASE_SECRET_KEY ?? '')
  .split(/\s+/)
  .filter((t) => /^sb_secret_[A-Za-z0-9_-]+$/.test(t) || /^eyJ[A-Za-z0-9_.-]+$/.test(t))
  .sort((a, b) => b.length - a.length)[0]
const DIR = 'ricette'
const DIR_RIFIUTATE = path.join(DIR, 'Rifiutate')
const FILE_ELENCO = path.join(DIR, '_rifiutate.json')
const CATEGORIE = new Set(['pranzo', 'cena', 'cena post palestra', 'pranzo ufficio'])

if (!KEY) {
  console.error('Il segreto SUPABASE_SECRET_KEY manca o non contiene una chiave valida (sb_secret_...).')
  process.exit(1)
}
// Diagnostica sicura: solo lunghezza e numero di "parole" incollate, mai la chiave.
const grezzo = process.env.SUPABASE_SECRET_KEY ?? ''
console.log(`Chiave: ${KEY.length} caratteri (incollate ${grezzo.split(/\s+/).filter(Boolean).length} parole)`)
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function famiglia() {
  if (process.env.FAMIGLIA_ID) return process.env.FAMIGLIA_ID
  const { data, error } = await sb.from('membri').select('famiglia_id').eq('ruolo', 'admin')
  if (error) throw error
  const ids = [...new Set(data.map((r) => r.famiglia_id))]
  if (ids.length === 0) return null
  if (ids.length > 1) throw new Error('Più famiglie con un amministratore: imposta la variabile FAMIGLIA_ID nel workflow.')
  return ids[0]
}

function leggiJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.warn(`  ! ${path.basename(file)}: JSON non valido (${e.message}), saltato`)
    return null
  }
}

function riga(famigliaId, j, fileMd) {
  const n = j.nutrizione_porzione ?? {}
  const mdPath = path.join(DIR, fileMd)
  return {
    famiglia_id: famigliaId,
    stato: 'proposta',
    origine: 'instagram',
    titolo: j.titolo ?? fileMd.replace(/\.md$/, ''),
    categorie: (j.categorie ?? []).filter((c) => CATEGORIE.has(c)),
    tag: j.tag ?? [],
    tipo_piatto: j.tipo_piatto ?? null,
    difficolta: j.difficolta ?? null,
    porzioni: j.porzioni ?? 2,
    tempo_totale_min: j.tempo_totale_min ?? null,
    tempo_attivo_min: j.tempo_attivo_min ?? null,
    kcal: n.kcal ?? null,
    proteine_g: n.proteine_g ?? null,
    carboidrati_g: n.carboidrati_g ?? null,
    grassi_g: n.grassi_g ?? null,
    fibre_g: n.fibre_g ?? null,
    ingredienti: j.ingredienti ?? [],
    pranzo_ufficio: j.pranzo_ufficio ?? null,
    testo_md: fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : null,
    file_md: fileMd,
    codice_post: j.fonte?.codice_post ?? null,
    fonte_profilo: j.fonte?.profilo ?? null,
    fonte_url: j.fonte?.url ?? null,
    data_aggiunta: j.data_aggiunta ?? new Date().toISOString().slice(0, 10),
    dati_originali: j,
  }
}

async function main() {
  const famigliaId = await famiglia()
  if (!famigliaId) {
    console.log('Nessuna famiglia ancora creata nell\'app: niente da importare.')
    return
  }

  const [{ data: esistenti, error: e1 }, { data: rifiutate, error: e2 }] = await Promise.all([
    sb.from('ricette').select('file_md, codice_post').eq('famiglia_id', famigliaId),
    sb.from('ricette_rifiutate').select('id, titolo, file_md, codice_post, rifiutata_il, file_spostati_il').eq('famiglia_id', famigliaId),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const fileNoti = new Set([...esistenti, ...rifiutate].map((r) => r.file_md).filter(Boolean))
  const codiciNoti = new Set([...esistenti, ...rifiutate].map((r) => r.codice_post).filter(Boolean))

  // 1. Import delle nuove proposte
  const jsonFiles = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()
  let importate = 0
  for (const f of jsonFiles) {
    const j = leggiJson(path.join(DIR, f))
    if (!j) continue
    const fileMd = j.file_md ?? f.replace(/\.json$/, '.md')
    const codice = j.fonte?.codice_post
    if (fileNoti.has(fileMd) || (codice && codiciNoti.has(codice))) continue
    const { error } = await sb.from('ricette').insert(riga(famigliaId, j, fileMd))
    if (error) {
      console.error(`  ! ${fileMd}: ${error.message}`)
      process.exitCode = 1
      continue
    }
    fileNoti.add(fileMd)
    if (codice) codiciNoti.add(codice)
    importate++
    console.log(`  + proposta: ${j.titolo}`)
  }
  console.log(`Nuove proposte importate: ${importate}`)

  // 2. Rifiutate già spostate dall'attività → segna la data
  const spostati = new Set(fs.existsSync(DIR_RIFIUTATE) ? fs.readdirSync(DIR_RIFIUTATE) : [])
  const daSegnare = rifiutate.filter((r) => !r.file_spostati_il && r.file_md && spostati.has(r.file_md))
  for (const r of daSegnare) {
    const { error } = await sb.from('ricette_rifiutate').update({ file_spostati_il: new Date().toISOString() }).eq('id', r.id)
    if (error) throw error
    r.file_spostati_il = 'ora'
    console.log(`  ✓ file spostati: ${r.titolo}`)
  }

  // 3. Elenco delle rifiutate i cui file vanno ancora spostati
  const elenco = rifiutate
    .filter((r) => !r.file_spostati_il && r.file_md)
    .map(({ titolo, file_md, codice_post, rifiutata_il }) => ({ titolo, file_md, codice_post, rifiutata_il }))
    .sort((a, b) => a.file_md.localeCompare(b.file_md))
  fs.writeFileSync(FILE_ELENCO, JSON.stringify(elenco, null, 2) + '\n')
  console.log(`Rifiutate da spostare: ${elenco.length}`)
}

main().catch((e) => {
  console.error('Errore:', e.message ?? e)
  process.exit(1)
})
