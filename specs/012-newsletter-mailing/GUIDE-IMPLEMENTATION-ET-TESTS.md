# Guide complet : Module Newsletter et Mailing

**Feature** : 012-newsletter-mailing  
**Date** : 2026-02-11  
**Version** : 1.0

Ce guide décrit l'implémentation du module newsletter et explique comment tester toutes les fonctionnalités.

---

## Table des matières

1. [Vue d'ensemble du module](#1-vue-densemble-du-module)
2. [Architecture et structure des fichiers](#2-architecture-et-structure-des-fichiers)
3. [Prérequis et démarrage](#3-prérequis-et-démarrage)
4. [Processus d'implémentation](#4-processus-dimplémentation)
5. [Guide de tests par fonctionnalité](#5-guide-de-tests-par-fonctionnalité)
6. [Flux métier détaillés](#6-flux-métier-détaillés)
7. [Exemples de requêtes API (cURL)](#7-exemples-de-requêtes-api-curl)
8. [Dépannage](#8-dépannage)

---

## 1. Vue d'ensemble du module

Le module Newsletter permet aux agences (tenants) de :

- **Créer des listes de diffusion** : manuelles, ou dérivées (propriétaires, locataires, contacts CRM)
- **Gérer les abonnés** : ajout manuel, import CSV, export, suppression
- **Créer et envoyer des campagnes** : avec templates réutilisables, variables dynamiques
- **Planifier des envois** : via un job cron exécuté chaque minute
- **Inscription publique** : formulaire avec double opt-in (confirmation par email)
- **Désinscription** : lien unique dans chaque email

### Types de listes

| Type | Source des destinataires |
|------|--------------------------|
| MANUAL | Abonnés ajoutés manuellement ou importés |
| FROM_OWNERS | Propriétaires (TenantClient) avec newsletter_consent = true |
| FROM_RENTERS | Locataires avec newsletter_consent = true |
| FROM_CRM_CONTACTS | Contacts CRM avec consent_email = true |

---

## 2. Architecture et structure des fichiers

### Backend (`packages/api/src/`)

```
├── services/
│   ├── newsletter-list.service.ts      # CRUD listes, compteurs
│   ├── newsletter-subscriber.service.ts # Abonnés, import/export, subscribe/confirm
│   ├── newsletter-template.service.ts   # CRUD templates
│   └── newsletter-campaign.service.ts   # Campagnes, envoi, planification
├── controllers/
│   └── newsletter-controller.ts         # Handlers HTTP
├── routes/
│   ├── newsletter-routes.ts             # Routes authentifiées (/api/tenants/:tenantId/newsletter/)
│   └── newsletter-public-routes.ts      # Routes publiques (/api/newsletter/)
└── jobs/
    └── newsletter-campaign-scheduler.job.ts  # Job cron (campagnes planifiées)
```

### Frontend (`apps/web/src/`)

```
├── pages/newsletter/
│   ├── NewsletterListsPage.tsx      # Dashboard listes + détail abonnés
│   ├── NewsletterCampaignsPage.tsx  # Campagnes : liste, création, envoi
│   ├── NewsletterTemplatesPage.tsx  # CRUD templates
│   ├── SubscribePage.tsx            # Page publique inscription (?token=)
│   ├── ConfirmPage.tsx              # Confirmation double opt-in
│   └── UnsubscribePage.tsx          # Désinscription
├── components/newsletter/
│   ├── ListDashboard.tsx            # Cartes listes avec compteurs
│   ├── SubscriberList.tsx           # Tableau abonnés
│   ├── ImportCsvModal.tsx           # Modal import CSV
│   ├── CampaignForm.tsx             # Formulaire campagne
│   ├── SubscriptionForm.tsx         # Formulaire public inscription
└── services/
    └── newsletter.service.ts        # Client API frontend
```

### Base de données (Prisma)

- `newsletter_lists` : listes de diffusion
- `newsletter_subscribers` : abonnés (MANUAL)
- `newsletter_campaigns` : campagnes
- `newsletter_campaign_recipients` : résultats d'envoi par destinataire
- `newsletter_templates` : templates HTML réutilisables
- `tenant_clients.newsletter_consent` : consentement propriétaires/locataires

---

## 3. Prérequis et démarrage

### 3.1 Environnement

- Node.js 18+
- PostgreSQL (variable `DATABASE_URL`)
- Configuration SMTP (variables `EMAIL_SMTP_*` ou `SENDGRID_API_KEY`)
- Variables d'environnement :
  - `FRONTEND_URL` ou `CLIENT_URL` : URL du frontend (liens dans les emails)
  - `DATABASE_URL` : connexion PostgreSQL
  - `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`, `EMAIL_FROM`

### 3.2 Démarrer les services

```bash
# Backend
cd packages/api
npm install
npx prisma migrate deploy   # ou migrate dev en dev
npm run dev                 # Démarre l'API sur le port 8001

# Frontend (autre terminal)
cd apps/web
npm install
npm run dev                 # Démarre sur le port 3000
```

### 3.3 Utilisateur de test

- Compte **collaborateur** du tenant (admin, manager ou agent) pour accéder aux routes newsletter
- Le module utilise `requireTenantCollaborator` : les clients (propriétaires, locataires) n'ont pas accès au back-office newsletter

---

## 4. Processus d'implémentation

Le module a été implémenté en 10 phases :

| Phase | Contenu |
|-------|---------|
| 1 | Setup — Dépendances (dompurify, jsdom, express-rate-limit), dossiers |
| 2 | Fondations — Schéma Prisma, migration, services, routes, sanitization HTML |
| 3 | MVP — Listes manuelles, abonnés, campagnes, désinscription |
| 4 | Inscription publique — Subscribe, confirmation double opt-in |
| 5 | FROM_OWNERS — Listes propriétaires, préférences portail owner |
| 6 | Planification — Job cron, envoi différé, annulation |
| 7 | Templates — CRUD templates réutilisables |
| 8 | FROM_RENTERS, FROM_CRM — Listes dérivées |
| 9 | Export — CSV manuel et dérivé |
| 10 | Polish — RBAC, isolation tenant, messages, quickstart |

---

## 5. Guide de tests par fonctionnalité

### 5.1 Migration et base de données

**Objectif** : Vérifier que les tables newsletter existent.

```bash
cd packages/api
npx prisma migrate deploy
npx prisma studio   # Optionnel : inspecter les tables
```

**Vérifications** :
- Tables : `newsletter_lists`, `newsletter_subscribers`, `newsletter_campaigns`, `newsletter_campaign_recipients`, `newsletter_templates`
- Colonne `newsletter_consent` sur `tenant_clients`

---

### 5.2 Listes de diffusion (Back-office)

**Accès** : Communication → Newsletter (menu latéral)

**Test 1 : Créer une liste manuelle**
1. Cliquer sur « Nouvelle liste »
2. Nom : « Newsletter site web »
3. Type : « Manuelle »
4. Double opt-in : activé
5. Valider
6. **Résultat attendu** : La liste apparaît avec compteurs 0/0/0

**Test 2 : Créer une liste dérivée**
1. Nouvelle liste, nom : « Propriétaires »
2. Type : « Propriétaires (avec accord newsletter) »
3. Valider
4. **Résultat attendu** : Compteur = nombre de propriétaires avec newsletter_consent activé

**Test 3 : Modifier et supprimer une liste**
1. Sur une carte liste : Modifier → changer le nom
2. Supprimer → confirmer
3. **Résultat attendu** : Liste supprimée (et abonnés associés pour MANUAL)

---

### 5.3 Abonnés (liste MANUAL)

**Test 4 : Ajouter un abonné manuellement**
1. Cliquer sur une liste MANUAL
2. Bouton « Importer CSV » ou ajout manuel (selon UI)
3. Email : `test@example.com`, Nom : « Test User »
4. **Résultat attendu** : Abonné créé avec statut ACTIVE (ou PENDING si double opt-in côté back-office)

**Test 5 : Importer un CSV**
1. Préparer un fichier `abonnes.csv` :
   ```csv
   email,name
   user1@example.com,User One
   user2@example.com,User Two
   ```
2. Bouton « Importer CSV » → sélectionner le fichier → Importer
3. **Résultat attendu** : Message « X adresse(s) importée(s) », liste mise à jour

**Test 6 : Exporter en CSV**
1. Bouton « Exporter CSV »
2. **Résultat attendu** : Téléchargement d'un fichier CSV avec colonnes email, name, status, subscribed_at, confirmed_at, unsubscribed_at

**Test 7 : Retirer un abonné**
1. Sur une ligne abonné : Retirer
2. **Résultat attendu** : Abonné supprimé de la liste

---

### 5.4 Campagnes

**Accès** : Communication → Campagnes

**Test 8 : Créer une campagne**
1. « Nouvelle campagne »
2. Liste : choisir une liste avec au moins 1 abonné actif
3. Sujet : « Test Newsletter »
4. Corps HTML : inclure obligatoirement `{{lien_desinscription}}`, ex. :
   ```html
   <p>Bonjour {{prenom}},</p>
   <p>Voici notre newsletter.</p>
   <p><a href="{{lien_desinscription}}">Se désabonner</a></p>
   ```
5. Valider
6. **Résultat attendu** : Campagne créée, statut DRAFT

**Test 9 : Aperçu**
1. Sur une campagne DRAFT : Aperçu
2. **Résultat attendu** : Fenêtre avec sujet et HTML rendu (variables remplacées)

**Test 10 : Envoyer immédiatement**
1. Sur une campagne DRAFT : Envoyer
2. Confirmer
3. **Résultat attendu** : Statut passe à SENDING puis SENT. Les destinataires reçoivent l'email avec lien de désinscription unique.

**Test 11 : Planifier une campagne**
1. Sur une campagne DRAFT : Planifier
2. Date/heure : +2 minutes
3. Valider
4. **Résultat attendu** : Statut SCHEDULED
5. Attendre 2–3 minutes (job cron)
6. **Résultat attendu** : Statut passe à SENT, emails reçus

**Test 12 : Annuler une campagne planifiée**
1. Sur une campagne SCHEDULED : Annuler
2. **Résultat attendu** : Statut CANCELLED, pas d'envoi

---

### 5.5 Templates

**Accès** : Communication → Templates

**Test 13 : Créer un template**
1. « Nouveau template »
2. Nom : « Layout standard »
3. HTML :
   ```html
   <div style="font-family: sans-serif;">
     <p>Bonjour {{prenom}},</p>
     <div>{{contenu}}</div>
     <p><a href="{{lien_desinscription}}">Se désabonner</a></p>
   </div>
   ```
4. Valider
5. **Résultat attendu** : Template créé

**Test 14 : Utiliser un template dans une campagne**
1. Créer une campagne
2. Choisir le template « Layout standard »
3. Le corps de la campagne (bodyHtml) remplace `{{contenu}}`
4. **Résultat attendu** : Aperçu et envoi avec HTML combiné

---

### 5.6 Inscription publique (double opt-in)

**Test 15 : S'inscrire via formulaire public**
1. Obtenir le lien d'inscription :
   - Aller sur une liste MANUAL (détail)
   - Section « Formulaire d'inscription publique »
   - Copier le lien : `https://.../newsletter/subscribe?token=lst_xxxx`
2. Ouvrir ce lien en navigation privée (sans être connecté)
3. Remplir : email, nom
4. Cliquer « S'inscrire »
5. **Résultat attendu** : Message « Un email de confirmation vous a été envoyé »
6. Consulter la boîte mail : email avec lien de confirmation
7. Cliquer sur le lien
8. **Résultat attendu** : Page « Inscription confirmée »

**Test 16 : Vérifier l'abonné**
1. Retour dans le back-office : détail de la liste
2. **Résultat attendu** : L'abonné apparaît avec statut ACTIVE

---

### 5.7 Désinscription

**Test 17 : Se désabonner via le lien**
1. Après avoir reçu une newsletter, cliquer sur le lien « Se désabonner »
2. Page de confirmation s'affiche
3. Option : « Me désabonner de toutes les newsletters de cet organisme »
4. Cliquer « Confirmer la désinscription »
5. **Résultat attendu** : Message « Vous avez été désabonné »
6. Dans le back-office : l'abonné a le statut UNSUBSCRIBED
7. Envoyer une nouvelle campagne : cet abonné ne doit pas recevoir l'email

---

### 5.8 Listes dérivées (FROM_OWNERS, FROM_RENTERS, FROM_CRM)

**Test 18 : Liste propriétaires**
1. Un propriétaire doit activer « Recevoir la newsletter » :
   - Se connecter au portail propriétaire
   - Préférences → activer « Recevoir la newsletter »
2. Créer une liste type « Propriétaires »
3. **Résultat attendu** : Compteur = nombre de propriétaires avec consentement
4. Créer une campagne sur cette liste → Envoyer
5. **Résultat attendu** : Seuls les propriétaires avec newsletter_consent reçoivent l'email

**Test 19 : Export liste dérivée**
1. Sur une liste FROM_OWNERS (ou FROM_RENTERS, FROM_CRM) : Export CSV
2. **Résultat attendu** : CSV avec les destinataires résolus à l'instant (email, name, status DESTINATAIRE)

---

### 5.9 Sécurité et RBAC

**Test 20 : Accès refusé aux clients**
1. Se connecter avec un compte **propriétaire** (portail owner)
2. Tenter d'accéder à `/tenant/:tenantId/newsletter/lists`
3. **Résultat attendu** : 403 « Accès réservé aux collaborateurs du tenant »

**Test 21 : Isolation tenant**
1. Avec un token d'un tenant A, appeler `GET /api/tenants/<tenant_B_id>/newsletter/lists`
2. **Résultat attendu** : 403 si l'utilisateur n'a pas accès au tenant B

---

## 6. Flux métier détaillés

### Flux 1 : Campagne manuelle complète

```
1. Créer liste MANUAL
2. Importer CSV ou ajouter abonnés manuellement
3. Créer campagne (sujet + bodyHtml avec {{lien_desinscription}})
4. Aperçu → vérifier le rendu
5. Envoyer immédiatement
6. Chaque destinataire reçoit un email avec lien unique
7. Destinataire clique « Désinscription » → statut UNSUBSCRIBED
8. Prochaine campagne : abonnés UNSUBSCRIBED exclus
```

### Flux 2 : Inscription publique (double opt-in)

```
1. Visiteur ouvre /newsletter/subscribe?token=lst_xxx
2. Saisit email + nom → POST /api/newsletter/subscribe
3. Subscriber créé en PENDING_CONFIRMATION
4. Email de confirmation envoyé avec lien ?token=...
5. Visiteur clique le lien → GET /api/newsletter/confirm?token=...
6. Statut passe à ACTIVE
7. L'abonné reçoit les prochaines campagnes
```

### Flux 3 : Campagne planifiée

```
1. Créer campagne DRAFT
2. Planifier → POST .../schedule { scheduledAt: "2026-02-15T10:00:00Z" }
3. Statut = SCHEDULED
4. Job cron (toutes les minutes) :
   - Sélectionne campagnes SCHEDULED où scheduled_at <= now()
   - Appelle sendCampaign pour chacune
5. Statut = SENT, emails envoyés
```

---

## 7. Exemples de requêtes API (cURL)

Remplacer `TOKEN`, `TENANT_ID`, `API_URL` (ex. `http://localhost:8001/api`) selon votre environnement.

### Listes

```bash
# Lister les listes
curl -H "Authorization: Bearer TOKEN" "${API_URL}/tenants/TENANT_ID/newsletter/lists"

# Créer une liste manuelle
curl -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Ma liste","type":"MANUAL","doubleOptIn":true}' \
  "${API_URL}/tenants/TENANT_ID/newsletter/lists"
```

### Abonnés

```bash
# Lister les abonnés d'une liste
curl -H "Authorization: Bearer TOKEN" \
  "${API_URL}/tenants/TENANT_ID/newsletter/lists/LIST_ID/subscribers?page=1&limit=20"

# Inscription publique (sans auth)
curl -X POST -H "Content-Type: application/json" \
  -d '{"token":"lst_xxx","email":"user@example.com","name":"User Name"}' \
  "${API_URL}/newsletter/subscribe"

# Confirmation (sans auth)
curl "${API_URL}/newsletter/confirm?token=conf_xxx"

# Désinscription (sans auth)
curl -X POST -H "Content-Type: application/json" \
  -d '{"token":"unsub_xxx","allLists":false}' \
  "${API_URL}/newsletter/unsubscribe"
```

### Campagnes

```bash
# Lister les campagnes
curl -H "Authorization: Bearer TOKEN" \
  "${API_URL}/tenants/TENANT_ID/newsletter/campaigns?page=1&limit=10"

# Créer une campagne
curl -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"listId":"LIST_ID","subject":"Test","bodyHtml":"<p>Hello {{prenom}}</p><p><a href=\"{{lien_desinscription}}\">Se désabonner</a></p>"}' \
  "${API_URL}/tenants/TENANT_ID/newsletter/campaigns"

# Envoyer immédiatement
curl -X POST -H "Authorization: Bearer TOKEN" \
  "${API_URL}/tenants/TENANT_ID/newsletter/campaigns/CAMPAIGN_ID/send"

# Planifier
curl -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"scheduledAt":"2026-02-15T10:00:00.000Z"}' \
  "${API_URL}/tenants/TENANT_ID/newsletter/campaigns/CAMPAIGN_ID/schedule"
```

### Templates

```bash
# Lister les templates
curl -H "Authorization: Bearer TOKEN" \
  "${API_URL}/tenants/TENANT_ID/newsletter/templates"

# Créer un template
curl -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Layout standard","bodyHtml":"<div>{{contenu}}</div>"}' \
  "${API_URL}/tenants/TENANT_ID/newsletter/templates"
```

---

## 8. Dépannage

| Problème | Cause possible | Solution |
|----------|----------------|----------|
| 403 sur routes newsletter | Utilisateur client (non collaborateur) | Se connecter avec un compte collaborateur du tenant |
| Emails non reçus | SMTP mal configuré, NODE_ENV=test | Vérifier EMAIL_SMTP_*, ou ENABLE_EMAILS=1 en test |
| Migration échoue | Tables déjà créées, conflit d'index | Vérifier l'état des migrations, ou utiliser `prisma db push` (dev) |
| Lien désinscription invalide | Token manquant ou expiré | Vérifier que l'URL contient ?token=... |
| Liste dérivée vide | Aucun consentement | Activer newsletter_consent pour des propriétaires/locataires |
| Rate limit sur /api/newsletter/* | Trop de requêtes | 10 req/min sur routes publiques ; attendre 1 min |

### Logs utiles

- Backend : les emails envoyés et le job cron sont logués
- `[EmailService]` : envoi d'emails
- `Newsletter campaign scheduler` : exécution du job

---

## Références

- [spec.md](spec.md) — Spécification fonctionnelle
- [data-model.md](data-model.md) — Modèle de données
- [quickstart.md](quickstart.md) — Vérifications rapides
- [plan.md](plan.md) — Plan technique
- [research.md](research.md) — Décisions techniques
- [contracts/openapi.yaml](contracts/openapi.yaml) — Contrats API
