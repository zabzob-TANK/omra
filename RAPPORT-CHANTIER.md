# Rapport de chantier local — pendant le test du site en ligne

> **Périmé — instantané historique.** Ce rapport documente une phase
> antérieure (branche `chantier-local`, avant intégration dans
> `integration-facturation`) où rien n'avait encore été poussé ni déployé.
> Ce n'est plus l'état réel : des migrations sont appliquées en production
> depuis, du code a été poussé sur `integration-facturation`, et le
> chantier de performance (RPC de saison, N+1) documenté dans
> `RAPPORT-NUIT.md` (2026-08-09, racine du dépôt) a eu lieu depuis. Garder
> ce fichier pour l'historique des bugs qu'il documente, mais ne plus s'y
> fier pour l'état courant — voir `RAPPORT-NUIT.md` et
> `docs/facturation/reprise.md` pour l'état réel au 2026-08-09.

Branche : `chantier-local` (créée à partir de `integration-facturation`).
Portée : code local uniquement. Aucun déploiement (`vercel --prod`), aucune
migration appliquée à la base distante. Premiers tests interactifs faits en
mode démonstration (`FACTURATION_SOURCE=demo`) ; à partir du 2026-08-04, le
commanditaire a explicitement autorisé les tests contre la vraie base
locale (`http://127.0.0.1:3001/facturation`, backend Supabase réel), les
données actuelles étant considérées comme jetables jusqu'à nouvel ordre —
voir décisions ci-dessous.

## Contexte important découvert en cours de route

L'état des lieux `CLAUDE.md` (dernière vérification 2026-08-03) indiquait
les migrations `202608020003` et `202608020004` comme « non déployées » et
la base alignée seulement jusqu'à `202608020002`. Un `pnpm exec supabase
migration list` (lecture seule) montre que **la réalité a changé depuis** :
toutes les migrations locales jusqu'à `202608040004` inclus sont déjà
appliquées à distance — un vrai push a eu lieu avant le début de ce
chantier (cohérent avec le commit `2fb1bfb docs: push réel exécuté`). Ce
rapport tient compte de cet état réel, pas de l'ancien état documenté.

## Décisions du commanditaire (reçues en cours de chantier)

- **Mélange de saisons (item 1 ci-dessous)** : confirmé — une opération doit
  rester dans sa saison. Ne change rien à la prudence de déploiement : la
  migration reste préparée et testée, **non appliquée**, tant que le test
  du site en ligne est en cours.
- **Libellé français/arabe (item 2 ci-dessous)** : **explicitement laissé
  tel quel**. Consigne reçue : « ce qui est en français reste en français
  dans la langue, rien ne change tant que je n'ai pas décidé ». Aucune
  modification faite ni prévue sur ce point sans nouvelle décision
  explicite.
- **Données actuelles = jetables** : consigne reçue le 2026-08-04 : « on
  reste toujours dans les tests [...] considère tout ça comme éphémère,
  changeable et non utilisable » jusqu'à ce que le commanditaire annonce le
  déploiement final. Sur cette base, plusieurs actions réelles (paiement,
  reçu, modification) ont été faites directement sur la vraie base locale
  pour vérifier des correctifs — détaillé item par item ci-dessous.

## Bugs trouvés

### -2. Corriger le montant d'un chèque/virement unique après avoir renommé le client dupliquait l'opération et perdait le lien vers l'image (corrigé)

Trouvé en creusant pourquoi l'image d'un chèque, ajoutée à la création du
reçu test n°11, avait disparu de l'affichage après une simple correction de
montant. Enchaînement exact reproduit : création du reçu (chèque unique +
image) → correction de l'identité du client → correction du montant du
premier versement (rien d'autre changé). Vérifié en lecture seule sur la
vraie base : cette dernière étape avait silencieusement créé une **toute
nouvelle** opération de paiement au lieu de corriger celle en place —
l'ancienne opération et son image restent intactes (aucune suppression
silencieuse, ce point de la règle était respecté), mais orphelines.

**Cause** : un chèque/virement « unique » n'a pas de payeur au sens métier,
mais la RPC exige quand même ce champ techniquement ; le code comble ce
vide avec le **nom actuel du client**. Ce nom est recalculé à chaque
correction. La RPC compare ce nom au payeur déjà stocké pour décider si
« la méthode a changé » ; comme le client avait été renommé entre-temps, la
comparaison échouait à tort et déclenchait la création d'une opération
neuve.

**Corrigé** — `modules/facturation/data/supabase/write.ts`,
`corrigerPremierVersementSupabase()` : le payeur par défaut est maintenant
repris de l'opération déjà enregistrée sur le premier versement, jamais
recalculé depuis l'identité courante du client.

**Revérifié en conditions réelles**, deux fois de suite (renommer le
client puis corriger le montant) : l'opération reste désormais la même
(vérifié par son identifiant dans l'historique), le montant se met à jour
correctement, et le payeur stocké reste stable — comme l'exige la règle
« une opération déjà utilisée garde son payeur verrouillé ».

### -1.5. Écran « Chèques et virements » : tout chèque/virement unique s'affichait comme « Partagé » (corrigé)

Trouvé en vérifiant le bug ci-dessus : l'écran Finance → Paiements affichait
« Type : Partagé » pour le chèque du reçu 11, alors que la vraie base disait
bien « unique » — un bug d'affichage distinct, sans lien avec la
duplication d'opération.

**Cause** : `collecterOperationsBancaires` (`cheque-register.ts`) reproduit
fidèlement la détection du fichier de référence, qui suppose qu'un montant
d'opération non nul (`colAmt`) ne peut arriver que pour une opération
partagée — vrai dans le prototype, où ce champ vaut `0` pour un instrument
unique. Mais le mappeur Supabase (`mappers.ts`, lu depuis la vraie base)
renvoyait le montant réel de l'opération dans tous les cas, y compris pour
un instrument unique (où ce montant est toujours positif, puisqu'il égale
le paiement) — cassant le contrat implicite dont dépend le fichier de
référence. Concrètement : **toute** opération unique de la vraie base
tombait dans ce piège, pas seulement celle du reçu test.

**Corrigé** — `modules/facturation/data/supabase/mappers.ts`,
`mapVersement()` : ce montant vaut désormais `0` pour un instrument unique,
comme le veut le contrat du domaine (`instrumentUnique()`) et le fichier de
référence.

**Revérifié en conditions réelles** : le chèque du reçu 11 affiche
maintenant « Unique », une opération réellement partagée à côté continue
d'afficher « Partagé » correctement.

### -1. Un trop-perçu se faisait passer pour un reçu soldé, sans aucune trace visible (corrigé)

Trouvé en testant volontairement un scénario d'anomalie : changer le
programme (hôtel/vol/chambre) d'un reçu déjà payé peut légitimement faire
baisser le montant convenu sous ce qui a déjà été encaissé — un trop-perçu.
La règle (P13/§5.11, confirmée dans `CLAUDE.md`) dit que ce n'est **jamais
un refus**, seulement une anomalie qui doit **rester visible**, jamais
résolue silencieusement.

Vérifié : le trop-perçu était bien accepté (pas de refus), mais devenait
ensuite **invisible** — le reçu s'affichait « مسدد » (soldé) exactement
comme un reçu normalement réglé, dans la même couleur bleue calme, sans
aucune trace ailleurs (le bandeau d'anomalies de Finance couvre un tout
autre sujet : les mouvements apparus après une impression du journal, pas
les trop-perçus).

Cause trouvée en comparant au fichier de référence : trois fonctions
portées comparaient le restant avec `<= 0` là où le fichier de référence
compare **strictement** à `=== 0` (`stat()`, `restColor` du tableau des
chèques/virements, `showToast` de `savePay()`) — un restant négatif y est
traité **comme un restant positif** (donc « incomplet », en rouge), pas
comme un restant nul. Le port avait inversé ce cas précis : négatif traité
comme nul plutôt que comme non-nul.

**Corrigé** — comparaison `=== 0` rétablie à cinq endroits :
`modules/facturation/domain/rules/receipt.ts` (`statutAffiche`,
`symboleSituation`), `modules/facturation/domain/rules/payment.ts`
(`motifRefusVersement`, R-17 — un trop-perçu n'est plus considéré
« déjà soldé », un nouveau versement reste tentable mais R-21 le
bloquera avec un message montrant le vrai restant négatif, plus
informatif), `modules/facturation/ui/ecrans/registre.tsx` et
`modules/facturation/ui/modales/detail.tsx` (couleur rouge au lieu de
bleu), `modules/facturation/ui/application.tsx` (message de notification).
Trois tests existants affirmaient l'ancien comportement sans aucune
justification écrite (contrairement au cas du libellé français, où un
commentaire explicite existait) — corrigés pour refléter le comportement
du fichier de référence, avec le raisonnement en commentaire.

**Revérifié en conditions réelles** sur le reçu test n°11 (convenu abaissé
sous le payé par un changement de chambre) : le reçu affiche maintenant
« غير مكتمل » en rouge avec « -200 » bien visible, au lieu de disparaître
comme soldé.

### 0. Après « ajouter un paiement », l'appli ne rouvrait pas le reçu (corrigé)

Signalé par le commanditaire : après avoir enregistré un paiement
(« إضافة دفعة ») sur un reçu existant, l'application restait sur le
registre au lieu d'ouvrir directement le reçu — alors que la création d'un
nouveau reçu, elle, ouvre bien le reçu après enregistrement.

Vérifié contre le fichier de référence : `savePay()` (le gestionnaire de
paiement du prototype) fait exactement
`this.setState({modal:null,curRecu:r.id,curOriginal:true,screen:'recu'})`
après un enregistrement réussi — donc l'écran de reçu s'ouvre bien après
un paiement dans l'original. Le port (`modules/facturation/ui/application.tsx`,
gestionnaire `onEnregistrer` de `ModaleVersement`) avait le rafraîchissement
et la notification, mais **pas** la navigation vers l'écran du reçu — un
oubli de portage, pas une divergence voulue.

**Corrigé** sur `chantier-local` (`application.tsx:808-827`) : ajout de
`setRecuOriginal(...)` + `setEcran({ nom: 'recu', recuId: ... })` après un
ajout de paiement réussi, à l'identique du chemin déjà existant pour un
nouveau reçu. Revérifié en interactif en mode démonstration : le
paiement s'enregistre, le montant payé se met à jour, et l'écran du reçu
s'ouvre directement, comme demandé.

Retesté ensuite en vrai mode (base réelle locale, décision du commanditaire
d'utiliser les données actuelles comme jetables) : un vrai paiement de
100 DH ajouté sur un vrai reçu (n°1, احمد العالي) confirme le même
comportement contre la vraie base.

### 0bis. Le correctif de mélange de saisons cassait tout accès en vrai mode (corrigé)

Découvert en testant contre la vraie base : `/facturation` plantait
systématiquement (« Could not find the function
public.list_reusable_payment_operations(p_payment_mode, p_season_id) in
the schema cache »). Cause : le correctif de l'item 1 ci-dessous envoie un
nouveau paramètre `p_season_id` à cette RPC, mais la migration qui l'ajoute
côté base (`202608040005`) n'est pas déployée — seul le code client avait
changé. **Corrigé** : `listerOperationsPartageesReutilisables`
(`modules/facturation/data/supabase/read.ts`) accepte toujours `saisonId`
mais ne le transmet plus à la RPC tant que la migration n'est pas
déployée — une seule ligne à rétablir au moment du déploiement (commentaire
laissé dans le code). Revérifié : le vrai mode fonctionne à nouveau.

### 0ter. Modification de la section « Groupe / famille » : fenêtre bloquée sans aucun message (corrigé)

Trouvé en testant la modification d'un reçu réel (n°11) : cocher
« ينتمي إلى مجموعة / عائلة », remplir un code et enregistrer faisait
planter la fenêtre de modification — tous les boutons (« حفظ التعديل »,
« إلغاء », retour de section) devenaient grisés et inutilisables, sans
aucun message d'erreur affiché. Seul le journal serveur montrait la vraie
cause : la modification du groupe n'est délibérément pas encore branchée
côté omra (écart de modèle non résolu, `fusion.md §5.4` — le modèle réel
de dossier ne correspond pas encore au tag libre du prototype), et
`appliquerModification` lève une exception brute au lieu de renvoyer un
résultat d'erreur normal. **La décision de ne pas brancher cette section
reste inchangée** (ce n'est pas une décision à improviser) — seul le
**comportement en cas d'échec** est corrigé :
- nouvelle erreur dédiée `SectionIndisponibleError` (`modules/facturation/data/ports.ts`),
  levée à la place d'une `Error` générique pour ce cas précis ;
- `modifierRecu()` (`modules/facturation/data/service.ts`) l'attrape et
  renvoie un `Resultat` d'erreur normal, comme elle le fait déjà pour
  « aucune saison active » ;
- nouveau code d'erreur `section-indisponible`
  (`modules/facturation/domain/rules/errors.ts`) avec un message clair :
  « هذا القسم غير متاح حاليًا. جرّب قسمًا آخر أو راجع المدير. »

Revérifié en conditions réelles : la fenêtre affiche maintenant le message
et redevient utilisable (boutons réactivés) au lieu de rester bloquée.

**Filet de sécurité généralisé.** En creusant ce cas, le même défaut
(exception non attrapée → fenêtre bloquée sans message) existait pour
**toute** erreur inattendue lors de l'écriture, pas seulement celle du
groupe, et pas seulement dans `modifierRecu()` : `creerRecu()`,
`ajouterVersement()` et `annulerRecu()` (`modules/facturation/data/service.ts`)
appelaient elles aussi leur RPC d'écriture sans filet. Un test réel l'a
confirmé : rouvrir « Identité » sur un reçu et enregistrer sans changement
réel a déclenché « Error: No personal data changed » côté RPC, avec le
même blocage de fenêtre. Les quatre fonctions attrapent maintenant toute
erreur inattendue à ce point précis, la journalisent côté serveur
(`console.error`) pour le diagnostic, et renvoient un nouveau code
générique `erreur-inattendue` (« تعذر حفظ التعديل. تحقق من أنك غيّرت شيئًا
فعلاً ثم أعد المحاولة. ») au lieu de laisser l'exception remonter brute.
Revérifié : la fenêtre « Identité » affiche maintenant ce message et reste
utilisable dans ce scénario.

### 0quater. Correction du montant du premier versement : jamais branchée malgré la migration déployée (corrigé)

Découverte en creusant la section « Groupe » ci-dessus :
`corrigerPremierVersementSupabase()` (`modules/facturation/data/supabase/write.ts`)
levait encore inconditionnellement une erreur renvoyant à la migration
`202608020004` — décrite dans `CLAUDE.md` comme non conforme et devant être
reprise. Or une **nouvelle** migration, `202608030006_correct_first_payment_method_admin_amount.sql`,
implémente déjà la règle actée le 2026-08-03 (administrateur peut corriger
le montant, plafonné au convenu, jamais de trop-perçu créé par cette voie)
et **était déjà déployée** (confirmée dans `pnpm exec supabase migration list`).
Autrement dit : la décision métier était prise, testée, déployée côté base —
mais le code client n'avait jamais été raccordé à la RPC
`correct_billing_receipt_first_payment_method`. Résultat concret avant
correction : aucun administrateur ne pouvait corriger le montant du premier
versement, malgré la fonctionnalité prête côté base.

**Corrigé, avec votre accord explicite pour s'y lancer.** Le raccordement
touchait plusieurs fichiers :
- `modules/facturation/data/supabase/write.ts` — `corrigerPremierVersementSupabase()`
  appelle maintenant la vraie RPC, en réutilisant `resoudreParametresInstrument()`
  (déjà utilisée par `creerRecuSupabase`/`ajouterVersementSupabase`, élargie
  pour accepter `CorrectionPremierVersement` en plus de `Versement`).
- `modules/facturation/domain/rules/edit-sections.ts` — **R-32 ajouté** : la
  correction n'existait pas encore pour cette section : corriger le montant
  d'un versement déjà rattaché à une opération partagée, ou créer une
  opération neuve trop petite pour le montant qu'elle porte, exige
  maintenant une confirmation explicite de dépassement (comme pour un
  nouveau reçu ou un ajout de paiement), au lieu d'un dépassement silencieux
  jamais audité. `ContexteModification` reçoit `operations`/`recus` pour ce
  calcul, et `depassementConfirme`.
- `modules/facturation/data/service.ts`, `app/facturation/actions.ts` —
  `modifierRecu()`/`modifierRecuAction()` acceptent et propagent cette
  confirmation.
- `modules/facturation/ui/modales/modification.tsx`,
  `modules/facturation/ui/application.tsx` — la fenêtre affiche maintenant
  la même boîte de confirmation de dépassement que les autres écrans
  (`ModaleDepassement`) au lieu de ne rien prévoir pour ce cas ; un bug
  latent au passage (`onClick={soumettre}` transmettait l'événement de clic
  comme paramètre de confirmation) est corrigé du même geste.
- Trois nouveaux tests dans `edit-sections.test.ts` couvrant le
  dépassement (opération neuve trop petite, opération déjà partagée
  dépassée, confirmation explicite qui laisse passer).

**Vérifié en conditions réelles**, sur la vraie base locale (données
considérées jetables pour l'instant, comme convenu) :
- correction du montant d'un versement unique (chèque, 33 800 → 30 000 DH) :
  total payé, reste dû et statut du reçu se mettent à jour correctement ;
- passage d'un versement unique (chèque) à une opération partagée neuve
  avec un montant d'opération volontairement insuffisant (2 000 DH pour un
  versement de 5 000 DH) : la boîte de confirmation de dépassement
  s'affiche avec les bons chiffres, et la confirmation explicite enregistre
  correctement l'opération avec le dépassement conservé (vérifié en
  rouvrant le détail du reçu : opération à 2 000 DH portant un versement de
  5 000 DH, dépassement conservé tel quel, pas de trop-perçu masqué).

**Note non corrigée, signalée pour décision** : le sous-titre du bouton de
section « طريقة الدفعة الأولى » dans la fenêtre de modification affiche
encore « الطريقة وبيانات الشيك أو التحويل، دون تغيير المبلغ » (« la méthode
et les données du chèque ou virement, sans changer le montant ») — repris
mot pour mot du fichier de référence, où c'était vrai (le prototype n'a
jamais eu cette fonctionnalité). Ce n'est plus tout à fait exact pour un
administrateur omra maintenant que la correction fonctionne. Comme pour le
libellé français/arabe signalé plus haut, je n'ai rien changé ici sans
votre décision explicite.

### 1. Mélange de saisons confirmé — RPC des opérations partagées réutilisables (déjà en production)

`list_reusable_payment_operations` (migration `202608030003`, **déjà
déployée**) liste toutes les opérations chèque/virement partagées, sans
aucun filtre de saison — son propre commentaire d'origine le dit
explicitement (« without a dossier or season restriction »). Combiné à
`contexteCommun()` dans `modules/facturation/data/service.ts`, qui appelait
`recus.lister({ inclureAnnules: true })` **sans `saisonId`** (seul appel du
fichier à ne pas le faire — les 4 autres appels le font), le calcul du
montant disponible d'une opération partagée mélangeait les reçus de toutes
les saisons. Contraire à reprise.md §5.3 (« un écran ne mélange jamais les
saisons »).

**Impact réel vérifié** (lecture seule sur la vraie base) : une seule
saison existe actuellement en production, et les 4 opérations partagées
existantes lui appartiennent toutes. **Le bug est réel et déjà en
production, mais sans impact observable aujourd'hui** — il se déclenchera
dès qu'une deuxième saison existera et qu'une opération partagée de
l'ancienne saison réapparaîtra dans le sélecteur « opération existante »
d'une nouvelle saison.

**Corrigé sur cette branche (code seul, sans risque)** :
`contexteCommun()` passe maintenant `saisonId: saison.id` comme les autres
appels — `modules/facturation/data/service.ts:301-309`.

**Préparé mais non appliqué** (décision métier à confirmer) :
migration `supabase/migrations/202608040005_scope_reusable_payment_operations_by_season.sql`
ajoutant un paramètre `p_season_id` à la RPC, plus le branchement complet
côté code (`ports.ts`, `supabase/read.ts`, `supabase/clients-operations.ts`,
`service.ts`, 4 appels à `operationsPartagees.lister(saison.id)`).
**Testée en `BEGIN...ROLLBACK` sur la vraie base distante** (lecture seule
au final, transaction annulée et signature de fonction re-vérifiée
inchangée après coup) :
- avec la vraie saison active → 4 opérations (comportement correct,
  identique à avant) ;
- avec une saison fictive jamais utilisée → 0 opération (la fuite
  disparaît) ;
- sans filtre (compatibilité) → 4 opérations (comportement historique
  préservé si jamais appelé sans saison).

**Décision métier encore ouverte, à trancher avant de pousser** :
l'interprétation retenue dans la migration préparée est qu'une opération
reste visible pour la saison active si elle n'a **encore aucune allocation**
(neuve) OU si **au moins une** de ses allocations appartient à un reçu de
cette saison. Alternative non retenue : exiger que **toutes** les
allocations soient de la saison active (plus strict). Le commentaire en
tête de la migration détaille le choix et l'alternative. **Ne pas déployer
sans confirmation.**

⚠️ **Mise à jour** : le premier commit envoyait `p_season_id` à la vraie
RPC, ce qui a effectivement cassé tout chargement de `/facturation` en
mode réel (« Could not find the function ... in the schema cache »),
constaté en testant en conditions réelles. **Corrigé** :
`listerOperationsPartageesReutilisables` (`modules/facturation/data/supabase/read.ts`)
accepte toujours `saisonId` mais ne le transmet plus à la RPC tant que la
migration `202608040005` n'est pas déployée — une seule ligne à rétablir
au moment du déploiement (commentaire laissé dans le code à cet effet).
Revérifié : le mode réel fonctionne à nouveau normalement.

### 2. Divergence de langue signalée, non corrigée (décision à confirmer)

Le sélecteur « opération existante » (Nouveau reçu → chèque/virement →
opération mشtarakة → choisir une opération existante) affiche un libellé du
type *« Virement VIR-2026-0455 · التجاري وفا بنك · restant 15 000 DH »* —
mots français (« Virement », « restant ») insérés dans un écran par
ailleurs entièrement arabe RTL (Nouveau reçu est documenté comme écran
arabe). Le fichier de référence (`Zemzem Asfar.dc.html`, fonction
`sharedOptions()`) construit ce même libellé **entièrement en arabe** :
`'شيك '`/`'تحويل '` + `' · المتبقي '`.

Le port actuel (`modules/facturation/domain/rules/shared-payment.ts:102-107`)
a donc divergé du prototype. Cependant un test existant
(`shared-payment.test.ts:101-105`, commentaire « compose un libellé
lisible en français ») affirme délibérément ce choix français, sans que
`reprise.md`/`inventaire.md` documentent la décision correspondante — donc
soit une décision métier prise ailleurs sans trace écrite, soit un
glissement non voulu lors du portage.

**Non corrigé** : changer la langue d'un libellé visible est une décision
produit, pas un bug purement technique, et il existe un test qui l'assume
explicitement. À trancher : aligner sur le prototype (arabe : `شيك `/`تحويل `
+ ` · المتبقي `) ou confirmer explicitement le choix français actuel (et
mettre à jour `inventaire.md` en conséquence pour que la question ne se
repose plus).

### 3. Note opérationnelle : bouton « Imprimer » du prototype de reçu bloque un navigateur automatisé

Sans rapport avec le code de l'app : le bouton « Imprimer » de l'aperçu
d'impression (`أدوات الاختبار`, calibration papier) appelle `window.print()`,
qui ouvre une vraie boîte de dialogue d'impression Windows — cela bloque
tout navigateur piloté automatiquement (Playwright) tant que la boîte
n'est pas fermée manuellement. Rien à corriger dans le code ; simple mise
en garde pour de futurs tests automatisés sur ce bouton précis.

## Comportements vérifiés corrects (aucune régression, aucun bug)

Testés en interactif en mode démonstration (`http://127.0.0.1:3001/facturation`,
`FACTURATION_SOURCE=demo`) :

- **Compteur d'impression** : incrémente immédiatement au clic sur
  « طباعة », y compris quand la boîte d'impression système est ensuite
  annulée — conforme à la règle métier.
- **Annulation de reçu** : formulaire correctement validé (méthode de
  remboursement obligatoire), champ mot de passe correctement vidé après
  un échec de validation, confirmation par mot de passe fonctionnelle.
  Le total annulé et la sortie de caisse réelle sont comptabilisés
  séparément et correctement (testé avec un reçu payé en espèces : sortie
  de caisse = montant réellement payé, ni plus ni moins ; testé aussi
  avec un reçu déjà annulé au chèque marqué « hors caisse » : n'affecte
  pas le solde caisse). L'arithmétique du jour (`الصندوق`) recoupe
  exactement entrée moins sortie du même jour.
- **Ajout de dépôt** : le dépassement du reste dû est correctement rejeté
  (« الدفع الزائد ممنوع »).
- **Modification de reçu** : le formulaire respecte la règle
  administrateur/employé pour le premier versement (aucune option de
  changer le montant proposée à un compte non-administrateur) ; le
  wizard « un seul type de section à la fois » fonctionne.
- **Statistiques** : confirmé comme volontairement une simple page
  d'attente (« مرحلة لاحقة »), cohérent avec la décision déjà actée dans
  une session précédente de ne pas ajouter de calculs qui affecteraient
  la facturation.
- **Aucune erreur console** pendant tout le parcours testé cette session
  (registre, détail, nouveau reçu, modification, annulation, dépôt,
  finance/paiements, finance/suivi, statistiques).
- Double-clic pour ouvrir le détail d'un reçu (pas un simple clic) :
  comportement voulu, avec infobulle explicite — pas un bug.

## Non testé cette session (à couvrir une prochaine fois)

- Suivi journalier (onglet Finance) en détail.
- Import d'image de justificatif (chèque/virement) et suppression logique.
- Scénario de dépassement confirmé sur une opération partagée (le cas
  existe déjà dans le jeu de démonstration — reçu 262 — mais n'a pas été
  rejoué pas à pas cette session).
- Item feuille de route « autorisation par appareil / session unique par
  compte » (fusion.md, item 10 du plan d'exécution) : non investigué
  cette session, faute de temps après le travail sur le mélange de
  saisons.

## Vérifications techniques

- `pnpm exec tsc --noEmit` : ✅ aucune erreur.
- `pnpm exec vitest run` : ✅ 467 tests, 26 fichiers, tous passants.
- `pnpm run build` : ✅ build de production réussi.
- `git diff --check` : ✅ (avertissements de fin de ligne LF/CRLF Windows
  uniquement, sans caractère de conflit).

## Fichiers modifiés sur `chantier-local`

- `modules/facturation/data/supabase/write.ts` — `corrigerPremierVersementSupabase()`
  reprend le payeur déjà stocké au lieu du nom courant du client (item -2).
- `modules/facturation/data/supabase/mappers.ts` — `mapVersement()` renvoie
  `montantOperationCentimes: 0` pour un instrument unique, comme le domaine
  et le fichier de référence (item -1.5).
- `modules/facturation/domain/rules/receipt.ts` — `statutAffiche`/`symboleSituation`
  comparent le restant strictement à zéro (item -1, trop-perçu visible).
- `modules/facturation/domain/rules/payment.ts` — `motifRefusVersement`
  (R-17) idem (item -1).
- `modules/facturation/domain/rules/receipt.test.ts`,
  `modules/facturation/domain/rules/payment.test.ts` — tests corrigés pour
  refléter ce comportement (item -1).
- `modules/facturation/ui/ecrans/registre.tsx`,
  `modules/facturation/ui/modales/detail.tsx` — couleur rouge conservée
  pour un restant négatif (item -1).
- `modules/facturation/ui/application.tsx` — navigation vers l'écran du
  reçu après un ajout de paiement réussi (item 0 ci-dessus) ; message de
  notification aligné sur `=== 0` (item -1).
- `modules/facturation/data/service.ts` — `contexteCommun()` et 3 autres
  appels : `recus.lister()`/`operationsPartagees.lister()` scopés à la
  saison active partout, sans exception.
- `modules/facturation/data/ports.ts` — `OperationsPartageesPort.lister`
  accepte un `saisonId` optionnel.
- `modules/facturation/data/supabase/read.ts` — `listerOperationsPartageesReutilisables`
  accepte `saisonId` mais ne le transmet **pas encore** à la RPC (item
  0bis : évite de casser le vrai mode tant que la migration n'est pas
  déployée — une ligne à rétablir au déploiement).
- `modules/facturation/data/supabase/clients-operations.ts` — branche le
  `saisonId` reçu vers la fonction de lecture.
- `supabase/migrations/202608040005_scope_reusable_payment_operations_by_season.sql`
  — **nouvelle migration, non appliquée**, testée en `BEGIN...ROLLBACK`
  contre la vraie base (voir section 1).
- `modules/facturation/data/ports.ts` — nouvelle erreur `SectionIndisponibleError`
  (item 0ter).
- `modules/facturation/domain/rules/errors.ts` — nouveau code d'erreur
  `section-indisponible` et son message (item 0ter).
- `modules/facturation/data/supabase/write.ts` — la section « group » lève
  `SectionIndisponibleError` au lieu d'une `Error` générique (item 0ter) ;
  `corrigerPremierVersementSupabase()` appelle réellement
  `correct_billing_receipt_first_payment_method` (item 0quater) ;
  `resoudreParametresInstrument` élargie à `CorrectionPremierVersement`.
- `modules/facturation/domain/rules/edit-sections.ts` — R-32 (confirmation
  de dépassement) ajouté à la section « premier versement » ; nouveaux
  champs `operations`/`recus`/`depassementConfirme` sur `ContexteModification`
  (item 0quater).
- `modules/facturation/domain/rules/edit-sections.test.ts` — trois
  nouveaux tests de dépassement, un montant de test corrigé (item 0quater).
- `modules/facturation/domain/rules/errors.ts` — nouveau code
  `erreur-inattendue` (filet de sécurité général, voir plus haut).
- `modules/facturation/ui/modales/modification.tsx` — gestion de
  `confirmation-requise` via `ModaleDepassement`, correction au passage
  d'un bug latent (`onClick={soumettre}` sans fonction fléchée transmettait
  l'événement de clic comme paramètre de confirmation).
- `app/facturation/actions.ts` — `modifierRecuAction` accepte et propage la
  confirmation de dépassement.

## Rien n'est parti en ligne

- Aucun `vercel --prod` exécuté.
- Aucune migration appliquée à la base distante (la seule interaction
  avec la vraie base a été des lectures seules et un `BEGIN...ROLLBACK`
  vérifié annulé).
- Toutes les données de test (16 reçus de démonstration, annulation
  testée, dépassement testé) vivaient uniquement dans l'adaptateur
  démonstration en mémoire (`FACTURATION_SOURCE=demo`) — rien n'a touché
  Supabase.
- `integration-facturation` n'a reçu aucun commit ; tout est sur
  `chantier-local`, prêt à être poussé sur cette branche seule si demandé.
