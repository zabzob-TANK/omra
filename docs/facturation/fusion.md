# Plan de fusion — prototype `clouddd` → projet officiel `omra`

Document de travail pour le portage du module Facturation.
À lire **après** `docs/facturation/reprise.md`, qui porte les règles métier.

Établi le 2026-08-03 à partir d'une inspection directe des deux côtés :
le prototype `clouddd`, et une archive du travail local `omra` comprenant
23 migrations, la couche `lib/facturation/`, les écrans `app/facturation/`
et les composants `components/facturation/`.

---

## 1. Ce que contient chaque côté

### Côté `omra` — le backend

Solide, rigoureux, plus avancé que je ne l'imaginais. Il ne s'agit pas d'une
ébauche.

**23 migrations, environ 9 700 lignes de SQL.** Les tables financières :

| Table | Rôle |
| --- | --- |
| `billing_receipts` | Le reçu, rattaché à une inscription et à une saison |
| `billing_receipt_counters` | Compteur de numéro **par saison**, verrouillé transactionnellement |
| `receipt_payments` | Les versements, numérotés de 1 à 6 |
| `payment_operations` | Les opérations — espèces, chèque, virement — uniques ou partagées |
| `payment_instrument_details` | Référence, banque, date, payeur d'une opération |
| `payment_allocations` | Le lien entre une opération et un versement |
| `receipt_cancellations` | Les annulations |
| `facturation_action_history` | Le journal d'audit |

**Les fonctions sécurisées** couvrent déjà l'essentiel :

```
resolve_facturation_actor()              require_facturation_admin()
create_facturation_traveler_registration()
create_billing_receipt_with_first_payment()
create_complete_facturation_receipt()
add_billing_receipt_payment()            cancel_billing_receipt()
update_billing_receipt_commercial_data() update_billing_receipt_personal_data()
update_billing_receipt_dossier()         correct_billing_receipt_first_payment_method()
attach_payment_operation_evidence_image()
delete_payment_operation_evidence_image()
list_billing_receipts()                  get_billing_receipt_details()
list_billing_anomalies()                 list_reusable_payment_operations()
record_billing_receipt_print()           get_billing_receipt_print_summary()
```

**La sécurité est déjà en place** : RLS activée sur toutes les tables
financières, tous droits révoqués pour `anon` et `authenticated`, accès
réservé à `service_role`. L'identité vient de `resolve_facturation_actor()`
qui lit `auth.uid()`. Chaque écriture consigne un instantané de l'auteur —
numéro d'emplacement, libellé, login.

**Une interface existe aussi** : `BillingDashboard` (520 lignes), des modales
fonctionnelles, une fiche de détail. Elle lit les vraies données et propose une
bascule vers un jeu de démonstration.

### Côté `clouddd` — le prototype

**Ce qu'il apporte et qui n'existe pas dans `omra` :**

- le **registre des reçus** fidèle au fichier de référence ;
- le **journal financier** avec impression et photographie des mouvements ;
- le **suivi journalier** ;
- le **registre des chèques et virements** avec images ;
- le **reçu imprimable A4** ;
- les **statistiques** ;
- un **noyau métier pur** de 427 tests qui encode chaque règle.

**Ce qu'il n'a pas :** aucune persistance réelle. Ses données vivent en mémoire.

---

## 2. La décision structurante

Les deux côtés ont une interface de facturation. Il fallait choisir.

**Décision actée par le commanditaire : l'interface du prototype remplace
`BillingDashboard`, le backend d'`omra` l'emporte.**

Raisons :

- le prototype est **fidèle au fichier de référence** `Zemzem Asfar.dc.html`,
  qui est la règle fonctionnelle ; `reprise.md` §9 interdit le redesign ;
- il couvre six écrans que `BillingDashboard` ne couvre pas ;
- ses 427 tests encodent les règles et resteront valables ;
- à l'inverse, le backend d'`omra` est bien meilleur que l'adaptateur de
  démonstration : schéma réel, RLS, fonctions transactionnelles, audit.

Ce qui signifie concrètement : `BillingDashboard` et ses composants sont
**remplacés**, pas fusionnés. Les fichiers `components/facturation/*.tsx` et
`lib/facturation/demo-data.ts` sortent. Le reste de `lib/facturation/` —
`types.ts`, `read-server.ts`, `reference-server.ts` — sert de base à
l'adaptateur.

> Décision actée le 2026-08-03. C'était la seule qui engageait vraiment ;
> tout le reste en découle.

---

## 3. Les correspondances

### Unités — le point le plus dangereux

| | Prototype | `omra` |
| --- | --- | --- |
| Unité | **centimes** (`convenuCentimes`) | **dirhams entiers** (`agreed_amount_dh`) |

La conversion est sûre : les montants du prototype sont toujours des multiples
de 100. `centimes / 100 = dirhams`.

**Règle : la conversion appartient à l'adaptateur, jamais au domaine.** Le
noyau reste en centimes ; l'adaptateur multiplie en lisant, divise en écrivant,
et refuse tout montant qui ne tombe pas juste au dirham.

### Vocabulaire

| Notion | Prototype | `omra` |
| --- | --- | --- |
| Espèces | `نقد` | `cash` |
| Chèque | `شيك` | `cheque` |
| Virement | `تحويل بنكي` | `transfer` |
| Portée | `unique` / `shared` | `unique` / `shared` ✓ |
| Reçu actif | `نشط` | `active` |
| Reçu annulé | `ملغى` | `cancelled` |
| Statut affiché | calculé | `incomplete` / `paid` / `overpaid` |

Les libellés arabes restent **à l'affichage**. L'adaptateur traduit dans les
deux sens. Ne jamais stocker d'arabe dans une colonne de code.

### Bonne surprise

`omra` modélise **déjà** le trop-perçu : `ReceiptFinancialStatus` comprend
`'overpaid'`, la table expose `overpayment_dh`, et `BillingAnomalyType` a une
valeur `'overpayment'`. La règle §5.11 de `reprise.md` est donc déjà dans le
schéma. Rien à inventer.

---

## 4. Non-conformités du backend `omra`

Vérifiées dans le SQL. Chacune exige une **nouvelle migration** — une migration
déjà appliquée ne se modifie jamais.

### 4.1 Sortie de caisse partielle acceptée à l'annulation

`cancel_billing_receipt` reçoit `p_cash_outflow_amount_dh` en paramètre et
n'impose qu'une seule borne :

```sql
if p_cash_outflow_amount_dh > v_total_paid_dh then
  raise exception 'Cash outflow amount exceeds total paid';
end if;
```

Un remboursement de 5 000 DH sur 10 000 DH payés est donc accepté. Or la règle
est **tout ou rien** (`reprise.md` §5.10).

De plus, depuis la confirmation du commanditaire, le montant n'est plus le
total payé mais `min(total payé, montant convenu)` : le trop-perçu n'est jamais
restitué.

**Correction attendue :** la fonction ne doit plus accepter de montant libre.
Elle reçoit le mode de remboursement — caisse ou hors caisse — et calcule
elle-même `min(total_paid_dh, agreed_amount_dh)`, ou zéro.

### 4.2 Correction du premier versement — montant immuable pour tous

`correct_billing_receipt_first_payment_method` (migration `202608020004`,
non déployée) traite le montant comme immuable, quel que soit l'auteur.

La règle confirmée est différente (`reprise.md` §5.9) : l'**administrateur**
peut corriger le montant ; l'employé ne corrige que la méthode et l'instrument.

**Ne pas déployer cette migration en l'état.** Elle doit être reprise avant
application, ou remplacée.

### 4.3 Mode démonstration mal isolé

`app/facturation/page.tsx` :

```ts
const demoData = process.env.VERCEL ? null : createDemoBillingDataset()
```

L'absence de la variable `VERCEL` n'est pas une garantie de non-production. Un
déploiement ailleurs, ou une exécution locale d'un build de production,
réactive le jeu de démonstration.

`reprise.md` §5.13 exige une séparation **matérielle**. Le prototype applique
déjà la bonne forme dans `data/index.ts` : une erreur au démarrage si
`NODE_ENV=production` et que la source est la démonstration.

---

## 5. Ce que `omra` ne couvre pas encore

Aucune fonction ne traite :

- le **journal financier** et son impression ;
- la **photographie des mouvements imprimés** (§5.12) ;
- l'**acquittement des anomalies** par l'administrateur ;
- le **suivi journalier** ;
- la **session unique par compte** (§5.2).

`record_billing_receipt_print` et `get_billing_receipt_print_summary` existent
pour le reçu, mais rien pour le journal financier.

Ces éléments viennent du prototype et devront recevoir leurs propres tables et
fonctions. C'est le principal travail neuf de la fusion.

---

## 5 bis. Accès Administration — décision actée, définitive

L'accès à l'Administration se fait par un **login séparé**, en dehors des six
emplacements de compte (`account_slots`) qui servent la Facturation. Ce n'est
pas un septième emplacement, ni un rôle porté par un slot existant : c'est un
espace d'authentification distinct, propre au commanditaire seul, conforme à
`reprise.md` §6 (« sa propre URL et son propre couple identifiant / mot de
passe. Les comptes de la Facturation n'y accèdent pas »).

Conséquence pour `SessionPort` (`ports.ts`) : `estAdministrateur()` continue
de porter les autorisations **internes à la Facturation** réservées au slot 1
(R-39 suppression d'image, R-61 impression hors fenêtre, R-65 levée
d'anomalie) — ceci ne change pas. Mais l'accès à l'écran d'Administration
lui-même ne doit **jamais** être déduit d'un `slot_number = 1` côté
Facturation : il dépend exclusivement de sa propre authentification, gérée
ailleurs. Aucune fusion des deux mécanismes n'est envisagée.

**Toutes les restrictions de sécurité déjà en place restent actives, aucune
n'est retirée** : RLS sur les tables financières, révocation d'exécution pour
`anon`/`public`, `SECURITY DEFINER` + `search_path = ''` sur les fonctions
sensibles, résolution de l'identité exclusivement via
`resolve_facturation_actor()`, aucune clé `service_role` côté navigateur.
Cette décision sur l'accès Administration ne desserre aucune de ces règles ;
elle clarifie seulement que la Facturation et l'Administration ne partagent
pas de porte d'entrée.

---

## 6. Plan d'exécution

L'ordre compte : chaque étape doit laisser le projet en état de marche.

| # | Étape | Vérification |
| --- | --- | --- |
| 1 | Sauvegarder l'état local `omra` — le committer et le pousser | rien n'existe qu'en un seul exemplaire |
| 2 | Confirmer la décision §2 avec le commanditaire | sans elle, le reste est prématuré |
| 3 | Copier `modules/facturation/domain/` et ses tests dans `omra`, tels quels | 427 tests au vert dans `omra` |
| 4 | Copier `data/ports.ts` et l'interface `ui/` | l'application compile |
| 5 | Écrire l'adaptateur Supabase implémentant `ports.ts` sur les RPC existantes | les écrans lisent de vraies données |
| 6 | Nouvelle migration corrigeant §4.1 | test transactionnel avec `ROLLBACK` |
| 7 | Reprendre `202608020004` selon §4.2, puis déployer | idem |
| 8 | Remplacer la garde de démonstration §4.3 | build de production refuse la démo |
| 9 | Tables et fonctions manquantes §5 | journal financier fonctionnel |
| 10 | Session unique par compte | connexion sur deux appareils |
| 11 | Retirer `BillingDashboard` et `demo-data.ts` | plus aucune référence |

Les étapes 3 et 4 sont mécaniques et sans risque : du code pur, sans effet de
bord, qui ne touche à rien d'existant. L'étape 5 est le cœur du travail.

---

## 7. Pièges

**Ne pas déployer `202608020004`** avant de l'avoir reprise (§4.2).

**Ne jamais modifier une migration déjà appliquée.** Toute correction passe par
une migration nouvelle.

**Les instantanés ne se recalculent pas.** `omra` stocke partout des colonnes
`*_snapshot` — nom du voyageur, hôtel, vol, chambre, saison, auteur. Elles
figent l'état au moment de l'acte. Un adaptateur qui les recalculerait à la
lecture effacerait l'histoire.

**Les deux dépôts restent séparés côté Git.** Vérifier la branche avant chaque
commit : `git branch --show-current`.

**Ne pas toucher à l'Administration.** Elle est terminée et hors périmètre.

**Les montants de la base sont des entiers.** Un arrondi silencieux dans
l'adaptateur produirait des écarts de caisse invisibles. Refuser plutôt
qu'arrondir.

---

## 8. Décisions du 2026-08-03 — partie lecture de l'étape 5

L'adaptateur Supabase en lecture (`modules/facturation/data/supabase/`) a
soulevé six points. Décisions du commanditaire :

**1. Instantané de versement — la reconstruction approximative est écartée.**
Elle était silencieusement fausse dès qu'une correction commerciale avait
changé le montant convenu après le versement. La base financière étant vide
aujourd'hui, la migration `202608030001_add_receipt_payment_instant_snapshot.sql`
ajoute les colonnes d'instantané à `receipt_payments` (client, hôtel, chambre,
vol, programme, convenu, rabatteur, restant après, soldé après), renseignées
par `create_billing_receipt_with_first_payment` et `add_billing_receipt_payment`
au moment de l'écriture, jamais recalculées — et lues telles quelles par
`get_billing_receipt_details`. `construireInstantaneApproximatif` est
supprimée de `mappers.ts`.

**2. Migration `202608020004` scindée.** `list_reusable_payment_operations`
est extraite dans `202608030003_extract_list_reusable_payment_operations.sql`,
déployable seule. `correct_billing_receipt_first_payment_method` reste dans
`202608020004`, toujours non conforme à §4.2 (montant immuable pour tous), et
sa reprise reste prévue à l'étape 8 du plan d'exécution — pas avant.

**3. `groupe` / `omra_dossiers` — en attente.** Aucune décision du
commanditaire pour l'instant sur la correspondance entre le tag groupe/famille
du prototype et `omra_dossiers`. Rien n'est branché ; le commentaire
d'avertissement reste dans `mappers.ts` tel quel.

**4. `listerAnomaliesBase` reste non branchée.** Le domaine calcule ses
propres anomalies depuis les reçus (`rules/daily.ts`, `rules/finance-day.ts`) :
c'est la source de vérité, pas la RPC. Réexaminé à l'étape 9 (journal
financier), pas avant.

**5. Champs indisponibles (`impressions`, `modifications`, `creeePar`/
`statut`/`image` d'une opération réutilisable) — normal à ce stade.** Ces
champs viennent d'autres RPC (`get_billing_receipt_print_summary`, historique
détaillé par champ) hors périmètre de la partie lecture. Notés dans ce
document (§5, §4.2), pas forcés par une approximation.

**6. `montantRembourseCentimes` se lit tel quel, sans plafonnement a
posteriori.** Le plafond `min(total payé, convenu)` de §4.1 gouverne les
**futures** annulations, pas la relecture d'un enregistrement déjà survenu :
la lecture rapporte ce qui s'est réellement passé, elle ne corrige jamais un
fait passé.

### Déploiement du 2026-08-03 — migrations de lecture seules

`supabase db push` n'a pas de mode sélectif : il applique dans l'ordre du nom
de fichier toutes les migrations locales postérieures à la dernière migration
distante (`202608020002`). `202608020003` et `202608020004` étant numérotées
avant `202608030001-3` et jamais déployées, elles seraient entrées dans le
même lot sans intervention — alors que `202608020004` est explicitement non
conforme (§4.2) et que `202608020003` n'a pas été revue dans ce travail.

Les deux fichiers ont donc été déplacés hors de `supabase/migrations/`, vers
`supabase/migrations-en-attente/` (non scanné par la CLI), conservés dans le
dépôt sans être perdus. Ils **ne reviennent pas** dans `supabase/migrations/`
après ce déploiement : `202608020003` reviendra avec le lot du journal
financier et de l'impression (étape 9) ; `202608020004` reviendra réécrite à
l'étape 8. Détail dans `supabase/migrations-en-attente/README.md`.

Seules `202608030001`, `202608030002` et `202608030003` sont déployées à
cette occasion.
