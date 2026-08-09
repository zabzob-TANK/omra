-- Décision téléphone, précisée le 2026-08-09 : la migration 202608080001
-- avait verrouillé le format sur 10 chiffres bruts (`^[0-9]{10}$`), sans
-- exiger que le préfixe `0` marocain soit le premier chiffre. Le
-- commanditaire a depuis figé la règle définitive : l'employé ne saisit que
-- les 9 chiffres qui suivent ce préfixe fixe, jamais le préfixe lui-même —
-- le format stocké doit donc être `^0[0-9]{9}$`, pas seulement 10 chiffres
-- quelconques.
--
-- 202608080001 est déjà appliquée en production : on ne la modifie jamais
-- (règle absolue du projet), on resserre la contrainte par une nouvelle
-- migration. Vérifié en lecture avant d'écrire celle-ci : les 64/64 lignes
-- non nulles de `travelers.current_phone` et de
-- `traveler_registrations.traveler_phone_snapshot` respectent déjà
-- `^0[0-9]{9}$` (elles le respectaient déjà sous l'ancienne contrainte, plus
-- large) — les `update` ci-dessous sont donc un filet de sécurité, pas une
-- correction de données réelles.

update public.travelers
set current_phone = regexp_replace(current_phone, '[^0-9]', '', 'g')
where current_phone is not null
  and current_phone !~ '^0[0-9]{9}$'
  and regexp_replace(current_phone, '[^0-9]', '', 'g') ~ '^0[0-9]{9}$';

update public.traveler_registrations
set traveler_phone_snapshot = regexp_replace(traveler_phone_snapshot, '[^0-9]', '', 'g')
where traveler_phone_snapshot is not null
  and traveler_phone_snapshot !~ '^0[0-9]{9}$'
  and regexp_replace(traveler_phone_snapshot, '[^0-9]', '', 'g') ~ '^0[0-9]{9}$';

alter table public.travelers
  drop constraint travelers_current_phone_format_check;

alter table public.travelers
  add constraint travelers_current_phone_format_check
  check (current_phone is null or current_phone ~ '^0[0-9]{9}$');

alter table public.traveler_registrations
  drop constraint traveler_registrations_phone_snapshot_format_check;

alter table public.traveler_registrations
  add constraint traveler_registrations_phone_snapshot_format_check
  check (traveler_phone_snapshot is null or traveler_phone_snapshot ~ '^0[0-9]{9}$');
