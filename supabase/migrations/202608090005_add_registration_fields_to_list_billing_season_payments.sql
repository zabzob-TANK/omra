-- Correctif du même jour (2026-08-09), en migration de suivi.
--
-- Dernier oubli identifié en construisant `service.ts` (`journalFinancier`,
-- lignes 800-804) : quand l'instantané figé du versement n'a pas de valeur
-- pour rabatteur/hôtel/chambre/vol/convenu (cas historique), le Journal
-- financier retombe sur l'état ACTUEL de l'inscription (`registration.*`),
-- jamais recalculé — ce n'est pas l'instantané, c'est un filet pour des
-- lignes trop anciennes pour en avoir un complet. Ces 5 champs manquaient à
-- `list_billing_season_payments`.
--
-- `DROP` puis `CREATE`, comme les migrations de suivi précédentes.
drop function public.list_billing_season_payments(
  uuid, timestamptz, timestamptz, integer, integer
);

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
  registration_hotel_name text,
  registration_room_label text,
  registration_flight_label text,
  registration_rabatteur_name text,
  registration_agreed_amount_dh integer,
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
  image_storage_bucket text,
  image_storage_path text,
  image_original_file_name text,
  image_uploaded_at timestamptz,
  image_uploaded_by_slot_label text,
  snapshot_client_name text,
  snapshot_hotel_name text,
  snapshot_room_label text,
  snapshot_flight_label text,
  snapshot_program_label text,
  snapshot_agreed_amount_dh integer,
  snapshot_rabatteur_name text,
  snapshot_remaining_after_dh integer,
  snapshot_settled_after boolean,
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
      registration.hotel_name_snapshot as registration_hotel_name,
      registration.room_label_snapshot as registration_room_label,
      registration.flight_label_snapshot as registration_flight_label,
      registration.rabatteur_name_snapshot as registration_rabatteur_name,
      registration.agreed_amount_dh as registration_agreed_amount_dh,
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
      instrument.payer_name,
      active_image.storage_bucket as image_storage_bucket,
      active_image.storage_path as image_storage_path,
      active_image.original_file_name as image_original_file_name,
      active_image.uploaded_at as image_uploaded_at,
      active_image.uploaded_by_slot_label_snapshot as image_uploaded_by_slot_label,
      payment.payment_snapshot_client_name as snapshot_client_name,
      payment.payment_snapshot_hotel_name as snapshot_hotel_name,
      payment.payment_snapshot_room_label as snapshot_room_label,
      payment.payment_snapshot_flight_label as snapshot_flight_label,
      payment.payment_snapshot_program_label as snapshot_program_label,
      payment.payment_snapshot_agreed_amount_dh as snapshot_agreed_amount_dh,
      payment.payment_snapshot_rabatteur_name as snapshot_rabatteur_name,
      payment.payment_snapshot_remaining_after_dh as snapshot_remaining_after_dh,
      payment.payment_snapshot_settled_after as snapshot_settled_after
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
    left join public.payment_supporting_images as active_image
      on active_image.payment_operation_id = operation.id
      and active_image.deleted_at is null
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
    season.registration_hotel_name,
    season.registration_room_label,
    season.registration_flight_label,
    season.registration_rabatteur_name,
    season.registration_agreed_amount_dh,
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
    season.image_storage_bucket,
    season.image_storage_path,
    season.image_original_file_name,
    season.image_uploaded_at,
    season.image_uploaded_by_slot_label,
    season.snapshot_client_name,
    season.snapshot_hotel_name,
    season.snapshot_room_label,
    season.snapshot_flight_label,
    season.snapshot_program_label,
    season.snapshot_agreed_amount_dh,
    season.snapshot_rabatteur_name,
    season.snapshot_remaining_after_dh,
    season.snapshot_settled_after,
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
  'Versements d''une saison à plat : date de versement et date d''opération '
  'séparées, justificatif actif de l''opération, instantané figé du '
  'versement (R-14, R-22), et l''état actuel de l''inscription en filet pour '
  'les lignes trop anciennes pour avoir un instantané complet. Remplace le '
  'chargement de tous les reçus complets pour Paiements, Journal financier '
  'et Suivi journalier.';
