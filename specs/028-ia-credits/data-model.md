# Modèle de données — facturation des crédits IA d'ImmoCopilot

**Spécification** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md)
**Date** : 2026-09-29 · **Statut** : proposition, aucun code écrit

Ce document décrit le schéma Prisma **proposé**. Il est **additif** : aucune
table, aucune colonne, aucun enum existant n'est supprimé, renommé ni retypé.
Les colonnes ajoutées à des tables existantes sont nulles ou portent une valeur
par défaut constante. **Trois valeurs sont ajoutées à des enums existants**
(`CapacityKey.AI_REQUESTS`, `PlatformInvoiceNature.AI_USAGE`,
`PlatformInvoiceNature.AI_TOPUP`) : un `ALTER TYPE … ADD VALUE` ne se défait
pas et PostgreSQL refuse d'employer la valeur dans la transaction qui l'a
créée, donc **chaque ajout a sa propre migration**, sans rien d'autre dedans
(précédent : `20261001101500_patrimoine_pack_enums`, qui isole `ModuleKey`,
`CapacityKey.BIENS_DETENUS` et `LotKind` dans une migration dont le catalogue
`20261001101600_patrimoine_pack_catalogue` se sert ensuite).

Conventions reprises du schéma actuel : clé `String @id @default(uuid())
@db.Uuid` pour un modèle nouveau, colonnes en `snake_case` via `@map`, tables
via `@@map`, `tenantId String @map("tenant_id")` **sans** `@db.Uuid` (l'`id`
d'un `Tenant` est un `String` simple, `schema.prisma:565`) sur chaque modèle
d'agence (test `schema-tenant-coverage`), identifiants de `Invoice`,
`SubscriptionItem` et `User` en `String` simple, montants `Decimal(14, 2)`,
devise `FCFA` comme `Invoice.currency` (`schema.prisma:1049`).

Rappel de l'état vérifié le 29/09/2026 (`main` `6c454886`) : aucune table
d'usage, de crédit, de portefeuille ni de tarif de modèle n'existe. Le seul
équivalent d'une ligne « en attente » est `InvoiceLine` sans `invoiceId`
(`schema.prisma:1270-1297`). `InvoiceLineKind.USAGE` existe
(`schema.prisma:138`) et n'est employé nulle part ; l'ordre d'affichage lui
réserve déjà le rang 65 (`lib/subscription/platform-invoice.ts:63-65`).

## 1. Enums

### 1.1 Enums nouveaux

```prisma
/// Mode de controle des credits IA de la PLATEFORME (reglage du super-admin).
/// OFF : mesure seule. SHADOW : portefeuille tenu, jamais bloquant ni facture.
/// ENFORCE : blocage a zero, packs, depassement et recharges actifs.
enum AiBillingMode {
  OFF
  SHADOW
  ENFORCE
}

/// D'ou vient le cout d'une requete : rapporte par le fournisseur (OpenRouter),
/// calcule depuis le tarif du modele (AiModelPrice), ou inconnu.
enum AiCostSource {
  PROVIDER_REPORTED
  COMPUTED
  UNKNOWN
}

/// Origine d'un credit. Les quatre premieres sont des sources de LOT
/// (AiCreditGrant) ; OVERAGE et UNBILLED ne servent qu'a qualifier une requete
/// (AiUsageEvent.source) : aucun lot ne les porte.
enum AiCreditSource {
  MONTHLY_FREE
  PACK_MONTHLY
  ADMIN_GRANT
  TOPUP
  OVERAGE
  UNBILLED
}

/// Cycle de vie d'une requete cote portefeuille : reservee avant l'appel au
/// modele, puis reglee (credit consomme) ou liberee (credit rendu).
enum AiUsageStatus {
  RESERVED
  SETTLED
  RELEASED
  EXPIRED
}

/// Mouvement du journal en ajout seul. `delta` = variation de `remaining` du lot.
enum AiLedgerEntryType {
  GRANT
  RESERVE
  CONSUME
  RELEASE
  EXPIRE
  REFUND
  ADJUST
}

/// Etat de facturation du depassement d'un mois.
enum AiUsageMonthStatus {
  OPEN
  INVOICED
  WAIVED
}
```

### 1.2 Valeurs ajoutées à des enums existants (une migration chacune)

| Enum existant                                | Valeur        | Lot | Pourquoi                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CapacityKey` (`schema.prisma:102`)          | `AI_REQUESTS` | B   | `CatalogCapacity.capacityKey` (crédits par unité de pack), `QuotaAlert.capacityKey` (alertes 80/100 %), `InvoiceLine.capacityKey` (lignes d'usage), `CapacityOverride.capacityKey` portent tous cet enum. **La valeur n'entre PAS dans `CAPACITY_KEYS`** (voir plan §4.5.1 : c'est un flux mensuel, pas un stock). Alternative sans migration d'enum : Q19. |
| `PlatformInvoiceNature` (`schema.prisma:86`) | `AI_USAGE`    | D   | Facture mensuelle de dépassement IA. Sans valeur propre elle heurterait l'index unique `invoices_platform_period_key` (`migrations/20260928110000_abonnements_facturation/migration.sql:31-35`, natures `PERIOD` et `OVERAGE`) dès qu'un début de période coïncide avec celui d'un dépassement de capacité annuel.                                          |
| `PlatformInvoiceNature`                      | `AI_TOPUP`    | E   | Facture de recharge prépayée. Nature distincte : elle ne renouvelle jamais l'abonnement (plan §4.5.3) et n'entre pas dans les marquages « en retard » de `markOverdueInvoices` (`platform-invoice-service.ts:571`).                                                                                                                                         |

`InvoiceLineKind` ne change pas : les lignes d'un dépassement et d'une recharge
portent `kind = USAGE`, `capacityKey = AI_REQUESTS` et une clé
`metadata.aiKind` (`AI_OVERAGE` ou `AI_TOPUP`).

## 2. Modèles nouveaux d'agence

### 2.1 `AiUsageEvent` — une requête IA (lot A, colonnes du portefeuille au lot B)

```prisma
model AiUsageEvent {
  id                String         @id @default(uuid()) @db.Uuid
  tenantId          String         @map("tenant_id")
  /// UUID genere par le SERVEUR pour la requete (ai-controller.ts:129), le meme
  /// que l'evenement SSE `meta` et l'entite de l'audit AI_CHAT_TURN.
  requestId         String         @unique @map("request_id") @db.Uuid
  /// Sans relation : l'historique survit a la suppression du compte, comme AuditLog.
  userId            String?        @map("user_id")
  /// 'anthropic' | 'openrouter' | 'fake'.
  provider          String
  /// Modele REELLEMENT servi (BetaMessage.model), sinon le modele configure.
  model             String?
  /// Mode de la plateforme au moment de la reservation (photo).
  mode              AiBillingMode  @default(OFF)
  /// end_turn | max_rounds | aborted | error | refusal | lost (balayeur).
  outcome           String?
  errorCode         String?        @map("error_code")
  providerCalls     Int            @default(0) @map("provider_calls")
  rounds            Int            @default(0)
  toolCalls         Int            @default(0) @map("tool_calls")
  durationMs        Int?           @map("duration_ms")
  inputTokens       Int?           @map("input_tokens")
  outputTokens      Int?           @map("output_tokens")
  cacheReadTokens   Int?           @map("cache_read_tokens")
  cacheWriteTokens  Int?           @map("cache_write_tokens")
  /// Faux quand au moins un tour n'a rapporte aucun usage (flux coupe, fournisseur muet).
  usageComplete     Boolean        @default(false) @map("usage_complete")
  /// Cout fournisseur en dollars : source de verite, ne depend d'aucun taux de change.
  costUsd           Decimal?       @map("cost_usd") @db.Decimal(14, 6)
  /// Cout en FCFA = costUsd x fxRate, nul tant que le taux n'est pas renseigne.
  costXof           Decimal?       @map("cost_xof") @db.Decimal(14, 4)
  costSource        AiCostSource   @default(UNKNOWN) @map("cost_source")
  modelPriceId      String?        @map("model_price_id") @db.Uuid
  fxRate            Decimal?       @map("fx_rate") @db.Decimal(12, 6)
  /// Mois UTC de la reservation ('2026-09') : fixe, ne bouge pas a minuit.
  periodKey         String         @map("period_key")
  createdAt         DateTime       @default(now()) @map("created_at")

  // --- Lot B : portefeuille ---------------------------------------------
  status            AiUsageStatus  @default(SETTLED)
  /// Poids en credits (1 en V1 ; l'option « modele expert = 3 » est hors lots A a E).
  creditCost        Int            @default(1) @map("credit_cost")
  /// Credits effectivement consommes (0 quand la requete est liberee ou non facturee).
  creditsCharged    Int            @default(0) @map("credits_charged")
  source            AiCreditSource?
  /// [{ grantId, credits }] ou [{ source: 'OVERAGE', credits, unitPrice }].
  allocations       Json?
  /// Prix HT d'un credit de depassement, FIGE a la reservation (lot D).
  overageUnitPrice  Decimal?       @map("overage_unit_price") @db.Decimal(12, 2)
  /// Revenu HT impute par credit consomme (prix du pack / credits, prix de la
  /// recharge / credits, 0 pour le gratuit et l'offert) : base du tableau de marge.
  unitValueXof      Decimal?       @map("unit_value_xof") @db.Decimal(12, 4)
  /// SHADOW : la requete AURAIT ete bloquee en ENFORCE.
  shadowBlocked     Boolean        @default(false) @map("shadow_blocked")
  /// Au moins un text_delta a ete emis au client (regle d'abandon, spec FR-022).
  emittedText       Boolean        @default(false) @map("emitted_text")
  reservedAt        DateTime       @default(now()) @map("reserved_at")
  settledAt         DateTime?      @map("settled_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, periodKey, source])
  @@index([tenantId, reservedAt])
  @@index([tenantId, userId, reservedAt])
  @@index([status, reservedAt])
  @@map("ai_usage_events")
}
```

**Écriture.** Lot A : une ligne à la fin de `runChat`, juste avant
`logAuditEvent(AI_CHAT_TURN)` (`orchestrator.ts:210`), `status = SETTLED`,
`creditsCharged = 0`. Lot B : la ligne naît à la **réservation**
(`status = RESERVED`) et se termine à la fin de `runChat` par une mise à jour
**conditionnelle** (`WHERE request_id = $1 AND status = 'RESERVED'`) : une
requête ne se règle qu'une fois (I-4).

**Ce que la table ne contient jamais** : le texte d'un message ou d'une
réponse, le contexte d'écran, un résultat d'outil, l'adresse IP.

### 2.2 `AiCreditGrant` — un lot de crédits (lot B)

```prisma
model AiCreditGrant {
  id                 String         @id @default(uuid()) @db.Uuid
  tenantId           String         @map("tenant_id")
  /// MONTHLY_FREE, PACK_MONTHLY, ADMIN_GRANT ou TOPUP (CHECK en SQL).
  source             AiCreditSource
  quantity           Int
  /// Credits encore disponibles. Reservation = decrement ; jamais negatif (CHECK).
  remaining          Int
  /// Ordre de consommation : 1 gratuit, 2 offert, 3 pack, 4 recharge (spec FR-012).
  consumeRank        Int            @map("consume_rank") @db.SmallInt
  /// Revenu HT impute par credit consomme de ce lot (0 pour gratuit et offert).
  unitValueXof       Decimal        @default(0) @map("unit_value_xof") @db.Decimal(12, 4)
  validFrom          DateTime       @map("valid_from")
  expiresAt          DateTime       @map("expires_at")
  /// Pose par la tache d'expiration quand le journal a recu l'ecriture EXPIRE.
  expiredAt          DateTime?      @map("expired_at")
  /// '2026-09' pour MONTHLY_FREE et PACK_MONTHLY, nul sinon.
  periodKey          String?        @map("period_key")
  subscriptionItemId String?        @map("subscription_item_id")
  invoiceId          String?        @map("invoice_id")
  grantedById        String?        @map("granted_by_id")
  reason             String?
  createdAt          DateTime       @default(now()) @map("created_at")

  tenant           Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  subscriptionItem SubscriptionItem? @relation(fields: [subscriptionItemId], references: [id], onDelete: SetNull)
  invoice          Invoice?          @relation(fields: [invoiceId], references: [id], onDelete: SetNull)
  ledger           AiCreditLedger[]

  @@index([tenantId, expiresAt])
  @@index([subscriptionItemId])
  @@index([invoiceId])
  @@map("ai_credit_grants")
}
```

**Contraintes posées en SQL** (Prisma ne sait pas les exprimer) :

- `CHECK (remaining >= 0 AND remaining <= quantity)` ;
- `CHECK (source IN ('MONTHLY_FREE','PACK_MONTHLY','ADMIN_GRANT','TOPUP'))` ;
- unicité **partielle** `(tenant_id, period_key) WHERE source = 'MONTHLY_FREE'`
  (un lot gratuit par agence et par mois) ;
- unicité partielle `(subscription_item_id, period_key) WHERE source =
'PACK_MONTHLY'` (un lot par pack et par mois) ;
- unicité partielle `(invoice_id) WHERE source = 'TOPUP'` (une recharge réglée
  = un lot : rejouer un IPN ne crédite pas deux fois) ;
- index partiel de réservation `(tenant_id, consume_rank, expires_at,
created_at) WHERE remaining > 0`.

**Validité.** Un lot mensuel expire au plus tard le 1er du mois suivant à
00:00 UTC ; un lot de pack expire au plus tôt à `endsAt` de son élément
d'abonnement ; une recharge expire 12 mois après son règlement ; un crédit
offert expire à la date choisie (12 mois au plus).

### 2.3 `AiCreditLedger` — journal en ajout seul (lot B)

```prisma
model AiCreditLedger {
  /// Identifiant sequentiel : ordre total du journal (jamais expose tel quel en JSON : BigInt).
  id           BigInt            @id @default(autoincrement())
  tenantId     String            @map("tenant_id")
  grantId      String            @map("grant_id") @db.Uuid
  usageEventId String?           @map("usage_event_id") @db.Uuid
  entryType    AiLedgerEntryType @map("entry_type")
  /// Variation de `remaining` du lot : GRANT +q, RESERVE -1, RELEASE +1,
  /// EXPIRE -restant, REFUND et ADJUST +/-n. CONSUME vaut 0 : il confirme une reservation.
  delta        Int
  remainingAfter Int             @map("remaining_after")
  actorUserId  String?           @map("actor_user_id")
  reason       String?
  createdAt    DateTime          @default(now()) @map("created_at")

  tenant Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  grant  AiCreditGrant @relation(fields: [grantId], references: [id], onDelete: Cascade)

  @@index([grantId, id])
  @@index([tenantId, createdAt])
  @@index([usageEventId])
  @@map("ai_credit_ledger")
}
```

**Ajout seul.** Un déclencheur SQL `BEFORE UPDATE` refuse toute modification
d'une ligne du journal. Aucun `DELETE` applicatif n'existe ; la suppression
d'une agence supprime ses lignes en cascade (comme ses factures, `Invoice` est
en `onDelete: Cascade`). `usageEventId` n'a pas de clé étrangère : le journal
survit à une purge éventuelle de l'historique d'usage (durées à valider,
spec Q11).

### 2.4 `AiUsageMonth` — agrégat mensuel (lot B, facturation au lot D)

```prisma
model AiUsageMonth {
  id                 String             @id @default(uuid()) @db.Uuid
  tenantId           String             @map("tenant_id")
  periodKey          String             @map("period_key")
  requests           Int                @default(0)
  releasedRequests   Int                @default(0) @map("released_requests")
  freeCredits        Int                @default(0) @map("free_credits")
  packCredits        Int                @default(0) @map("pack_credits")
  giftCredits        Int                @default(0) @map("gift_credits")
  topupCredits       Int                @default(0) @map("topup_credits")
  unbilledCredits    Int                @default(0) @map("unbilled_credits")
  /// Credits de depassement RESERVES ou regles : sert au controle du plafond (I-5).
  overageCredits     Int                @default(0) @map("overage_credits")
  incompleteUsage    Int                @default(0) @map("incomplete_usage")
  costUsd            Decimal            @default(0) @map("cost_usd") @db.Decimal(14, 6)
  costXof            Decimal            @default(0) @map("cost_xof") @db.Decimal(14, 2)
  inputTokens        BigInt             @default(0) @map("input_tokens")
  outputTokens       BigInt             @default(0) @map("output_tokens")
  createdAt          DateTime           @default(now()) @map("created_at")
  updatedAt          DateTime           @updatedAt @map("updated_at")

  // --- Lot D : facturation du depassement et alertes du plafond -----------
  status             AiUsageMonthStatus @default(OPEN)
  /// Facture AI_USAGE du mois ; nul avant emission ou apres un avoir (mois rouvert).
  overageInvoiceId   String?            @map("overage_invoice_id")
  invoicedAt         DateTime?          @map("invoiced_at")
  overageAmountXof   Decimal?           @map("overage_amount_xof") @db.Decimal(14, 2)
  capAlert80SentAt   DateTime?          @map("cap_alert_80_sent_at")
  capAlert100SentAt  DateTime?          @map("cap_alert_100_sent_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, periodKey])
  @@index([tenantId, status])
  @@map("ai_usage_months")
}
```

`overageCredits` et `requests` sont modifiés **dans la transaction de
réservation** (sous verrou d'agence) ; les autres compteurs à la fin de la
requête. Le tout est reconstructible depuis `ai_usage_events` (script de
réconciliation, tâche T054). Les alertes 80/100 % de l'**allocation** passent
par `QuotaAlert` (capacité `AI_REQUESTS`) ; celles du **plafond de dépassement**
par les deux colonnes `cap_alert_*` : `QuotaAlert` ne sait porter qu'une famille
de seuils par capacité.

### 2.5 `TenantAiSettings` — réglages et dérogations d'une agence (lot B, dépassement au lot D)

```prisma
model TenantAiSettings {
  id                       String    @id @default(uuid()) @db.Uuid
  tenantId                 String    @unique @map("tenant_id")
  /// Interrupteur de l'ADMINISTRATEUR de l'agence (defaut : actif).
  aiEnabled                Boolean   @default(true) @map("ai_enabled")
  /// Coupure IMPOSEE par le super-admin : l'agence ne peut pas la lever.
  platformDisabledAt       DateTime? @map("platform_disabled_at")
  platformDisabledReason   String?   @map("platform_disabled_reason")
  platformDisabledById     String?   @map("platform_disabled_by_id")

  // --- Derogations du super-admin (nulles : valeurs de la plateforme) -----
  freeCreditsOverride      Int?      @map("free_credits_override")
  hardMonthlyCapOverride   Int?      @map("hard_monthly_cap_override")
  overageUnitPriceOverride Decimal?  @map("overage_unit_price_override") @db.Decimal(12, 2)
  notes                    String?

  // --- Lot D : depassement (opt-in de l'administrateur) ------------------
  overageEnabled           Boolean   @default(false) @map("overage_enabled")
  /// Plafond mensuel HT du depassement, OBLIGATOIRE quand overageEnabled (CHECK).
  overageMonthlyCapXof     Decimal?  @map("overage_monthly_cap_xof") @db.Decimal(14, 2)
  overageEnabledAt         DateTime? @map("overage_enabled_at")
  overageEnabledById       String?   @map("overage_enabled_by_id")

  updatedById              String?   @map("updated_by_id")
  createdAt                DateTime  @default(now()) @map("created_at")
  updatedAt                DateTime  @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_ai_settings")
}
```

Une ligne **n'est créée qu'à la première écriture** ; la lecture d'une agence
sans ligne renvoie les valeurs par défaut sans écrire (même patron que
`AgencyFinanceSettings` et `OwnerPortalSettings`). `CHECK (NOT overage_enabled
OR overage_monthly_cap_xof > 0)`.

## 3. Modèles globaux (plateforme, sans `tenantId`)

À classer dans `GLOBAL_MODELS` du test `schema-tenant-coverage`
(`__tests__/unit/schema-tenant-coverage.test.ts:61`), avec le commentaire de
leur raison d'être, comme `CatalogItem` et `PlatformInvoiceSequence`.

### 3.1 `PlatformAiBillingSettings` — réglage unique (lot A, colonnes ajoutées par lot)

```prisma
/// Reglage de la facturation IA de la plateforme : UNE ligne (id fixe 'default'),
/// ecrite par le super-admin. Absente : valeurs par defaut du code, mode OFF.
/// Meme patron que PlatformAiSettings (PR #61). Aucun secret ici.
model PlatformAiBillingSettings {
  id                       String        @id @default("default")
  mode                     AiBillingMode @default(OFF)
  /// Taux USD -> FCFA pour valoriser les couts. Nul : costXof reste nul (costUsd est tenu).
  usdToXofRate             Decimal?      @map("usd_to_xof_rate") @db.Decimal(12, 6)
  /// Requetes RESERVED plus vieilles que ce delai sont liberees par le balayeur (lot B).
  stuckReservationMinutes  Int           @default(15) @map("stuck_reservation_minutes")
  /// Lot B : gratuit.
  freeCreditsPerMember     Int           @default(10) @map("free_credits_per_member")
  freeCreditsCap           Int           @default(100) @map("free_credits_cap")
  /// Lot B : plafond dur mensuel par agence, tous credits confondus (anti-abus).
  hardMonthlyCap           Int           @default(5000) @map("hard_monthly_cap")
  /// Lot B : plafond de cout d'UNE requete en FCFA ; nul = desactive (spec FR-127).
  maxCostPerRequestXof     Decimal?      @map("max_cost_per_request_xof") @db.Decimal(14, 2)
  /// Lot B : budget gratuit de la plateforme par mois ; alerte au-dela. Nul : pas d'alerte.
  freeBudgetMonthlyCredits Int?          @map("free_budget_monthly_credits")
  /// Lot D : depassement.
  overageUnitPriceXof      Decimal       @default(120) @map("overage_unit_price_xof") @db.Decimal(12, 2)
  overageCapMinXof         Decimal       @default(1000) @map("overage_cap_min_xof") @db.Decimal(14, 2)
  overageCapMaxXof         Decimal       @default(500000) @map("overage_cap_max_xof") @db.Decimal(14, 2)
  overageCapSuggestedXof   Decimal       @default(20000) @map("overage_cap_suggested_xof") @db.Decimal(14, 2)
  /// Lot C : plancher de marge : prix unitaire d'un pack < cout moyen mesure x ce coefficient = alerte.
  marginFloorMultiplier    Decimal       @default(1.30) @map("margin_floor_multiplier") @db.Decimal(4, 2)
  updatedById              String?       @map("updated_by_id")
  updatedAt                DateTime      @updatedAt @map("updated_at")

  @@map("platform_ai_billing_settings")
}
```

Les valeurs par défaut de ce tableau sont celles de la spec **[Par défaut — à
valider]** (§4 D1 à D7, §7). Elles se modifient sans déploiement ; chaque
changement écrit un audit sans secret.

### 3.2 `AiTopupOffer` — offres de recharge (lot E)

```prisma
model AiTopupOffer {
  id             String   @id @default(uuid()) @db.Uuid
  code           String   @unique
  name           String
  credits        Int
  /// Prix HT en FCFA, TVA 18 % en sus (PLATFORM_TAX_RATE_PERCENT).
  priceExclTax   Decimal  @map("price_excl_tax") @db.Decimal(14, 2)
  validityMonths Int      @default(12) @map("validity_months")
  isSellable     Boolean  @default(true) @map("is_sellable")
  sortOrder      Int      @default(0) @map("sort_order")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@map("ai_topup_offers")
}
```

Amorçage : `AI_TOPUP_100` — 100 crédits, 12 900 HT, 12 mois **[Par défaut — à
valider]**. Le prix se fige sur la facture de l'achat, pas sur l'offre.

### 3.3 `AiModelPrice` — tarif versionné d'un modèle (lot A)

```prisma
/// Tarif fournisseur d'un modele, en dollars par million de jetons. Jamais
/// modifie : un changement de tarif est une NOUVELLE ligne a effet date, si bien
/// que le cout d'une requete passee ne bouge pas.
model AiModelPrice {
  id                String   @id @default(uuid()) @db.Uuid
  provider          String
  model             String
  effectiveFrom     DateTime @map("effective_from")
  currency          String   @default("USD")
  inputPerMTok      Decimal  @map("input_per_mtok") @db.Decimal(14, 6)
  outputPerMTok     Decimal  @map("output_per_mtok") @db.Decimal(14, 6)
  cacheReadPerMTok  Decimal? @map("cache_read_per_mtok") @db.Decimal(14, 6)
  cacheWritePerMTok Decimal? @map("cache_write_per_mtok") @db.Decimal(14, 6)
  note              String?
  createdById       String?  @map("created_by_id")
  createdAt         DateTime @default(now()) @map("created_at")

  @@unique([provider, model, effectiveFrom])
  @@index([provider, model, effectiveFrom(sort: Desc)])
  @@map("ai_model_prices")
}
```

Aucun tarif n'est amorcé par la spec : les prix des fournisseurs changent et
ne s'inventent pas. Le super-admin les saisit au lot A d'après les grilles
publiées ; un modèle sans tarif donne `cost_source = UNKNOWN` et une alerte.

## 4. Colonnes ajoutées à des tables existantes

**Aucune.** Le lien entre un lot de recharge et sa facture, entre un lot de
pack et son élément d'abonnement, entre un mois et sa facture de dépassement
vit dans les tables nouvelles (`AiCreditGrant.invoiceId`,
`AiCreditGrant.subscriptionItemId`, `AiUsageMonth.overageInvoiceId`). Les
relations inverses (`Tenant`, `SubscriptionItem`, `Invoice`) sont des champs de
relation Prisma, pas des colonnes.

Lignes de **données** (pas de schéma) :

| Lot | Table                | Lignes                                                                                                                                                                                                                                                                   |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C   | `catalog_items`      | `EXT_IA_100` (9 900), `EXT_IA_500` (39 900), `EXT_IA_2000` (129 900) : `kind = EXTENSION`, `rules = { requiresAnyOf: [tous les packs de base], aiPack: true }`, `is_sellable = true`. Sources : `DEFAULT_CATALOG` (`catalog.ts`), seed `catalog-seed.ts`, migration SQL. |
| C   | `catalog_capacities` | `AI_REQUESTS` = 100, 500, 2 000 pour les trois codes ci-dessus (une unité = un mois de crédits).                                                                                                                                                                         |
| E   | `ai_topup_offers`    | `AI_TOPUP_100`.                                                                                                                                                                                                                                                          |

## 5. Lectures dérivées (aucune colonne)

- **Solde d'une agence** = `SUM(remaining)` des lots `expires_at > now()` et
  `valid_from <= now()` ; par source et par rang pour l'affichage. Le solde ne
  dépend jamais de la tâche d'expiration : le filtre de date suffit.
- **Réservé en cours** = nombre d'événements `RESERVED` de l'agence.
- **Allocation du mois** = somme de `quantity` des lots de `period_key` courant
  (gratuit, packs, offerts) ; **consommé du mois** = `AiUsageMonth` de la période.
  Le pourcentage d'une alerte 80/100 % est consommé / allocation.
- **Réserve gratuite** = `min(freeCreditsPerMember × collaborateurs actifs,
freeCreditsCap)`, sauf `TenantAiSettings.freeCreditsOverride`. Un
  collaborateur actif est un `Membership` `ACTIVE` d'un utilisateur actif
  détenteur d'au moins un rôle de portée `TENANT` (la définition de
  `requireTenantAccess`, `middleware/tenant-middleware.ts:127-152`).
- **Revenu imputé du mois** = `SUM(unit_value_xof × credits_charged)` des
  événements réglés ; **marge brute** = revenu imputé − `SUM(cost_xof)` ;
  **casse** = `SUM(remaining)` des lots expirés (crédits payés jamais
  consommés, marge supplémentaire déclarée à part).
- **Frais de passerelle réels** d'une facture = `platform_payment_checkouts.
provider_fees` (`schema.prisma:8036`, écrit par
  `applyPlatformProviderStatus`, `platform-payment-service.ts:585`).

## 6. Migration

- **Découpage** : une migration additive **par lot** (`<horodatage>_ia_credits_<lot>`),
  plus une migration d'enum **isolée** quand une valeur est ajoutée à un enum
  existant, placée juste avant la migration qui s'en sert.

  | Lot | Migrations (dans l'ordre)                                          | Enums nouveaux                                                               | Tables créées                                                                   | Colonnes ajoutées à une table du lot précédent                                                                                                                                                                                                                                       |
  | --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | A   | `ia_credits_mesure`                                                | `AiBillingMode`, `AiCostSource`                                              | `ai_usage_events`, `ai_model_prices`, `platform_ai_billing_settings`            | —                                                                                                                                                                                                                                                                                    |
  | B   | `ia_credits_enum_capacity` (isolée) puis `ia_credits_portefeuille` | `AiCreditSource`, `AiUsageStatus`, `AiLedgerEntryType`, `AiUsageMonthStatus` | `ai_credit_grants`, `ai_credit_ledger`, `ai_usage_months`, `tenant_ai_settings` | `ai_usage_events` : 11 colonnes (status, credit_cost, credits_charged, source, allocations, overage_unit_price, unit_value_xof, shadow_blocked, emitted_text, reserved_at, settled_at) ; `platform_ai_billing_settings` : 6 colonnes (gratuit, plafond dur, plafond de coût, budget) |
  | C   | `ia_credits_catalogue`                                             | —                                                                            | —                                                                               | `platform_ai_billing_settings.margin_floor_multiplier` ; données du catalogue (§4)                                                                                                                                                                                                   |
  | D   | `ia_credits_enum_usage` (isolée) puis `ia_credits_depassement`     | —                                                                            | —                                                                               | `ai_usage_months` : 6 colonnes (status, facture, date, montant, deux alertes) ; `tenant_ai_settings` : 4 colonnes ; `platform_ai_billing_settings` : 4 colonnes ; index unique partiel des factures `AI_USAGE`                                                                       |
  | E   | `ia_credits_enum_topup` (isolée) puis `ia_credits_recharges`       | —                                                                            | `ai_topup_offers`                                                               | index unique partiel des factures `AI_TOPUP` ; amorçage de l'offre                                                                                                                                                                                                                   |

  Total : 6 enums nouveaux, 3 valeurs d'enums existants, 8 tables, 32
  colonnes ajoutées au fil des lots (17 au lot B, 1 au lot C, 14 au lot D).

- **Index uniques partiels des factures** (SQL, lots D et E), sur le modèle de
  `invoices_platform_period_key` : `CREATE UNIQUE INDEX
"invoices_ai_usage_period_key" ON "invoices"("tenant_id", "period_start")
WHERE "kind" = 'PLATFORM' AND "billing_nature" = 'AI_USAGE' AND "status" <>
'CANCELED'` — un dépassement facturé par agence et par mois, jamais deux —,
  et l'index équivalent n'est **pas** posé pour `AI_TOPUP` (plusieurs recharges
  le même jour sont légitimes ; l'unicité est portée par `ai_credit_grants`).
- **Reprise de données** : aucune. L'historique d'avant le lot A n'existe pas
  (rien n'a jamais été mesuré) ; aucun crédit n'est distribué rétroactivement.
- **Retour arrière** : une migration Prisma n'a pas de « down ». Chaque lot
  fournit un `rollback.sql` (relu avec la PR) qui supprime, dans l'ordre
  inverse, ses tables, colonnes, index et types. Il est sûr tant que le mode est
  `OFF` ou `SHADOW`. Au-delà (`ENFORCE`, factures émises), les tables portent
  des faits comptables — lots de recharges payées, factures liées — et ne se
  suppriment pas à la légère : le retour arrière normal est de repasser le mode
  à `OFF`. **Les trois valeurs ajoutées aux enums existants ne se retirent
  pas** ; elles sont inoffensives (aucune ligne ne les porte tant que le lot
  n'est pas actif) et documentées comme irréversibles dans chaque
  `rollback.sql`.
- **Vérification** : `prisma migrate deploy` sur une copie de la base de
  démonstration (`npm run demo:sync -- <ref> --migrate`), puis la suite
  d'abonnement et de facturation inchangée doit rester verte.
- **Client Prisma** : `npx prisma generate` depuis `packages/api`. Un worktree
  dont `node_modules` est une jonction ne doit pas régénérer le client
  partagé (piège du HANDOFF).
- **Sauvegarde** : la table `ai_usage_events` grossit d'une ligne par requête ;
  volumétrie et purge : spec §9 R-13 et Q11.

## 7. Invariants à tester

| #    | Invariant                                                                                                                                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-1  | Pour tout lot : `0 <= remaining <= quantity`, y compris sous 50 réservations simultanées.                                                                                                                                                                                                                 |
| I-2  | Pour tout lot : la somme des `delta` de ses lignes de journal égale `remaining` (le lot naît par une ligne `GRANT`). Aucune ligne de journal n'est jamais modifiée.                                                                                                                                       |
| I-3  | Un événement `SETTLED` avec `credits_charged = 1` a exactement une ligne `RESERVE` et une ligne `CONSUME` ; un événement `RELEASED` ou `EXPIRED` a une ligne `RESERVE` et une ligne `RELEASE` de somme nulle, sauf si le lot a expiré entre-temps (aucune restitution) ; un `RESERVED` n'a que `RESERVE`. |
| I-4  | `request_id` est unique ; un événement passe de `RESERVED` à un état final **au plus une fois** (mise à jour conditionnelle) : le règlement, la libération et le balayeur ne peuvent pas se doubler.                                                                                                      |
| I-5  | `ai_usage_months.overage_credits` égale le nombre d'événements de la période de source `OVERAGE` et de statut `RESERVED` ou `SETTLED` ; un mois `INVOICED` ne change plus.                                                                                                                                |
| I-6  | Un mois n'est facturé qu'après le balayage des réservations orphelines de ce mois : aucun événement `RESERVED` de plus de `stuckReservationMinutes` ne subsiste dans un mois `INVOICED`.                                                                                                                  |
| I-7  | Au plus une facture `AI_USAGE` non annulée par `(agence, début de période)` ; la somme des `quantity` de ses lignes `USAGE` égale les crédits de dépassement réglés du mois.                                                                                                                              |
| I-8  | Un lot `TOPUP` correspond à exactement une facture `AI_TOPUP` réglée (`invoice_id` unique) et `quantity = crédits de l'offre × quantité achetée`.                                                                                                                                                         |
| I-9  | Au plus un lot `MONTHLY_FREE` par `(agence, mois)` ; au plus un lot `PACK_MONTHLY` par `(élément d'abonnement, mois)`.                                                                                                                                                                                    |
| I-10 | `expires_at` d'un lot `MONTHLY_FREE` ou `PACK_MONTHLY` ne dépasse pas le 1er du mois suivant à 00:00 UTC ; celui d'un `ADMIN_GRANT` ne dépasse pas 12 mois.                                                                                                                                               |
| I-11 | `period_key` d'un événement est le mois UTC de son `reserved_at` et ne change jamais.                                                                                                                                                                                                                     |
| I-12 | Tout modèle de cette spec porte `tenant_id`, sauf `PlatformAiBillingSettings`, `AiTopupOffer` et `AiModelPrice` (classés `GLOBAL_MODELS`).                                                                                                                                                                |
| I-13 | Au moment d'une réservation de dépassement : `(overage_credits + 1) × prix unitaire figé <= plafond mensuel` de l'agence, et le total du mois reste sous `hardMonthlyCap`.                                                                                                                                |
| I-14 | Aucune requête n'est débitée deux fois : la somme des `credits_charged` du mois égale la somme des `CONSUME` du journal plus les crédits de dépassement réglés.                                                                                                                                           |
| I-15 | Aucun événement, journal ni audit ne contient le texte d'un message, d'une réponse ou d'un résultat d'outil (test de recherche du texte injecté dans toutes les tables et lignes d'audit).                                                                                                                |
