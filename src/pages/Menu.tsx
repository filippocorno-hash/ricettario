import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SceltaRicetta, { type RicettaMenu } from '../components/SceltaRicetta'
import { aggiungiGiorni, etichettaGiorno, etichettaSettimana, isoLocale, lunediDi } from '../lib/date'
import { calcola, type Obiettivi } from '../lib/nutrizione'
import type { Categoria } from '../lib/ricette'
import { useSessione } from '../lib/sessione'
import { messaggioErrore, supabase } from '../lib/supabase'

type Pasto = 'pranzo' | 'cena'
const NOTA_EXTRA = 'extra ufficio'
const GIORNO_UFFICIO: Record<string, number> = { martedì: 1, mercoledì: 2, giovedì: 3 }

interface Persona {
  user_id: string
  nome: string
  obiettivo: Obiettivi | null // quota pranzo + cena
}

interface Riga {
  id: string
  data: string
  pasto: Pasto
  ricetta_id: string | null
  variante_ufficio: string | null
  porzioni: Record<string, number>
  note: string | null
}

interface Settimana {
  ricetta_ufficio_id: string | null
  giorni_palestra: string[]
}

interface Valori {
  kcal: number
  proteine_g: number
  carboidrati_g: number
  grassi_g: number
}

const ZERO: Valori = { kcal: 0, proteine_g: 0, carboidrati_g: 0, grassi_g: 0 }

function valoriRiga(r: Riga, ricetta: RicettaMenu | undefined, persona: string): Valori {
  const q = r.porzioni?.[persona] ?? 0
  if (!ricetta || !q) return ZERO
  const v = r.variante_ufficio ? ricetta.pranzo_ufficio?.varianti.find((x) => x.nome === r.variante_ufficio) : undefined
  const n = v?.nutrizione_porzione ?? {
    kcal: ricetta.kcal ?? 0,
    proteine_g: ricetta.proteine_g ?? 0,
    carboidrati_g: ricetta.carboidrati_g ?? 0,
    grassi_g: ricetta.grassi_g ?? 0,
  }
  return { kcal: n.kcal * q, proteine_g: n.proteine_g * q, carboidrati_g: n.carboidrati_g * q, grassi_g: n.grassi_g * q }
}

function somma(a: Valori, b: Valori): Valori {
  return {
    kcal: a.kcal + b.kcal,
    proteine_g: a.proteine_g + b.proteine_g,
    carboidrati_g: a.carboidrati_g + b.carboidrati_g,
    grassi_g: a.grassi_g + b.grassi_g,
  }
}

const fmt = (n: number) => Math.round(n).toLocaleString('it-IT')
const fmtPorzioni = (n: number) => (n === 0.5 ? '½' : Number.isInteger(n) ? String(n) : String(n).replace('.', ','))

export default function Menu() {
  const { sessione, famigliaId } = useSessione()
  const uid = sessione?.user.id ?? ''
  const [lunedi, setLunedi] = useState(lunediDi())
  const [persone, setPersone] = useState<Persona[]>([])
  const [ricette, setRicette] = useState<RicettaMenu[]>([])
  const [settimana, setSettimana] = useState<Settimana>({ ricetta_ufficio_id: null, giorni_palestra: [] })
  const [righe, setRighe] = useState<Riga[] | null>(null)
  const [persona, setPersona] = useState(uid)
  const [scelta, setScelta] = useState<{ data: string; pasto: Pasto } | 'ufficio' | null>(null)
  const [aperta, setAperta] = useState<Riga | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  const giorni = useMemo(() => Array.from({ length: 7 }, (_, i) => aggiungiGiorni(lunedi, i)), [lunedi])
  const perId = useMemo(() => new Map(ricette.map((r) => [r.id, r])), [ricette])

  // Persone della famiglia con i loro obiettivi, e ricette accettate
  useEffect(() => {
    if (!famigliaId) return
    ;(async () => {
      const [{ data: profili }, { data: ric }] = await Promise.all([
        supabase.from('profili').select('*'),
        supabase
          .from('ricette')
          .select('id, titolo, categorie, kcal, proteine_g, carboidrati_g, grassi_g, tempo_totale_min, pranzo_ufficio')
          .eq('stato', 'accettata'),
      ])
      const ps: Persona[] = (profili ?? []).map((p) => ({
        user_id: p.user_id,
        nome: p.nome,
        obiettivo: calcola({ ...p, quota_pranzo_cena: Number(p.quota_pranzo_cena ?? 0.65) }).pranzoCena,
      }))
      ps.sort((a, b) => (a.user_id === uid ? -1 : b.user_id === uid ? 1 : a.nome.localeCompare(b.nome)))
      setPersone(ps)
      setRicette((ric ?? []) as RicettaMenu[])
    })()
  }, [famigliaId, uid])

  const caricaSettimana = useCallback(async () => {
    setRighe(null)
    const [{ data: s }, { data: m, error }] = await Promise.all([
      supabase.from('settimane').select('ricetta_ufficio_id, giorni_palestra').eq('lunedi', lunedi).maybeSingle(),
      supabase
        .from('menu')
        .select('id, data, pasto, ricetta_id, variante_ufficio, porzioni, note')
        .gte('data', lunedi)
        .lte('data', aggiungiGiorni(lunedi, 6))
        .order('creato_il'),
    ])
    if (error) setErrore(messaggioErrore(error))
    setSettimana({ ricetta_ufficio_id: s?.ricetta_ufficio_id ?? null, giorni_palestra: s?.giorni_palestra ?? [] })
    setRighe((m ?? []) as Riga[])
  }, [lunedi])

  useEffect(() => {
    caricaSettimana()
  }, [caricaSettimana])

  const porzioniTutti = () => Object.fromEntries(persone.map((p) => [p.user_id, 1]))

  async function esegui(fn: () => Promise<{ error: unknown } | void>) {
    setErrore(null)
    const r = await fn()
    if (r && r.error) setErrore(messaggioErrore(r.error))
    await caricaSettimana()
  }

  async function salvaSettimana(patch: Partial<Settimana>) {
    const nuova = { ...settimana, ...patch }
    setSettimana(nuova)
    const { error } = await supabase
      .from('settimane')
      .upsert({ famiglia_id: famigliaId, lunedi, ...nuova }, { onConflict: 'famiglia_id,lunedi' })
    if (error) setErrore(messaggioErrore(error))
  }

  function togglePalestra(data: string) {
    const g = settimana.giorni_palestra
    salvaSettimana({ giorni_palestra: g.includes(data) ? g.filter((x) => x !== data) : [...g, data].sort() })
  }

  const righeSlot = (data: string, pasto: Pasto) =>
    (righe ?? []).filter((r) => r.data === data && r.pasto === pasto && r.note !== NOTA_EXTRA)

  function scegliPiatto(data: string, pasto: Pasto, r: RicettaMenu) {
    setScelta(null)
    esegui(async () => {
      const vecchie = righeSlot(data, pasto).map((x) => x.id)
      if (vecchie.length) await supabase.from('menu').delete().in('id', vecchie)
      return supabase
        .from('menu')
        .insert({ famiglia_id: famigliaId, data, pasto, ricetta_id: r.id, porzioni: porzioniTutti() })
    })
  }

  function svuota(data: string, pasto: Pasto) {
    setScelta(null)
    setAperta(null)
    const ids = righeSlot(data, pasto).map((x) => x.id)
    esegui(async () => (ids.length ? supabase.from('menu').delete().in('id', ids) : undefined))
  }

  function impostaUfficio(r: RicettaMenu | null) {
    setScelta(null)
    esegui(async () => {
      const giorniUfficio = [1, 2, 3].map((i) => aggiungiGiorni(lunedi, i))
      // via i vecchi pranzi ufficio e i pranzi di mar/mer/gio
      const vecchie = (righe ?? [])
        .filter((x) => x.variante_ufficio || x.note === NOTA_EXTRA || (x.pasto === 'pranzo' && giorniUfficio.includes(x.data)))
        .map((x) => x.id)
      if (vecchie.length) await supabase.from('menu').delete().in('id', vecchie)
      await salvaSettimana({ ricetta_ufficio_id: r?.id ?? null })
      if (!r) return
      const altri = persone.filter((p) => p.user_id !== uid)
      const nuove: Record<string, unknown>[] = []
      const varianti = r.pranzo_ufficio?.varianti ?? []
      if (varianti.length) {
        for (const v of varianti) {
          for (const g of v.giorni) {
            if (g in GIORNO_UFFICIO) {
              nuove.push({ famiglia_id: famigliaId, data: aggiungiGiorni(lunedi, GIORNO_UFFICIO[g]), pasto: 'pranzo', ricetta_id: r.id, variante_ufficio: v.nome, porzioni: { [uid]: 1 } })
            }
          }
          if (v.giorni.includes('extra') && altri[0]) {
            nuove.push({ famiglia_id: famigliaId, data: aggiungiGiorni(lunedi, 1), pasto: 'pranzo', ricetta_id: r.id, variante_ufficio: v.nome, porzioni: { [altri[0].user_id]: 1 }, note: NOTA_EXTRA })
          }
        }
      } else {
        for (const d of giorniUfficio) nuove.push({ famiglia_id: famigliaId, data: d, pasto: 'pranzo', ricetta_id: r.id, porzioni: { [uid]: 1 } })
      }
      return supabase.from('menu').insert(nuove)
    })
  }

  async function cambiaPorzioni(riga: Riga, persona: string, delta: number) {
    const attuale = riga.porzioni?.[persona] ?? 0
    const nuovo = Math.max(0, Math.min(4, attuale + delta))
    const porzioni = { ...riga.porzioni, [persona]: nuovo }
    setAperta({ ...riga, porzioni })
    setRighe((rs) => (rs ?? []).map((x) => (x.id === riga.id ? { ...x, porzioni } : x)))
    const { error } = await supabase.from('menu').update({ porzioni }).eq('id', riga.id)
    if (error) setErrore(messaggioErrore(error))
  }

  async function cambiaDataExtra(riga: Riga, data: string) {
    await esegui(async () => supabase.from('menu').update({ data }).eq('id', riga.id))
  }

  const ufficio = settimana.ricetta_ufficio_id ? perId.get(settimana.ricetta_ufficio_id) : undefined
  const extra = (righe ?? []).find((r) => r.note === NOTA_EXTRA)
  const pSel = persone.find((p) => p.user_id === persona) ?? persone[0]
  const nomeDi = (id: string) => persone.find((p) => p.user_id === id)?.nome ?? '—'

  const totaleGiorno = (data: string) =>
    (righe ?? []).filter((r) => r.data === data).reduce((acc, r) => somma(acc, valoriRiga(r, perId.get(r.ricetta_id ?? ''), pSel?.user_id ?? '')), ZERO)

  const giorniCompleti = giorni.filter((d) => totaleGiorno(d).kcal > 0)
  const mediaKcal = giorniCompleti.length ? giorniCompleti.reduce((a, d) => a + totaleGiorno(d).kcal, 0) / giorniCompleti.length : 0

  function categoriaSlot(data: string, pasto: Pasto): Categoria {
    if (pasto === 'cena') return settimana.giorni_palestra.includes(data) ? 'cena post palestra' : 'cena'
    const i = giorni.indexOf(data)
    return i >= 1 && i <= 3 ? 'pranzo ufficio' : 'pranzo'
  }

  return (
    <section className="menu">
      <h1>Menu</h1>
      <div className="settimana-nav">
        <button onClick={() => setLunedi(aggiungiGiorni(lunedi, -7))} aria-label="Settimana precedente">‹</button>
        <div>
          <strong>{etichettaSettimana(lunedi)}</strong>
          {lunedi !== lunediDi() && (
            <button className="link piccolo" onClick={() => setLunedi(lunediDi())}>
              torna a questa settimana
            </button>
          )}
        </div>
        <button onClick={() => setLunedi(aggiungiGiorni(lunedi, 7))} aria-label="Settimana successiva">›</button>
      </div>

      {/* Pranzo ufficio della settimana */}
      <div className="scheda ufficio-settimana">
        <div className="riga-titolo">
          <span className="chip cat-pranzo-ufficio">Pranzo ufficio</span>
          {ufficio && (
            <button className="link piccolo" onClick={() => setScelta('ufficio')}>
              cambia
            </button>
          )}
        </div>
        {ufficio ? (
          <>
            <Link to={`/ricetta/${ufficio.id}`} className="titolo-ufficio">{ufficio.titolo}</Link>
            <p className="nota">Si cucina lunedì, 4 porzioni: martedì, mercoledì e giovedì per te, più una porzione extra.</p>
            {ufficio.pranzo_ufficio?.varianti.length ? (
              <ul className="varianti">
                {ufficio.pranzo_ufficio.varianti.map((v) => (
                  <li key={v.nome}>
                    <span>{v.nome.replace(/^Variante [A-Z] – /, '')}</span>
                    <span className="nota">{v.giorni.map((g) => (g === 'extra' ? 'extra' : g.slice(0, 3))).join(' + ')} · {v.nutrizione_porzione.kcal} kcal</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {extra ? (
              <div className="extra">
                Porzione extra per <strong>{nomeDi(Object.keys(extra.porzioni)[0])}</strong>:
                <select value={extra.data} onChange={(e) => cambiaDataExtra(extra, e.target.value)} aria-label="Giorno della porzione extra">
                  {[1, 2, 3, 4].map((i) => {
                    const d = aggiungiGiorni(lunedi, i)
                    return (
                      <option key={d} value={d}>
                        {etichettaGiorno(d)}
                      </option>
                    )
                  })}
                </select>
              </div>
            ) : (
              persone.length < 2 && <p className="nota">La porzione extra si assegna in automatico quando la tua ragazza entra nella famiglia.</p>
            )}
            <button className="link piccolo rosso" onClick={() => impostaUfficio(null)}>
              togli il pranzo ufficio
            </button>
          </>
        ) : (
          <>
            <p className="nota">Scegli la ricetta da cucinare lunedì per martedì, mercoledì e giovedì.</p>
            <button className="primario" onClick={() => setScelta('ufficio')}>
              Scegli il pranzo ufficio
            </button>
          </>
        )}
      </div>

      {persone.length > 1 && (
        <div className="filtri" role="group" aria-label="Totali di">
          {persone.map((p) => (
            <button key={p.user_id} className={pSel?.user_id === p.user_id ? 'filtro attivo' : 'filtro'} onClick={() => setPersona(p.user_id)}>
              {p.nome}
            </button>
          ))}
        </div>
      )}
      {pSel?.obiettivo ? (
        <p className="nota">
          Obiettivo pranzo + cena di {pSel.nome}: <strong>{fmt(pSel.obiettivo.kcal)} kcal</strong>, {pSel.obiettivo.proteine_g} g di proteine.
          {mediaKcal > 0 && <> Media dei giorni pianificati: <strong>{fmt(mediaKcal)} kcal</strong>.</>}
        </p>
      ) : (
        pSel && (
          <p className="nota">
            Completa il <Link to="/profilo">profilo</Link> per confrontare i pasti con i tuoi obiettivi.
          </p>
        )
      )}
      {errore && <p className="errore">{errore}</p>}
      {!righe && <div className="caricamento piccolo" />}

      {righe &&
        giorni.map((d, i) => {
          const palestra = settimana.giorni_palestra.includes(d)
          const tot = totaleGiorno(d)
          const obj = pSel?.obiettivo
          const perc = obj ? Math.min(130, (tot.kcal / obj.kcal) * 100) : 0
          const extraOggi = extra && extra.data === d ? extra : null
          return (
            <div key={d} className={d === isoLocale(new Date()) ? 'giorno oggi' : 'giorno'}>
              <div className="giorno-testa">
                <strong>{etichettaGiorno(d)}</strong>
                <button className={palestra ? 'palestra attiva' : 'palestra'} aria-pressed={palestra} onClick={() => togglePalestra(d)}>
                  🏋️ {palestra ? 'Palestra' : 'Palestra?'}
                </button>
              </div>
              {i === 0 && ufficio && (
                <Link to={`/ricetta/${ufficio.id}`} className="cucina">
                  🍳 Oggi cucini il pranzo ufficio: <strong>{ufficio.titolo}</strong> (4 porzioni)
                </Link>
              )}
              {(['pranzo', 'cena'] as Pasto[]).map((pasto) => {
                const slot = righeSlot(d, pasto)
                const r = slot[0]
                const ric = r ? perId.get(r.ricetta_id ?? '') : undefined
                return (
                  <div key={pasto} className="slot">
                    <span className="slot-pasto">{pasto === 'pranzo' ? 'Pranzo' : 'Cena'}</span>
                    {r ? (
                      <button className="slot-piatto" onClick={() => setAperta(r)}>
                        <span className="slot-titolo">{ric?.titolo ?? 'Ricetta non più disponibile'}</span>
                        <span className="slot-dettagli">
                          {r.variante_ufficio && <span>{r.variante_ufficio.replace(/ – .*/, '')} · </span>}
                          {Object.entries(r.porzioni ?? {})
                            .filter(([, q]) => q > 0)
                            .map(([id, q]) => `${nomeDi(id)} ${fmtPorzioni(q)}`)
                            .join(', ') || 'nessuna porzione'}
                        </span>
                      </button>
                    ) : (
                      <button className="slot-vuoto" onClick={() => setScelta({ data: d, pasto })}>
                        + Scegli {pasto === 'cena' && palestra ? 'una cena post palestra' : pasto === 'pranzo' ? 'il pranzo' : 'la cena'}
                      </button>
                    )}
                  </div>
                )
              })}
              {extraOggi && (
                <p className="nota extra-giorno">
                  + porzione extra del pranzo ufficio per {nomeDi(Object.keys(extraOggi.porzioni)[0])}
                </p>
              )}
              {tot.kcal > 0 && (
                <div className="totale-giorno">
                  <div className="barra-kcal" aria-hidden>
                    <span style={{ width: `${(perc / 130) * 100}%` }} className={obj && tot.kcal > obj.kcal * 1.1 ? 'oltre' : ''} />
                    {obj && <i style={{ left: `${(100 / 130) * 100}%` }} />}
                  </div>
                  <span>
                    {pSel?.nome}: <strong>{fmt(tot.kcal)}</strong>
                    {obj ? ` / ${fmt(obj.kcal)}` : ''} kcal · P {fmt(tot.proteine_g)} g · C {fmt(tot.carboidrati_g)} g · G {fmt(tot.grassi_g)} g
                  </span>
                </div>
              )}
            </div>
          )
        })}

      {scelta && (
        <SceltaRicetta
          titolo={scelta === 'ufficio' ? 'Pranzo ufficio della settimana' : `${scelta.pasto === 'pranzo' ? 'Pranzo' : 'Cena'} di ${etichettaGiorno(scelta.data)}`}
          ricette={ricette}
          categoria={scelta === 'ufficio' ? 'pranzo ufficio' : categoriaSlot(scelta.data, scelta.pasto)}
          onChiudi={() => setScelta(null)}
          onScegli={(r) => (scelta === 'ufficio' ? impostaUfficio(r) : scegliPiatto(scelta.data, scelta.pasto, r))}
        />
      )}

      {aperta && (
        <div className="velo" onClick={() => setAperta(null)}>
          <div className="foglio" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="foglio-testa">
              <strong>
                {aperta.pasto === 'pranzo' ? 'Pranzo' : 'Cena'} di {etichettaGiorno(aperta.data)}
              </strong>
              <button className="chiudi" onClick={() => setAperta(null)} aria-label="Chiudi">×</button>
            </div>
            <p className="grande">{perId.get(aperta.ricetta_id ?? '')?.titolo}</p>
            {aperta.variante_ufficio && <p className="nota">{aperta.variante_ufficio}</p>}
            <h3 className="gruppo">Porzioni</h3>
            {persone.map((p) => {
              const q = aperta.porzioni?.[p.user_id] ?? 0
              const v = valoriRiga(aperta, perId.get(aperta.ricetta_id ?? ''), p.user_id)
              return (
                <div key={p.user_id} className="riga-porzioni">
                  <span>
                    {p.nome}
                    <span className="nota"> {q > 0 ? `${fmt(v.kcal)} kcal` : 'non mangia'}</span>
                  </span>
                  <div className="porzioni">
                    <button onClick={() => cambiaPorzioni(aperta, p.user_id, -0.5)} aria-label={`Meno per ${p.nome}`}>−</button>
                    <span>{fmtPorzioni(q)}</span>
                    <button onClick={() => cambiaPorzioni(aperta, p.user_id, 0.5)} aria-label={`Più per ${p.nome}`}>+</button>
                  </div>
                </div>
              )
            })}
            <div className="azioni">
              <Link className="bottone secondario" to={`/ricetta/${aperta.ricetta_id}`}>
                Apri la ricetta
              </Link>
              {aperta.note !== NOTA_EXTRA && (
                <button
                  className="secondario"
                  onClick={() => {
                    setScelta({ data: aperta.data, pasto: aperta.pasto })
                    setAperta(null)
                  }}
                >
                  Cambia piatto
                </button>
              )}
            </div>
            {aperta.note !== NOTA_EXTRA && (
              <button className="pericolo largo" onClick={() => svuota(aperta.data, aperta.pasto)}>
                Svuota questo pasto
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
