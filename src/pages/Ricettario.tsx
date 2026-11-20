import { useEffect, useMemo, useState } from 'react'
import CartaRicetta, { type RicettaBreve } from '../components/CartaRicetta'
import { CAMPI_ELENCO, CATEGORIE, ETICHETTA_CATEGORIA, type Categoria } from '../lib/ricette'
import { messaggioErrore, supabase } from '../lib/supabase'

function normalizza(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function Ricettario() {
  const [ricette, setRicette] = useState<RicettaBreve[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [cerca, setCerca] = useState('')
  const [categoria, setCategoria] = useState<Categoria | null>(null)

  useEffect(() => {
    supabase
      .from('ricette')
      .select(CAMPI_ELENCO)
      .eq('stato', 'accettata')
      .order('titolo')
      .then(({ data, error }) => {
        if (error) setErrore(messaggioErrore(error))
        else setRicette(data as RicettaBreve[])
      })
  }, [])

  const filtrate = useMemo(() => {
    const q = normalizza(cerca.trim())
    return (ricette ?? []).filter(
      (r) =>
        (!categoria || r.categorie.includes(categoria)) &&
        (!q || normalizza(`${r.titolo} ${r.tag.join(' ')} ${r.tipo_piatto ?? ''}`).includes(q)),
    )
  }, [ricette, cerca, categoria])

  return (
    <section>
      <h1>Ricettario</h1>
      <input
        type="search"
        className="cerca"
        placeholder="Cerca per nome, ingrediente principale, tag…"
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
        aria-label="Cerca nel ricettario"
      />
      <div className="filtri" role="group" aria-label="Filtra per categoria">
        <button className={!categoria ? 'filtro attivo' : 'filtro'} onClick={() => setCategoria(null)}>
          Tutte
        </button>
        {CATEGORIE.map((c) => (
          <button key={c} className={categoria === c ? 'filtro attivo' : 'filtro'} onClick={() => setCategoria(categoria === c ? null : c)}>
            {ETICHETTA_CATEGORIA[c]}
          </button>
        ))}
      </div>

      {errore && <p className="errore">{errore}</p>}
      {!ricette && !errore && <div className="caricamento piccolo" />}
      {ricette && ricette.length === 0 && (
        <div className="scheda vuota">
          <p>Il ricettario è ancora vuoto.</p>
          <p className="nota">Accetta le ricette proposte nella sezione “Da valutare” e compariranno qui.</p>
        </div>
      )}
      {ricette && ricette.length > 0 && filtrate.length === 0 && <p className="nota">Nessuna ricetta corrisponde ai filtri.</p>}
      <div className="griglia">
        {filtrate.map((r) => (
          <CartaRicetta key={r.id} r={r} />
        ))}
      </div>
    </section>
  )
}
