create function public.create_billing_receipt_with_first_payment(
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
  on conflict (season_id) do nothing;

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

comment on function public.create_billing_receipt_with_first_payment(
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
  'Creates one seasonal receipt, its mandatory first payment, its payment operation and allocation atomically. Actor fields come only from resolve_facturation_actor(). Stable history actions are billing_receipt.created, billing_receipt.first_payment_added and payment_operation.over_allocation_confirmed.';

revoke execute on function public.create_billing_receipt_with_first_payment(
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

grant execute on function public.create_billing_receipt_with_first_payment(
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
