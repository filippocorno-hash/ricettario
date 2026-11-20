import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useSessione } from './lib/sessione'
import Accesso from './pages/Accesso'
import Benvenuto from './pages/Benvenuto'
import Profilo from './pages/Profilo'
import InArrivo from './pages/InArrivo'
import NuovaPassword from './pages/NuovaPassword'

const VOCI = [
  { to: '/ricettario', label: 'Ricettario', icona: '📖' },
  { to: '/da-valutare', label: 'Da valutare', icona: '📥' },
  { to: '/menu', label: 'Menu', icona: '🗓️' },
  { to: '/spesa', label: 'Spesa', icona: '🛒' },
  { to: '/profilo', label: 'Profilo', icona: '👤' },
]

export default function App() {
  const { caricamento, sessione, famigliaId, recuperoPassword } = useSessione()

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
          <Route
            path="/ricettario"
            element={<InArrivo titolo="Ricettario" testo="Qui troverai le ricette accettate, con ricerca e filtri per categoria." />}
          />
          <Route
            path="/da-valutare"
            element={<InArrivo titolo="Da valutare" testo="Qui arriveranno le ricette proposte dall'attività su Instagram, da accettare o rifiutare." />}
          />
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
            <span className="icona" aria-hidden>{v.icona}</span>
            <span>{v.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
