-- Demande du commanditaire (2026-08-09) : la même liste de 5 types
-- d'action, qui décide ce qui compte comme « une modification » pour un
-- reçu, était recopiée séparément dans quatre fonctions SQL —
-- `list_billing_receipts` (compteur du registre), `get_billing_receipt_details`
-- (fiche complète d'un reçu, source de `Recu.nombreModifications` partout
-- dans l'app), `list_billing_season_modifications` (compteur du Suivi
-- journalier, y compris R-69 « une journée est active dès qu'elle porte une
-- trace ») et `list_billing_receipt_history` (historique détaillé d'un
-- reçu, déjà élargie hier à 202608090010 pour inclure les corrections de
-- versement). Trois des quatre copies avaient été oubliées lors de cet
-- élargissement d'hier : toute correction de versement restait invisible à
-- leurs compteurs, alors que l'écriture elle-même fonctionnait — trouvé en
-- auditant le système de modification à la demande du commanditaire après
-- qu'un compteur se soit révélé faux sur un reçu réel.
--
-- Centralisation demandée explicitement plutôt qu'un quatrième correctif
-- ponctuel : une cinquième fonction qui aurait un jour besoin de cette même
-- liste l'aurait recopiée à son tour, avec le même risque d'oubli. Une seule
-- définition — `billing_receipt_modification_action_types()` — et les
-- quatre fonctions la consultent désormais au lieu de la répéter. Ajouter un
-- type demain devient un seul endroit à toucher.
--
-- Fonction simple, sans SECURITY DEFINER : elle ne lit aucune table, ne
-- renvoie qu'un tableau constant. Jamais appelée directement par le
-- navigateur (revoke all), seulement depuis l'intérieur des quatre fonctions
-- SECURITY DEFINER ci-dessous — même discipline que
-- `resolve_facturation_actor()`.
--
-- CREATE OR REPLACE pour les quatre fonctions consommatrices : signature et
-- type de retour inchangés dans les quatre cas, seul le filtre
-- `action_type in (...)` du corps change — les privilèges déjà accordés
-- sont donc conservés automatiquement, rien à re-déclarer.
--
-- Testé en BEGIN...ROLLBACK sur un reçu réel (les trois compteurs à la fois)
-- avant push (fusion.md §12, §14).

create function public.billing_receipt_modification_action_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'billing_receipt.commercial_data_updated',
    'billing_receipt.identity_updated',
    'billing_receipt.phone_updated',
    'billing_receipt.note_updated',
    'billing_receipt.dossier_updated',
    'billing_receipt.first_payment_method_corrected',
    'billing_receipt.payment_method_corrected'
  ]::text[];
$$;

comment on function public.billing_receipt_modification_action_types() is
  'Single source of truth for which facturation_action_history.action_type values count as a receipt modification — consulted by list_billing_receipts (registre counter), get_billing_receipt_details (single-receipt modification count/last-modified), list_billing_season_modifications (Suivi journalier daily counter and R-69 day-activity flag) and list_billing_receipt_history (per-receipt history list). Add a new type here, once, when a new modification-producing RPC is introduced — never repeat this list in a consuming function again.';

revoke all on function public.billing_receipt_modification_action_types()
  from public, anon, authenticated;

create or replace function public.list_billing_receipts(
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
      and history.action_type = any(public.billing_receipt_modification_action_types())
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
      and history.action_type = any(public.billing_receipt_modification_action_types())
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

create or replace function public.list_billing_season_modifications(
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
      and history.action_type = any(public.billing_receipt_modification_action_types())
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

create or replace function public.list_billing_receipt_history(
  p_receipt_id uuid
)
returns table (
  history_id uuid,
  action_type text,
  reason text,
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

  -- L'acteur doit avoir accÃ¨s au reÃ§u comme n'importe quelle autre lecture
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
    history.occurred_at,
    history.actor_slot_label_snapshot as actor_slot_label
  from public.facturation_action_history as history
  where history.entity_type = 'billing_receipt'
    and history.entity_id = p_receipt_id
    and history.action_type = any(public.billing_receipt_modification_action_types())
  order by history.occurred_at desc, history.id desc;
end;
$$;
