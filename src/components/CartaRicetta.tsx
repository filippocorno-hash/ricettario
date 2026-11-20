import { Link } from 'react-router-dom'
import type { Ricetta } from '../lib/ricette'
import { minuti } from '../lib/ricette'
import { ElencoCategorie } from './Categorie'

export type RicettaBreve = Pick<
  Ricetta,
  'id' | 'stato' | 'titolo' | 'categorie' | 'tag' | 'tipo_piatto' | 'porzioni' | 'tempo_totale_min' | 'kcal' | 'proteine_g' | 'carboidrati_g' | 'grassi_g' | 'fonte_profilo' | 'data_aggiunta' | 'creata_il'
>

export default function CartaRicetta({ r }: { r: RicettaBreve }) {
  return (
    <Link to={`/ricetta/${r.id}`} className="carta-ricetta">
      <div className="carta-titolo">{r.titolo}</div>
      <ElencoCategorie categorie={r.categorie} />
      <div className="carta-dati">
        {r.kcal != null && <span><strong>{r.kcal}</strong> kcal</span>}
        {r.proteine_g != null && <span>P {Math.round(r.proteine_g)} g</span>}
        {r.carboidrati_g != null && <span>C {Math.round(r.carboidrati_g)} g</span>}
        {r.grassi_g != null && <span>G {Math.round(r.grassi_g)} g</span>}
        {r.tempo_totale_min != null && <span>⏱ {minuti(r.tempo_totale_min)}</span>}
      </div>
      {r.fonte_profilo && <div className="carta-fonte">@{r.fonte_profilo}</div>}
    </Link>
  )
}
