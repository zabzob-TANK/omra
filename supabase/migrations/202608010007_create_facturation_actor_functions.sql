create function public.resolve_facturation_actor()
returns table (
  slot_number smallint,
  auth_user_id uuid,
  slot_label text,
  login text,
  actor_role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_auth_user_id uuid;
  resolved_slot_number smallint;
  resolved_auth_user_id uuid;
  resolved_slot_label text;
  resolved_login text;
begin
  session_auth_user_id := auth.uid();

  if session_auth_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Facturation access denied';
  end if;

  begin
    select
      account_slot.slot_number,
      account_slot.auth_user_id,
      account_slot.slot_label,
      account_slot.login
    into strict
      resolved_slot_number,
      resolved_auth_user_id,
      resolved_slot_label,
      resolved_login
    from public.account_slots as account_slot
    where account_slot.auth_user_id = session_auth_user_id
      and account_slot.active is true;
  exception
    when no_data_found or too_many_rows then
      raise exception using
        errcode = '42501',
        message = 'Facturation access denied';
  end;

  if
    resolved_auth_user_id is distinct from session_auth_user_id or
    resolved_slot_number not between 1 and 6 or
    resolved_slot_label is null or
    pg_catalog.btrim(resolved_slot_label) = '' or
    resolved_login is null or
    pg_catalog.btrim(resolved_login) = ''
  then
    raise exception using
      errcode = '42501',
      message = 'Facturation access denied';
  end if;

  return query
  select
    resolved_slot_number,
    resolved_auth_user_id,
    resolved_slot_label,
    resolved_login,
    case
      when resolved_slot_number = 1 then 'admin'::text
      else 'employee'::text
    end;
end;
$$;

create function public.require_facturation_admin()
returns table (
  slot_number smallint,
  auth_user_id uuid,
  slot_label text,
  login text,
  actor_role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_slot_number smallint;
  resolved_auth_user_id uuid;
  resolved_slot_label text;
  resolved_login text;
  resolved_actor_role text;
begin
  begin
    select
      actor.slot_number,
      actor.auth_user_id,
      actor.slot_label,
      actor.login,
      actor.actor_role
    into strict
      resolved_slot_number,
      resolved_auth_user_id,
      resolved_slot_label,
      resolved_login,
      resolved_actor_role
    from public.resolve_facturation_actor() as actor;
  exception
    when no_data_found or too_many_rows then
      raise exception using
        errcode = '42501',
        message = 'Facturation access denied';
  end;

  if resolved_slot_number <> 1 then
    raise exception using
      errcode = '42501',
      message = 'Facturation access denied';
  end if;

  return query
  select
    resolved_slot_number,
    resolved_auth_user_id,
    resolved_slot_label,
    resolved_login,
    resolved_actor_role;
end;
$$;

comment on function public.resolve_facturation_actor() is
  'Unique identity source for Facturation writes. Future RPCs must never accept client-supplied actor_* fields; actor snapshots must be copied from this result when each action is performed.';

comment on function public.require_facturation_admin() is
  'Administrator-only Facturation identity source. Future RPCs must never accept client-supplied actor_* fields; actor snapshots must be copied from this result when each action is performed.';

revoke all on function public.resolve_facturation_actor()
  from public, anon, authenticated;

revoke all on function public.require_facturation_admin()
  from public, anon, authenticated;
