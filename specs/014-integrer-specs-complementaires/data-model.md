# Data Model: Extensions complementaires du module Syndic

**Feature**: 014-integrer-specs-complementaires  
**Date**: 2026-03-06  
**Status**: Draft

## Overview

Ce document decrit les nouvelles entites necessaires pour etendre le module syndic existant (013) avec recouvrement, comptabilite, budgets, comptes individuels et incidents.
Toutes les requetes doivent rester isolees par `tenantId`.

## Enums additionnels

```prisma
enum BatchType { REGULAR EXCEPTIONAL }
enum BatchStatus { DRAFT SENT CLOSED }
enum PaymentType { MOBILE_MONEY BANK_TRANSFER CASH CHECK CARD }
enum ReminderChannel { EMAIL SMS WHATSAPP PUSH }
enum ReminderStatus { SENT DELIVERED FAILED }
enum ScheduleStatus { ACTIVE COMPLETED DEFAULTED }
enum InstalmentStatus { PENDING PAID LATE }
enum AccountType { ASSET LIABILITY EQUITY INCOME EXPENSE }
enum JournalType { GENERAL BANK CASH CHARGES }
enum SourceType { CHARGE_PAYMENT MANUAL PENALTY FUND }
enum BudgetStatus { DRAFT APPROVED REVISED CLOSED }
enum DistributionKey { GENERAL_SHARES SPECIAL_SHARES EQUAL MANUAL }
enum TransactionType { CHARGE_CALL PAYMENT PENALTY WAIVER ADJUSTMENT FUND_TRANSFER }
enum IncidentType { BREAKDOWN LEAK VANDALISM SAFETY OTHER }
enum IncidentUrgency { LOW MEDIUM HIGH CRITICAL }
enum IncidentStatus { REPORTED ASSIGNED IN_PROGRESS RESOLVED CLOSED }
enum ImputationType { SYNDICATE_BUDGET INSURANCE LOT_OWNER THIRD_PARTY }
```

## Core entities

### Profils lot

- `LotOwnerProfile`: profil coproprietaire enrichi, historique de possession, prefs notification.
- `LotTenantProfile`: profil locataire avec periode de bail et facturation locataire.

Contraintes:
- index `(lot_id, is_active)`
- historique non chevauchant pour un meme lot/profil actif

### Charges en batch

- `ChargeCallBatch`: appel de charges de masse (periode, type, statut, total)
- `PaymentMethod`: configuration des methodes de paiement par tenant

Relations:
- `ChargeCallBatch` 1-N `ChargeCall`
- `ChargeCallBatch` N-1 `Syndicate`

### Recouvrement

- `PaymentReminder`: historique des relances envoyees
- `LatePaymentPenalty`: penalites calculees/appliquees
- `PaymentSchedule`: echeancier principal
- `PaymentScheduleInstalment`: echeances de paiement
- `ReminderConfig`: parametrage des niveaux de relance

Contraintes:
- index `(charge_call_id, reminder_level)`
- index `(lot_id, status)` sur echeanciers

### Comptabilite

- `ChartOfAccount`: plan comptable par copropriete
- `AccountingJournal`: journaux comptables
- `JournalEntry`: entete ecriture
- `JournalEntryLine`: lignes debit/credit (option lot analytique)

Regles:
- somme debit == somme credit par `JournalEntry`
- `is_locked = true` interdit edition/suppression

### Budget

- `SyndicateBudget`: budget annuel versionne
- `BudgetLineItem`: lignes budgetaires
- `BudgetAllocation`: repartition du budget par lot

Regles:
- unicite `(syndicate_id, fiscal_year, label)`
- recalcul allocations requis en cas de revision

### Comptes individuels

- `OwnerAccount`: compte courant par lot
- `OwnerAccountTransaction`: mouvements du compte

Regles:
- `OwnerAccount.lot_id` unique
- `balance_after` coherent avec sequence des mouvements

### Incidents

- `SyndicateIncident`: incident parties communes/lot
- `IncidentCostImputation`: ventilation financiere de cout

Regles:
- workflow statut: `REPORTED -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED`
- imputation obligatoire avant cloture definitive si cout > 0

## Integrations avec existant

- `SyndicateLot`, `ChargeCall`, `ChargePayment`, `SyndicateFund`, `CommonAreaAsset`, `ServiceProvider`, `MaintenanceContract`, `GMResolution`.
- Notifications via couche existante (`lib/syndics/notifications.ts` + module communication).

## Migration strategy

1. Ajouter enums et modeles sans contrainte bloquante.
2. Backfill minimal pour comptes lots existants (creation `OwnerAccount` a 0).
3. Ajouter indexes et contraintes d'unicite.
4. Ajouter endpoints/queries puis activer UI.
