# 12 — Paiement en ligne et mobile money du locatif (parité Syndic)

**Module** : Gestion locative — chantier spec 049 (`specs/049-locatif-paiement-parite-syndic/`) : numéros de réception, déclaration mobile money au portail, validation ou rejet par le gestionnaire, paiement en ligne (revue, compte de collecte), relances, durcissement.

> **Numérotation.** Un fichier `12-portail-proprietaire.md` existe déjà. Cette fiche garde le nom `12-paiement-en-ligne-et-mobile-money.md` demandé ; les identifiants `GL-12-nnn` partagent donc le préfixe avec le portail propriétaire. Les cas de cette fiche commencent à `GL-12-101` pour éviter toute collision avec les cas `GL-12-001…` du portail propriétaire.

> **État d'écriture (mis à jour le 09/11/2026 : les écrans sont fusionnés, libellés à rejouer à la recette).** Écrite d'après `specs/049-…/spec.md` et `contracts.md` pendant que les lots 4 à 7 codent les écrans. Routes, règles, codes et montants sont ceux du contrat. Tout libellé d'écran absent du code au moment de la rédaction est marqué **« à confirmer à l'écran »** ; la liste est en fin de fichier. Si seul un libellé diffère, le testeur le signale, il ne conclut pas à une anomalie.

## Périmètre

- Numéros de réception de l'agence (opérateur + téléphone, compte de trésorerie dérivé), réglages de la déclaration (activation, capture exigée, lecture IA, alerte).
- Déclaration d'un paiement mobile money par le locataire (référence obligatoire, plafond, bornes de date, capture, lecture IA), annulation, suivi ; déclaration pour un tiers par le gestionnaire.
- Traitement par le gestionnaire : liste et filtres, validation avec ou sans correction de montant, rejet par motif, effets comptables, notifications.
- Paiement en ligne : liste, résumé, vérification, décision sur une tentative en REVIEW, compte de collecte et reversement, disponibilité durcie, liens publics.
- Relances de loyer : aperçu, envoi unitaire, envoi par lot, journal ; jamais d'envoi automatique.
- Droits par rôle, isolation entre agences, mobile 375 px et arabe (RTL) du portail locataire.

## Écrans et URL

| Écran                                      | URL                                                         | Libellé de menu                                                                              |
| ------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Paiements, onglet des déclarations         | `/tenant/<tenantId>/rental/payments?onglet=declarations`    | Encaisser › Paiements › « Déclarations en attente » (libellé et badge à confirmer à l'écran) |
| Numéros de réception                       | à confirmer à l'écran                                       | à confirmer à l'écran                                                                        |
| Réglages de la déclaration                 | à confirmer à l'écran                                       | à confirmer à l'écran                                                                        |
| Paiements en ligne (liste, détail, REVIEW) | à confirmer à l'écran                                       | à confirmer à l'écran                                                                        |
| Compte de collecte                         | à confirmer à l'écran                                       | à confirmer à l'écran                                                                        |
| Relances (aperçu, lot, journal)            | à confirmer à l'écran (échéances)                           | à confirmer à l'écran                                                                        |
| Passerelle de paiement (réglage)           | `/tenant/<tenantId>/settings/payment-gateway` (à confirmer) | Paramétrage › Passerelle de paiement                                                         |
| Portail locataire, Payer                   | `/tenant/payments`                                          | bouton « Déclarer un paiement » ; « mes déclarations » à confirmer à l'écran                 |
| Lien public d'échéance                     | `/payer` et `/payer/statut`                                 | (lien reçu par e-mail ou WhatsApp)                                                           |

## Prérequis

- Fichiers 05 (échéances), 06 (paiements, déclarations historiques), 11 (portail locataire) et 13 (rôles) joués ; cas à avoir passés : `GL-06-…` (comptes de trésorerie Mobile Money 5521 à 5524 créés à la demande), `GL-11-050` à `GL-11-056`.
- **Date de référence : 09/11/2026.** « Échu », « 3 jours ouvrés » et « moins de 7 jours » en dépendent ; à une autre date, recalculer.
- Environnement : puits SMTP local pour toute notification et relance ; WhatsApp neutralisé ; PaySecureHub en **simulateur** (jamais de prestataire réel) ; `SUBSCRIPTION_ENFORCEMENT=enforce`. Pour les cas de lecture IA : un fournisseur de vision de test configuré côté serveur pour le cas passant, et son absence pour le cas 409.
- Comptes : ADMIN_A, AGENT_A (gère les paiements), COMPTABLE_A (lecture seule), LECTEUR_A (aucun droit), ADMIN_B, LOCATAIRE_PORTAIL_2 (bail REC-GL-DECL), LOCATAIRE_PORTAIL (autre locataire de A).
- **Convention réseau** : comme au fichier 11, les contrôles `fetch` visent l'API de l'environnement avec `credentials:'include'` ; les identifiants se relèvent dans l'onglet Réseau, jamais saisis à la main.

## Comportements structurants (lus dans le contrat, à confirmer à l'écran)

- Un numéro de réception appartient à l'**agence**, pas à un bien ; son compte de trésorerie est **dérivé de l'opérateur** (jamais saisi). Unicité (agence, opérateur, téléphone normalisé E.164 `+225` + 10 chiffres, préfixes 01, 05, 07).
- La déclaration est **activée par défaut** ; la référence est **obligatoire** pour les nouvelles déclarations seulement ; capture facultative ; lecture IA désactivée ; alerte à 3 jours ouvrés (lundi à vendredi, sans jours fériés).
- Montants entiers en FCFA, plafond **5 000 000** ; `paidAt` entre maintenant − 90 jours et maintenant + 10 min.
- Toute nouvelle déclaration est de canal `MOBILE_MONEY`. La capture n'est **jamais** servie au locataire ; chaque lecture par le gestionnaire est journalisée.
- La validation crée un paiement du **montant retenu**, crédite le compte de trésorerie du numéro et affecte à l'échéance par le service d'allocation existant.
- Une tentative de paiement en ligne en REVIEW n'est **jamais** encaissée automatiquement ; seule la décision du gestionnaire tranche.
- Les relances sont **manuelles** ; l'aperçu n'écrit rien ; le lot recalcule chaque plan à l'envoi.

## Données créées par ce fichier

| Objet              | Valeur                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bail de référence  | **REC-GL-DECL** (fichier 06) : locataire LOCATAIRE_PORTAIL_2, loyer 120 000, charges 0 ; échéances 09/2026, 10/2026 et 11/2026 (échue le 05/11 au 09/11/2026), notées E09, E10, E11 |
| Numéro N1          | « REC-GL Orange » : Orange, `07 01 02 03 04` (→ `+2250701020304`)                                                                                                                   |
| Numéro N2          | « REC-GL Wave » : Wave, `05 01 02 03 04` (→ `+2250501020304`)                                                                                                                       |
| Numéros N3 et N4   | « REC-GL MTN » : MTN, `05 02 03 04 05` ; « REC-GL Moov » : Moov, `01 02 03 04 05`                                                                                                   |
| Numéro N5 (vierge) | « REC-GL Jetable » : Orange, `07 09 08 07 06`, jamais utilisé, créé pour la suppression                                                                                             |
| Déclarations       | références `REC-GL-…` (listées dans chaque cas) ; captures de test `preuve.png` (< 5 Mo), `preuve.pdf`, `gros.png` (6 Mo), `faux.exe`                                               |
| Paiements en ligne | tentatives simulées, dont une en REVIEW par motif (section H)                                                                                                                       |
| Reversement        | un virement `VIR-AAAA-NNNN` du compte 5525 vers une trésorerie de test                                                                                                              |

Les identifiants de ces objets sont relevés par ADMIN_A (cas GL-12-101 et suivants) pour les cas d'isolation de la section M.

---

## A. Numéros de réception

### GL-12-101 — Créer un numéro de réception par opérateur

- **Rôle** : ADMIN_A
- **Préconditions** : aucun numéro enregistré (état vide, à confirmer à l'écran).
- **Données** : N1 à N4 du tableau.
- **Étapes** :
  1. Ouvrir l'écran des numéros de réception › créer N1 (opérateur, téléphone `07 01 02 03 04`, libellé).
  2. Créer N2, N3, N4.
  3. Relever dans l'onglet Réseau les `id` et `treasuryAccountId` de chaque réponse.
- **Attendu** :
  - Chaque création répond **201** ; téléphone stocké normalisé `+2250701020304` (formats libres acceptés : `07 01 02 03 04`, `0701020304`, `+225 07 01 02 03 04`).
  - `treasuryAccountId` **dérivé** de l'opérateur : compte Mobile Money de l'opérateur (**5521 à 5524**), créé à la demande s'il manquait ; le formulaire n'offre **aucun** champ de compte.
  - Tri : actifs d'abord, puis opérateur, puis création. Libellé de 60 caractères au plus (61 : 400).
- **Gravité si échec** : Bloquant

### GL-12-102 — Doublon d'un numéro (agence + opérateur + téléphone)

- **Rôle** : ADMIN_A
- **Préconditions** : GL-12-101.
- **Données** : N1 recréé à l'identique ; N1 écrit `+225 0701 020304` ; même téléphone avec un autre opérateur.
- **Étapes** : créer chaque variante.
- **Attendu** :
  - Même opérateur + même téléphone, **quelle que soit l'écriture** : **409** `RENTAL_RECEIVING_NUMBER_DUPLICATE`, rien créé.
  - Même téléphone, autre opérateur : accepté (clé = agence + opérateur + téléphone) ; ce numéro de test est retiré à la fin du cas.
- **Gravité si échec** : Majeur

### GL-12-103 — Téléphone invalide et champs inconnus

- **Rôle** : ADMIN_A
- **Préconditions** : —
- **Données** : `12345`, `0301020304` (préfixe 03), `+33 6 12 34 56 78`, `abcdefghij`, vide.
- **Étapes** : créer un numéro avec chaque valeur ; par la console, `POST` avec un champ inconnu (ex. `treasuryAccountId`).
- **Attendu** :
  - Téléphone invalide : **400** `INVALID_PHONE` ; vide : 400 `VALIDATION_ERROR` désignant le champ ; rien créé.
  - Champ inconnu, dont `treasuryAccountId` : 400 `VALIDATION_ERROR` (corps strict).
- **Gravité si échec** : Majeur

### GL-12-104 — Modifier un numéro et le désactiver

- **Rôle** : ADMIN_A
- **Préconditions** : GL-12-101 ; puits SMTP vidé.
- **Données** : N4 renommé « REC-GL Moov bis » ; N4 désactivé puis réactivé.
- **Étapes** :
  1. Modifier le libellé de N4 ; recharger.
  2. Désactiver N4 (libellé du contrôle à confirmer à l'écran) ; lire la liste filtrée « actifs » puis « inactifs ».
  3. `PATCH` sans aucun champ (console).
- **Attendu** :
  - Libellé mis à jour ; filtres `?active=true|false` conformes ; N4 inactif **n'est plus proposé** au locataire.
  - `PATCH` vide : 400 `VALIDATION_ERROR` (au moins un champ).
  - Création, changement et désactivation notifient les gestionnaires (`RENTAL_RECEIVING_NUMBER_CHANGED`, e-mail dans le puits) et sont audités.
- **Gravité si échec** : Majeur

### GL-12-105 — Suppression d'un numéro vierge

- **Rôle** : ADMIN_A
- **Préconditions** : N5 créé, sans aucune déclaration.
- **Données** : N5.
- **Étapes** : supprimer N5 ; recharger la liste.
- **Attendu** : `DELETE` répond 200 `{ deleted: true, deactivated: false }` ; N5 disparaît définitivement ; audit de désactivation présent.
- **Gravité si échec** : Majeur

### GL-12-106 — Désactivation douce d'un numéro portant des déclarations

- **Rôle** : ADMIN_A
- **Préconditions** : au moins une déclaration liée à N1 (cas GL-12-121) ; rejouer ce cas après lui.
- **Données** : N1.
- **Étapes** :
  1. Supprimer N1 depuis l'écran.
  2. Ouvrir la déclaration liée côté gestionnaire.
  3. Sur un autre numéro portant des déclarations, changer l'opérateur puis relire ses déclarations.
- **Attendu** :
  - 200 `{ deleted: false, deactivated: true }`, **jamais d'erreur** ; N1 reste en base avec `active=false` ; les déclarations liées gardent leur numéro lisible.
  - Après changement d'opérateur ou de téléphone, `receivingNumber` est relu du numéro courant mais **l'opérateur de la déclaration reste celui déclaré**.
  - Numéro inactif forcé au portail : 404 `RENTAL_RECEIVING_NUMBER_NOT_FOUND` ; côté gestionnaire : 400 `RENTAL_RECEIVING_NUMBER_INACTIVE`.
  - Remettre N1 actif (`PATCH`) pour la suite.
- **Gravité si échec** : Majeur

---

## B. Réglages de la déclaration

### GL-12-110 — Valeurs par défaut sans ligne en base

- **Rôle** : ADMIN_A
- **Préconditions** : agence sans réglage enregistré (ADMIN_B si vierge).
- **Données** : —
- **Étapes** : ouvrir l'écran des réglages ; relever `GET …/rental/declared-payment/settings` deux fois.
- **Attendu** :
  - `enabled: true`, `proofRequired: false`, `aiPrefillEnabled: false`, `reviewAlertBusinessDays: 3`, `aiReadsMonthlyQuota: 300`.
  - Un `GET` n'écrit rien : aucune ligne ni audit créé par les lectures.
- **Gravité si échec** : Majeur

### GL-12-111 — Modifier les réglages, bornes de l'alerte

- **Rôle** : ADMIN_A
- **Préconditions** : GL-12-110.
- **Données** : alerte à 5, 0, 1, 15, 16, 2,5, « abc » ; `PUT` vide ; champ inconnu.
- **Étapes** :
  1. Enregistrer 5, recharger.
  2. Essayer 0, 1, 15, 16, 2,5, « abc » (écran puis console).
  3. `PUT` sans champ ; `PUT` avec champ inconnu.
- **Attendu** :
  - 1 et 15 acceptés (bornes incluses) ; 0, 16, décimal, texte : 400 `VALIDATION_ERROR` ; `PUT` vide ou champ inconnu : 400.
  - Chaque `PUT` qui change une valeur est audité (`RENTAL_DECLARED_PAYMENT_SETTINGS_UPDATED`) ; un `PUT` sans changement n'écrit pas d'audit.
  - Remettre l'alerte à 3 à la fin du cas.
- **Gravité si échec** : Majeur

---

## C. Déclaration d'un paiement au portail

Bail REC-GL-DECL (LOCATAIRE_PORTAIL_2), réglages par défaut, N1 et N2 actifs, au 09/11/2026.

### GL-12-120 — Disponibilité et formulaire

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : GL-12-101 ; réglages par défaut.
- **Données** : —
- **Étapes** :
  1. **Payer** › **Déclarer un paiement**.
  2. Lire la liste des numéros et les champs.
  3. Relever `GET /api/portal/tenant/payments/declare/availability`.
- **Attendu** :
  - Le formulaire propose les numéros **actifs** (numéro complet visible), l'opérateur, la référence, le montant, la date-heure, le téléphone payeur facultatif, les notes (500 max) et la capture facultative (libellés à confirmer à l'écran).
  - `availability` : `enabled: true`, `available: true`, `receivingNumbers` = N1 à N4 actifs, `aiPrefillAvailable: false`, `maxAmount: 5000000`, `instructions: null`.
- **Gravité si échec** : Majeur

### GL-12-121 — Déclaration nominale avec référence normalisée

- **Rôle** : LOCATAIRE_PORTAIL_2, puis ADMIN_A
- **Préconditions** : GL-12-120 ; E09 de 120 000 non payée.
- **Données** : échéance E09 ; N1 ; opérateur Orange ; montant **120 000** ; date-heure du jour 09:30 ; référence saisie `om 251109.ab12` ; téléphone payeur `07 11 22 33 44` ; sans capture.
- **Étapes** :
  1. Remplir et valider.
  2. Côté locataire, ouvrir « mes déclarations ».
  3. ADMIN_A : liste des déclarations (statut En attente).
- **Attendu** :
  - **201** ; référence **normalisée `OM251109.AB12`** ; téléphone payeur `+2250711223344` ; statut **En attente** ; canal mobile money ; `duplicateSuspected: false`.
  - E09 reste impayée (une déclaration n'est pas un paiement) ; côté gestionnaire, l'échéance porte `pendingDeclaration` (120 000, référence).
  - Succès sans capture : elle est facultative par défaut.
- **Gravité si échec** : Bloquant

### GL-12-122 — Référence obligatoire et invalide

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : GL-12-120.
- **Données** : référence vide ; `AB1` ; 41 caractères ; `OM 25/11` ; `OM-2511.A` ; 4 et 40 caractères valides.
- **Étapes** : déclarer 1 000 avec chaque référence.
- **Attendu** :
  - Vide, `AB1`, 41 caractères, `/` : **400** `RENTAL_DECLARATION_REFERENCE_INVALID` (motif `^[A-Z0-9.-]{4,40}$` après normalisation) ; rien créé.
  - `OM-2511.A` et les bornes 4 et 40 : acceptées. Annuler les déclarations de test à la fin (GL-12-141).
- **Gravité si échec** : Majeur

### GL-12-123 — Montant : plafond 5 000 000 et validité

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : GL-12-120.
- **Données** : `0`, `-100`, `1000,5`, `1`, `5000000`, `5000001`, `999999999999` (références `REC-GL-MT-01`…).
- **Étapes** : déclarer chaque montant.
- **Attendu** :
  - `0`, négatif, décimal : 400 `RENTAL_DECLARATION_AMOUNT_INVALID`.
  - `5000001` et `999999999999` : 400 `RENTAL_DECLARATION_AMOUNT_TOO_HIGH` (message clair, **jamais 500**).
  - `1` et `5000000` acceptés (montant **libre**, sans lien avec le dû). Annuler les déclarations acceptées à la fin.
- **Gravité si échec** : Majeur

### GL-12-124 — Date et heure du paiement hors bornes

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : GL-12-120.
- **Données** : maintenant + 5 min ; + 15 min ; − 89 jours ; − 91 jours ; ancien champ `paymentDate` (console).
- **Étapes** : déclarer 1 000 pour chaque date (références distinctes).
- **Attendu** :
  - - 15 min et − 91 jours : 400 `RENTAL_DECLARATION_DATE_OUT_OF_RANGE` ; + 5 min et − 89 jours : acceptés.
  - L'ancien champ `paymentDate` reste accepté comme alias de `paidAt`.
- **Gravité si échec** : Majeur

### GL-12-125 — Capture facultative, exigée, formats et taille

- **Rôle** : LOCATAIRE_PORTAIL_2, ADMIN_A (réglage)
- **Préconditions** : GL-12-120 ; `preuve.png`, `preuve.pdf`, `gros.png` (6 Mo), `faux.exe`, un `.png` renommé `.pdf`.
- **Données** : références `REC-GL-CAP-01`…
- **Étapes** :
  1. `proofRequired=false` : déclarer avec `preuve.png`, avec `preuve.pdf`, sans capture.
  2. Essayer `gros.png`, `faux.exe`, le faux PDF.
  3. ADMIN_A passe `proofRequired=true` ; déclarer sans capture, puis avec `preuve.png`.
  4. Remettre `proofRequired=false`.
- **Attendu** :
  - JPEG, PNG, WebP, PDF acceptés (type **réel**, pas l'extension) ; sans capture : accepté ; 5 Mo juste : accepté.
  - 6 Mo : **413** `RENTAL_DECLARATION_PROOF_TOO_LARGE` ; `.exe` ou faux PDF : 400 `RENTAL_DECLARATION_PROOF_INVALID`.
  - `proofRequired=true` sans capture : 400 `RENTAL_DECLARATION_PROOF_REQUIRED` ; avec capture : 201.
  - Le locataire ne peut jamais relire la capture (aucune adresse de fichier dans ses réponses).
- **Gravité si échec** : Majeur

### GL-12-126 — Déclaration désactivée ou sans numéro actif

- **Rôle** : ADMIN_A, puis LOCATAIRE_PORTAIL_2
- **Préconditions** : GL-12-101.
- **Données** : `enabled=false` ; puis `enabled=true` avec tous les numéros inactifs.
- **Étapes** :
  1. ADMIN_A désactive la déclaration ; le locataire ouvre « Déclarer un paiement » et tente un `POST` en console.
  2. ADMIN_A réactive et désactive tous les numéros ; le locataire rouvre le formulaire.
  3. Tout remettre en état.
- **Attendu** :
  - Cas 1 : `enabled: false`, `available: false` ; l'écran n'offre plus la déclaration (message à confirmer à l'écran) ; `POST` : **400** `RENTAL_DECLARED_PAYMENT_DISABLED`.
  - Cas 2 : `enabled: true` mais `available: false` ; `POST` : 400 `RENTAL_DECLARED_PAYMENT_DISABLED` (aucun numéro actif).
- **Gravité si échec** : Majeur

### GL-12-127 — Numéro, échéance et téléphone payeur invalides

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : GL-12-120 ; une échéance payée ou annulée du bail ; une échéance de LOCATAIRE_PORTAIL.
- **Données** : `receivingNumberId` inactif ; échéance soldée ; échéance d'un autre locataire ; `payerPhone` `123`.
- **Étapes** : `POST` en console pour chaque variante.
- **Attendu** :
  - Numéro inactif ou inconnu : 404 `RENTAL_RECEIVING_NUMBER_NOT_FOUND` ; échéance soldée, annulée ou d'un autre locataire : **404** `RENTAL_DECLARATION_INSTALLMENT_INVALID` (même réponse qu'un inexistant) ; téléphone : 400 `INVALID_PHONE`.
  - Sans `installmentId` : déclaration **libre** sur le bail par défaut, acceptée.
- **Gravité si échec** : Majeur

---

## D. Doublons

### GL-12-130 — Doublon bloquant : même référence, même numéro

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : déclaration `OM251109.AB12` sur N1 en attente (GL-12-121).
- **Données** : même référence écrite `om251109.ab12` sur N1 ; sur N2 ; sur N1 après annulation de la première.
- **Étapes** : déclarer chaque variante.
- **Attendu** :
  - Même référence normalisée + même numéro, déclaration existante **PENDING ou APPROVED** : **409** `RENTAL_DECLARATION_DUPLICATE_REFERENCE` ; le portail ne renvoie **pas** l'identifiant de l'autre déclaration.
  - Même référence sur un **autre** numéro : acceptée ; après annulation ou rejet de la première : référence de nouveau libre.
- **Gravité si échec** : Majeur

### GL-12-131 — Doublon probable : alerte sans blocage

- **Rôle** : LOCATAIRE_PORTAIL_2, puis ADMIN_A
- **Préconditions** : D1 (E10, 75 000, aujourd'hui, `REC-GL-DP-01`) en attente.
- **Données** : D2 : mêmes montant, jour et échéance, référence `REC-GL-DP-02` ; D3 : même montant, **autre échéance**.
- **Étapes** : déclarer D2 puis D3 ; ADMIN_A ouvre la liste et filtre « signalées ».
- **Attendu** :
  - D2 créée (**201**) avec `duplicateSuspected: true` ; D3 avec `false`.
  - Côté gestionnaire D2 porte l'alerte **`DUPLICATE_SUSPECTED`** et apparaît sous `flagged=true` ; D1 et D3 non. Rien n'est bloqué.
- **Gravité si échec** : Majeur

---

## E. Traitement par le gestionnaire

### GL-12-140 — Liste, filtres, recherche, badge

- **Rôle** : ADMIN_A
- **Préconditions** : déclarations PENDING, APPROVED, REJECTED, CANCELED créées par les cas C à E.
- **Données** : recherche par nom du locataire, référence, téléphone payeur, numéro de bail `REC-GL-DECL` ; `from`/`to` sur `paidAt` ; statut ; « signalées ».
- **Étapes** :
  1. Ouvrir la liste sans filtre ; changer chaque filtre.
  2. Relever `GET …/payment-declarations/pending-count`.
- **Attendu** :
  - Sans statut : **En attente** par défaut ; tri : les plus anciennes en attente d'abord, sinon création décroissante.
  - Recherche sur nom, référence, téléphone payeur, bail ; `from` et `to` **jours inclus** ; « signalées » = doublon probable, montant différent du dû, ou en retard.
  - **En retard** = en attente depuis plus de `reviewAlertBusinessDays` jours ouvrés ; avec 3, une déclaration du vendredi n'est en retard que le jeudi suivant (lundi, mardi, mercredi comptés, week-end non).
  - `pending-count` = `{ pending, overdue }` = badge de menu, même agence seulement.
- **Gravité si échec** : Majeur

### GL-12-141 — Annulation par le locataire

- **Rôle** : LOCATAIRE_PORTAIL_2, puis LOCATAIRE_PORTAIL
- **Préconditions** : D4 en attente (E10, 40 000, `REC-GL-AN-01`).
- **Données** : D4 ; une déclaration rejetée ; une déclaration d'un autre locataire.
- **Étapes** :
  1. Annuler D4 depuis « mes déclarations » (confirmation à confirmer à l'écran).
  2. Annuler la déclaration rejetée, puis D4 une seconde fois.
  3. LOCATAIRE_PORTAIL tente d'annuler une déclaration de LOCATAIRE_PORTAIL_2 (console).
- **Attendu** :
  - D4 passe à **Annulée** (`CANCELED`, date posée), disparaît du filtre « en attente » du gestionnaire ; audit `RENTAL_PAYMENT_DECLARATION_CANCELED`.
  - Déclaration non en attente : **409** `RENTAL_DECLARATION_ALREADY_REVIEWED`.
  - Déclaration d'un autre locataire : **404** identique à un inexistant.
- **Gravité si échec** : Majeur

### GL-12-142 — Rejet par motif

- **Rôle** : ADMIN_A, puis LOCATAIRE_PORTAIL_2
- **Préconditions** : cinq déclarations en attente D5 à D9 (`REC-GL-RJ-01`…05).
- **Données** : D5 `NOT_FOUND` sans note ; D6 `AMOUNT_MISMATCH` note de 10 caractères ; D7 `REFERENCE_USED` ; D8 `WRONG_NUMBER` note de 500 caractères ; D9 `OTHER` avec : aucune note, 9 caractères, 501 caractères, puis « Capture illisible REC-GL ».
- **Étapes** :
  1. Rejeter D5 à D8 avec leur motif.
  2. D9 : essayer `OTHER` sans note, avec 9, avec 501, puis la note valide.
  3. Rejeter D5 une seconde fois.
  4. Appeler le rejet avec l'ancien corps `{ reviewNotes }` sans motif sur une déclaration en attente.
- **Attendu** :
  - `NOT_FOUND`, `AMOUNT_MISMATCH`, `REFERENCE_USED`, `WRONG_NUMBER` : note **facultative** (si fournie, 10 à 500) ; D5 sans note accepté.
  - `OTHER` sans note : **400** `RENTAL_DECLARATION_REJECT_NOTE_REQUIRED` ; note de 9 ou 501 : 400 `VALIDATION_ERROR` ; 10 et 500 acceptés.
  - Statut **Rejetée**, motif et note visibles au gestionnaire ; le locataire voit « Rejetée » (visibilité du motif pour lui : à confirmer à l'écran) ; aucun paiement créé, échéance inchangée.
  - Second rejet : **409** `RENTAL_DECLARATION_ALREADY_REVIEWED`.
  - Ancien corps sans motif : lu comme `OTHER` avec `reviewNotes` en note ; audit `RENTAL_PAYMENT_DECLARATION_REJECTED`.
- **Gravité si échec** : Majeur

### GL-12-143 — Validation sans correction

- **Rôle** : ADMIN_A, puis LOCATAIRE_PORTAIL_2
- **Préconditions** : D10 en attente sur E09 : **120 000**, N1, `REC-GL-OK-01`.
- **Données** : montant retenu non modifié.
- **Étapes** :
  1. Noter le reste dû de E09 (120 000) et le solde du compte de trésorerie de N1.
  2. Valider D10 sans modifier le montant.
  3. Relire E09, le compte de trésorerie, le paiement créé, le relevé du locataire.
- **Attendu** :
  - 200, `corrected: false` ; **paiement mobile money de 120 000**, réussi, affecté à E09 qui passe **Payée**, reste 0 ; `installment` de la réponse reflète l'échéance après affectation.
  - Compte de trésorerie du numéro **+ 120 000** exactement ; solde du locataire cohérent avec le fichier 06.
  - Aucun événement `APPROVED_WITH_CORRECTION` ; la validation reste journalisée par l'audit du service d'approbation.
  - Le locataire voit la déclaration **Approuvée** et le paiement (sans doublon).
- **Gravité si échec** : Bloquant

### GL-12-144 — Validation avec correction de montant

- **Rôle** : ADMIN_A
- **Préconditions** : D11 en attente sur E10, déclarée **100 000**, N2, `REC-GL-CR-01` ; E10 dû 120 000.
- **Données** : montant retenu **80 000** ; notes : vide, 9 caractères, 501 caractères, « Capture : 80 000 reçus REC-GL » ; montants retenus `0` et `5000001`.
- **Étapes** :
  1. Valider avec 80 000 sans note, avec 9, avec 501.
  2. Essayer 0 puis 5 000 001 avec une note valide.
  3. Valider avec 80 000 et la note valide.
  4. Relire E10, le compte de N2 et la déclaration.
- **Attendu** :
  - Montant ≠ déclaré sans note : **400** `RENTAL_DECLARATION_CORRECTION_NOTE_REQUIRED` ; note hors 10 à 500 : 400 `VALIDATION_ERROR` ; 0 ou > 5 000 000 : **400** `RENTAL_DECLARATION_ACCEPTED_AMOUNT_INVALID`.
  - Validation correcte : `corrected: true` ; paiement de **80 000** (et non 100 000) ; E10 payée 80 000, **reste 40 000**, statut Partiel ; compte de N2 **+ 80 000** ; événement d'audit **`APPROVED_WITH_CORRECTION`** ; la déclaration garde le montant déclaré (100 000) et affiche le montant retenu (80 000).
  - Montant retenu supérieur au dû (ex. 150 000 sur 40 000 restants) : surplus géré par l'allocation existante (avance), à contrôler au relevé.
  - Ancien corps `{ reviewNotes, treasuryAccountId }` : toujours valide ; le `treasuryAccountId` fourni prime sur le compte dérivé.
- **Gravité si échec** : Bloquant

### GL-12-145 — Validation d'une déclaration libre, sans échéance

- **Rôle** : ADMIN_A
- **Préconditions** : déclaration libre D12, 50 000, `REC-GL-LB-01`.
- **Données** : —
- **Étapes** : valider D12 ; lire le paiement.
- **Attendu** : `installment: null` dans la réponse ; paiement mobile money 50 000 **non affecté** (avance), à affecter ensuite (fichier 06).
- **Gravité si échec** : Majeur

### GL-12-146 — Double validation concurrente

- **Rôle** : ADMIN_A et AGENT_A (deux sessions)
- **Préconditions** : D13 en attente (E11, 120 000, `REC-GL-CC-01`).
- **Données** : deux onglets sur la même déclaration.
- **Étapes** : cliquer **Valider** presque simultanément ; puis valider dans l'un et rejeter dans l'autre.
- **Attendu** : **un seul** paiement créé ; le second appel reçoit **409** `RENTAL_DECLARATION_ALREADY_REVIEWED` ; compte de trésorerie crédité **une seule fois**.
- **Gravité si échec** : Bloquant

### GL-12-147 — Déclaration pour un tiers par le gestionnaire

- **Rôle** : ADMIN_A (puis COMPTABLE_A refusé)
- **Préconditions** : REC-GL-DECL ; E10 ; N1 actif.
- **Données** : bail REC-GL-DECL ; E10 ; 60 000 ; `REC-GL-TP-01` ; capture `preuve.png` ; variantes : échéance d'un autre bail, numéro inactif, référence existante.
- **Étapes** :
  1. Créer la déclaration depuis l'écran du gestionnaire (bouton à confirmer à l'écran).
  2. Relire côté gestionnaire puis côté locataire.
  3. Tenter les variantes.
- **Attendu** :
  - **201**, En attente ; déclarant enregistré = locataire principal ; `declaredBy` du DTO = `{ type: 'MANAGER', userId, name }` avec l'utilisateur de la session (**jamais lu du corps** : un `declaredByUserId` envoyé en console est refusé ou ignoré) ; audit `RENTAL_PAYMENT_DECLARATION_CREATED_FOR_THIRD_PARTY`.
  - Le locataire la voit dans « mes déclarations » et peut l'annuler.
  - Échéance d'un autre bail : 404 `RENTAL_DECLARATION_INSTALLMENT_INVALID` ; numéro inactif : 400 `RENTAL_RECEIVING_NUMBER_INACTIVE` ; référence existante : 409 ; mêmes contrôles de montant, date et téléphone qu'au portail.
- **Gravité si échec** : Majeur

### GL-12-148 — Consultation de la capture, journalisée

- **Rôle** : ADMIN_A, COMPTABLE_A, LOCATAIRE_PORTAIL_2
- **Préconditions** : une déclaration avec capture (GL-12-125) et une sans.
- **Données** : —
- **Étapes** : ouvrir la capture depuis le détail et relever la requête ; ouvrir celle de la déclaration sans capture ; coller l'adresse dans un navigateur non connecté ; LOCATAIRE_PORTAIL_2 tente la même adresse.
- **Attendu** :
  - Flux authentifié, `Content-Type` réel, `Content-Disposition: inline`, `Cache-Control: private, no-store` ; jamais d'adresse statique publique.
  - Sans capture : 404 ; sans session : 401 ; locataire : refusé (403).
  - Chaque lecture journalisée (`RENTAL_PAYMENT_DECLARATION_PROOF_VIEWED`). COMPTABLE_A (lecture) peut la lire.
- **Gravité si échec** : Majeur

---

## F. Lecture IA de la capture

### GL-12-150 — Lecture désactivée : 409

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL_2
- **Préconditions** : `aiPrefillEnabled=false` (défaut) ; variante : activé mais **aucun fournisseur** de vision.
- **Données** : `preuve.png`.
- **Étapes** : vérifier l'absence du bouton de lecture ; `POST …/payments/declare/lecture` en console ; envoyer 6 appels en une minute.
- **Attendu** :
  - `aiPrefillAvailable: false` : pas de bouton ; la déclaration manuelle reste possible.
  - `POST` : **409** `RENTAL_PROOF_READ_DISABLED`. Limiteurs avant le parseur : 5 par minute et 30 par jour par compte (6e appel : 429 du limiteur générique).
- **Gravité si échec** : Majeur

### GL-12-151 — Lecture activée : champs lus, champs non lus

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL_2
- **Préconditions** : `aiPrefillEnabled=true`, fournisseur de test ; captures : lisible (45 000, `OM251109.CD34`, N1, Orange), partielle (montant seul), non-paiement.
- **Données** : trois captures.
- **Étapes** :
  1. Relever `availability` : `aiPrefillAvailable: true`.
  2. Lire chaque capture ; vérifier le préremplissage.
  3. Modifier un champ lu puis déclarer en renvoyant `proofReadId`.
  4. Relire côté gestionnaire ; rejouer avec un fichier `proof` **et** un `proofReadId`.
- **Attendu** :
  - 200 `ProofReadResultDto` ; lisible : `quality: 'OK'`, montant, référence, opérateur lus, `matchedReceivingNumberId` = N1 ; partielle : champs non lus **`null`** (jamais devinés) ; non-paiement : `quality: 'NOT_A_PAYMENT'`.
  - `warnings` possibles : `RECIPIENT_NOT_A_RECEIVING_NUMBER`, `REFERENCE_ALREADY_DECLARED`.
  - Capture conservée 24 h ; renvoyer `proofReadId` la fait devenir la preuve ; la déclaration marque `aiPrefilled` et les champs modifiés (`aiEditedFields`).
  - `proofReadId` + fichier : 400 `RENTAL_DECLARATION_PROOF_INVALID` ; `proofReadId` inconnu, d'un autre contact, déjà utilisé ou expiré : **409** `RENTAL_PROOF_READ_INVALID`.
- **Gravité si échec** : Majeur

### GL-12-152 — Panne fournisseur : 200 UNREADABLE

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : fournisseur de vision en panne simulée.
- **Données** : `preuve.png`.
- **Étapes** : lancer la lecture.
- **Attendu** : **200** (pas 5xx), `quality: 'UNREADABLE'`, tous les champs `null`, `confidence: {}` ; l'écran propose la saisie manuelle. Seules l'indisponibilité (409) et le quota (429) sont des erreurs.
- **Gravité si échec** : Majeur

### GL-12-153 — Quota atteint : 429 avec portée

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : lecture activée ; quotas abaissés ou consommés (30 par mois par contact, 300 par mois par agence).
- **Données** : lectures jusqu'à refus ; 6 lectures en moins d'une minute.
- **Étapes** : lire jusqu'au refus ; relever `data.scope`.
- **Attendu** :
  - **429** `RENTAL_PROOF_READ_QUOTA_EXCEEDED`, `data.scope ∈ {MINUTE, DAY, CONTACT_MONTH, TENANT_MONTH}` (et `retryAfterSeconds` si applicable) ; message distinct selon la portée.
  - `aiPrefillAvailable` passe à `false` quand les quotas sont atteints ; la déclaration manuelle reste possible.
- **Gravité si échec** : Majeur

---

## G. Notifications aux gestionnaires

### GL-12-155 — Récapitulatif horaire et alerte quotidienne

- **Rôle** : ADMIN_A (destinataire), AGENT_A, COMPTABLE_A
- **Préconditions** : puits SMTP vidé ; aucune déclaration nouvelle depuis le dernier envoi ; deux déclarations en attente depuis plus de 3 jours ouvrés (dates reculées en base de recette).
- **Données** : `reviewAlertBusinessDays` à 3 puis à 1.
- **Étapes** :
  1. Sans nouvelle déclaration, attendre l'heure pleine (ou déclencher le job de recette) ; lire le puits.
  2. Créer deux déclarations ; attendre l'heure pleine ; lire le puits.
  3. Attendre l'alerte quotidienne ; lire le puits ; passer le réglage à 1 et comparer.
- **Attendu** :
  - `RENTAL_PAYMENT_DECLARATION_TO_REVIEW` : envoyé **seulement s'il y a des déclarations en attente nouvelles** depuis le dernier envoi (aucun e-mail à vide), aux utilisateurs ayant `RENTAL_PAYMENTS_ALLOCATE` (ADMIN_A et AGENT_A oui, COMPTABLE_A non), avec le compte exact (2) ; pas de doublon à l'heure suivante.
  - `RENTAL_PAYMENT_DECLARATION_OVERDUE_ALERT` quotidienne : liste les déclarations en attente au-delà de `reviewAlertBusinessDays` jours ouvrés ; changer le réglage change la liste. Aucun e-mail aux locataires.
  - Objet et variables à confirmer à l'écran ; la notification de changement de numéro est couverte en GL-12-104.
- **Gravité si échec** : Mineur

---

## H. Paiement en ligne

Les tentatives en REVIEW sont obtenues au **simulateur** de la passerelle (scénarios « montant différent », « état contraire », « transaction déjà vue », « échéance non disponible » ; libellés à confirmer à l'écran). Relever les soldes avant et après chaque décision.

### GL-12-160 — Liste, filtres, résumé

- **Rôle** : ADMIN_A
- **Préconditions** : au moins une tentative dans chaque statut (PENDING, SUCCESS, FAILED, CANCELED, EXPIRED, REVIEW).
- **Données** : filtres statut (un, plusieurs séparés par virgule), motif, recherche (code de paiement, nom du locataire, référence du bail, identifiant de transaction, **insensible à la casse**), bail, `from`/`to` (`to` inclus), page 1 et pageSize 20 (max 100), `from > to`, statut inconnu.
- **Étapes** : appliquer chaque filtre ; relever `GET …/online-payments`, `…/online-payments/summary` et un détail.
- **Attendu** :
  - Tri création décroissante ; ligne : bail, bien, locataire, échéances visées, montant, montant reçu, motif, décision, paiement associé, `collected`. **Jamais** de `checkoutUrl`, `providerToken` ni `lastProviderPayload`.
  - `summary` : `counts` des **6 statuts** (0 si vide, toute l'agence, indépendants du filtre), `reviewPending = counts.REVIEW`, `reviewByKind` (4 motifs), `oldestReviewAt`.
  - `from > to`, statut inconnu, date invalide : 400 `VALIDATION_ERROR` ; `leaseId` d'une autre agence : 404.
  - Détail : tentatives de vérification, dernier état fournisseur, journal du plus ancien au plus récent (acteur nul pour webhook et job).
- **Gravité si échec** : Majeur

### GL-12-161 — Vérification manuelle

- **Rôle** : ADMIN_A, AGENT_A
- **Préconditions** : une tentative PENDING (paiement simulé réussi côté passerelle), une REVIEW, une SUCCESS.
- **Données** : —
- **Étapes** :
  1. **Vérifier** sur la PENDING, sur la REVIEW, sur la SUCCESS.
  2. Arrêter le simulateur et revérifier une PENDING.
- **Attendu** :
  - PENDING réussie : `changed: true`, tentative SUCCESS, paiement encaissé et affecté une seule fois.
  - **REVIEW : jamais encaissée** par la vérification (ni par le retour portail, ni par le job de rapprochement) : seuls `lastProviderState`, `receivedAmount`, `lastCheckedAt`, `checkAttempts` sont mis à jour.
  - SUCCESS : **409** `CHECKOUT_NOT_VERIFIABLE`.
  - Passerelle injoignable : **502** `ONLINE_PAYMENT_PROVIDER_UNREACHABLE`, état inchangé. Limite 20 par minute et par utilisateur.
- **Gravité si échec** : Majeur

### GL-12-162 — REVIEW `AMOUNT_MISMATCH` : accepter

- **Rôle** : ADMIN_A
- **Préconditions** : tentative sur E10 attendue **120 000**, reçue **150 000** (tolérance zéro) : REVIEW `AMOUNT_MISMATCH`, `collected=false`.
- **Données** : note « Contrôlé PSH REC-GL » (facultative) ; date du jour.
- **Étapes** :
  1. Ouvrir le détail : lire attendu, reçu et l'effet d'un ACCEPT.
  2. **Accepter** ; relire E10, le paiement, le compte de collecte.
- **Attendu** :
  - Le texte dit que le locataire a payé 150 000 au lieu de 120 000 (formulation à confirmer à l'écran) et l'effet : le reçu est encaissé, trop-perçu non alloué.
  - Tentative **SUCCESS** (`resolution = ACCEPT`), paiement de **150 000** ; E10 payée (120 000), **30 000 non alloués** (`unallocatedAmount`) ; un seul encaissement.
  - Variante « moins » : reçu 100 000 sur 120 000 attendus : ACCEPT encaisse 100 000, E10 reste **20 000** dus.
  - Audit `RENTAL_ONLINE_PAYMENT_RESOLVED` sans jeton ni URL.
- **Gravité si échec** : Bloquant

### GL-12-163 — REVIEW `AMOUNT_MISMATCH` : refuser

- **Rôle** : ADMIN_A
- **Préconditions** : seconde tentative `AMOUNT_MISMATCH`.
- **Données** : note vide ; « Montant erroné REC-GL » ; `paidAt` avec un refus.
- **Étapes** : refuser sans note ; avec note et `paidAt` ; avec note seule.
- **Attendu** :
  - `REJECT` sans note : **400** `RENTAL_ONLINE_PAYMENT_NOTE_REQUIRED` ; `paidAt` avec `REJECT` : 400 `VALIDATION_ERROR`.
  - Refus accepté : tentative **FAILED** (`resolution = REJECT`, message = la note), paiement FAILED, **aucun encaissement ni remboursement** ; l'écran rappelle que l'argent reste chez PaySecureHub.
- **Gravité si échec** : Majeur

### GL-12-164 — REVIEW `CONTRARY_STATE`

- **Rôle** : ADMIN_A
- **Préconditions** : (a) tentative SUCCESS déjà encaissée puis rapportée en échec (`collected = true`) ; (b) succès tardif après EXPIRED (`collected = false`).
- **Données** : (a) et (b), chacune en double pour tester ACCEPT et REJECT.
- **Étapes** : accepter puis refuser (sur la copie) pour chaque cas.
- **Attendu** :
  - L'écran dit si l'argent est déjà encaissé et invite à vérifier côté PaySecureHub.
  - (a) ACCEPT : **aucun nouvel encaissement**, clôt en SUCCESS ; REJECT : **409** `REVIEW_NOT_REJECTABLE`.
  - (b) ACCEPT : encaisse le montant reçu ; REJECT : refus simple.
  - Un état contraire sur une tentative déjà SUCCESS la bascule en REVIEW / `CONTRARY_STATE` **sans annuler l'encaissement**.
- **Gravité si échec** : Majeur

### GL-12-165 — REVIEW `DUPLICATE_TRANSACTION`

- **Rôle** : ADMIN_A
- **Préconditions** : tentative dont la transaction fournisseur est déjà enregistrée sur une autre tentative.
- **Données** : —
- **Étapes** : lire le détail ; accepter (console) ; refuser avec note.
- **Attendu** :
  - L'écran indique la tentative d'origine (code) et **n'offre que le refus**.
  - ACCEPT : **409** `REVIEW_NOT_ACCEPTABLE` ; REJECT avec note : refus simple accepté.
- **Gravité si échec** : Majeur

### GL-12-166 — REVIEW `INSTALLMENT_UNAVAILABLE`

- **Rôle** : ADMIN_A
- **Préconditions** : tentative visant deux échéances dont l'une est entre-temps soldée ; seconde tentative dont toutes les échéances sont soldées.
- **Données** : les deux tentatives.
- **Étapes** : accepter chacune ; relire les échéances.
- **Attendu** :
  - L'écran liste les échéances concernées ; ACCEPT encaisse sur l'échéance **encore ouverte** seulement ; si aucune n'est ouverte, paiement enregistré **non alloué**.
  - REJECT : refus simple avec note.
- **Gravité si échec** : Majeur

### GL-12-167 — Décision concurrente et décision répétée

- **Rôle** : ADMIN_A et AGENT_A
- **Préconditions** : tentative `AMOUNT_MISMATCH` en REVIEW.
- **Données** : deux onglets ; ACCEPT/ACCEPT puis ACCEPT/REJECT ; une tentative non REVIEW.
- **Étapes** : décider simultanément ; redécider ; décider sur une PENDING.
- **Attendu** :
  - **Un seul vainqueur** : le perdant reçoit **409** `RENTAL_ONLINE_PAYMENT_NOT_IN_REVIEW` ; un seul paiement encaissé ; jamais d'encaissement double.
  - Redécision ou tentative non REVIEW : 409 `RENTAL_ONLINE_PAYMENT_NOT_IN_REVIEW`.
  - Exercice comptable clos : erreur 400 existante du service d'allocation.
- **Gravité si échec** : Bloquant

---

## I. Compte de collecte et reversement

### GL-12-170 — Solde du compte de collecte et motifs fournisseur

- **Rôle** : ADMIN_A
- **Préconditions** : simulateur actif ; au moins un paiement en ligne encaissé ; compte 5525 créé.
- **Données** : agence sans 5525 (ADMIN_B vierge) ; mode SIMULATOR ; identifiants absents ; passerelle injoignable.
- **Étapes** : ouvrir le panneau ; relever `GET …/online-payments/collection-account` pour chaque situation.
- **Attendu** :
  - Réponse **toujours 200** (jamais 500) : `treasuryAccountId` (null tant que le 5525 n'existe pas, la route ne le crée pas), `ledgerBalance` = solde comptable du 5525 (0 si absent), `provider` avec `balance` ou `balance: null` + `unavailableReason ∈ {NOT_CONFIGURED, SIMULATOR, NO_CREDENTIALS, UNREACHABLE}` et un message, `recentPayouts` (5 derniers).
  - `ledgerBalance` = paiements en ligne encaissés moins reversements, à rapprocher de la balance de trésorerie. Limite 10 par minute.
- **Gravité si échec** : Majeur

### GL-12-171 — Reversement 5525 vers la trésorerie

- **Rôle** : ADMIN_A
- **Préconditions** : `ledgerBalance` du 5525 = **S** (ex. 270 000) ; trésorerie de test T.
- **Données** : reversement **100 000** vers T ; puis **S + 1** ; montant 0 ; destination = 5525 ; destination désactivée.
- **Étapes** :
  1. Noter les soldes du 5525 et de T.
  2. Reverser 100 000 ; relire les deux soldes.
  3. Tenter les cas d'erreur.
  4. Lister `…/collection-account/payouts`.
- **Attendu** :
  - **201** : virement **`VIR-AAAA-NNNN`** (référence « REVERSEMENT PSH »), `ledgerBalanceAfter` = S − 100 000, T **+ 100 000** ; audit `RENTAL_COLLECTION_PAYOUT_RECORDED` ; **aucun virement réel** chez PaySecureHub (l'écran le dit ; texte à confirmer à l'écran).
  - Montant > solde : **400** `RENTAL_COLLECTION_PAYOUT_INVALID` (contrôlé avant l'appel) ; 0 ou négatif : 400 `VALIDATION_ERROR` ; source = destination ou destination désactivée : 400 `RENTAL_COLLECTION_PAYOUT_INVALID` ; 5525 absent : 404.
  - La liste des reversements exclut les virements annulés, date décroissante ; limite 20 par minute.
- **Gravité si échec** : Bloquant

---

## J. Durcissement

### GL-12-175 — Simulateur interdit hors environnement de test

- **Rôle** : ADMIN_A
- **Préconditions** : instance (ou réglage de recette) où le simulateur n'est pas disponible.
- **Données** : mode `SIMULATOR` ; changement de mode avec une tentative PENDING.
- **Étapes** : enregistrer la passerelle en SIMULATOR ; relire `availability` côté gestionnaire et portail ; changer mode ou clé avec une tentative en cours.
- **Attendu** :
  - `PUT mode:'SIMULATOR'` : 400 `GATEWAY_SIMULATOR_UNAVAILABLE` ; `availability` : `usable: false`, `unavailableReason: 'SIMULATOR_FORBIDDEN'` ; portail : `available: false`, `simulated` et `unavailableReason` présents ; démarrer un paiement : 400 `RENTAL_ONLINE_PAYMENT_UNAVAILABLE` (jamais de repli).
  - Changement de mode, de `merchantId` ou de clé avec tentative PENDING : 409 `GATEWAY_CHECKOUTS_PENDING`.
  - Autres motifs : `NOT_CONFIGURED` (pas de ligne), `INACTIVE`.
- **Gravité si échec** : Majeur

### GL-12-176 — Abonnement sans le droit RENTAL

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL_2
- **Préconditions** : agence de test dont l'abonnement n'inclut pas RENTAL, en mode `enforce` (variantes `off` et `warn` à comparer).
- **Données** : `GET availability` ; `POST /online-payments` ; `GET /online-payments/<code>`.
- **Étapes** : appeler chaque route portail ; créer un lien de paiement côté gestionnaire.
- **Attendu** :
  - `enforce` : `availability` répond `available: false` (motif `SUBSCRIPTION`) sans erreur ; les autres routes portail `/online-payments*` : **403** `RENTAL_FEATURE_DENIED` ; création de lien : 400 `RENTAL_ONLINE_PAYMENT_UNAVAILABLE`.
  - `off` : rien refusé ; `warn` : avertissement sans blocage.
  - Limiteurs portail : `availability` 60 par minute par IP, démarrage 10 par minute par utilisateur, suivi 60 par minute par utilisateur.
- **Gravité si échec** : Majeur

### GL-12-177 — Lien public après changement de locataire ou bail terminé

- **Rôle** : ADMIN_A, visiteur anonyme
- **Préconditions** : lien public valide sur E11 (cas GL-11-063) ; second bail de test pour le changement de locataire.
- **Données** : lien L1 ; changement du locataire du bail ; lien L2 sur un bail ensuite terminé.
- **Étapes** : ouvrir L1 (`/payer`) avant puis après le changement ; démarrer un paiement après ; idem pour L2 après terminaison.
- **Attendu** :
  - Avant : page de paiement normale ; après changement de locataire : **409** `RENTAL_ONLINE_PAYMENT_LEASE_TENANT_CHANGED` à l'**ouverture et au démarrage** ; bail terminé, résilié ou annulé : même code, message distinct.
  - Message **neutre** : aucun nom, montant ni adresse ; le lien reste non révoqué en base (aucun effet de bord à l'ouverture) ; jamais d'écran blanc.
  - **Limite connue (09/11/2026)** : le changement de locataire n'est PAS contrôlé (colonne manquante sur `SecureLink`, voir `docs/integrations/paysecurehub.md`) ; seule la partie « bail terminé » est attendue en 409. Le constat d'un lien encore payable après changement de locataire se note, il ne compte pas comme anomalie nouvelle.
- **Gravité si échec** : Bloquant

---

## K. Relances

### GL-12-180 — Aperçu sans écriture

- **Rôle** : ADMIN_A
- **Préconditions** : REC-GL-DECL (E09, E10, E11 impayées) et REC-GL-PAY-1 (E07 à E10 impayées), aucun envoi préalable ; puits SMTP vidé.
- **Données** : filtres `minDaysLate` (défaut 1), `daysBefore` (0 à 30), bail, bien, recherche, `eligibleOnly` ; `daysBefore=31`.
- **Étapes** : ouvrir l'aperçu ; changer chaque filtre ; relever `GET …/payment-reminders/preview` ; compter lignes du journal et e-mails avant/après.
- **Attendu** :
  - **Aucune écriture, aucun envoi** : journal et puits inchangés après plusieurs aperçus.
  - Groupes par bail/locataire, `totalDue` = somme des restes dus ; lignes avec `nextLevel` (1 sans relance préalable), `channels`, `amountDue`, `daysLate`, `eventKey` (`INSTALLMENT_OVERDUE` si échue, `INSTALLMENT_DUE_REMINDER` si dans `daysBefore`), `paymentLinkIncluded`, `eligible`, `exclusions` ; totaux `eligible`, `excluded`, `amountDue` ; lignes exclues renvoyées avec leurs raisons sauf `eligibleOnly=true`.
  - `daysBefore=31` : 400 ; bail ou bien d'une autre agence : 404 ; plafond **500** échéances (au-delà tronqué, retard le plus ancien d'abord).
- **Gravité si échec** : Majeur

### GL-12-181 — Relance manuelle unitaire : niveaux 1 puis 2, espacement

- **Rôle** : ADMIN_A
- **Préconditions** : E09 de REC-GL-DECL en retard ; locataire avec e-mail et WhatsApp (neutralisé) ; passerelle utilisable en test.
- **Données** : canal `EMAIL` seul, puis `SMS` ; niveau forcé 0 et 4.
- **Étapes** :
  1. Envoyer la relance depuis E09 (bouton à confirmer à l'écran) : niveau 1.
  2. Immédiatement une seconde fois.
  3. Reculer l'envoi du niveau 1 de 8 jours (base de recette) puis renvoyer.
  4. Essayer canal `SMS`, niveau 0 et 4.
- **Attendu** :
  - Niveau 1 : 200 `status: 'SENT'`, `level: 1`, `paymentLinkId` renseigné si la passerelle est utilisable (sinon `paymentLinkIncluded: false`, la relance part quand même) ; e-mail dans le puits ; audit `RENTAL_PAYMENT_REMINDER_SENT` **sans URL, jeton ni contenu**.
  - Second envoi immédiat : **409** `RENTAL_REMINDER_TOO_SOON` (espacement **7 jours**), `data.reason = 'TOO_SOON'`.
  - Après 8 jours : `level: 2`, `SENT`. Un `FAILED` ne compte pas pour l'espacement. Au-delà de 3 : `MAX_LEVEL_REACHED`.
  - Canal `SMS`/`PUSH`, niveau hors 1 à 3 : 400 `VALIDATION_ERROR`, rien écrit. Une relance ne modifie jamais l'échéance.
- **Gravité si échec** : Majeur

### GL-12-182 — Exclusions de la relance unitaire

- **Rôle** : ADMIN_A
- **Préconditions** : échéances de test : soldée ; avec déclaration en attente de moins de 7 jours ; avec tentative en ligne PENDING de moins de 15 min ; bail non actif ; locataire sans e-mail ni WhatsApp ; événement de relance désactivé ; échéance hors fenêtre.
- **Données** : une échéance par situation.
- **Étapes** : tenter la relance unitaire sur chacune.
- **Attendu** : aucun envoi ; **409** `RENTAL_REMINDER_NOT_ELIGIBLE` avec `data.reason` et `data.exclusions` : `ALREADY_PAID`, **`PENDING_DECLARATION`** (déclaration en attente de moins de 7 jours ; au-delà elle n'exclut plus), `PENDING_ONLINE_ATTEMPT` (ou REVIEW), `LEASE_NOT_ACTIVE`, **`NO_CONTACT_CHANNEL`**, `EVENT_DISABLED`, `NOT_DUE_YET` ; plusieurs raisons possibles ensemble ; échéance d'une autre agence : 404.
- **Gravité si échec** : Majeur

### GL-12-183 — Relance par lot

- **Rôle** : ADMIN_A
- **Préconditions** : 3 échéances éligibles, 1 exclue `ALREADY_PAID`, 1 en `TOO_SOON`, 1 dont l'envoi échoue (e-mail refusé en simulé).
- **Données** : lot de ces 6 ; lot de 101 identifiants ; lot vide ; lot avec doublon ; lot avec un identifiant d'une autre agence.
- **Étapes** : lancer chaque lot ; relire journal et puits SMTP.
- **Attendu** :
  - Résultat dans l'ordre de la requête ; `totals` **sent 3, skipped 2, failed 1** ; les exclues sont **`SKIPPED`** et **ne bloquent pas** le lot (un échec non plus) ; le serveur **recalcule** le plan à l'envoi (aucun niveau lu du corps).
  - 101 identifiants, liste vide, doublons : 400 `VALIDATION_ERROR` (plafond **100**, doublons refusés) ; un identifiant d'une autre agence : 404 uniforme, **aucun** envoi.
  - Limite 10 par minute par utilisateur.
- **Gravité si échec** : Majeur

### GL-12-184 — Contenu du message : lien de paiement et numéros de réception

- **Rôle** : ADMIN_A
- **Préconditions** : relance envoyée en GL-12-181 ; N1 à N4 actifs ; passerelle utilisable, puis non utilisable.
- **Données** : e-mail du puits.
- **Étapes** : lire le message avec et sans passerelle utilisable ; vérifier l'aperçu du modèle.
- **Attendu** :
  - `{{paymentBlock}}` : bloc « Payer en ligne » avec le lien **et** les **numéros de réception actifs** ; sans passerelle utilisable : numéros seuls, sans lien ; sans lien ni numéro : bloc vide, message correct.
  - Lien d'échéance existant (non expiré, non révoqué) **réutilisé**, sinon créé ; l'URL n'apparaît ni dans le journal ni dans l'audit.
  - Destinataire : le locataire **actuel** du bail (jamais celui du lien d'origine).
- **Gravité si échec** : Majeur

### GL-12-185 — Jamais d'envoi automatique ; journal

- **Rôle** : ADMIN_A, COMPTABLE_A
- **Préconditions** : plusieurs relances envoyées.
- **Données** : filtres du journal : échéance, bail, canal, statut, niveau, période.
- **Étapes** : attendre le passage de l'heure pleine et du jour ; lire `GET …/payment-reminders` et `GET …/installments/<id>/reminders`.
- **Attendu** :
  - Aucune relance n'apparaît sans action humaine (aucun job ni cron) ; journal trié `sent_at` décroissant avec bail, locataire, période, montant dû, nom de l'envoyeur ; liste par échéance : 50 au plus, la plus récente d'abord.
  - COMPTABLE_A peut lire, ne peut pas envoyer.
- **Gravité si échec** : Majeur

---

## L. Droits par rôle

### GL-12-190 — Matrice des droits du chantier

- **Rôle** : ADMIN_A, AGENT_A, COMPTABLE_A, LECTEUR_A
- **Préconditions** : comptes du fichier 13 ; déclarations, numéros, tentatives REVIEW et relances en place.
- **Données** : matrice ci-dessous.
- **Étapes** : pour chaque rôle, ouvrir les écrans, lister les boutons, rejouer les actions en console.
- **Attendu** (« refusé » = **403** de l'API, jamais autre chose ; bouton masqué ou désactivé à l'écran, à confirmer à l'écran) :

| Action                                                                                                                | Droit                      | ADMIN_A | AGENT_A    | COMPTABLE_A         | LECTEUR_A |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------- | ---------- | ------------------- | --------- |
| Lire numéros, réglages, déclarations, capture, tentatives, résumé, compte de collecte, journal et aperçu des relances | `RENTAL_PAYMENTS_VIEW`     | oui     | oui        | oui (lecture seule) | refusé    |
| Créer, modifier, désactiver un numéro ; modifier les réglages                                                         | `RENTAL_PAYMENTS_ALLOCATE` | oui     | oui        | refusé              | refusé    |
| Valider, rejeter ; vérifier, décider une tentative REVIEW ; reverser ; relance unitaire et lot                        | `RENTAL_PAYMENTS_ALLOCATE` | oui     | oui        | refusé              | refusé    |
| Déclarer pour un tiers                                                                                                | `RENTAL_PAYMENTS_CREATE`   | oui     | oui        | refusé              | refusé    |
| Configurer la passerelle de paiement                                                                                  | `TENANT_SETTINGS_EDIT`     | oui     | **refusé** | refusé              | refusé    |

- Un rôle sans droit **ne voit pas le bouton** et n'obtient **que** 403 en console ; COMPTABLE_A voit tout en lecture mais aucune action d'écriture ; LECTEUR_A n'a aucun menu locatif ; AGENT_A peut valider mais pas enregistrer la passerelle.
- L'écran des paiements du fichier 06 masque déjà Encaisser/Affecter pour COMPTABLE_A : vérifier que les nouveaux boutons (valider, rejeter, décider, relancer, reverser) suivent la même règle ; un bouton visible mais refusé par l'API se note Mineur.
- **Gravité si échec** : Bloquant

### GL-12-191 — Session expirée et mauvais portail

- **Rôle** : LOCATAIRE_PORTAIL_2, ADMIN_A
- **Préconditions** : —
- **Données** : sans cookie ; cookie du portail propriétaire ; cookie gestionnaire sur routes portail ; cookie locataire sur routes gestionnaire.
- **Étapes** : appeler en console les routes de déclaration, de décision et de relance.
- **Attendu** : sans session 401 ; session d'un autre type de portail : 401 ou 403 (jamais un accès) ; un locataire n'atteint aucune route gestionnaire ; `tenantId` d'une autre agence dans le chemin : refus d'agence (section M).
- **Gravité si échec** : Bloquant

---

## M. Isolation entre agences

Convention du fichier 13 (section F) : forme (1) identifiant d'agence A dans le chemin ; forme (2) identifiant d'**objet** de A sous l'agence B. Les identifiants (numéros, déclarations, capture, tentative REVIEW, échéance, bail) sont relevés par ADMIN_A et transmis à ADMIN_B hors application.

### GL-12-195 — Numéros, déclarations, capture : lectures croisées

- **Rôle** : ADMIN_B
- **Préconditions** : identifiants de A relevés ; l'agence B a ses propres numéros et déclarations de contraste (`REC-GL-B…`).
- **Données** : identifiant d'un numéro, d'une déclaration, d'une capture de A ; un UUID aléatoire inexistant.
- **Étapes** : sous `/api/tenants/<B>/rental/…`, `GET` du numéro, de la déclaration, de la capture ; comparer à l'UUID aléatoire ; forme (1) sur les listes.
- **Attendu** :
  - Forme (2) : **404** de même corps et même message que l'inexistant ; aucune donnée de A (référence, montant, téléphone, nom).
  - Forme (1) : refus d'agence ; les listes d'ADMIN_B ne contiennent aucun objet de A ; `pending-count` d'ADMIN_B ne compte que B.
- **Gravité si échec** : Bloquant

### GL-12-196 — Écritures croisées

- **Rôle** : ADMIN_B
- **Préconditions** : GL-12-195.
- **Données** : valider, rejeter, modifier, supprimer avec des identifiants de A ; déclaration pour un tiers avec `leaseId`, `installmentId` ou `receivingNumberId` de A ; relance d'une échéance de A ; lot avec un identifiant de A ; décision sur une tentative de A ; reversement vers une trésorerie de A.
- **Étapes** : tenter chaque écriture sous l'agence B.
- **Attendu** :
  - Toutes : **404** identique à l'inexistant ; **aucune** donnée de A modifiée (relire côté A : statuts, soldes, compte 5525 inchangés).
  - Lot de relances contenant un seul identifiant de A : 404 uniforme, **aucun** envoi même pour les autres.
- **Gravité si échec** : Bloquant

### GL-12-197 — Portail : autre locataire ou autre agence

- **Rôle** : LOCATAIRE_PORTAIL, locataire de l'agence B
- **Préconditions** : déclaration de LOCATAIRE_PORTAIL_2 ; numéro de réception de A.
- **Données** : identifiants forgés.
- **Étapes** : sous LOCATAIRE_PORTAIL, lire ou annuler la déclaration de LOCATAIRE_PORTAIL_2 ; déclarer avec un `receivingNumberId` d'une autre agence ; avec une échéance d'un autre locataire ; avec le `proofReadId` d'un autre contact ; ouvrir un lien public d'une autre agence.
- **Attendu** : 404 (déclaration, échéance, numéro) ou 409 `RENTAL_PROOF_READ_INVALID` ; aucune donnée d'un autre locataire dans les réponses ; « mes déclarations » ne montre que celles du contact.
- **Gravité si échec** : Bloquant

---

## N. Portail locataire : mobile 375 px et arabe (RTL)

### GL-12-200 — Formulaire de déclaration en 375 px

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : fenêtre **375 × 812** ; GL-12-120.
- **Données** : 120 000 sur E09, `REC-GL-MB-01`, capture `preuve.png`.
- **Étapes** : ouvrir le formulaire ; remplir ; ouvrir la liste des numéros et le sélecteur de date ; valider ; ouvrir « mes déclarations » ; annuler une déclaration en attente.
- **Attendu** :
  - **Pas de défilement horizontal** ; champs et boutons utilisables sans zoom, cibles tactiles confortables ; liste de numéros et clavier ne masquent pas le bouton de validation ; erreurs lisibles.
  - Liste des déclarations lisible (référence, montant, statut, date) ; bouton d'annulation atteignable ; confirmation lisible.
- **Gravité si échec** : Majeur

### GL-12-201 — Arabe (RTL)

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : langue du portail = arabe.
- **Données** : mêmes que GL-12-200, en 375 px et en bureau.
- **Étapes** : ouverture du formulaire, erreur de référence, validation, liste, annulation.
- **Attendu** :
  - Page en `dir=rtl` ; marges et alignements **logiques** : aucun bouton ou icône du mauvais côté ; tous textes traduits (aucune clé française brute) ; téléphones et références lisibles (sens gauche-droite isolé).
  - Montants, dates et statuts corrects ; pas de défilement horizontal ; cohérent avec le fichier 14.
  - Libellés manquants consignés en Cosmétique avec le texte français d'origine (clé de traduction).
- **Gravité si échec** : Mineur

---

## O. Autres modes de déclaration, audit de la capture, rejet à note courte

Ajouts postérieurs à la rédaction du contrat : le locataire peut déclarer aussi en espèces, chèque, virement, carte ou autre (`paymentMethod`, additif ; `allowedMethods` renvoyé par la disponibilité) ; la lecture d'une capture est journalisée ; le rejet exige une note de 10 à 500 caractères quand le motif est « autre ».

### GL-12-210 — Déclaration en espèces ou par chèque, sans numéro ni référence, puis validation

- **Rôle** : LOCATAIRE_PORTAIL_2, puis ADMIN_A
- **Préconditions** : GL-12-120 ; une échéance E10 de 80 000 non payée du bail du locataire ; déclaration ouverte.
- **Données** : montant 80 000 ; date-heure du jour ; aucune référence, aucun numéro de réception, aucun opérateur ; mode « Espèces » (D10), puis « Chèque » (D11, échéance suivante).
- **Étapes** :
  1. Relever la disponibilité : `allowedMethods` liste les modes proposés (le mobile money n'y figure que s'il existe un numéro actif).
  2. Dans la fenêtre « Déclarer un paiement », choisir « Espèces » : les champs numéro de réception, opérateur et référence ne sont pas exigés (masqués ou facultatifs).
  3. Envoyer D10 ; refaire avec « Chèque » (D11) ; essayer un mode absent de `allowedMethods`.
  4. ADMIN_A valide D10 puis D11 (onglet « Déclarations »).
- **Attendu** :
  - **201** : déclarations en attente avec le mode choisi, sans erreur de référence ni de numéro ; un mode hors `allowedMethods` est refusé.
  - Pour le mobile money, numéro, opérateur et référence restent obligatoires (cas GL-12-122 inchangé).
  - À la validation, le paiement posé porte le mode Espèces ou Chèque (et non mobile money) ; échéance E10 soldée ; aucun compte de réception mobile money débité.
  - Doublon : deux déclarations espèces du même montant le même jour sur la même échéance sont acceptées mais la seconde est signalée (doublon probable, GL-12-131) ; aucune référence ne bloque.
- **Gravité si échec** : Majeur

### GL-12-211 — La lecture d'une capture est journalisée dans l'audit

- **Rôle** : ADMIN_A, COMPTABLE_A
- **Préconditions** : une déclaration avec capture (GL-12-125) ; accès à l'audit de l'agence.
- **Données** : —
- **Étapes** :
  1. Relever le nombre d'événements `RENTAL_PAYMENT_DECLARATION_PROOF_VIEWED` pour la déclaration.
  2. Ouvrir la capture depuis le détail du tiroir, deux fois de suite, avec ADMIN_A puis avec COMPTABLE_A.
  3. Relire l'audit.
- **Attendu** :
  - Un événement par ouverture (quatre en tout), avec l'auteur, la déclaration et l'heure ; l'audit ne contient ni la capture ni son chemin interne.
  - Une ouverture refusée (locataire, autre agence) ne crée aucun événement.
- **Gravité si échec** : Majeur

### GL-12-212 — Rejet avec « autre » et note courte refusée

- **Rôle** : ADMIN_A
- **Préconditions** : une déclaration en attente D12 (`REC-GL-RJ-10`).
- **Données** : motif « Autre » ; notes : vide, « Trop court » (9 caractères), puis « Capture illisible REC-GL » (valide).
- **Étapes** :
  1. Ouvrir la fenêtre de rejet de D12 et choisir le motif « Autre ».
  2. Valider sans note, puis avec la note de 9 caractères.
  3. Saisir la note valide et confirmer.
- **Attendu** :
  - Note vide ou de 9 caractères : le formulaire refuse (message sous le champ) ; côté API **400** (`RENTAL_DECLARATION_REJECT_NOTE_REQUIRED` sans note, `VALIDATION_ERROR` en dessous de 10) ; D12 reste en attente, aucun audit de rejet.
  - Note valide : D12 « Rejetée », motif et note affichés au gestionnaire et au locataire ; aucun paiement créé ; audit `RENTAL_PAYMENT_DECLARATION_REJECTED`.
- **Gravité si échec** : Majeur

---

## Couverture

| Sujet (spec 049)                                                                                          | Cas             |
| --------------------------------------------------------------------------------------------------------- | --------------- |
| Numéros de réception : création, doublon, téléphone, désactivation douce, suppression vierge              | GL-12-101 à 106 |
| Réglages : défauts, bornes de l'alerte                                                                    | GL-12-110, 111  |
| Déclaration portail : disponibilité, référence, plafond, date, capture, désactivation, numéro et échéance | GL-12-120 à 127 |
| Doublon bloquant, doublon probable                                                                        | GL-12-130, 131  |
| Liste et filtres, annulation, rejet par motif, validation, correction, concurrence, tiers, capture        | GL-12-140 à 148 |
| Lecture IA : désactivée, activée, panne, quota                                                            | GL-12-150 à 153 |
| Notifications : récapitulatif horaire, alerte quotidienne, changement de numéro                           | GL-12-155, 104  |
| Paiement en ligne : liste, résumé, vérification, REVIEW (4 motifs), concurrence                           | GL-12-160 à 167 |
| Compte de collecte, reversement                                                                           | GL-12-170, 171  |
| Durcissement : simulateur, abonnement, lien public                                                        | GL-12-175 à 177 |
| Relances : aperçu, unitaire, exclusions, lot, contenu, jamais automatique                                 | GL-12-180 à 185 |
| Droits par rôle, session                                                                                  | GL-12-190, 191  |
| Isolation entre agences                                                                                   | GL-12-195 à 197 |
| Mobile 375 px, arabe                                                                                      | GL-12-200, 201  |
| Autres modes de déclaration, audit de la capture, rejet à note courte                                     | GL-12-210 à 212 |

## Récapitulatif des cas

| Id        | Thème                                        | Priorité |
| --------- | -------------------------------------------- | -------- |
| GL-12-101 | Créer un numéro par opérateur, compte dérivé | Bloquant |
| GL-12-102 | Doublon de numéro 409                        | Majeur   |
| GL-12-103 | Téléphone invalide, champs inconnus          | Majeur   |
| GL-12-104 | Modifier, désactiver, notification           | Majeur   |
| GL-12-105 | Suppression d'un numéro vierge               | Majeur   |
| GL-12-106 | Désactivation douce avec déclarations        | Majeur   |
| GL-12-110 | Défauts des réglages                         | Majeur   |
| GL-12-111 | Bornes 1 à 15 de l'alerte                    | Majeur   |
| GL-12-120 | Disponibilité et formulaire                  | Majeur   |
| GL-12-121 | Déclaration nominale, référence normalisée   | Bloquant |
| GL-12-122 | Référence obligatoire et invalide            | Majeur   |
| GL-12-123 | Plafond 5 000 000 et validité du montant     | Majeur   |
| GL-12-124 | Bornes de date                               | Majeur   |
| GL-12-125 | Capture facultative, exigée, formats, 5 Mo   | Majeur   |
| GL-12-126 | Déclaration désactivée, aucun numéro actif   | Majeur   |
| GL-12-127 | Numéro, échéance, téléphone invalides        | Majeur   |
| GL-12-130 | Doublon bloquant 409                         | Majeur   |
| GL-12-131 | Doublon probable avec alerte                 | Majeur   |
| GL-12-140 | Liste, filtres, badge, retard                | Majeur   |
| GL-12-141 | Annulation par le locataire                  | Majeur   |
| GL-12-142 | Rejet par motif                              | Majeur   |
| GL-12-143 | Validation sans correction                   | Bloquant |
| GL-12-144 | Validation avec correction                   | Bloquant |
| GL-12-145 | Validation d'une déclaration libre           | Majeur   |
| GL-12-146 | Double validation concurrente                | Bloquant |
| GL-12-147 | Déclaration pour un tiers                    | Majeur   |
| GL-12-148 | Capture journalisée                          | Majeur   |
| GL-12-150 | Lecture IA désactivée 409                    | Majeur   |
| GL-12-151 | Lecture IA activée                           | Majeur   |
| GL-12-152 | Panne fournisseur 200 UNREADABLE             | Majeur   |
| GL-12-153 | Quota 429 et portée                          | Majeur   |
| GL-12-155 | Récapitulatif horaire, alerte quotidienne    | Mineur   |
| GL-12-160 | Paiements en ligne : liste, résumé           | Majeur   |
| GL-12-161 | Vérification manuelle                        | Majeur   |
| GL-12-162 | REVIEW AMOUNT_MISMATCH accepté               | Bloquant |
| GL-12-163 | REVIEW AMOUNT_MISMATCH refusé                | Majeur   |
| GL-12-164 | REVIEW CONTRARY_STATE                        | Majeur   |
| GL-12-165 | REVIEW DUPLICATE_TRANSACTION                 | Majeur   |
| GL-12-166 | REVIEW INSTALLMENT_UNAVAILABLE               | Majeur   |
| GL-12-167 | Décision concurrente                         | Bloquant |
| GL-12-170 | Compte de collecte, motifs fournisseur       | Majeur   |
| GL-12-171 | Reversement 5525 vers trésorerie             | Bloquant |
| GL-12-175 | Simulateur interdit                          | Majeur   |
| GL-12-176 | Abonnement sans RENTAL                       | Majeur   |
| GL-12-177 | Lien public après changement                 | Bloquant |
| GL-12-180 | Aperçu des relances sans écriture            | Majeur   |
| GL-12-181 | Relance unitaire, niveaux, TOO_SOON          | Majeur   |
| GL-12-182 | Exclusions de la relance                     | Majeur   |
| GL-12-183 | Relance par lot                              | Majeur   |
| GL-12-184 | Lien et numéros dans le message              | Majeur   |
| GL-12-185 | Jamais automatique, journal                  | Majeur   |
| GL-12-190 | Matrice des droits                           | Bloquant |
| GL-12-191 | Sessions et portails                         | Bloquant |
| GL-12-195 | Isolation : lectures                         | Bloquant |
| GL-12-196 | Isolation : écritures                        | Bloquant |
| GL-12-197 | Isolation côté portail                       | Bloquant |
| GL-12-200 | Mobile 375 px                                | Majeur   |
| GL-12-201 | Arabe (RTL)                                  | Mineur   |
| GL-12-210 | Déclaration espèces ou chèque, validation    | Majeur   |
| GL-12-211 | Audit de lecture de la capture               | Majeur   |
| GL-12-212 | Rejet « autre », note courte refusée         | Majeur   |

## Points à confirmer à l'écran

Les écrans existent désormais (fusionnés) : ces douze points restent **à rejouer à la recette** pour fixer les libellés réels ; un libellé différent se signale, il ne conclut pas à une anomalie.

1. Emplacement et libellés de l'écran des numéros de réception, des réglages de déclaration et du panneau « compte de collecte » (menus et URL). — **à rejouer à la recette**
2. Onglet, badge et libellé des déclarations en attente côté gestionnaire ; bouton de déclaration pour un tiers. — **à rejouer à la recette**
3. Libellés du formulaire de déclaration du portail (numéro, opérateur, référence, date-heure, capture) et de « mes déclarations » ; présence d'une confirmation d'annulation. — **à rejouer à la recette**
4. Le locataire voit-il le motif de rejet et la note (le contrat les renvoie au gestionnaire) ? — **à rejouer à la recette**
5. Libellés des motifs de rejet et de REVIEW, et textes explicatifs (« payé X au lieu de Y », rappel que l'argent reste chez PaySecureHub, pas de virement réel au reversement). — **à rejouer à la recette**
6. Boutons et libellés de relance (unitaire, lot, aperçu, journal) et leur emplacement. — **à rejouer à la recette**
7. Contenu exact des e-mails (récapitulatif horaire, alerte, relance, changement de numéro) : objets et variables. — **à rejouer à la recette**
8. Visibilité du bouton de lecture IA sans fournisseur ; messages de quota par portée. — **à rejouer à la recette**
9. Libellés et URL de la passerelle de paiement ; message d'indisponibilité par motif (`NOT_CONFIGURED`, `INACTIVE`, `SIMULATOR_FORBIDDEN`, `SUBSCRIPTION`). — **à rejouer à la recette**
10. Scénarios du simulateur pour produire chaque motif de REVIEW, et méthode pour reculer les dates (retard, 7 jours, 3 jours ouvrés) en base de recette. — **à rejouer à la recette**
11. Associations exactes opérateur et compte de trésorerie (5521 à 5524). — **à rejouer à la recette**
12. Boutons de décision, de relance ou de reversement visibles mais refusés pour COMPTABLE_A (à noter Mineur). — **à rejouer à la recette**
