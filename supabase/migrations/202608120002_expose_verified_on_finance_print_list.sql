-- Complète 202608120001 : `verified` a été ajoutée à
-- facturation_finance_print_events mais oubliée dans les colonnes
-- renvoyées par list_billing_finance_print_events — trouvé en écrivant le
-- code client qui en a besoin (ImpressionFinance.verifie), avant tout push
-- côté application. Additive, aucune donnée touchée.

-- `create or replace` ne suffit pas ici : Postgres refuse de changer le
-- type de retour d'une fonction existante (colonne ajoutée), il faut la
-- supprimer d'abord. Sûr : aucune autre fonction SQL n'appelle celle-ci en
-- interne, seul le client (`supabase.rpc(...)`) la lit.
drop function if exists public.list_billing_finance_print_events(uuid, date);

create function public.list_billing_finance_print_events(
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
    event.printed_by_slot_label_snapshot,
    event.verified
  from public.facturation_finance_print_events as event
  where event.season_id = p_season_id
    and event.day_key = p_day
  order by event.print_number;
end;
$$;

comment on function public.list_billing_finance_print_events(uuid, date) is
  'Liste toutes les impressions du journal financier pour une saison et un jour donnés, triées par numéro, avec leur statut de vérification (verified, reprise.md §5.17).';

revoke execute on function public.list_billing_finance_print_events(uuid, date)
  from public, anon;

grant execute on function public.list_billing_finance_print_events(uuid, date)
  to authenticated;
