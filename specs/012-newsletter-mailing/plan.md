# Implementation Plan: Newsletter et Mailing

**Branch**: `012-newsletter-mailing` | **Date**: 2026-02-11 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/012-newsletter-mailing/spec.md`

## Summary

Système newsletter/mailing type MailChimp intégré au module de communication ImmoTopia. Permet aux agences de créer des listes de diffusion (manuelles ou dérivées d’owners/renters/contacts CRM), gérer les abonnés avec double opt-in, créer et envoyer des campagnes par email (immédiat ou planifié), et respecter la conformité RGPD (désinscription, consentement). L’approche technique réutilise l’infrastructure email existante (EmailService, nodemailer/SMTP) et le provider `packages/api/src/services/providers/email.provider.ts`.

## Technical Context

**Language/Version**: TypeScript (Node.js backend), TypeScript (React frontend)  
**Primary Dependencies**: Express (API), React, Prisma ORM, nodemailer  
**Storage**: PostgreSQL via Prisma ; tables `newsletter_lists`, `newsletter_subscribers`, `newsletter_campaigns`, `newsletter_campaign_recipients`, `newsletter_templates`  
**Testing**: Jest + Supertest (backend), React Testing Library + Jest (frontend)  
**Target Platform**: Web (navigateur) ; API hébergée sur serveur Node  
**Project Type**: Web application (monorepo : `packages/api` + `apps/web`)  
**Performance Goals**: Envoi de campagnes à 5 000 abonnés en &lt; 30 min ; campagnes planifiées à ±1 min de l’heure prévue  
**Constraints**: Isolation stricte par tenant ; RBAC ; rate limiting sur endpoints publics ; lien désinscription obligatoire  
**Scale/Scope**: Listes jusqu’à 5 000 abonnés ; campagnes planifiées ; templates réutilisables ; listes dérivées (owners, renters, CRM contacts)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Statut | Notes |
|----------|--------|-------|
| **I. Français obligatoire (UI)** | OK | Tous les libellés, messages, formulaires et notifications en français (inscription, confirmation, désinscription, erreurs). |
| **II. Aucune donnée fictive** | OK | Seeds éventuels utiliseront données réelles ou anonymisées ; pas de données inventées. |
| **III. Stack technique imposée** | OK | Backend Node/TS + Express ; frontend React/TS ; PostgreSQL + Prisma. Aucune déviation. |
| **IV. Débogage systématique** | OK | Frontend débogué avec Chrome DevTools ; tests E2E avec Puppeteer si nécessaire. |
| **V. Workflow & qualité** | OK | Commits au format `<service>: <action> – <description>` ; couverture tests ≥ 80 % ; branches `feature/<role>-<feature>`. |

Aucune violation. Phase 0 et Phase 1 autorisées.

## Project Structure

### Documentation (this feature)

```text
specs/012-newsletter-mailing/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1 (OpenAPI newsletter)
│   └── openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks – not created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/api/
├── prisma/
│   └── schema.prisma    # + NewsletterList, NewsletterSubscriber, NewsletterCampaign, NewsletterCampaignRecipient, NewsletterTemplate ; champs newsletter_consent sur TenantClient, CrmContact
├── src/
│   ├── controllers/
│   │   └── newsletter-controller.ts
│   ├── routes/
│   │   └── newsletter-routes.ts
│   ├── services/
│   │   ├── newsletter-list.service.ts
│   │   ├── newsletter-subscriber.service.ts
│   │   ├── newsletter-campaign.service.ts
│   │   └── newsletter-template.service.ts
│   ├── jobs/
│   │   └── newsletter-campaign-scheduler.job.ts
│   └── middleware/      # existing (auth, tenant, rate-limit)
└── __tests__/
    ├── newsletter-list.service.spec.ts
    ├── newsletter-subscriber.service.spec.ts
    └── newsletter-campaign.service.spec.ts

apps/web/
├── src/
│   ├── components/
│   │   └── newsletter/  # ListDashboard, SubscriberList, CampaignForm, TemplateLibrary, etc.
│   ├── pages/
│   │   └── newsletter/
│   │       ├── NewsletterListsPage.tsx
│   │       ├── NewsletterCampaignsPage.tsx
│   │       └── NewsletterTemplatesPage.tsx
│   └── services/
│       └── newsletter.service.ts
└── ...
```

**Structure Decision**: Monorepo existant ; backend dans `packages/api`, frontend dans `apps/web`. Les services newsletter intègrent `EmailService` et `email.provider.ts` pour l’envoi. Job cron pour campagnes planifiées. Routes publiques (subscribe, confirm, unsubscribe) sans auth avec rate limiting.

## Complexity Tracking

Aucune violation de la Constitution. Ce tableau reste vide.
