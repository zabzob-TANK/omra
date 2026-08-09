-- Connexions dans le journal des opérations — demande du commanditaire
-- (2026-08-09) : connexion réussie, échec de connexion, déconnexion,
-- enregistrées dans facturation_action_history « comme tout le reste »,
-- jamais dans auth.audit_log_entries (rétention hors de notre contrôle,
-- table interne à la plateforme). Le changement de mot de passe est laissé
-- de côté : aucun mécanisme n'existe encore pour le déclencher.
--
-- Un échec de connexion n'a, par nature, aucune session (`auth.uid()` ne
-- résout rien) : impossible d'utiliser resolve_facturation_actor() ni
-- d'exiger un acteur pour cette ligne. Version la plus directe qui marche,
-- comme demandé plutôt qu'une conception élaborée :
--   1. actor_slot_number devient nullable (seule colonne à assouplir —
--      actor_slot_label_snapshot reste toujours renseignée, y compris pour
--      un échec, voir plus bas ; les autres colonnes actor_* étaient déjà
--      nullable).
--   2. record_facturation_login_failure(text) — pas de SECURITY sur
--      l'identité, accessible à `anon` (l'échec survient avant toute
--      session) ; note l'identifiant tenté, jamais le mot de passe, sur au
--      plus 254 caractères.
--   3. record_facturation_session_event(text) — réussite/déconnexion, une
--      session existe déjà à ce moment précis dans service.ts (la trace a
--      toujours lieu avant l'appel qui invalide la session), donc gardée
--      par resolve_facturation_actor() comme le reste du système.

alter table public.facturation_action_history
  alter column actor_slot_number drop not null;

create or replace function public.facturation_operations_journal_action_types()
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
    'facturation_finance_print.finance_journal_printed',
    'facturation_session.login_succeeded',
    'facturation_session.login_failed',
    'facturation_session.logout'
  ]::text[];
$$;

comment on function public.facturation_operations_journal_action_types() is
  'Single source of truth for which facturation_action_history.action_type values appear as a row in the operations journal (سجل العمليات, admin-only, R-86) — the 7 receipt-modification types from billing_receipt_modification_action_types() plus every other action type worth its own journal row, including the three session events added 2026-08-09. Consulted by list_billing_operations_journal. Add a new type here, once, when a new journal-worthy write RPC is introduced.';

create function public.record_facturation_session_event(
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_slot_number smallint;
  v_actor_auth_user_id uuid;
  v_actor_slot_label text;
  v_actor_login text;
begin
  if p_outcome not in ('login_succeeded', 'logout') then
    raise exception 'Invalid facturation session event outcome';
  end if;

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

  insert into public.facturation_action_history (
    entity_type,
    entity_id,
    action_type,
    section_code,
    occurred_at,
    actor_slot_number,
    actor_auth_user_id_snapshot,
    actor_slot_label_snapshot,
    actor_login_snapshot,
    correlation_id
  )
  values (
    'facturation_session',
    v_actor_auth_user_id,
    'facturation_session.' || p_outcome,
    'session',
    now(),
    v_actor_slot_number,
    v_actor_auth_user_id,
    v_actor_slot_label,
    v_actor_login,
    gen_random_uuid()
  );
end;
$$;

comment on function public.record_facturation_session_event(text) is
  'Records a login-succeeded or logout event for the currently authenticated Facturation account into facturation_action_history. Identity resolved exclusively via resolve_facturation_actor() — the session is still valid at call time in both cases (service.ts traces before invalidating on logout).';

revoke execute on function public.record_facturation_session_event(text)
  from public, anon;

grant execute on function public.record_facturation_session_event(text)
  to authenticated;

-- Aucune identité à résoudre : un échec de connexion n'a pas de session.
-- L'acteur reste donc null (actor_slot_number, assoupli plus haut) sauf
-- actor_slot_label_snapshot, toujours renseignée (contrainte existante
-- inchangée) avec une valeur littérale plutôt que null, pour que l'écran ne
-- confonde jamais « acteur inconnu » avec une chaîne vide.
create function public.record_facturation_login_failure(
  p_attempted_login text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.facturation_action_history (
    entity_type,
    entity_id,
    action_type,
    section_code,
    after_data,
    occurred_at,
    actor_slot_label_snapshot,
    correlation_id
  )
  values (
    'facturation_session',
    gen_random_uuid(),
    'facturation_session.login_failed',
    'session',
    pg_catalog.jsonb_build_object(
      'attempted_login',
      pg_catalog.left(coalesce(pg_catalog.btrim(p_attempted_login), ''), 254)
    ),
    now(),
    'غير معروف',
    gen_random_uuid()
  );
end;
$$;

comment on function public.record_facturation_login_failure(text) is
  'Records a failed Facturation login attempt into facturation_action_history — no session exists yet at this point, so no actor is resolved (actor_slot_number stays null). Stores only the attempted login identifier, truncated to 254 characters, never the attempted password. Callable by anon precisely because a failed attempt has no authenticated session; the worst-case abuse is journal noise, never a data read/write beyond this narrow insert.';

revoke execute on function public.record_facturation_login_failure(text)
  from public;

grant execute on function public.record_facturation_login_failure(text)
  to anon, authenticated;
