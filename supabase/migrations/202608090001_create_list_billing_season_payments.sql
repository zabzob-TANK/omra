-- Décision de performance (2026-08-09) : le registre, Paiements, le Journal
-- financier et le Suivi journalier chargeaient chacun TOUS les reçus de la
-- saison avec leur détail complet (`get_billing_receipt_details` +
-- `get_billing_receipt_print_summary` par reçu) uniquement pour en extraire
-- les versements — mesuré à 129 appels réseau pour 64 reçus, soit ~1001 pour
-- 500. Cette RPC renvoie directement les versements d'une saison, à plat,
-- pour que Paiements / Journal financier / Suivi journalier n'aient plus
-- besoin de charger un seul reçu complet.
--
-- Deux dates renvoyées par ligne, jamais une seule choisie ici : les trois
-- écrans consommateurs n'utilisent pas la même règle aujourd'hui —
-- Paiements groupe un chèque/virement partagé par la date d'enregistrement
-- de l'OPÉRATION (`cheque-register.ts`), le Journal financier et le Suivi
-- journalier groupent chaque versement par SA PROPRE date
-- (`finance-day.ts`) — et ce n'est pas un bug à corriger, chaque écran a un
-- objet différent (réconciliation bancaire vs suivi de caisse au jour le
-- jour). Cette RPC ne tranche donc pas : elle renvoie
-- `payment_registered_at` et `operation_registered_at` (nulle si
-- l'instrument n'est pas partagé), et laisse le domaine choisir comme il le
-- fait déjà.
--
-- Filtre de dates en OU, jamais en ET : un chèque partagé peut avoir des
-- attributions enregistrées des jours différents. Filtrer sur une seule des
-- deux dates masquerait certaines attributions sans que le montant restant
-- affiché s'en trouve corrigé en conséquence — la ligne remonte si l'une ou
-- l'autre des deux dates tombe dans l'intervalle demandé.
--
-- Tri renvoyé stable pour la pagination (registered_at puis id), mais ce
-- n'est qu'un ordre de page : le tri d'affichage réel reste dans le domaine
-- (`cleTri` de cheque-register.ts, `triDateHeure` de finance-day.ts), pas
-- ici.
create function public.list_billing_season_payments(
  p_season_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  payment_id uuid,
  receipt_id uuid,
  receipt_number integer,
  lifecycle_status text,
  traveler_first_name_snapshot text,
  traveler_last_name_snapshot text,
  receipt_created_by_slot_label text,
  payment_number smallint,
  amount_dh integer,
  payment_registered_at timestamptz,
  payment_created_by_slot_label text,
  payment_mode text,
  usage_kind text,
  operation_id uuid,
  operation_registered_at timestamptz,
  operation_amount_dh integer,
  instrument_reference text,
  instrument_date date,
  bank_name text,
  payer_name text,
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
    raise exception 'Billing season payments require a season id';
  end if;

  if p_limit is null or p_limit <= 0 or p_limit > 200 then
    raise exception 'Billing season payments page limit must be between 1 and 200';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'Billing season payments page offset must be non-negative';
  end if;

  if p_date_from is not null and p_date_to is not null and
     p_date_from > p_date_to then
    raise exception 'Billing season payments date range is invalid';
  end if;

  return query
  with season_payments as (
    select
      payment.id as payment_id,
      receipt.id as receipt_id,
      receipt.receipt_number,
      receipt.lifecycle_status,
      registration.traveler_first_name_snapshot,
      registration.traveler_last_name_snapshot,
      receipt.created_by_slot_label_snapshot as receipt_created_by_slot_label,
      payment.payment_number,
      payment.amount_dh,
      payment.registered_at as payment_registered_at,
      payment.created_by_slot_label_snapshot as payment_created_by_slot_label,
      operation.payment_mode,
      operation.usage_kind,
      operation.id as operation_id,
      operation.registered_at as operation_registered_at,
      operation.operation_amount_dh,
      instrument.instrument_reference,
      instrument.instrument_date,
      instrument.bank_name,
      instrument.payer_name
    from public.billing_receipts as receipt
    join public.traveler_registrations as registration
      on registration.id = receipt.registration_id
    join public.receipt_payments as payment
      on payment.receipt_id = receipt.id
    join public.payment_allocations as allocation
      on allocation.receipt_payment_id = payment.id
    join public.payment_operations as operation
      on operation.id = allocation.payment_operation_id
    left join public.payment_instrument_details as instrument
      on instrument.payment_operation_id = operation.id
    where receipt.season_id = p_season_id
      and (
        p_date_from is null or
        payment.registered_at >= p_date_from or
        operation.registered_at >= p_date_from
      )
      and (
        p_date_to is null or
        payment.registered_at <= p_date_to or
        operation.registered_at <= p_date_to
      )
  )
  select
    season.payment_id,
    season.receipt_id,
    season.receipt_number,
    season.lifecycle_status,
    season.traveler_first_name_snapshot,
    season.traveler_last_name_snapshot,
    season.receipt_created_by_slot_label,
    season.payment_number,
    season.amount_dh,
    season.payment_registered_at,
    season.payment_created_by_slot_label,
    season.payment_mode,
    season.usage_kind,
    season.operation_id,
    season.operation_registered_at,
    season.operation_amount_dh,
    season.instrument_reference,
    season.instrument_date,
    season.bank_name,
    season.payer_name,
    pg_catalog.count(*) over () as total_rows
  from season_payments as season
  order by
    season.payment_registered_at desc,
    season.payment_id desc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_billing_season_payments(
  uuid, timestamptz, timestamptz, integer, integer
) is
  'Versements d''une saison à plat, avec date de versement et date '
  'd''opération séparées — remplace le chargement de tous les reçus '
  'complets pour Paiements, Journal financier et Suivi journalier.';
