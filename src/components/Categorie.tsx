import { ETICHETTA_CATEGORIA, type Categoria } from '../lib/ricette'

export function ChipCategoria({ c }: { c: Categoria }) {
  return <span className={`chip cat-${c.replace(/ /g, '-')}`}>{ETICHETTA_CATEGORIA[c] ?? c}</span>
}

export function ElencoCategorie({ categorie }: { categorie: Categoria[] }) {
  if (!categorie?.length) return null
  return (
    <span className="chips">
      {categorie.map((c) => (
        <ChipCategoria key={c} c={c} />
      ))}
    </span>
  )
}
