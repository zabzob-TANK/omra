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

### 4.3 Mode démonstration mal isolé — corrigé le 2026-08-03

`app/facturation/page.tsx` utilisait :

```ts
const demoData = process.env.VERCEL ? null : createDemoBillingDataset()
```

L'absence de la variable `VERCEL` n'était pas une garantie de non-production.
Un déploiement ailleurs, ou une exécution locale d'un build de production,
réactivait le jeu de démonstration.

`reprise.md` §5.13 exige une séparation **matérielle** — masquer un bouton ne
suffit pas. Remplacé par une constante de module dérivée de `NODE_ENV`, seule
source fiable et indépendante de l'hébergeur (le même principe que `data/index.ts`,
qui refuse déjà `FACTURATION_SOURCE=demo` en production) :

```ts
const DEMO_AUTORISEE = process.env.NODE_ENV !== 'production'
// ...
const demoData = DEMO_AUTORISEE ? createDemoBillingDataset() : null
```

En production, `createDemoBillingDataset()` n'est jamais invoqué : le jeu de
démonstration est matériellement inatteignable, pas seulement caché derrière
un bouton. Ce correctif est provisoire — l'étape 6 du plan d'exécution
remplacera `app/facturation/page.tsx` en entier et retirera `demo-data.ts` ;
il protège l'état actuellement déployé en attendant.

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

---

## 9. Étape 5b — l'adaptateur d'écriture (2026-08-03)

`modules/facturation/data/supabase/write.ts` (et `clients-operations.ts`,
`stubs.ts`, `session.ts`, `referentiels.ts`, `programme.ts`, `storage.ts`,
`ids.ts`) implémentent la partie écriture de `SourceDonnees`, branchée dans
`modules/facturation/data/index.ts` (`FACTURATION_SOURCE=supabase`). Décisions
prises pendant ce travail, faute d'une réconciliation déjà actée :

**1. Client et opération partagée ne se créent jamais séparément.** Le
prototype traite `ClientsPort.creer()`/`OperationsPartageesPort.creer()`
comme des dépôts distincts, appelés avant `RecusPort.creer()`/
`ajouterVersement()`. omra crée voyageur + inscription + reçu + versement +
opération de paiement **atomiquement**, en une seule RPC
(`create_complete_facturation_receipt`/`add_billing_receipt_payment`).
`ClientsPort` et `OperationsPartageesPort.creer()` sont donc des no-op
assumés ; `write.ts` reconnaît une opération « nouvelle » à son identifiant
provisoire plutôt qu'à un objet transmis séparément (`ids.ts`,
`estIdentifiantReel` — un UUID nu vient de la base, un identifiant préfixé
vient du domaine).

**2. Aucune réutilisation de voyageur.** Le domaine ne propose jamais ce
choix explicitement (pas de champ « voyageur existant » dans le fichier de
référence) : chaque reçu crée donc un nouveau `travelers`, jamais de
rapprochement automatique sur le nom — conforme à CLAUDE.md, qui interdit
justement ce rapprochement silencieux.

**3. `reserverNumero()` ne réserve rien réellement.** omra n'expose pas de
réservation de numéro séparée : `create_complete_facturation_receipt`
réserve et attribue le numéro dans la même transaction que la création. La
valeur renvoyée par ce port (`0`) n'est ni validée ni affichée par le domaine
(commentaire P08 de `create-receipt.ts`) ; le numéro réel vient du `Recu`
que `creer()` renvoie après coup.

**4. Groupe/dossier — décision technique provisoire, pas une résolution de
§5.4.** Chaque reçu crée son propre dossier `omra_dossiers` (référence
technique aléatoire, libellé = tag groupe saisi ou `null`). Aucun
rapprochement entre reçus partageant le même tag n'est tenté. Ce n'est pas la
correspondance groupe/famille attendue par `reprise.md` §5.4 — seulement ce
qu'il fallait pour que la création de reçu fonctionne sans bloquer sur une
décision produit encore ouverte. La modification du groupe sur un reçu
existant (section `group` de `appliquerModification`) reste indisponible :
`update_billing_receipt_dossier` déplace une inscription entre dossiers
réels, ce qui ne correspond pas à un simple changement de libellé.

**5. Payeur par défaut pour un instrument bancaire unique.** Le domaine
n'exige `payeur` que pour une opération **partagée** (R-26) ; la RPC omra
l'exige aussi pour un chèque/virement **unique** (« Bank instrument details
are required »). Repli sur le nom du client du reçu, de fait le seul payeur
possible d'un instrument qui lui est propre — accommodation technique, pas
une règle métier nouvelle.

**6. Motif de suppression d'image non collecté par le domaine.**
`delete_payment_operation_evidence_image` exige un motif non vide ; ni
`RecusPort.definirImageVersement(…, null)` ni
`OperationsPartageesPort.definirImage(…, null)` n'en reçoivent un du
domaine. Un texte fixe (« Suppression demandée depuis l'écran Facturation »)
est utilisé — l'autorisation reste vérifiée par `require_facturation_admin()`
côté serveur, seul le motif est générique.

**7. Confirmation de dépassement toujours transmise à la RPC.** Le domaine
obtient déjà la confirmation de l'utilisateur avant d'appeler
`RecusPort.creer()`/`ajouterVersement()` (R-32,
`preparerCreationRecu`/`preparerVersement` → `depassementConfirme`) : ces
méthodes ne sont jamais invoquées tant qu'elle manque. `p_confirm_over_allocation: true`
est donc systématique. Limite résiduelle assumée : sous concurrence rare (une
même opération partagée modifiée entre la lecture du domaine et cette
écriture), la RPC pourrait confirmer un dépassement plus élevé que celui
montré à l'utilisateur — entièrement tracé (`payment_operation.over_allocation_confirmed`),
jamais perdu, mais pas revalidé auprès de l'utilisateur. À traiter si la
Facturation passe un jour à plusieurs postes simultanés sur les mêmes
opérations partagées.

**8. Toujours indisponibles, chacun pour une raison déjà actée ailleurs** :
`corrigerPremierVersement` (RPC non déployée, §4.2/étape 8),
`incrementerImpressions` (migration `202608020003` non déployée),
`definirImagesPasseport` (hors périmètre du noyau, R-90),
`mouvementsCaisse`/`impressionsFinance`/`acquittementsAnomalie` (aucune table
côté omra, §5/étape 9). `JournalAuditPort` est un no-op **intentionnel** :
`facturation_action_history`, alimentée automatiquement par chaque RPC
d'écriture, fait déjà ce travail.

**Vérifié** : `pnpm exec tsc --noEmit`, `pnpm exec vitest run` (467 tests),
`pnpm run build` — tous au vert. Aucune route n'est encore branchée sur cet
adaptateur ; `app/facturation/page.tsx` utilise toujours `BillingDashboard` et
`demo-data.ts` jusqu'à l'étape 6.

---

## 10. Étape 6 — l'interface réelle branchée sur `/facturation` (2026-08-03)

`app/facturation/page.tsx` rend désormais `ApplicationFacturation`
(`modules/facturation/ui/application.tsx`), avec `chargerEtat()` comme état
initial et un nouveau `app/facturation/actions.ts` (Server Actions minces,
une par méthode d'`ActionsFacturation`, chacune revérifiant
`requireActiveAccount()` avant de déléguer à `service.ts`, jamais modifié).
`BillingDashboard` et ses composants (`components/facturation/`),
`lib/facturation/demo-data.ts`, `read-server.ts`, `reference-server.ts`,
`workflow-types.ts` et `format.ts` sont supprimés : plus aucune référence.

**Deux modifications ciblées de `application.tsx`** (le reste du fichier
n'est pas touché) :
1. `utilisateur` s'initialise depuis `etatInitial.utilisateur` au lieu de
   `null` — l'authentification omra a déjà eu lieu avant que cette interface
   ne soit montée (`requireActiveAccount()` dans `page.tsx`), donc l'écran de
   connexion du prototype ne s'affiche plus jamais côté omra.
2. Le bouton de sortie navigue vers `/logout` (route réelle omra, ferme la
   session Supabase) plutôt que d'appeler `setUtilisateur(null)`, qui n'aurait
   fait que rouvrir l'écran de connexion du prototype — jamais branché sur
   l'authentification omra (`SessionPort.connecter`, non disponible).

**`FACTURATION_SOURCE=supabase` fixé dans un nouveau fichier `.env`**
(versionné, non secret — à ne pas confondre avec `.env.local`).
`.gitignore` excluait `.env*` en bloc ; une exception `!.env` a été ajoutée
pour que cette valeur soit versionnée et survive au-delà de cette machine,
sans toucher `.env.local` ni son contenu. `server-only` est ajouté comme
dépendance directe (déjà utilisée implicitement via le bundler Next.js ;
nécessaire pour que `vitest`/Node la résolvent).

**Limites assumées, non résolues à cette étape** — écrans accessibles depuis
la navigation mais dont le résultat dépend de ports encore indisponibles
(§9, point 8) :
- **Finance**, **Suivi journalier**, **Paiements** (registre bancaire) :
  leurs actions échouent silencieusement (`journalFinancier`/`suiviJournalier`/
  `registreBancaire` lèvent une erreur côté serveur ; le client ne l'affiche
  pas explicitement, l'écran reste vide) — dépendent du lot « journal
  financier » (§5, étape 9), hors périmètre.
- **Passeport** : joindre une image de passeport à un nouveau reçu échoue
  (`definirImagesPasseport`, hors périmètre du noyau, R-90).
- **Impression** : le compteur d'impressions n'est pas incrémenté
  (`incrementerImpressions`, migration `202608020003` non déployée).
- **Correction du premier versement** : indisponible tant que
  `corrigerPremierVersement`/étape 8 n'est pas déployée.

Ces limites ne sont pas des faux succès : chaque appel échoue explicitement
(erreur retournée ou levée), rien n'est simulé. **Statistiques**, **Registre**,
**nouveau reçu**, **versement**, **annulation**, **modification**
(identité/contact/programme/note) et l'**écran du reçu imprimable**
fonctionnent pleinement sur les données réelles.

⚠️ **Correction du 2026-08-03, postérieure à cette étape** : « nouveau reçu »
et « versement » ne pouvaient en réalité **jamais** aboutir avant le correctif
décrit au §11 — un bug déjà présent dans le backend déployé, découvert en
testant l'étape 7. Voir §11 : la portée de ce paragraphe n'était donc exacte
qu'après ce correctif, pas au moment où cette étape a été commitée.

**Vérifié** : `pnpm exec tsc --noEmit`, `pnpm exec vitest run` (467 tests),
`pnpm run build` — tous au vert. `curl` non authentifié sur `/facturation`
confirme la redirection vers `/login` sans erreur serveur. **Non vérifié** :
un contrôle visuel authentifié dans un navigateur — aucun outil
d'automatisation navigateur n'était accessible dans cette session
(profil Playwright de `CLAUDE.md` non exposé ici). À faire avant la
prochaine session de travail, via la tâche VS Code « Omra Facturation —
aperçu local ».

---

## 11. Étape 7 — plafond du remboursement, et une découverte critique (2026-08-03)

**Objectif initial** : `supabase/migrations/202608030004_cap_cancellation_cash_outflow.sql`
resserre `cancel_billing_receipt` (§4.1) — la sortie de caisse doit valoir
exactement `0` ou le total payé, jamais une valeur intermédiaire. La
validation existante (`0 <= sortie <= total payé`) acceptait techniquement un
montant partiel ; l'adaptateur d'écriture (§9, point 5) l'évitait déjà côté
application, cette migration l'empêche aussi par un appel RPC direct.

**Découverte en testant cette migration en `BEGIN...ROLLBACK` contre la base
liée (`supabase db query --linked --file`, seule méthode transactionnelle
accessible dans cet environnement — voir la note technique en fin de
section)** : `create_billing_receipt_with_first_payment` — donc aussi
`create_complete_facturation_receipt`, qui la compose — échouait
**systématiquement**, à chaque appel, avec `column reference "season_id" is
ambiguous`. Cette fonction déclare `RETURNS TABLE(..., season_id uuid, ...)`,
créant un paramètre de sortie implicite `season_id` visible dans tout son
corps ; deux endroits le référencent sans le qualifier (la cible `ON CONFLICT
(season_id)` et la clause `WHERE season_id = v_season_id` de la mise à jour du
compteur). PL/pgSQL refuse de deviner lequel — colonne de table ou paramètre
de sortie — et lève une erreur plutôt que de choisir.

**Ce bug existe depuis la création initiale de la fonction (`202608010008`,
déployée bien avant cette session) et n'avait jamais été exercé.** Concrètement :
**aucune création de reçu réelle n'a jamais pu aboutir sur la base liée**,
avant ce correctif — y compris pendant les tests précédents de cette session
(§8, «*tests correction paiement n°1 réussis avec rollback*» portait sur
`correct_billing_receipt_first_payment_method`, jamais sur la création). Le
même test a révélé un second cas identique dans `cancel_billing_receipt`
(`RETURNS TABLE(..., lifecycle_status text, ...)`, clause `WHERE ... and
lifecycle_status = 'active'` non qualifiée) — déployée depuis `202608010010`,
elle aussi jamais exercée.

**Correctifs, dans deux migrations séparées, prêtes mais non poussées :**
- `202608030005_fix_ambiguous_season_id_receipt_counter_update.sql` — corrige
  `create_billing_receipt_with_first_payment` seule.
- `202608030004_cap_cancellation_cash_outflow.sql` — porte à la fois le
  plafond de remboursement (objectif initial) et la correction de
  `cancel_billing_receipt`, puisque les deux touchent la même fonction.

Les deux ajoutent `#variable_conflict use_column` en tête du corps (la
directive PL/pgSQL qui fait toujours gagner la colonne de table sur un
paramètre de sortie de même nom en cas d'ambiguïté — aucune des deux fonctions
ne lit ni n'écrit ses paramètres de sortie autrement que via ses variables
`v_*` explicites, donc ce choix ne change aucun comportement voulu), plus une
qualification explicite de la clause `WHERE` concernée par sécurité
supplémentaire. `ON CONFLICT (...)` n'acceptant pas de nom qualifié par la
table dans sa cible (erreur de syntaxe), la directive est la seule correction
possible pour ce cas précis.

**Une recherche du même motif dans les 3 autres fonctions financières
d'écriture** (`create_facturation_traveler_registration`,
`create_complete_facturation_receipt`, `add_billing_receipt_payment`, via
`pg_get_functiondef` sur la base liée) **n'a rien trouvé de comparable.**
Cette recherche n'est pas exhaustive sur les 25 fonctions ; l'étape d'audit
lecture seule (§6, tableau) devra vérifier spécifiquement ce motif sur le
reste, en plus de son objet initial.

**Vérifié, dans une seule transaction terminée par `ROLLBACK`** (les deux
migrations appliquées ensemble, sans rien laisser en base) :
1. création d'une inscription et d'un reçu réels via les RPC (identité simulée
   par un compte actif réel et `request.jwt.claims`, comme documenté dans
   `CLAUDE.md` — jamais affichée) : réussie, la fonction corrigée fonctionne ;
2. annulation avec une sortie partielle (`convenu - 1`) : refusée avec le
   message attendu ;
3. annulation avec une sortie égale au total payé : acceptée ;
4. annulation avec une sortie nulle, sur un second reçu : acceptée.

`supabase db lint --linked --level warning` (contre la base **non corrigée**,
donc avant que ces migrations ne soient poussées) confirme indépendamment le
premier bug : `{"function":"public.create_billing_receipt_with_first_payment",
"issues":[{"level":"error",... "column reference \"season_id\" is
ambiguous", ..., "sqlState":"42702"}]}` — une erreur de niveau `error`, pas
seulement un avertissement. Les avertissements restants (fonctions `STABLE`
appelant une expression volatile, variables non lues) sont ceux déjà connus,
sans rapport avec ce travail.

`supabase db push --dry-run` ne propose que ces deux fichiers.

**Conformément à la règle d'or : préparé, testé, documenté — PAS poussé.**
Le vrai push distant attend la validation du commanditaire à son retour.

**Note technique — méthode de test transactionnelle.** `supabase/.temp/pooler-url`
ne contient aucun mot de passe (seuls hôte, port, utilisateur et base y
figurent) : une connexion directe via `pg` échoue avec `SASL:
SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`. La CLI expose
en revanche `supabase db query --linked [--file …]`, qui exécute du SQL
arbitraire contre la base liée via l'API de gestion, sans jamais manipuler de
mot de passe. C'est la méthode utilisée pour tous les tests `BEGIN...ROLLBACK`
de cette section — y compris la simulation de session (`account_slots` lu
directement, `request.jwt.claims` positionné pour que l'appel soit vu comme
authentifié) prescrite par `CLAUDE.md`.
