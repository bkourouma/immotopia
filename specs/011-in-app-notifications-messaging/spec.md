# Feature Specification: Notifications In-App et Messagerie Utilisateurs

**Feature Branch**: `011-in-app-notifications-messaging`  
**Created**: 2025-02-09  
**Status**: Draft  
**Input**: Extension du module de communication ImmoTopia — notifications in-app persistantes et messagerie interne entre acteurs (agence, propriétaires, locataires, contacts CRM).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consulter et gérer ses notifications in-app (Priority: P1)

En tant qu’**utilisateur** (agence, propriétaire, locataire ou contact), je veux que **toutes les notifications** liées aux événements métier (paiement reçu, rappel de loyer, ticket de maintenance, etc.) soient **stockées dans l’application** et consultables à tout moment, avec un **badge** dans l’en-tête indiquant le nombre de notifications non lues, afin de ne rien manquer et de pouvoir revenir sur une information plus tard.

**Why this priority**: C’est le cœur de la valeur « in-app » : les notifications ne sont plus uniquement envoyées à l’extérieur (email/WhatsApp) mais deviennent consultables dans l’app, avec un indicateur visible.

**Independent Test**: Déclencher un événement (ex. rappel de loyer), vérifier qu’une notification apparaît dans l’application pour le destinataire, que le badge reflète le nombre de non lus, et que l’utilisateur peut ouvrir la liste et consulter le détail.

**Acceptance Scenarios**:

1. **Given** un utilisateur connecté (agence, locataire, propriétaire ou contact), **When** un événement métier déclenche une notification (ex. paiement reçu, ticket créé), **Then** une notification in-app est créée pour le destinataire avec titre, message et lien vers l’entité concernée si applicable.
2. **Given** des notifications non lues, **When** l’utilisateur ouvre l’en-tête de l’application, **Then** un badge affiche le nombre de notifications non lues (ou une indication du type « 99+ » au-delà d’un seuil).
3. **Given** l’utilisateur ouvre la liste des notifications, **Then** il voit ses notifications (non lues, lues, archivées selon le filtre) avec titre, extrait du message, date et possibilité d’accéder à la ressource liée (bail, ticket, deal, etc.).
4. **Given** une notification non lue, **When** l’utilisateur clique dessus (ou ouvre la ressource liée), **Then** la notification peut être marquée comme lue et le badge est mis à jour.
5. **Given** des notifications affichées, **When** l’utilisateur le souhaite, **Then** il peut marquer une ou plusieurs notifications comme lues, marquer toutes comme lues, archiver ou supprimer, selon les actions proposées.

---

### User Story 2 - Statuts et priorité des notifications (Priority: P1)

En tant qu’**utilisateur**, je veux que chaque notification ait un **statut** (non lu, lu, archivé) et éventuellement une **priorité** (basse, normale, haute, urgente) affichée visuellement, afin de trier mon attention et de garder une boîte de réception claire.

**Why this priority**: Sans statuts et priorité, la liste des notifications serait peu exploitable ; le marquage « lu » et l’archivage sont indispensables pour une utilisation quotidienne.

**Independent Test**: Créer ou recevoir des notifications de priorités différentes, marquer certaines comme lues ou archivées, vérifier que les filtres (toutes / non lues / lues) et l’affichage de la priorité fonctionnent correctement.

**Acceptance Scenarios**:

1. **Given** des notifications avec des statuts différents, **When** l’utilisateur filtre par « non lues » ou « lues » ou « toutes », **Then** la liste affichée correspond au filtre et le badge reflète uniquement les non lues.
2. **Given** une notification, **When** l’utilisateur la marque comme lue (individuellement ou via « tout marquer comme lu »), **Then** son statut passe à « lu » et la date de lecture est enregistrée ; le badge diminue en conséquence.
3. **Given** une notification, **When** l’utilisateur l’archive, **Then** elle quitte la vue par défaut (ou est visible dans un onglet « archivées ») et peut être consultée ultérieurement.
4. **Given** des notifications à priorité haute ou urgente (ex. paiement en retard, nouveau ticket), **Then** l’affichage permet de les distinguer visuellement (ex. bordure, icône) pour attirer l’attention sans imposer de technologie précise.

---

### User Story 3 - Démarrer une conversation directe avec un autre acteur (Priority: P2)

En tant qu’**utilisateur** (agence, propriétaire, locataire ou contact CRM), je veux **initier une conversation directe** (1 à 1) avec un autre acteur du même tenant (ex. un collaborateur agence avec un locataire, un propriétaire avec l’agence), afin d’échanger des messages dans l’application sans passer par l’email ou WhatsApp.

**Why this priority**: C’est la première étape de la messagerie interne ; les conversations de groupe s’appuient sur le même modèle avec des participants multiples.

**Independent Test**: En tant qu’utilisateur agence, ouvrir la messagerie, choisir un locataire (ou propriétaire/contact), démarrer une conversation, envoyer un message et vérifier que le destinataire le reçoit et peut répondre dans l’app.

**Acceptance Scenarios**:

1. **Given** un utilisateur connecté dans un tenant, **When** il ouvre la messagerie et sélectionne un destinataire (autre utilisateur agence, locataire, propriétaire ou contact CRM du tenant), **Then** une conversation directe est créée ou réouverte si elle existe déjà.
2. **Given** une conversation directe ouverte, **When** l’utilisateur envoie un message (texte, optionnellement pièces jointes selon les règles métier), **Then** le message est enregistré, visible pour l’expéditeur et le destinataire, et la conversation affiche un aperçu du dernier message et la date.
3. **Given** un destinataire qui ouvre la conversation, **When** il consulte les messages, **Then** il peut voir l’historique et répondre ; les messages peuvent être marqués comme lus (accusé de lecture) pour informer l’expéditeur.
4. **Given** une conversation existante, **When** l’un des participants ouvre la liste des conversations, **Then** il voit cette conversation avec l’autre participant, l’aperçu du dernier message et un indicateur de messages non lus s’il y en a.

---

### User Story 4 - Conversations de groupe (Priority: P3)

En tant qu’**utilisateur** (typiquement agence), je veux créer une **conversation de groupe** avec plusieurs participants (ex. équipe agence + propriétaire + locataire pour un dossier), afin de centraliser les échanges autour d’un sujet ou d’un bien.

**Why this priority**: Utile pour les dossiers multi-acteurs ; la messagerie reste utilisable avec les conversations directes seules.

**Independent Test**: Créer une conversation de groupe avec un titre, ajouter plusieurs participants, envoyer des messages et vérifier que tous les participants voient la conversation et les messages.

**Acceptance Scenarios**:

1. **Given** un utilisateur autorisé (ex. agence), **When** il crée une nouvelle conversation et choisit « groupe », **Then** il peut donner un titre (optionnel) et sélectionner plusieurs destinataires (utilisateurs agence, locataires, propriétaires, contacts) du même tenant.
2. **Given** une conversation de groupe active, **When** un participant envoie un message, **Then** tous les autres participants voient le message dans la conversation et peuvent répondre.
3. **Given** une conversation de groupe, **When** un participant consulte la conversation, **Then** il voit la liste des participants et l’historique des messages avec indication de l’expéditeur pour chaque message.

---

### User Story 5 - Accusés de lecture et archivage des conversations (Priority: P3)

En tant qu’**utilisateur**, je veux savoir si mes messages ont été **lus** par le(s) destinataire(s) et pouvoir **archiver** une conversation dont je n’ai plus besoin dans ma liste active, sans supprimer l’historique.

**Why this priority**: Améliore l’expérience et la clarté de la messagerie ; le cœur (envoyer/recevoir) fonctionne sans.

**Independent Test**: Envoyer un message, ouvrir la conversation côté destinataire, vérifier que l’expéditeur voit un indicateur « lu » ; archiver la conversation et vérifier qu’elle n’apparaît plus dans la liste par défaut mais reste accessible.

**Acceptance Scenarios**:

1. **Given** un message envoyé dans une conversation, **When** le destinataire ouvre la conversation et consulte les messages jusqu’à ce message, **Then** le système enregistre la lecture et l’expéditeur peut voir (selon l’interface) que le message a été lu.
2. **Given** une conversation dans la liste, **When** l’utilisateur choisit d’archiver la conversation, **Then** elle quitte la liste des conversations actives (ou est marquée archivée) et l’utilisateur peut la retrouver via un filtre ou une section « archivées ».
3. **Given** une conversation archivée, **When** l’utilisateur la rouvre et envoie ou reçoit un message, **Then** la conversation peut redevenir « active » dans la liste (comportement à définir : réactivation automatique ou manuelle).

---

### Edge Cases

- Que se passe-t-il si une notification est liée à une entité (bail, ticket) qui est supprimée ? L’utilisateur doit toujours pouvoir voir la notification (titre, message) ; le lien vers l’entité peut mener à une page « non trouvée » ou équivalent, sans bloquer l’accès à la liste des notifications.
- Les notifications peuvent avoir une date d’expiration optionnelle : au-delà de cette date, elles ne sont plus affichées dans la liste par défaut et peuvent être purgées périodiquement pour éviter l’accumulation.
- En messagerie : que se passe-t-il si un participant (ex. locataire) est désactivé ou supprimé ? La conversation reste visible pour les autres participants avec l’historique ; les politiques de rétention et de suppression des données personnelles s’appliquent selon les règles métier et juridiques.
- Un utilisateur ne doit voir que les conversations dont il est participant ; les notifications ne doivent être visibles que par le destinataire concerné. L’isolation par tenant doit être stricte : aucun utilisateur d’un tenant ne voit les notifications ou conversations d’un autre tenant.
- Pièces jointes dans les messages : types et tailles autorisés doivent être bornés pour éviter abus et risques de sécurité ; affichage et téléchargement sécurisés pour les participants uniquement.

## Requirements *(mandatory)*

### Functional Requirements

**Notifications in-app**

- **FR-001**: The system MUST store every notification intended for a user (triggered by business events or sent manually to in-app) as a persistent in-app notification, so that the user can consult it later inside the application.
- **FR-002**: The system MUST assign each in-app notification a status: unread, read, or archived, and record the date of read and archive when applicable.
- **FR-003**: The system MUST display in the application header (or equivalent global area) a badge or indicator showing the count of unread in-app notifications for the current user; the count MUST update when notifications are marked as read or when new ones arrive.
- **FR-004**: The system MUST allow the user to list their in-app notifications with filters (e.g. all, unread, read, archived) and optional filters by type or date, with pagination when the list is large.
- **FR-005**: The system MUST allow the user to mark one, several, or all of their notifications as read; to archive one or several; and to delete one or several, within the scope of their own notifications only.
- **FR-006**: Each in-app notification MUST include at least a title, a message body, and optionally a link or reference to the related entity (lease, ticket, deal, property, etc.) so the user can navigate to the detail when relevant.
- **FR-007**: The system MUST support a priority or severity level for notifications (e.g. low, normal, high, urgent) so that the interface can emphasize urgent items; priority MAY be derived from the triggering event.
- **FR-008**: The system MAY support an optional expiration date for notifications; expired notifications MUST be excluded from the default list and MAY be purged periodically.
- **FR-009**: All in-app notification data MUST be isolated by tenant; a user MUST see only notifications intended for them within their tenant.

**Messagerie interne**

- **FR-010**: The system MUST allow a user to start a direct (1-to-1) conversation with another actor of the same tenant (agency user, renter, owner, or CRM contact), and to send and receive text messages within that conversation.
- **FR-011**: The system MUST allow a user (when permitted by role) to create a group conversation with multiple participants of the same tenant and to send and receive messages visible to all participants.
- **FR-012**: The system MUST persist all messages in a conversation and display them in chronological order; participants MUST see only conversations in which they are participants.
- **FR-013**: The system MUST support optional file attachments on messages, subject to configurable constraints on type and size, and MUST restrict access to attachments to participants of the conversation only.
- **FR-014**: The system MUST allow participants to mark messages as read (read receipts); the sender MAY be informed that a message was read, and the conversation list MAY show an unread count or indicator per conversation.
- **FR-015**: The system MUST allow a user to archive a conversation so that it no longer appears in the default active list while preserving the message history for later consultation.
- **FR-016**: All conversation and message data MUST be isolated by tenant; no user may see or join conversations of another tenant.

### Key Entities

- **In-app notification**: A single notification stored in the application for a given recipient. It has a title, message body, status (unread/read/archived), optional priority, optional link to a business entity (lease, ticket, deal, property, etc.), optional expiration date, and is tied to one recipient (agency user, renter, owner, or contact) within one tenant. It may be created when an external communication is triggered (email/WhatsApp) or independently.
- **Conversation**: A thread of messages between one or more participants. It can be direct (two participants) or group (multiple participants). It has a status (e.g. active, archived), optional title for groups, last message date and preview for list display, and is scoped to one tenant.
- **Participant**: A member of a conversation; represents one actor (agency user, renter, owner, or contact) and stores participation metadata such as last read date and optional mute.
- **Message**: A single entry in a conversation: sender, content (text), optional attachments, timestamp, and optional read receipt information so that readers can be tracked per message.

## Assumptions

- The existing communication module (010) already triggers external communications (email, WhatsApp) on business events; this feature adds an in-app copy and/or in-app-only notifications using the same event triggers and recipient model.
- Recipients are identified by the same types as in the communication module: agency user, renter (tenant client), owner, and CRM contact; the same tenant isolation and RBAC apply.
- Real-time updates (e.g. live refresh of the notification badge or new messages without reload) are desirable but not mandatory for the first release; polling or manual refresh is acceptable.
- Read receipts and « typing » indicators are optional enhancements; at least « mark as read » when the user opens the conversation is in scope.
- Data retention and purge of expired notifications follow tenant or platform policy; the spec does not fix a specific retention period.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a business event triggers a notification, the intended recipient sees a corresponding in-app notification (and optional external channel) and can open it to view title, message, and link to the related entity within one minute of the event, under normal load.
- **SC-002**: The notification badge in the header reflects the current unread count for the user; after the user marks one or all notifications as read, the badge updates accordingly (e.g. within a few seconds with polling or immediately with real-time update).
- **SC-003**: Users can filter notifications by status (unread/read/archived) and perform bulk actions (mark as read, archive) on selected items; the list and badge state remain consistent after each action.
- **SC-004**: A user can start a direct conversation with another actor of the same tenant, send at least one message, and the recipient can see the message and reply in the same conversation; end-to-end flow completable in under one minute.
- **SC-005**: Group conversations support at least three participants; each participant sees the same thread and can send and receive messages; access is restricted to participants only and to the tenant.
- **SC-006**: When a recipient opens a conversation and views messages, the system records read state so that the sender can see (or infer) that messages were read; at least the « last read » position or per-message read receipt is stored.
- **SC-007**: No user can access in-app notifications or conversations of another tenant; all listing and read/write operations are scoped by tenant and by recipient/participant identity.
- **SC-008**: Optional: Expired notifications are hidden from the default list and can be purged by a scheduled process without affecting non-expired notifications or messaging data.
