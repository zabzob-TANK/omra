-- fusion.md §4.1 / reprise.md §5.10-§5.11 : la sortie de caisse d'une
-- annulation doit valoir exactement soit la totalité déjà payée sur le reçu,
-- soit 0 DH. cancel_billing_receipt (202608010010) acceptait jusqu'ici toute
-- valeur intermédiaire fournie par l'appelant (seule bornée par
-- 0 <= p_cash_outflow_amount_dh <= total payé) : une sortie partielle était
-- donc techniquement possible, alors que reprise.md l'interdit explicitement.
-- L'adaptateur d'écriture (fusion.md §9, point 5) applique déjà ce plafond
-- côté application ; cette migration le rend impossible à contourner même par
-- un appel RPC direct.
--
-- RÉGRESSION, pas un bug d'origine (même histoire que 202608030005, voir son
-- en-tête pour le détail complet). En écrivant cette migration à partir du
-- corps de la migration de création d'origine (202608010010), sans vérifier
-- l'état réellement déployé, une ambiguïté déjà corrigée avant cette session
-- par `202608010016_fix_billing_function_ambiguities.sql` a été réintroduite
-- silencieusement : cette fonction déclare aussi RETURNS TABLE(...,
-- lifecycle_status text, ...), et
--
--   update public.billing_receipts
--   set lifecycle_status = 'cancelled'
--   where id = p_receipt_id
--     and lifecycle_status = 'active';    -- clause WHERE ambiguë
--
-- référence `lifecycle_status` sans le qualifier. 202608010016 corrigeait
-- déjà ce point via `update public.billing_receipts as receipt ... where
-- receipt.id = p_receipt_id and receipt.lifecycle_status = 'active'`. Cette
-- migration réapplique la même qualification, plus `#variable_conflict
-- use_column` en tête du corps par défense supplémentaire — la fonction ne
-- lit ni n'écrit jamais ses paramètres de sortie autrement que par ses
-- variables `v_*` explicites, donc ce choix ne change aucun comportement
-- voulu. Découvert en testant cette migration en BEGIN...ROLLBACK contre la
-- base liée, avant tout push réel.
--
-- Signature, table de retour et privilèges inchangés : seule la validation de
-- p_cash_outflow_amount_dh se resserre. GRANT/REVOKE déjà posés par
-- 202608010010/202608010016 restent donc valables sans être répétés ici.
create or replace function public.cancel_billing_receipt(
  p_receipt_id uuid,
  p_reason text,
  p_cash_outflow_amount_dh integer
)
returns table (
  receipt_id uuid,
  season_id uuid,
  receipt_number integer,
  lifecycle_status text,
  payment_count integer,
  total_paid_dh integer,
  cancelled_amount_dh integer,
  cash_outflow_amount_dh integer,
  cancelled_at timestamptz
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
  v_registration_id uuid;
  v_receipt_season_id uuid;
  v_registration_season_id uuid;
  v_receipt_number integer;
  v_receipt_lifecycle_status text;
  v_agreed_amount_dh integer;
  v_payment_count integer;
  v_total_paid_sum_dh bigint;
  v_total_paid_dh integer;
  v_restitution_route text;
  v_cancellation_id uuid;
  v_cancelled_at timestamptz := pg_catalog.transaction_timestamp();
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

  if v_receipt_lifecycle_status = 'cancelled' then
    raise exception 'Receipt is already cancelled';
  end if;

  if v_receipt_lifecycle_status <> 'active' then
    raise exception 'Receipt state is incompatible with cancellation';
  end if;

  if exists (
    select 1
    from public.receipt_cancellations as existing_cancellation
    where existing_cancellation.receipt_id = p_receipt_id
  ) then
    raise exception 'Receipt is already cancelled';
  end if;

  select
    registration.season_id,
    registration.agreed_amount_dh
  into
    v_registration_season_id,
    v_agreed_amount_dh
  from public.traveler_registrations as registration
  where registration.id = v_registration_id
  for share;

  if not found or
     v_registration_season_id is distinct from v_receipt_season_id or
     v_agreed_amount_dh <= 0 then
    raise exception 'Receipt registration is missing or inconsistent';
  end if;

  if p_reason is null or pg_catalog.btrim(p_reason) = '' then
    raise exception 'Cancellation reason is required';
  end if;

  if p_cash_outflow_amount_dh is null or p_cash_outflow_amount_dh < 0 then
    raise exception 'Cash outflow amount must be zero or positive';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(payment.amount_dh), 0)
  into
    v_payment_count,
    v_total_paid_sum_dh
  from public.receipt_payments as payment
  where payment.receipt_id = p_receipt_id;

  if v_payment_count < 1 or v_total_paid_sum_dh <= 0 then
    raise exception 'Receipt has no payment to cancel';
  end if;

  if v_total_paid_sum_dh > 2147483647 then
    raise exception 'Receipt payment total is incompatible';
  end if;

  v_total_paid_dh := v_total_paid_sum_dh::integer;

  -- fusion.md §4.1 — plafond binaire : jamais de sortie partielle.
  if p_cash_outflow_amount_dh <> 0 and p_cash_outflow_amount_dh <> v_total_paid_dh then
    raise exception
      'Cash outflow amount must be exactly zero or the full total paid';
  end if;

  v_restitution_route := case
    when p_cash_outflow_amount_dh > 0 then 'cash_register'
    else 'outside_register'
  end;

  insert into public.receipt_cancellations (
    receipt_id,
    restitution_route,
    total_paid_at_cancellation_dh,
    reason,
    cancelled_at,
    cancelled_by_slot_number,
    cancelled_by_auth_user_id_snapshot,
    cancelled_by_slot_label_snapshot,
    cancelled_by_login_snapshot,
    created_at
  )
  values (
    p_receipt_id,
    v_restitution_route,
    v_total_paid_dh,
    p_reason,
    v_cancelled_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_cancelled_at
  )
  returning id into v_cancellation_id;

  update public.billing_receipts
  set lifecycle_status = 'cancelled'
  where id = p_receipt_id
    and billing_receipts.lifecycle_status = 'active';

  if not found then
    raise exception 'Receipt state changed during cancellation';
  end if;

  -- Ce mouvement enregistre la sortie de caisse réelle, désormais toujours
  -- égale au total payé lorsqu'elle est positive (plus jamais partielle). Une
  -- sortie nulle n'a pas de ligne de mouvement.
  if p_cash_outflow_amount_dh > 0 then
    insert into public.cash_register_movements (
      cancellation_id,
      movement_kind,
      amount_dh,
      occurred_at,
      created_by_slot_number,
      created_by_auth_user_id_snapshot,
      created_by_slot_label_snapshot,
      created_by_login_snapshot,
      created_at
    )
    values (
      v_cancellation_id,
      'cancellation_refund_outflow',
      -p_cash_outflow_amount_dh,
      v_cancelled_at,
      v_actor_slot_number,
      v_actor_auth_user_id,
      v_actor_slot_label,
      v_actor_login,
      v_cancelled_at
    );
  end if;

  -- Paiements, allocations, opérations de paiement, détails d'instrument,
  -- numérotation de reçu et compteurs saisonniers restent délibérément
  -- inchangés.
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
    'billing_receipt.cancelled',
    'receipt',
    p_reason,
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'season_id', v_receipt_season_id,
      'receipt_number', v_receipt_number,
      'lifecycle_status', v_receipt_lifecycle_status,
      'agreed_amount_dh', v_agreed_amount_dh,
      'payment_count', v_payment_count,
      'total_paid_dh', v_total_paid_dh
    ),
    pg_catalog.jsonb_build_object(
      'receipt_id', p_receipt_id,
      'cancellation_id', v_cancellation_id,
      'season_id', v_receipt_season_id,
      'receipt_number', v_receipt_number,
      'lifecycle_status', 'cancelled',
      'agreed_amount_dh', v_agreed_amount_dh,
      'payment_count', v_payment_count,
      'total_paid_dh', v_total_paid_dh,
      'cancelled_amount_dh', v_total_paid_dh,
      'cash_outflow_amount_dh', p_cash_outflow_amount_dh,
      'restitution_route', v_restitution_route,
      'reason', p_reason,
      'cancelled_at', v_cancelled_at
    ),
    v_cancelled_at,
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    v_correlation_id
  );

  return query
  select
    p_receipt_id,
    v_receipt_season_id,
    v_receipt_number,
    'cancelled'::text,
    v_payment_count,
    v_total_paid_dh,
    v_total_paid_dh,
    p_cash_outflow_amount_dh,
    v_cancelled_at;
end;
$$;

comment on function public.cancel_billing_receipt(uuid, text, integer) is
  'Cancels one active receipt atomically without deleting or changing its payments, allocations, payment operations, instrument details, seasonal number or counter. The cancelled amount is calculated from stored receipt payments; the client supplies only the actual cash-register outflow, which must be exactly zero or the full total paid (reprise.md §5.10-§5.11) — no partial outflow is accepted. Actor fields come only from resolve_facturation_actor(). Stable history action: billing_receipt.cancelled. Fixed 2026-08-03: #variable_conflict use_column (plus an explicit qualification on the lifecycle_status WHERE check) resolves an ambiguity against the RETURNS TABLE lifecycle_status output column that made every call fail.';
