-- Trouvé en généralisant la correction de versement (2026-08-09,
-- 202608090009) : `list_billing_receipt_history` (202608090008, plus tôt
-- aujourd'hui) filtre `action_type in (...)` sur 5 valeurs précises, et
-- `billing_receipt.first_payment_method_corrected` n'en fait pas partie.
-- Toute correction de la méthode ou du montant d'un versement était donc
-- déjà invisible dans le journal détaillé du reçu, silencieusement exclue
-- avant même d'atteindre le client — pas seulement mal étiquetée. Corrigé
-- au passage puisque cette même migration touche directement le sujet
-- (traçabilité d'une correction de versement) que le commanditaire vient de
-- signaler comme prioritaire.
--
-- Les deux valeurs sont incluses : l'ancienne (`..._first_payment_...`, pour
-- que les corrections déjà enregistrées avant 202608090009 continuent de
-- s'afficher — l'historique est append-only, ces lignes ne sont jamais
-- réécrites) et la nouvelle (`..._payment_method_corrected`, désormais
-- produite par `correct_billing_receipt_payment_amount`).
--
-- CREATE OR REPLACE : signature et type de retour inchangés, seul le
-- filtre `action_type in (...)` du corps change.

create or replace function public.list_billing_receipt_history(
  p_receipt_id uuid
)
returns table (
  history_id uuid,
  action_type text,
  reason text,
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
    history.occurred_at,
    history.actor_slot_label_snapshot as actor_slot_label
  from public.facturation_action_history as history
  where history.entity_type = 'billing_receipt'
    and history.entity_id = p_receipt_id
    and history.action_type in (
      'billing_receipt.commercial_data_updated',
      'billing_receipt.identity_updated',
      'billing_receipt.phone_updated',
      'billing_receipt.note_updated',
      'billing_receipt.dossier_updated',
      'billing_receipt.first_payment_method_corrected',
      'billing_receipt.payment_method_corrected'
    )
  order by history.occurred_at desc, history.id desc;
end;
$$;

revoke execute on function public.list_billing_receipt_history(uuid)
  from public, anon;

grant execute on function public.list_billing_receipt_history(uuid)
  to authenticated;
