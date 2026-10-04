# Modèle de données — 041 Inventaire de chantier par WhatsApp et IA

**Spécification** : [spec.md](spec.md) · **Contrat** : [contracts/openapi.yaml](contracts/openapi.yaml)
**Date** : 04/10/2026 · **Statut** : révision 1
Références `fichier:ligne` relatives à `packages/api/`, vérifiées sur
`c03d75f2`. Les modèles du lot 040 (`StockAlert`, `StockCount` enrichi…) sont
ceux de `specs/040-controle-stock/data-model.md` : ce lot suppose les
fondations du lot 040 déjà fusionnées dans sa branche (plan.md §1).

## 1. Vue d'ensemble

| Nature                      | Objet                                                                                                                                                                                                                                                                                                                                 | Exigences   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Valeurs d'enum ajoutées     | `CapacityKey` + `PHOTOS_INVENTAIRE` ; `StockAlertKind` (lot 040) + `FIELD_COUNT_CLOSED`                                                                                                                                                                                                                                               | W11, W5-R6  |
| Enums neufs                 | `StockCountSource`, `StockWhatsappRegistrationStatus`, `StockWhatsappSessionState`, `StockWhatsappSessionCloseReason`, `StockWhatsappMessageDirection`, `StockWhatsappMessageKind`, `StockFieldCaptureOutcome`, `StockVisionQuality`, `StockVisionMethod`, `WhatsappCloudEventKind`, `WhatsappCloudEventStatus`, `WhatsappInboundVia` | W1 à W14    |
| Colonne ajoutée             | `StockCount.source`                                                                                                                                                                                                                                                                                                                   | W5-R2       |
| Tables neuves (cloisonnées) | `StockWhatsappRegistration`, `StockWhatsappRegistrationSite`, `StockWhatsappSession`, `StockWhatsappMessage`, `StockFieldCapture`, `StockWhatsappUsage`                                                                                                                                                                               | W3 à W14    |
| Table neuve (globale)       | `WhatsappCloudEvent`                                                                                                                                                                                                                                                                                                                  | W6, W7      |
| SQL hors Prisma             | Index uniques partiels, `CHECK`                                                                                                                                                                                                                                                                                                       | W3, W4, W11 |
| Données                     | Ligne de catalogue `EXT_INVENTAIRE_WHATSAPP` et sa capacité ; rôle `TENANT_SITE_MANAGER` et ses droits                                                                                                                                                                                                                                | W2, W11     |

Conventions du stock reprises (data-model 040 §1) : `id String @id
@default(uuid()) @db.Uuid`, `tenantId String @map("tenant_id")` sans
`@db.Uuid`, colonnes `camelCase` mappées en `snake_case`, quantités
`Decimal(16,4)`. Les clés vers `User` sont des `String` sans `@db.Uuid`
(`User.id`, `prisma/schema.prisma:452`). Préfixe des tables :
`stock_whatsapp_*`, `stock_field_captures`, `whatsapp_cloud_events`.

## 2. Changements Prisma exacts

### 2.1 Énumérations

```prisma
enum CapacityKey {
  LOTS
  COPROPRIETES
  CHANTIERS
  BIENS_DETENUS
  ACTIFS
  /// Lot 041 (W11). Photos analysees par l'IA dans le MOIS CIVIL UTC
  /// (consommation, pas stock). Sans facturation de depassement.
  PHOTOS_INVENTAIRE
}

enum StockAlertKind {
  // ... valeurs du lot 040 ...
  /// Lot 041 (W5-R6). Inventaire de chantier clos par WhatsApp : a justifier
  /// et a valider au bureau. INFO, ou WARNING au-dela des seuils d'ecart.
  FIELD_COUNT_CLOSED
}

/// Lot 041. Canal d'ouverture d'un inventaire.
enum StockCountSource {
  WEB
  WHATSAPP
}

enum StockWhatsappRegistrationStatus {
  /// Code d'activation remis, pas encore envoye par le chef.
  PENDING_ACTIVATION
  ACTIVE
  REVOKED
}

enum StockWhatsappSessionState {
  AWAITING_SITE
  ANALYZING
  AWAITING_ITEM
  AWAITING_CONFIRMATION
  /// Ecart E3 : l'article a deja une ligne dans l'inventaire.
  AWAITING_MERGE
  READY
  CLOSED
}

enum StockWhatsappSessionCloseReason {
  FIN
  SITE_CHANGE
  TIMEOUT
  ACCESS_LOST
  REVOKED
  NO_SITE
}

enum StockWhatsappMessageDirection {
  INBOUND
  OUTBOUND
}

enum StockWhatsappMessageKind {
  TEXT
  IMAGE
  BUTTONS
  LIST
  REPLY
  UNSUPPORTED
}

/// Lot 041 (T10). Ce qu'est devenue une photo.
enum StockFieldCaptureOutcome {
  /// Recue, en attente du choix du chantier (W4-R3).
  RECEIVED
  /// Analyse en cours ou proposition en attente de reponse.
  PENDING
  ACCEPTED
  CORRECTED
  CANCELLED
  EXPIRED
  UNREADABLE
  UNRECOGNIZED
  FAILED
}

enum StockVisionQuality {
  OK
  TOO_DARK
  BLURRY
  NOT_STOCK
}

enum StockVisionMethod {
  SACKS_STACKED
  BARS_BUNDLE
  BLOCKS_PALLET
  OTHER
}

enum WhatsappCloudEventKind {
  MESSAGE
  STATUS
  OTHER
}

enum WhatsappCloudEventStatus {
  RECEIVED
  PROCESSING
  PROCESSED
  IGNORED
  FAILED
}

enum WhatsappInboundVia {
  META
  SIMULATOR
}
```

### 2.2 `StockCount` — colonne ajoutée

```prisma
  /// Lot 041 (W5-R2). WHATSAPP : ouvert par le bot. Un inventaire WEB peut
  /// recevoir des lignes par WhatsApp ; il n'est alors jamais clos par le bot.
  source   StockCountSource  @default(WEB)

  fieldCaptures   StockFieldCapture[]
  whatsappSessions StockWhatsappSession[]
```

Index : aucun nouveau (la lecture des comptages terrain passe par les captures).

### 2.3 `StockWhatsappRegistration` — inscription (W3)

```prisma
/// Lot 041 (W3). Lien entre un chef de chantier, son numero WhatsApp et ses
/// chantiers. UN numero = UNE inscription non revoquee sur TOUTE la plateforme
/// (index unique partiel, section 5.2). Le code d'activation n'est stocke qu'en
/// empreinte (hashToken(code + ':' + id)) et efface a l'activation.
model StockWhatsappRegistration {
  id                   String                          @id @default(uuid()) @db.Uuid
  tenantId             String                          @map("tenant_id")
  userId               String                          @map("user_id")
  /// E.164 avec le « + » (normalizePhoneE164). Masque partout sauf a l'inscription.
  phoneE164            String                          @map("phone_e164")
  status               StockWhatsappRegistrationStatus @default(PENDING_ACTIVATION)
  activationCodeHash   String?                         @map("activation_code_hash") @db.Char(64)
  activationExpiresAt  DateTime?                       @map("activation_expires_at")
  activationAttempts   Int                             @default(0) @map("activation_attempts")
  activatedAt          DateTime?                       @map("activated_at")
  createdByUserId      String                          @map("created_by_user_id")
  revokedAt            DateTime?                       @map("revoked_at")
  revokedByUserId      String?                         @map("revoked_by_user_id")
  revokeReason         String?                         @map("revoke_reason")
  lastInboundAt        DateTime?                       @map("last_inbound_at")
  createdAt            DateTime                        @default(now()) @map("created_at")
  updatedAt            DateTime                        @updatedAt @map("updated_at")

  tenant    Tenant                          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User                            @relation("StockWhatsappRegistrationUser", fields: [userId], references: [id], onDelete: Restrict)
  createdBy User                            @relation("StockWhatsappRegistrationCreatedBy", fields: [createdByUserId], references: [id])
  revokedBy User?                           @relation("StockWhatsappRegistrationRevokedBy", fields: [revokedByUserId], references: [id])
  sites     StockWhatsappRegistrationSite[]
  sessions  StockWhatsappSession[]
  messages  StockWhatsappMessage[]
  captures  StockFieldCapture[]

  @@index([tenantId, status])
  @@index([phoneE164])
  @@map("stock_whatsapp_registrations")
}
```

`onDelete: Restrict` sur `user` : un compte ne se supprime pas tant qu'il a une
inscription (les comptes se désactivent, `User.isActive`).

### 2.4 `StockWhatsappRegistrationSite` — chantiers affectés (W3-R5)

```prisma
/// Lot 041 (W3-R5). 1 a 10 chantiers par inscription (borne de la liste Meta).
/// L'eligibilite (ouvert, bascule au stock, lieu actif) est controlee a
/// l'ecriture ET a chaque message : un chantier clos reste affecte mais n'est
/// plus propose (W5-R8).
model StockWhatsappRegistrationSite {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @map("tenant_id")
  registrationId String   @map("registration_id") @db.Uuid
  siteId         String   @map("site_id") @db.Uuid
  createdAt      DateTime @default(now()) @map("created_at")

  tenant       Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  registration StockWhatsappRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)
  site         ConstructionSite          @relation(fields: [siteId], references: [id], onDelete: Cascade)

  @@unique([registrationId, siteId])
  @@index([tenantId, siteId])
  @@map("stock_whatsapp_registration_sites")
}
```

### 2.5 `StockWhatsappSession` — session (W4)

```prisma
/// Lot 041 (W4). Au plus UNE session ouverte (closed_at nul) par inscription
/// (index unique partiel). Les transitions sont des mises a jour
/// conditionnelles sur `state` (W4-R4).
model StockWhatsappSession {
  id               String                           @id @default(uuid()) @db.Uuid
  tenantId         String                           @map("tenant_id")
  registrationId   String                           @map("registration_id") @db.Uuid
  state            StockWhatsappSessionState
  siteId           String?                          @map("site_id") @db.Uuid
  locationId       String?                          @map("location_id") @db.Uuid
  /// Inventaire courant de la session sur ce lieu (W5-R2).
  countId          String?                          @map("count_id") @db.Uuid
  /// Capture en cours (analyse, proposition, fusion).
  pendingCaptureId String?                          @unique @map("pending_capture_id") @db.Uuid
  lastInboundAt    DateTime                         @map("last_inbound_at")
  reminderSentAt   DateTime?                        @map("reminder_sent_at")
  openedAt         DateTime                         @default(now()) @map("opened_at")
  closedAt         DateTime?                        @map("closed_at")
  closeReason      StockWhatsappSessionCloseReason? @map("close_reason")
  /// Ce que la cloture a fait de l'inventaire : COUNTED | LEFT_OPEN | NONE.
  countOutcome     String?                          @map("count_outcome")
  updatedAt        DateTime                         @updatedAt @map("updated_at")

  tenant         Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  registration   StockWhatsappRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)
  site           ConstructionSite?         @relation(fields: [siteId], references: [id], onDelete: SetNull)
  location       StockLocation?            @relation(fields: [locationId], references: [id], onDelete: SetNull)
  count          StockCount?               @relation(fields: [countId], references: [id], onDelete: SetNull)
  pendingCapture StockFieldCapture?        @relation("StockWhatsappSessionPendingCapture", fields: [pendingCaptureId], references: [id], onDelete: SetNull)
  captures       StockFieldCapture[]       @relation("StockFieldCaptureSession")
  messages       StockWhatsappMessage[]

  @@index([tenantId, closedAt])
  @@index([closedAt, lastInboundAt])
  @@map("stock_whatsapp_sessions")
}
```

L'index `(closed_at, last_inbound_at)` sert la tâche (sessions ouvertes dont
l'échéance est passée, lecture transverse W10-R2).

### 2.6 `StockWhatsappMessage` — journal de conversation (T9)

```prisma
/// Lot 041 (T9). Messages entrants et sortants d'une inscription. Texte tronque
/// a 1 000 caracteres. Purge a 180 jours (tache stock-whatsapp-job). Jamais le
/// numero : il est sur l'inscription.
model StockWhatsappMessage {
  id             String                        @id @default(uuid()) @db.Uuid
  tenantId       String                        @map("tenant_id")
  registrationId String                        @map("registration_id") @db.Uuid
  sessionId      String?                       @map("session_id") @db.Uuid
  captureId      String?                       @map("capture_id") @db.Uuid
  direction      StockWhatsappMessageDirection
  kind           StockWhatsappMessageKind
  /// Texte, ou corps d'un message interactif. Tronque a 1 000.
  text           String?                       @db.VarChar(1000)
  /// Boutons ou lignes de liste proposes, ou reponse choisie : { id, title }[].
  interactive    Json?
  /// Identifiant Meta (wamid) ; nul pour le transport log.
  metaMessageId  String?                       @map("meta_message_id")
  via            WhatsappInboundVia?
  sendError      String?                       @map("send_error") @db.VarChar(500)
  createdAt      DateTime                      @default(now()) @map("created_at")

  tenant       Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  registration StockWhatsappRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)
  session      StockWhatsappSession?     @relation(fields: [sessionId], references: [id], onDelete: SetNull)
  capture      StockFieldCapture?        @relation(fields: [captureId], references: [id], onDelete: SetNull)

  @@index([tenantId, registrationId, createdAt])
  @@index([sessionId, createdAt])
  @@index([createdAt])
  @@map("stock_whatsapp_messages")
}
```

### 2.7 `StockFieldCapture` — capture et preuve (T10)

```prisma
/// Lot 041 (T10). Une photo recue, son analyse et ce que le chef en a fait.
/// PREUVE : empreinte SHA-256 du fichier STOCKE (EXIF retire), heure serveur.
/// Le stock theorique n'est JAMAIS recopie ici (il est fige sur la ligne
/// d'inventaire, lot 040). Fichier prive sous uploads/stock-whatsapp/.
model StockFieldCapture {
  id                   String                   @id @default(uuid()) @db.Uuid
  tenantId             String                   @map("tenant_id")
  registrationId       String                   @map("registration_id") @db.Uuid
  sessionId            String                   @map("session_id") @db.Uuid
  /// Le chef (auteur de la photo et de la ligne).
  userId               String                   @map("user_id")
  siteId               String?                  @map("site_id") @db.Uuid
  locationId           String?                  @map("location_id") @db.Uuid
  countId              String?                  @map("count_id") @db.Uuid
  countLineId          String?                  @map("count_line_id") @db.Uuid
  /// Article retenu (propose par l'IA, impose par le chef, ou nul).
  itemId               String?                  @map("item_id") @db.Uuid
  itemImposed          Boolean                  @default(false) @map("item_imposed")
  outcome              StockFieldCaptureOutcome @default(RECEIVED)
  via                  WhatsappInboundVia
  metaMessageId        String?                  @map("meta_message_id")
  // --- Fichier ---
  /// `/uploads/stock-whatsapp/<tenantId>/<aaaa>/<uuid>.<ext>`. Nul apres retrait.
  fileUrl              String?                  @map("file_url")
  mimeType             String                   @map("mime_type")
  sizeBytes            Int                      @map("size_bytes")
  sha256               String                   @db.Char(64)
  /// Empreinte annoncee par Meta (fichier recu, avant retrait de l'EXIF).
  providerSha256       String?                  @map("provider_sha256")
  receivedAt           DateTime                 @default(now()) @map("received_at")
  // --- Analyse ---
  visionProvider       String?                  @map("vision_provider")
  visionModel          String?                  @map("vision_model")
  analyzedAt           DateTime?                @map("analyzed_at")
  analysisMs           Int?                     @map("analysis_ms")
  quality              StockVisionQuality?
  method               StockVisionMethod?
  proposedTotal        Decimal?                 @map("proposed_total") @db.Decimal(16, 4)
  confidence           Decimal?                 @db.Decimal(4, 3)
  /// Sortie validee complete (stockVisionResultSchema), jamais la reponse brute.
  analysis             Json?
  /// TIMEOUT | PROVIDER_ERROR | INVALID_OUTPUT | DISABLED.
  failureReason        String?                  @map("failure_reason")
  /// Vrai si une photo analysee a ete decomptee du quota (W11-R3).
  quotaCounted         Boolean                  @default(false) @map("quota_counted")
  // --- Reponse du chef ---
  confirmedQuantity    Decimal?                 @map("confirmed_quantity") @db.Decimal(16, 4)
  /// Quantite ecrite sur la ligne (differente de confirmedQuantity apres une addition, W5-R4).
  lineQuantityAfter    Decimal?                 @map("line_quantity_after") @db.Decimal(16, 4)
  /// ADD | REPLACE apres AWAITING_MERGE, nul sinon.
  mergeMode            String?                  @map("merge_mode")
  confirmedAt          DateTime?                @map("confirmed_at")
  // --- Retrait de la photo (W14-R5) ---
  photoRemovedAt       DateTime?                @map("photo_removed_at")
  photoRemovedByUserId String?                  @map("photo_removed_by_user_id")
  photoRemovalReason   String?                  @map("photo_removal_reason")
  updatedAt            DateTime                 @updatedAt @map("updated_at")

  tenant         Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  registration   StockWhatsappRegistration @relation(fields: [registrationId], references: [id], onDelete: Restrict)
  session        StockWhatsappSession      @relation("StockFieldCaptureSession", fields: [sessionId], references: [id], onDelete: Restrict)
  user           User                      @relation("StockFieldCaptureUser", fields: [userId], references: [id])
  site           ConstructionSite?         @relation(fields: [siteId], references: [id], onDelete: Restrict)
  location       StockLocation?            @relation(fields: [locationId], references: [id], onDelete: Restrict)
  count          StockCount?               @relation(fields: [countId], references: [id], onDelete: Restrict)
  countLine      StockCountLine?           @relation(fields: [countLineId], references: [id], onDelete: SetNull)
  item           StockItem?                @relation(fields: [itemId], references: [id], onDelete: Restrict)
  photoRemovedBy User?                     @relation("StockFieldCapturePhotoRemovedBy", fields: [photoRemovedByUserId], references: [id])
  pendingFor     StockWhatsappSession?     @relation("StockWhatsappSessionPendingCapture")
  messages       StockWhatsappMessage[]

  @@index([tenantId, locationId, confirmedAt(sort: Desc)])
  @@index([tenantId, countId])
  @@index([countLineId])
  @@index([tenantId, outcome, receivedAt])
  @@map("stock_field_captures")
}
```

`countLine` en `SetNull` : une ligne d'inventaire supprimée en `DRAFT` (lot 040,
`DELETE …/lines/{itemId}`) ne doit pas être bloquée par sa capture ; la capture
garde `countId`, `itemId` et sa preuve. Une ligne remplacée par une seconde
saisie garde le même identifiant (`@@unique([countId, itemId])`, upsert du lot 040) : plusieurs captures peuvent pointer la même ligne, la plus récente
`confirmedAt` est celle qui a fixé la quantité.

### 2.8 `StockWhatsappUsage` — compteur mensuel (W11-R3)

```prisma
/// Lot 041 (W11-R3). Photos analysees par agence et par mois civil UTC.
/// Incrementee par UPDATE ... WHERE used < quota RETURNING (jamais lue puis
/// reecrite). Rendue (used - 1) si l'IA echoue.
model StockWhatsappUsage {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @map("tenant_id")
  /// « AAAA-MM ».
  month          String   @db.Char(7)
  used           Int      @default(0)
  quotaReachedAt DateTime? @map("quota_reached_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, month])
  @@map("stock_whatsapp_usages")
}
```

### 2.9 `WhatsappCloudEvent` — journal du webhook (global, W6-R8)

```prisma
/// Lot 041 (W6-R7, W6-R8). Evenement recu du webhook Meta. MODELE GLOBAL : a
/// la reception, l'agence n'est pas connue (elle se deduit de l'inscription).
/// Ne porte JAMAIS durablement le numero d'un expediteur : `senderHash` est un
/// HMAC-SHA256 (cle META_WA_APP_SECRET) du numero E.164 ; `payload` (copie du
/// message) est efface des le traitement et au plus tard apres 1 heure.
/// Purge a 30 jours.
model WhatsappCloudEvent {
  id                 String                   @id @default(uuid()) @db.Uuid
  kind               WhatsappCloudEventKind
  status             WhatsappCloudEventStatus @default(RECEIVED)
  /// wamid du message (MESSAGE) ou du message vise (STATUS). Unique pour MESSAGE
  /// (index unique partiel, section 5.2) : un renvoi de Meta n'est pas retraite.
  metaMessageId      String?                  @map("meta_message_id")
  senderHash         String?                  @map("sender_hash") @db.Char(64)
  messageType        String?                  @map("message_type") @db.VarChar(40)
  /// STATUS : sent | delivered | read | failed.
  deliveryStatus     String?                  @map("delivery_status") @db.VarChar(20)
  payload            Json?
  via                WhatsappInboundVia       @default(META)
  receivedAt         DateTime                 @default(now()) @map("received_at")
  claimedAt          DateTime?                @map("claimed_at")
  processedAt        DateTime?                @map("processed_at")
  attempts           Int                      @default(0)
  /// Reponse M01 envoyee a cet expediteur inconnu (W7-R1).
  unknownReplySentAt DateTime?                @map("unknown_reply_sent_at")
  error              String?                  @db.VarChar(500)

  @@index([status, receivedAt])
  @@index([senderHash, unknownReplySentAt])
  @@index([receivedAt])
  @@map("whatsapp_cloud_events")
}
```

Pas de `tenantId` : classé dans `GLOBAL_MODELS`
(`__tests__/unit/schema-tenant-coverage.test.ts:61`) avec ce commentaire :
« Lot 041 : événement du webhook WhatsApp Cloud, reçu avant que l'agence soit
connue ; aucune donnée d'agence durable (empreinte d'expéditeur, copie du
message effacée au traitement) ». À ajouter aussi à `EXCLUDED_MODELS` de
l'export s'il y figure par défaut (§6).

### 2.10 Relations inverses à ajouter

| Modèle             | Champs                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tenant`           | `stockWhatsappRegistrations`, `stockWhatsappRegistrationSites`, `stockWhatsappSessions`, `stockWhatsappMessages`, `stockFieldCaptures`, `stockWhatsappUsages`                                                                                                                                                                                |
| `User`             | `stockWhatsappRegistrations` (`StockWhatsappRegistrationUser`), `stockWhatsappRegistrationsCreated` (`StockWhatsappRegistrationCreatedBy`), `stockWhatsappRegistrationsRevoked` (`StockWhatsappRegistrationRevokedBy`), `stockFieldCaptures` (`StockFieldCaptureUser`), `stockFieldCapturePhotosRemoved` (`StockFieldCapturePhotoRemovedBy`) |
| `ConstructionSite` | `stockWhatsappRegistrationSites`, `stockWhatsappSessions`, `stockFieldCaptures`                                                                                                                                                                                                                                                              |
| `StockLocation`    | `whatsappSessions`, `fieldCaptures`                                                                                                                                                                                                                                                                                                          |
| `StockCount`       | `fieldCaptures`, `whatsappSessions` (§2.2)                                                                                                                                                                                                                                                                                                   |
| `StockCountLine`   | `fieldCaptures StockFieldCapture[]`                                                                                                                                                                                                                                                                                                          |
| `StockItem`        | `fieldCaptures StockFieldCapture[]`                                                                                                                                                                                                                                                                                                          |

Toute lecture d'une relation `User` passe par `select: { fullName: true,
email: true }` ; jamais `include: { user: true }` (AGENTS.md).

## 3. Rôle et permissions

Le rôle n'ajoute **aucune permission** : il porte seulement `STOCK_COUNT` du
lot 040 (pas `STOCK_VIEW` : aveugle strict, décision du Pilote du 04/10, spec W2-R1).

**Seed** : `prisma/seeds/site-manager-role-seed.ts` (nouveau), appelé par
`prisma/seeds/rbac-seed.ts` juste après le seed du stock du lot 040 (lui-même
après `seedFinancePermissions`, `:127`) et avant l'attribution au super-admin
(`:134`). Crée `TENANT_SITE_MANAGER` (`name: 'Tenant Site Manager'`,
`scope: TENANT`) et son unique droit `STOCK_COUNT`.

**Migration de données** `<horodatage>_inventaire_whatsapp_role/migration.sql`,
additive et idempotente, sur le modèle de
`prisma/migrations/20261006130000_syndic_permissions/migration.sql` :

```sql
-- Migration de DONNEES (spec 041, W2) : role Chef de chantier.
-- Additive et idempotente. Equivalent de prisma/seeds/site-manager-role-seed.ts.
-- Suppose les permissions STOCK_* du lot 040 deja presentes.

INSERT INTO "roles" ("id", "key", "name", "description", "scope", "created_at", "updated_at")
VALUES (
  gen_random_uuid()::text, 'TENANT_SITE_MANAGER', 'Tenant Site Manager',
  'Chef de chantier : compte le stock de ses chantiers, notamment par WhatsApp, sans valider ni acceder aux valeurs',
  'TENANT', NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" = 'STOCK_COUNT'
WHERE r."key" = 'TENANT_SITE_MANAGER'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "permissions" WHERE "key" = 'STOCK_COUNT') <> 1 THEN
    RAISE EXCEPTION 'Spec 041 : permission STOCK_COUNT absente (migration du lot 040 non appliquee).';
  END IF;
END $$;
```

À vérifier à l'écriture : mêmes noms de colonnes et de contraintes que la
migration syndic (data-model 040 §3.3 fait la même remarque).

## 4. Catalogue

`src/lib/subscription/catalog.ts` :

- `CapacityKeyCode` et `CAPACITY_KEYS` reçoivent `PHOTOS_INVENTAIRE`.
- `EXTENSION.INVENTAIRE_WHATSAPP = 'EXT_INVENTAIRE_WHATSAPP'`.
- `DEFAULT_CATALOG` reçoit :

```ts
{
  code: EXTENSION.INVENTAIRE_WHATSAPP,
  kind: 'EXTENSION',
  name: 'Inventaire WhatsApp — bloc de 500 photos',
  description: 'Comptage du stock de chantier par photo WhatsApp et IA : 500 photos analysées par mois',
  monthlyPrice: 25_000,
  setupPrice: 0,
  modules: [],
  exclusiveGroup: null,
  rules: { requiresAnyOf: [PACK.PROMOTEUR, PACK.INTEGRE] },
  isSellable: true,
  sortOrder: 150,
  capacities: { PHOTOS_INVENTAIRE: 500 }
}
```

Effets de bord à traiter dans le même changement (le compilateur les signale,
`Record<CapacityKeyCode, …>`) :

| Fichier                                             | Changement                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/subscription-v2-service.ts:231-237`   | `usageProviders.PHOTOS_INVENTAIRE` = photos du mois civil UTC courant (`StockWhatsappUsage.used`, 0 sans ligne).                                                                                                                                                                                 |
| `src/services/subscription-v2-service.ts:1520-1525` | **Inchangé** : pas d'entrée dans `extensionCodes` (aucun dépassement facturé). Commentaire ajouté.                                                                                                                                                                                               |
| `src/jobs/subscription-usage-job.ts:63-75`          | `CAPACITY_LABELS.PHOTOS_INVENTAIRE = 'photos analysées'` ; `isActifsWithoutCap` devient `isOptionalCapacityWithoutCap` pour `ACTIFS` et `PHOTOS_INVENTAIRE`.                                                                                                                                     |
| Web (`apps/web/src/`)                               | `services/subscription-v2-service.ts:16`, `pages/tenant/TenantSubscriptionSettings.tsx:45`, `components/admin/tenant-detail/SubscriptionTab.tsx:78, 291`, `utils/subscription-denial-notice.ts:65`, `components/admin/CreateTenantDrawer.tsx:155` : type et libellé « Photos analysées (mois) ». |

## 5. Migrations

Dernière migration à la rédaction : `20261007150100_secure_link_scope_installment_payment`
(plus celles du lot 040, horodatées `20261008…`). **L'agent des fondations relit
`prisma/migrations/` au moment d'écrire** et horodate après la dernière
présente. Quatre migrations, dans cet ordre :

| #   | Nom indicatif                        | Contenu                                                                                                                                                  | Pourquoi séparée                                                                                                                                          |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `<ts>_inventaire_whatsapp_enums`     | `ALTER TYPE "CapacityKey" ADD VALUE IF NOT EXISTS 'PHOTOS_INVENTAIRE';` `ALTER TYPE "StockAlertKind" ADD VALUE IF NOT EXISTS 'FIELD_COUNT_CLOSED';`      | Une valeur ajoutée ne sert pas dans sa transaction (précédent `20261001101500_patrimoine_pack_enums`).                                                    |
| 2   | `<ts>_inventaire_whatsapp`           | `CREATE TYPE` des enums neufs, colonne `stock_counts.source` (défaut `WEB`, sans réécriture), sept tables, clés étrangères, index ; puis le SQL du §5.2. | Générée **sans base** par `prisma migrate diff` (même méthode que plan 040 §3.2) ; `ALTER TYPE … ADD VALUE` produits par le diff déplacés en migration 1. |
| 3   | `<ts>_inventaire_whatsapp_catalogue` | Ligne `EXT_INVENTAIRE_WHATSAPP` et sa capacité (§5.1).                                                                                                   | Utilise `PHOTOS_INVENTAIRE` (migration 1 validée).                                                                                                        |
| 4   | `<ts>_inventaire_whatsapp_role`      | §3.                                                                                                                                                      | Migration de données.                                                                                                                                     |

### 5.1 Amorçage du catalogue

```sql
-- Lot 041 (W-D6) : option Inventaire WhatsApp. Idempotent : un prix deja
-- modifie par le super-admin n'est pas ecrase.
INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'EXT_INVENTAIRE_WHATSAPP', 'EXTENSION', 'Inventaire WhatsApp — bloc de 500 photos',
        'Comptage du stock de chantier par photo WhatsApp et IA : 500 photos analysées par mois',
        25000, 0, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["PROMOTEUR","INTEGRE"]}'::jsonb, true, 150, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'PHOTOS_INVENTAIRE', 500 FROM "catalog_items" WHERE "code" = 'EXT_INVENTAIRE_WHATSAPP'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;
```

Forme recopiée de `prisma/migrations/20261001101600_patrimoine_pack_catalogue/migration.sql`.

### 5.2 Contraintes ajoutées à la main (fin de la migration 2)

```sql
-- W3-R4 : un numero, une inscription non revoquee, sur toute la plateforme.
CREATE UNIQUE INDEX "stock_whatsapp_registrations_one_live_phone"
  ON "stock_whatsapp_registrations" ("phone_e164")
  WHERE "status" <> 'REVOKED';

-- W3-R4 : un membre, une inscription non revoquee dans l'agence.
CREATE UNIQUE INDEX "stock_whatsapp_registrations_one_live_member"
  ON "stock_whatsapp_registrations" ("tenant_id", "user_id")
  WHERE "status" <> 'REVOKED';

-- W3-R6 : un code en attente porte son empreinte et son echeance.
ALTER TABLE "stock_whatsapp_registrations" ADD CONSTRAINT "stock_whatsapp_registrations_pending_has_code"
  CHECK ("status" <> 'PENDING_ACTIVATION' OR ("activation_code_hash" IS NOT NULL AND "activation_expires_at" IS NOT NULL));

-- W3-R6 : le format E.164.
ALTER TABLE "stock_whatsapp_registrations" ADD CONSTRAINT "stock_whatsapp_registrations_phone_e164"
  CHECK ("phone_e164" ~ '^\+[0-9]{8,15}$');

-- W4-R1 : une session ouverte par inscription.
CREATE UNIQUE INDEX "stock_whatsapp_sessions_one_open"
  ON "stock_whatsapp_sessions" ("registration_id")
  WHERE "closed_at" IS NULL;

-- W6-R7 : un message Meta n'est traite qu'une fois.
CREATE UNIQUE INDEX "whatsapp_cloud_events_one_message"
  ON "whatsapp_cloud_events" ("meta_message_id")
  WHERE "kind" = 'MESSAGE';

-- W11-R3 : le compteur ne descend jamais sous zero.
ALTER TABLE "stock_whatsapp_usages" ADD CONSTRAINT "stock_whatsapp_usages_used_non_negative"
  CHECK ("used" >= 0);

-- W14-R5 : une photo retiree n'a plus de fichier, mais garde son empreinte.
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_removed_has_no_file"
  CHECK ("photo_removed_at" IS NULL OR "file_url" IS NULL);
```

À documenter en commentaire au-dessus des modèles concernés (comme le lot 040).

### 5.3 Retour arrière

Mêmes règles que le lot 040 (data-model 040 §5.3) : `ALTER TYPE … ADD VALUE`
est irréversible ; le retour arrière est un correctif en avant. Avant toute
écriture d'une valeur nouvelle, un retour du code seul reste possible (tables
neuves, colonne avec défaut). Couper la fonction sans redéployer :
`WHATSAPP_INVENTORY_TRANSPORT=disabled` (webhook en `404`, tâche arrêtée).

## 6. Isolation et export d'agence

| Modèle                          | `schema-tenant-coverage`     | Export d'agence (`model-registry.ts`)                                                                               |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `StockWhatsappRegistration`     | cloisonné                    | exporté ; `activationCodeHash` retiré par la règle de nom (`sensitive-fields.ts:16`, « hash »)                      |
| `StockWhatsappRegistrationSite` | cloisonné                    | exporté                                                                                                             |
| `StockWhatsappSession`          | cloisonné                    | exporté                                                                                                             |
| `StockWhatsappMessage`          | cloisonné                    | exporté (conversations de l'agence, 180 jours au plus)                                                              |
| `StockFieldCapture`             | cloisonné                    | exporté ; fichiers par la règle de dossier ci-dessous                                                               |
| `StockWhatsappUsage`            | cloisonné                    | exporté                                                                                                             |
| `WhatsappCloudEvent`            | **global** (`GLOBAL_MODELS`) | sans objet (pas de `tenantId`) ; si le registre liste les modèles globaux, `EXCLUDED_MODELS` avec la raison du §2.9 |

`UPLOAD_FOLDER_RULES` (`src/services/tenant-data-export/file-references.ts:79-90`)
reçoit `{ prefix: ['stock-whatsapp'], owner: 'tenant' }`, à placer **avant**
toute règle plus courte qui commencerait par `stock` (lot 040 ajoute
`['stock']` : préfixe de segment différent, aucun recouvrement, mais l'ordre
est documenté). Le test d'archive vérifie qu'une capture sous
`uploads/stock-whatsapp/<tenantId>/…` entre dans l'archive.

## 7. Variables d'environnement (`src/config/env.ts`, `env.example`)

| Variable                           | Type et défaut                                                      | Règle (`superRefine`)                                                               |
| ---------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `WHATSAPP_INVENTORY_TRANSPORT`     | `disabled` \| `log` \| `meta`, défaut `disabled`                    | `log` en production exige `WHATSAPP_INVENTORY_SIMULATOR=1`                          |
| `WHATSAPP_INVENTORY_SIMULATOR`     | `0` \| `1`, défaut `0`                                              | refusé par `deploy.sh` sur la production                                            |
| `META_WA_APP_SECRET`               | secret, facultatif                                                  | requis si `meta` ; 32 caractères au moins                                           |
| `META_WA_VERIFY_TOKEN`             | secret, facultatif                                                  | requis si `meta` ; 32 caractères au moins                                           |
| `META_WA_ACCESS_TOKEN`             | secret, facultatif                                                  | requis si `meta`                                                                    |
| `META_WA_PHONE_NUMBER_ID`          | chaîne de chiffres, facultatif                                      | requis si `meta`                                                                    |
| `META_WA_GRAPH_BASE_URL`           | URL, défaut `https://graph.facebook.com`                            | —                                                                                   |
| `META_WA_GRAPH_VERSION`            | `v\d+\.\d+`, défaut `v23.0` [à vérifier au déploiement]             | —                                                                                   |
| `META_WA_MEDIA_HOSTS`              | liste séparée par des virgules, défaut `lookaside.fbsbx.com`        | noms d'hôte seuls, sans schéma                                                      |
| `WHATSAPP_INVENTORY_PUBLIC_NUMBER` | E.164, facultatif                                                   | affiché à l'écran d'inscription                                                     |
| `WHATSAPP_INVENTORY_WARN_QUOTA`    | entier 0 à 100 000, défaut 500                                      | —                                                                                   |
| `STOCK_VISION_PROVIDER`            | `disabled` \| `fake` \| `gemini` \| `openrouter`, défaut `disabled` | `fake` seulement en `development` / `test` ou avec `WHATSAPP_INVENTORY_SIMULATOR=1` |
| `STOCK_VISION_MODEL`               | chaîne, défaut `gemini-2.5-flash` [à vérifier]                      | contient `/` si `openrouter`                                                        |
| `GEMINI_API_KEY`                   | secret, facultatif                                                  | requis si `gemini`                                                                  |
| `STOCK_VISION_TIMEOUT_MS`          | entier 2 000 à 60 000, défaut 20 000                                | —                                                                                   |

## 8. Purges et volumétrie

| Donnée                       | Durée                          | Par                                            |
| ---------------------------- | ------------------------------ | ---------------------------------------------- |
| `WhatsappCloudEvent.payload` | effacé au traitement, ≤ 1 h    | moteur ; tâche (chaque minute)                 |
| `WhatsappCloudEvent`         | 30 jours                       | tâche, 3 h 30 UTC, par lots de 5 000           |
| `StockWhatsappMessage`       | 180 jours                      | tâche, 3 h 30 UTC, par lots de 5 000           |
| `StockFieldCapture` et photo | comme les pièces du stock      | aucune purge automatique (preuve d'inventaire) |
| `StockWhatsappSession`       | conservée                      | rattache les captures                          |
| `StockWhatsappUsage`         | conservé (historique du quota) | —                                              |

Volumétrie d'ordre : 500 photos par bloc et par mois, environ 8 messages par
photo (entrants et sortants), soit 4 000 lignes de messages par bloc et par
mois ; photos de 100 à 400 Ko (déjà compressées par WhatsApp), soit au plus
200 Mo par bloc et par mois sur le disque privé.
