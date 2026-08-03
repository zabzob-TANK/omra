create or replace function public.correct_billing_receipt_first_payment_method(
  p_receipt_id uuid,
  p_reason text,
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
  receipt_payment_id uuid,
  previous_payment_operation_id uuid,
  payment_operation_id uuid,
  payment_mode text,
  usage_kind text,
  payment_amount_dh integer,
  total_paid_dh bigint,
  receipt_remaining_dh bigint,
  operation_allocated_total_dh bigint,
  operation_remaining_dh bigint,
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
  v_receipt_status text;
  v_registration_id uuid;
  v_agreed_amount_dh integer;
  v_payment_id uuid;
  v_payment_amount_dh integer;
  v_total_paid_dh bigint;
  v_receipt_remaining_dh bigint;
  v_allocation_id uuid;
  v_previous_operation_id uuid;
  v_previous_mode text;
  v_previous_usage text;
  v_previous_operation_amount_dh integer;
  v_previous_reference text;
  v_previous_bank text;
  v_previous_date date;
  v_previous_payer text;
  v_previous_allocated_total_dh bigint;
  v_previous_remaining_before_dh bigint;
  v_previous_remaining_after_dh bigint;
  v_previous_evidence jsonb;
  v_operation_id uuid;
  v_operation_mode text;
  v_operation_usage text;
  v_operation_amount_dh integer;
  v_operation_reference text;
  v_operation_bank text;
  v_operation_date date;
  v_operation_payer text;
  v_allocated_before_dh bigint := 0;
  v_allocated_after_dh bigint;
  v_remaining_before_dh bigint;
  v_remaining_after_dh bigint;
  v_create_operation boolean := false;
  v_over_allocation boolean := false;
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

  if p_reason is null or pg_catalog.btrim(p_reason) = '' then
    raise exception 'Modification reason is required';
  end if;

  select
    receipt.receipt_number,
    receipt.lifecycle_status,
    receipt.registration_id
  into
    v_receipt_number,
    v_receipt_status,
    v_registration_id
  from public.billing_receipts as receipt
  where receipt.id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;

  if v_receipt_status <> 'active' then
    raise exception 'Cancelled receipt cannot be modified';
  end if;

  select registration.agreed_amount_dh
  into v_agreed_amount_dh
  from public.traveler_registrations as registration
  where registration.id = v_registration_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;

  select payment.id, payment.amount_dh
  into v_payment_id, v_payment_amount_dh
  from public.receipt_payments as payment
  where payment.receipt_id = p_receipt_id
    and payment.payment_number = 1
  for update;

  if not found then
    raise exception 'Receipt first payment is missing';
  end if;

  select
    allocation.id,
    operation.id,
    operation.payment_mode,
    operation.usage_kind,
    operation.operation_amount_dh,
    instrument.instrument_reference,
    instrument.bank_name,
    instrument.instrument_date,
    instrument.payer_name
  into
    v_allocation_id,
    v_previous_operation_id,
    v_previous_mode,
    v_previous_usage,
    v_previous_operation_amount_dh,
    v_previous_reference,
    v_previous_bank,
    v_previous_date,
    v_previous_payer
  from public.payment_allocations as allocation
  inner join public.payment_operations as operation
    on operation.id = allocation.payment_operation_id
  left join public.payment_instrument_details as instrument
    on instrument.payment_operation_id = operation.id
  where allocation.receipt_payment_id = v_payment_id
  for update of allocation, operation;

  if not found then
    raise exception 'First payment operation is missing';
  end if;

  select
    coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
  into v_total_paid_dh
  from public.receipt_payments as payment
  where payment.receipt_id = p_receipt_id;

  v_receipt_remaining_dh := case
    when v_agreed_amount_dh::bigint > v_total_paid_dh
      then v_agreed_amount_dh::bigint - v_total_paid_dh
    else 0::bigint
  end;

  select coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
  into v_previous_allocated_total_dh
  from public.payment_allocations as allocation
  inner join public.receipt_payments as payment
    on payment.id = allocation.receipt_payment_id
  where allocation.payment_operation_id = v_previous_operation_id;

  v_previous_remaining_before_dh :=
    v_previous_operation_amount_dh::bigint - v_previous_allocated_total_dh;
  v_previous_remaining_after_dh :=
    v_previous_remaining_before_dh + v_payment_amount_dh;

  select pg_catalog.jsonb_build_object(
    'id', image.id,
    'storage_bucket', image.storage_bucket,
    'storage_path', image.storage_path,
    'original_file_name', image.original_file_name,
    'mime_type', image.mime_type,
    'file_size_bytes', image.file_size_bytes,
    'file_hash', image.file_hash,
    'uploaded_at', image.uploaded_at
  )
  into v_previous_evidence
  from public.payment_supporting_images as image
  where image.payment_operation_id = v_previous_operation_id
    and image.deleted_at is null;

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
    if p_existing_shared_operation_id = v_previous_operation_id then
      raise exception 'No first payment method data changed';
    end if;

    if p_payment_mode = 'cash' then
      raise exception 'Cash cannot reuse a payment operation';
    end if;

    if p_usage_kind <> 'shared' then
      raise exception 'Existing operation must be reused as shared';
    end if;

    if p_operation_amount_dh is not null or v_has_instrument_input then
      raise exception 'Existing shared operation data cannot be changed';
    end if;

    select
      operation.payment_mode,
      operation.usage_kind,
      operation.operation_amount_dh,
      instrument.instrument_reference,
      instrument.bank_name,
      instrument.instrument_date,
      instrument.payer_name
    into
      v_operation_mode,
      v_operation_usage,
      v_operation_amount_dh,
      v_operation_reference,
      v_operation_bank,
      v_operation_date,
      v_operation_payer
    from public.payment_operations as operation
    left join public.payment_instrument_details as instrument
      on instrument.payment_operation_id = operation.id
    where operation.id = p_existing_shared_operation_id
    for update of operation;

    if not found then
      raise exception 'Shared payment operation not found';
    end if;

    if v_operation_usage <> 'shared' or
       v_operation_mode not in ('cheque', 'transfer') or
       v_operation_reference is null then
      raise exception 'Shared payment operation is incompatible';
    end if;

    if p_payment_mode <> v_operation_mode then
      raise exception 'Payment mode does not match shared operation';
    end if;

    select coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
    into v_allocated_before_dh
    from public.payment_allocations as allocation
    inner join public.receipt_payments as payment
      on payment.id = allocation.receipt_payment_id
    where allocation.payment_operation_id = p_existing_shared_operation_id;

    v_operation_id := p_existing_shared_operation_id;
    v_allocated_after_dh := v_allocated_before_dh + v_payment_amount_dh;
    v_remaining_before_dh :=
      v_operation_amount_dh::bigint - v_allocated_before_dh;
    v_remaining_after_dh :=
      v_operation_amount_dh::bigint - v_allocated_after_dh;
    v_over_allocation :=
      v_allocated_after_dh > v_operation_amount_dh::bigint;

    if v_over_allocation and
       not coalesce(p_confirm_over_allocation, false) then
      raise exception 'Over-allocation confirmation is required';
    end if;
  else
    v_create_operation := true;
    v_operation_mode := p_payment_mode;
    v_operation_usage := p_usage_kind;
    v_operation_reference := case
      when p_instrument_reference is null then null
      else pg_catalog.btrim(p_instrument_reference)
    end;
    v_operation_bank := case
      when p_bank_name is null then null
      else pg_catalog.btrim(p_bank_name)
    end;
    v_operation_date := p_instrument_date;
    v_operation_payer := case
      when p_payer_name is null then null
      else pg_catalog.btrim(p_payer_name)
    end;

    if p_payment_mode = 'cash' then
      if p_usage_kind <> 'unique' or v_has_instrument_input then
        raise exception 'Cash payment data is incompatible';
      end if;

      if p_operation_amount_dh is not null and
         p_operation_amount_dh <> v_payment_amount_dh then
        raise exception 'Cash operation amount must equal payment';
      end if;

      if v_previous_mode = 'cash' and v_previous_usage = 'unique' then
        raise exception 'No first payment method data changed';
      end if;

      v_operation_amount_dh := v_payment_amount_dh;
      v_allocated_after_dh := v_payment_amount_dh;
      v_remaining_after_dh := 0;
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
           p_operation_amount_dh <> v_payment_amount_dh then
          raise exception 'Operation amount must equal payment';
        end if;

        v_operation_amount_dh := v_payment_amount_dh;
        v_allocated_after_dh := v_payment_amount_dh;
        v_remaining_after_dh := 0;
      else
        if p_operation_amount_dh is null or p_operation_amount_dh <= 0 then
          raise exception 'Shared operation amount must be positive';
        end if;

        v_operation_amount_dh := p_operation_amount_dh;
        v_allocated_after_dh := v_payment_amount_dh;
        v_remaining_before_dh := v_operation_amount_dh;
        v_remaining_after_dh :=
          v_operation_amount_dh::bigint - v_payment_amount_dh;
        v_over_allocation :=
          v_payment_amount_dh > v_operation_amount_dh;

        if v_over_allocation and
           not coalesce(p_confirm_over_allocation, false) then
          raise exception 'Over-allocation confirmation is required';
        end if;
      end if;

      if v_previous_mode = v_operation_mode and
         v_previous_usage = v_operation_usage and
         v_previous_operation_amount_dh = v_operation_amount_dh and
         pg_catalog.btrim(coalesce(v_previous_reference, '')) =
           pg_catalog.btrim(p_instrument_reference) and
         pg_catalog.btrim(coalesce(v_previous_bank, '')) =
           pg_catalog.btrim(p_bank_name) and
         v_previous_date = p_instrument_date and
         pg_catalog.btrim(coalesce(v_previous_payer, '')) =
           pg_catalog.btrim(p_payer_name) then
        raise exception 'No first payment method data changed';
      end if;
    end if;
  end if;

  if v_create_operation then
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
      v_operation_mode,
      v_operation_usage,
      v_operation_amount_dh,
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      case when v_over_allocation then v_action_at else null end,
      case when v_over_allocation then v_actor_slot_number else null end,
      case when v_over_allocation then v_actor_slot_label else null end,
      v_action_at,
      v_action_at
    )
    returning id into v_operation_id;

    if v_operation_mode in ('cheque', 'transfer') then
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
        v_operation_id,
        pg_catalog.btrim(p_instrument_reference),
        pg_catalog.btrim(p_bank_name),
        p_instrument_date,
        pg_catalog.btrim(p_payer_name),
        v_action_at,
        v_action_at
      );
    end if;
  elsif v_over_allocation then
    update public.payment_operations as operation
    set
      over_allocation_confirmed_at = v_action_at,
      over_allocation_confirmed_by_slot_number = v_actor_slot_number,
      over_allocation_confirmer_label_snapshot = v_actor_slot_label
    where operation.id = v_operation_id;
  end if;

  update public.payment_allocations as allocation
  set payment_operation_id = v_operation_id
  where allocation.id = v_allocation_id
    and allocation.payment_operation_id = v_previous_operation_id;

  if not found then
    raise exception 'First payment operation changed concurrently';
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
    'billing_receipt',
    p_receipt_id,
    'billing_receipt.first_payment_method_corrected',
    'first_payment',
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'receipt_number', v_receipt_number,
      'payment_id', v_payment_id,
      'payment_number', 1,
      'payment_amount_dh', v_payment_amount_dh,
      'total_paid_dh', v_total_paid_dh,
      'receipt_remaining_dh', v_receipt_remaining_dh,
      'payment_operation_id', v_previous_operation_id,
      'payment_mode', v_previous_mode,
      'usage_kind', v_previous_usage,
      'operation_amount_dh', v_previous_operation_amount_dh,
      'allocated_total_dh', v_previous_allocated_total_dh,
      'operation_remaining_dh', v_previous_remaining_before_dh,
      'instrument', case
        when v_previous_mode = 'cash' then null
        else pg_catalog.jsonb_build_object(
          'reference', v_previous_reference,
          'bank_name', v_previous_bank,
          'instrument_date', v_previous_date,
          'payer_name', v_previous_payer
        )
      end,
      'active_supporting_image', v_previous_evidence
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'receipt_number', v_receipt_number,
      'payment_id', v_payment_id,
      'payment_number', 1,
      'payment_amount_dh', v_payment_amount_dh,
      'total_paid_dh', v_total_paid_dh,
      'receipt_remaining_dh', v_receipt_remaining_dh,
      'payment_operation_id', v_operation_id,
      'payment_mode', v_operation_mode,
      'usage_kind', v_operation_usage,
      'operation_amount_dh', v_operation_amount_dh,
      'allocated_total_dh', v_allocated_after_dh,
      'operation_remaining_dh', v_remaining_after_dh,
      'instrument', case
        when v_operation_mode = 'cash' then null
        else pg_catalog.jsonb_build_object(
          'reference', v_operation_reference,
          'bank_name', v_operation_bank,
          'instrument_date', v_operation_date,
          'payer_name', v_operation_payer
        )
      end,
      'over_allocation_confirmed', v_over_allocation
    ),
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

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
    v_previous_operation_id,
    'payment_operation.allocation_reassigned',
    'first_payment',
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'receipt_payment_id', v_payment_id,
      'allocated_total_dh', v_previous_allocated_total_dh,
      'operation_remaining_dh', v_previous_remaining_before_dh
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'receipt_payment_id', v_payment_id,
      'replacement_payment_operation_id', v_operation_id,
      'allocated_total_dh',
        v_previous_allocated_total_dh - v_payment_amount_dh,
      'operation_remaining_dh', v_previous_remaining_after_dh
    ),
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

  if v_create_operation then
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
      v_operation_id,
      'payment_operation.created_by_first_payment_correction',
      'first_payment',
      pg_catalog.btrim(p_reason),
      null,
      pg_catalog.jsonb_build_object(
        'receipt_id', p_receipt_id,
        'receipt_payment_id', v_payment_id,
        'payment_amount_dh', v_payment_amount_dh,
        'payment_mode', v_operation_mode,
        'usage_kind', v_operation_usage,
        'operation_amount_dh', v_operation_amount_dh,
        'allocated_total_dh', v_allocated_after_dh,
        'operation_remaining_dh', v_remaining_after_dh
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
      v_operation_id,
      'payment_operation.reused_by_first_payment_correction',
      'first_payment',
      pg_catalog.btrim(p_reason),
      pg_catalog.jsonb_build_object(
        'receipt_id', p_receipt_id,
        'allocated_total_dh', v_allocated_before_dh,
        'operation_remaining_dh', v_remaining_before_dh
      ),
      pg_catalog.jsonb_build_object(
        'receipt_id', p_receipt_id,
        'receipt_payment_id', v_payment_id,
        'payment_amount_dh', v_payment_amount_dh,
        'allocated_total_dh', v_allocated_after_dh,
        'operation_remaining_dh', v_remaining_after_dh
      ),
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      v_correlation_id
    );
  end if;

  if v_over_allocation then
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
      v_operation_id,
      'payment_operation.over_allocation_confirmed',
      'first_payment',
      pg_catalog.btrim(p_reason),
      pg_catalog.jsonb_build_object(
        'receipt_id', p_receipt_id,
        'operation_amount_dh', v_operation_amount_dh,
        'allocated_total_dh', coalesce(v_allocated_before_dh, 0),
        'operation_remaining_dh', v_remaining_before_dh
      ),
      pg_catalog.jsonb_build_object(
        'receipt_id', p_receipt_id,
        'receipt_payment_id', v_payment_id,
        'payment_amount_dh', v_payment_amount_dh,
        'allocated_total_dh', v_allocated_after_dh,
        'operation_remaining_dh', v_remaining_after_dh,
        'confirmed', true
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
    v_previous_operation_id,
    v_operation_id,
    v_operation_mode,
    v_operation_usage,
    v_payment_amount_dh,
    v_total_paid_dh,
    v_receipt_remaining_dh,
    v_allocated_after_dh,
    v_remaining_after_dh,
    v_over_allocation;
end;
$$;

comment on function public.correct_billing_receipt_first_payment_method(
  uuid,
  text,
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
  'Atomically corrects only the payment method and operation linked to payment number 1. The payment amount is not accepted as input and never changes. The previous operation and evidence remain stored, and complete before/after snapshots are appended to the Facturation history.';

revoke execute on function public.correct_billing_receipt_first_payment_method(
  uuid,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  date,
  text,
  boolean
) from public, anon;

grant execute on function public.correct_billing_receipt_first_payment_method(
  uuid,
  text,
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

create function public.list_reusable_payment_operations(
  p_payment_mode text default null
)
returns table (
  payment_operation_id uuid,
  payment_mode text,
  operation_amount_dh integer,
  allocated_total_dh bigint,
  remaining_amount_dh bigint,
  instrument_reference text,
  bank_name text,
  instrument_date date,
  payer_name text,
  registered_at timestamptz,
  has_active_supporting_image boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform actor.slot_number
  from public.resolve_facturation_actor() as actor;

  if p_payment_mode is not null and
     p_payment_mode not in ('cheque', 'transfer') then
    raise exception 'Invalid payment mode';
  end if;

  return query
  select
    operation.id,
    operation.payment_mode,
    operation.operation_amount_dh,
    coalesce(allocation.allocated_total_dh, 0)::bigint,
    operation.operation_amount_dh::bigint -
      coalesce(allocation.allocated_total_dh, 0)::bigint,
    instrument.instrument_reference,
    instrument.bank_name,
    instrument.instrument_date,
    instrument.payer_name,
    operation.registered_at,
    exists(
      select 1
      from public.payment_supporting_images as image
      where image.payment_operation_id = operation.id
        and image.deleted_at is null
    )
  from public.payment_operations as operation
  inner join public.payment_instrument_details as instrument
    on instrument.payment_operation_id = operation.id
  left join lateral (
    select coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
      as allocated_total_dh
    from public.payment_allocations as item
    inner join public.receipt_payments as payment
      on payment.id = item.receipt_payment_id
    where item.payment_operation_id = operation.id
  ) as allocation on true
  where operation.usage_kind = 'shared'
    and operation.payment_mode in ('cheque', 'transfer')
    and (
      p_payment_mode is null or
      operation.payment_mode = p_payment_mode
    )
  order by operation.registered_at desc, operation.id desc;
end;
$$;

comment on function public.list_reusable_payment_operations(text) is
  'Lists complete shared cheque and transfer operations available to authenticated Facturation users. Allocated and remaining amounts include every allocation, including allocations of cancelled receipts, without a dossier or season restriction.';

revoke execute on function public.list_reusable_payment_operations(text)
  from public, anon;

grant execute on function public.list_reusable_payment_operations(text)
  to authenticated;
