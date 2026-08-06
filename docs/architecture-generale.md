# Architecture générale — les 4 pôles

Cadre général du projet, établi avec le commanditaire. Ce qui suit est acté.

## Les 4 pôles

1. **Administration** (~80% fait) — accès réservé au commanditaire seul.
   Monde étanche : même site, mais aucun bouton n'y mène depuis les autres
   pôles.
2. **Facturation** (~90% fait) — **priorité absolue**. C'est le pôle qui doit
   être terminé, testé et figé en premier.
3. **Client** (appelé « Statistiques » historiquement, 0% — pas commencé) —
   le dossier maître de chaque personne. Nom AR + latin, date de naissance,
   numéro de passeport, photo, statut du visa, sexe, situation familiale,
   hôtel et vol réels, date de départ, avec qui la personne voyage, etc.
   C'est aussi de là que sortiront les vraies statistiques (combien de
   personnes, quelle compagnie, qui a payé, qui n'a pas payé).
4. **Scanner de passeport** — alimente le pôle Client par extraction AI, et
   pré-remplit le nom en Facturation par simple confort.

Note de vocabulaire : « Statistiques » est un nom trompeur, c'est avant tout
un répertoire de clients. Les statistiques en sont une fonction, pas la
nature.

## Règles d'architecture (non négociables)

- **R1.** Le pôle Client vit dans ses propres tables, reliées à la personne
  par son identifiant. On n'empile pas de colonnes sur les tables que la
  Facturation utilise. Objectif : pouvoir casser, refaire et redéployer le
  pôle Client sans jamais mettre la Facturation en danger.
- **R2.** La Facturation ne dépend jamais du pôle Client. Un reçu doit rester
  créable avec un nom et rien d'autre. Aucun champ venant du pôle Client ne
  peut devenir obligatoire en Facturation.
- **R3.** Le bouton passeport est un confort, jamais un passage obligé.
  Service AI en panne, pôle Client en travaux, internet coupé → le bouton ne
  fait rien, message discret, l'employé tape le nom à la main et la vente
  continue.
- **R4.** Le seul pont entre les deux pôles est le pré-remplissage du nom, au
  niveau du formulaire uniquement. Aucune donnée de passeport n'entre dans la
  base de la Facturation. Que le nom soit tapé à la main ou pré-rempli, la
  base Facturation enregistre exactement la même chose.
- **R5.** Répartition des images : les images de chèques/virements restent en
  Facturation (ce sont des preuves de paiement, liées à l'opération
  bancaire). La photo de la personne appartient au pôle Client.

## Fonctionnement du scanner

**Méthode 1 — passeport présent à l'inscription :**
Nouveau reçu → bouton passeport → upload → extraction AI (nom en arabe et en
latin, date de naissance, numéro, expiration, photo…) → tout reste en local,
en tampon, rien n'est enregistré. Le nom et le prénom pré-remplissent le
formulaire (modifiables). L'employé complète le reste. À l'enregistrement :
le reçu est créé côté Facturation, et toutes les données du passeport
partent côté pôle Client. Si l'employé annule : tout est jeté, rien n'est
écrit.

**Méthode 2 — passeport absent** (fréquent, les passeports arrivent souvent
au dernier moment) :
Le client s'inscrit normalement, nom saisi à la main. Il apporte son
passeport plus tard. Au scan, une recherche de correspondance est faite par
AI (pas une comparaison de texte : elle doit tolérer nom/prénom inversés,
une lettre mal transcrite, etc.). Les candidats sont proposés à l'employé,
qui confirme. Jamais de rattachement automatique. S'il y a deux homonymes,
les deux sont affichés et l'employé choisit.

## Décisions métier actées

- **Saisons totalement indépendantes.** Aucun lien d'une saison à l'autre.
  Une personne qui s'inscrit 4 saisons de suite = 4 personnes distinctes. En
  fin de saison : conservation une semaine, export, puis suppression, avec
  archivage sur disque local. Une sauvegarde régulière hors serveur est
  aussi voulue (export automatique vers un stockage externe), pour pouvoir
  restaurer en cas de problème serveur.
- **Fiche client : entièrement modifiable, à tout moment.** Elle est
  incomplète par nature (le passeport arrive plus tard, le visa aussi, la
  chambre est attribuée tardivement). Aucun champ du passeport ne doit être
  obligatoire à la création. L'incomplétude est un état normal, pas une
  erreur — et « ce qui manque » (passeport pas encore déposé, visa pas
  encore obtenu…) a vocation à devenir un indicateur utile du pôle Client.
- **Le reçu, lui, reste figé** : il garde une copie du nom au moment de sa
  création, et n'est modifiable que par le système de modification tracé
  existant. Corriger la fiche client ne doit jamais changer un reçu déjà
  émis.
- **Hôtel et vol en Facturation ne sont pas de l'opérationnel** : « منار
  الشروق » est un groupe d'hôtels au même prix, et le vol
  (longue/courte/directe) est un critère de prix. L'hôtel réel, le vol réel
  et la date de départ appartiennent au pôle Client. Ne pas confondre les
  deux, ne pas les dupliquer.
- **Sécurité** : le pôle Client ne doit pas enfermer les employés dans des
  sessions courtes. Connexion requise, mais pas de friction supplémentaire
  (pas d'autorisation par appareil, pas de déconnexion agressive) : ces
  mesures-là concernent la Facturation, pas le pôle Client.

## Priorités

1. **Finir la Facturation** : les 2 zones non retestées (suivi journalier,
   ajout/suppression d'image de justificatif), la fin du design, et les
   décisions métier en attente.
2. Puis, avant mise en service : suppression manuelle des données de test,
   bascule de saison et saisie des vrais tarifs, mots de passe forts,
   déconnexion automatique, autorisation par appareil, protection d'accès.
3. Le pôle Client vient après, sur une branche séparée, sans jamais
   déstabiliser la Facturation.

Rien n'est à anticiper côté Facturation pour le pôle Client : la liste
d'avant-saison est vide de ce côté-là.

## À prévoir le jour où le pôle Client démarrera

- Retirer le stockage de photo de passeport côté Facturation : il devient
  redondant, la photo appartiendra au pôle Client.
- La décision en attente sur le tag « groupe/famille » se traite là-bas,
  comme brique de répartition des chambres (avec qui la personne voyage),
  pas comme une étiquette d'affichage en Facturation.
- L'outil « export d'une saison + purge » devient indispensable (c'est le
  mécanisme d'archivage), et il doit inclure les images, pas seulement un
  tableau.
- Chiffrer le coût du scan AI : ce sera le premier coût récurrent du projet,
  qui vise 0 DH/mois. Vérifier aussi les conditions de conservation des
  données du fournisseur choisi (les offres gratuites conservent souvent les
  données).

### Dette d'architecture identifiée le 2026-08-06 (pas des bugs, à ne pas corriger avant que le pôle Client existe)

- **Déménager la capture passeport vers le pôle Client** : `ModalePasseport`
  (`modules/facturation/ui/modales/passeport.tsx`) et la logique associée
  (type `Passeport` dans `modules/facturation/domain/types.ts`, écran
  « Nouveau reçu ») vivent aujourd'hui dans le module Facturation alors que
  toute cette capture — au-delà du nom, qui reste le seul pont autorisé
  (R4) — appartient au pôle Client.
- **Supprimer le transit mémoire des images de passeport côté Facturation** :
  `StockageFichiersPort.deposer()` (`modules/facturation/data/supabase/storage.ts`)
  met les octets en attente côté serveur Facturation avant que le dépôt
  échoue plus loin (le noyau omra ne les stocke jamais réellement,
  conforme à R5) ; ce transit n'a plus lieu d'être une fois le pôle Client
  en place pour recevoir ces images directement.
- **Remplacer le type `Client` actuel** (`modules/facturation/domain/types.ts`) :
  son champ `recuIds: string[]` fait pointer le Client vers ses reçus, alors
  que la bonne direction est l'inverse — c'est la Facturation qui référence
  la personne, jamais l'inverse (R1).
