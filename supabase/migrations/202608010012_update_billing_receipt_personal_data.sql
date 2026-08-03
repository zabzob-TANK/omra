create function public.update_billing_receipt_personal_data(
  p_receipt_id uuid,
  p_section_code text,
  p_new_first_name text,
  p_new_last_name text,
  p_new_phone text,
  p_new_note text,
  p_reason text
)
returns table (
  receipt_id uuid,
  registration_id uuid,
  receipt_number integer,
  section_code text,
  new_first_name text,
  new_last_name text,
  new_phone text,
  new_note text,
  modified_at timestamptz,
  modification_recorded boolean
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
  v_receipt_number integer;
  v_receipt_lifecycle_status text;
  v_registration_season_id uuid;
  v_old_first_name text;
  v_old_last_name text;
  v_old_phone text;
  v_old_note text;
  v_old_note_normalized text;
  v_new_first_name text;
  v_new_last_name text;
  v_new_phone text;
  v_new_note text;
  v_action_type text;
  v_before_data jsonb;
  v_after_data jsonb;
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

  if p_section_code is null or
     p_section_code not in ('identity', 'phone', 'note') then
    raise exception 'Invalid personal-data section';
  end if;

  if p_section_code = 'identity' then
    if p_new_phone is not null or p_new_note is not null then
      raise exception 'Parameters are incompatible with identity section';
    end if;

    if p_new_first_name is null or
       pg_catalog.btrim(p_new_first_name) = '' then
      raise exception 'First name is required';
    end if;

    if p_new_last_name is null or
       pg_catalog.btrim(p_new_last_name) = '' then
      raise exception 'Last name is required';
    end if;

    v_new_first_name := pg_catalog.btrim(p_new_first_name);
    v_new_last_name := pg_catalog.btrim(p_new_last_name);
  elsif p_section_code = 'phone' then
    if p_new_first_name is not null or
       p_new_last_name is not null or
       p_new_note is not null then
      raise exception 'Parameters are incompatible with phone section';
    end if;

    if p_new_phone is null or pg_catalog.btrim(p_new_phone) = '' then
      raise exception 'Phone is required';
    end if;

    v_new_phone := pg_catalog.btrim(p_new_phone);

    if v_new_phone !~ '^[0-9]{10}$' then
      raise exception 'Phone must contain exactly 10 digits';
    end if;
  else
    if p_new_first_name is not null or
       p_new_last_name is not null or
       p_new_phone is not null then
      raise exception 'Parameters are incompatible with note section';
    end if;

    -- The reference allows a note to be cleared. Empty or whitespace-only
    -- input is stored canonically as NULL; non-empty note content is retained.
    v_new_note := case
      when p_new_note is null or pg_catalog.btrim(p_new_note) = '' then null
      else p_new_note
    end;
  end if;

  -- Lock order shared with the other receipt mutation RPCs: receipt first,
  -- then its registration. No financial row needs to be locked here.
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

  if v_receipt_lifecycle_status <> 'active' then
    raise exception 'Cancelled receipt cannot be modified';
  end if;

  select
    registration.season_id,
    registration.traveler_first_name_snapshot,
    registration.traveler_last_name_snapshot,
    registration.traveler_phone_snapshot,
    registration.note
  into
    v_registration_season_id,
    v_old_first_name,
    v_old_last_name,
    v_old_phone,
    v_old_note
  from public.traveler_registrations as registration
  where registration.id = v_registration_id
  for update;

  if not found then
    raise exception 'Receipt registration not found';
  end if;

  if v_registration_season_id is distinct from v_receipt_season_id then
    raise exception 'Receipt registration is inconsistent';
  end if;

  if p_section_code = 'identity' then
    if v_old_first_name is not distinct from v_new_first_name and
       v_old_last_name is not distinct from v_new_last_name then
      raise exception 'No personal data changed';
    end if;

    v_action_type := 'billing_receipt.identity_updated';
    v_before_data := pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'section_code', p_section_code,
      'first_name', v_old_first_name,
      'last_name', v_old_last_name
    );
    v_after_data := pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'section_code', p_section_code,
      'first_name', v_new_first_name,
      'last_name', v_new_last_name
    );

    update public.traveler_registrations
    set
      traveler_first_name_snapshot = v_new_first_name,
      traveler_last_name_snapshot = v_new_last_name
    where id = v_registration_id;
  elsif p_section_code = 'phone' then
    if v_old_phone is not distinct from v_new_phone then
      raise exception 'No personal data changed';
    end if;

    v_action_type := 'billing_receipt.phone_updated';
    v_before_data := pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'section_code', p_section_code,
      'phone', v_old_phone
    );
    v_after_data := pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'section_code', p_section_code,
      'phone', v_new_phone
    );

    update public.traveler_registrations
    set traveler_phone_snapshot = v_new_phone
    where id = v_registration_id;
  else
    v_old_note_normalized := case
      when v_old_note is null or pg_catalog.btrim(v_old_note) = '' then null
      else v_old_note
    end;

    if v_old_note_normalized is not distinct from v_new_note then
      raise exception 'No personal data changed';
    end if;

    v_action_type := 'billing_receipt.note_updated';
    v_before_data := pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'section_code', p_section_code,
      'note', v_old_note
    );
    v_after_data := pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'section_code', p_section_code,
      'note', v_new_note,
      'note_cleared', v_new_note is null
    );

    update public.traveler_registrations
    set note = v_new_note
    where id = v_registration_id;
  end if;

  if not found then
    raise exception 'Receipt registration is unavailable';
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
    v_action_type,
    p_section_code,
    pg_catalog.btrim(p_reason),
    v_before_data,
    v_after_data,
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

  return query
  select
    p_receipt_id,
    v_registration_id,
    v_receipt_number,
    p_section_code,
    case when p_section_code = 'identity' then v_new_first_name else null end,
    case when p_section_code = 'identity' then v_new_last_name else null end,
    case when p_section_code = 'phone' then v_new_phone else null end,
    case when p_section_code = 'note' then v_new_note else null end,
    v_action_at,
    true;
end;
$$;

comment on function public.update_billing_receipt_personal_data(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Updates exactly one registration snapshot section for an active receipt: identity, phone or note. It never changes the general travelers row or financial data. The note may be cleared and is then stored as NULL. Actor fields come only from resolve_facturation_actor(). Stable history actions are billing_receipt.identity_updated, billing_receipt.phone_updated and billing_receipt.note_updated.';

revoke execute on function public.update_billing_receipt_personal_data(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.update_billing_receipt_personal_data(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;
