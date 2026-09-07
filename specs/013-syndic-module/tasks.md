# Tasks: Module de gestion des syndics de copropriété ImmoTopia

**Input**: Design documents from `/specs/013-syndic-module/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, `quickstart.md`

**Tests**: Les tâches incluent des tests uniquement pour les flux critiques (charges & AG).  
**Organization**: Tâches regroupées par user story pour permettre une implémentation et des tests indépendants.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Peut être réalisé en parallèle (fichiers distincts, pas de dépendance directe)
- **[Story]**: User story concernée (US1, US2, US3, US4)
- Chaque description inclut au moins un chemin de fichier concret

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Préparation de l’environnement ImmoTopia pour le module syndic.

- [x] T001 Mettre à jour `docs/IMMO-APP-FONCTIONNALITES-SCHEMA-API.md` pour ajouter la section « Module Syndic » (contexte fonctionnel et endpoints `/api/syndics/*`)
- [x] T002 Vérifier et, si besoin, créer le dossier `lib/syndics/` dans la racine du projet (à côté de `lib/prisma`, `lib/auth`, etc.)
- [x] T003 Vérifier la présence de la configuration Prisma et des scripts `prisma migrate` dans `package.json` (section scripts) pour ce projet Next.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Base technique nécessaire à toutes les user stories.

**⚠️ CRITICAL**: Aucune user story ne doit démarrer avant la fin de cette phase.

- [x] T004 Mettre à jour `prisma/schema.prisma` pour ajouter les enums et modèles syndic (`Syndicate`, `SyndicateLot`, `ChargeCall`, `ChargePayment`, `GeneralMeeting`, `GMResolution`, `GMVote`, `GMProxy`, `ServiceProvider`, `MaintenanceContract`, `CommonAreaAsset`, `SyndicateDocument`, `SyndicateFund`)
- [x] T005 Exécuter la migration Prisma pour le module syndic dans le projet (préparée via `prisma migrate dev --name add_syndic_module`, à lancer en local, puis `prisma generate`)
- [x] T006 [P] Créer `lib/syndics/schemas.ts` avec les schémas Zod de base (copropriété, lot, appel de charges, AG, résolution, vote, contrat) conformément à la spécification
- [x] T007 [P] Créer `lib/syndics/queries.ts` avec les fonctions Prisma partagées (ex. `listSyndicatesByOrganization`, `getSyndicateWithLotsAndStats`) en appliquant systématiquement le filtre `organizationId`
- [x] T008 Créer/compléter `lib/errors.ts` pour exposer des helpers d’erreurs réutilisables (`badRequest`, `forbidden`, `notFound`, `serverError`) utilisés par les nouvelles routes syndic
- [x] T009 Mettre à jour les événements de notifications (email/WhatsApp) pour ajouter les événements syndic (CHARGE_CALL_ISSUED, CHARGE_CALL_REMINDER, GENERAL_MEETING_CONVOCATION, GENERAL_MEETING_MINUTES, CONTRACT_RENEWAL_ALERT, COMMON_AREA_INCIDENT)
- [x] T010 [P] Créer `lib/syndics/notifications.ts` avec les signatures de helpers de notifications syndic (sans logique complète) pour `notifyChargeCall` et `notifyMeetingConvocation`

**Checkpoint**: Modèles Prisma + Zod + helpers d’erreurs et notifications sont en place pour toutes les stories.

---

## Phase 3: User Story 1 - Gérer une copropriété et ses lots (Priority: P1) 🎯 MVP

**Goal**: Permettre à un gestionnaire de créer une copropriété, de lui associer des lots et des propriétaires, puis de consulter ces informations en mode multi-tenant.

**Independent Test**: Un gestionnaire peut créer une copropriété, lui ajouter plusieurs lots rattachés à des biens/propriétaires existants, puis voir la synthèse sur la page détail (nombre de lots, répartition, propriétaires) sans dépendre des autres modules syndic (charges, AG, prestataires).

### Implementation for User Story 1

- [x] T011 [P] [US1] Compléter `lib/syndics/schemas.ts` avec `createSyndicateSchema` et `createLotSchema` (validation des champs métier décrits dans la spec)
- [x] T012 [P] [US1] Implémenter dans `lib/syndics/queries.ts` les fonctions `createSyndicateWithDefaults` et `createSyndicateLot` avec filtrage par `tenantId`
- [x] T013 [US1] Créer les routes backend `/api/tenants/:tenantId/syndics` (GET liste + POST création) en utilisant Prisma et `createSyndicateSchema`
- [x] T014 [US1] Créer les routes backend `/api/tenants/:tenantId/syndics/:id` (GET détail + PATCH mise à jour + DELETE/archivage) avec contrôle strict de `tenantId`
- [x] T015 [US1] Créer les routes backend `/api/tenants/:tenantId/syndics/:id/lots` (GET liste des lots + POST création de lot) utilisant `createLotSchema` et les fonctions Prisma de `lib/syndics/queries.ts`
- [x] T016 [P] [US1] Créer `apps/web/src/pages/syndics/SyndicsList.tsx` pour afficher la liste des copropriétés (titre, adresse, nombre de lots, statut) en s’appuyant sur `apps/web/src/components/syndics/SyndicateCard.tsx`
- [x] T017 [P] [US1] Créer `apps/web/src/pages/syndics/SyndicDetail.tsx` pour afficher le détail d’une copropriété (infos générales + résumé des lots)
- [x] T018 [P] [US1] Créer `apps/web/src/pages/syndics/SyndicLots.tsx` pour lister les lots et permettre la création/édition de lots
- [x] T019 [P] [US1] Créer `apps/web/src/components/syndics/SyndicateCard.tsx` (carte récapitulative) et `apps/web/src/components/syndics/LotTable.tsx` (tableau des lots) avec UI 100 % en français
- [x] T020 [US1] Ajouter des tests backend pour la création de copropriété et de lots (`__tests__/api/syndics.syndicate.test.ts` ou équivalent) en vérifiant l’isolation `organizationId`
- [x] T021 [US1] Ajouter des tests frontend (React Testing Library) pour la page de liste et de détail des copropriétés (`apps/web/src/__tests__/syndics/SyndicsPages.test.tsx`)

**Checkpoint**: L’interface permet de gérer copropriétés et lots de manière autonome, avec tests verts.

---

## Phase 4: User Story 2 - Appeler et suivre les charges de copropriété (Priority: P1)

**Goal**: Permettre au gestionnaire de créer des appels de charges par période, de suivre les paiements par lot et d’identifier rapidement les impayés.

**Independent Test**: À partir d’une copropriété et de lots existants, un gestionnaire peut émettre des appels de charges (période, montant, échéance), enregistrer des paiements, voir les statuts (PENDING, PARTIAL, PAID, OVERDUE) et obtenir une vue des lots en retard.

### Implementation for User Story 2

- [x] T022 [P] [US2] Compléter `lib/syndics/schemas.ts` avec `createChargeCallSchema` et le schéma de création de paiement (aligné sur la spec)
- [x] T023 [P] [US2] Implémenter dans `lib/syndics/queries.ts` les fonctions `createChargeCallAndUpdateStatus` et `recordChargePaymentWithStatusUpdate` utilisant des transactions Prisma
- [x] T024 [US2] Créer la route `api/syndics/[id]/charges/route.ts` (GET liste des appels de charges par period/status + POST création) en appliquant les schémas Zod et filtres `organizationId`
- [x] T025 [US2] Créer la route `api/syndics/[id]/charges/[chargeId]/route.ts` (GET détail) pour un appel de charges
- [x] T026 [US2] Créer la route `api/syndics/[id]/charges/[chargeId]/pay/route.ts` (POST enregistrement d’un paiement) en utilisant la fonction `recordChargePaymentWithStatusUpdate`
- [x] T027 [P] [US2] Créer `apps/web/src/components/syndics/ChargeCallTable.tsx` pour afficher les appels de charges (période, montant, statut, échéance) avec indicateurs visuels pour les impayés
- [x] T028 [P] [US2] Créer `apps/web/src/pages/syndics/SyndicCharges.tsx` pour piloter les appels de charges d’une copropriété (liste, filtres, actions de création)
- [x] T029 [US2] Implémenter dans `packages/api/src/lib/syndics/notifications.ts` la logique `notifyChargeCall(chargeCallId)` en intégrant les préférences de contact et les configs notifications (WhatsApp/email)
- [x] T030 [US2] Ajouter des tests backend pour les routes de charges et paiements (`packages/api/__tests__/api/syndics.charges.test.ts`) incluant les cas PENDING → PARTIAL → PAID/OVERDUE
- [x] T031 [US2] Ajouter des tests frontend pour la page de charges (`apps/web/src/__tests__/syndics/ChargesPage.test.tsx`) couvrant la création d’appel de charges et l’affichage des statuts

**Checkpoint**: Les appels de charges et paiements fonctionnent de bout en bout, avec notifications à l’émission.

---

## Phase 5: User Story 3 - Organiser les Assemblées Générales et les décisions (Priority: P2)

**Goal**: Permettre au gestionnaire de planifier des AG, de gérer les résolutions et de saisir les votes par lot afin d’obtenir un récapitulatif des décisions et du quorum.

**Independent Test**: Pour une copropriété donnée, il est possible de créer une AG, d’ajouter des résolutions, d’enregistrer les votes par lot et d’afficher un tableau de bord des résultats (quorum, résolutions approuvées/rejetées) sans dépendre de la gestion des prestataires/équipements.

### Implementation for User Story 3

- [x] T032 [P] [US3] Compléter `lib/syndics/schemas.ts` avec `createMeetingSchema`, `createResolutionSchema` et `castVoteSchema`
- [x] T033 [P] [US3] Implémenter dans `lib/syndics/queries.ts` les fonctions `createMeetingWithResolutions` et `castVoteAndRecomputeResolutionCounters` (calculs de quorum, votes et tantièmes)
- [x] T034 [US3] Créer la route `api/syndics/[id]/assemblees/route.ts` (GET liste des AG + POST création) avec filtres par statut/date
- [x] T035 [US3] Créer la route `api/syndics/[id]/assemblees/[meetingId]/route.ts` (GET détail de l’AG, y compris résolutions et votes agrégés)
- [x] T036 [US3] Créer la route `api/syndics/[id]/assemblees/[meetingId]/resolutions/route.ts` (POST ajout de résolution) et `api/syndics/[id]/assemblees/[meetingId]/resolutions/[resolutionId]/votes/route.ts` (POST vote)
- [x] T037 [P] [US3] Créer `apps/web/src/components/syndics/MeetingAgenda.tsx` pour afficher l’ordre du jour (résolutions) et les actions de vote (boutons, statuts)
- [x] T038 [P] [US3] Créer `apps/web/src/components/syndics/VoteBoard.tsx` pour afficher le quorum, les résultats par résolution (voix et tantièmes) en temps quasi réel
- [x] T039 [P] [US3] Créer `apps/web/src/pages/syndics/SyndicMeetings.tsx` et `apps/web/src/pages/syndics/SyndicMeetingDetail.tsx` (liste des AG + détail d’AG + votes)
- [x] T040 [US3] Implémenter `notifyMeetingConvocation(meetingId)` dans `packages/api/src/lib/syndics/notifications.ts` pour envoyer les convocations aux copropriétaires selon leurs préférences
- [x] T041 [US3] Ajouter des tests backend pour les flux AG/résolutions/votes (`packages/api/__tests__/api/syndics.meetings.test.ts`) incluant les cas de quorum et de résultats par résolution
- [x] T042 [US3] Ajouter des tests frontend pour les écrans d’AG (`apps/web/src/__tests__/syndics/MeetingsPages.test.tsx`)

**Checkpoint**: Les AG peuvent être créées, convoquées et clôturées avec un suivi fiable des décisions.

---

## Phase 6: User Story 4 - Piloter les prestataires, contrats et équipements communs (Priority: P3)

**Goal**: Centraliser la gestion des prestataires, contrats et équipements communs d’une copropriété, avec alertes d’échéance et visibilité dans la fiche copropriété.

**Independent Test**: Un gestionnaire peut ajouter un prestataire, créer un contrat lié à une copropriété, enregistrer des équipements/parties communes et visualiser les éléments et leurs alertes (contrats à renouveler, maintenance à prévoir) sans dépendre des flux d’AG.

### Implementation for User Story 4

- [x] T043 [P] [US4] Compléter `lib/syndics/schemas.ts` avec `createContractSchema` pour la création de contrats prestataires
- [x] T044 [US4] Mettre à jour/implémenter dans `lib/syndics/queries.ts` les fonctions de gestion des prestataires/contrats (`listServiceProviders`, `listMaintenanceContractsBySyndicate`, `createMaintenanceContract`)
- [x] T045 [US4] Créer la route `api/syndics/[id]/prestataires/route.ts` (GET contrats/prestataires pour une copropriété)
- [x] T046 [US4] Créer la route `api/syndics/[id]/contrats/route.ts` et `api/syndics/[id]/contrats/[contractId]/route.ts` (CRUD contrats de maintenance)
- [x] T047 [P] [US4] Créer `apps/web/src/components/syndics/ContractList.tsx` pour afficher les contrats prestataires, statuts et alertes d’expiration
- [x] T048 [P] [US4] Créer `apps/web/src/components/syndics/SyndicateFundWidget.tsx` pour afficher les soldes des fonds (`SyndicateFund`) d’une copropriété
- [x] T049 [P] [US4] Créer `apps/web/src/components/syndics/DocumentVault.tsx` pour afficher les documents (`SyndicateDocument`) avec filtres par type et alertes d’expiration
- [x] T050 [P] [US4] Créer `apps/web/src/pages/syndics/SyndicProviders.tsx`, `apps/web/src/pages/syndics/SyndicDocuments.tsx` et `apps/web/src/pages/syndics/SyndicFinances.tsx`
- [x] T051 [US4] Ajouter des tests backend pour les endpoints prestataires/contrats/documents/fonds (`packages/api/__tests__/api/syndics.providers-docs-funds.test.ts`)
- [x] T052 [US4] Ajouter des tests frontend pour les écrans prestataires/documents/finances (`apps/web/src/__tests__/syndics/ProvidersDocumentsFinancesPages.test.tsx`)

**Checkpoint**: Les prestataires, contrats, documents et fonds sont gérés et visibles depuis la fiche copropriété.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Améliorations transverses et finalisation.

- [x] T053 [P] Mettre à jour la documentation API dans `specs/013-syndic-module/contracts/openapi.yaml` en fonction des ajustements réalisés pendant l’implémentation
- [x] T054 [P] Compléter `docs/IMMO-APP-FONCTIONNALITES-SCHEMA-API.md` avec des exemples de flux complets (création copro → lots → charges → AG → prestataires)
- [x] T055 Effectuer un passage de revue UX pour s’assurer que tous les textes UI sont en français et cohérents
- [x] T056 Effectuer un nettoyage de code et factoriser les duplications dans `lib/syndics/*` et les pages `app/(dashboard)/syndics/*`
- [x] T057 [P] Vérifier la couverture de tests (backend et frontend) et ajouter des tests complémentaires si nécessaire pour atteindre les objectifs de qualité
- [x] T058 Exécuter le workflow de test end‑to‑end décrit dans `specs/013-syndic-module/quickstart.md` et consigner les résultats

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Aucune dépendance – peut démarrer immédiatement.  
- **Foundational (Phase 2)**: Dépend de Setup – BLOQUE toutes les user stories tant qu’incomplète.  
- **User Stories (Phase 3–6)**: Dépendent de la fin de la Phase 2, puis peuvent avancer en parallèle selon la capacité de l’équipe.  
- **Polish (Phase 7)**: Dépend de la complétion des stories ciblées pour le release scope.

### User Story Dependencies

- **User Story 1 (P1)**: Peut démarrer après la Phase 2 – aucune dépendance fonctionnelle sur les autres stories.  
- **User Story 2 (P1)**: Peut démarrer après la Phase 2 – dépend des modèles de base (Syndicate, SyndicateLot) mais pas des AG ni des prestataires.  
- **User Story 3 (P2)**: Peut démarrer après la Phase 2 – dépend de la présence de copropriétés et lots (US1), mais reste testable de façon autonome.  
- **User Story 4 (P3)**: Peut démarrer après la Phase 2 – dépend de la présence de copropriétés (US1), mais ne dépend pas des AG.

### Parallel Opportunities

- T006, T007, T010 peuvent être réalisés en parallèle pendant la Phase 2.  
- Dans chaque user story, les tâches marquées [P] peuvent être réparties entre plusieurs développeurs (ex. implémentation API vs UI).  
- Les stories US2, US3 et US4 peuvent être développées en parallèle une fois la Phase 2 terminée, sous réserve de la disponibilité des entités de base (US1).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Compléter la Phase 1 (Setup).  
2. Compléter la Phase 2 (Foundational).  
3. Implémenter entièrement la Phase 3 (US1).  
4. Arrêter et valider l’MVP syndic (copropriétés + lots) avec les tests associés.

### Incremental Delivery

1. MVP US1 livré et validé.  
2. Ajouter US2 (charges & paiements) → tester indépendamment → livrer.  
3. Ajouter US3 (AG & votes) → tester indépendamment → livrer.  
4. Ajouter US4 (prestataires, contrats, documents, fonds) → tester indépendamment → livrer.  
5. Appliquer la Phase 7 pour la finition (doc, UX, couverture de tests).
