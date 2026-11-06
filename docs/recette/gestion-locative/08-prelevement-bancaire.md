# 08 — Prélèvement bancaire

**Périmètre.** Spec `specs/042-prelevement-bancaire/` (périmètre locatif) : créanciers, contrôle d'un IBAN ou d'un RIB, mandats (créer, modifier, PDF d'autorisation, scan signé, activer, suspendre, réactiver, révoquer, signature électronique facultative), remises (préparer, actualiser, retirer une ligne, valider et prénotifier, renvoyer les avis, fichier CSV, marquer déposée, annuler), retour de la banque (règlement, rejet y compris tardif, toute la remise réglée, import d'un fichier de retour en deux temps, historique), mandats non retenus et adresse des avis. Le prélèvement de copropriété (Syndic) n'est pas couvert ici.

**Écrans et URL.**

| Écran                       | URL / chemin                                                                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Créanciers                  | `/tenant/<tenantId>/settings/finance` › carte « Prélèvement bancaire » (Paramétrage › Agence › Paramètres financiers)                                                                                                                              |
| Mandats (liste)             | `/tenant/<tenantId>/rental/direct-debit` — Encaisser › Prélèvements › onglet « Mandats »                                                                                                                                                           |
| Mandats d'un bail (actions) | Baux › (un bail) › onglet « Prélèvements »                                                                                                                                                                                                         |
| Remises (liste)             | `/tenant/<tenantId>/rental/direct-debit/remittances` — onglet « Remises »                                                                                                                                                                          |
| Détail d'une remise         | `/tenant/<tenantId>/rental/direct-debit/remittances/<remittanceId>`                                                                                                                                                                                |
| Notifications e-mail        | `/tenant/<tenantId>/communication/email-notifications` (page « Notifications email ») : événements « Prénotification d'un prélèvement bancaire » (`DIRECT_DEBIT_PRENOTIFICATION`) et « Rejet d'un prélèvement bancaire » (`DIRECT_DEBIT_REJECTED`) |

**Prérequis.** `GL-01-…` (réglages financiers, comptes de trésorerie), `GL-02-…` (formulaire de bail), `GL-05-003` (génération des échéances), `GL-06-…` (paiements, affectations). L'agence A dispose de la fonction Gestion locative. Les e-mails partent dans le puits SMTP local (fichiers `.eml`).

## Contrainte de calendrier : deux jours de recette

Un constat de règlement ou de rejet n'est possible **qu'à partir de la date de prélèvement** (jamais avant), et une remise ne se valide ni ne se produit **le jour même** de la date de prélèvement. Le fichier se joue donc en deux temps :

- **Jour J (aujourd'hui, 03/11/2026)** : sections A à F (créanciers, mandats, remises jusqu'à « Marquer comme déposée à la banque »). Les remises sont préparées avec une **date de prélèvement = J+1 (04/11/2026)** ; le créancier a un délai de prénotification de **0 jour ouvré** pour que le lendemain soit accepté.
- **Jour J+1 (04/11/2026)** : sections G et H (retour banque). Si la recette doit tenir en une seule journée, demander au superviseur de reculer en base la date de prélèvement des remises R1 et R2 ; sans cela, ne pas bloquer le reste de la recette et marquer les cas G/H « reportés à J+1 ».
  Le mois de la remise (période) est celui de la date de prélèvement : **novembre 2026**. Si J+1 tombe en décembre, décaler les baux d'un mois.

**Données créées par ce fichier.**

| Objet                 | Valeur                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comptes de trésorerie | « REC-GL Banque Prélèvement A » et « REC-GL Banque Prélèvement B » (nature Banque, actifs)                                                                                                                                                                           |
| Créancier A           | « REC-GL Créancier A » : compte Banque A, numéro d'émetteur `EMT-REC-001`, jour de collecte 1, prénotification **0** jour ouvré, frais de rejet **2 500**, seuil de suspension **2**                                                                                 |
| Créancier B           | « REC-GL Créancier B » : compte Banque B, numéro d'émetteur `EMT-REC-002`, jour de collecte 1, prénotification **0**, frais de rejet **0**, seuil de suspension **1**                                                                                                |
| Locataires            | « REC-GL Locataire PA-1 » (avec compte portail, ex. LOCATAIRE_PORTAIL_2) et « REC-GL Locataire PA-2 » (client créé au CRM, e-mail sur la fiche contact, **sans compte**). Les 11 baux peuvent se partager ces deux locataires.                                       |
| IBAN de test          | A `CI93 CI008 01113 011342912005 89` (code banque CI008, fin 0589) ; B `CI93 CI093 01234 012345678901 73` ; RIB C (24 car.) `CI059 01001 123456789012 11` ; RIB à clé incohérente `CI008 01113 011342912005 88` (IBAN équivalent `CI23 CI008 01113 011342912005 88`) |

Baux (mensuels, jour d'échéance 5, 01/11/2026 → 31/10/2027, un bien « REC-GL Bien DD-n » libre par bail, statut Actif, échéances générées) :

| Bail         | Loyer + charges                       | Créancier | Mandat                                                           | Rôle dans la recette                               |
| ------------ | ------------------------------------- | --------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| REC-GL-DD-1  | 160 000                               | A         | IBAN A, titulaire « REC-GL Locataire PA-1 », actif, sans plafond | règlement, rejet tardif, représentation            |
| REC-GL-DD-2  | 100 000                               | A         | IBAN B, **jour de collecte 10**, actif                           | non retenu : jour de collecte plus tard            |
| REC-GL-DD-3  | 200 000                               | A         | RIB C, **plafond 150 000**, actif                                | ligne plafonnée, rejet avec frais                  |
| REC-GL-DD-4  | 90 000                                | A         | mandat **brouillon** (non activé)                                | non retenu : mandat non actif                      |
| REC-GL-DD-5  | 300 000 trimestriel, début 01/10/2026 | A         | actif                                                            | non retenu : aucune échéance en novembre           |
| REC-GL-DD-7  | 80 000                                | A         | actif                                                            | « Tout constater réglé »                           |
| REC-GL-DD-8  | 70 000                                | A         | actif                                                            | « Tout constater réglé »                           |
| REC-GL-DD-6  | 120 000                               | B         | actif                                                            | import : rejet (le mandat est suspendu au seuil 1) |
| REC-GL-DD-9  | 60 000                                | B         | actif                                                            | import : règlement                                 |
| REC-GL-DD-10 | 50 000                                | B         | actif                                                            | import : montant différent, règlement manuel       |
| REC-GL-DD-11 | 40 000                                | B         | actif                                                            | rejet manuel, suspension automatique (seuil 1)     |

Remises : **R1** (créancier A, date de prélèvement J+1) = DD-1 160 000, DD-3 **150 000 (plafonnée)**, DD-7 80 000, DD-8 70 000 = **460 000**, 4 lignes ; **R2** (créancier B, J+1) = DD-6 120 000, DD-9 60 000, DD-10 50 000, DD-11 40 000 = **270 000**, 4 lignes.

---

## A. Préparation et accès

### GL-08-001 — Accès aux écrans et états vides

- **Rôle** : ADMIN_A
- **Préconditions** : aucun créancier, aucun mandat, aucune remise dans l'agence A (sinon relever l'état initial).
- **Données** : aucune.
- **Étapes** :
  1. Menu **Encaisser › Prélèvements** : onglets **Mandats** / **Remises**.
  2. Paramétrage › Agence › **Paramètres financiers** : carte **Prélèvement bancaire**.
  3. Baux › un bail actif › onglet **Prélèvements**.
- **Attendu** :
  - Mandats : titre « Prélèvements », « Aucun mandat de prélèvement » ; Remises : « Aucune remise de prélèvement » avec le bouton **Préparer une remise** ; carte : « Aucun créancier de prélèvement configuré » et bouton **Nouveau créancier** ; onglet du bail : « Aucun mandat de prélèvement pour ce bail » et **Nouveau mandat de prélèvement**.
  - L'onglet actif suit l'adresse (`/rental/direct-debit` ou `/remittances`).
  - La carte et le menu n'existent pas pour une agence sans la fonction Gestion locative.
- **Gravité si échec** : Mineur

### GL-08-002 — Créer les comptes bancaires, les 11 baux et leurs échéances

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-001.
- **Données** : tableaux « Données créées ».
- **Étapes** :
  1. Plus › Finance › Caisse et comptabilité › Caisse et trésorerie › onglet **Trésorerie** › **Nouveau compte** : créer les deux comptes de nature « Banque ».
  2. Créer les 11 baux (cas `GL-02-…`), les passer à « Actif », générer leurs échéances.
- **Attendu** :
  - Comptes « REC-GL Banque Prélèvement A » et « B » actifs ; 11 baux actifs ; l'échéance `11/2026` de chaque bail mensuel existe (« Brouillon », échéance 05/11/2026) ; DD-5 n'a que `10/2026` et `01/2027`.
- **Gravité si échec** : Bloquant

---

## B. Créanciers

### GL-08-003 — Créer le créancier A (nominal)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-002.
- **Données** : créancier A du tableau.
- **Étapes** :
  1. Carte **Prélèvement bancaire** › **Nouveau créancier**.
  2. Compte de trésorerie (banque) = « REC-GL Banque Prélèvement A » ; Libellé « REC-GL Créancier A » ; Numéro d'émetteur « EMT-REC-001 » ; Jour de collecte (1 à 28) 1 ; Prénotification (jours ouvrés avant le prélèvement) 0 ; Frais de rejet (FCFA) 2500 ; Seuil de suspension (rejets consécutifs) 2 › **Enregistrer**.
- **Attendu** :
  - Message « Créancier créé » ; une ligne : Libellé, Compte de trésorerie, Banque, Numéro d'émetteur « EMT-REC-001 », Jour de collecte 1, Prénotification 0, Frais de rejet 2 500, Seuil 2, Mandats ouverts 0, interrupteur **Actif** activé.
  - Réseau : `POST …/rental/direct-debit/creditors` → 201.
  - Valeurs par défaut du formulaire : jour 1, prénotification 5, frais 0, seuil 2 (vérifier à l'ouverture).
- **Gravité si échec** : Bloquant

### GL-08-004 — Créancier sans numéro d'émetteur : « Convention non signée »

- **Rôle** : ADMIN_A
- **Préconditions** : un second compte bancaire libre (créer « REC-GL Banque Prélèvement C »).
- **Données** : libellé « REC-GL Créancier C », numéro d'émetteur vide.
- **Étapes** :
  1. Nouveau créancier avec le compte C, libellé « REC-GL Créancier C », numéro d'émetteur laissé vide › Enregistrer.
- **Attendu** :
  - Créé ; la colonne « Numéro d'émetteur » affiche l'étiquette orange **Convention non signée** ; aide du champ : « Laissez vide tant que la convention n'est pas signée. »
  - Ce créancier ne pourra pas valider de remise (voir GL-08-037).
- **Gravité si échec** : Majeur

### GL-08-005 — Validations du formulaire créancier

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre « Nouveau créancier » ouverte.
- **Données** : libellé vide ou espaces ; numéro d'émetteur de 33 caractères ; jour 0 et 29 ; prénotification 31 ; seuil 0 et 11 ; frais −1 ; aucun compte.
- **Étapes** :
  1. Enregistrer sans rien remplir.
  2. Saisir chaque valeur limite ci-dessus et enregistrer.
- **Attendu** :
  - « Choisissez un compte bancaire » ; « Le libellé est obligatoire » (aussi pour des espaces) ; « 32 caractères au plus » ; les champs numériques sont bornés : jour 1 à 28, prénotification 0 à 30, seuil 1 à 10, frais ≥ 0 ; aucune requête tant que le formulaire est invalide.
  - Les bornes 1, 28, 0, 30, 10 sont acceptées.
- **Gravité si échec** : Mineur

### GL-08-006 — Comptes proposés : banques actives et non encore utilisées

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-003 (compte A déjà utilisé) ; une caisse et un compte Mobile Money existants ; un compte banque désactivé.
- **Données** : liste « Compte de trésorerie (banque) ».
- **Étapes** :
  1. Nouveau créancier › ouvrir la liste des comptes.
- **Attendu** :
  - Mention « Seuls les comptes de type banque, actifs et pas encore utilisés, sont proposés. » ; la liste exclut la caisse, le compte Mobile Money, le compte désactivé et « REC-GL Banque Prélèvement A » (déjà un créancier). Le même compte ne peut donc pas porter deux créanciers.
  - (Contrôle API facultatif : créer un 2ᵉ créancier sur le compte A → 409.)
- **Gravité si échec** : Majeur

### GL-08-007 — Créer le créancier B puis modifier un créancier

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-006.
- **Données** : créancier B du tableau ; modification du créancier C : libellé « REC-GL Créancier C bis », jour 15, frais 1 000, numéro d'émetteur « EMT-REC-003 ».
- **Étapes** :
  1. Créer le créancier B (compte « Banque Prélèvement B », EMT-REC-002, jour 1, prénotification 0, frais 0, seuil 1).
  2. Sur le créancier C › **Modifier** : « Modifier le créancier » (le champ de compte n'y figure plus) › changer les valeurs › Enregistrer.
  3. Rouvrir **Modifier** et vider le numéro d'émetteur › Enregistrer.
- **Attendu** :
  - B créé. C : message « Créancier mis à jour », valeurs à jour dans le tableau, étiquette « Convention non signée » disparue.
  - Vider le numéro d'émetteur : **comportement constaté** — l'écran n'envoie pas la valeur vide, donc le numéro reste « EMT-REC-003 » (impossible de le retirer) ; consigner (Mineur).
- **Gravité si échec** : Majeur

### GL-08-008 — Désactiver et réactiver un créancier

- **Rôle** : ADMIN_A
- **Préconditions** : créancier C (sans mandat).
- **Données** : interrupteur « Actif ».
- **Étapes** :
  1. Basculer l'interrupteur **Actif** de C sur inactif.
  2. Ouvrir « Nouveau mandat de prélèvement » d'un bail et « Préparer une remise » : lire les créanciers proposés.
  3. Réactiver C.
- **Attendu** :
  - Le créancier désactivé disparaît des listes de choix (mandat, remise : « Aucun créancier actif » s'il n'en reste aucun) mais reste dans la carte ; ses mandats existants restent consultables.
  - Réactiver le rend de nouveau proposé. Le compte bancaire d'un créancier désactivé reste occupé.
- **Gravité si échec** : Majeur

---

## C. Contrôle d'un IBAN ou d'un RIB (formulaire d'un mandat)

Chaque saisie est contrôlée en direct (au bout d'une courte pause) dans le champ « IBAN ou RIB » de « Nouveau mandat de prélèvement » (bail actif, créancier A).

### GL-08-009 — IBAN valide : affichage masqué et code banque

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-003 ; bail REC-GL-DD-1 actif.
- **Données** : `CI93 CI008 01113 011342912005 89`.
- **Étapes** :
  1. Baux › DD-1 › onglet Prélèvements › **Nouveau mandat de prélèvement**.
  2. Saisir l'IBAN dans « IBAN ou RIB ».
- **Attendu** :
  - « Vérification en cours… » puis un récapitulatif : IBAN `CI•• •••• •••• •••• •••• 0589` (jamais l'IBAN complet), Code banque `CI008`.
  - Aucun message d'erreur ni d'avertissement.
  - Réseau : `POST …/direct-debit/iban-check` → 200 avec `valid: true` ; la réponse ne contient pas l'IBAN complet.
- **Gravité si échec** : Bloquant

### GL-08-010 — RIB de 24 caractères : conversion en IBAN

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire ouvert.
- **Données** : `CI059 01001 123456789012 11` (RIB C).
- **Étapes** :
  1. Saisir le RIB.
- **Attendu** :
  - Contrôle valide ; récapitulatif `CI•• •••• •••• •••• •••• 1211`, Code banque `CI059` (le RIB est converti en IBAN `CI93 …` par calcul des chiffres de contrôle).
- **Gravité si échec** : Majeur

### GL-08-011 — Normalisation : espaces, tirets, minuscules

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire ouvert.
- **Données** : `ci93-ci008-01113-011342912005-89` ; `  CI93CI0080111301134291200589  `.
- **Étapes** :
  1. Saisir chaque variante.
- **Attendu** :
  - Les deux sont acceptées et donnent le même récapitulatif que l'IBAN de GL-08-009 (fin 0589, banque CI008).
- **Gravité si échec** : Mineur

### GL-08-012 — IBAN ou RIB invalide : messages

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire ouvert.
- **Données** : voir tableau.
- **Étapes** :
  1. Saisir chacune des valeurs ; lire le message ; tenter « Créer le mandat de prélèvement ».
- **Attendu** :

| Saisie                               | Message attendu                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `CI94 CI008 01113 011342912005 89`   | « La clé de contrôle de l'IBAN est incorrecte. »                                                     |
| `FR76 3000 6000 0112 3456 7890 189`  | « Seuls les IBAN de Côte d'Ivoire (CI) sont acceptés. »                                              |
| `CI93CI00801113`                     | « Un IBAN ivoirien compte 28 caractères et un RIB 24 ; vous en avez saisi 14. »                      |
| `CI93!!CI008011130113429120058`      | « L'IBAN ne doit contenir que des lettres et des chiffres. »                                         |
| `CIXX CI008 01113 011342912005 89`   | « Le format de l'IBAN ivoirien est incorrect (CI, 2 chiffres, 24 caractères). »                      |
| (vide, après saisie puis effacement) | le récapitulatif disparaît, aucune erreur ; « Saisissez un IBAN ou un RIB. » côté API si envoyé vide |

- Dans tous les cas invalides, le bouton de création ne crée rien (aucune requête `POST …/mandates`).
- **Gravité si échec** : Majeur

### GL-08-013 — RIB à clé incohérente : avertissement, pas de refus

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire ouvert sur DD-2 (les autres mandats ne doivent pas être créés ici : annuler la fenêtre ou révoquer le mandat créé).
- **Données** : `CI008 01113 011342912005 88` (clé RIB fausse).
- **Étapes** :
  1. Saisir ce RIB : lire le contrôle.
  2. Compléter (créancier A, débiteur, titulaire) › créer le mandat.
- **Attendu** :
  - Le contrôle est valide **avec avertissement** « La clé RIB ne correspond pas au calcul habituel : vérifiez le RIB auprès du titulaire. »
  - À la création : message « Mandat créé » puis fenêtre « Mandat créé, avec des avertissements » (bouton **Compris**).
  - Révoquer ce mandat d'essai (motif « Essai ») pour ne pas encombrer DD-2.
- **Gravité si échec** : Majeur

---

## D. Mandats

### GL-08-014 — Créer le mandat de DD-1 (nominal) et vérifier que l'IBAN n'est jamais en clair

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-003, GL-08-009.
- **Données** : créancier A ; débiteur « REC-GL Locataire PA-1 (locataire principal) » ; IBAN A ; titulaire « REC-GL Locataire PA-1 » ; plafond et jour vides ; notes « Mandat de recette ».
- **Étapes** :
  1. DD-1 › Prélèvements › **Nouveau mandat de prélèvement** › remplir › **Créer le mandat de prélèvement**.
  2. Lire la carte du mandat ; ouvrir Encaisser › Prélèvements › Mandats ; lire l'onglet réseau.
- **Attendu** :
  - Message « Mandat créé » ; carte « MDT-2026-NNNN » avec l'étiquette **Brouillon** : Débiteur, IBAN `CI•• •••• •••• •••• •••• 0589`, Code banque `CI008`, Titulaire, Créancier « REC-GL Créancier A », Plafond « — », Jour de collecte 1, Signé le « — », Rejets consécutifs 0.
  - Le créancier et le débiteur sont préremplis quand il n'y en a qu'un ; la fenêtre se vide après création (l'IBAN saisi disparaît).
  - **Aucune** réponse réseau, aucune page, aucune liste ne contient l'IBAN complet ni le texte chiffré ; seul le PDF d'autorisation le porte.
  - Liste des mandats : la ligne apparaît avec les colonnes Référence, Statut, Débiteur, Bail (lien), IBAN masqué, Code banque, Titulaire, Créancier, Plafond, Jour de collecte, Signé le, Rejets consécutifs.
  - Le « Mandats ouverts » du créancier A passe à 1.
- **Gravité si échec** : Bloquant

### GL-08-015 — Validations du formulaire mandat

- **Rôle** : ADMIN_A
- **Préconditions** : formulaire ouvert sur un bail sans mandat (DD-7).
- **Données** : créancier vide ; débiteur vide ; titulaire vide ou espaces ; plafond 0 puis −5 ; jour de collecte 0 et 29.
- **Étapes** :
  1. Créer sans rien remplir.
  2. Saisir un plafond 0, puis −5, un jour 0 puis 29.
  3. Laisser le titulaire à espaces.
- **Attendu** :
  - « Choisissez un créancier » ; « Choisissez le débiteur » ; « Saisissez le titulaire du compte » (espaces refusés) ; IBAN vide refusé.
  - Plafond ≤ 0 et jour hors 1-28 refusés (champ borné ou erreur serveur lisible, jamais d'erreur 500).
  - Sans créancier actif : alerte « Aucun créancier actif : créez-en un dans Paramètres financiers, carte « Prélèvement bancaire ». »
- **Gravité si échec** : Mineur

### GL-08-016 — Un seul mandat ouvert par bail et par créancier

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-014 (DD-1 a un mandat brouillon).
- **Données** : bail DD-1.
- **Étapes** :
  1. Onglet Prélèvements de DD-1 : lire le bouton « Nouveau mandat de prélèvement » et l'alerte.
  2. (Contrôle API) rejouer `POST …/mandates` pour DD-1 / créancier A avec un IBAN valide.
- **Attendu** :
  - Le bouton est **désactivé** avec une infobulle/alerte expliquant qu'un mandat est déjà ouvert pour ce bail ; l'API répond **409** pour un second mandat ouvert.
  - Après révocation du mandat, un nouveau mandat redevient possible.
  - Le choix du débiteur propose le locataire principal « (locataire principal) » et les colocataires « (colocataire) » du bail.
- **Gravité si échec** : Majeur

### GL-08-017 — Modifier un mandat : plafond, jour, notes (IBAN non modifiable)

- **Rôle** : ADMIN_A
- **Préconditions** : mandat de DD-3 créé (RIB C, titulaire « REC-GL Locataire PA-2 »).
- **Données** : plafond 150000, jour 3, notes « plafonné ».
- **Étapes** :
  1. DD-3 › Prélèvements › **Modifier** : lire l'alerte « L'IBAN ne se modifie pas : pour changer de compte, révoquez ce mandat puis créez-en un nouveau. »
  2. Plafond par prélèvement (FCFA) 150000 ; Jour de collecte (1 à 28) 3 ; Notes › **Enregistrer**.
  3. Vider le plafond › Enregistrer.
- **Attendu** :
  - Message « Mandat mis à jour » ; Plafond « 150 000 », Jour de collecte 3 ; plafond vidé → « — » et jour effectif = celui du créancier si le jour est aussi vidé.
  - Aucune zone IBAN modifiable.
  - Remettre plafond 150 000 et jour vide avant les remises (le plafond 150 000 est attendu par R1).
- **Gravité si échec** : Majeur

### GL-08-018 — Télécharger l'autorisation de prélèvement (PDF)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-014.
- **Données** : mandat de DD-1.
- **Étapes** :
  1. **Télécharger l'autorisation (PDF)**.
  2. Ouvrir le PDF (lecture du texte).
  3. Répéter après activation (GL-08-022) et sur un mandat révoqué.
- **Attendu** :
  - Message « Autorisation téléchargée : <nom du fichier> » ; PDF contenant le créancier (libellé, numéro d'émetteur), le débiteur, l'**IBAN complet** `CI93 CI00 8011 1301 1342 9120 0589`, la référence `MDT-2026-NNNN`, le bail, le plafond, des cases date et signature.
  - Réponse `Content-Disposition: attachment`, `Cache-Control: no-store`.
  - Le téléchargement reste proposé en statut Actif et Suspendu ; **non proposé** pour un mandat Révoqué.
  - Chaque téléchargement est audité (Paramétrage › Agence › Journal d'activité : « Autorisation de prélèvement téléchargée », sans IBAN).
- **Gravité si échec** : Majeur

### GL-08-019 — Déposer le scan signé : formats, taille, consultation

- **Rôle** : ADMIN_A
- **Préconditions** : mandat de DD-1 en brouillon, sans scan.
- **Données** : `scan-mandat.pdf` (< 1 Mo) ; `scan.png` ; `scan.docx` ; un PDF de 11 Mo.
- **Étapes** :
  1. **Déposer le scan signé** → choisir `scan.docx`, puis le PDF de 11 Mo, puis `scan-mandat.pdf`.
  2. Cliquer **Voir le scan**.
- **Attendu** :
  - `.docx` : « Format non accepté : déposez un PDF, un JPEG ou un PNG. » ; 11 Mo : « Le fichier dépasse 10 Mo. » ; aucune requête n'est envoyée dans ces deux cas.
  - PDF valide : « Scan signé déposé » ; le bouton devient « Remplacer le scan signé » et « Voir le scan » apparaît.
  - « Voir le scan » ouvre/télécharge le fichier (route authentifiée) ; l'adresse disque n'est jamais exposée.
- **Gravité si échec** : Majeur

### GL-08-020 — Remplacer le scan (brouillon) ; non remplaçable une fois actif

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-019 ; mandat en brouillon avec scan.
- **Données** : `scan.png`.
- **Étapes** :
  1. **Remplacer le scan signé** › `scan.png` › « Voir le scan ».
  2. Après activation (GL-08-022), chercher « Remplacer le scan signé ».
- **Attendu** :
  - Le nouveau fichier remplace l'ancien (un seul scan visible).
  - En statut Actif ou Suspendu, le bouton de dépôt/remplacement n'existe plus (la preuve se garde ; pour en changer il faut révoquer et recréer) ; « Voir le scan » reste disponible.
- **Gravité si échec** : Majeur

### GL-08-021 — Activer sans scan : impossible

- **Rôle** : ADMIN_A
- **Préconditions** : un mandat brouillon sans scan (créer le mandat de DD-7 et ne pas déposer de scan).
- **Données** : mandat de DD-7.
- **Étapes** :
  1. Lire le bouton **Activer** et survoler-le.
  2. (Contrôle API) rejouer `POST …/mandates/<id>/activate` avec `{ signedAt: aujourd'hui }`.
- **Attendu** :
  - Bouton désactivé, infobulle « Déposez d'abord le scan signé pour pouvoir activer le mandat. »
  - L'API refuse (400/409) tant qu'aucun scan n'est déposé ; le mandat reste « Brouillon ».
- **Gravité si échec** : Majeur

### GL-08-022 — Activer un mandat : date de signature obligatoire

- **Rôle** : ADMIN_A
- **Préconditions** : mandat de DD-1 avec scan (GL-08-019).
- **Données** : date de signature = 01/11/2026 ; essai avec demain ; essai sans date.
- **Étapes** :
  1. **Activer** : dans « Activer le mandat », laisser « Date de signature » vide › **Activer**.
  2. Choisir demain (calendrier).
  3. Choisir 01/11/2026 › Activer.
- **Attendu** :
  - Sans date : l'action n'aboutit pas (champ requis) ; une date future est refusée (grisée ou erreur « pas dans le futur »).
  - Date valide : message « Mandat activé » ; étiquette **Actif** ; « Signé le 01/11/2026 » ; le bouton Activer disparaît ; « Suspendre » et « Révoquer » apparaissent.
- **Gravité si échec** : Bloquant

### GL-08-023 — Suspendre un mandat : motif obligatoire

- **Rôle** : ADMIN_A
- **Préconditions** : mandat actif (par exemple un mandat de test sur DD-2, à activer comme en GL-08-022 puis à remettre actif).
- **Données** : motif « Contestation du débiteur » ; essai avec motif vide ; motif de 501 caractères.
- **Étapes** :
  1. **Suspendre** › laisser « Motif » vide › Suspendre.
  2. Saisir 501 caractères › Suspendre.
  3. Saisir « Contestation du débiteur » › Suspendre.
- **Attendu** :
  - « Le motif est obligatoire » ; « 500 caractères au plus » ; avec un motif valide : « Mandat suspendu », étiquette **Suspendu**, « Motif de suspension : Contestation du débiteur ».
  - Un mandat suspendu n'est pas retenu dans une remise (voir GL-08-035).
- **Gravité si échec** : Majeur

### GL-08-024 — Réactiver un mandat suspendu

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-023.
- **Données** : mandat suspendu.
- **Étapes** :
  1. **Réactiver**.
- **Attendu** :
  - Message « Mandat réactivé » ; étiquette **Actif** ; « Rejets consécutifs » remis à 0 ; plus de motif de suspension.
- **Gravité si échec** : Majeur

### GL-08-025 — Révoquer un mandat : définitif

- **Rôle** : ADMIN_A
- **Préconditions** : un mandat actif ou brouillon de test (le mandat d'essai de GL-08-013).
- **Données** : motif « Changement de banque ».
- **Étapes** :
  1. **Révoquer** : lire « La révocation est définitive : pour prélever à nouveau, il faudra créer un nouveau mandat. » › motif vide › Révoquer.
  2. Motif « Changement de banque » › Révoquer.
  3. Lire la carte ; chercher Activer, Suspendre, Modifier, Télécharger l'autorisation.
- **Attendu** :
  - Motif vide refusé ; après révocation : « Mandat révoqué », étiquette **Révoqué**, « Motif de révocation : Changement de banque ».
  - Plus aucune action d'écriture sur la carte (ni Modifier, ni Suspendre, ni Révoquer, ni PDF) ; « Voir le scan » reste visible s'il existe.
  - Un nouveau mandat peut être créé sur le même bail.
- **Gravité si échec** : Bloquant

### GL-08-026 — Transitions de statut interdites

- **Rôle** : ADMIN_A
- **Préconditions** : un mandat brouillon, un actif, un révoqué.
- **Données** : identifiants relevés.
- **Étapes** :
  1. Brouillon : chercher « Suspendre » et « Réactiver » (absents).
  2. Rejouer en console : `POST …/suspend` sur un brouillon ; `POST …/reactivate` sur un actif ; `POST …/activate` et `PATCH …` sur un révoqué.
- **Attendu** :
  - L'écran ne propose jamais une transition interdite.
  - Chaque requête rejouée est refusée (409 ou 400) avec un message lisible ; le statut ne change pas.
- **Gravité si échec** : Majeur

### GL-08-027 — Signature électronique de l'autorisation (facultative)

- **Rôle** : ADMIN_A
- **Préconditions** : mandat brouillon sans scan (DD-8) ; module de signature disponible ; canal e-mail.
- **Données** : signataire = débiteur, canal e-mail.
- **Étapes** :
  1. Onglet Prélèvements de DD-8 : lire la carte **Signature électronique (facultatif)**.
  2. **Envoyer pour signature électronique** › valider l'envoi ; ouvrir le `.eml` reçu.
  3. En PUBLIC, ouvrir le lien : saisir le code reçu (journal/`.eml`), lire l'autorisation, signer.
  4. Revenir sur la carte du mandat.
- **Attendu** :
  - Sur la page publique, le PDF et l'IBAN ne sont montrés **qu'après** la saisie du code à usage unique ; pas de signature « sur place » pour ce type.
  - Après signature : alerte « Scan signé (signature électronique) » avec « Signé le <date> » et « Vous pouvez maintenant activer le mandat. » ; le bouton **Activer** devient disponible (date préremplie, modifiable) ; **l'activation reste un geste de l'agence**.
  - Déposer ensuite un scan papier annule la demande en cours (si elle est encore ouverte).
  - Le titre, les messages et le `.eml` ne contiennent que l'IBAN masqué.
- **Gravité si échec** : Majeur

### GL-08-028 — Liste des mandats : filtres, recherche, pagination

- **Rôle** : ADMIN_A
- **Préconditions** : plusieurs mandats (créer les mandats de DD-2 à DD-11, voir ci-dessous GL-08-029).
- **Données** : filtres Statut, Créancier, recherche « REC-GL Locataire PA-1 ».
- **Étapes** :
  1. Encaisser › Prélèvements › Mandats : filtrer par Statut (Brouillon, Actif, Suspendu, Révoqué), par Créancier, puis taper « MDT-2026 » et un nom de titulaire.
  2. Naviguer entre pages (20 par page).
- **Attendu** :
  - Chaque filtre ne montre que les mandats correspondants ; la recherche (référence, débiteur, titulaire) se déclenche après une courte pause ; compteur en sous-titre ; « Aucun mandat de prélèvement » si aucun résultat.
  - Le lien « Bail » ouvre le détail du bail.
  - Constat : les filtres ne sont pas conservés dans l'adresse (F5 les remet à zéro) ; la liste n'a pas de bouton d'export (Mineur).
- **Gravité si échec** : Mineur

### GL-08-029 — Créer et activer les mandats de DD-2 à DD-11

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-014 à GL-08-022.
- **Données** : tableau « Baux » (IBAN B pour DD-2 avec jour de collecte 10, RIB C pour DD-3 avec plafond 150 000, IBAN/RIB quelconques valides pour les autres ; DD-4 laissé en brouillon ; DD-6, DD-9, DD-10, DD-11 avec le créancier B).
- **Étapes** :
  1. Pour chaque bail : créer le mandat, déposer un scan, activer avec la date de signature 01/11/2026 (sauf DD-4).
- **Attendu** :
  - 10 mandats « Actif » (DD-1, DD-2, DD-3, DD-5, DD-6, DD-7, DD-8, DD-9, DD-10, DD-11) et 1 « Brouillon » (DD-4) ; « Mandats ouverts » : créancier A = 7, créancier B = 4.
- **Gravité si échec** : Bloquant

---

## E. Remises : préparation, validation, fichier

### GL-08-030 — Préparer une remise : date acceptable

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-029.
- **Données** : créancier A ; dates : hier, aujourd'hui, J+1 ; créancier désactivé.
- **Étapes** :
  1. Encaisser › Prélèvements › Remises › **Préparer une remise**.
  2. Lire la date proposée ; essayer hier puis aujourd'hui.
  3. Choisir J+1 (04/11/2026).
- **Attendu** :
  - La date proposée est le premier jour de collecte possible (ici **04/11/2026**, prénotification 0) ; texte « Avis de prélèvement : 0 jour ouvré avant la date de prélèvement. » (pluriel pour 2 et plus).
  - Hier ou aujourd'hui : refus « Cette date de prélèvement est trop proche : la première date possible est le 04/11/2026. » (400) ; rien n'est créé.
  - J+1 : voir GL-08-031. Un créancier désactivé n'est pas dans la liste (« Aucun créancier actif »).
- **Gravité si échec** : Majeur

### GL-08-031 — Préparer R1 : lignes retenues, plafond, total

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-030.
- **Données** : créancier A, date de prélèvement 04/11/2026, notes « R1 recette ».
- **Étapes** :
  1. **Préparer une remise** › Créancier « REC-GL Créancier A », Date de prélèvement 04/11/2026, Notes › **Préparer**.
  2. Lire l'écran de détail.
- **Attendu** :
  - Message « Remise PRL-2026-NNNN préparée » ; statut **Brouillon** ; Créancier, Numéro d'émetteur EMT-REC-001, Format du fichier, Date de prélèvement 04/11/2026, Période 11/2026, « Avis de prélèvement au plus tard le 04/11/2026 », Lignes 4, Total **460 000**.
  - 4 lignes numérotées `PRL-…-001` à `-004` : DD-1 (reste dû 160 000, montant prélevé 160 000), DD-3 (reste dû 200 000, montant **150 000** avec la marque **Plafonné** et l'infobulle « Limité au plafond du mandat : 150 000 »), DD-7 80 000, DD-8 70 000 ; mandat avec IBAN masqué en lecture gauche-droite.
  - Une seule échéance (novembre) par bail, pas d'arriéré ni de pénalité prélevés.
- **Gravité si échec** : Bloquant

### GL-08-032 — Mandats non retenus et leur raison

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-031.
- **Données** : DD-2, DD-4, DD-5.
- **Étapes** :
  1. Dans le détail de R1 (Brouillon), lire l'alerte/section « Mandats non retenus (3) » ; recharger la page (F5).
- **Attendu** :
  - DD-2 : « Jour de collecte plus tard dans le mois » ; DD-4 : « Mandat non actif (brouillon ou suspendu) » ; DD-5 : « Aucune échéance pour ce mois ». Chaque entrée nomme le mandat (référence), le bail et le débiteur.
  - La section reste visible après F5 (la liste est recalculée à chaque lecture d'une remise en brouillon).
  - Les autres raisons possibles : « Rien à payer : échéance soldée ou annulée », « Échéance déjà dans une remise », « Le bail n'est pas actif ».
- **Gravité si échec** : Majeur

### GL-08-033 — Aucune ligne à prélever : pas de remise créée

- **Rôle** : ADMIN_A
- **Préconditions** : créancier C actif avec compte bancaire mais aucun mandat.
- **Données** : créancier C, date 04/11/2026.
- **Étapes** :
  1. Préparer une remise pour le créancier C.
- **Attendu** :
  - Message d'erreur « Aucune échéance à prélever pour ce créancier à cette date. » (400) ; aucune remise n'apparaît dans la liste.
- **Gravité si échec** : Majeur

### GL-08-034 — Échéance déjà dans une remise : non reprise

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-031 (R1 en brouillon contient DD-1, DD-3, DD-7, DD-8).
- **Données** : créancier A, date 05/11/2026.
- **Étapes** :
  1. Préparer une seconde remise pour le créancier A à la date 05/11/2026.
- **Attendu** :
  - Aucune ligne (les échéances de novembre sont déjà dans R1) ; refus « Aucune échéance à prélever … » ; si des mandats sont listés comme non retenus, la raison est « Échéance déjà dans une remise ».
  - Aucune seconde remise créée.
- **Gravité si échec** : Majeur

### GL-08-035 — Actualiser une remise en brouillon

- **Rôle** : ADMIN_A
- **Préconditions** : R1 en brouillon.
- **Données** : suspendre le mandat de DD-8 (motif « Test ») ; paiement partiel de 20 000 sur l'échéance `11/2026` de DD-7.
- **Étapes** :
  1. Suspendre le mandat de DD-8 ; sur DD-7 enregistrer un paiement espèces de 20 000 sur l'échéance novembre.
  2. Retourner sur R1 › **Actualiser** › confirmer (« Recalculer les lignes à partir des échéances et des mandats d'aujourd'hui ? »).
  3. Réactiver DD-8, annuler le paiement de 20 000 sur DD-7, **Actualiser** de nouveau.
- **Attendu** :
  - Après la 1ʳᵉ actualisation : message « Remise actualisée » ; la ligne de DD-8 est annulée/retirée (mandat suspendu, raison « Mandat non actif (brouillon ou suspendu) » dans les non retenus) ; la ligne de DD-7 passe à **60 000** (80 000 − 20 000) ; le total est recalculé (160 000 + 150 000 + 60 000 = **370 000**).
  - Après la 2ᵉ actualisation : DD-8 revient (nouvelle ligne) à 70 000 et DD-7 à 80 000 ; total **460 000**.
  - (Les lignes annulées restent visibles avec leur motif automatique.)
- **Gravité si échec** : Majeur

### GL-08-036 — Retirer une ligne d'une remise en brouillon

- **Rôle** : ADMIN_A
- **Préconditions** : R1 en brouillon avec 4 lignes pendantes.
- **Données** : ligne de DD-8 ; motif facultatif « Demande du locataire ».
- **Étapes** :
  1. Colonne Actions de la ligne DD-8 › **Retirer** : lire « Retirer la ligne PRL-…-004 ».
  2. Valider avec ou sans motif.
  3. **Actualiser** : la ligne revient-elle ?
- **Attendu** :
  - Message « Ligne retirée » ; la ligne passe « Annulée » avec son motif ; total 390 000.
  - Une actualisation ajoute de nouveau DD-8 si son mandat est encore éligible (nouvelle ligne `-005`) : consigner le comportement observé. Pour la suite, **remettre DD-8 dans R1** par une actualisation.
- **Gravité si échec** : Majeur

### GL-08-037 — Valider une remise sans numéro d'émetteur : refus

- **Rôle** : ADMIN_A
- **Préconditions** : un créancier D (compte Banque D, sans numéro d'émetteur) avec un mandat actif sur un bail et une échéance de novembre ; remise R-D préparée à J+1. À défaut, utiliser le créancier C.
- **Données** : remise R-D.
- **Étapes** :
  1. Détail de R-D › **Valider la remise** › confirmer.
- **Attendu** :
  - Refus « Renseignez le numéro d'émetteur du créancier avant de valider la remise. » ; statut inchangé (Brouillon) ; aucune prénotification.
  - Après avoir saisi le numéro d'émetteur du créancier (Modifier), la validation passe.
  - Annuler R-D ensuite (motif « Essai »).
- **Gravité si échec** : Majeur

### GL-08-038 — Valider R1 et prénotifier les débiteurs

- **Rôle** : ADMIN_A
- **Préconditions** : R1 à 4 lignes, créancier A avec numéro d'émetteur ; e-mails des locataires renseignés (PA-1 compte portail, PA-2 fiche contact).
- **Données** : R1.
- **Étapes** :
  1. **Valider la remise** : lire « Valider cette remise ? Les débiteurs recevront un avis de prélèvement par e-mail. » › confirmer.
  2. Lire le statut, l'encart d'avis, la colonne « Avis de prélèvement » (rafraîchissement automatique tant que des avis sont « En attente »).
  3. Ouvrir les `.eml` du puits SMTP.
- **Attendu** :
  - Message « Remise validée » ; statut **Validée** ; « Validée le <date> » ; les valeurs du créancier (libellé, numéro d'émetteur, format) sont figées.
  - Encart « Avis de prélèvement » : « Envoi des avis en cours… » puis un résumé (envoyés, sans e-mail, désactivés, en échec). Colonne par ligne : « Envoyée », « Sans e-mail », « Désactivée » ou « Échec » avec l'adresse **masquée** et sa provenance (« compte portail » ou « fiche contact »).
  - Chaque `.eml` : agence, référence du mandat, numéro d'émetteur, IBAN **masqué**, montant, date de prélèvement 04/11/2026, période, bail ; jamais l'IBAN complet.
  - Validation refusée si les montants ont changé depuis la préparation (« Les montants ont changé depuis la préparation : actualisez la remise. »).
- **Gravité si échec** : Bloquant

### GL-08-039 — Renvoyer les avis ; avis désactivé

- **Rôle** : ADMIN_A
- **Préconditions** : R1 validée ; un locataire sans e-mail (PA-3, hors recette) ou l'événement désactivé.
- **Données** : désactiver l'événement « Prénotification d'un prélèvement bancaire » dans Notifications email puis le réactiver.
- **Étapes** :
  1. Détail de R1 : lire l'alerte « N locataires n'ont pas reçu l'avis de prélèvement » éventuelle.
  2. **Renvoyer les avis de prélèvement** › confirmer (« Renvoyer les avis de prélèvement aux débiteurs qui ne les ont pas reçus ? »).
  3. Désactiver l'événement, valider une autre remise de test, relire la colonne des avis ; réactiver l'événement.
- **Attendu** :
  - Message « Avis de prélèvement renvoyés » ; seuls les avis non partis sont renvoyés (aucun doublon d'e-mail pour ceux déjà « Envoyée »).
  - Événement désactivé : les lignes affichent « Désactivée » et aucun e-mail ne part.
  - Le renvoi n'est plus possible à partir de la date de prélèvement.
- **Gravité si échec** : Majeur

### GL-08-040 — Retirer une ligne d'une remise validée

- **Rôle** : ADMIN_A
- **Préconditions** : R1 validée (4 lignes) — jouer ce cas sur une remise de test R-T (créancier B, 2 lignes) pour préserver R1.
- **Données** : R-T validée à 2 lignes.
- **Étapes** :
  1. **Retirer** sur une ligne : lire l'avertissement « Le locataire a déjà reçu l'avis de prélèvement : prévenez-le que ce prélèvement n'aura pas lieu. » › Retirer.
  2. Sur la dernière ligne pendante : survoler **Retirer**.
- **Attendu** :
  - Ligne retirée (Annulée) ; total recalculé.
  - Pour la dernière ligne : bouton désactivé avec l'infobulle « La dernière ligne d'une remise validée ne se retire pas : annulez la remise. »
  - Annuler R-T ensuite (voir GL-08-044).
- **Gravité si échec** : Majeur

### GL-08-041 — Produire le fichier de remise (CSV)

- **Rôle** : ADMIN_A
- **Préconditions** : R1 validée ; J (aujourd'hui) strictement avant la date de prélèvement.
- **Données** : R1.
- **Étapes** :
  1. **Produire le fichier** : lire « Produire le fichier de remise ? Il contient les IBAN complets : conservez-le avec soin. » et l'éventuelle alerte sur les avis non reçus › confirmer.
  2. Ouvrir le fichier téléchargé ; lire le bandeau et l'état.
- **Attendu** :
  - Message « Fichier PRL-2026-NNNN.csv téléchargé. » ; statut **Fichier produit** ; bandeau orange « Fichier produit mais remise pas encore marquée comme déposée à la banque : chargez le fichier sur votre banque en ligne, puis marquez la remise comme déposée. » ; « Fichier produit le <date> » ; actions « Télécharger à nouveau le fichier », « Marquer comme déposée à la banque ».
  - Fichier CSV (séparateur `;`, UTF-8 avec BOM) : en-tête `reference_remise;numero_emetteur;creancier;date_echeance;reference_operation;reference_mandat;date_signature_mandat;titulaire;iban;montant;devise;libelle` ; 4 lignes ; colonne `iban` = **IBAN complet** (seul endroit) ; `montant` 160000, 150000, 80000, 70000 (sans espace ni séparateur de milliers) ; `devise` XOF ; `libelle` `LOYER 11/2026 <numéro de bail>` en majuscules ; `date_echeance` 2026-11-04.
  - Réseau : `POST …/remittances/<id>/export` → 200 `text/csv; charset=utf-8`, `attachment`, `Cache-Control: no-store` ; l'événement d'audit « fichier produit » est écrit avant l'envoi.
- **Gravité si échec** : Bloquant

### GL-08-042 — Télécharger à nouveau : même fichier, mandats devenus inactifs signalés

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-041.
- **Données** : R1 ; suspendre le mandat de DD-8 entre-temps.
- **Étapes** :
  1. **Télécharger à nouveau le fichier** › confirmer (texte « Télécharger à nouveau le fichier de remise ? Il contient les IBAN complets. »).
  2. Suspendre le mandat de DD-8, puis retélécharger.
  3. Comparer les deux fichiers.
- **Attendu** :
  - Le fichier est identique (même contenu, mêmes montants) ; le compteur « Dernier téléchargement … (N fichiers produits) » augmente.
  - Avec le mandat suspendu, l'écran prévient que des mandats sont devenus inactifs avant le téléchargement ; le contenu reste celui du premier export.
  - Remettre le mandat de DD-8 actif (Réactiver).
- **Gravité si échec** : Majeur

### GL-08-043 — Marquer la remise comme déposée à la banque

- **Rôle** : ADMIN_A
- **Préconditions** : R1 « Fichier produit ».
- **Données** : R1.
- **Étapes** :
  1. **Marquer comme déposée à la banque** › confirmer (« Confirmer que le fichier a été chargé sur votre banque en ligne ? »).
- **Attendu** :
  - Message « Remise marquée comme déposée à la banque » ; statut **Déposée à la banque** ; bandeau bleu « Remise déposée à la banque le <date> » ; « Déposée à la banque le … » ; plus de bouton Produire/Valider/Annuler ; « Retour de la banque attendu » ; les boutons de constat apparaissent (mais ne sont utilisables qu'à partir de la date de prélèvement).
  - Une remise déposée ne s'annule plus.
- **Gravité si échec** : Majeur

### GL-08-044 — Annuler une remise (brouillon, validée, fichier produit)

- **Rôle** : ADMIN_A
- **Préconditions** : trois remises de test (créancier B) en brouillon, validée et « Fichier produit » ; les échéances de novembre de DD-6, DD-9, DD-10, DD-11 y sont engagées. Rejouer d'abord sur R-T avant R2 : R2 est préparée ensuite (GL-08-046).
- **Données** : motif « Erreur de période » ; pour « Fichier produit » : case d'acquittement.
- **Étapes** :
  1. Remise en brouillon › **Annuler la remise** : lire « Rien n'est encore parti : les échéances redeviendront disponibles pour une autre remise. Toutes les lignes seront annulées. Cette action est définitive. » › motif vide › Annuler la remise.
  2. Renseigner le motif › confirmer.
  3. Remise validée : texte « Les locataires ont déjà reçu un avis de prélèvement : prévenez-les … » ; remise « Fichier produit » : texte « Le fichier a déjà été produit (1 fois). S'il a été chargé sur la banque en ligne, annulez aussi la remise chez la banque … » et case « J'ai vérifié que ce fichier n'a pas été chargé sur la banque, ou je l'ai annulé chez elle ».
  4. Préparer de nouveau une remise pour le créancier B à J+1.
- **Attendu** :
  - Motif obligatoire (1 à 500 caractères) ; case d'acquittement obligatoire pour « Fichier produit » ; message « Remise annulée » ; statut **Annulée**, « Annulée le … », « Motif d'annulation » ; toutes les lignes « Annulée ».
  - Les échéances sont de nouveau disponibles : la nouvelle remise du créancier B reprend DD-6, DD-9, DD-10, DD-11 (270 000).
- **Gravité si échec** : Majeur

### GL-08-045 — Transitions de remise interdites

- **Rôle** : ADMIN_A
- **Préconditions** : une remise Validée, une Fichier produit, une Déposée, une Annulée (R-T…).
- **Données** : identifiants relevés.
- **Étapes** :
  1. Sur chaque statut, relever les boutons offerts (Brouillon : Actualiser, Valider, Annuler ; Validée : Renvoyer les avis, Produire le fichier, Annuler ; Fichier produit : Télécharger à nouveau, Renvoyer, Marquer déposée, Annuler ; Déposée : constats ; Annulée : aucun).
  2. Rejouer en console : `POST …/validate` sur une remise Validée ; `POST …/cancel` sur une Déposée ; `POST …/submit` sur une Brouillon.
- **Attendu** :
  - L'écran n'offre que les transitions permises.
  - Les requêtes rejouées répondent 409 « Transition impossible : la remise est au statut « … » » ; rien ne change.
- **Gravité si échec** : Majeur

### GL-08-046 — Préparer R2 (créancier B), valider, produire, déposer

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-044 ; mandats B actifs.
- **Données** : créancier B, date 04/11/2026.
- **Étapes** :
  1. Préparer R2 : 4 lignes (DD-6 120 000, DD-9 60 000, DD-10 50 000, DD-11 40 000) ; total **270 000**.
  2. Valider, Produire le fichier, Marquer comme déposée.
- **Attendu** :
  - R2 « Déposée à la banque » avec 4 lignes « À prélever » ; R1 et R2 sont toutes deux prêtes pour le retour de J+1. Relever les références des lignes `PRL-2026-NNNN-00x` de R2 (nécessaires au fichier de retour).
- **Gravité si échec** : Bloquant

### GL-08-047 — Double clic sur Valider, Produire le fichier et Annuler

- **Rôle** : ADMIN_A
- **Préconditions** : une remise de test au statut qui convient à chaque action.
- **Données** : remise de test R-T.
- **Étapes** :
  1. Double-cliquer très vite sur le bouton de confirmation de **Valider la remise**, de **Produire le fichier**, puis d'**Annuler la remise**.
- **Attendu** :
  - Une seule validation (la seconde requête reçoit « La remise vient d'être modifiée : rechargez la page » ou « Transition impossible … »), un seul e-mail d'avis par ligne, un seul export compté (« 1 fichier produit »), une seule annulation.
- **Gravité si échec** : Majeur

---

## F. Droits et isolation (jour J)

### GL-08-048 — Droits : lecture seule et gestion

- **Rôle** : LECTEUR_A puis AGENT_A
- **Préconditions** : créanciers, mandats et remises existants.
- **Données** : écrans Prélèvements.
- **Étapes** :
  1. LECTEUR_A : ouvrir Encaisser › Prélèvements, un mandat, le détail d'une remise ; tenter une action (créer un mandat, activer, préparer une remise, valider, constater).
  2. AGENT_A (gestionnaire) : refaire les actions de gestion.
- **Attendu** :
  - LECTEUR_A : selon ses droits, lecture seule (IBAN masqué) ou refus d'accès ; toute écriture répond 403 et l'écran affiche « Vous n'avez pas l'autorisation d'effectuer cette action. » (les boutons ne sont pas masqués pour ce rôle : consigner, Mineur). Le PDF d'autorisation et le scan (qui portent l'IBAN complet) sont refusés (403).
  - AGENT_A (gestionnaire) : gestion complète autorisée.
- **Gravité si échec** : Majeur

### GL-08-049 — Isolation : l'agence B ne voit rien de l'agence A

- **Rôle** : ADMIN_B
- **Préconditions** : relever `<mandateId>`, `<remittanceId>`, `<creditorId>`, `<lineId>` de l'agence A.
- **Données** : identifiants relevés.
- **Étapes** :
  1. Dans l'agence B : ouvrir Encaisser › Prélèvements › Mandats et Remises, chercher « REC-GL ».
  2. Ouvrir `/tenant/<tenantB>/rental/direct-debit/remittances/<remittanceId de A>`.
  3. Rejouer en console, avec `<tenantB>` : `GET …/mandates/<id>`, `GET …/mandates/<id>/authorization-pdf`, `GET …/mandates/<id>/signed-scan`, `PATCH …/creditors/<id>`, `POST …/remittances/<id>/export`, `POST …/lines/<lineId>/settle`.
  4. Dans B, créer un mandat avec le `leaseId` d'un bail de A.
- **Attendu** :
  - Aucune donnée de A dans les listes de B ; chaque appel rejoué répond **404** (jamais 403 « existe mais interdit », jamais un contenu) ; le mandat avec un bail de A est refusé comme un bail inexistant.
- **Gravité si échec** : Bloquant

---

## G. Retour de la banque — jour J+1 (04/11/2026)

### GL-08-050 — Constat avant la date de prélèvement : impossible

- **Rôle** : ADMIN_A
- **Préconditions** : R1 déposée, **le jour J** (avant la date de prélèvement).
- **Données** : ligne de DD-1.
- **Étapes** :
  1. Détail de R1 › **Constater le règlement** sur la ligne DD-1.
  2. Lire la fenêtre « Constater le règlement de PRL-…-001 ».
- **Attendu** :
  - Le champ « Date de valeur » indique « Entre la date de prélèvement (04/11/2026) et aujourd'hui. » avec « La date de prélèvement n'est pas encore passée : aucun constat n'est possible. » ; le bouton de confirmation ne permet pas de constater.
  - (Jouer ce cas le jour J ; les cas suivants à J+1.)
- **Gravité si échec** : Majeur

### GL-08-051 — Constater le règlement d'une ligne (DD-1)

- **Rôle** : ADMIN_A
- **Préconditions** : **J+1** ; R1 déposée ; échéance `11/2026` de DD-1 non payée.
- **Données** : ligne de DD-1 (160 000), date de valeur 04/11/2026.
- **Étapes** :
  1. **Constater le règlement** sur la ligne DD-1 › Date de valeur (par défaut aujourd'hui) › **Constater le règlement**.
  2. Lire la ligne, l'en-tête de R1 et l'état « Retour de la banque ».
  3. Ouvrir Encaisser › Paiements ; ouvrir le paiement créé ; Documents du bail DD-1.
- **Attendu** :
  - Message « Règlement constaté » ; ligne **Réglée** avec « Date de valeur ou de rejet » 04/11/2026, colonne « Paiement » : lien **Voir le paiement** (ou « Encaissé ») ; R1 reste « Déposée à la banque » ; état « Retour partiel ».
  - Paiement : méthode **Prélèvement bancaire**, 160 000, « Réussi », rattaché au bail DD-1 et à PA-1, daté 04/11/2026, référence = référence de la ligne ; échéance `11/2026` de DD-1 **Payé** (160 000).
  - Un **Reçu de loyer** est généré automatiquement (onglet Documents de DD-1, statut final) et n'est généré qu'une fois.
  - Compteur « Rejets consécutifs » du mandat remis à 0. Réseau : `POST …/remittances/<id>/lines/<lineId>/settle` → 200.
- **Gravité si échec** : Bloquant

### GL-08-052 — Date de valeur hors bornes

- **Rôle** : ADMIN_A
- **Préconditions** : J+1 ; ligne de DD-7 en attente.
- **Données** : dates 03/11/2026 (avant le prélèvement) et demain.
- **Étapes** :
  1. Constater le règlement de la ligne DD-7 avec 03/11/2026, puis avec demain (le calendrier grise les dates futures).
  2. Annuler la fenêtre.
- **Attendu** :
  - Date antérieure au prélèvement : refus lisible (400) ; date future impossible ; aucune ligne modifiée (DD-7 reste « À prélever »).
- **Gravité si échec** : Mineur

### GL-08-053 — Paiement issu d'un prélèvement : statut non modifiable à la main

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-051.
- **Données** : paiement « Prélèvement bancaire » de DD-1.
- **Étapes** :
  1. Détail de ce paiement › sélecteur de statut → « Annulé » › Confirmer.
- **Attendu** :
  - Refus « Ce paiement provient d'un prélèvement : constatez un rejet depuis la remise. » (409) ; le paiement reste « Réussi » et affecté.
- **Gravité si échec** : Majeur

### GL-08-054 — Constater un rejet avec frais (DD-3)

- **Rôle** : ADMIN_A
- **Préconditions** : J+1 ; ligne de DD-3 (150 000) en attente ; créancier A : frais 2 500, seuil 2.
- **Données** : date du rejet 04/11/2026, code `AC04`, motif « Compte clos ».
- **Étapes** :
  1. **Constater le rejet** sur DD-3 : lire « Des frais de rejet de 2 500 FCFA seront refacturés au débiteur. »
  2. Essayer sans code ni motif, puis avec le code `AC 04!` ; enfin `AC04` + « Compte clos » › **Constater le rejet**.
  3. Lire la ligne, le mandat de DD-3, l'échéance `11/2026` de DD-3, la liste des e-mails.
- **Attendu** :
  - Sans code ni motif : « Le code ou le motif est obligatoire (au moins un des deux). » ; code invalide : « Lettres, chiffres, tiret et tiret bas seulement (20 caractères au plus). » ; motif et code ≤ 500 et 20 caractères.
  - Message « Rejet constaté » ; ligne **Rejetée**, « Frais refacturés » 2 500 ; mandat de DD-3 « Rejets consécutifs » = **1** (seuil 2 : pas encore suspendu, aucun avertissement de suspension dans la fenêtre au 1ᵉʳ rejet).
  - L'échéance `11/2026` de DD-3 : Montant dû 200 000 + 2 500 = **202 500** (autres frais 2 500, élément « Frais de rejet de prélèvement »), toujours non payée ; la ligne peut être représentée.
  - Un e-mail « Rejet de prélèvement » part vers le locataire (montant, date, motif, frais) ; `.eml` sans IBAN complet.
  - Le compte du locataire reçoit une ligne « Ajustement » de 2 500 (voir `GL-09-…`) ; ces frais sont exclus des sommes dues au propriétaire.
- **Gravité si échec** : Bloquant

### GL-08-055 — Rejet tardif d'une ligne déjà réglée (DD-1)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-051 (DD-1 réglée, reçu généré) ; paiement non remboursé.
- **Données** : code `MD06`, motif « Contestation du débiteur », date du rejet 04/11/2026.
- **Étapes** :
  1. Sur la ligne DD-1 « Réglée » : **Constater un rejet tardif** : lire le titre « Constater un rejet tardif de PRL-…-001 » et l'avertissement.
  2. Renseigner code et motif › **Constater le rejet tardif**.
  3. Relire la ligne, le paiement, l'échéance, les documents.
- **Attendu** :
  - La fenêtre prévient que l'encaissement sera contre-passé et le reçu annulé.
  - Ligne **Rejetée** ; le paiement de DD-1 passe **Échoué** (affectation défaite) ; l'échéance `11/2026` redevient impayée (160 000 + 2 500 de frais = 162 500) ; le **Reçu de loyer** de ce paiement passe « Annulé » (VOID) ; « Rejets consécutifs » du mandat de DD-1 = 1.
  - Le solde du locataire revient à son niveau d'avant le règlement, augmenté des frais.
- **Gravité si échec** : Bloquant

### GL-08-056 — « Tout constater réglé » (DD-7, DD-8)

- **Rôle** : ADMIN_A
- **Préconditions** : J+1 ; lignes DD-7 et DD-8 de R1 en attente.
- **Données** : date de valeur 04/11/2026.
- **Étapes** :
  1. **Tout constater réglé** : date de valeur › confirmer.
  2. Lire la fenêtre « Constat de la remise ».
- **Attendu** :
  - « 2 lignes constatées réglées. » ; aucune ligne en échec ; lignes DD-7 et DD-8 **Réglées** ; deux paiements « Prélèvement bancaire » (80 000 et 70 000), échéances novembre **Payé**, deux reçus.
  - R1 : toutes les lignes traitées (DD-1 rejetée tardivement, DD-3 rejetée, DD-7 et DD-8 réglées) → état « Retour complet ».
  - Une ligne déjà traitée (cas concurrent) est listée en échec avec « Cette ligne vient d'être traitée : rechargez la page. ».
- **Gravité si échec** : Majeur

### GL-08-057 — Rejet qui atteint le seuil : suspension automatique

- **Rôle** : ADMIN_A
- **Préconditions** : J+1 ; R2 (créancier B, seuil de suspension **1**) déposée ; mandat de DD-11 actif.
- **Données** : rejet manuel de la ligne DD-11, code `AC01`.
- **Étapes** :
  1. Sur R2, **Constater le rejet** de DD-11 : lire l'avertissement « Ce rejet suspendra le mandat MDT-2026-NNNN (rejets consécutifs). »
  2. Confirmer ; relire le mandat de DD-11.
- **Attendu** :
  - L'avertissement s'affiche **avant** de confirmer ; après confirmation le mandat de DD-11 passe **Suspendu** avec le motif « Suspendu automatiquement après 1 rejets consécutifs. » (Rejets consécutifs = 1) ; l'événement d'audit critique « mandat suspendu automatiquement » est écrit.
  - Les frais de rejet du créancier B sont 0 : aucun frais refacturé.
  - Le mandat suspendu ne sera plus retenu dans une prochaine remise.
- **Gravité si échec** : Bloquant

### GL-08-058 — Représenter une échéance rejetée dans une nouvelle remise

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-054 (DD-3 rejetée, échéance 202 500 non payée) ; le mandat de DD-3 est actif.
- **Données** : créancier A, nouvelle date J+2 (05/11/2026).
- **Étapes** :
  1. Préparer une remise (créancier A, 05/11/2026).
- **Attendu** :
  - DD-3 est retenue de nouveau : montant = min(reste dû hors pénalités 202 500, plafond 150 000) = **150 000** (Plafonné) ; DD-1 (échéance impayée après rejet tardif) l'est aussi (162 500) si son mandat est actif ; les lignes réglées de R1 ne le sont pas.
  - Annuler cette remise ensuite (motif « Essai ») pour libérer les échéances.
- **Gravité si échec** : Majeur

---

## H. Import d'un fichier de retour (R2, jour J+1)

Fichier de test `retour-R2.csv` (UTF-8, séparateur `;`, à écrire avec un éditeur de texte, en remplaçant les références par celles relevées en GL-08-046 et la date par la date de prélèvement) :

```
reference_operation;statut;date;montant;code_rejet;motif
<REF-DD6>;REJETE;04/11/2026;120000;AC01;Compte inexistant
<REF-DD9>;REGLE;04/11/2026;60000;;
<REF-DD10>;REGLE;04/11/2026;45000;;
PRL-2026-9999-001;REGLE;04/11/2026;1000;;
ligne illisible sans separateurs
```

### GL-08-059 — Aperçu d'un fichier de retour (aucune écriture)

- **Rôle** : ADMIN_A
- **Préconditions** : J+1 ; R2 déposée ; les lignes DD-6, DD-9 et DD-10 de R2 sont en attente.
- **Données** : `retour-R2.csv`.
- **Étapes** :
  1. Encaisser › Prélèvements › Remises › **Importer un retour de la banque**.
  2. **Choisir un fichier CSV** › `retour-R2.csv` › lire l'aperçu.
- **Attendu** :
  - Résumé : « Règlements : 1 », « Rejets : 1 », « Ignorées : 2 », « Erreurs de lecture : 1 » ; alerte « Lignes illisibles du fichier : 1 » avec « Ligne 6 : … ».
  - Tableau « Ligne du fichier / Référence d'opération / Retour de la banque / Montant / Action / Raison de l'écart / Ligne rapprochée » : DD-6 « Rejetée » → « Constater le rejet » ; DD-9 « Réglée » → « Constater le règlement » ; DD-10 → « Ignorée » avec « Montant différent de celui de la ligne » ; la référence inventée → « Référence inconnue : aucune ligne de remise de l'agence ne porte cette référence ».
  - **Aucune** ligne n'est encore modifiée (R2 inchangée) ; réseau : `POST …/returns/preview` → 200.
- **Gravité si échec** : Bloquant

### GL-08-060 — Appliquer le fichier de retour

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-059.
- **Données** : même fichier.
- **Étapes** :
  1. **Appliquer** › lire « Confirmer l'application du fichier ? » › **Confirmer l'application**.
  2. Lire le résultat, puis R2 et la liste des remises.
- **Attendu** :
  - Message « Fichier retour-R2.csv importé. » ; « Réglées : 1 », « Rejetées : 1 », « En échec : 0 ».
  - R2 : DD-9 **Réglée** (paiement 60 000, échéance Payé, reçu), DD-6 **Rejetée** (mandat suspendu au seuil 1, comme en GL-08-057), DD-10 toujours **À prélever** ; DD-11 rejetée si GL-08-057 a été joué ; état « Retour partiel ».
  - Réseau : `POST …/returns/apply` → 200.
- **Gravité si échec** : Bloquant

### GL-08-061 — Rejouer le même fichier : aucun effet

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-060.
- **Données** : `retour-R2.csv`.
- **Étapes** :
  1. **Importer un retour de la banque** › même fichier.
- **Attendu** :
  - Alerte « Ce fichier a déjà été importé le <date>. » ; dans l'aperçu les lignes DD-6 et DD-9 sont « Ignorée » avec « Ligne déjà dans cet état » ; l'application ne crée aucun paiement ni rejet de plus (compteurs à 0).
- **Gravité si échec** : Majeur

### GL-08-062 — Lignes écartées : autres raisons

- **Rôle** : ADMIN_A
- **Préconditions** : R1 et R2 traitées ; une remise validée non produite (R-T) ; une ligne annulée.
- **Données** : fichier de test avec : une ligne déjà rejetée marquée REGLE (conflit) ; une ligne annulée ; une référence d'une remise non produite ; une date hors bornes (03/11/2026 ou demain).
- **Étapes** :
  1. Importer le fichier et lire la colonne « Raison de l'écart ».
- **Attendu** :
  - « Ligne déjà rejetée : un règlement ne peut pas la remplacer » (CONFLICT) ; « Ligne annulée » ; « Remise sans fichier produit » ; « Date hors de la période autorisée » ; aucune de ces lignes n'est appliquée ; un rejet tardif reçu par fichier sur une ligne réglée est signalé « Rejet tardif » et appliqué.
- **Gravité si échec** : Majeur

### GL-08-063 — Fichier illisible, trop gros, mauvais format

- **Rôle** : ADMIN_A
- **Préconditions** : fenêtre d'import ouverte.
- **Données** : fichier sans en-tête `reference_operation`; fichier de 3 Mo ; fichier `.xlsx` renommé ; fichier vide ; fichier de plus de 5 000 lignes.
- **Étapes** :
  1. Importer chaque fichier.
- **Attendu** :
  - Message d'erreur lisible (« Erreur lors de la lecture du fichier de retour » + cause : en-tête manquant, fichier trop gros — 2 Mo et 5 000 lignes au plus —, aucune ligne exploitable) ; « Le fichier ne contient aucune ligne exploitable. » pour un fichier vide ; jamais d'erreur 500 ni de page blanche ; la fenêtre reste utilisable.
- **Gravité si échec** : Majeur

### GL-08-064 — Historique des retours importés

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-060.
- **Données** : liste « Historique des retours de la banque ».
- **Étapes** :
  1. Sur la page Remises, lire l'historique sous la liste.
- **Attendu** :
  - Une ligne par fichier appliqué : Date, Fichier (retour-R2.csv), Lignes lues, Réglées, Rejetées, Ignorées, Erreurs, Importé par ; « Aucun fichier de retour importé » s'il n'y en a pas. Le fichier lui-même n'est pas conservé (empreinte et compteurs seulement).
- **Gravité si échec** : Mineur

### GL-08-065 — Règlement manuel de la dernière ligne (DD-10)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-060 (DD-10 à prélever).
- **Données** : date de valeur 04/11/2026.
- **Étapes** :
  1. Constater le règlement de la ligne DD-10 (50 000).
- **Attendu** :
  - Ligne réglée, paiement 50 000, échéance payée ; R2 : toutes les lignes traitées → « Retour complet ».
- **Gravité si échec** : Majeur

### GL-08-066 — Conséquences en aval d'un prélèvement réglé

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-051 (ou GL-08-056).
- **Données** : DD-7 (80 000, réglée).
- **Étapes** :
  1. Balance clients : solde du locataire de DD-7 ; Relevé : lignes « Règlement » ; Comptabilité › Journal : écriture d'encaissement ; compte du propriétaire si le bail en a un.
- **Attendu** :
  - Le solde du locataire reflète l'échéance payée (loyer facturé = règlement) ; une écriture « Loyer encaissé — règlement … » débite le compte **Banque A** (compte de trésorerie du créancier, pas la caisse) ; pour un bail avec propriétaire mandant, « Loyer encaissé » apparaît au compte du propriétaire (détails en `GL-09-…`).
- **Gravité si échec** : Majeur

---

### GL-08-067 — Suivre, relancer et annuler la signature électronique d'un mandat

- **Rôle** : ADMIN_A
- **Préconditions** : GL-08-027 (demande de signature envoyée sur DD-8, signataire n'ayant pas encore signé) ; un second mandat brouillon (DD-4) avec demande envoyée.
- **Données** : écran Signatures (Paramétrage › Signatures, `/tenant/<tenantId>/signatures`) et carte du mandat.
- **Étapes** :
  1. Ouvrir l'écran **Signatures** : trouver la demande du mandat (type mandat de prélèvement), son statut (en attente) et ouvrir le détail (signataires, contact masqué, historique).
  2. **Relancer** la demande ; ouvrir le nouvel e-mail.
  3. Pour DD-4 : **Annuler** la demande (confirmation « Annuler cette demande de signature ? »).
  4. Pour DD-8 : révoquer le mandat (motif « Essai ») avec la demande encore ouverte.
- **Attendu** :
  - La demande est listée avec ses compteurs (en cours, terminées…), le contact du signataire est masqué, le PDF source est téléchargeable (il contient l'IBAN complet : accès réservé aux détenteurs du droit de gestion des mandats, chaque lecture est auditée).
  - Relance : un nouveau lien est émis, l'ancien cesse de fonctionner ; annulation : les liens deviennent inutilisables (page publique « Lien invalide ou expiré ») et le mandat reste brouillon.
  - La révocation d'un mandat annule d'office la demande de signature ouverte ; le dépôt d'un scan papier aussi.
  - Le titre de la demande, les messages et la preuve ne contiennent que l'IBAN masqué.
- **Gravité si échec** : Majeur

### GL-08-068 — Configurer, personnaliser et réinitialiser les e-mails de prélèvement

- **Rôle** : ADMIN_A
- **Préconditions** : `GL-08-038` (avis envoyés avec le modèle par défaut) ; accès à Communication › Notifications email.
- **Données** : sujet « REC-GL Avis de prélèvement » ; événement « Rejet d'un prélèvement bancaire ».
- **Étapes** :
  1. Communication › **Notifications email** › « Choisir un événement déclencheur » › « Prénotification d'un prélèvement bancaire » : lire le destinataire « Locataire (débiteur) », le sujet et le corps par défaut, la liste des variables.
  2. Renseigner « Sujet personnalisé » = « REC-GL Avis de prélèvement » (laisser le corps vide) › **Enregistrer**.
  3. Valider et produire une remise de test (ou **Renvoyer les avis** d'une remise validée) et lire l'e-mail reçu.
  4. Cliquer **Réinitialiser au modèle par défaut** ; refaire un envoi.
  5. Répéter les étapes 1 et 4 pour « Rejet d'un prélèvement bancaire » et constater un rejet (voir `GL-08-054`).
- **Attendu** :
  - Messages « Template enregistré » puis « Template réinitialisé » ; l'interrupteur Activer affiche « Notification activée » / « Notification désactivée ».
  - L'e-mail suivant porte le sujet personnalisé, puis le sujet par défaut après réinitialisation ; le corps contient toujours l'IBAN **masqué**, le montant, la date, la référence du mandat, jamais l'IBAN complet.
  - L'e-mail de rejet cite montant, date, motif, frais éventuels et, le cas échéant, la suspension du mandat.
- **Gravité si échec** : Majeur

## I. Couverture

| Sous-fonctionnalité du classeur (Prélèvement bancaire)                                                   | Cas                                                                               |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Lister les créanciers de prélèvement                                                                     | GL-08-001, GL-08-003, GL-08-006                                                   |
| Créer un créancier                                                                                       | GL-08-003, GL-08-004, GL-08-005, GL-08-007                                        |
| Modifier ou désactiver un créancier                                                                      | GL-08-007, GL-08-008                                                              |
| Contrôler un IBAN ou un RIB (valide, RIB, normalisation, invalide, avertissement)                        | GL-08-009 à GL-08-013                                                             |
| Lister les mandats                                                                                       | GL-08-014, GL-08-028                                                              |
| Créer un mandat (validations, doublon, colocataire)                                                      | GL-08-014, GL-08-015, GL-08-016, GL-08-029                                        |
| Modifier un mandat                                                                                       | GL-08-017                                                                         |
| Télécharger l'autorisation de prélèvement (PDF)                                                          | GL-08-018                                                                         |
| Déposer / consulter le scan signé                                                                        | GL-08-019, GL-08-020                                                              |
| Activer un mandat (date de signature)                                                                    | GL-08-021, GL-08-022                                                              |
| Suspendre / réactiver un mandat                                                                          | GL-08-023, GL-08-024                                                              |
| Révoquer un mandat ; transitions interdites                                                              | GL-08-025, GL-08-026                                                              |
| Signature électronique de l'autorisation (facultatif) : envoi, page publique, suivi, relance, annulation | GL-08-027, GL-08-067 (envoi réel WhatsApp/SMS non vérifiable : e-mail seul testé) |
| Lister et consulter les remises                                                                          | GL-08-031, GL-08-046, GL-08-064                                                   |
| Préparer une remise                                                                                      | GL-08-030, GL-08-031, GL-08-033, GL-08-034                                        |
| Mandats non retenus d'une remise en brouillon                                                            | GL-08-032                                                                         |
| Actualiser une remise en brouillon                                                                       | GL-08-035                                                                         |
| Retirer une ligne d'une remise                                                                           | GL-08-036, GL-08-040                                                              |
| Valider une remise et prénotifier les débiteurs                                                          | GL-08-037, GL-08-038                                                              |
| Renvoyer les prénotifications ; notification « Prénotification d'un prélèvement bancaire »               | GL-08-039, GL-08-068                                                              |
| Adresse des avis (compte portail ou fiche contact)                                                       | GL-08-038                                                                         |
| Produire le fichier de remise (CSV générique)                                                            | GL-08-041, GL-08-042                                                              |
| Marquer une remise comme déposée                                                                         | GL-08-043                                                                         |
| Annuler une remise ; transitions interdites ; double clic                                                | GL-08-044, GL-08-045, GL-08-047                                                   |
| Constater le règlement d'un prélèvement                                                                  | GL-08-050, GL-08-051, GL-08-052, GL-08-053, GL-08-065                             |
| Constater le rejet (y compris tardif), notification « Rejet d'un prélèvement bancaire »                  | GL-08-054, GL-08-055, GL-08-057, GL-08-068                                        |
| Constater réglée toute une remise                                                                        | GL-08-056                                                                         |
| Importer un retour de la banque (aperçu puis application), rejeu, historique                             | GL-08-059 à GL-08-064                                                             |
| Représentation d'une échéance rejetée                                                                    | GL-08-058                                                                         |
| Conséquences en aval (paiement, reçu, solde, comptabilité)                                               | GL-08-051, GL-08-055, GL-08-066 (détail en `GL-09-…`)                             |
| Droits et isolation entre agences                                                                        | GL-08-048, GL-08-049                                                              |
| Prélèvement de copropriété (Syndic), prélèvements automatiques programmés                                | hors périmètre de ce fichier / non testables en interface                         |
