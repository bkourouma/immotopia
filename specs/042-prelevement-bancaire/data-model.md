# 042 — Modèle de données et contrat d'API de P1

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
