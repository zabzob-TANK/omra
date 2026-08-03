-- Correct only the three PL/pgSQL column ambiguities reported after deployment.
-- Function signatures, security settings, privileges, and business rules remain unchanged.

create or replace function public.create_billing_receipt_with_first_payment(
  p_registration_id uuid,
  p_first_payment_amount_dh integer,
  p_payment_mode text,
  p_usage_kind text,
  p_existing_shared_operation_id uuid default null,
  p_operation_amount_dh integer default null,
  p_instrument_reference text default null,
  p_bank_name text default null,
  p_instrument_date date default null,
  p_payer_name text default null,
  p_confirm_over_allocation boolean default false
)
returns table (
  receipt_id uuid,
  receipt_number integer,
  season_id uuid,
  first_payment_id uuid,
  payment_operation_id uuid,
  over_allocation_confirmed boolean
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
  v_season_id uuid;
  v_agreed_amount_dh integer;
  v_receipt_id uuid;
  v_receipt_number integer;
  v_first_payment_id uuid;
  v_payment_operation_id uuid;
  v_operation_payment_mode text;
  v_operation_usage_kind text;
  v_operation_amount_dh integer;
  v_allocated_before_dh bigint := 0;
  v_allocated_after_dh bigint;
  v_create_new_operation boolean := false;
  v_over_allocation_confirmed boolean := false;
  v_has_instrument_input boolean;
  v_action_at timestamptz := pg_catalog.transaction_timestamp();
  v_correlation_id uuid := pg_catalog.gen_random_uuid();
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

  if p_first_payment_amount_dh is null or p_first_payment_amount_dh <= 0 then
    raise exception 'First payment amount must be positive';
  end if;

  if p_payment_mode is null or
     p_payment_mode not in ('cash', 'cheque', 'transfer') then
    raise exception 'Invalid payment mode';
  end if;

  if p_usage_kind is null or p_usage_kind not in ('unique', 'shared') then
    raise exception 'Invalid payment usage';
  end if;

  select
    registration.season_id,
    registration.agreed_amount_dh
  into
    v_season_id,
    v_agreed_amount_dh
  from public.traveler_registrations as registration
  where registration.id = p_registration_id
  for update;

  if not found then
    raise exception 'Registration not found';
  end if;

  if exists (
    select 1
    from public.billing_receipts as existing_receipt
    where existing_receipt.registration_id = p_registration_id
  ) then
    raise exception 'Receipt already exists for this registration';
  end if;

  if v_agreed_amount_dh <= 0 then
    raise exception 'Agreed amount must be positive';
  end if;

  if p_first_payment_amount_dh > v_agreed_amount_dh then
    raise exception 'First payment exceeds agreed amount';
  end if;

  v_has_instrument_input :=
    p_instrument_reference is not null or
    p_bank_name is not null or
    p_instrument_date is not null or
    p_payer_name is not null;

  if p_existing_shared_operation_id is not null then
    if p_operation_amount_dh is not null or v_has_instrument_input then
      raise exception 'Existing shared operation data cannot be changed';
    end if;

    if p_usage_kind <> 'shared' then
      raise exception 'Existing operation must be reused as shared';
    end if;

    select
      operation.payment_mode,
      operation.usage_kind,
      operation.operation_amount_dh
    into
      v_operation_payment_mode,
      v_operation_usage_kind,
      v_operation_amount_dh
    from public.payment_operations as operation
    where operation.id = p_existing_shared_operation_id
    for update;

    if not found then
      raise exception 'Shared payment operation not found';
    end if;

    if v_operation_usage_kind <> 'shared' or
       v_operation_payment_mode not in ('cheque', 'transfer') then
      raise exception 'Shared payment operation is incompatible';
    end if;

    if p_payment_mode <> v_operation_payment_mode then
      raise exception 'Payment mode does not match shared operation';
    end if;

    if not exists (
      select 1
      from public.payment_instrument_details as instrument
      where instrument.payment_operation_id = p_existing_shared_operation_id
    ) then
      raise exception 'Shared payment operation is incomplete';
    end if;

    -- No receipt status or dossier filter is applied: cancelled allocations
    -- remain consumed and a shared operation can cross dossier boundaries.
    select coalesce(
      pg_catalog.sum(receipt_payment.amount_dh),
      0
    )
    into v_allocated_before_dh
    from public.payment_allocations as allocation
    inner join public.receipt_payments as receipt_payment
      on receipt_payment.id = allocation.receipt_payment_id
    where allocation.payment_operation_id = p_existing_shared_operation_id;

    v_payment_operation_id := p_existing_shared_operation_id;
    v_allocated_after_dh :=
      v_allocated_before_dh + p_first_payment_amount_dh;
    v_over_allocation_confirmed :=
      v_allocated_after_dh > v_operation_amount_dh::bigint;

    if v_over_allocation_confirmed and
       not coalesce(p_confirm_over_allocation, false) then
      raise exception 'Over-allocation confirmation is required';
    end if;
  else
    v_create_new_operation := true;
    v_operation_payment_mode := p_payment_mode;
    v_operation_usage_kind := p_usage_kind;
    v_allocated_after_dh := p_first_payment_amount_dh;

    if p_payment_mode = 'cash' then
      if p_usage_kind <> 'unique' or v_has_instrument_input then
        raise exception 'Cash payment data is incompatible';
      end if;

      if p_operation_amount_dh is not null and
         p_operation_amount_dh <> p_first_payment_amount_dh then
        raise exception 'Cash operation amount must equal first payment';
      end if;

      v_operation_amount_dh := p_first_payment_amount_dh;
    else
      if p_instrument_reference is null or
         pg_catalog.btrim(p_instrument_reference) = '' or
         p_bank_name is null or
         pg_catalog.btrim(p_bank_name) = '' or
         p_instrument_date is null or
         p_payer_name is null or
         pg_catalog.btrim(p_payer_name) = '' then
        raise exception 'Bank instrument details are required';
      end if;

      if p_usage_kind = 'unique' then
        if p_operation_amount_dh is not null and
           p_operation_amount_dh <> p_first_payment_amount_dh then
          raise exception 'Operation amount must equal first payment';
        end if;

        v_operation_amount_dh := p_first_payment_amount_dh;
      else
        if p_operation_amount_dh is null or p_operation_amount_dh <= 0 then
          raise exception 'Shared operation amount must be positive';
        end if;

        v_operation_amount_dh := p_operation_amount_dh;
        v_over_allocation_confirmed :=
          v_allocated_after_dh > v_operation_amount_dh::bigint;

        if v_over_allocation_confirmed and
           not coalesce(p_confirm_over_allocation, false) then
          raise exception 'Over-allocation confirmation is required';
        end if;
      end if;
    end if;
  end if;

  insert into public.billing_receipt_counters (
    season_id,
    next_number,
    created_at,
    updated_at
  )
  values (
    v_season_id,
    1,
    v_action_at,
    v_action_at
  )
  -- PostgreSQL conflict targets cannot use a qualified column name; the
  -- named primary-key constraint unambiguously targets billing_receipt_counters.season_id.
  on conflict on constraint billing_receipt_counters_pkey do nothing;

  select counter.next_number
  into strict v_receipt_number
  from public.billing_receipt_counters as counter
  where counter.season_id = v_season_id
  for update;

  if v_receipt_number < 1 then
    raise exception 'Receipt numbering is unavailable';
  end if;

  insert into public.billing_receipts (
    registration_id,
    season_id,
    receipt_number,
    lifecycle_status,
    created_by_slot_number,
    created_by_auth_user_id_snapshot,
    created_by_slot_label_snapshot,
    created_by_login_snapshot,
    created_at,
    updated_at
  )
  values (
    p_registration_id,
    v_season_id,
    v_receipt_number,
    'active',
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_action_at,
    v_action_at
  )
  returning id into v_receipt_id;

  update public.billing_receipt_counters
  set next_number = v_receipt_number + 1
  where season_id = v_season_id;

  if not found then
    raise exception 'Receipt numbering is unavailable';
  end if;

  if v_create_new_operation then
    insert into public.payment_operations (
      payment_mode,
      usage_kind,
      operation_amount_dh,
      registered_at,
      created_by_slot_number,
      created_by_auth_user_id_snapshot,
      created_by_slot_label_snapshot,
      created_by_login_snapshot,
      over_allocation_confirmed_at,
      over_allocation_confirmed_by_slot_number,
      over_allocation_confirmer_label_snapshot,
      created_at,
      updated_at
    )
    values (
      v_operation_payment_mode,
      v_operation_usage_kind,
      v_operation_amount_dh,
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      case when v_over_allocation_confirmed then v_action_at else null end,
      case
        when v_over_allocation_confirmed then v_actor_slot_number
        else null
      end,
      case
        when v_over_allocation_confirmed then v_actor_slot_label
        else null
      end,
      v_action_at,
      v_action_at
    )
    returning id into v_payment_operation_id;

    if v_operation_payment_mode in ('cheque', 'transfer') then
      insert into public.payment_instrument_details (
        payment_operation_id,
        instrument_reference,
        bank_name,
        instrument_date,
        payer_name,
        created_at,
        updated_at
      )
      values (
        v_payment_operation_id,
        p_instrument_reference,
        p_bank_name,
        p_instrument_date,
        p_payer_name,
        v_action_at,
        v_action_at
      );
    end if;
  end if;

  insert into public.receipt_payments (
    receipt_id,
    payment_number,
    amount_dh,
    registered_at,
    created_by_slot_number,
    created_by_auth_user_id_snapshot,
    created_by_slot_label_snapshot,
    created_by_login_snapshot,
    created_at,
    updated_at
  )
  values (
    v_receipt_id,
    1,
    p_first_payment_amount_dh,
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_action_at,
    v_action_at
  )
  returning id into v_first_payment_id;

  insert into public.payment_allocations (
    payment_operation_id,
    receipt_payment_id,
    allocated_at,
    allocated_by_slot_number,
    allocated_by_slot_label_snapshot,
    allocated_by_login_snapshot,
    created_at
  )
  values (
    v_payment_operation_id,
    v_first_payment_id,
    v_action_at,
    v_actor_slot_number,
    v_actor_slot_label,
    v_actor_login,
    v_action_at
  );

  if not v_create_new_operation and v_over_allocation_confirmed then
    update public.payment_operations
    set
      over_allocation_confirmed_at = v_action_at,
      over_allocation_confirmed_by_slot_number = v_actor_slot_number,
      over_allocation_confirmer_label_snapshot = v_actor_slot_label
    where id = v_payment_operation_id;

    if not found then
      raise exception 'Shared payment operation is unavailable';
    end if;
  end if;

  -- Stable action types emitted by this RPC:
  -- billing_receipt.created, billing_receipt.first_payment_added and
  -- payment_operation.over_allocation_confirmed.
  insert into public.facturation_action_history (
    entity_type,
    entity_id,
    action_type,
    section_code,
    after_data,
    occurred_at,
    actor_slot_number,
    actor_auth_user_id_snapshot,
    actor_slot_label_snapshot,
    actor_login_snapshot,
    correlation_id
  )
  values
  (
    'billing_receipt',
    v_receipt_id,
    'billing_receipt.created',
    'receipt',
    pg_catalog.jsonb_build_object(
      'receipt_id', v_receipt_id,
      'registration_id', p_registration_id,
      'season_id', v_season_id,
      'receipt_number', v_receipt_number,
      'lifecycle_status', 'active'
    ),
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  ),
  (
    'receipt_payment',
    v_first_payment_id,
    'billing_receipt.first_payment_added',
    'payment',
    pg_catalog.jsonb_build_object(
      'receipt_id', v_receipt_id,
      'payment_id', v_first_payment_id,
      'payment_number', 1,
      'amount_dh', p_first_payment_amount_dh,
      'payment_operation_id', v_payment_operation_id,
      'payment_mode', v_operation_payment_mode,
      'usage_kind', v_operation_usage_kind
    ),
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

  if v_over_allocation_confirmed then
    insert into public.facturation_action_history (
      entity_type,
      entity_id,
      action_type,
      section_code,
      after_data,
      occurred_at,
      actor_slot_number,
      actor_auth_user_id_snapshot,
      actor_slot_label_snapshot,
      actor_login_snapshot,
      correlation_id
    )
    values (
      'payment_operation',
      v_payment_operation_id,
      'payment_operation.over_allocation_confirmed',
      'payment',
      pg_catalog.jsonb_build_object(
        'payment_operation_id', v_payment_operation_id,
        'receipt_id', v_receipt_id,
        'operation_amount_dh', v_operation_amount_dh,
        'allocated_before_dh', v_allocated_before_dh,
        'allocated_amount_dh', p_first_payment_amount_dh,
        'allocated_after_dh', v_allocated_after_dh,
        'remaining_amount_dh',
          v_operation_amount_dh::bigint - v_allocated_after_dh,
        'confirmation', true
      ),
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      v_correlation_id
    );
  end if;

  return query
  select
    v_receipt_id,
    v_receipt_number,
    v_season_id,
    v_first_payment_id,
    v_payment_operation_id,
    v_over_allocation_confirmed;
end;
$$;

create or replace function public.cancel_billing_receipt(
  p_receipt_id uuid,
  p_reason text,
  p_cash_outflow_amount_dh integer
)
returns table (
  receipt_id uuid,
  season_id uuid,
  receipt_number integer,
  lifecycle_status text,
  payment_count integer,
  total_paid_dh integer,
  cancelled_amount_dh integer,
  cash_outflow_amount_dh integer,
  cancelled_at timestamptz
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
  v_registration_id uuid;
  v_receipt_season_id uuid;
  v_registration_season_id uuid;
  v_receipt_number integer;
  v_receipt_lifecycle_status text;
  v_agreed_amount_dh integer;
  v_payment_count integer;
  v_total_paid_sum_dh bigint;
  v_total_paid_dh integer;
  v_restitution_route text;
  v_cancellation_id uuid;
  v_cancelled_at timestamptz := pg_catalog.transaction_timestamp();
  v_correlation_id uuid := pg_catalog.gen_random_uuid();
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

  select
    receipt.registration_id,
    receipt.season_id,
    receipt.receipt_number,
    receipt.lifecycle_status
  into
    v_registration_id,
    v_receipt_season_id,
    v_receipt_number,
    v_receipt_lifecycle_status
  from public.billing_receipts as receipt
  where receipt.id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;

  if v_receipt_lifecycle_status = 'cancelled' then
    raise exception 'Receipt is already cancelled';
  end if;

  if v_receipt_lifecycle_status <> 'active' then
    raise exception 'Receipt state is incompatible with cancellation';
  end if;

  if exists (
    select 1
    from public.receipt_cancellations as existing_cancellation
    where existing_cancellation.receipt_id = p_receipt_id
  ) then
    raise exception 'Receipt is already cancelled';
  end if;

  select
    registration.season_id,
    registration.agreed_amount_dh
  into
    v_registration_season_id,
    v_agreed_amount_dh
  from public.traveler_registrations as registration
  where registration.id = v_registration_id
  for share;

  if not found or
     v_registration_season_id is distinct from v_receipt_season_id or
     v_agreed_amount_dh <= 0 then
    raise exception 'Receipt registration is missing or inconsistent';
  end if;

  if p_reason is null or pg_catalog.btrim(p_reason) = '' then
    raise exception 'Cancellation reason is required';
  end if;

  if p_cash_outflow_amount_dh is null or p_cash_outflow_amount_dh < 0 then
    raise exception 'Cash outflow amount must be zero or positive';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(payment.amount_dh), 0)
  into
    v_payment_count,
    v_total_paid_sum_dh
  from public.receipt_payments as payment
  where payment.receipt_id = p_receipt_id;

  if v_payment_count < 1 or v_total_paid_sum_dh <= 0 then
    raise exception 'Receipt has no payment to cancel';
  end if;

  if v_total_paid_sum_dh > 2147483647 then
    raise exception 'Receipt payment total is incompatible';
  end if;

  v_total_paid_dh := v_total_paid_sum_dh::integer;

  if p_cash_outflow_amount_dh > v_total_paid_dh then
    raise exception 'Cash outflow amount exceeds total paid';
  end if;

  v_restitution_route := case
    when p_cash_outflow_amount_dh > 0 then 'cash_register'
    else 'outside_register'
  end;

  insert into public.receipt_cancellations (
    receipt_id,
    restitution_route,
    total_paid_at_cancellation_dh,
    reason,
    cancelled_at,
    cancelled_by_slot_number,
    cancelled_by_auth_user_id_snapshot,
    cancelled_by_slot_label_snapshot,
    cancelled_by_login_snapshot,
    created_at
  )
  values (
    p_receipt_id,
    v_restitution_route,
    v_total_paid_dh,
    p_reason,
    v_cancelled_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_cancelled_at
  )
  returning id into v_cancellation_id;

  update public.billing_receipts as receipt
  set lifecycle_status = 'cancelled'
  where receipt.id = p_receipt_id
    and receipt.lifecycle_status = 'active';

  if not found then
    raise exception 'Receipt state changed during cancellation';
  end if;

  -- This movement records the actual cash outflow, which may be lower than
  -- the cancelled total. A zero outflow is represented by no movement row.
  if p_cash_outflow_amount_dh > 0 then
    insert into public.cash_register_movements (
      cancellation_id,
      movement_kind,
      amount_dh,
      occurred_at,
      created_by_slot_number,
      created_by_auth_user_id_snapshot,
      created_by_slot_label_snapshot,
      created_by_login_snapshot,
      created_at
    )
    values (
      v_cancellation_id,
      'cancellation_refund_outflow',
      -p_cash_outflow_amount_dh,
      v_cancelled_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      v_cancelled_at
    );
  end if;

  -- Payments, allocations, payment operations, instrument details, receipt
  -- numbering and seasonal counters are deliberately left unchanged.
  insert into public.facturation_action_history (
    entity_type,
    entity_id,
    action_type,
    section_code,
    reason,
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
    'billing_receipt.cancelled',
    'receipt',
    p_reason,
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'season_id', v_receipt_season_id,
      'receipt_number', v_receipt_number,
      'lifecycle_status', v_receipt_lifecycle_status,
      'agreed_amount_dh', v_agreed_amount_dh,
      'payment_count', v_payment_count,
      'total_paid_dh', v_total_paid_dh
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'cancellation_id', v_cancellation_id,
      'season_id', v_receipt_season_id,
      'receipt_number', v_receipt_number,
      'lifecycle_status', 'cancelled',
      'agreed_amount_dh', v_agreed_amount_dh,
      'payment_count', v_payment_count,
      'total_paid_dh', v_total_paid_dh,
      'cancelled_amount_dh', v_total_paid_dh,
      'cash_outflow_amount_dh', p_cash_outflow_amount_dh,
      'restitution_route', v_restitution_route,
      'reason', p_reason,
      'cancelled_at', v_cancelled_at
    ),
    v_cancelled_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

  return query
  select
    p_receipt_id,
    v_receipt_season_id,
    v_receipt_number,
    'cancelled'::text,
    v_payment_count,
    v_total_paid_dh,
    v_total_paid_dh,
    p_cash_outflow_amount_dh,
    v_cancelled_at;
end;
$$;

create or replace function public.delete_payment_operation_evidence_image(
  p_operation_id uuid,
  p_reason text
)
returns table (
  evidence_id uuid,
  operation_id uuid,
  storage_bucket text,
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  file_hash text,
  deleted_at timestamptz
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
  v_payment_mode text;
  v_usage_kind text;
  v_evidence_id uuid;
  v_storage_bucket text;
  v_storage_path text;
  v_original_file_name text;
  v_mime_type text;
  v_file_size_bytes bigint;
  v_file_hash text;
  v_uploaded_at timestamptz;
  v_reason text;
  v_action_at timestamptz := pg_catalog.transaction_timestamp();
  v_correlation_id uuid := pg_catalog.gen_random_uuid();
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
  from public.require_facturation_admin() as actor;

  v_reason := pg_catalog.btrim(p_reason);

  if p_reason is null or v_reason = '' then
    raise exception 'Evidence image deletion reason is required';
  end if;

  select
    operation.payment_mode,
    operation.usage_kind
  into
    v_payment_mode,
    v_usage_kind
  from public.payment_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'Payment operation not found';
  end if;

  select
    image.id,
    image.storage_bucket,
    image.storage_path,
    image.original_file_name,
    image.mime_type,
    image.file_size_bytes,
    image.file_hash,
    image.uploaded_at
  into
    v_evidence_id,
    v_storage_bucket,
    v_storage_path,
    v_original_file_name,
    v_mime_type,
    v_file_size_bytes,
    v_file_hash,
    v_uploaded_at
  from public.payment_supporting_images as image
  where image.payment_operation_id = p_operation_id
    and image.deleted_at is null
  for update;

  if not found then
    raise exception 'Active evidence image not found';
  end if;

  update public.payment_supporting_images as image
  set
    deleted_at = v_action_at,
    deleted_by_slot_number = v_actor_slot_number,
    deleted_by_auth_user_id_snapshot = v_actor_auth_user_id,
    deleted_by_slot_label_snapshot = v_actor_slot_label,
    deleted_by_login_snapshot = v_actor_login,
    deletion_reason = v_reason
  where image.id = v_evidence_id
    and image.deleted_at is null;

  if not found then
    raise exception 'Active evidence image is unavailable';
  end if;

  insert into public.facturation_action_history (
    entity_type,
    entity_id,
    action_type,
    section_code,
    reason,
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
    'payment_operation',
    p_operation_id,
    'payment_operation.evidence_deleted',
    'supporting_image',
    v_reason,
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'payment_mode', v_payment_mode,
      'usage_kind', v_usage_kind,
      'evidence_id', v_evidence_id,
      'storage_bucket', v_storage_bucket,
      'storage_path', v_storage_path,
      'mime_type', v_mime_type,
      'file_size_bytes', v_file_size_bytes,
      'file_hash', v_file_hash,
      'active', true,
      'uploaded_at', v_uploaded_at
    ),
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'payment_mode', v_payment_mode,
      'usage_kind', v_usage_kind,
      'evidence_id', v_evidence_id,
      'storage_bucket', v_storage_bucket,
      'storage_path', v_storage_path,
      'mime_type', v_mime_type,
      'file_size_bytes', v_file_size_bytes,
      'file_hash', v_file_hash,
      'active', false,
      'deleted_at', v_action_at,
      'deletion_reason', v_reason
    ),
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

  return query
  select
    v_evidence_id,
    p_operation_id,
    v_storage_bucket,
    v_storage_path,
    v_original_file_name,
    v_mime_type,
    v_file_size_bytes,
    v_file_hash,
    v_action_at;
end;
$$;
