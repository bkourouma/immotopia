# Quickstart: Newsletter et Mailing

**Feature**: 012-newsletter-mailing  
**Date**: 2026-02-11

Ce guide permet de vérifier que l'environnement et les livrables du feature sont en place et fonctionnent (après implémentation).

## Prérequis

- Node.js et npm/pnpm installés
- PostgreSQL accessible (variable `DATABASE_URL`)
- Backend API démarré (`packages/api`) avec routes montées sous `/api`
- Frontend démarré (`apps/web`) avec accès à l'API
- Configuration email (SMTP ou SendGrid) via `EMAIL_SMTP_*` ou `SENDGRID_API_KEY`
- Utilisateur authentifié avec JWT valide et accès à au moins un tenant (rôle agence)

## 1. Migrations Prisma

Depuis la racine du repo :

```bash
cd packages/api
npx prisma migrate dev --name add_newsletter_mailing
```

Ou en production : `npx prisma migrate deploy`

Vérifier que les tables suivantes existent :

- `newsletter_lists`
- `newsletter_subscribers`
- `newsletter_campaigns`
- `newsletter_campaign_recipients`
- `newsletter_templates`

Et les enums :

- `NewsletterListType`, `NewsletterSubscriberStatus`, `NewsletterCampaignStatus`, `NewsletterCampaignRecipientStatus`

## 2. Backend — Listes

- **Lister les listes**  
  `GET /api/tenants/:tenantId/newsletter/lists`  
  Headers : `Authorization: Bearer <token>`  
  Attendu : `200` avec un tableau (éventuellement vide).

- **Créer une liste manuelle**  
  `POST /api/tenants/:tenantId/newsletter/lists`  
  Body : `{ "name": "Prospects site", "type": "MANUAL" }`  
  Attendu : `201` avec l'objet liste.

## 3. Backend — Abonnés (liste MANUAL)

- **Ajouter un abonné**  
  `POST /api/tenants/:tenantId/newsletter/lists/:listId/subscribers`  
  Body : `{ "email": "test@example.com", "name": "Test" }`  
  Attendu : `201` avec l'abonné.

- **Lister les abonnés**  
  `GET /api/tenants/:tenantId/newsletter/lists/:listId/subscribers?page=1&limit=20`  
  Attendu : `200` avec `{ subscribers: [...], pagination }`.

- **Importer CSV**  
  `POST /api/tenants/:tenantId/newsletter/lists/:listId/import`  
  Form-data : `file` = fichier CSV (colonnes : email, name)  
  Attendu : `200` avec `{ accepted, rejected, duplicateCount }`.

- **Exporter**  
  `GET /api/tenants/:tenantId/newsletter/lists/:listId/export`  
  Attendu : `200` avec téléchargement CSV.

## 4. Backend — Campagnes

- **Créer une campagne**  
  `POST /api/tenants/:tenantId/newsletter/campaigns`  
  Body : `{ "listId": "<id>", "subject": "Test", "bodyHtml": "Bonjour {{prenom}}, <a href=\"{{lien_desinscription}}\">Désinscription</a>" }`  
  Attendu : `201` avec la campagne (status DRAFT).

- **Aperçu**  
  `GET /api/tenants/:tenantId/newsletter/campaigns/:campaignId/preview`  
  Attendu : `200` avec `{ subject, html }`.

- **Envoyer immédiatement**  
  `POST /api/tenants/:tenantId/newsletter/campaigns/:campaignId/send`  
  Attendu : `200` ; statut passe à SENDING puis SENT.

- **Planifier**  
  `POST /api/tenants/:tenantId/newsletter/campaigns/:campaignId/schedule`  
  Body : `{ "scheduledAt": "2026-02-12T10:00:00.000Z" }`  
  Attendu : `200` ; statut = SCHEDULED.

- **Annuler**  
  `POST /api/tenants/:tenantId/newsletter/campaigns/:campaignId/cancel`  
  Attendu : `200` ; statut = CANCELLED.

- **Historique et stats**  
  `GET /api/tenants/:tenantId/newsletter/campaigns`  
  `GET /api/tenants/:tenantId/newsletter/campaigns/:campaignId`  
  Attendu : stats sentCount, failedCount, unsubscribeCount.

## 5. Backend — Templates

- **Créer un template**  
  `POST /api/tenants/:tenantId/newsletter/templates`  
  Body : `{ "name": "Layout standard", "html": "<div>{{contenu}}</div><p>{{lien_desinscription}}</p>" }`  
  Attendu : `201`.

## 6. Endpoints publics

- **Inscription**  
  `POST /api/newsletter/subscribe` (sans auth)  
  Body : `{ "email": "nouveau@example.com", "listId": "<id>" }` ou `{ "listToken": "<token>", "email": "...", "name": "..." }`  
  Attendu : `201` ; email de confirmation envoyé.

- **Confirmation**  
  Ouvrir dans le navigateur : `GET /api/newsletter/confirm?token=<token>`  
  Attendu : page ou redirect « Inscription confirmée ».

- **Désinscription**  
  Ouvrir : `GET /api/newsletter/unsubscribe?token=<token>` ou POST avec body `{ "token": "<token>", "unsubscribeAll": true }`  
  Attendu : page « Vous êtes désabonné ».

## 7. Job des campagnes planifiées

Le job s'exécute toutes les minutes et traite les campagnes SCHEDULED dont `scheduled_at <= now()`.

Pour valider :

- Créer une campagne, la planifier à une date/heure proche (ex. +2 min).
- Attendre 2–3 minutes.
- Vérifier que le statut passe à SENT et que les destinataires ont reçu l'email.

## 8. Frontend — Vérifications rapides

- **Dashboard listes** : page `/tenant/:tenantId/newsletter/lists` — liste des listes avec compteurs (total, actifs, désinscrits).
- **Détail liste** : liste des abonnés avec statuts, boutons Import / Export. Pour listes dérivées : message explicatif + Export.
- **Création campagne** : `/tenant/:tenantId/newsletter/campaigns` — choix de liste, saisie sujet/corps HTML, variables {{lien_desinscription}} obligatoire.
- **Historique campagnes** : filtres par statut, statistiques par campagne.
- **Templates** : `/tenant/:tenantId/newsletter/templates` — CRUD templates réutilisables.
- **RBAC** : les routes newsletter sont réservées aux collaborateurs du tenant (requireTenantCollaborator).

## 9. Vérifications sécurité (T057, T058)

- **RBAC (T057)** : Les routes `/api/tenants/:tenantId/newsletter/*` utilisent `requireTenantCollaborator` — accès réservé aux collaborateurs du tenant (admins, managers, agents), pas aux clients (propriétaires, locataires).
- **Isolation tenant (T058)** : Tous les services newsletter (list, subscriber, campaign, template) filtrent par `tenantId` dans chaque requête Prisma. Le controller utilise `req.tenantContext?.tenantId` (validé par le middleware).

---

**Références** : [spec.md](../spec.md) | [data-model.md](../data-model.md) | [contracts/openapi.yaml](../contracts/openapi.yaml) | [plan.md](../plan.md) | [research.md](../research.md)
