import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Ruolo = 'admin' | 'membro'

export interface Profilo {
  user_id: string
  famiglia_id: string
  nome: string
}

interface StatoSessione {
  caricamento: boolean
  sessione: Session | null
  famigliaId: string | null
  ruolo: Ruolo | null
  profilo: Profilo | null
  ricarica: () => Promise<void>
}

const Ctx = createContext<StatoSessione | null>(null)

export function SessioneProvider({ children }: { children: ReactNode }) {
  const [sessione, setSessione] = useState<Session | null>(null)
  const [famigliaId, setFamigliaId] = useState<string | null>(null)
  const [ruolo, setRuolo] = useState<Ruolo | null>(null)
  const [profilo, setProfilo] = useState<Profilo | null>(null)
  const [caricamento, setCaricamento] = useState(true)

  const caricaMembro = useCallback(async (s: Session | null) => {
    if (!s) {
      setFamigliaId(null)
      setRuolo(null)
      setProfilo(null)
      return
    }
    const { data: membro } = await supabase
      .from('membri')
      .select('famiglia_id, ruolo')
      .eq('user_id', s.user.id)
      .maybeSingle()
    setFamigliaId(membro?.famiglia_id ?? null)
    setRuolo((membro?.ruolo as Ruolo) ?? null)
    if (membro) {
      const { data: p } = await supabase
        .from('profili')
        .select('user_id, famiglia_id, nome')
        .eq('user_id', s.user.id)
        .maybeSingle()
      setProfilo(p ?? null)
    } else {
      setProfilo(null)
    }
  }, [])

  useEffect(() => {
    let attivo = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!attivo) return
      setSessione(data.session)
      await caricaMembro(data.session)
      if (attivo) setCaricamento(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessione(s)
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') {
        setCaricamento(true)
        // fuori dalla callback, come raccomandato da supabase-js
        setTimeout(async () => {
          await caricaMembro(s)
          setCaricamento(false)
        }, 0)
      }
    })
    return () => {
      attivo = false
      sub.subscription.unsubscribe()
    }
  }, [caricaMembro])

  const ricarica = useCallback(async () => {
    setCaricamento(true)
    await caricaMembro(sessione)
    setCaricamento(false)
  }, [caricaMembro, sessione])

  return (
    <Ctx.Provider value={{ caricamento, sessione, famigliaId, ruolo, profilo, ricarica }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSessione(): StatoSessione {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSessione fuori da SessioneProvider')
  return v
}
