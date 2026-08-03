create table public.billing_receipt_print_events (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null
    references public.billing_receipts(id) on delete restrict,
  print_number integer not null,
  printed_at timestamptz not null default now(),
  printed_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  printed_by_auth_user_id_snapshot uuid,
  printed_by_slot_label_snapshot text not null,
  printed_by_login_snapshot text,
  constraint billing_receipt_print_events_receipt_number_unique
    unique (receipt_id, print_number),
  constraint billing_receipt_print_events_print_number_check
    check (print_number > 0),
  constraint billing_receipt_print_events_actor_label_check
    check (btrim(printed_by_slot_label_snapshot) <> '')
);

create index billing_receipt_print_events_receipt_time_idx
  on public.billing_receipt_print_events (receipt_id, printed_at desc);

create index billing_receipt_print_events_actor_time_idx
  on public.billing_receipt_print_events (printed_by_slot_number, printed_at desc);

alter table public.billing_receipt_print_events enable row level security;

revoke all on table public.billing_receipt_print_events
  from public, anon, authenticated;

grant all on table public.billing_receipt_print_events to service_role;

create function public.record_billing_receipt_print(
  p_receipt_id uuid
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
    printed_by_login_snapshot
  )
  values (
    p_receipt_id,
    v_print_number,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login
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
    'receipt_printed',
    'printing',
    pg_catalog.jsonb_build_object('print_count', v_print_number - 1),
    pg_catalog.jsonb_build_object(
      'print_count', v_print_number,
      'print_event_id', v_event_id
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

create function public.get_billing_receipt_print_summary(
  p_receipt_id uuid
)
returns table (
  receipt_id uuid,
  print_count integer,
  last_printed_at timestamptz,
  last_printed_by_slot_number smallint,
  last_printed_by_slot_label text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform * from public.resolve_facturation_actor();

  if not exists (
    select 1
    from public.billing_receipts as receipt
    where receipt.id = p_receipt_id
  ) then
    raise exception 'Receipt not found';
  end if;

  return query
  select
    p_receipt_id,
    coalesce(max(event.print_number), 0)::integer,
    (array_agg(event.printed_at order by event.print_number desc)
      filter (where event.id is not null))[1],
    (array_agg(event.printed_by_slot_number order by event.print_number desc)
      filter (where event.id is not null))[1],
    (array_agg(event.printed_by_slot_label_snapshot order by event.print_number desc)
      filter (where event.id is not null))[1]
  from public.billing_receipt_print_events as event
  where event.receipt_id = p_receipt_id;
end;
$$;

comment on table public.billing_receipt_print_events is
  'Append-only receipt print journal. One row is recorded immediately for every Print click, before the browser print dialog opens, even when that dialog is later cancelled.';

comment on function public.record_billing_receipt_print(uuid) is
  'Securely records one immutable receipt print event and its Facturation history entry. Actor identity is resolved exclusively from auth.uid().';

comment on function public.get_billing_receipt_print_summary(uuid) is
  'Returns the reliable print counter and last print authorship for one receipt to an active Facturation account.';

revoke execute on function public.record_billing_receipt_print(uuid)
  from public, anon;
revoke execute on function public.get_billing_receipt_print_summary(uuid)
  from public, anon;

grant execute on function public.record_billing_receipt_print(uuid)
  to authenticated;
grant execute on function public.get_billing_receipt_print_summary(uuid)
  to authenticated;
