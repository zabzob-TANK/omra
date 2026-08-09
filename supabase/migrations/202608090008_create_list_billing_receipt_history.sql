-- Câblage oublié (2026-08-09) : `facturation_action_history` enregistre
-- déjà chaque modification d'un reçu (identité, téléphone, note, dossier,
-- programme/prix) — le compteur affiché sur le reçu (`modification_count`,
-- `list_billing_receipts`) en découle déjà. Mais rien n'exposait le DÉTAIL
-- de ces événements pour UN reçu donné : `mapReceiptDetailToRecu` renvoyait
-- toujours `modifications: []`, donc le journal détaillé du reçu (déjà
-- construit côté écran, `ModaleDetail`) restait en permanence vide et cette
-- section repliable ne s'affichait jamais, quel que soit le nombre réel de
-- modifications.
--
-- Additive : nouvelle RPC, aucune fonction existante modifiée. Mêmes 5
-- types d'action que `list_billing_receipts.modification_count` — la
-- cohérence entre le compteur déjà affiché et le nombre d'entrées ici est
-- volontaire, jamais un hasard.

create function public.list_billing_receipt_history(
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
      'billing_receipt.dossier_updated'
    )
  order by history.occurred_at desc, history.id desc;
end;
$$;

revoke execute on function public.list_billing_receipt_history(uuid)
  from public, anon;

grant execute on function public.list_billing_receipt_history(uuid)
  to authenticated;
