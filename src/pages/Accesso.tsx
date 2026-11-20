import { useState, type FormEvent } from 'react'
import { messaggioErrore, supabase } from '../lib/supabase'

// Accesso con codice a 6 cifre via email: funziona anche dall'app installata
// sul telefono (un link nell'email aprirebbe Safari/Chrome invece della PWA).
export default function Accesso() {
  const [email, setEmail] = useState('')
  const [codice, setCodice] = useState('')
  const [fase, setFase] = useState<'email' | 'codice'>('email')
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function inviaCodice(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setInvio(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setInvio(false)
    if (error) setErrore(messaggioErrore(error))
    else setFase('codice')
  }

  async function verifica(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setInvio(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: codice.trim(),
      type: 'email',
    })
    setInvio(false)
    if (error) setErrore('Codice non valido o scaduto. Controlla l’email o richiedine uno nuovo.')
  }

  return (
    <div className="centrato">
      <div className="scheda accesso">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width={72} height={72} />
        <h1>Ricettario</h1>
        <p className="sottotitolo">Ricette, menu della settimana e lista della spesa.</p>

        {fase === 'email' ? (
          <form onSubmit={inviaCodice}>
            <label htmlFor="email">La tua email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@esempio.it"
            />
            <button className="primario" disabled={invio}>
              {invio ? 'Invio…' : 'Mandami il codice'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifica}>
            <p>
              Ti abbiamo mandato un codice a <strong>{email}</strong>. Scrivilo qui sotto.
            </p>
            <label htmlFor="codice">Codice</label>
            <input
              id="codice"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              value={codice}
              onChange={(e) => setCodice(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="codice"
            />
            <button className="primario" disabled={invio}>
              {invio ? 'Verifica…' : 'Entra'}
            </button>
            <button type="button" className="link" onClick={() => { setFase('email'); setCodice('') }}>
              Usa un’altra email o richiedi un nuovo codice
            </button>
          </form>
        )}
        {errore && <p className="errore" role="alert">{errore}</p>}
      </div>
    </div>
  )
}
