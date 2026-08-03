# Règles permanentes du projet Omra - Gestion 2027

## Projet officiel et infrastructure

- Ce dépôt est le projet officiel unique de Omra - Gestion 2027.
- Ne jamais créer ou recréer un autre dépôt GitHub, projet Vercel ou projet Supabase pour ce logiciel.
- Conserver et utiliser le dépôt GitHub, le projet Vercel et le projet Supabase existants.
- Préserver les variables d'environnement existantes et ne jamais écraser, exposer ou supprimer `.env.local`.
- Préserver `lib/supabase.ts` et réutiliser la configuration Supabase existante.
- Préserver la branche de sauvegarde et la branche `integration-administration`.

## Contexte fonctionnel

- L'ancien formulaire de la page `/`, la page `/tableau` et leur liste simple de personnes étaient uniquement un test technique temporaire.
- Ce test servait à valider GitHub, VS Code/Codex, Supabase, Vercel et la synchronisation entre PC et téléphone.
- Ces anciennes pages ne font pas partie du logiciel final. Ne pas les supprimer sans validation explicite.

## Ordre du développement

1. Administration
2. Facturation
3. Passeports et informations clients

- L'Administration est le cœur et la source de référence du système.
- Elle fournit les saisons, programmes, hôtels, chambres, vols, tarifs, comptes, rôles et paramètres aux autres modules.
- La Facturation est l'objectif métier principal du logiciel. Elle sera développée après stabilisation de l'Administration.
- Ne pas commencer la Facturation ou le module Passeports avant validation explicite de l'étape précédente.

## Méthode de travail

- Répondre en français.
- Travailler par petites étapes vérifiables et attendre la validation avant de poursuivre vers l'étape suivante.
- Ne supprimer aucun fichier ou élément fonctionnel sans validation explicite.
- Ne jamais commit, push, fusionner des branches ou déployer sans validation explicite.
- Ne jamais modifier directement `main`.
- Préserver les changements existants qui ne font pas partie de la tâche en cours.

## Règles d'interface et de données

- Conserver Accueil, Mode sombre et Déconnexion à leur emplacement validé dans l'interface d'administration.
- Tous les contenus arabes doivent utiliser une direction RTL et être alignés à droite.
- Tous les montants doivent être stockés, saisis et affichés sous forme de nombres entiers en DH, sans décimales.
- Ne pas remplacer une persistance existante ou migrer des données vers Supabase sans plan et validation préalables.

## Éléments à préserver impérativement

- Le dépôt GitHub existant.
- Le projet Vercel existant.
- Le projet Supabase existant.
- `.env.local` et les variables d'environnement existantes.
- `lib/supabase.ts`.
- La branche de sauvegarde.
- La branche `integration-administration`.
