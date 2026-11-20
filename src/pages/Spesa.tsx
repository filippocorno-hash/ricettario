import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { aggiungiGiorni, etichettaSettimana, lunediDi } from '../lib/date'
import {
  REPARTI,
  calcolaSpesa,
  chiave,
  quantitaSpesa,
  togliDispensa,
  type RicettaSpesa,
  type VoceDispensa,
} from '../lib/spesa'
import { useSessione } from '../lib/sessione'
import { messaggioErrore, supabase } from '../lib/supabase'

interface Voce {
  id: string
  nome: string
  quantita: number | null
  unita: string | null
  reparto: string
  spuntato: boolean
  manuale: boolean
  settimana: string | null
}

interface Dispensa extends VoceDispensa {
  id: string
}

const CODA = 'ricettario-spesa-coda'
const cacheKey = (s: string) => `ricettario-spesa-${s}`

function leggi<T>(k: string, def: T): T {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : def
  } catch {
    return def
  }
}
function scrivi(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* spazio pieno o modalità privata: pazienza */
  }
}

/** Settimana di default: dal venerdì in poi si prepara la spesa della settimana dopo. */
function settimanaDefault(): string {
  const dow = (new Date().getDay() + 6) % 7 // 0 = lunedì
  return dow >= 4 ? aggiungiGiorni(lunediDi(), 7) : lunediDi()
}

export default function Spesa() {
  const { famigliaId } = useSessione()
  const [scheda, setScheda] = useState<'lista' | 'dispensa'>('lista')
  const [settimana, setSettimana] = useState(settimanaDefault())
  const [voci, setVoci] = useState<Voce[] | null>(() => leggi<Voce[] | null>(cacheKey(settimanaDefault()), null))
  const [dispensa, setDispensa] = useState<Dispensa[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [inAttesa, setInAttesa] = useState(leggi<{ id: string; spuntato: boolean }[]>(CODA, []).length)
  const [lavoro, setLavoro] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [nuova, setNuova] = useState('')
  const [nuovaDisp, setNuovaDisp] = useState({ nome: '', quantita: '', unita: '' })
  const settimanaRef = useRef(settimana)
  settimanaRef.current = settimana

  const carica = useCallback(async () => {
    const s = settimanaRef.current
    const [{ data, error }, { data: d }] = await Promise.all([
      supabase.from('lista_spesa').select('*').or(`settimana.eq.${s},settimana.is.null`).order('nome'),
      supabase.from('dispensa').select('id, nome, quantita, unita').order('nome'),
    ])
    if (error) {
      // offline: resta quello in cache
      return
    }
    // applica le spunte ancora in coda
    const coda = new Map(leggi<{ id: string; spuntato: boolean }[]>(CODA, []).map((x) => [x.id, x.spuntato]))
    const lista = (data as Voce[]).map((v) => (coda.has(v.id) ? { ...v, spuntato: coda.get(v.id)! } : v))
    if (s === settimanaRef.current) {
      setVoci(lista)
      scrivi(cacheKey(s), lista)
    }
    setDispensa((d ?? []) as Dispensa[])
  }, [])

  // invia le spunte fatte offline
  const svuotaCoda = useCallback(async () => {
    const coda = leggi<{ id: string; spuntato: boolean }[]>(CODA, [])
    if (!coda.length) return
    const rimaste: typeof coda = []
    for (const c of coda) {
      const { error } = await supabase.from('lista_spesa').update({ spuntato: c.spuntato }).eq('id', c.id)
      if (error) rimaste.push(c)
    }
    scrivi(CODA, rimaste)
    setInAttesa(rimaste.length)
  }, [])

  useEffect(() => {
    setVoci(leggi<Voce[] | null>(cacheKey(settimana), null))
    carica()
  }, [settimana, carica])

  useEffect(() => {
    const su = () => {
      setOnline(true)
      svuotaCoda().then(carica)
    }
    const giu = () => setOnline(false)
    window.addEventListener('online', su)
    window.addEventListener('offline', giu)
    if (navigator.onLine) svuotaCoda()
    return () => {
      window.removeEventListener('online', su)
      window.removeEventListener('offline', giu)
    }
  }, [svuotaCoda, carica])

  // aggiornamenti in tempo reale dagli altri telefoni
  useEffect(() => {
    if (!famigliaId) return
    const canale = supabase
      .channel(`spesa-${famigliaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lista_spesa', filter: `famiglia_id=eq.${famigliaId}` }, () => carica())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispensa', filter: `famiglia_id=eq.${famigliaId}` }, () => carica())
      .subscribe()
    return () => {
      supabase.removeChannel(canale)
    }
  }, [famigliaId, carica])

  function aggiornaLocale(fn: (v: Voce[]) => Voce[]) {
    setVoci((vs) => {
      const nuove = fn(vs ?? [])
      scrivi(cacheKey(settimanaRef.current), nuove)
      return nuove
    })
  }

  async function spunta(v: Voce) {
    const spuntato = !v.spuntato
    aggiornaLocale((vs) => vs.map((x) => (x.id === v.id ? { ...x, spuntato } : x)))
    const accoda = () => {
      const coda = leggi<{ id: string; spuntato: boolean }[]>(CODA, []).filter((x) => x.id !== v.id)
      coda.push({ id: v.id, spuntato })
      scrivi(CODA, coda)
      setInAttesa(coda.length)
    }
    if (!navigator.onLine) return accoda()
    const { error } = await supabase.from('lista_spesa').update({ spuntato }).eq('id', v.id)
    if (error) accoda()
  }

  async function genera() {
    if (!famigliaId) return
    setErrore(null)
    setAvviso(null)
    setLavoro(true)
    try {
      const fine = aggiungiGiorni(settimana, 6)
      const [{ data: menu, error: e1 }, { data: sett }, { data: disp }] = await Promise.all([
        supabase.from('menu').select('ricetta_id, variante_ufficio, porzioni').gte('data', settimana).lte('data', fine),
        supabase.from('settimane').select('ricetta_ufficio_id').eq('lunedi', settimana).maybeSingle(),
        supabase.from('dispensa').select('id, nome, quantita, unita'),
      ])
      if (e1) throw e1
      if (!menu?.length) {
        setAvviso('Il menu di questa settimana è vuoto: scegli prima i pasti nella sezione Menu.')
        return
      }
      const ids = [...new Set(menu.map((m) => m.ricetta_id).filter(Boolean))] as string[]
      const { data: ric, error: e2 } = await supabase.from('ricette').select('id, porzioni, ingredienti, pranzo_ufficio').in('id', ids)
      if (e2) throw e2
      const mappa = new Map((ric as RicettaSpesa[]).map((r) => [r.id, r]))
      const calcolate = togliDispensa(calcolaSpesa(menu, mappa, sett?.ricetta_ufficio_id ?? null), (disp ?? []) as VoceDispensa[])

      // rigenera le voci automatiche mantenendo le spunte già fatte
      const vecchie = (voci ?? []).filter((v) => !v.manuale && v.settimana === settimana)
      const spuntate = new Set(vecchie.filter((v) => v.spuntato).map((v) => chiave(v.nome)))
      if (vecchie.length) {
        const { error } = await supabase.from('lista_spesa').delete().in('id', vecchie.map((v) => v.id))
        if (error) throw error
      }
      if (calcolate.length) {
        const { error } = await supabase.from('lista_spesa').insert(
          calcolate.map((c) => ({
            famiglia_id: famigliaId,
            settimana,
            nome: c.nome,
            quantita: c.quantita,
            unita: c.unita,
            reparto: c.reparto,
            manuale: false,
            spuntato: spuntate.has(chiave(c.nome)),
          })),
        )
        if (error) throw error
      }
      setAvviso(`Lista aggiornata dal menu: ${calcolate.length} voci.`)
      await carica()
    } catch (e) {
      setErrore(messaggioErrore(e))
    } finally {
      setLavoro(false)
    }
  }

  async function aggiungi(e: FormEvent) {
    e.preventDefault()
    const nome = nuova.trim()
    if (!nome || !famigliaId) return
    setNuova('')
    const { error } = await supabase
      .from('lista_spesa')
      .insert({ famiglia_id: famigliaId, settimana, nome, reparto: 'Altro', manuale: true })
    if (error) setErrore(messaggioErrore(error))
    await carica()
  }

  async function elimina(ids: string[]) {
    if (!ids.length) return
    aggiornaLocale((vs) => vs.filter((v) => !ids.includes(v.id)))
    const { error } = await supabase.from('lista_spesa').delete().in('id', ids)
    if (error) setErrore(messaggioErrore(error))
  }

  async function ceLho(v: Voce) {
    if (!famigliaId) return
    const { error } = await supabase
      .from('dispensa')
      .upsert({ famiglia_id: famigliaId, nome: v.nome, quantita: null, unita: null }, { onConflict: 'famiglia_id,nome' })
    if (error) return setErrore(messaggioErrore(error))
    await elimina([v.id])
    await carica()
  }

  async function aggiungiDispensa(e: FormEvent) {
    e.preventDefault()
    const nome = nuovaDisp.nome.trim().toLowerCase()
    if (!nome || !famigliaId) return
    const q = Number(nuovaDisp.quantita.replace(',', '.'))
    const quantita = nuovaDisp.quantita.trim() && Number.isFinite(q) ? q : null
    const { error } = await supabase
      .from('dispensa')
      .upsert({ famiglia_id: famigliaId, nome, quantita, unita: quantita != null ? nuovaDisp.unita || 'pz' : null }, { onConflict: 'famiglia_id,nome' })
    if (error) return setErrore(messaggioErrore(error))
    setNuovaDisp({ nome: '', quantita: '', unita: '' })
    await carica()
  }

  async function togliDaDispensa(id: string) {
    setDispensa((d) => d.filter((x) => x.id !== id))
    const { error } = await supabase.from('dispensa').delete().eq('id', id)
    if (error) setErrore(messaggioErrore(error))
  }

  const daPrendere = useMemo(() => (voci ?? []).filter((v) => !v.spuntato), [voci])
  const nelCarrello = useMemo(() => (voci ?? []).filter((v) => v.spuntato), [voci])
  const perReparto = useMemo(() => {
    const ordine = [...REPARTI] as string[]
    const gruppi = new Map<string, Voce[]>()
    for (const v of daPrendere.filter((x) => x.quantita != null || x.manuale)) {
      const r = ordine.includes(v.reparto) ? v.reparto : 'Altro'
      gruppi.set(r, [...(gruppi.get(r) ?? []), v])
    }
    return ordine.filter((r) => gruppi.has(r)).map((r) => [r, gruppi.get(r)!] as const)
  }, [daPrendere])
  const qb = daPrendere.filter((v) => v.quantita == null && !v.manuale)

  return (
    <section className="spesa">
      <h1>Spesa</h1>
      <div className="schede-scelta" role="tablist">
        <button role="tab" aria-selected={scheda === 'lista'} className={scheda === 'lista' ? 'attiva' : ''} onClick={() => setScheda('lista')}>
          Lista {daPrendere.length ? `(${daPrendere.length})` : ''}
        </button>
        <button role="tab" aria-selected={scheda === 'dispensa'} className={scheda === 'dispensa' ? 'attiva' : ''} onClick={() => setScheda('dispensa')}>
          Dispensa {dispensa.length ? `(${dispensa.length})` : ''}
        </button>
      </div>

      {!online && (
        <p className="banda-offline">
          Sei offline: puoi spuntare, le spunte si salvano quando torna la rete{inAttesa ? ` (${inAttesa} in attesa)` : ''}.
        </p>
      )}
      {errore && <p className="errore">{errore}</p>}
      {avviso && <p className="avviso">{avviso}</p>}

      {scheda === 'lista' ? (
        <>
          <div className="settimana-nav">
            <button onClick={() => setSettimana(aggiungiGiorni(settimana, -7))} aria-label="Settimana precedente">‹</button>
            <div>
              <span className="nota">Spesa per la settimana</span>
              <strong>{etichettaSettimana(settimana)}</strong>
            </div>
            <button onClick={() => setSettimana(aggiungiGiorni(settimana, 7))} aria-label="Settimana successiva">›</button>
          </div>

          <button className="primario" disabled={lavoro || !online} onClick={genera}>
            {lavoro ? 'Calcolo…' : (voci ?? []).some((v) => !v.manuale && v.settimana === settimana) ? 'Ricalcola dal menu' : 'Crea la lista dal menu'}
          </button>
          <p className="nota centro">
            Somma gli ingredienti del <Link to="/menu">menu</Link> (il pranzo ufficio una volta sola, per 4) e toglie quello che è in dispensa.
          </p>

          <form className="aggiungi" onSubmit={aggiungi}>
            <input placeholder="Aggiungi a mano (es. caffè, detersivo…)" value={nuova} onChange={(e) => setNuova(e.target.value)} aria-label="Nuova voce" />
            <button className="secondario" disabled={!nuova.trim()}>Aggiungi</button>
          </form>

          {voci == null && <div className="caricamento piccolo" />}
          {voci && voci.length === 0 && (
            <div className="scheda vuota">
              <p>La lista è vuota.</p>
              <p className="nota">Prepara il menu della settimana e poi tocca “Crea la lista dal menu”.</p>
            </div>
          )}

          {perReparto.map(([reparto, lista]) => (
            <div key={reparto} className="reparto">
              <h3 className="gruppo">{reparto}</h3>
              <ul className="voci">
                {lista.map((v) => (
                  <li key={v.id}>
                    <label>
                      <input type="checkbox" checked={false} onChange={() => spunta(v)} />
                      <span className="voce-nome">{v.nome}</span>
                      <span className="voce-q">{v.quantita != null ? quantitaSpesa(v.quantita, v.unita) : ''}</span>
                    </label>
                    {v.manuale ? (
                      <button className="mini" onClick={() => elimina([v.id])} aria-label={`Togli ${v.nome}`}>×</button>
                    ) : (
                      <button className="mini" onClick={() => ceLho(v)} title="Ce l'ho già: va in dispensa" aria-label={`Ce l'ho già: ${v.nome}`}>
                        🏠
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {qb.length > 0 && (
            <div className="reparto">
              <h3 className="gruppo">Da controllare in casa (q.b.)</h3>
              <ul className="voci">
                {qb.map((v) => (
                  <li key={v.id}>
                    <label>
                      <input type="checkbox" checked={false} onChange={() => spunta(v)} />
                      <span className="voce-nome">{v.nome}</span>
                    </label>
                    <button className="mini" onClick={() => ceLho(v)} title="Ce l'ho già: va in dispensa" aria-label={`Ce l'ho già: ${v.nome}`}>
                      🏠
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {nelCarrello.length > 0 && (
            <div className="reparto carrello">
              <div className="intestazione-sezione">
                <h3 className="gruppo">Nel carrello ({nelCarrello.length})</h3>
                <button className="link piccolo rosso" disabled={!online} onClick={() => elimina(nelCarrello.map((v) => v.id))}>
                  togli dalla lista
                </button>
              </div>
              <ul className="voci">
                {nelCarrello.map((v) => (
                  <li key={v.id} className="fatto">
                    <label>
                      <input type="checkbox" checked onChange={() => spunta(v)} />
                      <span className="voce-nome">{v.nome}</span>
                      <span className="voce-q">{v.quantita != null ? quantitaSpesa(v.quantita, v.unita) : ''}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="nota">
            Quello che hai già in casa non entra nella lista. Senza quantità vale “ce l’ho”; con la quantità viene tolta solo quella.
          </p>
          <form className="scheda form-dispensa" onSubmit={aggiungiDispensa}>
            <input placeholder="Ingrediente (es. farro perlato)" value={nuovaDisp.nome} onChange={(e) => setNuovaDisp({ ...nuovaDisp, nome: e.target.value })} aria-label="Ingrediente" />
            <div className="riga-disp">
              <input inputMode="decimal" placeholder="Quantità" value={nuovaDisp.quantita} onChange={(e) => setNuovaDisp({ ...nuovaDisp, quantita: e.target.value })} aria-label="Quantità" />
              <select value={nuovaDisp.unita} onChange={(e) => setNuovaDisp({ ...nuovaDisp, unita: e.target.value })} aria-label="Unità">
                <option value="">—</option>
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="pz">pz</option>
              </select>
              <button className="primario" disabled={!nuovaDisp.nome.trim()}>Aggiungi</button>
            </div>
          </form>
          {dispensa.length === 0 ? (
            <p className="nota centro">La dispensa è vuota.</p>
          ) : (
            <ul className="voci scheda">
              {dispensa.map((d) => (
                <li key={d.id}>
                  <span className="voce-nome">{d.nome}</span>
                  <span className="voce-q">{d.quantita != null ? quantitaSpesa(d.quantita, d.unita) : 'ce l’ho'}</span>
                  <button className="mini" onClick={() => togliDaDispensa(d.id)} aria-label={`Togli ${d.nome} dalla dispensa`}>×</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
