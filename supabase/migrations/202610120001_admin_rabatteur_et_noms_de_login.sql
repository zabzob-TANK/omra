-- Demande du commanditaire (2026-10-12), deux changements indépendants.
--
-- 1. Le rabatteur d'un reçu devient modifiable, PAR L'ADMINISTRATEUR SEUL
--    (slot 1). Jusqu'ici R-54 le déclarait non modifiable pour tout le
--    monde ; le commanditaire lève cette règle pour la direction seulement.
--    Un employé (slots 2 à 6) reste refusé, ici par le serveur
--    (`require_facturation_admin()`), pas seulement par l'écran.
--
--    Ce que la modification touche : `traveler_registrations.rabatteur_id`
--    et `rabatteur_name_snapshot` — le rabatteur COURANT du reçu.
--    Ce qu'elle ne touche jamais : `receipt_payments.payment_snapshot_rabatteur_name`.
--    Chaque versement garde le rabatteur de son époque (instantané
--    historique) ; la Finance lit cet instantané en priorité, donc les
--    versements déjà encaissés restent attribués à l'ancien rabatteur, et
--    seuls les versements suivants portent le nouveau (choix « a », retenu
--    par défaut avec le commanditaire le 2026-10-12).
--
--    Aucun montant, aucun versement, aucune opération, aucune caisse n'est
--    lu ni écrit. Reçu annulé refusé, motif obligatoire, ancien et nouveau
--    rabatteur conservés dans `facturation_action_history`.
--
-- 2. L'auteur d'une action s'affiche sous son LOGIN (« simo », « iman »...)
--    au lieu du libellé de slot (« Employé 1 »...), et l'administrateur
--    sous « admin », quel que soit son login réel. Une seule règle,
--    `facturation_actor_display_name()`, appliquée à l'instantané pris au
--    moment de l'action : un reçu fait par « simo » reste à « simo » pour
--    toujours, même si le slot est réattribué plus tard.
--
--    Les fonctions de lecture qui ne renvoyaient que le libellé sont
--    remplacées (CREATE OR REPLACE, signature et type de retour inchangés,
--    privilèges conservés) : seule l'expression de la colonne d'auteur
--    change, le corps est repris tel quel de leur dernière définition. La
--    colonne garde son nom (`*_slot_label*`) pour ne casser aucun appelant ;
--    elle porte désormais le nom d'affichage.
--
--    Les instantanés stockés ne sont jamais réécrits.

-- ---------------------------------------------------------------------------
-- Règle d'affichage de l'auteur
-- ---------------------------------------------------------------------------

create function public.facturation_actor_display_name(
  p_slot_number smallint,
  p_login text,
  p_slot_label text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_slot_number = 1 then 'admin'
    else coalesce(nullif(pg_catalog.btrim(p_login), ''), p_slot_label)
  end;
$$;

comment on function public.facturation_actor_display_name(smallint, text, text) is
  'Display name of a Facturation actor snapshot: ''admin'' for slot 1, otherwise the login captured at action time, falling back to the slot label when no login was captured. Mirrors nomAffichageActeur() in modules/facturation/domain/acteur.ts — change both together.';

revoke all on function public.facturation_actor_display_name(smallint, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Modification du rabatteur — administrateur seul
-- ---------------------------------------------------------------------------

create function public.update_billing_receipt_rabatteur(
  p_receipt_id uuid,
  p_rabatteur_id uuid,
  p_reason text
)
returns table (
  receipt_id uuid,
  registration_id uuid,
  receipt_number integer,
  old_rabatteur_name text,
  new_rabatteur_name text,
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
  v_season_id uuid;
  v_program_id uuid;
  v_old_rabatteur_id uuid;
  v_old_rabatteur_name text;
  v_new_rabatteur_name text;
  v_action_at timestamptz := pg_catalog.transaction_timestamp();
  v_correlation_id uuid := pg_catalog.gen_random_uuid();
begin
  -- Administrateur seul : refuse tout autre slot, avant toute lecture.
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

  if p_reason is null or pg_catalog.btrim(p_reason) = '' then
    raise exception 'Modification reason is required';
  end if;

  if p_rabatteur_id is null then
    raise exception 'Rabatteur is required';
  end if;

  -- Même ordre de verrouillage que les autres écritures : reçu puis inscription.
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
    registration.program_id,
    registration.rabatteur_id,
    registration.rabatteur_name_snapshot
  into
    v_season_id,
    v_program_id,
    v_old_rabatteur_id,
    v_old_rabatteur_name
  from public.traveler_registrations as registration
  where registration.id = v_registration_id
  for update;

  if not found then
    raise exception 'Receipt registration not found';
  end if;

  if v_season_id is distinct from v_receipt_season_id then
    raise exception 'Receipt registration is inconsistent';
  end if;

  -- Le nouveau rabatteur doit appartenir au programme du reçu.
  select rabatteur.name
  into v_new_rabatteur_name
  from public.omra_program_rabatteurs as rabatteur
  where rabatteur.id = p_rabatteur_id
    and rabatteur.program_id = v_program_id
  for share;

  if not found then
    raise exception 'Rabatteur selection is incompatible with receipt program';
  end if;

  if
    v_old_rabatteur_id is not distinct from p_rabatteur_id and
    v_old_rabatteur_name is not distinct from v_new_rabatteur_name
  then
    raise exception 'No rabatteur changed';
  end if;

  update public.traveler_registrations
  set
    rabatteur_id = p_rabatteur_id,
    rabatteur_name_snapshot = v_new_rabatteur_name
  where id = v_registration_id;

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
    'billing_receipt.rabatteur_updated',
    'rabatteur',
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'season_id', v_season_id,
      'program_id', v_program_id,
      'rabatteur_id', v_old_rabatteur_id,
      'rabatteur_name_snapshot', v_old_rabatteur_name
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'registration_id', v_registration_id,
      'receipt_number', v_receipt_number,
      'lifecycle_status', v_receipt_lifecycle_status,
      'season_id', v_season_id,
      'program_id', v_program_id,
      'rabatteur_id', p_rabatteur_id,
      'rabatteur_name_snapshot', v_new_rabatteur_name
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
    v_receipt_number,
    v_old_rabatteur_name,
    v_new_rabatteur_name,
    v_action_at;
end;
$$;

comment on function public.update_billing_receipt_rabatteur(uuid, uuid, text) is
  'Administrator-only (slot 1): changes the current rabatteur of one active receipt to a rabatteur of the same program. Never touches payments, payment snapshots (payment_snapshot_rabatteur_name keeps the rabatteur of its time), operations or cash. Reason required. Actor fields come only from require_facturation_admin(). Stable history action: billing_receipt.rabatteur_updated.';

revoke execute on function public.update_billing_receipt_rabatteur(uuid, uuid, text)
  from public, anon;

grant execute on function public.update_billing_receipt_rabatteur(uuid, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- La modification du rabatteur compte comme une modification de reçu :
-- compteurs du registre, fiche du reçu, Suivi journalier, historique et
-- journal des opérations (qui consulte cette même liste).
-- ---------------------------------------------------------------------------

create or replace function public.billing_receipt_modification_action_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'billing_receipt.commercial_data_updated',
    'billing_receipt.identity_updated',
    'billing_receipt.phone_updated',
    'billing_receipt.note_updated',
    'billing_receipt.dossier_updated',
    'billing_receipt.first_payment_method_corrected',
    'billing_receipt.payment_method_corrected',
    'billing_receipt.rabatteur_updated'
  ]::text[];
$$;

-- ---------------------------------------------------------------------------
-- Fonctions de lecture : nom d'affichage de l'auteur
-- (généré depuis la dernière définition de chaque fonction ; seule
-- l'expression d'auteur diffère)
-- ---------------------------------------------------------------------------

-- list_billing_season_payments — corps repris tel quel de la dernière définition (202608090005_add_registration_fields_to_list_billing_season_payments.sql),
-- seul(s) le(s) libellé(s) d'auteur passe(nt) par facturation_actor_display_name().
create or replace function public.list_billing_season_payments(
  p_season_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  payment_id uuid,
  receipt_id uuid,
  receipt_number integer,
  lifecycle_status text,
  traveler_first_name_snapshot text,
  traveler_last_name_snapshot text,
  receipt_created_by_slot_label text,
  registration_hotel_name text,
  registration_room_label text,
  registration_flight_label text,
  registration_rabatteur_name text,
  registration_agreed_amount_dh integer,
  payment_number smallint,
  amount_dh integer,
  payment_registered_at timestamptz,
  payment_created_by_slot_label text,
  payment_mode text,
  usage_kind text,
  operation_id uuid,
  operation_registered_at timestamptz,
  operation_amount_dh integer,
  instrument_reference text,
  instrument_date date,
  bank_name text,
  payer_name text,
  image_storage_bucket text,
  image_storage_path text,
  image_original_file_name text,
  image_uploaded_at timestamptz,
  image_uploaded_by_slot_label text,
  snapshot_client_name text,
  snapshot_hotel_name text,
  snapshot_room_label text,
  snapshot_flight_label text,
  snapshot_program_label text,
  snapshot_agreed_amount_dh integer,
  snapshot_rabatteur_name text,
  snapshot_remaining_after_dh integer,
  snapshot_settled_after boolean,
  total_rows bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_slot_number smallint;
  v_actor_auth_user_id uuid;
  v_actor_slot_label text;
  v_actor_login text;
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

  if p_season_id is null then
    raise exception 'Billing season payments require a season id';
  end if;

  if p_limit is null or p_limit <= 0 or p_limit > 200 then
    raise exception 'Billing season payments page limit must be between 1 and 200';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'Billing season payments page offset must be non-negative';
  end if;

  if p_date_from is not null and p_date_to is not null and
     p_date_from > p_date_to then
    raise exception 'Billing season payments date range is invalid';
  end if;

  return query
  with season_payments as (
    select
      payment.id as payment_id,
      receipt.id as receipt_id,
      receipt.receipt_number,
      receipt.lifecycle_status,
      registration.traveler_first_name_snapshot,
      registration.traveler_last_name_snapshot,
      public.facturation_actor_display_name(receipt.created_by_slot_number, receipt.created_by_login_snapshot, receipt.created_by_slot_label_snapshot) as receipt_created_by_slot_label,
      registration.hotel_name_snapshot as registration_hotel_name,
      registration.room_label_snapshot as registration_room_label,
      registration.flight_label_snapshot as registration_flight_label,
      registration.rabatteur_name_snapshot as registration_rabatteur_name,
      registration.agreed_amount_dh as registration_agreed_amount_dh,
      payment.payment_number,
      payment.amount_dh,
      payment.registered_at as payment_registered_at,
      public.facturation_actor_display_name(payment.created_by_slot_number, payment.created_by_login_snapshot, payment.created_by_slot_label_snapshot) as payment_created_by_slot_label,
      operation.payment_mode,
      operation.usage_kind,
      operation.id as operation_id,
      operation.registered_at as operation_registered_at,
      operation.operation_amount_dh,
      instrument.instrument_reference,
      instrument.instrument_date,
      instrument.bank_name,
      instrument.payer_name,
      active_image.storage_bucket as image_storage_bucket,
      active_image.storage_path as image_storage_path,
      active_image.original_file_name as image_original_file_name,
      active_image.uploaded_at as image_uploaded_at,
      public.facturation_actor_display_name(active_image.uploaded_by_slot_number, active_image.uploaded_by_login_snapshot, active_image.uploaded_by_slot_label_snapshot) as image_uploaded_by_slot_label,
      payment.payment_snapshot_client_name as snapshot_client_name,
      payment.payment_snapshot_hotel_name as snapshot_hotel_name,
      payment.payment_snapshot_room_label as snapshot_room_label,
      payment.payment_snapshot_flight_label as snapshot_flight_label,
      payment.payment_snapshot_program_label as snapshot_program_label,
      payment.payment_snapshot_agreed_amount_dh as snapshot_agreed_amount_dh,
      payment.payment_snapshot_rabatteur_name as snapshot_rabatteur_name,
      payment.payment_snapshot_remaining_after_dh as snapshot_remaining_after_dh,
      payment.payment_snapshot_settled_after as snapshot_settled_after
    from public.billing_receipts as receipt
    join public.traveler_registrations as registration
      on registration.id = receipt.registration_id
    join public.receipt_payments as payment
      on payment.receipt_id = receipt.id
    join public.payment_allocations as allocation
      on allocation.receipt_payment_id = payment.id
    join public.payment_operations as operation
      on operation.id = allocation.payment_operation_id
    left join public.payment_instrument_details as instrument
      on instrument.payment_operation_id = operation.id
    left join public.payment_supporting_images as active_image
      on active_image.payment_operation_id = operation.id
      and active_image.deleted_at is null
    where receipt.season_id = p_season_id
      and (
        p_date_from is null or
        payment.registered_at >= p_date_from or
        operation.registered_at >= p_date_from
      )
      and (
        p_date_to is null or
        payment.registered_at <= p_date_to or
        operation.registered_at <= p_date_to
      )
  )
  select
    season.payment_id,
    season.receipt_id,
    season.receipt_number,
    season.lifecycle_status,
    season.traveler_first_name_snapshot,
    season.traveler_last_name_snapshot,
    season.receipt_created_by_slot_label,
    season.registration_hotel_name,
    season.registration_room_label,
    season.registration_flight_label,
    season.registration_rabatteur_name,
    season.registration_agreed_amount_dh,
    season.payment_number,
    season.amount_dh,
    season.payment_registered_at,
    season.payment_created_by_slot_label,
    season.payment_mode,
    season.usage_kind,
    season.operation_id,
    season.operation_registered_at,
    season.operation_amount_dh,
    season.instrument_reference,
    season.instrument_date,
    season.bank_name,
    season.payer_name,
    season.image_storage_bucket,
    season.image_storage_path,
    season.image_original_file_name,
    season.image_uploaded_at,
    season.image_uploaded_by_slot_label,
    season.snapshot_client_name,
    season.snapshot_hotel_name,
    season.snapshot_room_label,
    season.snapshot_flight_label,
    season.snapshot_program_label,
    season.snapshot_agreed_amount_dh,
    season.snapshot_rabatteur_name,
    season.snapshot_remaining_after_dh,
    season.snapshot_settled_after,
    pg_catalog.count(*) over () as total_rows
  from season_payments as season
  order by
    season.payment_registered_at desc,
    season.payment_id desc
  limit p_limit
  offset p_offset;
end;
$$;

-- list_billing_season_modifications — corps repris tel quel de la dernière définition (202608090012_expose_diff_in_modification_history.sql),
-- seul(s) le(s) libellé(s) d'auteur passe(nt) par facturation_actor_display_name().
create or replace function public.list_billing_season_modifications(
  p_season_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  modification_id uuid,
  receipt_id uuid,
  receipt_number integer,
  traveler_first_name_snapshot text,
  traveler_last_name_snapshot text,
  action_type text,
  section_code text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz,
  actor_slot_label text,
  total_rows bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_slot_number smallint;
  v_actor_auth_user_id uuid;
  v_actor_slot_label text;
  v_actor_login text;
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

  if p_season_id is null then
    raise exception 'Billing season modifications require a season id';
  end if;

  if p_limit is null or p_limit <= 0 or p_limit > 200 then
    raise exception 'Billing season modifications page limit must be between 1 and 200';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'Billing season modifications page offset must be non-negative';
  end if;

  if p_date_from is not null and p_date_to is not null and
     p_date_from > p_date_to then
    raise exception 'Billing season modifications date range is invalid';
  end if;

  return query
  with season_modifications as (
    select
      history.id as modification_id,
      receipt.id as receipt_id,
      receipt.receipt_number,
      registration.traveler_first_name_snapshot,
      registration.traveler_last_name_snapshot,
      history.action_type,
      history.section_code,
      history.reason,
      history.before_data,
      history.after_data,
      history.occurred_at,
      public.facturation_actor_display_name(history.actor_slot_number, history.actor_login_snapshot, history.actor_slot_label_snapshot) as actor_slot_label
    from public.facturation_action_history as history
    join public.billing_receipts as receipt
      on receipt.id = history.entity_id
    join public.traveler_registrations as registration
      on registration.id = receipt.registration_id
    where history.entity_type = 'billing_receipt'
      and history.action_type = any(public.billing_receipt_modification_action_types())
      and receipt.season_id = p_season_id
      and (p_date_from is null or history.occurred_at >= p_date_from)
      and (p_date_to is null or history.occurred_at <= p_date_to)
  )
  select
    season.modification_id,
    season.receipt_id,
    season.receipt_number,
    season.traveler_first_name_snapshot,
    season.traveler_last_name_snapshot,
    season.action_type,
    season.section_code,
    season.reason,
    season.before_data,
    season.after_data,
    season.occurred_at,
    season.actor_slot_label,
    pg_catalog.count(*) over () as total_rows
  from season_modifications as season
  order by
    season.occurred_at desc,
    season.modification_id desc
  limit p_limit
  offset p_offset;
end;
$$;

-- list_billing_receipt_history — corps repris tel quel de la dernière définition (202608090012_expose_diff_in_modification_history.sql),
-- seul(s) le(s) libellé(s) d'auteur passe(nt) par facturation_actor_display_name().
create or replace function public.list_billing_receipt_history(
  p_receipt_id uuid
)
returns table (
  history_id uuid,
  action_type text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz,
  actor_slot_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_slot_number smallint;
  v_actor_auth_user_id uuid;
  v_actor_slot_label text;
  v_actor_login text;
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

  if p_receipt_id is null then
    raise exception 'Receipt id is required';
  end if;

  -- L'acteur doit avoir accès au reçu comme n'importe quelle autre lecture
  -- (aucune policy RLS sur billing_receipts pour le navigateur : cette
  -- fonction SECURITY DEFINER est le seul chemin de lecture, comme
  -- get_billing_receipt_details).
  if not exists (
    select 1 from public.billing_receipts as receipt
    where receipt.id = p_receipt_id
  ) then
    raise exception 'Billing receipt not found';
  end if;

  return query
  select
    history.id as history_id,
    history.action_type,
    history.reason,
    history.before_data,
    history.after_data,
    history.occurred_at,
    public.facturation_actor_display_name(history.actor_slot_number, history.actor_login_snapshot, history.actor_slot_label_snapshot) as actor_slot_label
  from public.facturation_action_history as history
  where history.entity_type = 'billing_receipt'
    and history.entity_id = p_receipt_id
    and history.action_type = any(public.billing_receipt_modification_action_types())
  order by history.occurred_at desc, history.id desc;
end;
$$;

-- list_billing_receipts — corps repris tel quel de la dernière définition (202608090011_centralize_modification_action_types.sql),
-- seul(s) le(s) libellé(s) d'auteur passe(nt) par facturation_actor_display_name().
create or replace function public.list_billing_receipts(
  p_season_id uuid default null,
  p_created_from timestamptz default null,
  p_created_to timestamptz default null,
  p_lifecycle_status text default null,
  p_financial_status text default null,
  p_search_text text default null,
  p_dossier_id uuid default null,
  p_hotel_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  receipt_id uuid,
  season_id uuid,
  season_name_snapshot text,
  season_code_snapshot text,
  receipt_number integer,
  receipt_created_at timestamptz,
  lifecycle_status text,
  cancelled_at timestamptz,
  registration_id uuid,
  traveler_id uuid,
  dossier_id uuid,
  visible_dossier_reference text,
  traveler_first_name_snapshot text,
  traveler_last_name_snapshot text,
  traveler_phone_snapshot text,
  hotel_name_snapshot text,
  flight_label_snapshot text,
  room_label_snapshot text,
  room_bed_count_snapshot smallint,
  catalog_price_dh integer,
  maximum_discount_applied_dh integer,
  discount_amount_dh integer,
  agreed_amount_dh integer,
  payment_count bigint,
  total_paid_dh bigint,
  amount_due_dh bigint,
  overpayment_dh bigint,
  financial_status text,
  has_active_anomaly boolean,
  primary_anomaly_type text,
  primary_anomaly_amount_dh bigint,
  modification_count bigint,
  last_modified_at timestamptz,
  last_modified_by_slot_label text,
  last_modified_by_login text,
  last_modified_domain text,
  payment_operation_count bigint,
  has_cheque_missing_supporting_image boolean,
  registration_group_label text,
  registration_note text,
  registration_rabatteur_name text,
  receipt_created_by_slot_label text,
  last_payment_amount_dh integer,
  last_payment_mode text,
  total_rows bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_slot_number smallint;
  v_actor_auth_user_id uuid;
  v_actor_slot_label text;
  v_actor_login text;
  v_search_text text;
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

  if p_limit is null or p_limit <= 0 or p_limit > 200 then
    raise exception 'Billing receipt page limit must be between 1 and 200';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'Billing receipt page offset must be non-negative';
  end if;

  if p_created_from is not null and p_created_to is not null and
     p_created_from > p_created_to then
    raise exception 'Billing receipt date range is invalid';
  end if;

  if p_lifecycle_status is not null and
     p_lifecycle_status not in ('active', 'cancelled') then
    raise exception 'Billing receipt lifecycle status is invalid';
  end if;

  if p_financial_status is not null and
     p_financial_status not in ('incomplete', 'paid', 'overpaid') then
    raise exception 'Billing receipt financial status is invalid';
  end if;

  v_search_text := nullif(pg_catalog.btrim(p_search_text), '');

  return query
  with payment_summary as (
    select
      payment.receipt_id,
      pg_catalog.count(*) as payment_count,
      coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint as total_paid_dh
    from public.receipt_payments as payment
    group by payment.receipt_id
  ),
  operation_summary as (
    select
      payment.receipt_id,
      pg_catalog.count(distinct operation.id) as operation_count,
      coalesce(
        pg_catalog.bool_or(
          operation.payment_mode = 'cheque' and
          active_image.id is null
        ),
        false
      ) as has_cheque_missing_image
    from public.receipt_payments as payment
    left join public.payment_allocations as allocation
      on allocation.receipt_payment_id = payment.id
    left join public.payment_operations as operation
      on operation.id = allocation.payment_operation_id
    left join public.payment_supporting_images as active_image
      on active_image.payment_operation_id = operation.id
      and active_image.deleted_at is null
    group by payment.receipt_id
  ),
  latest_payment as (
    select distinct on (payment.receipt_id)
      payment.receipt_id,
      payment.amount_dh as last_payment_amount_dh,
      operation.payment_mode as last_payment_mode
    from public.receipt_payments as payment
    left join public.payment_allocations as allocation
      on allocation.receipt_payment_id = payment.id
    left join public.payment_operations as operation
      on operation.id = allocation.payment_operation_id
    order by payment.receipt_id, payment.payment_number desc
  ),
  modification_events as (
    select history.*
    from public.facturation_action_history as history
    where history.entity_type = 'billing_receipt'
      and history.action_type = any(public.billing_receipt_modification_action_types())
  ),
  modification_summary as (
    select
      history.entity_id as receipt_id,
      pg_catalog.count(*) as modification_count
    from modification_events as history
    group by history.entity_id
  ),
  latest_modification as (
    select distinct on (history.entity_id)
      history.entity_id as receipt_id,
      history.occurred_at,
      history.actor_slot_label_snapshot,
      history.actor_login_snapshot,
      history.section_code
    from modification_events as history
    order by history.entity_id, history.occurred_at desc, history.id desc
  ),
  latest_commercial_modification as (
    select distinct on (history.entity_id)
      history.entity_id as receipt_id,
      history.after_data
    from public.facturation_action_history as history
    where history.entity_type = 'billing_receipt'
      and history.action_type = 'billing_receipt.commercial_data_updated'
    order by history.entity_id, history.occurred_at desc, history.id desc
  ),
  receipt_rows as (
    select
      receipt.id as receipt_id,
      receipt.season_id,
      registration.season_name_snapshot,
      registration.season_code_snapshot,
      receipt.receipt_number,
      receipt.created_at as receipt_created_at,
      receipt.lifecycle_status,
      cancellation.cancelled_at,
      receipt.registration_id,
      registration.traveler_id,
      registration.dossier_id,
      case
        when dossier.dossier_reference like 'technical:%' then null
        else dossier.dossier_reference
      end as visible_dossier_reference,
      registration.traveler_first_name_snapshot,
      registration.traveler_last_name_snapshot,
      registration.traveler_phone_snapshot,
      registration.hotel_name_snapshot,
      registration.flight_label_snapshot,
      registration.room_label_snapshot,
      registration.room_bed_count_snapshot,
      registration.catalog_price_dh,
      registration.maximum_discount_applied_dh,
      registration.discount_amount_dh,
      registration.agreed_amount_dh,
      coalesce(payment.payment_count, 0)::bigint as payment_count,
      coalesce(payment.total_paid_dh, 0)::bigint as total_paid_dh,
      coalesce(modification.modification_count, 0)::bigint
        as modification_count,
      latest_modification.occurred_at as last_modified_at,
      latest_modification.actor_slot_label_snapshot
        as last_modified_by_slot_label,
      latest_modification.actor_login_snapshot as last_modified_by_login,
      latest_modification.section_code as last_modified_domain,
      coalesce(operation.operation_count, 0)::bigint
        as payment_operation_count,
      coalesce(operation.has_cheque_missing_image, false)
        as has_cheque_missing_image,
      coalesce(
        latest_commercial.after_data @>
          '{"has_financial_anomaly": true}'::jsonb,
        false
      ) as latest_commercial_reported_anomaly,
      dossier.label as registration_group_label,
      registration.note as registration_note,
      registration.rabatteur_name_snapshot as registration_rabatteur_name,
      public.facturation_actor_display_name(receipt.created_by_slot_number, receipt.created_by_login_snapshot, receipt.created_by_slot_label_snapshot) as receipt_created_by_slot_label,
      latest_payment.last_payment_amount_dh,
      latest_payment.last_payment_mode
    from public.billing_receipts as receipt
    join public.traveler_registrations as registration
      on registration.id = receipt.registration_id
    join public.omra_dossiers as dossier
      on dossier.id = registration.dossier_id
    left join public.receipt_cancellations as cancellation
      on cancellation.receipt_id = receipt.id
    left join payment_summary as payment
      on payment.receipt_id = receipt.id
    left join operation_summary as operation
      on operation.receipt_id = receipt.id
    left join modification_summary as modification
      on modification.receipt_id = receipt.id
    left join latest_modification
      on latest_modification.receipt_id = receipt.id
    left join latest_commercial_modification as latest_commercial
      on latest_commercial.receipt_id = receipt.id
    left join latest_payment
      on latest_payment.receipt_id = receipt.id
  ),
  financial_rows as (
    select
      receipt.*,
      case
        when receipt.agreed_amount_dh::bigint > receipt.total_paid_dh
          then receipt.agreed_amount_dh::bigint - receipt.total_paid_dh
        else 0::bigint
      end as amount_due_dh,
      case
        when receipt.total_paid_dh > receipt.agreed_amount_dh::bigint
          then receipt.total_paid_dh - receipt.agreed_amount_dh::bigint
        else 0::bigint
      end as overpayment_dh
    from receipt_rows as receipt
  ),
  enriched_rows as (
    select
      receipt.*,
      case
        when receipt.amount_due_dh > 0 then 'incomplete'
        when receipt.overpayment_dh > 0 then 'overpaid'
        else 'paid'
      end as financial_status,
      (
        (
          receipt.latest_commercial_reported_anomaly and
          (receipt.amount_due_dh > 0 or receipt.overpayment_dh > 0)
        ) or receipt.has_cheque_missing_image
      ) as has_active_anomaly,
      case
        when receipt.latest_commercial_reported_anomaly and
             receipt.amount_due_dh > 0 then 'amount_due'
        when receipt.latest_commercial_reported_anomaly and
             receipt.overpayment_dh > 0 then 'overpayment'
        when receipt.has_cheque_missing_image
          then 'cheque_missing_supporting_image'
        else null
      end as primary_anomaly_type,
      case
        when receipt.latest_commercial_reported_anomaly and
             receipt.amount_due_dh > 0 then receipt.amount_due_dh
        when receipt.latest_commercial_reported_anomaly and
             receipt.overpayment_dh > 0 then receipt.overpayment_dh
        else null::bigint
      end as primary_anomaly_amount_dh
    from financial_rows as receipt
  ),
  filtered_rows as (
    select receipt.*
    from enriched_rows as receipt
    where (p_season_id is null or receipt.season_id = p_season_id)
      and (
        p_created_from is null or
        receipt.receipt_created_at >= p_created_from
      )
      and (
        p_created_to is null or
        receipt.receipt_created_at <= p_created_to
      )
      and (
        p_lifecycle_status is null or
        receipt.lifecycle_status = p_lifecycle_status
      )
      and (
        p_financial_status is null or
        receipt.financial_status = p_financial_status
      )
      and (p_dossier_id is null or receipt.dossier_id = p_dossier_id)
      and (
        p_hotel_id is null or
        exists (
          select 1
          from public.traveler_registrations as registration
          where registration.id = receipt.registration_id
            and registration.hotel_id = p_hotel_id
        )
      )
      and (
        v_search_text is null or
        receipt.receipt_number::text ilike '%' || v_search_text || '%' or
        receipt.traveler_first_name_snapshot
          ilike '%' || v_search_text || '%' or
        receipt.traveler_last_name_snapshot
          ilike '%' || v_search_text || '%' or
        coalesce(receipt.traveler_phone_snapshot, '')
          ilike '%' || v_search_text || '%' or
        coalesce(receipt.visible_dossier_reference, '')
          ilike '%' || v_search_text || '%' or
        exists (
          select 1
          from public.receipt_payments as searched_payment
          join public.payment_allocations as searched_allocation
            on searched_allocation.receipt_payment_id = searched_payment.id
          join public.payment_instrument_details as instrument
            on instrument.payment_operation_id =
              searched_allocation.payment_operation_id
          where searched_payment.receipt_id = receipt.receipt_id
            and instrument.instrument_reference
              ilike '%' || v_search_text || '%'
        )
      )
  )
  select
    receipt.receipt_id,
    receipt.season_id,
    receipt.season_name_snapshot,
    receipt.season_code_snapshot,
    receipt.receipt_number,
    receipt.receipt_created_at,
    receipt.lifecycle_status,
    receipt.cancelled_at,
    receipt.registration_id,
    receipt.traveler_id,
    receipt.dossier_id,
    receipt.visible_dossier_reference,
    receipt.traveler_first_name_snapshot,
    receipt.traveler_last_name_snapshot,
    receipt.traveler_phone_snapshot,
    receipt.hotel_name_snapshot,
    receipt.flight_label_snapshot,
    receipt.room_label_snapshot,
    receipt.room_bed_count_snapshot,
    receipt.catalog_price_dh,
    receipt.maximum_discount_applied_dh,
    receipt.discount_amount_dh,
    receipt.agreed_amount_dh,
    receipt.payment_count,
    receipt.total_paid_dh,
    receipt.amount_due_dh,
    receipt.overpayment_dh,
    receipt.financial_status,
    receipt.has_active_anomaly,
    receipt.primary_anomaly_type,
    receipt.primary_anomaly_amount_dh,
    receipt.modification_count,
    receipt.last_modified_at,
    receipt.last_modified_by_slot_label,
    receipt.last_modified_by_login,
    receipt.last_modified_domain,
    receipt.payment_operation_count,
    receipt.has_cheque_missing_image,
    receipt.registration_group_label,
    receipt.registration_note,
    receipt.registration_rabatteur_name,
    receipt.receipt_created_by_slot_label,
    receipt.last_payment_amount_dh,
    receipt.last_payment_mode,
    pg_catalog.count(*) over () as total_rows
  from filtered_rows as receipt
  order by
    receipt.receipt_created_at desc,
    receipt.season_id desc,
    receipt.receipt_number desc,
    receipt.receipt_id desc
  limit p_limit
  offset p_offset;
end;
$$;

-- list_billing_finance_print_events — corps repris tel quel de la dernière définition (202608120002_expose_verified_on_finance_print_list.sql),
-- seul(s) le(s) libellé(s) d'auteur passe(nt) par facturation_actor_display_name().
create or replace function public.list_billing_finance_print_events(
  p_season_id uuid,
  p_day date
)
returns table (
  print_number integer,
  movement_ids text[],
  row_count integer,
  printed_at timestamptz,
  printed_by_slot_label_snapshot text,
  verified boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform * from public.resolve_facturation_actor();

  return query
  select
    event.print_number,
    event.movement_ids,
    event.row_count,
    event.printed_at,
    public.facturation_actor_display_name(event.printed_by_slot_number, event.printed_by_login_snapshot, event.printed_by_slot_label_snapshot),
    event.verified
  from public.facturation_finance_print_events as event
  where event.season_id = p_season_id
    and event.day_key = p_day
  order by event.print_number;
end;
$$;

-- get_billing_finance_anomaly_acknowledgement — corps repris tel quel de la dernière définition (202608040003_create_finance_anomaly_acknowledgements.sql),
-- seul(s) le(s) libellé(s) d'auteur passe(nt) par facturation_actor_display_name().
create or replace function public.get_billing_finance_anomaly_acknowledgement(
  p_season_id uuid,
  p_day date
)
returns table (
  day_key date,
  movement_ids text[],
  acknowledged_at timestamptz,
  acknowledged_by_slot_label_snapshot text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform * from public.resolve_facturation_actor();

  return query
  select
    ack.day_key,
    ack.movement_ids,
    ack.acknowledged_at,
    public.facturation_actor_display_name(ack.acknowledged_by_slot_number, ack.acknowledged_by_login_snapshot, ack.acknowledged_by_slot_label_snapshot)
  from public.facturation_anomaly_acknowledgements as ack
  where ack.season_id = p_season_id
    and ack.day_key = p_day;
end;
$$;

-- get_billing_receipt_print_summary — corps repris tel quel de la dernière définition (202608040001_create_receipt_print_tracking.sql),
-- seul(s) le(s) libellé(s) d'auteur passe(nt) par facturation_actor_display_name().
create or replace function public.get_billing_receipt_print_summary(
  p_receipt_id uuid
)
returns table (
  receipt_id uuid,
  print_count integer,
  last_printed_at timestamptz,
  last_printed_by_slot_number smallint,
  last_printed_by_slot_label text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform * from public.resolve_facturation_actor();

  if not exists (
    select 1
    from public.billing_receipts as receipt
    where receipt.id = p_receipt_id
  ) then
    raise exception 'Receipt not found';
  end if;

  return query
  select
    p_receipt_id,
    coalesce(max(event.print_number), 0)::integer,
    (array_agg(event.printed_at order by event.print_number desc)
      filter (where event.id is not null))[1],
    (array_agg(event.printed_by_slot_number order by event.print_number desc)
      filter (where event.id is not null))[1],
    (array_agg(public.facturation_actor_display_name(event.printed_by_slot_number, event.printed_by_login_snapshot, event.printed_by_slot_label_snapshot) order by event.print_number desc)
      filter (where event.id is not null))[1]
  from public.billing_receipt_print_events as event
  where event.receipt_id = p_receipt_id;
end;
$$;

-- list_cash_register_refund_movements — corps repris tel quel de la dernière définition (202608040002_list_cash_register_refund_movements.sql),
-- seul(s) le(s) libellé(s) d'auteur passe(nt) par facturation_actor_display_name().
create or replace function public.list_cash_register_refund_movements(
  p_season_id uuid default null
)
returns table (
  movement_id uuid,
  receipt_id uuid,
  receipt_number integer,
  traveler_first_name_snapshot text,
  traveler_last_name_snapshot text,
  amount_dh integer,
  occurred_at timestamptz,
  created_by_slot_label_snapshot text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform * from public.resolve_facturation_actor();

  return query
  select
    movement.id,
    receipt.id,
    receipt.receipt_number,
    registration.traveler_first_name_snapshot,
    registration.traveler_last_name_snapshot,
    -- Le montant en base est négatif (sortie de caisse) ; le domaine
    -- Facturation attend un montant positif à soustraire de l'encaissé brut.
    (-movement.amount_dh)::integer,
    movement.occurred_at,
    public.facturation_actor_display_name(movement.created_by_slot_number, movement.created_by_login_snapshot, movement.created_by_slot_label_snapshot)
  from public.cash_register_movements as movement
  join public.receipt_cancellations as cancellation
    on cancellation.id = movement.cancellation_id
  join public.billing_receipts as receipt
    on receipt.id = cancellation.receipt_id
  join public.traveler_registrations as registration
    on registration.id = receipt.registration_id
  where p_season_id is null or receipt.season_id = p_season_id
  order by movement.occurred_at desc;
end;
$$;
