# Plan d'implémentation : Module de Communication ImmoTopia

**Branche** : `010-communication-module` | **Date** : 2025-02-02 | **Spec** : [spec.md](./spec.md)  
**Entrée** : Spécification fonctionnelle depuis `/specs/010-communication-module/spec.md` et `docs/PROMPT_MODULE_COMMUNICATION_IMMOTOPIA.md`

**Note** : Ce plan est produit par la commande `/speckit.plan`. Le workflow d’exécution est décrit dans `.specify/templates/commands/plan.md`.

## Résumé

Ce plan définit l’implémentation du **module de communication** d’ImmoTopia. Le système permet aux trois types d’intervenants (Propriétaire, Locataire, Agence) de communiquer via **WhatsApp** et **Email** pour les annonces, alertes et notifications déclenchées par les événements des autres modules (CRM, gestion locative, maintenance, propriétés).

**Approche technique** : Étendre le backend existant Node.js + TypeScript (Express, Prisma, PostgreSQL) avec un schéma Prisma dédié (templates, règles de notification, communications, préférences), des services (CommunicationService, NotificationEngine, QueueService) et des providers (EmailProvider, WhatsAppProvider). Mettre en place une file d’attente pour les envois asynchrones, des jobs planifiés (traitement de la file, rappels, mise à jour des statuts) et des points d’intégration dans les services CRM, locatif, maintenance et propriétés. Frontend React : pages d’administration (templates, règles, historique, analytics, préférences) et composants (éditeur de templates, sélecteur de variables, constructeur de règles). Tous les textes UI en français (Constitution).

## Contexte technique

**Langage / version** : TypeScript 5.x (mode strict), Node.js ≥18 (LTS)  
**Dépendances principales** :
- Backend : Express 4.x, Prisma 5.x, Zod, node-cron, SendGrid / Nodemailer, Twilio (WhatsApp)
- Frontend : React 18, TypeScript, React Router, Axios
- Base de données : PostgreSQL ≥14 (via Prisma)

**Stockage** : PostgreSQL (Prisma) pour templates, règles, communications, préférences ; pièces jointes via service de stockage existant  
**Tests** : Jest, Supertest (API), React Testing Library (frontend)  
**Plateforme cible** : Application web (serveur Node.js + navigateurs)  
**Type de projet** : web (monorepo apps/web + packages/api)  
**Objectifs de performance** :
- Notification déclenchée par événement : livraison dans le délai configuré (ex. &lt; 2 min pour règles immédiates) (SC-001)
- Création/mise à jour template + règle et première notification livrée en une session (&lt; 15 min pour une règle simple) (SC-002)
- Historique filtré avec statuts corrects pour ≥ 95 % des communications récentes (SC-003)
- 100 % des envois respectent les préférences destinataire (SC-004)
- En cas d’échec fournisseur/adresse : enregistrement + retry sans bloquer les autres envois (SC-005)
- Analytics agrégés (taux de livraison, volumes, tendances) disponibles et cohérents (SC-006)
- Isolation tenant : aucun accès/intervention cross-tenant (SC-007)

**Contraintes** :
- Isolation stricte des données par `tenant_id` (FR-011, SC-007)
- Validation des coordonnées (email, téléphone) avant envoi (FR-013)
- Rate limiting sur les endpoints d’envoi (FR-013)
- Respect des préférences (canaux, types, quiet hours, triggers désactivés) (FR-007)
- File d’attente + retry configurable pour les échecs (FR-010)
- Templates WhatsApp : utilisation de templates pré-approuvés selon politique canal (bonnes pratiques)
- UI exclusivement en français (Constitution I)

**Périmètre** :
- Deux canaux : Email, WhatsApp (SMS prévu en schéma, implémentation ultérieure)
- Trois types : Annonce, Alerte, Notification
- Événements : CRM (contact, deal, rendez-vous), propriétés (publication, document expirant, mandat), locatif (bail, échéances, paiements, pénalités, caution, documents), maintenance (ticket créé/assigné/statut/commentaire), général (invitation, reset mot de passe, custom)
- Destinataires : OWNER, RENTER, AGENCY_USER, CONTACT (CRM)

## Vérification Constitution

*GATE : À valider avant la phase 0 (recherche). Re-vérifier après la phase 1 (design).*

**Statut pré-recherche** : ✅ CONFORME  
**Statut post-design** : À re-vérifier après rédaction data-model / contrats

**Conformité** :
- ✅ **Principe I (Français obligatoire)** : Tous les libellés, messages et textes UI en français.
- ✅ **Principe II (Aucune donnée fictive)** : Seeds avec données réelles ou anonymisées uniquement.
- ✅ **Principe III (Stack)** : Node.js + TypeScript, Express, React + TypeScript, PostgreSQL + Prisma, Git.
- ✅ **Principe IV (Débogage)** : Chrome DevTools et Puppeteer pour le frontend.
- ✅ **Principe V (Workflow & qualité)** : Commits au format `<service>: <action> – <description>`, couverture tests ≥ 80 %, seeds versionnés.

**Gates** :
- Type safety : TypeScript strict
- Tests : Jest + Supertest configurés
- Base de données : Prisma + PostgreSQL
- Sécurité : RBAC et isolation par tenant existants
- Validation : Schémas Zod pour les requêtes
- Jobs planifiés : node-cron pour file d’attente, rappels, statuts
- Providers : SendGrid (ou équivalent) et Twilio (ou équivalent) pour email / WhatsApp

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/010-communication-module/
├── plan.md              # Ce fichier (sortie /speckit.plan)
├── research.md          # Phase 0 (optionnel si déjà couvert par le prompt)
├── data-model.md        # Phase 1 – schéma et entités
├── quickstart.md        # Phase 1 – démarrage rapide
├── contracts/           # Phase 1 – contrats API
│   └── openapi.yaml     # Endpoints communication
├── checklists/
│   └── requirements.md  # Checklist qualité spec
└── tasks.md             # Phase 2 (sortie /speckit.tasks – non créé par /speckit.plan)
```

### Code source (racine du dépôt)

```text
packages/api/
├── src/
│   ├── controllers/
│   │   └── communication-controller.ts   # Routes templates, règles, messages, préférences, analytics
│   ├── services/
│   │   ├── communication.service.ts      # Création, envoi, planification, annulation, retry, historique
│   │   ├── notification-engine.service.ts # triggerEvent, processNotificationRules, résolution variables
│   │   ├── queue.service.ts              # File d'attente, processQueue, retry exponentiel
│   │   └── providers/
│   │       ├── email.provider.ts         # SendGrid / Nodemailer – send, sendWithTemplate, webhooks
│   │       └── whatsapp.provider.ts      # Twilio WhatsApp – sendText, sendTemplate, sendImage, webhooks
│   ├── routes/
│   │   └── communication-routes.ts       # /tenants/:tenantId/communication/*
│   ├── jobs/
│   │   ├── communication-queue-processor.job.ts  # Cron * * * * * – processQueue
│   │   ├── reminder-scheduler.job.ts             # Cron 0 6 * * * – rappels quotidiens
│   │   └── status-updater.job.ts                 # Cron */5 * * * * – mise à jour statuts
│   ├── templates/
│   │   └── email/                        # Templates HTML (rappels, confirmations, etc.)
│   └── types/
│       └── communication-types.ts        # DTOs, enums, types
├── prisma/
│   └── schema.prisma                    # CommunicationTemplate, NotificationRule, Communication, CommunicationPreference + enums
└── __tests__/
    ├── integration/
    │   └── communication.integration.test.ts
    └── unit/
        ├── communication.service.test.ts
        └── notification-engine.service.test.ts

apps/web/
├── src/
│   ├── pages/
│   │   └── communication/
│   │       ├── TemplatesPage.tsx         # Liste, création, édition, prévisualisation
│   │       ├── RulesPage.tsx             # Règles de notification, activation/désactivation
│   │       ├── HistoryPage.tsx           # Historique paginé, filtres, détail
│   │       ├── AnalyticsPage.tsx         # Taux livraison, par type/canal, tendances
│   │       └── PreferencesPage.tsx      # Préférences par destinataire, quiet hours
│   ├── components/
│   │   └── communication/
│   │       ├── TemplateEditor.tsx       # Éditeur de template riche
│   │       ├── VariableSelector.tsx     # Sélecteur de variables
│   │       ├── RecipientSelector.tsx    # Sélection destinataires
│   │       ├── CommunicationStatus.tsx  # Badge statut
│   │       ├── ChannelIcon.tsx          # Icônes canal
│   │       ├── RuleBuilder.tsx           # Constructeur de règles
│   │       └── PreviewModal.tsx         # Prévisualisation message
│   └── services/
│       └── communication-service.ts     # Client API communication
```

**Décision de structure** : Réutilisation du monorepo (packages/api, apps/web). Le module communication s’appuie sur le RBAC et l’isolation par tenant existants. Routes scopées par tenant (`/api/tenants/:tenantId/communication/*`). Webhooks email/WhatsApp sans scope tenant dans l’URL (validation par signature / config). Services métier dans packages/api, contrôleurs légers ; jobs node-cron pour file, rappels et statuts.

## Phases d’implémentation

Alignement avec la checklist du prompt (docs/PROMPT_MODULE_COMMUNICATION_IMMOTOPIA.md, section 10).

| Phase | Période   | Objectif |
|-------|-----------|----------|
| **Phase 1 – Infrastructure** | Semaines 1–2 | Schéma Prisma (templates, règles, communications, préférences + enums), migrations, DTOs/Zod, CommunicationService de base, NotificationEngine, QueueService |
| **Phase 2 – Providers** | Semaine 3 | EmailProvider (SendGrid ou Nodemailer), WhatsAppProvider (Twilio), webhooks, gestion des statuts, tests unitaires providers |
| **Phase 3 – Routes API** | Semaine 4 | Routes templates, règles, messages (dont bulk, send, schedule, cancel, retry), préférences, analytics, webhooks ; controllers, auth, validation |
| **Phase 4 – Intégration modules** | Semaine 5 | Appels à NotificationEngine depuis CRM, gestion locative, maintenance, propriétés ; tests de déclenchement |
| **Phase 5 – Jobs planifiés** | Semaine 6 | communication-queue-processor, reminder-scheduler, status-updater ; tests et monitoring |
| **Phase 6 – Frontend** | Semaines 7–8 | Pages Templates, Rules, History, Analytics, Preferences ; composants (TemplateEditor, RuleBuilder, etc.) ; éditeur et historique |
| **Phase 7 – Templates par défaut** | Semaine 9 | Templates email HTML (rappels, confirmations, etc.), soumission templates WhatsApp si applicable, règles par défaut, tests E2E des templates |
| **Phase 8 – Tests et documentation** | Semaine 10 | Tests E2E, documentation technique (docs/communication/, user-guides/), démo et formation |

## Suivi des complexités

> **À remplir uniquement en cas de violation de la vérification Constitution à justifier.**

Aucune violation identifiée. Les exigences sont alignées avec les principes de la Constitution.
