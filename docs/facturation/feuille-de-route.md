# Feuille de route — module Facturation

État et travaux à venir, tenus à jour au fil de la mise en service.
À lire avec `reprise.md` (règles métier) et `fusion.md` (portage).

Dernière mise à jour : 2026-08-04.

## État actuel

- Le module Facturation est **en ligne** : `https://omra-chi.vercel.app`
  (Vercel + Supabase, branche `integration-facturation`).
- **Cœur complet et fonctionnel sur la vraie base** : registre, création de
  reçu, versements, annulation, modification, reçu imprimable + impression,
  Finance (journal, suivi journalier, registre chèques/virements).
- **Deux mondes étanches** : Facturation (6 emplacements) et Administration
  (compte distinct), portes et logins séparés.
- **Vraie saison de production** créée : `عمرة رمضان 1448 هـ / 2027 م`, avec le
  vrai programme et les vrais tarifs (dépliant officiel).
- Robustesse : plus d'écran de plantage sur mauvais fichier / jeton périmé /
  aucune saison active.
- Accès actuellement protégé par la protection Vercel (préversion privée).

## À faire AVANT d'ouvrir aux employés

1. **Mots de passe forts** — remplacer les comptes de test (`testf`, `admin2`,
   mots de passe faibles) par de vrais mots de passe.
2. **Ouvrir l'accès public** — Vercel → Settings → Deployment Protection →
   désactiver « Vercel Authentication ». Le login de l'app protège alors les
   données.
3. **Ping anti-pause Supabase** — tâche planifiée gratuite (GitHub Actions)
   touchant la base tous les 4-5 jours, pour que le projet gratuit ne se mette
   jamais en veille pendant les périodes creuses. Sans coût.
4. **Autorisation par appareil — Facturation SEULEMENT** (voir spec ci-dessous).
5. **Bug de mélange des saisons** — `list_reusable_payment_operations` et le
   registre chèques/Finance ne filtrent pas par saison active. À corriger
   **avant de lancer une 2ᵉ saison** (latent tant qu'il n'y a qu'une saison).
   Nouvelle migration `p_season_id` + l'adaptateur passe la saison active +
   audit de tous les écrans Finance/Paiements/Suivi.

## Spécification — Autorisation par appareil (Facturation)

**But :** empêcher qu'un employé se connecte à la **Facturation** depuis un PC
non autorisé (chez lui, un cybercafé…). Ne concerne **pas** l'Administration
(porte perso du commanditaire, accessible d'où il veut). L'IP est écartée
(dynamique au Maroc) — on lie l'accès à l'**appareil**, pas au réseau.

**Méthode retenue (la plus simple) : jeton d'appareil posé par l'admin.**
1. Une table `facturation_authorized_devices` (jeton haché, libellé, date,
   actif, créé par).
2. Écran/action « **Autoriser cet appareil** », réservée à l'administrateur
   Facturation (slot 1) : sur un PC du bureau, l'admin se connecte une fois et
   autorise le poste → un jeton sécurisé (cookie httpOnly) est déposé sur ce PC
   et enregistré côté serveur.
3. À chaque accès Facturation, le serveur vérifie le jeton : **absent ou
   révoqué → accès refusé**, même avec un mot de passe correct.
4. Gestion dans l'Administration ou côté admin Facturation : voir la liste des
   appareils autorisés, en **révoquer** un (PC perdu, employé parti).

**Limites assumées :** lié au navigateur du PC (effacer les données du
navigateur oblige à ré-autoriser) ; barrière solide contre la vraie menace
(connexion depuis l'extérieur), pas du niveau militaire. Suffisant pour une
agence. Se marie avec la **session unique par compte**.

**Non retenu :** filtrage IP (IP dynamique au Maroc) ; certificats par PC
(trop lourds) ; Cloudflare Access (gardé en réserve si besoin de durcir).

## Plus tard / en attente d'une décision

- **Statistiques (écran)** — bloqué : le fichier de référence (R-91) ne
  spécifie aucun indicateur. Décision métier requise (quels indicateurs, quelle
  période, quelle formule) avant tout développement.
- **Session unique par compte** — un nouveau login invalide la session
  précédente du même compte. Prévu, non implémenté.
- **Déconnexion automatique par inactivité** — après un délai sans activité
  (30 min par exemple), déconnexion automatique plutôt que de laisser une
  session ouverte indéfiniment sur un poste quitté. Se branche sur la
  déconnexion déjà existante, indépendant du reste du code : réalisable à
  n'importe quelle étape sans préparation ni risque de conflit, pas
  nécessaire avant le déploiement. Se marie avec la session unique par
  compte et l'autorisation par appareil ci-dessus.
- **Export d'une saison archivée en Excel + purge définitive** — outil de
  maintenance : télécharger toute une saison finie puis la supprimer pour
  garder la base légère (admin seulement, export obligatoire avant purge,
  confirmation forte). Utile pour rester dans le gratuit sur la durée.
- **Enveloppe des Server Actions au clic** — quelques actions déclenchées par
  clic ne sont pas toutes protégées : une erreur vraiment inattendue y resterait
  silencieuse au lieu d'un message. Passage de finition avant lancement.
- **Modification du tag groupe/famille sur un reçu existant** — refusée
  proprement aujourd'hui ; `update_billing_receipt_dossier` ne correspond pas
  encore au tag libre du prototype. Décision produit non tranchée.

## Durcissements — règle appliquée par l'écran mais pas par le noyau

Cas où une règle métier n'est aujourd'hui vérifiée que côté interface (bouton
grisé, section masquée), jamais par la fonction du domaine elle-même. Sans
conséquence visible tant que l'écran reste le seul chemin d'accès, mais le
noyau est censé être la source de vérité indépendante de l'interface — à
ranger ici, pas à corriger dans l'urgence.

- **R-53, premier versement déjà partagé** — `domain/rules/edit-sections.ts`,
  `preparerModification()` (section `firstPayment`). `premierVersementModifiable()`
  exprime bien la règle (« un versement déjà rattaché à une opération
  partagée ne se détache pas depuis le reçu »), mais seule `modification.tsx`
  la consulte pour griser le bouton de section. La fonction du domaine ne
  l'appelle pas elle-même : si un jour un autre écran appelait
  `preparerModification()` directement, rien ne l'empêcherait de détacher un
  versement partagé. Identifié le 2026-08-06, non corrigé volontairement.

## Performance — non urgent, gain de vitesse seulement

Identifié le 2026-08-06 pendant une question de capacité (elle-même close :
le volume réel — un seul compte le plus souvent, une trentaine de clients au
moment du paiement final — ne pose aucun risque de quota Supabase Auth, voir
`reprise.md`). Les deux points ci-dessous n'ont **aucun rapport avec la
capacité** : ils ne réduiraient que le temps d'attente ressenti à chaque
enregistrement.

- **Doublon `getUser()` par action** — chaque action serveur de
  `app/facturation/actions.ts` appelle `requireActiveAccount()` (un
  `getUser()`), puis la fonction de `service.ts` qu'elle délègue appelle à son
  tour `source.session.utilisateurCourant()` (un second `getUser()`) — deux
  aller-retours réseau vers Supabase Auth pour la même identité, dans la même
  requête. Calculer l'identité une seule fois et la faire circuler supprimerait
  la moitié de ces appels, sans aucune conséquence de sécurité (l'identité ne
  change pas en cours de requête).
- **Rafraîchissement complet après un enregistrement** — après une création de
  reçu ou un versement réussi, `rafraichir()` recharge tout `chargerEtat()`
  (saison, hôtels, vols, chambres, rabatteurs, tarifs, **tous** les reçus,
  opérations, audit) alors que seul le reçu concerné a changé. Une mise à jour
  ciblée (ne remplacer que ce reçu dans l'état déjà en mémoire) éviterait de
  retélécharger l'intégralité du registre à chaque sauvegarde.

À faire quand un passage de finition sur la vitesse sera au programme, pas
avant.

> **Mise à jour du 2026-08-09** : ce chantier a fini par être mesuré (pas
> seulement supposé) — 129 appels réseau / 1125 ms pour charger Paiements/
> Journal financier/Suivi journalier sur 64 reçus, projeté à ~1001 appels à
> 500 reçus. Traité depuis, dans cet ordre :
> - **Fait et poussé** : Paiements, Journal financier et Suivi journalier
>   migrés vers des RPC de saison à plat (`list_billing_season_payments`,
>   `list_billing_season_modifications`) — plus de chargement complet des
>   reçus pour ces trois écrans. Un second N+1, côté écriture cette fois
>   (`contexteCommun()`, rechargeait tous les reçus à chaque création/
>   versement/annulation/modification), trouvé et corrigé au passage.
> - **Pas encore fait** : le registre (`etat.recus`) lui-même reste chargé
>   en bloc (le point « Rafraîchissement complet après un enregistrement »
>   ci-dessus reste donc entièrement d'actualité) — jugé trop risqué à
>   faire sans revue de jour (voir `RAPPORT-NUIT.md`, section « Sauté
>   volontairement »). Le doublon `getUser()` n'a pas été touché non plus.
> - Voir `RAPPORT-NUIT.md` (racine du dépôt, 2026-08-09) pour le détail
>   complet et l'état de déploiement réel de ce qui précède.

## Hébergement / coût (rappel)

- Objectif : **0 DH/mois**, tenu par les offres gratuites (Vercel + Supabase).
- Plafond accepté : ~5 $/mois, **seulement après accord** du commanditaire.
- Stockage des images maîtrisé : téléchargement manuel + purge en fin de saison.
- Faible verrouillage fournisseur : Supabase = Postgres standard + open-source,
  auto-hébergeable sur un petit VPS si un jour son prix dérape.
