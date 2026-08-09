-- Suite de la décision de performance du 2026-08-09 : le Suivi journalier
-- compte les modifications par jour (`daily.ts`, `resumeJournee`) en
-- parcourant `recu.modifications` sur TOUS les reçus de la saison — un
-- chargement complet proportionnel au nombre de reçus (500 à terme), pas au
-- nombre d'éditions réelles (rares). Cette RPC renvoie les événements de
-- modification de la saison à plat, même patron que
-- `list_billing_season_payments`.
--
-- Découverte en écrivant cette migration, signalée avant d'aller plus loin :
-- `mapReceiptDetailToRecu` (mappers.ts) renvoie toujours `modifications: []`
-- pour un reçu réel — le compte par jour du Suivi journalier est donc déjà
-- toujours à 0 en production aujourd'hui, quel que soit le nombre réel
-- d'éditions. Cette RPC lit `facturation_action_history`, la vraie source
-- (déjà utilisée par `list_billing_receipts` pour `modification_count`) :
-- le comportement changera pour ce champ précis, d'un 0 systématique vers un
-- vrai compte. Ce n'est pas un effet de bord du refactor de performance,
-- c'est un bug préexistant et distinct que cette RPC corrige en passant.
create function public.list_billing_season_modifications(
  p_season_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  modification_id uuid,
  receipt_id uuid,
  receipt_number integer,
  action_type text,
  section_code text,
  occurred_at timestamptz,
  actor_slot_label text,
  total_rows bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_slot_number smallint;
  v_actor_auth_user_id uuid;
  v_actor_slot_label text;
  v_actor_login text;
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
    raise exception 'Billing season modifications require a season id';
  end if;

  if p_limit is null or p_limit <= 0 or p_limit > 200 then
    raise exception 'Billing season modifications page limit must be between 1 and 200';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'Billing season modifications page offset must be non-negative';
  end if;

  if p_date_from is not null and p_date_to is not null and
     p_date_from > p_date_to then
    raise exception 'Billing season modifications date range is invalid';
  end if;

  return query
  with season_modifications as (
    select
      history.id as modification_id,
      receipt.id as receipt_id,
      receipt.receipt_number,
      history.action_type,
      history.section_code,
      history.occurred_at,
      history.actor_slot_label_snapshot as actor_slot_label
    from public.facturation_action_history as history
    join public.billing_receipts as receipt
      on receipt.id = history.entity_id
    where history.entity_type = 'billing_receipt'
      and history.action_type in (
        'billing_receipt.commercial_data_updated',
        'billing_receipt.identity_updated',
        'billing_receipt.phone_updated',
        'billing_receipt.note_updated',
        'billing_receipt.dossier_updated'
      )
      and receipt.season_id = p_season_id
      and (p_date_from is null or history.occurred_at >= p_date_from)
      and (p_date_to is null or history.occurred_at <= p_date_to)
  )
  select
    season.modification_id,
    season.receipt_id,
    season.receipt_number,
    season.action_type,
    season.section_code,
    season.occurred_at,
    season.actor_slot_label,
    pg_catalog.count(*) over () as total_rows
  from season_modifications as season
  order by
    season.occurred_at desc,
    season.modification_id desc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_billing_season_modifications(
  uuid, timestamptz, timestamptz, integer, integer
) is
  'Événements de modification d''une saison, à plat — mêmes types d''action '
  'que le calcul de modification_count dans list_billing_receipts. Remplace '
  'le parcours de tous les reçus complets pour compter les modifications '
  'par jour dans le Suivi journalier.';
