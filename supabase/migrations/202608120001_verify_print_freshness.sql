-- reprise.md §5.17 (2026-08-12) — un employé peut modifier la page affichée
-- dans son navigateur puis imprimer : la base n'est pas touchée, mais le
-- papier sort falsifié. Le client redemande une donnée fraîche au serveur
-- avant d'imprimer ; si ce rechargement échoue malgré une nouvelle
-- tentative, l'impression reste possible (même logique que l'échec du
-- compteur, §5.12 : ne jamais bloquer l'employé) mais l'événement est
-- marqué et tracé comme non vérifié, ici, de façon durable et interrogeable
-- — pas seulement un avertissement affiché puis perdu.
--
-- Additive : la nouvelle colonne a une valeur par défaut, et le nouveau
-- paramètre des deux fonctions aussi — tout appelant existant continue de
-- fonctionner à l'identique, en marquant « vérifié ».
--
-- Corrige au passage un action_type enregistré sans son préfixe d'entité
-- (`receipt_printed` / `finance_journal_printed`) depuis la création de ces
-- deux fonctions (202608040001, 202608040004) :
-- facturation_operations_journal_action_types() (202608090013) attend
-- 'billing_receipt.receipt_printed' et
-- 'facturation_finance_print.finance_journal_printed' — jamais ce qui était
-- réellement écrit. Les impressions ne sont donc jamais apparues dans le
-- Journal des opérations (سجل العمليات) depuis sa création. Découvert en
-- creusant ce chantier, pas son objet initial — signalé ici, pas seulement
-- corrigé en silence.

alter table public.billing_receipt_print_events
  add column verified boolean not null default true;

alter table public.facturation_finance_print_events
  add column verified boolean not null default true;

comment on column public.billing_receipt_print_events.verified is
  'False when this print went ahead without a confirmed fresh reload of the receipt (server unreachable after a retry) — reprise.md §5.17. Never blocks printing; kept for after-the-fact audit.';

comment on column public.facturation_finance_print_events.verified is
  'False when this print went ahead without a confirmed fresh reload of the finance journal (server unreachable after a retry) — reprise.md §5.17. Never blocks printing; kept for after-the-fact audit.';

create or replace function public.record_billing_receipt_print(
  p_receipt_id uuid,
  p_verified boolean default true
)
returns table (
  receipt_id uuid,
  print_event_id uuid,
  print_number integer,
  printed_at timestamptz,
  printed_by_slot_number smallint,
  printed_by_slot_label text
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
  v_event_id uuid;
  v_print_number integer;
  v_printed_at timestamptz;
  v_correlation_id uuid := gen_random_uuid();
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

  if p_receipt_id is null then
    raise exception 'Receipt is required';
  end if;

  -- The receipt lock serializes concurrent print clicks so every event receives
  -- a durable, continuous per-receipt print number.
  perform receipt.id
  from public.billing_receipts as receipt
  where receipt.id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;

  select coalesce(max(event.print_number), 0) + 1
  into v_print_number
  from public.billing_receipt_print_events as event
  where event.receipt_id = p_receipt_id;

  insert into public.billing_receipt_print_events (
    receipt_id,
    print_number,
    printed_by_slot_number,
    printed_by_auth_user_id_snapshot,
    printed_by_slot_label_snapshot,
    printed_by_login_snapshot,
    verified
  )
  values (
    p_receipt_id,
    v_print_number,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    p_verified
  )
  returning id, billing_receipt_print_events.printed_at
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
    'billing_receipt',
    p_receipt_id,
    'billing_receipt.receipt_printed',
    'printing',
    pg_catalog.jsonb_build_object('print_count', v_print_number - 1),
    pg_catalog.jsonb_build_object(
      'print_count', v_print_number,
      'print_event_id', v_event_id,
      'verified', p_verified
    ),
    v_printed_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

  return query
  select
    p_receipt_id,
    v_event_id,
    v_print_number,
    v_printed_at,
    v_actor_slot_number,
    v_actor_slot_label;
end;
$$;

create or replace function public.record_billing_finance_print(
  p_season_id uuid,
  p_day date,
  p_movement_ids text[],
  p_verified boolean default true
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
    printed_by_login_snapshot,
    verified
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
    v_actor_login,
    p_verified
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
    'facturation_finance_print.finance_journal_printed',
    'finance',
    pg_catalog.jsonb_build_object('day', p_day, 'print_count', v_print_number - 1),
    pg_catalog.jsonb_build_object(
      'day', p_day,
      'print_count', v_print_number,
      'print_event_id', v_event_id,
      'row_count', v_row_count,
      'verified', p_verified
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

comment on function public.record_billing_receipt_print(uuid, boolean) is
  'Securely records one immutable receipt print event and its Facturation history entry. Actor identity is resolved exclusively from auth.uid(). p_verified (default true) marks whether the client confirmed a fresh reload before printing — reprise.md §5.17.';

comment on function public.record_billing_finance_print(uuid, date, text[], boolean) is
  'Enregistre immédiatement une impression du journal financier (photographie des mouvements imprimés), avant l''ouverture de la boîte système. Identité résolue exclusivement via auth.uid(). p_verified (défaut true) indique si le client a confirmé un rechargement frais avant impression — reprise.md §5.17.';

revoke execute on function public.record_billing_receipt_print(uuid, boolean)
  from public, anon;
revoke execute on function public.record_billing_finance_print(uuid, date, text[], boolean)
  from public, anon;

grant execute on function public.record_billing_receipt_print(uuid, boolean)
  to authenticated;
grant execute on function public.record_billing_finance_print(uuid, date, text[], boolean)
  to authenticated;
