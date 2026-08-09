-- Décision de performance (2026-08-09) : ajoute à `list_billing_receipts`
-- les champs qui manquaient encore pour construire un registre léger sans
-- charger `get_billing_receipt_details` pour chacun des 500 reçus à terme —
-- rabatteur, note, étiquette de groupe/famille (`omra_dossiers.label`,
-- distincte de `visible_dossier_reference` qui porte la référence, pas
-- l'étiquette), employé créateur du reçu, et montant/méthode du dernier
-- versement enregistré. Additive : la forme de retour change, donc DROP puis
-- CREATE (jamais de modification d'une migration déjà appliquée).

drop function if exists public.list_billing_receipts(
  uuid, timestamptz, timestamptz, text, text, text, uuid, uuid, integer, integer
);

create function public.list_billing_receipts(
  p_season_id uuid default null,
  p_created_from timestamptz default null,
  p_created_to timestamptz default null,
  p_lifecycle_status text default null,
  p_financial_status text default null,
  p_search_text text default null,
  p_dossier_id uuid default null,
  p_hotel_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  receipt_id uuid,
  season_id uuid,
  season_name_snapshot text,
  season_code_snapshot text,
  receipt_number integer,
  receipt_created_at timestamptz,
  lifecycle_status text,
  cancelled_at timestamptz,
  registration_id uuid,
  traveler_id uuid,
  dossier_id uuid,
  visible_dossier_reference text,
  traveler_first_name_snapshot text,
  traveler_last_name_snapshot text,
  traveler_phone_snapshot text,
  hotel_name_snapshot text,
  flight_label_snapshot text,
  room_label_snapshot text,
  room_bed_count_snapshot smallint,
  catalog_price_dh integer,
  maximum_discount_applied_dh integer,
  discount_amount_dh integer,
  agreed_amount_dh integer,
  payment_count bigint,
  total_paid_dh bigint,
  amount_due_dh bigint,
  overpayment_dh bigint,
  financial_status text,
  has_active_anomaly boolean,
  primary_anomaly_type text,
  primary_anomaly_amount_dh bigint,
  modification_count bigint,
  last_modified_at timestamptz,
  last_modified_by_slot_label text,
  last_modified_by_login text,
  last_modified_domain text,
  payment_operation_count bigint,
  has_cheque_missing_supporting_image boolean,
  registration_group_label text,
  registration_note text,
  registration_rabatteur_name text,
  receipt_created_by_slot_label text,
  last_payment_amount_dh integer,
  last_payment_mode text,
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
  v_search_text text;
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

  if p_limit is null or p_limit <= 0 or p_limit > 200 then
    raise exception 'Billing receipt page limit must be between 1 and 200';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'Billing receipt page offset must be non-negative';
  end if;

  if p_created_from is not null and p_created_to is not null and
     p_created_from > p_created_to then
    raise exception 'Billing receipt date range is invalid';
  end if;

  if p_lifecycle_status is not null and
     p_lifecycle_status not in ('active', 'cancelled') then
    raise exception 'Billing receipt lifecycle status is invalid';
  end if;

  if p_financial_status is not null and
     p_financial_status not in ('incomplete', 'paid', 'overpaid') then
    raise exception 'Billing receipt financial status is invalid';
  end if;

  v_search_text := nullif(pg_catalog.btrim(p_search_text), '');

  return query
  with payment_summary as (
    select
      payment.receipt_id,
      pg_catalog.count(*) as payment_count,
      coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint as total_paid_dh
    from public.receipt_payments as payment
    group by payment.receipt_id
  ),
  operation_summary as (
    select
      payment.receipt_id,
      pg_catalog.count(distinct operation.id) as operation_count,
      coalesce(
        pg_catalog.bool_or(
          operation.payment_mode = 'cheque' and
          active_image.id is null
        ),
        false
      ) as has_cheque_missing_image
    from public.receipt_payments as payment
    left join public.payment_allocations as allocation
      on allocation.receipt_payment_id = payment.id
    left join public.payment_operations as operation
      on operation.id = allocation.payment_operation_id
    left join public.payment_supporting_images as active_image
      on active_image.payment_operation_id = operation.id
      and active_image.deleted_at is null
    group by payment.receipt_id
  ),
  latest_payment as (
    select distinct on (payment.receipt_id)
      payment.receipt_id,
      payment.amount_dh as last_payment_amount_dh,
      operation.payment_mode as last_payment_mode
    from public.receipt_payments as payment
    left join public.payment_allocations as allocation
      on allocation.receipt_payment_id = payment.id
    left join public.payment_operations as operation
      on operation.id = allocation.payment_operation_id
    order by payment.receipt_id, payment.payment_number desc
  ),
  modification_events as (
    select history.*
    from public.facturation_action_history as history
    where history.entity_type = 'billing_receipt'
      and history.action_type in (
        'billing_receipt.commercial_data_updated',
        'billing_receipt.identity_updated',
        'billing_receipt.phone_updated',
        'billing_receipt.note_updated',
        'billing_receipt.dossier_updated'
      )
  ),
  modification_summary as (
    select
      history.entity_id as receipt_id,
      pg_catalog.count(*) as modification_count
    from modification_events as history
    group by history.entity_id
  ),
  latest_modification as (
    select distinct on (history.entity_id)
      history.entity_id as receipt_id,
      history.occurred_at,
      history.actor_slot_label_snapshot,
      history.actor_login_snapshot,
      history.section_code
    from modification_events as history
    order by history.entity_id, history.occurred_at desc, history.id desc
  ),
  latest_commercial_modification as (
    select distinct on (history.entity_id)
      history.entity_id as receipt_id,
      history.after_data
    from public.facturation_action_history as history
    where history.entity_type = 'billing_receipt'
      and history.action_type = 'billing_receipt.commercial_data_updated'
    order by history.entity_id, history.occurred_at desc, history.id desc
  ),
  receipt_rows as (
    select
      receipt.id as receipt_id,
      receipt.season_id,
      registration.season_name_snapshot,
      registration.season_code_snapshot,
      receipt.receipt_number,
      receipt.created_at as receipt_created_at,
      receipt.lifecycle_status,
      cancellation.cancelled_at,
      receipt.registration_id,
      registration.traveler_id,
      registration.dossier_id,
      case
        when dossier.dossier_reference like 'technical:%' then null
        else dossier.dossier_reference
      end as visible_dossier_reference,
      registration.traveler_first_name_snapshot,
      registration.traveler_last_name_snapshot,
      registration.traveler_phone_snapshot,
      registration.hotel_name_snapshot,
      registration.flight_label_snapshot,
      registration.room_label_snapshot,
      registration.room_bed_count_snapshot,
      registration.catalog_price_dh,
      registration.maximum_discount_applied_dh,
      registration.discount_amount_dh,
      registration.agreed_amount_dh,
      coalesce(payment.payment_count, 0)::bigint as payment_count,
      coalesce(payment.total_paid_dh, 0)::bigint as total_paid_dh,
      coalesce(modification.modification_count, 0)::bigint
        as modification_count,
      latest_modification.occurred_at as last_modified_at,
      latest_modification.actor_slot_label_snapshot
        as last_modified_by_slot_label,
      latest_modification.actor_login_snapshot as last_modified_by_login,
      latest_modification.section_code as last_modified_domain,
      coalesce(operation.operation_count, 0)::bigint
        as payment_operation_count,
      coalesce(operation.has_cheque_missing_image, false)
        as has_cheque_missing_image,
      coalesce(
        latest_commercial.after_data @>
          '{"has_financial_anomaly": true}'::jsonb,
        false
      ) as latest_commercial_reported_anomaly,
      dossier.label as registration_group_label,
      registration.note as registration_note,
      registration.rabatteur_name_snapshot as registration_rabatteur_name,
      receipt.created_by_slot_label_snapshot as receipt_created_by_slot_label,
      latest_payment.last_payment_amount_dh,
      latest_payment.last_payment_mode
    from public.billing_receipts as receipt
    join public.traveler_registrations as registration
      on registration.id = receipt.registration_id
    join public.omra_dossiers as dossier
      on dossier.id = registration.dossier_id
    left join public.receipt_cancellations as cancellation
      on cancellation.receipt_id = receipt.id
    left join payment_summary as payment
      on payment.receipt_id = receipt.id
    left join operation_summary as operation
      on operation.receipt_id = receipt.id
    left join modification_summary as modification
      on modification.receipt_id = receipt.id
    left join latest_modification
      on latest_modification.receipt_id = receipt.id
    left join latest_commercial_modification as latest_commercial
      on latest_commercial.receipt_id = receipt.id
    left join latest_payment
      on latest_payment.receipt_id = receipt.id
  ),
  financial_rows as (
    select
      receipt.*,
      case
        when receipt.agreed_amount_dh::bigint > receipt.total_paid_dh
          then receipt.agreed_amount_dh::bigint - receipt.total_paid_dh
        else 0::bigint
      end as amount_due_dh,
      case
        when receipt.total_paid_dh > receipt.agreed_amount_dh::bigint
          then receipt.total_paid_dh - receipt.agreed_amount_dh::bigint
        else 0::bigint
      end as overpayment_dh
    from receipt_rows as receipt
  ),
  enriched_rows as (
    select
      receipt.*,
      case
        when receipt.amount_due_dh > 0 then 'incomplete'
        when receipt.overpayment_dh > 0 then 'overpaid'
        else 'paid'
      end as financial_status,
      (
        (
          receipt.latest_commercial_reported_anomaly and
          (receipt.amount_due_dh > 0 or receipt.overpayment_dh > 0)
        ) or receipt.has_cheque_missing_image
      ) as has_active_anomaly,
      case
        when receipt.latest_commercial_reported_anomaly and
             receipt.amount_due_dh > 0 then 'amount_due'
        when receipt.latest_commercial_reported_anomaly and
             receipt.overpayment_dh > 0 then 'overpayment'
        when receipt.has_cheque_missing_image
          then 'cheque_missing_supporting_image'
        else null
      end as primary_anomaly_type,
      case
        when receipt.latest_commercial_reported_anomaly and
             receipt.amount_due_dh > 0 then receipt.amount_due_dh
        when receipt.latest_commercial_reported_anomaly and
             receipt.overpayment_dh > 0 then receipt.overpayment_dh
        else null::bigint
      end as primary_anomaly_amount_dh
    from financial_rows as receipt
  ),
  filtered_rows as (
    select receipt.*
    from enriched_rows as receipt
    where (p_season_id is null or receipt.season_id = p_season_id)
      and (
        p_created_from is null or
        receipt.receipt_created_at >= p_created_from
      )
      and (
        p_created_to is null or
        receipt.receipt_created_at <= p_created_to
      )
      and (
        p_lifecycle_status is null or
        receipt.lifecycle_status = p_lifecycle_status
      )
      and (
        p_financial_status is null or
        receipt.financial_status = p_financial_status
      )
      and (p_dossier_id is null or receipt.dossier_id = p_dossier_id)
      and (
        p_hotel_id is null or
        exists (
          select 1
          from public.traveler_registrations as registration
          where registration.id = receipt.registration_id
            and registration.hotel_id = p_hotel_id
        )
      )
      and (
        v_search_text is null or
        receipt.receipt_number::text ilike '%' || v_search_text || '%' or
        receipt.traveler_first_name_snapshot
          ilike '%' || v_search_text || '%' or
        receipt.traveler_last_name_snapshot
          ilike '%' || v_search_text || '%' or
        coalesce(receipt.traveler_phone_snapshot, '')
          ilike '%' || v_search_text || '%' or
        coalesce(receipt.visible_dossier_reference, '')
          ilike '%' || v_search_text || '%' or
        exists (
          select 1
          from public.receipt_payments as searched_payment
          join public.payment_allocations as searched_allocation
            on searched_allocation.receipt_payment_id = searched_payment.id
          join public.payment_instrument_details as instrument
            on instrument.payment_operation_id =
              searched_allocation.payment_operation_id
          where searched_payment.receipt_id = receipt.receipt_id
            and instrument.instrument_reference
              ilike '%' || v_search_text || '%'
        )
      )
  )
  select
    receipt.receipt_id,
    receipt.season_id,
    receipt.season_name_snapshot,
    receipt.season_code_snapshot,
    receipt.receipt_number,
    receipt.receipt_created_at,
    receipt.lifecycle_status,
    receipt.cancelled_at,
    receipt.registration_id,
    receipt.traveler_id,
    receipt.dossier_id,
    receipt.visible_dossier_reference,
    receipt.traveler_first_name_snapshot,
    receipt.traveler_last_name_snapshot,
    receipt.traveler_phone_snapshot,
    receipt.hotel_name_snapshot,
    receipt.flight_label_snapshot,
    receipt.room_label_snapshot,
    receipt.room_bed_count_snapshot,
    receipt.catalog_price_dh,
    receipt.maximum_discount_applied_dh,
    receipt.discount_amount_dh,
    receipt.agreed_amount_dh,
    receipt.payment_count,
    receipt.total_paid_dh,
    receipt.amount_due_dh,
    receipt.overpayment_dh,
    receipt.financial_status,
    receipt.has_active_anomaly,
    receipt.primary_anomaly_type,
    receipt.primary_anomaly_amount_dh,
    receipt.modification_count,
    receipt.last_modified_at,
    receipt.last_modified_by_slot_label,
    receipt.last_modified_by_login,
    receipt.last_modified_domain,
    receipt.payment_operation_count,
    receipt.has_cheque_missing_image,
    receipt.registration_group_label,
    receipt.registration_note,
    receipt.registration_rabatteur_name,
    receipt.receipt_created_by_slot_label,
    receipt.last_payment_amount_dh,
    receipt.last_payment_mode,
    pg_catalog.count(*) over () as total_rows
  from filtered_rows as receipt
  order by
    receipt.receipt_created_at desc,
    receipt.season_id desc,
    receipt.receipt_number desc,
    receipt.receipt_id desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke execute on function public.list_billing_receipts(
  uuid, timestamptz, timestamptz, text, text, text, uuid, uuid, integer, integer
) from public, anon;

grant execute on function public.list_billing_receipts(
  uuid, timestamptz, timestamptz, text, text, text, uuid, uuid, integer, integer
) to authenticated;
