# Implementation Plan: Module Gestion du Patrimoine

**Branch**: `[015-patrimoine-module]` | **Date**: 2026-03-10 | **Spec**: [`specs/015-patrimoine-module/spec.md`](./spec.md)  
**Input**: Feature specification from `/specs/015-patrimoine-module/spec.md`

## Summary

Le module Patrimoine enrichit les biens existants avec des donnees de valorisation, depenses, prets, travaux, documents et releves proprietaires, sans creation ni duplication de donnees de biens.
L'implementation suit l'architecture actuelle d'ImmoTopia (API Express + Prisma dans `packages/api`, frontend React dans `apps/web`) en introduisant un sous-module patrimoine dedie, des endpoints REST, des calculs purs de rendement, et une isolation multi-tenant stricte.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js backend + React frontend)  
**Primary Dependencies**: Express, Prisma ORM, Zod, Jest, React, React Testing Library  
**Storage**: PostgreSQL via Prisma (`packages/api/prisma/schema.prisma`)  
**Testing**: Jest backend (`packages/api/__tests__`), Jest/RTL frontend (`apps/web/src/__tests__`)  
**Target Platform**: SaaS web multi-tenant (API Node.js + SPA React)  
**Project Type**: Monorepo web application (`packages/api` + `apps/web`)  
**Performance Goals**: endpoints patrimoine p95 < 500ms hors aggregations; dashboard consolide < 2s sur portefeuille pilote (<= 500 biens)  
**Constraints**: interdiction de creer/modifier `Property` depuis patrimoine; verification organization/tenant sur toute operation; UI en francais uniquement; zero duplication des donnees de reference du bien  
**Scale/Scope**: ~7 nouvelles entites Prisma + endpoints CRUD patrimoine par bien + endpoints portefeuille/performance + releves proprietaires + notifications d'alerte

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Pre-Phase 0:
- Principe I (UI en francais): conforme, toutes les pages/composants patrimoine seront libelles en francais.
- Principe II (aucune donnee fictive): conforme, aucune strategie de seed fictif n'est introduite.
- Principe III (stack imposee): conforme, TypeScript + Express/React + Prisma + PostgreSQL.
- Principe IV (debug systematique): conforme, validation front prevue avec outils standards du projet.
- Principe V (workflow & qualite): conforme, plan de tests unitaires/integration/contrats prevu.

Post-Phase 1:
- Les artefacts design (`research.md`, `data-model.md`, `contracts/openapi.yaml`, `quickstart.md`) restent conformes aux cinq principes.
- Aucun gate bloquant detecte.

## Project Structure

### Documentation (this feature)

```text
specs/015-patrimoine-module/
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
|   |-- routes/
|   |   |-- property-routes.ts
|   |   `-- patrimoine-routes.ts                # nouveau
|   |-- controllers/
|   |   |-- property-controller.ts
|   |   `-- patrimoine-controller.ts            # nouveau
|   `-- lib/
|       `-- patrimoine/
|           |-- schemas.ts                      # nouveau
|           |-- queries.ts                      # nouveau
|           |-- yield.ts                        # nouveau
|           `-- notifications.ts                # nouveau
`-- __tests__/
    |-- api/
    `-- unit/

apps/web/
`-- src/
    |-- pages/
    |   |-- patrimoine/                         # nouveau
    |   `-- properties/PropertyDetail.tsx       # integration onglet Patrimoine
    |-- components/
    |   `-- patrimoine/                         # nouveaux widgets/pages
    |-- services/patrimoine-service.ts          # nouveau
    |-- types/patrimoine-types.ts               # nouveau
    `-- __tests__/patrimoine/                   # nouveau
```

**Structure Decision**: extension incrementale de la base existante (monorepo Express + React), sans creation de service separe ni de module de creation de biens.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
