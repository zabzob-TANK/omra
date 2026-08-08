-- Décision téléphone (2026-08-08) : un seul format stocké, 10 chiffres
-- bruts, plus jamais la mise en forme `0XXX-XX.XX.XX` de l'écran. C'est
-- l'asymétrie entre la création (aucune validation de format, stockait la
-- valeur mise en forme telle quelle) et la modification (exigeait déjà 10
-- chiffres bruts via `update_billing_receipt_personal_data`) qui refusait
-- systématiquement la correction d'un téléphone existant.
--
-- Les deux colonnes concernées contenaient à 100 % (63/63 lignes de test,
-- vérifié avant d'écrire cette migration) le format mis en forme par
-- l'écran — jamais de chiffres bruts, jamais un mélange. Cette migration les
-- normalise une bonne fois, puis verrouille le format avec une contrainte :
-- plus aucune ligne, ancienne ou future, ne pourra reproduire le mélange que
-- le commanditaire a explicitement refusé.

update public.travelers
set current_phone = regexp_replace(current_phone, '[^0-9]', '', 'g')
where current_phone is not null
  and current_phone !~ '^[0-9]{10}$';

update public.traveler_registrations
set traveler_phone_snapshot = regexp_replace(traveler_phone_snapshot, '[^0-9]', '', 'g')
where traveler_phone_snapshot is not null
  and traveler_phone_snapshot !~ '^[0-9]{10}$';

alter table public.travelers
  add constraint travelers_current_phone_format_check
  check (current_phone is null or current_phone ~ '^[0-9]{10}$');

alter table public.traveler_registrations
  add constraint traveler_registrations_phone_snapshot_format_check
  check (traveler_phone_snapshot is null or traveler_phone_snapshot ~ '^[0-9]{10}$');
