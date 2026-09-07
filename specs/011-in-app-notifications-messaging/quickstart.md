# Quickstart: Notifications In-App et Messagerie

**Feature**: 011-in-app-notifications-messaging  
**Date**: 2025-02-09

Ce guide permet de vérifier que l’environnement et les livrables du feature sont en place et fonctionnent (après implémentation).

## Prérequis

- Node.js et npm/pnpm installés
- PostgreSQL accessible (variable `DATABASE_URL`)
- Backend API démarré (`packages/api`) avec routes montées sous `/api`
- Frontend démarré (`apps/web`) avec accès à l’API (ex. `REACT_APP_API_URL` ou proxy)
- Utilisateur authentifié avec un JWT valide et accès à au moins un tenant

## 1. Migrations Prisma

Depuis la racine du repo :

```bash
cd packages/api
npx prisma migrate dev --name add_in_app_notifications_and_messaging
```

Vérifier que les tables suivantes existent :

- `in_app_notifications`
- `conversations`
- `conversation_participants`
- `messages`
- `message_read_receipts`

Et les enums :

- `InAppNotificationStatus`, `InAppNotificationPriority`
- `ConversationType`, `ConversationStatus`, `MessageStatus`

## 2. Backend — Notifications in-app

- **Stats (badge)**  
  `GET /api/tenants/:tenantId/notifications/stats`  
  Headers : `Authorization: Bearer <token>`  
  Attendu : `200` avec `{ unreadCount, readCount, archivedCount, totalCount, ... }`.

- **Liste**  
  `GET /api/tenants/:tenantId/notifications?status=UNREAD&page=1&limit=20`  
  Attendu : `200` avec `{ notifications: [...], pagination: { total, page, limit, totalPages } }`.

- **Marquer comme lu**  
  `PATCH /api/tenants/:tenantId/notifications/:notificationId/read`  
  Attendu : `200` avec la notification mise à jour (status READ).

- **Marquer toutes comme lues**  
  `POST /api/tenants/:tenantId/notifications/mark-all-read`  
  Attendu : `200` avec `{ success: true }` ; rappel de `GET .../stats` → unreadCount à 0 (si aucune nouvelle).

## 3. Backend — Messagerie

- **Liste des conversations**  
  `GET /api/tenants/:tenantId/messages/conversations`  
  Attendu : `200` avec un tableau (éventuellement vide) de conversations.

- **Créer une conversation directe**  
  `POST /api/tenants/:tenantId/messages/conversations`  
  Body : `{ "type": "DIRECT", "participantIds": [ { "participantType": "RENTER", "participantId": "<tenant_client_id>" } ] }`  
  (Pour DIRECT, le backend déduit l’autre participant = utilisateur courant.)  
  Attendu : `200` ou `201` avec l’objet conversation (et les 2 participants).

- **Envoyer un message**  
  `POST /api/tenants/:tenantId/messages/conversations/:conversationId/messages`  
  Body : `{ "content": "Test message" }`  
  Attendu : `201` avec le message créé.

- **Liste des messages**  
  `GET /api/tenants/:tenantId/messages/conversations/:conversationId/messages?page=1&limit=50`  
  Attendu : `200` avec `{ messages: [...], pagination }` ; le message envoyé apparaît.

- **Marquer comme lu**  
  `POST /api/tenants/:tenantId/messages/conversations/:conversationId/read`  
  Body : `{ "lastMessageId": "<id_du_dernier_message>" }`  
  Attendu : `200` avec `{ success: true }`.

## 4. Frontend — Vérifications rapides

- **Badge notifications** : En-tête de l’app affiche un indicateur (ex. cloche) avec le nombre de non lus ; après « tout marquer comme lu », le badge se met à jour (sous 30 s si polling).
- **Page notifications** : Accès à la page liste des notifications (ex. `/tenant/:tenantId/notifications`) ; filtres Toutes / Non lues / Lues ; actions « Marquer comme lu », « Archiver » sur une ou plusieurs notifications.
- **Messagerie** : Accès à la liste des conversations (ex. `/tenant/:tenantId/messages`) ; ouverture d’une conversation ou création d’une directe ; envoi d’un message et vérification qu’il apparaît dans le fil ; indicateur « lu » après appel à l’endpoint read.

## 5. Intégration avec le module communication (010)

Pour valider la création automatique de notifications in-app :

- Déclencher un événement métier qui envoie déjà un email/WhatsApp (ex. rappel d’échéance, ticket créé).
- Vérifier qu’une entrée apparaît dans `in_app_notifications` pour le même destinataire (et éventuellement `communication_id` renseigné).
- Vérifier en frontend que la notification apparaît dans la liste et que le badge s’incrémente.

## 6. Job de nettoyage

Le job de purge des notifications expirées est enregistré au démarrage de l’API (hors mode test) et s’exécute **tous les jours à 3h00 UTC** (`packages/api/src/jobs/notification-cleanup.job.ts`).

Pour valider :

- Créer une notification avec `expires_at` dans le passé (via seed ou outil).
- Exécuter manuellement `runNotificationCleanup()` ou attendre l’heure planifiée.
- Vérifier que cette notification a été supprimée et que les autres restent.

---

**Références** : [spec.md](../spec.md) | [data-model.md](../data-model.md) | [contracts/openapi.yaml](../contracts/openapi.yaml) | [plan.md](../plan.md)
