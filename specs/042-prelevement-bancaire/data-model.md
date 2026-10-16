# 042 — Modèle de données et contrat d'API (P1, P2)

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
  /// SHA-256 du dernier fichier produit (traçabilité ; le fichier n'est jamais stocké).
  lastFileSha256        String?                     @map("last_file_sha256")
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

1. `20261016090000_prelevement_moyen_paiement` — `ALTER TYPE "RentalPaymentMethod" ADD VALUE 'DIRECT_DEBIT'`, seule.
2. `20261016090100_prelevement_remises` — énumérations, tables, index, clés étrangères.

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

| Action                        | De                                   | Vers                                      | Contrôles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Créer                         | —                                    | `DRAFT`                                   | créancier actif de l'agence ; date acceptable ; au moins une ligne, sinon `BadRequestError` « Aucune échéance à prélever pour ce créancier à cette date. » (rien n'est écrit)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Actualiser                    | `DRAFT`                              | `DRAFT`                                   | recalcule chaque ligne `PENDING` : plus éligible ou reste dû nul → ligne `CANCELED` (motif automatique traduit) ; montant changé → mis à jour ; ajoute les mandats devenus éligibles                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Retirer une ligne             | `DRAFT`, `VALIDATED`                 | (inchangé)                                | ligne `PENDING` → `CANCELED`, `activeKey` nul, motif facultatif ; la dernière ligne ne se retire pas d'une remise validée (annuler la remise)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Valider                       | `DRAFT`                              | `VALIDATED`                               | au moins une ligne ; créancier actif avec numéro d'émetteur (sinon `BadRequestError` « Renseignez le numéro d'émetteur du créancier avant de valider la remise. ») ; aujourd'hui ≤ `prenotificationDeadline` (sinon `ConflictError`) ; chaque ligne recalculée doit être identique, sinon `ConflictError` « Les montants ont changé depuis la préparation : actualisez la remise. » ; fige `fileFormat`, `creditorLabelSnapshot`, `creditorIdentifierSnapshot` ; mise à jour conditionnelle sur `status = DRAFT` (deux validations simultanées : une seule passe). Après la transaction : prénotifications (§7.5). |
| Renvoyer les prénotifications | `VALIDATED`, `EXPORTED`              | (inchangé)                                | avant `collectionDate` ; seulement les lignes `PENDING` dont la prénotification n'est pas `SENT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Produire le fichier           | `VALIDATED`, `EXPORTED`, `SUBMITTED` | `EXPORTED` si `VALIDATED`, sinon inchangé | au premier export, chaque mandat des lignes doit être encore `ACTIVE` (sinon `ConflictError` qui cite les références) ; audit critique écrit AVANT l'envoi, son échec bloque l'envoi ; `exportCount + 1`, `lastExportedAt`, `lastFileSha256`                                                                                                                                                                                                                                                                                                                                                                       |
| Marquer déposée               | `EXPORTED`                           | `SUBMITTED`                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Annuler                       | `DRAFT`, `VALIDATED`, `EXPORTED`     | `CANCELED`                                | motif 1–500 obligatoire ; toutes les lignes `PENDING` → `CANCELED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

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
ni journalisé ; seule son empreinte SHA-256 est gardée.

### 7.5 Prénotification (D7)

- Nouvelle notification e-mail `DIRECT_DEBIT_PRENOTIFICATION` (destinataire :
  le débiteur), dans le catalogue existant
  (`constants/email-notification-keys.ts`, modèle par défaut dans
  `constants/email-notification-default-templates.ts`), donc réglable et
  désactivable dans « Notifications email ».
- Contenu : agence, référence du mandat, numéro d'émetteur, IBAN **masqué**,
  montant, date de prélèvement, période et bail. Jamais l'IBAN complet.
- Envoi après la validation (hors transaction), ligne par ligne :
  `SENT` + `prenotifiedAt`, `NO_EMAIL`, `DISABLED` ou `FAILED` ; une erreur
  d'envoi ne fait pas échouer la validation.
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
nombre de lignes, total, date de collecte, empreinte du fichier ; jamais
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
