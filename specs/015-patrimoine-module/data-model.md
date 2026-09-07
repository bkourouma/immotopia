# Data Model: Module Gestion du Patrimoine

**Feature**: 015-patrimoine-module  
**Date**: 2026-03-10  
**Status**: Draft

## Overview

Le module Patrimoine ajoute des entites financieres et documentaires rattachees aux biens existants.
Le referentiel `Property` et `Contact` reste maitre et est uniquement lu/relie.

## Enums metier

```prisma
enum ValuationMethod { MANUAL MARKET_ESTIMATE EXPERT_APPRAISAL }
enum LoanStatus { ACTIVE CLOSED DEFAULTED }
enum ExpenseCategory {
  PROPERTY_TAX
  CONDO_FEES
  INSURANCE
  ROUTINE_MAINTENANCE
  RENOVATION
  MANAGEMENT_FEES
  UTILITIES
  OTHER
}
enum StatementStatus { DRAFT SENT PAID }
enum StatementItemType { RENT_COLLECTED EXPENSE_DEDUCTED MANAGEMENT_FEE ADVANCE OTHER }
enum WorkProgramStatus { PLANNED IN_PROGRESS COMPLETED CANCELLED }
enum PatrimonyDocType {
  TITLE_DEED
  NOTARIAL_DEED
  TAX_DOCUMENT
  INSURANCE
  TECHNICAL_DIAGNOSIS
  FLOOR_PLAN
  BUILDING_PERMIT
  OTHER
}
```

## Entites principales

### 1) AssetValuation

- But: historique des valorisations par bien.
- Champs metier: `valuatedAt`, `estimatedValue`, `currency`, `acquisitionCost`, `acquisitionDate`, `method`, `notes`.
- Relations:
  - N:1 vers `Organization`
  - N:1 vers `Property`
- Regles:
  - `estimatedValue > 0`
  - une valorisation est rattachee a un bien existant de la meme organisation.
- Index recommandes:
  - `(organizationId, propertyId, valuatedAt desc)`

### 2) PropertyLoan

- But: suivi des credits immobiliers du bien.
- Champs metier: `lender`, `capitalAmount`, `remainingCapital`, `interestRate`, `monthlyPayment`, `currency`, `startDate`, `endDate`, `status`.
- Relations:
  - N:1 vers `Organization`
  - N:1 vers `Property`
- Regles:
  - montants et taux strictement positifs
  - `endDate > startDate`
  - un pret `CLOSED` a `remainingCapital = 0` en cible metier.
- Index recommandes:
  - `(organizationId, propertyId, status)`

### 3) PropertyExpense

- But: charges/depenses rattachees au bien.
- Champs metier: `category`, `label`, `amount`, `currency`, `paidAt`, `isCapitalized`, `receiptUrl`, `notes`.
- Relations:
  - N:1 vers `Organization`
  - N:1 vers `Property`
- Regles:
  - `amount > 0`
  - `label` non vide
  - `paidAt` obligatoire.
- Index recommandes:
  - `(organizationId, propertyId, paidAt)`
  - `(organizationId, category)`

### 4) WorkProgram

- But: planification et suivi des travaux.
- Champs metier: `title`, `description`, `estimatedCost`, `actualCost`, `currency`, `plannedDate`, `completedDate`, `status`, `isCapitalized`.
- Relations:
  - N:1 vers `Organization`
  - N:1 vers `Property`
- Regles:
  - `estimatedCost > 0`
  - `actualCost` optionnel mais >= 0
  - `completedDate` renseignee quand `status = COMPLETED`.
- Transitions:
  - `PLANNED -> IN_PROGRESS -> COMPLETED`
  - annulation possible depuis `PLANNED` ou `IN_PROGRESS` vers `CANCELLED`.

### 5) PatrimonyDocument

- But: coffre documentaire patrimoine par bien/proprietaire.
- Champs metier: `title`, `type`, `fileUrl`, `expiresAt`.
- Relations:
  - N:1 vers `Organization`
  - N:1 optionnel vers `Property`
  - N:1 optionnel vers `Contact` (owner)
- Regles:
  - au moins un rattachement metier (`propertyId` ou `ownerContactId`) requis au niveau service.
  - `fileUrl` valide.
- Index recommandes:
  - `(organizationId, expiresAt)`
  - `(organizationId, propertyId)`

### 6) OwnerStatement

- But: releve periodique de gerance proprietaire.
- Champs metier: `ownerContactId`, `period`, `totalRevenue`, `totalExpenses`, `netAmount`, `currency`, `status`, `sentAt`, `paidAt`.
- Relations:
  - N:1 vers `Organization`
  - N:1 vers `Contact` (owner)
  - 1:N vers `OwnerStatementItem`
- Regles:
  - `period` au format `YYYY-MM`
  - `netAmount = totalRevenue - totalExpenses`
  - unicite fonctionnelle recommandee: `(organizationId, ownerContactId, period)`.
- Transitions:
  - `DRAFT -> SENT -> PAID`
  - retour arriere interdit une fois `PAID`.

### 7) OwnerStatementItem

- But: ligne de detail d'un releve proprietaire.
- Champs metier: `propertyId`, `label`, `type`, `amount`.
- Relations:
  - N:1 vers `OwnerStatement`
  - N:1 vers `Property`
- Regles:
  - `amount > 0`
  - chaque ligne est coherente avec la periode du releve parent.

## Relations inversees sur modeles existants

### Property (existant, non modifie hors relations)

- `valuations: AssetValuation[]`
- `loans: PropertyLoan[]`
- `expenses: PropertyExpense[]`
- `workPrograms: WorkProgram[]`
- `documents: PatrimonyDocument[]`
- `statementItems: OwnerStatementItem[]`

### Contact (existant, non modifie hors relations)

- `ownerStatements: OwnerStatement[]`
- `patrimonyDocuments: PatrimonyDocument[] @relation("PatrimonyDocumentOwner")`

## Invariants transverses

- Aucune creation/modification de `Property` et `Contact` par le module Patrimoine.
- Aucun champ de reference du bien (adresse/type/surface/statut) n'est duplique dans les nouvelles entites.
- Toute operation ecriture verifie l'appartenance du bien a l'organisation active.
- La creation d'un `OwnerStatement` et de ses `OwnerStatementItem` est atomique (transaction unique).
