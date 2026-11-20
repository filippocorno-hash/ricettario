import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSessione } from './lib/sessione'
import Accesso from './pages/Accesso'
import Benvenuto from './pages/Benvenuto'
import Profilo from './pages/Profilo'
import InArrivo from './pages/InArrivo'
import NuovaPassword from './pages/NuovaPassword'
import Ricettario from './pages/Ricettario'
import DaValutare from './pages/DaValutare'
import Ricetta from './pages/Ricetta'

const VOCI = [
  { to: '/ricettario', label: 'Ricettario', icona: '📖' },
  { to: '/da-valutare', label: 'Da valutare', icona: '📥' },
  { to: '/menu', label: 'Menu', icona: '🗓️' },
  { to: '/spesa', label: 'Spesa', icona: '🛒' },
  { to: '/profilo', label: 'Profilo', icona: '👤' },
]

/** Numero di proposte da valutare, aggiornato a ogni cambio di pagina. */
function useProposte(attivo: boolean) {
  const [n, setN] = useState(0)
  const { pathname } = useLocation()
  useEffect(() => {
    if (!attivo) return
    supabase
      .from('ricette')
      .select('id', { count: 'exact', head: true })
      .eq('stato', 'proposta')
      .then(({ count }) => setN(count ?? 0))
  }, [attivo, pathname])
  return n
}

export default function App() {
  const { caricamento, sessione, famigliaId, recuperoPassword } = useSessione()
  const proposte = useProposte(!!famigliaId)

  if (caricamento) {
    return (
      <div className="centrato">
        <div className="caricamento" aria-label="Caricamento" />
      </div>
    )
  }
  if (!sessione) return <Accesso />
  if (recuperoPassword) return <NuovaPassword />
  if (!famigliaId) return <Benvenuto />

  return (
    <div className="app">
      <main className="contenuto">
        <Routes>
          <Route path="/" element={<Navigate to="/ricettario" replace />} />
          <Route path="/ricettario" element={<Ricettario />} />
          <Route path="/da-valutare" element={<DaValutare />} />
          <Route path="/ricetta/:id" element={<Ricetta />} />
          <Route
            path="/menu"
            element={<InArrivo titolo="Menu" testo="Il menu settimanale di pranzi e cene, con il pranzo ufficio del lunedì." />}
          />
          <Route
            path="/spesa"
            element={<InArrivo titolo="Spesa" testo="La lista della spesa generata dal menu, divisa per reparto." />}
          />
          <Route path="/profilo" element={<Profilo />} />
          <Route path="*" element={<Navigate to="/ricettario" replace />} />
        </Routes>
      </main>
      <nav className="barra" aria-label="Sezioni">
        {VOCI.map((v) => (
          <NavLink key={v.to} to={v.to} className={({ isActive }) => (isActive ? 'voce attiva' : 'voce')}>
            <span className="icona-box">
              <span className="icona" aria-hidden>{v.icona}</span>
              {v.to === '/da-valutare' && proposte > 0 && <span className="badge" aria-label={`${proposte} da valutare`}>{proposte}</span>}
            </span>
            <span>{v.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
