# Poste de tri — banc d’essai des groupes

Route : `/test-groupes-broyeur`, en développement seulement, compte Facturation actif requis.

Sélection multiple reprise du fichier clients (`Registre.js`) : clic = une fiche (re-clic = aucune), Ctrl/Cmd+clic = ajouter/retirer, Maj+clic = plage depuis la dernière fiche cliquée du même groupe, Ctrl+Maj+clic = plage ajoutée ; glisser une fiche sélectionnée emporte toute la sélection en un bloc, même répartie sur plusieurs groupes (ordre des machines puis ordre de chaque groupe ; chaque fiche garde son origine pour le démontage) — extension voulue par le commanditaire, le fichier clients se limite au groupe de départ ; les numéros de départ restent affichés pendant le vol et passent au numéro d’arrivée par un fondu à mi-vol ; les fiches déposées restent sélectionnées ; un clic hors des fiches vide la sélection.

Glisser-déposer libre entre les machines (groupes) et vers « Non affectés ». Dans la machine visée, les fiches s’écartent pour montrer la place ; au-delà de 10 fiches, la machine défile, avec défilement automatique près du bord pendant le geste. À l’arrivée dans un autre groupe, la fiche part en lanières qui se recomposent à sa place (effet inspiré du composant Shredder de React Bits, refait ici car ce composant ne gère qu’une liste à la fois). Échap annule le geste.

Trois vues par machine, comme les groupes du fichier clients : Liste (numéro, petite photo, nom), Photos (grille de portraits), Détails (photo, nom, hôtel, chambre, vol) ; « Toutes » les règle d’un coup. Mouvement repris du moteur Shredder, comme dans l’atelier de Codex : la fiche tenue suit la souris par un ressort (pulsation 30), penche selon sa vitesse (6° max) et se soulève (×1,02) ; les voisines s’écartent avec le ressort de la pile (raideur 320, amortissement 22) et une marge de 8 px évite les sauts ; au lâcher, la fiche garde son élan et se pose par un ressort (pulsation 16). Ce vol se fait avec une copie dans un calque au-dessus de la page (la liste coupe ce qui dépasse de son cadre), la vraie fiche attendant invisible à sa place ; une liste qui raccourcit se resserre au rythme de ses fiches au lieu de sauter. Entre deux groupes dans la même vue, pas de lanières : la fiche glisse jusqu’à sa place. Partout, un numéro qui change fond de l’ancien au nouveau (fiche déposée comme fiches décalées). Glisser, sélection et lanières fonctionnent d’une vue à l’autre (entre deux vues différentes, chaque lanière existe dans la forme de départ et dans celle d’arrivée, sur le même trajet, relayées par un fondu à mi-vol : rien n’est étiré) ; en grille, la place réservée suit l’ordre de lecture.

Repris de l’atelier de Codex (`/test-transferts-groupes`) : photos téléchargées une seule fois par page, décodées avant affichage, quatre à la fois (`photos.js`, en mémoire seulement) ; nom arabe en premier, nom latin dessous ; recherche Ctrl+K tolérante aux accents et voyelles arabes (nom, dossier, passeport, groupe — les autres fiches pâlissent) ; barre de sélection globale ; Échap vide la sélection ; machine vide « Déposer les N pèlerins ici » ; trait lumineux qui fait une fois le tour d’une fiche sélectionnée.

Effets (CSS et animations natives, sans bibliothèque, désactivés par « réduire les animations ») : bandeau « Annuler » avec mèche de 5 s après chaque transfert ou démontage, en pause au survol, Ctrl+Z ; trait de lumière autour de la machine visée ; coche à ressort (cliquer la coche = Ctrl+clic) ; ✕ à maintenir 0,7 s pour démonter ; compteurs qui roulent ; grain fixe sur le fond.

Règles reprises du fichier clients : une seule appartenance (`deplacerMembres`), dossiers annulés exclus, ordre libre dans un groupe, provenance visible, démontage qui rend chaque fiche à sa machine et à sa place d’origine, noms uniques (`nomGroupeUnique`). Groupes Visa non simulés.

Registre lu par GET ; tout le reste vit en mémoire. Aucune sauvegarde, aucun envoi Nusuk. Pour retirer le banc : supprimer ce dossier.

## Rubrique Visa (base, lecture seule de Nusuk)

- `rubrique-visa.jsx` : fiche de réglages du Visa (chargement, 5 catégories, verrous, colonnes du tableau). Les autres rubriques (Aérien, Hôtels, Famille) auront chacune la leur ; le moteur `poste-de-tri.jsx` et `Tableau.jsx` restent communs.
- Données : registre (`/api/client/passeports`) + dernière lecture Nusuk (`/api/client/nusuk/imports`), avec les fonctions du fichier client utilisées telles quelles, sans les modifier. Rien n'est écrit : ni dans Nusuk, ni dans la base.
- Les lectures Nusuk sont rangées par adresse d'origine : les groupes réels n'apparaissent que si la page est ouverte sur `http://127.0.0.1:3001`.
- Groupes à gauche, tableau AG Grid à droite (poignée ⠿ pour glisser une ligne, ou les lignes cochées), séparateur déplaçable.
- Verrous : rien ne sort d'un groupe « visa en traitement » ou « visa délivré », rien n'y entre. Seuls les groupes temporaires se démontent ; le nom ne se modifie ni sur les groupes verrouillés ni sur « sans groupe ».

## Panneau des groupes (`panneau-groupes/`)

Fenêtre fixe et déplaçable (par son titre), toujours visible quand la page défile. Affichée dans le **Poste de tri**, mise au point sur l'atelier `/test-groupes-broyeur/barre`.
- **Fond** (règles des groupes) : `rubrique-visa.jsx` — `listeGroupesVisa` (tous les groupes de la lecture Nusuk, y compris sans pèlerin reconnu ; groupes obsolètes écartés ; 6e catégorie « Refusé — Nusuk »), `infoGroupe` (effectif et état Nusuk, 4 familles de couleurs des 14 états), `trierGroupes`.
- **Affichage** : `panneau-groupes/panneau.jsx` (pastilles, 3 niveaux d'information, « sans groupe » en tête, épingles en haut, pile repliée dessous, tri par titres, animations), `affichage.jsx`, `panneau.css`. Le panneau reçoit les groupes de la page et renvoie seulement « afficher / masquer » ; dans le Poste de tri, un groupe masqué disparaît de l'atelier.
- **Atelier** `barre/` : affichage seulement ; groupes du fichier clients (temporaires compris, lus sans réécriture) + dernière lecture Nusuk toutes adresses (`lectures-nusuk/`, développement seulement) ; bouton « Actualiser depuis Nusuk (Excel) » (commande « refresh » du fichier clients).
