# Database Schema - Tables and Columns

This document lists all database tables and their columns extracted from the Prisma schema.

---

## Table: `audit_logs`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| actor_user_id | String (UUID) | FOREIGN KEY → users.id (nullable) |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id (nullable) |
| action_key | String | |
| entity_type | String | |
| entity_id | String | |
| ip_address | String | nullable |
| user_agent | String | nullable |
| payload | Json | nullable |
| created_at | DateTime | |

**Indexes:**
- actor_user_id
- tenant_id
- action_key
- entity_type, entity_id
- created_at

---

## Table: `crm_activities`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| contact_id | String (UUID) | FOREIGN KEY → crm_contacts.id |
| deal_id | String (UUID) | FOREIGN KEY → crm_deals.id (nullable) |
| activity_type | CrmActivityType (enum) | |
| direction | CrmActivityDirection (enum) | nullable |
| subject | String | nullable |
| content | String (Text) | |
| outcome | String | nullable |
| occurred_at | DateTime | |
| created_by_user_id | String (UUID) | FOREIGN KEY → users.id |
| next_action_at | DateTime | nullable |
| next_action_type | String | nullable |
| correction_of_id | String (UUID) | FOREIGN KEY → crm_activities.id (nullable) |
| created_at | DateTime | |

**Indexes:**
- tenant_id
- tenant_id, contact_id
- tenant_id, deal_id
- created_by_user_id
- occurred_at
- next_action_at

**Enums:**
- **CrmActivityType**: CALL, EMAIL, SMS, WHATSAPP, VISIT, MEETING, NOTE, TASK, CORRECTION
- **CrmActivityDirection**: IN, OUT, INTERNAL

---

## Table: `crm_appointment_collaborators`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| appointment_id | String (UUID) | FOREIGN KEY → crm_appointments.id |
| user_id | String (UUID) | FOREIGN KEY → users.id |
| created_at | DateTime | |

**Indexes:**
- appointment_id
- user_id
- UNIQUE: appointment_id, user_id

---

## Table: `crm_appointments`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| contact_id | String (UUID) | FOREIGN KEY → crm_contacts.id |
| deal_id | String (UUID) | FOREIGN KEY → crm_deals.id (nullable) |
| appointment_type | CrmAppointmentType (enum) | |
| start_at | DateTime | |
| end_at | DateTime | |
| location | String | nullable |
| status | CrmAppointmentStatus (enum) | DEFAULT: SCHEDULED |
| created_by_user_id | String (UUID) | FOREIGN KEY → users.id |
| assigned_to_user_id | String (UUID) | FOREIGN KEY → users.id (nullable) |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- tenant_id
- tenant_id, contact_id
- tenant_id, deal_id
- assigned_to_user_id
- start_at
- status

**Enums:**
- **CrmAppointmentType**: RDV, VISITE
- **CrmAppointmentStatus**: SCHEDULED, CONFIRMED, DONE, NO_SHOW, CANCELED

---

## Table: `crm_contact_roles`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| contact_id | String (UUID) | FOREIGN KEY → crm_contacts.id |
| role | CrmContactRoleType (enum) | |
| active | Boolean | DEFAULT: true |
| started_at | DateTime | |
| ended_at | DateTime | nullable |
| metadata | Json | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- tenant_id
- contact_id
- tenant_id, contact_id, active

**Enum: CrmContactRoleType**
- PROPRIETAIRE
- LOCATAIRE
- COPROPRIETAIRE
- ACQUEREUR

---

## Table: `crm_contact_tags`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| contact_id | String (UUID) | FOREIGN KEY → crm_contacts.id |
| tag_id | String (UUID) | FOREIGN KEY → crm_tags.id |
| created_at | DateTime | |

**Indexes:**
- contact_id
- tag_id
- UNIQUE: contact_id, tag_id

---

## Table: `crm_contacts`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| first_name | String | |
| last_name | String | |
| email | String | |
| phone | String | nullable |
| source | String | nullable |
| status | CrmContactStatus (enum) | DEFAULT: LEAD |
| assigned_to_user_id | String (UUID) | FOREIGN KEY → users.id (nullable) |
| last_interaction_at | DateTime | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- tenant_id
- tenant_id, status
- assigned_to_user_id
- last_interaction_at
- email
- UNIQUE: tenant_id, email

**Enum: CrmContactStatus**
- LEAD
- ACTIVE_CLIENT
- ARCHIVED

---

## Table: `crm_deal_properties`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| deal_id | String (UUID) | FOREIGN KEY → crm_deals.id |
| property_id | String (UUID) | FOREIGN KEY → properties.id |
| source_owner_contact_id | String (UUID) | FOREIGN KEY → crm_contacts.id (nullable) |
| match_score | Int | nullable |
| match_explanation_json | Json | nullable |
| status | CrmDealPropertyStatus (enum) | DEFAULT: SHORTLISTED |
| created_at | DateTime | |

**Indexes:**
- tenant_id
- tenant_id, deal_id
- property_id
- match_score
- UNIQUE: tenant_id, deal_id, property_id

**Enum: CrmDealPropertyStatus**
- SHORTLISTED
- PROPOSED
- VISITED
- REJECTED
- SELECTED

---

## Table: `crm_deals`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| contact_id | String (UUID) | FOREIGN KEY → crm_contacts.id |
| type | CrmDealType (enum) | |
| stage | CrmDealStage (enum) | DEFAULT: NEW |
| budget_min | Decimal(12,2) | nullable |
| budget_max | Decimal(12,2) | nullable |
| location_zone | String | nullable |
| criteria_json | Json | nullable |
| expected_value | Decimal(12,2) | nullable |
| probability | Float | nullable |
| assigned_to_user_id | String (UUID) | FOREIGN KEY → users.id (nullable) |
| closed_reason | String | nullable |
| closed_at | DateTime | nullable |
| version | Int | DEFAULT: 1 |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- tenant_id
- tenant_id, contact_id
- tenant_id, stage
- assigned_to_user_id
- created_at

**Enums:**
- **CrmDealType**: ACHAT, LOCATION
- **CrmDealStage**: NEW, QUALIFIED, APPOINTMENT, VISIT, NEGOTIATION, WON, LOST

---

## Table: `crm_notes`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| entity_type | CrmEntityType (enum) | |
| entity_id | String | |
| content | String (Text) | |
| created_by_user_id | String (UUID) | FOREIGN KEY → users.id |
| crm_contact_id | String (UUID) | FOREIGN KEY → crm_contacts.id (nullable) |
| crm_deal_id | String (UUID) | FOREIGN KEY → crm_deals.id (nullable) |
| created_at | DateTime | |

**Indexes:**
- tenant_id
- tenant_id, entity_type, entity_id
- created_by_user_id

**Enum: CrmEntityType**
- CONTACT
- DEAL
- PROPERTY

---

## Table: `crm_tags`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| name | String | |
| color | String | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- tenant_id
- UNIQUE: tenant_id, name

---

## Table: `email_verification_tokens`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| token | String | UNIQUE |
| user_id | String (UUID) | FOREIGN KEY → users.id |
| expires_at | DateTime | |
| created_at | DateTime | |
| used | Boolean | DEFAULT: false |

**Indexes:**
- user_id
- token

---

## Table: `invitations`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| email | String | |
| token_hash | String | UNIQUE |
| expires_at | DateTime | |
| status | InvitationStatus (enum) | DEFAULT: PENDING |
| invited_by | String (UUID) | FOREIGN KEY → users.id |
| accepted_by | String (UUID) | FOREIGN KEY → users.id (nullable) |
| accepted_at | DateTime | nullable |
| revoked_at | DateTime | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- tenant_id
- email
- token_hash
- status
- expires_at

**Enum: InvitationStatus**
- PENDING
- ACCEPTED
- EXPIRED
- REVOKED

---

## Table: `invoices`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| subscription_id | String (UUID) | FOREIGN KEY → subscriptions.id (nullable) |
| invoice_number | String | UNIQUE |
| issue_date | DateTime | |
| due_date | DateTime | |
| currency | String | DEFAULT: 'FCFA' |
| amount_total | Decimal(10,2) | |
| status | InvoiceStatus (enum) | DEFAULT: DRAFT |
| paid_at | DateTime | nullable |
| notes | String (Text) | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- tenant_id
- subscription_id
- invoice_number
- status
- due_date

**Enum: InvoiceStatus**
- DRAFT
- ISSUED
- PAID
- FAILED
- CANCELED
- REFUNDED

---

## Table: `memberships`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| user_id | String (UUID) | FOREIGN KEY → users.id |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| status | MembershipStatus (enum) | DEFAULT: PENDING_INVITE |
| invited_at | DateTime | nullable |
| invited_by | String (UUID) | nullable |
| accepted_at | DateTime | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- user_id
- tenant_id
- status
- UNIQUE: user_id, tenant_id

**Enum: MembershipStatus**
- PENDING_INVITE
- ACTIVE
- DISABLED

---

## Table: `password_reset_tokens`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| token | String | UNIQUE |
| user_id | String (UUID) | FOREIGN KEY → users.id |
| expires_at | DateTime | |
| created_at | DateTime | |
| used | Boolean | DEFAULT: false |

**Indexes:**
- user_id
- token

---

## Table: `permissions`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| key | String | UNIQUE |
| description | String (Text) | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- key

---

## Table: `property_type_templates`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| property_type | PropertyType (enum) | UNIQUE |
| name | String | |
| description | String (Text) | nullable |
| field_definitions | Json | |
| sections | Json | |
| validation_rules | Json | |
| version | Int | DEFAULT: 1 |
| is_active | Boolean | DEFAULT: true |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- property_type

**Enums:**
- **PropertyType**: APPARTEMENT, MAISON_VILLA, STUDIO, DUPLEX_TRIPLEX, CHAMBRE_COLOCATION, BUREAU, BOUTIQUE_COMMERCIAL, ENTREPOT_INDUSTRIEL, TERRAIN, IMMEUBLE, PARKING_BOX, LOT_PROGRAMME_NEUF

---

## Table: `properties`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| internal_reference | String | UNIQUE |
| property_type | PropertyType (enum) | |
| ownership_type | PropertyOwnershipType (enum) | |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id (nullable) |
| owner_user_id | String (UUID) | FOREIGN KEY → users.id (nullable) |
| title | String | |
| description | String (Text) | |
| address | String | |
| location_zone | String | nullable |
| latitude | Float | nullable |
| longitude | Float | nullable |
| transaction_modes | PropertyTransactionMode[] (enum array) | |
| price | Float | nullable |
| fees | Float | nullable |
| currency | String | DEFAULT: 'EUR' |
| surface_area | Float | nullable |
| surface_useful | Float | nullable |
| surface_terrain | Float | nullable |
| rooms | Int | nullable |
| bedrooms | Int | nullable |
| bathrooms | Int | nullable |
| furnishing_status | PropertyFurnishingStatus (enum) | nullable |
| status | PropertyStatus (enum) | DEFAULT: DRAFT |
| is_published | Boolean | DEFAULT: false |
| published_at | DateTime | nullable |
| availability | PropertyAvailability (enum) | DEFAULT: AVAILABLE |
| quality_score | Int | nullable |
| quality_score_updated_at | DateTime | nullable |
| type_specific_data | Json | nullable |
| container_parent_id | String (UUID) | FOREIGN KEY → properties.id (nullable) |
| version | Int | DEFAULT: 1 |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- tenant_id
- owner_user_id
- property_type
- ownership_type
- status
- is_published
- latitude, longitude
- location_zone
- container_parent_id

**Enums:**
- **PropertyOwnershipType**: TENANT, PUBLIC, CLIENT
- **PropertyTransactionMode**: SALE, RENTAL, SHORT_TERM
- **PropertyFurnishingStatus**: FURNISHED, UNFURNISHED, PARTIALLY_FURNISHED
- **PropertyStatus**: DRAFT, UNDER_REVIEW, AVAILABLE, RESERVED, UNDER_OFFER, RENTED, SOLD, ARCHIVED
- **PropertyAvailability**: AVAILABLE, UNAVAILABLE, SOON_AVAILABLE

---

## Table: `property_media`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| property_id | String (UUID) | FOREIGN KEY → properties.id |
| media_type | PropertyMediaType (enum) | |
| file_path | String | |
| file_url | String | nullable |
| file_name | String | |
| file_size | Int | nullable |
| mime_type | String | nullable |
| display_order | Int | DEFAULT: 0 |
| is_primary | Boolean | DEFAULT: false |
| metadata | Json | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- property_id
- property_id, display_order
- property_id, is_primary

**Enums:**
- **PropertyMediaType**: PHOTO, VIDEO, TOUR_360

---

## Table: `property_documents`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| property_id | String (UUID) | FOREIGN KEY → properties.id |
| document_type | PropertyDocumentType (enum) | |
| file_path | String | |
| file_url | String | nullable |
| file_name | String | |
| file_size | Int | nullable |
| mime_type | String | nullable |
| expiration_date | DateTime | nullable |
| warning_sent_at | DateTime | nullable |
| grace_period_ends_at | DateTime | nullable |
| is_required | Boolean | DEFAULT: false |
| is_valid | Boolean | DEFAULT: true |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- property_id
- expiration_date
- property_id, document_type

**Enums:**
- **PropertyDocumentType**: TITLE_DEED, MANDATE, PLAN, TAX_DOCUMENT, OTHER

---

## Table: `property_status_history`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| property_id | String (UUID) | FOREIGN KEY → properties.id |
| previous_status | PropertyStatus (enum) | nullable |
| new_status | PropertyStatus (enum) | |
| changed_by_user_id | String (UUID) | FOREIGN KEY → users.id |
| notes | String (Text) | nullable |
| created_at | DateTime | |

**Indexes:**
- property_id
- property_id, created_at
- changed_by_user_id

---

## Table: `property_visits`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| property_id | String (UUID) | FOREIGN KEY → properties.id |
| contact_id | String (UUID) | FOREIGN KEY → crm_contacts.id (nullable) |
| deal_id | String (UUID) | FOREIGN KEY → crm_deals.id (nullable) |
| visit_type | PropertyVisitType (enum) | DEFAULT: VISIT |
| goal | PropertyVisitGoal (enum) | nullable |
| scheduled_at | DateTime | |
| duration | Int | nullable |
| location | String | nullable |
| status | PropertyVisitStatus (enum) | DEFAULT: SCHEDULED |
| assigned_to_user_id | String (UUID) | FOREIGN KEY → users.id (nullable) |
| notes | String (Text) | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- property_id
- contact_id
- deal_id
- scheduled_at
- assigned_to_user_id
- status

**Enums:**
- **PropertyVisitType**: VISIT, APPOINTMENT
- **PropertyVisitGoal**: CONTACT_TAKING, NETWORKING, EVALUATION, CONTRACT_SIGNING, FOLLOW_UP, NEGOTIATION, OTHER
- **PropertyVisitStatus**: SCHEDULED, CONFIRMED, DONE, NO_SHOW, CANCELED

---

## Table: `property_visit_collaborators`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| visit_id | String (UUID) | FOREIGN KEY → property_visits.id |
| user_id | String (UUID) | FOREIGN KEY → users.id |
| created_at | DateTime | |

**Indexes:**
- visit_id
- user_id
- UNIQUE: visit_id, user_id

---

## Table: `property_mandates`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| property_id | String (UUID) | FOREIGN KEY → properties.id |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| owner_user_id | String (UUID) | FOREIGN KEY → users.id |
| start_date | DateTime | |
| end_date | DateTime | nullable |
| scope | Json | nullable |
| notes | String (Text) | nullable |
| is_active | Boolean | DEFAULT: true |
| revoked_at | DateTime | nullable |
| revoked_by_user_id | String (UUID) | FOREIGN KEY → users.id (nullable) |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- property_id
- tenant_id
- owner_user_id
- is_active
- UNIQUE: property_id, tenant_id, is_active

---

## Table: `property_quality_scores`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| property_id | String (UUID) | FOREIGN KEY → properties.id |
| score | Int | |
| suggestions | Json | |
| calculated_at | DateTime | |

**Indexes:**
- property_id
- property_id, calculated_at

---

## Table: `countries`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| code | String | UNIQUE |
| name | String | |
| name_fr | String | nullable |
| is_active | Boolean | DEFAULT: true |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- code
- is_active

---

## Table: `regions`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| country_id | String (UUID) | FOREIGN KEY → countries.id |
| code | String | nullable |
| name | String | |
| name_fr | String | nullable |
| capital | String | nullable |
| is_active | Boolean | DEFAULT: true |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- country_id
- code
- is_active
- UNIQUE: country_id, name

---

## Table: `communes`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| region_id | String (UUID) | FOREIGN KEY → regions.id |
| code | String | nullable |
| name | String | |
| name_fr | String | nullable |
| is_active | Boolean | DEFAULT: true |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- region_id
- code
- is_active
- UNIQUE: region_id, name

---

## Table: `refresh_tokens`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| token | String | UNIQUE |
| user_id | String (UUID) | FOREIGN KEY → users.id |
| expires_at | DateTime | |
| created_at | DateTime | |
| revoked | Boolean | DEFAULT: false |
| revoked_at | DateTime | nullable |
| device_info | String | nullable |

**Indexes:**
- user_id
- token

---

## Table: `role_permissions`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| role_id | String (UUID) | FOREIGN KEY → roles.id |
| permission_id | String (UUID) | FOREIGN KEY → permissions.id |
| created_at | DateTime | |

**Indexes:**
- role_id
- permission_id
- UNIQUE: role_id, permission_id

---

## Table: `roles`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| key | String | UNIQUE |
| name | String | |
| description | String (Text) | nullable |
| scope | RoleScope (enum) | |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- scope
- key

**Enum: RoleScope**
- PLATFORM
- TENANT

---

## Table: `subscriptions`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id, UNIQUE |
| plan_key | SubscriptionPlan (enum) | |
| billing_cycle | BillingCycle (enum) | |
| status | SubscriptionStatus (enum) | DEFAULT: TRIALING |
| start_at | DateTime | |
| current_period_start | DateTime | |
| current_period_end | DateTime | |
| cancel_at | DateTime | nullable |
| canceled_at | DateTime | nullable |
| metadata | Json | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- status
- plan_key

**Enums:**
- **SubscriptionPlan**: BASIC, PRO, ELITE
- **BillingCycle**: MONTHLY, ANNUAL
- **SubscriptionStatus**: TRIALING, ACTIVE, PAST_DUE, CANCELED, SUSPENDED

---

## Table: `tenant_clients`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| user_id | String (UUID) | FOREIGN KEY → users.id |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| client_type | ClientType (enum) | |
| details | Json | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- user_id
- tenant_id
- UNIQUE: user_id, tenant_id

**Enum: ClientType**
- OWNER
- RENTER
- BUYER
- CO_OWNER

---

## Table: `tenant_modules`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| tenant_id | String (UUID) | FOREIGN KEY → tenants.id |
| module_key | ModuleKey (enum) | |
| enabled | Boolean | DEFAULT: false |
| enabled_at | DateTime | nullable |
| enabled_by | String | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- tenant_id
- module_key
- UNIQUE: tenant_id, module_key

**Enum: ModuleKey**
- MODULE_AGENCY
- MODULE_SYNDIC
- MODULE_PROMOTER

---

## Table: `tenants`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| name | String | |
| slug | String | UNIQUE |
| type | TenantType (enum) | |
| logo_url | String | nullable |
| website | String | nullable |
| is_active | Boolean | DEFAULT: true |
| legal_name | String | nullable |
| status | TenantStatus (enum) | DEFAULT: PENDING |
| contact_email | String | nullable |
| contact_phone | String | nullable |
| country | String | nullable |
| city | String | nullable |
| address | String | nullable |
| branding_primary_color | String | nullable |
| subdomain | String | UNIQUE, nullable |
| custom_domain | String | nullable |
| last_activity_at | DateTime | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- slug
- status
- contact_email

**Enum: TenantType**
- AGENCY
- OPERATOR

**Enum: TenantStatus**
- PENDING
- ACTIVE
- SUSPENDED

---

## Table: `user_roles`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| user_id | String (UUID) | FOREIGN KEY → users.id |
| role_id | String (UUID) | FOREIGN KEY → roles.id |
| tenant_id | String (UUID) | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- user_id
- role_id
- tenant_id
- UNIQUE: user_id, role_id, tenant_id

---

## Table: `users`

| Column | Type | Constraints |
|--------|------|-------------|
| id | String (UUID) | PRIMARY KEY |
| email | String | UNIQUE |
| password_hash | String | nullable |
| google_id | String | UNIQUE, nullable |
| full_name | String | nullable |
| avatar_url | String | nullable |
| global_role | GlobalRole (enum) | DEFAULT: USER |
| email_verified | Boolean | DEFAULT: false |
| is_active | Boolean | DEFAULT: true |
| last_login_at | DateTime | nullable |
| created_at | DateTime | |
| updated_at | DateTime | |

**Indexes:**
- email

**Enum: GlobalRole**
- SUPER_ADMIN
- USER

---

## Summary

**Total Tables:** 39

1. audit_logs
2. crm_activities
3. crm_appointment_collaborators
4. crm_appointments
5. crm_contact_roles
6. crm_contact_tags
7. crm_contacts
8. crm_deal_properties
9. crm_deals
10. crm_notes
11. crm_tags
12. email_verification_tokens
13. invitations
14. invoices
15. memberships
16. password_reset_tokens
17. permissions
18. properties
19. property_documents
20. property_mandates
21. property_media
22. property_quality_scores
23. property_status_history
24. property_type_templates
25. property_visit_collaborators
26. property_visits
27. refresh_tokens
28. role_permissions
29. roles
30. subscriptions
31. tenant_clients
32. tenant_modules
33. tenants
34. user_roles
35. users
36. countries
37. regions
38. communes

---

## Fonctionnalités Implémentées

Ce document liste les fonctionnalités déjà développées et opérationnelles dans l'application Immobillier.

### 🔐 Authentification et Utilisateurs

#### Backend (API)
- ✅ **Inscription** : Création de compte avec validation d'email
- ✅ **Connexion** : Authentification par email/mot de passe
- ✅ **OAuth Google** : Authentification via Google OAuth 2.0
- ✅ **JWT Tokens** : Access tokens (15min) et refresh tokens (7 jours)
- ✅ **Vérification d'email** : Système de vérification avec tokens expirables
- ✅ **Réinitialisation de mot de passe** : Flux complet de récupération
- ✅ **Refresh Token** : Renouvellement automatique des sessions
- ✅ **Gestion des sessions** : Révocation de sessions multiples

#### Frontend (React)
- ✅ Pages de connexion et inscription
- ✅ Gestion des tokens via cookies HTTP-only
- ✅ Callback OAuth Google
- ✅ Interface de vérification d'email
- ✅ Pages de réinitialisation de mot de passe

### 🏢 Multi-Tenant et RBAC

#### Backend (API)
- ✅ **Gestion des tenants** : Création, édition, activation/suspension
- ✅ **Isolation des données** : Middleware d'isolation tenant
- ✅ **Système de rôles** : RBAC avec rôles PLATFORM et TENANT
- ✅ **Permissions** : Système de permissions granulaires
- ✅ **Membres (Memberships)** : Gestion des relations user-tenant
- ✅ **Invitations** : Système d'invitation avec tokens sécurisés
- ✅ **Modules tenant** : Activation/désactivation de modules (AGENCY, SYNDIC, PROMOTER)

#### Frontend (React)
- ✅ Administration des tenants (liste, détails, création)
- ✅ Gestion des collaborateurs (liste, invitations, rôles)
- ✅ Interface de gestion des modules
- ✅ Page d'acceptation d'invitation
- ✅ Tableau de bord administratif

### 📊 Module CRM

#### Backend (API)
- ✅ **Contacts** : CRUD complet avec gestion de statuts (LEAD, ACTIVE_CLIENT, ARCHIVED)
- ✅ **Deals (Affaires)** : Gestion des opportunités avec pipeline (NEW → QUALIFIED → APPOINTMENT → VISIT → NEGOTIATION → WON/LOST)
- ✅ **Activités** : Suivi des interactions (CALL, EMAIL, SMS, WHATSAPP, VISIT, MEETING, NOTE, TASK)
- ✅ **Rendez-vous** : Création, gestion, report avec collaborateurs
- ✅ **Calendrier** : Vue calendrier des rendez-vous et suivis
- ✅ **Tags** : Système de tags colorés pour les contacts
- ✅ **Rôles de contact** : Gestion des rôles (PROPRIETAIRE, LOCATAIRE, COPROPRIETAIRE, ACQUEREUR)
- ✅ **Notes** : Ajout de notes sur contacts, deals et propriétés
- ✅ **Matching propriétés** : Algorithme de matching de propriétés avec deals
- ✅ **Dashboard CRM** : Statistiques et indicateurs de performance
- ✅ **RBAC CRM** : Permissions spécifiques par fonctionnalité CRM

#### Frontend (React)
- ✅ Liste et détail des contacts
- ✅ Formulaire de création/édition de contacts
- ✅ Conversion de lead en client
- ✅ Gestion des deals (vue liste et kanban)
- ✅ Formulaire de deals avec critères avancés
- ✅ Timeline des activités
- ✅ Calendrier des rendez-vous
- ✅ Gestion des tags (création, attribution, suppression)
- ✅ Interface de matching de propriétés
- ✅ Dashboard CRM avec statistiques

### 🏠 Module Propriétés

#### Backend (API)
- ✅ **CRUD Propriétés** : Création, lecture, mise à jour, suppression
- ✅ **Types de propriétés** : 12 types supportés (APPARTEMENT, MAISON_VILLA, STUDIO, etc.)
- ✅ **Templates** : Templates configurables par type de propriété
- ✅ **Médias** : Upload et gestion de photos, vidéos, tours 360°
- ✅ **Documents** : Gestion de documents avec suivi d'expiration (TITLE_DEED, MANDATE, PLAN, TAX_DOCUMENT)
- ✅ **Statuts** : Workflow de statuts (DRAFT → UNDER_REVIEW → AVAILABLE → RESERVED/UNDER_OFFER → RENTED/SOLD → ARCHIVED)
- ✅ **Historique de statuts** : Traçabilité complète des changements
- ✅ **Visites** : Planification et gestion des visites de propriétés
- ✅ **Mandats** : Gestion des mandats de vente/location
- ✅ **Score de qualité** : Calcul automatique de score de qualité
- ✅ **Recherche avancée** : Filtres multiples (prix, surface, localisation, type, etc.)
- ✅ **Publication** : Publication/dépublication de propriétés
- ✅ **Propriétés publiques** : API publique pour consultation

#### Frontend (React)
- ✅ Liste et recherche de propriétés avec filtres avancés
- ✅ Formulaire de création/édition (wizard multi-étapes)
- ✅ Galerie de médias avec réorganisation
- ✅ Upload de documents avec prévisualisation
- ✅ Gestion du workflow de statuts
- ✅ Calendrier des visites
- ✅ Formulaire de mandat
- ✅ Affichage du score de qualité
- ✅ Vue publique des propriétés publiées
- ✅ Sélecteur de type de propriété avec templates

### 📍 Géographie

#### Backend (API)
- ✅ **Pays** : Gestion des pays (ISO codes)
- ✅ **Régions** : Gestion des régions par pays
- ✅ **Communes** : Gestion des communes par région
- ✅ **Recherche de localisation** : API de recherche géographique

#### Frontend (React)
- ✅ Composant de sélection de localisation (pays/région/commune)

### 💳 Abonnements et Facturation

#### Backend (API)
- ✅ **Abonnements** : Gestion des plans (BASIC, PRO, ELITE)
- ✅ **Cycles de facturation** : Mensuel et annuel
- ✅ **Statuts** : TRIALING, ACTIVE, PAST_DUE, CANCELED, SUSPENDED
- ✅ **Factures** : Création et gestion des factures
- ✅ **Historique de paiement** : Suivi des paiements

### 🔍 Audit et Logs

#### Backend (API)
- ✅ **Audit Logs** : Enregistrement de toutes les actions importantes
- ✅ **Filtrage** : Par tenant, utilisateur, type d'action, date
- ✅ **Statistiques** : Statistiques globales et par tenant

#### Frontend (React)
- ✅ Page de consultation des logs d'audit
- ✅ Filtres de recherche avancés

### 🛡️ Sécurité

#### Backend (API)
- ✅ **Rate Limiting** : Limitation de taux sur les endpoints sensibles
- ✅ **Helmet** : Protection des en-têtes HTTP
- ✅ **CORS** : Configuration CORS sécurisée
- ✅ **Validation** : Validation Zod sur tous les endpoints
- ✅ **Hashing** : Bcrypt pour les mots de passe
- ✅ **Isolation tenant** : Vérification systématique de l'accès tenant
- ✅ **RBAC middleware** : Middleware de contrôle d'accès basé sur les rôles

### 📡 API et Routes

#### Routes principales implémentées
- ✅ `/api/auth/*` : Authentification (11 endpoints)
- ✅ `/api/tenants/*` : Gestion des tenants (9+ endpoints)
- ✅ `/api/admin/*` : Administration platform (tenants, stats, audit)
- ✅ `/api/roles/*` : Gestion des rôles et permissions
- ✅ `/api/tenants/:tenantId/crm/*` : Module CRM (30+ endpoints)
- ✅ `/api/properties/*` : Module propriétés (20+ endpoints)
- ✅ `/api/public/properties/*` : API publique propriétés (2 endpoints)
- ✅ `/api/geographic/*` : API géographique (4 endpoints)
- ✅ `/api/memberships/*` : Gestion des membres (7 endpoints)
- ✅ `/api/invitations/*` : Gestion des invitations (4 endpoints)
- ✅ `/api/subscriptions/*` : Abonnements et factures (7+ endpoints)

### 📦 Technologies et Architecture

#### Backend
- ✅ **Node.js + Express** : Serveur API REST
- ✅ **TypeScript** : Typage statique complet
- ✅ **Prisma ORM** : Gestion de base de données avec migrations
- ✅ **PostgreSQL** : Base de données relationnelle
- ✅ **JWT** : Authentification par tokens
- ✅ **Passport.js** : OAuth Google
- ✅ **Multer** : Upload de fichiers
- ✅ **Zod** : Validation de schémas
- ✅ **Nodemailer** : Envoi d'emails

#### Frontend
- ✅ **React 18** : Framework UI
- ✅ **TypeScript** : Typage statique
- ✅ **React Router** : Navigation
- ✅ **Tailwind CSS** : Styles utilitaires
- ✅ **Lucide React** : Icônes
- ✅ **Radix UI** : Composants UI accessibles
- ✅ **Context API** : Gestion d'état (AuthContext)
- ✅ **Axios** : Client HTTP

### 📊 Statistiques

- **Total de tables** : 39
- **Endpoints API** : 100+ endpoints
- **Pages React** : 30+ pages
- **Composants React** : 40+ composants réutilisables
- **Services backend** : 20+ services métier
- **Contrôleurs** : 20+ contrôleurs
- **Middlewares** : 10+ middlewares de sécurité et validation
