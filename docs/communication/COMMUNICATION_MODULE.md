# Module de Communication ImmoTopia

Ce document décrit l’architecture et l’utilisation du module de communication (notifications email/WhatsApp, templates, règles, historique, préférences).

## Vue d’ensemble

Le module permet aux agences d’envoyer des messages (email et WhatsApp) de façon **automatique** (déclenchés par des événements : paiement reçu, ticket créé, bail activé, etc.) ou **manuelle** (annonces, envois groupés). Les destinataires peuvent définir leurs **préférences** (canaux, types, plages horaires « quiet hours »).

## Composants principaux

### Backend (packages/api)

| Composant | Rôle |
|-----------|------|
| **CommunicationService** | CRUD templates, règles, préférences ; création/envoi/planification/annulation/retry des messages ; historique et analytics. |
| **NotificationEngine** | `triggerEvent` : évalue les règles actives, résout les destinataires et préférences, crée les Communications (avec respect des quiet_hours) et enfile les envois. |
| **QueueService** | `enqueue` / `processQueue` : envoi effectif via EmailProvider et WhatsAppProvider ; `enqueueDueScheduled` : passage des messages planifiés (PENDING → QUEUED) quand l’heure est due. |
| **EmailProvider** | Envoi email (Nodemailer / SendGrid). |
| **WhatsAppProvider** | Envoi WhatsApp (Twilio). |

### Jobs planifiés

| Job | Cron | Rôle |
|-----|------|------|
| **communication-queue-processor** | Toutes les minutes | Passe les Communications PENDING dont `scheduled_at` est due en QUEUED, puis traite la file d’envoi. |
| **reminder-scheduler** | Tous les jours à 6h UTC | Déclenche `INSTALLMENT_DUE_REMINDER` (échéances dans 1–3 jours) et `LEASE_ENDING_SOON` (baux se terminant dans 30 jours). |
| **communication-status-updater** | Toutes les 5 min | Prévu pour mettre à jour les statuts (DELIVERED/READ) à partir des fournisseurs ou webhooks. |

### Modèles Prisma

- **CommunicationTemplate** : nom, type, canal, sujet, corps, variables, actif.
- **NotificationRule** : événement déclencheur, types de destinataires, templates email/WhatsApp, actif.
- **Communication** : type, canal, statut (PENDING, QUEUED, SENT, DELIVERED, READ, FAILED, CANCELLED), destinataire, sujet, corps, `scheduled_at`, `failure_reason`, `retry_count`.
- **CommunicationPreference** : par destinataire (recipientType + recipientId) : canaux autorisés, types, triggers désactivés, `quiet_hours_start` / `quiet_hours_end`.

## API

Base : `GET/POST /api/tenants/:tenantId/communication/...` (authentification + accès tenant + permission communication requises).

- **Templates** : `GET/POST /templates`, `GET/PATCH/DELETE /templates/:id`
- **Règles** : `GET/POST /rules`, `GET/PATCH/DELETE /rules/:id`, `PATCH /rules/:id/toggle`
- **Messages** : `POST /messages`, `POST /messages/bulk`, `GET /messages/history`, `GET /messages/:id/status`, `POST /messages/:id/send`, `POST /messages/:id/cancel`, `POST /messages/:id/retry`
- **Préférences** : `GET/POST /preferences`, `GET/PATCH /preferences/:recipientType/:recipientId`
- **Analytics** : `GET /analytics?from=&to=`

## Préférences et quiet hours

- Les **canaux** et **types** autorisés par destinataire filtrent les envois (automatiques et manuels).
- Les **quiet hours** (ex. 22:00–08:00) : le moteur calcule la prochaine heure d’envoi autorisée et enregistre `scheduled_at` ; les messages ne sont mis en file (QUEUED) qu’à partir de cette heure (via le job « queue processor »).

## Frontend

- **Templates** : liste, création, édition.
- **Règles** : liste, création, édition, activation/désactivation.
- **Historique** : liste paginée avec filtres (statut, canal), boutons Réessayer (échec) et Annuler (en attente / planifié).
- **Préférences** : recherche destinataire, édition canaux, types, plages horaires, triggers désactivés.
- **Annonces** : composition, sélection de destinataires, envoi immédiat ou planifié (les canaux sont filtrés selon les préférences).
- **Analytics** : taux de livraison, volumes par canal/type.

## Références

- Spécification : `specs/010-communication-module/spec.md`
- Plan : `specs/010-communication-module/plan.md`
- Tâches : `specs/010-communication-module/tasks.md`
- Variables de templates : `docs/communication/TEMPLATE_VARIABLES.md`
