# Ricettario

Web app installabile (PWA) per gestire ricette, menu settimanale (pranzo e cena), calorie e macro e lista della spesa, condivisa in famiglia.

- **App:** https://filippocorno-hash.github.io/ricettario/
- **Frontend:** React + TypeScript + Vite, `vite-plugin-pwa`. Pubblicato su GitHub Pages da `.github/workflows/pubblica.yml`.
- **Backend:** Supabase (progetto `gfjxzraddkxjzncjxfjm`, regione EU). Lo schema è in `supabase/migrations/` e viene applicato al database in automatico dall'integrazione GitHub di Supabase a ogni push su `main`.

## Sviluppo

```bash
npm install
npm run dev     # http://localhost:5173/ricettario/
npm run build
```

## Struttura dati in breve

- `famiglie`, `membri` (ruolo `admin` | `membro`), `inviti`, `profili`, `pesate`
- `ricette` (`stato` proposta | accettata, `categorie`, `ingredienti` e `pranzo_ufficio` in JSON), `ricette_rifiutate`
- `settimane`, `menu`, `dispensa`, `lista_spesa`, `alimenti`

Le regole di accesso (Row Level Security) fanno sì che ognuno veda solo i dati della propria famiglia e che solo l'amministratore accetti o rifiuti le ricette proposte.
