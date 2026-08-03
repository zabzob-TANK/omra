# Audit lecture seule — backend Facturation vs `reprise.md`

Fait le 2026-08-03, sur la branche `integration-facturation`. **Lecture seule : rien n'est corrigé ni déployé ici.** Les trois migrations préparées à l'issue des étapes 7 et 8 (`202608030004`, `202608030005`, `202608030006`) sont documentées dans `docs/facturation/fusion.md` §11-§12 et restent en attente de validation — ce rapport ne les répète que pour mémoire, il ne les remplace pas.

Méthode : lecture directe du code source de chaque migration dans `supabase/migrations/`, complétée par `pg_get_functiondef(...)` sur la base liée (`supabase db query --linked`) pour vérifier l'état **réellement déployé** de chaque fonction — leçon tirée de l'étape 7 (voir fusion.md §11) où une correction locale avait été écrite à partir du mauvais point de départ. Aucune écriture, aucun `ROLLBACK` de test n'a eu lieu dans cet audit : uniquement des `SELECT` contre les catalogues système et les définitions de fonctions.

Fonctions couvertes (16 RPC Facturation déployées, plus la 17ᵉ préparée non déployée) :

`create_facturation_traveler_registration`, `create_billing_receipt_with_first_payment`, `create_complete_facturation_receipt`, `add_billing_receipt_payment`, `cancel_billing_receipt`, `update_billing_receipt_personal_data`, `update_billing_receipt_commercial_data`, `update_billing_receipt_dossier`, `correct_billing_receipt_first_payment_method` (non déployée), `attach_payment_operation_evidence_image`, `delete_payment_operation_evidence_image`, `get_billing_receipt_details`, `list_billing_receipts`, `list_billing_anomalies`, `list_reusable_payment_operations`, `resolve_facturation_actor`, `require_facturation_admin`.

---

## Constat majeur transversal — production actuellement cassée

**BLOQUANT.** `create_billing_receipt_with_first_payment` est **actuellement** en échec systématique sur la base liée (`column reference "season_id" is ambiguous`, `sqlState 42702`), et donc aussi `create_complete_facturation_receipt`, qui la compose. **Aucun nouveau reçu ne peut être créé via le vrai backend tant que `202608030005` n'est pas poussée.** `cancel_billing_receipt` a un correctif du même type en attente (`202608030004`), mais sa version **actuellement déployée** est saine (le correctif `202608010016` y est toujours intact — seule ma copie locale l'avait régressé, voir fusion.md §11).

Origine : `202608010016` et `202608010017` (déployées avant cette session) avaient déjà corrigé cette classe de bug — `RETURNS TABLE(...)` déclare un paramètre de sortie implicite qui entre en conflit avec une colonne réelle de même nom référencée sans qualification. La migration `202608030001` de cette session (ajout de l'instantané de versement) a été écrite à partir du corps de la migration de **création d'origine** de `create_billing_receipt_with_first_payment`, sans vérifier l'état déployé — régressant silencieusement le correctif `202608010017`.

**Recherche systématique du même motif sur les 16 fonctions déployées** (RETURNS TABLE dont un nom de colonne coïncide avec une colonne réelle, référencée sans qualification dans une clause WHERE/SET/ON CONFLICT) : **aucune autre occurrence trouvée**. Seules `create_billing_receipt_with_first_payment` (état déployé actuel : cassé) et `cancel_billing_receipt` (état déployé actuel : sain) sont concernées, et un correctif est déjà préparé pour les deux.

**Action recommandée avant tout autre travail** : pousser en priorité `202608030004` + `202608030005` (+ `202608030006`, qui en dépend transitivement pour ses propres tests) dès validation du commanditaire — la Facturation réelle est inutilisable pour toute nouvelle vente jusque-là.

---

## Constats par thème demandé

### Le 6ᵉ paiement solde-t-il exactement le reste ?

**Conforme.** `add_billing_receipt_payment` (`202608010009`, dernière version dans `202608010011`) :

```sql
if v_next_payment_number = 6 then
  if p_payment_amount_dh::bigint <> v_receipt_remaining_before_dh then
    raise exception 'Sixth payment must settle the receipt exactly';
  end if;
elsif p_payment_amount_dh::bigint > v_receipt_remaining_before_dh then
  raise exception 'Payment amount exceeds receipt remainder';
end if;
```

Le 6ᵉ paiement doit égaler exactement le restant ; tout paiement 2-5 est plafonné au restant. Aucun chemin ne permet de dépasser.

### Un paiement peut-il dépasser le restant ?

**Conforme**, voir ci-dessus. Même règle appliquée à la création (`create_billing_receipt_with_first_payment` : `if p_first_payment_amount_dh > v_agreed_amount_dh then raise 'First payment exceeds agreed amount'`).

### Le numéro de reçu est-il réservé sans trou, dans la transaction ?

**Conforme, une fois `202608030005` poussée.** `billing_receipt_counters` (clé primaire `season_id`) est verrouillé par `for update` avant lecture de `next_number`, incrémenté dans la même transaction que l'insertion du reçu. Aucun numéro n'est consommé si la transaction échoue avant la fin (rollback complet). **Actuellement inopérant** à cause du constat majeur ci-dessus — pas un défaut de conception, un défaut d'exécution (bug SQL empêchant tout appel).

### Les champs `*_snapshot` sont-ils tous renseignés à l'écriture ?

**Conforme.** `traveler_registrations` : `traveler_first_name_snapshot`, `traveler_last_name_snapshot`, `traveler_phone_snapshot`, `season_name_snapshot`, `season_code_snapshot`, `hotel_name_snapshot`, `flight_label_snapshot`, `room_label_snapshot`, `room_bed_count_snapshot`, `rabatteur_name_snapshot` sont tous renseignés par `create_facturation_traveler_registration` au moment de l'inscription, jamais recalculés en lecture. `receipt_payments.payment_snapshot_*` (9 colonnes, migration `202608030001`) sont renseignés par `create_billing_receipt_with_first_payment`/`add_billing_receipt_payment` au moment du versement, jamais réécrits ailleurs — vérifié qu'aucune autre fonction ne les modifie (`grep` sur toutes les migrations : seules ces deux fonctions y écrivent).

**Mineur — déjà noté dans `fusion.md`, pas un défaut nouveau.** `update_billing_receipt_commercial_data` change `hotel_name_snapshot`/`flight_label_snapshot`/`room_label_snapshot`/`room_bed_count_snapshot` sur `traveler_registrations` lors d'une correction commerciale — cohérent avec le principe que ces champs sont des instantanés de l'**inscription courante**, pas immuables comme ceux du versement (R-14/§5.7 ne s'applique qu'aux versements). Aucune incohérence trouvée, seulement une distinction à garder en tête pour la suite du travail.

### Un reçu annulé refuse-t-il modification et paiement ?

**Conforme.** Toutes les fonctions d'écriture sur un reçu existant vérifient `lifecycle_status <> 'active'` avant toute modification :
- `add_billing_receipt_payment` : `if v_receipt_lifecycle_status <> 'active' then raise 'Cancelled receipt cannot receive a payment'`.
- `update_billing_receipt_personal_data`, `update_billing_receipt_commercial_data`, `update_billing_receipt_dossier` : `if v_receipt_lifecycle_status <> 'active' then raise 'Cancelled receipt cannot be modified'`.
- `correct_billing_receipt_first_payment_method` (non déployée) : même vérification, conservée dans la reprise de l'étape 8.
- `cancel_billing_receipt` lui-même refuse une seconde annulation (`if v_receipt_lifecycle_status = 'cancelled' then raise 'Receipt is already cancelled'`, doublé d'une vérification sur `receipt_cancellations`).

### Le trop-perçu est-il jamais remboursé ou imputé automatiquement ?

**Conforme.** Recherché dans les 16 fonctions déployées : aucune n'effectue de mouvement financier automatique en réaction à un trop-perçu. `list_billing_anomalies`/`get_billing_receipt_details`/`list_billing_receipts` **calculent et affichent** `overpayment_dh`/`financial_status` à la lecture, sans jamais écrire nulle part. `cancel_billing_receipt` ne rembourse que ce que l'appelant demande explicitement (`p_cash_outflow_amount_dh`, plafonné à `0` ou au total payé une fois `202608030004` poussée). Aucune fonction ne transfère un trop-perçu d'un reçu à un autre.

### Les libellés arabes en texte libre passent-ils sans validation tronquante ?

**Conforme.** Tous les champs de nom/libellé pertinents (`travelers.current_first_name/last_name`, `traveler_registrations.*_snapshot`, `omra_dossiers.label`, `payment_instrument_details.payer_name`, etc.) sont typés `text` (illimité), avec uniquement des contraintes `btrim(...) <> ''` (non-vide). Aucune limite de longueur, aucune contrainte d'alphabet ou de sens de lecture trouvée dans le schéma.

---

## Autres constats, par gravité

### Majeur

**M1 — `correct_billing_receipt_first_payment_method` reste non déployée.** La reprise conforme à §4.2/§5.9 est prête (`202608030006`, étape 8) mais n'existe pas encore en production : toute tentative de correction du premier versement échoue (fonction introuvable), pas de faux succès.

**M2 — Aucune table ni fonction pour le journal financier, le suivi journalier ou l'acquittement d'anomalie (`fusion.md` §5).** Déjà documenté, non résolu dans cette session (hors périmètre). Les écrans Finance/Suivi journalier/Paiements de l'interface réelle (branchée à l'étape 6) restent non fonctionnels pour cette raison — voir `fusion.md` §10.

**M3 — Suivi des impressions non déployé (`202608020003`, migration en attente).** `enregistrerImpressionRecu()` (adaptateur d'écriture, étape 5b) lève une erreur claire ; aucune impression n'est comptée actuellement.

### Mineur

**m1 — `list_billing_receipts`, `list_billing_anomalies`, `get_billing_receipt_details` sont marquées `STABLE` mais appellent une expression `VOLATILE`** (avertissement `db lint`, déjà connu avant cette session — voir `CLAUDE.md` §11). Risque théorique de mise en cache incorrecte du plan par le planificateur dans certains contextes (ex. sous-requêtes répétées dans une même transaction) ; aucun symptôme observé. Ne bloque rien, mais mériterait vérification si des lectures incohérentes sont un jour rapportées.

**m2 — Variables déclarées mais jamais lues** dans plusieurs fonctions (`v_actor_slot_number`/`v_actor_auth_user_id`/`v_actor_slot_label`/`v_actor_login` dans les fonctions de lecture qui n'en ont pas l'usage direct ; `v_locked_dossier_id` dans `update_billing_receipt_dossier` ; `v_existing_evidence_id` dans `attach_payment_operation_evidence_image`). Cosmétique — ces variables proviennent de `resolve_facturation_actor()`, systématiquement appelée pour son effet de bord (vérification d'accès), pas toujours pour ses valeurs.

**m3 — `update_billing_receipt_dossier` ne correspond pas au modèle groupe/famille du prototype** (déjà documenté, `fusion.md` §5.4/§9 point 4) : gère un déplacement entre dossiers réels (`move_to_existing`/`separate_to_technical`), pas un simple changement de libellé texte libre. Pas un défaut de cette fonction en elle-même — un écart de modèle déjà connu et non résolu.

### Non-conformités déjà connues, résolues ou en attente de push

Rappel de ce qui a été traité pendant cette session, pour éviter une double lecture :
- **§4.1** (plafond de remboursement d'annulation) : corrigé, `202608030004`, en attente de push.
- **§4.2** (correction du premier versement réservée à l'administrateur) : corrigé, `202608030006`, en attente de push.
- **§4.3** (garde démo matérielle) : corrigé et déployé (code applicatif uniquement, aucune migration nécessaire) — voir `fusion.md` §10.

---

## Ce qui n'a pas été vérifié

- **Aucun test transactionnel n'a été exécuté dans cet audit** (lecture seule stricte, conformément à la consigne) : les constats ci-dessus reposent sur la lecture du code SQL et sur les tests déjà effectués aux étapes 7 et 8, pas sur une nouvelle exécution.
- **`update_billing_receipt_dossier` n'a pas été tracée en détail ligne à ligne** au-delà de la vérification du statut actif et de la recherche du motif d'ambiguïté — son modèle étant de toute façon signalé comme non conforme au besoin (m3), une revue plus poussée n'apporterait rien avant que la correspondance groupe/dossier soit tranchée.
- **RLS et permissions au niveau table** (`revoke`/`grant` sur chaque table financière) n'ont pas été redemandées individuellement dans cet audit : elles avaient déjà été vérifiées lors de la lecture complète des migrations en début de session (aucune anomalie relevée alors, non ré-auditées ici pour ne pas dupliquer un travail déjà fait).
