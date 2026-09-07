# Quickstart: Extensions complementaires du module Syndic

**Feature**: 014-integrer-specs-complementaires  
**Date**: 2026-03-06

## Prerequis

- Node.js >= 18
- PostgreSQL >= 14
- Prisma configure dans `packages/api/.env`
- API et frontend installes (`npm install` deja fait)

## 1. Migration et client Prisma

```bash
cd packages/api
npx prisma validate
npx prisma migrate status
npx prisma generate
```

Note: le schema est `packages/api/prisma/schema.prisma`.  
Si vous etes dans `packages/`, utilisez `--schema ./api/prisma/schema.prisma`.

## 2. Routes extensions (reference)

Prefixe: `/api/tenants/:tenantId/syndics/:syndicId`

- Budgets: `/budgets`, `/budgets/:budgetId`, `/budgets/:budgetId/repartition`, `/budgets/:budgetId/generer-appels`
- Batch appels: `/charges/batch`
- Recouvrement: `/retards`, `/relances`, `/relances/batch`, `/charges/:chargeId/relance`, `/penalites`, `/charges/:chargeId/penalite`, `/penalites/:penaltyId/remise`, `/charges/:chargeId/echeancier`
- Compte lot: `/lots/:lotId/compte`, `/lots/:lotId/compte/transactions`, `/lots/:lotId/compte/ajustements`, `/lots/:lotId/compte/releve`
- Comptabilite: `/comptabilite/comptes`, `/comptabilite/journaux`, `/comptabilite/ecritures`, `/comptabilite/ecritures/:entryId/verrouiller`, `/comptabilite/balance`, `/comptabilite/grand-livre`
- Profils et incidents: `/profils/proprietaires`, `/profils/locataires`, `/incidents`, `/incidents/:incidentId`, `/incidents/:incidentId/imputations`

## 3. Verification executee (2026-03-06)

### 3.1 Backend syndic

Commande:

```bash
cd packages/api
npx jest --runInBand __tests__/unit/syndics.*.test.ts __tests__/api/syndics.*.test.ts
```

Resultat:
- 15 suites passees / 15
- 64 tests passes / 64
- Statut: OK

### 3.2 Frontend syndic

Commande:

```bash
cd apps/web
npm test -- --watchAll=false --testPathPattern=src/__tests__/syndics
```

Resultat:
- 7 suites passees / 9
- 2 suites en echec: `src/__tests__/syndics/MeetingsPages.test.tsx`
- Erreur principale: `Element type is invalid ... Check the render method of SyndicMeetings / SyndicMeetingDetail`
- Statut: KO partiel (US extensions valides, regression sur pages meetings)

## 4. Flux minimum a rejouer (API)

1. Creer un budget: `POST /budgets`
2. Repartir: `POST /budgets/:budgetId/repartition`
3. Generer appels: `POST /budgets/:budgetId/generer-appels`
4. Lancer relances: `POST /relances/batch`
5. Creer penalite: `POST /charges/:chargeId/penalite`
6. Creer echeancier: `POST /charges/:chargeId/echeancier`
7. Consulter compte lot: `GET /lots/:lotId/compte`
8. Creer ecriture comptable: `POST /comptabilite/ecritures`
9. Verrouiller ecriture: `PATCH /comptabilite/ecritures/:entryId/verrouiller`
10. Declarer incident: `POST /incidents`
11. Imputer le cout: `POST /incidents/:incidentId/imputations`
