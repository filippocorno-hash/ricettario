import { useEffect, useState } from 'react'
import CartaRicetta, { type RicettaBreve } from '../components/CartaRicetta'
import { CAMPI_ELENCO } from '../lib/ricette'
import { useSessione } from '../lib/sessione'
import { messaggioErrore, supabase } from '../lib/supabase'

export default function DaValutare() {
  const { ruolo } = useSessione()
  const [ricette, setRicette] = useState<RicettaBreve[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('ricette')
      .select(CAMPI_ELENCO)
      .eq('stato', 'proposta')
      .order('creata_il', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErrore(messaggioErrore(error))
        else setRicette(data as RicettaBreve[])
      })
  }, [])

  return (
    <section>
      <h1>Da valutare</h1>
      <p className="nota">
        {ruolo === 'admin'
          ? 'Apri una proposta per controllarla, correggerla e accettarla o rifiutarla.'
          : 'Ricette proposte dall’attività su Instagram. Le accetta o le rifiuta l’amministratore.'}
      </p>
      {errore && <p className="errore">{errore}</p>}
      {!ricette && !errore && <div className="caricamento piccolo" />}
      {ricette?.length === 0 && (
        <div className="scheda vuota">
          <p>Nessuna proposta da valutare. 🎉</p>
          <p className="nota">Le nuove ricette arrivano il lunedì e il venerdì mattina.</p>
        </div>
      )}
      <div className="griglia">
        {ricette?.map((r) => (
          <CartaRicetta key={r.id} r={r} />
        ))}
      </div>
    </section>
  )
}
