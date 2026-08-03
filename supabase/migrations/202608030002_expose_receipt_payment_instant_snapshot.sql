-- Complète 202608030001 : get_billing_receipt_details expose l'instantané
-- figé de chaque versement (reprise.md §5.7), lu tel quel depuis
-- receipt_payments.payment_snapshot_*, jamais recalculé.

create or replace function public.get_billing_receipt_details(
  p_receipt_id uuid
)
returns jsonb
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
  v_result jsonb;
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

  if not exists (
    select 1
    from public.billing_receipts as receipt
    where receipt.id = p_receipt_id
  ) then
    raise exception 'Billing receipt not found';
  end if;

  with payment_summary as (
    select
      pg_catalog.count(*)::bigint as payment_count,
      coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint as total_paid_dh
    from public.receipt_payments as payment
    where payment.receipt_id = p_receipt_id
  ),
  latest_commercial_modification as (
    select
      history.after_data,
      history.occurred_at
    from public.facturation_action_history as history
    where history.entity_type = 'billing_receipt'
      and history.entity_id = p_receipt_id
      and history.action_type = 'billing_receipt.commercial_data_updated'
    order by history.occurred_at desc, history.id desc
    limit 1
  ),
  receipt_core as (
    select
      receipt.*,
      registration.dossier_id,
      registration.traveler_id,
      registration.program_id,
      registration.hotel_id,
      registration.flight_id,
      registration.room_id,
      registration.rabatteur_id,
      registration.price_id,
      registration.catalog_price_dh,
      registration.maximum_discount_applied_dh,
      registration.discount_amount_dh,
      registration.agreed_amount_dh,
      registration.traveler_first_name_snapshot,
      registration.traveler_last_name_snapshot,
      registration.traveler_phone_snapshot,
      registration.season_name_snapshot,
      registration.season_code_snapshot,
      registration.hotel_name_snapshot,
      registration.flight_label_snapshot,
      registration.room_label_snapshot,
      registration.room_bed_count_snapshot,
      registration.rabatteur_name_snapshot,
      registration.registered_at,
      registration.registered_by_slot_number,
      registration.note as registration_note,
      dossier.label as dossier_label,
      case
        when dossier.dossier_reference like 'technical:%' then null
        else dossier.dossier_reference
      end as visible_dossier_reference,
      cancellation.id as cancellation_id,
      cancellation.restitution_route,
      cancellation.total_paid_at_cancellation_dh,
      cancellation.reason as cancellation_reason,
      cancellation.cancelled_at,
      cancellation.cancelled_by_slot_number,
      cancellation.cancelled_by_slot_label_snapshot,
      cancellation.cancelled_by_login_snapshot,
      payment.payment_count,
      payment.total_paid_dh,
      coalesce(
        (
          select -pg_catalog.sum(movement.amount_dh)::bigint
          from public.cash_register_movements as movement
          where movement.cancellation_id = cancellation.id
        ),
        0::bigint
      ) as cash_outflow_amount_dh,
      coalesce(
        commercial.after_data @>
          '{"has_financial_anomaly": true}'::jsonb,
        false
      ) as latest_commercial_reported_anomaly,
      commercial.occurred_at as latest_commercial_modified_at
    from public.billing_receipts as receipt
    join public.traveler_registrations as registration
      on registration.id = receipt.registration_id
    join public.omra_dossiers as dossier
      on dossier.id = registration.dossier_id
    left join public.receipt_cancellations as cancellation
      on cancellation.receipt_id = receipt.id
    cross join payment_summary as payment
    left join latest_commercial_modification as commercial on true
    where receipt.id = p_receipt_id
  ),
  financial_core as (
    select
      core.*,
      case
        when core.agreed_amount_dh::bigint > core.total_paid_dh
          then core.agreed_amount_dh::bigint - core.total_paid_dh
        else 0::bigint
      end as amount_due_dh,
      case
        when core.total_paid_dh > core.agreed_amount_dh::bigint
          then core.total_paid_dh - core.agreed_amount_dh::bigint
        else 0::bigint
      end as overpayment_dh
    from receipt_core as core
  ),
  payment_rows as (
    select
      payment.id,
      payment.payment_number,
      payment.amount_dh,
      payment.registered_at,
      payment.created_by_slot_number,
      payment.created_by_slot_label_snapshot,
      payment.created_by_login_snapshot,
      payment.payment_snapshot_client_name,
      payment.payment_snapshot_hotel_name,
      payment.payment_snapshot_room_label,
      payment.payment_snapshot_flight_label,
      payment.payment_snapshot_program_label,
      payment.payment_snapshot_agreed_amount_dh,
      payment.payment_snapshot_rabatteur_name,
      payment.payment_snapshot_remaining_after_dh,
      payment.payment_snapshot_settled_after,
      allocation.allocation_count,
      allocation.allocation_id,
      allocation.payment_operation_id,
      operation.payment_mode,
      operation.usage_kind
    from public.receipt_payments as payment
    left join lateral (
      select
        pg_catalog.count(*)::integer as allocation_count,
        (pg_catalog.array_agg(item.id order by item.id))[1]
          as allocation_id,
        (pg_catalog.array_agg(item.payment_operation_id order by item.id))[1]
          as payment_operation_id
      from public.payment_allocations as item
      where item.receipt_payment_id = payment.id
    ) as allocation on true
    left join public.payment_operations as operation
      on operation.id = allocation.payment_operation_id
    where payment.receipt_id = p_receipt_id
  ),
  related_operation_ids as (
    select distinct allocation.payment_operation_id as id
    from public.receipt_payments as payment
    join public.payment_allocations as allocation
      on allocation.receipt_payment_id = payment.id
    where payment.receipt_id = p_receipt_id
  ),
  operation_rows as (
    select
      operation.id,
      operation.payment_mode,
      operation.usage_kind,
      operation.operation_amount_dh,
      operation.registered_at,
      operation.created_by_slot_number,
      operation.created_by_slot_label_snapshot,
      operation.created_by_login_snapshot,
      operation.over_allocation_confirmed_at,
      operation.over_allocation_confirmed_by_slot_number,
      operation.over_allocation_confirmer_label_snapshot,
      coalesce(allocation.allocated_total_dh, 0)::bigint
        as allocated_total_dh,
      operation.operation_amount_dh::bigint -
        coalesce(allocation.allocated_total_dh, 0)::bigint
        as remaining_amount_dh,
      instrument.instrument_reference,
      instrument.bank_name,
      instrument.instrument_date,
      instrument.payer_name,
      image.id as supporting_image_id,
      image.storage_bucket,
      image.storage_path,
      image.original_file_name,
      image.mime_type,
      image.file_size_bytes,
      image.file_hash,
      image.uploaded_at,
      image.uploaded_by_slot_number,
      image.uploaded_by_slot_label_snapshot,
      image.uploaded_by_login_snapshot
    from public.payment_operations as operation
    join related_operation_ids as related on related.id = operation.id
    left join public.payment_instrument_details as instrument
      on instrument.payment_operation_id = operation.id
    left join lateral (
      select coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
        as allocated_total_dh
      from public.payment_allocations as item
      join public.receipt_payments as payment
        on payment.id = item.receipt_payment_id
      where item.payment_operation_id = operation.id
    ) as allocation on true
    left join public.payment_supporting_images as image
      on image.payment_operation_id = operation.id
      and image.deleted_at is null
  ),
  related_payment_ids as (
    select payment.id
    from public.receipt_payments as payment
    where payment.receipt_id = p_receipt_id
  ),
  history_rows as (
    select history.*
    from public.facturation_action_history as history
    where
      (
        history.entity_type = 'billing_receipt' and
        history.entity_id = p_receipt_id
      ) or (
        history.entity_type = 'receipt_payment' and
        history.entity_id in (select payment.id from related_payment_ids as payment)
      ) or (
        history.entity_type = 'payment_operation' and
        history.entity_id in (select operation.id from related_operation_ids as operation) and
        (
          history.action_type in (
            'payment_operation.evidence_attached',
            'payment_operation.evidence_deleted'
          ) or
          coalesce(
            history.after_data ->> 'receipt_id',
            history.before_data ->> 'receipt_id'
          ) = p_receipt_id::text
        )
      )
  ),
  modification_events as (
    select history.*
    from public.facturation_action_history as history
    where history.entity_type = 'billing_receipt'
      and history.entity_id = p_receipt_id
      and history.action_type in (
        'billing_receipt.commercial_data_updated',
        'billing_receipt.identity_updated',
        'billing_receipt.phone_updated',
        'billing_receipt.note_updated',
        'billing_receipt.dossier_updated'
      )
  )
  select pg_catalog.jsonb_build_object(
    'receipt', pg_catalog.jsonb_build_object(
      'id', core.id,
      'season_id', core.season_id,
      'season_name_snapshot', core.season_name_snapshot,
      'season_code_snapshot', core.season_code_snapshot,
      'receipt_number', core.receipt_number,
      'lifecycle_status', core.lifecycle_status,
      'created_at', core.created_at,
      'created_by', pg_catalog.jsonb_build_object(
        'slot_number', core.created_by_slot_number,
        'slot_label', core.created_by_slot_label_snapshot,
        'login', core.created_by_login_snapshot
      ),
      'cancellation', case
        when core.cancellation_id is null then null
        else pg_catalog.jsonb_build_object(
          'id', core.cancellation_id,
          'cancelled_at', core.cancelled_at,
          'reason', core.cancellation_reason,
          'restitution_route', core.restitution_route,
          'total_cancelled_dh', core.total_paid_at_cancellation_dh,
          'cash_outflow_amount_dh', core.cash_outflow_amount_dh,
          'cancelled_by', pg_catalog.jsonb_build_object(
            'slot_number', core.cancelled_by_slot_number,
            'slot_label', core.cancelled_by_slot_label_snapshot,
            'login', core.cancelled_by_login_snapshot
          )
        )
      end,
      'financial', pg_catalog.jsonb_build_object(
        'payment_count', core.payment_count,
        'total_paid_dh', core.total_paid_dh,
        'amount_due_dh', core.amount_due_dh,
        'overpayment_dh', core.overpayment_dh,
        'financial_status', case
          when core.amount_due_dh > 0 then 'incomplete'
          when core.overpayment_dh > 0 then 'overpaid'
          else 'paid'
        end
      )
    ),
    'registration', pg_catalog.jsonb_build_object(
      'id', core.registration_id,
      'traveler_id', core.traveler_id,
      'dossier', pg_catalog.jsonb_build_object(
        'id', core.dossier_id,
        'reference', core.visible_dossier_reference,
        'label', core.dossier_label
      ),
      'program_id', core.program_id,
      'season_id', core.season_id,
      'season_name_snapshot', core.season_name_snapshot,
      'season_code_snapshot', core.season_code_snapshot,
      'first_name_snapshot', core.traveler_first_name_snapshot,
      'last_name_snapshot', core.traveler_last_name_snapshot,
      'phone_snapshot', core.traveler_phone_snapshot,
      'note', core.registration_note,
      'hotel_id', core.hotel_id,
      'hotel_name_snapshot', core.hotel_name_snapshot,
      'flight_id', core.flight_id,
      'flight_label_snapshot', core.flight_label_snapshot,
      'room_id', core.room_id,
      'room_label_snapshot', core.room_label_snapshot,
      'room_bed_count_snapshot', core.room_bed_count_snapshot,
      'rabatteur_id', core.rabatteur_id,
      'rabatteur_name_snapshot', core.rabatteur_name_snapshot,
      'price_id', core.price_id,
      'catalog_price_dh', core.catalog_price_dh,
      'maximum_discount_applied_dh', core.maximum_discount_applied_dh,
      'discount_amount_dh', core.discount_amount_dh,
      'agreed_amount_dh', core.agreed_amount_dh,
      'registered_at', core.registered_at,
      'registered_by_slot_number', core.registered_by_slot_number
    ),
    'payments', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', payment.id,
            'payment_number', payment.payment_number,
            'amount_dh', payment.amount_dh,
            'registered_at', payment.registered_at,
            'created_by', pg_catalog.jsonb_build_object(
              'slot_number', payment.created_by_slot_number,
              'slot_label', payment.created_by_slot_label_snapshot,
              'login', payment.created_by_login_snapshot
            ),
            'allocation_id', payment.allocation_id,
            'allocation_count', payment.allocation_count,
            'has_expected_allocation', payment.allocation_count = 1,
            'payment_operation_id', payment.payment_operation_id,
            'payment_mode', payment.payment_mode,
            'usage_kind', payment.usage_kind,
            'snapshot', pg_catalog.jsonb_build_object(
              'client_name', payment.payment_snapshot_client_name,
              'hotel_name', payment.payment_snapshot_hotel_name,
              'room_label', payment.payment_snapshot_room_label,
              'flight_label', payment.payment_snapshot_flight_label,
              'program_label', payment.payment_snapshot_program_label,
              'agreed_amount_dh', payment.payment_snapshot_agreed_amount_dh,
              'rabatteur_name', payment.payment_snapshot_rabatteur_name,
              'remaining_after_dh', payment.payment_snapshot_remaining_after_dh,
              'settled_after', payment.payment_snapshot_settled_after
            )
          )
          order by payment.payment_number, payment.id
        )
        from payment_rows as payment
      ),
      '[]'::jsonb
    ),
    'operations', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', operation.id,
            'payment_mode', operation.payment_mode,
            'usage_kind', operation.usage_kind,
            'operation_amount_dh', operation.operation_amount_dh,
            'allocated_total_dh', operation.allocated_total_dh,
            'remaining_amount_dh', operation.remaining_amount_dh,
            'registered_at', operation.registered_at,
            'created_by', pg_catalog.jsonb_build_object(
              'slot_number', operation.created_by_slot_number,
              'slot_label', operation.created_by_slot_label_snapshot,
              'login', operation.created_by_login_snapshot
            ),
            'over_allocation_confirmation', case
              when operation.over_allocation_confirmed_at is null then null
              else pg_catalog.jsonb_build_object(
                'confirmed_at', operation.over_allocation_confirmed_at,
                'confirmed_by_slot_number',
                  operation.over_allocation_confirmed_by_slot_number,
                'confirmed_by_slot_label',
                  operation.over_allocation_confirmer_label_snapshot
              )
            end,
            'instrument', case
              when operation.payment_mode not in ('cheque', 'transfer') then null
              when operation.instrument_reference is null then null
              else pg_catalog.jsonb_build_object(
                'reference', operation.instrument_reference,
                'bank_name', operation.bank_name,
                'instrument_date', operation.instrument_date,
                'payer_name', operation.payer_name
              )
            end,
            'has_active_supporting_image',
              operation.payment_mode in ('cheque', 'transfer') and
              operation.supporting_image_id is not null,
            'supporting_image', case
              when operation.payment_mode not in ('cheque', 'transfer') or
                   operation.supporting_image_id is null then null
              else pg_catalog.jsonb_build_object(
                'id', operation.supporting_image_id,
                'storage_bucket', operation.storage_bucket,
                'storage_path', operation.storage_path,
                'original_file_name', operation.original_file_name,
                'mime_type', operation.mime_type,
                'file_size_bytes', operation.file_size_bytes,
                'file_hash', operation.file_hash,
                'uploaded_at', operation.uploaded_at,
                'uploaded_by', pg_catalog.jsonb_build_object(
                  'slot_number', operation.uploaded_by_slot_number,
                  'slot_label', operation.uploaded_by_slot_label_snapshot,
                  'login', operation.uploaded_by_login_snapshot
                )
              )
            end
          )
          order by operation.registered_at, operation.id
        )
        from operation_rows as operation
      ),
      '[]'::jsonb
    ),
    'active_anomalies', coalesce(
      (
        select pg_catalog.jsonb_agg(anomaly.data order by anomaly.sort_order)
        from (
          select
            1 as sort_order,
            pg_catalog.jsonb_build_object(
              'type', case
                when core.amount_due_dh > 0 then 'amount_due'
                else 'overpayment'
              end,
              'amount_dh', case
                when core.amount_due_dh > 0 then core.amount_due_dh
                else core.overpayment_dh
              end,
              'receipt_id', core.id,
              'operation_id', null,
              'last_changed_at', core.latest_commercial_modified_at
            ) as data
          where core.latest_commercial_reported_anomaly
            and (core.amount_due_dh > 0 or core.overpayment_dh > 0)

          union all

          select
            2 as sort_order,
            pg_catalog.jsonb_build_object(
              'type', 'cheque_missing_supporting_image',
              'amount_dh', null,
              'receipt_id', core.id,
              'operation_id', operation.id,
              'last_changed_at', coalesce(
                (
                  select pg_catalog.max(image.deleted_at)
                  from public.payment_supporting_images as image
                  where image.payment_operation_id = operation.id
                ),
                operation.registered_at
              )
            ) as data
          from operation_rows as operation
          where operation.payment_mode = 'cheque'
            and operation.supporting_image_id is null
        ) as anomaly
      ),
      '[]'::jsonb
    ),
    'modifications', pg_catalog.jsonb_build_object(
      'count', (
        select pg_catalog.count(*)
        from modification_events as modification
      ),
      'last', (
        select pg_catalog.jsonb_build_object(
          'action_type', modification.action_type,
          'domain', modification.section_code,
          'occurred_at', modification.occurred_at,
          'actor_slot_number', modification.actor_slot_number,
          'actor_slot_label', modification.actor_slot_label_snapshot,
          'actor_login', modification.actor_login_snapshot
        )
        from modification_events as modification
        order by modification.occurred_at desc, modification.id desc
        limit 1
      )
    ),
    'history', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', history.id,
            'entity_type', history.entity_type,
            'entity_id', history.entity_id,
            'action_type', history.action_type,
            'domain', history.section_code,
            'reason', history.reason,
            'occurred_at', history.occurred_at,
            'actor_slot_number', history.actor_slot_number,
            'actor_slot_label', history.actor_slot_label_snapshot,
            'actor_login', history.actor_login_snapshot,
            'before_data', history.before_data,
            'after_data', history.after_data,
            'correlation_id', history.correlation_id
          )
          order by history.occurred_at desc, history.id desc
        )
        from history_rows as history
      ),
      '[]'::jsonb
    ),
    'consistency', pg_catalog.jsonb_build_object(
      'payments_without_exactly_one_allocation', (
        select pg_catalog.count(*)
        from payment_rows as payment
        where payment.allocation_count <> 1
      ),
      'bank_operations_without_instrument_details', (
        select pg_catalog.count(*)
        from operation_rows as operation
        where operation.payment_mode in ('cheque', 'transfer')
          and operation.instrument_reference is null
      ),
      'cash_operations_with_instrument_details', (
        select pg_catalog.count(*)
        from operation_rows as operation
        where operation.payment_mode = 'cash'
          and operation.instrument_reference is not null
      ),
      'cash_operations_with_active_images', (
        select pg_catalog.count(*)
        from public.payment_supporting_images as image
        join public.payment_operations as operation
          on operation.id = image.payment_operation_id
        where operation.id in (
            select related.id from related_operation_ids as related
          )
          and operation.payment_mode = 'cash'
          and image.deleted_at is null
      ),
      'operations_with_multiple_active_images', (
        select pg_catalog.count(*)
        from (
          select image.payment_operation_id
          from public.payment_supporting_images as image
          where image.payment_operation_id in (
            select operation.id from related_operation_ids as operation
          )
            and image.deleted_at is null
          group by image.payment_operation_id
          having pg_catalog.count(*) > 1
        ) as invalid_image_operation
      ),
      'unique_operations_with_amount_mismatch', (
        select pg_catalog.count(*)
        from operation_rows as operation
        where operation.usage_kind = 'unique'
          and operation.operation_amount_dh::bigint <>
            operation.allocated_total_dh
      )
    )
  )
  into v_result
  from financial_core as core;

  return v_result;
end;
$$;

comment on function public.get_billing_receipt_details(uuid) is
  'Read-only receipt detail built from historical registration snapshots, payments (including each payment''s frozen instant snapshot), allocations, operations, active evidence, cancellation and precisely related history. Deleted evidence and Auth identifiers are omitted; private bucket/path metadata is returned without any URL or token. Printing is omitted because the current schema has no reliable print field or event.';
