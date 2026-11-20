# Ricette in arrivo

Questa cartella è alimentata dall'attività pianificata "Ricette leggere da Instagram":
ogni ricetta ha un `.md` (da leggere) e un `.json` (dati per l'app, schema 1).

A ogni push qui dentro, il workflow `.github/workflows/sincronizza-ricette.yml`:
1. importa su Supabase come **proposte** i `.json` nuovi (né già presenti né rifiutati);
2. scrive in `_rifiutate.json` le ricette rifiutate nell'app i cui file vanno ancora spostati;
3. segna come spostate quelle che l'attività ha già messo in `Rifiutate/`.

L'attività, alla volta successiva, legge `_rifiutate.json` e sposta i file corrispondenti in
`Rifiutate/`, sia qui sia in `Desktop/Ricette` sul Mac.
