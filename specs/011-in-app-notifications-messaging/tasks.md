# Tasks: Notifications In-App et Messagerie Utilisateurs

**Input**: Design documents from `specs/011-in-app-notifications-messaging/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification; test tasks are omitted. Add unit/integration tests per project standards (e.g. 80% coverage) during or after implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `packages/api/` (Prisma, src/services, src/controllers, src/routes, src/jobs)
- **Frontend**: `apps/web/src/` (components, pages, services)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify project context and feature scope

- [x] T001 Verify project structure per plan (packages/api, apps/web exist) and feature branch 011-in-app-notifications-messaging

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema and migrations that MUST be complete before any user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add enums InAppNotificationStatus, InAppNotificationPriority, ConversationType, ConversationStatus, MessageStatus to packages/api/prisma/schema.prisma
- [x] T003 [P] Add model InAppNotification with all fields and relations (Tenant, User, TenantClient, CrmContact, Communication, created_by) in packages/api/prisma/schema.prisma
- [x] T004 [P] Add models Conversation, ConversationParticipant, Message, MessageReadReceipt with relations and unique constraints in packages/api/prisma/schema.prisma
- [x] T005 Add relations from User, Tenant, TenantClient, CrmContact to new models (e.g. User notificationsCreated, ConversationParticipant, Message sender, MessageReadReceipt) in packages/api/prisma/schema.prisma
- [x] T006 Run Prisma migration for in-app notifications and messaging (e.g. `npx prisma migrate dev --name add_in_app_notifications_and_messaging`) in packages/api

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 – Consulter et gérer ses notifications in-app (Priority: P1) 🎯 MVP

**Goal**: Store in-app notifications for each user, show a badge in the header, list notifications with link to related entity, and allow mark-as-read and delete.

**Independent Test**: Trigger a business event (e.g. payment reminder), confirm an in-app notification is created for the recipient, badge shows unread count, user can open the list and see the notification with title, message, and link to the entity.

### Implementation for User Story 1

- [x] T007 [P] [US1] Implement InAppNotificationService (create, createBulk, getNotifications, getStats, markAsRead, markMultipleAsRead, markAllAsRead, archive, archiveMultiple, deleteNotification, cleanupExpiredNotifications, getRecipientField) in packages/api/src/services/in-app-notification.service.ts
- [x] T008 [US1] Implement in-app-notification-controller (listNotificationsHandler, getStatsHandler, markAsReadHandler, markMultipleAsReadHandler, markAllAsReadHandler, archiveHandler, archiveMultipleHandler, deleteHandler) and resolveRecipient helper in packages/api/src/controllers/in-app-notification-controller.ts
- [x] T009 [US1] Create in-app-notification-routes and mount under /api/tenants/:tenantId/notifications in packages/api/src/routes/in-app-notification-routes.ts and packages/api/src/index.ts
- [x] T010 [US1] Integrate InAppNotificationService into notification-engine: create in-app notification(s) for each recipient when triggerEvent creates Communications in packages/api/src/services/notification-engine.service.ts
- [x] T011 [P] [US1] Create notification API client (getNotifications, getStats, markAsRead, markMultipleAsRead, markAllAsRead, archive, archiveMultiple, delete) in apps/web/src/services/notification.service.ts
- [x] T012 [US1] Create NotificationList and NotificationCard components (list with title, message, date, actionUrl, status) in apps/web/src/components/notifications/
- [x] T013 [US1] Add notification badge and dropdown (bell icon, unread count, NotificationList preview, link to full page) in header/layout in apps/web/src
- [x] T014 [US1] Create NotificationsPage (full list with pagination) and route (e.g. /tenant/:tenantId/notifications) in apps/web/src/pages/notifications/

**Checkpoint**: User Story 1 is independently testable (badge, list, open notification, mark read)

---

## Phase 4: User Story 2 – Statuts et priorité des notifications (Priority: P1)

**Goal**: Filters by status (all / unread / read / archived), visual priority (border/icon), and bulk actions (mark as read, archive).

**Independent Test**: Create or receive notifications of different priorities, filter by status, mark some as read or archived, verify badge and list update; verify high/urgent notifications are visually distinct.

### Implementation for User Story 2

- [x] T015 [US2] Ensure list notifications API accepts status and priority query params and returns status/priority; add filter UI (tabs or dropdown) in apps/web/src/components/notifications/NotificationList.tsx and apps/web/src/pages/notifications/NotificationsPage.tsx
- [x] T016 [US2] Display notification priority (e.g. border or icon for HIGH/URGENT) in apps/web/src/components/notifications/NotificationCard.tsx
- [x] T017 [US2] Add bulk actions (select all/selection, Marquer comme lu, Archiver) to NotificationsPage in apps/web/src/pages/notifications/NotificationsPage.tsx

**Checkpoint**: User Story 2 complete — filters and bulk actions work; priority is visible

---

## Phase 5: User Story 3 – Démarrer une conversation directe (Priority: P2)

**Goal**: User can start a direct (1-to-1) conversation with another actor, send and receive messages, see conversation list with last message preview.

**Independent Test**: As agency user, open messaging, select a renter/owner/contact, start or reopen conversation, send a message; as recipient, open conversation and see message history and reply.

### Implementation for User Story 3

- [x] T018 [P] [US3] Implement MessagingService (getOrCreateDirectConversation, createConversation, getUserConversations, sendMessage, getMessages, markAsRead, getParticipantField, getSenderField helpers) in packages/api/src/services/messaging.service.ts
- [x] T019 [US3] Implement messaging-controller (listConversations, createConversation, getConversation, getMessages, sendMessage, markAsRead) and resolveParticipant helper in packages/api/src/controllers/messaging-controller.ts
- [x] T020 [US3] Create messaging-routes and mount under /api/tenants/:tenantId/messages in packages/api/src/routes/messaging-routes.ts and packages/api/src/index.ts
- [x] T021 [P] [US3] Create messaging API client (getConversations, createConversation, getConversation, getMessages, sendMessage, markAsRead) in apps/web/src/services/messaging.service.ts
- [x] T022 [US3] Create ConversationsPage (list with last message preview) and ConversationDetailPage or view (message thread, send box) in apps/web/src/pages/messaging/
- [x] T023 [US3] Create ConversationList and message thread components in apps/web/src/components/messaging/
- [x] T024 [US3] Create NewMessageModal (select recipient for direct conversation, create or open conversation) and app routes for /tenant/:tenantId/messages and /tenant/:tenantId/messages/:conversationId in apps/web

**Checkpoint**: User Story 3 complete — direct conversations and messaging work end-to-end

---

## Phase 6: User Story 4 – Conversations de groupe (Priority: P3)

**Goal**: Create group conversations with multiple participants, optional title; all participants see messages and sender name.

**Independent Test**: Create a group conversation with title and multiple participants, send messages, verify all participants see the thread and sender for each message.

### Implementation for User Story 4

- [x] T025 [US4] Support group conversation in backend (createConversation with type GROUP, title, multiple participantIds) and in messaging-controller in packages/api/src/controllers/messaging-controller.ts
- [x] T026 [US4] Add group creation in frontend: NewMessageModal or flow with type GROUP, title field, multi-select participants in apps/web/src/components/messaging/
- [x] T027 [US4] Show participants list and sender name per message in group conversation view in apps/web/src/components/messaging/

**Checkpoint**: User Story 4 complete — group conversations work

---

## Phase 7: User Story 5 – Accusés de lecture et archivage des conversations (Priority: P3)

**Goal**: Mark messages as read when user opens conversation; show read state to sender; archive conversation and filter by archived.

**Independent Test**: Send a message, open conversation as recipient, verify sender sees read indicator; archive a conversation and verify it moves to archived filter and remains accessible.

### Implementation for User Story 5

- [x] T028 [US5] Implement markAsRead fully: update participant last_read_at and last_read_message_id, create MessageReadReceipt records for messages up to lastMessageId in packages/api/src/services/messaging.service.ts
- [x] T029 [US5] Show unread count per conversation in list and call markAsRead when user opens conversation in apps/web/src/pages/messaging/ and apps/web/src/components/messaging/
- [x] T030 [US5] Show read receipts (e.g. "Lu" or checkmark) on messages and add archive conversation action plus "Archivées" filter in apps/web/src/components/messaging/ and ConversationsPage

**Checkpoint**: User Story 5 complete — read receipts and archive work

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Shared jobs, validation, and constitution compliance

- [x] T031 [P] Add notification-cleanup job (cron daily, delete expired in_app_notifications) in packages/api/src/jobs/notification-cleanup.job.ts and register in packages/api/src/index.ts
- [x] T032 Run quickstart.md validation (migrations, API calls, frontend flows) and fix any gaps
- [x] T033 [P] Ensure all UI copy and labels for notifications and messaging are in French (Constitution I) in apps/web

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — MVP
- **Phase 4 (US2)**: Depends on Phase 3 (same backend, extends frontend)
- **Phase 5 (US3)**: Depends on Phase 2 — can run in parallel with Phase 3/4 if desired
- **Phase 6 (US4)**: Depends on Phase 5
- **Phase 7 (US5)**: Depends on Phase 5 (and Phase 6 if group read receipts desired)
- **Phase 8 (Polish)**: Depends on Phase 3 and optionally 5 (cleanup job; quickstart covers both)

### User Story Dependencies

- **US1 (P1)**: After Foundational only — no other story dependency
- **US2 (P1)**: Builds on US1 (same API and components)
- **US3 (P2)**: After Foundational only — independent of US1/US2
- **US4 (P3)**: Builds on US3 (same MessagingService and UI)
- **US5 (P3)**: Builds on US3 (markAsRead and archive)

### Within Each User Story

- Backend service before controller; controller before routes
- Mount routes in index after routes file exists
- Frontend service before components; components before pages; add routes last

### Parallel Opportunities

- T002, T003, T004, T005 can run in parallel (same schema file but different sections; coordinate to avoid merge conflicts or do T002–T005 as one task)
- T007 and T011 can run in parallel (backend service vs frontend service)
- T018 and T021 can run in parallel (backend vs frontend messaging client)
- T031 and T033 can run in parallel (job vs UI copy)
- After Phase 2, one developer can do Phase 3–4 (notifications) while another does Phase 5–7 (messaging)

---

## Parallel Example: User Story 1

```text
# Backend service and frontend API client in parallel:
T007 Implement InAppNotificationService in packages/api/src/services/in-app-notification.service.ts
T011 Create notification.service.ts in apps/web/src/services/notification.service.ts

# Then controller and routes (T008, T009), then engine integration (T010), then UI (T012–T014)
```

---

## Parallel Example: User Story 3

```text
# Backend and frontend clients in parallel:
T018 Implement MessagingService in packages/api/src/services/messaging.service.ts
T021 Create messaging.service.ts in apps/web/src/services/messaging.service.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup  
2. Complete Phase 2: Foundational (schema + migration)  
3. Complete Phase 3: User Story 1 (notifications: store, badge, list, mark read)  
4. **STOP and VALIDATE**: Trigger an event, check badge and list, mark as read  
5. Deploy/demo notifications in-app

### Incremental Delivery

1. Setup + Foundational → schema ready  
2. Add US1 → Notifications in-app (MVP)  
3. Add US2 → Filters and bulk actions  
4. Add US3 → Direct messaging  
5. Add US4 → Group conversations  
6. Add US5 → Read receipts and archive  
7. Polish → Cleanup job, quickstart, French UI

### Parallel Team Strategy

- Developer A: Phase 3 + 4 (notifications)  
- Developer B: Phase 5 + 6 + 7 (messaging)  
- Both after Phase 2; then Phase 8 together

---

## Notes

- [P] tasks use different files and have no dependency on other incomplete tasks in the same phase
- [Story] label links each task to spec.md user stories for traceability
- Each user story phase is independently testable via its Independent Test criteria
- Commit after each task or logical group; use format `in-app-notifications: <action> – <description>` or `messaging: <action> – <description>`
- All UI text must be in French (Constitution I); verified in T033
- Optional: Add unit tests for InAppNotificationService and MessagingService in packages/api/__tests__/ per project 80% coverage goal
