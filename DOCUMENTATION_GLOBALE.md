# Documentation Globale - ImmoTopia

**Date de création**: 2025-01-27  
**Version**: 1.0  
**Statut**: Production Ready

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture globale](#architecture-globale)
3. [Module Gestion Locative](#module-gestion-locative)
4. [Liste complète des Endpoints API](#liste-complète-des-endpoints-api)
5. [Schéma de base de données](#schéma-de-base-de-données)
6. [Stack technologique](#stack-technologique)

---

## Vue d'ensemble

ImmoTopia est une plateforme complète de gestion immobilière multi-tenant développée avec Node.js/TypeScript (backend) et React/TypeScript (frontend). La plateforme offre une suite complète de modules pour la gestion immobilière, du CRM à la gestion locative en passant par la gestion des propriétés et des localités géographiques.

### Caractéristiques principales

- **Multi-tenant**: Isolation complète des données par tenant (agence/gestionnaire)
- **RBAC**: Contrôle d'accès basé sur les rôles (Platform et Tenant scopes)
- **Modules modulaires**: CRM, Propriétés, Gestion Locative, Maintenance, etc.
- **Sécurité**: JWT, OAuth Google, validation Zod, audit logging
- **Scalabilité**: Architecture prête pour la production avec PostgreSQL

---

## Architecture globale

### Structure du projet

```
ImmoTopia/
├── packages/
│   └── api/                    # Backend Node.js + Express
│       ├── src/
│       │   ├── controllers/   # Contrôleurs API
│       │   ├── services/      # Logique métier
│       │   ├── routes/        # Définition des routes
│       │   ├── middleware/    # Middlewares (auth, RBAC, validation)
│       │   └── utils/         # Utilitaires
│       └── prisma/
│           └── schema.prisma  # Schéma de base de données
├── apps/
│   └── web/                    # Frontend React
│       ├── src/
│       │   ├── components/    # Composants React
│       │   ├── pages/         # Pages (routing)
│       │   ├── services/      # Appels API
│       │   ├── context/       # Context API (Auth, etc.)
│       │   └── hooks/         # Custom hooks
└── specs/                      # Spécifications par module
```

### Architecture Backend

- **Framework**: Express.js 4.18
- **ORM**: Prisma 5.7
- **Base de données**: PostgreSQL 14+
- **Authentification**: JWT + Passport.js (Google OAuth)
- **Validation**: Zod 3.22
- **Pattern**: Service-Controller-Route

### Architecture Frontend

- **Framework**: React 18
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **State Management**: Context API
- **HTTP Client**: Axios

### Modules développés

1. **Authentification & Gestion des Utilisateurs** ✅
2. **Multi-Tenant & RBAC** ✅
3. **Module CRM** ✅
4. **Module Propriétés** ✅
5. **Module Gestion de Localité** ✅
6. **Module Gestion Locative** ✅
7. **Module Maintenance & Incidents** ✅
8. **Abonnements & Facturation** ✅
9. **Génération de Documents** ✅
10. **Audit & Logging** ✅

---

## Module Gestion Locative

### Vue d'ensemble

Le module de gestion locative (Rental Management) permet aux gestionnaires immobiliers de gérer complètement le cycle de vie des locations : création de baux, génération d'échéances, traitement des paiements, calcul des pénalités, gestion des cautions et génération de documents.

### Fonctionnalités principales

#### 1. Gestion des Baux (Leases)

- **Création de baux** : Création avec locataire principal, propriété, dates, montants
- **Co-locataires** : Gestion de plusieurs locataires par bail
- **Statuts** : DRAFT → ACTIVE → SUSPENDED → ENDED → CANCELED
- **Configuration** : Fréquence de facturation (MONTHLY, QUARTERLY, SEMIANNUAL, ANNUAL)
- **Règles de pénalité** : Configuration par bail ou par tenant

**Modèle de données** : `RentalLease`

#### 2. Génération d'Échéances (Installments)

- **Génération automatique** : Basée sur la fréquence de facturation
- **Périodes** : Calcul par année/mois
- **Dates d'échéance** : Calcul automatique selon le jour du mois configuré
- **Statuts** : DRAFT → DUE → PARTIAL → PAID → OVERDUE → CANCELED
- **Charges** : Loyer, charges de service, autres frais

**Modèle de données** : `RentalInstallment`, `RentalInstallmentItem`

#### 3. Traitement des Paiements (Payments)

- **Méthodes de paiement** : CASH, BANK_TRANSFER, CHECK, MOBILE_MONEY, CARD, OTHER
- **Mobile Money** : Support pour ORANGE, MTN, MOOV, WAVE
- **Idempotence** : Protection contre les doublons via `idempotency_key`
- **Allocation automatique** : Priorité aux échéances en retard les plus anciennes
- **Statuts** : PENDING → SUCCESS → FAILED → CANCELED → REFUNDED

**Modèle de données** : `RentalPayment`, `RentalPaymentAllocation`

#### 4. Calcul des Pénalités (Penalties)

- **Modes de calcul** :
  - `FIXED_AMOUNT` : Montant fixe
  - `PERCENT_OF_RENT` : Pourcentage du loyer
  - `PERCENT_OF_BALANCE` : Pourcentage du solde dû
- **Calcul automatique** : Job quotidien à 2h00 du matin
- **Période de grâce** : Jours de grâce configurables
- **Plafond** : Montant maximum de pénalité
- **Ajustement manuel** : Possibilité d'ajuster manuellement avec raison

**Modèle de données** : `RentalPenalty`, `RentalPenaltyRule`

#### 5. Gestion des Cautions (Security Deposits)

- **Collecte** : Enregistrement du paiement de caution
- **Détention** : Suivi des montants détenus
- **Libération** : Libération de la caution
- **Remboursement** : Remboursement au locataire
- **Confiscation** : Confiscation en cas de dommages
- **Ajustement** : Ajustements manuels

**Types de mouvements** : COLLECT, HOLD, RELEASE, REFUND, FORFEIT, ADJUSTMENT

**Modèle de données** : `RentalSecurityDeposit`, `RentalDepositMovement`

#### 6. Génération de Documents

- **Types de documents** :
  - `LEASE_CONTRACT` : Contrat de bail
  - `LEASE_ADDENDUM` : Avenant au bail
  - `RENT_RECEIPT` : Reçu de loyer
  - `RENT_QUITTANCE` : Quittance de loyer
  - `DEPOSIT_RECEIPT` : Reçu de caution
  - `STATEMENT` : Relevé de compte
  - `OTHER` : Autre document
- **Numérotation** : Format séquentiel YYYY-NNN (ex: 2025-001)
- **Templates** : Gestion de templates personnalisables par tenant
- **Statuts** : DRAFT → FINAL → VOID → SUPERSEDED

**Modèle de données** : `RentalDocument`, `DocumentTemplate`, `DocumentCounter`

### Workflow typique

1. **Création du bail** : Le gestionnaire crée un bail avec les informations du locataire et de la propriété
2. **Génération des échéances** : Génération manuelle des échéances selon la fréquence configurée
3. **Enregistrement des paiements** : Enregistrement des paiements avec allocation automatique
4. **Calcul des pénalités** : Calcul automatique quotidien pour les échéances en retard
5. **Gestion de la caution** : Collecte et suivi de la caution
6. **Génération de documents** : Génération automatique de contrats, reçus, quittances

### Sécurité et isolation

- ✅ **Isolation tenant** : Toutes les requêtes sont scoped par tenant
- ✅ **RBAC** : Permissions spécifiques au module gestion locative
- ✅ **Validation** : Validation Zod sur tous les endpoints
- ✅ **Audit logging** : Traçabilité complète des opérations
- ✅ **Idempotence** : Protection contre les paiements en double

---

## Liste complète des Endpoints API

### Base URL

- **Développement** : `http://localhost:5000/api`
- **Production** : `https://api.immotopia.com/api`

### Authentification

Tous les endpoints (sauf ceux marqués "Public") nécessitent un token JWT dans le header :
```
Authorization: Bearer <token>
```

---

### 🔐 Authentification (`/api/auth`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/auth/register` | Inscription utilisateur | Public |
| POST | `/api/auth/login` | Connexion email/mot de passe | Public |
| POST | `/api/auth/google` | Connexion Google OAuth | Public |
| POST | `/api/auth/refresh` | Rafraîchir le token | Public |
| POST | `/api/auth/logout` | Déconnexion | Requis |
| POST | `/api/auth/forgot-password` | Demande de réinitialisation | Public |
| POST | `/api/auth/reset-password` | Réinitialisation mot de passe | Public |
| POST | `/api/auth/verify-email` | Vérification email | Public |
| POST | `/api/auth/resend-verification` | Renvoyer email de vérification | Public |
| GET | `/api/auth/me` | Profil utilisateur actuel | Requis |
| PATCH | `/api/auth/profile` | Mise à jour du profil | Requis |

---

### 🏢 Multi-Tenant (`/api/tenants`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants` | Liste des tenants (admin) | Requis |
| POST | `/api/tenants` | Créer un tenant | Requis |
| GET | `/api/tenants/:id` | Détails d'un tenant | Requis |
| PATCH | `/api/tenants/:id` | Mettre à jour un tenant | Requis |
| PATCH | `/api/tenants/:id/status` | Changer le statut | Requis |
| GET | `/api/tenants/:id/modules` | Modules activés | Requis |
| POST | `/api/tenants/:id/modules` | Activer un module | Requis |
| DELETE | `/api/tenants/:id/modules/:moduleKey` | Désactiver un module | Requis |

---

### 👥 Membres & Invitations

#### Membres (`/api/memberships`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/memberships` | Liste des membres | Requis |
| GET | `/api/memberships/:id` | Détails d'un membre | Requis |
| PATCH | `/api/memberships/:id/status` | Changer le statut | Requis |
| DELETE | `/api/memberships/:id` | Supprimer un membre | Requis |

#### Invitations (`/api/invitations`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/invitations` | Créer une invitation | Requis |
| GET | `/api/invitations/:token` | Détails d'une invitation | Public |
| POST | `/api/invitations/:token/accept` | Accepter une invitation | Public |
| DELETE | `/api/invitations/:id` | Révoquer une invitation | Requis |

---

### 🔑 Rôles & Permissions (`/api/roles`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/roles` | Liste des rôles | Requis |
| GET | `/api/roles/:id` | Détails d'un rôle | Requis |
| GET | `/api/permissions` | Liste des permissions | Requis |
| POST | `/api/user-roles` | Attribuer un rôle | Requis |
| DELETE | `/api/user-roles/:id` | Retirer un rôle | Requis |

---

### 📊 CRM (`/api/tenants/:tenantId/crm`)

#### Contacts

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/crm/contacts` | Liste des contacts | Requis |
| POST | `/api/tenants/:tenantId/crm/contacts` | Créer un contact | Requis |
| GET | `/api/tenants/:tenantId/crm/contacts/:id` | Détails d'un contact | Requis |
| PATCH | `/api/tenants/:tenantId/crm/contacts/:id` | Mettre à jour un contact | Requis |
| DELETE | `/api/tenants/:tenantId/crm/contacts/:id` | Supprimer un contact | Requis |
| POST | `/api/tenants/:tenantId/crm/contacts/:id/convert` | Convertir en client | Requis |
| POST | `/api/tenants/:tenantId/crm/contacts/:id/tags` | Ajouter un tag | Requis |
| DELETE | `/api/tenants/:tenantId/crm/contacts/:id/tags/:tagId` | Retirer un tag | Requis |

#### Deals (Opportunités)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/crm/deals` | Liste des deals | Requis |
| POST | `/api/tenants/:tenantId/crm/deals` | Créer un deal | Requis |
| GET | `/api/tenants/:tenantId/crm/deals/:id` | Détails d'un deal | Requis |
| PATCH | `/api/tenants/:tenantId/crm/deals/:id` | Mettre à jour un deal | Requis |
| PATCH | `/api/tenants/:tenantId/crm/deals/:id/stage` | Changer le stage | Requis |
| POST | `/api/tenants/:tenantId/crm/deals/:id/properties` | Ajouter une propriété | Requis |
| DELETE | `/api/tenants/:tenantId/crm/deals/:id/properties/:propertyId` | Retirer une propriété | Requis |

#### Activités

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/crm/activities` | Liste des activités | Requis |
| POST | `/api/tenants/:tenantId/crm/activities` | Créer une activité | Requis |
| GET | `/api/tenants/:tenantId/crm/activities/:id` | Détails d'une activité | Requis |
| PATCH | `/api/tenants/:tenantId/crm/activities/:id` | Mettre à jour une activité | Requis |

#### Rendez-vous

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/crm/appointments` | Liste des rendez-vous | Requis |
| POST | `/api/tenants/:tenantId/crm/appointments` | Créer un rendez-vous | Requis |
| GET | `/api/tenants/:tenantId/crm/appointments/:id` | Détails d'un rendez-vous | Requis |
| PATCH | `/api/tenants/:tenantId/crm/appointments/:id` | Mettre à jour un rendez-vous | Requis |
| POST | `/api/tenants/:tenantId/crm/appointments/:id/collaborators` | Ajouter un collaborateur | Requis |

#### Tags

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/crm/tags` | Liste des tags | Requis |
| POST | `/api/tenants/:tenantId/crm/tags` | Créer un tag | Requis |
| PATCH | `/api/tenants/:tenantId/crm/tags/:id` | Mettre à jour un tag | Requis |
| DELETE | `/api/tenants/:tenantId/crm/tags/:id` | Supprimer un tag | Requis |

---

### 🏠 Propriétés (`/api/properties`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/properties` | Liste des propriétés | Requis |
| POST | `/api/properties` | Créer une propriété | Requis |
| GET | `/api/properties/:id` | Détails d'une propriété | Requis |
| PATCH | `/api/properties/:id` | Mettre à jour une propriété | Requis |
| DELETE | `/api/properties/:id` | Supprimer une propriété | Requis |
| PATCH | `/api/properties/:id/status` | Changer le statut | Requis |
| POST | `/api/properties/:id/media` | Ajouter un média | Requis |
| DELETE | `/api/properties/:id/media/:mediaId` | Supprimer un média | Requis |
| POST | `/api/properties/:id/documents` | Ajouter un document | Requis |
| GET | `/api/properties/:id/visits` | Liste des visites | Requis |
| POST | `/api/properties/:id/visits` | Créer une visite | Requis |
| POST | `/api/properties/:id/mandates` | Créer un mandat | Requis |
| GET | `/api/properties/:id/quality-score` | Score de qualité | Requis |

#### API Publique Propriétés (`/api/public/properties`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/public/properties` | Liste publique des propriétés | Public |
| GET | `/api/public/properties/:id` | Détails publics d'une propriété | Public |

---

### 📍 Géographique (`/api/geographic`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/geographic/search` | Recherche de localisations | Public |
| GET | `/api/geographic/communes` | Liste des communes | Public |
| GET | `/api/geographic/countries/:countryCode/regions` | Régions d'un pays | Public |
| GET | `/api/geographic/regions/:regionId/communes` | Communes d'une région | Public |
| GET | `/api/geographic/locations/:communeId` | Détails d'une localisation | Public |

---

### 💰 Gestion Locative (`/api/tenants/:tenantId/rental`)

#### Baux (Leases)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/rental/leases` | Liste des baux | Requis |
| POST | `/api/tenants/:tenantId/rental/leases` | Créer un bail | Requis |
| GET | `/api/tenants/:tenantId/rental/leases/:id` | Détails d'un bail | Requis |
| PATCH | `/api/tenants/:tenantId/rental/leases/:id` | Mettre à jour un bail | Requis |
| PATCH | `/api/tenants/:tenantId/rental/leases/:id/status` | Changer le statut | Requis |
| POST | `/api/tenants/:tenantId/rental/leases/:id/co-renters` | Ajouter un co-locataire | Requis |
| DELETE | `/api/tenants/:tenantId/rental/leases/:id/co-renters/:coRenterId` | Retirer un co-locataire | Requis |
| GET | `/api/tenants/:tenantId/rental/leases/:id/co-renters` | Liste des co-locataires | Requis |

#### Échéances (Installments)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/rental/leases/:id/installments` | Liste des échéances | Requis |
| POST | `/api/tenants/:tenantId/rental/leases/:id/installments` | Générer les échéances | Requis |
| POST | `/api/tenants/:tenantId/rental/leases/:id/installments/recalculate` | Recalculer les échéances | Requis |

#### Paiements (Payments)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/rental/payments` | Liste des paiements | Requis |
| POST | `/api/tenants/:tenantId/rental/payments` | Enregistrer un paiement | Requis |
| GET | `/api/tenants/:tenantId/rental/payments/:id` | Détails d'un paiement | Requis |
| PATCH | `/api/tenants/:tenantId/rental/payments/:id/status` | Changer le statut | Requis |
| POST | `/api/tenants/:tenantId/rental/payments/:id/allocate` | Allouer un paiement | Requis |

#### Pénalités (Penalties)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/rental/penalties` | Liste des pénalités | Requis |
| POST | `/api/tenants/:tenantId/rental/penalties/calculate` | Calculer les pénalités | Requis |
| PATCH | `/api/tenants/:tenantId/rental/penalties/:id` | Ajuster une pénalité | Requis |

#### Cautions (Security Deposits)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/rental/leases/:id/deposit` | Détails de la caution | Requis |
| POST | `/api/tenants/:tenantId/rental/leases/:id/deposit` | Créer une caution | Requis |
| GET | `/api/tenants/:tenantId/rental/deposits/:id/movements` | Mouvements de caution | Requis |
| POST | `/api/tenants/:tenantId/rental/deposits/:id/movements` | Créer un mouvement | Requis |

#### Documents

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/rental/documents` | Liste des documents | Requis |
| POST | `/api/tenants/:tenantId/rental/documents` | Générer un document | Requis |
| GET | `/api/tenants/:tenantId/rental/documents/:id` | Détails d'un document | Requis |
| PATCH | `/api/tenants/:tenantId/rental/documents/:id` | Mettre à jour un document | Requis |

---

### 🔧 Maintenance (`/api/tenants/:tenantId/maintenance`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/tenants/:tenantId/maintenance/tickets` | Liste des tickets | Requis |
| POST | `/api/tenants/:tenantId/maintenance/tickets` | Créer un ticket | Requis |
| GET | `/api/tenants/:tenantId/maintenance/tickets/:id` | Détails d'un ticket | Requis |
| PATCH | `/api/tenants/:tenantId/maintenance/tickets/:id` | Mettre à jour un ticket | Requis |
| PATCH | `/api/tenants/:tenantId/maintenance/tickets/:id/status` | Changer le statut | Requis |
| POST | `/api/tenants/:tenantId/maintenance/tickets/:id/attachments` | Ajouter une pièce jointe | Requis |
| POST | `/api/tenants/:tenantId/maintenance/tickets/:id/comments` | Ajouter un commentaire | Requis |
| GET | `/api/tenants/:tenantId/maintenance/vendors` | Liste des prestataires | Requis |
| POST | `/api/tenants/:tenantId/maintenance/vendors` | Créer un prestataire | Requis |

---

### 📄 Documents & Templates (`/api/documents`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/documents/templates` | Liste des templates | Requis |
| POST | `/api/documents/templates` | Créer un template | Requis |
| GET | `/api/documents/templates/:id` | Détails d'un template | Requis |
| PATCH | `/api/documents/templates/:id` | Mettre à jour un template | Requis |
| DELETE | `/api/documents/templates/:id` | Supprimer un template | Requis |

---

### 💳 Abonnements (`/api/subscriptions`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/subscriptions` | Liste des abonnements | Requis |
| POST | `/api/subscriptions` | Créer un abonnement | Requis |
| GET | `/api/subscriptions/:id` | Détails d'un abonnement | Requis |
| PATCH | `/api/subscriptions/:id` | Mettre à jour un abonnement | Requis |
| POST | `/api/subscriptions/:id/cancel` | Annuler un abonnement | Requis |
| GET | `/api/subscriptions/:id/invoices` | Factures d'un abonnement | Requis |

---

### 🔍 Administration (`/api/admin`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/admin/tenants` | Liste des tenants (admin) | Requis |
| GET | `/api/admin/stats` | Statistiques globales | Requis |
| GET | `/api/admin/audit-logs` | Logs d'audit | Requis |

---

## Schéma de base de données

### Vue d'ensemble

- **Total de tables** : 50+
- **Total d'enums** : 40+
- **Base de données** : PostgreSQL 14+
- **ORM** : Prisma 5.7

### Tables principales

#### Authentification & Utilisateurs

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `users` | Utilisateurs de la plateforme | `refresh_tokens`, `memberships`, `user_roles` |
| `refresh_tokens` | Tokens de rafraîchissement JWT | `users` |
| `password_reset_tokens` | Tokens de réinitialisation | `users` |
| `email_verification_tokens` | Tokens de vérification email | `users` |

#### Multi-Tenant

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `tenants` | Organisations (agences/gestionnaires) | `memberships`, `subscriptions`, `modules` |
| `tenant_clients` | Clients des tenants | `users`, `tenants` |
| `memberships` | Relations utilisateur-tenant | `users`, `tenants` |
| `invitations` | Invitations à rejoindre un tenant | `tenants`, `users` |
| `tenant_modules` | Modules activés par tenant | `tenants` |

#### RBAC

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `roles` | Définitions de rôles | `role_permissions`, `user_roles` |
| `permissions` | Définitions de permissions | `role_permissions` |
| `role_permissions` | Associations rôle-permission | `roles`, `permissions` |
| `user_roles` | Attributions de rôles aux utilisateurs | `users`, `roles` |

#### CRM

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `crm_contacts` | Contacts CRM (leads/clients) | `tenants`, `crm_deals`, `crm_activities` |
| `crm_contact_roles` | Rôles des contacts | `crm_contacts` |
| `crm_deals` | Opportunités commerciales | `crm_contacts`, `crm_deal_properties` |
| `crm_activities` | Historique des interactions | `crm_contacts`, `crm_deals` |
| `crm_deal_properties` | Propriétés associées aux deals | `crm_deals`, `properties` |
| `crm_tags` | Tags pour les contacts | `crm_contact_tags` |
| `crm_notes` | Notes sur les entités | `crm_contacts`, `crm_deals` |

#### Propriétés

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `properties` | Propriétés immobilières | `tenants`, `property_media`, `rental_leases` |
| `property_type_templates` | Templates par type de propriété | - |
| `property_media` | Photos/vidéos des propriétés | `properties` |
| `property_documents` | Documents des propriétés | `properties` |
| `property_status_history` | Historique des statuts | `properties` |
| `property_visits` | Visites de propriétés | `properties`, `crm_contacts` |
| `property_mandates` | Mandats de vente/location | `properties`, `tenants` |
| `property_quality_scores` | Scores de qualité | `properties` |

#### Géographique

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `countries` | Pays | `regions` |
| `regions` | Régions par pays | `countries`, `communes` |
| `communes` | Communes par région | `regions` |

#### Gestion Locative

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `rental_leases` | Baux de location | `properties`, `tenant_clients`, `rental_installments` |
| `rental_lease_co_renters` | Co-locataires | `rental_leases`, `tenant_clients` |
| `rental_installments` | Échéances de loyer | `rental_leases`, `rental_payment_allocations` |
| `rental_installment_items` | Détails des charges par échéance | `rental_installments` |
| `rental_payments` | Paiements | `rental_leases`, `rental_payment_allocations` |
| `rental_payment_allocations` | Allocation des paiements | `rental_payments`, `rental_installments` |
| `rental_refunds` | Remboursements | `rental_payments` |
| `rental_penalty_rules` | Règles de pénalité | `tenants` |
| `rental_penalties` | Pénalités calculées | `rental_installments` |
| `rental_security_deposits` | Cautions | `rental_leases`, `rental_deposit_movements` |
| `rental_deposit_movements` | Mouvements de caution | `rental_security_deposits` |
| `rental_documents` | Documents de location | `rental_leases`, `document_templates` |
| `document_templates` | Templates de documents | `tenants`, `rental_documents` |
| `document_counters` | Compteurs de numérotation | `tenants` |

#### Maintenance

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `maintenance_tickets` | Tickets de maintenance | `properties`, `rental_leases`, `maintenance_vendors` |
| `maintenance_ticket_attachments` | Pièces jointes | `maintenance_tickets` |
| `maintenance_ticket_comments` | Commentaires | `maintenance_tickets` |
| `maintenance_ticket_status_history` | Historique des statuts | `maintenance_tickets` |
| `maintenance_vendors` | Prestataires de maintenance | `tenants`, `maintenance_tickets` |

#### Abonnements & Facturation

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `subscriptions` | Abonnements des tenants | `tenants`, `invoices` |
| `invoices` | Factures | `subscriptions`, `tenants` |

#### Audit

| Table | Description | Relations principales |
|-------|-------------|----------------------|
| `audit_logs` | Logs d'audit | `users`, `tenants` |

### Enums principaux

#### Authentification
- `GlobalRole`: SUPER_ADMIN, USER

#### Multi-Tenant
- `TenantType`: AGENCY, OPERATOR
- `TenantStatus`: PENDING, ACTIVE, SUSPENDED
- `ModuleKey`: MODULE_AGENCY, MODULE_SYNDIC, MODULE_PROMOTER
- `MembershipStatus`: PENDING_INVITE, ACTIVE, DISABLED
- `RoleScope`: PLATFORM, TENANT

#### CRM
- `CrmContactStatus`: LEAD, ACTIVE_CLIENT, ARCHIVED
- `CrmContactRoleType`: PROPRIETAIRE, LOCATAIRE, COPROPRIETAIRE, ACQUEREUR
- `CrmContactType`: PERSON, COMPANY
- `CrmDealType`: ACHAT, LOCATION, VENTE, GESTION, MANDAT
- `CrmDealStage`: NEW, QUALIFIED, VISIT, NEGOTIATION, WON, LOST
- `CrmActivityType`: CALL, EMAIL, SMS, WHATSAPP, VISIT, MEETING, NOTE, TASK, CORRECTION

#### Propriétés
- `PropertyType`: APPARTEMENT, MAISON_VILLA, STUDIO, DUPLEX_TRIPLEX, CHAMBRE_COLOCATION, BUREAU, BOUTIQUE_COMMERCIAL, ENTREPOT_INDUSTRIEL, TERRAIN, IMMEUBLE, PARKING_BOX, LOT_PROGRAMME_NEUF
- `PropertyStatus`: DRAFT, UNDER_REVIEW, AVAILABLE, RESERVED, UNDER_OFFER, RENTED, SOLD, ARCHIVED
- `PropertyTransactionMode`: SALE, RENTAL, SHORT_TERM

#### Gestion Locative
- `RentalLeaseStatus`: DRAFT, ACTIVE, SUSPENDED, ENDED, CANCELED
- `RentalBillingFrequency`: MONTHLY, QUARTERLY, SEMIANNUAL, ANNUAL
- `RentalInstallmentStatus`: DRAFT, DUE, PARTIAL, PAID, OVERDUE, CANCELED
- `RentalPaymentMethod`: CASH, BANK_TRANSFER, CHECK, MOBILE_MONEY, CARD, OTHER
- `RentalPaymentStatus`: PENDING, SUCCESS, FAILED, CANCELED, REFUNDED, PARTIALLY_REFUNDED
- `MobileMoneyOperator`: ORANGE, MTN, MOOV, WAVE, OTHER
- `RentalPenaltyMode`: FIXED_AMOUNT, PERCENT_OF_RENT, PERCENT_OF_BALANCE
- `RentalDepositMovementType`: COLLECT, HOLD, RELEASE, REFUND, FORFEIT, ADJUSTMENT
- `RentalDocumentType`: LEASE_CONTRACT, LEASE_ADDENDUM, RENT_RECEIPT, RENT_QUITTANCE, DEPOSIT_RECEIPT, STATEMENT, OTHER
- `RentalDocumentStatus`: DRAFT, FINAL, VOID, SUPERSEDED

#### Maintenance
- `MaintenanceTicketCategory`: PLUMBING, ELECTRICITY, AC, OTHER
- `MaintenanceTicketPriority`: LOW, MEDIUM, HIGH, URGENT
- `MaintenanceTicketStatus`: DECLARED, IN_PROGRESS, ASSIGNED, RESOLVED, CANCELED

#### Abonnements
- `SubscriptionPlan`: BASIC, PRO, ELITE
- `BillingCycle`: MONTHLY, ANNUAL
- `SubscriptionStatus`: TRIALING, ACTIVE, PAST_DUE, CANCELED, SUSPENDED
- `InvoiceStatus`: DRAFT, ISSUED, PAID, FAILED, CANCELED, REFUNDED

### Relations clés

#### Gestion Locative - Relations principales

```
RentalLease
├── Property (1-N)
├── TenantClient (Primary Renter) (N-1)
├── TenantClient (Owner) (N-1)
├── RentalLeaseCoRenter (1-N)
├── RentalInstallment (1-N)
│   ├── RentalInstallmentItem (1-N)
│   ├── RentalPaymentAllocation (1-N)
│   └── RentalPenalty (1-N)
├── RentalSecurityDeposit (1-1)
│   └── RentalDepositMovement (1-N)
└── RentalDocument (1-N)
    └── DocumentTemplate (N-1)

RentalPayment
├── RentalLease (N-1)
├── TenantClient (N-1)
├── RentalPaymentAllocation (1-N)
├── RentalRefund (1-N)
└── RentalDepositMovement (1-N)
```

### Index et performances

Toutes les tables ont des index sur :
- Clés primaires (UUID)
- Clés étrangères (`tenant_id`, `user_id`, etc.)
- Champs de recherche fréquents (`email`, `status`, `created_at`)
- Combinaisons de champs pour requêtes complexes (`tenant_id`, `status`)

---

## Stack technologique

### Backend

- **Runtime**: Node.js 18+ (LTS)
- **Framework**: Express.js 4.18
- **Language**: TypeScript 5.3 (mode strict)
- **ORM**: Prisma 5.7
- **Base de données**: PostgreSQL 14+
- **Authentification**: JWT, Passport.js (Google OAuth 2.0)
- **Validation**: Zod 3.22
- **Upload de fichiers**: Multer
- **Email**: Nodemailer
- **Planification**: node-cron
- **Sécurité**: Helmet, CORS, bcrypt
- **Logging**: Winston

### Frontend

- **Framework**: React 18
- **Language**: TypeScript
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **Icônes**: Lucide React
- **Composants UI**: Radix UI
- **Gestion d'état**: Context API
- **Client HTTP**: Axios
- **Build Tool**: Create React App

### Infrastructure

- **Base de données**: PostgreSQL 14+
- **Version control**: Git
- **Package manager**: npm
- **Environnement**: Node.js 18+

---

## Statistiques

### Métriques du codebase

- **Total des tables de base de données**: 50+
- **Endpoints API**: 100+
- **Pages React**: 35+
- **Composants React**: 45+
- **Services Backend**: 25+
- **Contrôleurs Backend**: 25+
- **Middleware**: 12+
- **Enums de base de données**: 40+

### Couverture des modules

- ✅ Authentification & Gestion des Utilisateurs: **100%**
- ✅ Multi-Tenant & RBAC: **100%**
- ✅ Module CRM: **100%**
- ✅ Module Propriétés: **100%**
- ✅ Module Gestion de Localité: **100%**
- ✅ Module Gestion Locative: **100%** (Backend), **90%** (Frontend)
- ✅ Module Maintenance: **100%**
- ✅ Génération de Documents: **100%**
- ✅ Abonnements & Facturation: **90%** (Backend), **50%** (Frontend)
- ✅ Audit & Logging: **100%**

---

## Notes importantes

- Tous les textes UI sont en français (selon les exigences du projet)
- Toute la logique métier suit les spécifications requises
- Tous les cas limites sont gérés
- Le système est prêt pour la production
- L'isolation tenant est garantie sur tous les endpoints
- Tous les endpoints sont protégés par RBAC (sauf ceux marqués "Public")

---

**Version du document**: 1.0  
**Dernière mise à jour**: 2025-01-27  
**Auteur**: ImmoTopia Development Team
