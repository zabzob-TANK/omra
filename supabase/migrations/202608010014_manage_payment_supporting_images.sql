-- Supabase Storage keeps the binary object. PostgreSQL stores only its private
-- bucket reference, technical path, metadata and immutable action history.
insert into storage.buckets (
  id,
  name,
  public,
  allowed_mime_types
)
values (
  'facturation-justificatifs',
  'facturation-justificatifs',
  false,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  allowed_mime_types = excluded.allowed_mime_types;

-- C-005 already created the dedicated evidence table. Extend that structure
-- instead of creating a parallel table.
alter table public.payment_supporting_images
  add column file_hash text,
  add column deletion_reason text,
  alter column original_file_name set not null,
  alter column mime_type set not null,
  alter column uploaded_by_auth_user_id_snapshot set not null,
  alter column uploaded_by_login_snapshot set not null,
  drop constraint payment_supporting_images_deletion_details_check,
  add constraint payment_supporting_images_bucket_check check (
    storage_bucket = 'facturation-justificatifs'
  ),
  add constraint payment_supporting_images_original_file_name_check check (
    pg_catalog.btrim(original_file_name) <> ''
  ),
  add constraint payment_supporting_images_mime_type_check check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  add constraint payment_supporting_images_file_hash_check check (
    file_hash is null or pg_catalog.btrim(file_hash) <> ''
  ),
  add constraint payment_supporting_images_operation_path_check check (
    pg_catalog.strpos(storage_path, '..') = 0 and
    storage_path ~* (
      '^' || payment_operation_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' ||
      '\.(jpg|jpeg|png|webp)$'
    )
  ),
  add constraint payment_supporting_images_mime_extension_check check (
    (
      mime_type = 'image/jpeg' and
      storage_path ~* '\.(jpg|jpeg)$'
    ) or (
      mime_type = 'image/png' and
      storage_path ~* '\.png$'
    ) or (
      mime_type = 'image/webp' and
      storage_path ~* '\.webp$'
    )
  ),
  add constraint payment_supporting_images_deletion_details_check check (
    (
      deleted_at is null and
      deleted_by_slot_number is null and
      deleted_by_auth_user_id_snapshot is null and
      deleted_by_slot_label_snapshot is null and
      deleted_by_login_snapshot is null and
      deletion_reason is null
    ) or (
      deleted_at is not null and
      deleted_by_slot_number = 1 and
      deleted_by_auth_user_id_snapshot is not null and
      deleted_by_slot_label_snapshot is not null and
      pg_catalog.btrim(deleted_by_slot_label_snapshot) <> '' and
      deleted_by_login_snapshot is not null and
      pg_catalog.btrim(deleted_by_login_snapshot) <> '' and
      deletion_reason is not null and
      pg_catalog.btrim(deletion_reason) <> ''
    )
  );

create unique index payment_supporting_images_storage_object_unique
  on public.payment_supporting_images (storage_bucket, storage_path);

comment on table public.payment_supporting_images is
  'Private Storage metadata for cheque and transfer evidence images. At most one non-deleted row is active per payment operation; logical deletion preserves all prior metadata and history.';

create function public.attach_payment_operation_evidence_image(
  p_operation_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint default null,
  p_file_hash text default null
)
returns table (
  evidence_id uuid,
  operation_id uuid,
  storage_bucket text,
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  file_hash text,
  uploaded_at timestamptz
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
  v_payment_mode text;
  v_usage_kind text;
  v_existing_evidence_id uuid;
  v_evidence_id uuid := pg_catalog.gen_random_uuid();
  v_storage_bucket constant text := 'facturation-justificatifs';
  v_storage_path text;
  v_original_file_name text;
  v_mime_type text;
  v_file_hash text;
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

  v_storage_path := pg_catalog.btrim(p_storage_path);
  v_original_file_name := pg_catalog.btrim(p_original_file_name);
  v_mime_type := pg_catalog.lower(pg_catalog.btrim(p_mime_type));
  v_file_hash := nullif(pg_catalog.btrim(p_file_hash), '');

  if p_storage_path is null or v_storage_path = '' or
     p_storage_path is distinct from v_storage_path or
     pg_catalog.strpos(v_storage_path, '..') > 0 then
    raise exception 'Invalid evidence storage path';
  end if;

  if p_original_file_name is null or v_original_file_name = '' then
    raise exception 'Original file name is required';
  end if;

  if p_mime_type is null or
     v_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Evidence image type is not allowed';
  end if;

  if p_file_size_bytes is not null and p_file_size_bytes <= 0 then
    raise exception 'Evidence image size is invalid';
  end if;

  if p_file_hash is not null and v_file_hash is null then
    raise exception 'Evidence image hash is invalid';
  end if;

  select
    operation.payment_mode,
    operation.usage_kind
  into
    v_payment_mode,
    v_usage_kind
  from public.payment_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'Payment operation not found';
  end if;

  if v_payment_mode = 'cash' then
    raise exception 'Cash operation cannot have an evidence image';
  end if;

  if v_payment_mode not in ('cheque', 'transfer') then
    raise exception 'Payment operation mode is incompatible with evidence images';
  end if;

  select image.id
  into v_existing_evidence_id
  from public.payment_supporting_images as image
  where image.payment_operation_id = p_operation_id
    and image.deleted_at is null
  for update;

  if found then
    raise exception 'Payment operation already has an active evidence image';
  end if;

  if v_storage_path !~* (
    '^' || p_operation_id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' ||
    '\.(jpg|jpeg|png|webp)$'
  ) then
    raise exception 'Evidence storage path does not match payment operation';
  end if;

  if
    (v_mime_type = 'image/jpeg' and v_storage_path !~* '\.(jpg|jpeg)$') or
    (v_mime_type = 'image/png' and v_storage_path !~* '\.png$') or
    (v_mime_type = 'image/webp' and v_storage_path !~* '\.webp$')
  then
    raise exception 'Evidence file extension does not match image type';
  end if;

  if exists (
    select 1
    from public.payment_supporting_images as image
    where image.storage_bucket = v_storage_bucket
      and image.storage_path = v_storage_path
  ) then
    raise exception 'Evidence storage path has already been used';
  end if;

  if not exists (
    select 1
    from storage.objects as stored_object
    where stored_object.bucket_id = v_storage_bucket
      and stored_object.name = v_storage_path
  ) then
    raise exception 'Evidence storage object was not found';
  end if;

  insert into public.payment_supporting_images (
    id,
    payment_operation_id,
    storage_bucket,
    storage_path,
    original_file_name,
    mime_type,
    file_size_bytes,
    file_hash,
    uploaded_at,
    uploaded_by_slot_number,
    uploaded_by_auth_user_id_snapshot,
    uploaded_by_slot_label_snapshot,
    uploaded_by_login_snapshot,
    created_at
  )
  values (
    v_evidence_id,
    p_operation_id,
    v_storage_bucket,
    v_storage_path,
    v_original_file_name,
    v_mime_type,
    p_file_size_bytes,
    v_file_hash,
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_action_at
  );

  insert into public.facturation_action_history (
    entity_type,
    entity_id,
    action_type,
    section_code,
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
    'payment_operation',
    p_operation_id,
    'payment_operation.evidence_attached',
    'supporting_image',
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'active_evidence_id', null
    ),
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'payment_mode', v_payment_mode,
      'usage_kind', v_usage_kind,
      'evidence_id', v_evidence_id,
      'storage_bucket', v_storage_bucket,
      'storage_path', v_storage_path,
      'mime_type', v_mime_type,
      'file_size_bytes', p_file_size_bytes,
      'file_hash', v_file_hash,
      'active', true,
      'uploaded_at', v_action_at
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
    v_evidence_id,
    p_operation_id,
    v_storage_bucket,
    v_storage_path,
    v_original_file_name,
    v_mime_type,
    p_file_size_bytes,
    v_file_hash,
    v_action_at;
end;
$$;

comment on function public.attach_payment_operation_evidence_image(
  uuid,
  text,
  text,
  text,
  bigint,
  text
) is
  'Associates one existing private Storage image with a cheque or transfer operation. The operation row and the partial unique index serialize concurrent additions; active evidence is never replaced. Actor fields come only from resolve_facturation_actor(). Stable history action: payment_operation.evidence_attached.';

create function public.delete_payment_operation_evidence_image(
  p_operation_id uuid,
  p_reason text
)
returns table (
  evidence_id uuid,
  operation_id uuid,
  storage_bucket text,
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  file_hash text,
  deleted_at timestamptz
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
  v_payment_mode text;
  v_usage_kind text;
  v_evidence_id uuid;
  v_storage_bucket text;
  v_storage_path text;
  v_original_file_name text;
  v_mime_type text;
  v_file_size_bytes bigint;
  v_file_hash text;
  v_uploaded_at timestamptz;
  v_reason text;
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
  from public.require_facturation_admin() as actor;

  v_reason := pg_catalog.btrim(p_reason);

  if p_reason is null or v_reason = '' then
    raise exception 'Evidence image deletion reason is required';
  end if;

  select
    operation.payment_mode,
    operation.usage_kind
  into
    v_payment_mode,
    v_usage_kind
  from public.payment_operations as operation
  where operation.id = p_operation_id
  for update;

  if not found then
    raise exception 'Payment operation not found';
  end if;

  select
    image.id,
    image.storage_bucket,
    image.storage_path,
    image.original_file_name,
    image.mime_type,
    image.file_size_bytes,
    image.file_hash,
    image.uploaded_at
  into
    v_evidence_id,
    v_storage_bucket,
    v_storage_path,
    v_original_file_name,
    v_mime_type,
    v_file_size_bytes,
    v_file_hash,
    v_uploaded_at
  from public.payment_supporting_images as image
  where image.payment_operation_id = p_operation_id
    and image.deleted_at is null
  for update;

  if not found then
    raise exception 'Active evidence image not found';
  end if;

  update public.payment_supporting_images
  set
    deleted_at = v_action_at,
    deleted_by_slot_number = v_actor_slot_number,
    deleted_by_auth_user_id_snapshot = v_actor_auth_user_id,
    deleted_by_slot_label_snapshot = v_actor_slot_label,
    deleted_by_login_snapshot = v_actor_login,
    deletion_reason = v_reason
  where id = v_evidence_id
    and deleted_at is null;

  if not found then
    raise exception 'Active evidence image is unavailable';
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
    'payment_operation',
    p_operation_id,
    'payment_operation.evidence_deleted',
    'supporting_image',
    v_reason,
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'payment_mode', v_payment_mode,
      'usage_kind', v_usage_kind,
      'evidence_id', v_evidence_id,
      'storage_bucket', v_storage_bucket,
      'storage_path', v_storage_path,
      'mime_type', v_mime_type,
      'file_size_bytes', v_file_size_bytes,
      'file_hash', v_file_hash,
      'active', true,
      'uploaded_at', v_uploaded_at
    ),
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'payment_mode', v_payment_mode,
      'usage_kind', v_usage_kind,
      'evidence_id', v_evidence_id,
      'storage_bucket', v_storage_bucket,
      'storage_path', v_storage_path,
      'mime_type', v_mime_type,
      'file_size_bytes', v_file_size_bytes,
      'file_hash', v_file_hash,
      'active', false,
      'deleted_at', v_action_at,
      'deletion_reason', v_reason
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
    v_evidence_id,
    p_operation_id,
    v_storage_bucket,
    v_storage_path,
    v_original_file_name,
    v_mime_type,
    v_file_size_bytes,
    v_file_hash,
    v_action_at;
end;
$$;

comment on function public.delete_payment_operation_evidence_image(
  uuid,
  text
) is
  'Administrator-only logical deletion of the active evidence image. The SQL row and full history are retained, and the private bucket/path are returned for later physical cleanup by a secure server route. Actor fields come only from require_facturation_admin(). Stable history action: payment_operation.evidence_deleted.';

alter table public.payment_supporting_images enable row level security;

revoke all on table public.payment_supporting_images
  from public, anon, authenticated;

grant all on table public.payment_supporting_images to service_role;

revoke execute on function public.attach_payment_operation_evidence_image(
  uuid,
  text,
  text,
  text,
  bigint,
  text
) from public, anon;

grant execute on function public.attach_payment_operation_evidence_image(
  uuid,
  text,
  text,
  text,
  bigint,
  text
) to authenticated;

revoke execute on function public.delete_payment_operation_evidence_image(
  uuid,
  text
) from public, anon;

grant execute on function public.delete_payment_operation_evidence_image(
  uuid,
  text
) to authenticated;

-- No Storage policy is created here. Binary upload, download and physical
-- deletion remain reserved for a future authenticated server route.
