# Abonnements des agences par packs

Rédigé le 25 septembre 2026 (vague 1). Référence des agents des vagues 2 et 3.
La seule source de prix est la grille du site
(`ImmoTopiaWebsite2Version2/site/src/lib/pricing.ts`), recopiée dans
`packages/api/src/lib/subscription/catalog.ts` (`DEFAULT_CATALOG`).
« Agence » désigne le `Tenant`, jamais un locataire.

## 1. Ce qui change

| Avant | Maintenant |
|---|---|
| `Subscription.planKey` BASIC/PRO/ELITE, une étiquette sans contenu | `planKey` facultatif et **déprécié** ; l'abonnement est la somme de ses `SubscriptionItem` |
| `TenantModule` activés un par un | Modules **déduits des packs** (`source = PACK`) ; un basculement manuel du super-admin devient une dérogation (`source = OVERRIDE`) |
| Aucune capacité | Réserve de lots, de copropriétés et de chantiers, mesurée et plafonnée |
| `Invoice` sans lignes | `InvoiceLine`, HT/TVA séparés, `kind` PLATFORM ou RENTAL |

## 2. Catalogue (global, éditable, D12)

| Code | Nature | HT/mois | Mise en route | Modules | Capacité incluse |
|---|---|---:|---:|---|---|
| `AGENCE` | PACK | 29 900 | 100 000 | AGENCY | 100 lots |
| `SYNDIC` | PACK | 49 900 | 150 000 | SYNDIC | 2 copropriétés, 100 lots |
| `PROMOTEUR` | PACK | 149 900 | 450 000 | PROMOTER | 2 chantiers, 150 lots |
| `INTEGRE` | PACK, `exclusiveGroup = INTEGRE` | 249 900 | 650 000 | les trois | 3 chantiers, 3 copropriétés, 300 lots |
| `EXT_LOTS_10` | EXTENSION | 1 500 (1 000 avec Promoteur ou Intégré ; 750 pour l'Agence seule au-delà du 300e lot) | — | — | 10 lots |
| `EXT_COPRO` | EXTENSION (Syndic ou Intégré) | 10 000 | — | — | 1 copropriété |
| `EXT_CHANTIER` | EXTENSION (Promoteur ou Intégré) | 40 000 (35 000 avec l'Intégré) | — | — | 1 chantier |
| `SETUP_<PACK>` | SETUP, facturé une fois | 0 | montant du pack | — | — |

Les variantes de prix vivent dans `catalog_items.rules` (`CatalogRules` :
`byHeldPacks`, `lotTiers`, `requiresAnyOf`). Le catalogue est amorcé par la
migration et réaligné par `npm run db:seed:catalog` (`--missing-only` pour ne
pas écraser une modification du super-admin). **Le prix est figé** dans
`SubscriptionItem.unitMonthlyPrice` à la souscription : modifier le catalogue
ne change aucun abonnement en cours.

## 3. Modèle (migration `20260928090000_abonnements_packs`, additive)

- `CatalogItem` + `CatalogCapacity` : **globaux** (listés dans `GLOBAL_MODELS`).
- `SubscriptionItem` (tenantId) : `quantity`, `unitMonthlyPrice`,
  `unitSetupPrice`, `discountPercent`, `status` SCHEDULED/ACTIVE/ENDED,
  `startsAt`, `endsAt` (ACTIVE avec `endsAt` futur = retrait à l'échéance),
  `endReason`, `replacesItemId`, `billedThrough` (vague 3).
- `CapacityOverride` (tenantId) : `capacityKey`, `delta`, `reason`, `startsAt`,
  `expiresAt`, `revokedAt`.
- `LotActivation` (tenantId) : registre des lots comptés. Index unique
  **partiel** `lot_activations_open_unit_key (tenant_id, unit_key) WHERE
  deactivated_at IS NULL` et contrôle `unit_key ~ '^(P|SL|PL):.+$'`. Pas de clé
  étrangère vers les biens et lots : l'historique survit à leur suppression.
- `InvoiceLine` (tenantId) : `invoiceId` **nul = ligne en attente** (prorata,
  avoir) que la prochaine facture reprendra.
- `UsageSnapshot` (un relevé par agence, capacité et jour) et `QuotaAlert`
  (unique par agence, capacité, seuil, période) : tables prêtes, écrites par la
  vague 3.
- `Subscription` : + `trialEndsAt`, `pastDueAt`, `graceDays` (7),
  `quotaPolicy` (BILL_OVERAGE), `comboDiscountPercent` (10), `nextBillingAt`,
  `items`. Les essais existants ont reçu `trialEndsAt = currentPeriodEnd`.
- `TenantModule` : + `source` (PACK|OVERRIDE), `expiresAt` (fin d'un OVERRIDE),
  `disabledAt` (module retiré, donc en lecture seule).
- `Invoice` : + `kind` (PLATFORM par défaut ; RENTAL pour les factures déjà
  reliées à `RentalInstallment.invoice_id` / `RentalPayment.invoice_id`, lien
  conservé tel quel), `periodStart/End`, `amountExclTax`, `taxAmount`,
  `taxRate`, `lines`. `amountTotal` reste le TTC.

## 4. Ce qui compte comme un lot

Réserve **unique** (D3) : les capacités LOTS de tous les packs et extensions
s'additionnent, quelle que soit la nature du lot. Même règle pour les
copropriétés et les chantiers.

| Nature | Compte quand | Clé d'unité |
|---|---|---|
| Logement `RENTAL_UNIT` (D1) | bien de l'agence **ou** bien CLIENT (`tenantId` nul) rattaché par un mandat actif ou un bail de l'agence, qui a (statut ≠ DRAFT, SOLD, ARCHIVED **et** mode RENTAL ou SHORT_TERM) **ou** un bail ACTIVE. Un immeuble découpé (a des `containerChildren`) ne compte jamais ; ses unités comptent. | `P:<propertyId>` |
| Lot de copropriété `COPRO_LOT` (D2) | lot APARTMENT, OFFICE ou COMMERCIAL d'une copropriété ACTIVE ou IN_DISPUTE (D14) | `P:<propertyId>` si le lot a un bien, sinon `SL:<syndicateLotId>` |
| Lot de programme `PROGRAM_LOT` | `SiteLot` d'un chantier PLANNED, IN_PROGRESS ou SUSPENDED (D14) | `P:<propertyId>` après bascule, sinon `PL:<siteLotId>` |

Une unité qui qualifie à plusieurs titres n'est comptée qu'une fois (priorité
logement > copropriété > programme). À la bascule au patrimoine, `PL:` est
fermé et `P:` ouvert dans la même transaction (solde nul) ; le bien reste
compté tant que son chantier est ouvert. Copropriétés et chantiers actifs sont
comptés directement dans leurs tables (D14).

## 5. Règles de prix (`lib/subscription/pricing.ts`, montants FCFA HT entiers)

- **Mensuel** = Σ (quantité × prix figé × (1 − remise de l'élément)).
- **Remise de combinaison** (D6) : `comboDiscountPercent` % du prix de **base**
  du pack le moins cher, dès 2 packs ; extensions exclues. L'Intégré ne se
  cumule avec aucun autre pack (`exclusiveGroup`).
- **Annuel** = 11 mensualités (`cycleMultiplier('ANNUAL') = 11`).
- **Blocs de lots** : chaque bloc est pricé au rang de son premier lot, un
  `SubscriptionItem` par palier (`planExtensionUnits`).
- **Dépassement** (D4/D5) : prix d'un bloc / 10 par lot au rang du lot ;
  copropriété et chantier au prix de l'extension. Chiffré seulement en
  `BILL_OVERAGE`.
- **Prorata** (D7) : jours restants de la période, jour d'ajout compris,
  arrondi à l'unité (`prorateAmount`).
- **TVA** (D9) : 18 % en ligne `TAX` séparée, sur le total HT. Émetteur :
  Alliance Consultants.

Exemples vérifiés par `__tests__/unit/subscription.pricing.test.ts` :
Agence 180 logements → 41 900 · Syndic 2 copropriétés / 140 lots → 55 900 ·
Agence + Syndic 320 lots → 94 810 · Promoteur 3 chantiers / 120 lots → 189 900
· Intégré → 249 900 (2 748 900 par an) · +3 blocs le 16 d'un mois de 30 jours
→ 2 250. L'Agence seule reproduit `agencePrice` du site de 0 à 600 logements.

## 6. Cycle de vie (D7, D8, D11, D13)

- **Ajout** : immédiat ; hors essai, ligne PRORATA en attente (et variation
  prorata de la remise de combinaison quand c'est un pack).
- **Retrait** : à l'échéance (`endsAt = currentPeriodEnd`), sans
  remboursement ; immédiat pendant l'essai ou sur demande du super-admin avec
  raison. Retrait partiel d'extension : le reste repart au même prix figé.
- **Changement de pack** : montée (nouveau prix > anciens) immédiate avec
  avoirs CREDIT au prorata ; descente programmée (SCHEDULED) à l'échéance.
- **Phase** : essai de 30 jours (`trialEndsAt`, prolongeable) → fin d'essai
  non convertie ou PAST_DUE → `graceDays` jours de grâce → lecture seule. Une
  période ACTIVE échue sans renouvellement suit la même grâce. Portails et
  paiements des locataires **jamais** bloqués.
- **Module retiré** : ligne `TenantModule` gardée (`enabled = false`,
  `disabledAt`) → `READ_ONLY` : lecture et export, pas d'écriture.
- **Reprise** : agence déjà au-delà de sa capacité → `CapacityOverride`
  « Reprise » de 3 mois, arrondi à la dizaine pour les lots.

## 7. Décisions (Baba, 25/09)

D1 logement compté (définition §4) · D2 lot de copropriété principal · D3
réserve unique · D4 dépassement facturé par défaut, politique BLOCK /
BILL_OVERAGE / WARN_ONLY par agence · D5 prix du lot selon la grille · D6 remise
10 % sur la base du pack le moins cher, Intégré exclusif · D7 ajout immédiat au
prorata, retrait à l'échéance, montée immédiate avec avoir, descente à
l'échéance · D8 essai 30 j, grâce 7 j, lecture seule · D9 facturation
automatique, TVA 18 %, émetteur Alliance Consultants · D10 paiement
PaySecureHub d'ImmoTopia et constat manuel · D11 module retiré en lecture
seule · D12 catalogue en base, prix figé · D13 dérogation « Reprise » de 3 mois
· D14 copropriété active = ACTIVE, IN_DISPUTE ; chantier actif = PLANNED,
IN_PROGRESS, SUSPENDED.

## 8. Vagues

| Vague | Contenu | État |
|---|---|---|
| 1 | Schéma, catalogue, bibliothèque pure, service, routes super-admin, provisioning par packs, reprise, `SUBSCRIPTION_ENFORCEMENT` | **livrée** |
| 2 | Gardes de modules sur les routes et le menu web ; appels au registre des lots dans les services métier ; écrans super-admin et agence | à faire |
| 3 | Émission automatique des factures, relevés d'usage, alertes de seuil, paiement PaySecureHub et constat manuel, passage PAST_DUE | à faire |

## 9. Contrats exposés

### Bibliothèque pure — `src/lib/subscription` (index.ts)

- `catalog` : `DEFAULT_CATALOG`, `PACK`, `EXTENSION`, `TRIAL_DAYS`,
  `ANNUAL_MONTHS`, `PLATFORM_TAX_RATE_PERCENT`, `PLATFORM_INVOICE_ISSUER`,
  `packsForModules(modules)`.
- `features` : `MODULE_FEATURES`, `featuresForModules(modules)`,
  `modulesForFeature(feature)`. Fonctionnalités : CORE, CRM, SALES, RENTAL,
  PATRIMOINE, SYNDIC, CONSTRUCTION.
- `entitlements` : `buildEntitlements(input)` → `TenantEntitlements`,
  `validateExclusivity`, `computeCapacityLimits`, `resolveModuleAccess`,
  `resolveSubscriptionPhase`, `evaluateQuota(capacity, increment, policy,
  enforcement)` → ALLOW | WARN | BILL | BLOCK.
- `pricing` : `estimateMonthly`, `computeRecurringLines`, `computeOverageLines`,
  `computeSetupLines`, `planExtensionUnits`, `resolveUnitMonthlyPrice`,
  `prorateAmount`, `scaleLinesForCycle`, `addBillingPeriod`, `finalizeInvoice`.
- `guards` (lisent `SUBSCRIPTION_ENFORCEMENT`) :
  `assertModuleAccess(ent, moduleKey, { write })`,
  `assertSubscriptionWritable(ent)`, `checkQuota(ent, capacityKey, increment)`.
  `off` ne fait rien, `warn` journalise, `enforce` lève.
- `getSubscriptionEnforcement()` : `off | warn | enforce`, défaut `warn`.

```ts
interface TenantEntitlements {
  tenantId; subscriptionId; status: SubscriptionStatus | 'NONE';
  phase: 'NONE' | 'TRIAL' | 'ACTIVE' | 'GRACE' | 'READ_ONLY';
  readOnly: boolean; readOnlyReason; trialEndsAt; graceEndsAt;
  billingCycle; currentPeriodStart; currentPeriodEnd;
  packs: string[]; modules: ModuleKey[];                 // modules FULL
  moduleAccess: Record<ModuleKey, 'FULL' | 'READ_ONLY' | 'NONE'>;
  features: string[];
  capacities: Record<'LOTS' | 'COPROPRIETES' | 'CHANTIERS',
    { included; extensions; overrides; limit; used; remaining; overBy }>;
  quotaPolicy; enforcement; computedAt;
}
```

### Service — `src/services/subscription-v2-service.ts`

- `getEntitlements(tenantId, { fresh?, now?, db? })` : cache 30 s par agence ;
  `invalidateEntitlements(tenantId)` après toute écriture (fait par le service).
- `registerUsageProvider(capacityKey, (db, tenantId) => Promise<number>)` :
  point d'extension de `used` (défaut : LOTS = activations ouvertes, sinon
  comptage D14) ; `getUsage(tenantId)`.
- `addSubscriptionItem`, `removeSubscriptionItem`, `changePack`,
  `grantCapacityOverride`, `revokeCapacityOverride`,
  `updateSubscriptionSettings`, `clearModuleOverride`, `updateCatalogItem`,
  `listCatalog`, `getSubscriptionOverview`, `previewNextInvoice` (aucune
  émission), `planInitialItems`, `loadCatalogByCodes`.
- `syncTenantModulesTx(tx, tenantId)` : recalcule les TenantModule PACK, laisse
  les OVERRIDE valides, reprend les OVERRIDE expirés.
- `applyDueItemTransitionsTx(tx, tenantId, now)` : ENDED/SCHEDULED dus →
  statut à jour + modules resynchronisés. **À appeler par la vague 3** à chaque
  changement de période.

### Registre des lots — `src/services/lot-registry-service.ts` (vague 2)

- `activateLotTx(tx, tenantId, { kind, propertyId?, syndicateLotId?,
  siteLotId? }, actorUserId)` : idempotent, renvoie `{ activationId, created }`.
- `deactivateLotTx(tx, tenantId, unitKey, reason)`,
  `transferProgramLotTx(tx, tenantId, siteLotId, propertyId, actor)`,
  `unitKeyFor(ref)`.
- `computeQualifyingUnits(db, tenantId)`, `reconcileLotActivations(tenantId, {
  dryRun })` : contrôle de cohérence.
- Points d'appel attendus : création, changement de statut ou de mode et
  suppression d'un bien ; activation et fin d'un bail ; création et suppression
  d'un lot de copropriété, changement de statut d'une copropriété ; création
  d'un lot de programme, bascule au patrimoine, clôture d'un chantier. Avant
  une activation : `checkQuota(await getEntitlements(tenantId), 'LOTS')`.

### Erreurs — `middleware/error-middleware.ts`

| Classe | HTTP | `code` | `data` |
|---|---|---|---|
| `ModuleNotIncludedError` | 403 | `MODULE_NOT_INCLUDED` | `{ moduleKey }` |
| `ModuleReadOnlyError` | 403 | `MODULE_READ_ONLY` | `{ moduleKey }` |
| `SubscriptionReadOnlyError` | 403 | `SUBSCRIPTION_READ_ONLY` | `{ reason }` |
| `QuotaExceededError` | 409 | `QUOTA_EXCEEDED` | `{ capacityKey, limit, used, requested }` |

### Routes

Super-admin, `/api/admin` (permissions `PLATFORM_SUBSCRIPTIONS_VIEW` / `_EDIT`,
`PLATFORM_MODULES_EDIT`) : `GET /catalog`, `POST /catalog/quote`,
`PATCH /catalog/:code`, `GET /tenants/:id/entitlements`,
`GET /tenants/:id/subscription/overview`,
`POST /tenants/:id/subscription/items`,
`DELETE /tenants/:id/subscription/items/:itemId` (`{ immediate, reason,
quantity }`), `POST /tenants/:id/subscription/change-pack`,
`PATCH /tenants/:id/subscription/settings`,
`GET|POST /tenants/:id/subscription/overrides`,
`DELETE /tenants/:id/subscription/overrides/:overrideId`,
`GET /tenants/:id/subscription/invoice-preview`,
`POST /tenants/:id/subscription/lots/reconcile`,
`DELETE /tenants/:id/modules/:moduleKey/override`.

Agence : `GET /api/tenants/:tenantId/entitlements` (`requireTenantAccess`), à
lire par le menu web.

`POST /api/admin/tenants` accepte `items: [{ code, quantity? }]` ; sans `items`,
l'ancien format `modules`/`planKey` est converti en packs (AGENCY → AGENCE,
OPERATOR → INTEGRE) et garde `planKey` (PRO par défaut). La réponse ajoute
`subscription.items` et `subscription.trialEndsAt` ; `planKey` peut être nul.

## 10. Reprise (`npm run db:migrate:subscriptions-to-packs [-- --dry-run]`)

Idempotente. Résultat sur la base de développement le 25/09 :

| Agence | Modules avant | Packs | Lots comptés | Dérogations |
|---|---|---|---|---|
| Agence Immobilière du Mali | aucun | AGENCE, **à revoir** | 9 (9 logements) | — |
| Bamako Immobilier | aucun | AGENCE, **à revoir** | 0 | — |
| Ivoire Résidences | AGENCY | AGENCE | 128 (72 logements, 56 lots de copropriété) ; 3 copropriétés | LOTS +30, COPROPRIETES +3, jusqu'au 25/12/2026 |
| QA2 Agence jetable (suspendue) | aucun | AGENCE, **à revoir** | 0 | — |

Aucune agence n'avait d'abonnement : un essai de 30 jours a été créé pour
chacune.

## 11. Points à trancher

1. **Ivoire Résidences** gère 3 copropriétés sans le module Syndic (les gardes
   n'étaient pas branchées). La reprise a suivi la règle « modules → packs » :
   Agence seule, avec dérogation. Dès que la vague 2 branchera les gardes, le
   syndic lui sera fermé. Proposition : lui attribuer AGENCE + SYNDIC.
2. **75 FCFA au-delà du 300e lot** : appliqué quand l'agence ne détient que
   l'Agence (calque de `agencePrice`). Avec Agence + Syndic, tous les lots
   supplémentaires restent à 150 (c'est ce que donne l'exemple à 94 810).
3. **Dépassement** facturé au lot (grille du site), pas par bloc de 10 ; en
   annuel, l'aperçu chiffre un mois de dépassement : la vague 3 fixe la règle
   (pic ou fin de période, depuis `UsageSnapshot`).
4. D1 exclut aussi les biens **SOLD** et **ARCHIVED** sans bail actif, en plus
   des brouillons.
5. Un retrait de pack laisse les extensions qui en dépendaient : à décider
   (les retirer à la même échéance ?).
6. Les messages d'erreur à valeur interpolée (codes d'offre) restent en
   français ; les messages fixes sont traduits en anglais et en arabe.
