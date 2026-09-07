# Quickstart: Module Gestion du Patrimoine

**Feature**: 015-patrimoine-module  
**Date**: 2026-03-10

## Prerequis

- Node.js >= 18
- PostgreSQL disponible
- Variables d'environnement API configurees (`packages/api/.env`)
- Dependances installees a la racine et dans les packages

## 1. Schema Prisma et client

```bash
cd packages/api
npx prisma validate
npx prisma migrate dev --name add_patrimoine_module
npx prisma generate
```

## 2. Verification backend (patrimoine)

```bash
cd packages/api
npx jest --runInBand __tests__/unit/patrimoine.*.test.ts __tests__/api/patrimoine.*.test.ts
```

Points verifies:
- controle multi-tenant sur chaque endpoint patrimoine
- impossibilite de creer/modifier un bien via module patrimoine
- generation atomique des releves proprietaires
- calculs de rendement (brut/net/net-net/projection)

## 3. Verification frontend

```bash
cd apps/web
npm test -- --watchAll=false --testPathPattern=src/__tests__/patrimoine
```

Points verifies:
- affichage tableau de bord patrimoine
- onglet Patrimoine dans fiche bien existante
- formulaires valorisations/depenses/prets/travaux/documents
- ecran releves proprietaires et envoi

## 4. Smoke tests API manuels

Base URL: `/api`

1. `GET /patrimoine/overview`
2. `GET /patrimoine/performance`
3. `POST /properties/{propertyId}/valuations`
4. `POST /properties/{propertyId}/expenses`
5. `POST /properties/{propertyId}/loans`
6. `POST /properties/{propertyId}/work-programs`
7. `POST /properties/{propertyId}/documents`
8. `GET /properties/{propertyId}/yield`
9. `POST /owner-statements`
10. `POST /owner-statements/{statementId}/send`

## 5. Verification metier obligatoire

- Aucun bouton/action "Nouveau bien" dans les pages patrimoine.
- Les donnees de reference du bien (adresse, type, surface, statut) proviennent uniquement du module Property.
- Toute operation avec un `propertyId` hors organisation retourne un acces refuse/ressource introuvable selon la politique d'API.
- Les alertes d'expiration de documents et d'echeance de pret sont journalisees via la couche de notification existante.
