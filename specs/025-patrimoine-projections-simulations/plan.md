# Plan: Projections et simulations du patrimoine (lot 3)

**Spec**: [spec.md](spec.md) | **Décision**: [ADR-005](../../docs/architecture/adr/ADR-005-patrimoine-multi-actifs.md)

## Modèle de données

Un seul nouveau modèle, tenant-scoped (couvert par `schema-tenant-coverage`) :

```prisma
model PatrimonyScenario {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id")
  name            String
  horizonYears    Int      @map("horizon_years")
  baseScenario    ProjectionScenarioKey @default(CENTRAL) @map("base_scenario")
  assumptions     Json     @default("{}")   // surcharges par rapport au scénario de base
  operations      Json     @default("[]")   // opérations de simulation
  schemaVersion   Int      @default(1) @map("schema_version")
  createdByUserId String?  @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, name])
  @@index([tenantId, updatedAt])
  @@map("patrimony_scenarios")
}

enum ProjectionScenarioKey { PRUDENT CENTRAL OPTIMISTIC }
```

Migration additive. Aucun résultat de calcul n'est stocké.

## Domaine pur (`lib/patrimoine/projection/`)

- `assumptions.ts` : `DEFAULT_ASSUMPTIONS: Record<ProjectionScenarioKey, ProjectionAssumptions>` (constantes
  nommées, documentées « hypothèses nominales indicatives »), `mergeAssumptions(base, overrides)`, schémas
  zod des hypothèses et des opérations, bornes (croissance −50 % à +100 %, inflation 0 à 100 %).
  Valeurs par défaut proposées (nominales, XOF, à confirmer par le produit) :

  | Classe                   | Prudent                                    | Central | Optimiste |
  | ------------------------ | ------------------------------------------ | ------- | --------- |
  | Immobilier               | 2 %                                        | 4 %     | 6 %       |
  | Entreprises              | 0 %                                        | 5 %     | 10 %      |
  | Stocks                   | 0 %                                        | 2 %     | 4 %       |
  | Comptes / mobile money   | 0 %                                        | 0 %     | 0 %       |
  | Épargne (si pas de taux) | 2 %                                        | 4 %     | 6 %       |
  | Créances                 | 0 %                                        | 0 %     | 0 %       |
  | Agriculture              | 0 %                                        | 3 %     | 6 %       |
  | Biens meubles            | 0 %                                        | 2 %     | 4 %       |
  | Véhicules                | amortissement du lot 2 (pas de croissance) |
  | Autre                    | 0 %                                        | 0 %     | 0 %       |
  | Inflation                | 4 %                                        | 3 %     | 2 %       |

- `loan-schedule.ts` : échéancier mensuel d'une dette (`amortize`), intérêts, capital, restant dû,
  détection « mensualité insuffisante ».
- `project.ts` : `projectNetWorth(input, assumptions, horizonYears)` → points annuels
  `{ year, assets, debts, netWorth, byClass, realNetWorth }` ; croissance composée annuelle, amortissement
  des véhicules réutilisant les paramètres du lot 2, épargne mensuelle versée dans la trésorerie.
- `simulate.ts` : `applyOperations(input, operations)` sur une copie profonde ; opérations `SELL_ASSET`,
  `BUY_ASSET`, `TAKE_LOAN`, `PREPAY_LOAN`, `MONTHLY_SAVING` ; validation des quantités et montants ;
  `compare(base, simulated)`.
- Tous les montants arrondis par `roundMoneyXof`, années fractionnaires en mois entiers.

## API (contrat à écrire avant l'implémentation, dans `contracts/api.md`)

- `POST /patrimoine/projections` (lecture, `PROPERTIES_VIEW`, aucune écriture) : corps `{ horizonYears,
baseScenario, assumptions?, operations? }` → `{ base, simulated?, delta?, warnings }`.
- `GET|POST /patrimoine/scenarios`, `GET|PATCH|DELETE /patrimoine/scenarios/:scenarioId` (écriture
  `PROPERTIES_EDIT`, plafond 100 par agence, audit des écritures, nom unique par agence).
- `POST /patrimoine/scenarios/:scenarioId/run` : recalcule un scénario enregistré sur le patrimoine actuel.

## Interface

- Page « Projections » (`/patrimoine/projections`, montée sur le joker `patrimoine/*` existant, aucun
  `React.lazy` de plus dans `App.tsx`) : horizon, choix du scénario, courbes prudent/central/optimiste,
  tableau annuel, valeurs réelles, avertissement de fiabilité de départ.
- Panneau « Simuler » : ajout d'opérations (vente, achat, emprunt, remboursement anticipé, épargne
  mensuelle), comparaison base/simulée et écart, enregistrement nommé.
- Liste des scénarios enregistrés. Courbes en recharts déjà présent dans le chunk patrimoine ; pas de
  nouvelle dépendance.

## Territoires

| Étape | Territoire                                                                  | Dépend de   |
| ----- | --------------------------------------------------------------------------- | ----------- |
| A     | Migration + schéma `PatrimonyScenario`, `schema-tenant-coverage`            | —           |
| B     | Domaine pur `lib/patrimoine/projection/` et tests (scénarios chiffrés)      | —           |
| C     | Service, contrôleur, routes, audit, isolation                               | A, B        |
| E     | Interface (page Projections, simulation, scénarios), traductions fr, en, ar | C (contrat) |
| F     | Relectures, wiki, HANDOFF                                                   | tous        |

## Risques

| Risque                                        | Réponse                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Une projection prise pour une prévision       | Libellés « hypothèses indicatives », valeurs par défaut affichées et modifiables       |
| Simulation qui écrit dans les données réelles | Copie profonde en mémoire, test avant/après, route en lecture seule                    |
| Dérive numérique (années, arrondis)           | Mois entiers, arrondi à chaque année, scénarios chiffrés en tests                      |
| Budget d'entrée web                           | Écrans sous le joker patrimoine, mesure avant/après                                    |
| Hypothèses par défaut contestables            | Constantes nommées et testées, modifiables sans migration ; à confirmer par le produit |
