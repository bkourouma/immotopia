# Tasks: Module Gestion du Patrimoine

**Input**: Design documents from `/specs/015-patrimoine-module/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests backend/frontend inclus (la specification impose des scenarios de test independants par user story).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialiser la structure technique du module patrimoine cote API et frontend.

- [ ] T001 Creer l'arborescence backend patrimoine dans `packages/api/src/lib/patrimoine/` (schemas, queries, yield, notifications)
- [ ] T002 [P] Creer l'arborescence frontend patrimoine dans `apps/web/src/pages/patrimoine/` et `apps/web/src/components/patrimoine/`
- [ ] T003 [P] Ajouter les types et le client frontend patrimoine dans `apps/web/src/types/patrimoine-types.ts` et `apps/web/src/services/patrimoine-service.ts`
- [ ] T004 Ajouter les squelettes de tests patrimoine dans `packages/api/__tests__/api/`, `packages/api/__tests__/unit/` et `apps/web/src/__tests__/patrimoine/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Mettre en place les fondations communes avant de traiter les user stories.

**⚠️ CRITICAL**: Aucun travail US1-US4 ne demarre avant cette phase.

- [ ] T005 Mettre a jour le schema Prisma (modeles/relations/enums patrimoine + NotificationEvent) dans `packages/api/prisma/schema.prisma`
- [ ] T006 Generer la migration `add_patrimoine_module` dans `packages/api/prisma/migrations/*_add_patrimoine_module/migration.sql`
- [ ] T007 Regenerer le client Prisma et valider le schema via `packages/api/package.json` (scripts Prisma)
- [ ] T008 Implementer les schemas Zod patrimoine dans `packages/api/src/lib/patrimoine/schemas.ts`
- [ ] T009 Implementer les fonctions de calcul pures de rendement dans `packages/api/src/lib/patrimoine/yield.ts`
- [ ] T010 Implementer les requetes Prisma mutualisees patrimoine dans `packages/api/src/lib/patrimoine/queries.ts`
- [ ] T011 Implementer les helpers notifications patrimoine dans `packages/api/src/lib/patrimoine/notifications.ts`
- [ ] T012 [P] Creer le routeur patrimoine global dans `packages/api/src/routes/patrimoine-routes.ts`
- [ ] T013 [P] Creer le routeur owner statements dans `packages/api/src/routes/owner-statements-routes.ts`
- [ ] T014 Monter les nouveaux routeurs API dans `packages/api/src/index.ts`
- [ ] T015 Ajouter les constantes frontend pour evenements/labels patrimoine dans `apps/web/src/constants/email-notification-events.ts`

**Checkpoint**: Fondations techniques prêtes, user stories implementables.

---

## Phase 3: User Story 1 - Piloter la valeur globale du portefeuille (Priority: P1) 🎯 MVP

**Goal**: Fournir la vue consolidee patrimoine et les indicateurs portefeuille.

**Independent Test**: Ouvrir la page patrimoine et verifier total biens, valeur, dette, charges annuelles, loyers, taux d'occupation avec des donnees existantes.

### Tests for User Story 1

- [ ] T016 [P] [US1] Ajouter les tests unitaires d'aggregation portefeuille dans `packages/api/__tests__/unit/patrimoine.overview.service.test.ts`
- [ ] T017 [P] [US1] Ajouter les tests API `GET /api/patrimoine/overview` et `GET /api/patrimoine/performance` dans `packages/api/__tests__/api/patrimoine.overview-performance.test.ts`
- [ ] T018 [P] [US1] Ajouter les tests UI dashboard patrimoine dans `apps/web/src/__tests__/patrimoine/PatrimoineOverviewPage.test.tsx`

### Implementation for User Story 1

- [ ] T019 [US1] Implementer le controller overview/performance dans `packages/api/src/controllers/patrimoine-controller.ts`
- [ ] T020 [US1] Connecter les endpoints overview/performance dans `packages/api/src/routes/patrimoine-routes.ts`
- [ ] T021 [US1] Implementer la page dashboard patrimoine dans `apps/web/src/pages/patrimoine/PatrimoineOverviewPage.tsx`
- [ ] T022 [P] [US1] Implementer le composant `PatrimoineOverview` dans `apps/web/src/components/patrimoine/PatrimoineOverview.tsx`
- [ ] T023 [P] [US1] Implementer le composant `WorkProgramTimeline` dans `apps/web/src/components/patrimoine/WorkProgramTimeline.tsx`
- [ ] T024 [US1] Brancher la route frontend patrimoine dans `apps/web/src/App.tsx`

**Checkpoint**: US1 est complete et demonstrable (MVP).

---

## Phase 4: User Story 2 - Enrichir un bien existant avec ses donnees patrimoniales (Priority: P1)

**Goal**: Permettre la gestion complete patrimoine depuis la fiche d'un bien existant, sans creation de bien.

**Independent Test**: Depuis une fiche bien existante, creer/lister/modifier/supprimer valorisations, depenses, prets, travaux et documents avec verification multi-tenant stricte.

### Tests for User Story 2

- [ ] T025 [P] [US2] Ajouter les tests API valuations CRUD dans `packages/api/__tests__/api/patrimoine.valuations.test.ts`
- [ ] T026 [P] [US2] Ajouter les tests API expenses CRUD dans `packages/api/__tests__/api/patrimoine.expenses.test.ts`
- [ ] T027 [P] [US2] Ajouter les tests API loans CRUD dans `packages/api/__tests__/api/patrimoine.loans.test.ts`
- [ ] T028 [P] [US2] Ajouter les tests API work-programs CRUD dans `packages/api/__tests__/api/patrimoine.work-programs.test.ts`
- [ ] T029 [P] [US2] Ajouter les tests API documents CRUD dans `packages/api/__tests__/api/patrimoine.documents.test.ts`
- [ ] T030 [P] [US2] Ajouter les tests API yield `GET /api/properties/:propertyId/yield` dans `packages/api/__tests__/api/patrimoine.yield.test.ts`
- [ ] T031 [P] [US2] Ajouter les tests UI onglet patrimoine de la fiche bien dans `apps/web/src/__tests__/patrimoine/PropertyPatrimoineTab.test.tsx`

### Implementation for User Story 2

- [ ] T032 [US2] Implementer les controllers CRUD valuations/expenses/loans/work-programs/documents/yield dans `packages/api/src/controllers/property-patrimoine-controller.ts`
- [ ] T033 [US2] Etendre les routes property avec endpoints patrimoine dans `packages/api/src/routes/property-routes.ts`
- [ ] T034 [US2] Ajouter le composant `PropertyPatrimoineTab` dans `apps/web/src/components/patrimoine/PropertyPatrimoineTab.tsx`
- [ ] T035 [P] [US2] Ajouter `ValuationHistory`, `ExpenseTracker`, `LoanWidget` dans `apps/web/src/components/patrimoine/ValuationHistory.tsx`, `apps/web/src/components/patrimoine/ExpenseTracker.tsx`, `apps/web/src/components/patrimoine/LoanWidget.tsx`
- [ ] T036 [P] [US2] Ajouter `DocumentVault` et `YieldCalculator` dans `apps/web/src/components/patrimoine/DocumentVault.tsx` et `apps/web/src/components/patrimoine/YieldCalculator.tsx`
- [ ] T037 [US2] Integrer l'onglet Patrimoine dans la page detail bien existante `apps/web/src/pages/properties/PropertyDetail.tsx`
- [ ] T038 [US2] Creer les pages patrimoine par bien dans `apps/web/src/pages/properties/patrimoine/PropertyPatrimoinePage.tsx`, `apps/web/src/pages/properties/patrimoine/ValuationsPage.tsx`, `apps/web/src/pages/properties/patrimoine/ExpensesPage.tsx`, `apps/web/src/pages/properties/patrimoine/LoansPage.tsx`, `apps/web/src/pages/properties/patrimoine/DocumentsPage.tsx`
- [ ] T039 [US2] Appliquer la verification d'appartenance organisation avant toute ecriture dans `packages/api/src/lib/patrimoine/queries.ts`

**Checkpoint**: US2 est independamment exploitable sur un bien existant.

---

## Phase 5: User Story 3 - Produire et envoyer les releves de gerance proprietaire (Priority: P2)

**Goal**: Generer des releves proprietaires atomiques et permettre leur envoi trace.

**Independent Test**: Generer un releve sur une periode avec plusieurs biens, verifier les lignes/totaux, puis envoyer le releve et verifier statut + log de notification.

### Tests for User Story 3

- [ ] T040 [P] [US3] Ajouter les tests unitaires de calcul et agrégation des lignes de releve dans `packages/api/__tests__/unit/patrimoine.owner-statements.service.test.ts`
- [ ] T041 [P] [US3] Ajouter les tests API owner statements (`GET/POST/PATCH`) dans `packages/api/__tests__/api/patrimoine.owner-statements.test.ts`
- [ ] T042 [P] [US3] Ajouter les tests API envoi de releve dans `packages/api/__tests__/api/patrimoine.owner-statements.send.test.ts`
- [ ] T043 [P] [US3] Ajouter les tests UI pages releves proprietaire dans `apps/web/src/__tests__/patrimoine/OwnerStatementsPages.test.tsx`

### Implementation for User Story 3

- [ ] T044 [US3] Implementer le service transactionnel de generation de releve dans `packages/api/src/lib/patrimoine/owner-statements-service.ts`
- [ ] T045 [US3] Implementer le controller owner statements (liste, detail, generation, mise a jour, envoi) dans `packages/api/src/controllers/owner-statements-controller.ts`
- [ ] T046 [US3] Connecter les routes owner statements et send dans `packages/api/src/routes/owner-statements-routes.ts`
- [ ] T047 [US3] Implementer `sendOwnerStatement` (consentement + journalisation event) dans `packages/api/src/lib/patrimoine/notifications.ts`
- [ ] T048 [US3] Ajouter la page liste des releves dans `apps/web/src/pages/patrimoine/statements/OwnerStatementsPage.tsx`
- [ ] T049 [P] [US3] Ajouter la page detail releve dans `apps/web/src/pages/patrimoine/statements/OwnerStatementDetailPage.tsx`
- [ ] T050 [P] [US3] Ajouter le composant `OwnerStatementGenerator` dans `apps/web/src/components/patrimoine/OwnerStatementGenerator.tsx`

**Checkpoint**: US3 est independamment testable de bout en bout.

---

## Phase 6: User Story 4 - Anticiper la performance et les risques patrimoniaux (Priority: P3)

**Goal**: Exposer les rendements avances, projections pluriannuelles et alertes patrimoniales.

**Independent Test**: Calculer rendements et projection sur N annees depuis la page performance puis verifier les alertes documents/prets.

### Tests for User Story 4

- [ ] T051 [P] [US4] Ajouter les tests unitaires de projection de rendement dans `packages/api/__tests__/unit/patrimoine.yield-projection.test.ts`
- [ ] T052 [P] [US4] Ajouter les tests API performance et alertes documents dans `packages/api/__tests__/api/patrimoine.performance-alerts.test.ts`
- [ ] T053 [P] [US4] Ajouter les tests UI page performance et graphique de projection dans `apps/web/src/__tests__/patrimoine/PatrimoinePerformancePage.test.tsx`

### Implementation for User Story 4

- [ ] T054 [US4] Completer `projectYield` et helpers de simulation dans `packages/api/src/lib/patrimoine/yield.ts`
- [ ] T055 [US4] Implementer les alertes `alertExpiringDocuments` et `LOAN_MATURITY_ALERT` dans `packages/api/src/lib/patrimoine/notifications.ts`
- [ ] T056 [US4] Ajouter l'endpoint de calcul avance de performance dans `packages/api/src/controllers/patrimoine-controller.ts`
- [ ] T057 [US4] Ajouter la page performance patrimoine dans `apps/web/src/pages/patrimoine/PatrimoinePerformancePage.tsx`
- [ ] T058 [P] [US4] Ajouter `YieldProjectionChart` dans `apps/web/src/components/patrimoine/YieldProjectionChart.tsx`
- [ ] T059 [P] [US4] Ajouter la page programme de travaux dans `apps/web/src/pages/patrimoine/work-programs/WorkProgramsPage.tsx`

**Checkpoint**: US4 est independamment demonstrable avec simulations et alertes.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finaliser documentation, observabilite, qualite et validations transverses.

- [ ] T060 [P] Documenter les endpoints patrimoine dans `packages/api/API.md`
- [ ] T061 [P] Mettre a jour le guide fonctionnel patrimoine dans `docs/WORKFLOW_TEST_MODULE_SYNDIC_DEBUT_FIN.md`
- [ ] T062 Renforcer les logs et gestion d'erreurs patrimoine dans `packages/api/src/utils/error-utils.ts` et `packages/api/src/utils/logger.ts`
- [ ] T063 Verifier l'absence de creation/modification `Property` dans le module patrimoine via revue de code ciblee `packages/api/src/controllers/property-patrimoine-controller.ts`
- [ ] T064 Executer la recette quickstart et consigner les resultats dans `specs/015-patrimoine-module/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: demarrage immediat.
- **Phase 2 (Foundational)**: depend de Phase 1, bloque toutes les user stories.
- **Phase 3 (US1)**: depend de Phase 2, constitue le MVP.
- **Phase 4 (US2)**: depend de Phase 2, peut avancer en parallele de US1 si equipe suffisante.
- **Phase 5 (US3)**: depend de Phase 2 et de la disponibilite des entites patrimoniales de base.
- **Phase 6 (US4)**: depend de Phase 2 et des calculs de base implementes.
- **Phase 7 (Polish)**: depend des user stories retenues pour la release.

### User Story Dependencies

- **US1 (P1)**: independante apres fondations.
- **US2 (P1)**: independante apres fondations, partage les primitives API patrimoine.
- **US3 (P2)**: s'appuie sur US2 pour la coherence des donnees de biens, mais reste testable seule.
- **US4 (P3)**: depend des donnees patrimoines collectees (US2) pour la pleine valeur metier.

### Within Each User Story

- Tests d'abord (ou en parallele de scaffolding), puis implementation services/controllers, puis UI/integration.
- Toute route ecriture doit inclure verification organization avant persistence.
- Chaque story doit passer son test independant avant de passer a la suivante.

### Parallel Opportunities

- Setup: T002, T003, T004 en parallele.
- Foundational: T012, T013 en parallele, puis T014.
- US1: T016/T017/T018 en parallele puis T022/T023.
- US2: T025 a T031 en parallele; T035 et T036 en parallele.
- US3: T040/T041/T042/T043 en parallele; T049 et T050 en parallele.
- US4: T051/T052/T053 en parallele; T058 et T059 en parallele.

---

## Parallel Example: User Story 2

```bash
Task: "Ajouter les tests API valuations CRUD dans packages/api/__tests__/api/patrimoine.valuations.test.ts"
Task: "Ajouter les tests API expenses CRUD dans packages/api/__tests__/api/patrimoine.expenses.test.ts"
Task: "Ajouter les tests API loans CRUD dans packages/api/__tests__/api/patrimoine.loans.test.ts"
Task: "Ajouter les tests API work-programs CRUD dans packages/api/__tests__/api/patrimoine.work-programs.test.ts"
Task: "Ajouter les tests API documents CRUD dans packages/api/__tests__/api/patrimoine.documents.test.ts"
Task: "Ajouter les tests API yield GET /api/properties/:propertyId/yield dans packages/api/__tests__/api/patrimoine.yield.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completer Setup + Foundational (T001-T015)
2. Livrer US1 (T016-T024)
3. Valider les criteres independants US1
4. Demo interne avec dashboard portefeuille

### Incremental Delivery

1. MVP US1 en premier
2. Ajouter US2 (gestion par bien)
3. Ajouter US3 (releves proprietaires)
4. Ajouter US4 (projection/alertes)
5. Finaliser par Polish transverse

### Suggested MVP Scope

- Scope MVP recommande: **US1 uniquement** (T001-T024)
- Valeur livree: pilotage portefeuille immediate sans attendre les workflows avances.

---

## Notes

- Tous les textes UI doivent rester en francais.
- Aucun flux de creation de bien ne doit apparaitre dans les ecrans patrimoine.
- Les tasks marquées [P] visent des fichiers differents pour limiter les conflits.
- Commit recommande par groupe logique de tasks completes.
