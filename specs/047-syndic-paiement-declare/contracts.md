# Contrats 047 — Paiement mobile money déclaré par le copropriétaire

**Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md) · **Tâches** : [tasks.md](./tasks.md)

Ce document est la **référence unique** des agents API et web, qui travaillent en parallèle. En cas d'écart
entre une implémentation et ce fichier, c'est l'implémentation qui a tort ; un doute se signale au
coordinateur, il ne se tranche pas seul.

## 0. Conventions communes

- **Enveloppe** : succès `{ success: true, data: T }` ; erreur
  `{ success: false, message: string, code?: string, errors?: {field,message}[], data?: unknown }`
  (`errorHandler` existant). Messages en français, passés par `t()`.
- **Montants** : nombres JavaScript en FCFA, **entiers** (aucune décimale acceptée en entrée). **Dates** :
  chaîne ISO 8601 ; en entrée, `paidAt` est une date-heure ISO avec décalage (`2026-10-17T14:32:00+00:00`).
- **Identifiants** : UUID.
- **Corps** : Zod `.strict()` (champ inconnu = 400 `VALIDATION_ERROR`). Les routes avec capture sont en
  `multipart/form-data` : un champ fichier `proof` et un champ texte `payload` contenant le JSON décrit,
  validé par le même schéma strict.
- **Isolation** : aucun identifiant d'agence lu d'un corps. Gestionnaire : `:tenantId` par
  `requireTenantAccess`, `:syndicId` par `assertSyndicateOfTenant`. Portail : agence et périmètre par
  `requireCoOwnerPortalAccess` et `resolveCoOwnerScope`. Tout objet hors périmètre ou d'une autre agence
  répond comme un objet inexistant (404).
- **Téléphones** : en entrée, format libre (`0707070707`, `+225 07 07 07 07 07`) ; le serveur normalise en
  E.164 (`+2250707070707`) ou répond 400 `INVALID_PHONE`. En sortie : E.164 côté gestionnaire ; côté portail,
  le numéro de réception est complet (il faut pouvoir le composer) et le numéro payeur est celui que le
  copropriétaire a saisi.
- **Référence** : normalisée par le serveur (majuscules, espaces retirés) ; motif `^[A-Z0-9.-]{4,40}$` après
  normalisation.
- Les types portent **les mêmes noms** côté API (`packages/api/src/lib/syndics/declared-payment/types.ts`)
  et côté web (dans les services) ; le web les recopie, il ne les importe pas.

### 0.1 Types partagés

```ts
export type MobileMoneyOperator = "ORANGE" | "MTN" | "MOOV" | "WAVE" | "OTHER";
export type DeclarationStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
export type DeclarationRejectReason =
  | "NOT_FOUND" // « Paiement introuvable »
  | "AMOUNT_MISMATCH" // « Montant ne correspondant pas »
  | "REFERENCE_USED" // « Référence déjà utilisée »
  | "WRONG_NUMBER" // « Numéro de réception erroné »
  | "OTHER"; // « Autre »
/** Champs que l'IA peut proposer et dont on suit la retouche. */
export type PrefillField =
  "operator" | "amount" | "paidAt" | "transactionReference" | "payerPhone";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface DocumentRef {
  id: string;
  kind: "RECEIPT" | "QUITTANCE";
  number: string;
}

export interface ReceivingNumber {
  id: string;
  operator: MobileMoneyOperator;
  phoneNumber: string; // E.164
  holderName: string;
  label: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** Vue gestionnaire d'un numéro. */
export interface ReceivingNumberAdmin extends ReceivingNumber {
  treasuryAccountNumber: string; // « 55211 »…
  treasuryBalance: number; // solde comptable du sous-compte dans cette copropriété
  sharedWithCount: number; // autres copropriétés de l'agence qui utilisent ce numéro (D10)
  pendingDeclarations: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeclaredPaymentSettings {
  syndicateId: string;
  enabled: boolean; // défaut false (D11)
  reviewAlertBusinessDays: number; // 1 à 15, défaut 3 (D12)
  proofRequired: boolean; // défaut false (D14)
  payerInstructions: string | null; // 500 caractères au plus
  aiPrefillEnabled: boolean; // défaut false (D9)
  /** Un fournisseur de vision est configuré sur le serveur (PR3 ; false avant). */
  aiPrefillAvailable: boolean;
  /** Lectures IA de l'agence ce mois-ci et quota (300, D9). */
  aiReadsThisMonth: number;
  aiReadsMonthlyQuota: number;
  /** Activé ET au moins un numéro actif. */
  usable: boolean;
}

/** Proposition de l'IA (PR3). Chaque champ peut manquer : il n'est jamais deviné. */
export interface PaymentProofReading {
  readId: string; // à renvoyer dans la déclaration (proofReadId)
  quality: "OK" | "UNREADABLE" | "NOT_A_PAYMENT";
  operator: MobileMoneyOperator | null;
  amount: number | null;
  paidAt: string | null;
  transactionReference: string | null;
  payerPhone: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  confidence: Partial<Record<PrefillField, number>>; // 0 à 1
  /** Contrôles serveur (R28). */
  warnings: Array<
    "RECIPIENT_NOT_A_RECEIVING_NUMBER" | "REFERENCE_ALREADY_DECLARED"
  >;
  /** Numéro de réception reconnu parmi les numéros actifs, s'il y en a un. */
  matchedReceivingNumberId: string | null;
}

export interface DeclarationLineInput {
  lotId: string;
  amount: number; // part de ce lot, entier > 0
  chargeCallIds: string[]; // 0 à 24, appels ouverts du lot ; [] = plus anciens d'abord
}

export interface DeclarationInput {
  syndicId: string; // portail seulement ; ignoré (absent) côté gestionnaire où il est dans l'URL
  receivingNumberId: string;
  payerPhone: string;
  amount: number; // 1 à 5 000 000 (D13), = somme des lignes
  paidAt: string; // ≤ maintenant + 10 min, ≥ maintenant − 90 jours
  transactionReference: string;
  lines: DeclarationLineInput[]; // 1 à 10, lots distincts de la même copropriété
  comment?: string | null; // 500 caractères au plus
  /** Lecture IA dont la capture devient la preuve (PR3). Exclusif avec un fichier `proof`. */
  proofReadId?: string | null;
}

export type DeclarationAlert =
  | {
      kind: "REFERENCE_ON_EXISTING_PAYMENT";
      chargePaymentId: string;
      paidAt: string;
      amount: number;
    }
  | { kind: "PROBABLE_DUPLICATE"; declarationId: string; createdAt: string }
  | { kind: "EXCESS"; lotId: string; excess: number } // deviendra une avance
  | { kind: "PARTIAL"; lotId: string; remaining: number }
  | { kind: "DECLARANT_NOT_CURRENT_OWNER"; lotId: string }
  | { kind: "AI_FIELDS_EDITED"; fields: PrefillField[] }
  | { kind: "RECIPIENT_MISMATCH"; recipientPhone: string } // lu par l'IA ≠ numéro choisi
  | { kind: "FISCAL_YEAR_CLOSED" }
  | { kind: "OVERDUE"; businessDays: number };

export interface DeclarationLineView {
  id: string;
  lot: { id: string; lotNumber: string };
  amount: number;
  acceptedAmount: number | null;
  chargeCalls: Array<{ id: string; period: string; remainingDue: number }>; // reste dû ACTUEL
  chargePaymentId: string | null;
  documents: DocumentRef[]; // après validation
}

/** Ligne et détail côté gestionnaire. */
export interface SyndicDeclarationRow {
  id: string;
  status: DeclarationStatus;
  receivingNumber: {
    id: string;
    operator: MobileMoneyOperator;
    phoneNumber: string;
    holderName: string;
  }; // instantané
  declaredBy:
    | { type: "COOWNER"; contactId: string; name: string }
    | { type: "MANAGER"; userId: string; name: string }; // P4
  payerPhone: string;
  amount: number;
  acceptedAmount: number | null;
  paidAt: string;
  acceptedPaidAt: string | null;
  transactionReference: string;
  lines: DeclarationLineView[];
  hasProof: boolean;
  aiPrefilled: boolean;
  aiEditedFields: PrefillField[];
  overdue: boolean;
  alerts: DeclarationAlert[]; // calculées à la lecture ; vides hors PENDING sauf historiques utiles
  comment: string | null;
  rejectReason: DeclarationRejectReason | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  createdAt: string;
}

/** Vue du copropriétaire. */
export interface CoOwnerDeclaration {
  id: string;
  status: DeclarationStatus;
  syndicate: { id: string; name: string };
  receivingNumber: {
    operator: MobileMoneyOperator;
    phoneNumber: string;
    holderName: string;
  };
  payerPhone: string;
  amount: number;
  acceptedAmount: number | null; // si corrigé
  paidAt: string;
  transactionReference: string;
  lines: Array<{
    lot: { id: string; lotNumber: string };
    amount: number;
    acceptedAmount: number | null;
    chargeCallIds: string[];
  }>;
  documents: DocumentRef[];
  rejectReason: DeclarationRejectReason | null;
  reviewNote: string | null; // note de correction ou de rejet
  canCancel: boolean; // PENDING
  createdAt: string;
  reviewedAt: string | null;
}
```

### 0.2 Codes d'erreur (ajouts à `ErrorCode`)

| Code                              | HTTP | Sens                                                                                |
| --------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| `DECLARED_PAYMENT_UNAVAILABLE`    | 400  | Copropriété qui n'accepte pas les déclarations, ou sans numéro actif                |
| `RECEIVING_NUMBER_INACTIVE`       | 400  | Numéro de réception désactivé ou d'une autre copropriété                            |
| `RECEIVING_NUMBER_DUPLICATE`      | 409  | Même opérateur et même numéro déjà enregistrés dans cette copropriété               |
| `INVALID_PHONE`                   | 400  | Numéro non normalisable en numéro ivoirien                                          |
| `INVALID_TRANSACTION_REFERENCE`   | 400  | Référence hors du motif après normalisation                                         |
| `DECLARATION_AMOUNT_MISMATCH`     | 400  | Somme des lignes ≠ montant                                                          |
| `DECLARATION_AMOUNT_TOO_HIGH`     | 400  | Montant > 5 000 000 FCFA                                                            |
| `DECLARATION_DATE_OUT_OF_RANGE`   | 400  | `paidAt` dans le futur (> 10 min) ou de plus de 90 jours                            |
| `DECLARATION_PROOF_REQUIRED`      | 400  | Capture exigée par la copropriété et absente                                        |
| `DECLARATION_PROOF_INVALID`       | 400  | Fichier ni JPEG, ni PNG, ni WebP, ni PDF (type réel), ou illisible                  |
| `DECLARATION_PROOF_TOO_LARGE`     | 413  | Capture de plus de 5 Mo                                                             |
| `DECLARATION_REFERENCE_USED`      | 409  | Référence déjà déclarée (`PENDING` ou `APPROVED`) sur ce numéro de réception        |
| `DECLARATION_PENDING_LIMIT`       | 409  | Déjà 10 déclarations en attente sur un des lots                                     |
| `DECLARATION_NOT_PENDING`         | 409  | Validation, rejet ou annulation d'une déclaration qui n'est pas (ou plus) `PENDING` |
| `CHARGE_CALL_DECLARATION_PENDING` | 409  | Paiement en ligne demandé sur un appel visé par une déclaration en attente (R15)    |
| `RECEIVING_NUMBER_IN_USE`         | 409  | Suppression demandée d'un numéro qui porte des déclarations (le désactiver)         |
| `PROOF_READ_UNAVAILABLE`          | 409  | Lecture IA coupée pour l'agence ou aucun fournisseur sur le serveur (PR3)           |
| `PROOF_READ_QUOTA_EXCEEDED`       | 429  | Quota mensuel de lectures de l'agence atteint (PR3)                                 |
| `PROOF_READ_INVALID`              | 409  | `proofReadId` inconnu, d'un autre contact, déjà utilisé ou expiré                   |

Restent : `VALIDATION_ERROR` (400), 401, 403 (`SYNDIC_FEATURE_DENIED` au portail, déjà défini en spec 042),
404, 429 (limiteurs). L'exercice clos lève la `BadRequestError` existante d'`assertFiscalYearOpenTx`.

---

## 1. Gestionnaire — `/api/tenants/:tenantId/syndics/:syndicId`

Fichier : `packages/api/src/routes/syndic-declared-payment-routes.ts`, monté sur `/api`, classé `SYNDIC` par
le préfixe `/syndics` de `route-features.ts`. Gardes posées avec leur chemin :
`authenticate, requireTenantAccess, enforcePropertyTenantIsolation`, puis
`canView = requireAnyPropertyPermission(['SYNDIC_VIEW'])` ou `canEdit = requirePropertyPermission('SYNDIC_EDIT')`
(D8 : `SYNDIC_EDIT` suffit pour valider). Écritures : `syndicDeclaredWriteRateLimiter` (20/min).

### 1.1 `GET /numeros-reception` — `canView`

Réponse : `ReceivingNumberAdmin[]` (actifs puis inactifs, par `sortOrder`).

### 1.2 `POST /numeros-reception` — `canEdit` (PR1)

```ts
interface CreateReceivingNumberBody {
  operator: MobileMoneyOperator;
  phoneNumber: string;
  holderName: string; // 2 à 80 caractères
  label?: string | null; // 60 au plus
  isActive?: boolean; // défaut true
}
```

Réponse 201 : `ReceivingNumberAdmin`. Crée le sous-compte 5521x de la copropriété. Erreurs :
`INVALID_PHONE`, `RECEIVING_NUMBER_DUPLICATE`. Audit `SYNDIC_RECEIVING_NUMBER_CREATED`.

### 1.3 `PATCH /numeros-reception/:numberId` — `canEdit` (PR1)

Corps : sous-ensemble de 1.2 plus `sortOrder?: number`. Changer `operator` ou `phoneNumber` est **refusé**
s'il existe une déclaration (`RECEIVING_NUMBER_IN_USE`) : on crée un autre numéro. `isActive: false` =
désactivation (audit `…_DEACTIVATED`), autorisée même avec des déclarations `PENDING` (R3, cas 10).

### 1.4 `DELETE /numeros-reception/:numberId` — `canEdit` (PR1)

204 si aucune déclaration ne le référence ; sinon 409 `RECEIVING_NUMBER_IN_USE`. Le sous-compte comptable
n'est pas supprimé.

### 1.5 `GET` / `PUT /paiements-declares/reglages` — `canView` / `canEdit` (PR1)

`GET` : `DeclaredPaymentSettings`. `PUT` :

```ts
interface UpdateDeclaredPaymentSettingsBody {
  enabled?: boolean;
  reviewAlertBusinessDays?: number; // 1 à 15
  proofRequired?: boolean;
  payerInstructions?: string | null;
  aiPrefillEnabled?: boolean; // accepté dès PR1, sans effet avant PR3
}
```

Réponse : `DeclaredPaymentSettings`. Audit `SYNDIC_DECLARED_PAYMENT_SETTINGS_UPDATED` (valeurs, aucune donnée
personnelle).

### 1.6 `GET /paiements-declares` — `canView` (PR2)

Requête : `status?` (défaut `PENDING`, `ALL` permis), `receivingNumberId?`, `lotId?`, `from?`, `to?`
(`YYYY-MM-DD`, sur `paidAt`), `overdue?` (`true`), `page` (défaut 1), `limit` (défaut 20, max 100).
Tri : en retard, puis doublons suspectés, puis `createdAt` croissant (les plus anciennes d'abord) pour
`PENDING` ; `reviewedAt` décroissant sinon.

```ts
interface ListDeclarationsResponse {
  items: SyndicDeclarationRow[];
  pagination: Pagination;
  counts: { pending: number; overdue: number; suspectedDuplicate: number };
}
```

### 1.7 `GET /paiements-declares/:declarationId` — `canView` (PR2)

Réponse : `SyndicDeclarationRow` avec `alerts` complètes et le reste dû actuel de chaque appel visé.

### 1.8 `GET /paiements-declares/:declarationId/preuve` — `canView` (PR2)

Flux du fichier privé (`sendPrivateFile` : `Content-Type` réel, `Content-Disposition: inline`,
`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`). 404 si aucune preuve ou hors agence.

### 1.9 `POST /paiements-declares/:declarationId/validation` — `canEdit` (PR2)

```ts
interface ApproveDeclarationBody {
  /** Absent = validation telle que déclarée. */
  correction?: {
    paidAt?: string; // obligatoire si la date déclarée tombe dans un exercice clos
    lines?: Array<{
      lineId: string;
      acceptedAmount: number;
      chargeCallIds?: string[];
    }>; // toutes les lignes
  } | null;
  note?: string | null; // obligatoire (10 à 500) si correction présente
}
interface ApproveDeclarationResponse {
  declaration: SyndicDeclarationRow; // status APPROVED
  documents: DocumentRef[];
}
```

Une ligne à `acceptedAmount: 0` n'est pas encaissée (il en faut au moins une > 0). Erreurs :
`DECLARATION_NOT_PENDING`, `VALIDATION_ERROR`, 400 d'exercice clos. Audit `SYNDIC_PAYMENT_DECLARATION_APPROVED`
(montants, sans capture).

### 1.10 `POST /paiements-declares/:declarationId/rejet` — `canEdit` (PR2)

```ts
interface RejectDeclarationBody {
  reason: DeclarationRejectReason;
  note: string; // 10 à 500
}
```

Réponse : `SyndicDeclarationRow` (status `REJECTED`). Erreur : `DECLARATION_NOT_PENDING`.

### 1.11 `POST /paiements-declares` — `canEdit` (PR2, P4)

`multipart/form-data` : `payload` = `DeclarationInput` sans `syndicId` ni `proofReadId`, plus
`declaredForContactId?: string` (copropriétaire pour qui l'on déclare, membre de la copropriété) ; fichier
`proof` facultatif. Réponse 201 : `SyndicDeclarationRow` (status `PENDING` : le gestionnaire valide ensuite
par 1.9, ce qui laisse une trace distincte). Mêmes erreurs que 2.4.

---

## 2. Portail copropriétaire — `/api/portal/copropriete`

Fichier : `packages/api/src/routes/coowner-portal-routes.ts` (déjà sous `authenticate` et
`requireCoOwnerPortalAccess`). Droit SYNDIC de l'agence vérifié explicitement (403 `SYNDIC_FEATURE_DENIED`).
Ordre : les chemins littéraux (`disponibilite`, `lecture`) avant `:declarationId`.

### 2.1 `GET /paiements-declares/disponibilite?syndicId=` (PR2)

```ts
interface CoOwnerDeclaredAvailability {
  syndicateId: string;
  available: boolean; // réglage activé, au moins un numéro actif, droit SYNDIC
  receivingNumbers: ReceivingNumber[]; // actifs seulement
  payerInstructions: string | null;
  proofRequired: boolean;
  aiPrefillAvailable: boolean; // false avant PR3, et si quota atteint
  maxAmount: number; // 5 000 000
}
```

`syndicId` hors du périmètre → 404.

### 2.2 `GET /appels` (existant, PR2) — champ additif par appel

```ts
pendingDeclaration: { declarationId: string; createdAt: string } | null;
```

`onlinePayable` (spec 042) passe à `false` quand `pendingDeclaration` est non nul.

### 2.3 `POST /paiements-declares/lecture` (PR3)

`multipart/form-data` : champ texte `syndicId`, fichier `proof` (mêmes règles que 2.4). Limiteurs
`coOwnerProofReadLimiter` : 5/min et 30/jour par compte, posés avant le parseur.
Réponse : `PaymentProofReading`. Une panne du fournisseur répond **200** avec `quality: 'UNREADABLE'`, tous
les champs à `null` et le message côté écran (R30) ; seuls l'indisponibilité (`PROOF_READ_UNAVAILABLE`) et le
quota (`PROOF_READ_QUOTA_EXCEEDED`) sont des erreurs. Capture conservée 24 h, liée par `readId`.

### 2.4 `POST /paiements-declares` (PR2)

`multipart/form-data` : `payload` = `DeclarationInput` ; fichier `proof` facultatif (ou `proofReadId`, pas les
deux → 400). Limiteur `coOwnerDeclarationCreateLimiter` 10/min par compte. Contrôles : périmètre de chaque
lot, appels du lot, numéro actif de la copropriété, montant, date, référence, capture.
Réponse 201 : `CoOwnerDeclaration`. Erreurs : `DECLARED_PAYMENT_UNAVAILABLE`, `RECEIVING_NUMBER_INACTIVE`,
`INVALID_PHONE`, `INVALID_TRANSACTION_REFERENCE`, `DECLARATION_AMOUNT_MISMATCH`, `DECLARATION_AMOUNT_TOO_HIGH`,
`DECLARATION_DATE_OUT_OF_RANGE`, `DECLARATION_PROOF_REQUIRED`, `DECLARATION_PROOF_INVALID`,
`DECLARATION_PROOF_TOO_LARGE`, `DECLARATION_REFERENCE_USED`, `DECLARATION_PENDING_LIMIT`, `PROOF_READ_INVALID`, 404. Le déclarant enregistré est le contact de la session (`scope.lots[].contactId` du premier lot).

### 2.5 `GET /paiements-declares` (PR2)

Requête : `status?`, `page`, `limit` (20, max 50). Réponse :
`{ items: CoOwnerDeclaration[]; pagination: Pagination }`, limitée aux déclarations dont **toutes** les
lignes portent sur des lots du périmètre (une déclaration du gestionnaire pour son compte y figure).

### 2.6 `POST /paiements-declares/:declarationId/annulation` (PR2)

Pas de corps. Réponse : `CoOwnerDeclaration` (status `CANCELED`). Erreurs : `DECLARATION_NOT_PENDING`, 404
(hors périmètre ou déclarée par un autre contact).

Le portail **ne sert pas** la capture : le copropriétaire l'a déjà.

---

## 3. Effets transverses

### 3.1 Paiement en ligne (spec 042)

`POST /api/portal/copropriete/paiements-en-ligne` : si un appel demandé est visé par une déclaration
`PENDING` → 409 `CHARGE_CALL_DECLARATION_PENDING`, `data: { chargeCallIds: string[] }`.

### 3.2 Relances (D7)

`runReminderBatchForSyndicate` saute un appel visé par une déclaration `PENDING` créée depuis moins de
`reviewAlertBusinessDays` jours ouvrés. Aucune route ne change. La relance manuelle
(`createManualReminderForChargeCall`) reste permise ; sa réponse gagne
`pendingDeclaration: { declarationId, createdAt } | null` (champ additif, information de l'écran).

### 3.3 Comptabilité

Écriture d'un encaissement validé : **débit 5521x** (compte du numéro de réception) / **crédit 450**, ligne
rattachée au lot, journal banque, libellé « Encaissement appel de charges - lot X (mobile money <référence>) ».
`ChargePayment` : `method = 'MOBILE_MONEY'`, `reference = transactionReference`, `idempotencyKey = 'DECL-' +
lineId`, `origin = 'DECLARED'`, `providerTransactionId = null`.

### 3.4 Notifications (clés et variables)

| Clé                                    | Destinataire            | Variables                                                                                |
| -------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `SYNDIC_PAYMENT_DECLARATION_RECEIVED`  | copropriétaire          | `syndicName`, `amount`, `transactionReference`, `paidAt`                                 |
| `SYNDIC_PAYMENT_DECLARATION_APPROVED`  | copropriétaire          | idem + `acceptedAmount`, `corrected` (oui/non), `reviewNote`, pièces jointes : documents |
| `SYNDIC_PAYMENT_DECLARATION_REJECTED`  | copropriétaire          | idem + `rejectReasonLabel`, `reviewNote`                                                 |
| `SYNDIC_PAYMENT_DECLARATION_TO_REVIEW` | gestionnaires (interne) | `syndicName`, `pendingCount`, `overdueCount`, `link` (onglet « Paiements »)              |

Canaux : ceux des quittances (`planChannels`). Classées `SYNDIC` dans `notification-key-features.ts`.

### 3.5 Audit

Charges utiles sans capture, sans image, sans valeur lue par l'IA : identifiants, statut, montants, raison.
`SYNDIC_PAYMENT_PROOF_READ` : `readId`, fournisseur, modèle, `outcome`, durée.
