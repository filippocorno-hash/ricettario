import { useMemo, useState } from 'react'
import { CATEGORIE, ETICHETTA_CATEGORIA, type Categoria } from '../lib/ricette'
import { ElencoCategorie } from './Categorie'

export interface RicettaMenu {
  id: string
  titolo: string
  categorie: Categoria[]
  kcal: number | null
  proteine_g: number | null
  carboidrati_g: number | null
  grassi_g: number | null
  tempo_totale_min: number | null
  pranzo_ufficio: { varianti: { nome: string; giorni: string[]; porzioni: number; nutrizione_porzione: { kcal: number; proteine_g: number; carboidrati_g: number; grassi_g: number } }[] } | null
}

interface Props {
  titolo: string
  ricette: RicettaMenu[]
  categoria: Categoria | null
  onScegli: (r: RicettaMenu) => void
  onChiudi: () => void
  onRimuovi?: () => void
}

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Foglio a comparsa per scegliere una ricetta del ricettario. */
export default function SceltaRicetta({ titolo, ricette, categoria, onScegli, onChiudi, onRimuovi }: Props) {
  const [filtro, setFiltro] = useState<Categoria | null>(categoria)
  const [cerca, setCerca] = useState('')
  const elenco = useMemo(() => {
    const q = norm(cerca.trim())
    return ricette
      .filter((r) => (!filtro || r.categorie.includes(filtro)) && (!q || norm(r.titolo).includes(q)))
      .sort((a, b) => a.titolo.localeCompare(b.titolo))
  }, [ricette, filtro, cerca])

  return (
    <div className="velo" onClick={onChiudi}>
      <div className="foglio" role="dialog" aria-modal="true" aria-label={titolo} onClick={(e) => e.stopPropagation()}>
        <div className="foglio-testa">
          <strong>{titolo}</strong>
          <button className="chiudi" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>
        <input type="search" placeholder="Cerca…" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca ricetta" />
        <div className="filtri">
          <button className={!filtro ? 'filtro attivo' : 'filtro'} onClick={() => setFiltro(null)}>Tutte</button>
          {CATEGORIE.map((c) => (
            <button key={c} className={filtro === c ? 'filtro attivo' : 'filtro'} onClick={() => setFiltro(c)}>
              {ETICHETTA_CATEGORIA[c]}
            </button>
          ))}
        </div>
        <div className="foglio-elenco">
          {elenco.length === 0 && (
            <p className="nota">
              Nessuna ricetta {filtro ? `in “${ETICHETTA_CATEGORIA[filtro]}”` : ''} nel ricettario. Accetta qualche proposta in “Da valutare”.
            </p>
          )}
          {elenco.map((r) => (
            <button key={r.id} className="voce-scelta" onClick={() => onScegli(r)}>
              <span className="voce-titolo">{r.titolo}</span>
              <span className="voce-dati">
                <ElencoCategorie categorie={r.categorie} />
                {r.kcal != null && <span>{r.kcal} kcal</span>}
              </span>
            </button>
          ))}
        </div>
        {onRimuovi && (
          <button className="pericolo largo" onClick={onRimuovi}>
            Svuota questo pasto
          </button>
        )}
      </div>
    </div>
  )
}
