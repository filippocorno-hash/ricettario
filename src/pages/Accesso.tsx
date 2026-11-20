import { useState, type FormEvent } from 'react'
import { erroreDaLink, messaggioErrore, supabase } from '../lib/supabase'

type Modalita = 'accedi' | 'registrati' | 'recupero'

const URL_APP = `${window.location.origin}${import.meta.env.BASE_URL}`

function traduci(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email o password non corretti.'
  if (/email not confirmed/i.test(msg)) return 'Devi prima confermare l’email: apri il link che ti abbiamo mandato.'
  if (/already registered/i.test(msg)) return 'Questa email è già registrata: accedi.'
  if (/at least \d+ characters/i.test(msg)) return 'La password deve avere almeno 8 caratteri.'
  if (/rate limit/i.test(msg)) return 'Troppi tentativi ravvicinati: riprova tra qualche minuto.'
  return msg
}

// Accesso con email e password. Alla registrazione Supabase manda un link di conferma
// (il server email gratuito di Supabase non permette di inviare codici).
export default function Accesso() {
  const [modalita, setModalita] = useState<Modalita>('accedi')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(
    erroreDaLink ? 'Il link dell’email non è più valido (forse è scaduto o è già stato usato). Prova ad accedere o richiedine uno nuovo.' : null,
  )
  const [avviso, setAvviso] = useState<string | null>(null)

  function cambia(m: Modalita) {
    setModalita(m)
    setErrore(null)
    setAvviso(null)
  }

  async function conferma(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setAvviso(null)
    setInvio(true)
    try {
      if (modalita === 'accedi') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (modalita === 'registrati') {
        if (password.length < 8) throw new Error('at least 8 characters')
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: URL_APP },
        })
        if (error) throw error
        if (!data.session) {
          setAvviso('Ti abbiamo mandato un’email: apri il link per confermare l’indirizzo, poi torna qui e accedi.')
          setModalita('accedi')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: URL_APP })
        if (error) throw error
        setAvviso('Se l’email è registrata, ti arriverà un link per scegliere una nuova password.')
      }
    } catch (err) {
      setErrore(traduci(messaggioErrore(err)))
    } finally {
      setInvio(false)
    }
  }

  return (
    <div className="centrato">
      <div className="scheda accesso">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width={72} height={72} />
        <h1>Ricettario</h1>
        <p className="sottotitolo">Ricette, menu della settimana e lista della spesa.</p>

        {modalita !== 'recupero' && (
          <div className="schede-scelta" role="tablist">
            <button role="tab" aria-selected={modalita === 'accedi'} className={modalita === 'accedi' ? 'attiva' : ''} onClick={() => cambia('accedi')}>
              Accedi
            </button>
            <button role="tab" aria-selected={modalita === 'registrati'} className={modalita === 'registrati' ? 'attiva' : ''} onClick={() => cambia('registrati')}>
              Registrati
            </button>
          </div>
        )}

        <form onSubmit={conferma}>
          <label htmlFor="email">Email</label>
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
          {modalita !== 'recupero' && (
            <>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={modalita === 'registrati' ? 'new-password' : 'current-password'}
                required
                minLength={modalita === 'registrati' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {modalita === 'registrati' && <p className="nota">Almeno 8 caratteri.</p>}
            </>
          )}
          <button className="primario" disabled={invio}>
            {invio ? 'Un attimo…' : modalita === 'accedi' ? 'Entra' : modalita === 'registrati' ? 'Crea l’account' : 'Mandami il link'}
          </button>
        </form>

        {modalita === 'accedi' && (
          <button type="button" className="link" onClick={() => cambia('recupero')}>
            Password dimenticata?
          </button>
        )}
        {modalita === 'recupero' && (
          <button type="button" className="link" onClick={() => cambia('accedi')}>
            Torna all’accesso
          </button>
        )}
        {avviso && <p className="avviso" role="status">{avviso}</p>}
        {errore && <p className="errore" role="alert">{errore}</p>}
      </div>
    </div>
  )
}
