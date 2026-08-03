create table public.omra_dossiers (
  id uuid primary key default gen_random_uuid(),
  dossier_reference text not null,
  label text,
  note text,
  created_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint omra_dossiers_reference_check check (
    btrim(dossier_reference) <> ''
  ),
  constraint omra_dossiers_reference_unique unique (dossier_reference)
);

create table public.travelers (
  id uuid primary key default gen_random_uuid(),
  current_first_name text not null,
  current_last_name text not null,
  current_phone text,
  created_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travelers_first_name_check check (
    btrim(current_first_name) <> ''
  ),
  constraint travelers_last_name_check check (
    btrim(current_last_name) <> ''
  )
);

create table public.traveler_registrations (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null
    references public.omra_dossiers(id) on delete restrict,
  traveler_id uuid not null
    references public.travelers(id) on delete restrict,
  season_id uuid not null
    references public.omra_seasons(id) on delete restrict,
  program_id uuid not null
    references public.omra_programs(id) on delete restrict,
  hotel_id uuid not null,
  flight_id uuid not null,
  room_id uuid not null,
  rabatteur_id uuid
    references public.omra_program_rabatteurs(id) on delete restrict,
  price_id uuid
    references public.omra_program_prices(id) on delete restrict,
  catalog_price_dh integer not null,
  maximum_discount_applied_dh integer not null,
  discount_amount_dh integer not null,
  agreed_amount_dh integer not null,
  traveler_first_name_snapshot text not null,
  traveler_last_name_snapshot text not null,
  traveler_phone_snapshot text,
  season_name_snapshot text not null,
  season_code_snapshot text not null,
  hotel_name_snapshot text not null,
  flight_label_snapshot text not null,
  room_label_snapshot text not null,
  room_bed_count_snapshot smallint not null,
  rabatteur_name_snapshot text,
  registered_at timestamptz not null default now(),
  registered_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint traveler_registrations_catalog_price_check check (
    catalog_price_dh >= 0
  ),
  constraint traveler_registrations_maximum_discount_check check (
    maximum_discount_applied_dh >= 0
  ),
  constraint traveler_registrations_discount_amount_check check (
    discount_amount_dh >= 0
  ),
  constraint traveler_registrations_agreed_amount_check check (
    agreed_amount_dh >= 0
  ),
  constraint traveler_registrations_room_bed_count_check check (
    room_bed_count_snapshot > 0
  ),
  constraint traveler_registrations_first_name_snapshot_check check (
    btrim(traveler_first_name_snapshot) <> ''
  ),
  constraint traveler_registrations_last_name_snapshot_check check (
    btrim(traveler_last_name_snapshot) <> ''
  ),
  constraint traveler_registrations_season_name_snapshot_check check (
    btrim(season_name_snapshot) <> ''
  ),
  constraint traveler_registrations_hotel_name_snapshot_check check (
    btrim(hotel_name_snapshot) <> ''
  ),
  constraint traveler_registrations_flight_label_snapshot_check check (
    btrim(flight_label_snapshot) <> ''
  ),
  constraint traveler_registrations_room_label_snapshot_check check (
    btrim(room_label_snapshot) <> ''
  ),
  constraint traveler_registrations_program_hotel_fk
    foreign key (program_id, hotel_id)
    references public.omra_program_hotels(program_id, id) on delete restrict,
  constraint traveler_registrations_program_flight_fk
    foreign key (program_id, flight_id)
    references public.omra_program_flights(program_id, id) on delete restrict,
  constraint traveler_registrations_program_room_fk
    foreign key (program_id, room_id)
    references public.omra_program_rooms(program_id, id) on delete restrict
);

-- The existing schema supports composite foreign keys for hotels, flights and
-- rooms. Consistency between season_id and program_id, and between program_id
-- and the optional rabatteur_id and price_id, must be enforced by a future
-- secure transactional validation without modifying the existing tables here.

create index traveler_registrations_dossier_id_idx
  on public.traveler_registrations (dossier_id);

create index traveler_registrations_traveler_id_idx
  on public.traveler_registrations (traveler_id);

create index traveler_registrations_season_id_idx
  on public.traveler_registrations (season_id);

create index traveler_registrations_program_id_idx
  on public.traveler_registrations (program_id);

create index traveler_registrations_registered_at_idx
  on public.traveler_registrations (registered_at);

create trigger set_omra_dossiers_updated_at
before update on public.omra_dossiers
for each row execute function public.set_omra_programme_updated_at();

create trigger set_travelers_updated_at
before update on public.travelers
for each row execute function public.set_omra_programme_updated_at();

create trigger set_traveler_registrations_updated_at
before update on public.traveler_registrations
for each row execute function public.set_omra_programme_updated_at();

alter table public.omra_dossiers enable row level security;
alter table public.travelers enable row level security;
alter table public.traveler_registrations enable row level security;

revoke all on table public.omra_dossiers from public, anon, authenticated;
revoke all on table public.travelers from public, anon, authenticated;
revoke all on table public.traveler_registrations from public, anon, authenticated;

grant all on table public.omra_dossiers to service_role;
grant all on table public.travelers to service_role;
grant all on table public.traveler_registrations to service_role;
