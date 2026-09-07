# Prompt pour Cursor AI : Module de Communication ImmoTopia

## Contexte du projet

Tu es un développeur expert travaillant sur **ImmoTopia**, une plateforme SaaS de gestion immobilière multi-tenant construite avec :
- **Backend** : Node.js/TypeScript, Express, PostgreSQL, Prisma ORM
- **Frontend** : React/TypeScript
- **Architecture** : Multi-tenant avec isolation des données par `tenant_id`
- **Sécurité** : JWT, RBAC (rôles et permissions), validation Zod

## Objectif

Développer un **module de communication complet** permettant aux trois types d'intervenants (Propriétaire, Locataire, Agence) de communiquer efficacement via **WhatsApp** et **Email** pour tous les événements liés aux différents modules de l'application.

---

## 1. Spécifications fonctionnelles

### 1.1 Intervenants

Le système gère trois types d'acteurs :

1. **L'Agence** (tenant)
   - Accès complet au système
   - Gère les communications avec propriétaires et locataires
   - Configure les templates et règles de notification

2. **Le Propriétaire** (owner)
   - Reçoit des notifications sur ses biens
   - Peut communiquer avec l'agence et (optionnellement) les locataires
   - Accès via le portail propriétaire

3. **Le Locataire** (tenant_client/renter)
   - Reçoit des notifications sur ses baux et charges
   - Peut communiquer avec l'agence
   - Accès via le portail locataire

### 1.2 Canaux de communication

#### Canal 1 : WhatsApp
- Intégration via **WhatsApp Business API** ou **Twilio WhatsApp**
- Support des messages texte et images
- Templates pré-approuvés pour les notifications transactionnelles
- Statuts de livraison (envoyé, délivré, lu)

#### Canal 2 : Email
- Intégration via **SendGrid**, **AWS SES** ou **Nodemailer**
- Support HTML avec templates personnalisables
- Pièces jointes (PDF, images, documents)
- Suivi d'ouverture et de clics

### 1.3 Types de communications

#### A. Annonces
Messages informatifs envoyés de manière proactive :
- Nouvelles propriétés disponibles
- Événements (portes ouvertes, réunions)
- Actualités de l'agence
- Promotions et offres spéciales

#### B. Alertes
Notifications urgentes nécessitant une attention immédiate :
- Retards de paiement
- Documents manquants ou expirés
- Problèmes de maintenance urgents
- Changements de statut critiques

#### C. Notifications
Messages automatiques déclenchés par des événements système :
- Confirmation de rendez-vous/visite
- Rappels d'échéances de loyer
- Validation de paiement
- Génération de documents
- Changements de statut de tickets maintenance
- Mise à jour de deal/contact CRM
- Expiration de mandat

---

## 2. Architecture technique

### 2.1 Structure de la base de données

Créer les tables suivantes dans le schéma Prisma :

```prisma
// ============================================================================
// COMMUNICATION MODULE
// ============================================================================

// Types et statuts principaux
enum CommunicationType {
  ANNOUNCEMENT    // Annonce
  ALERT          // Alerte
  NOTIFICATION   // Notification
}

enum CommunicationChannel {
  EMAIL
  WHATSAPP
  SMS           // Futur
}

enum CommunicationStatus {
  DRAFT         // Brouillon
  SCHEDULED     // Planifié
  QUEUED        // En file d'attente
  SENDING       // En cours d'envoi
  SENT          // Envoyé
  DELIVERED     // Délivré
  READ          // Lu
  FAILED        // Échec
  CANCELED      // Annulé
}

enum RecipientType {
  OWNER         // Propriétaire
  RENTER        // Locataire
  AGENCY_USER   // Utilisateur de l'agence
  CONTACT       // Contact CRM
}

enum EventTrigger {
  // CRM
  CONTACT_CREATED
  DEAL_CREATED
  DEAL_STAGE_CHANGED
  APPOINTMENT_SCHEDULED
  APPOINTMENT_REMINDER
  
  // Propriétés
  PROPERTY_STATUS_CHANGED
  PROPERTY_PUBLISHED
  VISIT_SCHEDULED
  VISIT_REMINDER
  MANDATE_EXPIRING
  DOCUMENT_EXPIRING
  
  // Gestion locative
  LEASE_CREATED
  LEASE_ACTIVATED
  LEASE_ENDING_SOON
  INSTALLMENT_DUE_REMINDER
  INSTALLMENT_OVERDUE
  PAYMENT_RECEIVED
  PAYMENT_CONFIRMED
  PENALTY_APPLIED
  DEPOSIT_COLLECTED
  DEPOSIT_REFUNDED
  RENTAL_DOCUMENT_GENERATED
  
  // Maintenance
  TICKET_CREATED
  TICKET_ASSIGNED
  TICKET_STATUS_CHANGED
  TICKET_RESOLVED
  TICKET_COMMENT_ADDED
  
  // Général
  USER_INVITED
  PASSWORD_RESET_REQUESTED
  CUSTOM              // Message personnalisé
}

// Table principale des templates de communication
model CommunicationTemplate {
  id                String               @id @default(cuid())
  tenant_id         String?              // null = template plateforme
  
  // Identification
  name              String               // Nom du template
  slug              String               // Identifiant unique (ex: "lease-payment-reminder")
  description       String?
  
  // Classification
  type              CommunicationType
  channel           CommunicationChannel
  event_trigger     EventTrigger?        // Événement déclencheur (null pour annonces manuelles)
  
  // Contenu
  subject           String?              // Pour email
  body_template     String               @db.Text // Avec variables {{ variable }}
  
  // Configuration WhatsApp
  whatsapp_template_id String?           // ID du template WhatsApp approuvé
  
  // Règles d'envoi
  is_active         Boolean              @default(true)
  priority          Int                  @default(5) // 1-10, plus élevé = plus prioritaire
  send_delay_minutes Int?               // Délai avant envoi (pour regroupement)
  
  // Personnalisation
  variables         Json?                // Liste des variables disponibles
  
  // Métadonnées
  created_at        DateTime             @default(now())
  updated_at        DateTime             @updatedAt
  created_by_id     String?
  
  // Relations
  tenant            Tenant?              @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  created_by        User?                @relation(fields: [created_by_id], references: [id], onDelete: SetNull)
  communications    Communication[]
  
  @@unique([tenant_id, slug])
  @@index([tenant_id, is_active])
  @@index([event_trigger, is_active])
  @@map("communication_templates")
}

// Configuration des règles de notification
model NotificationRule {
  id                  String              @id @default(cuid())
  tenant_id           String
  
  // Identification
  name                String
  description         String?
  
  // Déclencheur
  event_trigger       EventTrigger
  
  // Conditions (JSON)
  conditions          Json?               // Conditions pour déclencher la règle
  
  // Destinataires
  recipient_types     RecipientType[]
  
  // Templates à utiliser
  email_template_id   String?
  whatsapp_template_id String?
  
  // Configuration
  is_active           Boolean             @default(true)
  send_to_agency      Boolean             @default(false) // Copie à l'agence
  priority            Int                 @default(5)
  
  // Timing
  send_immediately    Boolean             @default(true)
  send_delay_minutes  Int?
  
  // Métadonnées
  created_at          DateTime            @default(now())
  updated_at          DateTime            @updatedAt
  
  // Relations
  tenant              Tenant              @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  email_template      CommunicationTemplate? @relation("EmailTemplate", fields: [email_template_id], references: [id], onDelete: SetNull)
  whatsapp_template   CommunicationTemplate? @relation("WhatsAppTemplate", fields: [whatsapp_template_id], references: [id], onDelete: SetNull)
  
  @@index([tenant_id, is_active])
  @@index([event_trigger])
  @@map("notification_rules")
}

// Table principale des communications
model Communication {
  id                  String                @id @default(cuid())
  tenant_id           String
  
  // Classification
  type                CommunicationType
  channel             CommunicationChannel
  event_trigger       EventTrigger?
  
  // Destinataire
  recipient_type      RecipientType
  recipient_id        String                // ID du destinataire (user_id, tenant_client_id, contact_id)
  recipient_email     String?
  recipient_phone     String?
  recipient_name      String?
  
  // Contenu
  subject             String?
  body                String                @db.Text
  
  // Attachments (pour email)
  attachments         Json?                 // [{name, url, type}]
  
  // Statut
  status              CommunicationStatus   @default(QUEUED)
  
  // Planification
  scheduled_at        DateTime?
  sent_at             DateTime?
  delivered_at        DateTime?
  read_at             DateTime?
  failed_at           DateTime?
  
  // Erreurs
  error_message       String?               @db.Text
  retry_count         Int                   @default(0)
  max_retries         Int                   @default(3)
  
  // Traçabilité
  external_id         String?               // ID du provider (SendGrid, Twilio)
  provider_response   Json?
  
  // Relation à l'entité source
  related_entity_type String?               // "lease", "property", "ticket", etc.
  related_entity_id   String?
  
  // Template utilisé
  template_id         String?
  
  // Métadonnées
  metadata            Json?                 // Données additionnelles
  created_at          DateTime              @default(now())
  updated_at          DateTime              @updatedAt
  created_by_id       String?
  
  // Relations
  tenant              Tenant                @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  template            CommunicationTemplate? @relation(fields: [template_id], references: [id], onDelete: SetNull)
  created_by          User?                 @relation(fields: [created_by_id], references: [id], onDelete: SetNull)
  
  @@index([tenant_id, status])
  @@index([tenant_id, recipient_id])
  @@index([scheduled_at])
  @@index([event_trigger])
  @@index([related_entity_type, related_entity_id])
  @@map("communications")
}

// Préférences de communication par utilisateur
model CommunicationPreference {
  id                    String              @id @default(cuid())
  tenant_id             String
  user_id               String?             // User de l'agence
  tenant_client_id      String?             // Locataire
  contact_id            String?             // Contact CRM (propriétaire)
  
  // Préférences par canal
  email_enabled         Boolean             @default(true)
  whatsapp_enabled      Boolean             @default(false)
  sms_enabled           Boolean             @default(false)
  
  // Préférences par type
  announcements_enabled Boolean             @default(true)
  alerts_enabled        Boolean             @default(true)
  notifications_enabled Boolean             @default(true)
  
  // Préférences spécifiques
  disabled_triggers     EventTrigger[]      // Événements désactivés
  
  // Horaires (quiet hours)
  quiet_hours_start     String?             // Format HH:mm
  quiet_hours_end       String?             // Format HH:mm
  timezone              String              @default("Africa/Abidjan")
  
  // Métadonnées
  created_at            DateTime            @default(now())
  updated_at            DateTime            @updatedAt
  
  // Relations
  tenant                Tenant              @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  user                  User?               @relation(fields: [user_id], references: [id], onDelete: Cascade)
  tenant_client         TenantClient?       @relation(fields: [tenant_client_id], references: [id], onDelete: Cascade)
  contact               CrmContact?         @relation(fields: [contact_id], references: [id], onDelete: Cascade)
  
  @@unique([tenant_id, user_id])
  @@unique([tenant_id, tenant_client_id])
  @@unique([tenant_id, contact_id])
  @@map("communication_preferences")
}
```

### 2.2 Services à créer

#### Service 1 : CommunicationService

```typescript
// packages/api/src/services/communication.service.ts

class CommunicationService {
  // Création de communication
  async createCommunication(data: CreateCommunicationDTO): Promise<Communication>
  
  // Envoi immédiat
  async sendCommunication(communicationId: string): Promise<void>
  
  // Envoi par lots (bulk)
  async sendBulkCommunications(recipientIds: string[], data: BulkCommunicationDTO): Promise<void>
  
  // Planification
  async scheduleCommunication(communicationId: string, scheduledAt: Date): Promise<void>
  
  // Annulation
  async cancelCommunication(communicationId: string): Promise<void>
  
  // Réessai en cas d'échec
  async retryCommunication(communicationId: string): Promise<void>
  
  // Récupération du statut
  async getCommunicationStatus(communicationId: string): Promise<CommunicationStatus>
  
  // Historique
  async getCommunicationHistory(filters: HistoryFilters): Promise<PaginatedResult<Communication>>
}
```

#### Service 2 : NotificationEngine

```typescript
// packages/api/src/services/notification-engine.service.ts

class NotificationEngine {
  // Déclenchement automatique sur événement
  async triggerEvent(
    tenantId: string,
    eventTrigger: EventTrigger,
    entityData: any,
    recipientData: RecipientData[]
  ): Promise<void>
  
  // Traitement des règles de notification
  async processNotificationRules(
    tenantId: string,
    eventTrigger: EventTrigger,
    entityData: any
  ): Promise<Communication[]>
  
  // Évaluation des conditions
  private evaluateConditions(rule: NotificationRule, data: any): boolean
  
  // Résolution des variables dans les templates
  private resolveTemplateVariables(template: string, data: any): string
  
  // Sélection du destinataire approprié
  private resolveRecipients(
    recipientTypes: RecipientType[],
    entityData: any
  ): RecipientData[]
}
```

#### Service 3 : EmailProvider

```typescript
// packages/api/src/services/providers/email.provider.ts

class EmailProvider {
  // Configuration
  configure(config: EmailConfig): void
  
  // Envoi simple
  async send(params: EmailParams): Promise<EmailResult>
  
  // Envoi avec template
  async sendWithTemplate(templateId: string, params: TemplateEmailParams): Promise<EmailResult>
  
  // Vérification du statut
  async checkStatus(externalId: string): Promise<DeliveryStatus>
  
  // Webhook pour les événements
  handleWebhook(payload: any): WebhookEvent
}
```

#### Service 4 : WhatsAppProvider

```typescript
// packages/api/src/services/providers/whatsapp.provider.ts

class WhatsAppProvider {
  // Configuration
  configure(config: WhatsAppConfig): void
  
  // Envoi message texte
  async sendText(to: string, message: string): Promise<WhatsAppResult>
  
  // Envoi avec template approuvé
  async sendTemplate(
    to: string,
    templateName: string,
    parameters: any[]
  ): Promise<WhatsAppResult>
  
  // Envoi d'image
  async sendImage(to: string, imageUrl: string, caption?: string): Promise<WhatsAppResult>
  
  // Vérification du statut
  async checkStatus(messageId: string): Promise<DeliveryStatus>
  
  // Webhook pour les événements
  handleWebhook(payload: any): WebhookEvent
}
```

#### Service 5 : QueueService

```typescript
// packages/api/src/services/queue.service.ts

class QueueService {
  // Ajouter à la file d'attente
  async enqueue(communication: Communication): Promise<void>
  
  // Traiter la file d'attente
  async processQueue(): Promise<void>
  
  // Gérer les échecs avec retry exponentiel
  private async handleFailure(communication: Communication, error: Error): Promise<void>
  
  // Nettoyage des anciennes communications
  async cleanupOldCommunications(olderThanDays: number): Promise<number>
}
```

### 2.3 Routes API à créer

```typescript
// packages/api/src/routes/communication-routes.ts

// ========================================
// TEMPLATES
// ========================================
GET    /api/tenants/:tenantId/communication/templates
POST   /api/tenants/:tenantId/communication/templates
GET    /api/tenants/:tenantId/communication/templates/:id
PATCH  /api/tenants/:tenantId/communication/templates/:id
DELETE /api/tenants/:tenantId/communication/templates/:id

// ========================================
// NOTIFICATION RULES
// ========================================
GET    /api/tenants/:tenantId/communication/rules
POST   /api/tenants/:tenantId/communication/rules
GET    /api/tenants/:tenantId/communication/rules/:id
PATCH  /api/tenants/:tenantId/communication/rules/:id
DELETE /api/tenants/:tenantId/communication/rules/:id
PATCH  /api/tenants/:tenantId/communication/rules/:id/toggle

// ========================================
// COMMUNICATIONS
// ========================================
GET    /api/tenants/:tenantId/communication/messages
POST   /api/tenants/:tenantId/communication/messages
POST   /api/tenants/:tenantId/communication/messages/bulk
GET    /api/tenants/:tenantId/communication/messages/:id
PATCH  /api/tenants/:tenantId/communication/messages/:id
DELETE /api/tenants/:tenantId/communication/messages/:id
POST   /api/tenants/:tenantId/communication/messages/:id/send
POST   /api/tenants/:tenantId/communication/messages/:id/schedule
POST   /api/tenants/:tenantId/communication/messages/:id/cancel
POST   /api/tenants/:tenantId/communication/messages/:id/retry

// ========================================
// PREFERENCES
// ========================================
GET    /api/tenants/:tenantId/communication/preferences
POST   /api/tenants/:tenantId/communication/preferences
GET    /api/tenants/:tenantId/communication/preferences/:recipientType/:recipientId
PATCH  /api/tenants/:tenantId/communication/preferences/:recipientType/:recipientId

// ========================================
// WEBHOOKS (providers)
// ========================================
POST   /api/webhooks/email/:provider
POST   /api/webhooks/whatsapp/:provider

// ========================================
// ANALYTICS
// ========================================
GET    /api/tenants/:tenantId/communication/analytics
GET    /api/tenants/:tenantId/communication/analytics/delivery-rate
GET    /api/tenants/:tenantId/communication/analytics/by-type
GET    /api/tenants/:tenantId/communication/analytics/by-channel
```

---

## 3. Intégration avec les modules existants

### 3.1 Points d'intégration CRM

**Fichier** : `packages/api/src/services/crm/deal.service.ts`

```typescript
// Après création d'un deal
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.DEAL_CREATED,
  deal,
  [{ type: 'CONTACT', id: deal.contact_id }]
);

// Après changement de stage
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.DEAL_STAGE_CHANGED,
  { deal, oldStage, newStage },
  [{ type: 'CONTACT', id: deal.contact_id }]
);
```

**Fichier** : `packages/api/src/services/crm/appointment.service.ts`

```typescript
// Rappel de rendez-vous (24h avant)
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.APPOINTMENT_REMINDER,
  appointment,
  [{ type: 'CONTACT', id: appointment.contact_id }]
);
```

### 3.2 Points d'intégration Gestion Locative

**Fichier** : `packages/api/src/services/rental/lease.service.ts`

```typescript
// Activation d'un bail
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.LEASE_ACTIVATED,
  lease,
  [{ type: 'RENTER', id: lease.primary_renter }]
);

// Bail arrivant à échéance (30 jours avant)
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.LEASE_ENDING_SOON,
  lease,
  [
    { type: 'RENTER', id: lease.primary_renter },
    { type: 'OWNER', id: lease.property.owner_id }
  ]
);
```

**Fichier** : `packages/api/src/services/rental/installment.service.ts`

```typescript
// Rappel d'échéance (7 jours avant)
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.INSTALLMENT_DUE_REMINDER,
  { installment, lease },
  [{ type: 'RENTER', id: lease.primary_renter }]
);

// Échéance en retard
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.INSTALLMENT_OVERDUE,
  { installment, lease, daysOverdue },
  [{ type: 'RENTER', id: lease.primary_renter }]
);
```

**Fichier** : `packages/api/src/services/rental/payment.service.ts`

```typescript
// Paiement reçu
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.PAYMENT_RECEIVED,
  { payment, lease },
  [
    { type: 'RENTER', id: lease.primary_renter },
    { type: 'OWNER', id: lease.property.owner_id }
  ]
);
```

### 3.3 Points d'intégration Maintenance

**Fichier** : `packages/api/src/services/maintenance/ticket.service.ts`

```typescript
// Création de ticket
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.TICKET_CREATED,
  ticket,
  [
    { type: 'RENTER', id: ticket.reported_by_id },
    { type: 'OWNER', id: ticket.property.owner_id }
  ]
);

// Changement de statut
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.TICKET_STATUS_CHANGED,
  { ticket, oldStatus, newStatus },
  [{ type: 'RENTER', id: ticket.reported_by_id }]
);
```

### 3.4 Points d'intégration Propriétés

**Fichier** : `packages/api/src/services/property.service.ts`

```typescript
// Publication d'une propriété
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.PROPERTY_PUBLISHED,
  property,
  [{ type: 'OWNER', id: property.owner_id }]
);

// Document expirant (30 jours avant)
await notificationEngine.triggerEvent(
  tenantId,
  EventTrigger.DOCUMENT_EXPIRING,
  { property, document },
  [{ type: 'OWNER', id: property.owner_id }]
);
```

---

## 4. Templates par défaut à créer

### 4.1 Templates Email

Créer les templates suivants dans `packages/api/src/templates/email/` :

1. **lease-payment-reminder.html** - Rappel d'échéance de loyer
2. **payment-confirmed.html** - Confirmation de paiement
3. **lease-activated.html** - Activation de bail
4. **ticket-created.html** - Création de ticket de maintenance
5. **appointment-reminder.html** - Rappel de rendez-vous
6. **property-published.html** - Propriété publiée
7. **document-expiring.html** - Document expirant
8. **installment-overdue.html** - Retard de paiement

### 4.2 Templates WhatsApp

Créer les templates suivants (à soumettre pour approbation WhatsApp) :

1. **lease_payment_reminder** - "Bonjour {{1}}, votre loyer de {{2}} FCFA est dû le {{3}}."
2. **payment_confirmed** - "Paiement de {{1}} FCFA confirmé pour le bail {{2}}. Merci !"
3. **appointment_reminder** - "Rappel : RDV le {{1}} à {{2}} pour {{3}}."
4. **ticket_update** - "Ticket #{{1}} : Statut mis à jour à {{2}}."

---

## 5. Jobs planifiés (Cron)

Créer les jobs suivants dans `packages/api/src/jobs/` :

### 5.1 communication-queue-processor.job.ts

```typescript
// Traite la file d'attente des communications
// Fréquence : Toutes les minutes
cron.schedule('* * * * *', async () => {
  await queueService.processQueue();
});
```

### 5.2 reminder-scheduler.job.ts

```typescript
// Génère les rappels d'échéances, rendez-vous, etc.
// Fréquence : Tous les jours à 6h00
cron.schedule('0 6 * * *', async () => {
  await reminderScheduler.generateDailyReminders();
});
```

### 5.3 status-updater.job.ts

```typescript
// Met à jour les statuts via les webhooks ou polling
// Fréquence : Toutes les 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await statusUpdater.updatePendingStatuses();
});
```

---

## 6. Frontend - Interface d'administration

### 6.1 Pages à créer

**Chemin** : `apps/web/src/pages/communication/`

1. **TemplatesPage.tsx** - Gestion des templates
   - Liste des templates
   - Création/édition de template
   - Prévisualisation
   - Variables disponibles

2. **RulesPage.tsx** - Configuration des règles de notification
   - Liste des règles
   - Création/édition de règle
   - Activation/désactivation
   - Test de règle

3. **HistoryPage.tsx** - Historique des communications
   - Liste paginée
   - Filtres (type, canal, statut, date)
   - Détail d'une communication
   - Statistiques de livraison

4. **AnalyticsPage.tsx** - Tableau de bord analytique
   - Taux de livraison par canal
   - Communications par type
   - Tendances temporelles
   - Top événements déclencheurs

5. **PreferencesPage.tsx** - Gestion des préférences
   - Recherche de destinataire
   - Configuration des préférences
   - Quiet hours

### 6.2 Composants à créer

**Chemin** : `apps/web/src/components/communication/`

1. **TemplateEditor.tsx** - Éditeur de template riche
2. **VariableSelector.tsx** - Sélecteur de variables
3. **RecipientSelector.tsx** - Sélection de destinataires
4. **CommunicationStatus.tsx** - Badge de statut
5. **ChannelIcon.tsx** - Icônes pour les canaux
6. **RuleBuilder.tsx** - Constructeur de règles visuelles
7. **PreviewModal.tsx** - Prévisualisation de message

---

## 7. Configuration environnement

### 7.1 Variables d'environnement

Ajouter dans `.env` :

```env
# Email Provider (SendGrid)
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@immotopia.com
SENDGRID_FROM_NAME=ImmoTopia

# WhatsApp Provider (Twilio)
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886

# Communication Settings
COMMUNICATION_QUEUE_ENABLED=true
COMMUNICATION_RETRY_ENABLED=true
COMMUNICATION_MAX_RETRIES=3
COMMUNICATION_RETRY_DELAY=300000

# Webhook URLs
EMAIL_WEBHOOK_URL=https://api.immotopia.com/webhooks/email/sendgrid
WHATSAPP_WEBHOOK_URL=https://api.immotopia.com/webhooks/whatsapp/twilio
```

---

## 8. Tests à implémenter

### 8.1 Tests unitaires

```typescript
// packages/api/src/services/__tests__/communication.service.test.ts
describe('CommunicationService', () => {
  test('should create a communication', async () => {});
  test('should send email successfully', async () => {});
  test('should handle failed delivery', async () => {});
  test('should retry failed communications', async () => {});
});

// packages/api/src/services/__tests__/notification-engine.service.test.ts
describe('NotificationEngine', () => {
  test('should trigger event and create communications', async () => {});
  test('should evaluate conditions correctly', async () => {});
  test('should resolve template variables', async () => {});
});
```

### 8.2 Tests d'intégration

```typescript
// packages/api/src/routes/__tests__/communication.test.ts
describe('Communication Routes', () => {
  test('POST /templates should create template', async () => {});
  test('POST /messages should send communication', async () => {});
  test('GET /messages should return paginated history', async () => {});
});
```

---

## 9. Documentation à produire

### 9.1 Documentation technique

Créer dans `docs/communication/` :

1. **COMMUNICATION_MODULE.md** - Vue d'ensemble du module
2. **TEMPLATE_VARIABLES.md** - Liste complète des variables disponibles
3. **NOTIFICATION_EVENTS.md** - Liste des événements déclencheurs
4. **PROVIDER_INTEGRATION.md** - Guide d'intégration des providers
5. **WEBHOOKS.md** - Configuration des webhooks

### 9.2 Documentation utilisateur

Créer dans `docs/user-guides/` :

1. **GUIDE_TEMPLATES.md** - Guide de création de templates
2. **GUIDE_NOTIFICATIONS.md** - Configuration des notifications
3. **GUIDE_PREFERENCES.md** - Gestion des préférences de communication

---

## 10. Checklist d'implémentation

### Phase 1 : Infrastructure (Semaine 1-2)
- [ ] Créer le schéma Prisma complet
- [ ] Générer et exécuter les migrations
- [ ] Créer les DTOs et validations Zod
- [ ] Implémenter CommunicationService de base
- [ ] Implémenter NotificationEngine
- [ ] Créer QueueService

### Phase 2 : Providers (Semaine 3)
- [ ] Implémenter EmailProvider (SendGrid)
- [ ] Implémenter WhatsAppProvider (Twilio)
- [ ] Configurer les webhooks
- [ ] Implémenter la gestion des statuts
- [ ] Tests unitaires des providers

### Phase 3 : Routes API (Semaine 4)
- [ ] Créer toutes les routes
- [ ] Implémenter les controllers
- [ ] Ajouter les middlewares d'authentification
- [ ] Ajouter la validation des requêtes
- [ ] Tests d'intégration API

### Phase 4 : Intégration modules (Semaine 5)
- [ ] Intégrer avec CRM
- [ ] Intégrer avec Gestion Locative
- [ ] Intégrer avec Maintenance
- [ ] Intégrer avec Propriétés
- [ ] Tester les déclenchements d'événements

### Phase 5 : Jobs planifiés (Semaine 6)
- [ ] Implémenter communication-queue-processor
- [ ] Implémenter reminder-scheduler
- [ ] Implémenter status-updater
- [ ] Tester les jobs
- [ ] Configurer le monitoring

### Phase 6 : Frontend (Semaine 7-8)
- [ ] Créer les pages d'administration
- [ ] Créer les composants réutilisables
- [ ] Implémenter l'éditeur de templates
- [ ] Créer le constructeur de règles
- [ ] Page d'historique et analytics

### Phase 7 : Templates par défaut (Semaine 9)
- [ ] Créer les templates email HTML
- [ ] Soumettre les templates WhatsApp pour approbation
- [ ] Créer les règles de notification par défaut
- [ ] Tester l'ensemble des templates

### Phase 8 : Tests et documentation (Semaine 10)
- [ ] Tests end-to-end complets
- [ ] Documentation technique complète
- [ ] Guides utilisateurs
- [ ] Démo et formation

---

## 11. Considérations importantes

### 11.1 Sécurité
- Valider tous les numéros de téléphone (format international)
- Valider les adresses email
- Rate limiting sur les endpoints d'envoi
- Protection contre les abus (spam)
- Audit de toutes les communications

### 11.2 Performance
- File d'attente asynchrone pour les envois
- Batch processing pour les envois groupés
- Cache des templates fréquemment utilisés
- Index optimisés pour les requêtes

### 11.3 Conformité
- Respect du RGPD (opt-out, suppression des données)
- Conformité WhatsApp Business Policy
- Gestion des préférences utilisateur
- Logs d'audit complets

### 11.4 Monitoring
- Suivi des taux de livraison
- Alertes sur échecs répétés
- Dashboard de monitoring
- Logs structurés

---

## 12. Exemples de code

### 12.1 Exemple de déclenchement manuel

```typescript
// Envoi d'une annonce manuelle
const communication = await communicationService.createCommunication({
  tenantId: 'tenant_123',
  type: CommunicationType.ANNOUNCEMENT,
  channel: CommunicationChannel.EMAIL,
  recipients: [
    { type: RecipientType.RENTER, id: 'renter_1' },
    { type: RecipientType.RENTER, id: 'renter_2' },
  ],
  subject: 'Nouvelle propriété disponible',
  body: 'Nous avons une nouvelle propriété qui pourrait vous intéresser...',
  scheduledAt: new Date('2025-02-10T10:00:00Z'),
});
```

### 12.2 Exemple de règle de notification

```typescript
const rule = await notificationRuleService.create({
  tenantId: 'tenant_123',
  name: 'Rappel loyer 7 jours avant',
  eventTrigger: EventTrigger.INSTALLMENT_DUE_REMINDER,
  conditions: {
    daysBeforeDue: 7,
    minAmount: 50000,
  },
  recipientTypes: [RecipientType.RENTER],
  emailTemplateId: 'template_email_payment_reminder',
  whatsappTemplateId: 'template_whatsapp_payment_reminder',
  sendImmediately: true,
});
```

---

## Conclusion

Ce prompt fournit une spécification complète pour implémenter le module de communication d'ImmoTopia. Le module est conçu pour être :

- **Flexible** : Support de multiples canaux et types de communication
- **Évolutif** : Architecture modulaire permettant d'ajouter facilement de nouveaux providers
- **Fiable** : Système de retry, file d'attente, et gestion robuste des erreurs
- **Intégré** : Points d'intégration clairs avec tous les modules existants
- **Conforme** : Respect des bonnes pratiques et de la réglementation

Commence par la Phase 1 et progresse systématiquement à travers chaque phase. N'hésite pas à adapter selon les besoins spécifiques du projet.
