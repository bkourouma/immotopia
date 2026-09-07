# Prompt – Système Newsletter et Mailing (type MailChimp)

**Contexte** : Intégration d’un module Newsletter / mailing dans l’application ImmoTopia, en s’appuyant sur le module de communication existant (notifications email, templates, provider SMTP/SendGrid) et en adaptant les fonctionnalités d’une application type MailChimp.

**Isolation** : Toutes les données et actions sont scopées par `tenant_id` (agence). Aucun accès cross-tenant.

---

## 1. Objectifs

- Permettre aux **agences** (tenants) de gérer des **listes de diffusion** et d’envoyer des **campagnes newsletter** par email.
- Réutiliser l’infrastructure email existante (EmailService, provider, templates).
- Respecter la conformité (opt-in, désinscription, RGPD) et les bonnes pratiques anti-spam.

---

## 2. Fonctionnalités à implémenter

### 2.1 Listes de diffusion (audiences)

- **Entité Liste** : nom, type, `tenant_id`.
- **Types de listes** :
  - **MANUAL** : liste saisie/importée manuellement (prospects, abonnés site).
  - **FROM_OWNERS** : dérivée des propriétaires du tenant (avec consentement newsletter).
  - **FROM_RENTERS** : dérivée des locataires (avec consentement newsletter).
  - **FROM_CRM_CONTACTS** : dérivée des contacts CRM (avec consentement newsletter).
- **CRUD** : création, modification, suppression de listes (back-office agence).
- **Import CSV** : pour listes manuelles uniquement (colonnes : email, nom optionnel). Validation des emails, doublons gérés (même liste).
- **Export** : export des abonnés d’une liste (email, date d’inscription, statut) en CSV.

### 2.2 Abonnés (subscribers)

- **Entité Abonné** : `tenant_id`, `list_id`, email, statut, dates (inscription, confirmation, désinscription), optionnellement `source_entity_type` et `source_entity_id` pour listes dérivées.
- **Statuts** : `PENDING_CONFIRMATION` (double opt-in en attente), `ACTIVE`, `UNSUBSCRIBED`.
- Pour listes **dérivées** (OWNERS, RENTERS, CRM_CONTACTS) : les abonnés sont résolus à l’envoi à partir des entités existantes ayant accepté la newsletter (champ ou préférence à prévoir). Pas d’import CSV pour ces listes.
- Pour liste **MANUAL** : ajout manuel ou import CSV ; double opt-in possible pour inscriptions via formulaire public.

### 2.3 Double opt-in (formulaire public)

- **Inscription** : route publique (sans auth) `POST /api/newsletter/subscribe` (email, identifiant de liste ou token public de liste).
- Après soumission : envoi d’un email de **confirmation** contenant un lien unique (token).
- **Confirmation** : `GET /api/newsletter/confirm?token=...` valide le token et passe l’abonné en `ACTIVE`. Réponse : page ou redirect « Merci, votre inscription est confirmée ».
- Option : paramètre pour activer/désactiver le double opt-in par liste (listes internes = simple opt-in, formulaire public = double opt-in recommandé).

### 2.4 Désinscription et préférences

- **Lien de désinscription** : obligatoire dans chaque email de campagne. URL unique par destinataire (token ou lien signé) pointant vers une page de désabonnement.
- **Page de désabonnement** : accessible sans auth ; affiche « Vous êtes désabonné » et met à jour le statut de l’abonné en `UNSUBSCRIBED`. Option : choix « Désabonnement de toutes les listes du tenant ».
- Raccordement possible aux **préférences de communication** existantes (spec 010) : option « Accepte la newsletter » par canal (email).

### 2.5 Campagnes newsletter

- **Entité Campagne** : `tenant_id`, `list_id` (ou référence à un segment), sujet, corps HTML, statut, `scheduled_at`, `sent_at`, `created_at`, `updated_at`.
- **Statuts** : `DRAFT`, `SCHEDULED`, `SENDING`, `SENT`, `CANCELLED`.
- **Création** : choix de la liste (ou segment simple), saisie sujet et corps HTML. Variables supportées dans le corps : `{{prenom}}`, `{{nom}}`, `{{email}}`, `{{lien_desinscription}}`, `{{contenu}}` (ou équivalent).
- **Envoi** : immédiat ou planifié à une date/heure. À l’heure d’envoi (job ou traitement différé), résolution des destinataires (liste + statut ACTIVE, hors UNSUBSCRIBED), puis envoi via le provider email existant.
- **Annulation** : une campagne en statut `SCHEDULED` peut être annulée avant l’heure d’envoi (passage en `CANCELLED`).
- **Historique par campagne** : enregistrement par destinataire (email, statut envoyé/échec, `sent_at`, raison d’échec si applicable) pour statistiques et conformité.

### 2.6 Templates newsletter

- **Templates réutilisables** pour les campagnes : mise en page HTML (en-tête, corps, pied de page avec lien de désinscription et adresse postale si nécessaire).
- Variables : `{{prenom}}`, `{{nom}}`, `{{email}}`, `{{lien_desinscription}}`, `{{contenu}}` (contenu principal de la campagne).
- CRUD templates newsletter dans le back-office (scope tenant). Les campagnes peuvent sélectionner un template puis définir le contenu (sujet + bloc contenu).

### 2.7 Segmentation (simple)

- **Segmentation V1** : choix du type de destinataires au moment de la campagne :
  - Une **liste** (MANUAL, FROM_OWNERS, FROM_RENTERS, FROM_CRM_CONTACTS), ou
  - Filtres basiques optionnels : ex. « locataires avec bail actif », « contacts CRM avec étape = X » (si les modèles le permettent).
- Pas de segments avancés (scores, tags multiples, comportement) en V1.

### 2.8 Statistiques et historique

- **Par campagne** : nombre d’emails envoyés, nombre d’échecs (avec raison si fournie par le provider), nombre de désinscriptions après envoi.
- **Historique des campagnes** : liste des campagnes (date, liste, statut, nb envoyés / échecs) avec filtres (période, statut).
- **Optionnel V2** : taux d’ouverture (pixel 1x1) et clics (liens trackés). Non exigé en V1.

### 2.9 Conformité et bonnes pratiques

- **Consentement** : pour listes dérivées, n’envoyer qu’aux entités ayant explicitement accepté la newsletter (champ ou préférence).
- **Preuves** : conserver `subscribed_at`, `confirmed_at`, `unsubscribed_at` pour chaque abonné.
- **Lien de désinscription** : présent dans chaque email de campagne ; page de désabonnement fonctionnelle.
- **Rate limiting** : sur les endpoints d’inscription publique et d’envoi de campagnes pour éviter les abus.

---

## 3. Fonctionnalités exclues (ou reportées)

- **Éditeur drag-and-drop** type MailChimp : en V1, éditeur HTML / texte riche + variables uniquement.
- **A/B testing** (sujet ou contenu) : non prévu en V1.
- **Automations complexes** (welcome series, drip) : possible en phase 2 via règles métier.
- **Newsletter par SMS/WhatsApp** : rester sur l’email pour la newsletter ; SMS/WhatsApp restent pour notifications et annonces (spec 010).

---

## 4. Entités et flux techniques (résumé)

| Entité                | Champs principaux |
|-----------------------|-------------------|
| **NewsletterList**    | `id`, `tenant_id`, `name`, `type` (MANUAL \| FROM_OWNERS \| FROM_RENTERS \| FROM_CRM_CONTACTS), `double_opt_in` (bool), `public_subscribe_token` (optionnel), `created_at`, `updated_at` |
| **NewsletterSubscriber** | `id`, `tenant_id`, `list_id`, `email`, `name` (optionnel), `status` (PENDING_CONFIRMATION \| ACTIVE \| UNSUBSCRIBED), `source_entity_type`, `source_entity_id`, `subscribed_at`, `confirmed_at`, `unsubscribed_at`, `confirmation_token`, `created_at`, `updated_at` |
| **NewsletterCampaign** | `id`, `tenant_id`, `list_id`, `template_id` (optionnel), `subject`, `body_html`, `status`, `scheduled_at`, `sent_at`, `created_at`, `updated_at`, `created_by` |
| **NewsletterCampaignRecipient** (ou équivalent) | `id`, `campaign_id`, `email`, `status` (SENT \| FAILED), `sent_at`, `failure_reason` (optionnel) |

- **Routes back-office** (authentifiées, RBAC agence) : CRUD listes, CRUD abonnés (listes manuelles), import/export, CRUD templates newsletter, CRUD campagnes, envoi immédiat, planification, annulation, historique et stats.
- **Routes publiques** (sans auth) : `POST /api/newsletter/subscribe`, `GET /api/newsletter/confirm?token=...`, `GET /api/newsletter/unsubscribe?token=...` (ou équivalent).

---

## 5. Stack et conventions

- **Backend** : TypeScript (Node.js, Express), Prisma, PostgreSQL. Endpoints préfixés par `/api`, isolation par `tenant_id`.
- **Validation** : Zod ou class-validator pour les corps de requêtes.
- **Naming** : modèles PascalCase, tables snake_case, fichiers kebab-case.
- **Tests** : couverture minimale 80 %, tests unitaires et d’intégration pour services et routes critiques (inscription, confirmation, envoi, désinscription).

---

## 6. Livrables attendus

1. **Schéma Prisma** : modèles `NewsletterList`, `NewsletterSubscriber`, `NewsletterCampaign`, `NewsletterCampaignRecipient`, et éventuellement `NewsletterTemplate` ; migrations.
2. **Services** : `NewsletterListService`, `NewsletterSubscriberService`, `NewsletterCampaignService` (création, planification, exécution d’envoi, annulation), intégration avec le provider email existant.
3. **Controllers / routes** : back-office (listes, abonnés, templates, campagnes) et routes publiques (subscribe, confirm, unsubscribe).
4. **Jobs** : traitement des campagnes planifiées (ex. cron toutes les minutes) et envoi en lot avec enregistrement des statuts.
5. **Documentation** : mise à jour des specs (ou contrat API) pour les nouveaux endpoints ; commentaires JSDoc sur les services publics.

---

*Document de prompt pour l’implémentation du module Newsletter/Mailing – module Communication ImmoTopia (010).*
