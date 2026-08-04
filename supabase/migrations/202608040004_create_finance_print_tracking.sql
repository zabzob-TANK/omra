-- Lot Finance (fusion.md §5, étape 4c) — impression du journal financier
-- (R-61, R-62, reprise.md §5.12 : même règle que l'impression du reçu — le
-- compteur est écrit avant l'ouverture de la boîte système, jamais après).
-- Nouvelle table, additive.
create table public.facturation_finance_print_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null
    references public.omra_seasons(id) on delete restrict,
  day_key date not null,
  print_number integer not null,
  movement_ids text[] not null,
  row_count integer not null,
  printed_at timestamptz not null default now(),
  printed_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  printed_by_auth_user_id_snapshot uuid,
  printed_by_slot_label_snapshot text not null,
  printed_by_login_snapshot text,
  constraint facturation_finance_print_events_season_day_number_unique
    unique (season_id, day_key, print_number),
  constraint facturation_finance_print_events_print_number_check check (
    print_number > 0
  ),
  constraint facturation_finance_print_events_row_count_check check (
    row_count >= 0
  ),
  constraint facturation_finance_print_events_slot_label_check check (
    btrim(printed_by_slot_label_snapshot) <> ''
  )
);

create index facturation_finance_print_events_season_day_idx
  on public.facturation_finance_print_events (season_id, day_key, print_number);

alter table public.facturation_finance_print_events enable row level security;

revoke all on table public.facturation_finance_print_events
  from public, anon, authenticated;

grant all on table public.facturation_finance_print_events to service_role;

create function public.list_billing_finance_print_events(
  p_season_id uuid,
  p_day date
)
returns table (
  print_number integer,
  movement_ids text[],
  row_count integer,
  printed_at timestamptz,
  printed_by_slot_label_snapshot text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform * from public.resolve_facturation_actor();

  return query
  select
    event.print_number,
    event.movement_ids,
    event.row_count,
    event.printed_at,
    event.printed_by_slot_label_snapshot
  from public.facturation_finance_print_events as event
  where event.season_id = p_season_id
    and event.day_key = p_day
  order by event.print_number;
end;
$$;

-- R-61, R-62 — la fenêtre autorisée (jour courant/veille pour un employé,
-- sans limite pour l'administrateur) est déjà vérifiée par le domaine
-- (`peutImprimer()`, `service.ts::enregistrerImpressionFinance`) avant cet
-- appel ; cette fonction résout seulement l'identité et numérote de façon
-- transactionnelle, comme `record_billing_receipt_print`.
create function public.record_billing_finance_print(
  p_season_id uuid,
  p_day date,
  p_movement_ids text[]
)
returns table (
  print_number integer,
  movement_ids text[],
  row_count integer,
  printed_at timestamptz,
  printed_by_slot_label_snapshot text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_slot_number smallint;
  v_actor_auth_user_id uuid;
  v_actor_slot_label text;
  v_actor_login text;
  v_print_number integer;
  v_event_id uuid;
  v_printed_at timestamptz;
  v_row_count integer := coalesce(array_length(p_movement_ids, 1), 0);
begin
  select
    actor.slot_number,
    actor.auth_user_id,
    actor.slot_label,
    actor.login
  into strict
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login
  from public.resolve_facturation_actor() as actor;

  if p_season_id is null then
    raise exception 'Season is required';
  end if;

  if p_day is null then
    raise exception 'Day is required';
  end if;

  -- Sérialise les impressions concurrentes de la même journée pour garantir
  -- une numérotation continue, comme `record_billing_receipt_print`.
  perform pg_catalog.pg_advisory_xact_lock(
    hashtextextended(p_season_id::text || ':' || p_day::text, 0)
  );

  select coalesce(max(event.print_number), 0) + 1
  into v_print_number
  from public.facturation_finance_print_events as event
  where event.season_id = p_season_id
    and event.day_key = p_day;

  insert into public.facturation_finance_print_events (
    season_id,
    day_key,
    print_number,
    movement_ids,
    row_count,
    printed_by_slot_number,
    printed_by_auth_user_id_snapshot,
    printed_by_slot_label_snapshot,
    printed_by_login_snapshot
  )
  values (
    p_season_id,
    p_day,
    v_print_number,
    coalesce(p_movement_ids, '{}'::text[]),
    v_row_count,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login
  )
  returning id, facturation_finance_print_events.printed_at
  into v_event_id, v_printed_at;

  insert into public.facturation_action_history (
    entity_type,
    entity_id,
    action_type,
    section_code,
    before_data,
    after_data,
    occurred_at,
    actor_slot_number,
    actor_auth_user_id_snapshot,
    actor_slot_label_snapshot,
    actor_login_snapshot,
    correlation_id
  )
  values (
    'facturation_finance_print',
    p_season_id,
    'finance_journal_printed',
    'finance',
    pg_catalog.jsonb_build_object('day', p_day, 'print_count', v_print_number - 1),
    pg_catalog.jsonb_build_object(
      'day', p_day,
      'print_count', v_print_number,
      'print_event_id', v_event_id,
      'row_count', v_row_count
    ),
    v_printed_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    gen_random_uuid()
  );

  return query
  select
    v_print_number,
    coalesce(p_movement_ids, '{}'::text[]),
    v_row_count,
    v_printed_at,
    v_actor_slot_label;
end;
$$;

comment on table public.facturation_finance_print_events is
  'Journal d''impression du journal financier (R-61, R-62), append-only. Une ligne par impression, par (saison, jour).';

comment on function public.list_billing_finance_print_events(uuid, date) is
  'Liste toutes les impressions du journal financier pour une saison et un jour donnés, triées par numéro.';

comment on function public.record_billing_finance_print(uuid, date, text[]) is
  'Enregistre immédiatement une impression du journal financier (photographie des mouvements imprimés), avant l''ouverture de la boîte système. Identité résolue exclusivement via auth.uid().';

revoke execute on function public.list_billing_finance_print_events(uuid, date)
  from public, anon;
revoke execute on function public.record_billing_finance_print(uuid, date, text[])
  from public, anon;

grant execute on function public.list_billing_finance_print_events(uuid, date)
  to authenticated;
grant execute on function public.record_billing_finance_print(uuid, date, text[])
  to authenticated;
