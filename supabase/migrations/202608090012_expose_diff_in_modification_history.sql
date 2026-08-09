-- Demande du commanditaire (2026-08-09) : le tableau des modifications du
-- Journal financier (en bleu, sous le principal — même emplacement que les
-- annulations, R-60) doit montrer ce qui a changé, ancienne et nouvelle
-- valeur — pas seulement qu'une modification a eu lieu. La fiche d'un reçu
-- a le même manque, déjà signalé (`changements` toujours vide côté
-- lecture) : les deux sont traités dans la même migration, une seule
-- correspondance de domaine (`modification-history.ts`, TypeScript)
-- branchée aux deux plutôt qu'écrite deux fois.
--
-- La donnée existait déjà dans `facturation_action_history.before_data` /
-- `after_data` pour les six types d'action utilisables aujourd'hui
-- (vérifié fonction d'écriture par fonction avant cette migration) : seule
-- la lecture ne l'exposait pas. Rien n'est produit à l'écriture ici, tout
-- est déjà là.
--
-- `billing_receipt.dossier_updated` (groupe/dossier) reste sans
-- correspondance : son historique ne porte que des identifiants techniques
-- de dossier, sans libellé — noté dans reprise.md comme point à traiter
-- avant de réactiver cette section (désactivée dans l'écran depuis ce
-- matin, donc sans effet aujourd'hui).
--
-- `list_billing_season_modifications` gagne aussi le nom du voyageur
-- (`traveler_first_name_snapshot` / `traveler_last_name_snapshot`,
-- jointure sur `traveler_registrations`), nécessaire pour afficher une
-- ligne de modification aussi complète qu'une ligne d'annulation
-- (`LigneAnnulation`, déjà nom + heure + numéro).
--
-- Rappel vérifié avant cette migration : ces lignes sont de l'information
-- pure. `before_data`/`after_data` ne sont lus par aucun total, cumul ou
-- compteur financier existant — seulement par le nouvel affichage
-- (Journal financier, fiche du reçu) et par le compte déjà en place
-- (`modification_count`, jamais recalculé depuis ces colonnes).
--
-- DROP puis CREATE pour les deux fonctions : la forme de retour change
-- (colonnes ajoutées), jamais possible avec CREATE OR REPLACE.
--
-- Testé en BEGIN...ROLLBACK sur un reçu réel avant push (fusion.md §12, §14).

drop function if exists public.list_billing_season_modifications(
  uuid, timestamptz, timestamptz, integer, integer
);

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
  traveler_first_name_snapshot text,
  traveler_last_name_snapshot text,
  action_type text,
  section_code text,
  reason text,
  before_data jsonb,
  after_data jsonb,
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
      registration.traveler_first_name_snapshot,
      registration.traveler_last_name_snapshot,
      history.action_type,
      history.section_code,
      history.reason,
      history.before_data,
      history.after_data,
      history.occurred_at,
      history.actor_slot_label_snapshot as actor_slot_label
    from public.facturation_action_history as history
    join public.billing_receipts as receipt
      on receipt.id = history.entity_id
    join public.traveler_registrations as registration
      on registration.id = receipt.registration_id
    where history.entity_type = 'billing_receipt'
      and history.action_type = any(public.billing_receipt_modification_action_types())
      and receipt.season_id = p_season_id
      and (p_date_from is null or history.occurred_at >= p_date_from)
      and (p_date_to is null or history.occurred_at <= p_date_to)
  )
  select
    season.modification_id,
    season.receipt_id,
    season.receipt_number,
    season.traveler_first_name_snapshot,
    season.traveler_last_name_snapshot,
    season.action_type,
    season.section_code,
    season.reason,
    season.before_data,
    season.after_data,
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
  'Événements de modification d''une saison, à plat, avec le détail avant/après (before_data/after_data) et le nom du voyageur — même filtre que list_billing_receipts.modification_count (billing_receipt_modification_action_types()). Alimente le tableau des modifications du Journal financier (R-60, sous le tableau principal) et le compteur du Suivi journalier.';

-- Absente jusqu'ici (fonction créée sans revoke/grant explicite le
-- 2026-08-09 matin, s'appuyait par défaut sur le droit EXECUTE public de
-- PostgreSQL) : ajoutée en profitant de ce DROP+CREATE, même discipline que
-- le reste du module.
revoke execute on function public.list_billing_season_modifications(
  uuid, timestamptz, timestamptz, integer, integer
) from public, anon;

grant execute on function public.list_billing_season_modifications(
  uuid, timestamptz, timestamptz, integer, integer
) to authenticated;

drop function if exists public.list_billing_receipt_history(uuid);

create function public.list_billing_receipt_history(
  p_receipt_id uuid
)
returns table (
  history_id uuid,
  action_type text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz,
  actor_slot_label text
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

  if p_receipt_id is null then
    raise exception 'Receipt id is required';
  end if;

  -- L'acteur doit avoir accès au reçu comme n'importe quelle autre lecture
  -- (aucune policy RLS sur billing_receipts pour le navigateur : cette
  -- fonction SECURITY DEFINER est le seul chemin de lecture, comme
  -- get_billing_receipt_details).
  if not exists (
    select 1 from public.billing_receipts as receipt
    where receipt.id = p_receipt_id
  ) then
    raise exception 'Billing receipt not found';
  end if;

  return query
  select
    history.id as history_id,
    history.action_type,
    history.reason,
    history.before_data,
    history.after_data,
    history.occurred_at,
    history.actor_slot_label_snapshot as actor_slot_label
  from public.facturation_action_history as history
  where history.entity_type = 'billing_receipt'
    and history.entity_id = p_receipt_id
    and history.action_type = any(public.billing_receipt_modification_action_types())
  order by history.occurred_at desc, history.id desc;
end;
$$;

revoke execute on function public.list_billing_receipt_history(uuid)
  from public, anon;

grant execute on function public.list_billing_receipt_history(uuid)
  to authenticated;
