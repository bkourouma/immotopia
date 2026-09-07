# Quickstart: Module de gestion des syndics de copropriete ImmoTopia

**Feature**: 013-syndic-module  
**Date**: 2026-03-04

## Vue d'ensemble

Ce guide decrit les etapes pour implementer et valider le module syndic:
coproprietes, lots, charges, AG, prestataires/contrats, documents et finances.

## Prerequis

- Node.js >= 18
- PostgreSQL >= 14
- Prisma configure
- API Express demarrable (`packages/api`)
- Frontend React demarrable (`apps/web`)

## Etapes d'implementation

### 1. Modele de donnees

1. Mettre a jour `prisma/schema.prisma` avec les entites syndic.
2. Generer et appliquer la migration:

```bash
npx prisma migrate dev --name add_syndic_module
npx prisma generate
```

### 2. Validation et acces donnees

1. Definir les schemas Zod dans `packages/api/src/lib/syndics/schemas.ts`.
2. Centraliser les acces Prisma dans `packages/api/src/lib/syndics/queries.ts`.
3. Appliquer le filtrage tenant sur chaque requete.

### 3. Routes API (implementation reelle)

1. Implementer `packages/api/src/routes/syndic-routes.ts` sous:
   - `/api/tenants/:tenantId/syndics/*`
2. Sur chaque endpoint:
   - auth + controle acces tenant
   - validation Zod
   - appel query service
   - reponse standard `{ success, data }`

### 4. Notifications

1. Ajouter les events syndic dans le module notifications.
2. Implementer:
   - `notifyChargeCall(chargeCallId)`
   - `notifyMeetingConvocation(meetingId)`
3. Envoyer selon preferences (email/WhatsApp).

### 5. Frontend

1. Pages syndic:
   - liste/detail/lots
   - charges
   - assemblees (liste + detail + votes)
   - prestataires/documents/finances
2. Composants syndic:
   - `SyndicateCard`, `LotTable`, `ChargeCallTable`
   - `MeetingAgenda`, `VoteBoard`
   - `ContractList`, `DocumentVault`, `SyndicateFundWidget`

### 6. Tests

1. Backend:
   - syndic + lots
   - charges + paiements
   - AG + votes
   - prestataires/contrats/documents/finances
2. Frontend:
   - pages US1, US2, US3, US4

## Workflow end-to-end minimal

1. Creer la copropriete:
   - `POST /api/tenants/{tenantId}/syndics`
2. Ajouter des lots:
   - `POST /api/tenants/{tenantId}/syndics/{syndicId}/lots`
3. Emettre un appel de charges:
   - `POST /api/tenants/{tenantId}/syndics/{syndicId}/charges`
4. Enregistrer un paiement:
   - `POST /api/tenants/{tenantId}/syndics/{syndicId}/charges/{chargeId}/pay`
5. Creer une AG, ajouter une resolution, voter:
   - `POST /api/tenants/{tenantId}/syndics/{syndicId}/assemblees`
   - `POST /api/tenants/{tenantId}/syndics/{syndicId}/assemblees/{meetingId}/resolutions`
   - `POST /api/tenants/{tenantId}/syndics/{syndicId}/assemblees/{meetingId}/resolutions/{resolutionId}/votes`
6. Consulter:
   - `GET /api/tenants/{tenantId}/syndics/{syndicId}/prestataires`
   - `GET /api/tenants/{tenantId}/syndics/{syndicId}/documents`
   - `GET /api/tenants/{tenantId}/syndics/{syndicId}/finances`

## Resultats d'execution (2026-03-04)

- Backend syndic tests: OK
  - `__tests__/unit/syndics.syndicate.test.ts`
  - `__tests__/unit/syndics.charges.test.ts`
  - `__tests__/api/syndics.charges.test.ts`
  - `__tests__/api/syndics.meetings.test.ts`
  - `__tests__/api/syndics.providers-docs-funds.test.ts`
- Frontend syndic tests: OK
  - `src/__tests__/syndics/SyndicsPages.test.tsx`
  - `src/__tests__/syndics/ChargesPage.test.tsx`
  - `src/__tests__/syndics/MeetingsPages.test.tsx`
  - `src/__tests__/syndics/ProvidersDocumentsFinancesPages.test.tsx`
- TypeScript:
  - web: OK
  - api: verification ciblee syndic validee par les tests ci-dessus
