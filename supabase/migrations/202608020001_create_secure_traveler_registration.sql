create function public.create_facturation_traveler_registration(
  p_season_id uuid,
  p_program_id uuid,
  p_hotel_id uuid,
  p_flight_id uuid,
  p_room_id uuid,
  p_discount_amount_dh integer,
  p_existing_dossier_id uuid default null,
  p_new_dossier_reference text default null,
  p_new_dossier_label text default null,
  p_new_dossier_note text default null,
  p_existing_traveler_id uuid default null,
  p_new_traveler_first_name text default null,
  p_new_traveler_last_name text default null,
  p_new_traveler_phone text default null,
  p_rabatteur_id uuid default null,
  p_registration_note text default null
)
returns table (
  registration_id uuid,
  dossier_id uuid,
  traveler_id uuid,
  season_id uuid,
  program_id uuid,
  price_id uuid,
  catalog_price_dh integer,
  maximum_discount_applied_dh integer,
  discount_amount_dh integer,
  agreed_amount_dh integer,
  registered_at timestamptz
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
  v_program_season_id uuid;
  v_program_maximum_discount_dh integer;
  v_season_name text;
  v_season_code text;
  v_hotel_name text;
  v_flight_label text;
  v_room_label text;
  v_room_bed_count smallint;
  v_rabatteur_name text;
  v_price_id uuid;
  v_catalog_price_dh integer;
  v_price_maximum_discount_dh integer;
  v_maximum_discount_dh integer;
  v_agreed_amount_dh integer;
  v_dossier_id uuid;
  v_traveler_id uuid;
  v_registration_id uuid := pg_catalog.gen_random_uuid();
  v_dossier_reference text;
  v_dossier_label text;
  v_dossier_note text;
  v_traveler_first_name text;
  v_traveler_last_name text;
  v_traveler_phone text;
  v_registration_note text;
  v_action_at timestamptz := pg_catalog.transaction_timestamp();
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
    program.season_id,
    program.max_discount_dh
  into
    v_program_season_id,
    v_program_maximum_discount_dh
  from public.omra_programs as program
  where program.id = p_program_id
  for share;

  if not found or v_program_season_id is distinct from p_season_id then
    raise exception 'Program selection is incompatible with receipt season';
  end if;

  select
    season.name,
    coalesce(season.code, '')
  into
    v_season_name,
    v_season_code
  from public.omra_seasons as season
  where season.id = p_season_id
  for share;

  if not found then
    raise exception 'Season not found';
  end if;

  select hotel.name
  into v_hotel_name
  from public.omra_program_hotels as hotel
  where hotel.id = p_hotel_id
    and hotel.program_id = p_program_id
  for share;

  if not found then
    raise exception 'Hotel selection is incompatible with receipt program';
  end if;

  select flight.label
  into v_flight_label
  from public.omra_program_flights as flight
  where flight.id = p_flight_id
    and flight.program_id = p_program_id
  for share;

  if not found then
    raise exception 'Flight selection is incompatible with receipt program';
  end if;

  select
    room.bed_count::text,
    room.bed_count
  into
    v_room_label,
    v_room_bed_count
  from public.omra_program_rooms as room
  where room.id = p_room_id
    and room.program_id = p_program_id
  for share;

  if not found then
    raise exception 'Room selection is incompatible with receipt program';
  end if;

  select
    price.id,
    price.amount_dh,
    price.max_discount_override_dh
  into
    v_price_id,
    v_catalog_price_dh,
    v_price_maximum_discount_dh
  from public.omra_program_prices as price
  where price.program_id = p_program_id
    and price.hotel_id = p_hotel_id
    and price.flight_id = p_flight_id
    and price.room_id = p_room_id
  for share;

  if not found then
    raise exception 'Tariff cannot be determined for selected combination';
  end if;

  v_maximum_discount_dh := coalesce(
    v_price_maximum_discount_dh,
    v_program_maximum_discount_dh
  );

  if p_discount_amount_dh is null or p_discount_amount_dh < 0 then
    raise exception 'Discount amount is invalid';
  end if;

  if p_discount_amount_dh > v_maximum_discount_dh then
    raise exception 'Discount exceeds applicable maximum';
  end if;

  if p_discount_amount_dh >= v_catalog_price_dh then
    raise exception 'Discount must be lower than catalog price';
  end if;

  v_agreed_amount_dh := v_catalog_price_dh - p_discount_amount_dh;

  if p_rabatteur_id is not null then
    select rabatteur.name
    into v_rabatteur_name
    from public.omra_program_rabatteurs as rabatteur
    where rabatteur.id = p_rabatteur_id
      and rabatteur.program_id = p_program_id
    for share;

    if not found then
      raise exception 'Referrer selection is incompatible with receipt program';
    end if;
  end if;

  if p_existing_dossier_id is not null then
    if p_new_dossier_reference is not null or
       p_new_dossier_label is not null or
       p_new_dossier_note is not null then
      raise exception 'Existing dossier data cannot be changed during registration';
    end if;

    select dossier.id
    into v_dossier_id
    from public.omra_dossiers as dossier
    where dossier.id = p_existing_dossier_id
    for share;

    if not found then
      raise exception 'Dossier not found';
    end if;
  else
    v_dossier_reference := pg_catalog.btrim(p_new_dossier_reference);
    v_dossier_label := nullif(pg_catalog.btrim(p_new_dossier_label), '');
    v_dossier_note := nullif(pg_catalog.btrim(p_new_dossier_note), '');

    if p_new_dossier_reference is null or v_dossier_reference = '' then
      raise exception 'Dossier reference is required';
    end if;

    v_dossier_id := pg_catalog.gen_random_uuid();

    insert into public.omra_dossiers (
      id,
      dossier_reference,
      label,
      note,
      created_by_slot_number,
      created_at,
      updated_at
    )
    values (
      v_dossier_id,
      v_dossier_reference,
      v_dossier_label,
      v_dossier_note,
      v_actor_slot_number,
      v_action_at,
      v_action_at
    );
  end if;

  if p_existing_traveler_id is not null then
    if p_new_traveler_first_name is not null or
       p_new_traveler_last_name is not null or
       p_new_traveler_phone is not null then
      raise exception 'Existing traveler data cannot be changed during registration';
    end if;

    select
      traveler.id,
      traveler.current_first_name,
      traveler.current_last_name,
      traveler.current_phone
    into
      v_traveler_id,
      v_traveler_first_name,
      v_traveler_last_name,
      v_traveler_phone
    from public.travelers as traveler
    where traveler.id = p_existing_traveler_id
    for share;

    if not found then
      raise exception 'Traveler not found';
    end if;
  else
    v_traveler_first_name := pg_catalog.btrim(p_new_traveler_first_name);
    v_traveler_last_name := pg_catalog.btrim(p_new_traveler_last_name);
    v_traveler_phone := nullif(pg_catalog.btrim(p_new_traveler_phone), '');

    if p_new_traveler_first_name is null or v_traveler_first_name = '' then
      raise exception 'Traveler first name is required';
    end if;

    if p_new_traveler_last_name is null or v_traveler_last_name = '' then
      raise exception 'Traveler last name is required';
    end if;

    v_traveler_id := pg_catalog.gen_random_uuid();

    insert into public.travelers (
      id,
      current_first_name,
      current_last_name,
      current_phone,
      created_by_slot_number,
      created_at,
      updated_at
    )
    values (
      v_traveler_id,
      v_traveler_first_name,
      v_traveler_last_name,
      v_traveler_phone,
      v_actor_slot_number,
      v_action_at,
      v_action_at
    );
  end if;

  v_registration_note := nullif(
    pg_catalog.btrim(p_registration_note),
    ''
  );

  insert into public.traveler_registrations (
    id,
    dossier_id,
    traveler_id,
    season_id,
    program_id,
    hotel_id,
    flight_id,
    room_id,
    rabatteur_id,
    price_id,
    catalog_price_dh,
    maximum_discount_applied_dh,
    discount_amount_dh,
    agreed_amount_dh,
    traveler_first_name_snapshot,
    traveler_last_name_snapshot,
    traveler_phone_snapshot,
    season_name_snapshot,
    season_code_snapshot,
    hotel_name_snapshot,
    flight_label_snapshot,
    room_label_snapshot,
    room_bed_count_snapshot,
    rabatteur_name_snapshot,
    registered_at,
    registered_by_slot_number,
    note,
    created_at,
    updated_at
  )
  values (
    v_registration_id,
    v_dossier_id,
    v_traveler_id,
    p_season_id,
    p_program_id,
    p_hotel_id,
    p_flight_id,
    p_room_id,
    p_rabatteur_id,
    v_price_id,
    v_catalog_price_dh,
    v_maximum_discount_dh,
    p_discount_amount_dh,
    v_agreed_amount_dh,
    v_traveler_first_name,
    v_traveler_last_name,
    v_traveler_phone,
    v_season_name,
    v_season_code,
    v_hotel_name,
    v_flight_label,
    v_room_label,
    v_room_bed_count,
    v_rabatteur_name,
    v_action_at,
    v_actor_slot_number,
    v_registration_note,
    v_action_at,
    v_action_at
  );

  return query
  select
    v_registration_id,
    v_dossier_id,
    v_traveler_id,
    p_season_id,
    p_program_id,
    v_price_id,
    v_catalog_price_dh,
    v_maximum_discount_dh,
    p_discount_amount_dh,
    v_agreed_amount_dh,
    v_action_at;
end;
$$;

comment on function public.create_facturation_traveler_registration(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  uuid,
  text
) is
  'Creates one Facturation traveler registration atomically, optionally reusing an existing dossier and/or traveler. Programme selections, price, maximum discount, agreed amount and historical snapshots are resolved server-side. Actor identity comes only from resolve_facturation_actor(); no actor or role parameter is accepted.';

revoke execute on function public.create_facturation_traveler_registration(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  uuid,
  text
) from public, anon;

grant execute on function public.create_facturation_traveler_registration(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  uuid,
  text
) to authenticated;
