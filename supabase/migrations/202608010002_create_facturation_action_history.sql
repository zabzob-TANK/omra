create table public.facturation_action_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action_type text not null,
  section_code text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now(),
  actor_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  actor_auth_user_id_snapshot uuid,
  actor_slot_label_snapshot text not null,
  actor_login_snapshot text,
  correlation_id uuid,
  constraint facturation_action_history_entity_type_check check (
    btrim(entity_type) <> ''
  ),
  constraint facturation_action_history_action_type_check check (
    btrim(action_type) <> ''
  ),
  constraint facturation_action_history_actor_slot_label_snapshot_check check (
    btrim(actor_slot_label_snapshot) <> ''
  )
);

-- This append-only history will later be written through secure transactional
-- functions. No public, anonymous or authenticated access policy is defined.
-- Future events will notably cover receipt creation, payment addition, receipt
-- updates, confirmation of an overrun on a shared operation, cancellation,
-- cash outflow, supporting-image addition or removal, printing, and
-- confirmation that a financial anomaly was reviewed.

create index facturation_action_history_entity_idx
  on public.facturation_action_history (entity_type, entity_id, occurred_at);

create index facturation_action_history_actor_idx
  on public.facturation_action_history (actor_slot_number, occurred_at);

create index facturation_action_history_action_idx
  on public.facturation_action_history (action_type, occurred_at);

create index facturation_action_history_correlation_id_idx
  on public.facturation_action_history (correlation_id)
  where correlation_id is not null;

alter table public.facturation_action_history enable row level security;

revoke all on table public.facturation_action_history
  from public, anon, authenticated;

grant all on table public.facturation_action_history to service_role;
