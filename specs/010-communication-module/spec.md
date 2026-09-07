# Feature Specification: Module de Communication ImmoTopia

**Feature Branch**: `010-communication-module`  
**Created**: 2025-02-02  
**Status**: Draft  
**Input**: Spécifications dérivées de docs/PROMPT_MODULE_COMMUNICATION_IMMOTOPIA.md

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Envoi et réception de notifications par événement (Priority: P1)

En tant qu’**Agence**, je veux que les **Propriétaires** et **Locataires** reçoivent automatiquement des messages (email et/ou WhatsApp) lorsque des événements se produisent (paiement reçu, rappel de loyer, création de ticket de maintenance, rendez-vous, etc.), afin de les tenir informés sans intervention manuelle.

**Why this priority**: C’est le cœur métier du module : notifications déclenchées par les autres modules (CRM, gestion locative, maintenance, propriétés). Sans cela, le module n’apporte pas la valeur principale.

**Independent Test**: Configurer une règle pour un type d’événement (ex. rappel d’échéance de loyer), déclencher l’événement dans l’application, vérifier que le destinataire reçoit le message sur le canal configuré.

**Acceptance Scenarios**:

1. **Given** une règle de notification active pour « rappel d’échéance de loyer » vers les locataires par email, **When** l’échéance approche (selon la règle), **Then** le locataire concerné reçoit un email avec le contenu défini par le template.
2. **Given** une règle active pour « paiement reçu » par email et WhatsApp, **When** un paiement est enregistré, **Then** le locataire et le propriétaire reçoivent les deux types de messages selon les templates configurés.
3. **Given** un événement déclencheur (ex. ticket de maintenance créé), **When** les règles sont évaluées, **Then** seuls les destinataires dont les préférences autorisent ce type de notification reçoivent le message.

---

### User Story 2 - Gestion des templates et des règles par l’Agence (Priority: P2)

En tant qu’**Agence**, je veux créer et modifier des **templates** de messages (sujet, corps, variables) et des **règles de notification** (quel événement, quels destinataires, quel canal, quel template), afin d’adapter le contenu et le comportement des envois à ma marque et à mes processus.

**Why this priority**: Sans templates et règles configurables, les notifications seraient figées ; l’agence doit pouvoir personnaliser les textes et choisir quand et à qui envoyer.

**Independent Test**: Créer un nouveau template avec variables, créer une règle qui l’utilise pour un événement donné, déclencher l’événement et vérifier que le message reçu correspond au template.

**Acceptance Scenarios**:

1. **Given** un accès Agence, **When** je crée un template (nom, type annonce/alerte/notification, canal email ou WhatsApp, corps avec variables), **Then** le template est enregistré et réutilisable dans les règles.
2. **Given** des templates existants, **When** je crée une règle (événement, types de destinataires, templates email/WhatsApp, option copie agence), **Then** la règle est enregistrée et s’applique aux prochains déclenchements.
3. **Given** une règle existante, **When** je la désactive ou la modifie, **Then** les prochains événements respectent la nouvelle configuration (désactivation ou nouveaux templates/destinataires).

---

### User Story 3 - Historique et statut des communications (Priority: P2)

En tant qu’**Agence**, je veux consulter l’**historique des communications** (envoyées, planifiées, en échec) avec filtres (type, canal, statut, période, destinataire) et voir le **statut** de chaque message (envoyé, délivré, lu si disponible), afin de contrôler la livraison et traiter les échecs.

**Why this priority**: Indispensable pour le support et la confiance dans le module (vérifier qu’un rappel est bien parti, relancer en cas d’échec).

**Independent Test**: Envoyer ou déclencher plusieurs messages, ouvrir l’historique, filtrer par statut et par destinataire, vérifier que les statuts affichés correspondent aux envois réels.

**Acceptance Scenarios**:

1. **Given** des communications envoyées ou en file d’attente, **When** je consulte l’historique avec des filtres (type, canal, statut, date), **Then** je vois une liste paginée des messages correspondants avec statut et destinataire.
2. **Given** une communication en échec, **When** je consulte son détail, **Then** je vois la raison de l’échec et la possibilité de réessayer (si la politique le permet).
3. **Given** une communication planifiée, **When** je l’annule avant l’heure d’envoi, **Then** elle n’est pas envoyée et son statut reflète l’annulation.

---

### User Story 4 - Préférences des destinataires (Priority: P3)

En tant que **Propriétaire** ou **Locataire**, je veux définir mes **préférences de communication** : canaux autorisés (email, WhatsApp), types de messages (annonces, alertes, notifications), et éventuellement plages horaires à respecter, afin de ne recevoir que ce que j’accepte et au bon moment.

**Why this priority**: Conformité (opt-out, respect des préférences) et meilleure expérience utilisateur ; le module reste utilisable sans cela via les valeurs par défaut.

**Independent Test**: En tant que locataire ou propriétaire, modifier ses préférences (désactiver WhatsApp, désactiver les annonces), déclencher des notifications et vérifier que seuls les canaux/types autorisés sont utilisés.

**Acceptance Scenarios**:

1. **Given** un destinataire (propriétaire ou locataire), **When** il désactive un canal (ex. WhatsApp), **Then** les prochaines notifications pour ce destinataire ne sont envoyées que sur les canaux restants (ex. email uniquement).
2. **Given** des plages « quiet hours » configurées, **When** un envoi est programmé dans cette plage, **Then** le système reporte l’envoi après la fin de la plage (ou selon la règle métier définie).
3. **Given** un destinataire qui désactive certains types d’événements, **When** cet événement se déclenche, **Then** il ne reçoit pas de message pour cet événement.

---

### User Story 5 - Annonces et envois manuels (Priority: P3)

En tant qu’**Agence**, je veux envoyer des **annonces** ou messages **manuels** à un ou plusieurs destinataires (propriétaires, locataires, contacts CRM), par email et/ou WhatsApp, avec possibilité de planification, afin de communiquer des actualités, promotions ou informations ponctuelles.

**Why this priority**: Complète le dispositif (automatique + manuel) ; moins critique que les notifications automatiques.

**Independent Test**: Créer une annonce, choisir des destinataires et un canal, envoyer immédiatement ou planifier, vérifier réception et apparition dans l’historique.

**Acceptance Scenarios**:

1. **Given** un accès Agence, **When** je compose une annonce (sujet, corps, pièces jointes pour email si applicable) et je sélectionne des destinataires, **Then** je peux envoyer immédiatement ou planifier l’envoi à une date/heure.
2. **Given** une annonce planifiée, **When** l’heure d’envoi est atteinte, **Then** les destinataires reçoivent le message et l’historique affiche le statut envoyé/délivré selon les retours du fournisseur.
3. **Given** des destinataires avec préférences restrictives, **When** j’envoie une annonce, **Then** seuls les canaux autorisés par chaque destinataire sont utilisés.

---

### User Story 6 - Tableau de bord et indicateurs (Priority: P4)

En tant qu’**Agence**, je veux voir des **indicateurs** sur les communications : taux de livraison par canal, volume par type d’événement, tendances dans le temps, afin de piloter l’efficacité du module et détecter les problèmes (ex. baisse de livraison WhatsApp).

**Why this priority**: Améliore le pilotage mais le module est déjà utilisable sans analytics détaillées.

**Independent Test**: Générer des envois sur plusieurs canaux et types, consulter le tableau de bord et vérifier que les chiffres (taux de livraison, répartition par type/canal) sont cohérents.

**Acceptance Scenarios**:

1. **Given** des communications envoyées sur une période, **When** je consulte les indicateurs par canal, **Then** je vois un taux de livraison (ou équivalent) par canal (email, WhatsApp).
2. **Given** les mêmes données, **When** je consulte les indicateurs par type (annonce, alerte, notification), **Then** je vois les volumes et éventuellement les taux par type.
3. **Given** une plage de dates, **When** je consulte les tendances, **Then** je vois l’évolution des envois et des livraisons dans le temps.

---

### Edge Cases

- Que se passe-t-il si l’adresse email ou le numéro de téléphone du destinataire est invalide ou manquant ? Le système doit enregistrer l’échec, ne pas bloquer les autres envois, et permettre un retraitement ou une correction des coordonnées.
- Que se passe-t-il si le fournisseur (email ou WhatsApp) est temporairement indisponible ? Le système doit mettre la communication en échec avec possibilité de relance automatique (selon politique de nombre de tentatives et délais).
- Comment gérer les destinataires qui ont désactivé toutes les notifications pour un type d’événement ? Aucun message n’est envoyé pour ce type ; les règles qui ciblent d’autres destinataires continuent de s’exécuter.
- Que se passe-t-il en envoi groupé si un sous-ensemble de destinataires échoue ? Chaque envoi est traité indépendamment ; les succès sont enregistrés comme envoyés/délivrés, les échecs sont enregistrés avec la raison et option de relance.
- Comment respecter les contraintes des canaux (ex. templates WhatsApp pré-approuvés) ? Les annonces ou messages libres sur WhatsApp doivent utiliser des templates approuvés ou un canal qui le permet ; les messages hors template sont soit refusés soit envoyés via un canal qui l’autorise (à borner dans les règles métier).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow sending communications over at least two channels: email and WhatsApp (or equivalent messaging), with content and delivery status tracked per message.
- **FR-002**: The system MUST support three communication types: announcements (proactive informational messages), alerts (urgent messages requiring attention), and notifications (automatically triggered by business events).
- **FR-003**: The system MUST allow the Agency to define reusable message templates (subject, body, variables) per channel and to attach templates to notification rules.
- **FR-004**: The system MUST allow the Agency to define notification rules that specify: triggering event, recipient types (Agency user, Owner, Renter, CRM contact), channel(s), template(s), and optional copy-to-agency and timing (immediate or delayed).
- **FR-005**: The system MUST trigger outbound communications automatically when configured business events occur (e.g. payment received, lease reminder, ticket created, appointment reminder, document expiring), according to active rules and recipient preferences.
- **FR-006**: The system MUST store and display delivery status for each communication (e.g. queued, sent, delivered, read where available, failed) and allow filtering and consultation of communication history by type, channel, status, date, and recipient.
- **FR-007**: The system MUST allow recipients (Owners and Renters) to set communication preferences: enabled channels (email, WhatsApp), enabled message types (announcements, alerts, notifications), optional quiet hours, and optional opt-out per event type; outbound sends MUST respect these preferences.
- **FR-008**: The system MUST allow the Agency to send manual or scheduled announcements to one or multiple recipients (Owners, Renters, CRM contacts), with optional attachments for email, and MUST respect recipient preferences.
- **FR-009**: The system MUST support scheduling of communications (send at a given date/time) and cancellation of scheduled sends before their execution time.
- **FR-010**: The system MUST record failures (invalid address, provider error) with enough detail to allow retry or correction, and MUST support a configurable retry policy for failed sends without blocking other communications.
- **FR-011**: The system MUST isolate all communication data by tenant (agency); no tenant may see or trigger communications for another tenant.
- **FR-012**: The system MUST provide aggregated analytics per tenant (e.g. delivery rate by channel, volume by type, trends over time) for the Agency to monitor effectiveness.
- **FR-013**: The system MUST validate recipient contact data (email format, phone format where applicable) before send and MUST apply rate limiting or equivalent safeguards to prevent abuse (e.g. spam) on send endpoints.
- **FR-014**: The system MUST retain an audit trail of communications (who received what, when, and status) in line with data retention and privacy requirements (e.g. opt-out and deletion of recipient data when required).

### Key Entities

- **Message template**: Reusable content definition (name, type, channel, subject/body, variables). Used by notification rules and optionally by manual sends. Scoped by tenant; optional platform-level templates.
- **Notification rule**: Definition that links a business event to recipient types, channel(s), template(s), optional conditions, timing (immediate or delayed), and copy-to-agency. Evaluated when the event occurs; can be enabled/disabled.
- **Communication**: A single outbound message instance (type, channel, recipient, content, status, timestamps for sent/delivered/read/failed, optional link to source entity and template). Stored for history and analytics; isolated by tenant.
- **Communication preference**: Per-recipient settings (channels enabled, message types enabled, optional quiet hours, optional disabled event types). One logical preference set per recipient (Owner, Renter, or CRM contact) per tenant.
- **Recipient**: Represents the target of a communication; can be an Agency user, Owner, Renter, or CRM contact. Identified by a stable identifier and contact data (email, phone) used for delivery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a configured business event occurs, the intended recipients receive the corresponding message on the chosen channel(s) within the configured delay (e.g. within 2 minutes for immediate rules), subject to recipient preferences and provider availability.
- **SC-002**: Agency users can create or update a template and a rule linked to an event, and see the first notification triggered by that event delivered correctly, within one working session (e.g. under 15 minutes for a simple rule).
- **SC-003**: Agency users can filter the communication history by type, channel, status, and date and see accurate status (sent, delivered, failed) for at least 95% of recent communications, with failed items showing a reason when the provider supplies it.
- **SC-004**: Recipients who disable a channel or a message type receive no messages on that channel or for that type; 100% of outbound sends respect the stored preferences for the recipient.
- **SC-005**: In case of provider failure or invalid address, the system records the failure and allows retry or correction without affecting other queued or concurrent sends; delivery rate (successful sends / attempted sends) is measurable per channel and per tenant.
- **SC-006**: Aggregated analytics (delivery rate by channel, volume by type, trends) are available to the Agency and reflect the actual communication data for the selected period and tenant.
- **SC-007**: No tenant can access or trigger communications for another tenant; all data and actions are isolated by tenant.
