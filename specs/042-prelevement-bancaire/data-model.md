# 042 — Modèle de données et contrat d'API (P1 à P4)

> Chemins relatifs à `packages/api/`. Ce document est le **contrat** entre
> l'API et l'écran : l'un et l'autre s'y conforment à la lettre.

## 1. Schéma Prisma (P1)

```prisma
enum DirectDebitFileFormat {
  GENERIC_CSV
}

enum DirectDebitMandateScope {
  RENTAL_LEASE
  // P4 : SYNDIC_LOT
}

enum DirectDebitMandateStatus {
  DRAFT
  ACTIVE
  SUSPENDED
  REVOKED
}

/// Compte bancaire qui reçoit les prélèvements d'une agence (spec 042 PB1).
model DirectDebitCreditor {
  id                         String                @id @default(uuid()) @db.Uuid
  tenantId                   String                @map("tenant_id")
  treasuryAccountId          String                @map("treasury_account_id") @db.Uuid
  label                      String
  /// Numéro d'émetteur attribué par la banque. Nul tant que la convention n'est pas signée.
  creditorIdentifier         String?               @map("creditor_identifier")
  fileFormat                 DirectDebitFileFormat @default(GENERIC_CSV) @map("file_format")
  collectionDay              Int                   @default(5) @map("collection_day")
  prenotificationBusinessDays Int                  @default(5) @map("prenotification_business_days")
  rejectFeeAmount            Decimal               @default(0) @map("reject_fee_amount") @db.Decimal(12, 2)
  maxConsecutiveRejects      Int                   @default(2) @map("max_consecutive_rejects")
  isActive                   Boolean               @default(true) @map("is_active")
  createdByUserId            String?               @map("created_by_user_id")
  createdAt                  DateTime              @default(now()) @map("created_at")
  updatedAt                  DateTime              @updatedAt @map("updated_at")

  tenant          Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  treasuryAccount TreasuryAccount      @relation(fields: [treasuryAccountId], references: [id], onDelete: Restrict)
  mandates        DirectDebitMandate[]

  /// PB1-R3 : un créancier par compte de trésorerie.
  @@unique([tenantId, treasuryAccountId])
  @@index([tenantId])
  @@map("direct_debit_creditors")
}

/// Autorisation de prélèvement signée par un débiteur (spec 042 PB2).
model DirectDebitMandate {
  id                   String                   @id @default(uuid()) @db.Uuid
  tenantId             String                   @map("tenant_id")
  /// Référence MDT-<year>-<sequence sur 4 chiffres>.
  year                 Int
  sequence             Int
  scope                DirectDebitMandateScope  @default(RENTAL_LEASE)
  creditorId           String                   @map("creditor_id") @db.Uuid
  debtorClientId       String                   @map("debtor_client_id")
  leaseId              String?                  @map("lease_id") @db.Uuid
  status               DirectDebitMandateStatus @default(DRAFT)
  /// IBAN chiffré (lib/direct-debit/iban-crypto.ts, format ddk1:<id de clé>:…, clé DIRECT_DEBIT_IBAN_KEY ;
  /// anciennes valeurs pg1:… lisibles en repli, jamais écrites). Jamais renvoyé.
  ibanEncrypted        String                   @map("iban_encrypted")
  ibanBankCode         String                   @map("iban_bank_code")
  ibanLast4            String                   @map("iban_last4")
  holderName           String                   @map("holder_name")
  maxAmount            Decimal?                 @map("max_amount") @db.Decimal(12, 2)
  collectionDay        Int?                     @map("collection_day")
  signedAt             DateTime?                @map("signed_at")
  /// Identifiant /uploads/… du scan signé. Jamais renvoyé au client.
  signedScanUrl        String?                  @map("signed_scan_url")
  signedScanUploadedAt DateTime?                @map("signed_scan_uploaded_at")
  activatedAt          DateTime?                @map("activated_at")
  suspendedAt          DateTime?                @map("suspended_at")
  suspensionReason     String?                  @map("suspension_reason")
  revokedAt            DateTime?                @map("revoked_at")
  revocationReason     String?                  @map("revocation_reason")
  consecutiveRejects   Int                      @default(0) @map("consecutive_rejects")
  /// PB2-R7 : "<leaseId>:<creditorId>" tant que le mandat n'est pas révoqué,
  /// nul une fois révoqué. L'unicité en base interdit deux mandats ouverts.
  openSlotKey          String?                  @map("open_slot_key")
  notes                String?                  @db.Text
  createdByUserId      String?                  @map("created_by_user_id")
  createdAt            DateTime                 @default(now()) @map("created_at")
  updatedAt            DateTime                 @updatedAt @map("updated_at")

  tenant   Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  creditor DirectDebitCreditor @relation(fields: [creditorId], references: [id], onDelete: Restrict)
  debtor   TenantClient        @relation(fields: [debtorClientId], references: [id], onDelete: Restrict)
  lease    RentalLease?        @relation(fields: [leaseId], references: [id], onDelete: Restrict)

  @@unique([tenantId, year, sequence])
  @@unique([tenantId, openSlotKey])
  @@index([tenantId, status])
  @@index([leaseId])
  @@index([debtorClientId])
  @@index([creditorId])
  @@map("direct_debit_mandates")
}
```

Relations inverses à ajouter : `Tenant`, `TreasuryAccount`, `TenantClient`,
`RentalLease`. Les deux modèles portent `tenantId` : rien à déclarer dans
`schema-tenant-coverage`.

Migrations (P1), dans cet ordre :

1. `20261015090000_prelevement_bancaire` — énumérations, tables, index,
   clés étrangères (généré par `prisma migrate diff`).
2. `20261015090100_prelevement_bancaire_permissions` — permissions
   `RENTAL_DIRECT_DEBIT_VIEW` et `RENTAL_DIRECT_DEBIT_MANAGE`, puis
   attribution idempotente : tout rôle qui a `RENTAL_PAYMENTS_VIEW` reçoit
   `RENTAL_DIRECT_DEBIT_VIEW` ; tout rôle qui a `RENTAL_PAYMENTS_CREATE`
   reçoit les deux. Modèle : `20261008090200_controle_stock_permissions`.

## 2. Règles de calcul

- **Normalisation** : majuscules, espaces et tirets retirés.
- **IBAN** : `^CI\d{2}[A-Z0-9]{24}$`, puis clé ISO 13616 (déplacer les 4
  premiers caractères à la fin, lettres → 10..35, reste modulo 97 = 1).
- **RIB** de 24 caractères `[A-Z0-9]{24}` : converti en IBAN `CI` en
  calculant les chiffres de contrôle (98 − (nombre `RIB + "CI00"` converti)
  mod 97, sur 2 chiffres), puis traité comme un IBAN.
- **Clé RIB UEMOA** (avertissement seulement) : RIB = banque (5) + guichet
  (5) + compte (12) + clé (2) ; lettres remplacées par la table française
  (A,J→1 ; B,K,S→2 ; C,L,T→3 ; D,M,U→4 ; E,N,V→5 ; F,O,W→6 ; G,P,X→7 ;
  H,Q,Y→8 ; I,R,Z→9) ; clé attendue = 97 − ((22 premiers caractères
  convertis, lus comme un nombre, × 100) mod 97). Les poids 89/15/3 de la
  formule française ne valent que pour un compte de 11 caractères. Vérifié
  sur le RIB publié `CI008 01113 011342912005 89`. Écart → avertissement
  « La clé RIB ne correspond pas au calcul habituel : vérifiez le RIB auprès du titulaire. »
- **Code banque** = caractères 5 à 9 de l'IBAN ; **4 derniers** = 4 derniers
  caractères de l'IBAN.
- **Masque** : `CI•• •••• •••• •••• •••• ` + 4 derniers (pas de chiffre de
  contrôle visible).
- **Référence** : `MDT-${year}-${String(sequence).padStart(4, '0')}`, année
  de création, séquence par (agence, année), prise par
  `nextSequenceTx` (`lib/sales/numbering.ts`) dans la transaction.
- **Jour effectif de collecte** : `mandate.collectionDay ?? creditor.collectionDay`.

## 3. Routes (toutes sous `/api/tenants/:tenantId/rental/direct-debit`)

Garde commune : `authenticate`, `requireTenantAccess`, puis la permission
indiquée. Préfixe couvert par la fonctionnalité `RENTAL` de
`lib/subscription/route-features.ts` (règle `/rental` existante). Réponses
`{ success: true, data }`, `201` à la création.

| Méthode | Chemin                                   | Permission | Corps / requête                                                                                                                             | `data`                                           |
| ------- | ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| GET     | `/creditors`                             | VIEW       | —                                                                                                                                           | `CreditorDto[]`                                  |
| POST    | `/creditors`                             | MANAGE     | `{ treasuryAccountId, label, creditorIdentifier?, collectionDay?, prenotificationBusinessDays?, rejectFeeAmount?, maxConsecutiveRejects? }` | `CreditorDto`                                    |
| PATCH   | `/creditors/:creditorId`                 | MANAGE     | mêmes champs sauf `treasuryAccountId`, plus `isActive?`                                                                                     | `CreditorDto`                                    |
| POST    | `/iban-check`                            | MANAGE     | `{ iban }`                                                                                                                                  | `IbanCheckDto`                                   |
| GET     | `/mandates`                              | VIEW       | `?leaseId&debtorClientId&creditorId&status&search&page&pageSize` (défaut 1 / 20, max 100)                                                   | `{ items: MandateDto[], total, page, pageSize }` |
| POST    | `/mandates`                              | MANAGE     | `{ creditorId, leaseId, debtorClientId, iban, holderName, maxAmount?, collectionDay?, notes? }`                                             | `{ mandate: MandateDto, warnings: string[] }`    |
| GET     | `/mandates/:mandateId`                   | VIEW       | —                                                                                                                                           | `MandateDto`                                     |
| PATCH   | `/mandates/:mandateId`                   | MANAGE     | `{ maxAmount?, collectionDay?, notes? }` (`null` efface) — refusé si `REVOKED`                                                              | `MandateDto`                                     |
| POST    | `/mandates/:mandateId/activate`          | MANAGE     | `{ signedAt }` (date ISO, pas dans le futur) — exige un scan déposé                                                                         | `MandateDto`                                     |
| POST    | `/mandates/:mandateId/suspend`           | MANAGE     | `{ reason }` (1–500)                                                                                                                        | `MandateDto`                                     |
| POST    | `/mandates/:mandateId/reactivate`        | MANAGE     | — (remet `consecutiveRejects` à 0)                                                                                                          | `MandateDto`                                     |
| POST    | `/mandates/:mandateId/revoke`            | MANAGE     | `{ reason, revokedAt? }` (défaut : maintenant)                                                                                              | `MandateDto`                                     |
| GET     | `/mandates/:mandateId/authorization-pdf` | MANAGE     | — (PDF, `attachment`, `no-store`)                                                                                                           | fichier                                          |
| POST    | `/mandates/:mandateId/signed-scan`       | MANAGE     | multipart, champ `file` (PDF/JPEG/PNG, octets magiques vérifiés, ≤ 10 Mo) — refusé si `REVOKED`                                             | `MandateDto`                                     |
| GET     | `/mandates/:mandateId/signed-scan`       | MANAGE     | — (fichier privé)                                                                                                                           | fichier                                          |

Erreurs : identifiant d'une autre agence ou inexistant → `404`
(`NotFoundError`) ; validation → `400` (`BadRequestError`, message traduit) ;
transition interdite ou mandat ouvert déjà présent → `409`
(`ConflictError`).

## 4. Objets renvoyés

Montants en `number` (FCFA), dates en chaîne ISO, `null` explicite.

```ts
interface CreditorDto {
  id: string;
  label: string;
  treasuryAccountId: string;
  treasuryAccountLabel: string;
  bankName: string | null;
  creditorIdentifier: string | null;
  fileFormat: "GENERIC_CSV";
  collectionDay: number;
  prenotificationBusinessDays: number;
  rejectFeeAmount: number;
  maxConsecutiveRejects: number;
  isActive: boolean;
  openMandateCount: number; // mandats DRAFT | ACTIVE | SUSPENDED
  createdAt: string;
  updatedAt: string;
}

interface IbanCheckDto {
  valid: boolean;
  ibanMasked: string | null;
  bankCode: string | null;
  error: string | null; // message traduit si invalide
  warnings: string[]; // messages traduits
}

type MandateStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "REVOKED";

interface MandateDto {
  id: string;
  reference: string; // MDT-2026-0001
  scope: "RENTAL_LEASE";
  status: MandateStatus;
  creditor: { id: string; label: string; creditorIdentifier: string | null };
  debtor: { id: string; displayName: string | null };
  lease: { id: string; leaseNumber: string; status: string } | null;
  ibanMasked: string;
  bankCode: string;
  holderName: string;
  maxAmount: number | null;
  collectionDay: number | null;
  effectiveCollectionDay: number;
  signedAt: string | null;
  hasSignedScan: boolean;
  signedScanUploadedAt: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  consecutiveRejects: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
```

`debtor.displayName` suit la même règle que les parties d'un bail
(`services/rental-lease-service.ts`, vers la ligne 800). Aucun champ ne
contient l'IBAN complet, le texte chiffré ni le chemin du scan.

## 5. Audit

Nouvelles clés `AuditActionKey` (catalogue : `tenant('BILLING')`, les
transitions `critical`) :
`DIRECT_DEBIT_CREDITOR_CREATED`, `DIRECT_DEBIT_CREDITOR_UPDATED`,
`DIRECT_DEBIT_MANDATE_CREATED`, `DIRECT_DEBIT_MANDATE_UPDATED`,
`DIRECT_DEBIT_MANDATE_ACTIVATED`, `DIRECT_DEBIT_MANDATE_SUSPENDED`,
`DIRECT_DEBIT_MANDATE_REACTIVATED`, `DIRECT_DEBIT_MANDATE_REVOKED`,
`DIRECT_DEBIT_MANDATE_SCAN_UPLOADED`,
`DIRECT_DEBIT_MANDATE_AUTHORIZATION_DOWNLOADED`.
Les transitions passent par `recordAuditEvent(tx, …)` ; la charge utile ne
contient jamais l'IBAN (seulement `bankCode`, `ibanLast4`).

## 6. Fichiers

Scan signé : `uploads/rental/direct-debit/<tenantId>/<mandateId>/<uuid>.<pdf|jpg|png>`,
dossier privé par défaut (`middleware/uploads-access-middleware.ts`), modèle
de stockage et de remplacement : `lib/syndics/provider-invoice-files.ts` et
`attachProviderInvoiceFile` (ancien fichier supprimé après validation de la
transaction).

## 7. P2 — Remises de loyers (contrat API ↔ écran)

> Ajouté le 16/10/2026. Même règle que §1–§6 : l'API et l'écran s'y
> conforment à la lettre. Chemins relatifs à `packages/api/`.

### 7.1 Schéma Prisma (P2)

```prisma
// Ajout à l'énumération existante (migration à part de toute utilisation) :
enum RentalPaymentMethod {
  // … valeurs existantes
  DIRECT_DEBIT
}

enum DirectDebitRemittanceStatus {
  DRAFT      // brouillon : lignes modifiables, rien n'est parti
  VALIDATED  // validée par un humain, prénotifications envoyées
  EXPORTED   // fichier de remise produit au moins une fois
  SUBMITTED  // marquée « déposée à la banque » par l'agence
  CANCELED
}

enum DirectDebitRemittanceLineStatus {
  PENDING
  CANCELED
  // P3 : SETTLED, REJECTED
}

enum DirectDebitPrenotificationStatus {
  PENDING   // pas encore envoyée (brouillon)
  SENT
  NO_EMAIL  // le débiteur n'a pas d'adresse e-mail
  DISABLED  // notification désactivée par l'agence (Notifications email)
  FAILED
}

/// Remise de prélèvements d'un créancier pour une date de collecte (spec 042 P2).
model DirectDebitRemittance {
  id                    String                      @id @default(uuid()) @db.Uuid
  tenantId              String                      @map("tenant_id")
  /// Référence PRL-<year>-<sequence sur 4 chiffres>, par (agence, année).
  year                  Int
  sequence              Int
  scope                 DirectDebitMandateScope     @default(RENTAL_LEASE)
  creditorId            String                      @map("creditor_id") @db.Uuid
  status                DirectDebitRemittanceStatus @default(DRAFT)
  collectionDate        DateTime                    @map("collection_date") @db.Date
  periodYear            Int                         @map("period_year")
  periodMonth           Int                         @map("period_month")
  /// Totaux des lignes PENDING, tenus à jour dans la même transaction que les lignes.
  lineCount             Int                         @default(0) @map("line_count")
  totalAmount           Decimal                     @default(0) @map("total_amount") @db.Decimal(12, 2)
  /// Figés à la validation : le fichier reste identique à chaque téléchargement.
  fileFormat            DirectDebitFileFormat?      @map("file_format")
  creditorLabelSnapshot String?                     @map("creditor_label_snapshot")
  creditorIdentifierSnapshot String?                @map("creditor_identifier_snapshot")
  validatedAt           DateTime?                   @map("validated_at")
  validatedByUserId     String?                     @map("validated_by_user_id")
  firstExportedAt       DateTime?                   @map("first_exported_at")
  lastExportedAt        DateTime?                   @map("last_exported_at")
  exportCount           Int                         @default(0) @map("export_count")
  /// HMAC-SHA-256 du dernier fichier produit, clé dérivée de DIRECT_DEBIT_IBAN_KEY
  /// (traçabilité ; le fichier n'est jamais stocké). Pas un SHA-256 nu : le CSV
  /// contient les IBAN, un condensat nu permettrait de retrouver celui d'une
  /// remise à une seule ligne.
  lastFileDigest        String?                     @map("last_file_digest")
  /// Date limite de prénotification, recalculée tant que la remise est en
  /// brouillon, figée à la validation.
  prenotificationDeadline DateTime                  @map("prenotification_deadline") @db.Date
  submittedAt           DateTime?                   @map("submitted_at")
  submittedByUserId     String?                     @map("submitted_by_user_id")
  canceledAt            DateTime?                   @map("canceled_at")
  cancellationReason    String?                     @map("cancellation_reason")
  notes                 String?                     @db.Text
  createdByUserId       String?                     @map("created_by_user_id")
  createdAt             DateTime                    @default(now()) @map("created_at")
  updatedAt             DateTime                    @updatedAt @map("updated_at")

  tenant   Tenant                      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  creditor DirectDebitCreditor         @relation(fields: [creditorId], references: [id], onDelete: Restrict)
  lines    DirectDebitRemittanceLine[]

  @@unique([tenantId, year, sequence])
  @@index([tenantId, status])
  @@index([creditorId])
  @@map("direct_debit_remittances")
}

/// Une échéance à prélever dans une remise (spec 042 P2).
model DirectDebitRemittanceLine {
  id                      String                           @id @default(uuid()) @db.Uuid
  tenantId                String                           @map("tenant_id")
  remittanceId            String                           @map("remittance_id") @db.Uuid
  /// Rang dans la remise (1, 2, …), jamais réutilisé : référence d'opération PRL-AAAA-NNNN-<rang sur 3 chiffres>.
  lineNumber              Int                              @map("line_number")
  mandateId               String                           @map("mandate_id") @db.Uuid
  leaseId                 String                           @map("lease_id") @db.Uuid
  installmentId           String                           @map("installment_id") @db.Uuid
  debtorClientId          String                           @map("debtor_client_id")
  status                  DirectDebitRemittanceLineStatus  @default(PENDING)
  amount                  Decimal                          @db.Decimal(12, 2)
  /// Reste dû (hors pénalités) au moment de la sélection, avant plafond.
  remainingDueAtSelection Decimal                          @map("remaining_due_at_selection") @db.Decimal(12, 2)
  capped                  Boolean                          @default(false)
  /// ADR-007 §6 : `<installmentId>` tant que la ligne n'est pas annulée, nul
  /// ensuite. L'unicité en base interdit deux lignes vivantes pour une même
  /// échéance, quel que soit le mandat ou le créancier.
  activeKey               String?                          @map("active_key")
  canceledAt              DateTime?                        @map("canceled_at")
  cancellationReason      String?                          @map("cancellation_reason")
  prenotificationStatus   DirectDebitPrenotificationStatus @default(PENDING) @map("prenotification_status")
  prenotifiedAt           DateTime?                        @map("prenotified_at")
  createdAt               DateTime                         @default(now()) @map("created_at")
  updatedAt               DateTime                         @updatedAt @map("updated_at")

  tenant      Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  remittance  DirectDebitRemittance @relation(fields: [remittanceId], references: [id], onDelete: Cascade)
  mandate     DirectDebitMandate    @relation(fields: [mandateId], references: [id], onDelete: Restrict)
  lease       RentalLease           @relation(fields: [leaseId], references: [id], onDelete: Restrict)
  installment RentalInstallment     @relation(fields: [installmentId], references: [id], onDelete: Restrict)
  debtor      TenantClient          @relation(fields: [debtorClientId], references: [id], onDelete: Restrict)

  @@unique([remittanceId, lineNumber])
  @@unique([tenantId, activeKey])
  @@index([tenantId, status])
  @@index([mandateId])
  @@index([installmentId])
  @@index([leaseId])
  @@map("direct_debit_remittance_lines")
}
```

Relations inverses : `Tenant`, `DirectDebitCreditor`, `DirectDebitMandate`,
`RentalLease`, `RentalInstallment`, `TenantClient`. Les deux modèles portent
`tenantId` : rien à déclarer dans `schema-tenant-coverage`.

Migrations (P2), générées par `prisma migrate diff` (jamais `prisma format`,
jamais `migrate dev`) :

1. `20261017090000_prelevement_moyen_paiement` — `ALTER TYPE "RentalPaymentMethod" ADD VALUE 'DIRECT_DEBIT'`, seule.
2. `20261017090100_prelevement_remises` — énumérations, tables, index, clés étrangères.

Aucune permission nouvelle : `RENTAL_DIRECT_DEBIT_VIEW` (consulter) et
`RENTAL_DIRECT_DEBIT_MANAGE` (tout le reste, dont le fichier à IBAN complet).

### 7.2 Règles de calcul

- **Période** : année et mois de `collectionDate`. Seule l'échéance de ce mois
  est prélevée (D6) : jamais d'arriéré, jamais de pénalité.
- **Jours ouvrés** : lundi à vendredi (les jours fériés ne sont pas gérés en
  P2). `prenotificationDeadline` = `collectionDate` moins
  `creditor.prenotificationBusinessDays` jours ouvrés (0 → la date de collecte
  elle-même).
- **Date de collecte acceptable** : strictement postérieure à aujourd'hui, et
  aujourd'hui ≤ `prenotificationDeadline`. Sinon `BadRequestError` traduite qui
  donne la première date possible (`JJ/MM/AAAA`).
- **Mandats éligibles** : même agence, `creditorId` de la remise, statut
  `ACTIVE`, `scope = RENTAL_LEASE`, bail `ACTIVE`, jour effectif de collecte
  (`mandate.collectionDay ?? creditor.collectionDay`) ≤ jour de
  `collectionDate`. Un mandat dont le jour est plus tard dans le mois attend
  une remise datée plus tard.
- **Échéance retenue** : celle du bail pour (`periodYear`, `periodMonth`), de
  statut `DRAFT`, `DUE`, `OVERDUE` ou `PARTIAL`.
- **Reste dû (hors pénalités)** = max(0, `amount_rent` + `amount_service` +
  `amount_other_fees` − `amount_paid`). Montant de la ligne = min(reste dû,
  `mandate.maxAmount` s'il existe) ; `capped = true` si le plafond a joué.
- **Mandats non retenus** (renvoyés, jamais stockés), raison parmi :
  `NO_INSTALLMENT` (pas d'échéance ce mois-là), `NOTHING_DUE` (reste dû nul ou
  échéance payée/annulée), `ALREADY_IN_REMITTANCE` (échéance déjà dans une
  ligne non annulée, quelle que soit la remise), `LEASE_NOT_ACTIVE`,
  `COLLECTION_DAY_LATER`.
- **Référence** : `PRL-${year}-${String(sequence).padStart(4, '0')}` (année de
  création, `nextSequenceTx` dans la transaction, nouvel essai sur conflit
  d'unicité comme les mandats) ; ligne : `${référence}-${String(lineNumber).padStart(3, '0')}`.
- **Totaux** : `lineCount` et `totalAmount` = lignes `PENDING`, recalculés dans
  la transaction de toute écriture de lignes.

### 7.3 Transitions

| Action                        | De                                   | Vers                                      | Contrôles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Créer                         | —                                    | `DRAFT`                                   | créancier actif de l'agence ; date acceptable ; au moins une ligne, sinon `BadRequestError` « Aucune échéance à prélever pour ce créancier à cette date. » (rien n'est écrit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Actualiser                    | `DRAFT`                              | `DRAFT`                                   | recalcule chaque ligne `PENDING` : plus éligible ou reste dû nul → ligne `CANCELED` (motif automatique traduit) ; montant changé → mis à jour ; ajoute les mandats devenus éligibles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Retirer une ligne             | `DRAFT`, `VALIDATED`                 | (inchangé)                                | ligne `PENDING` → `CANCELED`, `activeKey` nul, motif facultatif ; la dernière ligne ne se retire pas d'une remise validée (annuler la remise)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Valider                       | `DRAFT`                              | `VALIDATED`                               | au moins une ligne ; aujourd'hui strictement avant `collectionDate` ; créancier actif avec numéro d'émetteur (sinon `BadRequestError` « Renseignez le numéro d'émetteur du créancier avant de valider la remise. ») ; aujourd'hui ≤ `prenotificationDeadline` (sinon `ConflictError`) ; chaque ligne recalculée doit être identique, sinon `ConflictError` « Les montants ont changé depuis la préparation : actualisez la remise. » ; fige `fileFormat`, `creditorLabelSnapshot`, `creditorIdentifierSnapshot`, `prenotificationDeadline` ; mise à jour conditionnelle sur `status = DRAFT` (deux validations simultanées : une seule passe). Après la transaction : prénotifications en arrière-plan (§7.5). |
| Renvoyer les prénotifications | `VALIDATED`, `EXPORTED`              | (inchangé)                                | avant `collectionDate` ; seulement les lignes `PENDING` dont la prénotification n'est pas `SENT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Produire le fichier           | `VALIDATED`, `EXPORTED`, `SUBMITTED` | `EXPORTED` si `VALIDATED`, sinon inchangé | au premier export (`VALIDATED`) : aujourd'hui strictement avant `collectionDate` (sinon `ConflictError`), chaque mandat des lignes encore `ACTIVE` (sinon `ConflictError` qui cite les références), mise à jour conditionnelle sur `updatedAt` (une ligne retirée entre-temps invalide le fichier) ; un nouveau téléchargement (`EXPORTED`, `SUBMITTED`) rend le même fichier, l'écran signale les mandats devenus inactifs ; audit critique écrit AVANT l'envoi, son échec bloque l'envoi ; `exportCount + 1`, `lastExportedAt`, `lastFileDigest`                                                                                                                                                             |
| Marquer déposée               | `EXPORTED`                           | `SUBMITTED`                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Annuler                       | `DRAFT`, `VALIDATED`, `EXPORTED`     | `CANCELED`                                | motif 1–500 obligatoire ; toutes les lignes `PENDING` → `CANCELED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Toute autre transition → `ConflictError` traduite. Une remise `SUBMITTED` ne
s'annule pas en P2 (la banque l'a) : le retour banque (P3) traitera les rejets.

### 7.4 Fichier `GENERIC_CSV` (adaptateur)

`lib/direct-debit/file-formats/` : une interface
`DirectDebitFileAdapter { format, fileExtension, contentType, build(input): Buffer }`
et un registre `getFileAdapter(format)`. Seul `GENERIC_CSV` existe en P2 ; le
format de la banque pilote viendra dans un autre adaptateur.

`GENERIC_CSV` : `lib/csv.ts` (`toCsvString`, séparateur `;`, BOM UTF-8, CRLF,
neutralisation des formules), une ligne d'en-tête puis une ligne par ligne
`PENDING`, triées par `lineNumber` :

| Colonne                 | Contenu                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `reference_remise`      | `PRL-2026-0001`                                                                                      |
| `numero_emetteur`       | `creditorIdentifierSnapshot`                                                                         |
| `creancier`             | `creditorLabelSnapshot`                                                                              |
| `date_echeance`         | `collectionDate`, `AAAA-MM-JJ`                                                                       |
| `reference_operation`   | `PRL-2026-0001-001`                                                                                  |
| `reference_mandat`      | `MDT-2026-0001`                                                                                      |
| `date_signature_mandat` | `AAAA-MM-JJ`                                                                                         |
| `titulaire`             | `holderName` du mandat                                                                               |
| `iban`                  | IBAN complet (déchiffré ici seulement, `decryptMandateIban`)                                         |
| `montant`               | décimal à point, sans séparateur de milliers, sans décimales s'il est entier (`150000`, `150000.50`) |
| `devise`                | `XOF`                                                                                                |
| `libelle`               | `LOYER MM/AAAA <numéro de bail>` en majuscules ASCII                                                 |

Nom du fichier : `PRL-2026-0001.csv`. Le fichier n'est jamais écrit sur disque
ni journalisé ; seule son empreinte HMAC-SHA-256 (clé dérivée par HKDF de
`DIRECT_DEBIT_IBAN_KEY`) est gardée. Les caractères de contrôle et séparateurs
de ligne Unicode sont retirés du titulaire, du libellé et du nom du créancier.

### 7.5 Prénotification (D7)

- Nouvelle notification e-mail `DIRECT_DEBIT_PRENOTIFICATION` (destinataire :
  le débiteur), dans le catalogue existant
  (`constants/email-notification-keys.ts`, modèle par défaut dans
  `constants/email-notification-default-templates.ts`), donc réglable et
  désactivable dans « Notifications email ».
- Contenu : agence, référence du mandat, numéro d'émetteur, IBAN **masqué**,
  montant, date de prélèvement, période et bail. Jamais l'IBAN complet.
- Envoi **en arrière-plan** après la validation (hors transaction) ou sur
  « Renvoyer » : la route répond tout de suite, les lignes restent `PENDING`
  le temps de l'envoi. Verrou exclusif par remise (deux déclenchements
  n'envoient pas deux fois), cinq envois simultanés au plus, statut écrit
  ligne par ligne : `SENT` + `prenotifiedAt`, `NO_EMAIL`, `DISABLED` ou
  `FAILED`. L'écran relit la remise tant qu'il reste des lignes `PENDING`.
  Les journaux masquent l'adresse du destinataire.
- WhatsApp et SMS : hors P2 (P5).

### 7.6 Routes (sous `/api/tenants/:tenantId/rental/direct-debit`)

Mêmes gardes que §3. Réponses `{ success: true, data }`, `201` à la création.

| Méthode | Chemin                                            | Permission | Corps / requête                                                                                            | `data`                                                                       |
| ------- | ------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET     | `/remittances`                                    | VIEW       | `?creditorId&status&page&pageSize` (défaut 1 / 20, max 100), tri `collectionDate` desc puis référence desc | `{ items: RemittanceSummaryDto[], total, page, pageSize }`                   |
| POST    | `/remittances`                                    | MANAGE     | `{ creditorId, collectionDate: 'AAAA-MM-JJ', notes? }`                                                     | `{ remittance: RemittanceDto, skipped: SkippedMandateDto[] }`                |
| GET     | `/remittances/:remittanceId`                      | VIEW       | —                                                                                                          | `RemittanceDto`                                                              |
| POST    | `/remittances/:remittanceId/refresh`              | MANAGE     | —                                                                                                          | `{ remittance: RemittanceDto, skipped: SkippedMandateDto[] }`                |
| POST    | `/remittances/:remittanceId/lines/:lineId/cancel` | MANAGE     | `{ reason? }` (≤ 500)                                                                                      | `RemittanceDto`                                                              |
| POST    | `/remittances/:remittanceId/validate`             | MANAGE     | —                                                                                                          | `{ remittance: RemittanceDto, prenotifications: PrenotificationSummaryDto }` |
| POST    | `/remittances/:remittanceId/prenotifications`     | MANAGE     | —                                                                                                          | `{ remittance: RemittanceDto, prenotifications: PrenotificationSummaryDto }` |
| POST    | `/remittances/:remittanceId/export`               | MANAGE     | —                                                                                                          | fichier (`text/csv; charset=utf-8`, `attachment`, `Cache-Control: no-store`) |
| POST    | `/remittances/:remittanceId/submit`               | MANAGE     | —                                                                                                          | `RemittanceDto`                                                              |
| POST    | `/remittances/:remittanceId/cancel`               | MANAGE     | `{ reason }` (1–500)                                                                                       | `RemittanceDto`                                                              |

Erreurs : identifiant d'une autre agence ou inexistant (remise, ligne,
créancier) → `404` ; validation → `400` ; transition interdite, conflit
d'unicité, montants changés → `409`.

### 7.7 Objets renvoyés

```ts
type RemittanceStatus =
  "DRAFT" | "VALIDATED" | "EXPORTED" | "SUBMITTED" | "CANCELED";
type RemittanceLineStatus = "PENDING" | "CANCELED";
type PrenotificationStatus =
  "PENDING" | "SENT" | "NO_EMAIL" | "DISABLED" | "FAILED";
type SkipReason =
  | "NO_INSTALLMENT"
  | "NOTHING_DUE"
  | "ALREADY_IN_REMITTANCE"
  | "LEASE_NOT_ACTIVE"
  | "COLLECTION_DAY_LATER";

interface RemittanceSummaryDto {
  id: string;
  reference: string; // PRL-2026-0001
  status: RemittanceStatus;
  creditor: { id: string; label: string; creditorIdentifier: string | null }; // valeurs figées après validation
  collectionDate: string; // AAAA-MM-JJ
  periodYear: number;
  periodMonth: number;
  prenotificationDeadline: string; // AAAA-MM-JJ
  fileFormat: "GENERIC_CSV"; // figé à la validation, celui du créancier avant
  lineCount: number;
  totalAmount: number;
  validatedAt: string | null;
  firstExportedAt: string | null;
  lastExportedAt: string | null;
  exportCount: number;
  submittedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RemittanceLineDto {
  id: string;
  lineNumber: number;
  reference: string; // PRL-2026-0001-001
  status: RemittanceLineStatus;
  mandate: {
    id: string;
    reference: string;
    status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "REVOKED"; // statut COURANT du mandat
    ibanMasked: string;
    holderName: string;
    maxAmount: number | null;
  };
  debtor: { id: string; displayName: string | null };
  lease: { id: string; leaseNumber: string };
  installment: {
    id: string;
    periodYear: number;
    periodMonth: number;
    dueDate: string;
  };
  amount: number;
  remainingDueAtSelection: number;
  capped: boolean;
  prenotificationStatus: PrenotificationStatus;
  prenotifiedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
}

interface RemittanceDto extends RemittanceSummaryDto {
  notes: string | null;
  lines: RemittanceLineDto[]; // toutes, annulées comprises, par lineNumber
  prenotificationSummary: PrenotificationSummaryDto; // lignes PENDING seulement
}

interface PrenotificationSummaryDto {
  pending: number;
  sent: number;
  noEmail: number;
  disabled: number;
  failed: number;
}

interface SkippedMandateDto {
  mandateId: string;
  mandateReference: string;
  leaseNumber: string | null;
  debtorName: string | null;
  reason: SkipReason;
}
```

Aucun champ ne contient l'IBAN complet, le texte chiffré ou l'adresse e-mail
du débiteur.

### 7.8 Audit

Nouvelles clés `AuditActionKey` (catalogue `tenant('BILLING')`) :
`DIRECT_DEBIT_REMITTANCE_CREATED`, `DIRECT_DEBIT_REMITTANCE_REFRESHED`,
`DIRECT_DEBIT_REMITTANCE_LINE_CANCELED`, `DIRECT_DEBIT_REMITTANCE_VALIDATED`
(critique), `DIRECT_DEBIT_REMITTANCE_PRENOTIFIED`,
`DIRECT_DEBIT_REMITTANCE_EXPORTED` (critique, écrite avant l'envoi du
fichier), `DIRECT_DEBIT_REMITTANCE_SUBMITTED` (critique),
`DIRECT_DEBIT_REMITTANCE_CANCELED` (critique). Charge utile : référence,
nombre de lignes, total, date de collecte, empreinte HMAC du fichier (`fileDigest`) ; jamais
d'IBAN ni d'adresse e-mail.

### 7.9 `DIRECT_DEBIT` comme moyen de paiement

Ajouté à `RentalPaymentMethod` pour P3 (le règlement constaté créera un
`RentalPayment` `DIRECT_DEBIT`). En P2 : libellé « Prélèvement bancaire »
partout où les moyens de paiement ont un libellé (API et écran), compte de
trésorerie de nature `BANK` ; **pas** proposé dans les formulaires de saisie
manuelle d'un paiement (les schémas `z.enum([...])` existants restent tels
quels).

### 7.10 Écrans

- Location › Prélèvements : deux onglets reliés à des routes, « Mandats »
  (`/tenant/:tenantId/rental/direct-debit`, existant) et « Remises »
  (`/tenant/:tenantId/rental/direct-debit/remittances`). Pas d'entrée de menu
  nouvelle.
- Liste des remises : filtres créancier et statut ; colonnes référence,
  statut, créancier, date de prélèvement, période, lignes, total,
  prénotification au plus tard le ; bouton « Préparer une remise » (créancier
  actif, date de prélèvement proposée = premier jour de collecte du créancier
  encore possible compte tenu du délai de prénotification, notes).
- Détail (`/tenant/:tenantId/rental/direct-debit/remittances/:remittanceId`) :
  en-tête et faits, actions selon le statut (§7.3), table des lignes (référence
  d'opération, débiteur, bail, mandat et IBAN masqué en `dir="ltr"`, période,
  reste dû, montant prélevé et marque « Plafonné », prénotification, statut),
  mandats non retenus après création ou actualisation avec leur raison.
  Bandeau sur une remise `EXPORTED` : le fichier est produit mais la remise
  n'est pas marquée déposée (ADR-007, risque d'oubli).

## 8. P3 — Retour banque (contrat)

> Ajouté le 17/10/2026. Décisions de l'utilisateur du 17/10/2026 : P3 puis
> P4, signature électronique du mandat en option. Même règle que §1–§7 :
> l'API et l'écran s'y conforment à la lettre. Chemins relatifs à
> `packages/api/`.

### 8.1 Principe

Une ligne de remise déposée à la banque reçoit un **constat** : réglée
(`SETTLED`) ou rejetée (`REJECTED`). Le constat est manuel (ligne par ligne
ou toute la remise) ou importé d'un fichier de retour. Le loyer ne compte
comme payé qu'au constat de règlement (D3, ADR-007 §5). Un rejet tardif
d'une ligne déjà réglée contre-passe l'encaissement.

L'encaissement dépend du périmètre de la ligne : un **encaisseur**
(`lib/direct-debit/collectors/`) par `scope`. P3 livre l'encaisseur
`RENTAL_LEASE` ; P4 livrera `SYNDIC_LOT` derrière la même interface.

### 8.2 Schéma (P3)

```prisma
// Migration 1 (seule) : 20261017100000_prelevement_retour_statuts
enum DirectDebitRemittanceLineStatus {
  PENDING
  CANCELED
  SETTLED   // règlement constaté
  REJECTED  // rejet constaté
}

// Migration 2 : 20261017100100_prelevement_retour_banque
enum DirectDebitReturnSource {
  MANUAL
  IMPORT
}

enum DirectDebitReturnFormat {
  GENERIC_CSV
}

model DirectDebitRemittanceLine {
  // … champs P2 inchangés, plus :
  /// Date de valeur du règlement (relevé), AAAA-MM-JJ.
  settledAt              DateTime?                @map("settled_at") @db.Date
  /// Date du rejet (relevé ou fichier de rejets), AAAA-MM-JJ.
  rejectedAt             DateTime?                @map("rejected_at") @db.Date
  rejectionCode          String?                  @map("rejection_code")
  rejectionReason        String?                  @map("rejection_reason")
  /// Frais de rejet réellement refacturés au débiteur (0 ou nul : aucun).
  rejectFeeAmount        Decimal?                 @map("reject_fee_amount") @db.Decimal(12, 2)
  returnSource           DirectDebitReturnSource? @map("return_source")
  returnImportId         String?                  @map("return_import_id") @db.Uuid
  returnRecordedAt       DateTime?                @map("return_recorded_at")
  returnRecordedByUserId String?                  @map("return_recorded_by_user_id")
  /// Encaissement locatif créé au règlement (RENTAL_LEASE). Jamais deux lignes pour un paiement.
  rentalPaymentId        String?                  @unique @map("rental_payment_id") @db.Uuid

  rentalPayment RentalPayment?           @relation(fields: [rentalPaymentId], references: [id], onDelete: Restrict)
  returnImport  DirectDebitReturnImport? @relation(fields: [returnImportId], references: [id], onDelete: SetNull)
  @@index([returnImportId])
}

/// Un fichier de retour importé (relevé ou rejets) : traçabilité, jamais le fichier lui-même.
model DirectDebitReturnImport {
  id               String                  @id @default(uuid()) @db.Uuid
  tenantId         String                  @map("tenant_id")
  scope            DirectDebitMandateScope @default(RENTAL_LEASE)
  format           DirectDebitReturnFormat @default(GENERIC_CSV)
  /// Nom de fichier assaini (200 caractères au plus), pour l'affichage.
  fileName         String                  @map("file_name")
  /// HMAC-SHA-256 du fichier (même clé dérivée que la remise, `file-digest.ts`).
  fileDigest       String                  @map("file_digest")
  recordCount      Int                     @map("record_count")
  settledCount     Int                     @default(0) @map("settled_count")
  rejectedCount    Int                     @default(0) @map("rejected_count")
  skippedCount     Int                     @default(0) @map("skipped_count")
  errorCount       Int                     @default(0) @map("error_count")
  importedByUserId String?                 @map("imported_by_user_id")
  createdAt        DateTime                @default(now()) @map("created_at")

  tenant Tenant                      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  lines  DirectDebitRemittanceLine[]

  @@index([tenantId, createdAt])
  @@map("direct_debit_return_imports")
}
```

Relation inverse : `RentalPayment.directDebitLine DirectDebitRemittanceLine?`,
`Tenant.directDebitReturnImports`. Aucune autre table ne change ; la remise
garde son statut `SUBMITTED` (l'avancement du retour se calcule, §8.7).

### 8.3 Constat de règlement (`settle`)

Pré-conditions : remise de l'agence, du bon périmètre, au statut `EXPORTED`
ou `SUBMITTED` (un constat sur une remise `EXPORTED` la passe d'abord à
`SUBMITTED`, `submittedAt = maintenant`, audit `DIRECT_DEBIT_REMITTANCE_SUBMITTED`) ;
ligne `PENDING` ; `settledAt` (AAAA-MM-JJ) entre `collectionDate` et
aujourd'hui inclus, sinon `BadRequestError` traduite.

Effets, **une transaction par ligne** (`{ maxWait: 10_000, timeout: 30_000 }`) :

1. réservation de la ligne par `updateMany` conditionnel (`status = PENDING`) ;
   0 ligne → `ConflictError` « Cette ligne vient d'être traitée : rechargez la page. » ;
2. `collector.settleTx` (§8.6) crée l'encaissement et renvoie sa référence ;
3. ligne : `SETTLED`, `settledAt`, `returnSource`, `returnImportId`,
   `returnRecordedAt/ByUserId`, référence de l'encaissement ; `activeKey`
   gardée si `collector.keepsActiveKeyOnSettle` (RENTAL : oui), sinon nulle ;
4. mandat : `consecutiveRejects = 0` (D5) ;
5. audit `DIRECT_DEBIT_LINE_SETTLED` (critique) : référence de ligne, montant,
   date de valeur, source, identifiant de l'encaissement ; jamais d'IBAN.

Après la transaction : `afterCommit` de l'encaisseur (quittance, voir §8.6).
Une erreur après commit est journalisée sans faire échouer le constat.

**Constat de toute la remise** (`settle-all`, même `settledAt`) : chaque ligne
`PENDING` dans sa propre transaction ; réponse `{ settled, failed: [{ lineId, reference, error }] }`.

### 8.4 Constat de rejet (`reject`)

Pré-conditions : remise `EXPORTED` ou `SUBMITTED` (même passage automatique à
`SUBMITTED`) ; ligne `PENDING` **ou** `SETTLED` (rejet tardif) ; `rejectedAt`
entre `collectionDate` et aujourd'hui ; `code` (1–20, `[A-Za-z0-9_-]`) et/ou
`reason` (1–500), au moins l'un des deux.

Effets, une transaction :

1. réservation conditionnelle (`status IN (PENDING, SETTLED)`) ;
2. si la ligne était `SETTLED` : `collector.reverseTx` (contre-passation de
   l'encaissement, quittance annulée) — un encaisseur qui ne sait pas
   contre-passer lève `ConflictError` traduite et rien n'est écrit ;
3. frais de rejet (D4) : si `creditor.rejectFeeAmount > 0`,
   `collector.applyRejectFeeTx` ; `line.rejectFeeAmount` = montant refacturé
   (0 si l'encaisseur ne refacture pas) ;
4. ligne : `REJECTED`, `rejectedAt`, `rejectionCode`, `rejectionReason`,
   `activeKey = null` (l'échéance peut être représentée), traçabilité du retour ;
5. mandat : `consecutiveRejects + 1` ; si le compteur atteint
   `creditor.maxConsecutiveRejects` et que le mandat est `ACTIVE` →
   `SUSPENDED`, `suspendedAt`, `suspensionReason` = « Suspendu automatiquement
   après N rejets consécutifs. », audit `DIRECT_DEBIT_MANDATE_AUTO_SUSPENDED`
   (critique) ;
6. audit `DIRECT_DEBIT_LINE_REJECTED` (critique).

Après la transaction : notification e-mail au débiteur (§8.8).

### 8.5 Import d'un fichier de retour

Adaptateur par format, comme le fichier de remise :
`lib/direct-debit/return-formats/index.ts` (registre `getReturnAdapter(format)`)
et `generic-csv.ts`.

```ts
interface ReturnRecord {
  row: number; // numéro de ligne du fichier (en-tête = 1)
  operationReference: string; // PRL-AAAA-NNNN-RRR
  outcome: "SETTLED" | "REJECTED";
  date: string; // AAAA-MM-JJ
  amount: number;
  rejectionCode: string | null;
  rejectionReason: string | null;
}
interface ReturnParseResult {
  records: ReturnRecord[];
  errors: { row: number; message: string }[];
}
interface DirectDebitReturnAdapter {
  format: "GENERIC_CSV";
  parse(buffer: Buffer): ReturnParseResult;
}
```

**Format `GENERIC_CSV` de retour** : UTF-8 (BOM accepté), séparateur `;`
(`,` accepté si l'en-tête l'emploie), CRLF ou LF, champs entre guillemets
RFC 4180 ; en-tête obligatoire, colonnes dans n'importe quel ordre, noms
insensibles à la casse et aux accents :
`reference_operation;statut;date;montant;code_rejet;motif`.
`statut` : `REGLE`/`RÉGLÉ`/`PAYE`/`OK` → `SETTLED` ; `REJETE`/`REJETÉ`/`KO` →
`REJECTED`. `date` : `AAAA-MM-JJ` ou `JJ/MM/AAAA`. `montant` : décimal à `.`
ou `,`, espaces de milliers tolérés. Une ligne illisible donne une entrée
`errors` (message traduit, sans valeur sensible) et n'arrête pas la lecture.
Fichier ≤ 2 Mo et ≤ 5 000 lignes, sinon `BadRequestError`. Le parseur est
maison (aucune dépendance nouvelle), pur et testé.

**Rapprochement** (périmètre de la route, agence) : la référence
`PRL-AAAA-NNNN-RRR` donne (année, séquence) de la remise et le rang de la
ligne. Résultat par enregistrement :

| Situation                                           | `action` | `skipReason`               |
| --------------------------------------------------- | -------- | -------------------------- |
| ligne `PENDING`, `SETTLED`, montant égal            | `SETTLE` | —                          |
| ligne `PENDING` ou `SETTLED`, `REJECTED`            | `REJECT` | —                          |
| référence inconnue dans l'agence et le périmètre    | `SKIP`   | `UNKNOWN_REFERENCE`        |
| montant différent de celui de la ligne (au centime) | `SKIP`   | `AMOUNT_MISMATCH`          |
| ligne déjà dans l'état demandé                      | `SKIP`   | `ALREADY_PROCESSED`        |
| ligne `REJECTED`, `SETTLED` demandé                 | `SKIP`   | `CONFLICT`                 |
| ligne `CANCELED`                                    | `SKIP`   | `LINE_CANCELED`            |
| remise ni `EXPORTED` ni `SUBMITTED`                 | `SKIP`   | `REMITTANCE_NOT_SUBMITTED` |
| date hors de [date de prélèvement, aujourd'hui]     | `SKIP`   | `INVALID_DATE`             |

Deux temps : **aperçu** (lecture, aucun écrit) puis **application** du même
fichier (relu, rapproché à nouveau, puis chaque action dans sa propre
transaction par §8.3/§8.4 avec `returnSource = IMPORT`). L'application crée
une ligne `DirectDebitReturnImport` (compteurs, empreinte HMAC du fichier) et
l'audit `DIRECT_DEBIT_RETURN_IMPORTED` (critique, compteurs seulement).
Rejouer le même fichier ne change rien (`ALREADY_PROCESSED`).

### 8.6 Encaisseurs (`lib/direct-debit/collectors/`)

```ts
type Tx = Prisma.TransactionClient;

interface CollectorLine {
  // chargée par le service, filtrée par agence
  id: string;
  tenantId: string;
  remittanceId: string;
  reference: string;
  mandateId: string;
  amount: number;
  scope: "RENTAL_LEASE" | "SYNDIC_LOT";
  leaseId: string | null;
  installmentId: string | null; // RENTAL_LEASE
  lotId: string | null;
  chargeCallIds: string[]; // SYNDIC_LOT (P4)
  syndicateId: string | null;
  rentalPaymentId: string | null;
  chargePaymentId: string | null;
  treasuryAccountId: string | null; // compte du créancier
}

interface CollectorContext {
  tenantId: string;
  actorUserId: string | null;
  now: Date;
}

interface DirectDebitCollector {
  scope: "RENTAL_LEASE" | "SYNDIC_LOT";
  keepsActiveKeyOnSettle: boolean;
  settleTx(
    tx: Tx,
    ctx: CollectorContext,
    line: CollectorLine,
    settledAt: Date,
  ): Promise<{
    rentalPaymentId?: string;
    chargePaymentId?: string;
    afterCommit?: () => Promise<void>;
  }>;
  reverseTx(
    tx: Tx,
    ctx: CollectorContext,
    line: CollectorLine,
  ): Promise<{ afterCommit?: () => Promise<void> }>;
  applyRejectFeeTx(
    tx: Tx,
    ctx: CollectorContext,
    line: CollectorLine,
    fee: number,
  ): Promise<{ appliedAmount: number }>;
}
export function getCollector(scope): DirectDebitCollector;
```

**Encaisseur `RENTAL_LEASE`** (`collectors/rental.ts`) :

- `settleTx` : `RentalPayment` créé `PENDING` puis passé `SUCCESS` par
  `updatePaymentStatusTx` (recette de `lib/payment-gateway/checkout.ts`) :
  `method = DIRECT_DEBIT`, `amount = line.amount`, `lease_id`,
  `renter_client_id` = locataire principal du bail, `treasury_account_id` =
  compte du créancier, `succeeded_at = settledAt`, `idempotency_key =
direct-debit-line:<lineId>`, `psp_reference = <référence de ligne>`
  (jamais `psp_transaction_id`) ; puis `allocatePaymentTx` sur l'échéance de
  la ligne (montant manuel = montant de la ligne) dans un `try/catch` : si rien
  n'est allouable, le montant reste en avance du locataire. `afterCommit` :
  quittance `RENT_RECEIPT` idempotente (verrou `withExclusiveSection`, puis
  `generateDocument` seulement si aucune quittance `FINAL` n'existe pour ce
  paiement ; l'absence de modèle DOCX est journalisée, pas une erreur).
- `reverseTx` : `updatePaymentStatusTx(FAILED)` sur le paiement de la ligne
  (désallocation, contre-passation au compte du locataire et en trésorerie) ;
  les quittances `RENT_RECEIPT` `FINAL` de ce paiement passent `VOID`.
- `applyRejectFeeTx` : sur l'échéance de la ligne, `amount_other_fees += fee`,
  un `RentalInstallmentItem` `OTHER` « Frais de rejet de prélèvement »
  (`metadata: { kind: 'DIRECT_DEBIT_REJECT_FEE', lineId }`) et un mouvement
  de compte de tiers `ADJUSTMENT` (`billed = fee`, `sourceType =
'DIRECT_DEBIT_REJECT_FEE'`, `sourceId = lineId`, idempotent). La nouvelle
  source s'ajoute à `FinanceSourceType` et à `BILLING_SOURCES`
  (`lib/finance/rental-direct-ledger.ts`, produit **7088** comme les
  pénalités) ; `lib/owner-account/sync.ts` exclut ces frais des sommes dues au
  propriétaire (ils rémunèrent le créancier qui a supporté les frais bancaires).
  `appliedAmount = fee`.
- La route générique de changement de statut d'un paiement
  (`rental-payment-controller.ts`) refuse un paiement `DIRECT_DEBIT` lié à une
  ligne de remise (`ConflictError` : « Ce paiement provient d'un prélèvement :
  constatez un rejet depuis la remise. »).

### 8.7 Routes (sous `/api/tenants/:tenantId/rental/direct-debit`)

Gardes de P1 ; `MANAGE` pour les écritures, `VIEW` pour la lecture.

| Méthode | Chemin                                            | Permission | Corps                                                       | `data`                                                                                   |
| ------- | ------------------------------------------------- | ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| POST    | `/remittances/:remittanceId/lines/:lineId/settle` | MANAGE     | `{ settledAt }`                                             | `RemittanceDto`                                                                          |
| POST    | `/remittances/:remittanceId/lines/:lineId/reject` | MANAGE     | `{ rejectedAt, code?, reason? }`                            | `RemittanceDto`                                                                          |
| POST    | `/remittances/:remittanceId/settle-all`           | MANAGE     | `{ settledAt }`                                             | `{ remittance: RemittanceDto, settled: number, failed: { lineId, reference, error }[] }` |
| POST    | `/returns/preview`                                | MANAGE     | multipart `file` (≤ 2 Mo), `format?` (défaut `GENERIC_CSV`) | `ReturnPreviewDto`                                                                       |
| POST    | `/returns/apply`                                  | MANAGE     | même fichier                                                | `ReturnApplyDto`                                                                         |
| GET     | `/returns`                                        | VIEW       | `?page&pageSize`                                            | `{ items: ReturnImportDto[], total, page, pageSize }`                                    |

Les mêmes services servent P4 avec `scope = SYNDIC_LOT` et le syndicat (§9) :
chaque fonction de service prend `ReturnScope = { scope: 'RENTAL_LEASE' } |
{ scope: 'SYNDIC_LOT'; syndicateId: string }` et ne voit que les remises de ce
périmètre (sinon `NotFoundError`).

```ts
interface ReturnRecordDto {
  row: number;
  operationReference: string;
  outcome: "SETTLED" | "REJECTED";
  date: string;
  amount: number;
  rejectionCode: string | null;
  rejectionReason: string | null;
  action: "SETTLE" | "REJECT" | "SKIP";
  skipReason:
    | "UNKNOWN_REFERENCE"
    | "AMOUNT_MISMATCH"
    | "ALREADY_PROCESSED"
    | "CONFLICT"
    | "LINE_CANCELED"
    | "REMITTANCE_NOT_SUBMITTED"
    | "INVALID_DATE"
    | null;
  match: {
    remittanceId: string;
    remittanceReference: string;
    lineId: string;
    lineStatus: RemittanceLineStatus;
    lineAmount: number;
    debtorName: string | null;
  } | null;
}
interface ReturnPreviewDto {
  format: "GENERIC_CSV";
  fileName: string;
  records: ReturnRecordDto[];
  errors: { row: number; message: string }[];
  summary: { settle: number; reject: number; skip: number; errors: number };
}
interface ReturnApplyDto extends ReturnPreviewDto {
  importId: string;
  results: { row: number; lineId: string; ok: boolean; error: string | null }[];
}
interface ReturnImportDto {
  id: string;
  format: "GENERIC_CSV";
  fileName: string;
  recordCount: number;
  settledCount: number;
  rejectedCount: number;
  skippedCount: number;
  errorCount: number;
  importedBy: { id: string; fullName: string | null } | null;
  createdAt: string;
}
```

**Objets de remise (ajouts à §7.7)** :

```ts
type RemittanceLineStatus = "PENDING" | "CANCELED" | "SETTLED" | "REJECTED";
interface RemittanceLineDto {
  // … champs §7.7, plus :
  settledAt: string | null; // AAAA-MM-JJ
  rejectedAt: string | null; // AAAA-MM-JJ
  rejectionCode: string | null;
  rejectionReason: string | null;
  rejectFeeAmount: number | null;
  returnSource: "MANUAL" | "IMPORT" | null;
  paymentId: string | null; // RentalPayment (P3) ou ChargePayment (P4)
}
interface RemittanceSummaryDto {
  // … champs §7.7, plus :
  returnSummary: {
    pending: number;
    settled: number;
    rejected: number;
    settledAmount: number;
    rejectedAmount: number;
  };
  /** NOT_APPLICABLE avant dépôt ; AWAITING : aucun constat ; PARTIAL ; COMPLETE : plus aucune ligne PENDING. */
  returnState: "NOT_APPLICABLE" | "AWAITING" | "PARTIAL" | "COMPLETE";
}
```

`lineCount` et `totalAmount` restent ceux de la remise déposée (ils ne
changent plus après la validation). Le fichier de remise re-téléchargé
contient toutes les lignes non annulées (`PENDING`, `SETTLED`, `REJECTED`) :
il reste identique à celui déposé.

### 8.8 Notifications

E-mail `DIRECT_DEBIT_REJECTED` (destinataire : le débiteur ; fonctionnalité
RENTAL ; réglable dans « Notifications e-mail ») : agence, référence du
mandat, IBAN **masqué**, montant, date de prélèvement, motif, frais refacturés
éventuels, et la mention de la suspension du mandat si elle a eu lieu. Envoi
après la transaction, adresse masquée dans les journaux (`redactRecipient`),
échec isolé. Le règlement n'envoie pas d'e-mail en P3 (la quittance est
visible au portail).

### 8.9 Audit

Nouvelles clés (`tenant('BILLING')`, toutes critiques) :
`DIRECT_DEBIT_LINE_SETTLED`, `DIRECT_DEBIT_LINE_REJECTED`,
`DIRECT_DEBIT_RETURN_IMPORTED`, `DIRECT_DEBIT_MANDATE_AUTO_SUSPENDED`.

### 8.10 Écrans

Détail d'une remise `EXPORTED`/`SUBMITTED` (et les suivantes) :

- résumé du retour (`returnSummary`, `returnState`) dans l'en-tête ;
- par ligne `PENDING` : « Constater le règlement » (date de valeur, défaut :
  date de prélèvement) et « Constater le rejet » (date, code, motif ; le texte
  dit si des frais seront refacturés et si le mandat sera suspendu au rejet
  suivant) ; par ligne `SETTLED` : « Constater un rejet tardif » (avertit que
  l'encaissement et sa quittance seront annulés) ;
- « Tout constater réglé » (confirmation, date unique) ;
- colonnes : statut de la ligne (Réglée, Rejetée + code et motif), date de
  valeur ou de rejet, frais refacturés, lien vers le paiement ;
- Location › Prélèvements : bouton « Importer un retour de la banque »
  (onglet Remises) → fenêtre en deux temps : dépôt du fichier, aperçu
  (actions, raisons d'écart traduites, erreurs de lecture), puis
  « Appliquer » ; historique des imports (GET `/returns`).

### 8.11 Hors P3

Retour automatique par API bancaire ; format réel de la banque pilote (nouvel
adaptateur de retour quand les pièces arriveront) ; e-mail de règlement ;
WhatsApp ; frais de rejet en copropriété (P4 : non refacturés).

### 8.12 Retours de recette du staging (17/10/2026, remise PRL-2026-0001)

- **Mandats non retenus invisibles.** Un mandat du créancier en brouillon ou
  suspendu n'était pas évalué, donc absent de `skipped`. Désormais la
  sélection lit aussi les mandats `DRAFT` et `SUSPENDED` (jamais `REVOKED`)
  et les renvoie avec la raison `MANDATE_NOT_ACTIVE` ; ils ne deviennent
  jamais des lignes. `GET /remittances/:remittanceId` d'une remise `DRAFT`
  renvoie `skipped` (recalculé, lecture seule), affiché en permanence sur le
  détail (section « Mandats non retenus »).
- **Téléchargements silencieux.** Le PDF d'autorisation, la production et le
  re-téléchargement du fichier de remise affichent un message de succès qui
  nomme le fichier, ou une erreur.
- **Destinataire des avis (décision de l'utilisateur : « Compte, et le
  dire »).** L'avis part à l'e-mail du compte portail du débiteur s'il en a
  un, sinon à celui de sa fiche contact CRM (règle inchangée,
  `lib/direct-debit/recipient.ts`). À l'envoi, la ligne garde l'adresse
  **masquée** (`a•••@ex•••.ci`) et sa provenance
  (`prenotificationRecipientMasked`, `prenotificationRecipientSource` :
  `ACCOUNT` | `CONTACT`). Chaque ligne renvoie
  `prenotificationRecipient: { masked, source } | null` (adresse utilisée, ou
  prévue tant que l'avis n'est pas parti) et le résumé des avis
  `recipients: { account, contact, none }`. La fiche contact du CRM signale,
  sous le champ e-mail, l'adresse masquée du compte portail quand elle
  diffère (`portalAccountEmailNotice` dans la réponse de détail du contact,
  jamais dans les listes). Jamais d'adresse complète dans une réponse.

## 9. P4 — Copropriété (contrat)

> Ajouté le 17/10/2026. Prélèvement des appels de charges des
> copropriétaires. Les portails restent pour P5. Chemins relatifs à
> `packages/api/`.

### 9.1 Principe et décisions

- **Créancier** = le compte bancaire **du syndicat** (sa banque, sa
  convention d'émetteur), pas un compte de trésorerie de l'agence : un
  `DirectDebitCreditor` de périmètre `SYNDIC_LOT`, rattaché au syndicat, sans
  `treasuryAccountId`. L'encaissement passe par la comptabilité de la
  copropriété (`ChargePayment`, compte 521 du syndicat). Un seul créancier par
  syndicat.
- **Mandat** = par **lot** : débiteur = un contact copropriétaire du lot
  (`CrmContact` : `ownerContactId`, `coownerId` ou un `LotOwnerProfile`
  en cours), pas un `TenantClient`. Un seul mandat ouvert par (lot, créancier).
- **Remise** = par syndicat : pour chaque lot dont le mandat est actif, la
  somme des appels de charges **échus et non soldés**, plus ancien d'abord,
  plafonnée par le mandat. L'avance du lot est déjà imputée aux appels
  (invariant de `charge-allocation.ts`) ; un trop-perçu redevient une avance.
  Les pénalités de retard ne sont jamais prélevées.
- **Règlement** = `ChargePayment` (`recordLotPaymentTx`, méthode
  `DIRECT_DEBIT`, origine `DIRECT_DEBIT`) puis reçus et quittances S3
  (`issueReceiptsForPaymentTx`), dans la transaction du constat (§8.3).
- **Rejet** d'une ligne non réglée : comme §8.4. **Rejet tardif** d'une ligne
  déjà réglée : refusé (`ConflictError`), car aucune contre-passation d'un
  `ChargePayment` n'existe ; la régularisation se fait en comptabilité.
  **Frais de rejet** : non refacturés en copropriété (`rejectFeeAmount` forcé
  à 0 pour ce périmètre). Compteur et suspension (D5) comme en locatif.
- **Garde** : routes sous `/syndics/:syndicId/prelevements` (fonctionnalité
  `SYNDIC` par `lib/subscription/route-features.ts`, règle `/syndics`
  existante) ; permissions dédiées `SYNDIC_DIRECT_DEBIT_VIEW` (consulter, IBAN
  masqué) et `SYNDIC_DIRECT_DEBIT_MANAGE` (le reste, dont le PDF et le
  fichier à IBAN complet).

### 9.2 Schéma (P4)

```prisma
// Migration 1 (seule) : 20261017110000_prelevement_copro_valeurs
enum DirectDebitMandateScope { RENTAL_LEASE  SYNDIC_LOT }
enum ChargePaymentOrigin { MANUAL  ONLINE  DIRECT_DEBIT }

// Migration 2 : 20261017110100_prelevement_copropriete
model DirectDebitCreditor {
  // … champs P1, et :
  scope              DirectDebitMandateScope @default(RENTAL_LEASE)
  treasuryAccountId  String?  @map("treasury_account_id") @db.Uuid   // devient facultatif : obligatoire en RENTAL_LEASE (contrôle du service)
  syndicateId        String?  @map("syndicate_id") @db.Uuid          // obligatoire en SYNDIC_LOT
  bankName           String?  @map("bank_name")                      // banque du syndicat (SYNDIC_LOT)
  bankAccountRef     String?  @map("bank_account_ref")               // compte du syndicat, pour l'affichage
  syndicate Syndicate? @relation(fields: [syndicateId], references: [id], onDelete: Restrict)
  @@unique([tenantId, syndicateId])  // un créancier par syndicat
  @@index([tenantId, scope])
}

model DirectDebitMandate {
  // … champs P1, et :
  debtorClientId   String?  @map("debtor_client_id")                  // devient facultatif : obligatoire en RENTAL_LEASE
  debtorContactId  String?  @map("debtor_contact_id")                 // obligatoire en SYNDIC_LOT (CrmContact)
  syndicateId      String?  @map("syndicate_id") @db.Uuid
  lotId            String?  @map("lot_id") @db.Uuid
  debtorContact CrmContact?   @relation(fields: [debtorContactId], references: [id], onDelete: Restrict)
  syndicate     Syndicate?    @relation(fields: [syndicateId], references: [id], onDelete: Restrict)
  lot           SyndicateLot? @relation(fields: [lotId], references: [id], onDelete: Restrict)
  @@index([lotId])
  @@index([tenantId, scope])
  // openSlotKey : "lot:<lotId>:<creditorId>" en SYNDIC_LOT
}

model DirectDebitRemittance {
  // … champs P2, et :
  syndicateId String? @map("syndicate_id") @db.Uuid                    // obligatoire en SYNDIC_LOT
  syndicate   Syndicate? @relation(fields: [syndicateId], references: [id], onDelete: Restrict)
  @@index([tenantId, scope])
}

model DirectDebitRemittanceLine {
  // … champs P2/P3, et :
  leaseId          String?  @map("lease_id") @db.Uuid                 // devient facultatif (RENTAL_LEASE)
  installmentId    String?  @map("installment_id") @db.Uuid           // devient facultatif (RENTAL_LEASE)
  debtorClientId   String?  @map("debtor_client_id")                  // devient facultatif (RENTAL_LEASE)
  lotId            String?  @map("lot_id") @db.Uuid                   // SYNDIC_LOT
  debtorContactId  String?  @map("debtor_contact_id")                 // SYNDIC_LOT
  /// Appels de charges couverts, figés à la sélection, plus ancien d'abord.
  chargeCallIds    String[] @default([]) @map("charge_call_ids") @db.Uuid
  /// Encaissement de charges créé au règlement (SYNDIC_LOT).
  chargePaymentId  String?  @unique @map("charge_payment_id") @db.Uuid
  lot           SyndicateLot?  @relation(fields: [lotId], references: [id], onDelete: Restrict)
  debtorContact CrmContact?    @relation(fields: [debtorContactId], references: [id], onDelete: Restrict)
  chargePayment ChargePayment? @relation(fields: [chargePaymentId], references: [id], onDelete: Restrict)
  @@index([lotId])
  // activeKey : "lot:<lotId>" en SYNDIC_LOT (une seule ligne vivante par lot)
}

model DirectDebitReturnImport {
  // … champs P3, et :
  syndicateId String? @map("syndicate_id") @db.Uuid
  syndicate   Syndicate? @relation(fields: [syndicateId], references: [id], onDelete: Restrict)
}
```

Migration 3 : `20261017110200_prelevement_copro_permissions` —
`SYNDIC_DIRECT_DEBIT_VIEW` et `SYNDIC_DIRECT_DEBIT_MANAGE`, attribution
idempotente : VIEW à tout rôle qui a `SYNDIC_VIEW`, MANAGE aux seuls rôles
`TENANT_ADMIN` et `TENANT_MANAGER` (modèle :
`20261015090100_prelevement_bancaire_permissions`). Seed :
`prisma/seeds/syndic-permissions-seed.ts`.

Les modèles portent `tenantId` : rien à déclarer dans `schema-tenant-coverage`.
Les routes et services locatifs filtrent désormais `scope = RENTAL_LEASE`
(un identifiant de copropriété sur une route locative → 404, et l'inverse).

### 9.3 Règles

- **Créancier** : libellé (1–120), banque (≤ 120), référence du compte
  (≤ 64), numéro d'émetteur, jour de collecte (1–28), délai de prénotification
  (0–30), seuil de suspension (1–10), actif. `rejectFeeAmount` = 0, non
  modifiable. Le syndicat doit appartenir à l'agence (sinon 404).
- **Mandat** : `lotId` d'un lot **du syndicat de la route** ; `debtorContactId`
  parmi les contacts copropriétaires de ce lot (`ownerContactId`, `coownerId`,
  `LotOwnerProfile` sans `ownedUntil` passé) — sinon `NotFoundError`. Même
  contrôle d'IBAN, chiffrement, statuts, PDF et scan qu'en P1. Le PDF
  d'autorisation mentionne le syndicat, le lot et « les appels de charges de
  copropriété de ce lot » (pas de bail).
- **Sélection** (remplace §7.2 pour ce périmètre) : mandats `ACTIVE`
  `SYNDIC_LOT` du créancier du syndicat ; jour effectif de collecte ≤ jour de
  `collectionDate` ; appels du lot avec `amount > 0`, `dueDate ≤
collectionDate` et reste dû > 0 (allocations), triés par `dueDate`, puis
  `createdAt`, puis `id` ; reste dû = somme ; montant = min(reste dû,
  `maxAmount`) ; `chargeCallIds` = ces appels ; raisons de non-sélection :
  `NOTHING_DUE`, `ALREADY_IN_REMITTANCE` (ligne vivante pour le lot),
  `COLLECTION_DAY_LATER`. La validation recompare montant, reste dû, plafond et
  l'ensemble des appels.
- **Fichier** : libellé `CHARGES LOT <numéro> MM/AAAA` (ASCII majuscules) ;
  le reste du format `GENERIC_CSV` est celui de §7.4.
- **Prénotification** : clé e-mail `SYNDIC_DIRECT_DEBIT_PRENOTIFICATION`
  (fonctionnalité SYNDIC) au contact débiteur (son e-mail CRM) ; variables :
  `debtorName`, `agencyName`, `syndicateName`, `lotNumber`, `mandateReference`,
  `creditorIdentifier`, `ibanMasked`, `amount`, `collectionDate`.
- **Rejet** : clé `SYNDIC_DIRECT_DEBIT_REJECTED` (SYNDIC), mêmes variables que
  `DIRECT_DEBIT_REJECTED` plus `syndicateName` et `lotNumber`.
- **Encaisseur `SYNDIC_LOT`** (`collectors/syndic.ts`) :
  `keepsActiveKeyOnSettle = false` (le lot redevient prélevable pour ses
  appels suivants) ; `settleTx` = `recordLotPaymentTx({ tenantId, syndicateId,
lotId, amount, paidAt: settledAt, method: 'DIRECT_DEBIT', reference:
<référence de ligne>, chargeCallIds, actorUserId, idempotencyKey:
'direct-debit-line:<lineId>', origin: 'DIRECT_DEBIT' })` puis
  `issueReceiptsForPaymentTx`, `afterCommit` = `scheduleChargeDocumentDelivery` ;
  `reverseTx` lève `ConflictError` « Le rejet d'un prélèvement de charges déjà
  réglé n'est pas pris en charge : régularisez dans la comptabilité de la
  copropriété. » ; `applyRejectFeeTx` renvoie `{ appliedAmount: 0 }`.
  `METHOD_LABELS` des reçus connaît `DIRECT_DEBIT` (« Prélèvement bancaire »).
- **Signature électronique (préparation §10)** : `activateMandate` accepte
  `signedAt` absent quand le mandat porte déjà une date de signature ;
  `revokeMandate` et le dépôt manuel d'un scan annulent toute demande de
  signature ouverte pour ce mandat (`cancelOpenRequestsForTarget`, cible
  `DIRECT_DEBIT_MANDATE`).
- **Passerelle IA** : le chemin `prelevements` est ajouté aux motifs sensibles
  de `lib/ai/gateway/path-rules.ts` (comme `direct-debit`).

### 9.4 Routes (sous `/api/tenants/:tenantId/syndics/:syndicId/prelevements`)

Gardes : `authenticate`, `requireTenantAccess`, syndicat de l'agence (404
sinon), puis `SYNDIC_DIRECT_DEBIT_VIEW` (lecture) ou `_MANAGE` (le reste).
Les objets renvoyés sont ceux du locatif (§4, §7.7, §8.7) élargis (§9.5).

| Méthode     | Chemin                                          | Corps / requête                                                                                                                               | `data`                                           |
| ----------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| GET         | `/creancier`                                    | —                                                                                                                                             | `CreditorDto \| null`                            |
| PUT         | `/creancier`                                    | `{ label, bankName?, bankAccountRef?, creditorIdentifier?, collectionDay?, prenotificationBusinessDays?, maxConsecutiveRejects?, isActive? }` | `CreditorDto`                                    |
| POST        | `/controle-iban`                                | `{ iban }`                                                                                                                                    | `IbanCheckDto`                                   |
| GET         | `/lots/:lotId/debiteurs`                        | —                                                                                                                                             | `{ contactId, displayName, hasEmail }[]`         |
| GET         | `/mandats`                                      | `?lotId&status&search&page&pageSize`                                                                                                          | `{ items: MandateDto[], total, page, pageSize }` |
| POST        | `/mandats`                                      | `{ lotId, debtorContactId, iban, holderName, maxAmount?, collectionDay?, notes? }`                                                            | `{ mandate, warnings }`                          |
| GET / PATCH | `/mandats/:mandateId`                           | PATCH : `{ maxAmount?, collectionDay?, notes? }`                                                                                              | `MandateDto`                                     |
| POST        | `/mandats/:mandateId/activer`                   | `{ signedAt? }`                                                                                                                               | `MandateDto`                                     |
| POST        | `/mandats/:mandateId/suspendre`                 | `{ reason }`                                                                                                                                  | `MandateDto`                                     |
| POST        | `/mandats/:mandateId/reactiver`                 | —                                                                                                                                             | `MandateDto`                                     |
| POST        | `/mandats/:mandateId/revoquer`                  | `{ reason, revokedAt? }`                                                                                                                      | `MandateDto`                                     |
| GET         | `/mandats/:mandateId/autorisation-pdf`          | —                                                                                                                                             | PDF                                              |
| POST / GET  | `/mandats/:mandateId/scan-signe`                | multipart `file` / —                                                                                                                          | `MandateDto` / fichier                           |
| GET         | `/remises`                                      | `?status&page&pageSize`                                                                                                                       | `{ items: RemittanceSummaryDto[], … }`           |
| POST        | `/remises`                                      | `{ collectionDate, notes? }`                                                                                                                  | `{ remittance, skipped }`                        |
| GET         | `/remises/:remittanceId`                        | —                                                                                                                                             | `RemittanceDto`                                  |
| POST        | `/remises/:remittanceId/actualiser`             | —                                                                                                                                             | `{ remittance, skipped }`                        |
| POST        | `/remises/:remittanceId/lignes/:lineId/retirer` | `{ reason? }`                                                                                                                                 | `RemittanceDto`                                  |
| POST        | `/remises/:remittanceId/valider`                | —                                                                                                                                             | `{ remittance, prenotifications }`               |
| POST        | `/remises/:remittanceId/avis`                   | —                                                                                                                                             | `{ remittance, prenotifications }`               |
| POST        | `/remises/:remittanceId/fichier`                | —                                                                                                                                             | fichier CSV                                      |
| POST        | `/remises/:remittanceId/deposer`                | —                                                                                                                                             | `RemittanceDto`                                  |
| POST        | `/remises/:remittanceId/annuler`                | `{ reason }`                                                                                                                                  | `RemittanceDto`                                  |
| POST        | `/remises/:remittanceId/lignes/:lineId/regler`  | `{ settledAt }`                                                                                                                               | `RemittanceDto`                                  |
| POST        | `/remises/:remittanceId/lignes/:lineId/rejeter` | `{ rejectedAt, code?, reason? }`                                                                                                              | `RemittanceDto`                                  |
| POST        | `/remises/:remittanceId/tout-regler`            | `{ settledAt }`                                                                                                                               | comme §8.7                                       |
| POST        | `/retours/apercu`                               | multipart `file`, `format?`                                                                                                                   | `ReturnPreviewDto`                               |
| POST        | `/retours/appliquer`                            | multipart `file`, `format?`                                                                                                                   | `ReturnApplyDto`                                 |
| GET         | `/retours`                                      | `?page&pageSize`                                                                                                                              | `{ items: ReturnImportDto[], … }`                |

Le créancier de la remise est toujours celui du syndicat (aucun
`creditorId` dans le corps).

### 9.5 Objets renvoyés (ajouts)

```ts
interface CreditorDto {
  // … §4, et :
  scope: 'RENTAL_LEASE' | 'SYNDIC_LOT';
  treasuryAccountId: string | null; treasuryAccountLabel: string | null;  // nuls en SYNDIC_LOT
  syndicate: { id: string; name: string } | null;
  bankAccountRef: string | null;     // bankName existe déjà
}
interface MandateDto {
  // … §4, et :
  scope: 'RENTAL_LEASE' | 'SYNDIC_LOT';
  debtor: { id: string; displayName: string | null; kind: 'CLIENT' | 'CONTACT' };
  lease: … | null;                    // nul en SYNDIC_LOT
  syndicate: { id: string; name: string } | null;
  lot: { id: string; lotNumber: string } | null;
}
interface RemittanceSummaryDto {
  // … §7.7, §8.7, et :
  scope: 'RENTAL_LEASE' | 'SYNDIC_LOT';
  syndicate: { id: string; name: string } | null;
}
interface RemittanceLineDto {
  // … §7.7, §8.7, et :
  lease: { id: string; leaseNumber: string } | null;                       // nul en SYNDIC_LOT
  installment: { id: string; periodYear: number; periodMonth: number; dueDate: string } | null;
  lot: { id: string; lotNumber: string } | null;                           // SYNDIC_LOT
  chargeCalls: { id: string; period: string; dueDate: string; amount: number }[];  // SYNDIC_LOT
  debtor: { id: string; displayName: string | null; kind: 'CLIENT' | 'CONTACT' };
}
interface ReturnImportDto { /* … §8.7, et : */ scope: 'RENTAL_LEASE' | 'SYNDIC_LOT' }
```

`paymentId` (§8.7) vaut `chargePaymentId` en `SYNDIC_LOT`.

### 9.6 Écrans (gestionnaire du syndic)

Syndic › Finances : onglet « Prélèvements »
(`/tenant/:tenantId/syndics/:syndicId/prelevements`, entrée ajoutée à
`buildTabs` de `SyndicWorkspaceLayout`, à `activeFor` du menu
`syndics-finances` et à `route-labels.ts`), cohérent avec les autres onglets
de Finances (cartes empilées, `useSyndicRouteContext`) :

- carte « Compte de prélèvement du syndicat » (créancier : création,
  modification, désactivation) ;
- « Mandats » : liste filtrable par lot et statut ; « Nouveau mandat » (lot →
  copropriétaire du lot → IBAN ou RIB contrôlé, titulaire, plafond, jour) ;
  actions comme en locatif (PDF, scan, activer, suspendre, réactiver,
  révoquer) ;
- « Remises » : liste, « Préparer une remise », détail
  (`/prelevements/remises/:remittanceId`) avec les mêmes actions, constats et
  avertissements que le locatif (§7.10, §8.10), et l'import d'un retour de la
  banque ;
- textes en fr/en/ar dans `syndic.json`.

### 9.7 Hors P4

Portails copropriétaire (P5) ; frais de rejet refacturés en copropriété ;
contre-passation d'un `ChargePayment` ; mandat couvrant plusieurs lots d'un
même copropriétaire.
