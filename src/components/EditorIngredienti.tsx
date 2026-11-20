import { grammiIngrediente, type Alimento } from '../lib/alimenti'
import { UNITA, type Ingrediente } from '../lib/ricette'

interface Props {
  ingredienti: Ingrediente[]
  originali?: Ingrediente[] // versione prima delle modifiche, per riusare i pesi stimati
  alimenti: Map<string, Alimento>
  onChange: (ing: Ingrediente[]) => void
}

export const ingredienteVuoto = (): Ingrediente => ({
  nome: '',
  quantita: null,
  unita: 'g',
  grammi: null,
  reparto: 'Altro',
  gruppo: null,
  opzionale: false,
})

/** Righe modificabili degli ingredienti; aggiorna da solo peso in grammi e reparto. */
export default function EditorIngredienti({ ingredienti, originali, alimenti, onChange }: Props) {
  function cambia(idx: number, campo: 'nome' | 'quantita' | 'unita', valore: string) {
    onChange(
      ingredienti.map((i, k) => {
        if (k !== idx) return i
        let n: Ingrediente = { ...i }
        if (campo === 'quantita') {
          const x = valore.trim() === '' ? null : Number(valore.replace(',', '.'))
          n.quantita = x != null && Number.isFinite(x) ? x : i.quantita
        } else if (campo === 'unita') {
          n.unita = valore
          if (valore === 'q.b.') n.quantita = null
        } else {
          n.nome = valore
        }
        const a = alimenti.get(n.nome.trim().toLowerCase())
        if (a?.reparto && (campo === 'nome' || n.reparto === 'Altro')) n.reparto = a.reparto
        const prima = originali?.find((o) => o.nome === i.nome)
        n = { ...n, grammi: grammiIngrediente(n, a, prima) }
        return n
      }),
    )
  }

  return (
    <>
      <datalist id="elenco-alimenti">
        {[...alimenti.values()].map((a) => (
          <option key={a.nome} value={a.nome} />
        ))}
      </datalist>
      <div className="modifica-ingredienti">
        {ingredienti.map((i, k) => {
          const noto = !i.nome.trim() || i.unita === 'q.b.' || alimenti.has(i.nome.trim().toLowerCase())
          return (
            <div className="riga-ing" key={k}>
              <input
                value={i.quantita ?? ''}
                inputMode="decimal"
                placeholder="—"
                onChange={(e) => cambia(k, 'quantita', e.target.value)}
                aria-label="Quantità"
                disabled={i.unita === 'q.b.'}
              />
              <select value={i.unita} onChange={(e) => cambia(k, 'unita', e.target.value)} aria-label="Unità">
                {UNITA.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                value={i.nome}
                list="elenco-alimenti"
                placeholder="ingrediente"
                className={noto ? '' : 'sconosciuto'}
                onChange={(e) => cambia(k, 'nome', e.target.value)}
                aria-label="Ingrediente"
                autoCapitalize="none"
              />
              <button type="button" className="x" aria-label={`Rimuovi ${i.nome || 'ingrediente'}`} onClick={() => onChange(ingredienti.filter((_, j) => j !== k))}>
                ×
              </button>
            </div>
          )
        })}
      </div>
      <button type="button" className="link" onClick={() => onChange([...ingredienti, ingredienteVuoto()])}>
        + Aggiungi ingrediente
      </button>
    </>
  )
}
