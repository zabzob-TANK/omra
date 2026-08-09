# Reprise — module Facturation Zemzem Asfar

Document de continuité de la reconstruction du module de facturation.

**Toute session de travail — VS Code, terminal, web — doit lire ce fichier
avant de modifier `modules/facturation/`.** Il contient l'architecture, les
conventions, les règles métier confirmées par le commanditaire, l'état des
corrections et le plan de portage. Il est rédigé pour rester valable après
le transfert vers le dépôt officiel.

Dernière mise à jour : 2026-08-03.

> **Note du 2026-08-09** : ce document date de la phase de reconstruction du
> prototype (`clouddd`), avant le transfert vers le dépôt officiel `omra` —
> plusieurs faits ci-dessous (branche de travail, gestionnaire de paquets,
> nombre de tests, commandes) ne correspondent plus à l'état réel du dépôt
> officiel. Les règles métier et l'architecture générale restent la
> référence ; pour l'état technique courant (branche, backend réel, RPC
> déployées, chantiers en cours), voir `RAPPORT-NUIT.md` (racine du dépôt,
> le plus à jour) et le `CLAUDE.md` local. La ligne « État du dépôt »
> ci-dessous a été corrigée a minima pour éviter la confusion la plus
> immédiate (branche, gestionnaire de paquets) ; le reste du tableau garde
> ses valeurs d'origine (phase `clouddd`), non vérifiées cette nuit.

---

## 1. Objet et périmètre

Ce dépôt (`clouddd`) porte une **reconstruction du module Facturation** menée
à partir du fichier de référence `Zemzem Asfar.dc.html`. Il n'est pas le projet
officiel : c'est un prototype complet, testé, destiné à être porté dans le
projet Omra officiel.

Ce qui est dans le périmètre :

- le registre des reçus, la fiche voyageur, la création, les versements ;
- le détail d'un reçu, sa modification, son annulation ;
- le reçu imprimable A4 ;
- le journal financier, les anomalies, le suivi journalier ;
- le registre des chèques et virements, les images justificatives ;
- les statistiques.

Ce qui n'est **pas** dans le périmètre de ce dépôt :

- le module Administration (voir §6) ;
- le noyau Omra existant (voyageurs, saisons, programme) ;
- l'authentification réelle et la persistance — remplacées ici par un
  adaptateur de démonstration en mémoire.

---

## 2. État du dépôt

| Élément | Valeur (phase `clouddd`, non vérifiée cette nuit) |
| --- | --- |
| Branche de travail | ~~`claude/facturation-reconstruction`~~ — dans le dépôt officiel : `integration-facturation` |
| Tests | 417, répartis sur 22 fichiers (phase `clouddd` ; 520 tests dans le dépôt officiel au 2026-08-09, `pnpm exec vitest run`) |
| Build production | vérifié (`npm run build` puis `npm start`) |
| Lots livrés | L0 à L6 (voir `docs/facturation/inventaire.md`) |

### Commandes (dépôt officiel `omra` — `pnpm`, pas `npm`)

```bash
pnpm exec vitest run     # 520 tests au 2026-08-09
pnpm exec tsc --noEmit   # typecheck
pnpm run build           # compilation de production
pnpm dev                 # serveur de développement
```

Les commandes `npm run couverture`/`npm run verifier` ci-dessous
appartiennent à la phase `clouddd` (script et `inventaire.md` propres à ce
dépôt-là) ; non vérifiées comme existantes côté dépôt officiel.

`npm run couverture` lit `docs/facturation/inventaire.md`. Ce fichier est
analysé par un script : **ne pas changer la forme du tableau** (une ligne par
identifiant, colonnes séparées par `|`).

---

## 3. Architecture

### Arborescence

```
modules/facturation/
  domain/                Règles pures. Aucun effet de bord, aucun import réseau.
    constants.ts         Valeurs de référence (C-01 à C-09)
    types.ts             Recu, Versement, OperationPartagee, MouvementCaisse…
    money.ts             Conversions centimes ↔ dirhams, formatage
    dates.ts             Dates jj/mm/aaaa, clés de jour aaaa-mm-jj
    format.ts            Normalisation téléphone, texte
    payment-method.ts    Normalisation des natures de paiement
    rules/               Une règle métier par fichier, chacune testée
  data/
    ports.ts             Contrat — les interfaces que toute source doit remplir
    index.ts             Point de bascule unique entre les sources
    service.ts           Orchestration : relie les ports et le domaine
    demo/                Adaptateur de démonstration, en mémoire
  ui/
    application.tsx      Composition générale, état, notifications
    ecrans/              Registre, finance, suivi, paiements, statistiques
    modales/             Nouveau reçu, versement, détail, modification, annulation
    champs.tsx           Champs de saisie réutilisables
    styles.css           Jetons de style et styles de base
    theme-sombre.css     Mode sombre
db/facturation/migrations/
    0001_facturation.sql Schéma de référence — RLS activée, aucune policy
```

### Principe : ports et adaptateurs

Le domaine ne connaît **aucune** technologie de persistance. Il ne connaît que
des fonctions pures qui reçoivent des données et renvoient des décisions.

```
ui/  →  data/service.ts  →  data/ports.ts  →  data/demo/adapter.ts
                    ↓                              (ou, plus tard, supabase/)
              domain/rules/
```

Conséquences pratiques :

- une règle métier se teste sans base de données ;
- changer de source de données ne touche ni le domaine ni l'interface ;
- `data/index.ts` est le **seul** endroit qui choisit l'implémentation.

### Forme des règles

Chaque règle renvoie un `Resultat<T>` :

```ts
type Resultat<T> =
  | { statut: 'ok'; valeur: T }
  | { statut: 'erreurs'; erreurs: ErreurValidation[] }
  | { statut: 'confirmation-requise'; motif: …; montantCentimes: …; disponibleCentimes: … }
```

Les erreurs sont des **codes**, jamais des phrases. Les libellés vivent dans
`MESSAGES` (`domain/rules/errors.ts`) et reproduisent mot pour mot ceux du
fichier de référence. L'ordre dans lequel les erreurs sont produites est
significatif : il reproduit celui du prototype.

---

## 4. Conventions

### Montants

**Tous les montants du domaine sont en centimes**, en entiers. Aucun flottant
n'intervient dans un calcul d'argent. Les conversions se font aux frontières :

- `dirhamsSaisisEnCentimes()` à l'entrée d'un formulaire ;
- `centimesEnTexteDevise()` à l'affichage.

Un restant peut être **négatif** — c'est le trop-perçu (§5.11). Le domaine
ne l'écrête pas.

> Au portage, vérifier l'unité attendue côté cible. Si la base officielle
> stocke des dirhams entiers, la conversion appartient à l'adaptateur, jamais
> au domaine.

### Langues et directions

| Écran | Langue | Direction |
| --- | --- | --- |
| Registre des reçus, détail, nouveau reçu, versement, modification, annulation, finance, statistiques | arabe | RTL |
| Paiements — chèques et virements, suivi journalier | français | LTR |

Dans un écran RTL, tout ce qui est numérique est isolé en LTR : chiffres,
dates, références, téléphones, montants. Les montants s'écrivent `24 500 DH`,
jamais avec la devise devant.

### Statuts

```
STATUT_ACTIF     = 'نشط'        état interne d'un reçu non annulé
STATUT_ANNULE    = 'ملغى'       annulé
STATUT_SOLDE     = 'مسدد'       affiché quand le restant est ≤ 0
STATUT_INCOMPLET = 'غير مكتمل'  affiché quand il reste à payer
```

`statut` est la donnée stockée. `statutAffiche()` est la valeur calculée
montrée à l'écran : l'annulation l'emporte sur tout le reste.

### Style

La couleur porte une seule information : **le mode de paiement**. Espèces,
chèque et virement ont chacun leur teinte. Les états d'un reçu se distinguent
par la forme, pas par la couleur — pastille pleine pour « soldé », contour
pour « incomplet ». Seule l'annulation garde le rouge.

Jetons disponibles dans `ui/styles.css` :

- rayons : `--r-xs` 4px, `--r-s` 8px, `--r-m` 12px, `--r-l` 16px, `--r-pilule` 999px ;
- élévation : `--ombre-carte`, `--ombre-flottante`, `--ombre-fenetre` ;
- solde nul : `--solde` (bleu), distinct de `--info` et de `--mode-virement` ;
- transition : `--transition` (0.16s ease), neutralisée sous `prefers-reduced-motion`.

Graisses : 400, 500, 600, 700 uniquement. La police IBM Plex Sans Arabic
n'expose pas d'autre graisse — toute valeur entre 650 et 800 est rendue à 700.

Les tableaux de chiffres utilisent `tabular-nums`, y compris en arabe.

---

## 5. Règles métier confirmées

Ces règles ont été **validées explicitement par le commanditaire**. Elles ne
se déduisent pas du code : en cas de contradiction, c'est cette section qui
fait foi et le code qui doit être corrigé.

### 5.1 Comptes et rôles

Il existe **six emplacements de compte**, fixes :

| Emplacement | Rôle |
| --- | --- |
| 1 | Administrateur |
| 2 à 6 | Employés 1 à 5 |

Les rôles sont **binaires**. `slot_number = 1` suffit à déterminer si un compte
est administrateur. Il n'existe :

- aucune matrice de permissions ;
- aucun droit attribué compte par compte ;
- aucun écran de gestion des droits dans la Facturation.

Tous les comptes actifs peuvent : se connecter, consulter les voyageurs, créer
une inscription, enregistrer des versements.

Réservé au slot 1 :

- la suppression d'une image justificative ;
- la levée d'une anomalie financière ;
- l'impression hors de la fenêtre autorisée ;
- la correction du **montant** du premier versement.

Un compte Auth sans emplacement actif est refusé. Le rôle et l'identité de
l'auteur sont **toujours** déterminés côté serveur, jamais transmis par le
navigateur.

### 5.2 Session

**Une seule session active par compte.** Si le même compte se connecte depuis
un autre appareil, la session précédente de ce compte est invalidée. Les
sessions des autres comptes ne sont pas affectées.

Non implémenté à ce jour.

### 5.3 Saison

Chacun des éléments suivants appartient **obligatoirement** à une saison :

- l'inscription ;
- le tarif ;
- l'étiquette de groupe ou famille ;
- le reçu.

La numérotation des reçus est séquentielle par saison. Un numéro de reçu
annulé n'est jamais réutilisé.

#### Cycle de vie (garanti par la base)

Une saison a exactement l'un de trois états : `brouillon`, `active`,
`archivee`. Ces invariants sont **déjà appliqués par le backend** — rien à
reconstruire côté Facturation :

- une seule saison `active` à la fois (index unique partiel) ;
- l'activation archive l'ancienne et active la nouvelle dans une seule
  transaction (`activate_omra_season`) ; jamais deux actives, jamais zéro ;
- un seul programme par saison, créé automatiquement ;
- `has_been_used` verrouille toute suppression d'une saison ayant servi ;
  seule une saison `brouillon` jamais utilisée est supprimable ;
- chaque saison a ses **propres** référentiels (hôtels, vols, chambres,
  rabatteurs, tarifs) ; un hôtel de 2027 n'est pas un hôtel de 2028 ;
- plafond de réduction général (`max_discount_dh`) **et** particulier par
  combinaison (`max_discount_override_dh`) ;
- une saison archivée conserve tout et reste en lecture seule ; elle peut être
  réactivée (ce qui archive l'active en cours).

La préparation des brouillons, l'activation et la modification des programmes
sont l'affaire du **module Administration**, pas de la Facturation.

#### Deux règles que la Facturation doit respecter

Ces deux-là ne sont pas garanties par la base — c'est le code de la Facturation
qui doit les tenir. Le prototype, écrit pour une saison unique, les enfreint.

1. **Les écrans ne mélangent jamais les saisons.** Chaque écran se limite à la
   saison active. Charger tous les reçus sans filtre saisonnier est un défaut —
   c'est la cause du bug « paiement sur le mauvais reçu » (deux saisons portant
   un reçu n°1). L'unicité réelle d'un reçu est **saison + numéro**, jamais le
   numéro seul.
2. **Un ancien reçu ne dépend jamais de la saison active du jour.** Un reçu 2027
   consulté ou modifié en 2028 garde son programme, ses libellés et son plafond
   de 2027. On lit ses **instantanés figés** (que la base stocke déjà), jamais
   les référentiels de la saison active.

#### Périmètre retenu — « saison active partout, le reste plus tard »

Pour éviter les grands chantiers, la Facturation implémente **uniquement** :

- le filtrage systématique sur la **saison active** (règle 1 ci-dessus) ;
- la lecture des instantanés pour les anciens reçus (règle 2).

Sont **explicitement différés**, à n'implémenter que sur demande :

- un sélecteur permettant de feuilleter les saisons archivées à l'écran ;
- les statistiques par saison (l'écran stats reste un « à venir ») ;
- toute UI de gestion de saison côté Facturation (c'est l'Administration).

Le reste des règles saisonnières détaillées reste valable comme référence pour
ce travail futur, mais ne doit pas être construit maintenant.

### 5.4 Groupe et famille

Le groupe ou la famille est un **simple tag saisonnier**. Ce n'est pas un
dossier familial : aucune structure de parenté, aucune hiérarchie, aucune
architecture familiale élaborée.

Un même libellé employé dans deux saisons ne crée **pas** un groupe commun.

### 5.5 Voyageurs et homonymes

Deux voyageurs portant le même nom restent **deux dossiers distincts**. Aucun
rapprochement automatique n'est effectué sur le nom, le prénom, ni leur
combinaison. Réutiliser un voyageur existant doit résulter d'un choix explicite
sur un identifiant stable — jamais d'une correspondance textuelle silencieuse.

Le jeu de démonstration contient volontairement deux homonymes pour que cette
règle reste vérifiable (`adapter.test.ts`).

### 5.6 Libellés

Les libellés saisis librement peuvent contenir de l'arabe, du français, des
chiffres, des lettres ou un mélange. Le système **préserve le texte
exactement**. Aucune validation alphabétique, aucune langue imposée, aucune
direction imposée au stockage.

### 5.7 Versements

- Le premier versement est obligatoire et compte comme versement n° 1.
- Six versements au maximum par reçu.
- Les rangs sont continus, sans trou.
- Aucun versement ne dépasse le restant dû.
- Le sixième versement doit solder **exactement** le restant, ni plus ni moins.
- Espèces : opération unique uniquement.
- Chèque ou virement : opération unique ou partagée.

Chaque versement fige un **instantané** de l'état du reçu au moment où il est
enregistré : client, hôtel, chambre, vol, programme, montant convenu,
rabatteur, restant après, symbole de situation. Cet instantané ne se recalcule
jamais.

### 5.8 Opérations partagées

Une opération partagée — un chèque ou un virement — peut couvrir plusieurs
reçus et plusieurs dossiers.

- L'allocation est **manuelle**. Aucune règle d'allocation automatique.
- Le montant global reste celui de l'opération ; l'alloué et le disponible se
  calculent depuis les allocations.
- Un dépassement exige une **confirmation explicite** et auditée
  (`statut: 'confirmation-requise'`).
- Les allocations d'un reçu annulé restent consommées.
- Une opération déjà utilisée garde verrouillés : référence, banque, date,
  payeur et montant global.
- Une seule image justificative active au maximum par opération. L'image
  appartient à l'opération, jamais aux versements rattachés.
- Ajout d'image par tout employé actif ; suppression **logique** réservée au
  slot 1. Jamais de suppression physique silencieuse.

### 5.9 Modification d'un reçu

Six sections sont modifiables, une seule à la fois, avec un motif obligatoire :

`identity`, `contact`, `program`, `group`, `note`, `firstPayment`.

Jamais modifiables : le numéro, la date de création, le rabatteur.

Chaque changement est consigné champ par champ dans l'historique, avec
l'ancienne et la nouvelle valeur.

> **Note du 2026-08-09** : côté adaptateur Supabase réel, cette règle n'a
> longtemps été vraie qu'en base (`facturation_action_history`, alimentée
> par chaque RPC d'écriture) — jamais exposée à l'écran. `mapReceiptDetailToRecu`
> renvoyait toujours `modifications: []`, donc le compteur de modifications
> du Suivi journalier affichait 0 en permanence (11 modifications réelles
> jamais montrées), et le journal détaillé du reçu (fenêtre « Dossier
> complet ») restait vide même pour un reçu réellement modifié. Corrigé le
> même jour en trois temps : le compteur par saison
> (`list_billing_season_modifications`, migration `202608090003`), le
> détail par reçu (`list_billing_receipt_history`, migration `202608090008`),
> puis — sur demande explicite du commanditaire, une fois le tableau des
> modifications du Journal financier (R-60) spécifié — le diff champ par
> champ lui-même (ancienne/nouvelle valeur, migration `202608090012`),
> reconstruit par `modules/facturation/domain/rules/modification-history.ts`
> (`changementsHistorique`) : une seule correspondance, branchée à la fois
> au tableau du Journal financier et à la fiche du reçu, jamais dupliquée.
>
> Au passage, trois fonctions SQL distinctes (`list_billing_receipts`,
> `get_billing_receipt_details`, `list_billing_season_modifications`)
> répétaient chacune séparément la liste des types d'action comptant comme
> une modification ; deux d'entre elles avaient été oubliées lors de
> l'élargissement du compteur pour couvrir la correction de versement,
> laissant ces corrections invisibles à leurs compteurs malgré une écriture
> correcte. Centralisée dans `billing_receipt_modification_action_types()`
> (migration `202608090011`) pour qu'un futur type d'action n'ait plus
> qu'un seul endroit à toucher.
>
> **Reste sans correspondance** : `billing_receipt.dossier_updated`
> (groupe/famille, §5.4) — son historique ne porte que des identifiants
> techniques de dossier (`source_dossier_id` / `target_dossier_id`), sans
> libellé lisible ; `changementsHistorique` ne produit donc aucune ligne de
> détail pour ce type. Sans effet aujourd'hui : la section correspondante
> est désactivée dans l'écran de modification depuis ce même jour, son
> écriture étant de toute façon refusée (§5.4, modèle de dossier non
> résolu). **À traiter avant de réactiver cette section** — stocker un
> libellé lisible dans `before_data`/`after_data` à l'écriture, ou le
> résoudre à la lecture.

**Correction d'un versement — n'importe lequel du reçu, désigné explicitement
par l'utilisateur (2026-08-09, remplace « le premier versement » ci-dessous) :**

| Élément | Qui peut le corriger |
| --- | --- |
| Nature, banque, référence, date d'instrument, payeur | Tout employé actif |
| Passage unique ↔ partagé | Tout employé actif |
| **Montant** | **Administrateur seul** |

Une correction du montant par l'administrateur doit recalculer, dans une seule
transaction : le total payé, le restant dû ou le trop-perçu, les montants
alloués et disponibles des opérations partagées, les anomalies et les états
financiers dérivés.

Une correction ne doit jamais : supprimer silencieusement l'ancien état,
effacer l'historique, ni s'appliquer à un reçu annulé.

### 5.10 Annulation et remboursement

- Seule l'annulation **complète** du reçu est validée. Pas d'annulation partielle.
- L'annulation est **irréversible**. Un reçu annulé ne peut jamais être
  réactivé ni restauré.
- Un reçu annulé conserve son numéro, ses versements, ses allocations et son
  historique. Il reste consultable et imprimable.
- Il ne peut plus être modifié ni recevoir de versement.
- Le montant remboursé vaut le total réellement payé, **plafonné au montant
  convenu** : `min(total payé, convenu)`. Un trop-perçu n'est **jamais**
  restitué, même à l'annulation — il reste en caisse (§5.11).
- La sortie de caisse vaut exactement **soit ce montant, soit 0 DH**. Une
  sortie d'une valeur intermédiaire est interdite.
- Seul un remboursement en espèces produit un mouvement de caisse. Un chèque
  ou un virement annulé n'implique pas automatiquement une sortie de caisse.
- Après annulation, une nouvelle vente au même voyageur passe par une nouvelle
  inscription et un nouveau reçu, indépendants. On ne recycle rien.

### 5.11 Trop-perçu

Le trop-perçu est **autorisé** et **conservé en caisse**.

- Il s'affiche uniquement comme **anomalie financière visible**.
- Il n'est jamais remboursé automatiquement.
- Il n'est jamais imputé automatiquement à un autre reçu.
- Il n'est jamais transformé silencieusement en avoir.

Conséquence technique : un restant `≤ 0` vaut « soldé ». Toute comparaison
`=== 0` sur un restant est un défaut — le domaine et l'interface utilisent
`<= 0`.

**Articulation avec l'annulation — règle confirmée.** Le trop-perçu n'est pas
restitué à l'annulation. Le client ne récupère que ce que porte le reçu.

Exemple de référence : un reçu convenu à 20 000 DH sur lequel 22 000 DH ont
été encaissés, puis annulé, rembourse **20 000 DH**. Les 2 000 DH excédentaires
restent en caisse et continuent d'exister comme anomalie.

Formule : `montant remboursé = min(total payé, convenu)`.

Autrement dit, le trop-perçu ne sort de la caisse par aucun chemin
automatique — ni en cours de vie du reçu, ni à son annulation. Sa résolution
est un acte administratif distinct.

### 5.12 Impressions

Chaque clic sur « Imprimer » incrémente le compteur **immédiatement, avant**
l'ouverture de la boîte d'impression du système. Le compteur augmente même si
l'utilisateur annule ensuite la boîte.

Chaque impression enregistre : le reçu, la date et l'heure, l'auteur.

Le journal financier conserve en outre la **photographie** des mouvements
imprimés : un versement enregistré après l'impression n'y figure pas.

### 5.13 Mode démonstration

Le mode démonstration doit être **matériellement impossible** en production.
Masquer un bouton ne suffit pas : la séparation se fait par environnement.

Les données de démonstration ne doivent jamais être mélangées aux lectures
réelles ni écrites dans la base.

### 5.14 Sauvegarde et restauration

Aucune donnée réelle de client n'entre dans la base tant que deux conditions
ne sont pas remplies : une sauvegarde effective de la base Postgres et des
fichiers du Storage, et une restauration **réellement exécutée et vérifiée**
depuis cette sauvegarde — pas une sauvegarde dont on suppose qu'elle
fonctionne. C'est une condition de passage en exploitation avec une
échéance précise, pas une tâche « à faire plus tard » : elle redevient
bloquante au moment de créer la vraie saison et de saisir le premier vrai
client.

État vérifié le 2026-08-09 (`pnpm exec supabase backups list`, confirmé à
deux reprises à quelques minutes d'écart) : `pitr_enabled: false`,
`backups: []`. Le projet `omra-prototype` existe depuis le 2026-07-23 ;
l'absence de toute sauvegarde après 17 jours exclut une formule avec
sauvegardes quotidiennes automatiques actives. **Aucune sauvegarde Supabase
n'existe donc à ce jour pour ce projet.** À revérifier au moment du passage
en exploitation — la formule souscrite peut changer d'ici là.

Même avec une formule payante incluant des sauvegardes automatiques,
celles-ci ne couvrent que Postgres, jamais les fichiers du bucket Storage
(`facturation-justificatifs` : justificatifs de chèques et virements). Leur
sauvegarde restera toujours à construire séparément, quelle que soit la
formule Supabase.

Point découvert pendant cette vérification : les images de passeport
n'existent pas réellement dans le Storage aujourd'hui.
`definirImagesPasseportSupabase()`
(`modules/facturation/data/supabase/write.ts`) est un stub qui lève toujours
une erreur ; l'écran de scan passeport est une simulation, jamais branchée à
un stockage réel. Tant que cette fonctionnalité reste un stub, il n'y a rien
de réel à sauvegarder sur ce point — à revoir si elle est un jour implémentée
pour de vrai.

> À construire au moment du passage en exploitation, pas avant : dump complet
> de la base (schéma + données), copie des fichiers Storage, restauration
> réellement exécutée et vérifiée (comptage de lignes, comparaison de valeurs
> connues), le tout documenté en procédure autonome exécutable sans Claude,
> et stocké hors de la machine locale — l'incident de disque plein du
> 2026-08-09 a montré pourquoi : une sauvegarde sur la même machine que la
> donnée qu'elle protège partage le même risque de panne.

---

## 6. Module Administration

L'Administration est un **module séparé**, avec sa propre URL et son propre
couple identifiant / mot de passe. Elle est réservée au commanditaire seul.
Les comptes de la Facturation n'y accèdent pas.

Rôle de l'Administration :

- définir le programme : saisons, hôtels, vols, chambres, tarifs, rabatteurs ;
- gérer les six emplacements de compte et leurs autorisations.

### Traçage — décision du 2026-08-09, à revoir plus tard

Le journal des opérations de la Facturation (سجل العمليات,
`facturation_action_history`) ne couvre que la Facturation. Vérifié le
2026-08-09 : aucune action d'Administration (saison, programme, hôtel, vol,
chambre, tarif, rabatteur, compte) n'est tracée où que ce soit — ni auteur ni
historique, seulement un `updated_at` muet sur chaque table.

Décision du commanditaire : ne pas construire ce traçage maintenant.
L'Administration est réservée au commanditaire seul (ci-dessus) — tant que
c'est le cas, savoir « qui » a changé une donnée n'apporte rien, puisqu'il
n'y a qu'une seule personne possible. Ce point redevient à traiter précisément
le jour où quelqu'un d'autre que le commanditaire obtient un accès à
l'Administration.

Il n'y a pas de notion d'« administrateur de l'Administration » : c'est un
espace personnel unique.

### Carte blanche sur les données

Depuis l'Administration, le commanditaire peut ouvrir et modifier **n'importe
quelle donnée** d'un reçu ou d'un client, sans les gardes métier de la
Facturation. Exemple explicitement validé : ramener à 200 DH un montant convenu
que le programme fixe à 20 000 DH.

Sont levées : les validations métier — plafond de réduction, cohérence du
convenu avec le total payé, existence de la combinaison tarifaire, verrouillage
d'un reçu annulé.

Reste garantie : l'**intégrité des données**. Pas de référence orpheline, pas
de champ obligatoire vidé, pas de statut invalide, rien qui empêcherait la
Facturation de fonctionner.

> À intégrer plus tard. Ne pas construire cette partie maintenant, mais ne
> rien figer qui la rendrait impossible : éviter les invariants appliqués
> uniquement en base sans possibilité de contournement administratif tracé.

---

## 7. État des corrections

### Sur la numérotation `P-xx`

Ces identifiants viennent d'un **audit initial du prototype**, mené avant la
reconstruction, qui recensait une trentaine de constats de `P01` à `P31`.

Cet audit a été livré oralement et **n'a jamais été archivé dans un fichier**.
Il n'existe donc nulle part ailleurs — ni dans `inventaire.md`, qui porte les
identifiants `R-xx`, `U-xx` et `C-xx`, ni dans aucun autre document. Ne pas
le chercher.

Conséquences pratiques :

- les numéros absents (`P02` à `P04`, `P07`, `P09` à `P12`, `P14` à `P17`…)
  correspondent à des constats traités pendant la reconstruction ou jugés non
  bloquants ; il n'en subsiste pas de trace exploitable ;
- les identifiants conservés ci-dessous le sont pour la **traçabilité avec les
  messages de commit**, qui les citent ;
- un tiret `—` signale une correction née après l'audit, donc sans numéro.

Toute correction future se décrit par son objet, pas par un nouveau numéro
`P-xx` : cette série est close.

### Corrections appliquées

| ID | Objet | Fichiers |
| --- | --- | --- |
| P05 | Un reçu déjà annulé ne peut plus être annulé une seconde fois | `rules/cancellation.ts` |
| P06 | Un reçu annulé est verrouillé contre toute modification | `rules/edit-sections.ts` |
| — | Trop-perçu : `restant ≤ 0` vaut « soldé » partout | `rules/receipt.ts`, `rules/payment.ts`, `ui/`, `demo/dataset*.ts` |
| — | `FACTURATION_SOURCE=demo` interdit en `NODE_ENV=production` | `data/index.ts` |

### Corrections en attente — domaine pur

> Les messages de commit antérieurs appellent cet ensemble « lot 1 ». Le terme
> est abandonné ici : il entrait en collision avec les lots de livraison
> `L0` à `L6` de `inventaire.md`, qui désignent tout autre chose.

Ces corrections tiennent entièrement dans le domaine et l'orchestration.
Aucune ne nécessite de base de données ni d'authentification réelle.
**Écrire le test qui échoue avant la correction.**

**P01 — La correction du premier versement ne s'applique pas.**
Dans `rules/edit-sections.ts`, la branche `firstPayment` remplit bien
`changements` (l'historique lisible) mais ne peuple **jamais** `champsModifies`.
Résultat : l'écran affiche un succès, l'historique consigne le changement, et
rien ne change dans les données.

La cause est structurelle : `champsModifies` est un `Partial<Recu>`, et une
mutation de versement ne s'y exprime pas. Il faut une méthode de port dédiée —
`corrigerPremierVersement` — qui prenne en charge le passage unique ↔ partagé
et applique la distinction employé / administrateur sur le montant (§5.9).

**P13 — Modification commerciale et trop-perçu.**
La garde se trouve dans `rules/edit-sections.ts`, section `program` : elle
produit `convenu-inferieur-au-paye` dès que le nouveau montant convenu passe
sous le total déjà payé. Or le trop-perçu est autorisé (§5.11) : cette
situation doit devenir **possible**, et produire une **anomalie non bloquante**
au lieu d'un refus.

Le code d'erreur `convenu-inferieur-au-paye` et son message restent utiles
ailleurs — ne pas les supprimer de `rules/errors.ts` sans vérifier leurs
autres usages.

**Remboursement non plafonné à l'annulation.**
`rules/cancellation.ts` calcule `montantRembourseCentimes = totalPaye(recu)`,
sans plafond. Or le trop-perçu n'est jamais restitué (§5.10, §5.11) : la
valeur correcte est `min(totalPaye(recu), recu.convenuCentimes)`.

Le mouvement de caisse dérive de ce montant et se corrige donc en même temps.

> Attention : le test existant `R-46 — vaut le total payé` encode l'ancienne
> formule. Il doit être **mis à jour**, pas contourné. Ajouter en parallèle un
> cas de trop-perçu, aujourd'hui absent de ce fichier de test.

**P08 — Réservation prématurée du numéro de reçu.**
`reserverNumero()` est appelé avant la validation du formulaire. Un abandon
consomme donc un numéro. La réservation doit avoir lieu après validation, dans
la même transaction que la création.

**P18 — Impression non attendue.**
`imprimer()` n'attend pas l'enregistrement avant d'ouvrir la boîte système. Il
faut rendre la fonction asynchrone et placer un `await` avant `window.print()`,
pour que le compteur soit certainement écrit (§5.12).

**Suppression d'image — logique, pas physique.**
Marquer `supprimee = true` et conserver la référence, au lieu d'effacer.

### Corrections en attente — dépendantes du backend

Celles-ci ne peuvent pas être traitées dans le prototype : elles supposent une
authentification et une persistance réelles. Elles appartiennent aux étapes 4
et 5 du portage (§9), pas aux corrections de domaine ci-dessus.

**Session unique par compte** (§5.2) — non implémentée. Exige un backend
d'authentification capable d'invalider la session précédente d'un compte
lorsqu'il se connecte ailleurs. L'adaptateur de démonstration n'a pas de
notion de session persistante : il n'y a rien à corriger ici, seulement à
construire au moment du portage.

---

## 8. Contraintes de sécurité

Ces contraintes sont permanentes. Elles ne se négocient pas au cas par cas.

### Secrets

- Une clé de service (`service_role` ou équivalent) ne doit **jamais** :
  atteindre le navigateur, figurer dans le dépôt, être préfixée `NEXT_PUBLIC_`,
  ni servir d'identité métier.
- Aucun identifiant, mot de passe, référence de projet ou URL d'API ne figure
  dans un fichier versionné — y compris ce document.
- `.env.example` ne contient que des noms de variables, jamais de valeurs, et
  porte l'avertissement : *ne jamais renseigner ici les identifiants du projet
  officiel*.

### Identité

- L'identité de l'auteur et son rôle sont résolus **côté serveur**, depuis la
  session authentifiée.
- Aucune écriture n'accepte de champ `acteur`, `rôle` ou `emplacement` fourni
  par le client.
- Les instantanés d'audit portent l'emplacement, l'identifiant Auth, le libellé
  et le login — tous d'origine serveur.

### Base de données

- Les tables financières ont la RLS activée et **aucun accès direct** depuis le
  navigateur.
- Les lectures et écritures financières passent par des fonctions sécurisées
  (`SECURITY DEFINER`, `SET search_path = ''`, objets qualifiés, privilèges
  explicites).
- Toute migration destinée à un projet de test porte en en-tête :
  *ne jamais appliquer cette migration à la base du projet officiel*.
- Une migration déjà appliquée ne se modifie pas. Toute correction passe par
  une nouvelle migration.

### Environnements

- Le mode démonstration est matériellement impossible en production (§5.13).
- Aucune donnée financière de test ne doit subsister après un essai. Les tests
  d'écriture sur une base réelle s'exécutent dans une transaction terminée par
  un `ROLLBACK`.

---

## 9. Plan de portage

Le prototype est complet et testé. Le portage n'est donc pas une réécriture :
c'est une **réconciliation** entre ce prototype et le projet officiel.

| Étape | Contenu | Pré-requis |
| --- | --- | --- |
| 1 | Corrections en attente du domaine pur (§7) | aucun |
| 2 | Audit du dépôt officiel : schéma, fonctions, conventions existantes | accès au dépôt officiel |
| 3 | Relevé des écarts entre ce prototype et l'existant, décision au cas par cas | étape 2 |
| 4 | Adaptateur réel implémentant `ports.ts` | étapes 2 et 3 |
| 5 | Authentification et session unique par compte (§5.2) | étape 4 |
| 6 | Stockage des images justificatives | étape 4 |
| 7 | Garde de production, vérifications, déploiement | étapes 1 à 6 |

### Règles de portage

- **Ne rien écraser aveuglément.** Le backend, les conventions et
  l'Administration du projet officiel priment. Le code de ce prototype est
  réutilisé après audit, pas importé en bloc.
- **Ne jamais travailler directement sur la branche par défaut.** Créer une
  branche de travail avant toute modification.
- **Ne pas réinterpréter une règle du prototype.** Aucune règle n'est
  supprimée, simplifiée ni modernisée. Toute ambiguïté est signalée avant
  décision, jamais tranchée en silence.
- **Ne pas redessiner.** Le résultat officiel n'est pas un redesign : la
  densité du tableau, le défilement horizontal, les colonnes et les actions
  sont conservés.
- **Signaler tout écart** entre ce document et l'existant plutôt que de choisir
  seul. Une décision métier manquante est un point d'arrêt, pas une invitation
  à improviser.

---

## 10. Fichiers de référence

| Fichier | Contenu |
| --- | --- |
| `docs/facturation/inventaire.md` | Registre des règles (R-xx, U-xx, C-xx) et suivi de couverture |
| `docs/facturation/transfert-omra.md` | Plan de transfert vers le dépôt officiel |
| `modules/facturation/README.md` | Notes d'exécution du module |
| `db/facturation/migrations/0001_facturation.sql` | Schéma de référence — RLS activée, aucune policy |
| `modules/facturation/data/ports.ts` | Contrat que tout adaptateur doit remplir |
| `modules/facturation/data/demo/dataset.ts` | Jeu de démonstration — 18 reçus sur 6 jours |

### Sur le jeu de démonstration

Il couvre volontairement chaque règle visible : un reçu soldé au premier
versement, un dossier à six versements, un chèque de famille réglant trois
reçus, un virement réutilisé sur deux jours, un solde négatif de trop-perçu,
les deux formes d'annulation, deux homonymes, un versement enregistré après
l'impression du jour, et une journée vide.

Les instantanés y sont **calculés** à partir des montants, jamais recopiés à
la main. Un changement de montant ne peut donc pas laisser un instantané
mensonger.
