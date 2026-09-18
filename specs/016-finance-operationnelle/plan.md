# Implementation Plan: Gestion financiere operationnelle - Volet clients (lot 1)

**Branch**: `[016-finance-operationnelle]` | **Date**: 2026-09-18 | **Spec**: [`specs/016-finance-operationnelle/spec.md`](./spec.md)
**Input**: Feature specification from `/specs/016-finance-operationnelle/spec.md`, PRD `docs/finance/PRD-gestion-financiere-chantiers.md`, Plan de mise en oeuvre `docs/finance/PLAN-mise-en-oeuvre.md`

## Summary

Ce lot transforme la reserve exprimee par la cliente ("l'application montre des statuts, elle a besoin de soldes") en une preuve chiffree, sans toucher a une seule table existante. Il introduit un compte de tiers typé (`ThirdPartyAccount`) et ses mouvements (`ThirdPartyMovement`) qui rejouent les pieces locatives deja en base (echeances, paiements, penalites, annulations) pour produire une balance clients, une balance agee et un releve de compte imprimable, sans recalcul a la lecture. Il introduit une campagne de facturation objet (`RentBillingRun`) qui remplace la generation d'echeances bail par bail par une generation par periode et par tenant, idempotente, et qui impute automatiquement les reglements recus sans echeance en face (avances). Aucune ecriture en partie double n'est produite a ce stade (decision D2 du plan de mise en oeuvre) : le moteur comptable generalise n'arrive qu'au lot 2, avec les fournisseurs.
L'implementation suit les patterns deja en place dans `packages/api` (Express + Prisma + Zod) et `apps/web` (React + TypeScript + Ant Design), avec une migration Prisma additive, une nouvelle couche de domaine dans `packages/api/src/lib/finance/`, de nouveaux endpoints `/api/tenants/:tenantId/finance/*`, et de nouveaux ecrans React sous `apps/web/src/pages/finance/`.

## Technical Context

**Language/Version**: TypeScript 5.x (backend Node.js + frontend React 18)
**Primary Dependencies**: Express 4, Prisma 5, Zod, Jest (backend), React, Ant Design, React Query, Vitest (frontend)
**Storage**: PostgreSQL via Prisma (`packages/api/prisma/schema.prisma`)
**Testing**: Jest backend (`packages/api/__tests__/{unit,api,integration}`), Vitest frontend (`apps/web/src/__tests__/`)
**Target Platform**: Application web SaaS ImmoTopia multi-tenant (API Node.js + SPA React), plus le portail locataire existant
**Project Type**: Monorepo web application (`packages/api` + `apps/web`)
**Performance Goals**: balance clients et releve sur un exercice complet en moins de 3 s pour un tenant simule de 500 comptes de tiers (exigence non fonctionnelle du PRD §10, reprise telle quelle, non renegociee) ; endpoints de lecture usuels sans cible chiffree distincte pour ce lot
**Constraints**: isolation tenant stricte (`tenantId` sur toute nouvelle entite) ; migration additive uniquement, aucune table existante modifiee ; aucune ecriture en partie double dans ce lot (D2) ; aucun ecran n'expose "debit" ou "credit" (D8, principe P-1 du PRD) ; montants `Decimal(14,2)`, devise stockee `XOF`, affichee "FCFA" (D9) ; non-regression totale de la suite de tests locative existante
**Scale/Scope**: 3 nouvelles entites Prisma (`ThirdPartyAccount`, `ThirdPartyMovement`, `RentBillingRun`), 3 nouveaux enums, 7 nouveaux endpoints sous `/api/tenants/:tenantId/finance/`, 1 endpoint de lecture seule sous le portail locataire existant, 4 ecrans React neufs et 1 onglet ajoute a un ecran existant du portail

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Pre-Phase 0 :

- Principe I (UI en francais uniquement) : conforme. Tous les libelles des quatre ecrans et du compte rendu de campagne sont en francais ; aucun mot "debit" ni "credit" n'est expose (voir FR-014 et SC-005 de `spec.md`).
- Principe II (aucune donnee fictive) : conforme. Le retro-remplissage lit les pieces locatives reelles deja en base ; aucun seed fictif n'est ajoute par ce lot. Le test de charge a 500 comptes est un scenario de performance isole, jamais une donnee de demonstration.
- Principe III (stack imposee) : conforme. TypeScript + Express + Prisma + PostgreSQL + React, sans nouvelle dependance.
- Principe IV (debogage systematique) : conforme. Les quatre ecrans frontend seront verifies avec les outils standards du depot (Vitest, et Chrome DevTools/Puppeteer en cas d'anomalie visuelle) avant integration.
- Principe V (workflow et qualite) : conforme. Tests unitaires (grand livre, campagne, balance agee), tests API (balance, releve, campagne, isolation tenant) et tests frontend (etat d'URL, absence de "debit"/"credit") prevus des la conception ; branche `feat/finance-lot-0` en cours, `feat/finance-lot-1` a ouvrir depuis `main` une fois la refonte fusionnee (voir `docs/finance/ORGANISATION-agents.md` §3).

Post-Phase 1 : a revalider une fois `data-model.md`, `research.md` et `contracts/` geles ; aucun ecart constitutionnel identifie a ce stade de redaction.

Resultat : aucun blocage constitutionnel pour demarrer la phase de conception detaillee.

## Project Structure

### Documentation (this feature)

```text
specs/016-finance-operationnelle/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- tasks.md
`-- contracts/
    `-- openapi.yaml
```

### Source Code (repository root)

```text
packages/api/
|-- prisma/
|   |-- schema.prisma                              # ajout : enums + ThirdPartyAccount, ThirdPartyMovement, RentBillingRun
|   `-- migrations/
|       `-- <horodatage>_add_finance_third_party_accounts/
|-- src/
|   |-- lib/
|   |   `-- finance/                               # nouveau
|   |       |-- ledger.ts                          # appendMovementTx, getOrCreateTenantAccountTx, rebuildThirdPartyAccount
|   |       |-- billing-run.ts                     # campagne de facturation, application des avances
|   |       |-- reports.ts                         # balance clients, balance agee, releve
|   |       |-- statement-pdf.ts                   # export PDF du releve
|   |       `-- schemas.ts                         # schemas Zod des routes finance
|   |-- services/
|   |   |-- rental-installment-service.ts          # branchement du grand livre (echeance -> mouvement)
|   |   |-- rental-payment-service.ts              # branchement du grand livre (paiement/allocation/avance)
|   |   |-- rental-penalty-service.ts              # branchement du grand livre (penalite)
|   |   `-- rental-payment-declaration-service.ts  # branchement du grand livre (annulation/declaration)
|   |-- controllers/
|   |   `-- finance-controller.ts                  # nouveau
|   |-- routes/
|   |   `-- finance-routes.ts                      # nouveau, monte dans src/index.ts
|   |-- middleware/
|   |   `-- finance-rbac-middleware.ts             # nouveau
|   `-- scripts/
|       `-- finance-backfill-tenant-accounts.ts    # nouveau, retro-remplissage idempotent
|-- prisma/seeds/
|   `-- finance-permissions-seed.ts                # nouveau
`-- __tests__/
    |-- unit/
    |   |-- finance.ledger.test.ts
    |   |-- finance.billing-run.test.ts
    |   `-- finance.reports.test.ts
    |-- api/
    |   `-- finance.clients.test.ts
    `-- integration/
        `-- finance.rental-non-regression.test.ts

apps/web/
`-- src/
    |-- types/
    |   `-- finance-types.ts                       # nouveau
    |-- services/
    |   `-- finance-service.ts                     # nouveau
    |-- pages/
    |   `-- finance/                               # nouveau
    |       |-- BalanceClients.tsx
    |       |-- BalanceAgee.tsx
    |       |-- Releve.tsx
    |       `-- Facturation.tsx
    |-- pages/TenantPortal/
    |   `-- Payments.tsx                           # enrichi d'un onglet "Mon solde"
    |-- navigation/
    |   `-- model.tsx                              # ajout de la section "finance"
    `-- __tests__/
        `-- finance/
            |-- BalanceClients.test.tsx
            |-- BalanceAgee.test.tsx
            |-- Releve.test.tsx
            `-- Facturation.test.tsx
```

**Structure Decision**: extension incrementale du monorepo existant (API Express/Prisma + SPA React), sans nouveau service ni nouvelle application. Le module `finance` est un pair des modules `syndics` et `patrimoine` deja presents dans `packages/api/src/lib/` et `apps/web/src/pages/`, avec le meme decoupage schemas/queries/controller/routes. Aucune table existante n'est alteree ; toute la surface de ce lot est additive, conformement au principe P-5 du PRD (generaliser le moteur sans dupliquer) applique ici a son etape la moins risquee : partager uniquement le calcul de solde (`appendOwnerAccountTransactionTx`), pas le stockage.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| None      | N/A        | N/A                                  |
