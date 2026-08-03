create table public.payment_operations (
  id uuid primary key default gen_random_uuid(),
  payment_mode text not null,
  usage_kind text not null,
  operation_amount_dh integer not null,
  registered_at timestamptz not null default now(),
  created_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  created_by_auth_user_id_snapshot uuid,
  created_by_slot_label_snapshot text not null,
  created_by_login_snapshot text,
  over_allocation_confirmed_at timestamptz,
  over_allocation_confirmed_by_slot_number smallint
    references public.account_slots(slot_number) on delete restrict,
  over_allocation_confirmer_label_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_operations_mode_check check (
    payment_mode in ('cash', 'cheque', 'transfer')
  ),
  constraint payment_operations_usage_kind_check check (
    usage_kind in ('unique', 'shared')
  ),
  constraint payment_operations_amount_check check (
    operation_amount_dh > 0
  ),
  constraint payment_operations_mode_usage_check check (
    (payment_mode = 'cash' and usage_kind = 'unique') or
    (
      payment_mode in ('cheque', 'transfer') and
      usage_kind in ('unique', 'shared')
    )
  ),
  constraint payment_operations_creator_slot_label_snapshot_check check (
    btrim(created_by_slot_label_snapshot) <> ''
  ),
  constraint payment_operations_over_allocation_confirmation_check check (
    (
      over_allocation_confirmed_at is null and
      over_allocation_confirmed_by_slot_number is null and
      over_allocation_confirmer_label_snapshot is null
    ) or (
      over_allocation_confirmed_at is not null and
      usage_kind = 'shared' and
      over_allocation_confirmed_by_slot_number is not null and
      over_allocation_confirmer_label_snapshot is not null and
      btrim(over_allocation_confirmer_label_snapshot) <> ''
    )
  )
);

create table public.payment_instrument_details (
  payment_operation_id uuid primary key
    references public.payment_operations(id) on delete restrict,
  instrument_reference text not null,
  bank_name text not null,
  instrument_date date not null,
  payer_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_instrument_details_reference_check check (
    btrim(instrument_reference) <> ''
  ),
  constraint payment_instrument_details_bank_name_check check (
    btrim(bank_name) <> ''
  ),
  constraint payment_instrument_details_payer_name_check check (
    btrim(payer_name) <> ''
  )
);

-- Future secure transactional functions must require instrument details for
-- every cheque or transfer and forbid them for cash operations. Once a shared
-- operation has been used, its reference, date, bank, payer and global amount
-- must remain locked.

create table public.receipt_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null
    references public.billing_receipts(id) on delete restrict,
  payment_number smallint not null,
  amount_dh integer not null,
  registered_at timestamptz not null default now(),
  created_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  created_by_auth_user_id_snapshot uuid,
  created_by_slot_label_snapshot text not null,
  created_by_login_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_payments_receipt_number_unique unique (
    receipt_id,
    payment_number
  ),
  constraint receipt_payments_number_check check (
    payment_number between 1 and 6
  ),
  constraint receipt_payments_amount_check check (
    amount_dh > 0
  ),
  constraint receipt_payments_creator_slot_label_snapshot_check check (
    btrim(created_by_slot_label_snapshot) <> ''
  )
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_operation_id uuid not null
    references public.payment_operations(id) on delete restrict,
  receipt_payment_id uuid not null
    references public.receipt_payments(id) on delete restrict,
  allocated_at timestamptz not null default now(),
  allocated_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  allocated_by_slot_label_snapshot text not null,
  allocated_by_login_snapshot text,
  created_at timestamptz not null default now(),
  constraint payment_allocations_receipt_payment_unique unique (
    receipt_payment_id
  ),
  constraint payment_allocations_allocator_slot_label_snapshot_check check (
    btrim(allocated_by_slot_label_snapshot) <> ''
  )
);

-- All writes will later pass through secure transactional PostgreSQL
-- functions. Those functions must enforce the following business rules:
-- - the first payment is mandatory when a receipt is created;
-- - payment numbers are continuous from 1 through 6 without gaps;
-- - a receipt has no more than six payments;
-- - no payment exceeds the receipt's remaining amount;
-- - the sixth payment settles the exact remaining amount;
-- - no payment can be added to a cancelled receipt;
-- - a unique operation is allocated to only one receipt payment;
-- - a shared operation can be reused across travelers and dossiers without a
--   family restriction;
-- - sharing is available only for cheques and transfers;
-- - allocations are manual;
-- - exceeding an operation's available amount requires explicit confirmation;
-- - that confirmation is recorded in facturation_action_history;
-- - allocations remain consumed after a receipt is cancelled;
-- - individual receipt payments and allocations cannot be deleted.
-- The allocated total is calculated from linked receipt_payments.amount_dh.
-- The available amount is payment_operations.operation_amount_dh minus that
-- calculated total and may be negative after explicit confirmation.

create index payment_operations_mode_registered_at_idx
  on public.payment_operations (payment_mode, registered_at);

create index payment_operations_usage_registered_at_idx
  on public.payment_operations (usage_kind, registered_at);

create index payment_operations_creator_registered_at_idx
  on public.payment_operations (created_by_slot_number, registered_at);

create index payment_operations_over_allocation_confirmed_idx
  on public.payment_operations (over_allocation_confirmed_at)
  where over_allocation_confirmed_at is not null;

create index payment_instrument_details_reference_idx
  on public.payment_instrument_details (instrument_reference);

create index payment_instrument_details_bank_name_idx
  on public.payment_instrument_details (bank_name);

create index payment_instrument_details_instrument_date_idx
  on public.payment_instrument_details (instrument_date);

create index receipt_payments_receipt_registered_at_idx
  on public.receipt_payments (receipt_id, registered_at);

create index receipt_payments_registered_at_idx
  on public.receipt_payments (registered_at);

create index receipt_payments_creator_registered_at_idx
  on public.receipt_payments (created_by_slot_number, registered_at);

create index payment_allocations_operation_allocated_at_idx
  on public.payment_allocations (payment_operation_id, allocated_at);

create index payment_allocations_allocator_allocated_at_idx
  on public.payment_allocations (allocated_by_slot_number, allocated_at);

create trigger set_payment_operations_updated_at
before update on public.payment_operations
for each row execute function public.set_omra_programme_updated_at();

create trigger set_payment_instrument_details_updated_at
before update on public.payment_instrument_details
for each row execute function public.set_omra_programme_updated_at();

create trigger set_receipt_payments_updated_at
before update on public.receipt_payments
for each row execute function public.set_omra_programme_updated_at();

alter table public.payment_operations enable row level security;
alter table public.payment_instrument_details enable row level security;
alter table public.receipt_payments enable row level security;
alter table public.payment_allocations enable row level security;

revoke all on table public.payment_operations
  from public, anon, authenticated;
revoke all on table public.payment_instrument_details
  from public, anon, authenticated;
revoke all on table public.receipt_payments
  from public, anon, authenticated;
revoke all on table public.payment_allocations
  from public, anon, authenticated;

grant all on table public.payment_operations to service_role;
grant all on table public.payment_instrument_details to service_role;
grant all on table public.receipt_payments to service_role;
grant all on table public.payment_allocations to service_role;
