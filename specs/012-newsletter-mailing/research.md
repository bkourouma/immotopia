# Research: Newsletter et Mailing

**Feature**: 012-newsletter-mailing  
**Date**: 2026-02-11

## 1. Infrastructure email existante (EmailService vs email.provider)

**Decision**: Utiliser **EmailService** (`packages/api/src/services/email-service.ts`) comme point d’entrée unique pour l’envoi des campagnes newsletter. Le provider `email.provider.ts` est une abstraction alternative utilisée par le module communication 010 ; pour la newsletter, on réutilise le même transport SMTP/nodemailer via `emailService.sendEmail()` qui encapsule déjà la configuration et la normalisation des emails.

**Rationale**: L’EmailService est largement utilisé (paiements, maintenance, invitations) et est stable. L’ajout d’une méthode générique `sendHtmlEmail(to, subject, html)` ou l’utilisation directe de `sendEmail` pour les campagnes garantit la cohérence des logs et de la configuration SMTP.

**Alternatives considered**:
- Utiliser uniquement `email.provider.ts` : possible mais nécessiterait de dupliquer la logique de skip en mode test ; EmailService gère déjà `NODE_ENV=test`.
- Nouveau service dédié newsletter-email : surdimensionné ; un wrapper léger dans NewsletterCampaignService suffit.

---

## 2. Consentement newsletter pour listes dérivées (Owner, Renter, CrmContact)

**Decision**: 
- **CrmContact** : réutiliser `consent_email` existant comme consentement newsletter (ou ajouter `newsletter_consent` si la spec exige une distinction fine ; pour la V1, `consent_email = true` suffit).
- **TenantClient** (Owner/Renter) : ajouter un champ `newsletter_consent Boolean @default(false)` dans une migration Prisma, car aucun champ équivalent n’existe actuellement.

**Rationale**: La spec impose « explicit consent (newsletter preference) before including owners, renters, or CRM contacts in derived lists ». CrmContact a déjà consent_email ; TenantClient n’a que CommunicationPreference (liée aux canaux de notification, pas explicitement à la newsletter).

**Alternatives considered**:
- Utiliser CommunicationPreference : trop générique ; la newsletter est un cas métier distinct.
- Uniquement consent_email sur CrmContact : ne couvre pas les owners/renters (TenantClient).

---

## 3. Job de planification des campagnes (cron / scheduler)

**Decision**: Utiliser **node-cron** (ou l’équivalent déjà présent : `reminder-scheduler.job.ts` utilise un pattern cron) pour exécuter un job toutes les minutes qui traite les campagnes dont `status = SCHEDULED` et `scheduled_at <= now()`. Même approche que `penalty-calculation-job.ts` et `reminder-scheduler.job.ts`.

**Rationale**: La spec exige « campagnes planifiées envoyées à l’heure prévue » ; un job cron toutes les minutes garantit une latence ≤ 1 min. Pas besoin de Redis/Bull pour la V1.

**Alternatives considered**:
- Bull/Redis : surdimensionné pour le volume attendu (quelques campagnes/jour par tenant).
- setTimeout/agenda : complexité accrue ; node-cron est simple et déjà utilisé dans le projet.

---

## 4. Sanitization HTML (XSS) et variables

**Decision**: Utiliser **DOMPurify** côté backend (ou une lib équivalente : `dompurify` + `jsdom`) pour sanitizer le HTML des campagnes avant envoi et avant stockage. Les variables `{{prenom}}`, `{{lien_desinscription}}`, etc. sont remplacées après sanitization avec des valeurs échappées.

**Rationale**: La spec exige « sanitize HTML content in campaigns to prevent XSS attacks while preserving safe formatting ». DOMPurify est la référence pour le HTML sanitization en Node.

**Alternatives considered**:
- Sanitizer manuel : risqué et incomplet.
- Pas de sanitization : non conforme à la spec FR-070.

---

## 5. Rate limiting sur endpoints publics

**Decision**: Appliquer **express-rate-limit** (ou middleware équivalent déjà présent) sur :
- `POST /api/newsletter/subscribe` : 10 requêtes / minute / IP
- `GET /api/newsletter/confirm` : 30 requêtes / minute / IP (moins critique)
- `GET /api/newsletter/unsubscribe` : 30 requêtes / minute / IP

**Rationale**: La spec exige « rate limiting to public subscription endpoints to prevent abuse » et « handle 100+ requests per minute gracefully ». 10 req/min sur subscribe limite les inscriptions abusives tout en restant utilisable.

**Alternatives considered**:
- 5 req/min : trop restrictif pour des formulaires légitimes.
- Pas de rate limit : non conforme.

---

## 6. Tokens de confirmation et désinscription

**Decision**: Générer des tokens **crypto.randomBytes(32).toString('hex')** ; stockage en base (subscriber.confirmation_token, ou table dédiée pour unsubscribe si un même abonné peut avoir plusieurs tokens par campagne). Les liens de désinscription incluent un token unique par (campaign_id, subscriber_id) pour tracer la provenance et invalider après usage si nécessaire.

**Rationale**: La spec impose des liens « uniques » pour confirmation et désinscription. Un token opaque de 32 bytes est suffisant pour éviter les collisions et les brute-force.

**Alternatives considered**:
- JWT signé : plus complexe, pas nécessaire pour des tokens à usage unique.
- UUID : moins d’entropie que 32 bytes hex.
