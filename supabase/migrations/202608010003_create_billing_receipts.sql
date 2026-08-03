create table public.billing_receipt_counters (
  season_id uuid primary key
    references public.omra_seasons(id) on delete restrict,
  next_number integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_receipt_counters_next_number_check check (
    next_number >= 1
  )
);

-- Future transactional receipt creation must:
-- 1. lock the counter row for the receipt season;
-- 2. read its next_number value;
-- 3. create the receipt with that number;
-- 4. increment the counter;
-- 5. perform all these steps in one transaction so a complete failure does
--    not consume a receipt number.

create table public.billing_receipts (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.traveler_registrations(id) on delete restrict,
  season_id uuid not null
    references public.omra_seasons(id) on delete restrict,
  receipt_number integer not null,
  lifecycle_status text not null default 'active',
  created_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  created_by_auth_user_id_snapshot uuid,
  created_by_slot_label_snapshot text not null,
  created_by_login_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_receipts_registration_unique unique (registration_id),
  constraint billing_receipts_season_number_unique unique (
    season_id,
    receipt_number
  ),
  constraint billing_receipts_number_check check (
    receipt_number > 0
  ),
  constraint billing_receipts_lifecycle_status_check check (
    lifecycle_status in ('active', 'cancelled')
  ),
  constraint billing_receipts_creator_slot_label_snapshot_check check (
    btrim(created_by_slot_label_snapshot) <> ''
  )
);

-- Receipt creation will later be exposed only through a secure transactional
-- PostgreSQL function. That function must also verify that season_id matches
-- the historical registration and must prevent free manual number assignment
-- from the application interface.

create index billing_receipts_lifecycle_created_at_idx
  on public.billing_receipts (lifecycle_status, created_at);

create index billing_receipts_creator_created_at_idx
  on public.billing_receipts (created_by_slot_number, created_at);

create trigger set_billing_receipt_counters_updated_at
before update on public.billing_receipt_counters
for each row execute function public.set_omra_programme_updated_at();

create trigger set_billing_receipts_updated_at
before update on public.billing_receipts
for each row execute function public.set_omra_programme_updated_at();

alter table public.billing_receipt_counters enable row level security;
alter table public.billing_receipts enable row level security;

revoke all on table public.billing_receipt_counters
  from public, anon, authenticated;
revoke all on table public.billing_receipts
  from public, anon, authenticated;

grant all on table public.billing_receipt_counters to service_role;
grant all on table public.billing_receipts to service_role;
