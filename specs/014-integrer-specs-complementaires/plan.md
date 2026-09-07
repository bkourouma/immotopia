# Implementation Plan: Extensions complementaires du module Syndic

**Branch**: `[014-integrer-specs-complementaires]` | **Date**: 2026-03-06 | **Spec**: [`specs/014-integrer-specs-complementaires/spec.md`](./spec.md)
**Input**: Feature specification from `/specs/014-integrer-specs-complementaires/spec.md`

## Summary

Cette feature etend le module syndic existant avec un noyau financier et comptable complet: relances/penalites/echeanciers, comptes individuels par lot, comptabilite OHADA (plan comptable, journaux, ecritures, balance), budgets previsionnels avec generation de charges en batch, profils coproprietaire/locataire et gestion des incidents imputables.
L'implementation suit les patterns deja en place dans `packages/api` (Express + Prisma + Zod) et `apps/web` (React + TypeScript), avec nouvelles migrations Prisma, nouveaux endpoints `/api/tenants/:tenantId/syndics/:syndicId/*`, services de domaine dans `packages/api/src/lib/syndics`, et ecrans React sous `apps/web/src/pages/syndic`.

## Technical Context

**Language/Version**: TypeScript 5.x (backend Node.js + frontend React)  
**Primary Dependencies**: Express, Prisma, Zod, Jest, React, React Testing Library  
**Storage**: PostgreSQL via Prisma (`packages/api/prisma/schema.prisma`)  
**Testing**: Jest backend (`packages/api/__tests__`), Jest/RTL frontend (`apps/web/src/__tests__`)  
**Target Platform**: Application web SaaS ImmoTopia (API Node.js + SPA React)  
**Project Type**: Monorepo web app (`packages/api` + `apps/web`)  
**Performance Goals**: generation balance et dashboards < 30s pour une copropriete pilote; endpoints CRUD usuels p95 < 500ms hors export  
**Constraints**: isolation tenant stricte; RBAC proprietes; UI 100% francais; coherences comptables (debit=credit); compatibilite avec routes syndic existantes  
**Scale/Scope**: extension de `013-syndic-module` a ~20 nouveaux modeles et ~30 endpoints additionnels

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Principe I (UI en francais): respecte, tous les libelles/UI syndic complementaires seront en francais.
- Principe II (pas de donnees fictives seed): respecte, aucun seed fictif ajoute dans ce plan.
- Principe III (stack imposee): respecte, TypeScript + Express + React + Prisma + PostgreSQL.
- Principe IV (debug systematique): respecte, bugs front verifies via DevTools/Puppeteer si necessaire.
- Principe V (workflow qualite): respecte, tests API/frontend ajoutes avec cible >=80% sur services critiques.

Resultat: aucun blocage constitutionnel pour demarrer la phase design.

## Project Structure

### Documentation (this feature)

```text
specs/014-integrer-specs-complementaires/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- openapi.yaml
`-- tasks.md
```

### Source Code (repository root)

```text
packages/api/
|-- prisma/
|   |-- schema.prisma
|   `-- migrations/
|-- src/
|   |-- routes/syndic-routes.ts
|   |-- controllers/syndic-controller.ts
|   `-- lib/syndics/
|       |-- schemas.ts
|       |-- queries.ts
|       `-- notifications.ts
`-- __tests__/
    |-- api/
    `-- unit/

apps/web/
`-- src/
    |-- pages/syndic/
    |-- services/syndic-service.ts
    |-- types/syndic-types.ts
    `-- __tests__/syndics/
```

**Structure Decision**: web application monorepo; extension incrementale des modules syndic backend/frontend existants, sans nouveau service separe.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
