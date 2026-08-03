-- RÉGRESSION, pas un bug d'origine — corrige une erreur introduite PAR CETTE
-- SESSION, découverte en testant 202608030004 en BEGIN...ROLLBACK contre la
-- base liée : tout appel réel à create_billing_receipt_with_first_payment
-- (donc aussi create_complete_facturation_receipt, qui la compose) échouait
-- systématiquement avec « column reference "season_id" is ambiguous ».
--
-- Cette même ambiguïté (RETURNS TABLE(..., season_id uuid, ...) crée un
-- paramètre de sortie implicite qui entre en conflit avec la colonne
-- `billing_receipt_counters.season_id` référencée sans qualification) avait
-- déjà été identifiée et corrigée AVANT cette session, par
-- `202608010017_fix_receipt_counter_season_ambiguity.sql` — qui qualifiait la
-- clause WHERE et utilisait `on conflict on constraint
-- billing_receipt_counters_pkey do nothing` pour contourner la cible `ON
-- CONFLICT (season_id)` (qui n'accepte pas de nom qualifié par la table).
--
-- `202608030001_add_receipt_payment_instant_snapshot.sql` (cette session,
-- étape 5 lecture) a fait un `create or replace function` sur cette même
-- fonction en partant du corps de la migration **d'origine**
-- (`202608010008`) pour y ajouter les colonnes d'instantané, sans vérifier
-- qu'une correction ultérieure (`202608010017`) existait déjà — regressant
-- ainsi silencieusement ce correctif déjà déployé. Cette migration corrige
-- de nouveau exactement le même point, en réappliquant le style de
-- 202608010017 (qualification explicite de la clause WHERE, `on conflict on
-- constraint billing_receipt_counters_pkey`), plus `#variable_conflict
-- use_column` en tête du corps par défense supplémentaire — la fonction ne
-- lit ni n'écrit jamais ses paramètres de sortie autrement que par ses
-- variables `v_*` explicites, donc ce choix ne change aucun comportement
-- voulu.
--
-- Leçon pour la suite : avant tout `create or replace function` sur une
-- fonction existante, vérifier d'abord son état réellement déployé
-- (`pg_get_functiondef` sur la base liée) plutôt que de partir du fichier de
-- la migration qui l'a créée à l'origine — d'autres migrations peuvent
-- l'avoir corrigée depuis. Voir fusion.md §11 pour le détail complet et sa
-- portée sur l'audit lecture seule (AUDIT-BACKEND.md).
--
-- Aucune autre fonction financière ne présente ce motif non corrigé
-- (vérifié par inspection de create_facturation_traveler_registration,
-- create_complete_facturation_receipt et add_billing_receipt_payment via
-- pg_get_functiondef sur la base liée). cancel_billing_receipt a subi la
-- même régression, réparée par 202608030004 (voir son en-tête).
--
-- Signature, table de retour, logique métier et privilèges inchangés —
-- GRANT/REVOKE déjà posés par 202608010008/202608010017 restent valables.
create or replace function public.create_billing_receipt_with_first_payment(
  p_registration_id uuid,
  p_first_payment_amount_dh integer,
  p_payment_mode text,
  p_usage_kind text,
  p_existing_shared_operation_id uuid default null,
  p_operation_amount_dh integer default null,
  p_instrument_reference text default null,
  p_bank_name text default null,
  p_instrument_date date default null,
  p_payer_name text default null,
  p_confirm_over_allocation boolean default false
)
returns table (
  receipt_id uuid,
  receipt_number integer,
  season_id uuid,
  first_payment_id uuid,
  payment_operation_id uuid,
  over_allocation_confirmed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor_slot_number smallint;
  v_actor_auth_user_id uuid;
  v_actor_slot_label text;
  v_actor_login text;
  v_season_id uuid;
  v_agreed_amount_dh integer;
  v_traveler_first_name_snapshot text;
  v_traveler_last_name_snapshot text;
  v_hotel_name_snapshot text;
  v_flight_label_snapshot text;
  v_room_label_snapshot text;
  v_rabatteur_name_snapshot text;
  v_payment_snapshot_client_name text;
  v_payment_snapshot_program_label text;
  v_remaining_after_dh integer;
  v_settled_after boolean;
  v_receipt_id uuid;
  v_receipt_number integer;
  v_first_payment_id uuid;
  v_payment_operation_id uuid;
  v_operation_payment_mode text;
  v_operation_usage_kind text;
  v_operation_amount_dh integer;
  v_allocated_before_dh bigint := 0;
  v_allocated_after_dh bigint;
  v_create_new_operation boolean := false;
  v_over_allocation_confirmed boolean := false;
  v_has_instrument_input boolean;
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

  if p_first_payment_amount_dh is null or p_first_payment_amount_dh <= 0 then
    raise exception 'First payment amount must be positive';
  end if;

  if p_payment_mode is null or
     p_payment_mode not in ('cash', 'cheque', 'transfer') then
    raise exception 'Invalid payment mode';
  end if;

  if p_usage_kind is null or p_usage_kind not in ('unique', 'shared') then
    raise exception 'Invalid payment usage';
  end if;

  select
    registration.season_id,
    registration.agreed_amount_dh,
    registration.traveler_first_name_snapshot,
    registration.traveler_last_name_snapshot,
    registration.hotel_name_snapshot,
    registration.flight_label_snapshot,
    registration.room_label_snapshot,
    registration.rabatteur_name_snapshot
  into
    v_season_id,
    v_agreed_amount_dh,
    v_traveler_first_name_snapshot,
    v_traveler_last_name_snapshot,
    v_hotel_name_snapshot,
    v_flight_label_snapshot,
    v_room_label_snapshot,
    v_rabatteur_name_snapshot
  from public.traveler_registrations as registration
  where registration.id = p_registration_id
  for update;

  if not found then
    raise exception 'Registration not found';
  end if;

  if exists (
    select 1
    from public.billing_receipts as existing_receipt
    where existing_receipt.registration_id = p_registration_id
  ) then
    raise exception 'Receipt already exists for this registration';
  end if;

  if v_agreed_amount_dh <= 0 then
    raise exception 'Agreed amount must be positive';
  end if;

  if p_first_payment_amount_dh > v_agreed_amount_dh then
    raise exception 'First payment exceeds agreed amount';
  end if;

  v_has_instrument_input :=
    p_instrument_reference is not null or
    p_bank_name is not null or
    p_instrument_date is not null or
    p_payer_name is not null;

  if p_existing_shared_operation_id is not null then
    if p_operation_amount_dh is not null or v_has_instrument_input then
      raise exception 'Existing shared operation data cannot be changed';
    end if;

    if p_usage_kind <> 'shared' then
      raise exception 'Existing operation must be reused as shared';
    end if;

    select
      operation.payment_mode,
      operation.usage_kind,
      operation.operation_amount_dh
    into
      v_operation_payment_mode,
      v_operation_usage_kind,
      v_operation_amount_dh
    from public.payment_operations as operation
    where operation.id = p_existing_shared_operation_id
    for update;

    if not found then
      raise exception 'Shared payment operation not found';
    end if;

    if v_operation_usage_kind <> 'shared' or
       v_operation_payment_mode not in ('cheque', 'transfer') then
      raise exception 'Shared payment operation is incompatible';
    end if;

    if p_payment_mode <> v_operation_payment_mode then
      raise exception 'Payment mode does not match shared operation';
    end if;

    if not exists (
      select 1
      from public.payment_instrument_details as instrument
      where instrument.payment_operation_id = p_existing_shared_operation_id
    ) then
      raise exception 'Shared payment operation is incomplete';
    end if;

    -- No receipt status or dossier filter is applied: cancelled allocations
    -- remain consumed and a shared operation can cross dossier boundaries.
    select coalesce(
      pg_catalog.sum(receipt_payment.amount_dh),
      0
    )
    into v_allocated_before_dh
    from public.payment_allocations as allocation
    inner join public.receipt_payments as receipt_payment
      on receipt_payment.id = allocation.receipt_payment_id
    where allocation.payment_operation_id = p_existing_shared_operation_id;

    v_payment_operation_id := p_existing_shared_operation_id;
    v_allocated_after_dh :=
      v_allocated_before_dh + p_first_payment_amount_dh;
    v_over_allocation_confirmed :=
      v_allocated_after_dh > v_operation_amount_dh::bigint;

    if v_over_allocation_confirmed and
       not coalesce(p_confirm_over_allocation, false) then
      raise exception 'Over-allocation confirmation is required';
    end if;
  else
    v_create_new_operation := true;
    v_operation_payment_mode := p_payment_mode;
    v_operation_usage_kind := p_usage_kind;
    v_allocated_after_dh := p_first_payment_amount_dh;

    if p_payment_mode = 'cash' then
      if p_usage_kind <> 'unique' or v_has_instrument_input then
        raise exception 'Cash payment data is incompatible';
      end if;

      if p_operation_amount_dh is not null and
         p_operation_amount_dh <> p_first_payment_amount_dh then
        raise exception 'Cash operation amount must equal first payment';
      end if;

      v_operation_amount_dh := p_first_payment_amount_dh;
    else
      if p_instrument_reference is null or
         pg_catalog.btrim(p_instrument_reference) = '' or
         p_bank_name is null or
         pg_catalog.btrim(p_bank_name) = '' or
         p_instrument_date is null or
         p_payer_name is null or
         pg_catalog.btrim(p_payer_name) = '' then
        raise exception 'Bank instrument details are required';
      end if;

      if p_usage_kind = 'unique' then
        if p_operation_amount_dh is not null and
           p_operation_amount_dh <> p_first_payment_amount_dh then
          raise exception 'Operation amount must equal first payment';
        end if;

        v_operation_amount_dh := p_first_payment_amount_dh;
      else
        if p_operation_amount_dh is null or p_operation_amount_dh <= 0 then
          raise exception 'Shared operation amount must be positive';
        end if;

        v_operation_amount_dh := p_operation_amount_dh;
        v_over_allocation_confirmed :=
          v_allocated_after_dh > v_operation_amount_dh::bigint;

        if v_over_allocation_confirmed and
           not coalesce(p_confirm_over_allocation, false) then
          raise exception 'Over-allocation confirmation is required';
        end if;
      end if;
    end if;
  end if;

  insert into public.billing_receipt_counters (
    season_id,
    next_number,
    created_at,
    updated_at
  )
  values (
    v_season_id,
    1,
    v_action_at,
    v_action_at
  )
  -- PostgreSQL conflict targets cannot use a qualified column name; the
  -- named primary-key constraint unambiguously targets
  -- billing_receipt_counters.season_id (même correction que 202608010017).
  on conflict on constraint billing_receipt_counters_pkey do nothing;

  select counter.next_number
  into strict v_receipt_number
  from public.billing_receipt_counters as counter
  where counter.season_id = v_season_id
  for update;

  if v_receipt_number < 1 then
    raise exception 'Receipt numbering is unavailable';
  end if;

  insert into public.billing_receipts (
    registration_id,
    season_id,
    receipt_number,
    lifecycle_status,
    created_by_slot_number,
    created_by_auth_user_id_snapshot,
    created_by_slot_label_snapshot,
    created_by_login_snapshot,
    created_at,
    updated_at
  )
  values (
    p_registration_id,
    v_season_id,
    v_receipt_number,
    'active',
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_action_at,
    v_action_at
  )
  returning id into v_receipt_id;

  -- Corrigé ici : `season_id` seul était ambigu contre le paramètre de sortie
  -- déclaré par RETURNS TABLE (voir l'en-tête de ce fichier).
  update public.billing_receipt_counters
  set next_number = v_receipt_number + 1
  where billing_receipt_counters.season_id = v_season_id;

  if not found then
    raise exception 'Receipt numbering is unavailable';
  end if;

  if v_create_new_operation then
    insert into public.payment_operations (
      payment_mode,
      usage_kind,
      operation_amount_dh,
      registered_at,
      created_by_slot_number,
      created_by_auth_user_id_snapshot,
      created_by_slot_label_snapshot,
      created_by_login_snapshot,
      over_allocation_confirmed_at,
      over_allocation_confirmed_by_slot_number,
      over_allocation_confirmer_label_snapshot,
      created_at,
      updated_at
    )
    values (
      v_operation_payment_mode,
      v_operation_usage_kind,
      v_operation_amount_dh,
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      case when v_over_allocation_confirmed then v_action_at else null end,
      case
        when v_over_allocation_confirmed then v_actor_slot_number
        else null
      end,
      case
        when v_over_allocation_confirmed then v_actor_slot_label
        else null
      end,
      v_action_at,
      v_action_at
    )
    returning id into v_payment_operation_id;

    if v_operation_payment_mode in ('cheque', 'transfer') then
      insert into public.payment_instrument_details (
        payment_operation_id,
        instrument_reference,
        bank_name,
        instrument_date,
        payer_name,
        created_at,
        updated_at
      )
      values (
        v_payment_operation_id,
        p_instrument_reference,
        p_bank_name,
        p_instrument_date,
        p_payer_name,
        v_action_at,
        v_action_at
      );
    end if;
  end if;

  -- Instantané figé du versement (reprise.md §5.7) : calculé une seule fois,
  -- ici, jamais recalculé ensuite.
  v_payment_snapshot_client_name :=
    v_traveler_first_name_snapshot || ' ' || v_traveler_last_name_snapshot;
  v_payment_snapshot_program_label :=
    v_hotel_name_snapshot || ' / غرفة ' || v_room_label_snapshot || ' / ' ||
    v_flight_label_snapshot;
  v_remaining_after_dh := v_agreed_amount_dh - p_first_payment_amount_dh;
  v_settled_after := v_remaining_after_dh <= 0;

  insert into public.receipt_payments (
    receipt_id,
    payment_number,
    amount_dh,
    registered_at,
    created_by_slot_number,
    created_by_auth_user_id_snapshot,
    created_by_slot_label_snapshot,
    created_by_login_snapshot,
    payment_snapshot_client_name,
    payment_snapshot_hotel_name,
    payment_snapshot_room_label,
    payment_snapshot_flight_label,
    payment_snapshot_program_label,
    payment_snapshot_agreed_amount_dh,
    payment_snapshot_rabatteur_name,
    payment_snapshot_remaining_after_dh,
    payment_snapshot_settled_after,
    created_at,
    updated_at
  )
  values (
    v_receipt_id,
    1,
    p_first_payment_amount_dh,
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_payment_snapshot_client_name,
    v_hotel_name_snapshot,
    v_room_label_snapshot,
    v_flight_label_snapshot,
    v_payment_snapshot_program_label,
    v_agreed_amount_dh,
    v_rabatteur_name_snapshot,
    v_remaining_after_dh,
    v_settled_after,
    v_action_at,
    v_action_at
  )
  returning id into v_first_payment_id;

  insert into public.payment_allocations (
    payment_operation_id,
    receipt_payment_id,
    allocated_at,
    allocated_by_slot_number,
    allocated_by_slot_label_snapshot,
    allocated_by_login_snapshot,
    created_at
  )
  values (
    v_payment_operation_id,
    v_first_payment_id,
    v_action_at,
    v_actor_slot_number,
    v_actor_slot_label,
    v_actor_login,
    v_action_at
  );

  if not v_create_new_operation and v_over_allocation_confirmed then
    update public.payment_operations
    set
      over_allocation_confirmed_at = v_action_at,
      over_allocation_confirmed_by_slot_number = v_actor_slot_number,
      over_allocation_confirmer_label_snapshot = v_actor_slot_label
    where id = v_payment_operation_id;

    if not found then
      raise exception 'Shared payment operation is unavailable';
    end if;
  end if;

  -- Stable action types emitted by this RPC:
  -- billing_receipt.created, billing_receipt.first_payment_added and
  -- payment_operation.over_allocation_confirmed.
  insert into public.facturation_action_history (
    entity_type,
    entity_id,
    action_type,
    section_code,
    after_data,
    occurred_at,
    actor_slot_number,
    actor_auth_user_id_snapshot,
    actor_slot_label_snapshot,
    actor_login_snapshot,
    correlation_id
  )
  values
  (
    'billing_receipt',
    v_receipt_id,
    'billing_receipt.created',
    'receipt',
    pg_catalog.jsonb_build_object(
      'receipt_id', v_receipt_id,
      'registration_id', p_registration_id,
      'season_id', v_season_id,
      'receipt_number', v_receipt_number,
      'lifecycle_status', 'active'
    ),
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  ),
  (
    'receipt_payment',
    v_first_payment_id,
    'billing_receipt.first_payment_added',
    'payment',
    pg_catalog.jsonb_build_object(
      'receipt_id', v_receipt_id,
      'payment_id', v_first_payment_id,
      'payment_number', 1,
      'amount_dh', p_first_payment_amount_dh,
      'payment_operation_id', v_payment_operation_id,
      'payment_mode', v_operation_payment_mode,
      'usage_kind', v_operation_usage_kind
    ),
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

  if v_over_allocation_confirmed then
    insert into public.facturation_action_history (
      entity_type,
      entity_id,
      action_type,
      section_code,
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
      v_payment_operation_id,
      'payment_operation.over_allocation_confirmed',
      'payment',
      pg_catalog.jsonb_build_object(
        'payment_operation_id', v_payment_operation_id,
        'receipt_id', v_receipt_id,
        'operation_amount_dh', v_operation_amount_dh,
        'allocated_before_dh', v_allocated_before_dh,
        'allocated_amount_dh', p_first_payment_amount_dh,
        'allocated_after_dh', v_allocated_after_dh,
        'remaining_amount_dh',
          v_operation_amount_dh::bigint - v_allocated_after_dh,
        'confirmation', true
      ),
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      v_correlation_id
    );
  end if;

  return query
  select
    v_receipt_id,
    v_receipt_number,
    v_season_id,
    v_first_payment_id,
    v_payment_operation_id,
    v_over_allocation_confirmed;
end;
$$;

comment on function public.create_billing_receipt_with_first_payment(
  uuid,
  integer,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  date,
  text,
  boolean
) is
  'Creates one seasonal receipt, its mandatory first payment, its payment operation and allocation atomically. Actor fields come only from resolve_facturation_actor(). Stable history actions are billing_receipt.created, billing_receipt.first_payment_added and payment_operation.over_allocation_confirmed. Fixed 2026-08-03: #variable_conflict use_column (plus an explicit qualification on the counter UPDATE) resolves an ambiguity between the RETURNS TABLE season_id output column and the billing_receipt_counters.season_id column, in both the ON CONFLICT target and the counter UPDATE, that made every call fail.';
