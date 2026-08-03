# Registre des règles — reconstruction Zemzem Asfar

Registre de référence de la reconstruction. Chaque ligne correspond à un élément
identifié dans le fichier `Zemzem Asfar.dc.html` et validé par le commanditaire.

Ce fichier est **lu par un script** : `npm run couverture` vérifie que chaque
identifiant d'un lot déjà livré apparaît dans le code *et* dans les tests.
Le tableau ne doit donc pas changer de forme (une ligne par identifiant, colonnes
séparées par `|`).

## Colonnes

| Colonne | Sens |
| --- | --- |
| `ID` | Identifiant stable, cité dans le code et dans le nom des tests |
| `Élément` | Description issue du fichier de référence |
| `Lot` | Lot de réalisation prévu |
| `Statut` | `livré`, `prévu` |

## Lots

| Lot | Contenu | État |
| --- | --- | --- |
| L0 | Socle : structure, types, argent, formatage, bidi, ports, adaptateur de démonstration, registre, tests | livré |
| L1 | Noyau métier pur, entièrement testé, sans interface | livré |
| L2 | Registre des reçus, fiche, création, versement, détail, modification, annulation, journal | livré |
| L3 | Reçu imprimable A4 sur `fond-facture.png` | livré |
| L4 | Journal financier, impression, anomalies | livré |
| L5 | Suivi journalier, registre chèques et virements, images | livré |
| L6 | Statistiques | livré |
| L7 | Finitions visuelles, comparaison écran par écran | livré |

---

## Constantes

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| C-01 | Hôtels du prototype | L0 | livré |
| C-02 | Compagnies aériennes | L0 | livré |
| C-03 | Types de chambre, 2 à 7 | L0 | livré |
| C-04 | Rabatteurs | L0 | livré |
| C-05 | Grille tarifaire indexée hôtel, vol puis chambre | L0 | livré |
| C-06 | Saison : nom, réduction maximale, durée | L0 | livré |
| C-07 | Maximum de six versements | L0 | livré |
| C-08 | Comptes et rôles | L0 | livré |
| C-09 | Filtre de saisie des caractères arabes | L0 | livré |

## Utilitaires

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| U-01 | Formatage d'un montant en centimes, `fr-FR`, espaces normalisés | L0 | livré |
| U-02 | Montant avec devise, isolé en lecture gauche-à-droite | L0 | livré |
| U-03 | Date du jour, heure courante, horodatage complet | L0 | livré |
| U-04 | Conversions date française ↔ clé de journée | L0 | livré |
| U-05 | Total payé et restant dû d'un reçu | L1 | livré |
| U-06 | Statut affiché : annulé, soldé, incomplet | L1 | livré |
| U-07 | Validation de forme d'une date saisie | L0 | livré |
| U-08 | Masque du numéro de téléphone | L0 | livré |
| U-09 | Masque de date à la frappe | L0 | livré |
| U-10 | Masque de montant, chiffres seuls | L0 | livré |
| U-11 | Nettoyage des champs arabes | L0 | livré |
| U-12 | Normalisation de la nature de paiement, libellés et couleurs | L0 | livré |
| U-13 | Identité dérivée d'une opération partagée | L0 | livré |
| U-14 | Échappement HTML pour le gabarit du reçu | L0 | livré |

## Règles — création d'un reçu

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-01 | Prénom, nom et téléphone obligatoires | L1 | livré |
| R-02 | Téléphone d'exactement dix chiffres | L1 | livré |
| R-03 | Hôtel, vol, chambre, rabatteur et premier versement obligatoires | L1 | livré |
| R-04 | Code de groupe obligatoire si la case est cochée | L1 | livré |
| R-05 | Combinaison sans tarif défini : blocage | L1 | livré |
| R-06 | Réduction inférieure ou égale au plafond de la saison | L1 | livré |
| R-07 | Réduction strictement inférieure au tarif | L1 | livré |
| R-08 | Montant convenu = tarif − réduction | L1 | livré |
| R-09 | Premier versement strictement positif | L1 | livré |
| R-10 | Premier versement au plus égal au convenu, surpaiement interdit | L1 | livré |
| R-11 | Numéro pris sur la séquence et incrémenté | L1 | livré |
| R-12 | Statut initial actif, compteur d'impressions à zéro | L1 | livré |
| R-13 | Client créé et passeport rattaché s'il a été saisi | L1 | livré |
| R-14 | Instantané figé sur le premier versement | L1 | livré |

## Règles — versements

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-15 | Numéro de reçu obligatoire et existant | L1 | livré |
| R-16 | Reçu annulé : ajout refusé | L1 | livré |
| R-17 | Reçu soldé : ajout refusé | L1 | livré |
| R-18 | Six versements atteints : ajout refusé | L1 | livré |
| R-19 | Montant strictement positif | L1 | livré |
| R-20 | Sixième versement exactement égal au restant | L1 | livré |
| R-21 | Montant au plus égal au restant | L1 | livré |
| R-22 | Instantané figé à chaque versement | L1 | livré |

## Règles — instrument bancaire

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-23 | Espèces : aucun champ d'instrument | L1 | livré |
| R-24 | Opération partagée existante : seul l'identifiant est requis | L1 | livré |
| R-25 | Référence, date et banque obligatoires | L1 | livré |
| R-26 | Opération partagée : payeur et montant total obligatoires, total positif | L1 | livré |
| R-27 | Opération existante : disponible = restant de l'opération | L1 | livré |
| R-28 | Opération nouvelle : création et disponible = total | L1 | livré |

## Règles — opérations partagées

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-29 | Attribué = somme des versements portant l'identifiant | L1 | livré |
| R-30 | Restant = total − attribué | L1 | livré |
| R-31 | Options : même nature, non archivée, restant positif, tri par création décroissante | L1 | livré |
| R-32 | Dépassement autorisé après confirmation explicite, écart conservé | L1 | livré |
| R-33 | Aucune surveillance automatique des doublons | L1 | livré |
| R-34 | Totaux : une seule opération financière, sans double comptage | L4 | livré |

## Règles — images de chèques et virements

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-35 | Une seule image active par opération | L5 | livré |
| R-36 | Image existante : ajout et remplacement refusés | L5 | livré |
| R-37 | Opération partagée déjà enregistrée : ajout renvoyé vers le registre | L5 | livré |
| R-38 | Image portée par l'opération, jamais dupliquée par reçu | L5 | livré |
| R-39 | Suppression réservée à l'administrateur, avec confirmation | L5 | livré |
| R-40 | Nouvel ajout possible après suppression | L5 | livré |
| R-41 | Ajout et suppression tracés au journal | L5 | livré |
| R-42 | Migration : image d'un versement partagé remontée vers l'opération | L5 | livré |

## Règles — annulation

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-43 | Motif, mode de remboursement et mot de passe obligatoires | L1 | livré |
| R-44 | Mot de passe vérifié contre l'utilisateur connecté | L1 | livré |
| R-45 | Statut annulé, aucune suppression, numéro jamais réutilisé | L1 | livré |
| R-46 | Montant remboursé = total payé | L1 | livré |
| R-47 | Remboursement espèces : mouvement de caisse ; hors caisse : aucun mouvement | L1 | livré |
| R-48 | Trois mesures distinctes : personnes, montant total annulé, sortie de caisse | L4 | livré |

## Règles — modification

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-49 | Une seule section modifiable à la fois | L1 | livré |
| R-50 | Motif obligatoire | L1 | livré |
| R-51 | Différence champ par champ, empilée | L1 | livré |
| R-52 | Section programme : recalcul du tarif et du convenu, blocage si sans prix, et refus d'un convenu inférieur au montant déjà payé | L1 | livré |
| R-53 | Section premier versement : méthode et instrument seulement, montant inchangé | L1 | livré |
| R-54 | Rabatteur et montants non modifiables | L1 | livré |
| R-55 | Versements de rang deux et suivants jamais modifiables | L1 | livré |

## Règles — journal financier

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-56 | Filtres jour, plage, tout ; navigation et raccourcis | L4 | livré |
| R-57 | Espèces affichées nettes des remboursements de caisse | L4 | livré |
| R-58 | Codes de mode : E, CH, V, CH-P, V-P | L4 | livré |
| R-59 | Badge N sur le premier versement, sinon le rang | L4 | livré |
| R-60 | Lignes d'annulation présentées séparément | L4 | livré |
| R-61 | Impression : employé limité à aujourd'hui et hier, administrateur sans limite | L4 | livré |
| R-62 | Impression enregistrée : jour, numéro, horodatage, auteur, mouvements | L4 | livré |
| R-63 | Anomalies : apparus entre deux impressions et absents de la dernière | L4 | livré |
| R-64 | Aucune anomalie tant que le jour n'a jamais été imprimé | L4 | livré |
| R-65 | Levée réservée à l'administrateur, acquittement conservé | L4 | livré |
| R-66 | Indicateur d'état de la veille | L4 | livré |
| R-67 | Impression A4 paysage, marge 5 mm, 31 lignes par page | L4 | livré |

## Règles — suivi journalier

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-68 | Une ligne par jour du mois, y compris les jours sans activité | L5 | livré |
| R-69 | Définition d'une journée active | L5 | livré |
| R-70 | Sélection multiple, tout sélectionner, effacer, masquer les jours vides | L5 | livré |
| R-71 | Samedi et dimanche teintés | L5 | livré |
| R-72 | Agrégats par journée | L5 | livré |

## Règles — registre des chèques et virements

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-73 | Regroupement par opération, partagée ou unique | L5 | livré |
| R-74 | Filtres date, recherche, mode, type, présence d'image | L5 | livré |
| R-75 | Tri interne par date et heure d'enregistrement, heure non affichée | L5 | livré |
| R-76 | Détail : répartition entre reçus avec situation de chacun | L5 | livré |
| R-77 | Attribué et restant calculés par opération | L5 | livré |

## Règles — reçu imprimable

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-78 | A4, deux parties détachables : partie client et talon | L3 | livré |
| R-79 | Toujours six lignes, les vides masquées et retirées de l'accessibilité | L3 | livré |
| R-80 | Champs d'instrument manquants remplacés par le motif de remplissage | L3 | livré |
| R-81 | Message d'anomalie si les paiements dépassent six, **et blocage de l'impression** | L3 | livré |
| R-82 | Fond `fond-facture.png` en référence écran, masquable | L3 | livré |
| R-83 | Réglage de calage horizontal et vertical, guides affichables | L3 | livré |
| R-84 | Compteur d'impressions incrémenté et tracé | L3 | livré |
| R-85 | Mode original et copie, libellé du numéro d'impression — calculé mais non affiché, le gabarit du fichier ne le rend nulle part | L3 | livré |

## Règles — divers

| ID | Élément | Lot | Statut |
| --- | --- | --- | --- |
| R-86 | Journal d'audit, entrée la plus récente en tête | L2 | livré |
| R-87 | Mode sombre persistant | L2 | livré |
| R-88 | Notification transitoire de 2 800 ms | L2 | livré |
| R-89 | Touche d'échappement fermant toute fenêtre | L2 | livré |
| R-90 | Passeport : onze champs, saisie manuelle, choix d'une image et remplissage de démonstration — aucune lecture automatique, comme dans le fichier | L2 | livré |
| R-91 | Statistiques : page réservée — titre, phrase d'explication, étiquette « مرحلة لاحقة » et quatre cartes de phase ultérieure, sans aucun calcul | L6 | livré |

---

## Observations

Comportements du fichier de référence qui paraissent incohérents ou perfectibles.
**Aucune n'entraîne de correction.** Elles sont reproduites telles quelles tant que
le commanditaire n'a pas explicitement décidé de les modifier.

| ID | Observation | Décision |
| --- | --- | --- |
| O-01 | Le gabarit du reçu gère un dépassement au-delà de six paiements alors que l'interface le rend impossible | conservé |
| O-02 | R-20 et R-21 rendent le sixième versement toujours soldant | conservé |
| O-03 | Le mot de passe d'annulation est celui de l'utilisateur connecté, comparé en clair | conservé, délégué à `SessionPort` |
| O-04 | L'identité d'opération partagée fusionne deux instruments de même banque, numéro et date | conservé |
| O-05 | Les totaux retiennent le plus grand montant déclaré et non la somme des parts | conservé |
| O-06 | Le montant annulé se calcule différemment dans le journal financier et dans le suivi journalier | conservé |
| O-07 | ~~La modification du programme ne revérifie pas que le payé ne dépasse pas le nouveau convenu~~ — **observation erronée, retirée**. Le fichier de référence contient bien ce contrôle (`if(newConv<this.paye(r))`). Il est intégré à R-52. L'identifiant reste réservé pour ne pas décaler les suivants. | retirée |
| O-08 | La grille tarifaire ne couvre que quatre des six combinaisons hôtel × vol | conservé |
| O-09 | Les libellés sont mélangés français et arabe selon les écrans | conservé — chaque écran garde la langue et l'orientation du fichier |
| O-10 | Le blocage d'impression au-delà de six paiements ne figurait pas dans l'inventaire initial. Le fichier interrompt l'impression et affiche « Ce reçu contient plus de six paiements. L'impression est bloquée jusqu'à définition de la règle métier. » | conservé, intégré à R-81 |
| O-11 | Le compteur de pages du bandeau d'impression du journal financier est **fixe** dans le fichier : le gabarit écrit littéralement `1 sur {{ financePageTotal }}`, et le bandeau, placé dans le flux, n'apparaît que sur la première page. Une impression de deux pages affiche donc « 1 sur 2 » en tête de la première page et rien en tête de la seconde. | reproduit tel quel, non corrigé |

---

## Écarts connus par rapport à la référence

Points où la reconstruction diffère volontairement, à ce stade, du fichier de
référence. Aucun ne touche à une règle métier.

| Lot | Écart | Raison |
| --- | --- | --- |
| L4 | Filtres « week-end » et « période personnalisée » présents dans la logique mais sans bouton | Le fichier calcule `financeWeekend`, `financeCustom` et leurs champs, mais son gabarit n'affiche que اليوم, أمس et الكل. Les règles sont reproduites et testées ; l'affichage suit le fichier. |
| L4 | Le nombre de pages annoncé est une estimation, pas la coupure réelle | Le fichier calcule `financePageTotal = ceil(lignes / 31)` et n'impose aucune coupure : la place prise par les blocs de synthèse en tête de première page fait que celle-ci n'accueille que 29 lignes. Une journée de 34 lignes tient donc en 2 pages — 29 puis 5 — et le bandeau annonce bien « 1 sur 2 ». Le calcul est repris tel quel. |
| L4 | Le compteur de pages n'est pas répété page par page | Voir O-11 : le fichier n'imprime le bandeau qu'une fois, avec un « 1 » figé. Reproduire une numérotation réelle serait une modification du fichier ; elle n'a pas été faite. |
| L6 | Aucune statistique réelle n'est calculée | Le fichier de référence ne calcule rien sur cette page : il la réserve explicitement et l'annonce par l'étiquette « مرحلة لاحقة » et la phrase « تم حجز الصفحة دون إضافة حسابات أو رسوم الآن، حتى لا تتأثر الفوترة. ». La règle de fidélité prime : rien n'a été inventé. Des indicateurs réels seraient un **ajout** au fichier, à décider séparément. |
| L5 | Champs `mois` et `date` affichés dans la langue du navigateur | Le fichier utilise les mêmes contrôles natifs `<input type="month">` et `<input type="date">` : leur libellé suit la locale du poste, ici « July 2026 » et « mm/dd/yyyy ». Comportement identique au fichier. |
| L5 | L'image est déposée dans le stockage de fichiers, et non en base64 | Le fichier conserve une `data:` URL dans l'enregistrement. Le comportement visible est identique — une image par opération, aperçu, suppression — mais seule une référence est stockée, conformément à la contrainte d'architecture. |
| L5 | Sous-navigation « Paiements / Suivi journalier » extraite en composant partagé | Les trois écrans de la rubrique financière l'affichent ; le rendu est inchangé. Aucune règle du lot L4 n'est touchée. |
| L7 | Le portrait du passeport n'est fabriqué qu'à partir de l'image choisie | Le fichier réduit la même image en deux tailles : l'original en 1100 × 760 et le portrait en 260 × 320. Rien n'est détouré ni analysé — c'est le comportement du fichier, sans lecture automatique ni OCR. |
| L3 | Papier à en-tête `fond-facture.png` absent | Le fichier n'a pas été fourni avec le prototype : seul son chemin y figure. L'aperçu affiche un papier blanc ; le calage reste utilisable. À déposer dans `public/facturation/`. |
| L3 | Reçu rendu en composants React plutôt qu'en document isolé | Le fichier place le reçu dans une iframe avec un document complet en base64. Les dimensions, la structure et le comportement d'impression sont identiques ; la règle `@page` n'est posée que pendant l'affichage de l'écran, comme le fait le fichier pour le journal financier. |
