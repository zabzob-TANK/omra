-- Lot Finance (fusion.md §5, étape 4a) — fonction de lecture seule, additive.
-- Aucune nouvelle table : `cash_register_movements` existe déjà depuis
-- 202608010006 (annulation avec remboursement espèces). Cette fonction se
-- contente de l'exposer, jointe au reçu et au voyageur, pour alimenter le
-- journal financier (Finance) et le suivi journalier du module Facturation.
--
-- reprise.md §5.3 — un écran ne mélange jamais les saisons : le filtre
-- `p_season_id` est obligatoire côté appelant (le code applicatif résout
-- toujours la saison active avant d'appeler cette fonction), `null` reste
-- accepté ici uniquement pour permettre un usage administratif ponctuel hors
-- périmètre de cette étape.
create function public.list_cash_register_refund_movements(
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
    movement.created_by_slot_label_snapshot
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

comment on function public.list_cash_register_refund_movements(uuid) is
  'Lecture seule des sorties de caisse réelles liées à une annulation de reçu (remboursement espèces), filtrées par saison. Alimente le journal financier et le suivi journalier — ne modifie jamais cash_register_movements.';

revoke execute on function public.list_cash_register_refund_movements(uuid)
  from public, anon;

grant execute on function public.list_cash_register_refund_movements(uuid)
  to authenticated;
