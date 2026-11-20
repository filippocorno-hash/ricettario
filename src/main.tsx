import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { SessioneProvider } from './lib/sessione'
import { daLinkEmail, supabase } from './lib/supabase'
import App from './App'
import './styles.css'

registerSW({ immediate: true })

async function avvia() {
  // Se l'app è stata aperta da un link nell'email, lascia che Supabase legga il token
  // dall'indirizzo prima che il router lo sostituisca.
  if (daLinkEmail) {
    await supabase.auth.getSession()
    window.history.replaceState(null, '', `${window.location.pathname}#/`)
  }
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <SessioneProvider>
        <App />
      </SessioneProvider>
    </HashRouter>
  </StrictMode>,
  )
}

avvia()
