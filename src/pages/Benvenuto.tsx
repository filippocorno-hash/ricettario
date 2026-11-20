import { useState, type FormEvent } from 'react'
import { useSessione } from '../lib/sessione'
import { messaggioErrore, supabase } from '../lib/supabase'

// Primo accesso: si crea la famiglia (e si diventa amministratore)
// oppure si entra in una esistente con il codice d'invito.
export default function Benvenuto() {
  const { ricarica } = useSessione()
  const [scelta, setScelta] = useState<'crea' | 'unisciti'>('crea')
  const [nome, setNome] = useState('')
  const [nomeFamiglia, setNomeFamiglia] = useState('Casa')
  const [codice, setCodice] = useState('')
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function conferma(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setInvio(true)
    const { error } =
      scelta === 'crea'
        ? await supabase.rpc('crea_famiglia', { p_nome_famiglia: nomeFamiglia, p_nome_utente: nome })
        : await supabase.rpc('unisciti_famiglia', { p_codice: codice, p_nome_utente: nome })
    setInvio(false)
    if (error) setErrore(messaggioErrore(error))
    else await ricarica()
  }

  return (
    <div className="centrato">
      <div className="scheda">
        <h1>Benvenuto!</h1>
        <div className="schede-scelta" role="tablist">
          <button
            role="tab"
            aria-selected={scelta === 'crea'}
            className={scelta === 'crea' ? 'attiva' : ''}
            onClick={() => setScelta('crea')}
          >
            Sono il primo
          </button>
          <button
            role="tab"
            aria-selected={scelta === 'unisciti'}
            className={scelta === 'unisciti' ? 'attiva' : ''}
            onClick={() => setScelta('unisciti')}
          >
            Ho un codice d’invito
          </button>
        </div>

        <form onSubmit={conferma}>
          <label htmlFor="nome">Come ti chiami?</label>
          <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Filippo" />

          {scelta === 'crea' ? (
            <>
              <label htmlFor="famiglia">Nome della famiglia</label>
              <input id="famiglia" value={nomeFamiglia} onChange={(e) => setNomeFamiglia(e.target.value)} />
              <p className="nota">Sarai l’amministratore: deciderai quali ricette proposte entrano nel ricettario.</p>
            </>
          ) : (
            <>
              <label htmlFor="codice-invito">Codice d’invito</label>
              <input
                id="codice-invito"
                required
                value={codice}
                onChange={(e) => setCodice(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="codice"
                autoCapitalize="characters"
              />
              <p className="nota">Te lo dà l’amministratore dalla pagina Profilo.</p>
            </>
          )}
          <button className="primario" disabled={invio}>
            {invio ? 'Un attimo…' : 'Continua'}
          </button>
        </form>
        {errore && <p className="errore" role="alert">{errore}</p>}
      </div>
    </div>
  )
}
