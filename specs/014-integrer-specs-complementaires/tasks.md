# Tasks: Extensions complementaires du module Syndic

**Input**: Design documents from `/specs/014-integrer-specs-complementaires/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml

**Tests**: Inclure les tests est requis pour cette feature (risques metier eleves sur finances/comptabilite).

**Organization**: Taches groupees par user story pour implementation et validation independantes.

## Format: `[ID] [P?] [Story] Description`

- [P]: peut etre execute en parallele (fichiers differents, dependances levees)
- [Story]: US1..US5 selon `spec.md`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Initialiser les fichiers de spec d'implementation dans `specs/014-integrer-specs-complementaires/` (verifier coherence plan/research/data-model/contracts)
- [x] T002 Ajouter les nouveaux enums Prisma dans `packages/api/prisma/schema.prisma`
- [x] T003 [P] Ajouter les nouveaux modeles Prisma de recouvrement dans `packages/api/prisma/schema.prisma`
- [x] T004 [P] Ajouter les nouveaux modeles Prisma de comptabilite/budget/incidents dans `packages/api/prisma/schema.prisma`
- [x] T005 Generer migration `add_syndic_complementary_extensions` dans `packages/api/prisma/migrations/`
- [x] T006 Regenerer le client Prisma via `packages/api` (`npx prisma generate`)

---

## Phase 2: Foundational (Blocking)

- [x] T007 Etendre les schemas Zod de base dans `packages/api/src/lib/syndics/schemas.ts` (types batch, budget, compta, incident)
- [x] T008 Etendre la couche queries commune dans `packages/api/src/lib/syndics/queries.ts` (helpers tenant-safe, pagination, filtres)
- [x] T009 [P] Ajouter utilitaires de calcul monetaire partages dans `packages/api/src/lib/syndics/` (penalites, allocation, equilibrage)
- [x] T010 [P] Ajouter gestion d'erreurs metier partagées dans `packages/api/src/lib/errors.ts` pour nouveaux cas syndic
- [x] T011 Etendre le contrat API principal `specs/014-integrer-specs-complementaires/contracts/openapi.yaml` avec schemas de reponse standard

**Checkpoint**: base technique 014 en place, user stories demarrables.

---

## Phase 3: User Story 1 - Suivre les impayes et relances automatiques (Priority: P1)

**Goal**: dashboard retards, relances batch, penalites, echeanciers.

**Independent Test**: charges overdue -> relance batch -> penalite -> echeancier -> verification etats et montants.

### Tests US1

- [x] T012 [P] [US1] Ajouter tests unitaires recouvrement dans `packages/api/__tests__/unit/syndics.recovery.test.ts`
- [x] T013 [P] [US1] Ajouter tests API recouvrement dans `packages/api/__tests__/api/syndics.recovery.test.ts`

### Implementation US1

- [x] T014 [US1] Implementer modeles recouvrement (`PaymentReminder`, `LatePaymentPenalty`, `PaymentSchedule`, `PaymentScheduleInstalment`, `ReminderConfig`) dans `packages/api/prisma/schema.prisma`
- [x] T015 [US1] Implementer queries recouvrement dans `packages/api/src/lib/syndics/queries.ts`
- [x] T016 [US1] Implementer schemas Zod recouvrement dans `packages/api/src/lib/syndics/schemas.ts`
- [x] T017 [US1] Ajouter handlers recouvrement dans `packages/api/src/controllers/syndic-controller.ts`
- [x] T018 [US1] Ajouter routes recouvrement dans `packages/api/src/routes/syndic-routes.ts`
- [x] T019 [US1] Integrer envoi relances via `packages/api/src/lib/syndics/notifications.ts`
- [x] T020 [US1] Etendre service frontend recouvrement dans `apps/web/src/services/syndic-service.ts`
- [x] T021 [US1] Ajouter types frontend recouvrement dans `apps/web/src/types/syndic-types.ts`
- [x] T022 [US1] Ajouter pages UI recouvrement dans `apps/web/src/pages/syndic/` (retards, relances, penalites, echeanciers)
- [x] T023 [US1] Ajouter tests frontend recouvrement dans `apps/web/src/__tests__/syndics/SyndicsRecoveryPages.test.tsx`

**Checkpoint**: US1 complet et testable independamment.

---

## Phase 4: User Story 2 - Gerer les comptes individuels par lot (Priority: P1)

**Goal**: compte lot en temps reel, transactions, releve PDF, ajustement.

**Independent Test**: operations charge/paiement/penalite refletees sur compte lot + releve genere.

### Tests US2

- [x] T024 [P] [US2] Ajouter tests unitaires comptes lots dans `packages/api/__tests__/unit/syndics.owner-accounts.test.ts`
- [x] T025 [P] [US2] Ajouter tests API comptes lots dans `packages/api/__tests__/api/syndics.owner-accounts.test.ts`

### Implementation US2

- [x] T026 [US2] Implementer modeles `OwnerAccount` et `OwnerAccountTransaction` dans `packages/api/prisma/schema.prisma`
- [x] T027 [US2] Implementer logique de synchronisation des comptes lots dans `packages/api/src/lib/syndics/queries.ts`
- [x] T028 [US2] Implementer endpoint releve compte (generation PDF) dans `packages/api/src/controllers/syndic-controller.ts`
- [x] T029 [US2] Ajouter routes comptes lots dans `packages/api/src/routes/syndic-routes.ts`
- [x] T030 [US2] Etendre `apps/web/src/services/syndic-service.ts` pour comptes lots
- [x] T031 [US2] Ajouter pages comptes lots dans `apps/web/src/pages/syndic/` (compte, transactions, releve)
- [x] T032 [US2] Ajouter tests frontend comptes lots dans `apps/web/src/__tests__/syndics/SyndicsOwnerAccountPages.test.tsx`

**Checkpoint**: US2 complet et testable independamment.

---

## Phase 5: User Story 3 - Comptabilite syndic conforme OHADA (Priority: P1)

**Goal**: plan comptable, journaux, ecritures, grand livre, balance, cloture.

**Independent Test**: creation compte + ecriture equilibree + consultation balance/grand livre.

### Tests US3

- [x] T033 [P] [US3] Ajouter tests unitaires comptabilite dans `packages/api/__tests__/unit/syndics.accounting.test.ts`
- [x] T034 [P] [US3] Ajouter tests API comptabilite dans `packages/api/__tests__/api/syndics.accounting.test.ts`

### Implementation US3

- [x] T035 [US3] Implementer modeles comptables (`ChartOfAccount`, `AccountingJournal`, `JournalEntry`, `JournalEntryLine`) dans `packages/api/prisma/schema.prisma`
- [x] T036 [US3] Implementer validations debit=credit et verrouillage ecriture dans `packages/api/src/lib/syndics/queries.ts`
- [x] T037 [US3] Ajouter schemas Zod comptabilite dans `packages/api/src/lib/syndics/schemas.ts`
- [x] T038 [US3] Ajouter handlers comptabilite dans `packages/api/src/controllers/syndic-controller.ts`
- [x] T039 [US3] Ajouter routes comptabilite dans `packages/api/src/routes/syndic-routes.ts`
- [x] T040 [US3] Etendre service frontend comptabilite dans `apps/web/src/services/syndic-service.ts`
- [x] T041 [US3] Ajouter pages UI comptabilite dans `apps/web/src/pages/syndic/` (plan, journal, grand-livre, balance)
- [x] T042 [US3] Ajouter tests frontend comptabilite dans `apps/web/src/__tests__/syndics/SyndicsAccountingPages.test.tsx`

**Checkpoint**: US3 complet et testable independamment.

---

## Phase 6: User Story 4 - Budget previsionnel et generation des appels (Priority: P2)

**Goal**: budget annuel, allocations par lot, approbation, generation d'appels batch.

**Independent Test**: budget -> allocation -> approve -> batch charges.

### Tests US4

- [x] T043 [P] [US4] Ajouter tests unitaires budgets dans `packages/api/__tests__/unit/syndics.budgets.test.ts`
- [x] T044 [P] [US4] Ajouter tests API budgets dans `packages/api/__tests__/api/syndics.budgets.test.ts`

### Implementation US4

- [x] T045 [US4] Implementer modeles budget (`SyndicateBudget`, `BudgetLineItem`, `BudgetAllocation`, `ChargeCallBatch`) dans `packages/api/prisma/schema.prisma`
- [x] T046 [US4] Implementer moteur allocation budgetaire dans `packages/api/src/lib/syndics/queries.ts`
- [x] T047 [US4] Ajouter schemas Zod budgets dans `packages/api/src/lib/syndics/schemas.ts`
- [x] T048 [US4] Ajouter handlers budgets et batch charges dans `packages/api/src/controllers/syndic-controller.ts`
- [x] T049 [US4] Ajouter routes budgets/batch dans `packages/api/src/routes/syndic-routes.ts`
- [x] T050 [US4] Etendre frontend budgets dans `apps/web/src/services/syndic-service.ts`
- [x] T051 [US4] Ajouter pages UI budgets dans `apps/web/src/pages/syndic/`
- [x] T052 [US4] Ajouter tests frontend budgets dans `apps/web/src/__tests__/syndics/SyndicsBudgetsPages.test.tsx`

**Checkpoint**: US4 complet et testable independamment.

---

## Phase 7: User Story 5 - Portail coproprietaire et incidents (Priority: P3)

**Goal**: profils owner/tenant lot, invitation portail, incidents et imputations.

**Independent Test**: profil lot + invitation portail + incident workflow + imputation.

### Tests US5

- [x] T053 [P] [US5] Ajouter tests unitaires profils/incidents dans `packages/api/__tests__/unit/syndics.profiles-incidents.test.ts`
- [x] T054 [P] [US5] Ajouter tests API profils/incidents dans `packages/api/__tests__/api/syndics.profiles-incidents.test.ts`

### Implementation US5

- [x] T055 [US5] Implementer modeles profils lot (`LotOwnerProfile`, `LotTenantProfile`) dans `packages/api/prisma/schema.prisma`
- [x] T056 [US5] Implementer modeles incidents (`SyndicateIncident`, `IncidentCostImputation`) dans `packages/api/prisma/schema.prisma`
- [x] T057 [US5] Ajouter queries profils/incidents dans `packages/api/src/lib/syndics/queries.ts`
- [x] T058 [US5] Ajouter schemas Zod profils/incidents dans `packages/api/src/lib/syndics/schemas.ts`
- [x] T059 [US5] Ajouter handlers profils/incidents dans `packages/api/src/controllers/syndic-controller.ts`
- [x] T060 [US5] Ajouter routes profils/incidents dans `packages/api/src/routes/syndic-routes.ts`
- [x] T061 [US5] Etendre service frontend profils/incidents dans `apps/web/src/services/syndic-service.ts`
- [x] T062 [US5] Ajouter pages UI profils/incidents dans `apps/web/src/pages/syndic/`
- [x] T063 [US5] Ajouter tests frontend profils/incidents dans `apps/web/src/__tests__/syndics/SyndicsProfilesIncidentsPages.test.tsx`

**Checkpoint**: US5 complet et testable independamment.

---

## Phase 8: Polish & Cross-Cutting

- [x] T064 [P] Mettre a jour documentation fonctionnelle dans `docs/MODULE_SYNDIC_FONCTIONNALITES_SCHEMA_API.md`
- [x] T065 [P] Aligner `specs/014-integrer-specs-complementaires/contracts/openapi.yaml` avec implementation finale
- [x] T066 Renforcer logs/audit sur operations sensibles dans `packages/api/src/controllers/syndic-controller.ts` et `packages/api/src/lib/syndics/queries.ts`
- [x] T067 Executer batterie de tests backend syndic dans `packages/api`
- [x] T068 Executer batterie de tests frontend syndic dans `apps/web` (2 suites meetings en echec)
- [x] T069 Executer verification quickstart et consigner resultats dans `specs/014-integrer-specs-complementaires/quickstart.md`

---

## Dependencies & Execution Order

- Phase 1 -> Phase 2 obligatoires avant toute User Story.
- US1, US2, US3 sont prioritaires P1; US2 depend des flux US1 (alimentation transactions) et US3 peut avancer en parallele partiel apres Phase 2.
- US4 depend de US1 (batch charges) et US3 (comptabilisation budget).
- US5 peut demarrer apres Phase 2, mais integration comptable des imputations depend de US3.
- Polish en dernier.

## Parallel Opportunities

- T003/T004 en parallele.
- T009/T010/T011 en parallele apres T007/T008.
- Pour chaque US: tests [P] en parallele, puis backend et frontend en flux separes.

## Implementation Strategy

### MVP First

1. Completer Phase 1 + Phase 2.
2. Livrer US1.
3. Livrer US2.
4. Livrer US3.
5. Valider scenario metier complet recouvrement + compte lot + comptabilite.

### Incremental Delivery

1. Release A: US1
2. Release B: US2 + US3
3. Release C: US4
4. Release D: US5



