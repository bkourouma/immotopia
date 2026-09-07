# Tâches : Module de Communication ImmoTopia

**Entrée** : Documents de conception dans `/specs/010-communication-module/`  
**Prérequis** : plan.md, spec.md

**Organisation** : Les tâches sont regroupées par user story pour permettre une implémentation et des tests indépendants.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : Peut être exécuté en parallèle (fichiers différents, pas de dépendances)
- **[Story]** : User story concernée (US1, US2, …)
- Inclure les chemins de fichiers exacts dans les descriptions

## Conventions de chemins

- **Backend** : `packages/api/src/`, `packages/api/prisma/`
- **Frontend** : `apps/web/src/`
- **Tests** : `packages/api/__tests__/`

---

## Phase 1 : Setup (infrastructure partagée)

**Objectif** : Initialisation du module communication dans le monorepo existant.

- [x] T001 Create communication types and DTOs placeholder in packages/api/src/types/communication-types.ts
- [x] T002 Add communication environment variables to .env.example (EMAIL_PROVIDER, SENDGRID_*, TWILIO_*, COMMUNICATION_QUEUE_*) in packages/api or repo root
- [x] T003 [P] Register communication routes mount for /api/tenants/:tenantId/communication in packages/api (app or routes index)

---

## Phase 2 : Fondations (prérequis bloquants)

**Objectif** : Schéma de données, services métier et providers sans lesquels aucune user story ne peut être livrée.

**Critique** : Aucun travail sur les user stories ne peut commencer avant la fin de cette phase.

- [x] T004 Add Prisma enums (CommunicationType, CommunicationChannel, CommunicationStatus, RecipientType, EventTrigger) in packages/api/prisma/schema.prisma
- [x] T005 Add Prisma models CommunicationTemplate, NotificationRule, Communication, CommunicationPreference with relations (Tenant, User, TenantClient, CrmContact) in packages/api/prisma/schema.prisma
- [x] T006 Run Prisma migration for communication tables (packages/api/prisma/migrations)
- [x] T007 [P] Create Zod schemas for template, rule, communication, preference create/update in packages/api/src/types/ or validators
- [x] T008 Implement CommunicationService (createCommunication, sendCommunication, scheduleCommunication, cancelCommunication, retryCommunication, getStatus, getHistory) in packages/api/src/services/communication.service.ts
- [x] T009 Implement NotificationEngine (triggerEvent, processNotificationRules, evaluateConditions, resolveTemplateVariables, resolveRecipients) in packages/api/src/services/notification-engine.service.ts
- [x] T010 Implement QueueService (enqueue, processQueue, handleFailure with retry) in packages/api/src/services/queue.service.ts
- [x] T011 [P] Implement EmailProvider (configure, send, sendWithTemplate, handleWebhook) in packages/api/src/services/providers/email.provider.ts
- [x] T012 [P] Implement WhatsAppProvider (configure, sendText, sendTemplate, sendImage, handleWebhook) in packages/api/src/services/providers/whatsapp.provider.ts
- [x] T013 Wire CommunicationService to EmailProvider and WhatsAppProvider for actual send in packages/api/src/services/communication.service.ts
- [x] T014 Create communication controller and routes (templates CRUD, rules CRUD, messages CRUD + send/schedule/cancel/retry, preferences CRUD, analytics, webhooks) in packages/api/src/controllers/ and packages/api/src/routes/communication-routes.ts
- [x] T015 Add tenant isolation and RBAC middleware to communication routes in packages/api

**Checkpoint** : Fondations prêtes – les user stories peuvent commencer.

---

## Phase 3 : User Story 1 – Envoi et réception de notifications par événement (P1) – MVP

**Objectif** : Les destinataires reçoivent automatiquement des messages (email et/ou WhatsApp) lorsque des événements se produisent, selon les règles et préférences.

**Test indépendant** : Configurer une règle pour un type d’événement (ex. rappel d’échéance de loyer), déclencher l’événement, vérifier que le destinataire reçoit le message sur le canal configuré.

### Implémentation User Story 1

- [x] T016 [US1] Integrate NotificationEngine.triggerEvent in rental lease service (LEASE_ACTIVATED, LEASE_ENDING_SOON) in packages/api/src/services/rental/
- [x] T017 [US1] Integrate NotificationEngine.triggerEvent in rental installment or payment service (INSTALLMENT_DUE_REMINDER, INSTALLMENT_OVERDUE, PAYMENT_RECEIVED, PAYMENT_CONFIRMED) in packages/api/src/services/rental/
- [x] T018 [US1] Integrate NotificationEngine.triggerEvent in maintenance ticket service (TICKET_CREATED, TICKET_STATUS_CHANGED) in packages/api/src/services/maintenance/ or equivalent
- [x] T019 [US1] Integrate NotificationEngine.triggerEvent in CRM (DEAL_CREATED, DEAL_STAGE_CHANGED, APPOINTMENT_REMINDER) and property service (PROPERTY_PUBLISHED, DOCUMENT_EXPIRING) in packages/api
- [x] T020 [US1] Ensure NotificationEngine respects CommunicationPreference (channels, types, disabled_triggers) when resolving recipients and choosing channel in packages/api/src/services/notification-engine.service.ts
- [x] T021 [US1] Add at least one default CommunicationTemplate and one NotificationRule (e.g. PAYMENT_RECEIVED or INSTALLMENT_DUE_REMINDER) so US1 can be tested end-to-end (seed or migration)

**Checkpoint** : User Story 1 livrable et testable indépendamment.

---

## Phase 4 : User Story 2 – Gestion des templates et des règles par l’Agence (P2)

**Objectif** : L’Agence peut créer et modifier des templates (sujet, corps, variables) et des règles de notification (événement, destinataires, canal, template).

**Test indépendant** : Créer un template avec variables, créer une règle qui l’utilise, déclencher l’événement et vérifier que le message reçu correspond au template.

### Implémentation User Story 2

- [x] T022 [P] [US2] Ensure template CRUD API is complete with validation (GET/POST/PATCH/DELETE templates) in packages/api
- [x] T023 [P] [US2] Ensure rule CRUD API is complete (GET/POST/PATCH/DELETE rules, PATCH rules/:id/toggle) in packages/api
- [x] T024 [US2] Implement TemplatesPage (list, create, edit, preview) in apps/web/src/pages/communication/TemplatesPage.tsx
- [x] T025 [US2] Implement TemplateEditor and VariableSelector in apps/web/src/components/communication/TemplateEditor.tsx and VariableSelector.tsx
- [x] T026 [US2] Implement RulesPage (list, create, edit, toggle) in apps/web/src/pages/communication/RulesPage.tsx
- [x] T027 [US2] Implement RuleBuilder in apps/web/src/components/communication/RuleBuilder.tsx
- [x] T028 [US2] Add communication API client (templates, rules) in apps/web/src/services/communication-service.ts

**Checkpoint** : User Stories 1 et 2 livrables et testables indépendamment.

---

## Phase 5 : User Story 3 – Historique et statut des communications (P2)

**Objectif** : L’Agence consulte l’historique des communications avec filtres et voit le statut de chaque message (envoyé, délivré, lu, échec), avec annulation et retry.

**Test indépendant** : Envoyer ou déclencher des messages, filtrer l’historique par statut et destinataire, vérifier les statuts et la possibilité de réessayer en échec.

### Implémentation User Story 3

- [x] T029 [US3] Ensure message history API supports filters (type, channel, status, date, recipient) and pagination in packages/api/src/services/communication.service.ts and routes
- [x] T030 [US3] Implement HistoryPage with filters and paginated list in apps/web/src/pages/communication/HistoryPage.tsx
- [x] T031 [US3] Implement CommunicationStatus badge and detail view (failure reason, retry button) in apps/web/src/components/communication/CommunicationStatus.tsx
- [x] T032 [US3] Add cancel scheduled and retry failed actions in UI (buttons calling API) in apps/web (HistoryPage or detail modal)

**Checkpoint** : User Stories 1, 2 et 3 livrables et testables indépendamment.

---

## Phase 6 : User Story 4 – Préférences des destinataires (P3)

**Objectif** : Propriétaires et locataires peuvent définir leurs préférences (canaux, types de messages, quiet hours, désactivation par type d’événement) ; les envois les respectent.

**Test indépendant** : Modifier les préférences (désactiver WhatsApp ou certains types), déclencher des notifications et vérifier que seuls les canaux/types autorisés sont utilisés.

### Implémentation User Story 4

- [x] T033 [US4] Ensure preferences CRUD API (GET/POST/PATCH by recipientType/recipientId) is complete and tenant-scoped in packages/api
- [x] T034 [US4] Implement PreferencesPage (search recipient, edit preferences, quiet hours, disabled triggers) in apps/web/src/pages/communication/PreferencesPage.tsx
- [x] T035 [US4] Ensure NotificationEngine and queue respect quiet_hours when scheduling send time in packages/api/src/services/notification-engine.service.ts and queue.service.ts

**Checkpoint** : User Stories 1 à 4 livrables et testables indépendamment.

---

## Phase 7 : User Story 5 – Annonces et envois manuels (P3)

**Objectif** : L’Agence peut envoyer des annonces ou messages manuels à un ou plusieurs destinataires, avec planification optionnelle, en respectant les préférences.

**Test indépendant** : Composer une annonce, choisir des destinataires et un canal, envoyer immédiatement ou planifier, vérifier la réception et l’historique.

### Implémentation User Story 5

- [x] T036 [US5] Ensure bulk send and schedule API (POST messages/bulk, POST messages/:id/schedule) are implemented and validated in packages/api
- [x] T037 [US5] Implement UI for composing announcement (subject, body, attachments for email), RecipientSelector, send now or schedule in apps/web/src/pages/communication/ (e.g. AnnoncesPage or reuse HistoryPage compose)
- [x] T038 [US5] Implement PreviewModal for message preview in apps/web/src/components/communication/PreviewModal.tsx
- [x] T039 [US5] Ensure CommunicationService respects recipient preferences for manual announcements (filter channels per preference) in packages/api (bulkSendHandler filters channels by preference)

**Checkpoint** : User Stories 1 à 5 livrables et testables indépendamment.

---

## Phase 8 : User Story 6 – Tableau de bord et indicateurs (P4)

**Objectif** : L’Agence voit des indicateurs (taux de livraison par canal, volume par type, tendances) pour piloter l’efficacité du module.

**Test indépendant** : Générer des envois sur plusieurs canaux et types, consulter le tableau de bord et vérifier la cohérence des chiffres.

### Implémentation User Story 6

- [x] T040 [US6] Implement analytics API (GET analytics, delivery-rate, by-type, by-channel) in packages/api (controller + service)
- [x] T041 [US6] Implement AnalyticsPage with delivery rate, volume by type/canal, trends over time in apps/web/src/pages/communication/AnalyticsPage.tsx
- [x] T042 [P] [US6] Implement ChannelIcon component in apps/web/src/components/communication/ChannelIcon.tsx

**Checkpoint** : Toutes les user stories sont livrables et testables indépendamment.

---

## Phase 9 : Polish et transversal

**Objectif** : Jobs planifiés, templates par défaut, tests et documentation.

- [x] T043 Implement communication-queue-processor job (cron every minute) in packages/api/src/jobs/communication-queue-processor.job.ts
- [x] T044 Implement reminder-scheduler job (cron daily 6h) in packages/api/src/jobs/reminder-scheduler.job.ts
- [x] T045 Implement status-updater job (cron every 5 min) in packages/api/src/jobs/communication-status-updater.job.ts
- [x] T046 [P] Create default email HTML templates (lease-payment-reminder, payment-confirmed, ticket-created, appointment-reminder, lease-ending-soon) in packages/api/src/templates/email/
- [x] T047 Add integration test for communication flow (create rule, trigger event, check history) in packages/api/__tests__/integration/communication.integration.test.ts
- [x] T048 Add unit tests for CommunicationService and NotificationEngine in packages/api/__tests__/unit/communication.service.test.ts and notification-engine.service.test.ts
- [x] T049 [P] Add documentation (COMMUNICATION_MODULE.md, TEMPLATE_VARIABLES.md) in docs/communication/
- [x] T050 Run quickstart or validation checklist from specs/010-communication-module/checklists/ (validation-checklist.md créée)

---

## Dépendances et ordre d’exécution

### Dépendances entre phases

- **Phase 1 (Setup)** : Aucune – peut démarrer immédiatement.
- **Phase 2 (Fondations)** : Dépend de la Phase 1 – bloque toutes les user stories.
- **Phases 3 à 8 (User stories)** : Dépendent de la Phase 2. Les user stories peuvent ensuite être traitées dans l’ordre P1 → P2 → P3… ou en parallèle si plusieurs développeurs.
- **Phase 9 (Polish)** : Dépend des phases de user stories souhaitées.

### Dépendances entre user stories

- **US1 (P1)** : Dépend uniquement des fondations. Nécessite au moins un template et une règle (seed ou créés manuellement) pour le test de bout en bout.
- **US2 (P2)** : Dépend des fondations. Fournit l’UI pour créer templates et règles utilisées par US1.
- **US3 (P2)** : Dépend des fondations (historique déjà exposé par l’API en Phase 2).
- **US4 (P3)** : Dépend des fondations ; le moteur doit déjà prendre en compte les préférences (T020).
- **US5 (P3)** : Dépend des fondations et de l’historique (US3) pour une UX cohérente.
- **US6 (P4)** : Dépend des fondations et des données d’historique (US1/US3).

### Au sein de chaque user story

- Modèles / API avant UI.
- Services avant contrôleurs.
- Implémentation cœur avant intégration.

### Parallélisation possible

- Phase 1 : T002 et T003 [P] peuvent être faits en parallèle après T001.
- Phase 2 : T007, T011, T012 [P] peuvent être faits en parallèle ; T013 après T008, T011, T012.
- Phases 3–8 : Une fois la Phase 2 terminée, US2, US3, US4 peuvent avancer en parallèle (équipes distinctes) ; US1 doit précéder ou accompagner US2 pour avoir des règles testables.

---

## Exemple de parallélisation (User Story 2)

```text
# En parallèle après Phase 2 :
T022 "Ensure template CRUD API is complete..."
T023 "Ensure rule CRUD API is complete..."
# Puis séquentiel :
T024 TemplatesPage → T025 TemplateEditor/VariableSelector
T026 RulesPage → T027 RuleBuilder
T028 communication-service (client)
```

---

## Stratégie d’implémentation

### MVP d’abord (User Story 1 uniquement)

1. Compléter Phase 1 : Setup  
2. Compléter Phase 2 : Fondations  
3. Compléter Phase 3 : User Story 1 (dont T021 pour un template/règle par défaut)  
4. Valider : déclencher un événement et vérifier la réception du message  
5. Déployer ou démontrer si besoin  

### Livraison incrémentale

1. Setup + Fondations → base prête  
2. US1 → test indépendant → démo (MVP)  
3. US2 → templates et règles en UI → démo  
4. US3 → historique et statut → démo  
5. US4 → préférences → démo  
6. US5 → annonces manuelles → démo  
7. US6 → analytics → démo  
8. Polish → jobs, templates par défaut, tests, docs  

### Équipe parallèle

- Développeur A : US1 + intégrations (T016–T021)  
- Développeur B : US2 (T022–T028)  
- Développeur C : US3 (T029–T032)  
- Puis US4, US5, US6 et Polish répartis selon capacité  

---

## Rapport de génération

| Métrique | Valeur |
|----------|--------|
| **Fichier généré** | `D:\ImmoTopia-main\specs\010-communication-module\tasks.md` |
| **Nombre total de tâches** | 50 |
| **Phase 1 (Setup)** | 3 |
| **Phase 2 (Fondations)** | 12 |
| **Phase 3 (US1)** | 6 |
| **Phase 4 (US2)** | 7 |
| **Phase 5 (US3)** | 4 |
| **Phase 6 (US4)** | 3 |
| **Phase 7 (US5)** | 4 |
| **Phase 8 (US6)** | 3 |
| **Phase 9 (Polish)** | 8 |
| **Tâches parallélisables [P]** | 14 |
| **MVP suggéré** | Phase 1 + Phase 2 + Phase 3 (User Story 1) |
| **Critères de test indépendants** | Un par user story (décrits dans chaque phase) |

**Format** : Toutes les tâches respectent le format checklist `- [ ] Txxx [P?] [USn?] Description avec chemin de fichier`.
