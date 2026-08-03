create function public.update_billing_receipt_dossier(
  p_receipt_id uuid,
  p_action text,
  p_target_dossier_id uuid,
  p_reason text
)
returns table (
  receipt_id uuid,
  registration_id uuid,
  action_performed text,
  source_dossier_id uuid,
  target_dossier_id uuid,
  technical_dossier_created boolean,
  source_registration_count_after bigint,
  target_registration_count_after bigint,
  source_became_empty boolean,
  modified_at timestamptz
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
  v_source_dossier_id uuid;
  v_target_dossier_id uuid;
  v_locked_dossier_id uuid;
  v_locked_dossier_count integer := 0;
  v_source_registration_count_before bigint;
  v_source_registration_count_after bigint;
  v_target_registration_count_after bigint;
  v_technical_dossier_created boolean := false;
  v_internal_dossier_reference text;
  v_source_became_empty boolean;
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

  if p_action is null or
     p_action not in ('move_to_existing', 'separate_to_technical') then
    raise exception 'Invalid dossier action';
  end if;

  if p_action = 'move_to_existing' and p_target_dossier_id is null then
    raise exception 'Target dossier is required';
  end if;

  if p_action = 'separate_to_technical' and
     p_target_dossier_id is not null then
    raise exception 'Target dossier is incompatible with technical separation';
  end if;

  -- Receipt mutation RPCs serialize first on the receipt, then on the linked
  -- registration. No payment or financial-operation row is locked here.
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
    registration.dossier_id
  into
    v_registration_season_id,
    v_source_dossier_id
  from public.traveler_registrations as registration
  where registration.id = v_registration_id
  for update;

  if not found then
    raise exception 'Receipt registration not found';
  end if;

  if v_registration_season_id is distinct from v_receipt_season_id or
     v_source_dossier_id is null then
    raise exception 'Receipt registration is inconsistent';
  end if;

  if p_action = 'move_to_existing' and
     p_target_dossier_id = v_source_dossier_id then
    raise exception 'Target dossier must differ from source dossier';
  end if;

  if p_action = 'move_to_existing' then
    -- Both existing dossier rows are locked by ascending UUID, independently
    -- of move direction, so inverse concurrent moves use the same lock order.
    for v_locked_dossier_id in
      select dossier.id
      from public.omra_dossiers as dossier
      where dossier.id = v_source_dossier_id
         or dossier.id = p_target_dossier_id
      order by dossier.id
      for update
    loop
      v_locked_dossier_count := v_locked_dossier_count + 1;
    end loop;

    if v_locked_dossier_count <> 2 then
      if not exists (
        select 1
        from public.omra_dossiers as dossier
        where dossier.id = v_source_dossier_id
      ) then
        raise exception 'Source dossier not found';
      end if;

      raise exception 'Target dossier not found';
    end if;

    v_target_dossier_id := p_target_dossier_id;
  else
    select dossier.id
    into v_locked_dossier_id
    from public.omra_dossiers as dossier
    where dossier.id = v_source_dossier_id
    for update;

    if not found then
      raise exception 'Source dossier not found';
    end if;
  end if;

  select pg_catalog.count(*)
  into v_source_registration_count_before
  from public.traveler_registrations as registration
  where registration.dossier_id = v_source_dossier_id;

  if v_source_registration_count_before < 1 then
    raise exception 'Source dossier registration count is invalid';
  end if;

  if p_action = 'separate_to_technical' then
    if v_source_registration_count_before = 1 then
      raise exception 'Registration is already alone in its dossier';
    end if;

    -- The same UUID supplies both the primary key and an opaque mandatory
    -- reference. This is not a business number and is never returned or logged.
    v_target_dossier_id := pg_catalog.gen_random_uuid();
    v_internal_dossier_reference :=
      'technical:' || v_target_dossier_id::text;

    begin
      insert into public.omra_dossiers (
        id,
        dossier_reference,
        created_by_slot_number,
        created_at,
        updated_at
      )
      values (
        v_target_dossier_id,
        v_internal_dossier_reference,
        v_actor_slot_number,
        v_action_at,
        v_action_at
      );
    exception
      when unique_violation then
        raise exception 'Technical dossier could not be created';
    end;

    v_technical_dossier_created := true;
  end if;

  update public.traveler_registrations
  set dossier_id = v_target_dossier_id
  where id = v_registration_id
    and dossier_id = v_source_dossier_id;

  if not found then
    raise exception 'Receipt registration is unavailable';
  end if;

  select pg_catalog.count(*)
  into v_source_registration_count_after
  from public.traveler_registrations as registration
  where registration.dossier_id = v_source_dossier_id;

  select pg_catalog.count(*)
  into v_target_registration_count_after
  from public.traveler_registrations as registration
  where registration.dossier_id = v_target_dossier_id;

  if v_target_registration_count_after < 1 then
    raise exception 'Target dossier registration count is invalid';
  end if;

  v_source_became_empty := v_source_registration_count_after = 0;

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
    'billing_receipt.dossier_updated',
    'dossier',
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'action', p_action,
      'source_dossier_id', v_source_dossier_id,
      'source_registration_count', v_source_registration_count_before
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'action', p_action,
      'source_dossier_id', v_source_dossier_id,
      'target_dossier_id', v_target_dossier_id,
      'technical_dossier_created', v_technical_dossier_created,
      'source_registration_count_before',
        v_source_registration_count_before,
      'source_registration_count_after',
        v_source_registration_count_after,
      'target_registration_count_after',
        v_target_registration_count_after,
      'source_became_empty', v_source_became_empty
    ),
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
    p_action,
    v_source_dossier_id,
    v_target_dossier_id,
    v_technical_dossier_created,
    v_source_registration_count_after,
    v_target_registration_count_after,
    v_source_became_empty,
    v_action_at;
end;
$$;

comment on function public.update_billing_receipt_dossier(
  uuid,
  text,
  uuid,
  text
) is
  'Moves one active receipt registration to an existing dossier or to a silently created technical dossier. The required technical reference is derived from a server UUID and is neither returned nor logged as a business reference. Only traveler_registrations.dossier_id changes; financial records and the source dossier remain untouched. Actor fields come only from resolve_facturation_actor(). Stable history action: billing_receipt.dossier_updated.';

revoke execute on function public.update_billing_receipt_dossier(
  uuid,
  text,
  uuid,
  text
) from public, anon;

grant execute on function public.update_billing_receipt_dossier(
  uuid,
  text,
  uuid,
  text
) to authenticated;
