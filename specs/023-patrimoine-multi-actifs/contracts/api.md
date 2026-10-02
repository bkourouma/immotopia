# Contrat API — patrimoine multi-actifs (lot 1)

> Voir aussi `specs/024-patrimoine-valorisation-par-classe/contracts/api.md` (lot 2) : méthodes de valorisation
> étendues, fiabilité, suggestion de valeur, `lowReliabilityShare` et champs `stale`/`reliability`.

Préfixe : `/api`. Toutes les routes sont sous `/tenants/:tenantId/patrimoine/...`, derrière
`authenticate`, `requireTenantAccess`, `enforcePropertyTenantIsolation` (comme
`routes/patrimoine-routes.ts`). Lecture : `requireAnyPropertyPermission(['PROPERTIES_VIEW'])`.
Écriture : `requirePropertyPermission('PROPERTIES_EDIT')`. Les permissions propres aux
particuliers arrivent au lot 4.

Erreurs typées de `middleware/error-middleware` (NotFoundError, ValidationError…), contrôleurs
enveloppés dans `asyncHandler`. Une référence d'un autre tenant (`propertyId`, `holdingEntityId`,
`assetId`) lève la même `NotFoundError` qu'un objet inexistant. Montants : nombres en XOF ou
dans la devise de la ligne ; `Decimal` en base, converti en `number` dans les DTO.

## Forme des erreurs

Toute erreur de validation répond `{ success: false, message, code: "VALIDATION_ERROR", errors: [{ field, message }] }`.
`field` désigne le champ fautif ; pour un champ propre à la classe d'actif, `field = "details.<clé>"`
(`"details"` seul pour l'objet entier, par exemple au-delà de 8 Ko).

- **400** : corps ou requête hors schéma (`ZodError` : type, taille, borne, date invalide, champ inconnu,
  identifiant de chemin mal formé).
- **422** : règle métier (`ValidationError` : devise sans taux, `propertyId` sur une classe non
  immobilière, `details` invalides, capital restant dû supérieur au capital, date de fin avant le début,
  somme des parts au-dessus de 100 %).
- **404** : objet inexistant ou d'une autre agence. **409** (`ConflictError`) : conflit d'état, voir
  « Règles d'état » et « Plafonds ».

## Bornes de validation

- Textes courts (`name`, `lender`, `source`, textes des `details`) : au plus 200 caractères. Notes
  et textes libres : au plus 2000.
- `details` : au plus 8 Ko une fois sérialisés en JSON (422, `field = "details"`).
- Montants (`estimatedValue`, `acquisitionCost`, `capitalAmount`, `remainingCapital`,
  `monthlyPayment`) : nombres finis, au plus `999 999 999 999,99`. `interestRate` : de 0 à `99,9999`.
  `exchangeRateToXof` : de `0,000001` à `1 000 000 000`.
- Dates (`valuatedAt`, `startDate`, `endDate`, `disposedAt`, `acquisitionDate`, `effectiveFrom`) :
  uniquement une chaîne `AAAA-MM-JJ` ou ISO 8601 réellement existante, entre `1900-01-01` et
  `2100-12-31`. `null`, nombre et booléen sont refusés (`null` reste permis pour effacer une date
  facultative : `acquisitionDate`, `effectiveFrom`).

## Plafonds par agence (409)

| Plafond                      | Valeur | Constante                                                                |
| ---------------------------- | ------ | ------------------------------------------------------------------------ |
| Actifs non archivés / agence | 500    | `MAX_ACTIVE_ASSETS_PER_TENANT`                                           |
| Valorisations / actif        | 1 000  | `MAX_VALUATIONS_PER_ASSET`                                               |
| Lignes de `GET /assets`      | 500    | `LIST_ASSETS_HARD_LIMIT` (sans pagination : la liste est tronquée à 500) |

Dépasser l'un des deux premiers plafonds à la création répond `409` avec un message explicite.

## Règles d'état

- Un actif `ARCHIVED` est figé : création, modification et suppression de valorisation, de dette ou de
  part, et `PATCH` de l'actif, répondent `409`.
- Un actif `DISPOSED` reste modifiable pour corriger l'historique (actif, valorisations, dettes et parts
  existantes) mais n'accepte pas de nouvelle dette (`409`).
- Changer `currency` (ou `exchangeRateToXof`) d'un actif qui porte des valorisations ou dettes dans une
  autre devise que la nouvelle (hors XOF) répond `409` : « Changez d'abord ou supprimez les valorisations
  et dettes libellées dans l'ancienne devise. » Sans ligne concernée, le changement est permis.
- `PATCH /debts/:debtId` contrôle, après fusion avec la ligne existante, `remainingCapital <= capitalAmount`
  et `endDate >= startDate` (422 avec le champ), comme la création.

## Audit

Chaque création, modification, cession et archivage d'actif, et chaque création, modification et
suppression de valorisation, de dette ou de part émet un événement d'audit (`PATRIMOINE_ASSET_*`,
`PATRIMOINE_VALUATION_*`, `PATRIMOINE_DEBT_*`, `PATRIMOINE_HOLDING_*`). Le payload ne porte que des
identifiants, la classe et les noms des champs modifiés : jamais un montant, un nom ou une note.

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
`ValidationError` (422) avec la liste `{ field: "details.<clé>", message }`. `GET /patrimoine/assets`
exclut les actifs `ARCHIVED` sauf `?status=ARCHIVED`. `initialValuation` est libellée dans la devise de
l'actif (elle n'a pas de champ `currency`). Créer un actif `REAL_ESTATE` exige un
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
ou à son bien, plus les dettes personnelles. Les actifs `ARCHIVED` ne sont pas comptés mais restent
signalés dans `excluded` (`reason: "ARCHIVED"`) : l'interface les filtre à l'affichage.

`byClass[].share` est en points de pourcentage, de 0 à 100 (deux décimales), part de la valeur totale des
actifs ; `0` si le total est nul.

Historique : un point par mois, au même quantième que `to` (`to = 2026-06-30` donne les 30 de chaque mois),
ramené au dernier jour du mois seulement quand le mois est plus court (31 mars -> 28 février) ; 60 points
au plus. Les dettes de chaque point utilisent le capital restant dû d'aujourd'hui : aucun amortissement
passé n'est reconstitué, la courbe passée sous-estime donc la dette de l'époque.
