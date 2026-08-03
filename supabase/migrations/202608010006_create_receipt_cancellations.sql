create table public.receipt_cancellations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null
    references public.billing_receipts(id) on delete restrict,
  restitution_route text not null,
  total_paid_at_cancellation_dh integer not null,
  reason text not null,
  cancelled_at timestamptz not null default now(),
  cancelled_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  cancelled_by_auth_user_id_snapshot uuid,
  cancelled_by_slot_label_snapshot text not null,
  cancelled_by_login_snapshot text,
  created_at timestamptz not null default now(),
  constraint receipt_cancellations_receipt_unique unique (receipt_id),
  constraint receipt_cancellations_restitution_route_check check (
    restitution_route in ('cash_register', 'outside_register')
  ),
  constraint receipt_cancellations_total_paid_check check (
    total_paid_at_cancellation_dh > 0
  ),
  constraint receipt_cancellations_reason_check check (
    btrim(reason) <> ''
  ),
  constraint receipt_cancellations_canceller_slot_label_snapshot_check check (
    btrim(cancelled_by_slot_label_snapshot) <> ''
  )
);

create table public.cash_register_movements (
  id uuid primary key default gen_random_uuid(),
  cancellation_id uuid not null
    references public.receipt_cancellations(id) on delete restrict,
  movement_kind text not null,
  amount_dh integer not null,
  occurred_at timestamptz not null default now(),
  created_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  created_by_auth_user_id_snapshot uuid,
  created_by_slot_label_snapshot text not null,
  created_by_login_snapshot text,
  created_at timestamptz not null default now(),
  constraint cash_register_movements_cancellation_unique unique (
    cancellation_id
  ),
  constraint cash_register_movements_kind_check check (
    movement_kind = 'cancellation_refund_outflow'
  ),
  constraint cash_register_movements_amount_check check (
    amount_dh < 0
  ),
  constraint cash_register_movements_creator_slot_label_snapshot_check check (
    btrim(created_by_slot_label_snapshot) <> ''
  )
);

-- The future secure cancellation function must perform these steps in one
-- transaction:
-- 1. lock the receipt;
-- 2. verify that it has not already been cancelled;
-- 3. calculate the exact total of its receipt payments;
-- 4. reject any cancellation amount supplied manually by the interface;
-- 5. create receipt_cancellations with that historical total;
-- 6. set billing_receipts.lifecycle_status to cancelled;
-- 7. create a negative cash_register_movements row only when restitution_route
--    is cash_register;
-- 8. ensure that the negative movement is exactly the opposite of
--    total_paid_at_cancellation_dh;
-- 9. neither modify nor delete any payment, allocation or bank operation;
-- 10. create the corresponding events in facturation_action_history.
-- The original cash, cheque or transfer payment modes do not influence the
-- restitution route. An outside_register restitution keeps the cancelled
-- amount but creates no cash-register outflow. Allocations of shared operations
-- remain counted after cancellation.
-- These historical records must not be deleted or corrected directly from the
-- application interface; later writes will use the secure transactional
-- function only.

create index receipt_cancellations_cancelled_at_idx
  on public.receipt_cancellations (cancelled_at);

create index receipt_cancellations_route_cancelled_at_idx
  on public.receipt_cancellations (restitution_route, cancelled_at);

create index receipt_cancellations_canceller_cancelled_at_idx
  on public.receipt_cancellations (cancelled_by_slot_number, cancelled_at);

create index cash_register_movements_occurred_at_idx
  on public.cash_register_movements (occurred_at);

create index cash_register_movements_kind_occurred_at_idx
  on public.cash_register_movements (movement_kind, occurred_at);

create index cash_register_movements_creator_occurred_at_idx
  on public.cash_register_movements (created_by_slot_number, occurred_at);

alter table public.receipt_cancellations enable row level security;
alter table public.cash_register_movements enable row level security;

revoke all on table public.receipt_cancellations
  from public, anon, authenticated;
revoke all on table public.cash_register_movements
  from public, anon, authenticated;

grant all on table public.receipt_cancellations to service_role;
grant all on table public.cash_register_movements to service_role;
