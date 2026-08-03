create function public.cancel_billing_receipt(
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

  update public.billing_receipts
  set lifecycle_status = 'cancelled'
  where id = p_receipt_id
    and lifecycle_status = 'active';

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

comment on function public.cancel_billing_receipt(uuid, text, integer) is
  'Cancels one active receipt atomically without deleting or changing its payments, allocations, payment operations, instrument details, seasonal number or counter. The cancelled amount is calculated from stored receipt payments; the client supplies only the actual cash-register outflow. Actor fields come only from resolve_facturation_actor(). Stable history action: billing_receipt.cancelled.';

revoke execute on function public.cancel_billing_receipt(
  uuid,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.cancel_billing_receipt(
  uuid,
  text,
  integer
) to authenticated;
