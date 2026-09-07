# Implémentation actuelle du module Communication – ImmoTopia

Ce document décrit l’état actuel de l’implémentation du module de communication (templates, règles, envoi, préférences, historique, analytics, jobs et intégrations).

**Dernière mise à jour** : février 2025.

---

## 1. Vue d’ensemble

Le module permet :
- **Envoi automatique** : déclenché par des événements (paiement reçu, ticket créé, bail activé, rappels d’échéance, fin de bail, etc.) via des **règles de notification** et des **templates**.
- **Envoi manuel** : annonces / envoi groupé depuis l’interface (Annonces).
- **Préférences par destinataire** : canaux autorisés, types de messages, triggers désactivés, **quiet hours** (plage horaire sans envoi).
- **Historique** et **analytics** (taux de livraison, volumes par canal/type).

**Canaux** : EMAIL, WHATSAPP. SMS est défini dans les types mais **non implémenté** côté envoi (retourne une erreur dans la queue).

---

## 2. Backend (packages/api)

### 2.1 Modèles Prisma

**Tables** (préfixe `communication_` ou noms ci‑dessous) :

| Modèle | Table | Description |
|--------|--------|-------------|
| **CommunicationTemplate** | `communication_templates` | Nom, type (ANNOUNCEMENT / ALERT / NOTIFICATION), canal (EMAIL / WHATSAPP / SMS), sujet (optionnel), corps, variables (array), is_active. Contrainte unique `(tenant_id, name, channel)`. |
| **NotificationRule** | `notification_rules` | event_trigger, recipient_types (OWNER, RENTER, AGENCY_USER, CONTACT), template_id_email, template_id_whatsapp, template_id_sms, copy_agency, active. |
| **Communication** | `communications` | type, channel, status (PENDING → QUEUED → SENT → DELIVERED / READ / FAILED / CANCELLED), recipient_type + recipient_tenant_client_id / recipient_contact_id / recipient_user_id, subject, body, scheduled_at, failure_reason, retry_count, sent_at. |
| **CommunicationPreference** | `communication_preferences` | Par destinataire (recipient_type + id) : channels, types, disabled_triggers, quiet_hours_start, quiet_hours_end (HH:mm). |

**Enums** (dans `schema.prisma`) :
- **CommunicationType** : ANNOUNCEMENT, ALERT, NOTIFICATION  
- **CommunicationChannel** : EMAIL, WHATSAPP, SMS  
- **CommunicationStatus** : PENDING, QUEUED, SENT, DELIVERED, READ, FAILED, CANCELLED  
- **CommunicationRecipientType** : OWNER, RENTER, AGENCY_USER, CONTACT  
- **EventTrigger** : LEASE_ACTIVATED, LEASE_ENDING_SOON, INSTALLMENT_DUE_REMINDER, INSTALLMENT_OVERDUE, PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_DECLARED, PAYMENT_DECLARATION_REJECTED, TICKET_CREATED, TICKET_STATUS_CHANGED, DEAL_CREATED, DEAL_STAGE_CHANGED, APPOINTMENT_REMINDER, PROPERTY_PUBLISHED, DOCUMENT_EXPIRING, INVITATION, PASSWORD_RESET, CUSTOM  

---

### 2.2 Services

| Fichier | Rôle |
|---------|------|
| **communication.service.ts** | CRUD templates, règles, préférences ; createCommunication, sendCommunication, scheduleCommunication, cancelCommunication, retryCommunication, getStatus, getHistory, getAnalytics. Mapping recipient_type → recipient_tenant_client_id / recipient_contact_id / recipient_user_id. |
| **notification-engine.service.ts** | **triggerEvent(payload)** : charge les règles actives pour l’événement, résout les destinataires (OWNER/RENTER via lease, CONTACT via context, AGENCY_USER), respecte préférences (canaux, types, disabled_triggers, quiet_hours). Crée les Communications (sujet/corps avec **resolveTemplateVariables**), enregistre scheduled_at si en quiet hours, enqueue + processQueue. **resolveRecipients**, **evaluateConditions**, **getNextAllowedSendTime** (plage overnight supportée). |
| **queue.service.ts** | **enqueue** : met la communication en QUEUED. **enqueueDueScheduled(limit)** : PENDING avec scheduled_at ≤ now (ou null) → QUEUED. **processQueue(limit)** : prend les QUEUED, **resolveRecipientContact** (TenantClient/CrmContact/User pour email/téléphone/WhatsApp), envoie via **email.provider** ou **whatsapp.provider**, met à jour SENT ou **handleFailure** (retry_count, max retries → FAILED). |
| **providers/email.provider.ts** | Envoi email (Nodemailer / SMTP ou SendGrid selon config). **handleWebhook** pour statuts (optionnel). |
| **providers/whatsapp.provider.ts** | Envoi WhatsApp (Twilio). **handleWebhook** pour statuts (optionnel). |

---

### 2.3 Contrôleur et routes

- **Fichier** : `controllers/communication-controller.ts`, `routes/communication-routes.ts`.  
- **Montage** : `app.use('/api/tenants/:tenantId/communication', communicationRoutes)`.

Toutes les routes métier sont sous **authenticate** + **requireTenantAccess** + **enforceTenantIsolation** + **requireCommunicationPermission** (TENANT_ADMIN ou COMMUNICATION_VIEW).

| Méthode | Route | Handler | Description |
|---------|--------|---------|-------------|
| GET | `/templates` | listTemplatesHandler | Liste (query: type, channel) |
| GET | `/templates/:templateId` | getTemplateHandler | Détail |
| POST | `/templates` | createTemplateHandler | Création (Zod: createTemplateSchema) |
| PATCH | `/templates/:templateId` | updateTemplateHandler | Mise à jour partielle |
| DELETE | `/templates/:templateId` | deleteTemplateHandler | Suppression |
| GET | `/rules` | listRulesHandler | Liste des règles |
| GET | `/rules/:ruleId` | getRuleHandler | Détail règle |
| POST | `/rules` | createRuleHandler | Création (createRuleSchema) |
| PATCH | `/rules/:ruleId` | updateRuleHandler | Mise à jour |
| PATCH | `/rules/:ruleId/toggle` | toggleRuleHandler | Activer/désactiver (body: active) |
| DELETE | `/rules/:ruleId` | deleteRuleHandler | Suppression |
| POST | `/messages` | createMessageHandler | Créer une communication (createCommunicationSchema) |
| POST | `/messages/bulk` | bulkSendHandler | Envoi groupé (bulkSendSchema) : recipientIds[], channels, subject, body, scheduledAt ; respecte préférences par destinataire |
| GET | `/messages/history` | listHistoryHandler | Historique paginé (query: type, channel, status, recipientId, from, to, page, limit) |
| GET | `/messages/:messageId/status` | getMessageStatusHandler | Statut d’un message |
| POST | `/messages/:messageId/send` | sendMessageHandler | Envoyer immédiatement |
| POST | `/messages/:messageId/schedule` | scheduleMessageHandler | Planifier (body: scheduledAt) |
| POST | `/messages/:messageId/cancel` | cancelMessageHandler | Annuler |
| POST | `/messages/:messageId/retry` | retryMessageHandler | Réessayer (si FAILED) |
| GET | `/preferences/:recipientType/:recipientId` | getPreferenceHandler | Préférence d’un destinataire |
| POST | `/preferences` | createPreferenceHandler | Créer préférence |
| PATCH | `/preferences/:recipientType/:recipientId` | updatePreferenceHandler | Modifier préférence |
| GET | `/analytics` | getAnalyticsHandler | Statistiques (query: from, to) |

**Webhooks** (sans tenant dans le path, à sécuriser en prod par signature) :
- POST `/api/tenants/:tenantId/communication/webhooks/email` → emailWebhookHandler  
- POST `/api/tenants/:tenantId/communication/webhooks/whatsapp` → whatsappWebhookHandler  

*(En pratique les webhooks sont montés sous le même préfixe ; vérifier l’URL exacte dans l’app.)*

---

### 2.4 Validation (Zod)

Fichier : `utils/communication-validators.ts`.

- **createTemplateSchema** : name, type (enum), channel (enum), subject optionnel, body requis, variables optionnel, isActive optionnel.  
- **updateTemplateSchema** : champs optionnels, subject nullable.  
- **createRuleSchema** : name, eventTrigger (enum), recipientTypes (array, min 1), templateIdEmail / templateIdWhatsapp / templateIdSms (uuid optionnel/null), copyAgency, active.  
- **createCommunicationSchema** : type, channel, recipientType, recipientId, subject optionnel, body, scheduledAt (ISO datetime optionnel).  
- **bulkSendSchema** : type, channels (min 1), recipientIds (array de { recipientType, recipientId }), subject, body, scheduledAt optionnel.  
- **createPreferenceSchema** : recipientType, recipientId, channels, types, disabledTriggers, quietHoursStart/End (regex HH:mm).  
- **listHistoryQuerySchema** : type, channel, status, recipientId, from, to (datetime), page, limit.  

---

### 2.5 RBAC

- **Fichier** : `middleware/communication-rbac-middleware.ts`.  
- **requireCommunicationPermission** = requireAnyPermission(['TENANT_ADMIN', 'COMMUNICATION_VIEW']).  
- La permission **COMMUNICATION_VIEW** est créée et assignée aux rôles (ex. TENANT_ADMIN, TENANT_MANAGER, TENANT_AGENT) via `prisma/seeds/communication-permissions-seed.ts`.  

---

### 2.6 Jobs planifiés

| Job | Fichier | Cron | Rôle |
|-----|---------|------|------|
| **communication-queue-processor** | `jobs/communication-queue-processor.job.ts` | Toutes les minutes (`* * * * *`) | Appelle **enqueueDueScheduled(100)** puis **processQueue(50)**. Passe les PENDING dont scheduled_at est due en QUEUED et traite la file. |
| **reminder-scheduler** | `jobs/reminder-scheduler.job.ts` | Tous les jours à 6h UTC (`0 6 * * *`) | Échéances dues dans 1–3 jours → **triggerEvent(INSTALLMENT_DUE_REMINDER)** ; baux se terminant dans 1–30 jours → **triggerEvent(LEASE_ENDING_SOON)**. |
| **communication-status-updater** | `jobs/communication-status-updater.job.ts` | Toutes les 5 min (`*/5 * * * *`) | Placeholder : pourrait interroger les fournisseurs ou traiter les webhooks pour passer SENT → DELIVERED/READ. Actuellement ne met rien à jour. |

Démarrage des jobs dans `index.ts` : `startCommunicationQueueProcessorJob()`, `startReminderSchedulerJob()`, `startCommunicationStatusUpdaterJob()`.

---

### 2.7 Où `triggerEvent` est appelé

| Contexte | Fichier | Événement(s) |
|----------|---------|----------------|
| Paiement enregistré | `rental-payment-service.ts` | PAYMENT_RECEIVED (contexte : leaseId, amount, etc.) |
| Bail activé | `rental-lease-service.ts` | LEASE_ACTIVATED |
| Deal créé / stage changé | `crm-deal-service.ts` | DEAL_CREATED, DEAL_STAGE_CHANGED |
| Publication propriété | `property-publication-service.ts` | PROPERTY_PUBLISHED |
| Ticket créé / statut changé | `maintenance-ticket-service.ts` | TICKET_CREATED, TICKET_STATUS_CHANGED |
| Rappels planifiés | `reminder-scheduler.job.ts` | INSTALLMENT_DUE_REMINDER, LEASE_ENDING_SOON |

Les autres événements (INSTALLMENT_OVERDUE, PAYMENT_CONFIRMED, APPOINTMENT_REMINDER, DOCUMENT_EXPIRING, INVITATION, PASSWORD_RESET, CUSTOM) sont définis dans l’enum mais peuvent ne pas être encore déclenchés ailleurs dans le code.

---

## 3. Frontend (apps/web)

### 3.1 Service API

- **Fichier** : `services/communication-service.ts`.  
- Base : `GET/POST/PATCH/DELETE` vers `/tenants/${tenantId}/communication/...` (via `apiClient`).  
- Méthodes : listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate ; listRules, getRule, createRule, updateRule, toggleRule, deleteRule ; listHistory, getMessageStatus, sendMessage, cancelMessage, retryMessage, createMessage, bulkSend ; getPreference, createPreference, updatePreference ; getAnalytics.  
- Types TypeScript : CommunicationTemplate, NotificationRule, Communication, CommunicationPreference, Analytics.  

*(L’apiClient est configuré avec une base URL incluant `/api` ; les routes sont donc `/api/tenants/:tenantId/communication/...`.)*

---

### 3.2 Pages (routes)

Toutes sous `ProtectedRoute`, préfixe `/tenant/:tenantId/communication/` :

| Route | Page | Description |
|-------|------|-------------|
| `/communication/templates` | **TemplatesPage** | Liste des templates, bouton « Nouveau template », modal création/édition (nom, type, canal, sujet, corps, VariableSelector, actif). |
| `/communication/rules` | **RulesPage** | Liste des règles, création/édition, association templates email/WhatsApp, toggle actif. |
| `/communication/history` | **HistoryPage** | Historique paginé des communications (filtres : type, canal, statut), actions Réessayer / Annuler selon statut. |
| `/communication/announcements` | **AnnoncesPage** | Composition d’annonces, sélection destinataires, envoi immédiat ou planifié (bulk). |
| `/communication/preferences` | **PreferencesPage** | Recherche destinataire, édition canaux, types, plages horaires (quiet hours), triggers désactivés. |
| `/communication/analytics` | **AnalyticsPage** | Taux de livraison, volumes par canal/type (données de getAnalytics). |

---

### 3.3 Composants

| Composant | Fichier | Rôle |
|-----------|---------|------|
| **VariableSelector** | `components/communication/VariableSelector.tsx` | Affiche les variables de template (depuis `constants/template-variables.ts`), groupées par catégorie ; clic pour insérer `{{nomVariable}}` dans le champ corps ou sujet (TemplatesPage). |
| **CommunicationStatus** | `components/communication/CommunicationStatus.tsx` | Affichage du statut d’une communication (badge/tag). |
| **ChannelIcon** | `components/communication/ChannelIcon.tsx` | Icône selon canal (EMAIL / WHATSAPP / SMS). |

---

### 3.4 Navigation

Le menu **Communication** (sidebar) est affiché pour les utilisateurs tenant (TENANT_USER). Entrées : Templates, Règles, Historique, Annonces, Préférences, Analytics. Fichier : `components/dashboard/sidebar.tsx`.

---

## 4. Variables de template

- Syntaxe : `{{nomVariable}}` (insensible à la casse).  
- Liste et catégories : `apps/web/src/constants/template-variables.ts` (common, payment, lease, property, ticket, crm).  
- Documentation détaillée : `docs/communication/TEMPLATE_VARIABLES.md`.  
- Le moteur remplace ces variables à l’envoi via **resolveTemplateVariables** dans `notification-engine.service.ts`, en utilisant le **context** de l’événement (plus `event`).  

---

## 5. Points à noter

- **SMS** : présent dans les enums et les formulaires, mais dans `queue.service.ts` le canal SMS renvoie « Canal SMS non implémenté » et la communication est mise en échec.  
- **Webhooks** : montés sur le routeur communication ; en production il faut vérifier les URLs et sécuriser par signature (SendGrid/Twilio).  
- **Status updater** : le job ne met pas encore à jour DELIVERED/READ ; il est prévu pour appeler les APIs fournisseurs ou traiter les webhooks.  
- **Copy agency** : champ `copy_agency` sur les règles ; la logique pour envoyer une copie à l’agence n’est pas détaillée dans le code parcouru (à confirmer si implémentée).  
- **Seeds** : `communication-permissions-seed.ts` cree la permission COMMUNICATION_VIEW et l'assigne aux roles. (`communication-seed.ts` a ete retire : les tables templates/regles n'existent plus depuis la migration `20260210120000_remove_communication_messaging_tables`.)

---

## 6. Fichiers principaux (référence rapide)

| Zone | Fichiers |
|------|----------|
| Backend – modèles | `packages/api/prisma/schema.prisma` (enums + CommunicationTemplate, NotificationRule, Communication, CommunicationPreference) |
| Backend – service | `packages/api/src/services/communication.service.ts`, `notification-engine.service.ts`, `queue.service.ts` |
| Backend – contrôleur / routes | `packages/api/src/controllers/communication-controller.ts`, `routes/communication-routes.ts` |
| Backend – validation | `packages/api/src/utils/communication-validators.ts` |
| Backend – jobs | `jobs/communication-queue-processor.job.ts`, `reminder-scheduler.job.ts`, `communication-status-updater.job.ts` |
| Backend – providers | `packages/api/src/services/providers/email.provider.ts`, `whatsapp.provider.ts` |
| Backend – RBAC | `packages/api/src/middleware/communication-rbac-middleware.ts` |
| Frontend – API | `apps/web/src/services/communication-service.ts` |
| Frontend – pages | `apps/web/src/pages/communication/*.tsx` |
| Frontend – composants | `apps/web/src/components/communication/*.tsx` |
| Frontend – variables | `apps/web/src/constants/template-variables.ts` |
| Doc variables | `docs/communication/TEMPLATE_VARIABLES.md` |

---

*Ce document reflète l’état du code au moment de la rédaction. Pour les spécifications fonctionnelles et le plan d’origine, voir `specs/010-communication-module/` et `docs/communication/COMMUNICATION_MODULE.md`.*
