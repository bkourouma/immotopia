# Recette Gestion locative — 02 Baux

**Périmètre.** Création d'un bail (assistant en cinq étapes), toutes les variantes d'options (fréquences de
facturation, jour d'échéance, dépôt, pénalités, devise, notes, bien « vente seule », locataire issu d'un contact),
validations, liste des baux (recherche, filtres, pagination, export), fiche du bail, modification, changement de
statut, suppression, co-locataires, honoraires du bail (dérogation et gestionnaire). Les échéances générées sont
contrôlées là où elles prouvent la bonne création du bail.

**Prérequis.** Fichier 01 passé en entier (GL-01-057 « Ordre des préalables » validé) : contacts C1 à C6, biens P1 à P14,
réglages d'honoraires (agence 8 %, propriétaire C3 10 %, propriétaire C4 forfait 30 000, TVA 18 %, AGENT_A 40 %).
Les dates supposent une recette jouée le 03/11/2026 (voir fichier 01).

**Base amorcée.** L'agence A porte déjà 40 baux (historique du seed) : la liste n'est jamais vide, les compteurs
(« N baux en gestion », « 1–20 sur N ») partent de ce nombre, et les numéros de bail continuent la séquence existante.
Avant de commencer, relever le **plus grand numéro de bail** de la liste (tri décroissant, première ligne) et le nombre
total de baux (`N0`). Dans ce fichier, `BAIL-AAAA-0001`, `0002`, `0003`… désignent dans l'ordre les baux créés par la
recette : L1 = premier bail créé, soit « plus grand numéro + 1 » (ex. si le dernier est `BAIL-2026-0040`, L1 est
`BAIL-2026-0041`). Le testeur note la correspondance. Les cas qui comptent des lignes parlent de `N0 + n`.

**Données créées par ce fichier** (réutilisées par les fichiers 03 et 04). Le numéro de bail est
`BAIL-AAAA-000x` (AAAA = année en cours, x = rang de création, voir ci-dessus) :

| Repère | Bien          | Locataire    | Propriétaire          | Période                          | Fréquence   | Jour | Loyer     | Charges | Dépôt   | Pénalités                                        |
| ------ | ------------- | ------------ | --------------------- | -------------------------------- | ----------- | ---- | --------- | ------- | ------- | ------------------------------------------------ |
| L1     | P1            | C1           | C3                    | 01/08/2026 → 31/07/2027          | Mensuel     | 5    | 150 000   | 10 000  | 300 000 | grâce 5 j, % du solde, 2 %, plafond 20 000       |
| L2     | P2            | C2           | C3                    | 15/01/2027 → 31/12/2027          | Trimestriel | 15   | 360 000   | 0       | 0       | par défaut                                       |
| L3     | P3            | C1           | C4                    | 01/01/2027 → 31/12/2027          | Semestriel  | 1    | 1 200 000 | 0       | 400 000 | par défaut                                       |
| L4     | P4            | C2           | aucun                 | 01/03/2027 → 29/02/2028          | Annuel      | 10   | 1 080 000 | 0       | 90 000  | par défaut                                       |
| L5     | P6            | C2           | C3                    | 01/01/2027 → 30/06/2027          | Mensuel     | 31   | 400 000   | 0       | 800 000 | par défaut                                       |
| L6     | P7            | C5 (société) | C4                    | 01/12/2027 → 31/03/2028          | Mensuel     | 29   | 500 000   | 0       | 500 000 | par défaut                                       |
| L7     | P8            | C2           | C4 (choisi à la main) | 01/01/2027 → 30/04/2027          | Mensuel     | 30   | 80 000    | 0       | 80 000  | grâce 3 j, montant fixe 5 000                    |
| L8     | P9            | C1           | aucun                 | à partir du 01/01/2027, sans fin | Mensuel     | 5    | 75 000    | 0       | 0       | par défaut                                       |
| L9     | P10           | C1           | aucun                 | 10/02/2027 → 09/07/2027          | Mensuel     | 5    | 450 EUR   | 0       | 0       | par défaut                                       |
| L10    | P12           | C2           | aucun                 | 01/01/2027 → 31/12/2027          | Mensuel     | 5    | 70 000    | 0       | 0       | % du solde, taux 0,5                             |
| L11    | P11 (vente)   | C6           | aucun                 | à partir du 10/11/2026, sans fin | —           | —    | —         | —       | —       | —                                                |
| LS     | P5            | C6           | C3                    | 01/02/2027 → 31/07/2027          | Mensuel     | 5    | 60 000    | 0       | 0       | par défaut (bail jetable, supprimé en GL-02-077) |
| LB     | PB (agence B) | CB           | aucun                 | 01/01/2027 → 31/12/2027          | Mensuel     | 5    | 100 000   | 0       | 0       | créé par ADMIN_B (GL-02-065)                     |

---

## A. Accès et premier écran

### GL-02-001 — Premier écran de la liste et absence de résultat

- **Rôle** : ADMIN_A
- **Préconditions** : base amorcée (40 baux dans A). L'état vide d'une agence sans aucun bail
  (« Aucun bail n'est encore enregistré pour cette agence. » + bouton « Créer un bail ») n'est pas jouable sur A ; il
  l'est seulement sur une agence sans bail.
- **Données** : recherche `ZZZZ-INEXISTANT`.
- **Étapes** :
  1. Cliquer sur « Baux » dans le menu (`/tenant/<idA>/rental/leases`).
  2. Taper `ZZZZ-INEXISTANT` dans le champ de recherche.
  3. Cliquer sur « Effacer les filtres » (ou sur la croix du champ).
- **Attendu** :
  - Étape 1 : titre « Baux », sous-titre « 40 baux en gestion » (nombre exact de la base, `N0`), bouton « Nouveau bail »,
    champ de recherche « Rechercher par numéro de bail », filtres « Locataire » (« Tous les locataires ») et
    « Statut » (« Tous les statuts »). 20 lignes (taille de page par défaut), barre « 1–20 sur 40 » avec choix du
    nombre de lignes. Réseau : `GET /api/tenants/<idA>/rental/leases?limit=20&page=1` répond 200.
  - Étape 2 : après 250 ms, bloc « Aucun résultat » avec le bouton « Effacer les filtres » (ce n'est pas l'état vide).
  - Étape 3 : la liste complète revient.
- **Gravité si échec** : Majeur

### GL-02-002 — Structure de l'assistant « Nouveau bail »

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-001 vu.
- **Données** : aucune.
- **Étapes** :
  1. Cliquer sur « Nouveau bail » (ou « Créer un bail »). L'adresse est `/tenant/<idA>/rental/leases/new`.
  2. Observer la page, sans rien saisir, puis ouvrir la liste « Propriété ».
- **Attendu** :
  - Titre « Nouveau bail », sous-titre « Créez un nouveau bail de location », bouton « Annuler » en haut à droite.
  - Un rail à cinq étapes : « Informations générales », « Parties impliquées », « Informations financières »,
    « Pénalités », « Notes ». « Précédent » est désactivé ; « Suivant » est désactivé tant que l'étape n'est pas valide.
  - La liste « Propriété » (placeholder « Sélectionner une propriété ») propose, avec les biens libres du seed, P1 à P10
    et P12 à P14 ; elle ne propose ni P11 (vente seule), ni les biens « Loué » ou « Vendu », ni PB (autre agence).
    Un bien de client s'affiche « REC-GL-Chantal DIALLO - REC-GL Appartement A1 », un bien de l'agence s'affiche par son
    titre seul.
  - Champ « Propriété » recherchable : en tapant `REC-GL Appartement A3`, seul P3 reste.
- **Gravité si échec** : Majeur

### GL-02-003 — Création refusée à un collaborateur sans droit

- **Rôle** : LECTEUR_A
- **Préconditions** : LECTEUR_A a le droit de voir les baux (menu « Baux » visible) mais pas de créer.
- **Données** : bail valide quelconque sur P5 (voir GL-02-004 pour la méthode).
- **Étapes** :
  1. Ouvrir la liste des baux : elle s'affiche.
  2. Cliquer « Nouveau bail », remplir les cinq étapes, cliquer « Créer le bail ».
  3. Regarder l'écran ET l'onglet réseau.
- **Attendu** :
  - La requête `POST …/rental/leases` répond 403 « Vous n'avez pas les droits nécessaires pour effectuer cette
    action. ». Aucun bail n'est créé (P5 reste « Disponible »).
  - Constat à noter : le bouton « Nouveau bail » est visible malgré l'absence de droit (le code ne le masque pas) ; le
    message d'erreur n'est affiché que sur la première étape (voir GL-02-036) : sur la dernière étape, rien ne s'affiche
    — écart probable, gravité Majeur.
- **Gravité si échec** : Majeur (Bloquant si le bail est créé)

## B. Création d'un bail : cas nominal et variantes

### GL-02-004 — Créer le bail nominal L1 (assistant complet)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-057 validé ; P1 « Disponible ».
- **Données** : voir tableau L1. Propriété `REC-GL-Chantal DIALLO - REC-GL Appartement A1` ; début `2026-08-01` ; fin
  `2027-07-31` ; emménagement `2026-08-01` ; locataire `REC-GL-Aminata KONE (rec-gl-aminata@…)` ; propriétaire
  préselectionné C3 ; devise FCFA ; Mensuel ; jour d'échéance 5 ; loyer 150 000 ; charges 10 000 ; dépôt 300 000 ;
  jours de grâce 5 ; mode « Pourcentage du solde » ; taux 2 ; montant maximum 20 000 ; notes `REC-GL bail nominal`.
- **Étapes** :
  1. `/tenant/<idA>/rental/leases/new`. Étape « Informations générales » : choisir le bien, saisir les dates ; « Suivant ».
  2. « Parties impliquées » : choisir le locataire ; vérifier le propriétaire ; « Suivant ».
  3. « Informations financières » : régler les champs (le loyer est prérempli à 150 000, les charges et le dépôt sont à 0
     et se saisissent) ; « Suivant ».
  4. « Pénalités » : jours de grâce, mode, taux, plafond ; « Suivant ».
  5. « Notes » : saisir la note ; cliquer sur « Créer le bail ».
- **Attendu** :
  - Retour automatique sur la liste ; aucun message de succès (constat). Sous-titre « 41 baux en gestion » (`N0 + 1`).
  - Ligne (première, tri décroissant) : numéro `BAIL-AAAA-0001` (= plus grand numéro + 1) avec « REC-GL Appartement
    A1 » dessous ; locataire « REC-GL-Aminata KONE » ;
    période « 01/08/2026 → 31/07/2027 » ; montant « 150 000 FCFA » ; statut « Actif ».
  - Réseau : `POST /api/tenants/<idA>/rental/leases` répond 201 ; le corps envoyé porte `primaryRenterContactId`,
    `ownerContactId`, `startDate` `2026-08-01T00:00:00.000Z`, `billingFrequency` `MONTHLY`, `dueDayOfMonth` 5,
    `rentAmount` 150000, `serviceChargeAmount` 10000, `securityDepositAmount` 300000, `penaltyGraceDays` 5,
    `penaltyMode` `PERCENT_OF_BALANCE`, `penaltyRate` 2, `penaltyCapAmount` 20000.
- **Gravité si échec** : Bloquant

### GL-02-005 — Fiche du bail L1 : toutes les informations

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-004 fait.
- **Données** : aucune.
- **Étapes** : dans la liste, cliquer « Voir » sur `BAIL-AAAA-0001` (`/tenant/<idA>/rental/leases/<leaseId>`).
- **Attendu** :
  - Titre « Bail BAIL-AAAA-0001 », sous-titre « Détails du bail de location », bouton « Retour », liste de statut
    (« Actif ») et bouton « Modifier ».
  - Carte « Informations générales » : numéro, statut « Actif », propriété (`référence - REC-GL Appartement A1 -
adresse`), « Locataire principal » = lien `REC-GL-Aminata KONE`, « Propriétaire » = lien `REC-GL-Chantal DIALLO`.
  - Carte « Dates » : début 01/08/2026 ; fin 31/07/2027 ; emménagement 01/08/2026 ; déménagement « - ».
  - Carte « Financier » : Loyer 150 000 (F CFA) ; Charges de service 10 000 ; Dépôt de garantie 300 000 ;
    « Mensuel » ; « Le 5 de chaque mois ».
  - Carte « Honoraires et gestionnaire » (voir GL-02-089).
  - Carte « Pénalités de retard » : « 5 jours » + « Les pénalités seront appliquées après 5 jours de retard » ; « Mode
    de pénalité » = « Pourcentage du solde » ; « Taux de pénalité » = « 2.00% » + « Appliqué sur le solde impayé » ;
    « Montant maximum de pénalité » = 20 000 + « La pénalité ne dépassera pas ce montant ».
  - Carte « Notes » : `REC-GL bail nominal`.
  - Neuf onglets : « Échéances », « Paiements », « Pénalités », « Dépôt de garantie », « Vie du bail », « États des
    lieux », « Signatures », « Prélèvements », « Documents » ; l'onglet « Échéances » est actif.
- **Gravité si échec** : Majeur

### GL-02-006 — Conséquence sur le bien : « Loué » et plus proposé

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-004 fait.
- **Données** : aucune.
- **Étapes** :
  1. Ouvrir la fiche de P1 (`/tenant/<idA>/properties`, ligne `REC-GL Appartement A1`).
  2. Ouvrir « Nouveau bail » et la liste « Propriété ».
- **Attendu** : le bien P1 est « Loué » ; il n'est plus proposé dans l'assistant (les biens « Loué » et « Vendu » en sont
  exclus). Le tableau des autres biens ne change pas.
- **Gravité si échec** : Majeur

### GL-02-007 — Créer L2 : trimestriel, sans charges ni dépôt

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-004 fait.
- **Données** : voir tableau L2. Bien P2 ; locataire C2 `REC-GL-Bakary TRAORE` ; début `2027-01-15`, fin `2027-12-31` ;
  « Trimestriel » ; jour 15 ; loyer **360 000** (le champ est prérempli à 120 000 : le montant à saisir est celui de la
  période, rien n'est multiplié automatiquement) ; charges et dépôt laissés à 0 ; pénalités par défaut.
- **Étapes** : assistant comme GL-02-004. Ensuite, onglet « Échéances » du nouveau bail › « Générer les échéances ».
  Puis onglet « Dépôt de garantie ».
- **Attendu** :
  - Bail créé (numéro suivant), statut « Actif ».
  - Échéances générées : 4, aux dates d'échéance 15/01/2027, 15/04/2027, 15/07/2027, 15/10/2027, de 360 000 chacune.
  - Onglet « Dépôt de garantie » : « Aucun dépôt de garantie configuré pour ce bail » et aucun bouton « Nouveau
    mouvement » (dépôt à 0) ; la requête `GET …/deposit` répond 404 (attendu dans ce cas).
  - Fiche : « Charges de service » 0 ; le « Dépôt de garantie » 0.
- **Gravité si échec** : Majeur

### GL-02-008 — Générer les échéances de L1 (conséquence en aval)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-004 fait.
- **Données** : aucune.
- **Étapes** : fiche de L1 › onglet « Échéances » (vide) › bouton « Générer les échéances ». **Ne pas** cliquer sur
  « Recalculer les statuts et pénalités » (ce bouton calcule aussi les pénalités de retard et fausserait les montants
  des fichiers 02 et 03).
- **Attendu** :
  - Message « Échéances générées. » ; 12 échéances, périodes 08/2026 à 07/2027, dates d'échéance 05/08/2026,
    05/09/2026, 05/10/2026, 05/11/2026, … , 05/07/2027 ; « Montant dû » 160 000 chacune (150 000 + 10 000).
  - Les échéances dont la date est passée (août, septembre, octobre 2026) apparaissent « En retard » ; les suivantes
    « Brouillon » ou « À échoir » selon la date du jour.
  - Réseau : `POST …/leases/<leaseId>/installments` répond 201.
- **Gravité si échec** : Bloquant (un bail doit produire ses échéances)

### GL-02-009 — Créer L3 : semestriel, locataire déjà client

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-004 fait (C1 est déjà client de l'agence).
- **Données** : voir tableau L3. Bien P3 ; locataire C1 ; propriétaire C4 (prérempli) ; début `2027-01-01`, fin
  `2027-12-31` ; « Semestriel » ; jour 1 ; loyer 1 200 000 ; charges 0 ; dépôt 400 000.
- **Étapes** : assistant ; puis « Générer les échéances » dans l'onglet « Échéances ».
- **Attendu** :
  - Bail créé. 2 échéances : période 01/2027 échue le 01/01/2027 et période 07/2027 échue le 01/07/2027, de
    1 200 000 chacune.
  - C1 ne reçoit **pas** de second e-mail de création de compte (compte existant) — voir GL-02-023.
- **Gravité si échec** : Majeur

### GL-02-010 — Créer L4 : annuel, bien de l'agence (sans propriétaire)

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : voir tableau L4. Bien P4 ; locataire C2 ; propriétaire : aucun (vide) ; début `2027-03-01`, fin
  `2028-02-29` ; « Annuel » ; jour 10 ; loyer 1 080 000 ; dépôt 90 000.
- **Étapes** : assistant (le champ « Propriétaire » reste vide ; son texte indicatif est « Sélectionner un propriétaire
  (optionnel) ») ; « Générer les échéances ».
- **Attendu** :
  - Bail créé ; fiche : « Propriétaire » = « Non renseigné » (texte grisé).
  - 1 échéance : période 03/2027, échue le 10/03/2027, de 1 080 000.
  - Pas d'envoi d'e-mail « Bail activé » au propriétaire (il n'y en a pas).
- **Gravité si échec** : Majeur

### GL-02-011 — Créer L5 : jour d'échéance 31

- **Rôle** : ADMIN_A
- **Préconditions** : P6 « Disponible » (bien meublé).
- **Données** : voir tableau L5. Bien P6 ; locataire C2 ; propriétaire C3 ; début `2027-01-01`, fin `2027-06-30` ;
  « Mensuel » ; jour **31** ; loyer 400 000 ; charges 0 ; dépôt 800 000.
- **Étapes** : assistant ; « Générer les échéances ».
- **Attendu** : 6 échéances aux dates 31/01/2027, 28/02/2027, 31/03/2027, 30/04/2027, 31/05/2027, 30/06/2027 (repli sur
  le dernier jour des mois courts), de 400 000 chacune. Fiche : « Le 31 de chaque mois ».
- **Gravité si échec** : Majeur

### GL-02-012 — Créer L6 : jour d'échéance 29, société locataire, bien commercial

- **Rôle** : ADMIN_A
- **Préconditions** : P7 « Disponible ».
- **Données** : voir tableau L6. Bien P7 ; locataire `REC-GL SARL IMMO-TEST (rec-gl-sarl@…)` ; propriétaire C4 ; début
  `2027-12-01`, fin `2028-03-31` ; jour **29** ; loyer 500 000 ; dépôt 500 000.
- **Étapes** : assistant ; « Générer les échéances ».
- **Attendu** :
  - Dans la liste, la colonne « Locataire » affiche `REC-GL SARL IMMO-TEST` (raison sociale).
  - 4 échéances : 29/12/2027, 29/01/2028, **29/02/2028** (2028 est bissextile), 29/03/2028, de 500 000 chacune.
- **Gravité si échec** : Majeur

### GL-02-013 — Créer L7 : jour 30, propriétaire choisi à la main, pénalité à montant fixe

- **Rôle** : ADMIN_A
- **Préconditions** : P8 « Disponible » (bien de l'agence).
- **Données** : voir tableau L7. Bien P8 ; locataire C2 ; propriétaire **C4** choisi dans la liste (le bien n'a pas de
  propriétaire) ; début `2027-01-01`, fin `2027-04-30` ; jour **30** ; loyer 80 000 ; dépôt 80 000 ; jours de grâce
  3 ; mode « Montant fixe » ; « Montant fixe de pénalité » 5 000.
- **Étapes** : assistant ; à l'étape « Pénalités », choisir « Montant fixe » : les champs « Taux de pénalité (%) » et
  « Montant maximum de pénalité (optionnel) » disparaissent, « Montant fixe de pénalité » apparaît. « Générer les
  échéances ».
- **Attendu** :
  - Fiche : « Mode de pénalité » = « Montant fixe » ; « Montant fixe de pénalité » 5 000 + « Montant fixe appliqué par
    période de retard » ; « Jours de grâce » = « 3 jours ».
  - Propriétaire de la fiche = C4 (même si le bien n'en a pas).
  - 4 échéances : 30/01/2027, 28/02/2027, 30/03/2027, 30/04/2027.
- **Gravité si échec** : Majeur

### GL-02-014 — Créer L8 : sans date de fin

- **Rôle** : ADMIN_A
- **Préconditions** : P9 « Disponible ».
- **Données** : voir tableau L8. Bien P9 ; locataire C1 ; début `2027-01-01` ; date de fin laissée vide ; jour 5 ; loyer
  75 000 ; dépôt 0.
- **Étapes** : assistant ; « Générer les échéances ».
- **Attendu** :
  - Liste : période « 01/01/2027 → — ». Fiche : date de fin « - ».
  - Génération limitée à 12 mois : 12 échéances de 01/2027 à 12/2027. Si une 13e échéance (01/2028) apparaît,
    l'anomalie est à signaler (Mineur : la règle annoncée est « 12 mois par défaut »).
  - Dans « Vie du bail », le bouton « Renouveler » reste actif mais sera refusé (voir fichier 03).
- **Gravité si échec** : Majeur

### GL-02-015 — Créer L9 : devise euro et première échéance après le début

- **Rôle** : ADMIN_A
- **Préconditions** : P10 « Disponible ».
- **Données** : voir tableau L9. Bien P10 ; locataire C1 ; début `2027-02-10`, fin `2027-07-09` ; devise **EUR** ; jour
  5 ; loyer 450.
- **Étapes** :
  1. Dans l'étape « Informations financières », ouvrir la liste « Devise » : trois choix FCFA, EUR, USD. Choisir EUR.
  2. Terminer l'assistant ; « Générer les échéances ».
- **Attendu** :
  - Liste : montant « 450 EUR ». Fiche : loyer affiché en euros (« 450,00 € » ou équivalent).
  - 6 échéances (périodes 02/2027 à 07/2027) de 450 EUR. La première (période 02/2027) est échue le **05/03/2027** : le
    5 février précède le début du bail (10/02), la première échéance passe donc au mois suivant. La deuxième (période
    03/2027) est aussi échue le 05/03/2027.
- **Gravité si échec** : Majeur

### GL-02-016 — Créer L10 : taux de pénalité inférieur à 1 %

- **Rôle** : ADMIN_A
- **Préconditions** : P12 « Disponible ».
- **Données** : voir tableau L10. Bien P12 ; locataire C2 ; début `2027-01-01`, fin `2027-12-31` ; loyer 70 000 ; mode
  « Pourcentage du solde » ; taux **0,5** ; plafond vide ; jours de grâce 0.
- **Étapes** : assistant ; lire la carte « Pénalités de retard » de la fiche.
- **Attendu** : « Taux de pénalité » = **0.50%**. Écart probable : l'écran affiche « 50.00% » (la fonction d'affichage
  traite toute valeur inférieure à 1 comme une fraction et la multiplie par 100). Le montant d'une pénalité réelle se
  calcule avec 0,5 % (voir fichier « Encaissement »). Gravité de l'écart : Majeur (information fausse).
- **Gravité si échec** : Majeur

### GL-02-017 — Notes longues et caractères spéciaux

- **Rôle** : ADMIN_A
- **Préconditions** : P13 « Disponible ». Le bail créé ici est le bail **LT** du fichier 03 : le conserver.
- **Données** : bail P13 ; locataire C1 ; début `2026-08-01`, fin `2027-07-31` ; loyer 150 000 ; charges 10 000 ; dépôt
  300 000 ; jour 5 ; notes sur trois lignes : `Clés remises le 01/08 — état « très bon ».`, ligne vide,
  `Loyer payable à l'agence (é è à ç ô œ) – 150 000 FCFA`, puis ajouter 4 000 caractères de `x`.
- **Étapes** : assistant ; dans l'étape « Notes » saisir le texte ; créer ; ouvrir la fiche.
- **Attendu** : la carte « Notes » restitue les sauts de ligne et les accents ; le texte long est enregistré entier (pas
  de coupure) ; la page reste utilisable.
- **Gravité si échec** : Mineur

### GL-02-018 — Dates d'emménagement et de déménagement incohérentes

- **Rôle** : ADMIN_A
- **Préconditions** : P5 « Disponible ».
- **Données** : bail LS : bien P5 ; locataire C6 ; propriétaire C3 ; début `2027-02-01`, fin `2027-07-31` ; emménagement
  `2027-03-01` ; déménagement `2027-02-01` (avant l'emménagement et avant le début) ; loyer 60 000 ; jour 5.
- **Étapes** : assistant complet ; ouvrir la fiche.
- **Attendu** : les dates de déménagement et d'emménagement sont facultatives (L2, L3… n'en ont pas). Ici, aucune
  règle ne compare ces deux dates : le bail est créé, la fiche affiche « Date d'emménagement 01/03/2027 » et « Date de
  déménagement 01/02/2027 ». Écart à signaler : une date de déménagement antérieure à l'emménagement devrait être
  refusée (Mineur). Ce bail LS sert aux cas de statut et de suppression.
- **Gravité si échec** : Mineur

### GL-02-019 — Le propriétaire prérempli peut être effacé

- **Rôle** : ADMIN_A
- **Préconditions** : P13 est déjà loué ; utiliser P14 « Disponible ».
- **Données** : bien P14.
- **Étapes** :
  1. Nouveau bail › choisir P14 (propriétaire C3) › « Suivant » › observer le champ « Propriétaire ».
  2. Cliquer sur la croix du champ « Propriétaire » (effacer).
  3. Cliquer « Annuler » (aucune création).
- **Attendu** : le propriétaire de P14 est prérempli (`REC-GL-Chantal DIALLO`) puisque l'e-mail du propriétaire du bien
  correspond à un contact ; la croix efface le champ (« Sélectionner un propriétaire (optionnel) ») ; l'annulation
  ramène à la liste sans bail créé ; P14 reste « Disponible ».
- **Gravité si échec** : Mineur

### GL-02-020 — Valeurs saisies à la main non écrasées par les préremplissages

- **Rôle** : ADMIN_A
- **Préconditions** : P14 « Disponible ». Cas à jouer sans créer de bail.
- **Données** : bien P14 (loyer 150 000, charges 10 000, dépôt 300 000, propriétaire C3).
- **Étapes** :
  1. Choisir P14 : le loyer se préremplit à 150 000 (prix du bien) et la devise à celle du bien.
  2. À l'étape 2, effacer le propriétaire ; à l'étape 3, modifier le loyer à 155 000.
  3. Revenir à l'étape 1, rouvrir la liste « Propriété » et choisir de nouveau P14 ; refaire « Suivant » jusqu'à
     l'étape 3.
  4. Cliquer « Annuler ».
- **Attendu** : le loyer saisi à la main (155 000) n'est pas remplacé par le prix du bien et le propriétaire effacé à la
  main n'est pas rempli de nouveau ; les charges (10 000) et le dépôt (300 000) du bien ne sont **pas** repris : ils
  restent à 0 à l'étape 3 (constat). Aucun bail créé ; P14 reste « Disponible ».
- **Gravité si échec** : Mineur

### GL-02-021 — Changer de mode de pénalité dans l'assistant

- **Rôle** : ADMIN_A
- **Préconditions** : assistant ouvert, étape « Pénalités ».
- **Données** : taux 3 et plafond 30 000 saisis, puis changement de mode.
- **Étapes** : choisir « Montant fixe », saisir 7 000, revenir à « Pourcentage du solde ».
- **Attendu** : seules deux options existent (« Pourcentage du solde », « Montant fixe ») ; l'option « Pourcentage du
  loyer », pourtant gérée par le serveur, n'est pas proposée dans l'assistant (constat, voir rapport) ; en revenant au
  pourcentage, taux et plafond saisis sont retrouvés.
- **Gravité si échec** : Cosmétique

### GL-02-022 — Fichier réservé : le numéro de bail n'est pas saisissable

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : aucune.
- **Étapes** : parcourir les cinq étapes et chercher un champ « Numéro de bail ».
- **Attendu** : il n'existe aucun champ de numéro dans l'assistant : le numéro est toujours attribué par le système
  (`BAIL-AAAA-NNNN`). La saisie d'un numéro fourni (API : `leaseNumber`) n'est pas testable en interface ; voir la
  section Couverture.
- **Gravité si échec** : Cosmétique

### GL-02-023 — Aucun nouveau compte pour un locataire déjà client

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-009 fait (L3 pour C1).
- **Données** : messages `.eml` du puits SMTP adressés à C1 et C4 ; Journal des notifications de l'agence
  (`/tenant/<idA>/notifications-journal`).
- **Étapes** : chercher les messages envoyés à C1 et à C4 à la création de L3.
- **Attendu** : C1 et C4 reçoivent seulement « Votre bail BAIL-AAAA-0003 est activé — <agence> » (si la notification est
  activée, GL-01-056) ; **aucun** e-mail de création de compte pour C1.
- **Gravité si échec** : Mineur

### GL-02-024 — Le sélecteur de locataire propose tous les contacts

- **Rôle** : ADMIN_A
- **Préconditions** : C6 existe sans rôle (GL-01-006).
- **Données** : aucune.
- **Étapes** : assistant › étape « Parties impliquées » › ouvrir « Locataire principal » ; taper `Fatou` puis `Chantal`.
- **Attendu** : C6 (`REC-GL-Fatou BAMBA`, sans rôle) et C3 (propriétaire) sont proposés comme locataire : la liste n'est
  filtrée par aucun rôle ; chaque contact s'affiche « Nom (e-mail) ». Aucun contact de l'agence B. Constat : un
  propriétaire peut être choisi comme locataire de son propre bien sans avertissement.
- **Gravité si échec** : Mineur

### GL-02-025 — Compte et messages créés avec le premier bail

- **Rôle** : ADMIN_A, puis LOCATAIRE_PORTAIL
- **Préconditions** : GL-02-004 fait ; C1 n'avait pas de compte avant L1.
- **Données** : messages `.eml` du puits SMTP adressés à `rec-gl-aminata@packs.immotopia.test` (C1) et à C3.
- **Étapes** :
  1. Dans le puits SMTP, ouvrir le message de création de compte de C1 (lien de définition du mot de passe, valable
     7 jours) et celui d'activation « Votre bail BAIL-AAAA-0001 est activé — <agence> ».
  2. Suivre le lien, définir un mot de passe, se connecter.
  3. Ouvrir `/tenant/lease`.
- **Attendu** :
  - C1 reçoit deux messages (création de compte, bail activé avec le lien de connexion qui est le lien de
    réinitialisation du mot de passe). C3 reçoit « bail activé » seulement.
  - Étape 3 : le portail locataire affiche le bail BAIL-AAAA-0001, le bien, les dates et les montants du bail (sans
    chemin de fichier).
  - Le Journal des notifications de l'agence (`/tenant/<idA>/notifications-journal`) recense aussi ces envois.
- **Gravité si échec** : Majeur

### GL-02-026 — Bail sur un bien en vente seule (L11)

- **Rôle** : ADMIN_A
- **Préconditions** : P11 « Disponible » (opération Vente).
- **Données** : bien P11 ; locataire C6 ; début `2026-11-10` ; pas de fin.
- **Étapes** :
  1. Ouvrir la fiche de P11, menu d'actions › « Générer un contrat de bail ».
  2. Observer l'assistant (le bien arrive prérempli), puis le champ « Propriété ».
  3. Étape 2 : choisir C6. Terminer.
- **Attendu** :
  - L'assistant ne compte que trois étapes : « Informations générales », « Parties impliquées », « Notes » (pas de
    finances ni de pénalités).
  - Constat : P11 n'est pas dans la liste « Propriété » du « Nouveau bail » (GL-02-002) ; arrivé par la fiche, le champ
    affiche l'identifiant brut du bien au lieu de son titre — anomalie d'affichage probable (Mineur).
  - Création : liste → ligne avec montant **25 000 000** (le prix du bien, pas un loyer), statut « Actif ». Fiche : seul
    l'onglet « Documents » existe ; aucune carte « Financier », « Honoraires » ni « Pénalités ».
  - Le bien P11 passe à « Vendu » (une création de bail sur un bien en vente seule le marque vendu ; si la transition de
    statut n'est pas permise, le bien reste « Disponible » — noter ce qui est observé).
- **Gravité si échec** : Majeur

### GL-02-027 — Numérotation séquentielle

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs baux créés (L1 à L10, LS, L11, LT).
- **Données** : aucune.
- **Étapes** : lire, dans l'ordre de création, les numéros des baux de la recette (liste triée du plus grand au plus
  petit).
- **Attendu** : numéros consécutifs dans l'ordre de création (L1 = dernier numéro du seed + 1, puis +1 à chaque bail),
  sans trou ni doublon ; chaque nouveau bail prend le plus grand numéro de l'année + 1 (règle « plus grand numéro
  existant + 1 », vérifiée après suppression en GL-02-081). L'agence B a sa propre séquence (LB prend le numéro
  suivant de la séquence de B).
- **Gravité si échec** : Majeur

## C. Validations de la création

### GL-02-028 — Première étape : champs requis

- **Rôle** : ADMIN_A
- **Préconditions** : assistant ouvert, rien saisi.
- **Données** : aucune.
- **Étapes** :
  1. Observer « Suivant ». Cliquer sur l'étape « Informations financières » du rail.
  2. Choisir un bien, ne pas saisir de date de début ; cliquer sur l'étape 2 du rail.
- **Attendu** : « Suivant » est désactivé ; le rail marque l'étape comme invalide ; au clic sur une étape suivante,
  les messages « La propriété est requise » et « La date de début est requise » apparaissent sous les champs et on
  reste à l'étape 1. Rien n'est envoyé au serveur.
- **Gravité si échec** : Mineur

### GL-02-029 — Date de fin avant ou égale à la date de début

- **Rôle** : ADMIN_A
- **Préconditions** : assistant ouvert.
- **Données** : début `2027-03-01` ; fin `2027-02-01`, puis `2027-03-01`.
- **Étapes** : saisir les dates ; essayer de passer à l'étape suivante.
- **Attendu** :
  - Le sélecteur de la date de fin grise les jours antérieurs à la date de début (impossible de choisir `2027-02-01`
    au clic).
  - Si on saisit la date au clavier (ou si on fixe la fin égale au début) : message « La date de fin doit être après la
    date de début » et blocage de l'étape.
  - Une date de fin sans date de début : le message de la date de début s'affiche en premier.
- **Gravité si échec** : Majeur

### GL-02-030 — Locataire principal requis

- **Rôle** : ADMIN_A
- **Préconditions** : étape 1 valide.
- **Données** : aucun locataire choisi.
- **Étapes** : étape 2 : cliquer « Suivant » (désactivé), cliquer sur l'étape 3 du rail.
- **Attendu** : message « Le locataire principal est requis » ; impossible d'avancer ; le champ « Propriétaire » est
  facultatif.
- **Gravité si échec** : Mineur

### GL-02-031 — Loyer vide, nul ou négatif

- **Rôle** : ADMIN_A
- **Préconditions** : étapes 1 et 2 valides.
- **Données** : loyer vidé, `0`, `-5000`, `abc`.
- **Étapes** : à l'étape 3, tester chaque valeur ; essayer « Suivant ».
- **Attendu** : message « Le montant du loyer doit être supérieur à 0 » ; « Suivant » désactivé ; les lettres ne sont
  pas acceptées. Aucun envoi au serveur. Pour un bien en « vente seule » (GL-02-026), cette étape n'existe pas.
- **Gravité si échec** : Majeur

### GL-02-032 — Loyer très élevé

- **Rôle** : ADMIN_A
- **Préconditions** : assistant jusqu'à l'étape « Notes » ; bien libre P14 (le bail éventuellement créé sera supprimé
  aussitôt par « ⋮ › Supprimer », voir GL-02-077).
- **Données** : loyer `9 999 999 999` puis `99 999 999 999`.
- **Étapes** : saisir chaque montant ; cliquer « Créer le bail » (revenir à l'étape 1 si une erreur y apparaît).
- **Attendu** :
  - `9 999 999 999` : accepté (limite haute des montants à 10 chiffres) ; le bail est créé (le supprimer ensuite).
  - `99 999 999 999` : refus clair, sans bail créé ; une réponse 500 générique ou un écran sans message est une
    anomalie (aucune limite n'est contrôlée par l'écran avant l'envoi).
- **Gravité si échec** : Majeur

### GL-02-033 — Jour d'échéance hors limites

- **Rôle** : ADMIN_A
- **Préconditions** : étape 3.
- **Données** : `0`, `32`, `-3`, `5,5`, champ vidé.
- **Étapes** : saisir chaque valeur et sortir du champ.
- **Attendu** : le champ est borné entre 1 et 31 (`0` et `-3` deviennent 1, `32` devient 31, champ vidé = 1) ; message
  « Le jour d'échéance doit être entre 1 et 31 » si une valeur hors limites subsiste ; `5,5` est arrondi par l'envoi à 5.
- **Gravité si échec** : Mineur

### GL-02-034 — Charges et dépôt négatifs

- **Rôle** : ADMIN_A
- **Préconditions** : assistant jusqu'à la fin avec tous les champs valides.
- **Données** : charges `-10000` ; puis dépôt `-100`.
- **Étapes** : saisir la valeur négative à l'étape 3 ; cliquer « Créer le bail » à l'étape 5.
- **Attendu** : aucun bail créé ; la requête répond 400 avec « Les données fournies sont invalides. (… : … ) ».
  Vérifier que le message est visible (voir GL-02-036). Une valeur négative acceptée sans erreur est une anomalie
  Majeur.
- **Gravité si échec** : Majeur

### GL-02-035 — Valeurs de pénalités inhabituelles

- **Rôle** : ADMIN_A
- **Préconditions** : assistant à l'étape 4.
- **Données** : jours de grâce `-1`, `2,5`, `400` ; taux `-1`, `150`, `0,0001`.
- **Étapes** : saisir chaque valeur ; terminer la création sur P14 (supprimer ensuite le bail créé, GL-02-077).
- **Attendu** :
  - Jours de grâce : borné à 0 minimum ; `2,5` envoyé comme 2 ; `400` accepté.
  - Taux : minimum 0 ; `150` est accepté sans plafond de 100 % (constat : à discuter avec le métier) ; `0,0001` est
    arrondi à 4 décimales côté base.
  - Aucune erreur 500.
- **Gravité si échec** : Mineur

### GL-02-036 — Une erreur du serveur est-elle visible depuis la dernière étape ?

- **Rôle** : ADMIN_A
- **Préconditions** : assistant rempli sur un bien libre, dépôt `-100` (valeur refusée par le serveur).
- **Données** : celles du cas GL-02-034.
- **Étapes** :
  1. Aller jusqu'à l'étape « Notes » ; cliquer « Créer le bail » ; ne pas changer d'étape.
  2. Observer l'écran.
  3. Revenir à l'étape « Informations générales » avec le rail.
- **Attendu** : une erreur visible expliquant le refus doit s'afficher immédiatement. Écart probable : à l'étape « Notes »
  rien ne s'affiche (le bouton cesse de tourner) ; le bandeau « Erreur » n'apparaît qu'à l'étape 1 — le testeur croit
  que rien ne s'est passé. À signaler en Majeur.
- **Gravité si échec** : Majeur

### GL-02-037 — Double clic sur « Créer le bail »

- **Rôle** : ADMIN_A
- **Préconditions** : assistant complet sur P14 (bail supprimé ensuite si créé, GL-02-077).
- **Données** : valeurs valides (loyer 150 000, jour 5, début `2026-08-01`, locataire C1).
- **Étapes** : double-cliquer vivement sur « Créer le bail ».
- **Attendu** : un seul bail est créé (une seule requête `POST` visible) ; la liste contient un seul nouveau numéro. Deux
  baux pour le même bien = anomalie Majeur (supprimer le doublon ensuite).
- **Gravité si échec** : Majeur

### GL-02-038 — Annuler, rechargement et retour arrière dans l'assistant

- **Rôle** : ADMIN_A
- **Préconditions** : assistant ouvert avec des valeurs saisies.
- **Données** : bien et dates saisis à l'étape 1.
- **Étapes** :
  1. Cliquer sur « Annuler » (en haut).
  2. Rouvrir l'assistant, saisir le bien et les dates, recharger (F5).
  3. Après un bail créé, utiliser le bouton Précédent du navigateur.
- **Attendu** :
  - Étape 1 : retour à la liste sans confirmation ; rien n'est créé.
  - Étape 2 : après F5 l'assistant repart à vide, étape 1 (aucun brouillon conservé).
  - Étape 3 : le navigateur ramène à un assistant vide ; aucun doublon ni bail modifié ; en envoyant de nouveau le
    formulaire, un nouveau bail serait créé (comportement normal).
- **Gravité si échec** : Mineur

### GL-02-039 — Bien déjà loué

- **Rôle** : ADMIN_A
- **Préconditions** : P1 « Loué » par L1.
- **Données** : bien P1.
- **Étapes** :
  1. Ouvrir « Nouveau bail » et chercher P1 dans la liste.
  2. Ouvrir la fiche de P1 › « Générer un contrat de bail » › compléter l'assistant avec C2, loyer 150 000, début
     `2027-09-01`.
- **Attendu** :
  - Étape 1 : P1 n'est pas proposé.
  - Étape 2 : le bien arrive prérempli (champ affichant l'identifiant brut). Le serveur ne refuse pas de second bail sur
    un bien déjà loué : un second bail « Actif » est créé et P1 reste « Loué ». Écart à signaler en Majeur (aucune
    protection contre deux baux simultanés), puis **supprimer ce second bail** (« ⋮ › Supprimer ») avant la suite.
- **Gravité si échec** : Majeur

### GL-02-040 — Navigation par le rail et boutons Précédent / Suivant

- **Rôle** : ADMIN_A
- **Préconditions** : assistant ouvert, bien, dates, locataire saisis.
- **Données** : aucune.
- **Étapes** : cliquer « Suivant » jusqu'à l'étape 5, « Précédent » deux fois, cliquer sur l'étape 4 du rail, puis sur
  l'étape 1.
- **Attendu** : les valeurs saisies sont conservées d'une étape à l'autre ; « Créer le bail » n'apparaît qu'à la
  dernière étape ; le rail indique l'étape courante ; une étape invalide est signalée.
- **Gravité si échec** : Mineur

## D. Liste des baux

### GL-02-041 — Colonnes et compteur de la liste

- **Rôle** : ADMIN_A
- **Préconditions** : L1 à L10, LS, L11, LT créés.
- **Données** : aucune.
- **Étapes** : ouvrir la liste.
- **Attendu** :
  - Sous-titre « 53 baux en gestion » (`N0 + 13` ; 40 + les 13 baux de la recette, en tenant compte des baux supprimés
    entre-temps).
  - Colonnes : « Bail » (numéro et bien), « Locataire », « Période », « Montant », « Statut », « Actions » (« Voir » et
    menu « ⋮ » avec « Modifier le bail » et « Supprimer »).
  - Pied de tableau : « Tous les montants sont en FCFA. » ; les montants en euro (L9) portent leur devise.
  - Tri : du numéro le plus grand au plus petit (les 13 baux de la recette sont en tête, si l'année est la même).
  - Barre de pagination « 1–20 sur 53 » avec choix du nombre de lignes par page.
- **Gravité si échec** : Majeur

### GL-02-042 — Recherche par numéro de bail

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs baux.
- **Données** : numéro complet de L3 (ex. `BAIL-2026-0043`), le même en minuscules, `bail-`, `ZZZZ`, `REC-GL` (nom du
  bien), une espace seule.
- **Étapes** : saisir chaque terme dans « Rechercher par numéro de bail ».
- **Attendu** :
  - Attendre 250 ms après la frappe : la liste se filtre (une seule requête par saisie), l'adresse porte `?q=…`.
  - Numéro complet de L3 → seulement L3 ; sa version en minuscules donne le même résultat (insensible à la casse) ;
    `bail-` → tous les baux ; `ZZZZ` → « Aucun résultat » avec « Effacer les filtres ».
  - La recherche ne porte **que** sur le numéro : `REC-GL` (nom du bien) ne ramène aucun bail (constat).
  - La croix du champ efface la recherche et recharge toute la liste.
- **Gravité si échec** : Majeur

### GL-02-043 — Filtre par statut

- **Rôle** : ADMIN_A
- **Préconditions** : au moins un bail « Actif ». Les autres statuts s'obtiennent après GL-02-066 et suivants (rejouer
  ce cas ensuite).
- **Données** : « Actif », puis « Suspendu », « Terminé », « Annulé », « Brouillon ».
- **Étapes** : choisir chaque statut dans « Statut ».
- **Attendu** : la liste est limitée au statut choisi (adresse `?status=ACTIVE`) ; « Brouillon » ne ramène rien (un bail
  n'est jamais créé en brouillon) ; le message « Aucun résultat » avec « Effacer les filtres » apparaît quand rien ne
  correspond ; le compteur « Filtres » reflète les filtres posés.
- **Gravité si échec** : Majeur

### GL-02-044 — Filtre par locataire

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs locataires ont un bail.
- **Données** : `REC-GL-Aminata KONE` (C1), puis `REC-GL SARL IMMO-TEST`.
- **Étapes** : ouvrir « Locataire » (liste recherchable) et choisir C1 ; puis C5 ; puis effacer.
- **Attendu** : la liste n'affiche que les baux de ce locataire (L1, L3, L8, L9 et LT pour C1) ; les options du filtre
  restent toutes proposées même quand un filtre est posé ; seuls les locataires ayant un bail sont proposés.
- **Gravité si échec** : Majeur

### GL-02-045 — Combinaison de filtres, rechargement, retour arrière

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-042 à GL-02-044 compris.
- **Données** : locataire C1 + statut « Actif » + recherche `000`.
- **Étapes** :
  1. Poser les trois filtres ; noter l'adresse.
  2. F5.
  3. Ouvrir une fiche (« Voir ») puis revenir avec le bouton Précédent du navigateur.
  4. Bouton « Effacer les filtres ».
- **Attendu** : l'adresse porte `q`, `status`, `primaryRenterClientId` ; après F5 et après retour arrière, les filtres et
  la liste sont identiques ; « Effacer les filtres » retire locataire et statut (la recherche se vide avec sa croix).
- **Gravité si échec** : Mineur

### GL-02-046 — Pagination et taille de page

- **Rôle** : ADMIN_A
- **Préconditions** : 53 baux (40 + 13).
- **Données** : 20 lignes par page (défaut), puis 10, puis 50.
- **Étapes** : aller à la page 2 puis 3 (20 par page), recharger (F5) ; passer à 10 lignes par page (sélecteur de la
  barre de pagination) ; passer à 50.
- **Attendu** : 20 par page : « 1–20 sur 53 », « 21–40 sur 53 », « 41–53 sur 53 » (3 pages) ; l'adresse porte
  `?page=2` puis `?page=3` (et `limit` quand la taille n'est pas 20) et reste stable au F5 ; changer le nombre de
  lignes remet à la page 1 ; à 50 : « 1–50 sur 53 » puis page 2 : 3 lignes.
- **Gravité si échec** : Mineur

### GL-02-047 — Tri

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs baux.
- **Données** : aucune.
- **Étapes** : cliquer sur les titres de colonnes.
- **Attendu** : aucune colonne n'est triable ; l'ordre est fixe (numéro décroissant). Constat à noter ; ne pas le
  déclarer en échec si le métier n'attend pas de tri.
- **Gravité si échec** : Cosmétique

### GL-02-048 — Export de la liste

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs baux.
- **Données** : filtre « Actif » puis sans filtre.
- **Étapes** : cliquer « Exporter › Excel (.xlsx) » puis « Exporter › CSV » ; ouvrir le fichier.
- **Attendu** :
  - Message « Export terminé (N lignes). ». Le fichier se nomme d'après « Baux » ; il contient tous les baux du filtre
    (pas seulement la page affichée), avec les colonnes Bail (`numéro — bien`), Locataire, Période, Montant (nombre
    pur), Statut.
  - Avec une liste vide : « Aucune donnée à exporter ».
- **Gravité si échec** : Mineur

### GL-02-049 — Liste en cartes sur mobile

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs baux ; navigateur réduit à 375 px de large.
- **Données** : aucune.
- **Étapes** : ouvrir la liste ; ouvrir une carte ; utiliser son menu d'actions.
- **Attendu** : chaque bail est une carte (numéro, bien, locataire, statut, montant, période) ; toucher la carte ouvre la
  fiche ; le menu propose « Modifier le bail » et « Supprimer » ; les filtres s'ouvrent dans une feuille « Filtrer les
  baux » avec « Voir les résultats » ; aucun défilement horizontal de la page.
- **Gravité si échec** : Mineur

### GL-02-050 — Le retour arrière depuis la fiche ramène à la liste filtrée

- **Rôle** : ADMIN_A
- **Préconditions** : liste filtrée (C1).
- **Données** : aucune.
- **Étapes** : « Voir » sur L3, cliquer « Retour » dans la fiche ; refaire avec le bouton Précédent du navigateur.
- **Attendu** : le bouton « Retour » de la fiche renvoie à la liste **sans** filtre (adresse `/rental/leases`) ; le
  bouton Précédent du navigateur retrouve la liste filtrée. Noter la différence (constat).
- **Gravité si échec** : Cosmétique

## E. Fiche du bail

### GL-02-051 — Onglets de la fiche, rechargement et retour

- **Rôle** : ADMIN_A
- **Préconditions** : L1 existe.
- **Données** : aucune.
- **Étapes** : ouvrir la fiche de L1 ; cliquer sur l'onglet « Documents » ; recharger (F5) ; cliquer sur « Retour ».
- **Attendu** : l'onglet par défaut est « Échéances » ; après F5, la fiche se recharge et revient sur l'onglet
  « Échéances » (l'onglet courant n'est pas conservé dans l'adresse — constat) ; « Retour » ramène à la liste.
- **Gravité si échec** : Cosmétique

### GL-02-052 — Libellés de fréquence et de jour selon la fréquence

- **Rôle** : ADMIN_A
- **Préconditions** : L2, L3, L4 existent.
- **Données** : aucune.
- **Étapes** : ouvrir la carte « Financier » de L2 (trimestriel, jour 15), L3 (semestriel, jour 1), L4 (annuel, jour 10).
- **Attendu** : « Trimestriel », « Semestriel », « Annuel » ; la ligne « Jour d'échéance » indique « Le 15 de chaque
  mois », « Le 1 de chaque mois », « Le 10 de chaque mois » : le texte « de chaque mois » est inexact pour un bail non
  mensuel (Cosmétique) et n'est pas traduit en anglais/arabe.
- **Gravité si échec** : Cosmétique

### GL-02-053 — Liens vers le locataire et le propriétaire

- **Rôle** : ADMIN_A
- **Préconditions** : L1 existe.
- **Données** : aucune.
- **Étapes** : sur la fiche de L1, cliquer sur le nom du locataire puis (retour) sur le nom du propriétaire.
- **Attendu** : chaque nom ouvre le contact correspondant (`/tenant/<idA>/crm/contacts/<contactId>/edit`) ; le contact
  ouvert est le bon ; rien n'est modifié au retour sans enregistrement. Noter que le lien mène à la page de
  modification et non à la fiche de lecture.
- **Gravité si échec** : Mineur

### GL-02-054 — Générer deux fois les échéances d'un bail

- **Rôle** : ADMIN_A
- **Préconditions** : échéances de L1 déjà générées (GL-02-008).
- **Données** : aucune.
- **Étapes** : onglet « Échéances » de L1 › « Générer les échéances ».
- **Attendu** : message d'erreur « Des échéances existent déjà pour ce bail. Supprimez-les d'abord si vous souhaitez
  les régénérer. » ; aucune échéance en double ; la liste reste à 12 lignes.
- **Gravité si échec** : Majeur

### GL-02-055 — Bail introuvable ou identifiant invalide

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : `/tenant/<idA>/rental/leases/00000000-0000-0000-0000-000000000000` ; `/tenant/<idA>/rental/leases/abc` ;
  `/tenant/<idA>/rental/leases/<leaseId>/edit` avec un identifiant inexistant.
- **Étapes** : ouvrir chaque adresse.
- **Attendu** : jamais d'écran blanc ni de 500 ; un bloc « Erreur » avec « Bail non trouvé » (ou « Erreur lors du
  chargement du bail ») ; pour `abc`, une erreur 404 « Ressource introuvable. » côté réseau.
- **Gravité si échec** : Majeur

### GL-02-056 — Consultation de la fiche par un collaborateur en lecture

- **Rôle** : LECTEUR_A
- **Préconditions** : L1 existe.
- **Données** : aucune.
- **Étapes** : ouvrir la liste puis la fiche de L1 ; observer les boutons.
- **Attendu** : la fiche s'affiche entièrement. Le bouton « Modifier » et la liste de statut sont visibles (le code ne les
  masque pas) mais chaque action est refusée (voir GL-02-064 et GL-02-075). Aucune donnée d'une autre agence.
- **Gravité si échec** : Mineur

## F. Modification d'un bail

### GL-02-057 — Modifier un bail (cas nominal)

- **Rôle** : ADMIN_A
- **Préconditions** : L8 (P9) existe.
- **Données** : date de fin `2027-12-31` ; emménagement `2027-01-05` ; loyer 80 000 ; charges 5 000 ; dépôt 75 000 ; notes
  `REC-GL bail modifié`.
- **Étapes** :
  1. Liste › ligne L8 › « ⋮ » › « Modifier le bail » (adresse `…/rental/leases/<leaseId>/edit`).
  2. Observer le formulaire, modifier les champs ci-dessus, cliquer « Mettre à jour ».
  3. Ouvrir la fiche.
- **Attendu** :
  - Titre « Modifier le bail », sous-titre « Modifiez les informations du bail ». Les champs « Propriété », « Locataire
    principal », « Propriétaire » et « Date de début » sont grisés (non modifiables).
  - Retour à la liste, sans message de succès (constat). Fiche : fin 31/12/2027, emménagement 05/01/2027, loyer 80 000,
    charges 5 000, dépôt 75 000, notes modifiées.
  - Réseau : `PATCH …/rental/leases/<leaseId>` répond 200 ; le corps ne contient que `endDate`, `moveInDate`,
    `moveOutDate`, `rentAmount`, `serviceChargeAmount`, `securityDepositAmount`, `billingFrequency`, `notes`.
- **Gravité si échec** : Bloquant

### GL-02-058 — Modification : validations

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire de modification ouvert (L8).
- **Données** : loyer vidé ; loyer `0` ; date de fin `2027-01-01` (égale au début) puis `2026-12-01` (avant).
- **Étapes** : tester chaque valeur et cliquer « Mettre à jour ».
- **Attendu** :
  - Loyer vidé : « Le montant du loyer est requis » ; loyer 0 : « Le montant du loyer doit être supérieur à 0 ».
  - Date de fin égale ou antérieure : bandeau « Erreur » en haut du formulaire (« La date de fin doit être postérieure
    à la date de début ») et message d'erreur ; rien n'est enregistré.
- **Gravité si échec** : Majeur

### GL-02-059 — Retirer la date de fin d'un bail

- **Rôle** : ADMIN_A
- **Préconditions** : L8 a une date de fin (GL-02-057).
- **Données** : champ « Date de fin » vidé.
- **Étapes** : modifier L8, effacer la date de fin, « Mettre à jour », ouvrir la fiche.
- **Attendu** : le bail devient à durée indéterminée (fin « - »). Écart probable : la fin reste 31/12/2027, car le champ
  vide n'est pas envoyé au serveur (impossible de retirer une date de fin) — gravité Mineur.
- **Gravité si échec** : Mineur

### GL-02-060 — Champs modifiables mais non enregistrés (jour d'échéance, devise)

- **Rôle** : ADMIN_A
- **Préconditions** : L8 en modification.
- **Données** : jour d'échéance 5 → 20 ; devise FCFA → EUR.
- **Étapes** : changer les deux champs, « Mettre à jour », ouvrir la fiche.
- **Attendu** : la fiche doit refléter la modification ou le formulaire doit interdire ces champs. Écart probable : le
  formulaire accepte la saisie, mais la fiche affiche toujours « Le 5 de chaque mois » et FCFA (ces champs ne sont pas
  envoyés) — gravité Mineur (donnée qui paraît enregistrée sans l'être). Remettre les valeurs d'origine.
- **Gravité si échec** : Mineur

### GL-02-061 — Modifier le loyer ne recalcule pas les échéances

- **Rôle** : ADMIN_A
- **Préconditions** : L8 avec 12 échéances de 75 000 (générées) ; loyer modifié à 80 000 par GL-02-057.
- **Données** : aucune.
- **Étapes** : comparer le loyer de la fiche de L8 et les montants dus de l'onglet « Échéances ».
- **Attendu** : l'écran doit rester cohérent. Écart probable : la fiche indique 80 000 alors que les échéances déjà
  générées restent à 75 000 (« Modifier » ne touche pas aux échéances ; seule « Réviser le loyer » de la « Vie du
  bail » les recalcule — fichier 03). Gravité Majeur (montants incohérents sans avertissement).
- **Gravité si échec** : Majeur

### GL-02-062 — Locataire et propriétaire affichés dans le formulaire de modification

- **Rôle** : ADMIN_A
- **Préconditions** : L1 existe.
- **Données** : aucune.
- **Étapes** : ouvrir `…/rental/leases/<L1>/edit` et lire les champs grisés « Locataire principal » et « Propriétaire ».
- **Attendu** : les noms `REC-GL-Aminata KONE` et `REC-GL-Chantal DIALLO` apparaissent. Écart probable : un
  identifiant brut est affiché à la place du nom (la liste proposée est faite de contacts, la valeur du bail est un
  identifiant de client) — gravité Mineur.
- **Gravité si échec** : Mineur

### GL-02-063 — Modification : annuler, double clic, rechargement, retour

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire de modification ouvert.
- **Données** : notes `REC-GL test annulation`.
- **Étapes** :
  1. Saisir les notes ; cliquer « Annuler ».
  2. Rouvrir, saisir, recharger (F5).
  3. Rouvrir, saisir, double-cliquer « Mettre à jour ».
  4. Utiliser le bouton Précédent du navigateur.
- **Attendu** : annulation = retour à la liste, rien enregistré ; F5 recharge les valeurs du serveur ; le double clic
  n'envoie qu'un `PATCH` ; le Précédent ramène à la page précédente sans modification supplémentaire.
- **Gravité si échec** : Mineur

### GL-02-064 — Modification refusée à un collaborateur sans droit

- **Rôle** : LECTEUR_A
- **Préconditions** : L1 existe.
- **Données** : loyer 1.
- **Étapes** : ouvrir la modification de L1, changer le loyer, « Mettre à jour ».
- **Attendu** : bandeau « Erreur » avec « Vous n'avez pas les droits nécessaires pour effectuer cette action. » (403) ;
  le loyer de L1 reste 150 000.
- **Gravité si échec** : Bloquant (si la modification passe)

## G. Isolation entre agences

### GL-02-065 — L'agence B ne voit ni ne modifie les baux de A

- **Rôle** : ADMIN_B (puis ADMIN_A pour contrôle)
- **Préconditions** : CB et PB existent (GL-01-010, GL-01-017) ; L1 existe en A.
- **Données** : `<leaseIdL1>` relevé dans l'adresse de la fiche de L1.
- **Étapes** :
  1. En ADMIN_B, créer le bail LB : bien `REC-GL B Appartement`, locataire `REC-GL-Zoe BEDIE`, début `2027-01-01`, fin
     `2027-12-31`, loyer 100 000, jour 5.
  2. Vérifier la liste de B ; ouvrir la liste des biens et des contacts proposés dans l'assistant.
  3. Ouvrir `/tenant/<idB>/rental/leases/<leaseIdL1>`, puis `/tenant/<idB>/rental/leases/<leaseIdL1>/edit`.
  4. Ouvrir `/tenant/<idA>/rental/leases/<leaseIdL1>`.
  5. Dans la console du navigateur de B : `PATCH /api/tenants/<idB>/rental/leases/<leaseIdL1>/status` avec
     `{"status":"CANCELED"}` ; puis `POST /api/tenants/<idB>/rental/leases` avec le `propertyId` de P1.
  6. En ADMIN_A, contrôler que L1 est inchangé (« Actif »).
- **Attendu** :
  - Étape 1 : LB prend le numéro suivant de la séquence propre à l'agence B (indépendante de celle de A).
  - Étape 2 : B ne voit que LB ; l'assistant de B ne propose ni biens ni contacts de A.
  - Étape 3 : « Bail non trouvé » (404) ; aucune donnée de L1.
  - Étape 4 : accès refusé (403) : B n'est pas membre de A.
  - Étape 5 : la modification de statut répond 400 « Bail introuvable » ; la création répond 400 « Bien introuvable ou
    n'appartenant pas à cette agence ». Aucune écriture dans A.
  - Étape 6 : L1 est resté « Actif ».
- **Gravité si échec** : Bloquant (fuite ou écriture entre agences)

## H. Changement de statut

### GL-02-066 — Suspendre un bail

- **Rôle** : ADMIN_A
- **Préconditions** : LS (P5, « Actif ») existe.
- **Données** : statut « Suspendu ».
- **Étapes** : fiche de LS › liste de statut (en haut à droite) › « Suspendu ». Cliquer ensuite sur l'option déjà
  active « Suspendu » une seconde fois.
- **Attendu** : message « Statut mis à jour avec succès » ; la fiche se recharge (spinner) et revient à l'onglet
  « Échéances » ; statut « Suspendu » (pastille orange) ; la liste filtrée sur « Suspendu » contient LS ; le bien P5
  reste « Loué ». Choisir le statut déjà courant n'envoie rien.
- **Gravité si échec** : Majeur

### GL-02-067 — Réactiver un bail suspendu

- **Rôle** : ADMIN_A
- **Préconditions** : LS « Suspendu ».
- **Données** : statut « Actif ».
- **Étapes** : choisir « Actif ».
- **Attendu** : message de succès ; statut « Actif » ; réseau `PATCH …/status` répond 200.
- **Gravité si échec** : Majeur

### GL-02-068 — Terminer un bail : le bien redevient disponible

- **Rôle** : ADMIN_A
- **Préconditions** : LS « Actif », seul bail actif de P5.
- **Données** : statut « Terminé ».
- **Étapes** : choisir « Terminé » ; ouvrir ensuite la fiche du bien P5.
- **Attendu** : statut « Terminé » (pastille grise) ; P5 est « Disponible » et de nouveau proposé dans « Nouveau
  bail » ; les échéances et documents du bail ne sont pas supprimés. Le statut « Terminé » est définitif (GL-02-071).
- **Gravité si échec** : Majeur

### GL-02-069 — Annuler un bail

- **Rôle** : ADMIN_A
- **Préconditions** : L10 « Actif » (seul bail de P12).
- **Données** : statut « Annulé ».
- **Étapes** : choisir « Annuler » dans la liste de statut de la fiche de L10 ; ouvrir P12.
- **Attendu** : statut « Annulé » (pastille rouge) ; P12 « Disponible » ; la liste filtrée « Annulé » contient L10.
- **Gravité si échec** : Majeur

### GL-02-070 — Transition interdite : retour au brouillon

- **Rôle** : ADMIN_A
- **Préconditions** : L9 « Actif ».
- **Données** : statut « Brouillon ».
- **Étapes** : choisir « Brouillon » dans la liste de statut de L9 ; puis F5.
- **Attendu** : la modification est refusée : réseau `PATCH …/status` répond 400 avec « Changement de statut
  invalide : de ACTIVE à DRAFT » (codes techniques en anglais dans le message — Cosmétique). Écart probable : la page
  entière est remplacée par un bloc « Erreur » (la fiche disparaît jusqu'au rechargement) au lieu d'un simple message —
  gravité Majeur. Après F5, L9 est toujours « Actif ».
- **Gravité si échec** : Majeur

### GL-02-071 — Aucune sortie d'un bail terminé

- **Rôle** : ADMIN_A
- **Préconditions** : LS « Terminé ».
- **Données** : statuts « Actif », « Suspendu », « Annulé », « Brouillon » (un par un).
- **Étapes** : essayer chacun, en rechargeant la fiche (F5) entre deux essais.
- **Attendu** : chaque essai est refusé : « Changement de statut invalide : de ENDED à … » ; LS reste « Terminé ».
- **Gravité si échec** : Majeur

### GL-02-072 — Aucune sortie d'un bail annulé

- **Rôle** : ADMIN_A
- **Préconditions** : L10 « Annulé ».
- **Données** : statuts « Actif », « Terminé ».
- **Étapes** : comme GL-02-071.
- **Attendu** : refus « Changement de statut invalide : de CANCELED à … » ; L10 reste « Annulé ».
- **Gravité si échec** : Majeur

### GL-02-073 — Le statut « Brouillon » n'est jamais atteignable

- **Rôle** : ADMIN_A
- **Préconditions** : L9 « Actif ».
- **Données** : aucune.
- **Étapes** : passer L9 à « Suspendu » puis tenter « Brouillon » ; rétablir « Actif ».
- **Attendu** : refus « de SUSPENDED à DRAFT » ; aucun bail créé par l'assistant n'est jamais en « Brouillon » (il est
  créé « Actif »). Constat : le filtre « Brouillon » de la liste et l'option de la fiche existent sans que le statut soit
  utilisable.
- **Gravité si échec** : Mineur

### GL-02-074 — Un autre bail actif maintient le bien « Loué »

- **Rôle** : ADMIN_A
- **Préconditions** : second bail actif sur P1 (rejouer GL-02-039 en conservant ce bail).
- **Données** : second bail « L1b » (P1, C2, début `2027-09-01`).
- **Étapes** : passer L1b à « Terminé » ; ouvrir P1 ; supprimer ensuite L1b.
- **Attendu** : P1 reste « Loué » (L1 est toujours actif) ; la suppression de L1b ne remet pas P1 « Disponible ».
- **Gravité si échec** : Majeur

### GL-02-075 — Changement de statut refusé à un collaborateur sans droit

- **Rôle** : LECTEUR_A
- **Préconditions** : L9 « Actif ».
- **Données** : statut « Suspendu ».
- **Étapes** : choisir « Suspendu ».
- **Attendu** : refus 403 « Vous n'avez pas les droits nécessaires pour effectuer cette action. » ; L9 reste « Actif ». Le
  même défaut d'affichage qu'en GL-02-070 (fiche remplacée par une erreur) est à noter.
- **Gravité si échec** : Bloquant (si le statut change)

## I. Suppression d'un bail

### GL-02-076 — Annuler la suppression

- **Rôle** : ADMIN_A
- **Préconditions** : LS « Terminé » existe.
- **Données** : aucune.
- **Étapes** : liste › « ⋮ » › « Supprimer » ; lire la boîte ; cliquer « Annuler » (ou fermer par Échap).
- **Attendu** : la boîte s'intitule « Supprimer le bail BAIL-AAAA-… ? » et dit « REC-GL Studio S1 · REC-GL-Fatou BAMBA.
  Cette action est irréversible. » ; après annulation, rien n'est supprimé.
- **Gravité si échec** : Majeur

### GL-02-077 — Supprimer un bail sans échéance

- **Rôle** : ADMIN_A
- **Préconditions** : P5 « Disponible » (après GL-02-068). Créer le bail LD1 : P5, C6, début `2027-02-01`, fin `2027-07-31`,
  loyer 60 000, jour 5.
- **Données** : LD1.
- **Étapes** : liste › LD1 › « ⋮ » › « Supprimer » › confirmer par « Supprimer ».
- **Attendu** : message « Bail supprimé. » ; la ligne disparaît et le sous-titre baisse d'une unité ; P5 repasse
  « Disponible » ; `DELETE …/rental/leases/<id>` répond 200.
- **Gravité si échec** : Majeur

### GL-02-078 — Supprimer un bail avec échéances non payées

- **Rôle** : ADMIN_A
- **Préconditions** : bail LD2 (P5, C6, début `2027-02-01`, fin `2027-07-31`, loyer 60 000) avec échéances générées (6).
- **Données** : LD2.
- **Étapes** : supprimer LD2 comme en GL-02-077.
- **Attendu** : suppression réussie ; les 6 échéances disparaissent (elles n'apparaissent plus dans « Encaisser ›
  Échéances ») ; P5 « Disponible ».
- **Gravité si échec** : Majeur

### GL-02-079 — Supprimer un bail dont une échéance est payée

- **Rôle** : ADMIN_A
- **Préconditions** : bail LD3 (P5, C6, mêmes dates) avec échéances générées et la première encaissée par « Encaisser ».
- **Données** : LD3.
- **Étapes** : tenter de supprimer LD3.
- **Attendu** : message d'erreur « Impossible de supprimer le bail : certaines échéances ont des paiements alloués.
  Supprimez d'abord les paiements. » ; LD3 reste dans la liste, ses échéances aussi ; réseau 400. Conserver LD3
  (passer à « Annulé » pour libérer P5 n'est pas nécessaire : LD3 occupe P5 jusqu'à la fin de la recette).
- **Gravité si échec** : Bloquant (perte de données comptables si la suppression passe)

### GL-02-080 — Supprimer un bail avec dépôt, état des lieux et contrat

- **Rôle** : ADMIN_A
- **Préconditions** : bail LD4 sur P12 (C6, début `2027-02-01`, fin `2027-07-31`, loyer 60 000, dépôt 60 000) ; onglet
  « Dépôt de garantie » ouvert (dépôt créé) ; état des lieux d'entrée commencé (brouillon) ; contrat de bail généré
  (onglet « Documents »).
- **Données** : LD4.
- **Étapes** : supprimer LD4 depuis la liste.
- **Attendu** : suppression réussie (« Bail supprimé. ») sans erreur 409/500 ; le dépôt, l'état des lieux et les
  co-locataires du bail sont supprimés avec lui. Le contrat généré n'est plus rattaché à un bail (il n'est plus
  consultable depuis l'application) — constat à signaler : aucune confirmation n'avertit de cette perte.
- **Gravité si échec** : Majeur

### GL-02-081 — Numéro réutilisé après suppression du dernier bail

- **Rôle** : ADMIN_A
- **Préconditions** : LD4 supprimé (GL-02-080) ; il portait le plus grand numéro de l'agence.
- **Données** : nouveau bail LD5 sur P12 (C6, mêmes valeurs).
- **Étapes** : noter le numéro de LD4 avant sa suppression ; créer LD5 ensuite.
- **Attendu** : LD5 reprend le numéro de LD4 (règle « plus grand numéro existant + 1 »). Aucune erreur de doublon.
  Noter que le contrat de LD4 (orphelin) porte alors le même numéro que le contrat de LD5 (Mineur, traçabilité).
  LD5 est supprimé en GL-02-082 (étape 3).
- **Gravité si échec** : Mineur

### GL-02-082 — Suppression : droits, double clic, isolation

- **Rôle** : LECTEUR_A, ADMIN_B, ADMIN_A
- **Préconditions** : LD5 existe ; L1 existe.
- **Données** : aucune.
- **Étapes** :
  1. LECTEUR_A : tenter de supprimer L9 (ne pas confirmer deux fois).
  2. ADMIN_B : console : `DELETE /api/tenants/<idB>/rental/leases/<leaseIdL1>`.
  3. ADMIN_A : double-cliquer sur « Supprimer » dans la boîte de confirmation de LD5 (refaire le bail après).
- **Attendu** :
  - Étape 1 : 403 « Vous n'avez pas les droits nécessaires… » ; L9 reste dans la liste.
  - Étape 2 : 400 « Bail non trouvé ou accès refusé » ; L1 est intact.
  - Étape 3 : une seule requête `DELETE` ; un seul message de succès ; aucun message d'erreur supplémentaire.
- **Gravité si échec** : Bloquant (étapes 1 et 2)

## J. Co-locataires

Aucun écran de l'application ne permet d'ajouter, retirer ou lister les co-locataires (les fonctions existent dans le
code mais ne sont branchées sur aucune page). Les cas ci-dessous passent par l'API, depuis la console du navigateur
connecté (ou un client d'API portant la session). `<tcC2>` = identifiant de client (TenantClient) de C2, lu dans la
réponse de `GET /api/tenants/<idA>/rental/leases/<leaseIdL2>` (champ `primaryRenter.id`).

### GL-02-083 — Lister les co-locataires d'un bail sans co-locataire

- **Rôle** : ADMIN_A
- **Préconditions** : L1 existe sans co-locataire.
- **Données** : aucune.
- **Étapes** : `GET /api/tenants/<idA>/rental/leases/<leaseIdL1>/co-renters`.
- **Attendu** : 200 `{ "success": true, "data": [] }`.
- **Gravité si échec** : Mineur

### GL-02-084 — Ajouter un co-locataire

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-083 fait.
- **Données** : `{ "renterClientId": "<tcC2>" }`.
- **Étapes** : `POST /api/tenants/<idA>/rental/leases/<leaseIdL1>/co-renters` avec ce corps ; puis `GET …/co-renters` et
  `GET …/rental/leases/<leaseIdL1>`.
- **Attendu** : 201 avec le bail ; la liste contient un co-locataire (`renter_client_id` = `<tcC2>`) ; la fiche du bail
  (réponse API) porte `coRenters` avec le nom de C2 ; la fiche affichée dans l'application ne montre aucun
  co-locataire (constat : aucun écran, voir GL-02-088).
- **Gravité si échec** : Majeur

### GL-02-085 — Ajouter deux fois le même co-locataire

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-084 fait.
- **Données** : même corps.
- **Étapes** : renvoyer le `POST`.
- **Attendu** : 400 « Ce colocataire est déjà ajouté à ce bail » ; la liste garde un seul co-locataire.
- **Gravité si échec** : Majeur

### GL-02-086 — Co-locataire invalide : inconnu, autre agence, corps vide

- **Rôle** : ADMIN_A
- **Préconditions** : un identifiant de client de l'agence B connu (relevé en ADMIN_B sur LB).
- **Données** : `{ "renterClientId": "00000000-0000-0000-0000-000000000000" }` ; `{ "renterClientId": "<tcCB>" }` ; `{}` ;
  bail inconnu.
- **Étapes** : envoyer chaque requête.
- **Attendu** :
  - Identifiant inconnu et identifiant d'une autre agence : le **même** message 400 « Colocataire introuvable ou
    n'appartenant pas à cette agence ».
  - Corps vide : 400 « Les données fournies sont invalides. (renterClientId : …) ».
  - Bail inconnu : 400 « Bail introuvable ».
  - Aucun co-locataire n'est ajouté.
- **Gravité si échec** : Bloquant (si un client d'une autre agence est accepté)

### GL-02-087 — Retirer un co-locataire

- **Rôle** : ADMIN_A
- **Préconditions** : C2 co-locataire de L1.
- **Données** : `<tcC2>`.
- **Étapes** : `DELETE /api/tenants/<idA>/rental/leases/<leaseIdL1>/co-renters/<tcC2>` ; puis `GET …/co-renters` ;
  puis renvoyer le `DELETE`.
- **Attendu** : 200 « Co-locataire retiré avec succès » ; liste vide ; le second `DELETE` répond encore 200 (retrait
  sans effet, sans erreur — constat).
- **Gravité si échec** : Majeur

### GL-02-088 — Effets visibles d'un co-locataire et droits

- **Rôle** : ADMIN_A, LECTEUR_A, ADMIN_B
- **Préconditions** : C2 co-locataire de L1 (rejouer GL-02-084).
- **Données** : aucune.
- **Étapes** :
  1. ADMIN_A : fiche de L1 › onglet « Signatures » › « Envoyer pour signature ».
  2. LECTEUR_A : `POST …/co-renters` ; `GET …/co-renters`.
  3. ADMIN_B : `GET /api/tenants/<idB>/rental/leases/<leaseIdL1>/co-renters`.
- **Attendu** :
  - Étape 1 : trois signataires proposés : Locataire, Co-locataire (nom et contact vides, à compléter), Bailleur — alors
    que la fiche n'affiche pas le co-locataire (constat).
  - Étape 2 : lecture autorisée (200), ajout refusé (403 « Vous n'avez pas les droits nécessaires… »).
  - Étape 3 : 400 « Bail introuvable » (aucune fuite).
  - Retirer le co-locataire à la fin (GL-02-087).
- **Gravité si échec** : Majeur

## K. Honoraires du bail (dérogation et gestionnaire)

### GL-02-089 — Honoraires applicables à L1 (propriétaire C3)

- **Rôle** : ADMIN_A
- **Préconditions** : conditions propriétaire de C3 : 10 % du loyer seul (GL-01-037).
- **Données** : aucune.
- **Étapes** : fiche de L1 › carte « Honoraires et gestionnaire ».
- **Attendu** : « Gestionnaire du bail » (liste « Aucun gestionnaire ») ; « Honoraires applicables » : Origine
  « Conditions du propriétaire », Mode « Pourcentage », Taux « 10 % », Assiette « Le loyer seul » ; interrupteur
  « Conditions propres à ce bail » éteint ; phrase « Les honoraires sont calculés à chaque encaissement et figés : un
  changement de taux ne modifie pas les honoraires déjà comptés. » ; bouton « Enregistrer ».
- **Gravité si échec** : Majeur

### GL-02-090 — Honoraires de L4 (sans propriétaire) : conditions de l'agence

- **Rôle** : ADMIN_A
- **Préconditions** : taux de l'agence 8 % (GL-01-034).
- **Données** : aucune.
- **Étapes** : fiche de L4 › carte « Honoraires et gestionnaire ».
- **Attendu** : Origine « Paramètres de l'agence » ; Mode « Pourcentage » ; Taux « 8 % » ; Assiette « Le loyer seul ».
- **Gravité si échec** : Majeur

### GL-02-091 — Honoraires de L3 : forfait du propriétaire C4

- **Rôle** : ADMIN_A
- **Préconditions** : conditions propriétaire de C4 : forfait 30 000 (GL-01-038).
- **Données** : aucune.
- **Étapes** : fiche de L3 › carte.
- **Attendu** : Origine « Conditions du propriétaire » ; Mode « Forfait par échéance » ; « Forfait » 30 000 FCFA.
- **Gravité si échec** : Majeur

### GL-02-092 — Dérogation du bail en pourcentage

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-089 fait.
- **Données** : interrupteur « Conditions propres à ce bail » activé ; Mode « Pourcentage » ; « Taux d'honoraires (%) »
  `12` ; « Calculés sur » « Tout l'encaissé ».
- **Étapes** : activer l'interrupteur (le mode par défaut est « Pourcentage » avec « Le loyer seul »), saisir 12, choisir
  « Tout l'encaissé », cliquer « Enregistrer » ; recharger (F5).
- **Attendu** : message « Honoraires enregistrés » ; « Honoraires applicables » : Origine « Conditions du bail », Taux
  « 12 % », Assiette « Tout l'encaissé » ; après F5 tout est conservé ; `PUT …/management-terms` répond 200.
- **Gravité si échec** : Majeur

### GL-02-093 — Dérogation du bail en forfait

- **Rôle** : ADMIN_A
- **Préconditions** : GL-02-092 fait.
- **Données** : mode « Forfait par échéance » ; forfait `20 000`.
- **Étapes** : changer le mode, saisir le forfait (le champ « Forfait par échéance (FCFA) » remplace le taux),
  « Enregistrer ».
- **Attendu** : « Honoraires enregistrés » ; Origine « Conditions du bail » ; Mode « Forfait par échéance » ; « Forfait »
  20 000 FCFA.
- **Gravité si échec** : Majeur

### GL-02-094 — Dérogation : valeurs invalides

- **Rôle** : ADMIN_A
- **Préconditions** : dérogation activée.
- **Données** : taux vide ; taux `101` ; taux `-1` ; forfait vide ; forfait `0` ; forfait `-5`.
- **Étapes** : essayer chaque valeur puis « Enregistrer ».
- **Attendu** :
  - Taux `101` ramené à 100 ; `-1` ramené à 0.
  - Taux vide en mode « Pourcentage », forfait vide ou `0` en mode forfait : refus 400, message « Erreur lors de la
    sauvegarde » ou « Les données fournies sont invalides. (… « Le taux est requis en pourcentage » / « Le montant du
    forfait est requis » …) » ; l'écran affiche une erreur lisible ; rien n'est enregistré ; la carte garde les
    dernières conditions valides.
- **Gravité si échec** : Mineur

### GL-02-095 — Retirer la dérogation

- **Rôle** : ADMIN_A
- **Préconditions** : dérogation sur L1.
- **Données** : interrupteur éteint.
- **Étapes** : éteindre l'interrupteur, « Enregistrer ».
- **Attendu** : « Honoraires enregistrés » ; Origine « Conditions du propriétaire », Taux 10 % (retour à la règle
  bail > propriétaire > agence) ; les champs de dérogation disparaissent.
- **Gravité si échec** : Majeur

### GL-02-096 — Désigner et retirer un gestionnaire

- **Rôle** : ADMIN_A
- **Préconditions** : AGENT_A collaborateur actif.
- **Données** : gestionnaire AGENT_A.
- **Étapes** : dans la liste « Gestionnaire du bail » (recherchable), choisir AGENT_A, « Enregistrer » ; F5 ; effacer
  (croix) puis « Enregistrer » ; choisir de nouveau AGENT_A et enregistrer.
- **Attendu** : « Honoraires enregistrés » ; la liste ne propose que les collaborateurs actifs de l'agence ; après F5
  AGENT_A est conservé ; après effacement, « Aucun gestionnaire » ; à la fin AGENT_A est gestionnaire de L1.
- **Gravité si échec** : Majeur

### GL-02-097 — Gestionnaire non valable (API)

- **Rôle** : ADMIN_A
- **Préconditions** : identifiant d'un utilisateur qui n'est pas membre actif de A (ex. ADMIN_B).
- **Données** : `{ "override": null, "agentUserId": "<userIdAdminB>" }`.
- **Étapes** : `PUT /api/tenants/<idA>/rental/leases/<leaseIdL1>/management-terms` avec ce corps (console).
- **Attendu** : 400 « Le gestionnaire choisi n'est pas un collaborateur actif de l'agence » ; gestionnaire inchangé.
- **Gravité si échec** : Majeur

### GL-02-098 — Les honoraires de B ne sont jamais ceux de A (« Aucun taux fixé » si B n'en a pas)

- **Rôle** : ADMIN_B
- **Préconditions** : LB existe. Relever d'abord, dans `/tenant/<idB>/settings/finance`, si l'agence B a un taux
  d'honoraires.
- **Données** : aucune.
- **Étapes** : fiche de LB › carte « Honoraires et gestionnaire ».
- **Attendu** :
  - Si B n'a aucun taux (ni propriétaire, ni bail) : encadré d'information « Aucun taux fixé » avec le lien « Fixer le
    taux d'honoraires » menant à `/tenant/<idB>/settings/finance`.
  - Sinon : l'origine indiquée est « Paramètres de l'agence » avec **le taux de B**, jamais 8 % ni 10 % (valeurs de A).
  - La liste « Gestionnaire du bail » ne contient que des collaborateurs de B.
- **Gravité si échec** : Bloquant (fuite entre agences) / Majeur

### GL-02-099 — Effet sur un encaissement : honoraires figés et commission du gestionnaire

- **Rôle** : ADMIN_A
- **Préconditions** : échéances de L1 générées ; AGENT_A gestionnaire de L1 (GL-02-096) ; pas de dérogation (propriétaire
  C3 à 10 % du loyer seul) ; TVA 18 % ; part AGENT_A 40 % ; **aucune pénalité calculée** sur L1 (ne pas avoir cliqué sur
  « Recalculer les statuts et pénalités », sinon des pénalités de 2 % s'ajoutent aux montants dus et aux sommes
  encaissées ci-dessous).
- **Données** : encaissement de l'échéance 08/2026 (160 000).
- **Étapes** :
  1. Ouvrir `/tenant/<idA>/finance/commissions`, période du mois courant (le sélecteur « Période » est réglé sur le
     mois de l'encaissement). Noter les cartes « Honoraires HT », « TVA », « Commissions dues aux agents » et la ligne
     de AGENT_A (valeurs de départ V0 : la base amorcée peut déjà contenir des encaissements du mois).
  2. Onglet « Échéances » de L1 › ligne 08/2026 › « Encaisser » › « Confirmer l'encaissement ».
  3. Rouvrir « Commissions des agents » (même période) : relever les nouvelles valeurs V1.
  4. Activer sur L1 la dérogation « 12 % — Tout l'encaissé » (GL-02-092), puis encaisser l'échéance 09/2026 (160 000).
  5. Rouvrir « Commissions des agents » : relever V2.
- **Attendu** (en écarts par rapport aux valeurs de départ) :
  - Après l'étape 2 (message « Encaissement enregistré. ») : V1 − V0 = honoraires HT **+15 000** (10 % × 150 000 de
    loyer, sur 160 000 encaissés) ; TVA **+2 700** (18 % × 15 000) ; commission de AGENT_A **+6 000** (40 % × 15 000).
    Le détail de AGENT_A cite le bail L1 et le bien `REC-GL Appartement A1`. « Honoraires sans gestionnaire » ne
    bouge pas.
  - Après l'étape 4 : V2 − V1 = honoraires HT **+19 200** (12 % × 160 000), TVA **+3 456**, commission AGENT_A
    **+7 680** ; les 15 000 d'août ne changent pas (honoraires figés au moment de l'encaissement). Écart total depuis V0 :
    honoraires **+34 200**, TVA **+6 156**, commissions **+13 680**.
  - Ensuite retirer la dérogation de L1 (GL-02-095).
- **Gravité si échec** : Bloquant (montant faux)

### GL-02-100 — Honoraires du bail : droits et isolation

- **Rôle** : LECTEUR_A puis ADMIN_B
- **Préconditions** : L1 existe.
- **Données** : gestionnaire AGENT_A, dérogation 15 %.
- **Étapes** :
  1. LECTEUR_A : ouvrir la fiche de L1 (la carte se charge), tenter « Enregistrer » avec un changement.
  2. ADMIN_B : `GET /api/tenants/<idB>/rental/leases/<leaseIdL1>/management-terms` puis `PUT` avec un corps valide.
- **Attendu** :
  - Étape 1 : lecture possible ; enregistrement refusé : message « Vous n'avez pas les droits nécessaires… » (403) ;
    conditions inchangées.
  - Étape 2 : 404 « Bail introuvable » pour le `GET` et le `PUT` ; rien d'écrit.
- **Gravité si échec** : Bloquant

### GL-02-101 — Bail « vente seule » : pas de carte d'honoraires

- **Rôle** : ADMIN_A
- **Préconditions** : L11 existe.
- **Données** : aucune.
- **Étapes** : ouvrir la fiche de L11.
- **Attendu** : aucune carte « Financier », « Honoraires et gestionnaire » ni « Pénalités de retard » ; seul l'onglet
  « Documents » est présent ; les notes éventuelles restent visibles.
- **Gravité si échec** : Mineur

---

## Couverture

| Sous-fonctionnalité du classeur                                                                                                                                                                          | Cas GL-02-…                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Créer un bail (ligne 5) : nominal, locataire issu d'un contact, propriétaire, bien « vente seule », fréquences, jour d'échéance 1-31 / 29 / 30 / 31, dépôt, pénalités, devise, notes, numéro automatique | 002, 004 à 027                                                                                   |
| Créer un bail : numéro fourni (`leaseNumber`)                                                                                                                                                            | non testable en interface (aucun champ ; voir 022)                                               |
| Créer un bail : locataire déjà client (`primaryRenterClientId`)                                                                                                                                          | non testable en interface (l'assistant envoie toujours un contact) ; effet visible en 009 et 023 |
| Créer un bail : refus « détenu en propre » `OWN_ASSETS_ONLY` (pack Patrimoine seul)                                                                                                                      | non testable en interface avec les comptes de la recette                                         |
| Validations : loyer 0 / négatif / énorme, fin avant début, champs requis vides, double clic, bien déjà loué                                                                                              | 028 à 040                                                                                        |
| Consulter les baux : liste, recherche, filtres, tri, pagination, export, état vide                                                                                                                       | 001, 041 à 050                                                                                   |
| Consulter un bail : détail et onglets                                                                                                                                                                    | 005, 051 à 056                                                                                   |
| Modifier un bail (ligne 7)                                                                                                                                                                               | 057 à 064                                                                                        |
| Changer le statut d'un bail (ligne 8), transitions permises et interdites                                                                                                                                | 066 à 075                                                                                        |
| Supprimer un bail (ligne 9), avec et sans échéances / paiements                                                                                                                                          | 076 à 082                                                                                        |
| Ajouter un co-locataire (ligne 10)                                                                                                                                                                       | 084, 085, 086, 088 (API seulement : aucun écran)                                                 |
| Retirer un co-locataire / lister les co-locataires (ligne 11)                                                                                                                                            | 083, 087, 088 (API seulement : aucun écran)                                                      |
| Honoraires du bail : dérogation et gestionnaire (ligne 12)                                                                                                                                               | 089 à 101                                                                                        |
| Droits : LECTEUR_A refusé en création, modification, statut, suppression, honoraires, co-locataires                                                                                                      | 003, 056, 064, 075, 082, 088, 100                                                                |
| Isolation entre agences (ADMIN_B)                                                                                                                                                                        | 065, 082, 086, 088, 098, 100                                                                     |
| Conséquences en aval : échéances générées, bien « Loué » / « Disponible », compte du locataire, e-mails, portail locataire, honoraires et commissions                                                    | 006, 007 à 016, 023, 025, 054, 066 à 069, 074, 099                                               |
| Notifications `LEASE_ACTIVATED` et e-mail de création de compte                                                                                                                                          | 023, 025 (lecture dans les boîtes de test / Journal des notifications)                           |
| Tâche quotidienne qui applique les révisions planifiées                                                                                                                                                  | non testable en interface (voir fichier 03)                                                      |
