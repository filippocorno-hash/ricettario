import { useEffect, useState } from 'react'
import { useSessione } from '../lib/sessione'
import { messaggioErrore, supabase } from '../lib/supabase'

interface Membro {
  user_id: string
  ruolo: 'admin' | 'membro'
  nome: string
}

export default function Profilo() {
  const { sessione, profilo, ruolo, famigliaId } = useSessione()
  const [membri, setMembri] = useState<Membro[]>([])
  const [invito, setInvito] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!famigliaId) return
    ;(async () => {
      const [{ data: m }, { data: p }] = await Promise.all([
        supabase.from('membri').select('user_id, ruolo'),
        supabase.from('profili').select('user_id, nome'),
      ])
      const nomi = new Map((p ?? []).map((x) => [x.user_id, x.nome as string]))
      setMembri((m ?? []).map((x) => ({ user_id: x.user_id, ruolo: x.ruolo, nome: nomi.get(x.user_id) ?? '—' })))
    })()
  }, [famigliaId])

  async function creaInvito() {
    setErrore(null)
    const { data, error } = await supabase.rpc('crea_invito')
    if (error) setErrore(messaggioErrore(error))
    else setInvito(data as string)
  }

  return (
    <section>
      <h1>Profilo</h1>
      <div className="scheda">
        <p className="grande">{profilo?.nome}</p>
        <p className="nota">
          {sessione?.user.email} · {ruolo === 'admin' ? 'Amministratore' : 'Membro'}
        </p>
        <p className="nota">Dati fisici e obiettivi di calorie e macro arriveranno nella prossima fase.</p>
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
        {errore && <p className="errore">{errore}</p>}
      </div>

      <button className="link esci" onClick={() => supabase.auth.signOut()}>
        Esci
      </button>
    </section>
  )
}
