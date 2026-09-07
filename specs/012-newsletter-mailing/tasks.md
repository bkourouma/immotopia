# Tasks: Newsletter et Mailing

**Input**: Design documents from `specs/012-newsletter-mailing/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, etc.)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `packages/api/src/`
- **Frontend**: `apps/web/src/`
- **Tests**: `packages/api/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependencies

- [x] T001 Install dependencies dompurify, jsdom, express-rate-limit (si absent) dans packages/api/package.json
- [x] T002 [P] Créer dossiers packages/api/src/services/, packages/api/src/controllers/, packages/api/src/routes/ pour newsletter si non existants
- [x] T003 [P] Créer dossiers apps/web/src/components/newsletter/, apps/web/src/pages/newsletter/, apps/web/src/services/ pour newsletter

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Ajouter modèles Prisma NewsletterList, NewsletterSubscriber, NewsletterCampaign, NewsletterCampaignRecipient, NewsletterTemplate et enums dans packages/api/prisma/schema.prisma
- [x] T005 Ajouter champ newsletter_consent Boolean @default(false) sur TenantClient dans packages/api/prisma/schema.prisma
- [x] T006 Exécuter migration Prisma `npx prisma migrate dev --name add_newsletter_mailing` depuis packages/api/
- [x] T007 [P] Créer NewsletterListService avec méthodes CRUD et getListsWithCounts dans packages/api/src/services/newsletter-list.service.ts
- [x] T008 [P] Créer NewsletterSubscriberService (add, list, import CSV, export CSV, remove) dans packages/api/src/services/newsletter-subscriber.service.ts
- [x] T009 [P] Créer NewsletterTemplateService avec CRUD dans packages/api/src/services/newsletter-template.service.ts
- [x] T010 Créer NewsletterCampaignService (create, get, update, resolveRecipients, sendCampaign, variable replacement) dans packages/api/src/services/newsletter-campaign.service.ts
- [x] T011 Monter routes newsletter authentifiées sous /api/tenants/:tenantId/newsletter/ dans packages/api/src/routes/newsletter-routes.ts
- [x] T012 Appliquer middleware rate-limit (10 req/min) sur routes publiques /api/newsletter/* dans packages/api/src/routes/newsletter-public-routes.ts
- [x] T013 Intégrer sanitization HTML (DOMPurify + jsdom) pour body_html des campagnes dans NewsletterCampaignService

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 + 3 - Manual Newsletter & Unsubscribe (Priority: P1) 🎯 MVP

**Goal**: Agency creates manual list, imports subscribers, creates and sends campaign with unsubscribe links; recipients can unsubscribe

**Independent Test**: Create manual list → Import CSV → Create campaign with {{lien_desinscription}} → Send → Verify emails received with unsubscribe link → Click link → Verify UNSUBSCRIBED → Send again → Verify excluded

### Implementation for User Story 1 + 3

- [x] T014 [US1] Implémenter endpoints GET/POST /tenants/:tenantId/newsletter/lists et GET/PATCH/DELETE /tenants/:tenantId/newsletter/lists/:listId dans packages/api/src/controllers/newsletter-controller.ts
- [x] T015 [US1] Implémenter endpoints GET/POST /tenants/:tenantId/newsletter/lists/:listId/subscribers, POST .../import, GET .../export, DELETE .../subscribers/:subscriberId dans newsletter-controller.ts
- [x] T016 [US1] Implémenter endpoints POST/GET/PATCH /tenants/:tenantId/newsletter/campaigns, POST .../send, GET .../preview, GET .../recipients dans newsletter-controller.ts
- [x] T017 [US1] Implémenter logique d'envoi: résolution destinataires ACTIVE uniquement, génération unsubscribe_token par recipient, remplacement variables {{prenom}}, {{lien_desinscription}}, etc., envoi via EmailService dans NewsletterCampaignService
- [x] T018 [US1] Implémenter validation {{lien_desinscription}} obligatoire avant envoi dans NewsletterCampaignService
- [x] T019 [US3] Implémenter endpoints publics GET/POST /api/newsletter/unsubscribe avec rate-limit dans newsletter-controller.ts et routes
- [x] T020 [US3] Implémenter option "désabonnement toutes listes du tenant" dans NewsletterSubscriberService et handler unsubscribe
- [x] T021 [US1] Créer page NewsletterListsPage.tsx avec dashboard listes (compteurs) dans apps/web/src/pages/newsletter/
- [x] T022 [US1] Créer composants ListDashboard, SubscriberList, ImportCsvModal, CampaignForm dans apps/web/src/components/newsletter/
- [x] T023 [US1] Créer page NewsletterCampaignsPage.tsx avec historique et stats dans apps/web/src/pages/newsletter/
- [x] T024 [US1] Créer service API newsletter.service.ts dans apps/web/src/services/newsletter.service.ts
- [x] T025 [US3] Créer page publique de confirmation désinscription (ou template HTML renvoyé) pour GET /newsletter/unsubscribe

**Checkpoint**: US1 + US3 fully functional - manual newsletter with unsubscribe

---

## Phase 4: User Story 2 - Public Subscription (Priority: P1)

**Goal**: Visitor subscribes via public form, receives confirmation email, clicks link to confirm

**Independent Test**: POST /newsletter/subscribe → Receive confirmation email → GET /newsletter/confirm?token=... → Verify status ACTIVE

### Implementation for User Story 2

- [x] T026 [US2] Implémenter endpoint POST /api/newsletter/subscribe (listId ou listToken, email, name) dans newsletter-controller.ts
- [x] T027 [US2] Implémenter création subscriber PENDING_CONFIRMATION, génération confirmation_token (7 jours) dans NewsletterSubscriberService
- [x] T028 [US2] Implémenter envoi email confirmation avec lien unique dans NewsletterSubscriberService (via EmailService)
- [x] T029 [US2] Implémenter endpoint GET /api/newsletter/confirm?token=... dans newsletter-controller.ts
- [x] T030 [US2] Gérer token invalide/expiré et subscriber déjà ACTIVE (message friendly) dans handler confirm
- [x] T031 [US2] Générer public_subscribe_token pour listes MANUAL et exposition dans détail liste pour formulaire public
- [x] T032 [US2] Créer composant formulaire public SubscriptionForm.tsx (optionnel, peut être embed) dans apps/web/src/components/newsletter/

**Checkpoint**: US2 fully functional - public double opt-in

---

## Phase 5: User Story 4 - Newsletter to Property Owners (Priority: P2)

**Goal**: Agency creates FROM_OWNERS list, sends campaign to owners with newsletter_consent

**Independent Test**: Enable newsletter_consent on owner → Create FROM_OWNERS list → Send campaign → Verify only consenting owners receive

### Implementation for User Story 4

- [x] T033 [US4] Implémenter résolution abonnés pour listes FROM_OWNERS (TenantClient clientType=OWNER, newsletter_consent=true) dans NewsletterCampaignService
- [x] T034 [US4] Implémenter compteur owners avec consent dans getListsWithCounts pour type FROM_OWNERS dans NewsletterListService
- [x] T035 [US4] Bloquer import/ajout manuel sur listes dérivées avec message d'erreur en français dans NewsletterSubscriberService
- [x] T036 [US4] Exposer champ newsletter_consent dans API/UI préférences TenantClient (owner portal ou back-office) si non existant
- [x] T037 [US4] Adapter UI création liste pour afficher type FROM_OWNERS et compteur dynamique

**Checkpoint**: US4 fully functional - FROM_OWNERS lists

---

## Phase 6: User Story 5 - Schedule Newsletter (Priority: P2)

**Goal**: Agency schedules campaign for future send, can cancel before scheduled time; job processes at scheduled time

**Independent Test**: Create campaign → Schedule +2 min → Status SCHEDULED → Wait → Campaign sends → Or cancel before send

### Implementation for User Story 5

- [x] T038 [US5] Implémenter endpoint POST /tenants/:tenantId/newsletter/campaigns/:id/schedule avec scheduledAt dans newsletter-controller.ts
- [x] T039 [US5] Implémenter endpoint POST .../campaigns/:id/cancel (bloquer si SENDING/SENT) dans newsletter-controller.ts
- [x] T040 [US5] Créer job newsletter-campaign-scheduler.job.ts exécuté toutes les minutes (node-cron) dans packages/api/src/jobs/
- [x] T041 [US5] Job: sélectionner campagnes SCHEDULED où scheduled_at <= now(), appeler sendCampaign pour chacune
- [x] T042 [US5] Enregistrer et démarrer le job au boot de l'API dans packages/api/src/index.ts
- [x] T043 [US5] Ajouter UI planification (date/heure picker) et annulation dans CampaignForm

**Checkpoint**: US5 fully functional - scheduled campaigns

---

## Phase 7: User Story 6 - Reusable Templates (Priority: P3)

**Goal**: Agency creates templates with {{contenu}}, uses them in campaigns

**Independent Test**: Create template → Create campaign with template → Edit {{contenu}} → Send → Verify combined HTML

### Implementation for User Story 6

- [x] T044 [US6] Implémenter endpoints GET/POST/PATCH/DELETE /tenants/:tenantId/newsletter/templates dans newsletter-controller.ts
- [x] T045 [US6] Permettre sélection template_id à la création campagne, fusionner template.html + body_html ({{contenu}}) dans NewsletterCampaignService
- [x] T046 [US6] Bloquer suppression template si utilisé par campagne SCHEDULED
- [x] T047 [US6] Stocker rendered_html final dans campagne après envoi pour historique (FR-057)
- [x] T048 [US6] Créer page NewsletterTemplatesPage.tsx et TemplateEditor dans apps/web

**Checkpoint**: US6 fully functional - reusable templates

---

## Phase 8: User Story 7 - CRM Contacts & Renters (Priority: P3)

**Goal**: Agency sends to FROM_CRM_CONTACTS and FROM_RENTERS (consent_email / newsletter_consent)

**Independent Test**: Create FROM_CRM_CONTACTS, FROM_RENTERS lists → Send → Verify only consenting receive

### Implementation for User Story 7

- [x] T049 [US7] Implémenter résolution abonnés FROM_CRM_CONTACTS (CrmContact consent_email=true) dans NewsletterCampaignService
- [x] T050 [US7] Implémenter résolution abonnés FROM_RENTERS (TenantClient clientType=RENTER, newsletter_consent=true) dans NewsletterCampaignService
- [x] T051 [US7] Implémenter compteurs dans getListsWithCounts pour FROM_CRM_CONTACTS et FROM_RENTERS
- [x] T052 [US7] Adapter UI création liste pour types FROM_CRM_CONTACTS, FROM_RENTERS

**Checkpoint**: US7 fully functional - derived lists complete

---

## Phase 9: User Story 8 - Export Subscriber List (Priority: P3)

**Goal**: Agency exports subscribers to CSV

**Independent Test**: List with subscribers → Export → Download CSV with email, name, status, dates

### Implementation for User Story 8

- [x] T053 [US8] Implémenter GET /tenants/:tenantId/newsletter/lists/:listId/export retournant CSV (email, name, status, subscribed_at, confirmed_at, unsubscribed_at) dans newsletter-controller.ts
- [x] T054 [US8] Pour listes dérivées: résoudre abonnés à l'instant de l'export
- [x] T055 [US8] Gérer liste vide (CSV avec headers ou message) dans NewsletterSubscriberService.export
- [x] T056 [US8] Ajouter bouton Export sur page détail liste dans SubscriberList

**Checkpoint**: US8 fully functional - export

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Security, RBAC, navigation, validation

- [x] T057 Vérifier RBAC: toutes les routes back-office réservées aux agency administrators dans packages/api (requireTenantCollaborator)
- [x] T058 Vérifier isolation tenant stricte sur tous les services newsletter (tenantId dans chaque requête)
- [x] T059 Gérer token unsubscribe invalide/expiré avec message en français sur page désinscription
- [x] T060 Ajouter entrée navigation "Newsletter" / "Listes de diffusion" dans menu principal apps/web
- [x] T061 Exécuter validation quickstart.md et corriger écarts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - can start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 - BLOCKS all user stories
- **Phase 3 (US1+US3)**: Depends on Phase 2 - MVP core
- **Phase 4 (US2)**: Depends on Phase 2 (lists, subscribers) - independent of Phase 3
- **Phase 5 (US4)**: Depends on Phase 3 (campaign send)
- **Phase 6 (US5)**: Depends on Phase 3 (campaigns)
- **Phase 7 (US6)**: Depends on Phase 3 (campaigns)
- **Phase 8 (US7)**: Depends on Phase 5 (same pattern as FROM_OWNERS)
- **Phase 9 (US8)**: Depends on Phase 3 (subscribers, lists)
- **Phase 10 (Polish)**: Depends on all above

### User Story Dependencies

| Story | Depends On | Can Start After |
|-------|------------|-----------------|
| US1 + US3 | Foundational | Phase 2 complete |
| US2 | Foundational | Phase 2 complete (lists, subscribers) |
| US4 | US1 | Phase 3 complete |
| US5 | US1 | Phase 3 complete |
| US6 | US1 | Phase 3 complete |
| US7 | US4 | Phase 5 complete |
| US8 | US1 | Phase 3 complete |

### Parallel Opportunities

- **Phase 1**: T002, T003 can run in parallel
- **Phase 2**: T007, T008, T009 can run in parallel
- **Phase 4**: Can start in parallel with Phase 3 (different developer)
- **Phases 5–9**: Can be parallelized after Phase 3 (different developers)

---

## Parallel Example: Phase 2

```bash
# Services en parallèle:
T007: newsletter-list.service.ts
T008: newsletter-subscriber.service.ts
T009: newsletter-template.service.ts
```

---

## Implementation Strategy

### MVP First (Phases 1–4)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: US1 + US3 (manual newsletter + unsubscribe)
4. Complete Phase 4: US2 (public subscribe/confirm)
5. **STOP and VALIDATE**: Test full MVP flow
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Phase 3 (US1+US3) → Manual newsletter + unsubscribe (MVP core!)
3. Phase 4 (US2) → Public subscription (MVP complete)
4. Phase 5 (US4) → FROM_OWNERS
5. Phase 6 (US5) → Scheduling
6. Phases 7–9 → Templates, CRM/Renters, Export
7. Phase 10 → Polish

### Task Count Summary

| Phase | Task Count | User Stories |
|-------|------------|--------------|
| Phase 1 Setup | 3 | - |
| Phase 2 Foundational | 10 | - |
| Phase 3 US1+US3 | 12 | US1, US3 |
| Phase 4 US2 | 7 | US2 |
| Phase 5 US4 | 5 | US4 |
| Phase 6 US5 | 6 | US5 |
| Phase 7 US6 | 5 | US6 |
| Phase 8 US7 | 4 | US7 |
| Phase 9 US8 | 4 | US8 |
| Phase 10 Polish | 5 | - |
| **Total** | **61** | **8 stories** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story phase is independently completable and testable
- Commit after each task or logical group
- UI: all text in French (Constitution)
- Unsubscribe links must remain valid ≥ 1 year (store token in CampaignRecipient)
