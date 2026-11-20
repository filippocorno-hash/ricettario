import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSessione } from '../lib/sessione'
import { messaggioErrore, supabase } from '../lib/supabase'
import { LIVELLI_ATTIVITA, calcola, type DatiProfilo, type Obiettivo, type Sesso } from '../lib/nutrizione'

interface Membro {
  user_id: string
  ruolo: 'admin' | 'membro'
  nome: string
}

interface Pesata {
  id: string
  data: string
  peso_kg: number
}

interface Form {
  nome: string
  sesso: Sesso | ''
  data_nascita: string
  altezza_cm: string
  peso_kg: string
  attivita: string
  obiettivo: Obiettivo | ''
  quota_pranzo_cena: number
  kcal_manuale: string
  proteine_g_manuale: string
  carboidrati_g_manuale: string
  grassi_g_manuale: string
}

const num = (s: string): number | null => {
  const n = Number(String(s).replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(n) ? null : n
}
const str = (n: number | null | undefined) => (n == null ? '' : String(n))
const oggi = () => new Date().toISOString().slice(0, 10)

function daForm(f: Form): DatiProfilo {
  return {
    sesso: f.sesso || null,
    data_nascita: f.data_nascita || null,
    altezza_cm: num(f.altezza_cm),
    peso_kg: num(f.peso_kg),
    attivita: num(f.attivita),
    obiettivo: f.obiettivo || null,
    quota_pranzo_cena: f.quota_pranzo_cena,
    kcal_manuale: num(f.kcal_manuale),
    proteine_g_manuale: num(f.proteine_g_manuale),
    carboidrati_g_manuale: num(f.carboidrati_g_manuale),
    grassi_g_manuale: num(f.grassi_g_manuale),
  }
}

export default function Profilo() {
  const { sessione, ruolo, famigliaId, ricarica } = useSessione()
  const uid = sessione?.user.id
  const [form, setForm] = useState<Form | null>(null)
  const [membri, setMembri] = useState<Membro[]>([])
  const [pesate, setPesate] = useState<Pesata[]>([])
  const [nuovoPeso, setNuovoPeso] = useState('')
  const [invito, setInvito] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)
  const [manuale, setManuale] = useState(false)

  useEffect(() => {
    if (!famigliaId || !uid) return
    ;(async () => {
      const [{ data: m }, { data: profili }, { data: ps }] = await Promise.all([
        supabase.from('membri').select('user_id, ruolo'),
        supabase.from('profili').select('*'),
        supabase.from('pesate').select('id, data, peso_kg').order('data', { ascending: false }).limit(10),
      ])
      const nomi = new Map((profili ?? []).map((x) => [x.user_id, x.nome as string]))
      setMembri((m ?? []).map((x) => ({ user_id: x.user_id, ruolo: x.ruolo, nome: nomi.get(x.user_id) ?? '—' })))
      setPesate((ps ?? []) as Pesata[])
      const p = (profili ?? []).find((x) => x.user_id === uid)
      if (p) {
        const f: Form = {
          nome: p.nome ?? '',
          sesso: p.sesso ?? '',
          data_nascita: p.data_nascita ?? '',
          altezza_cm: str(p.altezza_cm),
          peso_kg: str(p.peso_kg),
          attivita: str(p.attivita),
          obiettivo: p.obiettivo ?? '',
          quota_pranzo_cena: Number(p.quota_pranzo_cena ?? 0.65),
          kcal_manuale: str(p.kcal_manuale),
          proteine_g_manuale: str(p.proteine_g_manuale),
          carboidrati_g_manuale: str(p.carboidrati_g_manuale),
          grassi_g_manuale: str(p.grassi_g_manuale),
        }
        setForm(f)
        setManuale(p.kcal_manuale != null || p.proteine_g_manuale != null || p.carboidrati_g_manuale != null || p.grassi_g_manuale != null)
      }
    })()
  }, [famigliaId, uid])

  const calcolo = useMemo(() => (form ? calcola(daForm(form)) : null), [form])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f))
    setAvviso(null)
  }

  async function salva(e?: FormEvent) {
    e?.preventDefault()
    if (!form || !uid) return
    setErrore(null)
    setSalvataggio(true)
    const d = daForm(form)
    const { error } = await supabase
      .from('profili')
      .update({
        nome: form.nome.trim() || 'Io',
        ...d,
        ...(manuale
          ? {}
          : { kcal_manuale: null, proteine_g_manuale: null, carboidrati_g_manuale: null, grassi_g_manuale: null }),
      })
      .eq('user_id', uid)
    setSalvataggio(false)
    if (error) setErrore(messaggioErrore(error))
    else {
      setAvviso('Profilo salvato.')
      await ricarica()
    }
  }

  async function registraPeso(e: FormEvent) {
    e.preventDefault()
    const p = num(nuovoPeso)
    if (!uid || p == null) return
    setErrore(null)
    const { data, error } = await supabase
      .from('pesate')
      .upsert({ user_id: uid, data: oggi(), peso_kg: p }, { onConflict: 'user_id,data' })
      .select('id, data, peso_kg')
      .single()
    if (error) return setErrore(messaggioErrore(error))
    await supabase.from('profili').update({ peso_kg: p }).eq('user_id', uid)
    setPesate((ps) => [data as Pesata, ...ps.filter((x) => x.data !== (data as Pesata).data)].slice(0, 10))
    set('peso_kg', String(p))
    setNuovoPeso('')
  }

  async function creaInvito() {
    setErrore(null)
    const { data, error } = await supabase.rpc('crea_invito')
    if (error) setErrore(messaggioErrore(error))
    else setInvito(data as string)
  }

  if (!form) return <div className="caricamento piccolo" />
  const g = calcolo?.giornalieri
  const pc = calcolo?.pranzoCena

  return (
    <section>
      <h1>Profilo</h1>

      <h2>Obiettivi</h2>
      <div className="scheda">
        {g ? (
          <>
            <div className="obiettivi">
              <div>
                <span className="etichetta-obj">Al giorno</span>
                <strong>{g.kcal} kcal</strong>
                <span>P {g.proteine_g} g · C {g.carboidrati_g} g · G {g.grassi_g} g</span>
              </div>
              <div className="evidenza">
                <span className="etichetta-obj">Pranzo + cena ({Math.round(form.quota_pranzo_cena * 100)}%)</span>
                <strong>{pc!.kcal} kcal</strong>
                <span>P {pc!.proteine_g} g · C {pc!.carboidrati_g} g · G {pc!.grassi_g} g</span>
              </div>
            </div>
            <p className="nota">
              Restano circa <strong>{g.kcal - pc!.kcal} kcal</strong> per colazione e spuntini.
              {calcolo?.bmr && calcolo.tdee && (
                <> Metabolismo basale ~{calcolo.bmr} kcal, consumo giornaliero stimato ~{calcolo.tdee} kcal.</>
              )}
            </p>
            {calcolo?.limitato && (
              <p className="nota">Il deficit è stato limitato per non scendere sotto il metabolismo basale.</p>
            )}
          </>
        ) : (
          <p className="nota">Compila i tuoi dati qui sotto: l’app calcola calorie e macro giornaliere.</p>
        )}

        <label htmlFor="quota">Quota della giornata per pranzo + cena: {Math.round(form.quota_pranzo_cena * 100)}%</label>
        <input
          id="quota"
          type="range"
          min={0.5}
          max={0.8}
          step={0.05}
          value={form.quota_pranzo_cena}
          onChange={(e) => set('quota_pranzo_cena', Number(e.target.value))}
        />
        <p className="nota">Il resto va a colazione e spuntini. Di solito tra il 60 e il 70%.</p>

        <label className="interruttore">
          <input type="checkbox" checked={manuale} onChange={(e) => setManuale(e.target.checked)} />
          Imposta i valori a mano (es. indicati dal nutrizionista)
        </label>
        {manuale && (
          <div className="griglia-campi">
            {(
              [
                ['kcal_manuale', 'Kcal al giorno', calcolo?.calcolati?.kcal],
                ['proteine_g_manuale', 'Proteine (g)', calcolo?.calcolati?.proteine_g],
                ['carboidrati_g_manuale', 'Carboidrati (g)', calcolo?.calcolati?.carboidrati_g],
                ['grassi_g_manuale', 'Grassi (g)', calcolo?.calcolati?.grassi_g],
              ] as const
            ).map(([k, etichetta, suggerito]) => (
              <div key={k}>
                <label htmlFor={k}>{etichetta}</label>
                <input
                  id={k}
                  inputMode="decimal"
                  value={form[k]}
                  placeholder={suggerito != null ? `auto: ${suggerito}` : 'auto'}
                  onChange={(e) => set(k, e.target.value)}
                />
              </div>
            ))}
            <p className="nota intero">I campi vuoti si calcolano in automatico a partire dalle kcal.</p>
          </div>
        )}
        <button className="secondario" disabled={salvataggio} onClick={() => salva()}>
          {salvataggio ? 'Salvo…' : 'Salva obiettivi'}
        </button>
        <p className="nota piccola">Sono stime indicative basate su formule standard (Mifflin-St Jeor); non sostituiscono il parere di un medico o di un nutrizionista.</p>
      </div>

      <h2>I tuoi dati</h2>
      <form className="scheda" onSubmit={salva}>
        <label htmlFor="nome">Nome</label>
        <input id="nome" value={form.nome} onChange={(e) => set('nome', e.target.value)} />

        <div className="griglia-campi">
          <div>
            <label htmlFor="sesso">Sesso</label>
            <select id="sesso" value={form.sesso} onChange={(e) => set('sesso', e.target.value as Sesso | '')}>
              <option value="">—</option>
              <option value="M">Uomo</option>
              <option value="F">Donna</option>
            </select>
          </div>
          <div>
            <label htmlFor="nascita">Data di nascita</label>
            <input id="nascita" type="date" value={form.data_nascita} onChange={(e) => set('data_nascita', e.target.value)} />
          </div>
          <div>
            <label htmlFor="altezza">Altezza (cm)</label>
            <input id="altezza" inputMode="decimal" value={form.altezza_cm} onChange={(e) => set('altezza_cm', e.target.value)} />
          </div>
          <div>
            <label htmlFor="peso">Peso (kg)</label>
            <input id="peso" inputMode="decimal" value={form.peso_kg} onChange={(e) => set('peso_kg', e.target.value)} />
          </div>
        </div>

        <label htmlFor="attivita">Livello di attività</label>
        <select id="attivita" value={form.attivita} onChange={(e) => set('attivita', e.target.value)}>
          <option value="">—</option>
          {LIVELLI_ATTIVITA.map((l) => (
            <option key={l.valore} value={String(l.valore)}>
              {l.etichetta} – {l.descrizione}
            </option>
          ))}
        </select>

        <label htmlFor="obiettivo">Obiettivo</label>
        <select id="obiettivo" value={form.obiettivo} onChange={(e) => set('obiettivo', e.target.value as Obiettivo | '')}>
          <option value="">—</option>
          <option value="dimagrire">Dimagrire (circa −17% di calorie)</option>
          <option value="mantenere">Mantenere il peso</option>
          <option value="aumentare">Aumentare massa (circa +10%)</option>
        </select>

        <button className="primario" disabled={salvataggio}>
          {salvataggio ? 'Salvo…' : 'Salva profilo'}
        </button>
        {avviso && <p className="avviso">{avviso}</p>}
      </form>

      <h2>Peso</h2>
      <div className="scheda">
        <form className="riga-peso" onSubmit={registraPeso}>
          <input inputMode="decimal" placeholder="Peso di oggi (kg)" value={nuovoPeso} onChange={(e) => setNuovoPeso(e.target.value)} aria-label="Peso di oggi" />
          <button className="primario" disabled={num(nuovoPeso) == null}>
            Registra
          </button>
        </form>
        {pesate.length > 0 ? (
          <ul className="elenco pesate">
            {pesate.map((p, i) => {
              const prec = pesate[i + 1]
              const diff = prec ? Math.round((p.peso_kg - prec.peso_kg) * 10) / 10 : null
              return (
                <li key={p.id}>
                  <span>{new Date(p.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
                  <strong>{String(p.peso_kg).replace('.', ',')} kg</strong>
                  {diff != null && diff !== 0 && <span className={diff < 0 ? 'giu' : 'su'}>{diff > 0 ? '+' : ''}{String(diff).replace('.', ',')}</span>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="nota">Registra il peso ogni tanto: aggiorna anche il calcolo degli obiettivi.</p>
        )}
      </div>

      <h2>Famiglia</h2>
      <div className="scheda">
        <ul className="elenco">
          {membri.map((m) => (
            <li key={m.user_id}>
              {m.nome}
              {m.ruolo === 'admin' && <span className="etichetta">amministratore</span>}
            </li>
          ))}
        </ul>
        {ruolo === 'admin' && (
          <>
            <button className="secondario" onClick={creaInvito}>
              Crea un codice d’invito
            </button>
            {invito && (
              <p className="invito">
                Codice: <strong className="codice">{invito}</strong>
                <br />
                <span className="nota">Valido 7 giorni, si usa una volta sola.</span>
              </p>
            )}
          </>
        )}
      </div>
      {errore && <p className="errore">{errore}</p>}

      <p className="nota centro">{sessione?.user.email}</p>
      <button className="link esci" onClick={() => supabase.auth.signOut()}>
        Esci
      </button>
    </section>
  )
}
