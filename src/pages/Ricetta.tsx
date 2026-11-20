import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ElencoCategorie } from '../components/Categorie'
import {
  CATEGORIE,
  ETICHETTA_CATEGORIA,
  UNITA,
  minuti,
  perGruppo,
  quantitaLeggibile,
  sezioniMarkdown,
  type Categoria,
  type Ingrediente,
  type Ricetta as TRicetta,
} from '../lib/ricette'
import { useSessione } from '../lib/sessione'
import { messaggioErrore, supabase } from '../lib/supabase'

interface Bozza {
  titolo: string
  categorie: Categoria[]
  ingredienti: Ingrediente[]
}

export default function Ricetta() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { ruolo } = useSessione()
  const admin = ruolo === 'admin'

  const [r, setR] = useState<TRicetta | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [porzioni, setPorzioni] = useState(2)
  const [bozza, setBozza] = useState<Bozza | null>(null)
  const [lavoro, setLavoro] = useState(false)

  const carica = useCallback(async () => {
    const { data, error } = await supabase.from('ricette').select('*').eq('id', id).maybeSingle()
    if (error) setErrore(messaggioErrore(error))
    else if (!data) setErrore('Ricetta non trovata: forse è stata rifiutata.')
    else {
      setR(data as TRicetta)
      setPorzioni((data as TRicetta).porzioni)
    }
  }, [id])

  useEffect(() => {
    carica()
  }, [carica])

  const sezioni = useMemo(() => sezioniMarkdown(r?.testo_md ?? null), [r?.testo_md])

  if (errore && !r)
    return (
      <section>
        <Link to="/ricettario" className="indietro">← Ricettario</Link>
        <p className="errore">{errore}</p>
      </section>
    )
  if (!r) return <div className="caricamento piccolo" />

  const proposta = r.stato === 'proposta'
  const fattore = porzioni / r.porzioni

  async function salva(): Promise<boolean> {
    if (!bozza || !r) return true
    const ingredienti = bozza.ingredienti.filter((i) => i.nome.trim())
    const { error } = await supabase
      .from('ricette')
      .update({ titolo: bozza.titolo.trim() || r.titolo, categorie: bozza.categorie, ingredienti })
      .eq('id', r.id)
    if (error) {
      setErrore(messaggioErrore(error))
      return false
    }
    setBozza(null)
    await carica()
    return true
  }

  async function azione(fn: () => Promise<void>) {
    setErrore(null)
    setAvviso(null)
    setLavoro(true)
    try {
      await fn()
    } finally {
      setLavoro(false)
    }
  }

  const accetta = () =>
    azione(async () => {
      if (!(await salva())) return
      const { error } = await supabase.rpc('accetta_ricetta', { p_id: r.id })
      if (error) return setErrore(messaggioErrore(error))
      await carica()
      setAvviso('Aggiunta al ricettario.')
    })

  const rifiuta = () =>
    azione(async () => {
      if (!window.confirm(`Rifiutare “${r.titolo}”?\n\nVerrà eliminata dall’app e, alla prossima sincronizzazione, i file sul Mac finiranno nella cartella Rifiutate.`)) return
      const { error } = await supabase.rpc('rifiuta_ricetta', { p_id: r.id })
      if (error) return setErrore(messaggioErrore(error))
      navigate('/da-valutare', { replace: true })
    })

  const salvaModifiche = () =>
    azione(async () => {
      if (await salva()) setAvviso('Modifiche salvate.')
    })

  function modificaIngrediente(idx: number, campo: keyof Ingrediente, valore: string) {
    if (!bozza) return
    const ingredienti = bozza.ingredienti.map((i, k) => {
      if (k !== idx) return i
      if (campo === 'quantita') {
        const n = valore.trim() === '' ? null : Number(valore.replace(',', '.'))
        return { ...i, quantita: n != null && Number.isFinite(n) ? n : i.quantita }
      }
      if (campo === 'unita') return { ...i, unita: valore, quantita: valore === 'q.b.' ? null : i.quantita }
      return { ...i, [campo]: valore }
    })
    setBozza({ ...bozza, ingredienti })
  }

  return (
    <section className="ricetta">
      <Link to={proposta ? '/da-valutare' : '/ricettario'} className="indietro">
        ← {proposta ? 'Da valutare' : 'Ricettario'}
      </Link>

      {proposta && <div className="banda-proposta">Proposta in attesa di valutazione</div>}

      {bozza ? (
        <input className="titolo-modifica" value={bozza.titolo} onChange={(e) => setBozza({ ...bozza, titolo: e.target.value })} aria-label="Titolo" />
      ) : (
        <h1>{r.titolo}</h1>
      )}

      {bozza ? (
        <div className="filtri" role="group" aria-label="Categorie">
          {CATEGORIE.map((c) => {
            const on = bozza.categorie.includes(c)
            return (
              <button
                key={c}
                className={on ? 'filtro attivo' : 'filtro'}
                aria-pressed={on}
                onClick={() =>
                  setBozza({ ...bozza, categorie: on ? bozza.categorie.filter((x) => x !== c) : [...bozza.categorie, c] })
                }
              >
                {on ? '✓ ' : ''}
                {ETICHETTA_CATEGORIA[c]}
              </button>
            )
          })}
        </div>
      ) : (
        <ElencoCategorie categorie={r.categorie} />
      )}

      <p className="meta">
        {r.tempo_totale_min != null && <span>⏱ {minuti(r.tempo_totale_min)}</span>}
        {r.tempo_attivo_min != null && <span>di lavoro {minuti(r.tempo_attivo_min)}</span>}
        {r.fonte_profilo && (
          <span>
            da{' '}
            {r.fonte_url ? (
              <a href={r.fonte_url} target="_blank" rel="noreferrer">
                @{r.fonte_profilo}
              </a>
            ) : (
              `@${r.fonte_profilo}`
            )}
          </span>
        )}
      </p>

      {admin && (
        <div className="azioni">
          {bozza ? (
            <>
              <button className="secondario" disabled={lavoro} onClick={() => setBozza(null)}>
                Annulla
              </button>
              <button className="primario" disabled={lavoro} onClick={salvaModifiche}>
                Salva
              </button>
            </>
          ) : (
            <button
              className="secondario"
              disabled={lavoro}
              onClick={() => setBozza({ titolo: r.titolo, categorie: [...r.categorie], ingredienti: r.ingredienti.map((i) => ({ ...i })) })}
            >
              Modifica
            </button>
          )}
          {proposta && (
            <>
              <button className="pericolo" disabled={lavoro} onClick={rifiuta}>
                Rifiuta
              </button>
              <button className="primario" disabled={lavoro} onClick={accetta}>
                {bozza ? 'Salva e accetta' : 'Accetta'}
              </button>
            </>
          )}
        </div>
      )}
      {avviso && <p className="avviso">{avviso}</p>}
      {errore && <p className="errore">{errore}</p>}

      {r.kcal != null && (
        <div className="nutrizione" aria-label="Valori a porzione">
          <div><strong>{r.kcal}</strong><span>kcal</span></div>
          <div><strong>{Math.round(r.proteine_g ?? 0)} g</strong><span>proteine</span></div>
          <div><strong>{Math.round(r.carboidrati_g ?? 0)} g</strong><span>carboidrati</span></div>
          <div><strong>{Math.round(r.grassi_g ?? 0)} g</strong><span>grassi</span></div>
          <div><strong>{Math.round(r.fibre_g ?? 0)} g</strong><span>fibre</span></div>
        </div>
      )}
      <p className="nota centro">Valori stimati a porzione</p>

      <div className="intestazione-sezione">
        <h2>Ingredienti</h2>
        {!bozza && (
          <div className="porzioni" aria-label="Porzioni">
            <button onClick={() => setPorzioni(Math.max(1, porzioni - 1))} aria-label="Una porzione in meno">−</button>
            <span>{porzioni} {porzioni === 1 ? 'porzione' : 'porzioni'}</span>
            <button onClick={() => setPorzioni(Math.min(12, porzioni + 1))} aria-label="Una porzione in più">+</button>
          </div>
        )}
      </div>

      {bozza ? (
        <div className="scheda">
          <p className="nota">Dosi per {r.porzioni} porzioni. Le calorie non si ricalcolano da sole quando cambi le dosi.</p>
          <div className="modifica-ingredienti">
            {bozza.ingredienti.map((i, k) => (
              <div className="riga-ing" key={k}>
                <input value={i.quantita ?? ''} inputMode="decimal" placeholder="—" onChange={(e) => modificaIngrediente(k, 'quantita', e.target.value)} aria-label="Quantità" disabled={i.unita === 'q.b.'} />
                <select value={i.unita} onChange={(e) => modificaIngrediente(k, 'unita', e.target.value)} aria-label="Unità">
                  {UNITA.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input value={i.nome} onChange={(e) => modificaIngrediente(k, 'nome', e.target.value)} aria-label="Ingrediente" />
                <button
                  className="x"
                  aria-label={`Rimuovi ${i.nome}`}
                  onClick={() => setBozza({ ...bozza, ingredienti: bozza.ingredienti.filter((_, j) => j !== k) })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            className="link"
            onClick={() =>
              setBozza({
                ...bozza,
                ingredienti: [...bozza.ingredienti, { nome: '', quantita: null, unita: 'g', grammi: null, reparto: 'Altro', gruppo: null, opzionale: false }],
              })
            }
          >
            + Aggiungi ingrediente
          </button>
        </div>
      ) : (
        <div className="scheda">
          {perGruppo(r.ingredienti).map(([gruppo, lista], g) => (
            <div key={g}>
              {gruppo && <h3 className="gruppo">{gruppo}</h3>}
              <ul className="ingredienti">
                {lista.map((i, k) => (
                  <li key={k}>
                    <span className="q">{quantitaLeggibile(i, fattore)}</span>
                    <span>
                      {i.nome}
                      {i.opzionale && <em className="nota"> (facoltativo)</em>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {sezioni.map((s) => (
        <div key={s.titolo} className={/pranzo ufficio/i.test(s.titolo) ? 'testo-ricetta ufficio' : 'testo-ricetta'}>
          <h2>{s.titolo}</h2>
          <div dangerouslySetInnerHTML={{ __html: s.html }} />
        </div>
      ))}
    </section>
  )
}
