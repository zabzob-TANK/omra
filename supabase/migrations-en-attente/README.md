# Migrations en attente

Ce dossier n'est pas scanné par la CLI Supabase (`supabase db push` / `db
lint` / `migration list` ne lisent que `supabase/migrations/`). Les fichiers
ici sont volontairement **exclus du prochain déploiement**, sans être perdus
ni supprimés : ils reviendront dans `supabase/migrations/` sous une forme
différente lorsque leur tour viendra.

Déplacés le 2026-08-03, avant le déploiement des migrations de lecture
`202608030001` à `202608030003` (voir `docs/facturation/fusion.md` §8),
qui aurait sinon entraîné leur application en même temps sans que ce soit
voulu.

## `202608020003_create_receipt_print_tracking.sql` — déployée le 2026-08-04

Suivi des impressions (compteur incrémenté avant `window.print()`, R-84,
`reprise.md` §5.12). Déplacée vers
`supabase/migrations/202608040001_create_receipt_print_tracking.sql`, testée
en `BEGIN...ROLLBACK` puis poussée sans modification de son contenu SQL.
`incrementerImpressionsSupabase` (`modules/facturation/data/supabase/write.ts`)
appelle désormais réellement `record_billing_receipt_print`. Le bouton
« Imprimer » (`modules/facturation/ui/ecrans/recu.tsx`) n'est plus jamais
bloqué par un échec de ce compteur — l'impression a toujours lieu, l'erreur
éventuelle est affichée, jamais avalée (`sequenceImpression`,
`modules/facturation/ui/recu/donnees.ts`).

## `202608020004_correct_first_payment_method.sql` — repris et déplacé le 2026-08-03

Reprise à l'étape 8 du plan d'exécution (`fusion.md` §6/§12) : le fichier a
été déplacé vers `supabase/migrations/202608030006_correct_first_payment_method_admin_amount.sql`,
conforme désormais à `reprise.md` §5.9 (montant réservé à l'administrateur,
méthode/instrument ouverts à tout auteur actif). Préparé et testé en
`BEGIN...ROLLBACK`, **pas encore poussé** — voir `fusion.md` §12 pour l'état
exact et ce qui reste en attente de validation du commanditaire.
