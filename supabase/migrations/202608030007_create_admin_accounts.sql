-- Séparation étanche Facturation / Administration.
--
-- Jusqu'ici, « être Administration » signifiait « être le slot 1 » de
-- account_slots — la même table, la même identité que les 6 emplacements
-- Facturation. Cette table introduit une identité Administration totalement
-- distincte : aucune clé étrangère vers account_slots, aucun slot_number,
-- seulement un lien vers auth.users (partage inévitable : Supabase Auth est
-- unique par projet).
--
-- Purement additif : ne modifie ni ne lit account_slots. account_slots et le
-- slot 1 restent inchangés et continuent de fonctionner comme aujourd'hui
-- tant que le code applicatif n'est pas basculé dessus (étapes suivantes,
-- hors de cette migration).

create table public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id),
  login text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.admin_accounts is
  'Identité Administration, distincte des 6 emplacements Facturation (account_slots). Lue uniquement côté serveur via le rôle service_role (createAdminClient()) — aucun accès direct navigateur, RLS activée sans policy.';

alter table public.admin_accounts enable row level security;

-- Aucune policy : RLS activée sans policy équivaut à un refus par défaut pour
-- les rôles anon et authenticated. Seul service_role (qui contourne RLS)
-- peut lire cette table, exactement comme account_slots aujourd'hui.

revoke all on public.admin_accounts from public, anon, authenticated;
