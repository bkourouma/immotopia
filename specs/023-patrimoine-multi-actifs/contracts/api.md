# Contrat API — patrimoine multi-actifs (lot 1)

Préfixe : `/api`. Toutes les routes sont sous `/tenants/:tenantId/patrimoine/...`, derrière
`authenticate`, `requireTenantAccess`, `enforcePropertyTenantIsolation` (comme
`routes/patrimoine-routes.ts`). Lecture : `requireAnyPropertyPermission(['PROPERTIES_VIEW'])`.
Écriture : `requirePropertyPermission('PROPERTIES_EDIT')`. Les permissions propres aux
particuliers arrivent au lot 4.

Erreurs typées de `middleware/error-middleware` (NotFoundError, ValidationError…), contrôleurs
enveloppés dans `asyncHandler`. Une référence d'un autre tenant (`propertyId`, `holdingEntityId`,
`assetId`) lève la même `NotFoundError` qu'un objet inexistant. Montants : nombres en XOF ou
dans la devise de la ligne ; `Decimal` en base, converti en `number` dans les DTO.

## Types

```ts
type AssetClass =
  | "REAL_ESTATE"
  | "BUSINESS_EQUITY"
  | "INVENTORY"
  | "VEHICLE_EQUIPMENT"
  | "CASH"
  | "SAVINGS_INVESTMENT"
  | "RECEIVABLE"
  | "AGRICULTURE"
  | "MOVABLE"
  | "OTHER";
type AssetStatus = "ACTIVE" | "DISPOSED" | "ARCHIVED";

interface AssetValuationDto {
  id: string;
  assetId: string;
  valuatedAt: string; // ISO
  estimatedValue: number;
  currency: string;
  method: "MANUAL" | "MARKET_ESTIMATE" | "EXPERT_APPRAISAL";
  source: string | null;
  notes: string | null;
}

interface AssetDto {
  id: string;
  name: string;
  assetClass: AssetClass;
  status: AssetStatus;
  currency: string;
  exchangeRateToXof: number | null;
  acquisitionCost: number | null;
  acquisitionDate: string | null;
  disposedAt: string | null;
  holdingEntityId: string | null;
  propertyId: string | null; // seulement REAL_ESTATE
  property: {
    id: string;
    internalReference: string;
    title: string | null;
  } | null;
  details: Record<string, unknown>;
  notes: string | null;
  currentValue: {
    amount: number;
    currency: string;
    valuatedAt: string;
    valueXof: number | null;
  } | null;
  outstandingDebtXof: number; // capital restant des prêts adossés, en XOF
  createdAt: string;
  updatedAt: string;
}

interface DebtDto {
  id: string;
  assetId: string | null; // null = dette personnelle
  propertyId: string | null;
  lender: string;
  capitalAmount: number;
  remainingCapital: number;
  interestRate: number;
  monthlyPayment: number;
  currency: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "CLOSED" | "DEFAULTED";
}
```

## Actifs

| Méthode | Chemin                                | Corps / requête                                                                                                                                                                                                                     | Réponse                                |
| ------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| GET     | `/patrimoine/assets`                  | `?assetClass=&status=&search=`                                                                                                                                                                                                      | `{ data: AssetDto[] }`                 |
| POST    | `/patrimoine/assets`                  | `name, assetClass, currency?, exchangeRateToXof?, acquisitionCost?, acquisitionDate?, holdingEntityId?, propertyId? (REAL_ESTATE seul), details, notes?, initialValuation?: {valuatedAt, estimatedValue, method?, source?, notes?}` | `201 { data: AssetDto }`               |
| GET     | `/patrimoine/assets/:assetId`         |                                                                                                                                                                                                                                     | `{ data: AssetDto }`                   |
| PATCH   | `/patrimoine/assets/:assetId`         | champs modifiables de la création sauf `assetClass` et `propertyId`                                                                                                                                                                 | `{ data: AssetDto }`                   |
| POST    | `/patrimoine/assets/:assetId/dispose` | `{ disposedAt }`                                                                                                                                                                                                                    | `{ data: AssetDto }` (status DISPOSED) |
| POST    | `/patrimoine/assets/:assetId/archive` |                                                                                                                                                                                                                                     | `{ data: AssetDto }` (status ARCHIVED) |

`details` est validé par le schéma de la classe (`parseAssetDetails`) ; une erreur renvoie
`ValidationError` avec la liste `{ path, message }`. Créer un actif `REAL_ESTATE` exige un
`propertyId` du tenant, non déjà lié à un actif ; une classe non immobilière avec `propertyId` est
refusée.

## Valorisations d'un actif

| Méthode | Chemin                                                | Corps                                                                  | Réponse                                                |
| ------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| GET     | `/patrimoine/assets/:assetId/valuations`              |                                                                        | `{ data: AssetValuationDto[] }` (plus récente d'abord) |
| POST    | `/patrimoine/assets/:assetId/valuations`              | `valuatedAt, estimatedValue (>0), currency?, method?, source?, notes?` | `201 { data: AssetValuationDto }`                      |
| PATCH   | `/patrimoine/assets/:assetId/valuations/:valuationId` | mêmes champs, facultatifs                                              | `{ data: AssetValuationDto }`                          |
| DELETE  | `/patrimoine/assets/:assetId/valuations/:valuationId` |                                                                        | `204`                                                  |

Pour un actif immobilier lié à un bien, ces routes lisent et écrivent les lignes du bien
(`propertyId`) : les valorisations saisies par la route du bien et celles-ci sont les mêmes. Le
choix de la clé passe uniquement par `asset-scope`.

## Dettes

| Méthode | Chemin                      | Corps                                                                                                                     | Réponse                 |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| GET     | `/patrimoine/debts`         | `?assetId=&unattached=true`                                                                                               | `{ data: DebtDto[] }`   |
| POST    | `/patrimoine/debts`         | `assetId?, lender, capitalAmount, remainingCapital, interestRate, monthlyPayment, currency?, startDate, endDate, status?` | `201 { data: DebtDto }` |
| PATCH   | `/patrimoine/debts/:debtId` | champs facultatifs                                                                                                        | `{ data: DebtDto }`     |
| DELETE  | `/patrimoine/debts/:debtId` |                                                                                                                           | `204`                   |

Sans `assetId` : dette personnelle. Avec l'actif d'un bien immobilier, la dette est rattachée au
bien (`propertyId`), comme les prêts existants.

## Parts détenues d'un actif non immobilier

| Méthode | Chemin                                           | Corps                                       | Réponse                  |
| ------- | ------------------------------------------------ | ------------------------------------------- | ------------------------ |
| GET     | `/patrimoine/assets/:assetId/holdings`           |                                             | `{ data: HoldingDto[] }` |
| PUT     | `/patrimoine/assets/:assetId/holdings/:entityId` | `{ sharePercent (0..100], effectiveFrom? }` | `{ data: HoldingDto }`   |
| DELETE  | `/patrimoine/assets/:assetId/holdings/:entityId` |                                             | `204`                    |

`HoldingDto = { id, assetId, entityId, entityName, sharePercent, effectiveFrom, notes }`. Pour un
actif immobilier, les parts restent gérées par les routes existantes des entités détentrices.

## Valeur nette

| Méthode | Chemin                          | Requête                                                                 | Réponse                                                                                   |
| ------- | ------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET     | `/patrimoine/net-worth`         | `?asOf=YYYY-MM-DD` (défaut aujourd'hui)                                 | `{ data: NetWorthResult }` (voir `lib/patrimoine/assets/net-worth.ts`)                    |
| GET     | `/patrimoine/net-worth/history` | `?from=YYYY-MM-DD&to=YYYY-MM-DD&step=month` (défaut : 12 derniers mois) | `{ data: { date: string; totalAssets: number; totalDebts: number; netWorth: number }[] }` |

La valeur nette prend tous les actifs du tenant : les actifs non immobiliers avec leurs valorisations
`assetId`, les actifs immobiliers avec les valorisations de leur bien ; les prêts adossés à un actif
ou à son bien, plus les dettes personnelles.
