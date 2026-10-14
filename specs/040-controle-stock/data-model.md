# Modèle de données — 040 Contrôle du stock de chantier

**Spécification** : [spec.md](spec.md) · **Contrat** : [contracts/openapi.yaml](contracts/openapi.yaml)
**Date** : 04/10/2026 · **Statut** : révision 2 (après critique adverse)
Références `fichier:ligne` relatives à `packages/api/`, vérifiées sur `e72e960a`.

## 1. Vue d'ensemble

| Nature                      | Objet                                                                                                                                                                                       | Exigences                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Valeurs d'enum ajoutées     | `StockMovementType` (+2), `StockCountStatus` (+2), `SourceType` (+2)                                                                                                                        | A2, A6                     |
| Enums neufs                 | `StockCountKind`, `StockReasonCode`, `StockValuationSource`, `StockSlipKind`, `StockAttachmentTarget`, `StockAttachmentPurpose`, `StockAlertKind`, `StockAlertSeverity`, `StockAlertStatus` | A2, A4, A7, A8, B4, B5, B7 |
| Colonnes ajoutées           | `StockSettings`, `StockMovement`, `StockCount`, `StockCountLine`                                                                                                                            | A1 à A11, B2, B4, B8       |
| Colonne assouplie           | `StockCountLine.countedQuantity` devient facultative (ligne non comptée, A2-R8)                                                                                                             | A2                         |
| Tables neuves               | `StockTaker`, `StockSlip`, `StockAttachment`, `StockAlert`, `StockClientRequest`                                                                                                            | B2, B3, B4, B5, B7         |
| Contraintes SQL hors Prisma | index uniques partiels, `CHECK`                                                                                                                                                             | A2, A6, A7, B2, B5         |
| Données                     | 10 permissions, rôle `TENANT_STOREKEEPER`, report des droits `FINANCE_*`                                                                                                                    | B1                         |

Conventions reprises du lot 5 (`prisma/schema.prisma:7500-7797`) : identifiant
`String @id @default(uuid()) @db.Uuid`, `tenantId String @map("tenant_id")`
(sans `@db.Uuid`, comme tous les modèles du stock), colonnes `camelCase` mappées
en `snake_case`, quantités `Decimal(16,4)`, montants `Decimal(16,2)`, devise
`XOF`. **Toute table neuve porte `tenantId`** : elle tombe dans la catégorie
« cloisonné » de `__tests__/unit/schema-tenant-coverage.test.ts` et sous la garde
Prisma (`prisma-tenant-guard-extension.ts`) sans rien ajouter aux listes.
`StockCountLine` reste un enfant de `StockCount` (`__tests__/unit/schema-tenant-coverage.test.ts:171`).

## 2. Changements Prisma exacts

### 2.1 Énumérations

```prisma
enum StockMovementType {
  RECEIPT
  ISSUE
  TRANSFER
  ADJUSTMENT
  /// Lot 040 (A6). Retour au fournisseur d'une marchandise reçue sur une
  /// facture validée. Diminue le stock ; credite le 311 au cout moyen du lieu,
  /// debite le 401 au cout de reception de la facture (data-model §4).
  SUPPLIER_RETURN
  /// Lot 040 (A6). Matiere detruite ou inutilisable. Diminue le stock ;
  /// 603 contre 311 ; jamais imputee a un chantier.
  SCRAP
}

enum StockCountStatus {
  /// Comptage en cours. A L'AVEUGLE : ni attendu ni ecart ne sortent de l'API.
  DRAFT
  /// Lot 040 (A2). Comptage clos : quantites figees, ecarts reveles, a justifier.
  COUNTED
  VALIDATED
  /// Lot 040 (A2-R6). Abandonne en brouillon. Jamais apres la cloture.
  CANCELLED
}

/// Lot 040 (A7). Nature d'un inventaire.
enum StockCountKind {
  REGULAR
  /// Inventaire d'ouverture d'un lieu : un surplus entre a valeur nulle.
  OPENING
  /// Inventaire de cloture d'un chantier : leve le bloqueur de stock residuel.
  CLOSING
}

/// Lot 040 (A4, A6, A11). Liste FERMEE des motifs. L'applicabilite par contexte
/// (inventaire, rebut, retour, transfert) est portee par les schemas Zod, voir
/// spec.md §4. Aucune valeur ne qualifie une intention : c'est l'humain qui
/// qualifie un ecart (decision D2).
enum StockReasonCode {
  BREAKAGE
  DETERIORATION
  COUNTING_ERROR
  ENTRY_ERROR
  UNIT_CONFUSION
  UNRECORDED_ISSUE
  UNRECORDED_RECEIPT
  UNEXPLAINED_DISAPPEARANCE
  OPENING_BALANCE
  NON_CONFORMING
  DAMAGED_ON_DELIVERY
  EXCESS_DELIVERY
  SITE_SUPPLY
  RETURN_TO_WAREHOUSE
  SITE_EVACUATION
  REBALANCING
  OTHER
}

/// Lot 040 (A8-R3). D'ou vient le prix d'une ligne recue.
enum StockValuationSource {
  DECLARED
  INVOICE_LINE
  AVERAGE_COST
  LAST_RECEIPT
  NONE
}

/// Lot 040 (B4). Prefixes imprimes : BR, BS, PVI.
enum StockSlipKind {
  RECEIPT
  ISSUE
  COUNT_REPORT
}

enum StockAttachmentTarget {
  MOVEMENT
  SLIP
  COUNT_LINE
}

enum StockAttachmentPurpose {
  GOODS_PHOTO
  DELIVERY_NOTE
  SIGNED_SLIP
  OTHER
}

enum StockAlertKind {
  COUNT_VARIANCE
  /// Revision 2 (A2-R7, A2-R8) : inventaire valide avec lignes ecartees ou non comptees.
  COUNT_LINE_SET_ASIDE
  /// Revision 2 (A2-R6) : abandon d'un inventaire qui avait au moins une ligne.
  COUNT_CANCELLED
  LARGE_ISSUE
  LARGE_SCRAP
  RECEIPT_REPEATED
  RECEIPT_OVER_INVOICE
  RECEIPT_UNVALUED
  CASH_MATERIAL_PURCHASE
  COUNT_SELF_VALIDATED
}

enum StockAlertSeverity {
  INFO
  WARNING
}

enum StockAlertStatus {
  OPEN
  ACKNOWLEDGED
}
```

`SourceType` (`prisma/schema.prisma:3797-3852`) reçoit, après `STOCK_ADJUSTMENT` :

```prisma
  // Lot 040 : retour fournisseur et rebut. Sans elles, l'ecriture tomberait
  // sur MANUAL (accounting.ts:70-115) et le grand livre deviendrait illisible.
  STOCK_SUPPLIER_RETURN
  STOCK_SCRAP
```

et `SOURCE_TYPE_BY_DOCUMENT` (`src/lib/finance/accounting.ts:95-97`) les deux
entrées correspondantes. `CostAllocationSourceType` ne change pas : ni le rebut
ni le retour n'imputent un chantier.

### 2.2 `StockSettings` — réglages de contrôle

Ajouts à `model StockSettings` (`prisma/schema.prisma:7564-7579`). La ligne est
créée paresseusement par `ensureStockSettingsTx` (`src/lib/finance/stock-referentiel.ts:405`) ;
les défauts SQL s'appliquent aux lignes existantes et futures. Les lecteurs du
stock passent par `ensureStockSettingsTx` ; **l'alerte de caisse (A9) non** :
elle lit par `findUnique` et applique en mémoire les mêmes défauts, exportés
par une constante unique (`STOCK_CONTROLS_DEFAULTS`, `stock-controles.ts`), pour
ne jamais créer de ligne — et risquer un conflit d'unicité concurrent — dans la
transaction d'une pièce de caisse.

```prisma
  /// Lot 040 (A5-R4). Anteriorite maximale d'une date de mouvement, en jours.
  backdatingLimitDays       Int       @default(7) @map("backdating_limit_days")
  /// Lot 040 (B2-R3). Vrai : une sortie ou un transfert exige un preneur du carnet.
  requireTaker              Boolean   @default(false) @map("require_taker")
  /// Lot 040 (B7). Seuils d'alerte. Nul = nature desactivee. Defauts = hypotheses.
  issueAlertAmount          Decimal?  @default(500000) @map("issue_alert_amount") @db.Decimal(16, 2)
  countVarianceAlertAmount  Decimal?  @default(100000) @map("count_variance_alert_amount") @db.Decimal(16, 2)
  countVarianceAlertPercent Decimal?  @default(5) @map("count_variance_alert_percent") @db.Decimal(5, 2)
  cashMaterialAlertAmount   Decimal?  @default(100000) @map("cash_material_alert_amount") @db.Decimal(16, 2)
  /// Lot 040 (A9-R1). Postes « materiaux ». Vide : deduits des postes proposes
  /// par les articles actifs. Chaque identifiant est verifie (assertBelongsToTenant).
  materialCostCategoryIds   String[]  @default([]) @map("material_cost_category_ids") @db.Uuid
  controlsUpdatedAt         DateTime? @map("controls_updated_at")
  controlsUpdatedByUserId   String?   @map("controls_updated_by_user_id")
```

Bornes applicatives (Zod) : `backdatingLimitDays` 0 à 365 ; montants ≥ 0 ;
pourcentage 0 à 100.

### 2.3 `StockMovement` — mouvement enrichi

Ajouts à `model StockMovement` (`prisma/schema.prisma:7678-7747`) :

```prisma
  /// Lot 040 (A4, A6, A11). Motif type. Obligatoire pour SUPPLIER_RETURN, SCRAP
  /// (contrainte CHECK, §5), TRANSFER (les deux moities, controle applicatif) et
  /// pour un ADJUSTMENT ecrit apres ce lot (sauf ligne d'avant le lot, A4-R5).
  /// `reason` (existant) porte la precision libre.
  reasonCode            StockReasonCode?      @map("reason_code")
  /// Lot 040 (B2). Le preneur du carnet. `requestedBy` (existant) recoit un
  /// INSTANTANE de son libelle : renommer le preneur ne reecrit pas l'histoire.
  takerId               String?               @map("taker_id") @db.Uuid
  /// Lot 040 (B4). Le bon qui porte ce mouvement (reception, sortie).
  slipId                String?               @map("slip_id") @db.Uuid
  /// Lot 040 (A8-R3). Reception seulement.
  valuationSource       StockValuationSource? @map("valuation_source")
  /// Lot 040 (A8-R3, A6-R3 bis). Ligne de facture d'ou vient le prix : prix
  /// d'entree d'une reception, prix fournisseur d'un retour.
  supplierInvoiceLineId String?               @map("supplier_invoice_line_id") @db.Uuid
  /// Lot 040 (A6). Retour fournisseur : valeur portee au 401, au prix
  /// fournisseur (ligne de facture, ou cout de reception si toutes les
  /// receptions de l'article sur la facture ont un prix DECLARED/INVOICE_LINE).
  /// `totalValue` reste la valeur sortie du 311.
  supplierCreditValue   Decimal?              @map("supplier_credit_value") @db.Decimal(16, 2)

  taker               StockTaker?          @relation(fields: [takerId], references: [id], onDelete: Restrict)
  slip                StockSlip?           @relation(fields: [slipId], references: [id], onDelete: Restrict)
  supplierInvoiceLine SupplierInvoiceLine? @relation("StockReceiptInvoiceLine", fields: [supplierInvoiceLineId], references: [id], onDelete: SetNull)
  attachments         StockAttachment[]

  // Journal pagine (A5-R1) et filtres (A5-R2).
  @@index([tenantId, movementDate(sort: Desc), createdAt(sort: Desc), id(sort: Desc)])
  @@index([tenantId, type, movementDate])
  @@index([tenantId, createdByUserId])
  @@index([tenantId, takerId])
  // Cumul recu / retourne par facture (A6-R1, A8-R2).
  @@index([supplierInvoiceId])
  @@index([slipId])
```

`supplierInvoiceId` (existant, `:7720`) porte aussi la facture d'un
`SUPPLIER_RETURN`. Le délai de saisie (`entryLagDays`) se **calcule** à partir de
`createdAt` et `movementDate` ; il n'est pas stocké.

### 2.4 `StockCount` et `StockCountLine`

Ajouts à `model StockCount` (`prisma/schema.prisma:7750-7772`) :

```prisma
  kind                 StockCountKind @default(REGULAR)
  /// A2-R4. Cloture du comptage (DRAFT -> COUNTED).
  closedAt             DateTime?      @map("closed_at")
  closedByUserId       String?        @map("closed_by_user_id")
  /// A2-R6.
  cancelledAt          DateTime?      @map("cancelled_at")
  cancelledByUserId    String?        @map("cancelled_by_user_id")
  cancelReason         String?        @map("cancel_reason")
  /// A1-R3. Derogation du validateur unique.
  selfValidated        Boolean        @default(false) @map("self_validated")
  selfValidationReason String?        @map("self_validation_reason")
  /// A1-R1 (revision 2). Toutes les personnes qui ont saisi au moins une ligne,
  /// meme remplacee, retiree ou ecartee ensuite. Alimente a chaque saisie,
  /// jamais diminue. Vide pour un inventaire d'avant le lot (le createur fait
  /// alors office de compteur, sans ecriture en base).
  counterUserIds       String[]       @default([]) @map("counter_user_ids")
  /// Valeurs FIGEES a la validation (B8). Nulles avant le lot 040 et tant que
  /// l'inventaire n'est pas valide. Remplacent la valeur d'ecart recalculee au
  /// cout moyen courant (stock-inventaire.ts:473-478) pour un inventaire valide.
  countedValue         Decimal?       @map("counted_value") @db.Decimal(16, 2)
  varianceValueGross   Decimal?       @map("variance_value_gross") @db.Decimal(16, 2)
  varianceValueNet     Decimal?       @map("variance_value_net") @db.Decimal(16, 2)
  /// A2-R7 (revision 2). Somme des |ecart| valorises des lignes ECARTEES (lignes
  /// non comptees exclues : leur ecart est inconnu), au cout moyen du lieu a la
  /// validation. Entre dans COUNT_VARIANCE et dans le taux d'ecart.
  setAsideVarianceValue Decimal?      @map("set_aside_variance_value") @db.Decimal(16, 2)

  closedBy    User?      @relation("StockCountClosedBy", fields: [closedByUserId], references: [id])
  cancelledBy User?      @relation("StockCountCancelledBy", fields: [cancelledByUserId], references: [id])
  slip        StockSlip? @relation("StockCountReport")

  @@index([tenantId, status])
  @@index([tenantId, validatedAt])
```

Changement de `model StockCountLine` (`prisma/schema.prisma:7775-7797`) — la
colonne existante devient facultative :

```prisma
  /// Ce qu'on a compte. NUL = ligne « non comptee » creee par le systeme a la
  /// cloture du comptage (A2-R8) : elle ne s'ajuste pas, elle s'ecarte.
  countedQuantity  Decimal? @map("counted_quantity") @db.Decimal(16, 4)
```

Ajouts à `model StockCountLine` :

```prisma
  /// A3-R1. Heure serveur du figeage de `expectedQuantity`.
  expectedCapturedAt    DateTime?        @map("expected_captured_at")
  /// A4-R1. Auteur de la derniere saisie. Nul pour une ligne d'avant le lot :
  /// aucune valeur n'est inventee ; A1-R1 retombe alors sur le createur. Nul
  /// aussi pour une ligne non comptee (aucun compteur).
  countedByUserId       String?          @map("counted_by_user_id")
  countedAtServer       DateTime?        @map("counted_at_server")
  /// A2-R9. Faux si l'auteur detenait STOCK_COUNT_VALIDATE a la saisie (il
  /// voyait le stock) ; nul pour une ligne d'avant le lot ou non comptee.
  countedBlind          Boolean?         @map("counted_blind")
  /// A4-R2. Justification, en COUNTED seulement. `reason` (existant) = precision.
  reasonCode            StockReasonCode? @map("reason_code")
  justifiedByUserId     String?          @map("justified_by_user_id")
  justifiedAt           DateTime?        @map("justified_at")
  /// A2-R7. Ligne ecartee : non ajustee, imprimee au PV.
  setAsideAt            DateTime?        @map("set_aside_at")
  setAsideByUserId      String?          @map("set_aside_by_user_id")
  setAsideReason        String?          @map("set_aside_reason")
  /// Figes a la validation (A3-R4, B8).
  unitCostAtValidation  Decimal?         @map("unit_cost_at_validation") @db.Decimal(16, 4)
  movementsSinceCapture Int?             @map("movements_since_capture")

  countedBy   User?             @relation("StockCountLineCountedBy", fields: [countedByUserId], references: [id])
  justifiedBy User?             @relation("StockCountLineJustifiedBy", fields: [justifiedByUserId], references: [id])
  setAsideBy  User?             @relation("StockCountLineSetAsideBy", fields: [setAsideByUserId], references: [id])
  attachments StockAttachment[]
```

### 2.5 `StockTaker` — carnet des preneurs (B2)

```prisma
/// Lot 040 (B2). La personne qui emporte la marchandise. Elle n'a pas de compte.
///
/// Minimal a dessein (spec.md §10) : ni piece d'identite, ni photo, ni note
/// libre. Ne se supprime pas : il se desactive, ses sorties restent lisibles.
model StockTaker {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id")
  fullName        String   @map("full_name")
  /// Minuscules, sans accents, espaces reduits : anti-doublon (B2-R5).
  normalizedName  String   @map("normalized_name")
  teamOrCompany   String?  @map("team_or_company")
  /// Facultatif, effacable a tout moment.
  phone           String?
  employeeId      String?  @map("employee_id") @db.Uuid
  contractorId    String?  @map("contractor_id") @db.Uuid
  isActive        Boolean  @default(true) @map("is_active")
  createdByUserId String   @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  tenant     Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee   Employee?       @relation(fields: [employeeId], references: [id], onDelete: SetNull)
  contractor Contractor?     @relation(fields: [contractorId], references: [id], onDelete: SetNull)
  createdBy  User            @relation("StockTakerCreatedBy", fields: [createdByUserId], references: [id])
  movements  StockMovement[]
  slips      StockSlip[]

  @@index([tenantId, isActive])
  @@index([tenantId, normalizedName])
  @@map("stock_takers")
}
```

### 2.6 `StockSlip` — bons numérotés (B4)

```prisma
/// Lot 040 (B4). Bon de reception (BR), de sortie (BS), proces-verbal
/// d'inventaire (PVI). Numero continu par (agence, nature, annee), tire sous
/// verrou consultatif dans la transaction de l'operation (A10-R3) : une
/// operation annulee ne consomme rien. Le PDF se regenere, rien n'est stocke.
model StockSlip {
  id                String        @id @default(uuid()) @db.Uuid
  tenantId          String        @map("tenant_id")
  kind              StockSlipKind
  /// Annee de `documentDate` (meme regle que les pieces de caisse, cash.ts:292-295).
  year              Int
  number            Int
  /// Date declaree du document (date du mouvement ou de l'inventaire).
  documentDate      DateTime      @map("document_date")
  locationId        String        @map("location_id") @db.Uuid
  siteId            String?       @map("site_id") @db.Uuid
  takerId           String?       @map("taker_id") @db.Uuid
  /// Instantane du demandeur imprime sur le bon.
  requestedBy       String?       @map("requested_by")
  supplierInvoiceId String?       @map("supplier_invoice_id") @db.Uuid
  stockCountId      String?       @unique @map("stock_count_id") @db.Uuid
  /// B4-R3 (revision 2). Libelles metier imprimes, FIGES a l'emission :
  /// { location, site, taker, requestedBy, invoice: { reference, supplierName },
  ///   author, lines: [{ movementId?, itemId, reference, label, unit }],
  ///   counters?: string[], validator?: string }. Aucun montant (les montants
  /// se relisent sur les mouvements, et seulement avec STOCK_VALUES_VIEW).
  snapshot          Json          @default("{}")
  createdByUserId   String        @map("created_by_user_id")
  /// Heure serveur d'enregistrement, imprimee.
  createdAt         DateTime      @default(now()) @map("created_at")

  tenant          Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location        StockLocation     @relation(fields: [locationId], references: [id], onDelete: Restrict)
  site            ConstructionSite? @relation(fields: [siteId], references: [id], onDelete: SetNull)
  taker           StockTaker?       @relation(fields: [takerId], references: [id], onDelete: Restrict)
  supplierInvoice SupplierInvoice?  @relation("StockSlipInvoice", fields: [supplierInvoiceId], references: [id], onDelete: SetNull)
  stockCount      StockCount?       @relation("StockCountReport", fields: [stockCountId], references: [id], onDelete: Restrict)
  createdBy       User              @relation("StockSlipCreatedBy", fields: [createdByUserId], references: [id])
  movements       StockMovement[]
  attachments     StockAttachment[]

  @@unique([tenantId, kind, year, number])
  @@index([tenantId, kind, documentDate])
  @@index([supplierInvoiceId])
  @@map("stock_slips")
}
```

Numéro imprimé : `<préfixe>-<year>-<number sur 5 chiffres>` (`BR-2026-00042`),
calculé, jamais stocké en texte. Tirage : `max(number) + 1` sur
`(tenantId, kind, year)` sous verrou (forme de `nextVoucherNumberTx`,
`src/lib/finance/cash.ts:165-175`).

### 2.7 `StockAttachment` — pièces jointes (B5)

```prisma
/// Lot 040 (B5). Photo ou scan d'une marchandise ou d'un bon. Fichier PRIVE :
/// jamais servi en statique, relu par private-files.ts apres controle de
/// l'agence. EXIF retire avant ecriture ; empreinte du fichier STOCKE.
model StockAttachment {
  id               String                 @id @default(uuid()) @db.Uuid
  tenantId         String                 @map("tenant_id")
  targetType       StockAttachmentTarget  @map("target_type")
  movementId       String?                @map("movement_id") @db.Uuid
  slipId           String?                @map("slip_id") @db.Uuid
  countLineId      String?                @map("count_line_id") @db.Uuid
  purpose          StockAttachmentPurpose @default(GOODS_PHOTO)
  caption          String?
  /// Nom d'affichage nettoye, jamais utilise comme chemin.
  fileName         String                 @map("file_name")
  /// `/uploads/stock/<tenantId>/<aaaa>/<uuid>.<ext>`. Nul apres retrait.
  fileUrl          String?                @map("file_url")
  mimeType         String                 @map("mime_type")
  sizeBytes        Int                    @map("size_bytes")
  /// SHA-256 hexadecimal du fichier stocke. Conserve apres retrait.
  sha256           String                 @db.Char(64)
  uploadedByUserId String                 @map("uploaded_by_user_id")
  /// Heure serveur, seule heure qui fasse foi.
  createdAt        DateTime               @default(now()) @map("created_at")
  removedAt        DateTime?              @map("removed_at")
  removedByUserId  String?                @map("removed_by_user_id")
  removalReason    String?                @map("removal_reason")

  tenant     Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  movement   StockMovement?  @relation(fields: [movementId], references: [id], onDelete: Restrict)
  slip       StockSlip?      @relation(fields: [slipId], references: [id], onDelete: Restrict)
  countLine  StockCountLine? @relation(fields: [countLineId], references: [id], onDelete: Restrict)
  uploadedBy User            @relation("StockAttachmentUploadedBy", fields: [uploadedByUserId], references: [id])
  removedBy  User?           @relation("StockAttachmentRemovedBy", fields: [removedByUserId], references: [id])

  @@index([tenantId, targetType])
  @@index([movementId])
  @@index([slipId])
  @@index([countLineId])
  @@map("stock_attachments")
}
```

Une pièce jointe de ligne d'inventaire ne se dépose qu'en `COUNTED` (B5-R6) ; la
ligne ne peut alors plus être supprimée (seulement écartée), d'où `Restrict`.
Un mouvement `RECEIPT` ou `ADJUSTMENT` n'est jamais une cible (B5-R1, contrôle
applicatif : le type du mouvement n'est pas lisible par une contrainte `CHECK`).
Le fichier est relu par `privateUploadPath(fileUrl, ['stock', tenantId, <aaaa>])`
et le dossier `stock/` est déclaré à l'export d'agence (B5-R9).

### 2.8 `StockAlert` — alertes (B7)

```prisma
/// Lot 040 (B7). Point « a traiter » pour le dirigeant. Informe, n'interdit
/// rien, ne designe personne. Titre et message se CONSTRUISENT a la lecture
/// depuis `kind` et `details` (traduisibles par t()), jamais stockes en texte.
model StockAlert {
  id                   String             @id @default(uuid()) @db.Uuid
  tenantId             String             @map("tenant_id")
  kind                 StockAlertKind
  severity             StockAlertSeverity
  status               StockAlertStatus   @default(OPEN)
  /// Anti-doublon : liste des cles dans spec.md B7-R1 (ex. `LARGE_ISSUE:<slipId>`,
  /// `CASH_MATERIAL_CUMUL:<siteId>:2026-10`). Naissance par INSERT ... ON
  /// CONFLICT DO NOTHING uniquement (B7-R2).
  dedupeKey            String             @map("dedupe_key")
  /// Montant constate et seuil, FIGES a la naissance.
  amount               Decimal?           @db.Decimal(16, 2)
  threshold            Decimal?           @db.Decimal(16, 2)
  currency             String             @default("XOF")
  siteId               String?            @map("site_id") @db.Uuid
  locationId           String?            @map("location_id") @db.Uuid
  /// Objet vise, sans cle etrangere (meme parti pris que CostAllocation.sourceId) :
  /// StockSlip | StockCount | StockMovement | SupplierInvoice | CashVoucher.
  subjectType          String             @map("subject_type")
  subjectId            String             @map("subject_id") @db.Uuid
  /// Elements du message : numero de bon, reference de facture, article,
  /// `mode` (SINGLE | MONTHLY_CUMUL), nombre de lignes ecartees... Aucun nom de personne.
  details              Json?
  raisedAt             DateTime           @default(now()) @map("raised_at")
  /// B7-R6. Reclamation par la tache d'envoi (mise a jour conditionnelle) ;
  /// expire au bout de 30 minutes si l'envoi n'a pas abouti.
  emailClaimedAt       DateTime?          @map("email_claimed_at")
  /// B7-R6. Ecrit APRES le succes de l'envoi, ou quand l'envoi est sans objet.
  emailSentAt          DateTime?          @map("email_sent_at")
  /// B7-R6. DISABLED | NO_FEATURE | NO_RECIPIENT quand aucun e-mail n'est parti.
  emailSkippedReason   String?            @map("email_skipped_reason")
  acknowledgedAt       DateTime?          @map("acknowledged_at")
  acknowledgedByUserId String?            @map("acknowledged_by_user_id")
  acknowledgeNote      String?            @map("acknowledge_note")

  tenant         Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  site           ConstructionSite? @relation(fields: [siteId], references: [id], onDelete: SetNull)
  location       StockLocation?    @relation(fields: [locationId], references: [id], onDelete: SetNull)
  acknowledgedBy User?             @relation("StockAlertAcknowledgedBy", fields: [acknowledgedByUserId], references: [id])

  @@unique([tenantId, dedupeKey])
  @@index([tenantId, status, raisedAt(sort: Desc)])
  @@index([emailSentAt, tenantId])
  @@map("stock_alerts")
}
```

**Naissance d'une alerte** (B7-R2) : une seule fonction, `raiseStockAlertTx`,
écrit par `tx.stockAlert.createMany({ data: [alerte], skipDuplicates: true })`
(`INSERT … ON CONFLICT DO NOTHING` en PostgreSQL). Un `create` simple est
interdit : un conflit d'unicité condamnerait la transaction de l'opération.

### 2.9 `StockClientRequest` — idempotence (B3-R2)

```prisma
/// Lot 040 (B3-R2). Cle d'idempotence d'une ecriture terrain. PREMIERE ecriture
/// de la transaction de l'operation : un rejeu concurrent echoue sur l'unicite,
/// la transaction perdante est annulee et le controleur relit la cle pour
/// renvoyer le resultat de la gagnante, masque pour l'appelant. Un rejeu par un
/// autre utilisateur (createdByUserId different) repond 409. Purgee apres 30
/// jours par stock-maintenance-job.ts.
model StockClientRequest {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id")
  clientRequestId String   @map("client_request_id") @db.Uuid
  /// RECEIPT | ISSUE | TRANSFER | SCRAP | SUPPLIER_RETURN | COUNT_LINE | ATTACHMENT
  operation       String
  /// SHA-256 du corps canonique (cles triees, sans clientRequestId).
  bodyHash        String   @map("body_hash") @db.Char(64)
  /// StockSlip | StockMovement (transferGroupId pour un transfert) | StockCountLine | StockAttachment.
  /// NULS a l'insertion (la cle est la premiere ecriture, le resultat n'existe
  /// pas encore), renseignes par une mise a jour en fin de transaction.
  resultType      String?  @map("result_type")
  resultId        String?  @map("result_id")
  createdByUserId String   @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, clientRequestId])
  @@index([createdAt])
  @@map("stock_client_requests")
}
```

### 2.10 Relations inverses à ajouter

| Modèle                   | Champs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tenant`                 | `stockTakers StockTaker[]`, `stockSlips StockSlip[]`, `stockAttachments StockAttachment[]`, `stockAlerts StockAlert[]`, `stockClientRequests StockClientRequest[]`                                                                                                                                                                                                                                                                                                                                                                       |
| `User`                   | `stockCountsClosed` (`StockCountClosedBy`), `stockCountsCancelled` (`StockCountCancelledBy`), `stockCountLinesCounted` (`StockCountLineCountedBy`), `stockCountLinesJustified` (`StockCountLineJustifiedBy`), `stockCountLinesSetAside` (`StockCountLineSetAsideBy`), `stockTakersCreated` (`StockTakerCreatedBy`), `stockSlipsCreated` (`StockSlipCreatedBy`), `stockAttachmentsUploaded` (`StockAttachmentUploadedBy`), `stockAttachmentsRemoved` (`StockAttachmentRemovedBy`), `stockAlertsAcknowledged` (`StockAlertAcknowledgedBy`) |
| `ConstructionSite`       | `stockSlips StockSlip[]`, `stockAlerts StockAlert[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `StockLocation`          | `slips StockSlip[]`, `alerts StockAlert[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SupplierInvoice`        | `stockSlips StockSlip[] @relation("StockSlipInvoice")`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SupplierInvoiceLine`    | `stockReceipts StockMovement[] @relation("StockReceiptInvoiceLine")`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Employee`, `Contractor` | `stockTakers StockTaker[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Aucun `include: { user: true }` : toute lecture de ces relations `User` passe
par `select: { fullName: true, email: true }` (AGENTS.md ; forme existante
`src/lib/finance/stock-mouvements.ts:424`).

## 3. Permissions et rôle

### 3.1 Les dix permissions

| Clé                    | Description (seed et migration)                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `STOCK_VIEW`           | Consulter le stock : articles, lieux, soldes en quantité, mouvements, inventaires, preneurs, bons |
| `STOCK_VALUES_VIEW`    | Voir les valeurs du stock, les indicateurs et les filtres par personne                            |
| `STOCK_RECEIVE`        | Enregistrer une réception de stock                                                                |
| `STOCK_ISSUE`          | Enregistrer une sortie de stock vers un chantier                                                  |
| `STOCK_TRANSFER`       | Transférer du stock entre deux lieux                                                              |
| `STOCK_COUNT`          | Ouvrir, compter, clore et justifier un inventaire                                                 |
| `STOCK_TAKERS_MANAGE`  | Gérer le carnet des preneurs                                                                      |
| `STOCK_COUNT_VALIDATE` | Valider ou abandonner un inventaire, écarter une ligne de comptage                                |
| `STOCK_DISPOSE`        | Enregistrer un rebut ou un retour fournisseur, retirer une pièce jointe                           |
| `STOCK_ALERTS_VIEW`    | Consulter et traiter les alertes de stock                                                         |

Gardes nommées dans `src/middleware/stock-rbac-middleware.ts` (nouveau), même
forme que `src/middleware/finance-rbac-middleware.ts:22-37`.

### 3.2 Seed

`prisma/seeds/stock-permissions-seed.ts` (nouveau, forme de
`prisma/seeds/finance-permissions-seed.ts`) : crée les dix permissions, crée le
rôle `TENANT_STOREKEEPER` (`name: 'Tenant Storekeeper'`, `scope: TENANT`,
description « Magasinier : reçoit, sort, transfère et compte le stock, sans
accès aux valeurs ni à la comptabilité »), et attribue :

| Rôle                 | Permissions                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `TENANT_ADMIN`       | les dix                                                                                                                   |
| `TENANT_MANAGER`     | `STOCK_VIEW`, `STOCK_VALUES_VIEW`                                                                                         |
| `TENANT_ACCOUNTANT`  | `STOCK_VIEW`, `STOCK_VALUES_VIEW`, `STOCK_RECEIVE`, `STOCK_ISSUE`, `STOCK_TRANSFER`, `STOCK_COUNT`, `STOCK_TAKERS_MANAGE` |
| `TENANT_STOREKEEPER` | `STOCK_VIEW`, `STOCK_RECEIVE`, `STOCK_ISSUE`, `STOCK_TRANSFER`, `STOCK_COUNT`, `STOCK_TAKERS_MANAGE`                      |
| `TENANT_AGENT`       | aucune                                                                                                                    |

Appelé par `prisma/seeds/rbac-seed.ts` juste après `seedFinancePermissions()`
(`:127`) et avant l'attribution de tout au `PLATFORM_SUPER_ADMIN` (`:134`). Le
libellé « Magasinier » est ajouté à `TENANT_ROLE_LABELS_FR`
(`src/services/invitation-service.ts:26-31`) et aux libellés web
(`apps/web/src/constants/permissions-labels.ts`, agent des écrans).

### 3.3 Migration de données

Fichier `prisma/migrations/20261008090200_controle_stock_permissions/migration.sql`,
additive et idempotente, sur le modèle de
`prisma/migrations/20261006130000_syndic_permissions/migration.sql` et
`20261007100000_audit_tenant_permission/migration.sql` :

```sql
-- Migration de DONNEES (spec 040, B1) : droits du stock et role Magasinier.
-- Additive et idempotente. Equivalent de prisma/seeds/stock-permissions-seed.ts,
-- pour qu'une base qui applique les migrations (prisma migrate deploy) n'ait
-- pas ses routes de stock en 403 au premier deploiement.

-- 1. Les 10 permissions.
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'STOCK_VIEW', 'Consulter le stock : articles, lieux, soldes en quantite, mouvements, inventaires, preneurs, bons', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_VALUES_VIEW', 'Voir les valeurs du stock, les indicateurs et les filtres par personne', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_RECEIVE', 'Enregistrer une reception de stock', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_ISSUE', 'Enregistrer une sortie de stock vers un chantier', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_TRANSFER', 'Transferer du stock entre deux lieux', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_COUNT', 'Ouvrir, compter, clore et justifier un inventaire', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_TAKERS_MANAGE', 'Gerer le carnet des preneurs', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_COUNT_VALIDATE', 'Valider ou abandonner un inventaire, ecarter une ligne de comptage', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_DISPOSE', 'Enregistrer un rebut ou un retour fournisseur, retirer une piece jointe', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_ALERTS_VIEW', 'Consulter et traiter les alertes de stock', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- 2. Le role Magasinier (portee agence, global comme les autres roles systeme).
INSERT INTO "roles" ("id", "key", "name", "description", "scope", "created_at", "updated_at")
VALUES (
  gen_random_uuid()::text, 'TENANT_STOREKEEPER', 'Tenant Storekeeper',
  'Magasinier : recoit, sort, transfere et compte le stock, sans acces aux valeurs ni a la comptabilite',
  'TENANT', NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

-- 3. Droits du Magasinier.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" IN (
  'STOCK_VIEW', 'STOCK_RECEIVE', 'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_COUNT', 'STOCK_TAKERS_MANAGE'
)
WHERE r."key" = 'TENANT_STOREKEEPER'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 4. Report des droits financiers sur TOUS les roles qui les portent. Les
--    roles sont globaux (pas de role propre a une agence) : roles systeme, et
--    roles dont la plateforme a modifie les permissions. Personne ne perd
--    l'acces au stock qu'il avait.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, rp."role_id", np."id", NOW()
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id"
JOIN "permissions" np ON (
     (op."key" = 'FINANCE_ACCOUNTS_READ'      AND np."key" IN ('STOCK_VIEW', 'STOCK_VALUES_VIEW'))
  OR (op."key" = 'FINANCE_DOCUMENTS_CREATE'   AND np."key" IN ('STOCK_RECEIVE', 'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_COUNT', 'STOCK_TAKERS_MANAGE'))
  OR (op."key" = 'FINANCE_DOCUMENTS_VALIDATE' AND np."key" IN ('STOCK_COUNT_VALIDATE', 'STOCK_DISPOSE', 'STOCK_ALERTS_VIEW'))
)
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 5. Administrateur d'agence et super-admin : les dix, meme si un droit
--    financier leur avait ete retire a la main.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" LIKE 'STOCK\_%'
WHERE r."key" IN ('TENANT_ADMIN', 'PLATFORM_SUPER_ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
```

À vérifier à l'implémentation : les noms de contraintes `ON CONFLICT ("key")` et
`("role_id", "permission_id")` sont ceux qu'utilise déjà la migration syndic ; la
colonne `roles.updated_at` n'a pas de défaut SQL (`@updatedAt`), d'où `NOW()`.

**Menus du Magasinier.** La migration n'écrit **aucune** décision
`role_menu_access` : les clés de menu sont opaques côté serveur et décrites
côté web seulement (`src/services/role-menu-service.ts:1-18`). Le web masque
« Suivi des chantiers » au Magasinier par permission (ecrans §2.3) ; les autres
groupes de menu se coupent pour le rôle `TENANT_STOREKEEPER` par l'écran
existant de la plateforme (`PUT /roles/menu-access/:roleKey`,
`src/routes/role-routes.ts:36`), une fois, au déploiement (DEPLOIEMENT.md).

**Effet des permissions** : au plus tard 5 minutes après l'attribution d'un
rôle, par instance (cache non invalidé, spec B1-R6) ; immédiat après la
migration, puisque le déploiement redémarre l'API.

## 4. Traitement comptable

Tout passe par `postDocumentEntryTx` (`src/lib/finance/accounting.ts:583`), dans
le journal opérationnel, avec les comptes du plan opérationnel existant
(`OPERATIONAL_ACCOUNT_SEEDS`, `src/lib/finance/accounting.ts:280-347`) : **aucun
compte nouveau**. Valorisation au coût moyen du lieu **avant** le mouvement,
jamais à un prix saisi (principe P-4, `src/lib/finance/stock-mouvements.ts:25-26`),
sauf la réception (prix d'entrée, A8-R3) et la part fournisseur du retour (prix
fournisseur, spec A6-R3 bis). **Aucune écriture pour un mouvement de valeur
nulle** (A6-R4) ; aujourd'hui `buildBalancedEntryLines` accepte une écriture à
zéro (`:166-207`), ce lot cesse d'en produire.

| Mouvement              | Écriture                                                                                                                                               | Imputation chantier                   | `documentType`          | Inchangé ?                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ----------------------- | -------------------------------------------- |
| Réception              | aucune (la facture a porté la valeur au 311, `src/lib/finance/suppliers.ts:530-542`)                                                                   | non                                   | —                       | oui                                          |
| Sortie                 | D compte du poste (605 à défaut) / C 311                                                                                                               | oui, `STOCK_ISSUE`                    | `STOCK_ISSUE`           | oui                                          |
| Transfert              | aucune                                                                                                                                                 | non                                   | —                       | oui                                          |
| Ajustement, manque     | D 603 / C 311                                                                                                                                          | non                                   | `STOCK_ADJUSTMENT`      | oui (A3 change la quantité, pas les comptes) |
| Ajustement, surplus    | D 311 / C 603 ; **valeur nulle pour un inventaire `OPENING`**, donc pas d'écriture                                                                     | non                                   | `STOCK_ADJUSTMENT`      | partiel                                      |
| **Rebut**              | D 603 / C 311, au coût moyen du lieu                                                                                                                   | **non** (comme un écart d'inventaire) | `STOCK_SCRAP`           | nouveau                                      |
| **Retour fournisseur** | C 311 = `totalValue` (coût moyen du lieu) ; D 401 = `supplierCreditValue` (prix fournisseur) ; différence en 603 (C 603 si D 401 > C 311, D 603 sinon) | non                                   | `STOCK_SUPPLIER_RETURN` | nouveau                                      |

**Retour fournisseur, compte de tiers.** Dans la même transaction,
`appendThirdPartyMovementTx` (`src/lib/finance/ledger.ts:189`) écrit sur le
compte de tiers du fournisseur de la facture un mouvement `type: 'ADJUSTMENT'`,
`settled: supplierCreditValue` (« réglé » diminue le solde, `:49-60` et
`src/lib/finance/types.ts:112-115`), `sourceType: 'STOCK_SUPPLIER_RETURN'`,
`sourceId: <id du mouvement>`. La dette envers le fournisseur baisse dès la
constatation du retour ; l'avoir papier du fournisseur se rapproche de ce
mouvement. Choix fait pour rester dans le plan existant : le 401 est le seul
compte fournisseur du plan opérationnel (pas de 4098 « avoirs à obtenir »).

**Prix fournisseur du retour** (spec A6-R3 bis) : prix unitaire de la ligne de
facture désignée par `supplierInvoiceLineId` (de la même facture) ; à défaut,
**coût de réception de la facture** = Σ `totalValue` ÷ Σ `quantity` des
mouvements `RECEIPT` de cet article sur cette facture (tous lieux), **permis
seulement** si chacun de ces mouvements a `valuationSource` `DECLARED`,
`INVOICE_LINE` ou nul (réception d'avant le lot, prix saisi obligatoire) ; sinon
`409 STOCK_RETURN_UNVALUED`. Raison : un coût de réception tiré du coût moyen,
du dernier prix ou de zéro réduirait la dette fournisseur d'un montant
arbitraire.

**Exemple** (critère A6-1) : 10 sacs retournés, ligne de facture à 5 000, coût
moyen du lieu 5 200 → C 311 52 000 ; D 401 50 000 ; D 603 2 000 ; solde du compte
de tiers du fournisseur −50 000.

**Ce que le retour ne fait pas.** Les règlements fournisseur s'affectent par
facture (`SupplierPaymentAllocation`, `src/lib/finance/suppliers.ts:820-834`) :
le mouvement « réglé » du retour n'est affecté à aucune facture, il diminue le
solde du compte de tiers sans diminuer le « reste à payer » affiché par
facture. L'avoir papier du fournisseur se rapproche de ce mouvement ; un avoir
affecté à une facture (modèle et écran) relève du niveau 3.

**Facture imputée en charge.** Le 311 n'est débité par une facture que pour
les imputations de chantiers basculés au stock à la date de la facture
(`src/lib/finance/suppliers.ts:506-543`) ; une réception sur une facture imputée
en charge fait entrer la marchandise dans le stock sans débit du 311 au grand
livre (comportement du lot 5, inchangé). Le retour, comme la sortie et le rebut,
crédite le 311 à sa valeur de stock : l'écart au grand livre préexiste au lot et
se documente pour l'expert-comptable (spec §3.3).

**Rapprochement de chantier** (`src/lib/finance/stock-rapprochement.ts:387-611`) :
la formule de l'écart ne change pas ; chaque ligne reçoit deux couples
descriptifs, `returnedToSupplierQuantity`/`Value` et `scrappedQuantity`/`Value`,
qui expliquent le restant sans l'interpréter. Pendant un comptage du lieu du
chantier, `remainingQuantity` et `remainingValue` (et leurs totaux) valent
`null` pour un appelant sans `STOCK_COUNT_VALIDATE` (spec §8.2), de même que le
total `remainingValue` de l'en-tête (`SiteStockReconciliationRecord`,
`src/lib/finance/types-lot5-rapprochement.ts:210-222`), et la réponse porte
`meta`. `unreconciledAmount` (facturé − reçu) ne dépend pas du restant et reste
rendu.

## 5. Migrations

Dernière migration du dépôt à la rédaction : `20261007150100_secure_link_scope_installment_payment`.
**L'agent des fondations relit `prisma/migrations/` au moment d'écrire** et
horodate les trois migrations après la dernière présente (les noms ci-dessous
sont indicatifs). Trois migrations, dans cet ordre :

| #   | Nom                                         | Contenu                                                                                                                                                                                                                                                                                                                        | Pourquoi séparée                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `20261008090000_controle_stock_enums`       | `ALTER TYPE "StockMovementType" ADD VALUE 'SUPPLIER_RETURN'`, `… 'SCRAP'` ; `ALTER TYPE "StockCountStatus" ADD VALUE 'COUNTED'`, `… 'CANCELLED'` ; `ALTER TYPE "SourceType" ADD VALUE 'STOCK_SUPPLIER_RETURN'`, `… 'STOCK_SCRAP'`. Aucune valeur utilisée.                                                                     | Une valeur ajoutée par `ADD VALUE` ne peut pas servir dans la même transaction ; précédent `20261007150100_secure_link_scope_installment_payment/migration.sql:1-2`.                                                                                                                                                                                                                                                                                              |
| 2   | `20261008090100_controle_stock`             | Enums neufs (`CREATE TYPE`), colonnes ajoutées (§2.2 à §2.4, toutes facultatives ou avec défaut : aucune réécriture de ligne existante), `ALTER COLUMN "counted_quantity" DROP NOT NULL` sur `stock_count_lines` (sans réécriture), tables neuves (§2.5 à §2.9), clés étrangères, index ; puis les contraintes SQL ci-dessous. | **Générée sans base** par `prisma migrate diff --from-schema-datamodel <schéma de origin/main> --to-schema-datamodel prisma/schema.prisma --script` (le schéma d'origine s'obtient par `git show origin/main:packages/api/prisma/schema.prisma`, écrit dans le dossier de travail de l'agent, jamais dans le dépôt). Les `ALTER TYPE … ADD VALUE` que produit le diff sont **déplacés** dans la migration 1 ; les contraintes ci-dessous sont ajoutées à la main. |
| 3   | `20261008090200_controle_stock_permissions` | §3.3.                                                                                                                                                                                                                                                                                                                          | Migration de données, comme le précédent syndic.                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Contraintes ajoutées à la main à la fin de la migration 2** (non exprimables
en Prisma ; à documenter en commentaire au-dessus des modèles, comme la
contrainte `CHECK` de l'audit, `specs/023-audit-deux-niveaux/spec.md` §3) :

```sql
-- A2 : un seul inventaire ouvert (en cours ou clos non valide) par lieu.
-- Remplace la seule lecture applicative (stock-inventaire.ts:579-585), qui
-- laissait passer deux ouvertures simultanees.
CREATE UNIQUE INDEX "stock_counts_one_open_per_location"
  ON "stock_counts" ("location_id")
  WHERE "status" IN ('DRAFT', 'COUNTED');

-- A7-R1 : un seul inventaire d'ouverture par lieu, hors abandon.
CREATE UNIQUE INDEX "stock_counts_one_opening_per_location"
  ON "stock_counts" ("location_id")
  WHERE "kind" = 'OPENING' AND "status" <> 'CANCELLED';

-- A6 : un rebut ou un retour fournisseur porte toujours un motif type. Ces deux
-- natures naissent avec ce lot : aucune ligne existante, contrainte VALIDE.
-- TRANSFER n'y figure PAS : les transferts deja en base n'ont pas de motif, et
-- une contrainte NOT VALID s'appliquerait quand meme a toute MISE A JOUR d'une
-- ancienne ligne (ex. SET NULL d'une cle etrangere a la suppression d'un objet
-- lie), qui echouerait. Le motif du transfert (A11) est garanti par le service.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_code_required"
  CHECK ("type" NOT IN ('SUPPLIER_RETURN', 'SCRAP') OR "reason_code" IS NOT NULL);

-- B2 : un preneur est lie a un employe OU a un tacheron, jamais aux deux.
ALTER TABLE "stock_takers" ADD CONSTRAINT "stock_takers_single_link"
  CHECK ("employee_id" IS NULL OR "contractor_id" IS NULL);

-- B5 : exactement une cible, coherente avec target_type.
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_single_target"
  CHECK (
       ("target_type" = 'MOVEMENT'   AND "movement_id" IS NOT NULL AND "slip_id" IS NULL AND "count_line_id" IS NULL)
    OR ("target_type" = 'SLIP'       AND "slip_id" IS NOT NULL AND "movement_id" IS NULL AND "count_line_id" IS NULL)
    OR ("target_type" = 'COUNT_LINE' AND "count_line_id" IS NOT NULL AND "movement_id" IS NULL AND "slip_id" IS NULL)
  );

-- B5-R5 : une piece retiree n'a plus de fichier, mais garde son empreinte.
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_removed_has_no_file"
  CHECK ("removed_at" IS NULL OR "file_url" IS NULL);
```

**Avant de créer `stock_counts_one_open_per_location`**, la migration vérifie
qu'aucun lieu ne porte deux inventaires `DRAFT` (possible aujourd'hui par
concurrence) ; s'il en existe, elle échoue avec un message explicite plutôt que de
choisir lequel garder :

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "stock_counts" WHERE "status" = 'DRAFT'
    GROUP BY "location_id" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Spec 040 : un lieu porte plusieurs inventaires en brouillon ; les resoudre avant migration.';
  END IF;
END $$;
```

**Rattrapage** : aucun. Les colonnes neuves restent nulles sur l'existant ;
`StockCount.kind` prend `REGULAR`, `counterUserIds` `{}`, `StockSettings` ses
défauts, `StockSlip.snapshot` `{}`. Les inventaires validés avant le lot n'ont
pas de valeurs figées (B8-R2).

### 5.3 Retour arrière

- **Le schéma ne revient pas en arrière.** `ALTER TYPE … ADD VALUE` est
  irréversible en PostgreSQL ; et dès qu'une ligne porte une valeur nouvelle
  (`COUNTED`, `CANCELLED`, `SCRAP`, `SUPPLIER_RETURN`, `STOCK_SCRAP`…), un client
  Prisma généré sur l'ancien schéma échoue à la lecture (valeur d'enum inconnue)
  sur la liste des inventaires, le journal et le grand livre. Redéployer
  l'ancien code après la première écriture d'une valeur nouvelle casse ces
  écrans.
- **Donc le retour arrière est un correctif en avant** : on corrige et on
  redéploie le code du lot ; les migrations restent. Avant toute écriture d'une
  valeur nouvelle (dans les minutes qui suivent la mise en ligne), un retour du
  code seul reste possible : les migrations sont additives (colonnes
  facultatives, tables neuves, `DROP NOT NULL` sans effet sur l'ancien code qui
  écrit toujours une quantité).
- **API et web se déploient ensemble.** Les formes de réponse changent
  (`POST /stock/receipts` : tableau → `{ slip, movements, controls }` ;
  `POST /stock/issues` : mouvement → `{ slip, movements }` ; `PUT …/lines` :
  inventaire → ligne ; listes paginées avec `meta`). Un onglet resté ouvert sur
  l'ancien web reçoit des réponses qu'il ne sait pas lire pendant la fenêtre de
  déploiement : le rechargement de la page suffit, aucun drapeau de
  fonctionnalité n'est ajouté (le web et l'API partent du même déploiement,
  `docs/workflows/DEPLOIEMENT.md`).
- **À ajouter à `docs/workflows/DEPLOIEMENT.md`** (agent d'intégration) : ces
  trois points, la variable `STOCK_ALERT_MAIL_JOB_ENABLED`, et l'étape « couper
  les menus hors stock du rôle Magasinier » (§3.3).

## 6. Verrous et concurrence (A10)

Ordre unique, toujours (spec A10-R2, révision 3 après relecture) : verrou
d'inventaire (ligne `stock_counts` en `FOR UPDATE`), verrou de chantier, verrou
de facture, verrou du cumul mensuel des rebuts, puis verrous de solde triés,
puis verrou de numérotation. La clé d'idempotence est la première
écriture ; les verrous se prennent juste après elle, avant toute lecture de
solde.

| Opération                       | Verrou(s), dans cet ordre                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Réception                       | `stock-site` du chantier si le lieu est celui d'un chantier ; `stock-invoice` de la facture ; un `stock-balance` par couple (article, lieu) distinct, triés ; `stock-slip` |
| Sortie multi-lignes             | un `stock-balance` par couple distinct, triés ; `stock-slip`                                                                                                               |
| Transfert                       | `stock-site` du chantier d'arrivée si le lieu d'arrivée est celui d'un chantier ; deux `stock-balance` (origine, arrivée), triés                                           |
| Rebut                           | `stock-scrap-month` (agence, lieu, mois du rebut) ; un `stock-balance`                                                                                                     |
| Retour fournisseur              | `stock-invoice` de la facture ; un `stock-balance`                                                                                                                         |
| Saisie d'une ligne d'inventaire | ligne `stock_counts` en `FOR UPDATE` ; un `stock-balance` (article, lieu), puis lecture du solde et de l'heure de la base                                                  |
| Clôture du comptage (A2-R8)     | un `stock-balance` par article de solde non nul du lieu et par ligne, triés (le solde lu pour créer les lignes non comptées est celui de l'instant)                        |
| Validation d'inventaire         | un `stock-balance` par ligne non écartée, triés ; `stock-slip` (PVI)                                                                                                       |
| Clôture de chantier (A7-R3 bis) | `stock-site` du chantier, avant `collectClosureBlockers`                                                                                                                   |
| Tirage d'un numéro de bon       | `pg_advisory_xact_lock(hashtext('stock-slip'), hashtext(tenantId))`                                                                                                        |

Clé de chantier : `pg_advisory_xact_lock(hashtext('stock-site'), hashtext(siteId))`.

Clé de facture : `pg_advisory_xact_lock(hashtext('stock-invoice'), hashtext(tenantId || ':' || invoiceId))`
(`lockStockInvoiceTx`) : sérialise le plafond « reçu − déjà retourné » et les
contrôles de réception d'une même facture.

Clé du cumul des rebuts : `stock-scrap-month`, sur `tenantId:locationId:aaaa-mm`
(`lockStockScrapMonthTx`).

Clé de solde : `pg_advisory_xact_lock(hashtext('stock-balance'), hashtext(tenantId || ':' || itemId || ':' || locationId))`
par `$executeRaw`. Une collision de `hashtext` ne coûte qu'une attente, jamais
une erreur. En lecture validée (isolation par défaut de PostgreSQL), la lecture
faite après l'obtention du verrou voit l'écriture validée du détenteur
précédent.

## 7. Index de lecture et volumétrie

- Journal : `(tenant_id, movement_date DESC, created_at DESC, id DESC)` sert le tri
  et le curseur ; les filtres par type, auteur et preneur ont leur index.
- Indicateurs : agrégations par `(tenant_id, type, movement_date)` et
  `(tenant_id, validated_at)` ; aucune table de cumul (« ce qui se calcule ne se
  stocke pas », en-tête du stock, `prisma/schema.prisma:7497-7501`).
- Alertes : `(tenant_id, status, raised_at DESC)` pour la file et la liste ;
  `(email_sent_at, tenant_id)` pour la tâche d'envoi (liste des agences à
  traiter, puis réclamation par agence).
- Indicateurs en `$queryRaw` : `tenant_id = $1` explicite dans chaque requête
  (spec B8-R3).
- Articles à recompter (`LocationView.toRecount`) : lignes écartées du dernier
  inventaire validé de chaque lieu, par `(tenant_id, validated_at)` puis
  `count_id`.
