create function public.add_billing_receipt_payment(
  p_receipt_id uuid,
  p_payment_amount_dh integer,
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
  payment_id uuid,
  payment_number smallint,
  amount_dh integer,
  payment_operation_id uuid,
  payment_mode text,
  usage_kind text,
  total_paid_after_dh bigint,
  receipt_remaining_after_dh bigint,
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
  v_receipt_number integer;
  v_receipt_lifecycle_status text;
  v_agreed_amount_dh integer;
  v_payment_count integer;
  v_min_payment_number smallint;
  v_max_payment_number smallint;
  v_next_payment_number smallint;
  v_total_paid_before_dh bigint;
  v_total_paid_after_dh bigint;
  v_receipt_remaining_before_dh bigint;
  v_receipt_remaining_after_dh bigint;
  v_payment_id uuid;
  v_payment_operation_id uuid;
  v_operation_payment_mode text;
  v_operation_usage_kind text;
  v_operation_amount_dh integer;
  v_allocated_before_dh bigint := 0;
  v_allocated_after_dh bigint;
  v_operation_available_before_dh bigint;
  v_operation_available_after_dh bigint;
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

  select
    receipt.receipt_number,
    receipt.lifecycle_status,
    registration.agreed_amount_dh
  into
    v_receipt_number,
    v_receipt_lifecycle_status,
    v_agreed_amount_dh
  from public.billing_receipts as receipt
  inner join public.traveler_registrations as registration
    on registration.id = receipt.registration_id
  where receipt.id = p_receipt_id
  for update of receipt;

  if not found then
    raise exception 'Receipt not found';
  end if;

  if v_receipt_lifecycle_status <> 'active' then
    raise exception 'Cancelled receipt cannot receive a payment';
  end if;

  if v_agreed_amount_dh <= 0 then
    raise exception 'Receipt amount is invalid';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.min(payment.payment_number),
    pg_catalog.max(payment.payment_number),
    coalesce(pg_catalog.sum(payment.amount_dh), 0)
  into
    v_payment_count,
    v_min_payment_number,
    v_max_payment_number,
    v_total_paid_before_dh
  from public.receipt_payments as payment
  where payment.receipt_id = p_receipt_id;

  if v_payment_count < 1 then
    raise exception 'Receipt first payment is missing';
  end if;

  if v_min_payment_number <> 1 or
     v_max_payment_number <> v_payment_count then
    raise exception 'Receipt payment sequence is invalid';
  end if;

  if v_payment_count >= 6 then
    raise exception 'Receipt already has six payments';
  end if;

  v_next_payment_number := (v_payment_count + 1)::smallint;

  if v_next_payment_number not between 2 and 6 then
    raise exception 'Next payment number is invalid';
  end if;

  v_receipt_remaining_before_dh :=
    v_agreed_amount_dh::bigint - v_total_paid_before_dh;

  if v_receipt_remaining_before_dh <= 0 then
    raise exception 'Receipt is already settled';
  end if;

  if p_payment_amount_dh is null or p_payment_amount_dh <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  if v_next_payment_number = 6 then
    if p_payment_amount_dh::bigint <> v_receipt_remaining_before_dh then
      raise exception 'Sixth payment must settle the receipt exactly';
    end if;
  elsif p_payment_amount_dh::bigint > v_receipt_remaining_before_dh then
    raise exception 'Payment amount exceeds receipt remainder';
  end if;

  v_total_paid_after_dh :=
    v_total_paid_before_dh + p_payment_amount_dh;
  v_receipt_remaining_after_dh :=
    v_receipt_remaining_before_dh - p_payment_amount_dh;

  if p_payment_mode is null or
     p_payment_mode not in ('cash', 'cheque', 'transfer') then
    raise exception 'Invalid payment mode';
  end if;

  if p_usage_kind is null or p_usage_kind not in ('unique', 'shared') then
    raise exception 'Invalid payment usage';
  end if;

  v_has_instrument_input :=
    p_instrument_reference is not null or
    p_bank_name is not null or
    p_instrument_date is not null or
    p_payer_name is not null;

  if p_existing_shared_operation_id is not null then
    if p_payment_mode = 'cash' then
      raise exception 'Cash cannot reuse a payment operation';
    end if;

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
      v_allocated_before_dh + p_payment_amount_dh;
    v_operation_available_before_dh :=
      v_operation_amount_dh::bigint - v_allocated_before_dh;
    v_operation_available_after_dh :=
      v_operation_amount_dh::bigint - v_allocated_after_dh;
    v_over_allocation_confirmed :=
      v_allocated_after_dh > v_operation_amount_dh::bigint;

    -- Every new allocation that leaves the operation over-allocated requires
    -- its own confirmation, regardless of any earlier confirmation.
    if v_over_allocation_confirmed and
       not coalesce(p_confirm_over_allocation, false) then
      raise exception 'Over-allocation confirmation is required';
    end if;
  else
    v_create_new_operation := true;
    v_operation_payment_mode := p_payment_mode;
    v_operation_usage_kind := p_usage_kind;
    v_allocated_after_dh := p_payment_amount_dh;

    if p_payment_mode = 'cash' then
      if p_usage_kind <> 'unique' or v_has_instrument_input then
        raise exception 'Cash payment data is incompatible';
      end if;

      if p_operation_amount_dh is not null and
         p_operation_amount_dh <> p_payment_amount_dh then
        raise exception 'Cash operation amount must equal payment';
      end if;

      v_operation_amount_dh := p_payment_amount_dh;
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
           p_operation_amount_dh <> p_payment_amount_dh then
          raise exception 'Operation amount must equal payment';
        end if;

        v_operation_amount_dh := p_payment_amount_dh;
      else
        if p_operation_amount_dh is null or p_operation_amount_dh <= 0 then
          raise exception 'Shared operation amount must be positive';
        end if;

        v_operation_amount_dh := p_operation_amount_dh;
        v_operation_available_before_dh := v_operation_amount_dh;
        v_operation_available_after_dh :=
          v_operation_amount_dh::bigint - v_allocated_after_dh;
        v_over_allocation_confirmed :=
          v_allocated_after_dh > v_operation_amount_dh::bigint;

        if v_over_allocation_confirmed and
           not coalesce(p_confirm_over_allocation, false) then
          raise exception 'Over-allocation confirmation is required';
        end if;
      end if;
    end if;
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
    p_receipt_id,
    v_next_payment_number,
    p_payment_amount_dh,
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_action_at,
    v_action_at
  )
  returning id into v_payment_id;

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
    v_payment_id,
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
  -- billing_receipt.payment_added, payment_operation.created,
  -- payment_operation.reused and
  -- payment_operation.over_allocation_confirmed.
  if v_create_new_operation then
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
      'payment_operation',
      v_payment_operation_id,
      'payment_operation.created',
      'payment',
      null,
      pg_catalog.jsonb_build_object(
        'payment_operation_id', v_payment_operation_id,
        'receipt_id', p_receipt_id,
        'receipt_number', v_receipt_number,
        'payment_id', v_payment_id,
        'payment_number', v_next_payment_number,
        'payment_amount_dh', p_payment_amount_dh,
        'payment_mode', v_operation_payment_mode,
        'usage_kind', v_operation_usage_kind,
        'operation_amount_dh', v_operation_amount_dh,
        'operation_available_before_dh',
          v_operation_available_before_dh,
        'operation_available_after_dh',
          v_operation_available_after_dh
      ),
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      v_correlation_id
    );
  else
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
      'payment_operation',
      v_payment_operation_id,
      'payment_operation.reused',
      'payment',
      pg_catalog.jsonb_build_object(
        'payment_operation_id', v_payment_operation_id,
        'allocated_total_dh', v_allocated_before_dh,
        'operation_available_dh', v_operation_available_before_dh
      ),
      pg_catalog.jsonb_build_object(
        'payment_operation_id', v_payment_operation_id,
        'receipt_id', p_receipt_id,
        'receipt_number', v_receipt_number,
        'payment_id', v_payment_id,
        'payment_number', v_next_payment_number,
        'payment_amount_dh', p_payment_amount_dh,
        'payment_mode', v_operation_payment_mode,
        'usage_kind', v_operation_usage_kind,
        'allocated_total_dh', v_allocated_after_dh,
        'operation_available_dh', v_operation_available_after_dh
      ),
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      v_correlation_id
    );
  end if;

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
    'receipt_payment',
    v_payment_id,
    'billing_receipt.payment_added',
    'payment',
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'receipt_number', v_receipt_number,
      'payment_count', v_payment_count,
      'total_paid_dh', v_total_paid_before_dh,
      'receipt_remaining_dh', v_receipt_remaining_before_dh
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'receipt_number', v_receipt_number,
      'payment_id', v_payment_id,
      'payment_number', v_next_payment_number,
      'amount_dh', p_payment_amount_dh,
      'payment_mode', v_operation_payment_mode,
      'usage_kind', v_operation_usage_kind,
      'payment_operation_id', v_payment_operation_id,
      'payment_count', v_payment_count + 1,
      'total_paid_dh', v_total_paid_after_dh,
      'receipt_remaining_dh', v_receipt_remaining_after_dh
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
      v_payment_operation_id,
      'payment_operation.over_allocation_confirmed',
      'payment',
      pg_catalog.jsonb_build_object(
        'payment_operation_id', v_payment_operation_id,
        'operation_amount_dh', v_operation_amount_dh,
        'allocated_total_dh', v_allocated_before_dh,
        'operation_available_dh', v_operation_available_before_dh
      ),
      pg_catalog.jsonb_build_object(
        'payment_operation_id', v_payment_operation_id,
        'receipt_id', p_receipt_id,
        'receipt_number', v_receipt_number,
        'payment_id', v_payment_id,
        'payment_number', v_next_payment_number,
        'allocated_amount_dh', p_payment_amount_dh,
        'allocated_total_dh', v_allocated_after_dh,
        'operation_available_dh', v_operation_available_after_dh,
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
    p_receipt_id,
    v_payment_id,
    v_next_payment_number,
    p_payment_amount_dh,
    v_payment_operation_id,
    v_operation_payment_mode,
    v_operation_usage_kind,
    v_total_paid_after_dh,
    v_receipt_remaining_after_dh,
    v_over_allocation_confirmed;
end;
$$;

comment on function public.add_billing_receipt_payment(
  uuid,
  integer,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  date,
  text,
  boolean
) is
  'Adds one server-numbered payment from 2 through 6 to an active receipt. Actor fields come only from resolve_facturation_actor(). Stable history actions are billing_receipt.payment_added, payment_operation.created, payment_operation.reused and payment_operation.over_allocation_confirmed.';

revoke execute on function public.add_billing_receipt_payment(
  uuid,
  integer,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  date,
  text,
  boolean
) from public, anon, authenticated;

grant execute on function public.add_billing_receipt_payment(
  uuid,
  integer,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  date,
  text,
  boolean
) to authenticated;
