create table public.payment_supporting_images (
  id uuid primary key default gen_random_uuid(),
  payment_operation_id uuid not null
    references public.payment_operations(id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by_slot_number smallint not null
    references public.account_slots(slot_number) on delete restrict,
  uploaded_by_auth_user_id_snapshot uuid,
  uploaded_by_slot_label_snapshot text not null,
  uploaded_by_login_snapshot text,
  deleted_at timestamptz,
  deleted_by_slot_number smallint
    references public.account_slots(slot_number) on delete restrict,
  deleted_by_auth_user_id_snapshot uuid,
  deleted_by_slot_label_snapshot text,
  deleted_by_login_snapshot text,
  created_at timestamptz not null default now(),
  constraint payment_supporting_images_storage_bucket_check check (
    btrim(storage_bucket) <> ''
  ),
  constraint payment_supporting_images_storage_path_check check (
    btrim(storage_path) <> ''
  ),
  constraint payment_supporting_images_file_size_check check (
    file_size_bytes is null or file_size_bytes > 0
  ),
  constraint payment_supporting_images_uploader_slot_label_snapshot_check check (
    btrim(uploaded_by_slot_label_snapshot) <> ''
  ),
  constraint payment_supporting_images_deletion_details_check check (
    (
      deleted_at is null and
      deleted_by_slot_number is null and
      deleted_by_auth_user_id_snapshot is null and
      deleted_by_slot_label_snapshot is null and
      deleted_by_login_snapshot is null
    ) or (
      deleted_at is not null and
      deleted_by_slot_number is not null and
      deleted_by_slot_label_snapshot is not null and
      btrim(deleted_by_slot_label_snapshot) <> ''
    )
  )
);

-- Future secure transactional functions must ensure that:
-- - supporting images are forbidden for cash operations;
-- - only cheque and transfer operations accept a supporting image;
-- - an employee can add an image only when no active image exists;
-- - direct replacement of an active image is forbidden;
-- - only an authorized administrator action can mark an image as deleted;
-- - image addition and deletion create events in facturation_action_history;
-- - logical deletion does not yet decide whether the physical file is deleted
--   or archived in Supabase Storage.

create unique index payment_supporting_images_active_operation_unique
  on public.payment_supporting_images (payment_operation_id)
  where deleted_at is null;

create index payment_supporting_images_operation_uploaded_at_idx
  on public.payment_supporting_images (payment_operation_id, uploaded_at);

create index payment_supporting_images_uploader_uploaded_at_idx
  on public.payment_supporting_images (uploaded_by_slot_number, uploaded_at);

create index payment_supporting_images_deleted_at_idx
  on public.payment_supporting_images (deleted_at)
  where deleted_at is not null;

alter table public.payment_supporting_images enable row level security;

revoke all on table public.payment_supporting_images
  from public, anon, authenticated;

grant all on table public.payment_supporting_images to service_role;
