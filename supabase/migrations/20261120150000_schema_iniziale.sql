-- Ricettario: schema iniziale
-- Famiglie e membri, profili, ricette (proposte/accettate), rifiutate, menu, dispensa, lista della spesa.

-- ---------------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------------
create type public.ruolo_membro as enum ('admin', 'membro');
create type public.stato_ricetta as enum ('proposta', 'accettata');
create type public.origine_ricetta as enum ('instagram', 'manuale');
create type public.tipo_pasto as enum ('pranzo', 'cena');
create type public.sesso as enum ('M', 'F');
create type public.obiettivo as enum ('dimagrire', 'mantenere', 'aumentare');

-- ---------------------------------------------------------------------------
-- Famiglie, membri, inviti
-- ---------------------------------------------------------------------------
create table public.famiglie (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  creata_il timestamptz not null default now()
);

create table public.membri (
  famiglia_id uuid not null references public.famiglie (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ruolo public.ruolo_membro not null default 'membro',
  entrato_il timestamptz not null default now(),
  primary key (famiglia_id, user_id),
  unique (user_id) -- un utente appartiene a una sola famiglia
);

create table public.inviti (
  codice text primary key,
  famiglia_id uuid not null references public.famiglie (id) on delete cascade,
  creato_da uuid not null references auth.users (id) on delete cascade,
  creato_il timestamptz not null default now(),
  scade_il timestamptz not null default now() + interval '7 days',
  usato_da uuid references auth.users (id) on delete set null,
  usato_il timestamptz
);

-- Funzioni di supporto per le policy (security definer per evitare ricorsione RLS)
create or replace function public.mia_famiglia()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select famiglia_id from public.membri where user_id = auth.uid()
$$;

create or replace function public.sono_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membri where user_id = auth.uid() and ruolo = 'admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- Profili e peso
-- ---------------------------------------------------------------------------
create table public.profili (
  user_id uuid primary key references auth.users (id) on delete cascade,
  famiglia_id uuid not null references public.famiglie (id) on delete cascade,
  nome text not null,
  sesso public.sesso,
  data_nascita date,
  altezza_cm numeric(5, 1) check (altezza_cm between 100 and 250),
  peso_kg numeric(5, 1) check (peso_kg between 30 and 300),
  -- fattore di attività (1.2 sedentario ... 1.9 molto attivo)
  attivita numeric(3, 2) check (attivita between 1.1 and 2.2),
  obiettivo public.obiettivo default 'mantenere',
  -- quota del fabbisogno giornaliero coperta da pranzo + cena
  quota_pranzo_cena numeric(3, 2) not null default 0.65 check (quota_pranzo_cena between 0.3 and 1),
  -- valori impostati a mano (se null si usano quelli calcolati)
  kcal_manuale integer,
  proteine_g_manuale numeric(5, 1),
  carboidrati_g_manuale numeric(5, 1),
  grassi_g_manuale numeric(5, 1),
  aggiornato_il timestamptz not null default now()
);

create table public.pesate (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  data date not null default current_date,
  peso_kg numeric(5, 1) not null check (peso_kg between 30 and 300),
  unique (user_id, data)
);

-- ---------------------------------------------------------------------------
-- Ricette
-- ---------------------------------------------------------------------------
create table public.ricette (
  id uuid primary key default gen_random_uuid(),
  famiglia_id uuid not null references public.famiglie (id) on delete cascade,
  stato public.stato_ricetta not null default 'proposta',
  origine public.origine_ricetta not null,
  titolo text not null,
  categorie text[] not null default '{}'
    check (categorie <@ array['pranzo', 'cena', 'cena post palestra', 'pranzo ufficio']::text[]),
  tag text[] not null default '{}',
  tipo_piatto text,
  difficolta text,
  porzioni integer not null default 2 check (porzioni > 0),
  tempo_totale_min integer,
  tempo_attivo_min integer,
  -- valori a porzione
  kcal integer,
  proteine_g numeric(6, 1),
  carboidrati_g numeric(6, 1),
  grassi_g numeric(6, 1),
  fibre_g numeric(6, 1),
  -- [{nome, quantita, unita, grammi, reparto, gruppo, opzionale}] per "porzioni" porzioni
  ingredienti jsonb not null default '[]'::jsonb,
  -- null se non è un pranzo ufficio; altrimenti {porzioni, ingredienti_base, varianti, conservazione_giorni, riscaldamento}
  pranzo_ufficio jsonb,
  testo_md text, -- ricetta completa in markdown (preparazione, consigli...)
  -- provenienza
  file_md text,
  codice_post text,
  fonte_profilo text,
  fonte_url text,
  data_aggiunta date not null default current_date,
  dati_originali jsonb, -- il .json così come è arrivato
  -- tracciamento
  creata_da uuid references auth.users (id) on delete set null,
  creata_il timestamptz not null default now(),
  aggiornata_il timestamptz not null default now(),
  valutata_da uuid references auth.users (id) on delete set null,
  valutata_il timestamptz
);

create unique index ricette_file_md_unico on public.ricette (famiglia_id, file_md) where file_md is not null;
create unique index ricette_codice_post_unico on public.ricette (famiglia_id, codice_post) where codice_post is not null;
create index ricette_stato on public.ricette (famiglia_id, stato);
create index ricette_categorie on public.ricette using gin (categorie);

create table public.ricette_rifiutate (
  id uuid primary key default gen_random_uuid(),
  famiglia_id uuid not null references public.famiglie (id) on delete cascade,
  titolo text not null,
  file_md text,
  codice_post text,
  rifiutata_da uuid references auth.users (id) on delete set null,
  rifiutata_il timestamptz not null default now(),
  file_spostati_il timestamptz -- quando i file sul Mac sono stati spostati in Rifiutate/
);

create index ricette_rifiutate_famiglia on public.ricette_rifiutate (famiglia_id);

-- Valori nutrizionali per 100 g degli alimenti comuni (per l'inserimento manuale)
create table public.alimenti (
  nome text primary key,
  kcal numeric(6, 1) not null,
  proteine_g numeric(5, 1) not null,
  carboidrati_g numeric(5, 1) not null,
  grassi_g numeric(5, 1) not null,
  fibre_g numeric(5, 1) not null default 0,
  grammi_per_pezzo numeric(6, 1),
  reparto text
);

-- ---------------------------------------------------------------------------
-- Menu, dispensa, spesa
-- ---------------------------------------------------------------------------
create table public.settimane (
  famiglia_id uuid not null references public.famiglie (id) on delete cascade,
  lunedi date not null check (extract(isodow from lunedi) = 1),
  ricetta_ufficio_id uuid references public.ricette (id) on delete set null,
  giorni_palestra date[] not null default '{}',
  note text,
  primary key (famiglia_id, lunedi)
);

create table public.menu (
  id uuid primary key default gen_random_uuid(),
  famiglia_id uuid not null references public.famiglie (id) on delete cascade,
  data date not null,
  pasto public.tipo_pasto not null,
  ricetta_id uuid references public.ricette (id) on delete cascade,
  variante_ufficio text, -- nome della variante, per i pranzi ufficio
  porzioni jsonb not null default '{}'::jsonb, -- {"<user_id>": 1.0, ...}
  note text,
  creato_il timestamptz not null default now()
);

create index menu_famiglia_data on public.menu (famiglia_id, data);

create table public.dispensa (
  id uuid primary key default gen_random_uuid(),
  famiglia_id uuid not null references public.famiglie (id) on delete cascade,
  nome text not null,
  quantita numeric(8, 1),
  unita text,
  aggiornata_il timestamptz not null default now(),
  unique (famiglia_id, nome)
);

create table public.lista_spesa (
  id uuid primary key default gen_random_uuid(),
  famiglia_id uuid not null references public.famiglie (id) on delete cascade,
  nome text not null,
  quantita numeric(8, 1),
  unita text,
  reparto text not null default 'Altro',
  spuntato boolean not null default false,
  manuale boolean not null default false,
  settimana date,
  creata_il timestamptz not null default now(),
  aggiornata_il timestamptz not null default now()
);

create index lista_spesa_famiglia on public.lista_spesa (famiglia_id, spuntato);

-- ---------------------------------------------------------------------------
-- Trigger "aggiornato il"
-- ---------------------------------------------------------------------------
create or replace function public.tocca_aggiornata_il()
returns trigger language plpgsql as $$
begin
  new.aggiornata_il = now();
  return new;
end $$;

create or replace function public.tocca_aggiornato_il()
returns trigger language plpgsql as $$
begin
  new.aggiornato_il = now();
  return new;
end $$;

create trigger ricette_aggiornata before update on public.ricette
  for each row execute function public.tocca_aggiornata_il();
create trigger dispensa_aggiornata before update on public.dispensa
  for each row execute function public.tocca_aggiornata_il();
create trigger lista_spesa_aggiornata before update on public.lista_spesa
  for each row execute function public.tocca_aggiornata_il();
create trigger profili_aggiornato before update on public.profili
  for each row execute function public.tocca_aggiornato_il();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.famiglie enable row level security;
alter table public.membri enable row level security;
alter table public.inviti enable row level security;
alter table public.profili enable row level security;
alter table public.pesate enable row level security;
alter table public.ricette enable row level security;
alter table public.ricette_rifiutate enable row level security;
alter table public.alimenti enable row level security;
alter table public.settimane enable row level security;
alter table public.menu enable row level security;
alter table public.dispensa enable row level security;
alter table public.lista_spesa enable row level security;

-- Famiglie: si vede solo la propria; si crea tramite funzione crea_famiglia()
create policy "famiglia: lettura" on public.famiglie
  for select to authenticated using (id = public.mia_famiglia());
create policy "famiglia: modifica admin" on public.famiglie
  for update to authenticated using (id = public.mia_famiglia() and public.sono_admin());

-- Membri: si vedono i membri della propria famiglia; ingresso tramite funzioni
create policy "membri: lettura" on public.membri
  for select to authenticated using (famiglia_id = public.mia_famiglia());

-- Inviti: solo l'admin li vede e li crea (l'uso passa da unisciti_famiglia())
create policy "inviti: lettura admin" on public.inviti
  for select to authenticated using (famiglia_id = public.mia_famiglia() and public.sono_admin());

-- Profili: si vedono quelli della famiglia, ognuno modifica il proprio
create policy "profili: lettura" on public.profili
  for select to authenticated using (famiglia_id = public.mia_famiglia());
create policy "profili: modifica propria" on public.profili
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and famiglia_id = public.mia_famiglia());

-- Pesate: solo le proprie
create policy "pesate: tutto proprio" on public.pesate
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Ricette
create policy "ricette: lettura" on public.ricette
  for select to authenticated using (famiglia_id = public.mia_famiglia());
-- chiunque della famiglia inserisce ricette manuali, che entrano già accettate
create policy "ricette: inserimento manuale" on public.ricette
  for insert to authenticated
  with check (
    famiglia_id = public.mia_famiglia()
    and origine = 'manuale'
    and stato = 'accettata'
    and creata_da = auth.uid()
  );
-- l'admin modifica tutto; gli altri solo le proprie ricette manuali (che restano accettate)
create policy "ricette: modifica" on public.ricette
  for update to authenticated
  using (
    famiglia_id = public.mia_famiglia()
    and (public.sono_admin() or (origine = 'manuale' and creata_da = auth.uid()))
  )
  with check (
    famiglia_id = public.mia_famiglia()
    and (public.sono_admin() or (origine = 'manuale' and creata_da = auth.uid() and stato = 'accettata'))
  );
create policy "ricette: eliminazione admin" on public.ricette
  for delete to authenticated using (famiglia_id = public.mia_famiglia() and public.sono_admin());

create policy "rifiutate: lettura" on public.ricette_rifiutate
  for select to authenticated using (famiglia_id = public.mia_famiglia());

-- Alimenti: tabella di riferimento in sola lettura
create policy "alimenti: lettura" on public.alimenti
  for select to authenticated using (true);

-- Settimane, menu, dispensa, spesa: condivisi da tutta la famiglia
create policy "settimane: famiglia" on public.settimane
  for all to authenticated
  using (famiglia_id = public.mia_famiglia())
  with check (famiglia_id = public.mia_famiglia());
create policy "menu: famiglia" on public.menu
  for all to authenticated
  using (famiglia_id = public.mia_famiglia())
  with check (famiglia_id = public.mia_famiglia());
create policy "dispensa: famiglia" on public.dispensa
  for all to authenticated
  using (famiglia_id = public.mia_famiglia())
  with check (famiglia_id = public.mia_famiglia());
create policy "spesa: famiglia" on public.lista_spesa
  for all to authenticated
  using (famiglia_id = public.mia_famiglia())
  with check (famiglia_id = public.mia_famiglia());

-- ---------------------------------------------------------------------------
-- Funzioni chiamabili dall'app
-- ---------------------------------------------------------------------------

-- Crea una famiglia: chi la crea ne diventa admin
create or replace function public.crea_famiglia(p_nome_famiglia text, p_nome_utente text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_famiglia uuid;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  if exists (select 1 from membri where user_id = auth.uid()) then
    raise exception 'Fai già parte di una famiglia';
  end if;

  insert into famiglie (nome) values (coalesce(nullif(trim(p_nome_famiglia), ''), 'Famiglia'))
    returning id into v_famiglia;
  insert into membri (famiglia_id, user_id, ruolo) values (v_famiglia, auth.uid(), 'admin');
  insert into profili (user_id, famiglia_id, nome)
    values (auth.uid(), v_famiglia, coalesce(nullif(trim(p_nome_utente), ''), 'Io'));
  return v_famiglia;
end $$;

-- L'admin crea un codice d'invito (6 caratteri, valido 7 giorni)
create or replace function public.crea_invito()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_codice text;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if not public.sono_admin() then
    raise exception 'Solo l''amministratore può invitare';
  end if;
  loop
    v_codice := '';
    for i in 1..6 loop
      v_codice := v_codice || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from inviti where codice = v_codice);
  end loop;
  insert into inviti (codice, famiglia_id, creato_da)
    values (v_codice, public.mia_famiglia(), auth.uid());
  return v_codice;
end $$;

-- Entra in una famiglia con un codice d'invito
create or replace function public.unisciti_famiglia(p_codice text, p_nome_utente text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_invito inviti%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  if exists (select 1 from membri where user_id = auth.uid()) then
    raise exception 'Fai già parte di una famiglia';
  end if;

  select * into v_invito from inviti
    where codice = upper(trim(p_codice))
    for update;
  if not found or v_invito.usato_da is not null or v_invito.scade_il < now() then
    raise exception 'Codice non valido o scaduto';
  end if;

  insert into membri (famiglia_id, user_id, ruolo) values (v_invito.famiglia_id, auth.uid(), 'membro');
  insert into profili (user_id, famiglia_id, nome)
    values (auth.uid(), v_invito.famiglia_id, coalesce(nullif(trim(p_nome_utente), ''), 'Membro'));
  update inviti set usato_da = auth.uid(), usato_il = now() where codice = v_invito.codice;
  return v_invito.famiglia_id;
end $$;

-- L'admin accetta una proposta (eventuali correzioni si salvano prima con un update)
create or replace function public.accetta_ricetta(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.sono_admin() then
    raise exception 'Solo l''amministratore può accettare le ricette';
  end if;
  update ricette
    set stato = 'accettata', valutata_da = auth.uid(), valutata_il = now()
    where id = p_id and famiglia_id = public.mia_famiglia() and stato = 'proposta';
  if not found then
    raise exception 'Proposta non trovata';
  end if;
end $$;

-- L'admin rifiuta una proposta: resta solo una traccia, la ricetta viene eliminata
create or replace function public.rifiuta_ricetta(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ricetta ricette%rowtype;
begin
  if not public.sono_admin() then
    raise exception 'Solo l''amministratore può rifiutare le ricette';
  end if;
  select * into v_ricetta from ricette
    where id = p_id and famiglia_id = public.mia_famiglia() and stato = 'proposta'
    for update;
  if not found then
    raise exception 'Proposta non trovata';
  end if;
  insert into ricette_rifiutate (famiglia_id, titolo, file_md, codice_post, rifiutata_da)
    values (v_ricetta.famiglia_id, v_ricetta.titolo, v_ricetta.file_md, v_ricetta.codice_post, auth.uid());
  delete from ricette where id = p_id;
end $$;

-- Le funzioni sono per utenti autenticati, non anonimi
revoke execute on function public.crea_famiglia(text, text) from public, anon;
revoke execute on function public.crea_invito() from public, anon;
revoke execute on function public.unisciti_famiglia(text, text) from public, anon;
revoke execute on function public.accetta_ricetta(uuid) from public, anon;
revoke execute on function public.rifiuta_ricetta(uuid) from public, anon;
grant execute on function public.crea_famiglia(text, text) to authenticated;
grant execute on function public.crea_invito() to authenticated;
grant execute on function public.unisciti_famiglia(text, text) to authenticated;
grant execute on function public.accetta_ricetta(uuid) to authenticated;
grant execute on function public.rifiuta_ricetta(uuid) to authenticated;

-- Le tabelle non devono essere accessibili senza login
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Realtime: la lista della spesa si aggiorna in diretta su tutti i telefoni
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.lista_spesa;
