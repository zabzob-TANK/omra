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

## `202608020003_create_receipt_print_tracking.sql`

Suivi des impressions (compteur incrémenté avant `window.print()`, R-84,
`reprise.md` §5.12). N'a pas été revue dans le cadre du travail en cours.

**Retour prévu** : avec le lot du journal financier et de l'impression
(`fusion.md` §6, étape 9), une fois les tables et fonctions manquantes de
`fusion.md` §5 conçues ensemble.

## `202608020004_correct_first_payment_method.sql`

Contient `correct_billing_receipt_first_payment_method`. **Non conforme en
l'état** (`fusion.md` §4.2) : traite le montant du premier versement comme
immuable pour tous les auteurs, alors que la règle confirmée
(`reprise.md` §5.9) réserve cette correction à l'administrateur.

`list_reusable_payment_operations`, qui vivait initialement dans ce même
fichier, en a déjà été extraite et déployée séparément
(`202608030003_extract_list_reusable_payment_operations.sql`) : elle n'est
pas concernée par cette non-conformité.

**Retour prévu** : reprise à l'étape 8 du plan d'exécution (`fusion.md` §6),
pas avant. Ne pas déplacer ce fichier dans `supabase/migrations/` avant
cette reprise.
