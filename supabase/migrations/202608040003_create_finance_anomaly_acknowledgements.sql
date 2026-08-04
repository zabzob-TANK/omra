-- Lot Finance (fusion.md §5, étape 4b) — acquittement des anomalies du
-- journal financier (R-65). Réservé à l'administrateur (slot 1),
-- reprise.md §5.1. Nouvelle table, additive.
--
-- L'acquittement est un instantané cumulatif : le domaine
-- (`service.ts::acquitterAnomalies`) fusionne déjà côté application les
-- identifiants de mouvements déjà acquittés avec les nouveaux avant d'appeler
-- cette fonction ; celle-ci remplace donc simplement la liste pour le couple
-- (saison, jour), elle ne fusionne rien elle-même.
create table public.facturation_anomaly_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null
    references public.omra_seasons(id) on delete restrict,
  day_key date not null,
  movement_ids text[] not null,
  acknowledged_at timestamptz not null default now(),
  acknowledged_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  acknowledged_by_auth_user_id_snapshot uuid,
  acknowledged_by_slot_label_snapshot text not null,
  acknowledged_by_login_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facturation_anomaly_acknowledgements_season_day_unique
    unique (season_id, day_key),
  constraint facturation_anomaly_acknowledgements_slot_label_check check (
    btrim(acknowledged_by_slot_label_snapshot) <> ''
  )
);

create index facturation_anomaly_acknowledgements_season_day_idx
  on public.facturation_anomaly_acknowledgements (season_id, day_key);

alter table public.facturation_anomaly_acknowledgements enable row level security;

revoke all on table public.facturation_anomaly_acknowledgements
  from public, anon, authenticated;

grant all on table public.facturation_anomaly_acknowledgements to service_role;

create function public.get_billing_finance_anomaly_acknowledgement(
  p_season_id uuid,
  p_day date
)
returns table (
  day_key date,
  movement_ids text[],
  acknowledged_at timestamptz,
  acknowledged_by_slot_label_snapshot text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform * from public.resolve_facturation_actor();

  return query
  select
    ack.day_key,
    ack.movement_ids,
    ack.acknowledged_at,
    ack.acknowledged_by_slot_label_snapshot
  from public.facturation_anomaly_acknowledgements as ack
  where ack.season_id = p_season_id
    and ack.day_key = p_day;
end;
$$;

-- R-65 — réservé à l'administrateur (slot 1). `require_facturation_admin()`
-- lève déjà une exception explicite si l'appelant n'est pas administrateur.
create function public.acknowledge_billing_finance_anomalies(
  p_season_id uuid,
  p_day date,
  p_movement_ids text[]
)
returns table (
  day_key date,
  movement_ids text[],
  acknowledged_at timestamptz,
  acknowledged_by_slot_label_snapshot text
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
begin
  -- R-65 — réservé à l'administrateur (slot 1) ; lève une exception explicite
  -- pour tout autre appelant.
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
  from public.require_facturation_admin() as actor;

  if p_season_id is null then
    raise exception 'Season is required';
  end if;

  if p_day is null then
    raise exception 'Day is required';
  end if;

  insert into public.facturation_anomaly_acknowledgements (
    season_id,
    day_key,
    movement_ids,
    acknowledged_by_slot_number,
    acknowledged_by_auth_user_id_snapshot,
    acknowledged_by_slot_label_snapshot,
    acknowledged_by_login_snapshot
  )
  values (
    p_season_id,
    p_day,
    coalesce(p_movement_ids, '{}'::text[]),
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login
  )
  on conflict on constraint facturation_anomaly_acknowledgements_season_day_unique
  do update set
    movement_ids = excluded.movement_ids,
    acknowledged_at = now(),
    acknowledged_by_slot_number = excluded.acknowledged_by_slot_number,
    acknowledged_by_auth_user_id_snapshot = excluded.acknowledged_by_auth_user_id_snapshot,
    acknowledged_by_slot_label_snapshot = excluded.acknowledged_by_slot_label_snapshot,
    acknowledged_by_login_snapshot = excluded.acknowledged_by_login_snapshot,
    updated_at = now();

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
    'facturation_finance_anomaly',
    p_season_id,
    'anomaly_acknowledged',
    'finance',
    pg_catalog.jsonb_build_object('day', p_day),
    pg_catalog.jsonb_build_object('day', p_day, 'movement_ids', p_movement_ids),
    now(),
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    gen_random_uuid()
  );

  return query
  select
    ack.day_key,
    ack.movement_ids,
    ack.acknowledged_at,
    ack.acknowledged_by_slot_label_snapshot
  from public.facturation_anomaly_acknowledgements as ack
  where ack.season_id = p_season_id
    and ack.day_key = p_day;
end;
$$;

comment on table public.facturation_anomaly_acknowledgements is
  'Acquittement cumulatif des anomalies du journal financier (R-65), un couple (saison, jour) par ligne. Réservé à l''administrateur.';

comment on function public.get_billing_finance_anomaly_acknowledgement(uuid, date) is
  'Lecture de l''acquittement des anomalies pour une saison et un jour donnés.';

comment on function public.acknowledge_billing_finance_anomalies(uuid, date, text[]) is
  'Remplace l''acquittement des anomalies pour une saison et un jour donnés. Réservé à l''administrateur (require_facturation_admin).';

revoke execute on function public.get_billing_finance_anomaly_acknowledgement(uuid, date)
  from public, anon;
revoke execute on function public.acknowledge_billing_finance_anomalies(uuid, date, text[])
  from public, anon;

grant execute on function public.get_billing_finance_anomaly_acknowledgement(uuid, date)
  to authenticated;
grant execute on function public.acknowledge_billing_finance_anomalies(uuid, date, text[])
  to authenticated;
