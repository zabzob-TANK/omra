-- Demande du commanditaire (2026-08-09, priorité absolue) — reproduite en
-- production : un reçu avec deux versements de 5 000 DH, erreur de saisie
-- sur le SECOND. `correct_billing_receipt_first_payment_method`
-- (202608030006) ne sait viser que `payment_number = 1` : toute erreur sur
-- le 2ᵉ, 3ᵉ... 6ᵉ versement était incorrigible, sauf à fausser un versement
-- qui, lui, était juste. La règle d'accès ne change pas : administrateur
-- (slot 1) seul pour le montant ; un employé (slots 2-6) ne corrige que la
-- méthode et l'instrument, jamais le montant (reprise.md §5.9).
--
-- Réponse aux quatre questions posées avant ce code :
--
-- 1. Élargissement de la fonction existante, pas une nouvelle. Son corps
--    était déjà générique (gestion d'opération partagée, R-32, historique)
--    à l'exception d'une seule ligne (`payment_number = 1`, ci-dessous
--    remplacée par le paramètre `p_payment_number`) et d'un plafond imprécis
--    (point 2). Aucune autre logique ne dépendait de « le premier ».
--
-- 2. L'instantané figé (`payment_snapshot_*`, R-14/§5.7) du versement
--    corrigé n'est PAS réécrit ici, exactement comme avant : cette fonction
--    ne touche jamais `receipt_payments.*_snapshot_*`, seulement
--    `amount_dh` et les colonnes de méthode/opération. Les versements
--    SUIVANTS ne sont pas non plus touchés : leur instantané reste la
--    photographie de ce qui était vrai à LEUR propre moment (leur
--    `remaining_after_dh` d'origine ne change jamais). Le reste dû COURANT
--    du reçu n'est jamais lu depuis un instantané — il est recalculé à
--    chaque lecture depuis la somme réelle des `receipt_payments.amount_dh`
--    stockés (voir `list_billing_receipt_details`/`get_billing_receipt_details`,
--    déjà ainsi avant cette migration). Corriger un versement change donc
--    immédiatement l'état courant affiché, sans aucune cascade de
--    recalcul sur les instantanés des autres versements : il n'y en a pas
--    besoin, ils n'ont jamais été la source du courant.
--
-- 3. Un versement déjà rattaché à une opération bancaire partagée suit
--    exactement le même chemin que pour le 1er versement (§5.8, R-53) :
--    l'opération déjà utilisée garde son montant total, son payeur et sa
--    référence verrouillés — seul le montant ALLOUÉ par CE versement à
--    l'intérieur de l'opération change (recalculé, jamais stocké
--    séparément), avec confirmation explicite si le nouveau montant crée un
--    dépassement de l'opération (R-32, `p_confirm_over_allocation`).
--
-- 4. Corrections déjà enregistrées sous l'ancienne fonction (action_type
--    `billing_receipt.first_payment_method_corrected`) : elles restent en
--    l'état dans `facturation_action_history`, jamais réécrites — l'historique
--    est append-only. `202608090010_include_payment_correction_in_receipt_history.sql`
--    garde ce type d'action dans la liste lue par
--    `list_billing_receipt_history` pour qu'elles continuent de s'afficher.
--    La fonction elle-même est remplacée : `correct_billing_receipt_first_payment_method`
--    est supprimée (jamais modifiée en place, une migration déjà appliquée
--    ne se réécrit pas) et remplacée par `correct_billing_receipt_payment_amount`,
--    seule désormais appelée par le domaine.
--
-- CORRECTIF DE PLAFOND (le second point signalé par le commanditaire au
-- passage) : la version précédente plafonnait au `agreed_amount_dh` COMPLET,
-- pas au réellement disponible. Avec un seul versement enregistré, les deux
-- coïncidaient — d'où l'absence de symptôme jusqu'ici. Avec plusieurs
-- versements, plafonner au convenu total aurait laissé passer un
-- dépassement réel (ex. convenu 10 000, versement A déjà 6 000, corriger le
-- versement B à 5 000 aurait été accepté à tort : 6 000 + 5 000 > 10 000).
-- Le plafond correct, et celui appliqué ici, est
-- `agreed_amount_dh − somme(autres versements)` — jamais le seul convenu.
-- Reproduit côté domaine dans `edit-sections.ts` (`preparerModification`,
-- disponibleCentimes) ; cette fonction reste l'autorité finale.
--
-- Préparée et testée en BEGIN...ROLLBACK avant push (fusion.md §12, §14).

drop function if exists public.correct_billing_receipt_first_payment_method(
  uuid,
  text,
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
);

create function public.correct_billing_receipt_payment_amount(
  p_receipt_id uuid,
  p_payment_number integer,
  p_reason text,
  p_new_amount_dh integer,
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
  receipt_payment_id uuid,
  previous_payment_operation_id uuid,
  payment_operation_id uuid,
  payment_mode text,
  usage_kind text,
  previous_payment_amount_dh integer,
  payment_amount_dh integer,
  total_paid_dh bigint,
  receipt_remaining_dh bigint,
  operation_allocated_total_dh bigint,
  operation_remaining_dh bigint,
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
  v_receipt_number integer;
  v_receipt_status text;
  v_registration_id uuid;
  v_agreed_amount_dh integer;
  v_payment_id uuid;
  v_payment_amount_dh integer;
  v_other_payments_total_dh bigint;
  v_available_dh bigint;
  v_amount_changed boolean;
  v_method_unchanged boolean;
  v_keep_same_operation boolean;
  v_total_paid_dh bigint;
  v_receipt_remaining_dh bigint;
  v_allocation_id uuid;
  v_previous_operation_id uuid;
  v_previous_mode text;
  v_previous_usage text;
  v_previous_operation_amount_dh integer;
  v_previous_reference text;
  v_previous_bank text;
  v_previous_date date;
  v_previous_payer text;
  v_previous_allocated_total_dh bigint;
  v_previous_remaining_before_dh bigint;
  v_previous_remaining_after_dh bigint;
  v_previous_evidence jsonb;
  v_operation_id uuid;
  v_operation_mode text;
  v_operation_usage text;
  v_operation_amount_dh integer;
  v_operation_reference text;
  v_operation_bank text;
  v_operation_date date;
  v_operation_payer text;
  v_allocated_before_dh bigint := 0;
  v_allocated_after_dh bigint;
  v_remaining_before_dh bigint;
  v_remaining_after_dh bigint;
  v_create_operation boolean := false;
  v_over_allocation boolean := false;
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

  if p_payment_number is null or p_payment_number not between 1 and 6 then
    raise exception 'Payment number must be between 1 and 6';
  end if;

  if p_reason is null or pg_catalog.btrim(p_reason) = '' then
    raise exception 'Modification reason is required';
  end if;

  select
    receipt.receipt_number,
    receipt.lifecycle_status,
    receipt.registration_id
  into
    v_receipt_number,
    v_receipt_status,
    v_registration_id
  from public.billing_receipts as receipt
  where receipt.id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;

  if v_receipt_status <> 'active' then
    raise exception 'Cancelled receipt cannot be modified';
  end if;

  select registration.agreed_amount_dh
  into v_agreed_amount_dh
  from public.traveler_registrations as registration
  where registration.id = v_registration_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;

  select payment.id, payment.amount_dh
  into v_payment_id, v_payment_amount_dh
  from public.receipt_payments as payment
  where payment.receipt_id = p_receipt_id
    and payment.payment_number = p_payment_number
  for update;

  if not found then
    raise exception 'Receipt payment not found';
  end if;

  -- §4.2, §5.9 — seul l'administrateur peut corriger le montant. Toute autre
  -- valeur transmise (y compris la valeur inchangée) ne requiert pas ce rôle.
  if p_new_amount_dh is null or p_new_amount_dh <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  -- Décision actée le 2026-08-03, confirmée et précisée le 2026-08-09 :
  -- cette correction ne peut jamais créer de trop-perçu. Avec plusieurs
  -- versements, le plafond correct est le convenu MOINS les AUTRES
  -- versements déjà enregistrés — jamais le seul convenu total, qui
  -- laisserait passer un dépassement réel dès qu'un autre versement occupe
  -- déjà une part du convenu. Un vrai trop-perçu ne peut venir que d'un
  -- chèque ou virement partagé confirmé (dépassement explicitement
  -- confirmé, R-32), jamais d'une correction de versement. Voir fusion.md §14.
  select coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
  into v_other_payments_total_dh
  from public.receipt_payments as payment
  where payment.receipt_id = p_receipt_id
    and payment.payment_number <> p_payment_number;

  v_available_dh := v_agreed_amount_dh::bigint - v_other_payments_total_dh;

  if p_new_amount_dh::bigint > v_available_dh then
    raise exception 'Payment amount cannot exceed the amount remaining after the other payments';
  end if;

  v_amount_changed := p_new_amount_dh <> v_payment_amount_dh;

  if v_amount_changed and v_actor_slot_number <> 1 then
    raise exception 'Administrator privileges are required';
  end if;

  select
    allocation.id,
    operation.id,
    operation.payment_mode,
    operation.usage_kind,
    operation.operation_amount_dh,
    instrument.instrument_reference,
    instrument.bank_name,
    instrument.instrument_date,
    instrument.payer_name
  into
    v_allocation_id,
    v_previous_operation_id,
    v_previous_mode,
    v_previous_usage,
    v_previous_operation_amount_dh,
    v_previous_reference,
    v_previous_bank,
    v_previous_date,
    v_previous_payer
  from public.payment_allocations as allocation
  inner join public.payment_operations as operation
    on operation.id = allocation.payment_operation_id
  left join public.payment_instrument_details as instrument
    on instrument.payment_operation_id = operation.id
  where allocation.receipt_payment_id = v_payment_id
  for update of allocation, operation;

  if not found then
    raise exception 'Payment operation is missing';
  end if;

  select coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
  into v_previous_allocated_total_dh
  from public.payment_allocations as allocation
  inner join public.receipt_payments as payment
    on payment.id = allocation.receipt_payment_id
  where allocation.payment_operation_id = v_previous_operation_id;

  v_previous_remaining_before_dh :=
    v_previous_operation_amount_dh::bigint - v_previous_allocated_total_dh;
  v_previous_remaining_after_dh :=
    v_previous_remaining_before_dh + v_payment_amount_dh;

  select pg_catalog.jsonb_build_object(
    'id', image.id,
    'storage_bucket', image.storage_bucket,
    'storage_path', image.storage_path,
    'original_file_name', image.original_file_name,
    'mime_type', image.mime_type,
    'file_size_bytes', image.file_size_bytes,
    'file_hash', image.file_hash,
    'uploaded_at', image.uploaded_at
  )
  into v_previous_evidence
  from public.payment_supporting_images as image
  where image.payment_operation_id = v_previous_operation_id
    and image.deleted_at is null;

  if p_payment_mode is null or
     p_payment_mode not in ('cash', 'cheque', 'transfer') then
    raise exception 'Invalid payment mode';
  end if;

  if p_usage_kind is null or p_usage_kind not in ('unique', 'shared') then
    raise exception 'Invalid payment usage';
  end if;

  v_has_instrument_input :=
    p_instrument_reference is not null or
    p_bank_name is not null or
    p_instrument_date is not null or
    p_payer_name is not null;

  -- §4.2 — « la méthode ne change pas » se décide indépendamment du montant :
  -- reproduit exactement les comparaisons de la version précédente, mais sans
  -- lever d'exception ici — seulement poser le drapeau.
  if p_existing_shared_operation_id is not null then
    v_method_unchanged := p_existing_shared_operation_id = v_previous_operation_id;
  elsif p_payment_mode = 'cash' then
    v_method_unchanged := v_previous_mode = 'cash' and v_previous_usage = 'unique';
  else
    v_method_unchanged :=
      v_previous_mode = p_payment_mode and
      v_previous_usage = p_usage_kind and
      pg_catalog.btrim(coalesce(v_previous_reference, '')) =
        pg_catalog.btrim(coalesce(p_instrument_reference, '')) and
      pg_catalog.btrim(coalesce(v_previous_bank, '')) =
        pg_catalog.btrim(coalesce(p_bank_name, '')) and
      v_previous_date = p_instrument_date and
      pg_catalog.btrim(coalesce(v_previous_payer, '')) =
        pg_catalog.btrim(coalesce(p_payer_name, '')) and
      (
        p_usage_kind = 'shared'
        and v_previous_operation_amount_dh = p_operation_amount_dh
        or p_usage_kind = 'unique'
      );
  end if;

  if v_method_unchanged and not v_amount_changed then
    raise exception 'No payment data changed';
  end if;

  v_keep_same_operation := v_method_unchanged;

  if v_keep_same_operation then
    -- §5.8 — une opération déjà utilisée garde son rattachement, son payeur
    -- et (si partagée) son montant total verrouillés : rien n'est recréé ni
    -- réattribué. Seul le montant du versement peut changer.
    v_operation_id := v_previous_operation_id;
    v_operation_mode := v_previous_mode;
    v_operation_usage := v_previous_usage;
    v_operation_reference := v_previous_reference;
    v_operation_bank := v_previous_bank;
    v_operation_date := v_previous_date;
    v_operation_payer := v_previous_payer;

    if v_previous_usage = 'unique' then
      -- Invariant déjà appliqué à la création : le montant d'une opération
      -- unique égale le paiement. Resynchronisé si le montant a changé.
      v_operation_amount_dh := p_new_amount_dh;
      v_allocated_before_dh := v_payment_amount_dh;
      v_allocated_after_dh := p_new_amount_dh;
      v_remaining_before_dh := 0;
      v_remaining_after_dh := 0;

      if v_amount_changed then
        update public.payment_operations
        set operation_amount_dh = p_new_amount_dh
        where id = v_operation_id;
      end if;
    else
      v_operation_amount_dh := v_previous_operation_amount_dh;
      v_allocated_before_dh := v_previous_allocated_total_dh;
      v_allocated_after_dh :=
        v_previous_allocated_total_dh - v_payment_amount_dh + p_new_amount_dh;
      v_remaining_before_dh :=
        v_operation_amount_dh::bigint - v_allocated_before_dh;
      v_remaining_after_dh :=
        v_operation_amount_dh::bigint - v_allocated_after_dh;
      v_over_allocation := v_allocated_after_dh > v_operation_amount_dh::bigint;

      if v_over_allocation and not coalesce(p_confirm_over_allocation, false) then
        raise exception 'Over-allocation confirmation is required';
      end if;

      if v_over_allocation then
        update public.payment_operations as operation
        set
          over_allocation_confirmed_at = v_action_at,
          over_allocation_confirmed_by_slot_number = v_actor_slot_number,
          over_allocation_confirmer_label_snapshot = v_actor_slot_label
        where operation.id = v_operation_id;
      end if;
    end if;
  elsif p_existing_shared_operation_id is not null then
    if p_payment_mode = 'cash' then
      raise exception 'Cash cannot reuse a payment operation';
    end if;

    if p_usage_kind <> 'shared' then
      raise exception 'Existing operation must be reused as shared';
    end if;

    if p_operation_amount_dh is not null or v_has_instrument_input then
      raise exception 'Existing shared operation data cannot be changed';
    end if;

    select
      operation.payment_mode,
      operation.usage_kind,
      operation.operation_amount_dh,
      instrument.instrument_reference,
      instrument.bank_name,
      instrument.instrument_date,
      instrument.payer_name
    into
      v_operation_mode,
      v_operation_usage,
      v_operation_amount_dh,
      v_operation_reference,
      v_operation_bank,
      v_operation_date,
      v_operation_payer
    from public.payment_operations as operation
    left join public.payment_instrument_details as instrument
      on instrument.payment_operation_id = operation.id
    where operation.id = p_existing_shared_operation_id
    for update of operation;

    if not found then
      raise exception 'Shared payment operation not found';
    end if;

    if v_operation_usage <> 'shared' or
       v_operation_mode not in ('cheque', 'transfer') or
       v_operation_reference is null then
      raise exception 'Shared payment operation is incompatible';
    end if;

    if p_payment_mode <> v_operation_mode then
      raise exception 'Payment mode does not match shared operation';
    end if;

    select coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
    into v_allocated_before_dh
    from public.payment_allocations as allocation
    inner join public.receipt_payments as payment
      on payment.id = allocation.receipt_payment_id
    where allocation.payment_operation_id = p_existing_shared_operation_id;

    v_operation_id := p_existing_shared_operation_id;
    v_allocated_after_dh := v_allocated_before_dh + p_new_amount_dh;
    v_remaining_before_dh :=
      v_operation_amount_dh::bigint - v_allocated_before_dh;
    v_remaining_after_dh :=
      v_operation_amount_dh::bigint - v_allocated_after_dh;
    v_over_allocation :=
      v_allocated_after_dh > v_operation_amount_dh::bigint;

    if v_over_allocation and
       not coalesce(p_confirm_over_allocation, false) then
      raise exception 'Over-allocation confirmation is required';
    end if;
  else
    v_create_operation := true;
    v_operation_mode := p_payment_mode;
    v_operation_usage := p_usage_kind;
    v_operation_reference := case
      when p_instrument_reference is null then null
      else pg_catalog.btrim(p_instrument_reference)
    end;
    v_operation_bank := case
      when p_bank_name is null then null
      else pg_catalog.btrim(p_bank_name)
    end;
    v_operation_date := p_instrument_date;
    v_operation_payer := case
      when p_payer_name is null then null
      else pg_catalog.btrim(p_payer_name)
    end;

    if p_payment_mode = 'cash' then
      if p_usage_kind <> 'unique' or v_has_instrument_input then
        raise exception 'Cash payment data is incompatible';
      end if;

      if p_operation_amount_dh is not null and
         p_operation_amount_dh <> p_new_amount_dh then
        raise exception 'Cash operation amount must equal payment';
      end if;

      v_operation_amount_dh := p_new_amount_dh;
      v_allocated_after_dh := p_new_amount_dh;
      v_remaining_after_dh := 0;
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
           p_operation_amount_dh <> p_new_amount_dh then
          raise exception 'Operation amount must equal payment';
        end if;

        v_operation_amount_dh := p_new_amount_dh;
        v_allocated_after_dh := p_new_amount_dh;
        v_remaining_after_dh := 0;
      else
        if p_operation_amount_dh is null or p_operation_amount_dh <= 0 then
          raise exception 'Shared operation amount must be positive';
        end if;

        v_operation_amount_dh := p_operation_amount_dh;
        v_allocated_after_dh := p_new_amount_dh;
        v_remaining_before_dh := v_operation_amount_dh;
        v_remaining_after_dh :=
          v_operation_amount_dh::bigint - p_new_amount_dh;
        v_over_allocation :=
          p_new_amount_dh > v_operation_amount_dh;

        if v_over_allocation and
           not coalesce(p_confirm_over_allocation, false) then
          raise exception 'Over-allocation confirmation is required';
        end if;
      end if;
    end if;
  end if;

  if v_create_operation then
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
      v_operation_mode,
      v_operation_usage,
      v_operation_amount_dh,
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      case when v_over_allocation then v_action_at else null end,
      case when v_over_allocation then v_actor_slot_number else null end,
      case when v_over_allocation then v_actor_slot_label else null end,
      v_action_at,
      v_action_at
    )
    returning id into v_operation_id;

    if v_operation_mode in ('cheque', 'transfer') then
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
        v_operation_id,
        pg_catalog.btrim(p_instrument_reference),
        pg_catalog.btrim(p_bank_name),
        p_instrument_date,
        pg_catalog.btrim(p_payer_name),
        v_action_at,
        v_action_at
      );
    end if;
  elsif not v_keep_same_operation and v_over_allocation then
    update public.payment_operations as operation
    set
      over_allocation_confirmed_at = v_action_at,
      over_allocation_confirmed_by_slot_number = v_actor_slot_number,
      over_allocation_confirmer_label_snapshot = v_actor_slot_label
    where operation.id = v_operation_id;
  end if;

  if not v_keep_same_operation then
    update public.payment_allocations as allocation
    set payment_operation_id = v_operation_id
    where allocation.id = v_allocation_id
      and allocation.payment_operation_id = v_previous_operation_id;

    if not found then
      raise exception 'Payment operation changed concurrently';
    end if;
  end if;

  if v_amount_changed then
    update public.receipt_payments
    set amount_dh = p_new_amount_dh
    where id = v_payment_id;
  end if;

  select coalesce(pg_catalog.sum(payment.amount_dh), 0)::bigint
  into v_total_paid_dh
  from public.receipt_payments as payment
  where payment.receipt_id = p_receipt_id;

  -- Un reste dû résultant d'une baisse du montant n'est jamais un refus,
  -- seulement une anomalie visible à la lecture — mais un trop-perçu ne peut
  -- plus survenir ici : p_new_amount_dh est plafonné à v_available_dh plus
  -- haut (décision du 2026-08-03, précisée le 2026-08-09, fusion.md §14).
  v_receipt_remaining_dh := case
    when v_agreed_amount_dh::bigint > v_total_paid_dh
      then v_agreed_amount_dh::bigint - v_total_paid_dh
    else 0::bigint
  end;

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
    'billing_receipt.payment_method_corrected',
    'payment',
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'receipt_number', v_receipt_number,
      'payment_id', v_payment_id,
      'payment_number', p_payment_number,
      'payment_amount_dh', v_payment_amount_dh,
      'payment_operation_id', v_previous_operation_id,
      'payment_mode', v_previous_mode,
      'usage_kind', v_previous_usage,
      'operation_amount_dh', v_previous_operation_amount_dh,
      'allocated_total_dh', v_previous_allocated_total_dh,
      'operation_remaining_dh', v_previous_remaining_before_dh,
      'instrument', case
        when v_previous_mode = 'cash' then null
        else pg_catalog.jsonb_build_object(
          'reference', v_previous_reference,
          'bank_name', v_previous_bank,
          'instrument_date', v_previous_date,
          'payer_name', v_previous_payer
        )
      end,
      'active_supporting_image', v_previous_evidence
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'receipt_number', v_receipt_number,
      'payment_id', v_payment_id,
      'payment_number', p_payment_number,
      'payment_amount_dh', p_new_amount_dh,
      'amount_changed', v_amount_changed,
      'amount_changed_by_slot_number',
        case when v_amount_changed then v_actor_slot_number else null end,
      'total_paid_dh', v_total_paid_dh,
      'receipt_remaining_dh', v_receipt_remaining_dh,
      'payment_operation_id', v_operation_id,
      'payment_mode', v_operation_mode,
      'usage_kind', v_operation_usage,
      'operation_amount_dh', v_operation_amount_dh,
      'allocated_total_dh', v_allocated_after_dh,
      'operation_remaining_dh', v_remaining_after_dh,
      'instrument', case
        when v_operation_mode = 'cash' then null
        else pg_catalog.jsonb_build_object(
          'reference', v_operation_reference,
          'bank_name', v_operation_bank,
          'instrument_date', v_operation_date,
          'payer_name', v_operation_payer
        )
      end,
      'over_allocation_confirmed', v_over_allocation
    ),
    v_action_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

  if not v_keep_same_operation then
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
      v_previous_operation_id,
      'payment_operation.allocation_reassigned',
      'payment',
      pg_catalog.btrim(p_reason),
      pg_catalog.jsonb_build_object(
        'receipt_id', p_receipt_id,
        'receipt_payment_id', v_payment_id,
        'allocated_total_dh', v_previous_allocated_total_dh,
        'operation_remaining_dh', v_previous_remaining_before_dh
      ),
      pg_catalog.jsonb_build_object(
        'receipt_id', p_receipt_id,
        'receipt_payment_id', v_payment_id,
        'replacement_payment_operation_id', v_operation_id,
        'allocated_total_dh',
          v_previous_allocated_total_dh - v_payment_amount_dh,
        'operation_remaining_dh', v_previous_remaining_after_dh
      ),
      v_action_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      v_correlation_id
    );

    if v_create_operation then
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
        v_operation_id,
        'payment_operation.created_by_payment_correction',
        'payment',
        pg_catalog.btrim(p_reason),
        null,
        pg_catalog.jsonb_build_object(
          'receipt_id', p_receipt_id,
          'receipt_payment_id', v_payment_id,
          'payment_amount_dh', p_new_amount_dh,
          'payment_mode', v_operation_mode,
          'usage_kind', v_operation_usage,
          'operation_amount_dh', v_operation_amount_dh,
          'allocated_total_dh', v_allocated_after_dh,
          'operation_remaining_dh', v_remaining_after_dh
        ),
        v_action_at,
        v_actor_slot_number,
        v_actor_auth_user_id,
        v_actor_slot_label,
        v_actor_login,
        v_correlation_id
      );
    else
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
        v_operation_id,
        'payment_operation.reused_by_payment_correction',
        'payment',
        pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object(
          'receipt_id', p_receipt_id,
          'allocated_total_dh', v_allocated_before_dh,
          'operation_remaining_dh', v_remaining_before_dh
        ),
        pg_catalog.jsonb_build_object(
          'receipt_id', p_receipt_id,
          'receipt_payment_id', v_payment_id,
          'payment_amount_dh', p_new_amount_dh,
          'allocated_total_dh', v_allocated_after_dh,
          'operation_remaining_dh', v_remaining_after_dh
        ),
        v_action_at,
        v_actor_slot_number,
        v_actor_auth_user_id,
        v_actor_slot_label,
        v_actor_login,
        v_correlation_id
      );
    end if;
  end if;

  if v_over_allocation then
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
      v_operation_id,
      'payment_operation.over_allocation_confirmed',
      'payment',
      pg_catalog.btrim(p_reason),
      pg_catalog.jsonb_build_object(
        'receipt_id', p_receipt_id,
        'operation_amount_dh', v_operation_amount_dh,
        'allocated_total_dh', coalesce(v_allocated_before_dh, 0),
        'operation_remaining_dh', v_remaining_before_dh
      ),
      pg_catalog.jsonb_build_object(
        'receipt_id', p_receipt_id,
        'receipt_payment_id', v_payment_id,
        'payment_amount_dh', p_new_amount_dh,
        'allocated_total_dh', v_allocated_after_dh,
        'operation_remaining_dh', v_remaining_after_dh,
        'confirmed', true
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
    p_receipt_id,
    v_payment_id,
    v_previous_operation_id,
    v_operation_id,
    v_operation_mode,
    v_operation_usage,
    v_payment_amount_dh,
    p_new_amount_dh,
    v_total_paid_dh,
    v_receipt_remaining_dh,
    v_allocated_after_dh,
    v_remaining_after_dh,
    v_over_allocation;
end;
$$;

comment on function public.correct_billing_receipt_payment_amount(
  uuid,
  integer,
  text,
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
  'Corrects the method/operation and, for an administrator only, the amount of the payment designated by p_payment_number (1-6) — reprise.md §5.9, generalized 2026-08-09 from correct_billing_receipt_first_payment_method which could only target payment 1. Method and amount can change independently; an already-used operation keeps its own total amount and payer locked (§5.8) when only the payment amount changes. The corrected amount can never exceed the agreed amount minus the OTHER payments already recorded — this correction must never create an overpayment; a genuine overpayment can only come from a confirmed shared cheque/transfer over-allocation (R-32), never from this correction. A shortfall resulting from a decrease is not blocked, only visible at read time. Frozen payment snapshots (payment_snapshot_*) are never rewritten, on this payment or any other. The previous operation and evidence remain stored, and complete before/after snapshots are appended to the Facturation history.';

revoke execute on function public.correct_billing_receipt_payment_amount(
  uuid,
  integer,
  text,
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
) from public, anon;

grant execute on function public.correct_billing_receipt_payment_amount(
  uuid,
  integer,
  text,
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
) to authenticated;
