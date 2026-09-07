# Research: Extensions complementaires du module Syndic

**Feature**: 014-integrer-specs-complementaires  
**Date**: 2026-03-06  
**Status**: Complete

## 1. Strategy de livraison

**Decision**: livrer en 3 lots techniques: (1) recouvrement + comptes lots, (2) comptabilite + budgets, (3) portail proprietaire + incidents.

**Rationale**: les dependances metier imposent de stabiliser d'abord les flux financiers et le suivi de solde avant les couches avancees.

**Alternatives considered**:
- Livrer tout en un sprint: rejete (risque de regressions eleve)
- Commencer par incidents: rejete (faible valeur immediate sur cashflow)

## 2. Extension du schema Prisma

**Decision**: ajouter de nouveaux modeles dedies au syndic dans `packages/api/prisma/schema.prisma` plutot que surcharger les modeles existants.

**Rationale**: separation claire des responsabilites, migrations plus lisibles, impacts limites sur modules existants.

**Alternatives considered**:
- Colonnes JSON dans tables existantes: rejete (validation/indexation difficiles)
- Nouveau schema DB separe: rejete (complexite operationnelle)

## 3. Comptabilite OHADA

**Decision**: modeliser `ChartOfAccount`, `AccountingJournal`, `JournalEntry`, `JournalEntryLine` avec controle applicatif debit=credit et verrouillage des ecritures validees.

**Rationale**: conforme au besoin de traçabilite et auditabilite sans introduire un moteur comptable externe.

**Alternatives considered**:
- Outil comptable tiers: rejete pour la V1 (couplage et cout d'integration)
- Ecritures non verrouillables: rejete (risque legal/audit)

## 4. Recouvrement et relances

**Decision**: introduire `PaymentReminder`, `LatePaymentPenalty`, `PaymentSchedule`, `ReminderConfig` et reutiliser la couche notifications existante.

**Rationale**: permet automation des relances avec historique tout en gardant le canal d'envoi centralise.

**Alternatives considered**:
- Cron externe non trace: rejete (manque d'audit)
- Penalites calculees a la volée sans persistance: rejete (ecarts de reporting)

## 5. Budgets et generation des appels

**Decision**: introduire `SyndicateBudget`, `BudgetLineItem`, `BudgetAllocation` et `ChargeCallBatch` pour relier budget approuve et appels de charges.

**Rationale**: necessaire pour expliquer la provenance des montants et fournir suivi previsionnel vs realise.

**Alternatives considered**:
- Generation d'appels sans budget versionne: rejete (pas de piste d'audit)

## 6. API et securite

**Decision**: conserver le prefixe `/api/tenants/:tenantId/syndics/:syndicId/*`, validation Zod par endpoint, controles `authenticate + tenant + RBAC` sur toutes les nouvelles routes.

**Rationale**: aligne avec module syndic existant et limite les ecarts architecturaux.

**Alternatives considered**:
- Nouveaux prefixes `/api/syndic-v2/*`: rejete (fragmentation API)

## 7. Frontend

**Decision**: etendre les pages `apps/web/src/pages/syndic/*` et le service `syndic-service.ts` plutot que creer une nouvelle app.

**Rationale**: navigation et conventions UI deja en place, effort de changement reduit.

**Alternatives considered**:
- Nouveau micro-frontend: rejete (surcouche inutile)

## 8. Tests

**Decision**: ajouter tests unitaires de calcul (penalites, allocations budget, ecritures) + tests API cibles + tests UI des workflows P1.

**Rationale**: couvre les zones de risque metier maximal.

**Alternatives considered**:
- E2E only: rejete (diagnostic lent, faible precision)
