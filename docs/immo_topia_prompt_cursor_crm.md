# Prompt Cursor AI — ImmoTopia (Tenants + Utilisateurs + RBAC + Abonnements)

You are Cursor AI working inside the existing ImmoTopia codebase. Basic authentication already exists (email + Google). Now implement the missing functional modules for: (1) Central Admin tenant management, (2) Tenant-level user management, and (3) Hierarchical roles/permissions in a SaaS multi-tenant architecture, as specified in the requirements: authentication + multi-roles + multi-tenant SaaS; tenant creation/configuration; module activation per tenant (agence/syndic/promoteur); SaaS subscriptions & invoicing; global tenant statistics; creation/management of tenant collaborators.

Work step-by-step, implement, and keep changes consistent with the current app behavior.



#  CRM & Relation Client (Prospects/Clients + Interactions + Matching + IA)

## Objectif du module
Permettre à chaque **tenant** (agence/syndic/promoteur) de :
- Centraliser ses **prospects** et **clients**
- Organiser le **pipeline commercial** (démarchage → rendez-vous → qualification → offre → signature)
- Tracer toutes les **interactions** (appels, emails, visites, WhatsApp, notes)
- Relier une personne à un **projet** (achat / location) et/ou à des **biens** (du tenant ou de clients/propriétaires)
- Convertir un prospect en **client** (propriétaire, locataire, copropriétaire, acquéreur)
- Proposer du **matching automatique** et des **recommandations IA** (ex : meilleurs biens, prochains actions, probabilité de conversion)

> Contrainte clé: **multi-tenant strict** (toutes les données CRM sont isolées par tenant).

---

## A) Concepts fonctionnels (modèle mental)

### 1) Personne (Contact)
Une **Personne** est l’entité de base. Elle peut porter plusieurs “casquettes” (rôles métier) au fil du temps.
- Exemples: un même contact peut être **Prospect** aujourd’hui, puis **Acquéreur** demain, puis **Propriétaire** après achat.

### 2) Prospect (Lead) vs Client
- **Prospect (Lead):** contact non converti, en cours de démarchage/qualification.
- **Client:** contact converti (avec au moins un rôle métier actif: propriétaire/locataire/copropriétaire/acquéreur).

### 3) Opportunité (Deal)
Une opportunité représente un **besoin/projet** concret.
- Types: **ACHAT** ou **LOCATION**
- Peut cibler:
  - un ou plusieurs biens (shortlist)
  - une zone, un budget, des critères
- Porte un **statut** (pipeline) et une **valeur** estimée (commission attendue, montant loyer, etc.).

### 4) Interactions (Activités)
Tout échange/action est une activité rattachée à un contact et/ou une opportunité.
- Appels, emails, SMS/WhatsApp, réunions, visites, notes, tâches de relance
- Peut avoir un **résultat** (no answer, intéressé, rendez-vous fixé, etc.)
- Peut générer une **prochaine action** (task) avec date/heure.

### 5) Matching Client ↔ Biens
Le matching prend une opportunité (besoin) + critères et génère:
- une liste de biens pertinents (score)
- des recommandations d’actions (contacter, proposer visite, relancer)

---

## B) Parcours utilisateur (UX cible)

### 1) CRM Dashboard (Tenant)
- KPI rapides: nouveaux leads (7j), leads chauds, RDV à venir, deals en négociation
- “Next best actions”: relances dues aujourd’hui, visites à confirmer

### 2) Contacts
- Liste contacts (prospects + clients) avec filtres: statut, source, tags, assigné, dernière interaction
- Fiche contact: identité, rôles, historique interactions, opportunités, biens associés

### 3) Pipeline (Deals)
- Vue Kanban (stages): Nouveau → Qualifié → RDV → Visite → Négociation → Gagné/Perdu
- Vue liste avec filtres et tri
- Détail deal: besoin, budget, zone, critères, shortlist biens + notes + activités

### 4) Agenda & Tâches
- RDV/visites planifiés par agent
- Tâches de relance (SLA)
- Notifications (email/in-app) optionnelles

### 5) Matching
- Bouton “Matcher” dans une opportunité
- Génère un ranking de biens + explications (critères matchés)
- Actions rapides: envoyer sélection, planifier visite, créer relance

---

## C) Règles métier clés (foundation du module)

1) **Un tenant a des prospects**
- Chaque lead/contact est créé dans le périmètre du tenant.

2) **Démarchage et suivi**
- Toutes les actions (appels, emails, visites) doivent être historisées.
- Un lead peut être assigné à un collaborateur (agent).

3) **Achat et location**
- Une opportunité a un type (achat/location) et des critères.
- Les biens proposés peuvent appartenir:
  - au tenant (portefeuille)
  - à des clients (ex: propriétaires mandatés)

4) **Conversion vers rôles clients**
- Quand un prospect “convertit”, il devient un contact avec rôles: propriétaire/locataire/copropriétaire/acquéreur.
- Conserver l’historique (ne pas dupliquer la personne).

5) **Interdiction de fuite inter-tenant**
- Toute lecture/écriture CRM doit vérifier tenantId.

---

## D) Schéma de données proposé (CRM)

> Adapter aux tables existantes (users, tenants, properties/listings…). Préférer des tables CRM dédiées.

### 1) crm_contacts
- id
- tenant_id
- first_name, last_name
- email (nullable), phone (nullable)
- source (enum/string: referral, website, call, social, walk-in…)
- status (enum: lead, active_client, archived)
- tags (array ou table)
- assigned_to_user_id (nullable)
- last_interaction_at (nullable)
- created_at, updated_at

### 2) crm_contact_roles (multi-rôle)
- id
- tenant_id
- contact_id
- role (enum: PROPRIETAIRE, LOCATAIRE, COPROPRIETAIRE, ACQUEREUR)
- active (bool)
- started_at, ended_at (nullable)
- metadata_json (nullable)

### 3) crm_leads (optionnel si vous distinguez fortement “lead”) 
(Si vous gardez tout dans crm_contacts avec status=lead, cette table peut être inutile.)
- id
- tenant_id
- contact_id
- lead_score (0-100)
- temperature (cold/warm/hot)
- qualification_notes
- created_at, updated_at

### 4) crm_deals (opportunités)
- id
- tenant_id
- contact_id
- type (enum: ACHAT, LOCATION)
- stage (enum: NEW, QUALIFIED, APPOINTMENT, VISIT, NEGOTIATION, WON, LOST)
- budget_min, budget_max
- location_zone (text) + geo (optional)
- criteria_json (rooms, surface, furnishing, etc.)
- expected_value (nullable)
- probability (0-1, nullable)
- assigned_to_user_id (nullable)
- closed_reason (nullable)
- closed_at (nullable)
- created_at, updated_at

### 5) crm_activities (interactions)
- id
- tenant_id
- contact_id (nullable)
- deal_id (nullable)
- activity_type (CALL, EMAIL, VISIT, MEETING, NOTE, WHATSAPP, SMS, TASK)
- direction (IN, OUT, INTERNAL)
- subject (nullable)
- content (text/markdown)
- outcome (nullable)
- occurred_at
- created_by_user_id
- next_action_at (nullable)
- next_action_type (nullable)
- created_at

### 6) crm_appointments (rendez-vous / visites)
- id
- tenant_id
- deal_id (nullable)
- contact_id
- appointment_type (RDV, VISITE)
- start_at, end_at
- location (nullable)
- status (SCHEDULED, CONFIRMED, DONE, NO_SHOW, CANCELED)
- created_by_user_id
- assigned_to_user_id (nullable)

### 7) crm_deal_properties (shortlist biens)
- id
- tenant_id
- deal_id
- property_id (FK vers votre table biens)
- source_owner_contact_id (nullable)  // si le bien appartient à un client
- match_score (0-100, nullable)
- match_explanation_json (nullable)
- status (SHORTLISTED, PROPOSED, VISITED, REJECTED, SELECTED)
- created_at

### 8) crm_notes (optionnel si vous préférez séparer des notes)
- id
- tenant_id
- entity_type (CONTACT/DEAL/PROPERTY)
- entity_id
- content
- created_by_user_id
- created_at

### 9) crm_tags (si pas d’array)
- crm_tags(id, tenant_id, name)
- crm_contact_tags(contact_id, tag_id)

---

## E) API/Routes fonctionnelles (CRM)

### Contacts
- GET /tenants/:tenantId/crm/contacts
- POST /tenants/:tenantId/crm/contacts
- GET /tenants/:tenantId/crm/contacts/:contactId
- PATCH /tenants/:tenantId/crm/contacts/:contactId
- POST /tenants/:tenantId/crm/contacts/:contactId/convert  (active roles + status=client)

### Deals (Opportunités)
- GET /tenants/:tenantId/crm/deals
- POST /tenants/:tenantId/crm/deals
- GET /tenants/:tenantId/crm/deals/:dealId
- PATCH /tenants/:tenantId/crm/deals/:dealId (stage, budget, criteria…)

### Activities
- GET /tenants/:tenantId/crm/activities?contactId=&dealId=
- POST /tenants/:tenantId/crm/activities

### Appointments
- GET /tenants/:tenantId/crm/appointments
- POST /tenants/:tenantId/crm/appointments
- PATCH /tenants/:tenantId/crm/appointments/:id (confirm/cancel/done)

### Matching
- POST /tenants/:tenantId/crm/deals/:dealId/match
- GET /tenants/:tenantId/crm/deals/:dealId/matches
- POST /tenants/:tenantId/crm/deals/:dealId/properties/:propertyId/status

---

## F) Matching automatique (v1 réaliste + IA ensuite)

### V1 (sans IA, scoring déterministe)
1) Extraire les critères du deal (budget, zone, pièces, surface, type, meublé…)
2) Filtrer les biens disponibles
3) Calculer un **match_score**:
- Budget fit (0-30)
- Zone fit (0-25)
- Pièces/surface (0-25)
- Extras (0-20)
4) Stocker résultat dans crm_deal_properties (score + explications)

### V2 (IA assistée)
- IA pour:
  - Reformuler/normaliser les besoins (texte → critères)
  - Prioriser les critères (importance)
  - Générer un résumé “pour l’agent” (argumentaire)
  - “Next best action” (relance, message type, probabilité)

**Important:** garder un mode explicable (raison du score) pour confiance utilisateur.

---

## G) Recommandations IA (use cases)

1) **Lead scoring**
- Score basé sur:
  - source
  - budget renseigné
  - réactivité
  - nombre d’échanges
  - visites effectuées

2) **Next Best Action**
- Suggestions: relancer X, proposer visite Y, demander pièces Z

3) **Matching enrichi**
- Classement de biens + message prêt à envoyer au client

---

## H) Permissions (RBAC) pour CRM
Créer permissions tenant-scoped:
- CRM_CONTACTS_VIEW / CREATE / EDIT / ARCHIVE
- CRM_DEALS_VIEW / CREATE / EDIT / STAGE_CHANGE
- CRM_ACTIVITIES_VIEW / CREATE
- CRM_APPOINTMENTS_VIEW / CREATE / EDIT
- CRM_MATCHING_RUN / CRM_MATCHING_VIEW

---

## I) Deliverables CRM (à livrer dans le repo)

1) Migrations DB pour tables CRM
2) Écrans:
- CRM Dashboard
- Contacts (list + fiche)
- Deals Pipeline (kanban + détail)
- Activités + RDV/Visites
- Matching (liste classée + actions rapides)
3) Services:
- Tenant isolation + RBAC guards appliqués
- Matching v1 (scoring déterministe)
- Hooks pour IA v2 (sans bloquer la prod)
4) Tests/checklist:
- Isolation tenant
- Permissions CRM
- Conversion lead → client
- Historique activités immuable
- Matching: cohérence des scores

