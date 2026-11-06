# Recette Gestion locative — 01 Paramétrage et préalables

**Périmètre.** Tout ce qui doit exister ou être réglé avant de créer des baux et qui influence la gestion locative :
droits d'accès, contacts (locataires, propriétaires), biens à louer, paramètres financiers de l'agence (honoraires de
gestion, TVA, comptes, pénalités, retenue à la source), conditions d'honoraires par propriétaire (et leur
réinitialisation), commission des collaborateurs, modèles de documents locatifs (contrat de bail, reçu de loyer,
relevé) et notification « Bail activé ». La création d'un contact et d'un bien est limitée à ce qu'exige la gestion
locative.

**Prérequis généraux.**

- Agence A (« Test — Pack Agence · 3 ans ») dont l'abonnement inclut le module Gestion locative, et agence B
  (« Test — Pack Agence · 6 mois », autre agence, même plateforme). Les deux agences sont **amorcées** : A porte déjà
  un historique (60 biens, 40 baux, environ 1 000 échéances, des relevés, des propriétaires, des modèles). Les cas
  décrits comme « état neuf » (liste vide, bandeau « jamais enregistrés », « aucun modèle propre ») ne se jouent que si
  l'état de départ le permet ; sinon le cas précise quoi relever à la place (valeurs de départ à noter avant de les
  modifier).
- Comptes : ADMIN_A (`TENANT_ADMIN`), AGENT_A (`TENANT_MANAGER`, gestionnaire), LECTEUR_A (`TENANT_AGENT`, lecture
  seule), ADMIN_B. Les comptes AGENT_A et LECTEUR_A sont actifs dans l'agence A (invités depuis Collaborateurs si la
  base est neuve).
- Les e-mails ne sortent pas : le puits SMTP local écrit chaque message dans un fichier `.eml` que le testeur ouvre (liens
  d'invitation, de signature, codes). Les adresses de recette sont de la forme `rec-gl-<nom>@packs.immotopia.test`.
  WhatsApp est neutralisé ; le SMS est en mode « journal » (le code SMS apparaît dans le journal de l'API).
- Les abonnements sont appliqués (`SUBSCRIPTION_ENFORCEMENT=enforce`).
- Deux fichiers DOCX fournis par le superviseur : `REC-GL-bail-habitation.docx` (modèle valide, variables du guide
  d'utilisation) et `REC-GL-modele-incomplet.docx` (modèle qui réclame une variable absente des données du bail).
  Un fichier `REC-GL-notes.pdf` (n'importe quel PDF) et un DOCX de plus de 10 Mo `REC-GL-gros.docx`.
- Dates : tous les cas supposent une recette jouée en **novembre 2026** (aujourd'hui = 03/11/2026). Si elle est jouée
  plus tard, décaler les dates des baux des fichiers 02 à 04 du même nombre de mois et recalculer les montants.
- Le préfixe `REC-GL` est mis devant tout nom créé, pour le retrouver et le nettoyer.

**Données créées par ce fichier (réutilisées par les fichiers 02, 03 et 04).**

| Repère | Objet                 | Nom exact                                                                    | E-mail           | Remarque                      |
| ------ | --------------------- | ---------------------------------------------------------------------------- | ---------------- | ----------------------------- |
| C1     | Contact locataire     | Prénom `REC-GL-Aminata`, Nom `KONE`                                          | rec-gl-aminata@… | rôle Locataire                |
| C2     | Contact locataire     | `REC-GL-Bakary` `TRAORE`                                                     | rec-gl-bakary@…  | rôle Locataire (co-locataire) |
| C3     | Contact propriétaire  | `REC-GL-Chantal` `DIALLO`                                                    | rec-gl-chantal@… | rôle Propriétaire             |
| C4     | Contact propriétaire  | `REC-GL-Daouda` `YAO`                                                        | rec-gl-daouda@…  | rôle Propriétaire             |
| C5     | Contact entreprise    | Raison sociale `REC-GL SARL IMMO-TEST`, représentant `REC-GL-Eric` `KOUASSI` | rec-gl-sarl@…    | locataire société             |
| C6     | Contact sans rôle     | `REC-GL-Fatou` `BAMBA`                                                       | rec-gl-fatou@…   | aucun rôle                    |
| CB     | Contact de l'agence B | `REC-GL-Zoe` `BEDIE`                                                         | rec-gl-zoe@…     | créé par ADMIN_B              |

| Repère | Bien (agence A)                                           | Opération                  | Loyer mensuel | Charges | Dépôt   | Propriétaire   | Utilisé pour                                   |
| ------ | --------------------------------------------------------- | -------------------------- | ------------- | ------- | ------- | -------------- | ---------------------------------------------- |
| P1     | `REC-GL Appartement A1`                                   | Location                   | 150 000       | 10 000  | 300 000 | un client : C3 | bail nominal L1 (fichiers 02, 03, 04)          |
| P2     | `REC-GL Appartement A2`                                   | Location                   | 120 000       | 0       | 0       | C3             | bail trimestriel L2                            |
| P3     | `REC-GL Appartement A3`                                   | Location                   | 200 000       | 20 000  | 400 000 | C4             | bail semestriel L3                             |
| P4     | `REC-GL Appartement A4`                                   | Location                   | 90 000        | 0       | 90 000  | l'agence       | bail annuel L4                                 |
| P5     | `REC-GL Studio S1`                                        | Location                   | 60 000        | 5 000   | 60 000  | C3             | validations, statuts, suppressions (réutilisé) |
| P6     | `REC-GL Villa V1 meublee` (statut d'ameublement : Meublé) | Location                   | 400 000       | 0       | 800 000 | C3             | bail jour 31 L5, états des lieux meublés       |
| P7     | `REC-GL Bureau B1` (type Bureau)                          | Location                   | 500 000       | 0       | 500 000 | C4             | bail commercial L6, société C5                 |
| P8     | `REC-GL Appartement A5`                                   | Location                   | 80 000        | 0       | 80 000  | l'agence       | bail jour 30 L7                                |
| P9     | `REC-GL Appartement A6`                                   | Location                   | 75 000        | 0       | 0       | l'agence       | bail sans date de fin L8                       |
| P10    | `REC-GL Appartement A7`                                   | Location                   | 450           | 0       | 0       | l'agence       | bail en euros L9                               |
| P11    | `REC-GL Terrain T1` (type Terrain)                        | **Vente**, prix 25 000 000 | —             | —       | —       | l'agence       | bail « vente seule » L11                       |
| P12    | `REC-GL Appartement A8`                                   | Location                   | 70 000        | 0       | 0       | l'agence       | taux de pénalité inférieur à 1 L10             |
| P13    | `REC-GL Appartement A9`                                   | Location                   | 150 000       | 10 000  | 300 000 | C3             | bail à résilier dans l'avenir (fichier 03)     |
| P14    | `REC-GL Appartement A10`                                  | Location                   | 150 000       | 10 000  | 300 000 | C3             | bail à résilier dans le passé (fichier 03)     |
| PB     | `REC-GL B Appartement` (agence B)                         | Location                   | 100 000       | 0       | 0       | l'agence B     | isolation                                      |

**Réglages finaux de ce fichier** (sur lesquels s'appuient les fichiers suivants) : honoraires de l'agence 8 % du loyer
seul, agence assujettie à la TVA à 18 % ; propriétaire C3 : 10 % du loyer seul, statut fiscal « Personne physique » ;
propriétaire C4 : forfait de 30 000 FCFA par échéance, statut « Personne morale » ; AGENT_A : part de commission 40 % ;
aucun modèle de document `REC-GL` à la fin (le modèle par défaut d'origine de l'agence, ou celui de la plateforme, sert
à générer les documents). Les valeurs de départ de l'agence (base amorcée) sont relevées en GL-01-019 et ne sont pas
restaurées par ce fichier ; le superviseur décide s'il faut les remettre.

---

## A. Accès et droits

### GL-01-001 — Menus de la gestion locative pour l'administrateur

- **Rôle** : ADMIN_A
- **Préconditions** : connecté à l'agence A.
- **Données** : aucune.
- **Étapes** :
  1. Ouvrir `/dashboard`.
  2. Regarder le menu latéral (sur mobile : onglets « Baux », « Encaisser » et « Plus »).
  3. Dans la section « Gestion locative », repérer « Baux » et « Encaisser » (sous-entrées « Échéances », « Paiements »,
     « Prélèvements »).
  4. Dans la section « Paramétrage », repérer « Documents › Modèles de documents », « Signatures » et
     « Agence › Paramètres financiers ».
- **Attendu** :
  - Toutes ces entrées sont visibles et mènent respectivement à `/tenant/<idA>/rental/leases`,
    `/tenant/<idA>/rental/installments`, `/tenant/<idA>/documents/templates`, `/tenant/<idA>/signatures`,
    `/tenant/<idA>/settings/finance`.
  - Aucune erreur dans la console du navigateur ; aucune réponse 403 ou 500 dans le réseau.
- **Gravité si échec** : Bloquant

### GL-01-002 — Un collaborateur sans droits de paramétrage ne règle pas les honoraires

- **Rôle** : LECTEUR_A
- **Préconditions** : LECTEUR_A possède les droits de lecture des baux mais pas `TENANT_SETTINGS_EDIT`.
- **Données** : aucune.
- **Étapes** :
  1. Se connecter en LECTEUR_A, ouvrir le menu « Paramétrage ».
  2. Si l'entrée « Agence › Paramètres financiers » est visible, l'ouvrir ; sinon saisir l'adresse
     `/tenant/<idA>/settings/finance` dans la barre d'adresse.
  3. Observer l'écran et l'onglet réseau.
- **Attendu** :
  - Si l'utilisateur n'a aucun droit de lecture des paramètres : l'entrée de menu est masquée, et l'accès direct affiche
    un bloc « Erreur » portant « Vous n'avez pas les droits nécessaires pour effectuer cette action. » avec le bouton
    « Réessayer » ; la requête `GET /api/tenants/<idA>/settings/finance` répond 403. Aucune valeur de l'agence n'est
    affichée.
  - S'il a le droit de lecture sans droit d'écriture : l'écran s'affiche, mais le clic sur « Enregistrer » est refusé
    (403) avec le même message (voir GL-01-035).
- **Gravité si échec** : Majeur

### GL-01-003 — Un administrateur d'une autre agence ne voit pas les réglages de A

- **Rôle** : ADMIN_B
- **Préconditions** : GL-01-027 fait (réglages de A enregistrés).
- **Données** : identifiant de l'agence A (`<idA>`), relevé dans l'adresse d'une session ADMIN_A.
- **Étapes** :
  1. Connecté en ADMIN_B, ouvrir `/tenant/<idA>/settings/finance`.
  2. Ouvrir ensuite `/tenant/<idB>/settings/finance`.
- **Attendu** :
  - Étape 1 : accès refusé (écran d'accès refusé ou erreur) ; la requête `GET /api/tenants/<idA>/settings/finance`
    répond 403 ; aucune valeur de A (taux 8 %, comptes) n'apparaît.
  - Étape 2 : l'écran de B s'affiche avec ses propres valeurs (différentes de celles de A : taux 8 %, NCC
    `CI-REC-GL-0001`), ou le bandeau « Ces paramètres n'ont jamais été enregistrés » si B n'a rien enregistré.
- **Gravité si échec** : Bloquant (fuite entre agences)

## B. Contacts (locataires et propriétaires)

### GL-01-004 — Créer le contact locataire C1 et lui donner le rôle Locataire

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : Type de contact « Personne » ; Prénom `REC-GL-Aminata` ; Nom `KONE` ; Email personnel
  `rec-gl-aminata@packs.immotopia.test` ; Téléphone principal `+225 07 00 00 00 01` ; Commune au choix (obligatoire).
- **Étapes** :
  1. Ouvrir `/tenant/<idA>/crm/contacts/new`.
  2. Remplir les champs ci-dessus ; cliquer sur le bouton d'enregistrement du formulaire.
  3. Dans la liste des contacts, ouvrir la fiche de `REC-GL-Aminata KONE`.
  4. Utiliser « Gérer les rôles », cocher « Locataire (Renter) », cliquer « Enregistrer ».
- **Attendu** :
  - Retour à la liste `/tenant/<idA>/crm/contacts` avec le contact présent.
  - Après l'étape 4, la fiche affiche le rôle Locataire. Aucun compte de connexion n'est créé à ce stade (il l'est à
    la création du premier bail, voir fichier 02).
  - Réseau : `POST /api/tenants/<idA>/crm/contacts` répond 201.
- **Gravité si échec** : Bloquant

### GL-01-005 — Champs obligatoires d'un contact

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : formulaire vide, puis Prénom `REC-GL-Test` sans Nom, puis e-mail `pas-un-email`.
- **Étapes** :
  1. Ouvrir `/tenant/<idA>/crm/contacts/new` et cliquer sur le bouton d'enregistrement sans rien saisir.
  2. Saisir seulement le Prénom ; valider.
  3. Compléter Nom, saisir `pas-un-email` dans « Email personnel » ; valider.
  4. Cliquer sur « Annuler » (ou revenir en arrière dans le navigateur).
- **Attendu** :
  - Étape 1 : messages « Le prénom est requis », « Le nom est requis », « L'email est requis », « La commune est
    requise » ; rien n'est envoyé au serveur.
  - Étape 3 : message de format d'e-mail invalide ; rien n'est créé.
  - Étape 4 : retour à la liste sans création ; aucun contact `REC-GL-Test` dans la liste.
- **Gravité si échec** : Mineur

### GL-01-006 — Créer C2 (locataire) et C6 (sans rôle)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-004 fait.
- **Données** : C2 `REC-GL-Bakary` `TRAORE`, e-mail `rec-gl-bakary@packs.immotopia.test`, « Téléphone principal »
  `+225 07 00 00 00 02`, rôle Locataire (Renter). C6 `REC-GL-Fatou` `BAMBA`, e-mail `rec-gl-fatou@packs.immotopia.test`,
  aucun rôle.
- **Étapes** : comme GL-01-004 pour chaque contact ; ne pas donner de rôle à C6.
- **Attendu** : les deux contacts apparaissent dans la liste ; C6 ne porte aucun rôle. Dans l'assistant « Nouveau
  bail » (fichier 02), les contacts de la liste du locataire principal ne sont pas filtrés par rôle : C6 y figure
  (constat à reporter dans GL-02-024).
- **Gravité si échec** : Majeur

### GL-01-007 — Créer le propriétaire C3 avec le rôle Propriétaire

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : Prénom `REC-GL-Chantal`, Nom `DIALLO`, e-mail `rec-gl-chantal@packs.immotopia.test`, « Téléphone
  principal » `+225 07 00 00 00 03`.
- **Étapes** :
  1. Créer le contact comme en GL-01-004.
  2. Fiche du contact › « Gérer les rôles » › cocher « Propriétaire (Owner) » › « Enregistrer ».
- **Attendu** :
  - La fiche affiche le rôle Propriétaire. Un client de type Propriétaire (avec compte de connexion) est créé
    automatiquement pour ce contact.
  - Dans l'assistant de création de bien (étape « Type et identification », choix « Un client »), la liste
    « Sélectionner un propriétaire » propose `REC-GL-Chantal DIALLO`.
- **Gravité si échec** : Bloquant

### GL-01-008 — Créer le propriétaire C4

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-007 fait.
- **Données** : Prénom `REC-GL-Daouda`, Nom `YAO`, e-mail `rec-gl-daouda@packs.immotopia.test`, « Téléphone principal »
  `+225 07 00 00 00 04`, rôle Propriétaire (Owner).
- **Étapes** : comme GL-01-007.
- **Attendu** : C4 est proposé comme propriétaire dans l'assistant de bien, à côté de C3.
- **Gravité si échec** : Bloquant

### GL-01-009 — Créer le contact entreprise C5

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : Type de contact « Entreprise » ; Raison sociale `REC-GL SARL IMMO-TEST` ; Prénom `REC-GL-Eric` ; Nom
  `KOUASSI` ; e-mail `rec-gl-sarl@packs.immotopia.test` ; rôle Locataire (Renter).
- **Étapes** :
  1. `/tenant/<idA>/crm/contacts/new`, choisir « Entreprise ».
  2. Valider sans raison sociale.
  3. Saisir la raison sociale et valider.
- **Attendu** :
  - Étape 2 : message « La raison sociale est requise ».
  - Étape 3 : contact créé ; dans les listes déroulantes du module locatif il s'affiche sous la raison sociale
    `REC-GL SARL IMMO-TEST (rec-gl-sarl@…)`, jamais sous le nom du représentant.
- **Gravité si échec** : Majeur

### GL-01-010 — Contact de l'agence B (préparation de l'isolation)

- **Rôle** : ADMIN_B
- **Préconditions** : aucune.
- **Données** : CB : Prénom `REC-GL-Zoe`, Nom `BEDIE`, e-mail `rec-gl-zoe@packs.immotopia.test`.
- **Étapes** : créer le contact dans l'agence B comme en GL-01-004.
- **Attendu** : CB existe dans B. En ADMIN_A, `REC-GL-Zoe BEDIE` n'apparaît ni dans la liste des contacts ni dans
  l'assistant « Nouveau bail » (contrôlé en GL-02-065).
- **Gravité si échec** : Bloquant (fuite entre agences)

## C. Biens à louer

### GL-01-011 — Créer le bien P1 (location, bien d'un client)

- **Rôle** : ADMIN_A
- **Préconditions** : C3 existe avec le rôle Propriétaire (GL-01-007).
- **Données** : voir le tableau, ligne P1 : type Appartement, titre `REC-GL Appartement A1`, localisation au choix
  (obligatoire), propriétaire « Un client » = `REC-GL-Chantal DIALLO`, Type d'opération « Location », Loyer mensuel
  `150 000`, Charges (provision mensuelle) `10 000`, Dépôt de garantie `300 000`.
- **Étapes** :
  1. Ouvrir `/tenant/<idA>/properties/new`.
  2. Étape « Type et identification » : choisir le type, saisir le titre, choisir « Un client » puis C3.
  3. Étape « Localisation » : choisir une commune.
  4. Étape « Caractéristiques générales » : laisser les valeurs par défaut.
  5. Étape « Prix & Conditions » : cocher « Location », saisir loyer, charges, dépôt.
  6. Passer les étapes suivantes avec « Suivant » puis cliquer sur « Terminer ».
- **Attendu** :
  - Le bien est créé ; sa fiche indique le statut « Disponible » et le propriétaire C3.
  - Un mandat de gestion est créé avec le bien (indiqué sur le bien).
  - Réseau : `POST /api/tenants/<idA>/properties` répond 201.
- **Gravité si échec** : Bloquant

### GL-01-012 — Champs obligatoires de l'assistant de bien

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : champs vides.
- **Étapes** :
  1. Ouvrir `/tenant/<idA>/properties/new`. Essayer d'avancer sans type ni titre.
  2. Choisir « Un client » sans sélectionner de propriétaire.
  3. À l'étape « Localisation », ne rien choisir.
  4. À l'étape « Prix & Conditions », ne cocher aucun type d'opération.
- **Attendu** :
  - Le bouton « Suivant » reste désactivé tant que l'étape est invalide ; messages « Le type de propriété est
    requis », « Le titre est requis », « Le propriétaire est requis », « La localisation est requise », « Un mode de
    transaction est requis ».
  - Un seul choix d'opération est possible (boutons radio « Vente » ou « Location »).
- **Gravité si échec** : Mineur

### GL-01-013 — Créer les biens P2, P3, P4, P5, P8, P9, P10, P12, P13, P14

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-011 fait.
- **Données** : valeurs du tableau de tête pour chaque bien (titre exact, loyer, charges, dépôt, propriétaire). Pour les
  biens « l'agence » : choix « L'agence » à la place de « Un client ».
- **Étapes** : répéter les étapes de GL-01-011 pour chaque bien.
- **Attendu** :
  - Chaque bien est listé dans `/tenant/<idA>/properties` avec le statut « Disponible » et le bon propriétaire.
  - Pour un bien de l'agence, le texte « Ce bien appartient à l'agence : il n'a pas de propriétaire distinct. »
    apparaît à l'étape 1.
  - P10 porte un loyer de 450 (le bail sera créé en euros).
- **Gravité si échec** : Bloquant

### GL-01-014 — Créer le bien meublé P6

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-007 fait.
- **Données** : titre `REC-GL Villa V1 meublee`, type Villa, propriétaire C3, Location, loyer 400 000, dépôt 800 000,
  « Statut d'ameublement » = « Meublé » (champ de l'étape « Caractéristiques générales »).
- **Étapes** : comme GL-01-011 en renseignant l'ameublement.
- **Attendu** : le bien est créé ; sa fiche indique « Meublé ». Ce statut présélectionnera le modèle « Bâti, mobilier
  et équipements » pour les états des lieux (fichier 04).
- **Gravité si échec** : Majeur

### GL-01-015 — Créer le bien commercial P7

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-008 fait.
- **Données** : titre `REC-GL Bureau B1`, type « Bureau », propriétaire C4, Location, loyer 500 000, dépôt 500 000.
- **Étapes** : comme GL-01-011.
- **Attendu** : bien créé, statut « Disponible ». Son contrat de bail utilisera le modèle commercial (fichier 04).
- **Gravité si échec** : Majeur

### GL-01-016 — Créer le bien en vente P11 (« vente seule »)

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : titre `REC-GL Terrain T1`, type Terrain, propriétaire « L'agence », Type d'opération « Vente », prix de
  vente 25 000 000.
- **Étapes** : comme GL-01-011 en cochant « Vente ». L'étape « Prix & Conditions » ne propose pas le dépôt de garantie.
- **Attendu** : bien créé, statut « Disponible », mode de transaction Vente uniquement.
- **Gravité si échec** : Majeur

### GL-01-017 — Bien de l'agence B (préparation de l'isolation)

- **Rôle** : ADMIN_B
- **Préconditions** : aucune.
- **Données** : PB : titre `REC-GL B Appartement`, Location, loyer 100 000, propriétaire « L'agence ».
- **Étapes** : créer le bien dans l'agence B.
- **Attendu** : le bien est dans la liste de B ; ADMIN_A ne le voit ni dans `/tenant/<idA>/properties` ni dans
  l'assistant « Nouveau bail ».
- **Gravité si échec** : Bloquant (fuite entre agences)

### GL-01-018 — Contrôle d'ensemble des préalables

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-004 à GL-01-016 faits.
- **Données** : recherche `REC-GL`.
- **Étapes** :
  1. Liste des contacts : rechercher `REC-GL`.
  2. Liste des biens : rechercher `REC-GL`.
- **Attendu** : 6 contacts (C1 à C6) et 14 biens (P1 à P14). Tous les biens de location sont « Disponible ». Rien de
  PB ni de CB (ils sont dans l'agence B).
- **Gravité si échec** : Majeur

## D. Paramètres financiers de l'agence

### GL-01-019 — Premier affichage des paramètres financiers

- **Rôle** : ADMIN_A
- **Préconditions** : aucune. Sur une agence jamais paramétrée, on voit les valeurs par défaut ; sur la base amorcée,
  les réglages du seed sont probablement déjà enregistrés : **noter toutes les valeurs de départ** (taux, TVA,
  comptes, bénéficiaire des pénalités, retenue) dans le compte rendu avant de les modifier.
- **Données** : aucune.
- **Étapes** : ouvrir `/tenant/<idA>/settings/finance` (Paramétrage › Agence › Paramètres financiers).
- **Attendu** :
  - Titre « Paramètres financiers ».
  - Si les paramètres n'ont jamais été enregistrés : bandeau d'avertissement « Ces paramètres n'ont jamais été
    enregistrés » avec la phrase « Les valeurs affichées sont des propositions… » ; sinon pas de bandeau.
  - Cartes : « Fiscalité » (interrupteur « L'agence est assujettie à la TVA » ; « Taux de TVA (%) » désactivé tant que
    l'interrupteur est éteint ; « Numéro de compte contribuable (NCC) »), « Honoraires de gestion » (mode, taux,
    « Calculés sur » ; l'encadré d'exemple n'apparaît que si un taux ou un forfait est renseigné), « Comptes
    comptables de la gestion locative » (valeurs proposées sans enregistrement : 4731, 70611, 4432, 6588, 7588),
    « Pénalités de retard », « Retenue à la source sur loyers » (éteinte par défaut ; taux proposés 12 et 15 ; compte
    4478).
  - Sous le formulaire : cartes « Conditions par propriétaire » et « Commission des collaborateurs ».
  - Réseau : `GET /api/tenants/<idA>/settings/finance` répond 200.
- **Gravité si échec** : Majeur

### GL-01-020 — Honoraires en pourcentage sur le loyer seul

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-019 fait.
- **Données** : Mode « Pourcentage » ; Taux d'honoraires `8` ; Calculés sur « Le loyer seul, hors charges et
  pénalités » ; TVA éteinte.
- **Étapes** :
  1. Saisir `8` dans « Taux d'honoraires (%) ».
  2. Lire l'encadré qui apparaît sous la carte.
- **Attendu** : encadré « Exemple sur un loyer encaissé de 200 000 FCFA » ; « Honoraires : 16 000 FCFA · Net au
  propriétaire : 184 000 FCFA » (200 000 × 8 % = 16 000 ; pas de ligne TVA).
- **Gravité si échec** : Majeur

### GL-01-021 — Assiette « Tout ce qui est encaissé »

- **Rôle** : ADMIN_A
- **Préconditions** : taux 8 saisi.
- **Données** : « Calculés sur » = « Tout ce qui est encaissé ».
- **Étapes** : choisir l'autre option puis revenir sur « Le loyer seul… ».
- **Attendu** : l'exemple reste à 16 000 FCFA dans les deux cas (l'exemple ne porte que sur le loyer) ; l'option
  choisie est conservée à l'enregistrement et après rechargement (GL-01-027).
- **Gravité si échec** : Mineur

### GL-01-022 — TVA sur les honoraires

- **Rôle** : ADMIN_A
- **Préconditions** : taux 8 saisi.
- **Données** : interrupteur « L'agence est assujettie à la TVA » activé ; « Taux de TVA (%) » = `18`.
- **Étapes** : activer l'interrupteur ; observer le champ du taux et l'encadré.
- **Attendu** :
  - Le champ « Taux de TVA (%) » devient modifiable.
  - Encadré : « Honoraires : 16 000 FCFA · TVA : 2 880 FCFA · Net au propriétaire : 181 120 FCFA »
    (16 000 × 18 % = 2 880 ; 200 000 − 16 000 − 2 880 = 181 120).
- **Gravité si échec** : Majeur

### GL-01-023 — Limites du taux de TVA et champ désactivé

- **Rôle** : ADMIN_A
- **Préconditions** : TVA activée.
- **Données** : `0`, `100`, `101`, `-5`, champ vidé ; puis interrupteur éteint.
- **Étapes** : saisir chaque valeur, sortir du champ, essayer d'enregistrer.
- **Attendu** :
  - `0` et `100` sont acceptés (à 0, la ligne « TVA : 0 FCFA » apparaît dans l'exemple) ; `101` est ramené à 100 et
    `-5` à 0 par le champ.
  - Champ vidé : message « Le taux de TVA est requis » et l'enregistrement est bloqué.
  - Interrupteur éteint : le champ est désactivé, la ligne TVA disparaît de l'exemple.
- **Gravité si échec** : Mineur

### GL-01-024 — Limites du taux d'honoraires

- **Rôle** : ADMIN_A
- **Préconditions** : mode « Pourcentage ».
- **Données** : `0`, `100`, `101`, `-1`, `7.5`, `3.333`, champ vidé.
- **Étapes** : saisir chaque valeur et lire l'exemple.
- **Attendu** :
  - `0` : « Honoraires : 0 FCFA », net 200 000 FCFA (le taux 0 est un choix valide, différent de « non décidé »).
  - `100` : honoraires 200 000 FCFA, net 0 FCFA. `101` devient 100, `-1` devient 0.
  - `7.5` : honoraires 15 000 FCFA. `3.333` : honoraires 6 666 FCFA (arrondi).
  - Champ vidé : l'encadré d'exemple disparaît (« non décidé »).
- **Gravité si échec** : Majeur (montant d'honoraires faux) / Mineur (limites)

### GL-01-025 — Mode « Forfait par échéance »

- **Rôle** : ADMIN_A
- **Préconditions** : TVA activée à 18 %.
- **Données** : Mode « Forfait par échéance » ; Forfait `25 000`.
- **Étapes** : choisir le mode ; saisir le forfait.
- **Attendu** :
  - Le champ « Taux d'honoraires (%) » et le choix de l'assiette disparaissent ; apparaît « Forfait par échéance
    (FCFA) » avec l'aide « Dû en entier si l'échéance est payée en totalité, au prorata sinon. ».
  - Encadré « Exemple sur une échéance de loyer de 200 000 FCFA, entièrement payée » : « Honoraires : 25 000 FCFA ·
    TVA : 4 500 FCFA · Net au propriétaire : 170 500 FCFA ».
- **Gravité si échec** : Majeur

### GL-01-026 — Forfait invalide

- **Rôle** : ADMIN_A
- **Préconditions** : mode « Forfait par échéance ».
- **Données** : forfait vide, `0`, `-100`, `1,5`.
- **Étapes** : vider le champ et cliquer « Enregistrer » ; essayer `0` et `-100`.
- **Attendu** :
  - Champ vide : « Le montant du forfait est requis », rien n'est envoyé.
  - `0` et `-100` : le champ revient au minimum 1 ; si le message « Le forfait doit être supérieur à 0 » apparaît, il
    bloque l'envoi.
  - Si le serveur est atteint avec un forfait invalide : réponse 400, message d'erreur lisible, aucune valeur
    enregistrée.
- **Gravité si échec** : Mineur

### GL-01-027 — Enregistrer et retrouver les réglages (F5)

- **Rôle** : ADMIN_A
- **Préconditions** : régler d'abord mode « Pourcentage », taux `8`, base « Le loyer seul… », TVA activée à 18, NCC
  `CI-REC-GL-0001`.
- **Données** : celles ci-dessus.
- **Étapes** :
  1. Cliquer sur « Enregistrer ».
  2. Recharger la page (F5).
  3. Revenir en arrière dans le navigateur puis avancer.
- **Attendu** :
  - Message « Paramètres financiers enregistrés ».
  - Après F5 : toutes les valeurs sont conservées ; si le bandeau « Ces paramètres n'ont jamais été enregistrés »
    était affiché, il a disparu.
  - Réseau : `PUT /api/tenants/<idA>/settings/finance` répond 200.
- **Gravité si échec** : Bloquant

### GL-01-028 — Double clic sur « Enregistrer »

- **Rôle** : ADMIN_A
- **Préconditions** : un champ modifié (par exemple taux `8,5` puis retour à `8`).
- **Données** : aucune.
- **Étapes** : double-cliquer rapidement sur « Enregistrer ».
- **Attendu** : une seule requête `PUT` part (le bouton passe en chargement) ; un seul message de succès ; valeurs
  correctes.
- **Gravité si échec** : Mineur

### GL-01-029 — Numéro de compte contribuable : longueur

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : chaîne de 31 caractères (`CI-REC-GL-0123456789012345678901`), puis 30 caractères.
- **Étapes** : saisir dans le champ NCC.
- **Attendu** : le champ n'accepte pas plus de 30 caractères (la saisie est coupée) ; 30 caractères s'enregistrent.
- **Gravité si échec** : Cosmétique

### GL-01-030 — Comptes comptables : format

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : « Fonds des propriétaires » = `ABC`, puis `1`, puis `1234567890123`, puis `4731`.
- **Étapes** : saisir chaque valeur et cliquer « Enregistrer ».
- **Attendu** :
  - `ABC`, `1`, `1234567890123` : message « Un numéro de compte ne contient que des chiffres (2 à 12) » ; rien n'est
    enregistré.
  - `4731` : accepté.
  - Un champ vidé est accepté (compte non fixé) : le placeholder « À fixer avec votre comptable » reste affiché.
- **Gravité si échec** : Mineur

### GL-01-031 — Pénalités de retard revenant à l'agence

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : « Bénéficiaire des pénalités » = « L'agence » ; « Compte de produit des pénalités » vide puis `7068`.
- **Étapes** : choisir « L'agence » ; enregistrer sans compte ; puis saisir `7068` et enregistrer ; enfin revenir sur
  « Le propriétaire ».
- **Attendu** :
  - Le champ « Compte de produit des pénalités » apparaît seulement pour « L'agence ».
  - Sans compte : message « Le compte de produit des pénalités est requis » et aucun envoi.
  - Avec `7068` : enregistré. Retour à « Le propriétaire » : le champ disparaît ; remettre ce réglage (propriétaire)
    avant de passer aux fichiers suivants.
- **Gravité si échec** : Mineur

### GL-01-032 — Retenue à la source sur loyers

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : interrupteur « Appliquer une retenue à la source sur les loyers » ; date de départ ; taux 12 et 15.
- **Étapes** :
  1. Activer l'interrupteur.
  2. Effacer la date de départ puis enregistrer.
  3. Saisir une date (03/11/2026), taux physique `12`, morale `15`, compte `4478` ; enregistrer.
  4. Repasser l'interrupteur sur éteint ; enregistrer (réglage final = éteint).
- **Attendu** :
  - Étape 1 : la date « Appliquer aux encaissements à partir du » est préremplie à la date du jour.
  - Étape 2 : message « Indiquez à partir de quelle date la retenue s'applique ».
  - Étape 3 : « Paramètres financiers enregistrés ».
  - Étape 4 : le champ date est désactivé ; les taux restent affichés.
  - Avertissement orange « À activer seulement après confirmation du cabinet… » toujours visible.
- **Gravité si échec** : Mineur

### GL-01-033 — Quitter la page sans enregistrer

- **Rôle** : ADMIN_A
- **Préconditions** : réglages enregistrés (GL-01-027).
- **Données** : taux `20` saisi mais non enregistré.
- **Étapes** :
  1. Saisir `20`, ne pas enregistrer.
  2. Cliquer sur « Baux » dans le menu puis revenir sur « Paramètres financiers ».
  3. Idem avec le bouton Précédent du navigateur.
- **Attendu** : aucun enregistrement ; à chaque retour le taux affiché est celui enregistré (8). Aucun message d'erreur.
- **Gravité si échec** : Mineur

### GL-01-034 — Valeurs finales du fichier 01

- **Rôle** : ADMIN_A
- **Préconditions** : cas précédents faits.
- **Données** : Pourcentage, taux `8`, base « Le loyer seul… », TVA activée 18 %, bénéficiaire pénalités « Le
  propriétaire », retenue éteinte.
- **Étapes** : remettre ces valeurs ; cliquer « Enregistrer » ; F5.
- **Attendu** : valeurs conservées ; exemple affiché : honoraires 16 000 FCFA, TVA 2 880 FCFA, net 181 120 FCFA.
- **Gravité si échec** : Majeur

### GL-01-035 — Enregistrement refusé à un collaborateur sans droit d'écriture

- **Rôle** : LECTEUR_A
- **Préconditions** : LECTEUR_A peut ouvrir la page (droit de lecture des paramètres) mais n'a pas
  `TENANT_SETTINGS_EDIT` ; sinon jouer GL-01-002 uniquement.
- **Données** : taux `9`.
- **Étapes** : saisir `9`, cliquer « Enregistrer ».
- **Attendu** : message d'erreur « Vous n'avez pas les droits nécessaires pour effectuer cette action. » (403) ; la
  valeur enregistrée reste 8 après F5. Constat à noter : le bouton « Enregistrer » est visible malgré l'absence de droit
  (le code ne le masque pas).
- **Gravité si échec** : Majeur (si l'écriture réussit : Bloquant)

## E. Conditions d'honoraires par propriétaire

### GL-01-036 — Liste des propriétaires

- **Rôle** : ADMIN_A
- **Préconditions** : P1 à P4 créés (C3 et C4 sont propriétaires de biens).
- **Données** : aucune.
- **Étapes** : sur `/tenant/<idA>/settings/finance`, descendre jusqu'à la carte « Conditions par propriétaire ».
- **Attendu** :
  - Le tableau liste les propriétaires de l'agence (ceux du seed et, en plus, `REC-GL-Chantal DIALLO` et
    `REC-GL-Daouda YAO`) avec colonnes « Propriétaire », « Baux », « Conditions », « Statut fiscal (retenue à la
    source) », « Actions ». Relever les conditions de départ des propriétaires du seed (ils ne sont pas touchés).
  - Pour chacun : « Baux » = 0 (avant les baux du fichier 02), « Conditions » = « Suit l'agence » (texte grisé),
    « Statut fiscal » = « Non renseigné ».
  - Bouton « Modifier » présent ; bouton « Revenir aux conditions de l'agence » absent (aucune condition propre).
  - Le tableau propose « Exporter ».
- **Gravité si échec** : Majeur

### GL-01-037 — Conditions de C3 : 10 % du loyer seul, personne physique

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-036 fait.
- **Données** : mode « Pourcentage » ; taux `10` ; « Calculés sur » = « Le loyer seul… » ; statut fiscal « Personne
  physique ».
- **Étapes** :
  1. Ligne C3 › « Modifier » ; la fenêtre s'intitule « Conditions de REC-GL-Chantal DIALLO ».
  2. Saisir les valeurs ; cliquer « Enregistrer ».
- **Attendu** :
  - Message « Conditions du propriétaire enregistrées » ; la fenêtre se ferme.
  - Colonne « Conditions » : pastille bleue « 10 % du loyer seul » ; « Statut fiscal » : « Personne physique ».
  - Le bouton « Revenir aux conditions de l'agence » apparaît sur la ligne.
  - Réseau : `PUT /api/tenants/<idA>/settings/finance/owners/<idClientC3>` répond 200.
- **Gravité si échec** : Majeur

### GL-01-038 — Conditions de C4 : forfait de 30 000, personne morale

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-036 fait.
- **Données** : mode « Forfait par échéance » ; forfait `30 000` ; statut fiscal « Personne morale ».
- **Étapes** : ligne C4 › « Modifier » › saisir › « Enregistrer ».
- **Attendu** : « Conditions du propriétaire enregistrées » ; colonne « Conditions » : pastille « Forfait 30 000 FCFA »
  ; statut fiscal « Personne morale ».
- **Gravité si échec** : Majeur

### GL-01-039 — Libellé de l'assiette « Tout ce qui est encaissé »

- **Rôle** : ADMIN_A
- **Préconditions** : conditions de C3 en place.
- **Données** : taux `12` ; base « Tout ce qui est encaissé ».
- **Étapes** : modifier C3, choisir cette base, enregistrer ; constater ; rouvrir « Modifier » et remettre `10` / loyer seul.
- **Attendu** : pastille « 12 % de tout ce qui est encaissé » ; puis retour à « 10 % du loyer seul ».
- **Gravité si échec** : Mineur

### GL-01-040 — Mode pourcentage sans taux

- **Rôle** : ADMIN_A
- **Préconditions** : C3 ouvert en modification.
- **Données** : taux vide, mode « Pourcentage ».
- **Étapes** : vider le taux et cliquer « Enregistrer ».
- **Attendu** : le champ porte l'aide « Laisser vide tant que le taux n'est pas décidé. ». Le serveur exige pourtant un
  taux pour ce mode (« Le taux est requis en pourcentage ») : l'enregistrement est refusé (400) et le message affiché
  doit dire clairement que le taux est requis. Écart probable : message générique « Les données fournies sont
  invalides. » (voir rapport) — gravité Mineur ; rien n'est enregistré.
- **Gravité si échec** : Mineur

### GL-01-041 — Annuler la fenêtre de modification

- **Rôle** : ADMIN_A
- **Préconditions** : conditions de C4 en place.
- **Données** : forfait modifié à `99 000` sans enregistrer.
- **Étapes** : « Modifier » sur C4, saisir `99 000`, cliquer « Annuler » (puis refaire avec la croix de la fenêtre).
- **Attendu** : la fenêtre se ferme ; la ligne affiche toujours « Forfait 30 000 FCFA » ; aucun appel `PUT`.
- **Gravité si échec** : Mineur

### GL-01-042 — Revenir aux conditions de l'agence

- **Rôle** : ADMIN_A
- **Préconditions** : conditions propres sur C3.
- **Données** : aucune.
- **Étapes** :
  1. Ligne C3 › « Revenir aux conditions de l'agence » : la confirmation s'intitule « Revenir aux conditions de
     l'agence pour REC-GL-Chantal DIALLO ? » avec « Les conditions particulières de … seront supprimées. ».
  2. Cliquer « Annuler ».
  3. Recommencer et cliquer « Revenir ».
  4. Remettre ensuite les conditions de GL-01-037.
- **Attendu** :
  - Étape 2 : rien ne change.
  - Étape 3 : message « Le propriétaire suit maintenant les conditions de l'agence » ; colonne « Conditions » =
    « Suit l'agence » ; le bouton de retour disparaît ; `DELETE /api/tenants/<idA>/settings/finance/owners/<idClientC3>`
    répond 200.
  - Le statut fiscal reste « Personne physique » (la réinitialisation concerne les honoraires).
- **Gravité si échec** : Majeur

### GL-01-043 — Effacer le statut fiscal

- **Rôle** : ADMIN_A
- **Préconditions** : C4 avec statut « Personne morale ».
- **Données** : champ « Statut fiscal (retenue à la source) » vidé (croix de la liste).
- **Étapes** : modifier C4, effacer le statut, enregistrer ; puis remettre « Personne morale ».
- **Attendu** : « Statut fiscal » = « Non renseigné » après l'effacement ; trois choix proposés : « Personne physique »,
  « Personne morale », « Exonéré ».
- **Gravité si échec** : Mineur

### GL-01-044 — Conditions propriétaire : droits et isolation

- **Rôle** : LECTEUR_A, puis ADMIN_B
- **Préconditions** : conditions de C3 et C4 en place.
- **Données** : aucune.
- **Étapes** :
  1. LECTEUR_A : tenter de modifier C3 (si l'écran est accessible).
  2. ADMIN_B : ouvrir `/tenant/<idB>/settings/finance` et lire la carte des propriétaires.
  3. ADMIN_B : exécuter dans la console du navigateur un `PUT /api/tenants/<idA>/settings/finance/owners/<idClientC3>`
     (ou ouvrir l'adresse de l'API correspondante en GET).
- **Attendu** :
  - Étape 1 : refus 403 « Vous n'avez pas les droits nécessaires… ».
  - Étape 2 : la liste de B ne contient ni C3 ni C4.
  - Étape 3 : réponse 403 (non membre de A) ; aucune modification dans A.
- **Gravité si échec** : Bloquant (fuite ou écriture inter-agences)

## F. Commission des collaborateurs

### GL-01-045 — Liste des collaborateurs

- **Rôle** : ADMIN_A
- **Préconditions** : ADMIN_A, AGENT_A, LECTEUR_A actifs ; une invitation en attente (non acceptée) si disponible.
- **Données** : aucune.
- **Étapes** : sur `/tenant/<idA>/settings/finance`, lire la carte « Commission des collaborateurs ».
- **Attendu** :
  - Phrase « Part des honoraires HT reversée au collaborateur sur les baux dont il est le gestionnaire. ».
  - Colonnes « Collaborateur », « E-mail », « Part (%) », « Actions » ; une ligne par collaborateur actif (ADMIN_A,
    AGENT_A, LECTEUR_A et les autres collaborateurs du seed) ; relever les parts de départ ; le bouton « Enregistrer »
    de chaque ligne est désactivé tant que la part n'est pas modifiée.
  - Un collaborateur invité non encore actif n'apparaît pas.
- **Gravité si échec** : Majeur

### GL-01-046 — Définir une part de 40 % pour AGENT_A

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-045 fait.
- **Données** : part `40` pour AGENT_A.
- **Étapes** : saisir `40` ; le bouton « Enregistrer » de la ligne devient actif ; cliquer dessus.
- **Attendu** : message « Part de <nom d'AGENT_A> enregistrée » ; après F5 la valeur 40 est conservée ; le bouton est
  de nouveau désactivé. `PUT /api/tenants/<idA>/settings/finance/agents/<userId>` répond 200.
- **Gravité si échec** : Majeur

### GL-01-047 — Limites de la part, retrait de la part

- **Rôle** : ADMIN_A
- **Préconditions** : part 40 sur AGENT_A.
- **Données** : `0`, `100`, `101`, `-5`, `33.5`, champ vidé.
- **Étapes** : tester chaque valeur sur la ligne de LECTEUR_A puis enregistrer ; vider la part de LECTEUR_A et
  enregistrer.
- **Attendu** :
  - `0` est enregistré comme 0 % (différent de « pas de part ») ; `100` accepté ; `101` ramené à 100 ; `-5` à 0 ;
    `33.5` accepté.
  - Champ vidé + « Enregistrer » : la part est supprimée (aucune part), message de succès.
  - Remettre LECTEUR_A sans part à la fin.
- **Gravité si échec** : Majeur (commission fausse) / Mineur (limites)

### GL-01-048 — Commission : droits et isolation

- **Rôle** : LECTEUR_A puis ADMIN_B
- **Préconditions** : part 40 sur AGENT_A.
- **Données** : part `10`.
- **Étapes** : LECTEUR_A tente d'enregistrer 10 pour AGENT_A (si l'écran est accessible) ; ADMIN_B ouvre la carte dans
  B.
- **Attendu** : LECTEUR_A reçoit 403 ; la valeur reste 40. ADMIN_B ne voit que les collaborateurs de B.
- **Gravité si échec** : Bloquant

## G. Modèles de documents locatifs

### GL-01-049 — Page « Modèles de documents » (état initial)

- **Rôle** : ADMIN_A
- **Préconditions** : aucune. Relever les modèles propres déjà présents dans l'agence A (base amorcée) : nom, type,
  lequel est « Par défaut ». Cet état sera restauré à la fin de GL-01-054.
- **Données** : aucune.
- **Étapes** : ouvrir `/tenant/<idA>/documents/templates` (Paramétrage › Documents › Modèles de documents).
- **Attendu** :
  - Titre « Templates de Documents », bouton « Ajouter un template », lien « Guide d'utilisation », bandeau « Ces
    modèles servent à la gestion locative ».
  - Si l'agence n'a aucun modèle propre : « Aucun modèle de document n'est encore enregistré pour cette agence. » avec
    le bouton « Ajouter un template » (le modèle par défaut de la plateforme sert alors à la génération) ; sinon la
    liste de ses modèles.
  - Filtre « Filtrer par type » : Bail Habitation, Bail Commercial, Reçu de Loyer, Relevé de Compte.
- **Gravité si échec** : Mineur

### GL-01-050 — Ajouter un modèle de bail d'habitation

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-049 fait.
- **Données** : Type de document « Bail Habitation » ; Nom du template `REC-GL Bail Habitation A` ; fichier
  `REC-GL-bail-habitation.docx`.
- **Étapes** :
  1. « Ajouter un template » ; la fenêtre s'intitule « Ajouter un template ».
  2. Valider sans fichier.
  3. Sélectionner le fichier (« Sélectionner un fichier DOCX ») ; saisir le nom ; cliquer « Télécharger ».
- **Attendu** :
  - Étape 2 : « Veuillez sélectionner un fichier DOCX » ; rien n'est envoyé.
  - Étape 3 : message « Template ajouté avec succès » ; la ligne apparaît avec le nom, le fichier d'origine, le statut
    actif et le nombre de variables ; la pastille « Par défaut » est posée **seulement si c'est le premier modèle de ce
    type pour l'agence** (sinon l'ancien modèle par défaut le reste).
  - Réseau : `POST /api/tenants/<idA>/documents/templates/upload` répond 201 ; la réponse ne contient aucun chemin de
    fichier du serveur.
- **Gravité si échec** : Majeur

### GL-01-051 — Fichier non DOCX et fichier trop gros

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre « Ajouter un template » ouverte.
- **Données** : `REC-GL-notes.pdf` ; `REC-GL-gros.docx` (> 10 Mo) ; nom vide.
- **Étapes** : tenter chaque fichier ; tenter un nom vide.
- **Attendu** :
  - PDF : « Seuls les fichiers DOCX sont acceptés » (côté écran) ; rien n'est envoyé.
  - Fichier trop gros : refus avec un message clair (« Le fichier dépasse la taille maximale autorisée (10 Mo). ») et
    pas d'écran blanc ; si la réponse est 500 ou un message technique, le signaler.
  - Nom vide : « Veuillez saisir un nom pour le template ».
- **Gravité si échec** : Mineur

### GL-01-052 — Modèle en double

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-050 fait.
- **Données** : même fichier `REC-GL-bail-habitation.docx`, nom `REC-GL Bail Habitation B`.
- **Étapes** : ajouter le même fichier une seconde fois pour le même type.
- **Attendu** : refus 400 « Un modèle au contenu identique existe déjà pour ce type de document. » ; aucune nouvelle
  ligne. Le même fichier ajouté pour le type « Bail Commercial » est, lui, accepté (puis à supprimer au cas GL-01-054).
- **Gravité si échec** : Mineur

### GL-01-053 — Définir par défaut, désactiver, activer

- **Rôle** : ADMIN_A
- **Préconditions** : deux modèles « Bail Habitation » de recette : A (`REC-GL Bail Habitation A`) et un second modèle
  différent (autre DOCX, nom `REC-GL Bail Habitation B`). Noter lequel est « Par défaut » au départ (D0).
- **Données** : aucune.
- **Étapes** :
  1. Ligne B › « Définir par défaut ».
  2. Ligne B › « Désactiver », puis « Activer ».
  3. Désactiver le modèle par défaut (B).
  4. Remettre D0 par défaut (« Définir par défaut » sur la ligne de D0, ou A si le départ n'avait aucun modèle).
- **Attendu** :
  - Étape 1 : « Template défini par défaut » ; la pastille « Par défaut » passe à B.
  - Étape 2 : messages « Template désactivé » puis « Template activé » ; la ligne affiche le statut correspondant.
  - Étape 3 : B n'est plus par défaut ; un autre modèle actif du même type devient par défaut.
  - Étape 4 : la pastille revient sur D0.
  - Le formulaire « Générer un document » (fichier 04) ne propose que les modèles actifs.
- **Gravité si échec** : Majeur

### GL-01-054 — Supprimer un modèle (avec confirmation) puis état final

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-053 fait.
- **Données** : aucune.
- **Étapes** :
  1. Ligne B › « Supprimer » : la confirmation s'intitule « Supprimer « REC-GL Bail Habitation B » ? » avec « Le modèle
     ne sera plus proposé à la génération. Cette action est définitive. ».
  2. Cliquer d'abord sur « Annuler », puis recommencer et confirmer par « Supprimer ».
  3. Remettre par défaut le modèle d'origine D0 s'il y en avait un, puis supprimer le modèle A et tout autre modèle
     `REC-GL` (y compris « Bail Commercial »). Ne jamais supprimer un modèle qui ne porte pas le préfixe `REC-GL`.
  4. Filtre « Filtrer par type » : choisir « Reçu de Loyer » puis « Bail Habitation ».
- **Attendu** :
  - Étape 2 : annulation sans effet ; suppression : « Template supprimé avec succès » ; la ligne disparaît. Si le
    modèle supprimé était par défaut, un autre modèle actif du même type le devient.
  - Étape 3 : la liste de l'agence A est revenue à l'état relevé en GL-01-049 (ou vide si elle l'était) ; pour la
    génération des documents, le modèle par défaut d'origine (ou celui de la plateforme) est de nouveau utilisé.
  - Étape 4 : le filtre ne montre que le type choisi ; « Effacer les filtres » ramène la liste complète.
- **Gravité si échec** : Majeur

### GL-01-055 — Modèles : droits et isolation

- **Rôle** : LECTEUR_A puis ADMIN_B
- **Préconditions** : un modèle de test ajouté de nouveau par ADMIN_A (`REC-GL Bail Habitation A`, à supprimer ensuite).
- **Données** : aucune.
- **Étapes** :
  1. LECTEUR_A (droit de lecture des documents) : ouvrir la page, tenter « Ajouter un template », « Définir par
     défaut », « Supprimer ».
  2. ADMIN_B : ouvrir `/tenant/<idB>/documents/templates`.
- **Attendu** :
  - Étape 1 : la liste est lisible ; chaque action d'écriture est refusée (403 « Vous n'avez pas les droits
    nécessaires… »). Constat à noter : les boutons restent visibles.
  - Étape 2 : B ne voit pas le modèle de A. Une requête `POST …/documents/templates/<id>/set-default` de B sur un
    modèle de A répond 403 ou 404.
- **Gravité si échec** : Bloquant (si B ou LECTEUR_A modifie les modèles de A)

## H. Notification et contrôle final

### GL-01-056 — Notification « Bail activé » activée

- **Rôle** : ADMIN_A
- **Préconditions** : aucune.
- **Données** : aucune.
- **Étapes** : ouvrir `/tenant/<idA>/communication/email-notifications`, repérer la notification « Bail activé »
  (libellé à confirmer dans le groupe des événements de location).
- **Attendu** : la notification est activée (sinon l'activer) : le locataire et le propriétaire reçoivent un e-mail
  « Votre bail <numéro> est activé — <agence> » à la création d'un bail (vérifié en GL-02-025). Le journal
  (`Paramétrage › Agence › Journal des notifications`) servira à le retrouver.
- **Gravité si échec** : Mineur

### GL-01-057 — Ordre des préalables

- **Rôle** : ADMIN_A
- **Préconditions** : GL-01-004 à GL-01-056 faits.
- **Données** : tableau de tête.
- **Étapes** : vérifier point par point : 6 contacts, 14 biens « Disponible », réglages financiers finaux, conditions
  C3 et C4, part AGENT_A 40 %, aucun modèle `REC-GL` restant.
- **Attendu** : tout est conforme au tableau « Réglages finaux ». Sinon corriger avant de passer au fichier 02.
- **Gravité si échec** : Bloquant (empêche la suite)

### GL-01-058 — Compteur « Baux » du propriétaire (à rejouer après le fichier 02)

- **Rôle** : ADMIN_A
- **Préconditions** : L1 (P1, propriétaire C3) et L3 (P3, propriétaire C4) créés (GL-02-004 et GL-02-009).
- **Données** : aucune.
- **Étapes** : rouvrir la carte « Conditions par propriétaire ».
- **Attendu** : la colonne « Baux » vaut le nombre de baux dont la personne est propriétaire (C3 : au moins 1 ; C4 : au
  moins 1). Un propriétaire sans bail mais avec un bien reste listé.
- **Gravité si échec** : Mineur

---

## Couverture

| Sous-fonctionnalité du classeur (ou point du périmètre)                                                                             | Cas GL-01-…                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Accès au menu Gestion locative et au Paramétrage                                                                                    | 001, 002                                                                                                              |
| Paramètres financiers de l'agence : consultation, valeurs par défaut                                                                | 019, 003                                                                                                              |
| Honoraires de gestion par défaut de l'agence (pourcentage, assiette, forfait, limites)                                              | 020, 021, 024, 025, 026, 027, 028, 034                                                                                |
| TVA sur honoraires                                                                                                                  | 022, 023, 034                                                                                                         |
| NCC, comptes comptables, pénalités revenant à l'agence, retenue à la source                                                         | 029, 030, 031, 032                                                                                                    |
| Quitter sans enregistrer, rechargement, retour arrière, double clic                                                                 | 027, 028, 033                                                                                                         |
| Consulter / configurer les honoraires de gestion par propriétaire (ligne 55)                                                        | 036, 037, 038, 039, 040, 041, 043, 044, 058                                                                           |
| Réinitialiser les honoraires d'un propriétaire (ligne 56)                                                                           | 042                                                                                                                   |
| Consulter / configurer la commission des collaborateurs (ligne 57)                                                                  | 045, 046, 047, 048                                                                                                    |
| Droits (LECTEUR_A) et isolation entre agences (ADMIN_B) sur les paramètres                                                          | 002, 003, 035, 044, 048, 055                                                                                          |
| Préalables : contacts locataires, propriétaires, société, sans rôle                                                                 | 004 à 010                                                                                                             |
| Préalables : biens à louer, meublé, commercial, vente seule, bien de l'agence B                                                     | 011 à 018                                                                                                             |
| Modèles de documents locatifs : liste, ajout, validations, doublon, défaut, activation, suppression, filtre                         | 049 à 055                                                                                                             |
| Notification « Bail activé »                                                                                                        | 056                                                                                                                   |
| Contrôle d'ensemble avant le fichier 02                                                                                             | 057                                                                                                                   |
| Barrière « détenu en propre » (pack Patrimoine seul) sur les honoraires par propriétaire et la commission (codes `OWN_ASSETS_ONLY`) | non testable en interface avec les comptes de la recette (nécessite une agence ne souscrivant que le pack Patrimoine) |
| Agence dont l'abonnement n'inclut pas la gestion locative (sections masquées, `ModuleNotIncluded`)                                  | non testable en interface avec les rôles de la recette (nécessite un compte administrateur plateforme)                |
