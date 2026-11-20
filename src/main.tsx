import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { SessioneProvider } from './lib/sessione'
import App from './App'
import './styles.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <SessioneProvider>
        <App />
      </SessioneProvider>
    </HashRouter>
  </StrictMode>,
)
