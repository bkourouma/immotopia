# Data Model: Newsletter et Mailing

**Feature**: 012-newsletter-mailing  
**Date**: 2026-02-11

## Overview

Ce document décrit les entités et relations ajoutées pour le module newsletter/mailing. Les modèles existants Tenant, User, TenantClient, CrmContact sont étendus ou référencés pour les listes dérivées.

---

## Enums (nouveaux)

| Enum | Valeurs | Usage |
|------|---------|-------|
| **NewsletterListType** | MANUAL, FROM_OWNERS, FROM_RENTERS, FROM_CRM_CONTACTS | Type de liste |
| **NewsletterSubscriberStatus** | PENDING_CONFIRMATION, ACTIVE, UNSUBSCRIBED | Statut de l'abonné |
| **NewsletterCampaignStatus** | DRAFT, SCHEDULED, SENDING, SENT, CANCELLED, FAILED | Statut de la campagne |
| **NewsletterCampaignRecipientStatus** | SENT, FAILED | Statut d'envoi par destinataire |

---

## 1. NewsletterList

Liste de diffusion pour un tenant.

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | Identifiant unique |
| tenant_id | String | FK → Tenant, NOT NULL | Isolation tenant |
| name | String | NOT NULL | Nom de la liste (unique par tenant) |
| type | NewsletterListType | NOT NULL | MANUAL, FROM_OWNERS, FROM_RENTERS, FROM_CRM_CONTACTS |
| double_opt_in | Boolean | DEFAULT true | Double opt-in pour inscriptions publiques |
| public_subscribe_token | String? | UNIQUE | Token pour formulaire public (liste publique) |
| created_at | DateTime | DEFAULT now() | |
| updated_at | DateTime | @updatedAt | |

**Contraintes d'unicité**: (tenant_id, name)

**Relations**: Tenant, NewsletterSubscriber[], NewsletterCampaign[]

**Index**: (tenant_id), (tenant_id, type)

---

## 2. NewsletterSubscriber

Abonné à une liste (manuel ou dérivé).

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | |
| tenant_id | String | FK → Tenant, NOT NULL | |
| list_id | String | FK → NewsletterList, NOT NULL | |
| email | String | NOT NULL | |
| name | String? | | Nom optionnel |
| status | NewsletterSubscriberStatus | DEFAULT PENDING_CONFIRMATION | |
| confirmation_token | String? | UNIQUE | Token pour double opt-in |
| confirmation_token_expires_at | DateTime? | | Expiration du token (ex. 7 jours) |
| subscribed_at | DateTime | DEFAULT now() | |
| confirmed_at | DateTime? | | Date de confirmation |
| unsubscribed_at | DateTime? | | Date de désinscription |
| source_entity_type | String? | | "TenantClient", "CrmContact" pour listes dérivées |
| source_entity_id | String? | | ID de l'entité source |
| created_at | DateTime | DEFAULT now() | |
| updated_at | DateTime | @updatedAt | |

**Contraintes d'unicité**: (list_id, email) — un email ne peut être qu'une fois par liste

**Relations**: Tenant, NewsletterList, NewsletterCampaignRecipient[] (via campaign sends)

**Index**: (tenant_id), (list_id), (list_id, status), (email, list_id), (confirmation_token)

---

## 3. NewsletterCampaign

Campagne email envoyée à une liste.

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | |
| tenant_id | String | FK → Tenant, NOT NULL | |
| list_id | String | FK → NewsletterList, NOT NULL | |
| template_id | String? | FK → NewsletterTemplate | Template optionnel |
| subject | String | NOT NULL | Sujet de l'email |
| body_html | Text | NOT NULL | Corps HTML (avec variables) |
| rendered_html | Text? | | HTML final rendu (template + contenu) après envoi |
| status | NewsletterCampaignStatus | DEFAULT DRAFT | |
| scheduled_at | DateTime? | | Date/heure d'envoi planifié |
| sent_at | DateTime? | | Date effective d'envoi |
| created_by_id | String? | FK → User | Créateur |
| created_at | DateTime | DEFAULT now() | |
| updated_at | DateTime | @updatedAt | |

**Relations**: Tenant, NewsletterList, NewsletterTemplate?, User (created_by), NewsletterCampaignRecipient[]

**Index**: (tenant_id), (list_id), (status), (scheduled_at), (sent_at)

---

## 4. NewsletterCampaignRecipient

Résultat d'envoi par destinataire.

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | |
| campaign_id | String | FK → NewsletterCampaign, NOT NULL | |
| tenant_id | String | FK → Tenant, NOT NULL | |
| subscriber_id | String? | FK → NewsletterSubscriber | Référence si abonné connu |
| email | String | NOT NULL | Email du destinataire |
| status | NewsletterCampaignRecipientStatus | NOT NULL | SENT ou FAILED |
| sent_at | DateTime? | | Date d'envoi |
| failure_reason | String? | | Raison en cas d'échec |
| unsubscribe_token | String? | | Token unique pour lien désinscription |

**Relations**: NewsletterCampaign, NewsletterSubscriber?, Tenant

**Index**: (campaign_id), (tenant_id)

---

## 5. NewsletterTemplate

Template HTML réutilisable pour campagnes.

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PK | |
| tenant_id | String | FK → Tenant, NOT NULL | |
| name | String | NOT NULL | Nom du template |
| html | Text | NOT NULL | Structure HTML avec {{contenu}}, {{prenom}}, etc. |
| created_at | DateTime | DEFAULT now() | |
| updated_at | DateTime | @updatedAt | |

**Contraintes d'unicité**: (tenant_id, name) — noms uniques par tenant

**Relations**: Tenant, NewsletterCampaign[]

**Index**: (tenant_id)

---

## 6. Extensions aux modèles existants

### TenantClient (Owner / Renter)

- **newsletter_consent** Boolean @default(false) @map("newsletter_consent")  
  Consentement pour recevoir des newsletters. Nécessaire pour listes FROM_OWNERS et FROM_RENTERS.

### CrmContact

- Utiliser **consent_email** existant comme équivalent du consentement newsletter pour listes FROM_CRM_CONTACTS (ou ajouter `newsletter_consent` si distinction nécessaire).

---

## 7. Variables supportées dans campagnes

| Variable | Description | Valeur par défaut si absente |
|----------|-------------|------------------------------|
| {{prenom}} | Prénom du destinataire | "" ou "Cher abonné" |
| {{nom}} | Nom du destinataire | "" |
| {{email}} | Email | Email du destinataire |
| {{lien_desinscription}} | Lien unique de désinscription | Obligatoire |
| {{contenu}} | Contenu principal (dans template) | Contenu de la campagne |

---

## 8. Validations métier (hors schéma)

- **Listes dérivées** : pas d'import CSV ni d'ajout manuel ; les abonnés sont résolus à l'envoi.
- **Campagnes** : validation que `{{lien_desinscription}}` est présent avant envoi.
- **Double opt-in** : PENDING_CONFIRMATION exclus des envois ; confirmation_token expiré après 7 jours (subscriber reste PENDING mais non envoyé).
- **Unsubscribe** : UNSUBSCRIBED exclus de tous les envois futurs.
