# ImmoTopia — Fonctionnalités, schéma et endpoints

> Recensement antérieur, non maintenu. L'inventaire de référence, tenu à
> jour à partir du code, est
> [`docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`](../fonctionnalites/README.md)
> (miroir texte `docs/fonctionnalites/sous-fonctionnalites.md`).

**Version** : 1.0  
**Dernière mise à jour** : 2025-02-02

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Fonctionnalités par module](#2-fonctionnalités-par-module)
3. [Schéma de base de données](#3-schéma-de-base-de-données)
4. [Endpoints API](#4-endpoints-api)
5. [Références](#5-références)

---

## 1. Vue d'ensemble

**ImmoTopia** est une plateforme de gestion immobilière **multi-tenant** (Node.js/TypeScript backend, React/TypeScript frontend). Elle couvre :

- Authentification et profils utilisateurs
- Multi-tenant et RBAC (rôles et permissions)
- CRM (contacts, deals, activités, rendez-vous)
- Gestion des biens (propriétés, médias, documents, visites, mandats)
- Géographie (pays, régions, communes)
- Gestion locative (baux, échéances, paiements, pénalités, cautions, documents)
- Maintenance et incidents
- Portails locataire et propriétaire
- Abonnements et facturation
- Audit et logs

**Caractéristiques techniques** : isolation des données par tenant, RBAC (rôles PLATFORM et TENANT), JWT + OAuth Google, validation Zod, PostgreSQL + Prisma.

---

## 2. Fonctionnalités par module

### 2.1 Authentification et utilisateurs

| Fonctionnalité                | Description                                    |
| ----------------------------- | ---------------------------------------------- |
| Inscription                   | Création de compte avec validation d’email     |
| Connexion                     | Email/mot de passe + OAuth Google              |
| JWT                           | Access token (15 min), refresh token (7 jours) |
| Vérification email            | Tokens expirables                              |
| Réinitialisation mot de passe | Flux complet                                   |
| Profil                        | GET/PATCH du profil utilisateur                |

### 2.2 Multi-tenant et RBAC

| Fonctionnalité | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| Tenants        | CRUD, statut (PENDING, ACTIVE, SUSPENDED), type (AGENCY, OPERATOR)       |
| Isolation      | Données scopées par `tenant_id`                                          |
| Rôles          | PLATFORM (super admin) et TENANT (par organisation)                      |
| Permissions    | Permissions granulaires par rôle                                         |
| Memberships    | Lien user ↔ tenant, statut (PENDING_INVITE, ACTIVE, DISABLED)            |
| Invitations    | Token sécurisé, acceptation, révocation                                  |
| Modules tenant | MODULE_AGENCY, MODULE_SYNDIC, MODULE_PROMOTER (activation/désactivation) |

### 2.3 CRM

| Fonctionnalité | Description                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------- |
| Contacts       | CRUD, statuts LEAD / ACTIVE_CLIENT / ARCHIVED, tags, rôles (PROPRIETAIRE, LOCATAIRE, etc.)    |
| Deals          | Pipeline NEW → QUALIFIED → APPOINTMENT → VISIT → NEGOTIATION → WON/LOST, types ACHAT/LOCATION |
| Activités      | CALL, EMAIL, SMS, WHATSAPP, VISIT, MEETING, NOTE, TASK, CORRECTION                            |
| Rendez-vous    | RDV/VISITE, statuts SCHEDULED → CONFIRMED → DONE / NO_SHOW / CANCELED, collaborateurs         |
| Tags           | Tags colorés par tenant                                                                       |
| Notes          | Notes sur CONTACT, DEAL, PROPERTY                                                             |
| Matching       | Propriétés proposées pour un deal (shortlist, statuts)                                        |
| Dashboard      | Statistiques et indicateurs CRM                                                               |

### 2.4 Propriétés

| Fonctionnalité     | Description                                                                      |
| ------------------ | -------------------------------------------------------------------------------- |
| CRUD propriétés    | 12 types (APPARTEMENT, MAISON_VILLA, STUDIO, etc.), modes SALE/RENTAL/SHORT_TERM |
| Templates          | Templates par type de bien (champs, sections, validation)                        |
| Médias             | PHOTO, VIDEO, TOUR_360, ordre, média principal                                   |
| Documents          | TITLE_DEED, MANDATE, PLAN, TAX_DOCUMENT, OTHER, expiration, alerte               |
| Statuts            | DRAFT → UNDER_REVIEW → AVAILABLE → RESERVED/UNDER_OFFER → RENTED/SOLD → ARCHIVED |
| Historique statuts | Traçabilité des changements                                                      |
| Visites            | Planification, type (VISIT, APPOINTMENT), objectif, statut, collaborateurs       |
| Mandats            | Dates, périmètre, révocation                                                     |
| Score de qualité   | Calcul et suggestions                                                            |
| Publication        | is_published, API publique                                                       |

### 2.5 Géographie

| Fonctionnalité | Description                                    |
| -------------- | ---------------------------------------------- |
| Pays           | Code ISO, nom, nom_fr                          |
| Régions        | Par pays, capital                              |
| Communes       | Par région                                     |
| Recherche      | Recherche de localités (commune, région, pays) |

### 2.6 Gestion locative

| Fonctionnalité | Description                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Baux           | Création, co-locataires, fréquence (MONTHLY, QUARTERLY, SEMIANNUAL, ANNUAL), statuts DRAFT → ACTIVE → SUSPENDED → ENDED → CANCELED |
| Échéances      | Génération selon fréquence, statuts DRAFT → DUE → PARTIAL → PAID → OVERDUE → CANCELED                                              |
| Paiements      | CASH, BANK_TRANSFER, CHECK, MOBILE_MONEY, CARD, allocation prioritaire, idempotence                                                |
| Pénalités      | FIXED_AMOUNT, PERCENT_OF_RENT, PERCENT_OF_BALANCE, calcul auto, période de grâce                                                   |
| Cautions       | COLLECT, HOLD, RELEASE, REFUND, FORFEIT, ADJUSTMENT                                                                                |
| Documents      | Contrat de bail, avenant, reçu, quittance, relevé ; templates par tenant ; numérotation (ex. 2025-001)                             |

### 2.7 Maintenance et incidents

| Fonctionnalité | Description                                                           |
| -------------- | --------------------------------------------------------------------- |
| Tickets        | Création, statuts, priorité, catégorie (plomberie, électricité, etc.) |
| Pièces jointes | Fichiers sur les tickets                                              |
| Commentaires   | Fil de discussion                                                     |
| Prestataires   | Liste et affectation                                                  |

### 2.8 Portails

| Fonctionnalité       | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| Portail locataire    | Vue locataire (baux, échéances, paiements, documents, maintenance) |
| Portail propriétaire | Vue propriétaire (biens, mandats, revenus, documents)              |

### 2.9 Abonnements et facturation

| Fonctionnalité     | Description                                                 |
| ------------------ | ----------------------------------------------------------- |
| Plans              | BASIC, PRO, ELITE                                           |
| Cycles             | MONTHLY, ANNUAL                                             |
| Statuts abonnement | TRIALING, ACTIVE, PAST_DUE, CANCELED, SUSPENDED             |
| Factures           | Numéro, dates, montant, statuts (DRAFT, ISSUED, PAID, etc.) |

### 2.10 Audit et sécurité

| Fonctionnalité | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| Audit logs     | Action, entité, acteur, tenant, IP, user agent, payload                     |
| Sécurité       | Rate limiting, Helmet, CORS, validation Zod, bcrypt, isolation tenant, RBAC |

---

## 3. Schéma de base de données

**Total : 39 tables** (détail complet dans `database-schema.md`).

### 3.1 Groupes de tables

| Domaine                 | Tables principales                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth / Utilisateurs** | `users`, `refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`                                                                                                                                                                                                                                   |
| **Multi-tenant**        | `tenants`, `tenant_modules`, `tenant_clients`, `memberships`, `invitations`                                                                                                                                                                                                                                       |
| **RBAC**                | `roles`, `permissions`, `role_permissions`, `user_roles`                                                                                                                                                                                                                                                          |
| **CRM**                 | `crm_contacts`, `crm_contact_roles`, `crm_contact_tags`, `crm_deals`, `crm_deal_properties`, `crm_activities`, `crm_appointments`, `crm_appointment_collaborators`, `crm_notes`, `crm_tags`                                                                                                                       |
| **Propriétés**          | `properties`, `property_type_templates`, `property_media`, `property_documents`, `property_status_history`, `property_visits`, `property_visit_collaborators`, `property_mandates`, `property_quality_scores`                                                                                                     |
| **Géographie**          | `countries`, `regions`, `communes`                                                                                                                                                                                                                                                                                |
| **Gestion locative**    | `rental_leases`, `rental_lease_co_renters`, `rental_installments`, `rental_installment_items`, `rental_payments`, `rental_payment_allocations`, `rental_penalties`, `rental_penalty_rules`, `rental_security_deposits`, `rental_deposit_movements`, `rental_documents`, `document_templates`, `document_counters` |
| **Maintenance**         | `maintenance_tickets`, `maintenance_ticket_attachments`, `maintenance_ticket_comments`, `maintenance_vendors`                                                                                                                                                                                                     |
| **Facturation**         | `subscriptions`, `invoices`                                                                                                                                                                                                                                                                                       |
| **Audit**               | `audit_logs`                                                                                                                                                                                                                                                                                                      |

### 3.2 Entités centrales (résumé)

- **users** : email, password_hash, google_id, full_name, avatar_url, global_role (SUPER_ADMIN, USER), email_verified, is_active.
- **tenants** : name, slug, type (AGENCY, OPERATOR), status (PENDING, ACTIVE, SUSPENDED), branding, subdomain, custom_domain.
- **properties** : internal_reference, property_type, ownership_type (TENANT, PUBLIC, CLIENT), transaction_modes[], price, surface_*, rooms, status, is_published, type_specific_data (JSON).
- **crm_contacts** : first_name, last_name, email, phone, status (LEAD, ACTIVE_CLIENT, ARCHIVED), assigned_to_user_id.
- **crm_deals** : contact_id, type (ACHAT, LOCATION), stage (NEW → WON/LOST), budget_min/max, criteria_json.
- **rental_leases** : property_id, primary_renter (tenant_client), billing_frequency, status (DRAFT, ACTIVE, …).

### 3.3 Enums principaux

| Domaine     | Enums (valeurs clés)                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth        | GlobalRole: SUPER_ADMIN, USER                                                                                                                                     |
| Tenant      | TenantType: AGENCY, OPERATOR ; TenantStatus: PENDING, ACTIVE, SUSPENDED ; ModuleKey: MODULE_AGENCY, MODULE_SYNDIC, MODULE_PROMOTER                                |
| CRM         | CrmContactStatus: LEAD, ACTIVE_CLIENT, ARCHIVED ; CrmDealStage: NEW, QUALIFIED, APPOINTMENT, VISIT, NEGOTIATION, WON, LOST ; CrmActivityType: CALL, EMAIL, SMS, … |
| Propriétés  | PropertyType: APPARTEMENT, MAISON_VILLA, STUDIO, … ; PropertyStatus: DRAFT, UNDER_REVIEW, AVAILABLE, …                                                            |
| Location    | RentalLeaseStatus: DRAFT, ACTIVE, SUSPENDED, ENDED, CANCELED ; RentalInstallmentStatus: DRAFT, DUE, PARTIAL, PAID, OVERDUE                                        |
| Facturation | SubscriptionPlan: BASIC, PRO, ELITE ; SubscriptionStatus: TRIALING, ACTIVE, PAST_DUE, CANCELED, SUSPENDED                                                         |

Pour les colonnes, index et contraintes de chaque table, voir **`database-schema.md`**.

---

## 4. Endpoints API

**Base URL** : `http://localhost:5000/api` (dev) ou `https://api.immotopia.com/api` (prod).  
Authentification : `Authorization: Bearer <token>` sauf pour les routes indiquées comme **Public**.

---

### 4.1 Authentification — `/api/auth`

| Méthode | Endpoint                        | Description                           | Auth   |
| ------- | ------------------------------- | ------------------------------------- | ------ |
| POST    | `/api/auth/register`            | Inscription                           | Public |
| POST    | `/api/auth/login`               | Connexion email/mot de passe          | Public |
| POST    | `/api/auth/google`              | Connexion Google OAuth                | Public |
| POST    | `/api/auth/refresh`             | Rafraîchir l’access token             | Public |
| POST    | `/api/auth/logout`              | Déconnexion                           | Requis |
| POST    | `/api/auth/forgot-password`     | Demande réinitialisation mot de passe | Public |
| POST    | `/api/auth/reset-password`      | Réinitialisation mot de passe         | Public |
| POST    | `/api/auth/verify-email`        | Vérification email                    | Public |
| POST    | `/api/auth/resend-verification` | Renvoyer email de vérification        | Public |
| GET     | `/api/auth/me`                  | Profil utilisateur courant            | Requis |
| PATCH   | `/api/auth/profile`             | Mise à jour du profil                 | Requis |

---

### 4.2 Tenants — `/api/tenants`

| Méthode | Endpoint                              | Description               | Auth   |
| ------- | ------------------------------------- | ------------------------- | ------ |
| GET     | `/api/tenants`                        | Liste des tenants (admin) | Requis |
| POST    | `/api/tenants`                        | Créer un tenant           | Requis |
| GET     | `/api/tenants/:id`                    | Détail d’un tenant        | Requis |
| PATCH   | `/api/tenants/:id`                    | Mettre à jour un tenant   | Requis |
| PATCH   | `/api/tenants/:id/status`             | Changer le statut         | Requis |
| GET     | `/api/tenants/:id/modules`            | Modules activés           | Requis |
| POST    | `/api/tenants/:id/modules`            | Activer un module         | Requis |
| DELETE  | `/api/tenants/:id/modules/:moduleKey` | Désactiver un module      | Requis |

---

### 4.3 Membres et invitations

**Membres** — `/api/memberships`

| Méthode | Endpoint                      | Description         | Auth   |
| ------- | ----------------------------- | ------------------- | ------ |
| GET     | `/api/memberships`            | Liste des membres   | Requis |
| GET     | `/api/memberships/:id`        | Détail d’un membre  | Requis |
| PATCH   | `/api/memberships/:id/status` | Changer le statut   | Requis |
| DELETE  | `/api/memberships/:id`        | Supprimer un membre | Requis |

**Invitations** — `/api/invitations`

| Méthode | Endpoint                         | Description                         | Auth   |
| ------- | -------------------------------- | ----------------------------------- | ------ |
| POST    | `/api/invitations`               | Créer une invitation                | Requis |
| GET     | `/api/invitations/:token`        | Détail d’une invitation (par token) | Public |
| POST    | `/api/invitations/:token/accept` | Accepter une invitation             | Public |
| DELETE  | `/api/invitations/:id`           | Révoquer une invitation             | Requis |

---

### 4.4 Rôles et permissions — `/api/roles`, `/api/permissions`, `/api/user-roles`

| Méthode | Endpoint              | Description                        | Auth   |
| ------- | --------------------- | ---------------------------------- | ------ |
| GET     | `/api/roles`          | Liste des rôles                    | Requis |
| GET     | `/api/roles/:id`      | Détail d’un rôle                   | Requis |
| GET     | `/api/permissions`    | Liste des permissions              | Requis |
| POST    | `/api/user-roles`     | Attribuer un rôle à un utilisateur | Requis |
| DELETE  | `/api/user-roles/:id` | Retirer un rôle                    | Requis |

---

### 4.5 CRM — `/api/tenants/:tenantId/crm`

**Contacts**

| Méthode | Endpoint                           | Description              | Auth   |
| ------- | ---------------------------------- | ------------------------ | ------ |
| GET     | `.../crm/contacts`                 | Liste des contacts       | Requis |
| POST    | `.../crm/contacts`                 | Créer un contact         | Requis |
| GET     | `.../crm/contacts/:id`             | Détail d’un contact      | Requis |
| PATCH   | `.../crm/contacts/:id`             | Mettre à jour un contact | Requis |
| DELETE  | `.../crm/contacts/:id`             | Supprimer un contact     | Requis |
| POST    | `.../crm/contacts/:id/convert`     | Convertir en client      | Requis |
| POST    | `.../crm/contacts/:id/tags`        | Ajouter un tag           | Requis |
| DELETE  | `.../crm/contacts/:id/tags/:tagId` | Retirer un tag           | Requis |

**Deals**

| Méthode | Endpoint                                   | Description                   | Auth   |
| ------- | ------------------------------------------ | ----------------------------- | ------ |
| GET     | `.../crm/deals`                            | Liste des deals               | Requis |
| POST    | `.../crm/deals`                            | Créer un deal                 | Requis |
| GET     | `.../crm/deals/:id`                        | Détail d’un deal              | Requis |
| PATCH   | `.../crm/deals/:id`                        | Mettre à jour un deal         | Requis |
| PATCH   | `.../crm/deals/:id/stage`                  | Changer le stage              | Requis |
| POST    | `.../crm/deals/:id/properties`             | Ajouter une propriété au deal | Requis |
| DELETE  | `.../crm/deals/:id/properties/:propertyId` | Retirer une propriété         | Requis |

**Activités**

| Méthode | Endpoint                 | Description                | Auth   |
| ------- | ------------------------ | -------------------------- | ------ |
| GET     | `.../crm/activities`     | Liste des activités        | Requis |
| POST    | `.../crm/activities`     | Créer une activité         | Requis |
| GET     | `.../crm/activities/:id` | Détail d’une activité      | Requis |
| PATCH   | `.../crm/activities/:id` | Mettre à jour une activité | Requis |

**Rendez-vous**

| Méthode | Endpoint                                 | Description                  | Auth   |
| ------- | ---------------------------------------- | ---------------------------- | ------ |
| GET     | `.../crm/appointments`                   | Liste des rendez-vous        | Requis |
| POST    | `.../crm/appointments`                   | Créer un rendez-vous         | Requis |
| GET     | `.../crm/appointments/:id`               | Détail d’un rendez-vous      | Requis |
| PATCH   | `.../crm/appointments/:id`               | Mettre à jour un rendez-vous | Requis |
| POST    | `.../crm/appointments/:id/collaborators` | Ajouter un collaborateur     | Requis |

**Tags**

| Méthode | Endpoint           | Description          | Auth   |
| ------- | ------------------ | -------------------- | ------ |
| GET     | `.../crm/tags`     | Liste des tags       | Requis |
| POST    | `.../crm/tags`     | Créer un tag         | Requis |
| PATCH   | `.../crm/tags/:id` | Mettre à jour un tag | Requis |
| DELETE  | `.../crm/tags/:id` | Supprimer un tag     | Requis |

---

### 4.6 Propriétés — `/api/properties`

| Méthode | Endpoint                             | Description                                | Auth   |
| ------- | ------------------------------------ | ------------------------------------------ | ------ |
| GET     | `/api/properties`                    | Liste des propriétés (filtres, pagination) | Requis |
| POST    | `/api/properties`                    | Créer une propriété                        | Requis |
| GET     | `/api/properties/:id`                | Détail d’une propriété                     | Requis |
| PATCH   | `/api/properties/:id`                | Mettre à jour une propriété                | Requis |
| DELETE  | `/api/properties/:id`                | Supprimer une propriété                    | Requis |
| PATCH   | `/api/properties/:id/status`         | Changer le statut                          | Requis |
| POST    | `/api/properties/:id/media`          | Ajouter un média                           | Requis |
| DELETE  | `/api/properties/:id/media/:mediaId` | Supprimer un média                         | Requis |
| POST    | `/api/properties/:id/documents`      | Ajouter un document                        | Requis |
| GET     | `/api/properties/:id/visits`         | Liste des visites                          | Requis |
| POST    | `/api/properties/:id/visits`         | Créer une visite                           | Requis |
| POST    | `/api/properties/:id/mandates`       | Créer un mandat                            | Requis |
| GET     | `/api/properties/:id/quality-score`  | Score de qualité                           | Requis |

**Propriétés publiques** — `/api/public/properties`

| Méthode | Endpoint                     | Description                    | Auth   |
| ------- | ---------------------------- | ------------------------------ | ------ |
| GET     | `/api/public/properties`     | Liste des propriétés publiées  | Public |
| GET     | `/api/public/properties/:id` | Détail d’une propriété publiée | Public |

---

### 4.7 Géographie — `/api/geographic`

| Méthode | Endpoint                                         | Description                         | Auth   |
| ------- | ------------------------------------------------ | ----------------------------------- | ------ |
| GET     | `/api/geographic/search?q=...&limit=...`         | Recherche de localisations          | Public |
| GET     | `/api/geographic/communes`                       | Liste des communes                  | Public |
| GET     | `/api/geographic/countries/:countryCode/regions` | Régions d’un pays                   | Public |
| GET     | `/api/geographic/regions/:regionId/communes`     | Communes d’une région               | Public |
| GET     | `/api/geographic/locations/:communeId`           | Détail d’une localisation (commune) | Public |

---

### 4.8 Gestion locative — `/api/tenants/:tenantId/rental`

**Baux (leases)**

| Méthode | Endpoint                                       | Description             | Auth   |
| ------- | ---------------------------------------------- | ----------------------- | ------ |
| GET     | `.../rental/leases`                            | Liste des baux          | Requis |
| POST    | `.../rental/leases`                            | Créer un bail           | Requis |
| GET     | `.../rental/leases/:id`                        | Détail d’un bail        | Requis |
| PATCH   | `.../rental/leases/:id`                        | Mettre à jour un bail   | Requis |
| PATCH   | `.../rental/leases/:id/status`                 | Changer le statut       | Requis |
| POST    | `.../rental/leases/:id/co-renters`             | Ajouter un co-locataire | Requis |
| DELETE  | `.../rental/leases/:id/co-renters/:coRenterId` | Retirer un co-locataire | Requis |
| GET     | `.../rental/leases/:id/co-renters`             | Liste des co-locataires | Requis |

**Échéances (installments)**

| Méthode | Endpoint                                         | Description              | Auth   |
| ------- | ------------------------------------------------ | ------------------------ | ------ |
| GET     | `.../rental/leases/:id/installments`             | Liste des échéances      | Requis |
| POST    | `.../rental/leases/:id/installments`             | Générer les échéances    | Requis |
| POST    | `.../rental/leases/:id/installments/recalculate` | Recalculer les échéances | Requis |

**Paiements**

| Méthode | Endpoint                           | Description             | Auth   |
| ------- | ---------------------------------- | ----------------------- | ------ |
| GET     | `.../rental/payments`              | Liste des paiements     | Requis |
| POST    | `.../rental/payments`              | Enregistrer un paiement | Requis |
| GET     | `.../rental/payments/:id`          | Détail d’un paiement    | Requis |
| PATCH   | `.../rental/payments/:id/status`   | Changer le statut       | Requis |
| POST    | `.../rental/payments/:id/allocate` | Allouer un paiement     | Requis |

**Pénalités**

| Méthode | Endpoint                         | Description                    | Auth   |
| ------- | -------------------------------- | ------------------------------ | ------ |
| GET     | `.../rental/penalties`           | Liste des pénalités            | Requis |
| POST    | `.../rental/penalties/calculate` | Lancer le calcul des pénalités | Requis |
| PATCH   | `.../rental/penalties/:id`       | Ajuster une pénalité           | Requis |

**Cautions (deposits)**

| Méthode | Endpoint                            | Description                    | Auth   |
| ------- | ----------------------------------- | ------------------------------ | ------ |
| GET     | `.../rental/leases/:id/deposit`     | Détail de la caution d’un bail | Requis |
| POST    | `.../rental/leases/:id/deposit`     | Créer une caution              | Requis |
| GET     | `.../rental/deposits/:id/movements` | Mouvements d’une caution       | Requis |
| POST    | `.../rental/deposits/:id/movements` | Créer un mouvement             | Requis |

**Documents**

| Méthode | Endpoint                   | Description               | Auth   |
| ------- | -------------------------- | ------------------------- | ------ |
| GET     | `.../rental/documents`     | Liste des documents       | Requis |
| POST    | `.../rental/documents`     | Générer un document       | Requis |
| GET     | `.../rental/documents/:id` | Détail d’un document      | Requis |
| PATCH   | `.../rental/documents/:id` | Mettre à jour un document | Requis |

---

### 4.9 Maintenance — `/api/tenants/:tenantId/maintenance`

| Méthode | Endpoint                                  | Description              | Auth   |
| ------- | ----------------------------------------- | ------------------------ | ------ |
| GET     | `.../maintenance/tickets`                 | Liste des tickets        | Requis |
| POST    | `.../maintenance/tickets`                 | Créer un ticket          | Requis |
| GET     | `.../maintenance/tickets/:id`             | Détail d’un ticket       | Requis |
| PATCH   | `.../maintenance/tickets/:id`             | Mettre à jour un ticket  | Requis |
| PATCH   | `.../maintenance/tickets/:id/status`      | Changer le statut        | Requis |
| POST    | `.../maintenance/tickets/:id/attachments` | Ajouter une pièce jointe | Requis |
| POST    | `.../maintenance/tickets/:id/comments`    | Ajouter un commentaire   | Requis |
| GET     | `.../maintenance/vendors`                 | Liste des prestataires   | Requis |
| POST    | `.../maintenance/vendors`                 | Créer un prestataire     | Requis |

---

### 4.10 Documents et templates — `/api/documents`

| Méthode | Endpoint                       | Description               | Auth   |
| ------- | ------------------------------ | ------------------------- | ------ |
| GET     | `/api/documents/templates`     | Liste des templates       | Requis |
| POST    | `/api/documents/templates`     | Créer un template         | Requis |
| GET     | `/api/documents/templates/:id` | Détail d’un template      | Requis |
| PATCH   | `/api/documents/templates/:id` | Mettre à jour un template | Requis |
| DELETE  | `/api/documents/templates/:id` | Supprimer un template     | Requis |

---

### 4.11 Abonnements — `/api/subscriptions`

| Méthode | Endpoint                          | Description                 | Auth   |
| ------- | --------------------------------- | --------------------------- | ------ |
| GET     | `/api/subscriptions`              | Liste des abonnements       | Requis |
| POST    | `/api/subscriptions`              | Créer un abonnement         | Requis |
| GET     | `/api/subscriptions/:id`          | Détail d’un abonnement      | Requis |
| PATCH   | `/api/subscriptions/:id`          | Mettre à jour un abonnement | Requis |
| POST    | `/api/subscriptions/:id/cancel`   | Annuler un abonnement       | Requis |
| GET     | `/api/subscriptions/:id/invoices` | Factures d’un abonnement    | Requis |

---

### 4.12 Administration — `/api/admin`

| Méthode | Endpoint                | Description               | Auth   |
| ------- | ----------------------- | ------------------------- | ------ |
| GET     | `/api/admin/tenants`    | Liste des tenants (admin) | Requis |
| GET     | `/api/admin/stats`      | Statistiques globales     | Requis |
| GET     | `/api/admin/audit-logs` | Logs d’audit (filtres)    | Requis |

---

### 4.13 Portails (locataire / propriétaire)

Les routes **tenant-portal** et **owner-portal** exposent des endpoints dédiés aux portails locataire et propriétaire (baux, échéances, paiements, documents, maintenance côté locataire ; biens, mandats, revenus côté propriétaire). Les chemins exacts et paramètres sont définis dans `packages/api/src/routes/tenant-portal-routes.ts` et `owner-portal-routes.ts`.

---

## 5. Références

| Document                     | Contenu                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| **database-schema.md**       | Détail complet des 39 tables (colonnes, types, contraintes, index, enums)      |
| **DOCUMENTATION_GLOBALE.md** | Architecture, module gestion locative, stack, liste d’endpoints complémentaire |
| **OVERVIEW_MODULES.md**      | Description des modules, focus géographie, statistiques et couverture          |
| **GUIDE_DEMARRAGE.md**       | Installation et démarrage du projet                                            |

---

_Document généré pour le projet ImmoTopia — Backend : packages/api ; Frontend : apps/web._
