# 044 — Modèle de données (proposition)

Tous les modèles portent `tenantId` et figurent dans
`__tests__/unit/schema-tenant-coverage.test.ts`.

```prisma
enum SignatureDocumentKind {
  LEASE_CONTRACT
  MANAGEMENT_MANDATE
  SALE_MANDATE
  LEASE_INSPECTION
  SALE_AGREEMENT
}

enum SignatureRequestStatus {
  DRAFT
  SENT
  PARTIALLY_SIGNED
  COMPLETED
  DECLINED
  EXPIRED
  CANCELED
}

enum SignatureSignerStatus {
  PENDING
  OPENED
  SIGNED
  DECLINED
}

enum SignatureChannel {
  EMAIL
  WHATSAPP
  SMS
  IN_PERSON
}

model SignatureRequest {
  id            String  @id @default(uuid()) @db.Uuid
  tenantId      String  @map("tenant_id")
  kind          SignatureDocumentKind
  targetType    String  @map("target_type")   // RentalLease, PropertyMandate…
  targetId      String  @map("target_id")     // vérifié par assertBelongsToTenant
  status        SignatureRequestStatus @default(DRAFT)
  providerId    String  @map("provider_id")   // internal | nom du prestataire
  providerRef   String? @map("provider_ref")
  sourceFileKey String  @map("source_file_key")
  sourceHash    String  @map("source_hash")   // SHA-256 figé à l'envoi
  signedFileKey String? @map("signed_file_key")
  signedHash    String? @map("signed_hash")
  sequential    Boolean @default(false)
  expiresAt     DateTime @map("expires_at")
  createdByUserId String @map("created_by_user_id")
  completedAt   DateTime? @map("completed_at")
  createdAt     DateTime @default(now()) @map("created_at")
  signers       SignatureSigner[]
  events        SignatureEvent[]

  @@index([tenantId, status])
  @@index([tenantId, targetType, targetId])
}

model SignatureSigner {
  id          String @id @default(uuid()) @db.Uuid
  tenantId    String @map("tenant_id")
  requestId   String @map("request_id") @db.Uuid
  role        String                       // LOCATAIRE, BAILLEUR, AGENT…
  position    Int
  fullName    String @map("full_name")
  channel     SignatureChannel
  contact     String                       // e-mail ou numéro, masqué en sortie
  status      SignatureSignerStatus @default(PENDING)
  tokenHash   String @unique @map("token_hash")
  otpHash     String? @map("otp_hash")
  otpExpiresAt DateTime? @map("otp_expires_at")
  otpAttempts Int @default(0) @map("otp_attempts")
  otpSends    Int @default(0) @map("otp_sends")
  signatureImageKey String? @map("signature_image_key")
  consentTextHash String? @map("consent_text_hash")
  signedAt    DateTime? @map("signed_at")
  ipHash      String? @map("ip_hash")
  userAgent   String? @map("user_agent")
  declineReason String? @map("decline_reason")
  request     SignatureRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)

  @@index([tenantId, requestId])
}

/// Append-only, chaînée : prevHash = eventHash de l'événement précédent.
model SignatureEvent {
  id        String @id @default(uuid()) @db.Uuid
  tenantId  String @map("tenant_id")
  requestId String @map("request_id") @db.Uuid
  signerId  String? @map("signer_id") @db.Uuid
  type      String   // CREATED, SENT, OPENED, OTP_SENT, OTP_FAILED, SIGNED, DECLINED, SEALED, EXPIRED, CANCELED
  payload   Json?
  prevHash  String? @map("prev_hash")
  eventHash String  @map("event_hash")
  createdAt DateTime @default(now()) @map("created_at")
  request   SignatureRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)

  @@index([tenantId, requestId])
}

model SignatureUsage {
  id       String @id @default(uuid()) @db.Uuid
  tenantId String @map("tenant_id")
  month    String                // AAAA-MM
  used     Int    @default(0)

  @@unique([tenantId, month])
}
```

Autres changements :

- `SecureLinkScope` : pas nécessaire, le jeton vit dans `SignatureSigner`
  (un jeton par signataire, usage lié à la demande).
- `PropertyMandate` : ajouter un statut (`DRAFT`, `SIGNED`, `REVOKED`) ou un
  `signedAt`.
- `RentalDocument` : lier le PDF scellé (`type` existant, ou nouveau
  `LEASE_CONTRACT_SIGNED`).
- `AuditActionKey` + `audit-catalog` : `SIGNATURE_REQUEST_SENT`,
  `SIGNATURE_SIGNED`, `SIGNATURE_DECLINED`, `SIGNATURE_SEALED`,
  `SIGNATURE_OTP_LOCKED` (critiques, contacts masqués).
- Capacité d'abonnement `SIGNATURES_MENSUELLES` dans `subscription/catalog.ts`.
