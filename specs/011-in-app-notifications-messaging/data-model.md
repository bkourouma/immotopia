# Data Model: Notifications In-App et Messagerie

**Feature**: 011-in-app-notifications-messaging  
**Date**: 2025-02-09

## Overview

Ce document décrit les entités et relations ajoutées pour les notifications in-app et la messagerie interne. Les enums et modèles existants du module communication (CommunicationRecipientType, EventTrigger, CommunicationType, Tenant, User, TenantClient, CrmContact) sont réutilisés.

---

## Enums (nouveaux)

| Enum | Valeurs | Usage |
|------|--------|--------|
| **InAppNotificationStatus** | UNREAD, READ, ARCHIVED | Statut de lecture / archivage d’une notification |
| **InAppNotificationPriority** | LOW, NORMAL, HIGH, URGENT | Priorité d’affichage (dérivée de l’événement ou manuelle) |
| **ConversationType** | DIRECT, GROUP | Type de conversation |
| **ConversationStatus** | ACTIVE, ARCHIVED, DELETED | Statut de la conversation (liste par défaut = ACTIVE) |
| **MessageStatus** | SENT, DELIVERED, READ | Statut du message (optionnel, peut être dérivé des read receipts) |

---

## 1. In-App Notifications

### Entity: InAppNotification

Notification persistante destinée à un utilisateur dans l’application.

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | Identifiant unique |
| tenant_id | String | FK → Tenant, NOT NULL | Isolation tenant |
| recipient_type | CommunicationRecipientType | NOT NULL | OWNER, RENTER, AGENCY_USER, CONTACT |
| recipient_user_id | String? | FK → User | Si destinataire = utilisateur agence |
| recipient_tenant_client_id | String? | FK → TenantClient | Si destinataire = locataire |
| recipient_contact_id | String? | FK → CrmContact | Si destinataire = propriétaire/contact |
| title | String | NOT NULL | Titre court |
| message | String (Text) | NOT NULL | Corps du message |
| type | CommunicationType | NOT NULL | ANNOUNCEMENT, ALERT, NOTIFICATION |
| event_trigger | EventTrigger? | FK sémantique | Événement source (si automatique) |
| priority | InAppNotificationPriority | DEFAULT NORMAL | LOW, NORMAL, HIGH, URGENT |
| status | InAppNotificationStatus | DEFAULT UNREAD | UNREAD, READ, ARCHIVED |
| read_at | DateTime? | | Date de passage en lu |
| archived_at | DateTime? | | Date d’archivage |
| related_entity_type | String? | | "lease", "property", "ticket", "deal", etc. |
| related_entity_id | String? | | ID de l’entité |
| action_url | String? | | URL frontend vers la ressource |
| communication_id | String? | FK → Communication | Lien vers l’envoi email/WhatsApp si applicable |
| metadata | Json? | | Données additionnelles |
| expires_at | DateTime? | | Optionnel ; au-delà, exclu de la liste et purgeable |
| created_at | DateTime | DEFAULT now() | |
| updated_at | DateTime | @updatedAt | |
| created_by_id | String? | FK → User | Auteur si envoi manuel |

**Règles**:
- Exactement un des champs recipient_* est renseigné selon recipient_type.
- Index sur (tenant_id, recipient_user_id, status), (tenant_id, recipient_tenant_client_id, status), (tenant_id, recipient_contact_id, status), created_at, (status, expires_at) pour listes et purge.

**Relations**: Tenant, User (recipient_user), TenantClient (recipient_tenant_client), CrmContact (recipient_contact), Communication (optionnel), User (created_by).

---

## 2. Messagerie interne

### Entity: Conversation

Fil de discussion (direct ou groupe).

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | |
| tenant_id | String | FK → Tenant, NOT NULL | |
| type | ConversationType | DEFAULT DIRECT | DIRECT, GROUP |
| status | ConversationStatus | DEFAULT ACTIVE | ACTIVE, ARCHIVED, DELETED |
| title | String? | | Pour les groupes |
| description | String? | | Optionnel |
| last_message_at | DateTime? | | Dernier message (pour tri liste) |
| last_message_preview | String? | | Aperçu court (ex. 100 caractères) |
| created_by_id | String | FK → User, NOT NULL | Créateur |
| created_at | DateTime | DEFAULT now() | |
| updated_at | DateTime | @updatedAt | |

**Relations**: Tenant, User (created_by), ConversationParticipant[], Message[].

**Index**: (tenant_id, status), last_message_at.

---

### Entity: ConversationParticipant

Participant à une conversation (un par acteur par conversation).

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | |
| conversation_id | String | FK → Conversation, NOT NULL | |
| tenant_id | String | FK → Tenant, NOT NULL | |
| participant_type | CommunicationRecipientType | NOT NULL | |
| participant_user_id | String? | FK → User | Si AGENCY_USER |
| participant_tenant_client_id | String? | FK → TenantClient | Si RENTER |
| participant_contact_id | String? | FK → CrmContact | Si OWNER/CONTACT |
| joined_at | DateTime | DEFAULT now() | |
| last_read_at | DateTime? | | Dernière lecture |
| last_read_message_id | String? | FK → Message | Dernier message lu |
| muted_until | DateTime? | | Notifications en sourdine |
| is_active | Boolean | DEFAULT true | |
| left_at | DateTime? | | Si participant a quitté |

**Contraintes d’unicité**: (conversation_id, participant_user_id), (conversation_id, participant_tenant_client_id), (conversation_id, participant_contact_id) pour éviter les doublons (un seul des trois champs participant_* est renseigné selon participant_type).

**Relations**: Conversation, Tenant, User, TenantClient, CrmContact.

**Index**: (tenant_id, participant_user_id), (tenant_id, participant_tenant_client_id), (tenant_id, participant_contact_id).

---

### Entity: Message

Message dans une conversation.

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | |
| conversation_id | String | FK → Conversation, NOT NULL | |
| tenant_id | String | FK → Tenant, NOT NULL | |
| sender_type | CommunicationRecipientType | NOT NULL | |
| sender_user_id | String? | FK → User | |
| sender_tenant_client_id | String? | FK → TenantClient | |
| sender_contact_id | String? | FK → CrmContact | |
| content | String (Text) | NOT NULL | Corps du message |
| attachments | Json? | | [{ name, url, type, size }] |
| is_system_message | Boolean | DEFAULT false | Ex. « X a rejoint » |
| status | MessageStatus | DEFAULT SENT | SENT, DELIVERED, READ (optionnel) |
| created_at | DateTime | DEFAULT now() | |
| updated_at | DateTime | @updatedAt | |
| deleted_at | DateTime? | | Soft delete |

**Relations**: Conversation, Tenant, User (sender_user), TenantClient (sender_tenant_client), CrmContact (sender_contact), MessageReadReceipt[].

**Index**: (conversation_id, created_at), tenant_id.

---

### Entity: MessageReadReceipt

Accusé de lecture (qui a lu quel message).

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | |
| message_id | String | FK → Message, NOT NULL | |
| tenant_id | String | FK → Tenant, NOT NULL | |
| reader_type | CommunicationRecipientType | NOT NULL | |
| reader_user_id | String? | FK → User | |
| reader_tenant_client_id | String? | FK → TenantClient | |
| reader_contact_id | String? | FK → CrmContact | |
| read_at | DateTime | DEFAULT now() | |

**Contraintes d’unicité**: (message_id, reader_user_id), (message_id, reader_tenant_client_id), (message_id, reader_contact_id) — un lecteur ne crée qu’un receipt par message.

**Relations**: Message, Tenant, User, TenantClient, CrmContact.

**Index**: tenant_id.

---

## 3. Relations croisées avec l’existant

- **User**, **TenantClient**, **CrmContact** : déjà liés à Tenant ; utilisés comme destinataires (notifications) et participants/expéditeurs (messagerie).
- **Communication** (module 010) : optionnellement liée à InAppNotification via `communication_id` pour traçabilité email/WhatsApp ↔ in-app.
- **Tenant** : toutes les tables ont `tenant_id` ; suppression en cascade si tenant supprimé.

---

## 4. Validations métier (hors schéma)

- **Notifications** : à la création, exactement un recipient_* renseigné selon recipient_type ; title et message non vides.
- **Conversations** : DIRECT => exactement 2 participants ; GROUP => au moins 2 participants ; tous du même tenant.
- **Messages** : l’expéditeur doit être un participant actif de la conversation ; content non vide ; pièces jointes : types et tailles limités (configurables).
- **Read receipts** : le lecteur doit être un participant de la conversation ; pas de receipt pour ses propres messages.
