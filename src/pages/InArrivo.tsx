export default function InArrivo({ titolo, testo }: { titolo: string; testo: string }) {
  return (
    <section>
      <h1>{titolo}</h1>
      <div className="scheda vuota">
        <p>{testo}</p>
        <p className="nota">In arrivo nelle prossime fasi.</p>
      </div>
    </section>
  )
}
