# Implementation Plan: Notifications In-App et Messagerie Utilisateurs

**Branch**: `011-in-app-notifications-messaging` | **Date**: 2025-02-09 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/011-in-app-notifications-messaging/spec.md`

## Summary

Extension du module de communication ImmoTopia en deux blocs : (1) **notifications in-app persistantes** — stockage de toutes les notifications dans l’application avec statuts (non lu / lu / archivé), badge dans l’en-tête, filtres et actions en masse ; (2) **messagerie interne** — conversations directes et de groupe entre acteurs du tenant (agence, propriétaires, locataires, contacts CRM), avec messages, pièces jointes optionnelles, accusés de lecture et archivage. L’approche technique s’appuie sur la stack existante (Node/TypeScript, Express, React, PostgreSQL, Prisma), réutilise les enums et le modèle de destinataires du module 010, et privilégie le polling pour la première version (temps réel optionnel ultérieurement).

## Technical Context

**Language/Version**: TypeScript (Node.js backend), TypeScript (React frontend)  
**Primary Dependencies**: Express (API), React, Prisma ORM  
**Storage**: PostgreSQL via Prisma ; tables `in_app_notifications`, `conversations`, `conversation_participants`, `messages`, `message_read_receipts`  
**Testing**: Jest + Supertest (backend), React Testing Library + Jest (frontend)  
**Target Platform**: Web (navigateur) ; API hébergée sur serveur Node  
**Project Type**: Web application (monorepo : `packages/api` + `apps/web`)  
**Performance Goals**: Liste notifications < 500 ms p95 ; liste conversations et messages < 1 s ; badge mis à jour sous 30 s (polling)  
**Constraints**: Isolation stricte par tenant ; RBAC sur toutes les routes ; pas de temps réel obligatoire en v1  
**Scale/Scope**: Même périmètre que le module communication (010) — multi-tenant, tous rôles (agence, locataire, propriétaire, contact)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Statut | Notes |
|----------|--------|--------|
| **I. Français obligatoire (UI)** | OK | Tous les libellés, messages, notifications et textes UI en français (badge, liste notifications, messagerie, boutons, erreurs). |
| **II. Aucune donnée fictive** | OK | Seeds éventuels utiliseront données réelles ou anonymisées ; pas de données inventées. |
| **III. Stack technique imposée** | OK | Backend Node/TS + Express ; frontend React/TS ; PostgreSQL + Prisma. Aucune déviation. |
| **IV. Débogage systématique** | OK | Frontend débogué avec Chrome DevTools ; tests E2E avec Puppeteer si nécessaire. |
| **V. Workflow & qualité** | OK | Commits au format `<service>: <action> – <description>` ; couverture tests ≥ 80 % ; branches `feature/<role>-<feature>`. |

Aucune violation. Phase 0 et Phase 1 autorisées.

## Project Structure

### Documentation (this feature)

```text
specs/011-in-app-notifications-messaging/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1 (OpenAPI notifications + messaging)
│   └── openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks – not created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/api/
├── prisma/
│   └── schema.prisma    # + InAppNotification, Conversation, ConversationParticipant, Message, MessageReadReceipt
├── src/
│   ├── controllers/
│   │   ├── in-app-notification-controller.ts
│   │   └── messaging-controller.ts
│   ├── routes/
│   │   ├── in-app-notification-routes.ts
│   │   └── messaging-routes.ts
│   ├── services/
│   │   ├── in-app-notification.service.ts
│   │   ├── messaging.service.ts
│   │   └── notification-engine.service.ts   # modification : créer in-app notification à chaque trigger
│   ├── jobs/
│   │   └── notification-cleanup.job.ts
│   ├── middleware/      # existing (auth, tenant, isolation)
│   └── types/
│       └── communication-types.ts  # optional extensions for messaging DTOs
└── __tests__/
    ├── in-app-notification.service.spec.ts
    └── messaging.service.spec.ts

apps/web/
├── src/
│   ├── components/
│   │   ├── notifications/     # NotificationList, NotificationCard, badge in header
│   │   └── messaging/         # ConversationList, ConversationDetail, NewMessageModal
│   ├── pages/
│   │   ├── notifications/
│   │   │   └── NotificationsPage.tsx
│   │   └── messaging/
│   │       ├── ConversationsPage.tsx
│   │       └── ConversationDetailPage.tsx
│   ├── services/
│   │   ├── notification.service.ts   # API client in-app notifications
│   │   └── messaging.service.ts      # API client conversations/messages
│   └── ... (layout/header: intégration badge + dropdown notifications)
└── ...
```

**Structure Decision**: Monorepo existant ; backend dans `packages/api`, frontend dans `apps/web`. Les nouveaux services, contrôleurs et routes suivent les conventions du module communication (010). Pas de nouveau package.

## Complexity Tracking

Aucune violation de la Constitution. Ce tableau reste vide.
