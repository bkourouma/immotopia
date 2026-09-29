# Contrat API — projections et simulations (lot 3)

Même préfixe, middlewares, permissions et formes d'erreurs que les lots 1 et 2
(`specs/023-…/contracts/api.md`, `specs/024-…/contracts/api.md`) : `/api/tenants/:tenantId/patrimoine/…`,
`authenticate`, `requireTenantAccess`, `enforcePropertyTenantIsolation`, lecture `PROPERTIES_VIEW`,
écriture `PROPERTIES_EDIT`. Erreurs de validation : `errors: [{ field, message }]` (ZodError 400,
ValidationError 422). Montants en XOF (les valeurs d'actifs en devise étrangère sont converties une fois
au taux de l'actif au départ).

## Calendrier

- **Année 0** = valeurs d'aujourd'hui (valeur nette du lot 1, à la date du jour).
- **Année t (1..N)** = fin de la t-ième année, soit 12 × t mois après aujourd'hui.
- Une opération datée `year: t` a lieu à la **fin de l'année t**, après la croissance et les
  échéances de cette année.
- Dettes : échéancier mensuel ; actifs : croissance composée annuelle appliquée à chaque année.

## Types

```ts
type ProjectionScenarioKey = "PRUDENT" | "CENTRAL" | "OPTIMISTIC";

interface ProjectionAssumptions {
  // Croissance annuelle nominale en %, par classe (−50 .. 100). Classe absente : valeur par défaut du scénario.
  growthPercentByClass: Partial<Record<AssetClass, number>>;
  inflationPercent: number; // 0 .. 100
}

type SimulationOperation =
  | {
      type: "SELL_ASSET";
      year: number; // 1..N
      assetId: string;
      salePrice?: number; // > 0 ; absent : valeur projetée de l'actif à cette date
      feesPercent?: number; // 0..100, défaut 0
    }
  | {
      type: "BUY_ASSET";
      year: number;
      assetClass: AssetClass;
      name: string; // ≤ 200 caractères
      price: number; // > 0, payé depuis la trésorerie
      growthPercent?: number; // sinon hypothèse de la classe
    }
  | {
      type: "TAKE_LOAN";
      year: number;
      amount: number; // > 0, versé en trésorerie
      annualRatePercent: number; // 0..100
      termYears: number; // 1..30, mensualité constante
    }
  | {
      type: "PREPAY_LOAN";
      year: number;
      loanId: string; // dette existante de l'agence (PropertyLoan)
      amount: number; // > 0, ≤ restant dû projeté, prélevé sur la trésorerie
    }
  | {
      type: "MONTHLY_SAVING";
      fromYear: number; // 1..N, versement mensuel dès le début de cette année
      toYear?: number; // ≥ fromYear, défaut N
      amount: number; // > 0, versé en trésorerie (classe CASH)
    };

interface ProjectionPoint {
  year: number; // 0..N
  assets: number;
  debts: number;
  netWorth: number;
  realNetWorth: number; // valeur nette en pouvoir d'achat d'aujourd'hui (inflation)
  byClass: { assetClass: AssetClass; value: number }[]; // classes présentes, valeur décroissante
}

type ProjectionWarning =
  | { code: "ASSET_WITHOUT_VALUE"; assetId: string }
  | { code: "LOAN_PAYMENT_TOO_LOW"; loanId: string } // la mensualité ne couvre pas les intérêts
  | { code: "NEGATIVE_CASH"; year: number } // la trésorerie simulée devient négative
  | { code: "LOW_RELIABILITY_START"; sharePercent: number } // part de valeur de départ peu fiable
  | {
      code: "OPERATION_NOT_APPLICABLE";
      index: number;
      reason: "ASSET_NOT_FOUND" | "ASSET_NOT_ACTIVE" | "LOAN_NOT_FOUND";
    };

interface ProjectionResult {
  points: ProjectionPoint[]; // N + 1 points, année 0 comprise
  warnings: ProjectionWarning[];
}
```

## Projection et simulation (aucune écriture)

`POST /patrimoine/projections` — permission `PROPERTIES_VIEW` (route en lecture seule malgré le POST).

Corps `.strict()` :

```ts
{
  horizonYears: number;            // entier 1..30
  baseScenario: ProjectionScenarioKey;
  assumptions?: Partial<ProjectionAssumptions>; // surcharges du scénario de base
  operations?: SimulationOperation[];           // ≤ 50
  compareScenarios?: boolean;      // vrai : calcule aussi les trois scénarios par défaut
}
```

Réponse `{ data }` :

```ts
{
  assumptionsUsed: ProjectionAssumptions; // scénario de base + surcharges, toutes classes renseignées
  base: ProjectionResult;                 // sans opérations
  simulated?: ProjectionResult;           // avec opérations, si `operations` non vide
  delta?: { year: number; netWorth: number }[]; // simulated − base, par année
  byScenario?: Record<ProjectionScenarioKey, ProjectionResult>; // si compareScenarios, sans opérations, mêmes surcharges
}
```

Refus (422, `field` = `operations.<index>.<champ>`) : horizon hors 1..30, plus de 50 opérations, `year`
hors 1..N, actif ou dette d'un autre tenant (même `NotFoundError` qu'un objet inexistant), vente d'un
actif déjà vendu par une autre opération, remboursement supérieur au restant dû projeté à cette date,
montants non positifs, taux hors bornes. Un actif archivé ou cédé ne peut pas être vendu :
`OPERATION_NOT_APPLICABLE` (avertissement, pas d'erreur) quand la donnée a changé depuis
l'enregistrement d'un scénario, erreur 422 quand l'opération est fournie directement.

## Scénarios enregistrés

```ts
interface ScenarioDto {
  id: string;
  name: string; // 1..120, unique par agence
  horizonYears: number;
  baseScenario: ProjectionScenarioKey;
  assumptions: Partial<ProjectionAssumptions>;
  operations: SimulationOperation[];
  createdAt: string;
  updatedAt: string;
}
```

| Méthode | Chemin                                  | Corps                                                         | Réponse                                     |
| ------- | --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| GET     | `/patrimoine/scenarios`                 |                                                               | `{ data: ScenarioDto[] }` (récents d'abord) |
| POST    | `/patrimoine/scenarios`                 | `name, horizonYears, baseScenario, assumptions?, operations?` | `201 { data: ScenarioDto }`                 |
| GET     | `/patrimoine/scenarios/:scenarioId`     |                                                               | `{ data: ScenarioDto }`                     |
| PATCH   | `/patrimoine/scenarios/:scenarioId`     | champs de la création, facultatifs                            | `{ data: ScenarioDto }`                     |
| DELETE  | `/patrimoine/scenarios/:scenarioId`     |                                                               | `204`                                       |
| POST    | `/patrimoine/scenarios/:scenarioId/run` | `{ compareScenarios?: boolean }`                              | `{ data }` comme `POST /projections`        |

Écriture : `PROPERTIES_EDIT`, plafond de 100 scénarios par agence (`ConflictError`, 409), nom déjà pris : 409. Un scénario enregistré n'est validé qu'en forme (schéma) ; ses références (actifs, dettes) sont
revérifiées à l'exécution (`run`), et une référence disparue devient `OPERATION_NOT_APPLICABLE`.
Les écritures sont auditées (`PATRIMOINE_SCENARIO_CREATED|UPDATED|DELETED`, payload : identifiants et
noms de champs, jamais de montants ni le nom saisi). Aucun résultat de calcul n'est stocké.

## Hypothèses par défaut (croissance nominale annuelle, indicatives)

| Classe                                        | Prudent                           | Central | Optimiste |
| --------------------------------------------- | --------------------------------- | ------- | --------- |
| `REAL_ESTATE`                                 | 2 %                               | 4 %     | 6 %       |
| `BUSINESS_EQUITY`                             | 0 %                               | 5 %     | 10 %      |
| `INVENTORY`                                   | 0 %                               | 2 %     | 4 %       |
| `CASH`                                        | 0 %                               | 0 %     | 0 %       |
| `SAVINGS_INVESTMENT` (sans taux dans l'actif) | 2 %                               | 4 %     | 6 %       |
| `RECEIVABLE`                                  | 0 %                               | 0 %     | 0 %       |
| `AGRICULTURE`                                 | 0 %                               | 3 %     | 6 %       |
| `MOVABLE`                                     | 0 %                               | 2 %     | 4 %       |
| `VEHICLE_EQUIPMENT`                           | amortissement du lot 2, sinon 0 % | idem    | idem      |
| `OTHER`                                       | 0 %                               | 0 %     | 0 %       |
| Inflation                                     | 4 %                               | 3 %     | 2 %       |

Un actif d'épargne dont `details.expectedRatePercent` existe utilise ce taux dans tous les scénarios ;
un véhicule dont les `details` fournissent durée d'utilité et méthode d'amortissement suit cet
amortissement (linéaire : annuité constante depuis la dernière valeur, plancher = valeur résiduelle ;
dégressif : taux constant, même plancher) ; sans ces détails, sa valeur est constante.
