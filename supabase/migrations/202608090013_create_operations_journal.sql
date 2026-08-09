-- Journal des opérations (سجل العمليات) — description complète du
-- commanditaire (2026-08-09), qui remplace toute description antérieure de
-- cet écran. La fenêtre existe déjà côté interface (R-86,
-- modules/facturation/ui/modales/journal.tsx), jamais branchée à
-- facturation_action_history jusqu'ici : seule la lecture manquait, la
-- donnée elle-même est déjà alimentée par chaque écriture depuis
-- 202608010002. Réservé à l'administrateur de facturation (poste 1) — les
-- postes 2 à 6 n'y ont pas accès.
--
-- Deux fonctions :
--   1. facturation_operations_journal_action_types() — catalogue unique des
--      action_type qui comptent comme une ligne du journal. Construite sur
--      billing_receipt_modification_action_types() (202608090011, les 7
--      types de modification) plutôt que de les recopier, comme demandé
--      explicitement : « sers-t'en, une seule définition ». Les 8 types
--      restants couvrent création de reçu, versement, annulation,
--      confirmation de dépassement, acquittement d'anomalie et impressions
--      (reçu + journal financier) — ces deux dernières écrivent déjà dans
--      facturation_action_history depuis 202608040001/202608040004, il n'y a
--      donc rien de plus à câbler côté écriture pour les faire apparaître ici.
--   2. list_billing_operations_journal(...) — lecture globale filtrée par
--      fenêtre de dates (le client résout la semaine lundi–dimanche),
--      employé et type d'action, paginée. Résout aussi, quand l'action porte
--      sur un reçu, son numéro et l'identité du client — receipt_payment et
--      payment_operation ne portent pas directement receipt_id en entity_id,
--      seulement dans leur JSON (même extraction que get_billing_receipt_details).
--
-- Les connexions (réussie, échouée, déconnexion, changement de mot de passe)
-- et les actions d'administration (saison, programme, comptes) restent hors
-- de cette migration — le commanditaire a demandé un rapport sur leurs
-- implications avant tout code sur ces deux parties.

create function public.facturation_operations_journal_action_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select public.billing_receipt_modification_action_types() || array[
    'billing_receipt.created',
    'billing_receipt.first_payment_added',
    'billing_receipt.payment_added',
    'billing_receipt.cancelled',
    'billing_receipt.receipt_printed',
    'payment_operation.over_allocation_confirmed',
    'facturation_finance_anomaly.anomaly_acknowledged',
    'facturation_finance_print.finance_journal_printed'
  ]::text[];
$$;

comment on function public.facturation_operations_journal_action_types() is
  'Single source of truth for which facturation_action_history.action_type values appear as a row in the operations journal (سجل العمليات, admin-only, R-86) — the 7 receipt-modification types from billing_receipt_modification_action_types() plus every other action_type worth its own journal row. Consulted by list_billing_operations_journal. Add a new type here, once, when a new journal-worthy write RPC is introduced.';

revoke all on function public.facturation_operations_journal_action_types()
  from public, anon, authenticated;

create function public.list_billing_operations_journal(
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_actor_slot_number smallint default null,
  p_action_type text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  id uuid,
  entity_type text,
  action_type text,
  section_code text,
  reason text,
  occurred_at timestamptz,
  actor_slot_number smallint,
  actor_slot_label text,
  actor_login text,
  before_data jsonb,
  after_data jsonb,
  correlation_id uuid,
  receipt_id uuid,
  receipt_number integer,
  traveler_first_name_snapshot text,
  traveler_last_name_snapshot text,
  total_rows bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Réservé à l'administrateur (poste 1) ; lève une exception explicite pour
  -- tout autre appelant. Aucun des champs résolus n'est utilisé plus bas
  -- (contrairement aux RPC d'écriture, cette lecture ne signe aucune ligne) :
  -- `perform`, pas de variables inutilisées à lint (cf. resolve_facturation_actor()
  -- dans get_billing_finance_anomaly_acknowledgement, même choix).
  perform * from public.require_facturation_admin();

  if p_date_from is null or p_date_to is null then
    raise exception 'Operations journal date range is required';
  end if;

  if p_date_from > p_date_to then
    raise exception 'Operations journal date range is invalid';
  end if;

  if p_limit is null or p_limit <= 0 or p_limit > 500 then
    raise exception 'Operations journal page limit must be between 1 and 500';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'Operations journal page offset must be non-negative';
  end if;

  if p_action_type is not null and
     not (p_action_type = any(public.facturation_operations_journal_action_types())) then
    raise exception 'Operations journal action type is invalid';
  end if;

  return query
  with journal_events as (
    select
      history.id,
      history.entity_type,
      history.entity_id,
      history.action_type,
      history.section_code,
      history.reason,
      history.occurred_at,
      history.actor_slot_number,
      history.actor_slot_label_snapshot as actor_slot_label,
      history.actor_login_snapshot as actor_login,
      history.before_data,
      history.after_data,
      history.correlation_id,
      -- billing_receipt porte directement le reçu en entity_id ; les deux
      -- autres entités (un versement, une opération de paiement) ne portent
      -- receipt_id que dans leur JSON — même extraction que
      -- get_billing_receipt_details (202608090011). Les entités de saison
      -- (anomalie, impression du journal financier) ne portent aucun reçu :
      -- resolved_receipt_id reste null, conforme à la demande du
      -- commanditaire (« quand l'action porte sur un reçu »).
      case
        when history.entity_type = 'billing_receipt' then history.entity_id
        when history.entity_type in ('receipt_payment', 'payment_operation') then
          coalesce(
            (history.after_data ->> 'receipt_id')::uuid,
            (history.before_data ->> 'receipt_id')::uuid
          )
        else null
      end as resolved_receipt_id
    from public.facturation_action_history as history
    where history.action_type = any(public.facturation_operations_journal_action_types())
      and history.occurred_at >= p_date_from
      and history.occurred_at <= p_date_to
      and (p_actor_slot_number is null or history.actor_slot_number = p_actor_slot_number)
      and (p_action_type is null or history.action_type = p_action_type)
  ),
  enriched_events as (
    select
      journal.*,
      receipt.receipt_number,
      registration.traveler_first_name_snapshot,
      registration.traveler_last_name_snapshot
    from journal_events as journal
    left join public.billing_receipts as receipt
      on receipt.id = journal.resolved_receipt_id
    left join public.traveler_registrations as registration
      on registration.id = receipt.registration_id
  )
  select
    events.id,
    events.entity_type,
    events.action_type,
    events.section_code,
    events.reason,
    events.occurred_at,
    events.actor_slot_number,
    events.actor_slot_label,
    events.actor_login,
    events.before_data,
    events.after_data,
    events.correlation_id,
    events.resolved_receipt_id,
    events.receipt_number,
    events.traveler_first_name_snapshot,
    events.traveler_last_name_snapshot,
    pg_catalog.count(*) over () as total_rows
  from enriched_events as events
  order by events.occurred_at desc, events.id desc
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.list_billing_operations_journal(timestamptz, timestamptz, smallint, text, integer, integer) is
  'Journal des opérations (سجل العمليات) — toutes les actions de facturation_action_history dans une fenêtre de dates (le client résout la semaine lundi–dimanche), filtrables par employé et par type d''action, paginées. Réservé à l''administrateur de facturation (require_facturation_admin) ; les postes 2 à 6 sont refusés avec une exception explicite.';

revoke execute on function public.list_billing_operations_journal(timestamptz, timestamptz, smallint, text, integer, integer)
  from public, anon;

grant execute on function public.list_billing_operations_journal(timestamptz, timestamptz, smallint, text, integer, integer)
  to authenticated;
