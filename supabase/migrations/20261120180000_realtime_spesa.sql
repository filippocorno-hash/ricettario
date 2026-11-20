-- Realtime per lista della spesa e dispensa: con i filtri per famiglia servono
-- i dati completi della riga anche per modifiche ed eliminazioni.
alter table public.lista_spesa replica identity full;
alter table public.dispensa replica identity full;
alter publication supabase_realtime add table public.dispensa;
