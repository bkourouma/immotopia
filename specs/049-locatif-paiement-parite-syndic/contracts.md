# Contrats 049 — Locatif : paiement mobile money déclaré (parité Syndic)

**Spec** : [spec.md](./spec.md) · **Tâches** : [tasks.md](./tasks.md) · **Modèle** : [spec 047](../047-syndic-paiement-declare/contracts.md)

Référence unique des agents API et web. Types : `packages/api/src/lib/rental/declared-payment/types.ts` et
`apps/web/src/types/rental-declared-payment.ts` (mêmes noms, mêmes formes ; le web recopie, il n'importe pas
l'API). En cas d'écart, l'implémentation a tort ; un doute se signale au chef de lot.

## 0. Conventions communes

- **Enveloppe** identique au Syndic : succès `{ success: true, data: T }` (les routes existantes ajoutent en
  plus `message` et, pour les listes, `pagination`, inchangés) ; erreur
  `{ success: false, message, code?, errors?: {field,message}[], data? }` (`errorHandler`). Messages français
  par `t()`.
- **Préfixes** : gestionnaire `/api/tenants/:tenantId/rental/…` ; portail locataire `/api/portal/tenant/…`.
- **Authentification** : gestionnaire = `authenticate` + `requireTenantAccess` + garde de permission de la route ;
  portail = authentification du portail locataire existante (agence, contact et baux du périmètre déduits de la
  session, jamais du corps). Un objet hors périmètre ou d'une autre agence répond 404 comme un objet inexistant.
- **Permissions** (aucune nouvelle) : `RENTAL_PAYMENTS_VIEW` lecture ; `RENTAL_PAYMENTS_ALLOCATE` numéros,
  réglages, validation, rejet ; `RENTAL_PAYMENTS_CREATE` déclaration pour un tiers.
- **Montants** : nombres en FCFA, entiers en entrée pour les nouvelles routes (stockage `Decimal(12,2)` inchangé ;
  en sortie, nombre JS). **Dates** : ISO 8601 ; en entrée `paidAt` est une date-heure avec décalage
  (`2026-11-09T14:32:00+00:00`) et doit être ≤ maintenant + 10 min et ≥ maintenant - 90 jours.
- **Identifiants** : UUID. **Corps** : Zod `.strict()` (champ inconnu = 400 `VALIDATION_ERROR`).
- **Multipart** : routes avec capture = `multipart/form-data` ; fichier `proof` (JPEG, PNG, WebP, PDF par type
  réel, 5 Mo) et champ texte `payload` contenant le JSON du corps. Exception : `…/payments/declare` existant
  garde ses champs texte à plat (voir 1.3).
- **Téléphones** : format libre en entrée, normalisés E.164 (`+225` + 10 chiffres, préfixes 01, 05, 07) par
  `lib/syndics/declared-payment/phone.ts`, sinon 400 `INVALID_PHONE`.
- **Référence** : normalisée (majuscules, espaces retirés), motif `^[A-Z0-9.-]{4,40}$`, sinon 400
  `RENTAL_DECLARATION_REFERENCE_INVALID`.
- **Statuts** : `PaymentDeclarationStatus` contient déjà `CANCELED` ; l'annulation locataire l'utilise.
- **Pagination des nouvelles listes** : `data = { items, total, page, pageSize }` (type `RentalPaginated<T>`).
  Les routes de liste existantes gardent aussi leur champ `pagination` historique.

### Compatibilité (ADDITIF vs MODIFIÉ)

| Élément                                                                                                                                           | Nature                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Routes existantes `GET/POST …/rental/payment-declarations…` (liste, détail, proof, approve, reject) et `POST /api/portal/tenant/payments/declare` | Chemins conservés                                                                                                                                                                                                                                                                                                              |
| Corps `approve` existant `{ reviewNotes, treasuryAccountId }`                                                                                     | Reste valide ; ajout optionnel de `acceptedAmount`, `note` (`reviewNotes` = alias de `note`)                                                                                                                                                                                                                                   |
| Corps `reject` existant `{ reviewNotes }`                                                                                                         | Reste valide pour les anciens clients : `rejectReason` absent = `OTHER` et `reviewNotes` tient lieu de note. Les nouveaux clients envoient `rejectReason`                                                                                                                                                                      |
| Éléments des listes/détail existants (lignes snake_case)                                                                                          | Conservés tels quels ; AJOUT d'une clé `view: RentalPaymentDeclarationDto` (camelCase) sur chaque élément                                                                                                                                                                                                                      |
| `declarePayment` portail                                                                                                                          | `reference` devient OBLIGATOIRE pour les nouvelles déclarations. Les lignes existantes gardent `reference` nulle. Champs additifs : `receivingNumberId`, `operator` (alias de `mobileOperator`), `proofReadId`, `payerPhone` (alias de `transactionPhone`). Le canal de paiement des nouvelles déclarations est `MOBILE_MONEY` |
| Nouvelles colonnes de `RentalPaymentDeclaration` (lot 1)                                                                                          | Nullables : `receiving_number_id`, `accepted_amount`, `reject_reason`, `ai_prefilled`, `ai_edited_fields`, `proof_read_id`, `declared_by_user_id`, `canceled_at`                                                                                                                                                               |
| Routes numéros, réglages, availability, lecture, cancel, pending-count, déclaration pour tiers, mes déclarations                                  | NOUVELLES                                                                                                                                                                                                                                                                                                                      |
| `pendingDeclaration` sur les échéances                                                                                                            | ADDITIF (voir 1.6)                                                                                                                                                                                                                                                                                                             |

### Codes d'erreur (ajouts à `ErrorCode`, à faire par le chef)

| Code                                          | HTTP | Sens                                                                                                               |
| --------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| `RENTAL_DECLARED_PAYMENT_DISABLED`            | 400  | Déclaration désactivée (`enabled=false`) ou aucun numéro actif                                                     |
| `RENTAL_RECEIVING_NUMBER_NOT_FOUND`           | 404  | Numéro inconnu, d'une autre agence, ou (portail) désactivé                                                         |
| `RENTAL_RECEIVING_NUMBER_INACTIVE`            | 400  | Numéro désactivé utilisé dans une déclaration (côté gestionnaire)                                                  |
| `RENTAL_RECEIVING_NUMBER_DUPLICATE`           | 409  | (agence, opérateur, phone) déjà enregistré                                                                         |
| `RENTAL_RECEIVING_NUMBER_IN_USE`              | 409  | Suppression dure refusée : `DELETE` ne renvoie pas cette erreur (désactivation douce), réservé aux usages internes |
| `INVALID_PHONE`                               | 400  | Existant (spec 047), réutilisé                                                                                     |
| `RENTAL_DECLARATION_REFERENCE_INVALID`        | 400  | Référence hors motif après normalisation, ou absente                                                               |
| `RENTAL_DECLARATION_DUPLICATE_REFERENCE`      | 409  | Référence déjà PENDING ou APPROVED chez le même numéro                                                             |
| `RENTAL_DECLARATION_AMOUNT_TOO_HIGH`          | 400  | Montant > 5 000 000 FCFA                                                                                           |
| `RENTAL_DECLARATION_AMOUNT_INVALID`           | 400  | Montant ≤ 0 ou non entier                                                                                          |
| `RENTAL_DECLARATION_DATE_OUT_OF_RANGE`        | 400  | `paidAt` dans le futur (> 10 min) ou de plus de 90 jours                                                           |
| `RENTAL_DECLARATION_PROOF_REQUIRED`           | 400  | Capture exigée (`proofRequired`) et absente                                                                        |
| `RENTAL_DECLARATION_PROOF_INVALID`            | 400  | Type réel non accepté ou fichier illisible ; ou fichier ET `proofReadId` fournis                                   |
| `RENTAL_DECLARATION_PROOF_TOO_LARGE`          | 413  | Capture de plus de 5 Mo                                                                                            |
| `RENTAL_DECLARATION_ALREADY_REVIEWED`         | 409  | Validation, rejet ou annulation d'une déclaration qui n'est plus PENDING                                           |
| `RENTAL_DECLARATION_CORRECTION_NOTE_REQUIRED` | 400  | Montant retenu ≠ montant déclaré sans note (10 à 500)                                                              |
| `RENTAL_DECLARATION_REJECT_NOTE_REQUIRED`     | 400  | `rejectReason = OTHER` sans note                                                                                   |
| `RENTAL_DECLARATION_ACCEPTED_AMOUNT_INVALID`  | 400  | Montant retenu ≤ 0 ou > 5 000 000                                                                                  |
| `RENTAL_DECLARATION_INSTALLMENT_INVALID`      | 404  | Échéance inconnue, hors bail du périmètre, annulée ou déjà soldée                                                  |
| `RENTAL_PROOF_READ_DISABLED`                  | 409  | `aiPrefillEnabled=false` ou aucun fournisseur de vision sur le serveur                                             |
| `RENTAL_PROOF_READ_QUOTA_EXCEEDED`            | 429  | Quota atteint ; `data.scope ∈ {MINUTE, DAY, CONTACT_MONTH, TENANT_MONTH}`, `data.retryAfterSeconds?`               |
| `RENTAL_PROOF_READ_INVALID`                   | 409  | `proofReadId` inconnu, d'un autre contact, déjà utilisé ou expiré                                                  |

Restent : `VALIDATION_ERROR` (400), 401, 403 (permission manquante), 404 générique (déclaration ou objet hors
agence), 429 des limiteurs de débit génériques.

---

## 1. Famille « Déclarations »

### 1.1 Numéros de réception (gestionnaire)

Base : `/api/tenants/:tenantId/rental/receiving-numbers`. Un numéro appartient à l'AGENCE et pas à un bien ;
`treasuryAccountId` est dérivé de l'opérateur (`mobileMoneySpec(operator)`, comptes 5521 à 5524 ; `OTHER` = 5529) et créé à la demande s'il manque ; jamais saisi. Unicité (agence, `operator`, `phone` normalisé).

| Route               | Permission                 | Corps                                                 | Réponse                                                        |
| ------------------- | -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `GET /`             | `RENTAL_PAYMENTS_VIEW`     | query `active?: 'true'                                | 'false'`                                                       | `200` `RentalReceivingNumberDto[]` (tri : actifs d'abord, opérateur, création) |
| `POST /`            | `RENTAL_PAYMENTS_ALLOCATE` | `CreateRentalReceivingNumberBody` (`label` 60 max)    | `201` `RentalReceivingNumberDto`                               |
| `PATCH /:numberId`  | `RENTAL_PAYMENTS_ALLOCATE` | `UpdateRentalReceivingNumberBody` (au moins un champ) | `200` `RentalReceivingNumberDto`                               |
| `DELETE /:numberId` | `RENTAL_PAYMENTS_ALLOCATE` | aucun                                                 | `200` `{ id: string; deleted: boolean; deactivated: boolean }` |

- `DELETE` : sans aucune déclaration liée, suppression définitive (`deleted: true`) ; avec déclarations liées,
  désactivation douce (`deactivated: true`, `active=false`), jamais d'erreur. Audit `DEACTIVATED` dans les
  deux cas.
- Changer `operator` ou `phone` d'un numéro portant des déclarations est autorisé : les anciennes déclarations
  gardent leur instantané (`receivingNumber` du DTO est relu du numéro courant, l'opérateur de la déclaration
  reste celui déclaré).
- Un numéro ne peut servir à une déclaration que s'il est actif (`RENTAL_RECEIVING_NUMBER_INACTIVE` côté
  gestionnaire, `RENTAL_RECEIVING_NUMBER_NOT_FOUND` côté portail).
- Erreurs : 400 `VALIDATION_ERROR`, 400 `INVALID_PHONE`, 404 `RENTAL_RECEIVING_NUMBER_NOT_FOUND`, 409
  `RENTAL_RECEIVING_NUMBER_DUPLICATE`.

### 1.2 Réglages (gestionnaire)

`/api/tenants/:tenantId/rental/declared-payment/settings`

| Route | Permission                 | Corps                                                         | Réponse                                  |
| ----- | -------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| `GET` | `RENTAL_PAYMENTS_VIEW`     | aucun                                                         | `200` `RentalDeclaredPaymentSettingsDto` |
| `PUT` | `RENTAL_PAYMENTS_ALLOCATE` | `UpdateRentalDeclaredPaymentSettingsBody` (au moins un champ) | `200` `RentalDeclaredPaymentSettingsDto` |

Défauts sans ligne en base (rien n'est écrit par un `GET`) : `enabled: true`, `proofRequired: false`,
`aiPrefillEnabled: false`, `reviewAlertBusinessDays: 3` (entier 1 à 15). Erreur : 400 `VALIDATION_ERROR`.
`aiReadsMonthlyQuota = 300` (`RENTAL_PROOF_READ_QUOTAS.tenantPerMonth`). Audit à chaque `PUT` qui change une
valeur.

### 1.3 Déclaration par le locataire (portail)

`POST /api/portal/tenant/payments/declare` — route existante, étendue. `multipart/form-data`, fichier `proof`
FACULTATIF (champ existant), champs texte à plat :

| Champ               | Type                        | Règle                                                                                                      |
| ------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `installmentId`     | UUID, facultatif            | échéance du périmètre du locataire (non annulée, non soldée) ; absent = bail par défaut, déclaration libre |
| `receivingNumberId` | UUID                        | numéro ACTIF de l'agence                                                                                   |
| `operator`          | `RentalMobileMoneyOperator` | opérateur utilisé par le locataire (alias accepté : `mobileOperator`)                                      |
| `reference`         | texte                       | OBLIGATOIRE (nouvelles déclarations), normalisée                                                           |
| `amount`            | nombre                      | entier, `1 ≤ amount ≤ 5 000 000` (libre, pas de lien avec le montant dû)                                   |
| `paidAt`            | date-heure ISO              | bornes 1.1 ; l'ancien champ `paymentDate` (date) reste accepté comme alias                                 |
| `payerPhone`        | texte, facultatif           | alias `transactionPhone` ; normalisé E.164                                                                 |
| `notes`             | texte, facultatif           | 500 max                                                                                                    |
| `proofReadId`       | UUID, facultatif            | exclusif avec le fichier `proof`                                                                           |

Les anciens champs (`paymentMethod`, etc.) restent tolérés et ignorés pour le canal : toute nouvelle
déclaration vaut `MOBILE_MONEY`.

Réponse `201` : `data: TenantPortalDeclarationDto` avec `duplicateSuspected: boolean`.

Règles :

- **Doublon bloquant** : même `reference` normalisée, même numéro de réception, déclaration PENDING ou APPROVED
  existante : `409 RENTAL_DECLARATION_DUPLICATE_REFERENCE` (`data: { declarationId }` non fourni au portail).
- **Doublon probable** (non bloquant) : même montant + même jour de `paidAt` + même échéance, références
  différentes, déclaration PENDING ou APPROVED : la déclaration est créée, `duplicateSuspected: true`, et le
  gestionnaire voit l'alerte `DUPLICATE_SUSPECTED`.
- Déclaration refusée si le réglage est désactivé : `400 RENTAL_DECLARED_PAYMENT_DISABLED`.
- Capture exigée si `proofRequired` : `400 RENTAL_DECLARATION_PROOF_REQUIRED`.
- Erreurs : `RENTAL_DECLARED_PAYMENT_DISABLED`, `RENTAL_RECEIVING_NUMBER_NOT_FOUND`, `INVALID_PHONE`,
  `RENTAL_DECLARATION_REFERENCE_INVALID`, `RENTAL_DECLARATION_AMOUNT_INVALID`,
  `RENTAL_DECLARATION_AMOUNT_TOO_HIGH`, `RENTAL_DECLARATION_DATE_OUT_OF_RANGE`,
  `RENTAL_DECLARATION_PROOF_REQUIRED`, `RENTAL_DECLARATION_PROOF_INVALID`,
  `RENTAL_DECLARATION_PROOF_TOO_LARGE`, `RENTAL_DECLARATION_DUPLICATE_REFERENCE`,
  `RENTAL_DECLARATION_INSTALLMENT_INVALID`, `RENTAL_PROOF_READ_INVALID`, 404.
- La capture n'est jamais servie au locataire. Limiteur de création : 10/min par compte.

### 1.4 Disponibilité, mes déclarations, annulation (portail)

| Route                                                                 | Corps                     | Réponse                                                |
| --------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------ |
| `GET /api/portal/tenant/payments/declare/availability`                | aucun                     | `200` `DeclarePaymentAvailabilityDto`                  |
| `GET /api/portal/tenant/payments/declarations`                        | query `status?` (`PENDING | APPROVED                                               | REJECTED | CANCELED | ALL`), `page`, `pageSize` (20, max 50) | `200` `RentalPaginated<TenantPortalDeclarationDto>` |
| `GET /api/portal/tenant/payments/declarations/:declarationId`         | aucun                     | `200` `TenantPortalDeclarationDto`                     |
| `POST /api/portal/tenant/payments/declarations/:declarationId/cancel` | aucun                     | `200` `TenantPortalDeclarationDto` (status `CANCELED`) |

- `availability` : `enabled` = réglage ; `available` = `enabled` ET au moins un numéro actif ;
  `receivingNumbers` = numéros ACTIFS (numéro complet) ; `aiPrefillAvailable` = `aiPrefillEnabled` ET
  fournisseur configuré ET quotas non atteints ; `maxAmount = 5000000` ; `instructions` = texte d'aide libre
  de l'agence (peut être `null` ; non configurable dans cette famille, toujours `null` au lot 1).
- Les listes ne montrent que les déclarations déclarées par le contact de la session (ou posées pour lui par le
  gestionnaire) sur les baux de son périmètre. Hors périmètre : 404.
- `cancel` : seulement `PENDING` et déclarée par le contact ; sinon `409 RENTAL_DECLARATION_ALREADY_REVIEWED`.
  Pose `status = CANCELED`, `canceled_at`. Audit `RENTAL_PAYMENT_DECLARATION_CANCELED`.

### 1.5 Lecture IA de la capture (portail)

`POST /api/portal/tenant/payments/declare/lecture` — `multipart/form-data`, fichier `proof` OBLIGATOIRE (mêmes
règles que 1.3), aucun autre champ. Limiteurs posés AVANT le parseur : 5 par minute et 30 par jour par compte.
Quotas métier : 300 par mois par agence, 30 par mois par contact.

Réponse `200` : `data: ProofReadResultDto`. Les champs non lus valent `null` (jamais devinés). Une panne du
fournisseur répond 200 avec `quality: 'UNREADABLE'`, tous les champs à `null` et `confidence: {}`.
`matchedReceivingNumberId` = numéro actif de l'agence reconnu dans la capture, sinon `null` ;
`warnings` : `RECIPIENT_NOT_A_RECEIVING_NUMBER`, `REFERENCE_ALREADY_DECLARED`. La capture est conservée 24 h
et liée par `proofReadId` ; elle devient la preuve de la déclaration si `proofReadId` est renvoyé en 1.3.

Erreurs : `409 RENTAL_PROOF_READ_DISABLED` (`aiPrefillEnabled=false` ou pas de fournisseur),
`429 RENTAL_PROOF_READ_QUOTA_EXCEEDED` (`data.scope`), `400 RENTAL_DECLARATION_PROOF_INVALID`,
`413 RENTAL_DECLARATION_PROOF_TOO_LARGE`, `400 RENTAL_DECLARATION_PROOF_REQUIRED` (fichier absent).

### 1.6 Côté gestionnaire

Base : `/api/tenants/:tenantId/rental/payment-declarations`.

| Route                          | Permission                 | Corps / query                                                                    | Réponse                                                                                                                 |
| ------------------------------ | -------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /`                        | `RENTAL_PAYMENTS_VIEW`     | query `RentalDeclarationListQuery`                                               | `200` `RentalPaginated<RentalPaymentDeclarationDto>` (existant : chaque élément porte aussi `view`, voir Compatibilité) |
| `GET /pending-count`           | `RENTAL_PAYMENTS_VIEW`     | aucun                                                                            | `200` `PendingCountDto`                                                                                                 |
| `GET /:declarationId`          | `RENTAL_PAYMENTS_VIEW`     | aucun                                                                            | `200` `RentalPaymentDeclarationDto`                                                                                     |
| `GET /:declarationId/proof`    | `RENTAL_PAYMENTS_VIEW`     | aucun                                                                            | fichier (flux, `Content-Type` réel, `Content-Disposition: inline`, `Cache-Control: private, no-store`)                  |
| `POST /:declarationId/approve` | `RENTAL_PAYMENTS_ALLOCATE` | `ApproveDeclarationBody`                                                         | `200` `ApproveDeclarationResponse`                                                                                      |
| `POST /:declarationId/reject`  | `RENTAL_PAYMENTS_ALLOCATE` | `RejectDeclarationBody`                                                          | `200` `RentalPaymentDeclarationDto` (status `REJECTED`)                                                                 |
| `POST /`                       | `RENTAL_PAYMENTS_CREATE`   | multipart : `payload` = `CreateDeclarationForThirdPartyBody`, `proof` facultatif | `201` `RentalPaymentDeclarationDto`                                                                                     |

Ordre de déclaration des routes : `/pending-count` AVANT `/:declarationId`.

**Liste** : `status` défaut `PENDING` si absent ; `search` porte sur le nom du locataire, la référence, le
téléphone payeur, le numéro de bail ; `flagged=true` ne garde que les déclarations avec au moins une alerte
(`duplicateSuspected`, montant différent du dû, `overdue`) ; `from`/`to` bornent `paidAt` (jours inclus) ;
tri : les plus anciennes PENDING d'abord, sinon `createdAt` décroissant. `overdue` = PENDING depuis plus de
`reviewAlertBusinessDays` jours ouvrés (lundi à vendredi, sans jours fériés).

**Preuve** : fichier privé servi par flux authentifié (`lib/rental/proof-files.ts`), jamais en statique. 404
si aucune capture. Chaque lecture est journalisée (audit `RENTAL_PAYMENT_DECLARATION_PROOF_VIEWED`, comme le
Syndic).

**approve** : déclaration `PENDING` obligatoire (`409 RENTAL_DECLARATION_ALREADY_REVIEWED`). `acceptedAmount`
absent ou égal au montant déclaré : validation telle que déclarée. S'il diffère : `note` (alias `reviewNotes`,
10 à 500 caractères) OBLIGATOIRE (`400 RENTAL_DECLARATION_CORRECTION_NOTE_REQUIRED`), `0 < acceptedAmount ≤
5 000 000`, `corrected: true` et événement d'audit `APPROVED_WITH_CORRECTION`. Effet : création d'un paiement
`MOBILE_MONEY` du montant retenu, crédit du compte de trésorerie du numéro (`treasuryAccountId` dérivé ;
l'ancien `treasuryAccountId` du corps reste accepté et prime s'il est fourni), affectation à l'échéance par le
service d'allocation existant (surplus géré comme aujourd'hui). `installment` de la réponse = échéance après
affectation (`null` si la déclaration n'a pas d'échéance). Erreurs : `RENTAL_DECLARATION_ALREADY_REVIEWED`,
`RENTAL_DECLARATION_CORRECTION_NOTE_REQUIRED`, `RENTAL_DECLARATION_ACCEPTED_AMOUNT_INVALID`, 404.

**reject** : `rejectReason ∈ RENTAL_DECLARATION_REJECT_REASONS` (`NOT_FOUND`, `AMOUNT_MISMATCH`,
`REFERENCE_USED`, `WRONG_NUMBER`, `OTHER`). `note` 10 à 500, obligatoire si `OTHER`
(`400 RENTAL_DECLARATION_REJECT_NOTE_REQUIRED`) ; facultative sinon. Un corps ancien `{ reviewNotes }` sans
`rejectReason` est lu comme `OTHER`. Erreurs : `RENTAL_DECLARATION_ALREADY_REVIEWED`, 404.

**Déclaration pour un tiers** (`POST /`) : `leaseId` (bail de l'agence), `installmentId?` (de ce bail), mêmes
contrôles de montant, date, référence, numéro, téléphone et doublon que 1.3 ; le déclarant enregistré reste le
locataire principal du bail (`declared_by`) et `declaredByUserId` est posé côté serveur depuis la session
(jamais lu du corps) ; `declaredBy` du DTO vaut alors `{ type: 'MANAGER', userId, name }`. Statut initial
`PENDING`. Audit `RENTAL_PAYMENT_DECLARATION_CREATED_FOR_THIRD_PARTY`. Mêmes erreurs que 1.3, plus 404
`RENTAL_DECLARATION_INSTALLMENT_INVALID` si l'échéance n'est pas du bail.

**pending-count** : `{ pending: number; overdue: number }`, additif, pour le badge de menu. Même agence
seulement.

**Champ additif `pendingDeclaration` sur les échéances.** Type : `PendingDeclarationSummary | null`
(`{ id, amount, declaredAt, reference? }`). Là où l'ajouter :

- API : le DTO de la liste et du détail d'échéances renvoyé par `GET /api/tenants/:tenantId/rental/installments`
  et `GET …/rental/installments/:installmentId` (lignes `RentalInstallment`, `lib/rental`/service
  d'échéances) : AJOUT du champ `pendingDeclaration` (camelCase, au milieu de champs snake_case existants,
  assumé) à chaque élément. Valeur : la plus ancienne déclaration `PENDING` de l'échéance ; `null` si aucune.
- Web : `RentalInstallment` dans `apps/web/src/services/rental-service.ts` gagne
  `pendingDeclaration?: PendingDeclarationSummary | null` (importé de `types/rental-declared-payment`).
- Les autres consommateurs de `RentalInstallment` (portail propriétaire, etc.) ne sont pas modifiés.

### 1.7 Notifications, audit (liste d'intention)

**Notifications** (clés, canaux et variables au lot 3 ; ici l'intention seulement) :

- `RENTAL_PAYMENT_DECLARATION_TO_REVIEW` : récapitulatif horaire aux utilisateurs ayant
  `RENTAL_PAYMENTS_ALLOCATE`, seulement s'il y a des déclarations PENDING nouvelles depuis le dernier envoi.
- `RENTAL_PAYMENT_DECLARATION_OVERDUE_ALERT` : alerte quotidienne listant les déclarations PENDING au-delà de
  `reviewAlertBusinessDays` jours ouvrés.
- `RENTAL_RECEIVING_NUMBER_CHANGED` : avertit les gestionnaires (création, changement de numéro ou
  d'opérateur, désactivation).

**Événements d'audit** :
`RENTAL_RECEIVING_NUMBER_CREATED`, `RENTAL_RECEIVING_NUMBER_UPDATED`, `RENTAL_RECEIVING_NUMBER_DEACTIVATED`,
`RENTAL_DECLARED_PAYMENT_SETTINGS_UPDATED`, `RENTAL_PAYMENT_DECLARATION_CREATED_FOR_THIRD_PARTY`,
`RENTAL_PAYMENT_DECLARATION_APPROVED_WITH_CORRECTION`, `RENTAL_PAYMENT_DECLARATION_REJECTED`,
`RENTAL_PAYMENT_DECLARATION_CANCELED`, plus `RENTAL_PAYMENT_DECLARATION_PROOF_VIEWED` (lecture de capture).
Les validations sans correction restent journalisées par l'audit existant du service d'approbation.

## 2. Paiement en ligne

Types : `packages/api/src/lib/rental/online-review/types.ts` (API) et `apps/web/src/types/rental-online-payment.ts` (web, copie sans import). Mêmes noms, mêmes formes.

Conventions : enveloppe `{ success: true, data }` ; erreurs `{ success:false, message, code?, errors?, data? }`. Préfixe gestionnaire `/api/tenants/:tenantId/rental` (garde `authenticate, requireTenantAccess` puis la permission indiquée) ; portail `/api/portal/tenant`. Corps Zod `.strict()` sur routes authentifiées. Aucun identifiant d'agence lu d'un corps. Un objet d'une autre agence répond 404 comme un objet inexistant. Pagination : `{ items, total, page, pageSize }`. Limiteurs : 20/min/utilisateur sur verify, resolve, payouts (POST) ; 10/min/utilisateur sur `collection-account` (appel fournisseur).

Ordre de déclaration obligatoire : `/online-payments/summary`, `/online-payments/availability`, `/online-payments/collection-account` (et `/payouts`) AVANT `/online-payments/:checkoutId`.

### 2.0 Migration Prisma (additive, `OnlinePaymentCheckout`) — DÉJÀ POSÉE par le lot 0 (migration `20261109120000_rental_payment_parity`, champs `reviewKind`, `receivedAmount`, `resolution`, `resolvedByUserId`, `resolvedAt`, `resolutionNote`) ; le lot 2 n'ajoute aucune migration

Colonnes nullables (enums Prisma `RentalOnlineReviewKind`, `RentalOnlineReviewResolution` = `ACCEPT|REJECT`) (le suivi et la décision en dépendent ; le Syndic les porte déjà) : `reviewKind String?` (`review_kind`), `receivedAmount Decimal?(12,2)` (`received_amount`), `resolution` (`ACCEPT|REJECT`), `resolutionNote String?`, `resolvedAt DateTime?`, `resolvedByUserId String?`. `reviewReason` existant reste le texte affiché. Index `@@index([tenantId, status, createdAt])` si absent. Aucun nouveau modèle de reversement (H5).

### 2.1 `GET /online-payments`

Permission : `RENTAL_PAYMENTS_VIEW`. Query (`ListOnlinePaymentsQuery`) : `status?` (liste séparée par virgules de `RentalOnlineCheckoutStatus`, défaut tous), `reviewKind?`, `search?` (code de paiement, nom locataire, référence bail, id transaction ; insensible à la casse), `leaseId?` (uuid), `from?`/`to?` (`YYYY-MM-DD`, bornes sur `createdAt`, `to` inclus), `page?` (1), `pageSize?` (20, max 100). Tri : `createdAt` décroissant.

Réponse 200 : `RentalOnlinePaginated<RentalOnlinePaymentRowDto>`. Ligne = tentative + bail (`leaseId`, `leaseReference`, `propertyLabel`) + locataire (`renter`) + échéances (`installments[]`) + `amount`, `receivedAmount`, `reviewKind`, `reviewReason`, `resolution*`, `paymentId` (RentalPayment), `collected`. Jamais de `checkoutUrl`, `providerToken`, `lastProviderPayload`.

Erreurs : 400 `VALIDATION_ERROR` (status inconnu, dates invalides, `from > to`) ; 401/403 ; 404 `leaseId` d'une autre agence.

### 2.2 `GET /online-payments/summary`

Permission : `RENTAL_PAYMENTS_VIEW`. Réponse : `RentalOnlinePaymentsSummaryDto` : `counts` (les 6 statuts, 0 si vide, TOUTE l'agence), `reviewPending` (= `counts.REVIEW`), `reviewByKind` (4 motifs), `oldestReviewAt`. Sert aux pastilles et au badge « à vérifier ».

### 2.3 `GET /online-payments/:checkoutId`

Permission : `RENTAL_PAYMENTS_VIEW`. Réponse : `RentalOnlinePaymentDetailDto` (= ligne + `checkAttempts`, `lastProviderState`, `log[]`, `payment`). `log` est reconstitué du plus ancien au plus récent depuis l'audit (`RENTAL_ONLINE_PAYMENT_*`, `RENTAL_PAYMENT_ONLINE_*` existants) et `lastCheckedAt`/`checkAttempts` ; entrée : `{ at, kind, status, providerState, message, actorName }` (`actorName` null pour webhook/job). Erreurs : 404.

### 2.4 `POST /online-payments/:checkoutId/verify`

Permission : `RENTAL_PAYMENTS_ALLOCATE`. Pas de corps. Interroge la passerelle avec les identifiants de l'agence puis applique le moteur existant (`online-check`). Réponse 200 : `VerifyOnlinePaymentResultDto { checkout, changed }`.

Règle impérative : la vérification manuelle, la vérification automatique (retour portail/IPN) et `online-payment-reconciliation-job` n'encaissent JAMAIS une tentative en `REVIEW`. Sur `REVIEW`, ils mettent seulement à jour `lastProviderState`, `receivedAmount`, `lastCheckedAt`, `checkAttempts`. Seule la décision (2.5) tranche. Un nouvel état contraire détecté sur une tentative déjà `SUCCESS` la bascule en `REVIEW` / `CONTRARY_STATE` sans annuler l'encaissement.

Erreurs : 404 ; 409 `CHECKOUT_NOT_VERIFIABLE` (ni `PENDING` ni `REVIEW`) ; 502 `ONLINE_PAYMENT_PROVIDER_UNREACHABLE`.

Additif : la route existante `POST /payments/:paymentId/online-check` est conservée telle quelle (même moteur, même règle REVIEW).

### 2.5 `POST /online-payments/:checkoutId/resolve`

Permission : `RENTAL_PAYMENTS_ALLOCATE`. Corps `ResolveOnlinePaymentBody` : `decision: 'ACCEPT'|'REJECT'` ; `note?` (trim, 1 à 500 ; OBLIGATOIRE pour `REJECT`, facultatif pour `ACCEPT`) ; `paidAt?` (`YYYY-MM-DD`, pas dans le futur, `ACCEPT` seulement, défaut aujourd'hui ; fourni avec `REJECT` : 400).

Réponse 200 : `ResolveOnlinePaymentResultDto { checkout, payment|null }`. `payment` n'est renseigné que si CET appel a encaissé.

Règles :

- Une seule transaction : claim atomique (`updateMany` sur `id` + `tenantId` + `status='REVIEW'` -> `SUCCESS` ou `FAILED`) ; deux décisions concurrentes : un seul vainqueur, l'autre reçoit 409.
- `ACCEPT` encaisse via le service d'allocation existant (celui du succès automatique : `completeRentalPaymentFromCheckout` / allocation de `RentalPayment`), idempotent : un `RentalPayment` déjà `COMPLETED` et alloué n'est jamais encaissé deux fois. Montant encaissé = `receivedAmount`, à défaut `amount`. Le surplus non alloué reste non alloué (visible dans `unallocatedAmount`). `checkout.status = SUCCESS`, `resolution = ACCEPT`.
- `REJECT` : aucun encaissement ni remboursement (l'argent reste chez PaySecureHub ; l'écran le rappelle) ; `RentalPayment` -> `FAILED` ; `checkout.status = FAILED`, `resolution = REJECT`, `failureMessage = note`.
- Matrice par `reviewKind` :

| `reviewKind`                                                       | ACCEPT                                                                                                      | REJECT                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------- |
| `AMOUNT_MISMATCH`                                                  | encaisse le montant reçu sur les échéances visées encore ouvertes                                           | refus simple                |
| `INSTALLMENT_UNAVAILABLE`                                          | encaisse sur les échéances encore ouvertes ; si aucune n'est ouverte, le paiement est enregistré non alloué | refus simple                |
| `DUPLICATE_TRANSACTION`                                            | 409 `REVIEW_NOT_ACCEPTABLE`                                                                                 | refus simple                |
| `CONTRARY_STATE` avec encaissement déjà fait (`collected = true`)  | aucun nouvel encaissement ; clôt en `SUCCESS`                                                               | 409 `REVIEW_NOT_REJECTABLE` |
| `CONTRARY_STATE` sans encaissement (succès tardif après `EXPIRED`) | encaisse le montant reçu                                                                                    | refus simple                |

Erreurs : 400 `VALIDATION_ERROR` (note manquante pour `REJECT`, `paidAt` futur ou avec `REJECT`) ; 404 ; 409 `CHECKOUT_NOT_IN_REVIEW` (statut ≠ `REVIEW`, y compris déjà tranchée) ; 409 `REVIEW_NOT_ACCEPTABLE` ; 409 `REVIEW_NOT_REJECTABLE`. Exercice clos : l'erreur 400 existante du service d'allocation.

Audit : `RENTAL_ONLINE_PAYMENT_RESOLVED` `{ checkoutId, codePaiement, decision, reviewKind, amount, note }` (jamais de jeton ni d'URL).

### 2.6 Motifs de REVIEW (`reviewKind`)

Posés au passage en `REVIEW` avec `reviewReason` (texte français via `t()`), et audités `RENTAL_ONLINE_PAYMENT_REVIEW` `{ checkoutId, codePaiement, reviewKind, amount, receivedAmount }`.

| Motif                     | Définition                                                                                                  | Ce que l'écran explique                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AMOUNT_MISMATCH`         | montant payé selon la passerelle différent du montant attendu (même tolérance zéro qu'au Syndic)            | « Le locataire a payé X au lieu de Y. » Montrer attendu vs reçu et l'effet d'un ACCEPT (le reçu est encaissé ; trop-perçu non alloué, ou reste dû si moins) |
| `CONTRARY_STATE`          | la passerelle rapporte échec/annulation après un succès déjà encaissé, ou un succès arrive après expiration | dire si l'argent est déjà encaissé (`collected`), vérifier côté PaySecureHub avant de trancher, REJECT interdit si déjà encaissé                            |
| `DUPLICATE_TRANSACTION`   | la transaction fournisseur est déjà enregistrée sur une autre tentative                                     | seul REJECT possible ; indiquer la tentative d'origine (code)                                                                                               |
| `INSTALLMENT_UNAVAILABLE` | une échéance visée est déjà soldée/annulée, ou n'appartient plus au bail/locataire courant                  | lister les échéances concernées ; ACCEPT encaisse ce qui reste ouvert                                                                                       |

### 2.7 Compte de collecte (H5)

Aucun nouveau modèle. Le « compte de collecte » est le compte de trésorerie `5525` créé par `ensureCollectionAccountTx` (`lib/payment-gateway/config.ts`) ; le reversement est un virement de trésorerie existant du 5525 vers un compte de trésorerie de l'agence.

`GET /online-payments/collection-account` (`RENTAL_PAYMENTS_VIEW`, 10/min) -> `RentalCollectionAccountDto` : `treasuryAccountId` (null tant que le 5525 n'existe pas ; la route ne le crée pas), `ledgerBalance` (solde comptable via `treasuryBalanceTx`, 0 si absent), `provider` (`available`, `balance` du `getBalance` PaySecureHub avec les identifiants de l'agence, sinon `balance:null` + `unavailableReason` parmi `NOT_CONFIGURED|SIMULATOR|NO_CREDENTIALS|UNREACHABLE` + `message`), `recentPayouts` (5 derniers). Répond toujours 200 : une panne fournisseur n'est jamais un 500.

`GET /online-payments/collection-account/payouts` (`RENTAL_PAYMENTS_VIEW`) : query `ListCollectionPayoutsQuery` (`page`, `pageSize` ≤ 100) -> `RentalOnlinePaginated<RentalCollectionPayoutDto>`. Source : `listTransfers(tenantId, { accountId })` filtré sur `fromTreasuryAccountId = 5525`, hors virements annulés (`status` non `VOIDED`), date décroissante.

`POST /online-payments/collection-account/payouts` (`RENTAL_PAYMENTS_ALLOCATE`, 20/min) : corps `CreateCollectionPayoutBody { toTreasuryAccountId, amount, date, note? }`. Réponse 201 `CreateCollectionPayoutResultDto { payout, ledgerBalanceAfter }`. Implémentation : appelle `createTransfer(tenantId, userId, { fromTreasuryAccountId: <id du 5525>, toTreasuryAccountId, amount, transferredAt: date, reference: 'REVERSEMENT PSH', notes: note })` (`lib/treasury/service.ts`), qui contrôle déjà la couverture du compte source (`assertTreasuryCanPayTx`) et numérote `VIR-AAAA-NNNN`. Enregistrement comptable seulement : aucun virement réel n'est déclenché chez PaySecureHub.

Erreurs : 400 `VALIDATION_ERROR` ; 400 `PAYOUT_EXCEEDS_COLLECTED` (montant > solde du 5525, contrôlé avant l'appel) ; 400 `BadRequestError` existante (destination désactivée/introuvable, source = destination, exercice clos) ; 404 si le 5525 n'existe pas encore (`NotFoundError`) ; 409 `PAYOUT_DUPLICATE` : non applicable (pas de référence saisie). Audit : `RENTAL_COLLECTION_PAYOUT_RECORDED` `{ transferId, number, toTreasuryAccountId, amount, date }`.

### 2.8 Disponibilité durcie

`GET /online-payments/availability` (gestionnaire, `RENTAL_PAYMENTS_VIEW`) -> `OnlinePaymentAvailabilityDto`.
`GET /api/portal/tenant/online-payments/availability` -> `PortalOnlinePaymentAvailabilityDto`. Chemin existant CONSERVÉ (le chemin `/payments/online/availability` évoqué dans le brief n'existe pas ; ne pas en créer un second).

Règle unique (`resolveRentalOnlineAvailability(tenantId)`, partagée par gestionnaire, portail, lien public, relances et création de lien) : `usable = config active ET (mode ≠ SIMULATOR OU paymentGatewaySimulatorAvailable) ET droit RENTAL de l'agence` (agence active + `evaluateFeatureAccess(entitlements, 'RENTAL', true)` avec les modes `off|warn|enforce`). Motifs : `NOT_CONFIGURED` (pas de ligne), `INACTIVE`, `SIMULATOR_FORBIDDEN`, `SUBSCRIPTION`.

Modifié (existant) :

- Portail : `getOnlinePaymentAvailability` renvoyait `{ available, mode, feesPaidBy }` ; la réponse GAGNE `unavailableReason` et `simulated` (additif) et `available` applique la règle durcie.
- Routes portail `/online-payments*` : ajouter un limiteur de débit (`GET availability` 60/min/IP, `POST /online-payments` 10/min/utilisateur, `GET /:codePaiement` 60/min/utilisateur) et un garde RENTAL (`assertRentalOnlinePaymentAllowed(tenantId)`) : refus 403 `RENTAL_FEATURE_DENIED` (sauf `availability`, qui répond `available:false`).
- `startCheckout` (portail) et `createInstallmentPaymentLink` / lien public : refus 400 `ONLINE_PAYMENT_UNAVAILABLE` si `usable` est faux (jamais de repli).
- Lien public d'échéance (`GET /public/secure-links/installment-payment` et `POST …/start`) : recontrôle du locataire ACTUEL du bail à l'ouverture ET au démarrage : si `lease.renterClientId` n'est plus celui du lien -> 409 `INSTALLMENT_LINK_TENANT_CHANGED` ; bail terminé/résilié/annulé -> 409 `INSTALLMENT_LINK_LEASE_ENDED`. Le lien reste non révoqué en base (aucun effet de bord à l'ouverture), le message est neutre et ne divulgue aucune donnée.

### 2.9 Configuration passerelle (rappel, seulement ce qui change)

`GET/PUT /api/tenants/:tenantId/settings/payment-gateway` (`TENANT_SETTINGS_EDIT`) existants, non redéfinis. Seuls changements : (1) la réponse GET ajoute `usable` durci (règle 2.8) et `unavailableReason` ; (2) `PUT mode:'SIMULATOR'` refusé 400 `GATEWAY_SIMULATOR_UNAVAILABLE` si `!paymentGatewaySimulatorAvailable` (déjà le cas : ne pas régresser) ; (3) changement de `mode`, `merchantId` ou clé alors qu'une tentative est `PENDING` -> 409 `GATEWAY_CHECKOUTS_PENDING` (déjà au Syndic, à reprendre si absent). Un compte PaySecureHub par agence (H1) : aucun compte par bail ni par bien.

### 2.10 Codes d'erreur à ajouter à `ErrorCode`

Déjà présents dans `ErrorCode` (worktree, NE PAS ajouter, à utiliser tels quels) :

| Code                                              | HTTP    | Usage locatif                                                                                                                                           |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RENTAL_ONLINE_PAYMENT_NOT_IN_REVIEW`             | 409     | resolve sur une tentative qui n'est pas (ou plus) `REVIEW` (remplace `CHECKOUT_NOT_IN_REVIEW` du Syndic)                                                |
| `RENTAL_ONLINE_PAYMENT_NOTE_REQUIRED`             | 400     | resolve `REJECT` sans note                                                                                                                              |
| `RENTAL_ONLINE_PAYMENT_UNAVAILABLE`               | 400     | création de lien / démarrage de paiement alors que `usable` est faux (remplace `ONLINE_PAYMENT_UNAVAILABLE` pour le locatif)                            |
| `RENTAL_ONLINE_PAYMENT_LEASE_TENANT_CHANGED`      | 409     | lien public ouvert ou démarré alors que le locataire actuel du bail n'est plus celui du lien, OU que le bail est terminé (même code, message distinct)  |
| `RENTAL_COLLECTION_PAYOUT_INVALID`                | 400     | virement de collecte invalide (montant > solde du 5525, destination désactivée/introuvable, source = destination) ; remplace `PAYOUT_EXCEEDS_COLLECTED` |
| `CHECKOUT_NOT_VERIFIABLE`                         | 409     | verify sur une tentative ni `PENDING` ni `REVIEW` (code Syndic réutilisé)                                                                               |
| `REVIEW_NOT_ACCEPTABLE` / `REVIEW_NOT_REJECTABLE` | 409     | cas de la matrice 2.5 (codes Syndic réutilisés)                                                                                                         |
| `ONLINE_PAYMENT_PROVIDER_UNREACHABLE`             | 502     | passerelle injoignable (code Syndic réutilisé)                                                                                                          |
| `GATEWAY_*`                                       | 400/409 | configuration passerelle (inchangés)                                                                                                                    |

À AJOUTER : `RENTAL_FEATURE_DENIED` (403, abonnement de l'agence sans droit RENTAL sur le portail locataire). Dans le reste de cette section, `ONLINE_PAYMENT_UNAVAILABLE`, `CHECKOUT_NOT_IN_REVIEW`, `PAYOUT_EXCEEDS_COLLECTED` et `INSTALLMENT_LINK_*` se lisent comme leurs équivalents `RENTAL_*` du tableau.

### 2.11 Additif vs modifié

Additif : routes 2.1 à 2.7, `GET /online-payments/availability`, migration 2.0, types, événements d'audit `RENTAL_ONLINE_PAYMENT_REVIEW|RESOLVED`, `RENTAL_COLLECTION_PAYOUT_RECORDED`, champs `unavailableReason`/`simulated` de la disponibilité portail. Modifié : moteur de rapprochement (REVIEW jamais encaissé automatiquement, pose de `reviewKind` et `receivedAmount`), `getOnlinePaymentAvailability` (règle durcie), routes portail `/online-payments*` (limiteurs + garde RENTAL), liens publics d'échéance (recontrôle du locataire actuel). Inchangés : `OnlineCheckoutDto` du portail, `POST /payments/:paymentId/online-check`, routes de liens `/installments/:installmentId/payment-link(s)`, IPN `/payment-gateway/paysecurehub/ipn`.

## 3. Relances

Types : `packages/api/src/lib/rental/payment-reminders/types.ts` (API) et `apps/web/src/types/rental-payment-reminder.ts` (web, copie sans import). Préfixe `/api/tenants/:tenantId/rental`. Décision H3 : relances MANUELLES et PAR LOT avec aperçu, JAMAIS d'envoi automatique planifié (aucun job, aucun cron).

Ordre de déclaration : `/payment-reminders/preview` et `/payment-reminders/batch` AVANT `/payment-reminders/:id` (aucune route `:id` n'est exposée, la liste suffit).

### 3.0 Modèle Prisma `RentalPaymentReminder` (`rental_payment_reminders`)

Champs (noms identiques dans les DTO) : `id` uuid, `tenant_id`, `installment_id` uuid, `lease_id` uuid, `level Int` (1..3), `channel ReminderChannel`, `status ReminderStatus`, `sent_by String?`, `sent_at DateTime`, `payment_link_id String?` (`SecureLink.id`, jamais le jeton), `failure_code String?`, `created_at`. Index `(tenant_id, installment_id, level)`, `(tenant_id, lease_id)`, `(tenant_id, sent_at)`. Relations : `Tenant` (cascade) ; `installment_id`/`lease_id` comme champs simples ou relations selon la convention du modèle `RentalInstallment`. Couvert par `schema-tenant-coverage.test.ts`.

Canaux pris en charge : `EMAIL` et `WHATSAPP` uniquement. `SMS` et `PUSH` existent dans l'enum `ReminderChannel` mais sont refusés (400 `VALIDATION_ERROR`, jamais écrits). Statuts écrits : `SENT` ou `FAILED` (`DELIVERED` réservé).

### 3.1 Règles de calcul (source unique `computeReminderPlan`)

- Éligible : échéance au reste dû > 0, bail actif, locataire ACTUEL présent.
- Destinataire : le locataire ACTUEL du bail (jamais celui enregistré sur le lien ou l'échéance d'origine), via la règle de résolution de contact existante.
- Clé d'événement : `INSTALLMENT_OVERDUE` si `dueDate` < aujourd'hui (retard) ; `INSTALLMENT_DUE_REMINDER` si l'échéance arrive dans `daysBefore` jours. Un événement désactivé par l'agence exclut avec `EVENT_DISABLED`.
- Niveau : entier 1..3 = (dernier niveau envoyé avec statut `SENT`) + 1, minimum 1 ; au-delà de 3 : `MAX_LEVEL_REACHED`. `SendReminderBody.level` peut forcer un niveau 1..3 mais ne contourne aucune exclusion.
- Espacement : 7 jours minimum entre deux niveaux sur une même échéance (`TOO_SOON` sinon). Une relance `FAILED` ne compte pas pour l'espacement.
- Exclusions (liste `RentalReminderExclusionReason`) : `ALREADY_PAID` ; `PENDING_DECLARATION` (déclaration de paiement `PENDING` récente, moins de 7 jours) ; `PENDING_ONLINE_ATTEMPT` (tentative en ligne `PENDING` de moins de 15 min, ou `REVIEW`) ; `TOO_SOON` ; `MAX_LEVEL_REACHED` ; `NO_CURRENT_TENANT` ; `LEASE_NOT_ACTIVE` ; `NO_CONTACT_CHANNEL` (ni e-mail ni WhatsApp utilisable) ; `EVENT_DISABLED` ; `NOT_DUE_YET` (hors fenêtre `daysBefore`). Plusieurs raisons possibles ; `eligible = exclusions.length === 0`.
- Lien de paiement : si la disponibilité 2.8 est `usable`, un lien public d'échéance existant (non expiré, non révoqué) est réutilisé, sinon créé (`createInstallmentPaymentLink`, TTL par défaut, créé par l'envoyeur). Sinon aucun lien (`paymentLinkIncluded:false`), la relance part quand même.
- Variables des modèles `INSTALLMENT_DUE_REMINDER` et `INSTALLMENT_OVERDUE` : `{{paymentBlock}}` = bloc texte complet (lien « Payer en ligne : <url> » + numéros de réception actifs de l'agence), vide sans lien ni numéro ; `{{paymentUrl}}` = URL seule, vide sans lien. Variables déjà présentes conservées (locataire, période, montant, échéance, bien). Les modèles par défaut e-mail et WhatsApp reçoivent `{{paymentBlock}}`. L'URL ne figure ni dans le journal ni dans l'audit.
- Un canal échoué n'empêche pas l'autre ; une ligne est `SENT` si au moins un canal a abouti, `FAILED` si tous ont échoué, `SKIPPED` si exclue.

### 3.2 `GET /payment-reminders/preview`

Permission : `RENTAL_PAYMENTS_VIEW`. Query `RentalReminderPreviewQuery` : `daysBefore?` (0 à 30, défaut 0), `minDaysLate?` (défaut 1), `leaseId?`, `propertyId?`, `installmentId?` (uuid : restreint l'aperçu à cette seule échéance, avec ses motifs d'exclusion même hors fenêtre `daysBefore`/`minDaysLate`, `eligibleOnly` ignoré, 404 si l'échéance n'est pas de l'agence), `search?`, `eligibleOnly?` (défaut false). Aucune écriture, aucun envoi. Plafond 500 échéances (au-delà : tronqué, retard le plus ancien d'abord).

Réponse 200 : `RentalReminderPreviewDto { generatedAt, groups: RentalReminderPreviewGroupDto[], totals { eligible, excluded, amountDue } }`. Groupes par bail/locataire (`totalDue` = somme des reste dû des lignes). Chaque ligne `RentalReminderPreviewItemDto` porte `nextLevel`, `channels`, `amountDue`, `daysLate`, `eventKey`, `paymentLinkIncluded`, `eligible`, `exclusions`. Les lignes exclues sont renvoyées (avec raisons) sauf `eligibleOnly=true`.

Erreurs : 400 `VALIDATION_ERROR` ; 404 `leaseId`/`propertyId`/`installmentId` d'une autre agence.

### 3.3 `POST /installments/:installmentId/reminder`

Permission : `RENTAL_PAYMENTS_ALLOCATE`. Limiteur 20/min/utilisateur. Corps `SendReminderBody { channels?, level? }` (`.strict()`). Les canaux demandés sont croisés avec les canaux utilisables ; un canal demandé non utilisable est ignoré (raison `NO_CONTACT_CHANNEL` si aucun ne reste).

Réponse 200 : `SendReminderResultDto { installmentId, status: 'SENT'|'FAILED', level, reason: null, failureCode, channels[], paymentLinkId }`. Un échec total d'envoi (`FAILED`) reste un 200 avec le détail. Une relance ne change jamais l'échéance.

Échéance exclue (route unitaire seulement) : aucun envoi, erreur 409 avec `data: { installmentId, reason: RentalReminderExclusionReason, exclusions: RentalReminderExclusionReason[] }` : code `RENTAL_REMINDER_TOO_SOON` si `reason = TOO_SOON`, sinon `RENTAL_REMINDER_NOT_ELIGIBLE`. (Le lot, lui, ne lève jamais : il renvoie `SKIPPED`.)

Erreurs : 400 `VALIDATION_ERROR` (canal `SMS`/`PUSH`, niveau hors 1..3) ; 404 échéance inconnue ou d'une autre agence ; 409 `RENTAL_REMINDER_TOO_SOON` / `RENTAL_REMINDER_NOT_ELIGIBLE` (ci-dessus).

### 3.4 `POST /payment-reminders/batch`

Permission : `RENTAL_PAYMENTS_ALLOCATE`. Limiteur 10/min/utilisateur. Corps `BatchReminderBody { installmentIds: uuid[1..100] sans doublon, channels? }`. Le serveur RECALCULE le plan de chaque échéance au moment de l'envoi (l'aperçu n'est pas une promesse) ; aucun niveau n'est lu du corps. Traitement séquentiel, un échec n'arrête pas le lot.

Réponse 200 : `BatchReminderResultDto { results: SendReminderResultDto[] (même ordre que la requête), totals { sent, skipped, failed } }`.

Erreurs : 400 `VALIDATION_ERROR` (liste vide, > 100, doublons) ; 404 si au moins un id n'est pas de l'agence (aucun envoi, réponse uniforme).

### 3.5 `GET /payment-reminders`

Permission : `RENTAL_PAYMENTS_VIEW`. Query `ListRemindersQuery` : `installmentId?`, `leaseId?`, `channel?`, `status?`, `level?`, `from?`/`to?` (`YYYY-MM-DD` sur `sent_at`, `to` inclus), `page?` (1), `pageSize?` (20, max 100). Tri `sent_at` décroissant. Réponse : `RentalReminderPaginated<RentalPaymentReminderDto>` (champs bruts `snake_case` du modèle + contexte `leaseReference`, `tenantName`, `periodYear`, `periodMonth`, `amountDue`, `sent_by_name`).

### 3.6 `GET /installments/:installmentId/reminders`

Permission : `RENTAL_PAYMENTS_VIEW`. Réponse : `RentalPaymentReminderDto[]` (toutes les relances de l'échéance, plus récente d'abord, sans pagination, max 50). 404 si l'échéance n'est pas de l'agence.

### 3.7 Audit et codes d'erreur

Audit `RENTAL_PAYMENT_REMINDER_SENT` `{ installmentId, leaseId, level, channels, status, paymentLinkId }` (par échéance ; jamais d'URL, de jeton ni de contenu de message). Codes d'erreur : aucun à ajouter ; `RENTAL_REMINDER_TOO_SOON` et `RENTAL_REMINDER_NOT_ELIGIBLE` (409) existent déjà dans `ErrorCode`, avec `VALIDATION_ERROR` et `NotFoundError`. Les raisons d'exclusion sont des données de réponse, pas des erreurs HTTP.

### 3.8 Additif vs modifié

Additif : modèle `RentalPaymentReminder` + migration, 5 routes, helper `computeReminderPlan`, variables `{{paymentBlock}}`/`{{paymentUrl}}` dans les modèles `INSTALLMENT_DUE_REMINDER` et `INSTALLMENT_OVERDUE` (par défaut e-mail et WhatsApp et catalogue des variables). Modifié : aucun comportement existant ; les notifications automatiques éventuelles de ces deux clés (si une route les déclenche déjà) ne sont pas touchées, sauf l'ajout des deux variables. Aucun job planifié n'est créé (H3).
