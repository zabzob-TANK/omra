# Jeu de test — référence de données FICTIVES

⚠️ **Données entièrement fictives, pour tests uniquement.** Noms, téléphones,
numéros de chèques : tous inventés. Aucun vrai client.

**Ce fichier est LA référence de test.** Chaque fois qu'un test a besoin de
données (créer un reçu, un versement, une annulation…), utiliser ces
dossiers-là, pas des valeurs au hasard. Ainsi les tests restent cohérents d'une
fois à l'autre. À créer dans une saison marquée « TEST », jamais à confondre
avec de vraies données ni à mettre en ligne.

Le **programme** (hôtels, vols, chambres, prix, rabatteurs) est réel, tiré du
fichier historique de l'agence — ce n'est pas de la donnée personnelle. Seuls
les **clients sont fictifs**.

## Programme de la saison de test

**Hôtels :** منار الشروق · واحة احياد
**Vols :** direct · indirect
**Chambres :** 2, 3, 4, 5, 6 lits
**Rabatteurs :** zemzem · صفية · عزيزة · ملال · بن سليمان · بن شريفة
**Plafond de réduction général :** 2 000 DH
**Banques (pour chèques/virements) :** CIH · BMCE · ATTIJARI · POPULAIRE · SOCIETE GENERALE

**Grille de prix (hôtel × vol × chambre) :**

| Hôtel | Vol | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| منار الشروق | direct | 34000 | 29500 | 25600 | 25300 | 23500 |
| منار الشروق | indirect | 31800 | 27300 | 25000 | 24000 | 22000 |
| واحة احياد | indirect | — | 42500 | — | — | — |

## Dossiers fictifs (7 reçus)

Convenu = prix − réduction. Statut attendu donné pour vérifier après création.

| # | Prénom | Nom | Téléphone | Hôtel | Vol | Ch. | Prix | Réduc. | Convenu | Rabatteur | Groupe |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | يوسف | العلوي | 0600-11.11.11 | منار الشروق | direct | 6 | 23500 | 0 | 23500 | zemzem | — |
| 2 | نعيمة | بناني | 0611-22.22.22 | منار الشروق | indirect | 4 | 25000 | 2000 | 23000 | صفية | — |
| 3 | عبد الرحيم | الفاسي | 0622-33.33.33 | واحة احياد | indirect | 3 | 42500 | 0 | 42500 | عزيزة | — |
| 4 | خديجة | المرابط | 0633-44.44.44 | منار الشروق | direct | 5 | 25300 | 1500 | 23800 | ملال | — |
| 5 | رشيد | الحسني | 0644-55.55.55 | منار الشروق | indirect | 6 | 22000 | 0 | 22000 | zemzem | — |
| 6 | سعاد | الزياني | 0655-66.66.66 | منار الشروق | direct | 4 | 25600 | 1000 | 24600 | بن سليمان | عائلة الزياني |
| 7 | حسن | الزياني | 0666-77.77.77 | منار الشروق | direct | 4 | 25600 | 1000 | 24600 | بن سليمان | عائلة الزياني |

## Versements de chaque dossier

**Reçu 1 — يوسف العلوي** (convenu 23500)
- Versement 1 : 10 000 — espèces
- Versement 2 : 13 500 — espèces → **soldé (مسدد)**

**Reçu 2 — نعيمة بناني** (convenu 23000)
- Versement 1 : 5 000 — chèque n° 1234567, banque CIH, daté 10/01/2026,
  payeur نعيمة بناني → **incomplet, reste 18 000**

**Reçu 3 — عبد الرحيم الفاسي** (convenu 42500)
- Versement 1 : 10 000 — virement réf VIR-2026-001, banque BMCE,
  payeur عبد الرحيم الفاسي
- Versement 2 : 10 000 — chèque n° 7654321, banque ATTIJARI, daté 15/01/2026
  → **incomplet, reste 22 500**

**Reçu 4 — خديجة المرابط** (convenu 23800)
- Versement 1 : 23 800 — espèces → **soldé en un seul versement**

**Reçu 5 — رشيد الحسني** (convenu 22000)
- Versement 1 : 5 000 — espèces
- Puis **annulation** : motif « désistement », remboursement **espèces** 5 000
  → **annulé (ملغى)**, numéro 5 conservé, jamais réutilisé

**Reçus 6 et 7 — عائلة الزياني (chèque partagé)**
Un seul chèque de famille règle les deux dossiers, sans être dupliqué :
- **Chèque partagé** n° 9988776, banque POPULAIRE, daté 12/01/2026,
  payeur حسن الزياني, montant global 40 000
- Reçu 6 (سعاد) : versement 1 = 20 000, rattaché à ce chèque → incomplet, reste 4 600
- Reçu 7 (حسن) : versement 1 = 20 000, rattaché **au même** chèque → incomplet, reste 4 600

### Ce que ce jeu couvre

- soldé en plusieurs versements (1) et en un seul (4) ;
- incomplets avec reste (2, 3, 6, 7) ;
- les **trois modes** : espèces, chèque, virement ;
- un **chèque partagé** entre deux dossiers d'une même famille (6 + 7) ;
- une **réduction** sous le plafond de 2 000 (2, 4, 6, 7) ;
- une **annulation** avec remboursement espèces (5) ;
- un **tag de groupe/famille** partagé (6 + 7, « عائلة الزياني ») ;
- les **deux vols** (direct/indirect), plusieurs chambres, plusieurs rabatteurs,
  et le second hôtel واحة احياد (3).

Numérotation attendue : 1 à 7 dans l'ordre de création ; le n° 5 annulé garde
son numéro.
