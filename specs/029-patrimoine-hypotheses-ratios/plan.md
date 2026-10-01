# Implementation Plan: Hypothèses de projection serveur et ratios bancaires

**Branch**: `feat/patrimoine-projection` | **Date**: 2026-10-01 | **Spec**: [`spec.md`](./spec.md)  
**Input**: lot A1 de [PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md)

## Summary

Un nouveau modèle `PropertyYieldAssumption` (une ligne par bien) et deux routes `GET`/`PUT` portent les
hypothèses de projection côté serveur ; `GET /yield` et la performance par bien les résolvent (requête >
enregistrées > défauts) et renvoient en plus quatre ratios bancaires calculés par des fonctions pures de
`lib/patrimoine/yield.ts`. Le front lit et écrit le serveur, migre une fois le `localStorage` existant, et
affiche les ratios sur l'onglet Patrimoine.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js + React)  
**Primary Dependencies**: Express 4, Prisma 5, Zod, Ant Design, Jest (API), Vitest (web)  
**Storage**: PostgreSQL via Prisma ; une table `property_yield_assumptions`  
**Testing**: Jest `packages/api/__tests__`, Vitest `apps/web/src/__tests__`  
**Constraints**: isolation multi-tenant (`tenantId` direct, bien vérifié via `property-tenant-guard`),
schémas `.strict()`, textes via `t()`, propriétés CSS logiques (RTL), migration additive uniquement,
aucun appel externe  
**Scale/Scope**: 1 modèle, 2 routes, 4 fonctions de ratio + 1 assembleur, 1 service web, 1 carte d'écran

## Constitution Check

- Isolation tenant (AGENTS.md) : conforme — `tenantId` dans la table, jamais lu du corps, bien vérifié.
- Erreurs typées + `asyncHandler` : conforme.
- Configuration : aucune variable d'environnement ajoutée.
- Textes affichés : conforme — `t()` partout, catalogues fr/en/ar complétés.
- Wiki des fonctionnalités : lignes ajoutées, `wiki:export` lancé.
- Hors périmètre respecté : `export/*`, `entities/consolidation-service.ts`, `owner-portal-view.ts` intouchés.

## Project Structure

### Documentation

```text
specs/029-patrimoine-hypotheses-ratios/
|-- spec.md
`-- plan.md
```

### Source Code

```text
packages/api/
|-- prisma/schema.prisma                         # + PropertyYieldAssumption, relations Tenant/Property
|-- prisma/migrations/20261007090000_patrimoine_hypotheses_projection/migration.sql
|-- src/lib/patrimoine/yield.ts                  # + DSCR, LTV, cash-on-cash, TRI, computeBankRatios
|-- src/lib/patrimoine/schemas.ts                # + schéma strict du PUT (bornes partagées)
|-- src/lib/patrimoine/queries.ts                # buildPropertyYieldInput : capital restant/initial des prêts
|-- src/lib/patrimoine/yield-assumptions.ts      # lecture, upsert, résolution requête > base > défauts
|-- src/controllers/patrimoine-yield-assumptions-controller.ts
|-- src/controllers/patrimoine-controller.ts     # /yield et /performance : hypothèses résolues + ratios
|-- src/routes/patrimoine-routes.ts              # + GET/PUT .../yield/assumptions
`-- src/services/tenant-data-export/model-registry.ts
apps/web/src/
|-- services/patrimoine-service.ts               # getYieldAssumptions, saveYieldAssumptions
|-- types/patrimoine-types.ts
|-- components/patrimoine/yield-assumptions-storage.ts   # load (migration unique) / persist, repli local
|-- components/patrimoine/YieldCalculator.tsx            # bandeau de synchronisation + carte Ratios bancaires
|-- components/patrimoine/PropertyPatrimoineTab.tsx
`-- pages/patrimoine/PatrimoinePerformancePage.tsx       # même clé localStorage : même logique
```

## Contrat d'API

`GET`/`PUT /tenants/:tenantId/properties/:propertyId/yield/assumptions` →
`{ success, data: { assumptions: { years, valueGrowthRate, rentGrowthRate, expenseGrowthRate, vacancyRate }, saved, updatedAt } }`.

`GET .../yield` et `GET .../patrimoine/performance?propertyId=` gagnent (ajout non rupturant) :
`assumptions`, `assumptionsSaved`, `ratios: { dscr, ltv, cashOnCash, irr }`, chaque ratio étant
`{ value: number | null, reason: 'NO_ACTIVE_LOAN' | 'NO_DEBT_SERVICE' | 'NO_VALUE' | 'NO_COST_BASIS' | 'NO_EQUITY' | 'NOT_CONVERGENT' | null }`.

## Ordre d'exécution

1. Schéma + migration (validée sur base jetable : `migrate deploy` puis `migrate diff` vide).
2. Fonctions pures de ratios et leurs tests chiffrés à la main.
3. Service, contrôleurs, routes ; garde-fous (`schema-tenant-coverage`, `routes-inventory`, `route-features`,
   registre d'export).
4. Front : service, stockage (migration unique), onglet, page Performance, carte de ratios.
5. i18n (extraction, en/ar), wiki (lignes + export), `DATA_MODELS.md`.
6. Relecture `code-reviewer` puis `security-auditor` (route recevant un identifiant de bien).

## Risques

- Migration `localStorage` : double envoi concurrent ou écrasement d'une valeur serveur — couvert par la règle
  « serveur fait foi » et une promesse en vol par clé.
- TRI : non-convergence — résolution bornée, `null` + `NOT_CONVERGENT`.
- Fichiers très partagés (`schema.prisma`, catalogues i18n, wiki) : ce lot n'ajoute que des lignes en fin ou
  des blocs additifs.
