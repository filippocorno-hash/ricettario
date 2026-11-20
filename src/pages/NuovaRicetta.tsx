import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import EditorIngredienti, { ingredienteVuoto } from '../components/EditorIngredienti'
import { caricaAlimenti, calcolaNutrizione, type Alimento } from '../lib/alimenti'
import { CATEGORIE, ETICHETTA_CATEGORIA, type Categoria, type Ingrediente } from '../lib/ricette'
import { useSessione } from '../lib/sessione'
import { messaggioErrore, supabase } from '../lib/supabase'

const TIPI = ['primo', 'secondo', 'piatto unico', 'insalata', 'zuppa', 'wrap o panino']

// Ricetta scritta a mano: entra direttamente nel ricettario (accettata).
export default function NuovaRicetta() {
  const { sessione, famigliaId } = useSessione()
  const navigate = useNavigate()
  const [alimenti, setAlimenti] = useState<Map<string, Alimento>>(new Map())
  const [titolo, setTitolo] = useState('')
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [porzioni, setPorzioni] = useState(2)
  const [tempo, setTempo] = useState('')
  const [tipo, setTipo] = useState('')
  const [ingredienti, setIngredienti] = useState<Ingrediente[]>([ingredienteVuoto(), ingredienteVuoto(), ingredienteVuoto()])
  const [preparazione, setPreparazione] = useState('')
  const [consigli, setConsigli] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

  useEffect(() => {
    caricaAlimenti().then(setAlimenti).catch((e) => setErrore(messaggioErrore(e)))
  }, [])

  const calcolo = useMemo(() => calcolaNutrizione(ingredienti, porzioni, alimenti), [ingredienti, porzioni, alimenti])
  const validi = ingredienti.filter((i) => i.nome.trim())

  async function salva(e: FormEvent) {
    e.preventDefault()
    if (!famigliaId || !sessione) return
    if (!titolo.trim()) return setErrore('Dai un nome alla ricetta.')
    if (!validi.length) return setErrore('Aggiungi almeno un ingrediente.')
    setErrore(null)
    setInvio(true)
    const passi = preparazione
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r, k) => (/^\d+[.)]/.test(r) ? r : `${k + 1}. ${r}`))
    const md = [
      `# ${titolo.trim()}`,
      '',
      passi.length ? '## Preparazione\n' + passi.join('\n') : '',
      consigli.trim() ? '\n## Consigli\n' + consigli.trim() : '',
    ]
      .filter((x) => x !== '')
      .join('\n')
    const n = calcolo.porzione
    const { data, error } = await supabase
      .from('ricette')
      .insert({
        famiglia_id: famigliaId,
        stato: 'accettata',
        origine: 'manuale',
        creata_da: sessione.user.id,
        titolo: titolo.trim(),
        categorie,
        porzioni,
        tempo_totale_min: Number(tempo) || null,
        tipo_piatto: tipo || null,
        difficolta: 'facile',
        kcal: n.kcal || null,
        proteine_g: n.kcal ? n.proteine_g : null,
        carboidrati_g: n.kcal ? n.carboidrati_g : null,
        grassi_g: n.kcal ? n.grassi_g : null,
        fibre_g: n.kcal ? n.fibre_g : null,
        ingredienti: validi.map((i) => ({ ...i, nome: i.nome.trim().toLowerCase() })),
        testo_md: md,
      })
      .select('id')
      .single()
    setInvio(false)
    if (error) return setErrore(messaggioErrore(error))
    navigate(`/ricetta/${data.id}`, { replace: true })
  }

  return (
    <section className="ricetta">
      <Link to="/ricettario" className="indietro">← Ricettario</Link>
      <h1>Nuova ricetta</h1>
      <form onSubmit={salva}>
        <label htmlFor="titolo">Nome del piatto</label>
        <input id="titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Pollo al limone con riso basmati" />

        <label>Categorie</label>
        <div className="filtri">
          {CATEGORIE.map((c) => {
            const on = categorie.includes(c)
            return (
              <button
                type="button"
                key={c}
                className={on ? 'filtro attivo' : 'filtro'}
                aria-pressed={on}
                onClick={() => setCategorie(on ? categorie.filter((x) => x !== c) : [...categorie, c])}
              >
                {on ? '✓ ' : ''}
                {ETICHETTA_CATEGORIA[c]}
              </button>
            )
          })}
        </div>

        <div className="griglia-campi">
          <div>
            <label htmlFor="porzioni">Porzioni</label>
            <select id="porzioni" value={porzioni} onChange={(e) => setPorzioni(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tempo">Tempo totale (min)</label>
            <input id="tempo" inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <label htmlFor="tipo">Tipo di piatto</label>
        <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">—</option>
          {TIPI.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <h2>Ingredienti (per {porzioni} {porzioni === 1 ? 'porzione' : 'porzioni'})</h2>
        <div className="scheda">
          <EditorIngredienti ingredienti={ingredienti} alimenti={alimenti} onChange={setIngredienti} />
          <p className="nota">Scrivi il nome come nell’elenco suggerito per avere le calorie: quelli in arancione non sono in tabella.</p>
        </div>

        <div className="nutrizione" aria-label="Valori stimati a porzione">
          <div><strong>{calcolo.porzione.kcal}</strong><span>kcal</span></div>
          <div><strong>{Math.round(calcolo.porzione.proteine_g)} g</strong><span>proteine</span></div>
          <div><strong>{Math.round(calcolo.porzione.carboidrati_g)} g</strong><span>carboidrati</span></div>
          <div><strong>{Math.round(calcolo.porzione.grassi_g)} g</strong><span>grassi</span></div>
          <div><strong>{Math.round(calcolo.porzione.fibre_g)} g</strong><span>fibre</span></div>
        </div>
        <p className="nota centro">
          Valori stimati a porzione
          {calcolo.mancanti.length > 0 && <> · esclusi: {calcolo.mancanti.join(', ')}</>}
        </p>

        <h2>Preparazione</h2>
        <textarea
          rows={7}
          value={preparazione}
          onChange={(e) => setPreparazione(e.target.value)}
          placeholder={'Un passaggio per riga, es.\nPorta a bollore l’acqua sul fornello grande a fiamma alta.\nCuoci il riso 12 minuti a fiamma media.'}
          aria-label="Preparazione"
        />
        <label htmlFor="consigli">Consigli (facoltativo)</label>
        <textarea id="consigli" rows={3} value={consigli} onChange={(e) => setConsigli(e.target.value)} />

        {errore && <p className="errore">{errore}</p>}
        <button className="primario" disabled={invio}>
          {invio ? 'Salvo…' : 'Salva nel ricettario'}
        </button>
      </form>
    </section>
  )
}
