# Spécification 042 — Prélèvement bancaire

> **Branche** : `feat/prelevement-bancaire` · **Créée** : 15/10/2026 ·
> **Statut** : P0 (cadrage) et P1 (mandats) en cours ; P2 à P6 décrits, non
> réalisés.
> **Documents liés** : [data-model.md](data-model.md) (schéma),
> [plan.md](plan.md) (lots, territoires, vérifications),
> [ADR-007](../../docs/architecture/adr/ADR-007-prelevement-bancaire-fichier-et-reglement-confirme.md)
> (fichier de remise, IBAN chiffré, règlement confirmé).
> **Entrées** : décisions D1 à D8 du fondateur (15/10/2026).
> Chemins relatifs à `packages/api/` sauf mention contraire.

## 1. Objectif

Une agence encaisse les loyers — puis les charges de copropriété — par
prélèvement sur le compte bancaire du débiteur, avec son autorisation signée.
ImmoTopia tient les mandats, prépare chaque mois la remise, produit le
fichier que l'agence charge sur sa banque en ligne, puis enregistre les
règlements et les rejets que la banque renvoie. L'argent va directement sur
le compte de l'agence ou du syndicat : ImmoTopia ne le touche jamais.

## 2. Contexte bancaire (Côte d'Ivoire, UEMOA)

- Le prélèvement passe par la compensation interbancaire de l'UEMOA.
- Le **créancier** (agence, ou syndicat de copropriété) signe une convention
  d'émetteur avec sa banque, qui lui attribue un numéro d'émetteur.
- Le **débiteur** signe une autorisation de prélèvement (le « mandat »),
  déposée à sa banque.
- Le créancier charge un **fichier de remise** sur sa banque en ligne. Le
  format dépend de la banque ; il n'y a pas d'API ouverte.
- Le RIB UEMOA compte 24 caractères (code banque 5, guichet 5, compte 12,
  clé 2) ; l'IBAN ivoirien 28 (`CI` + 2 chiffres de contrôle + RIB).

À obtenir de la banque pilote avant P2 (bloquant pour le format réel, pas
pour P1) : la convention et le numéro d'émetteur, un fichier de remise
exemple, la liste des codes de rejet, les délais (dépôt, compensation,
rejet), le modèle d'autorisation qu'elle accepte, une confirmation du calcul
de la clé RIB.

## 3. Décisions

| #   | Décision du fondateur (15/10/2026)                                                                                 | Traduction                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Périmètre : loyers d'abord, puis charges de copropriété ; abonnements des agences plus tard.                       | P1–P3 locatif, P4 copropriété, P6 en option non planifié. Le modèle prévoit un champ `scope` pour accueillir la copropriété sans refonte. |
| D2  | Format : CSV générique tant que la banque pilote n'a pas fourni son fichier exemple.                               | Adaptateur par banque (`DirectDebitFileFormat`), `GENERIC_CSV` seul en P2.                                                                |
| D3  | Le loyer compte comme payé **à la confirmation sur le relevé**, pas à la date de prélèvement.                      | ADR-007 §5 : `RentalPayment` créé en `SUCCESS` au constat de règlement, jamais à l'export.                                                |
| D4  | Frais de rejet refacturés au débiteur, montant réglé par agence.                                                   | `DirectDebitCreditor.rejectFeeAmount` (0 = pas de refacturation) ; écriture en P3.                                                        |
| D5  | Mandat suspendu après 2 rejets consécutifs.                                                                        | `DirectDebitCreditor.maxConsecutiveRejects` (défaut 2) ; compteur sur le mandat, remis à zéro au premier règlement.                       |
| D6  | Seule l'échéance du mois est prélevée (reste dû), sans arriérés ni pénalités, dans la limite du plafond du mandat. | Sélection P2 ; plafond `DirectDebitMandate.maxAmount`.                                                                                    |
| D7  | Prénotification 5 jours ouvrés avant le prélèvement, réglable.                                                     | `DirectDebitCreditor.prenotificationBusinessDays` (défaut 5).                                                                             |
| D8  | Offre : inclus dans les packs (pas d'extension payante pour l'instant).                                            | Route gardée par le module déjà associé à la gestion locative (et au Syndic en P4) ; aucune ligne de catalogue nouvelle.                  |

## 4. Périmètre

### 4.1 Dans le périmètre de P1 (ce lot)

- **Créanciers** : paramétrage, par agence, du ou des comptes bancaires qui
  reçoivent les prélèvements (compte de trésorerie `BANK`, numéro
  d'émetteur, format de fichier, jour de collecte, délai de prénotification,
  frais de rejet, seuil de suspension).
- **Mandats** : création, consultation, modification des champs non
  bancaires, activation, suspension, réactivation, révocation ; contrôle et
  chiffrement de l'IBAN ; PDF d'autorisation prérempli ; dépôt du scan signé
  (fichier privé) ; journal d'audit.
- Écrans : carte « Prélèvement bancaire » dans Paramètres financiers de
  l'agence (créanciers) ; onglet « Prélèvements » de la fiche du bail ;
  liste des mandats (menu Location › Prélèvements).
- Permissions, garde de module, textes fr/en/ar, wiki des fonctionnalités.

### 4.2 Hors P1, planifié

P2 remises, P3 retour banque, P4 copropriété, P5 portails et automatismes
(voir [plan.md](plan.md) §1). P6 (abonnements prélevés) : non planifié.

### 4.3 Hors périmètre

Débit Mobile Money récurrent ; intégration bancaire directe ; signature
électronique du mandat (le mandat se signe sur papier, déposé à la banque).

## 5. Exigences de P1

### PB1 — Créancier

- PB1-R1. Un créancier appartient à une agence et pointe vers un
  `TreasuryAccount` **de la même agence**, de type `BANK`, actif
  (`assertBelongsToTenant` + contrôle du type ; sinon `NotFoundError` pour
  une autre agence, `BadRequestError` pour un mauvais type).
- PB1-R2. Champs : libellé, numéro d'émetteur (texte libre, 1 à 32
  caractères, facultatif tant que la convention n'est pas signée), format
  (`GENERIC_CSV`), jour de collecte (1 à 28), délai de prénotification en
  jours ouvrés (0 à 30, défaut 5), frais de rejet (≥ 0, défaut 0), seuil de
  suspension (1 à 10, défaut 2), actif.
- PB1-R3. Un seul créancier par compte de trésorerie (contrainte d'unicité ; un
  créancier désactivé occupe toujours le compte).
- PB1-R4. Un créancier qui porte des mandats non révoqués ne se supprime
  pas ; il se désactive.

### PB2 — Mandat

- PB2-R1. Un mandat lie : une agence, un créancier de l'agence, un
  débiteur `TenantClient` de l'agence, un bail (`RentalLease`) de l'agence
  dont ce client est le locataire principal ou un colocataire.
  Toute référence d'une autre agence → `NotFoundError`.
- PB2-R2. Référence unique `MDT-AAAA-NNNN` par agence, attribuée à la
  création, jamais réutilisée.
- PB2-R3. IBAN saisi avec ou sans espaces ; normalisé (majuscules, sans
  espace). Accepté : IBAN `CI` de 28 caractères valide modulo 97, ou RIB de
  24 caractères (converti en IBAN `CI` en calculant les chiffres de
  contrôle). Refus → `BadRequestError` au message traduit. Clé RIB
  incohérente → avertissement renvoyé (`warnings`), pas de refus.
- PB2-R4. L'IBAN est chiffré (`lib/payment-gateway/crypto.ts`). Sont stockés
  en clair : code banque (5 caractères), 4 derniers caractères, nom du
  titulaire. **Aucune réponse d'API ne contient l'IBAN complet** ; l'affichage
  est `CI•• •••• •••• •••• •••• 0589` (masque construit côté API). Sans
  `PAYMENT_SECRETS_KEY` valide, la création échoue proprement
  (`BadRequestError` traduite), rien n'est écrit.
- PB2-R5. Modifier l'IBAN d'un mandat est interdit : on révoque et on en crée
  un autre (une banque ne connaît que l'autorisation signée).
- PB2-R6. Statuts : `DRAFT` (créé, autorisation pas encore signée) →
  `ACTIVE` (exige un scan signé déposé et une date de signature) ;
  `ACTIVE` ↔ `SUSPENDED` (motif obligatoire) ; `DRAFT | ACTIVE | SUSPENDED` →
  `REVOKED` (motif et date obligatoires, définitif). Toute autre transition →
  `ConflictError`/`BadRequestError` typée.
- PB2-R7. Un seul mandat `DRAFT | ACTIVE | SUSPENDED` par (bail, créancier).
- PB2-R8. Plafond facultatif (`maxAmount` > 0) ; jour de collecte propre au
  mandat facultatif (sinon celui du créancier).
- PB2-R9. Un bail terminé ou résilié n'accepte pas de nouveau mandat ; ses
  mandats restent consultables.
- PB2-R10. Chaque création, transition, dépôt de scan et téléchargement du
  PDF est audité (sans IBAN dans le détail de l'audit).

### PB3 — Documents du mandat

- PB3-R1. PDF « Autorisation de prélèvement » prérempli : créancier (agence,
  numéro d'émetteur), débiteur, IBAN **complet** (le débiteur le signe et le
  remet à sa banque), référence du mandat, bail, plafond, cases de date et
  de signature. Généré à la demande, jamais stocké, réservé à la permission
  de gestion.
- PB3-R2. Scan signé : PDF ou image (JPEG, PNG), 10 Mo au plus, stocké en
  fichier privé, servi uniquement par une route authentifiée qui vérifie
  l'agence. Déposé ou remplacé **seulement sur un mandat en brouillon** ; un
  mandat actif ou suspendu garde sa preuve (révoquer et recréer pour en
  changer). L'audit ne contient pas le chemin du fichier.
- PB3-R3. Le téléchargement du PDF à IBAN complet est audité dans la base
  avant l'envoi (action critique) ; un échec d'écriture bloque l'envoi.

### PB4 — Droits et module

- PB4-R1. Deux permissions : `RENTAL_DIRECT_DEBIT_VIEW` (consulter
  créanciers et mandats, IBAN masqué) et `RENTAL_DIRECT_DEBIT_MANAGE` (tout
  le reste, y compris le PDF à IBAN complet et le scan signé). La migration de
  données accorde VIEW à tout rôle qui a `RENTAL_PAYMENTS_VIEW`, et MANAGE
  aux seuls rôles `TENANT_ADMIN` et `TENANT_MANAGER` (audit de sécurité : un
  rôle qui encaisse seulement n'accède pas aux IBAN) ; les autres rôles la
  reçoivent par l'écran des rôles. Le seed de développement les accorde par
  le préfixe `RENTAL_` (administrateur et gestionnaire).
- PB4-R2. Toutes les routes sont sous `/api/tenants/:tenantId/rental/…` :
  garde d'agence (`requireTenantAccess`) et fonctionnalité `RENTAL` de
  l'abonnement (table `lib/subscription/route-features.ts`, règle `/rental`
  existante), sans règle nouvelle.

## 6. Critères de fin de P1

1. Migration appliquée sur une base vierge et sur la base de développement ;
   `schema-tenant-coverage` et `routes-inventory` passent.
2. Tests unitaires : normalisation et contrôle IBAN/RIB (cas valides réels
   publiés, clé fausse, longueur, pays), masque, chiffrement aller-retour,
   transitions de statut, unicité PB2-R7, refus d'une référence d'une autre
   agence, aucune réponse ne contient l'IBAN.
3. `npm run typecheck`, `npm run lint`, `npm run check:architecture`, tests
   API et web ciblés verts ; `npm run test:isolation` si la base dédiée est
   disponible (sinon : dit dans la PR).
4. Recette navigateur : créer un créancier, créer un mandat sur un bail,
   télécharger le PDF, déposer un scan, activer, suspendre, révoquer ;
   l'IBAN n'est visible en clair nulle part dans l'interface ni dans les
   réponses réseau.
5. Classeur des fonctionnalités mis à jour et `npm run wiki:export` lancé.
