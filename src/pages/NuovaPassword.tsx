import { useState, type FormEvent } from 'react'
import { useSessione } from '../lib/sessione'
import { messaggioErrore, supabase } from '../lib/supabase'

// Mostrata quando si apre il link "password dimenticata" ricevuto via email.
export default function NuovaPassword() {
  const { fineRecupero } = useSessione()
  const [password, setPassword] = useState('')
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function salva(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setInvio(true)
    const { error } = await supabase.auth.updateUser({ password })
    setInvio(false)
    if (error) setErrore(messaggioErrore(error))
    else fineRecupero()
  }

  return (
    <div className="centrato">
      <div className="scheda">
        <h1>Nuova password</h1>
        <form onSubmit={salva}>
          <label htmlFor="nuova">Scegli una nuova password</label>
          <input
            id="nuova"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="nota">Almeno 8 caratteri.</p>
          <button className="primario" disabled={invio}>
            {invio ? 'Salvo…' : 'Salva e continua'}
          </button>
        </form>
        {errore && <p className="errore" role="alert">{errore}</p>}
      </div>
    </div>
  )
}
