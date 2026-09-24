# Scénario de test de bout en bout — Du chantier à la location

Parcours complet ImmoTopia, à dérouler dans le navigateur (computer use) :
on ouvre un chantier, on le finance (budget, bons de commande, factures
fournisseurs, règlements, retenues de garantie, pièces de caisse, salaires,
tâcherons, stock), on le clôture, on bascule l'immeuble au patrimoine, on le
découpe en 12 appartements (3 étages × 4), on y installe 8 locataires, on
facture et on encaisse les loyers, puis on contrôle toute la comptabilité
(balances, relevés, pénalités, dépôts, quittances, quotes-parts).

Rédigé le 20 septembre 2026 sur la branche `feat/finance-lot-0`, à partir du
code réel des écrans. Chaque libellé cité est celui affiché à l'écran.

---

## 0. Comment utiliser ce document

Pour chaque étape :

1. Lire « Cette page permet de faire ».
2. Faire, dans l'ordre, les actions de « Ce qu'on doit faire », avec les
   valeurs du jeu de données (section 2).
3. Vérifier « Résultat attendu » et consigner le résultat dans le journal de
   test (section 5).

Règles pour l'agent qui pilote le navigateur :

- **Ne jamais lancer `npm run db:seed`** : il efface la base de démonstration.
- Toutes les données créées portent le préfixe `QA` : c'est ce qui permet de
  les retrouver au milieu des données de démonstration déjà présentes
  (19 baux, 414 échéances, des chantiers, des fournisseurs).
- Les écrans affichent un squelette de chargement quelques secondes. Trois
  états à distinguer : « Aucune donnée » (appel réussi, table vide),
  « Impossible de charger ces données » (appel en échec : lire le statut HTTP
  des requêtes vers `localhost:8001/api`), écran blanc (capture trop tôt).
- Un champ date Ant Design se remplit en cliquant dedans, en tapant
  `JJ/MM/AAAA`, puis `Entrée`. Un champ liste se remplit en cliquant, en
  tapant le début du libellé, puis `Entrée`.
- Un montant se tape sans espaces (`28000000`). Certains champs le reformatent
  avec des séparateurs de milliers, d'autres gardent les chiffres bruts : les
  deux se valent, seule la valeur enregistrée compte.
- **Dans un tableau, les montants n'ont pas de devise** : la mention « Tous
  les montants sont en FCFA. » figure une fois, sous le tableau. Hors tableau
  — tuiles d'indicateurs, cartes, phrases — le montant garde son « FCFA », car
  rien alentour ne le porte.
- Un montant que le serveur ne fournit pas s'affiche `—`. Un montant qu'il
  fournit à zéro s'affiche `0`. Les deux sont corrects et ne disent pas
  la même chose : sur un chantier neuf, `Budget initial` et `Budget révisé`
  montrent `—` (aucun budget posé), tandis que `Engagé` et `Réalisé` montrent
  `0` (rien n'a encore été dépensé, et c'est une information). Un `—` là
  où une valeur est attendue reste en revanche une anomalie.
- Le statut `PLANNED` d'un chantier se lit **« Planifié »** partout : liste,
  fiche et tableau de bord. Un écran qui afficherait encore « Prévu » date
  d'avant le 20 septembre 2026.
- Quand un résultat attendu dit « noter la valeur », l'écran peut légitimement
  différer selon la base : on consigne, on ne conclut pas à un bug.
- La date de référence du scénario est **J = 20/09/2026**. Le bloc locatif
  (parties D à F) est calibré pour un test réalisé entre le 06/09/2026 et le
  04/10/2026. Au-delà, décaler toutes les dates de bail et d'échéance du
  nombre de mois nécessaire, et recalculer les tranches de la balance âgée
  avec la règle donnée en F.2.
- Ne pas cocher « WhatsApp » sur les téléphones des contacts : les adresses
  et numéros du jeu de données sont fictifs et aucun envoi ne doit partir.

Ce qui n'est **pas** une anomalie (limites connues du code, ne pas les
reporter comme bugs) :

- Un chantier neuf reste « Planifié » : rien ne le passe « En cours » sauf une
  réouverture après clôture. « Suspendu » n'est posable nulle part.
- L'« Avancement » d'un chantier reste à `0 %` : aucun écran ne le saisit.
- Aucun écran ne règle le seuil d'alerte budgétaire : la colonne « Alerte »
  du tableau de bord restera vide.
- Le rapprochement facture ↔ bon de commande n'est câblé dans aucun écran :
  le « Facturé » d'un bon reste à 0 et son « Reste à facturer » reste plein.
- Les appartements d'un immeuble n'ont pas de champ « étage » : l'étage se
  porte dans le titre.
- Une quittance ou un contrat généré est un fichier Word (`.docx`), pas un
  PDF. Seul le relevé de compte (« Imprimer ») produit un PDF.
- Un budget en brouillon et un bon de commande émis ne bloquent pas la
  clôture d'un chantier ; seules les pièces de dépense en brouillon la
  bloquent.
- Le passage d'un chantier au stock et la bascule d'un lot au patrimoine
  sont irréversibles : c'est voulu, et c'est pour cela qu'on les fait sur un
  chantier `QA`.

---

## 1. Préparation

### 1.1 Lancer l'application

1. Démarrer l'API (port 8001) puis le front (port 3000) : `npm run dev` à la
   racine, ou les entrées `api` puis `web` de `.claude/launch.json`.
2. Attendre que `http://localhost:8001/health` réponde `200` (dix à vingt
   secondes).
3. Ouvrir `http://localhost:3000/login`.

### 1.2 Se connecter

- Compte : `devaccrocs@gmail.com` — mot de passe : `DevMick@2003`
  (Kouassi N'Guessan, administrateur de l'agence **Ivoire Résidences**).
- En mode développement, le panneau « Comptes par tenant » propose un bouton
  « Utiliser » qui pré-remplit le formulaire ; il reste à cliquer
  « Se connecter ».
- C'est le seul compte qui voit à la fois Biens, Baux, Encaisser, Finance et
  Patrimoine dans la barre latérale.

Identifiant d'agence utilisé dans toutes les adresses :
`385a1e76-ac08-4db5-9802-8b2ddfb1672b`. Dans la suite, `BASE` désigne
`http://localhost:3000/tenant/385a1e76-ac08-4db5-9802-8b2ddfb1672b`.

### 1.3 Vérifications avant de commencer

1. Ouvrir `BASE/finance/chantiers` : la page charge (menu **Finance ›
   Chantiers**). Si elle affiche « Impossible de charger ces données » avec un
   403, les permissions Finance ne sont pas semées : relancer
   `prisma/seeds/finance-permissions-seed.ts` puis **redémarrer l'API** (le
   cache des permissions vit cinq minutes en mémoire).
2. Ouvrir `BASE/finance/pieces-de-caisse` et dérouler « Poste de dépense » : les sept
   postes par défaut doivent exister : `Gros œuvre`, `Toiture`, `Plomberie`,
   `Électricité`, `Main-d'œuvre`, `Matériaux`, `Divers`. Ils se créent au
   premier affichage ; recharger une fois si la liste est vide.
3. Ouvrir `BASE/documents/templates` (menu **Documents › Modèles de
   documents**) : il faut un modèle actif de type **Bail habitation** et un de
   type **Reçu de loyer**. Sinon, la partie F.6 échouera : le noter tout de
   suite. Trois modèles actifs sont attendus sur la base de démonstration :
   _Contrat de bail — habitation_, _Contrat de bail — professionnel_ et
   _Quittance de loyer_. Il n'existe pas de modèle propre au reçu de dépôt, et
   c'est normal : ce document emprunte celui du reçu de loyer (voir F.6).
4. Relever les valeurs de départ (elles serviront de base aux deltas) :
   - `BASE/dashboard` : tuile « Impayés » (montant et nombre d'échéances),
     tuile « Biens » (nombre et taux d'occupation).
   - `BASE/patrimoine` : « Biens au portefeuille », « Taux d'occupation »,
     « Valeur estimée totale », « Loyers annuels ».
   - `BASE/finance/retenues` : « Détenu aujourd'hui », « Déjà libéré ».
   - `BASE/finance/validation` : nombre de pièces en attente.
5. Changer la langue une fois (bouton globe en haut à droite, « Changer la
   langue ») vers `English` puis revenir à `Français`, pour vérifier que
   l'interface reste stable. Tout le reste du scénario se joue en français.

---

## 2. Jeu de données

Devise affichée : `FCFA` (stockée `XOF`). Aucun montant ne porte de TVA :
le module n'en gère pas.

### 2.1 Le chantier

| Champ             | Valeur                                                  |
| ----------------- | ------------------------------------------------------- |
| Nom du chantier   | `QA Résidence Les Palmiers — 3 étages, 12 appartements` |
| Zone              | `Angré 8e tranche, Cocody`                              |
| Bien (facultatif) | _laisser vide_                                          |
| Début             | `01/03/2026`                                            |
| Fin prévue        | `31/08/2026`                                            |

### 2.2 Le budget

Nom : `QA Budget initial 2026`.

| Poste        | Libellé                                 | Montant prévu   |
| ------------ | --------------------------------------- | --------------- |
| Gros œuvre   | Fondations, structure béton, maçonnerie | 50 000 000      |
| Matériaux    | Ciment, fer, agrégats, peinture         | 35 000 000      |
| Toiture      | Charpente et couverture                 | 22 000 000      |
| Plomberie    | Réseaux eau, sanitaires, carrelage      | 18 000 000      |
| Électricité  | Câblage et tableaux des 12 appartements | 8 000 000       |
| Main-d'œuvre | Salaires et journaliers du chantier     | 12 000 000      |
| Divers       | Frais de chantier et imprévus           | 5 000 000       |
| **Total**    |                                         | **150 000 000** |

Avenant : date `15/04/2026`, motif `Renchérissement du ciment et du fer`,
lignes `Matériaux +12000000` et `Divers -2000000`. Écart `+10 000 000`.
**Budget révisé attendu : 160 000 000.**

### 2.3 Les fournisseurs

| Raison sociale                     | Nature                  | Contact       | Téléphone           | E-mail                              |
| ---------------------------------- | ----------------------- | ------------- | ------------------- | ----------------------------------- |
| `QA Matériaux du Sud SARL`         | Matériaux               | Konan Yao     | +225 07 08 09 10 11 | achats@materiaux-sud.example        |
| `QA Quincaillerie Angré`           | Matériaux               | Aïcha Bamba   | +225 05 44 55 66 77 | contact@quincaillerie-angre.example |
| `QA Nimba Ingénierie`              | Prestation              | Serge Kouadio | +225 01 22 33 44 55 | contact@nimba-ing.example           |
| `QA Sanitaires & Carrelage Madina` | Matériaux et prestation | Moussa Traoré | +225 07 99 88 77 66 | madina@sanitaires.example           |

### 2.4 Les bons de commande

| Référence        | Fournisseur                      | Date       | Lignes (poste — libellé — montant)                                                                                                                        | Total      | Sort                 |
| ---------------- | -------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------- |
| `BC-QA-2026-001` | QA Matériaux du Sud SARL         | 05/03/2026 | Matériaux — Ciment CPJ 42,5, 1 500 sacs — 9 000 000 ; Matériaux — Fer à béton HA12, 20 t — 14 000 000 ; Gros œuvre — Gravier et sable, 200 m³ — 5 000 000 | 28 000 000 | Émis                 |
| `BC-QA-2026-002` | QA Sanitaires & Carrelage Madina | 10/05/2026 | Plomberie — Sanitaires des 12 appartements — 9 600 000 ; Plomberie — Carrelage sols et murs, 1 200 m² — 8 400 000                                         | 18 000 000 | Émis                 |
| `BC-QA-2026-003` | QA Quincaillerie Angré           | 12/05/2026 | Électricité — Câbles, disjoncteurs, tableaux — 6 000 000                                                                                                  | 6 000 000  | Émis puis **annulé** |

### 2.5 Les factures fournisseurs (phase 1, avant le stock)

| Réf.         | Fournisseur                      | Date       | Lignes (libellé — montant)                                                                                   | Montant    | Imputations (chantier QA, poste — montant)      | Sort                                                 |
| ------------ | -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------- | ---------------------------------------------------- |
| `FRS-QA-001` | QA Matériaux du Sud SARL         | 10/03/2026 | Ciment CPJ 42,5, 1 500 sacs — 9 000 000 ; Fer à béton HA12, 20 t — 14 000 000 ; Gravier et sable — 5 000 000 | 28 000 000 | Matériaux — 23 000 000 ; Gros œuvre — 5 000 000 | Validée (file de validation)                         |
| `FRS-QA-002` | QA Nimba Ingénierie              | 20/03/2026 | Études de structure et suivi béton — 4 500 000                                                               | 4 500 000  | Gros œuvre — 4 500 000                          | Validée (écran facture)                              |
| `FRS-QA-003` | QA Sanitaires & Carrelage Madina | 15/05/2026 | Sanitaires des 12 appartements — 9 600 000 ; Carrelage 1 200 m² — 8 400 000                                  | 18 000 000 | Plomberie — 18 000 000                          | Validée                                              |
| `FRS-QA-004` | QA Quincaillerie Angré           | 02/06/2026 | Câbles, disjoncteurs, tableaux — 6 000 000                                                                   | 6 000 000  | Électricité — 6 000 000                         | Validée                                              |
| `FRS-QA-005` | QA Quincaillerie Angré           | 03/06/2026 | Doublon volontaire — 1 000 000                                                                               | 1 000 000  | Divers — 1 000 000                              | Validée puis **annulée** (motif `Doublon de saisie`) |

### 2.6 Les règlements fournisseurs

| Fournisseur                      | Date       | Montant    | Affectation             | Effet attendu                                          |
| -------------------------------- | ---------- | ---------- | ----------------------- | ------------------------------------------------------ |
| QA Matériaux du Sud SARL         | 20/03/2026 | 28 000 000 | FRS-QA-001 : 28 000 000 | solde 0                                                |
| QA Nimba Ingénierie              | 30/03/2026 | 4 500 000  | FRS-QA-002 : 4 500 000  | solde 0                                                |
| QA Sanitaires & Carrelage Madina | 30/05/2026 | 16 200 000 | FRS-QA-003 : 16 200 000 | solde 0 une fois la retenue de 1 800 000 posée         |
| QA Quincaillerie Angré           | 10/06/2026 | 8 000 000  | FRS-QA-004 : 6 000 000  | 2 000 000 non affectés = **acompte**, solde −2 000 000 |

### 2.7 Les retenues de garantie

| Nature                | Pièce                                   | Taux | Retenu attendu | Libération prévue | Sort                                        |
| --------------------- | --------------------------------------- | ---- | -------------- | ----------------- | ------------------------------------------- |
| Facture fournisseur   | FRS-QA-003 (18 000 000)                 | 10   | 1 800 000      | 31/12/2026        | reste détenue                               |
| Situation de tâcheron | situation d'Adama Ouattara (22 000 000) | 5    | 1 100 000      | 31/01/2027        | **libérée** en fin de partie A, puis réglée |

### 2.8 Les pièces de caisse

| N°  | Poste        | Bénéficiaire                         | Montant   | Date       | Motif                                                | Sort                                                              |
| --- | ------------ | ------------------------------------ | --------- | ---------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| PC1 | Divers       | `Mamadou Diallo, chef d'équipe`      | 350 000   | 12/03/2026 | `Petit outillage et carburant du groupe électrogène` | Validée sur place                                                 |
| PC2 | Main-d'œuvre | `Équipe de manœuvres journaliers`    | 1 200 000 | 28/03/2026 | `Paie des journaliers, semaine 13`                   | Validée via la file                                               |
| PC3 | Divers       | `Konan Yao — transport`              | 450 000   | 05/04/2026 | `Location d'un camion benne, 3 jours`                | Validée puis **annulée** (motif `Pièce saisie en double`)         |
| PC4 | Divers       | `Entreprise de nettoyage Propre Net` | 300 000   | J (défaut) | `Nettoyage final du chantier`                        | Laissée en **brouillon** pour bloquer la clôture, validée ensuite |

### 2.9 Les salariés

| Nom                 | Rôle                    | Notes de salaire (mois — montant — chantier — poste)                                                 | Règlement              | Solde attendu                   |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------- |
| `QA Ibrahima Sylla` | `Chef de chantier`      | mars 2026 — 850 000 — chantier QA — Main-d'œuvre ; avril 2026 — 850 000 — chantier QA — Main-d'œuvre | 30/04/2026 — 1 700 000 | « Rien à lui verser »           |
| `QA Fatou Camara`   | `Comptable de l'agence` | avril 2026 — 600 000 — _aucun chantier_                                                              | 30/04/2026 — 600 000   | « Rien à lui verser »           |
| `QA Moussa Koné`    | `Gardien de chantier`   | mars 2026 — 250 000 — chantier QA — Main-d'œuvre                                                     | 31/03/2026 — 400 000   | « Avance de 150 000 à retenir » |

### 2.10 Les tâcherons

| Nom                 | Corps de métier           | Marché (référence — poste — montant — signé le)     | Situations (date — description — montant)                                                                                                             | Règlements                                                              |
| ------------------- | ------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `QA Sékou Camara`   | `Maçonnerie`              | `MAR-QA-001` — Gros œuvre — 36 000 000 — 05/03/2026 | 15/04/2026 — `Fondations et élévation du rez-de-chaussée, 40 %` — 14 400 000 ; 30/06/2026 — `Élévation des étages 1 à 3 et dalles, 50 %` — 18 000 000 | 20/04/2026 — 14 400 000 ; 05/07/2026 — 12 000 000                       |
| `QA Adama Ouattara` | `Charpente et couverture` | `MAR-QA-002` — Toiture — 22 000 000 — 01/07/2026    | 31/07/2026 — `Charpente métallique et couverture bac alu, 100 %` — 22 000 000                                                                         | 10/08/2026 — 20 900 000 ; puis 1 100 000 après libération de la retenue |

Attendu pour Sékou Camara : « Ce qu'on lui doit » = 6 000 000, « Marché
restant » = 3 600 000. Pour Adama Ouattara : dû 0 après le premier règlement
et la retenue, puis dû 1 100 000 après libération, puis 0.

### 2.11 Le stock

Articles (onglet **Articles**) :

| Référence     | Désignation                              | Unité   | Famille      | Poste proposé à la sortie |
| ------------- | ---------------------------------------- | ------- | ------------ | ------------------------- |
| `QA-CIM-42`   | `Ciment CPJ 42,5`                        | `sac`   | `Gros œuvre` | Matériaux                 |
| `QA-FER-12`   | `Fer à béton HA12, barre de 12 m`        | `barre` | `Gros œuvre` | Matériaux                 |
| `QA-PEINT-20` | `Peinture acrylique blanche, bidon 20 L` | `bidon` | `Finitions`  | Matériaux                 |

Lieu de stockage : `QA Magasin central Angré`, nature **Magasin**. Le lieu du
chantier est créé automatiquement au passage du chantier au stock (son
libellé s'affiche sur l'écran « Stock du chantier »).

Facture d'achat de stock (saisie **après** le passage au stock, date laissée
à sa valeur par défaut) : `FRS-QA-006`, QA Matériaux du Sud SARL, lignes
`Ciment CPJ 42,5, 800 sacs — 5 200 000`, `Fer HA12, 500 barres — 4 000 000`,
`Peinture 20 L, 60 bidons — 1 800 000`, total **11 000 000**, imputation
chantier QA — Matériaux — 11 000 000.

Réception au **lieu du chantier**, date J : `QA-CIM-42` 800 × 6 500 ;
`QA-FER-12` 500 × 8 000 ; `QA-PEINT-20` 60 × 30 000.

Transfert : 100 sacs `QA-CIM-42` du lieu du chantier vers
`QA Magasin central Angré`, date J. Valeur déplacée attendue : 650 000.

Sorties vers le chantier (demandeur `Ibrahima Sylla, chef de chantier`, poste
Matériaux, date J) :

| Article            | Quantité | Valeur attendue |
| ------------------ | -------- | --------------- |
| `QA-CIM-42`        | 500      | 3 250 000       |
| `QA-FER-12`        | 300      | 2 400 000       |
| `QA-PEINT-20`      | 30       | 900 000         |
| **Total consommé** |          | **6 550 000**   |

Inventaire physique du lieu du chantier : `QA-CIM-42` compté 195 (écart −5,
motif `Sacs éventés par la pluie`), `QA-FER-12` compté 200, `QA-PEINT-20`
compté 30. Valeur de l'écart attendue : −32 500.

### 2.12 Le lot et le bien créé à la bascule

Lot du chantier : nom `QA Immeuble Les Palmiers — 12 appartements`, surface
`1080`, quote-part `100`.

Bien créé à la bascule :

| Champ              | Valeur                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Référence interne  | `QA-IMM-2026-001`                                                                            |
| Titre              | `Résidence QA Les Palmiers`                                                                  |
| Type de bien       | Immeuble                                                                                     |
| Mode de détention  | Propriété de l'agence                                                                        |
| Adresse            | `Rue des Jardins, Angré 8e tranche, Cocody, Abidjan`                                         |
| Description        | `Immeuble R+2 neuf de 12 appartements, 3 étages de 4 appartements, livré en septembre 2026.` |
| Date d'acquisition | J                                                                                            |

Compléments saisis ensuite sur « Modifier la propriété » : Localisation
`Côte d'Ivoire › Abidjan › Cocody`, Quartier `Angré 8e tranche`, Année de
construction `2026`, État général `Neuf`, Standing `Standard`, Type
d'opération **Location**, Statut `Disponible`.

### 2.13 Les 12 appartements (3 groupes de 4)

| Groupe  | Nombre | Titre de base   | Surface | Pièces | SdB | Prix (loyer) | Meublé     | Statut     |
| ------- | ------ | --------------- | ------- | ------ | --- | ------------ | ---------- | ---------- |
| Étage 1 | 4      | `Étage 1 – Apt` | 90      | 3      | 1   | 250 000      | Non meublé | Disponible |
| Étage 2 | 4      | `Étage 2 – Apt` | 90      | 3      | 1   | 250 000      | Non meublé | Disponible |
| Étage 3 | 4      | `Étage 3 – Apt` | 90      | 3      | 1   | 280 000      | Non meublé | Disponible |

Les titres obtenus sont `Étage 1 – Apt 1` … `Étage 3 – Apt 4`.

### 2.14 Les 8 locataires (contacts CRM)

Commune : `Cocody` pour tous. Type de contact : Personne, sauf le n° 8.
Ne pas cocher WhatsApp.

| N°  | Prénom         | Nom                                                                                                         | Email personnel                    | Téléphone principal | Profession     | Stabilité | Appartement     | Loyer   |
| --- | -------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------- | -------------- | --------- | --------------- | ------- |
| 1   | Aminata        | `QA Koné`                                                                                                   | qa.aminata.kone@example.com        | +225 07 01 00 00 01 | Infirmière     | CDI       | Étage 1 – Apt 1 | 250 000 |
| 2   | Yao Bernard    | `QA Kouassi`                                                                                                | qa.yao.kouassi@example.com         | +225 07 01 00 00 02 | Commerçant     | Informel  | Étage 1 – Apt 2 | 250 000 |
| 3   | Mariam         | `QA Diaby`                                                                                                  | qa.mariam.diaby@example.com        | +225 07 01 00 00 03 | Enseignante    | CDI       | Étage 1 – Apt 3 | 250 000 |
| 4   | Souleymane     | `QA Traoré`                                                                                                 | qa.souleymane.traore@example.com   | +225 07 01 00 00 04 | Chauffeur      | CDD       | Étage 2 – Apt 1 | 250 000 |
| 5   | Adjoua Estelle | `QA N'Dri`                                                                                                  | qa.adjoua.ndri@example.com         | +225 07 01 00 00 05 | Pharmacienne   | CDI       | Étage 2 – Apt 2 | 250 000 |
| 6   | Ibrahim        | `QA Sanogo`                                                                                                 | qa.ibrahim.sanogo@example.com      | +225 07 01 00 00 06 | Développeur    | Freelance | Étage 2 – Apt 4 | 250 000 |
| 7   | Clarisse       | `QA Gnamien`                                                                                                | qa.clarisse.gnamien@example.com    | +225 07 01 00 00 07 | Cadre bancaire | CDI       | Étage 3 – Apt 1 | 280 000 |
| 8   | —              | `QA Ivoire Télécom SARL` (Entreprise, forme SARL, RCCM `CI-ABJ-2021-B-12345`, représentant `Jean-Marc Aka`) | qa.logement@ivoire-telecom.example | +225 27 22 00 00 08 | —              | —         | Étage 3 – Apt 3 | 280 000 |

Restent vacants : Étage 1 – Apt 4, Étage 2 – Apt 3, Étage 3 – Apt 2,
Étage 3 – Apt 4. **Taux d'occupation attendu de l'immeuble : 8/12 = 66,7 %.**

### 2.15 Les 8 baux

Communs à tous : Date de début `01/07/2026`, Date de fin `30/06/2027`, Date
d'emménagement `01/07/2026`, Devise `FCFA`, Fréquence **Mensuel**, Jour
d'échéance `5`, Charges de service `15000`, Dépôt de garantie = deux mois de
loyer (`500000`, ou `560000` pour l'étage 3), Jours de grâce `5`, Mode
**Pourcentage du solde**, Taux `2`, Montant maximum `50000`. Notes :
`Bail QA — scénario de test`. Loyer : repris automatiquement du prix de
l'appartement (vérifier qu'il vaut 250 000 ou 280 000).

Montant mensuel dû : **265 000** (étages 1 et 2) ou **295 000** (étage 3).

Après création, passer chaque bail à **Actif** depuis sa fiche.

### 2.16 Le plan d'encaissement des loyers

« Éclair » désigne le bouton « Encaisser » de la ligne d'échéance (encaisse le
reste dû en espèces à la date du jour). « Paiement… » ouvre le formulaire
complet. « Nouveau paiement » est le bouton de la page Paiements.

| Locataire           | Juillet 2026                                                                                                                                                                                                    | Août 2026                                                         | Septembre 2026                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| 1 Aminata Koné      | 265 000 — Mobile Money, Orange Money, +225 07 01 00 00 01                                                                                                                                                       | 265 000 — Éclair (espèces)                                        | 265 000 — Virement bancaire, Référence PSP `VIR-QA-0001`  |
| 2 Yao Kouassi       | 265 000 — Espèces                                                                                                                                                                                               | **150 000** — Mobile Money, MTN Mobile Money, +225 07 01 00 00 02 | _rien_                                                    |
| 3 Mariam Diaby      | Un seul « Nouveau paiement » de **795 000** — Virement bancaire, Référence PSP `VIR-QA-0003`, puis « Affecter » sur les trois échéances (juillet, août, septembre) — à faire **après** la campagne de septembre |                                                                   |                                                           |
| 4 Souleymane Traoré | _rien_                                                                                                                                                                                                          | _rien_                                                            | _rien_                                                    |
| 5 Adjoua N'Dri      | 265 000 — Éclair (espèces)                                                                                                                                                                                      | 265 000 — Carte bancaire                                          | _rien_                                                    |
| 6 Ibrahim Sanogo    | « Nouveau paiement » de **300 000** — Mobile Money, Wave, +225 07 01 00 00 06 ; « Affecter » **265 000** sur juillet, laisser 35 000 disponibles                                                                | _rien_ (l'avance de 35 000 est imputée par la campagne d'août)    | _rien_                                                    |
| 7 Clarisse Gnamien  | 295 000 — Chèque, Référence PSP `CHQ-0451`                                                                                                                                                                      | 295 000 — Espèces                                                 | 295 000 — Mobile Money, Orange Money, +225 07 01 00 00 07 |
| 8 Ivoire Télécom    | 295 000 — Virement bancaire, `VIR-QA-0008-07`                                                                                                                                                                   | 295 000 — Virement bancaire, `VIR-QA-0008-08`                     | _rien_                                                    |

Dépôts de garantie encaissés (partie F.5, **après** toutes les campagnes) :
Aminata Koné 500 000 par Virement (`DEP-QA-0001`), Clarisse Gnamien 560 000
en Espèces.

### 2.17 L'association (quotes-parts)

Nom `QA Indivision Les Palmiers`, associé `Famille Koné (héritiers)`,
quote-part `30`. Biens rattachés : `Étage 1 – Apt 3` et `Étage 2 – Apt 2`.
À créer **avant** la première campagne de facturation.

---

## 3. Partie A — Le chantier et son financement

### A.1 Page : `BASE/finance/chantiers` (Finance › Chantiers)

#### Cette page permet de faire

1. Voir la liste des chantiers avec leur coût réel calculé.
2. Créer un chantier.

#### Ce qu'on doit faire

1. Cliquer « Nouveau chantier ».
2. Remplir la modale avec le jeu 2.1 (laisser « Bien (facultatif) » vide).
3. Cliquer « Créer le chantier ».

#### Résultat attendu

1. Message « Chantier « QA Résidence Les Palmiers — 3 étages, 12
   appartements » créé. » et redirection automatique vers le détail.
2. Dans le détail : étiquette **Planifié**, cartes `Coût réel` = `—` ou `0`
   (noter laquelle), `Avancement` = `0 %`, `Début` = 01 mars 2026, `Fin
prévue` = 31 août 2026, sous-titre « Sans bien (terrain loué) ».
3. Noter l'identifiant du chantier dans l'adresse (`…/finance/chantiers/<siteId>`) : il sert partout ensuite, appelé `SITE`.

---

### A.2 Page : `BASE/finance/tableau-de-bord-chantiers` puis `BASE/finance/chantiers/SITE/budget`

#### Cette page permet de faire

1. Voir, par chantier : budget initial, budget révisé, engagé, réalisé, écart.
2. Ouvrir le budget d'un chantier (« Voir le budget »), le créer, le valider,
   lui ajouter des avenants.

#### Ce qu'on doit faire

1. Sur le tableau de bord, trouver la ligne du chantier QA : statut
   « Planifié », `Avancement` 0 %, `Budget initial` et `Budget révisé` à `—`,
   `Engagé` et `Réalisé` à `0`, `Écart` = « Sans budget », `Alerte`
   vide. Cliquer « Voir le budget ».
2. Sur la page budget, carte « Aucun budget n'est encore posé pour ce
   chantier » : saisir `Nom du budget` = `QA Budget initial 2026`, puis les
   sept lignes du jeu 2.2 avec « Ajouter une ligne » (Poste, Libellé,
   Montant prévu).
3. Vérifier que « Créer le budget » reste désactivé tant qu'une ligne est
   incomplète (laisser un montant vide un instant), puis cliquer
   « Créer le budget ».
4. Vérifier que l'écran bascule sur le budget créé : titre `QA Budget initial
2026`, étiquette **Brouillon**, `Budget initial` = 150 000 000, `Réalisé` et
   `Engagé` à 0 FCFA, et les sept lignes dans le tableau « Lignes du budget ».
   Le formulaire de création a disparu, remplacé par le bouton « Valider le
   budget » : s'il est encore là, ne pas recliquer « Créer le budget », cela
   ferait un second budget.
5. Cliquer « Valider le budget », lire l'avertissement (« irréversible : un
   budget validé ne peut plus recevoir de nouvelle ligne »), cliquer
   « Confirmer la validation ».
6. Carte « Nouvel avenant » : Date `15/04/2026`, Motif `Renchérissement du
ciment et du fer`, lignes `Matériaux` écart `12000000` et `Divers` écart
   `-2000000`. Cliquer « Enregistrer l'avenant ».
7. Dans le tableau « Avenants », cliquer « Valider » sur l'avenant.

#### Résultat attendu

1. Après validation du budget : ligne « Validé par Kouassi N'Guessan le
   JJ/MM/AAAA », plus de bouton « Valider le budget ».
2. L'avenant apparaît avec `Écart` = +10 000 000, statut Brouillon puis Validé.
3. De retour sur le tableau de bord : `Budget initial` = 150 000 000,
   `Budget révisé` = 160 000 000, `Engagé` = 0 ou `—`, `Réalisé` = 0 ou `—`,
   `Écart` = « Dans le budget » avec 160 000 000.

---

### A.3 Page : `BASE/finance/fournisseurs` (Finance › Fournisseurs)

#### Cette page permet de faire

1. Créer un fournisseur, avec sa nature (qui rend ou non l'imputation
   chantier obligatoire).
2. Ouvrir ses factures (« Voir ses factures »).

#### Ce qu'on doit faire

1. Cliquer « Nouveau fournisseur » quatre fois, avec les quatre lignes du
   jeu 2.3 (Raison sociale, Nature, Contact, Téléphone, E-mail), bouton
   « Créer ».
2. Taper `QA` dans « Rechercher ».

#### Résultat attendu

1. Quatre lignes `QA …` avec la bonne `Nature` (Matériaux / Matériaux /
   Prestation / Matériaux et prestation) et le statut **Actif**, et la colonne
   `Contact` renseignée avec le nom, le téléphone et l'e-mail saisis. Sur une
   base où ces fournisseurs ont été créés avant le 20 septembre 2026, cette
   colonne reste vide : leurs coordonnées avaient été perdues à la saisie, et
   aucun écran ne permet de les corriger après coup.
2. Le bouton « Voir ses factures » mène à
   `BASE/finance/factures-fournisseurs?fournisseur=<id>` (le fournisseur est
   dans le paramètre de requête, pas dans le chemin).

---

### A.4 Pages : `BASE/finance/bons-de-commande` et `BASE/finance/bons-de-commande/nouveau`

#### Cette page permet de faire

1. Créer un bon de commande en brouillon, l'émettre (engagement), l'annuler.
2. Voir pour chaque bon : statut, état de facturation, reste à facturer.

#### Ce qu'on doit faire

1. Cliquer « Nouveau bon ». Saisir `BC-QA-2026-001` (jeu 2.4) : Chantier QA,
   Fournisseur `QA Matériaux du Sud SARL`, Référence, Date, trois lignes.
   Vérifier « Montant total : 28 000 000 ». Cliquer « Enregistrer en
   brouillon ».
2. Sur le détail : étiquettes **Brouillon** et **Non facturé**. Cliquer
   « Émettre le bon », lire l'avertissement (le reste à facturer entre dans
   l'engagé), cliquer « Confirmer l'émission ».
3. Recommencer avec `BC-QA-2026-002` (émettre).
4. Recommencer avec `BC-QA-2026-003` : émettre, puis cliquer « Annuler le
   bon ». Une fenêtre demande le **motif de l'annulation**, obligatoire :
   saisir `Commande annulée par le fournisseur`, puis « Confirmer
   l'annulation ». Le bouton de validation reste inerte tant que le motif est
   vide — c'est voulu, une annulation irréversible se trace.
5. Revenir à la liste et filtrer par Chantier = chantier QA.

#### Résultat attendu

1. Trois lignes : `BC-QA-2026-001` **Émis** / Non facturé / Reste à facturer
   28 000 000 ; `BC-QA-2026-002` **Émis** / 18 000 000 ; `BC-QA-2026-003`
   **Annulé**, aucune action possible sur son détail.
2. Tableau de bord chantiers : `Engagé` = 46 000 000 (les deux bons émis ; le
   bon annulé n'engage rien), `Réalisé` = 0, `Écart` = 114 000 000 « Dans
   le budget ».

---

### A.5 Page : `BASE/finance/factures-fournisseurs?fournisseur=<id>` (via « Voir ses factures »)

#### Cette page permet de faire

1. Saisir une facture fournisseur avec ses lignes et ses imputations
   (chantier + poste), en brouillon.
2. Valider ou annuler une facture.
3. Enregistrer un règlement affecté à des factures, ou un acompte.

#### Ce qu'on doit faire

1. Depuis Fournisseurs, « Voir ses factures » sur `QA Matériaux du Sud SARL`.
   Carte « Nouvelle facture » : saisir `FRS-QA-001` (jeu 2.5), trois lignes,
   puis deux imputations (« Ajouter une imputation » : Chantier QA, Poste,
   Montant).
2. Avant d'ajouter la seconde imputation, observer la carte « Écart de
   saisie » : elle doit être rouge (5 000 000) et bloquer l'enregistrement.
   Une fois la seconde imputation saisie, elle passe à 0 (vert).
3. Cliquer « Enregistrer en brouillon ». **Ne pas valider ici** : elle sera
   validée dans la file (A.8).
4. Dans la carte « Règlement » : Date `20/03/2026`, Montant `28000000`,
   cocher `FRS-QA-001` — la case n'est proposée que pour une facture
   validée : constater que FRS-QA-001, encore en brouillon, n'y figure pas.
   Ne pas enregistrer ce règlement maintenant (revenir en A.9).
5. Fournisseur `QA Nimba Ingénierie` (Prestation) : saisir `FRS-QA-002`.
   Constater qu'aucune alerte « Rattachement à un chantier obligatoire »
   n'apparaît (fournisseur de prestation). Ajouter quand même l'imputation
   Gros œuvre 4 500 000. Enregistrer, puis cliquer « Valider » sur la ligne
   de la facture et « Confirmer la validation ».
6. Fournisseur `QA Sanitaires & Carrelage Madina` : `FRS-QA-003`, alerte
   orange « Rattachement à un chantier obligatoire » visible ; imputation
   Plomberie 18 000 000 ; enregistrer puis valider.
7. Fournisseur `QA Quincaillerie Angré` : `FRS-QA-004` (Électricité
   6 000 000), enregistrer, valider. Puis `FRS-QA-005` (Divers 1 000 000),
   enregistrer, valider, puis « Annuler » avec le motif `Doublon de saisie`
   et « Confirmer l'annulation ».

#### Résultat attendu

1. Une facture en brouillon montre le bouton « Valider » ; validée, le bouton
   « Annuler » ; annulée, plus aucune action et le statut **Annulée**.
2. Une facture dont l'écart de saisie n'est pas nul ne peut pas être
   enregistrée.
3. Détail du chantier (`BASE/finance/chantiers/SITE`) après cette étape :
   `Coût réel` = **28 500 000** (FRS-QA-002 4 500 000 + FRS-QA-003
   18 000 000 + FRS-QA-004 6 000 000 ; FRS-QA-001 est encore en brouillon,
   FRS-QA-005 est annulée). Sous-totaux : Gros œuvre 4 500 000, Plomberie
   18 000 000, Électricité 6 000 000.

---

### A.6 Page : `BASE/finance/pieces-de-caisse?chantierId=SITE` (via « Nouvelle pièce de caisse » du détail)

#### Cette page permet de faire

1. Émettre une pièce de caisse (dépense directe imputée à un chantier), en
   brouillon.
2. La valider (elle reçoit alors son numéro), l'annuler, imprimer le bon.

#### Ce qu'on doit faire

1. Depuis le détail du chantier, cliquer « Nouvelle pièce de caisse ». Le
   chantier est présélectionné.
2. Saisir PC1 (jeu 2.8) et cliquer « Émettre la pièce ». Le formulaire se
   verrouille ; la carte s'intitule « Pièce à valider — Mamadou Diallo, chef
   d'équipe ». Cliquer « Valider la pièce » (bouton rouge), lire « C'est à
   cet instant qu'elle reçoit son numéro. », cliquer « Valider ».
3. Cliquer « Imprimer le bon » : un PDF s'ouvre dans un nouvel onglet.
4. Cliquer « Émettre une nouvelle pièce ». Saisir PC2, émettre, **ne pas
   valider** (elle sera validée dans la file).
5. « Émettre une nouvelle pièce ». Saisir PC3, émettre, valider, puis
   « Annuler la pièce » avec le motif `Pièce saisie en double`, confirmer.
6. « Émettre une nouvelle pièce ». Saisir PC4 avec la date par défaut,
   émettre, **laisser en brouillon**.
7. Essayer d'émettre une pièce sans motif : le message « Renseignez le
   chantier, le poste, le bénéficiaire, un montant positif et le motif. »
   doit apparaître.

#### Résultat attendu

1. PC1 porte un numéro après validation (format année + séquence) ; avant,
   aucun numéro.
2. PC3 annulée : texte indiquant qu'une pièce d'annulation liée a été créée
   et que le montant ne compte plus dans le coût.
3. Détail du chantier : `Coût réel` = **28 850 000** (28 500 000 + PC1
   350 000). Divers = 350 000. PC2 (brouillon), PC3 (annulée), PC4
   (brouillon) n'y sont pas.

---

### A.7 Pages : `BASE/finance/salaires` et `BASE/finance/salaires/<employeeId>`

#### Cette page permet de faire

1. Créer un salarié (ouvre son compte de tiers).
2. Saisir et valider des notes de salaire, rattachées ou non à un chantier.
3. Enregistrer et valider des règlements ; suivre « Ce qu'on lui doit » ou
   « Avance à retenir ».

#### Ce qu'on doit faire

1. « Nouveau salarié » : `QA Ibrahima Sylla`, rôle `Chef de chantier`,
   « Enregistrer le salarié » (redirection vers la fiche).
2. Carte « Saisir une note de salaire » : Année `2026`, Mois `mars`, Montant
   `850000`, Chantier = chantier QA. Constater que le champ « Poste de
   dépense » apparaît et propose `Main-d'œuvre`. Cliquer « Saisir la note ».
   Recommencer pour `avril` 850 000. Essayer une troisième note pour `mars`
   : elle doit être refusée (une note par salarié et par mois).
3. Cliquer « Valider » sur chacune des deux notes.
4. Carte « Enregistrer un règlement » : Date `30/04/2026`, Montant
   `1700000`. Puis « Valider » le règlement.
5. Revenir à la liste, « Nouveau salarié » : `QA Fatou Camara`, `Comptable
de l'agence`. Note `avril` 2026, 600 000, **sans chantier** (le champ
   poste ne doit pas apparaître). Valider. Règlement 600 000 au 30/04/2026,
   valider.
6. « Nouveau salarié » : `QA Moussa Koné`, `Gardien de chantier`. Note `mars`
   2026, 250 000, chantier QA, Main-d'œuvre. Valider. Règlement `31/03/2026`
   de `400000`, valider.
7. Retourner à la liste des salaires.

#### Résultat attendu

1. Ibrahima Sylla : « Rien à lui verser ». Fatou Camara : « Rien à lui
   verser ». Moussa Koné : « Avance de 150 000 à retenir » (carte orange
   « Avance à retenir » sur sa fiche).
2. Détail du chantier : `Coût réel` = **30 800 000** (28 850 000 +
   850 000 + 850 000 + 250 000). Main-d'œuvre = 1 950 000. La note de Fatou
   Camara n'y figure pas.
3. Le vocabulaire des écrans ne contient ni « débit » ni « crédit ».

---

### A.8 Page : `BASE/finance/validation` (Finance › Pièces à valider)

#### Cette page permet de faire

1. Voir toutes les pièces en brouillon (factures fournisseurs, règlements
   fournisseurs, pièces de caisse) et les valider une par une ou en lot.

#### Ce qu'on doit faire

1. Filtrer `Saisi par` = Kouassi N'Guessan.
2. Constater trois pièces QA en attente : `FRS-QA-001` (Facture
   fournisseur, 28 000 000), la pièce de caisse PC2 (1 200 000) et la pièce
   de caisse PC4 (300 000). D'autres pièces de démonstration peuvent
   coexister.
3. Cocher `FRS-QA-001` et PC2 (**pas PC4**). Cliquer « Valider la
   sélection », confirmer « Valider les 2 pièces sélectionnées ? ».
4. Lire le « Compte rendu de la validation en lot », cliquer « Fermer ».

#### Résultat attendu

1. Le compte rendu liste deux succès, aucun échec.
2. PC4 reste seule en attente parmi les pièces QA.
3. Détail du chantier : `Coût réel` = **60 000 000** (30 800 000 +
   28 000 000 + 1 200 000). Sous-totaux : Gros œuvre 9 500 000, Plomberie
   18 000 000, Électricité 6 000 000, Main-d'œuvre 3 150 000, Matériaux
   23 000 000, Divers 350 000.

---

### A.9 Page : factures fournisseurs (règlements)

#### Ce qu'on doit faire

1. Pour chaque ligne du jeu 2.6, ouvrir « Voir ses factures » du
   fournisseur, carte « Règlement » : Date, Montant du règlement, cocher la
   facture et laisser le montant affecté proposé (ou saisir 16 200 000 pour
   FRS-QA-003, 6 000 000 pour FRS-QA-004). Cliquer « Enregistrer le
   règlement », puis « Valider » dans « Règlements de cette session ».
2. Pour `QA Quincaillerie Angré`, avant d'enregistrer, constater la mention
   « Part non affectée à une facture (acompte) : 2 000 000 ».
3. Test de garde-fou : sur `QA Nimba Ingénierie`, saisir un règlement de
   `1000000` en cochant FRS-QA-002 avec 4 500 000 affectés : alerte rouge
   « La somme des factures sélectionnées dépasse le montant du règlement. »
   et bouton bloqué. Annuler la saisie.

#### Résultat attendu

1. `BASE/finance/fournisseurs/balance` (Finance › Balance fournisseurs),
   lignes QA :
   | Fournisseur                      | Facturé    | Réglé      | Solde                                |
   | -------------------------------- | ---------- | ---------- | ------------------------------------ |
   | QA Matériaux du Sud SARL         | 28 000 000 | 28 000 000 | 0                                    |
   | QA Nimba Ingénierie              | 4 500 000  | 4 500 000  | 0                                    |
   | QA Sanitaires & Carrelage Madina | 18 000 000 | 16 200 000 | 1 800 000 (avant la retenue de A.10) |
   | QA Quincaillerie Angré           | 6 000 000  | 8 000 000  | −2 000 000                           |
2. « Voir le relevé » sur QA Quincaillerie Angré : trois lignes (facture
   6 000 000, annulation de FRS-QA-005 ou facture + annulation, règlement
   8 000 000), « Solde de clôture : −2 000 000 ». Le bouton « Imprimer »
   ouvre un PDF.
3. Le coût réel du chantier **ne bouge pas** avec les règlements.

---

### A.10 Pages : `BASE/finance/tacherons`, fiche tâcheron, `BASE/finance/retenues`

#### Cette page permet de faire

1. Créer un tâcheron, convenir un marché sur un chantier et un poste, saisir
   et valider des situations d'avancement, régler.
2. Poser une retenue de garantie sur une facture ou une situation validée,
   la libérer.

#### Ce qu'on doit faire

1. « Nouveau tâcheron » : `QA Sékou Camara`, `Maçonnerie`, « Enregistrer le
   tâcheron ». Sur la fiche, carte « Convenir un marché » avec `MAR-QA-001`
   (jeu 2.10). Sélectionner le marché, puis « Saisir une situation » deux
   fois (15/04 et 30/06), et « Valider » chacune. Puis deux règlements
   (14 400 000 le 20/04/2026 ; 12 000 000 le 05/07/2026), validés.
2. « Nouveau tâcheron » : `QA Adama Ouattara`, `Charpente et couverture`,
   marché `MAR-QA-002`, situation du 31/07/2026 de 22 000 000, validée.
   Règlement `20900000` au 10/08/2026, validé.
3. Aller à Finance › Retenues de garantie, « Poser une retenue » :
   - Nature **Facture fournisseur**, Fournisseur `QA Sanitaires & Carrelage
Madina`, Facture validée `FRS-QA-003`, Taux `10`, Date de libération
     `31/12/2026`. Lire l'aperçu (« environ 1 800 000 seraient retenus »),
     cliquer « Poser la retenue ».
   - Nature **Situation de tâcheron**, Marché `MAR-QA-002 — QA Adama
Ouattara`, Situation validée (22 000 000), Taux `5`, Date `31/01/2027`.
     Poser.
   - Essayer un taux `100` : le champ refuse (maximum 99,99).
4. Sur la retenue d'Adama Ouattara, cliquer « Libérer », lire « Libérer ne
   verse rien… », « Confirmer la libération ».
5. Retourner sur la fiche d'Adama Ouattara : enregistrer un règlement de
   `1100000` daté J, le valider.

#### Résultat attendu

1. Sékou Camara : « Ce qu'on lui doit » = **6 000 000**, « Marché restant »
   = **3 600 000** (36 000 000 − 32 400 000). La carte « Deux chiffres à ne
   pas confondre » est affichée.
2. Adama Ouattara : dû 0 après la retenue et le premier règlement ; dû
   1 100 000 après libération ; dû 0 après le dernier règlement.
3. Retenues : les deux lignes apparaissent avec `Retenu` = 1 800 000 et
   1 100 000 ; « Détenu aujourd'hui » a augmenté de 1 800 000 par rapport au
   départ (après libération), « Déjà libéré » de 1 100 000.
4. Balance fournisseurs : solde de QA Sanitaires & Carrelage Madina =
   **0** (la retenue est sortie de son compte). Si l'écran affiche encore
   1 800 000, noter la valeur.
5. Détail du chantier : `Coût réel` = **114 400 000** (60 000 000 +
   14 400 000 + 18 000 000 + 22 000 000). Gros œuvre = 41 900 000, Toiture =
   22 000 000. La retenue n'a rien changé au coût.

---

### A.11 Pages : `BASE/finance/stock/parametrage`, `BASE/finance/chantiers/SITE/stock`, `BASE/finance/stock`, `BASE/finance/stock/inventaire`

#### Cette page permet de faire

1. Paramétrer articles, lieux et méthode de valorisation.
2. Faire passer un chantier au stock (irréversible) et suivre son
   rapprochement facturé / reçu / consommé / restant.
3. Enregistrer réceptions (sur facture validée), sorties vers un chantier
   (c'est la sortie qui impute), transferts, inventaires.

#### Ce qu'on doit faire

1. **Articles et lieux** : onglet Articles, « Nouvel article » trois fois
   (jeu 2.11). Onglet Lieux de stockage, « Nouveau lieu de stockage » :
   Magasin, `QA Magasin central Angré`. Onglet Méthode de valorisation :
   motif `Méthode unique retenue pour le scénario QA`, « Enregistrer la
   décision ».
2. Détail du chantier › « Stock du chantier » : cliquer « Faire passer ce
   chantier au stock », « Confirmer le passage au stock ». Relever le
   libellé du lieu du chantier annoncé (« Les réceptions de ce chantier
   atterrissent au lieu « … » »).
3. Fournisseurs › `QA Matériaux du Sud SARL` › Voir ses factures : saisir
   `FRS-QA-006` (jeu 2.11) en **laissant la date par défaut**, imputation
   chantier QA — Matériaux — 11 000 000. Enregistrer, valider.
4. Détail du chantier : vérifier que `Coût réel` est **inchangé**
   (114 400 000). Stock du chantier : `Facturé au chantier` = 11 000 000,
   `Entré depuis une facture` = 0, `Écart entre le facturé et le reçu` =
   11 000 000. Si `Facturé au chantier` vaut 0, la facture a été datée avant
   le passage au stock : la ressaisir datée du lendemain et noter le point.
5. Stock › « Enregistrer une réception » : Lieu = lieu du chantier,
   Fournisseur `QA Matériaux du Sud SARL`, Facture validée `FRS-QA-006`,
   Date J, trois lignes (article, quantité, prix unitaire du jeu 2.11).
   « Enregistrer la réception ».
6. Inventaire › onglet Transfert entre lieux : origine = lieu du chantier,
   arrivée = `QA Magasin central Angré`, article `QA-CIM-42`, quantité
   `100`, date J. Essayer d'abord `900` : alerte « La quantité dépasse ce
   qu'il reste au lieu d'origine. ». Enregistrer avec 100.
7. Stock › « Enregistrer une sortie » trois fois (jeu 2.11) : Lieu de sortie
   = lieu du chantier, Article, Quantité, Chantier QA, Poste `Matériaux`
   (proposé), Demandeur, Date J. Sur la première, essayer quantité `800` :
   alerte rouge « Cette sortie dépasse le stock disponible, et sera
   refusée ». Lire l'aperçu de valeur avant d'enregistrer.
8. Inventaire › Inventaire physique : « Ouvrir un comptage » sur le lieu du
   chantier, date J. Saisir les trois comptages (195 / 200 / 30) ; sur le
   ciment, laisser d'abord le motif vide et constater que « Valider
   l'inventaire » annonce « 1 ligne en écart sans motif : la validation est
   impossible. » ; renseigner le motif, valider, « Confirmer la
   validation ».

#### Résultat attendu

1. Chaque sortie affiche un aperçu au coût moyen : 3 250 000, 2 400 000,
   900 000.
2. Stock › État du stock (masquer les lignes à zéro) :
   | Article     | Lieu                     | Quantité | Coût moyen unitaire | Valeur    |
   | ----------- | ------------------------ | -------- | ------------------- | --------- |
   | QA-CIM-42   | lieu du chantier         | 195      | 6 500               | 1 267 500 |
   | QA-FER-12   | lieu du chantier         | 200      | 8 000               | 1 600 000 |
   | QA-PEINT-20 | lieu du chantier         | 30       | 30 000              | 900 000   |
   | QA-CIM-42   | QA Magasin central Angré | 100      | 6 500               | 650 000   |
3. Journal des mouvements filtré sur le chantier QA : trois lignes
   « Sortie vers un chantier » avec « Chantier imputé » = chantier QA et
   poste Matériaux ; le transfert et l'ajustement affichent « Aucune
   imputation ».
4. Stock du chantier : `Facturé au chantier` 11 000 000, `Entré depuis une
facture` 11 000 000, `Venu d'un autre lieu` 0, `Consommé` 6 550 000,
   `Restant sur le chantier` 3 767 500, `Écart entre le facturé et le reçu` 0.
5. Inventaire : « Valeur de l'écart » = −32 500, état **Validé**.
6. Détail du chantier : `Coût réel` = **120 950 000** (114 400 000 +
   6 550 000). Matériaux = 29 550 000. La facture FRS-QA-006 n'apparaît
   **pas** dans les imputations (ses imputations restent en brouillon,
   c'est la sortie de magasin qui a imputé) : c'est le comportement attendu,
   pas une anomalie.

---

### A.12 Page : `BASE/finance/tableau-de-bord-chantiers` (contrôle intermédiaire)

#### Résultat attendu

| Colonne                                                                 | Valeur attendue                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Budget initial                                                          | 150 000 000                                                      |
| Budget révisé                                                           | 160 000 000                                                      |
| Engagé                                                                  | 166 950 000 (120 950 000 + 46 000 000 de bons émis non facturés) |
| Réalisé                                                                 | 120 950 000                                                      |
| Écart                                                                   | −6 950 000, étiquette **Dépassement**                            |
| Alerte                                                                  | vide (seuil non réglable)                                        |
| La case « Chantiers en dépassement uniquement » garde la ligne QA. Page |
| budget : cartes `Réalisé` = 120 950 000, `Engagé` = 166 950 000.        |

---

## Partie B — Clôture du chantier et bascule au patrimoine

### B.1 Page : `BASE/finance/chantiers/SITE/cloture` (via « Lots et clôture »)

#### Cette page permet de faire

1. Définir les lots du chantier et la clé de répartition du coût.
2. Voir ce qui empêche de clôturer, clôturer, rouvrir.
3. Basculer un lot au patrimoine une fois le chantier clos.

#### Ce qu'on doit faire

1. Constater l'alerte orange « 1 raison empêche de clôturer… » citant la
   pièce de caisse non validée (PC4), et le bouton « Clôturer le chantier »
   désactivé.
2. Aller à Finance › Pièces à valider, valider PC4 (300 000). Revenir.
3. Bloc « Ajouter un lot » : Nom `QA Immeuble Les Palmiers — 12
appartements`, Surface `1080`, Quote-part `90`. Cliquer « Ajouter le lot ».
4. Clé de répartition : choisir **Quotes-parts saisies**, lire « Somme des
   quotes-parts saisies : 90 % — il manque 10 » ; « Appliquer la clé » doit
   être refusé. Cliquer « Corriger » sur le lot, mettre `100`, appliquer.
   Puis choisir **Au prorata des surfaces** et appliquer.
5. Constater l'alerte verte « Rien n'empêche de clôturer ce chantier. ».
   Cliquer « Clôturer le chantier », lire l'avertissement, « Confirmer la
   clôture ».
6. Cliquer « Rouvrir le chantier » : le chantier repasse ouvert. Vérifier
   sur son détail l'étiquette **En cours** (seule voie vers ce statut).
   Revenir et clôturer à nouveau.

#### Résultat attendu

1. Après validation de PC4, détail du chantier : `Coût réel` =
   **121 250 000**, Divers = 650 000.
2. Après clôture : étiquette **Clôturé**, bandeau vert « Chantier clôturé :
   les coûts de revient ci-dessous sont définitifs. », `Coût réparti sur les
lots` = 121 250 000, `Non réparti` = 0, le lot affiche `Part` 100 % et
   `Coût de revient` 121 250 000. Sur le détail du chantier, la carte « Fin
   prévue » est remplacée par « Clôturé le J ».
3. Le bouton « Nouvelle pièce de caisse » ou la saisie d'une pièce sur ce
   chantier est refusée (noter le message).
4. Tableau de bord chantiers : `Réalisé` 121 250 000, `Engagé` 167 250 000,
   `Écart` −7 250 000 **Dépassement**, statut Clôturé.

---

### B.2 Même page — bascule au patrimoine

#### Ce qu'on doit faire

1. Sur la ligne du lot, cliquer « Basculer au patrimoine ».
2. Remplir la modale avec le jeu 2.12. Constater que la carte « Valeur
   d'acquisition portée au patrimoine » affiche 121 250 000 en lecture seule.
3. Cliquer « Créer le bien au patrimoine », « Confirmer la création du
   bien ».

#### Résultat attendu

1. La ligne du lot affiche « Basculé au patrimoine ». Le bouton « Rouvrir le
   chantier » est désactivé. Le bloc « Ajouter un lot » a disparu.
2. `BASE/patrimoine` : « Biens au portefeuille » = départ + 1 ; « Valeur
   estimée totale » = départ + 121 250 000.
3. `BASE/patrimoine/performance`, choisir `Résidence QA Les Palmiers` : les
   indicateurs s'affichent (rendements à 0 tant qu'il n'y a pas de loyer),
   « Recalculer » ne plante pas.
4. `BASE/properties` : recherche `QA-IMM-2026-001` → le bien existe, type
   Immeuble. Noter son identifiant dans l'adresse de la fiche : `IMM`.

---

## Partie C — Le bien et ses 12 appartements

### C.1 Page : `BASE/properties/IMM/edit` (bouton « Modifier » de la fiche)

#### Cette page permet de faire

1. Compléter un bien créé par la bascule (localisation, type d'opération,
   statut), qui ne porte que sa référence, son titre, son type et son adresse.

#### Ce qu'on doit faire

1. Renseigner les compléments du jeu 2.12 : Localisation (Pays › Région ›
   Commune), Quartier, Année de construction, État général, Standing,
   Type d'opération **Location**, Statut `Disponible`.
2. Si le champ « Propriétaire » est obligatoire, choisir `Séraphin Koffi`
   (propriétaire de démonstration) et le noter.
3. Enregistrer.

#### Résultat attendu

1. La fiche affiche l'adresse, la commune Cocody et la transaction Location.
2. L'onglet **Lots** est présent (il n'existe que pour un Immeuble).

---

### C.2 Page : fiche du bien, onglet **Lots** — modale « Créer des appartements »

#### Cette page permet de faire

1. Créer des appartements en masse, par groupes, rattachés à l'immeuble.

#### Ce qu'on doit faire

1. Onglet Lots, en-tête « Appartements (0) », cliquer « Ajouter un
   appartement ».
2. Groupe 1 : remplir avec la ligne « Étage 1 » du jeu 2.13. Constater que
   « Chambres » se calcule seul (pièces − 1 = 2).
3. « Ajouter un groupe d'appartements » deux fois pour les étages 2 et 3.
4. Valider la modale.

#### Résultat attendu

1. Message « 12 appartement(s) créé(s) avec succès ».
2. Tableau « Appartements (12) » : `Étage 1 – Apt 1` … `Étage 3 – Apt 4`,
   Surface 90, Pièces 3, Prix 250 000 (étages 1–2) ou 280 000 (étage 3),
   Statut Disponible. Pagination 10 par page : la seconde page contient
   `Étage 3 – Apt 3` et `Étage 3 – Apt 4`.
3. `BASE/properties`, recherche `Étage 2` : quatre cartes.

---

## Partie D — Les locataires et les baux

### D.1 Page : `BASE/crm/contacts` (CRM › Contacts)

#### Cette page permet de faire

1. Créer les contacts qui serviront de locataires (il n'y a pas de page
   « Locataires » : un locataire est un contact CRM).

#### Ce qu'on doit faire

1. Pour chacune des 8 lignes du jeu 2.14, « Nouveau contact » :
   - onglet **Basique** : Type de contact (Personne ou Entreprise), Prénom,
     Nom (ou Raison sociale, forme juridique, RCCM, représentant), Email
     personnel, Téléphone principal avec l'indicatif `+225` (ne pas cocher
     WhatsApp) ;
   - onglet **Contact** : Commune `Cocody` (obligatoire) ;
   - onglet **Professionnel** : Profession, Stabilité professionnelle.
     Enregistrer.
2. Rechercher `QA` dans la liste.

#### Résultat attendu

1. Huit contacts `QA …`. Le contact entreprise affiche sa raison sociale.
2. Aucun message d'envoi WhatsApp.

---

### D.2 Pages : `BASE/rental/leases/new` et `BASE/rental/leases/<leaseId>`

#### Cette page permet de faire

1. Créer un bail en cinq étapes (Informations générales, Parties, Financier,
   Pénalités, Notes).
2. Changer le statut du bail depuis sa fiche.

#### Ce qu'on doit faire

1. « Nouveau bail ». Étape 1 : dans « Propriété », taper `Étage 1` : les
   options se présentent comme `Étage 1 – Apt 1 ( Résidence QA Les Palmiers
)`. Constater que `Résidence QA Les Palmiers` elle-même n'est **pas**
   proposée (un immeuble avec des appartements ne se loue pas en bloc).
   Choisir l'appartement du locataire 1, dates du jeu 2.15.
2. Étape 2 : Locataire principal = `QA Koné Aminata`. Propriétaire : laisser
   tel quel.
3. Étape 3 : vérifier que « Montant du loyer » est pré-rempli à 250 000
   (prix de l'appartement). Charges `15000`, Jour d'échéance `5`, Dépôt
   `500000`. Essayer `0` en loyer : « Le montant du loyer doit être
   supérieur à 0 ».
4. Étape 4 : Jours de grâce `5`, Mode Pourcentage du solde, Taux `2`,
   Montant maximum `50000`.
5. Étape 5 : notes, puis « Créer le bail ».
6. Sur la fiche : liste déroulante de statut en haut → **Actif**, message
   « Statut mis à jour avec succès ».
7. Répéter pour les 7 autres locataires (jeu 2.14 et 2.15). Noter
   l'identifiant de chaque bail (`BAIL-2026-xxxx`) dans le journal.

#### Résultat attendu

1. `BASE/rental/leases`, filtre Locataire ou recherche par numéro : 8 baux QA
   **Actif**, période `01/07/2026 → 30/06/2027`, montant 250 000 ou 280 000.
2. Fiche d'un bail, carte Financier : « Jour d'échéance : Le 5 de chaque
   mois » ; carte Pénalités : 5 jours, Pourcentage du solde, 2 %, plafond
   50 000.
3. Fiche de l'immeuble, onglet Lots : les 8 appartements loués passent à
   **Loué**, les 4 autres restent **Disponible**. Si les statuts restent
   « Disponible », noter le point (statut non propagé par l'activation).
4. Aucun compte portail n'est créé à la main : la création du bail s'en
   charge (un e-mail part vers `@example.com`, sans effet).

---

### D.3 Page : `BASE/finance/associations` (Finance › Associations)

#### Ce qu'on doit faire

1. « Nouvelle association » : `QA Indivision Les Palmiers`.
2. Sur la fiche : « Ajouter un associé » `Famille Koné (héritiers)`, quote-part
   `30`. Rattacher un bien existant : `Étage 1 – Apt 3`, puis `Étage 2 –
Apt 2`.

#### Résultat attendu

1. Cartes `Total des quotes-parts` = 30 %, `Part de l'agence` = 70 %.
2. Deux biens rattachés. « Voir l'état » de l'associé : vide pour l'instant.

---

## Partie E — Échéances, facturation, encaissements

L'ordre des étapes de cette partie est **impératif** : l'imputation de
l'avance du locataire 6 dépend de la séquence campagne → paiement → campagne.

### E.1 Page : fiche du bail 1 (Aminata Koné), onglet **Échéances**

#### Cette page permet de faire

1. Générer les échéances d'un bail, recalculer les statuts, tout supprimer.

#### Ce qu'on doit faire

1. Cliquer « Générer les échéances » → « Échéances générées. ».
2. Cliquer une seconde fois : le serveur refuse (« Des échéances existent
   déjà pour ce bail… »).
3. Ouvrir le menu ⋮, cliquer « Recalculer les statuts et pénalités ».

#### Résultat attendu

1. 12 échéances de `07/2026` à `06/2027`, date d'échéance le 05 de chaque
   mois, `Montant dû` 265 000, `Reste à payer` 265 000.
2. Après recalcul : juillet, août et septembre 2026 en **En retard**, les
   neuf suivantes en **À échoir**. (Avant recalcul elles sont en brouillon et
   invisibles aux filtres : c'est attendu.)
3. `BASE/finance/balance-clients` : une ligne `QA Koné Aminata`, Facturé
   3 180 000, Réglé 0, Solde 3 180 000.

---

### E.2 Page : `BASE/finance/facturation` (Finance › Facturation du mois) — campagne de juillet

#### Cette page permet de faire

1. Facturer d'un coup tous les baux actifs pour un mois, et imputer les
   avances reçues.

#### Ce qu'on doit faire

1. Mois `juillet`, Année `2026`, Libellé (proposé) `Loyer de juillet 2026`.
   « Lancer la campagne », confirmer.

#### Résultat attendu

1. Message « Campagne exécutée : X baux facturés, Y baux exclus. ».
2. Compte rendu : les 7 baux QA (locataires 2 à 8) dans _Facturées_ avec
   `Montant facturé` 265 000 ou 295 000 ; le bail 1 dans _Exclues_ avec le
   motif « Une échéance existe déjà pour cette période ». Les baux de
   démonstration apparaissent selon leur état : ne pas s'en soucier.
3. Historique : une ligne `07/2026`, statut **Exécutée**.

---

### E.3 Encaissements de juillet

#### Ce qu'on doit faire

Suivre la colonne « Juillet 2026 » du jeu 2.16, locataire par locataire :

1. Fiche du bail › onglet Échéances › ligne `07/2026` : « Paiement… » ouvre
   le formulaire pré-rempli du reste dû ; « Encaisser » (éclair) encaisse en
   espèces sans formulaire.
2. Pour Mobile Money : choisir l'opérateur et saisir le numéro de téléphone
   (ces deux champs deviennent obligatoires).
3. Locataire 6 : `BASE/rental/payments` › « Nouveau paiement », bail de
   `QA Sanogo Ibrahim`, 300 000, Mobile Money Wave. Puis « Affecter » sur la
   ligne du paiement : titre « Affecter 300 000 FCFA », saisir `265000` sur
   l'échéance `07/2026`, « Allouer le paiement ».
4. Locataires 3 et 4 : rien en juillet.
5. Double-cliquer une fois volontairement sur « Enregistrer le paiement »
   (locataire 5) : un seul paiement doit être créé (clé d'idempotence).

#### Résultat attendu

1. Échéances `07/2026` des locataires 1, 2, 5, 6, 7, 8 en **Payé**, reste 0.
2. Page Paiements : le paiement de 300 000 du locataire 6 affiche `Reste à
affecter` 35 000 ; les autres « Affecté ».
3. Détail d'un paiement Mobile Money : opérateur et numéro affichés.

---

### E.4 Campagne d'août puis encaissements d'août

#### Ce qu'on doit faire

1. Facturation : Mois `août`, Année `2026`, lancer.
2. Lire le compte rendu, tableau _Avances imputées_.
3. Encaisser la colonne « Août 2026 » du jeu 2.16 (locataires 1, 2, 5, 7, 8 ;
   pour le locataire 2, « Paiement… » et remplacer le montant par `150000`).

#### Résultat attendu

1. _Avances imputées_ : `QA Sanogo Ibrahim` — 35 000. L'échéance `08/2026`
   du locataire 6 a un `Reste à payer` de **230 000**. Si le tableau est vide
   et le reste vaut 265 000, noter l'anomalie (avance non imputée).
2. Échéance `08/2026` du locataire 2 : **Partiel**, reste 115 000.

---

### E.5 Campagne de septembre, encaissements de septembre, paiement groupé

#### Ce qu'on doit faire

1. Facturation : Mois `septembre`, Année `2026`, lancer.
2. Encaisser la colonne « Septembre 2026 » (locataires 1 et 7).
3. Locataire 3 : Paiements › « Nouveau paiement », bail `QA Diaby Mariam`,
   795 000, Virement, Référence PSP `VIR-QA-0003`. Puis « Affecter » en
   laissant les trois montants vides (« laisser vide pour allouer
   automatiquement »), « Allouer le paiement ».
4. Relancer la campagne de septembre une seconde fois (« Relancer la
   campagne »).

#### Résultat attendu

1. Locataire 3 : les trois échéances passent en **Payé** ; le paiement est
   « Affecté ».
2. La relance ne crée aucun doublon : les 8 baux QA sont en _Exclues_ avec
   « Une échéance existe déjà pour cette période ».
3. `BASE/rental/installments`, filtre Statut « En retard » : on retrouve les
   échéances impayées QA de juillet à septembre (locataires 2, 4, 5, 6, 8).

---

## Partie F — La comptabilité locative

### F.1 Page : `BASE/finance/balance-clients` (Finance › Balance clients)

#### Résultat attendu (avant pénalités et dépôts)

| Locataire               | Biens           | Facturé       | Réglé         | Solde         |
| ----------------------- | --------------- | ------------- | ------------- | ------------- |
| QA Koné Aminata         | Étage 1 – Apt 1 | 3 180 000     | 795 000       | 2 385 000     |
| QA Kouassi Yao Bernard  | Étage 1 – Apt 2 | 795 000       | 415 000       | 380 000       |
| QA Diaby Mariam         | Étage 1 – Apt 3 | 795 000       | 795 000       | 0             |
| QA Traoré Souleymane    | Étage 2 – Apt 1 | 795 000       | 0             | 795 000       |
| QA N'Dri Adjoua Estelle | Étage 2 – Apt 2 | 795 000       | 530 000       | 265 000       |
| QA Sanogo Ibrahim       | Étage 2 – Apt 4 | 795 000       | 300 000       | 495 000       |
| QA Gnamien Clarisse     | Étage 3 – Apt 1 | 885 000       | 885 000       | 0             |
| QA Ivoire Télécom SARL  | Étage 3 – Apt 3 | 885 000       | 590 000       | 295 000       |
| **Total QA**            |                 | **8 925 000** | **4 310 000** | **4 615 000** |

1. Le filtre `Bien` = `Étage 2 – Apt 1` ne laisse que la ligne Traoré.
2. « Exporter » télécharge un CSV avec les colonnes Locataire, Biens,
   Facturé, Réglé, Solde.
3. Pour le locataire 6, `Réglé` peut s'afficher 300 000 ou 265 000 + une
   avance : le solde 495 000 est la valeur ferme.

---

### F.2 Page : `BASE/finance/balance-agee` (Finance › Balance âgée)

Règle des tranches (jour de référence = aujourd'hui, retard = jours écoulés
depuis la date d'échéance) : `< 30` pour 0 ≤ retard < 30, `30 à 60` pour
30 ≤ retard < 60, `60 à 90` pour 60 ≤ retard < 90, `> 90` au-delà ; `À
échoir` pour une échéance future. Pour J = 20/09/2026 : septembre (05/09)
= 15 jours, août (05/08) = 46 jours, juillet (05/07) = 77 jours.

#### Résultat attendu (J = 20/09/2026)

| Locataire               | Solde     | À échoir  | < 30 jours | 30 à 60 jours | 60 à 90 jours | > 90 jours |
| ----------------------- | --------- | --------- | ---------- | ------------- | ------------- | ---------- |
| QA Koné Aminata         | 2 385 000 | 2 385 000 | 0          | 0             | 0             | 0          |
| QA Kouassi Yao Bernard  | 380 000   | 0         | 265 000    | 115 000       | 0             | 0          |
| QA Traoré Souleymane    | 795 000   | 0         | 265 000    | 265 000       | 265 000       | 0          |
| QA N'Dri Adjoua Estelle | 265 000   | 0         | 265 000    | 0             | 0             | 0          |
| QA Sanogo Ibrahim       | 495 000   | 0         | 265 000    | 230 000       | 0             | 0          |
| QA Ivoire Télécom SARL  | 295 000   | 0         | 295 000    | 0             | 0             | 0          |

Trier sur la colonne « 60 à 90 jours » : Traoré remonte en tête.

---

### F.3 Page : relevé de compte (« Voir le relevé » sur QA Kouassi Yao Bernard)

#### Résultat attendu

1. Sous-titre « Solde d'ouverture : 0 · Solde de clôture : 380 000 ».
2. Lignes, dans l'ordre : `Loyer juillet 2026` (Facturé 265 000, Solde
   après 265 000) ; `Règlement (CASH) affecté à l'échéance 07/2026` (Réglé
   265 000, solde 0) ; `Loyer août 2026` (265 000) ; `Règlement
(MOBILE_MONEY) affecté à l'échéance 08/2026` (150 000, solde 115 000) ;
   `Loyer septembre 2026` (265 000, solde 380 000).
3. Le filtre « Période du relevé » `01/08/2026 → 31/08/2026` affiche un
   solde d'ouverture de 0 et une clôture de 115 000.
4. « Imprimer » ouvre un PDF dans un nouvel onglet.
5. Relevé du locataire 6 : une ligne `Avance reçue` 35 000 puis `Avance
imputée sur l'échéance 08/2026` 35 000.

---

### F.4 Page : fiche du bail 4 (Souleymane Traoré), onglet **Pénalités**

#### Cette page permet de faire

1. Calculer les pénalités des échéances en retard au-delà du délai de
   grâce, les ajuster, joindre un justificatif, les supprimer.

#### Ce qu'on doit faire

1. Cliquer « Calculer les pénalités » → « Pénalités calculées. ».
2. Sur la pénalité de juillet, ⋮ › « Supprimer », puis relancer « Calculer
   les pénalités » : elle doit revenir.
3. En dernier, sur la pénalité de septembre, « Ajuster » : Montant retenu
   `2650`, Raison `Geste commercial, premier retard`. Ne plus relancer le
   calcul ensuite.

#### Résultat attendu

1. Trois lignes (une par échéance en retard) : `Retard` 77 / 46 / 15 jours
   à J = 20/09, `Montant calculé` **5 300** chacune (2 % de 265 000, sous le
   plafond de 50 000). Une pénalité dont le taux serait lu 0,02 % (soit 53)
   est une anomalie à noter.
2. Après ajustement : `Montant retenu` 2 650 sur septembre.
3. Après suppression puis recalcul : la pénalité de juillet revient
   (5 300).
4. Balance clients, ligne Traoré : Solde = **808 250** (795 000 + 5 300 +
   5 300 + 2 650). Relevé : trois lignes de nature `Pénalité`.
5. Bail 1 (Aminata Koné), même bouton : « Aucune pénalité » ou aucune ligne
   créée, car tout est payé.

---

### F.5 Page : fiche du bail 1 puis du bail 7, onglet **Dépôt de garantie**

#### Cette page permet de faire

1. Suivre le dépôt de garantie d'un bail (cible, solde, statut) et y
   enregistrer des mouvements : collecte, blocage, libération,
   remboursement, confiscation, ajustement.

#### Ce qu'on doit faire

1. Bail 1 : ouvrir l'onglet. Bandeau `Montant cible` 500 000, `Solde actuel`
   0, statut **En attente**. « Nouveau mouvement » : Type Collecte ;
   constater que « Paiement associé » est vide (aucun paiement non affecté
   sur ce bail) et que le montant est forcé à 500 000. Annuler.
2. Paiements › « Nouveau paiement » : bail d'Aminata Koné, `500000`, Virement,
   Référence PSP `DEP-QA-0001`. **Ne pas l'affecter.**
3. Retour à l'onglet Dépôt de garantie : « Nouveau mouvement », Collecte,
   Paiement associé = le paiement de 500 000, Note `Dépôt de garantie, 2
mois`. « Enregistrer ».
4. Recommencer une Collecte : elle doit être refusée (« une seule
   collecte »).
5. Bail 7 (Clarisse Gnamien) : paiement de 560 000 en Espèces non affecté,
   puis Collecte.
6. Bail 7 : mouvement **Blocage** de 100 000, note `Réserve pour état des
lieux`, puis **Libération** de 100 000.

#### Résultat attendu

1. Bail 1 : `Solde actuel` 500 000, statut **Complet**, historique avec une
   flèche verte 500 000.
2. Bail 7 : solde 560 000, trois mouvements (Collecte, Blocage, Libération).
3. Balance clients : les lignes Koné Aminata (solde 2 385 000) et Gnamien
   Clarisse (solde 0) sont **inchangées**. Si l'un des deux soldes a baissé
   du montant du dépôt, le dépôt a été traité comme une avance sur loyer :
   anomalie à noter.
4. Détail du paiement de 500 000 : « Utilisation du paiement » mentionne
   « Collecte (dépôt de garantie) ».

---

### F.6 Page : fiche du bail 1, onglet **Documents**

#### Cette page permet de faire

1. Générer contrat, avenant, reçu, quittance, reçu de dépôt ou relevé à
   partir d'un modèle actif ; télécharger, régénérer.

#### Ce qu'on doit faire

1. Action primaire de l'onglet : Type **Contrat de bail**, Titre `Contrat QA
Koné`, laisser le modèle par défaut, « Générer le document ».
2. Recommencer avec Type **Quittance de loyer**, Titre `Quittance QA
septembre 2026`.
3. Recommencer avec Type **Reçu de dépôt**. Le sélecteur de modèle propose la
   _Quittance de loyer_ : c'est voulu, le reçu de dépôt est rattaché au type
   de modèle « Reçu de loyer ». Le document produit reprendra donc la mise en
   page d'une quittance.
4. Sur la quittance : « Télécharger », puis ⋮ › « Régénérer à partir des
   données actuelles », confirmer.

#### Résultat attendu

1. Trois lignes avec un numéro `2026-NNN` séquentiel, `Émis le` = J, statut
   **Final** (ou Brouillon : noter). Le reçu de dépôt réussit, à partir du
   modèle de reçu de loyer.
2. Le téléchargement produit un fichier `.docx` (Word), pas un PDF.
3. Si la génération échoue avec « Aucun template actif » ou « Champs
   critiques manquants : … », noter le message exact : le modèle de
   documents est absent ou incomplet (voir 1.3).

---

### F.7 Page : `BASE/finance/associations/<id>` — état de quote-part

#### Ce qu'on doit faire

1. Fiche `QA Indivision Les Palmiers`, associé `Famille Koné (héritiers)`,
   « Voir l'état », sans filtre de période.

#### Résultat attendu

1. Lignes pour `Étage 1 – Apt 3` et `Étage 2 – Apt 2`, périodes 07/2026 à
   09/2026, `Facturé` 265 000 par ligne, `Encaissé` selon le plan (Diaby :
   265 000 × 3 ; N'Dri : 265 000, 265 000, 0).
2. `Sa part` = 30 % : 79 500 par ligne si la part est calculée sur le
   facturé (total 477 000), ou 238 500 + 159 000 = 397 500 si elle est
   calculée sur l'encaissé. Noter la base retenue par l'écran.
3. « Déjà reversé » 0, « Reste dû, toutes périodes » = total de sa part.

---

## Partie G — Vérifications finales

### G.1 Page : `BASE/dashboard` (Tableau de bord)

#### Résultat attendu

1. Tuile « Impayés » : montant = valeur de départ + **2 243 250**
   (380 000 + 808 250 + 265 000 + 495 000 + 295 000) ; nombre d'échéances
   en retard = départ + 9 (T2 : 2, T4 : 3, T5 : 1, T6 : 2, T8 : 1), ou + 7
   si les deux échéances d'août partiellement payées (locataires 2 et 6)
   sont comptées « Partiel » plutôt que « En retard » : noter le choix de
   l'écran. Le lien mène aux échéances filtrées « En retard ».
2. Tuile « Biens » : nombre = départ + 13 (1 immeuble + 12 appartements) ;
   taux d'occupation recalculé (noter).
3. Carte « Moyens de paiement » : les cinq modes utilisés (Espèces,
   Virement bancaire, Chèque, Mobile Money, Carte bancaire) apparaissent
   avec une valeur non nulle.
4. Carte « Programmes de travaux » : si un programme s'est créé pour le
   chantier, il affiche 121 250 000 ; sinon noter « aucun ».

### G.2 Page : `BASE/patrimoine` et `BASE/patrimoine/performance`

#### Résultat attendu

1. « Biens au portefeuille » = départ + 13 ; « Taux d'occupation » a évolué
   (8 loués sur 13 biens nouveaux) : noter la valeur et la façon dont
   l'immeuble parent est compté.
2. « Valeur estimée totale » = départ + 121 250 000.
3. « Loyers annuels » = départ + 24 720 000 (loyers hors charges : (6 ×
   250 000 + 2 × 280 000) × 12) ou + 26 160 000 (charges incluses) : noter
   la base.
4. Performance sur `Résidence QA Les Palmiers` : rendement brut ≈ 20,4 %
   (24 720 000 / 121 250 000) si l'écran agrège les loyers des appartements
   sur l'immeuble ; 0 % s'il ne les agrège pas. Noter le comportement, puis
   tester sur `Étage 1 – Apt 1` (pas de valeur d'acquisition propre :
   rendement `—` ou 0).

### G.3 Page : `BASE/finance/chantiers/SITE` (contrôle de gel)

#### Résultat attendu

1. `Coût réel` **121 250 000**, étiquette **Clôturé**, « Clôturé le J ».
2. Sous-totaux par poste :
   | Poste        | Sous-total |
   | ------------ | ---------- |
   | Gros œuvre   | 41 900 000 |
   | Toiture      | 22 000 000 |
   | Plomberie    | 18 000 000 |
   | Électricité  | 6 000 000  |
   | Main-d'œuvre | 3 150 000  |
   | Matériaux    | 29 550 000 |
   | Divers       | 650 000    |
3. Tableau « Imputations » : chaque ligne porte un libellé lisible (« Facture
   FRS-QA-001 — QA Matériaux du Sud SARL », « Bon de caisse … — Mamadou
   Diallo, chef d'équipe », etc.). Une ligne « Pièce xxxxxxxx » (identifiant
   brut) est une anomalie.
4. Liste des chantiers filtrée « Clôturé » : le chantier QA y figure avec
   `Coût réel` 121 250 000.

---

## 4. Synthèse des montants attendus

| Indicateur                                                   | Valeur                                           |
| ------------------------------------------------------------ | ------------------------------------------------ |
| Budget initial                                               | 150 000 000                                      |
| Avenant validé                                               | +10 000 000                                      |
| Budget révisé                                                | 160 000 000                                      |
| Bons émis non facturés (engagement)                          | 46 000 000                                       |
| Factures fournisseurs imputées en charge                     | 56 500 000                                       |
| Pièces de caisse validées                                    | 1 850 000                                        |
| Notes de salaire sur chantier                                | 1 950 000                                        |
| Situations de tâcherons                                      | 54 400 000                                       |
| Sorties de stock                                             | 6 550 000                                        |
| **Coût réel figé du chantier**                               | **121 250 000**                                  |
| Engagé                                                       | 167 250 000                                      |
| Écart budgétaire                                             | −7 250 000 (Dépassement)                         |
| Retenues posées                                              | 2 900 000 (1 800 000 détenue, 1 100 000 libérée) |
| Valeur d'acquisition du bien                                 | 121 250 000                                      |
| Appartements créés / loués                                   | 12 / 8 (66,7 %)                                  |
| Loyers facturés (juillet → septembre, plus 9 mois du bail 1) | 8 925 000                                        |
| Loyers réglés                                                | 4 310 000                                        |
| Solde locataires avant pénalités                             | 4 615 000                                        |
| Pénalités retenues (bail 4)                                  | 13 250                                           |
| Dépôts de garantie collectés                                 | 1 060 000                                        |
| Impayés ajoutés au tableau de bord                           | 2 243 250                                        |

---

## 5. Journal de test

À remplir au fil du parcours. Une ligne par étape ; « Constaté » reçoit la
valeur lue à l'écran quand elle diffère de l'attendu ou quand le document
demande de « noter la valeur ».

| Étape                 | Résultat (OK / KO / Noté) | Constaté                                                                       | Capture |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------ | ------- |
| 1.3 valeurs de départ |                           | Impayés = … ; Biens = … ; Valeur estimée = … ; Loyers annuels = … ; Détenu = … |         |
| A.1                   |                           | SITE = …                                                                       |         |
| A.2                   |                           |                                                                                |         |
| A.3                   |                           |                                                                                |         |
| A.4                   |                           |                                                                                |         |
| A.5                   |                           |                                                                                |         |
| A.6                   |                           | numéro PC1 = …                                                                 |         |
| A.7                   |                           |                                                                                |         |
| A.8                   |                           |                                                                                |         |
| A.9                   |                           |                                                                                |         |
| A.10                  |                           |                                                                                |         |
| A.11                  |                           | lieu du chantier = …                                                           |         |
| A.12                  |                           |                                                                                |         |
| B.1                   |                           |                                                                                |         |
| B.2                   |                           | IMM = …                                                                        |         |
| C.1                   |                           | propriétaire imposé ?                                                          |         |
| C.2                   |                           |                                                                                |         |
| D.1                   |                           |                                                                                |         |
| D.2                   |                           | BAIL-2026-… × 8 ; statut des lots après activation                             |         |
| D.3                   |                           |                                                                                |         |
| E.1                   |                           |                                                                                |         |
| E.2                   |                           | X facturés / Y exclus                                                          |         |
| E.3                   |                           |                                                                                |         |
| E.4                   |                           | avance imputée ?                                                               |         |
| E.5                   |                           |                                                                                |         |
| F.1                   |                           |                                                                                |         |
| F.2                   |                           |                                                                                |         |
| F.3                   |                           |                                                                                |         |
| F.4                   |                           | montant calculé = …                                                            |         |
| F.5                   |                           | soldes inchangés ?                                                             |         |
| F.6                   |                           | format du fichier, message éventuel                                            |         |
| F.7                   |                           | base de la quote-part                                                          |         |
| G.1                   |                           |                                                                                |         |
| G.2                   |                           | base des loyers annuels, rendement                                             |         |
| G.3                   |                           |                                                                                |         |

Anomalies à consigner à part, avec : page, action, attendu, constaté,
statut HTTP de la requête en échec s'il y en a une, capture.

---

## 6. Hors périmètre de ce scénario

- Baux de terrain (le chantier est sur un terrain de l'agence).
- Relevés de gérance propriétaire (l'immeuble est propriété de l'agence ;
  il n'y a pas de propriétaire à qui rendre compte).
- Portails locataire et propriétaire, déclarations de paiement depuis le
  portail, notifications e-mail et WhatsApp.
- Maintenance, CRM au-delà de la création des contacts, Syndic,
  Communication, Newsletter.
- Suppression des données `QA` en fin de test : elles restent en base ; les
  bascules (stock, patrimoine) sont irréversibles par construction.
