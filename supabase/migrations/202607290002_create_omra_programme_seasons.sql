create table public.omra_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  status text not null default 'brouillon',
  has_been_used boolean not null default false,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint omra_seasons_name_check check (btrim(name) <> ''),
  constraint omra_seasons_code_check check (code is null or btrim(code) <> ''),
  constraint omra_seasons_status_check check (
    status in ('brouillon', 'active', 'archivee')
  ),
  constraint omra_seasons_usage_check check (
    status <> 'active' or has_been_used
  ),
  constraint omra_seasons_dates_check check (
    (status <> 'active' or activated_at is not null) and
    (status <> 'archivee' or archived_at is not null)
  )
);

create unique index omra_seasons_code_unique
  on public.omra_seasons (lower(btrim(code)))
  where code is not null;

create unique index omra_seasons_single_active
  on public.omra_seasons ((status))
  where status = 'active';

create table public.omra_programs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique
    references public.omra_seasons(id) on delete cascade,
  max_discount_dh integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint omra_programs_max_discount_check check (max_discount_dh >= 0)
);

create table public.omra_program_hotels (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null
    references public.omra_programs(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint omra_program_hotels_name_check check (btrim(name) <> ''),
  constraint omra_program_hotels_sort_order_check check (sort_order >= 0),
  constraint omra_program_hotels_program_id_id_unique unique (program_id, id)
);

create unique index omra_program_hotels_name_unique
  on public.omra_program_hotels (program_id, lower(btrim(name)));

create table public.omra_program_flights (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null
    references public.omra_programs(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint omra_program_flights_label_check check (btrim(label) <> ''),
  constraint omra_program_flights_sort_order_check check (sort_order >= 0),
  constraint omra_program_flights_program_id_id_unique unique (program_id, id)
);

create unique index omra_program_flights_label_unique
  on public.omra_program_flights (program_id, lower(btrim(label)));

create table public.omra_program_rooms (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null
    references public.omra_programs(id) on delete cascade,
  bed_count smallint not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint omra_program_rooms_bed_count_check check (bed_count > 0),
  constraint omra_program_rooms_sort_order_check check (sort_order >= 0),
  constraint omra_program_rooms_program_beds_unique unique (
    program_id,
    bed_count
  ),
  constraint omra_program_rooms_program_id_id_unique unique (program_id, id)
);

create table public.omra_program_rabatteurs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null
    references public.omra_programs(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint omra_program_rabatteurs_name_check check (btrim(name) <> ''),
  constraint omra_program_rabatteurs_sort_order_check check (sort_order >= 0)
);

create unique index omra_program_rabatteurs_name_unique
  on public.omra_program_rabatteurs (program_id, lower(btrim(name)));

create table public.omra_program_prices (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null
    references public.omra_programs(id) on delete cascade,
  hotel_id uuid not null,
  flight_id uuid not null,
  room_id uuid not null,
  amount_dh integer not null,
  max_discount_override_dh integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint omra_program_prices_amount_check check (amount_dh > 0),
  constraint omra_program_prices_discount_override_check check (
    max_discount_override_dh is null or max_discount_override_dh >= 0
  ),
  constraint omra_program_prices_hotel_fk foreign key (program_id, hotel_id)
    references public.omra_program_hotels(program_id, id) on delete restrict,
  constraint omra_program_prices_flight_fk foreign key (program_id, flight_id)
    references public.omra_program_flights(program_id, id) on delete restrict,
  constraint omra_program_prices_room_fk foreign key (program_id, room_id)
    references public.omra_program_rooms(program_id, id) on delete restrict,
  constraint omra_program_prices_combination_unique unique (
    program_id,
    hotel_id,
    flight_id,
    room_id
  )
);

create function public.set_omra_programme_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_omra_seasons_updated_at
before update on public.omra_seasons
for each row execute function public.set_omra_programme_updated_at();

create trigger set_omra_programs_updated_at
before update on public.omra_programs
for each row execute function public.set_omra_programme_updated_at();

create trigger set_omra_program_hotels_updated_at
before update on public.omra_program_hotels
for each row execute function public.set_omra_programme_updated_at();

create trigger set_omra_program_flights_updated_at
before update on public.omra_program_flights
for each row execute function public.set_omra_programme_updated_at();

create trigger set_omra_program_rooms_updated_at
before update on public.omra_program_rooms
for each row execute function public.set_omra_programme_updated_at();

create trigger set_omra_program_rabatteurs_updated_at
before update on public.omra_program_rabatteurs
for each row execute function public.set_omra_programme_updated_at();

create trigger set_omra_program_prices_updated_at
before update on public.omra_program_prices
for each row execute function public.set_omra_programme_updated_at();

create function public.create_omra_program_for_season()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.omra_programs (season_id) values (new.id);
  return new;
end;
$$;

create trigger create_omra_program_after_season_insert
after insert on public.omra_seasons
for each row execute function public.create_omra_program_for_season();

create function public.ensure_omra_season_has_program()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.omra_seasons where id = old.season_id
  ) and not exists (
    select 1 from public.omra_programs where season_id = old.season_id
  ) then
    raise exception 'An Omra season must have exactly one program';
  end if;

  return null;
end;
$$;

create constraint trigger ensure_omra_season_has_program_after_program_delete
after delete on public.omra_programs
deferrable initially deferred
for each row execute function public.ensure_omra_season_has_program();

create function public.protect_omra_season_deletion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'brouillon' or old.has_been_used then
    raise exception 'Only an unused draft Omra season can be deleted';
  end if;

  delete from public.omra_program_prices
  where program_id in (
    select id from public.omra_programs where season_id = old.id
  );

  return old;
end;
$$;

create trigger protect_omra_season_before_delete
before delete on public.omra_seasons
for each row execute function public.protect_omra_season_deletion();

create function public.activate_omra_season(target_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_exists boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public.activate_omra_season')
  );

  select exists (
    select 1
    from public.omra_seasons
    where id = target_season_id
  ) into target_exists;

  if not target_exists then
    raise exception 'Omra season not found';
  end if;

  update public.omra_seasons
  set
    status = 'archivee',
    archived_at = now()
  where status = 'active'
    and id <> target_season_id;

  update public.omra_seasons
  set
    status = 'active',
    has_been_used = true,
    activated_at = coalesce(activated_at, now()),
    archived_at = null
  where id = target_season_id;
end;
$$;

alter table public.omra_seasons enable row level security;
alter table public.omra_programs enable row level security;
alter table public.omra_program_hotels enable row level security;
alter table public.omra_program_flights enable row level security;
alter table public.omra_program_rooms enable row level security;
alter table public.omra_program_rabatteurs enable row level security;
alter table public.omra_program_prices enable row level security;

revoke all on table public.omra_seasons from public, anon, authenticated;
revoke all on table public.omra_programs from public, anon, authenticated;
revoke all on table public.omra_program_hotels from public, anon, authenticated;
revoke all on table public.omra_program_flights from public, anon, authenticated;
revoke all on table public.omra_program_rooms from public, anon, authenticated;
revoke all on table public.omra_program_rabatteurs from public, anon, authenticated;
revoke all on table public.omra_program_prices from public, anon, authenticated;

grant all on table public.omra_seasons to service_role;
grant all on table public.omra_programs to service_role;
grant all on table public.omra_program_hotels to service_role;
grant all on table public.omra_program_flights to service_role;
grant all on table public.omra_program_rooms to service_role;
grant all on table public.omra_program_rabatteurs to service_role;
grant all on table public.omra_program_prices to service_role;

revoke all on function public.set_omra_programme_updated_at() from public;
revoke all on function public.create_omra_program_for_season() from public;
revoke all on function public.ensure_omra_season_has_program() from public;
revoke all on function public.protect_omra_season_deletion() from public;
revoke all on function public.activate_omra_season(uuid) from public;
revoke all on function public.activate_omra_season(uuid) from anon, authenticated;
grant execute on function public.activate_omra_season(uuid) to service_role;
