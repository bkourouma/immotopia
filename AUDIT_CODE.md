# Audit du code ImmoTopia

**Date** : 2026-09-07
**Périmètre** : monorepo `D:\ImmoTopia-main` — API Express/Prisma (`packages/api`, ~200 fichiers, 61k lignes), frontend React/CRA (`apps/web`, ~300 fichiers, 72k lignes), schéma Prisma (112 modèles, 28 migrations), scripts, documentation et configuration du dépôt.
**Méthode** : lecture statique du code, exécution de `tsc --noEmit` (web), `eslint` (web), suite de tests web, `npm audit`/`npm outdated` (racine). Aucune modification apportée, aucune migration exécutée.

---

## 1. Résumé exécutif

Le projet est fonctionnellement riche (CRM, gestion locative, syndic, patrimoine, maintenance, newsletter, portails locataire/propriétaire) et repose sur de bonnes fondations : TypeScript strict, Zod, Prisma, bcrypt, cookies `httpOnly`, Helmet, CORS strict, filtrage par `tenantId` dans la majorité des services. Le frontend compile sans erreur TypeScript.

En revanche, plusieurs problèmes bloquent une mise en production sereine :

| Domaine | État | Points majeurs |
|---|---|---|
| Sécurité | **Critique** | Secret JWT avec valeur par défaut codée en dur et `.env` contenant le placeholder ; fichiers uploadés (preuves de paiement, baux) servis publiquement sans authentification ; IDOR inter-tenant sur médias/documents de propriétés ; routes de création de tenant et de listing des clients sans contrôle de droits. |
| Dépôt / DevOps | **Critique** | Aucun commit dans l'historique git (5 789 blobs orphelins) ; `.gitignore` racine inadapté (218 Mo d'uploads utilisateurs et documents générés seraient commités) ; aucune CI, aucun Docker, aucun hook. |
| Base de données | **Élevé** | 43 modèles porteurs de données tenant sans `tenantId` ; contraintes uniques globales qui entrent en collision entre tenants ; migrations désordonnées avec dérive détectée ; `prisma/seed.ts` destructif ; prix stockés en `Float`. |
| Architecture backend | **Élevé** | Pipeline d'erreurs central jamais utilisé (385 try/catch, 59 détections par `includes('not found')`) ; écritures multi-étapes sans transaction ; fichier de 3 846 lignes avec son propre `PrismaClient` ; 549 `any`. |
| Frontend | **Moyen-élevé** | Aucun code-splitting (bundle unique de 3,9 Mo) ; ESLint non configuré (ne s'exécute pas) ; 7 suites de tests sur 11 en échec ; dépendances mortes (`next`, `puppeteer`, `moment`) ; `xlsx` vulnérable non corrigeable sur npm. |

**Les cinq actions à faire cette semaine** :

1. Rotation de tous les secrets (JWT, Google, Twilio, OpenAI, WaSender, SMTP, Postgres) et suppression du fallback JWT codé en dur.
2. Réécriture du `.gitignore` racine, puis premier commit sur `main`.
3. Mettre les fichiers uploadés derrière un endpoint authentifié et scopé par tenant.
4. Corriger les IDOR sur `property-media-service` / `property-document-service` et verrouiller les routes tenant non protégées.
5. Rendre `prisma/seed.ts` non destructif et supprimer `temp_migration.sql`.

---

## 2. Sécurité

### 2.1 Critique

**S1 — Secret JWT par défaut et placeholder en production**
- `packages/api/src/utils/jwt-utils.ts:5` : `process.env.JWT_SECRET || 'changeme_in_production_secret_key_12345'`.
- `packages/api/.env:5` contient la valeur d'exemple publique (`your-access-token-secret-...`).
- Conséquence : n'importe qui ayant lu `env.example` peut forger un token `SUPER_ADMIN`, rôle qui contourne tous les contrôles tenant (`tenant-middleware.ts:44-53`, `permission-service.ts:53-60`).
- Correctif : supprimer le fallback, échouer au démarrage si le secret est absent ou fait moins de 32 caractères, épingler `algorithms: ['HS256']` dans `jwt.verify`, régénérer via `openssl rand -base64 48`.

**S2 — Identifiants tiers réels dans `packages/api/.env`**
- Le fichier contient des valeurs réelles pour Postgres, SMTP, `GOOGLE_CLIENT_SECRET`, `TWILIO_AUTH_TOKEN`, `OPENAI_API_KEY`, `WASENDER_API_KEY`.
- Le fichier est bien ignoré par git, mais il a été lu par plusieurs outils d'assistance IA (dossiers `.serena`, `.cursor`, `.codex`, `.agent`) : il faut considérer ces secrets comme exposés et les faire tourner.
- `OPENAI_API_KEY` n'est référencée nulle part dans `src` : clé inutile à supprimer.

**S3 — Mot de passe Postgres codé en dur dans trois scripts non ignorés**
- `packages/api/create-tenant-user.js:7`, `create-tenant-portal-test-data.js:6`, `create-test-tenant-and-client.js:7` : DSN complet avec mot de passe en fallback.
- Correctif : supprimer ces scripts (non référencés) et changer le mot de passe local.

### 2.2 Élevé

**S4 — Uploads servis publiquement sans authentification**
- `packages/api/src/index.ts:85-107` : `express.static(uploadsPath)` avec `Access-Control-Allow-Origin: *`, sans `authenticate`.
- Contenu concerné : documents de bail (`property-document-service.ts:105`), pièces jointes maintenance, **preuves de paiement des locataires** (`tenant-portal-service.ts:854`), justificatifs de pénalités.
- Noms de fichiers devinables : `Date.now() + Math.random()` (`property-media-service.ts:68`, `property-document-service.ts:90`).
- Correctif : ne laisser en statique que les photos marketing des biens ; servir le reste via un endpoint authentifié et scopé par tenant (modèle existant : `maintenance-attachment-service.ts:141-176 downloadAttachment`) ; nommer avec `crypto.randomUUID()`.

**S5 — IDOR inter-tenant sur médias et documents de propriété**
- Les middlewares de `property-ownership-middleware.ts` ne sont utilisés par aucune route.
- `property-media-service.ts:29-31, 151, 238` et `property-document-service.ts:61, 150, 171` vérifient que la propriété existe, pas qu'elle appartient au tenant.
- Exploitation : un utilisateur du tenant A avec `PROPERTIES_EDIT` peut uploader ou supprimer des documents sur une propriété du tenant B.
- Correctif : exiger `property.tenantId === tenantId` dans chaque service, ou brancher `requirePropertyManagement()` dans `property-routes.ts:140-213`.

**S6 — Routes tenant sans contrôle de droits**
- `tenant-routes.ts:54` : `GET /:tenantId/clients` renvoie e-mails et noms de tous les clients d'un tenant à tout utilisateur authentifié.
- `tenant-routes.ts:60` : `POST /` permet à n'importe quel utilisateur de créer un tenant (le commentaire dit "Admin only").
- Correctif : ajouter `requireTenantAccess` + permission adéquate, ou supprimer la route publique (l'équivalent admin existe dans `admin-routes.ts:35`).

**S7 — Uploads : type vérifié uniquement via le `mimetype` client**
- `upload-middleware.ts:26, 50`, `maintenance-routes.ts:43`, `document-routes.ts:28-31`. L'extension est prise telle quelle depuis `originalname` : un fichier déclaré `image/png` nommé `x.html` est stocké en `.html` sous un chemin public (combinaison avec S4 = phishing/XSS stocké sur l'origine API).
- Correctif : détection par magic bytes (`file-type`), extension dérivée du type détecté, liste blanche.

### 2.3 Moyen

- **Google OAuth sans paramètre `state`** (`auth-routes.ts:64`) : CSRF de login. `failureRedirect: '/login'` renvoie vers l'API et non le frontend. Fusion automatique de compte par e-mail sans vérifier `emailVerified` (`config/passport.ts:37-48`).
- **Refresh tokens jamais rotatés** (`auth-service.ts:263-307`) et `/auth/refresh` sans rate limit. Un utilisateur désactivé garde l'accès jusqu'à 15 min.
- **Mot de passe envoyé en clair par e-mail** (`membership-service.ts:461-464`). Utiliser un lien de réinitialisation à usage unique.
- **Config notifications e-mail/WhatsApp accessible aux membres de type client** (`email-notification-config-routes.ts:9-15`, `whatsapp-notification-config-routes.ts:31-50`) : un locataire rattaché au tenant peut déclencher `/group-broadcast/send`.
- **Rate limiting** limité à 4 routes auth + 2 newsletter ; webhook WhatsApp sans validation de signature Twilio.
- **Création/mise à jour de propriété sans Zod** (`property-controller.ts:28-55`) : `price`, `latitude`, `status`, `typeSpecificData` passent bruts à Prisma. 22 contrôleurs sur 43 n'utilisent pas Zod.
- **Tokens à usage unique dans les logs** : `logging-middleware.ts:12-17` journalise l'URL complète, donc `verify-email?token=...` et les liens newsletter finissent dans `logs/combined.log`.
- **Seeds avec mots de passe fixes** dont un `SUPER_ADMIN` (`seed-quick-login-users.ts:135-180`, `seed-users.ts`), sans garde `NODE_ENV`.

### 2.4 Points positifs

bcrypt coût 12, refresh tokens stockés hashés (SHA-256), tokens de reset UUID v4 avec expiration, `forgot-password` ne révèle pas l'existence du compte, aucune injection SQL (`$queryRaw` uniquement en template tagué), pas de mass assignment (Zod strip les clés inconnues), `docxtemplater` sans parser d'expressions, DOMPurify sur le HTML newsletter côté serveur, aucun token en `localStorage` côté client.

---

## 3. Architecture backend

### 3.1 Gestion des erreurs : le pipeline central existe mais rien ne l'utilise

- `AppError` (`error-middleware.ts:17`) instancié **0 fois** ; `next(error)` **0 fois** dans 42 contrôleurs ; aucun `asyncHandler`.
- À la place : 385 `try/catch`, 155 `res.status(500)`, 349 `throw new Error(...)` dans les services, et les contrôleurs devinent le code HTTP en cherchant des mots dans le message (`includes('not found')` : 59 sites ; `includes(...)` : 85 sites).
- Trois conventions concurrentes : `error.status` (module syndic via `src/lib/errors.ts`), `error.statusCode` (portails), correspondance de chaîne (le reste).
- Trois formes de réponse : `{ error }` 106 fois, `{ message }` 116 fois, `{ error, message }` 48 fois. Le frontend ne peut pas s'appuyer sur une clé stable.
- `utils/error-utils.ts` et `utils/error-messages.ts` : 0 import, code mort.

**Recommandation** : une seule hiérarchie (`AppError` → `NotFoundError`, `ConflictError`, `ForbiddenError`, `ValidationError`), un `asyncHandler` de 5 lignes, `errorHandler` comme unique formateur avec le contrat `{ success:false, code, message, errors? }`. Supprimer les try/catch de contrôleurs et le second système `src/lib/errors.ts`.

### 3.2 Configuration non validée au démarrage

- 45 clés `process.env.*` lues à 137 endroits dans 33 fichiers ; aucun schéma d'environnement.
- `FRONTEND_URL` (16 lectures) et `CLIENT_URL` (15) utilisées indifféremment avec 14 chaînes `A || B || 'http://localhost:3000'`.
- 21 littéraux `http://localhost:...` dans `src`, y compris dans la CSP Helmet (`index.ts:58-59`).
- Deux fichiers d'exemple divergents (`.env.example` 18 variables, `env.example` 33) ; une dizaine de variables utilisées dans le code n'apparaissent dans aucun des deux.

**Recommandation** : `src/config/env.ts` avec un schéma Zod parsé une fois au boot (fail fast), une seule clé `APP_URL`, un seul `env.example` régénéré à partir du recensement des `process.env`.

### 3.3 Écritures multi-étapes sans transaction

- `$transaction` utilisé 28 fois, dont 18 dans le seul module syndic.
- Services avec 4 écritures séquentielles ou plus et zéro transaction : `maintenance-ticket-service` (11), `tenant-service` (10), `rental-penalty-service` (9), `invitation-service` (9), `newsletter-subscriber.service` (8), `document-template-service` (7), `rental-lease-service` (6), `property-media-service` (6).
- Exemple : `rental-lease-service.ts createLease` crée le bail puis met à jour le statut de la propriété puis envoie des notifications ; un échec intermédiaire laisse un bail avec une propriété au mauvais statut.

**Recommandation** : envelopper création + historique / création + changement de statut dans `prisma.$transaction(async tx => ...)`, déclencher e-mails et WhatsApp après commit.

### 3.4 Fichiers géants et module hors architecture

| Lignes | Fichier |
|---|---|
| 3 846 | `src/lib/syndics/queries.ts` (80 fonctions, 145 appels Prisma, **son propre `new PrismaClient()`**) |
| 2 581 | `src/services/owner-portal-service.ts` |
| 2 314 | `src/controllers/syndic-controller.ts` (75 handlers, 87 `any`) |
| 1 845 | `src/services/tenant-portal-service.ts` |
| 1 268 | `src/services/maintenance-ticket-service.ts` |
| 1 253 | `src/services/rental-lease-service.ts` |
| 1 203 | `src/services/crm-contact-service.ts` |

Le découpage routes → contrôleurs → services est globalement respecté (13 appels Prisma dans les contrôleurs contre 732 dans les services), mais les modules syndic et patrimoine vivent dans `src/lib/*/queries.ts` avec leur propre système d'erreurs et de validation : une seconde architecture dans le même paquet.

**Recommandation** : découper `syndics/queries.ts` par agrégat (syndicat, charges, budgets, assemblées, comptabilité, recouvrement), le déplacer dans `services/syndics/`, utiliser le singleton `utils/database.ts`.

### 3.5 Prisma

- **Trois instances `PrismaClient`** : `utils/database.ts:11` (singleton correct), `geographic-service.ts:3`, `lib/syndics/queries.ts:7`. Les deux dernières triplent le pool de connexions et échappent au graceful shutdown.
- **N+1** : `crm-dashboard-service.ts:672, 698` (`count` par statut dans une boucle, à remplacer par `groupBy`) ; `tenant-portal-service.ts:107` et `owner-portal-service.ts:919` (`aggregate` par bail) ; `rental-penalty-service.ts:258` ; `crm-contact-service.ts:873, 1130` (`create` en boucle au lieu de `createMany`).
- 222 `findMany` dont seulement 34 avec `take` : la plupart des listes sont non bornées.
- 77 `await import('./x')` dans 14 fichiers pour contourner des dépendances circulaires entre services : signal d'un graphe de services enchevêtré.

### 3.6 Duplication

- Pagination : `parseInt(req.query.page)` à 45 endroits dans 19 contrôleurs ; `utils/pagination-helper.ts` existe et a 0 import.
- Résolution du tenant : `req.params.tenantId || req.tenantContext?.tenantId` 95 fois, sans helper.
- `owner-portal-service` et `tenant-portal-service` partagent 156 lignes identiques (ex. `tenant-portal-service.ts:95-125` = `owner-portal-service.ts:905-930`).
- Deux services de matching (`crm-matching-service`, `property-matching-service`) exportent les mêmes fonctions.
- `validate(schema)` middleware utilisé dans 2 fichiers de routes sur 22 ; 107 `schema.parse` inline dans 20 contrôleurs.
- `property-rbac-middleware.ts` réimplémente `requirePermission` au lieu de l'envelopper.

### 3.7 Asynchronisme, jobs, TypeScript, logs

- Aucun `process.on('unhandledRejection')`. Aujourd'hui chaque handler a son try/catch, donc le risque est latent, mais tout futur handler sans try/catch laissera la requête pendre (Express 4).
- `reminder-scheduler.job.ts:43-57` est un stub qui compte des lignes sans rien faire (TODO), exécuté chaque jour. Les jobs démarrent dans chaque processus sans verrou : deux instances doubleraient les envois de newsletter.
- `tsconfig` strict, mais 549 `any` dans 92 fichiers (`no-explicit-any: off`). `tsc --noEmit` sur l'API n'a pas terminé en 4 minutes : la compilation complète est très lente, et `dev` tourne en `--transpile-only`, donc les erreurs de type ne bloquent personne.
- 661 `logger.*` contre 58 `console.*` ; nettoyer `rbac-middleware.ts` (5 `console` sur le chemin chaud d'auth).

### 3.8 Tests backend

- 25 fichiers, dont 21 pour le module syndic ; 4 sont des `describe.skip` placeholders.
- `tests/integration/*.test.ts` ne sont pas matchés par Jest, appellent `http://localhost:8001` et des routes `/api/collaborators` qui n'existent plus.
- Seuil de couverture 80 % configuré, jamais atteignable en l'état.
- `src/index.ts` n'exporte pas `app`, ce qui oblige chaque test API à reconstruire une application Express.

---

## 4. Base de données (Prisma)

### 4.1 Isolation multi-tenant

- 55 modèles sur 112 portent un `tenantId`. **43 modèles contiennent des données tenant sans `tenantId`** : enfants de `Property` (`PropertyMedia`, `PropertyDocument`, `PropertyVisit`, `PropertyStatusHistory`...), `CrmContactTag`, 33 modèles syndic scopés uniquement via `syndicateId` (parfois à 3-4 jointures du tenant : `ChargePayment → ChargeCall → Syndicate`, `JournalEntryLine → JournalEntry → AccountingJournal → Syndicate`), `OwnerStatementItem`.
- **`Property.tenantId` est nullable** (`schema.prisma:1202`) alors que c'est l'ancre de tous les modules aval.
- `RentalPaymentDeclaration.tenant_id` et `UserRole.tenantId` sans clé étrangère.
- **Piège de nommage** : `LotTenantAssignment.tenantId` (`:2848`) est un id de `CrmContact` (le locataire du lot), pas un id de `Tenant` SaaS. Tout helper générique "filtrer par tenantId" filtrerait sur la mauvaise entité.
- Aucune défense en profondeur : pas de RLS Postgres, pas d'extension Prisma injectant `tenantId`.

### 4.2 Contraintes uniques en collision entre tenants

| Ligne | Contrainte | Problème |
|---|---|---|
| 1198 | `Property.internalReference @unique` | La référence "REF-001" de l'agence A bloque l'agence B |
| 1995 | `RentalDocument.document_number @unique` | Compteurs par tenant mais numéro globalement unique |
| 1809 | `RentalPayment.idempotency_key @unique` | La clé du tenant A peut rejeter ou dédupliquer un paiement du tenant B |
| 2058 | `DocumentTemplate @@unique([tenant_id, doc_type, is_default])` | N'autorise qu'un seul template **non** défaut par type ; contournée par `tenant_id` NULL |
| 1429 | `PropertyMandate @@unique([propertyId, tenantId, isActive])` | Un seul mandat inactif possible : la seconde révocation échoue |

Correctif type :

```prisma
model Property {
  tenantId          String @map("tenant_id")   // rendre obligatoire
  @@unique([tenantId, internalReference])
  @@index([tenantId, status])
}
model RentalPayment {
  @@unique([tenant_id, idempotency_key])
}
```

Les deux contraintes conditionnelles (`is_default`, `isActive`) doivent devenir des index uniques partiels (`WHERE is_active`) via migration SQL brute.

### 4.3 Migrations

- Quatre migrations datées 2025 modifient des tables créées par `20260105094708_init` ; elles ont été réécrites en no-op et refaites dans `20260207120000_ensure_deal_stage_without_appointment`.
- Deux migrations sans nom (`20260308234920_`, `20260308235201_`) quasi identiques ; `20260309000225_fix_uuid_fk_consistency` vide.
- **Dérive détectée** : les migrations créent un index unique sur `newsletter_campaign_recipients.open_token` absent du schéma ; le prochain `migrate dev` générera un `DROP INDEX`.
- `packages/api/temp_migration.sql` (UTF-16, diff obsolète) **supprimerait les tables du module maintenance** s'il était appliqué. À supprimer.
- `setup-database.bat:47-50` retombe sur `migrate dev --name init` si `migrate deploy` échoue : crée des migrations parasites hors dev.
- `database-schema.md` documente 38 tables sur 112 et liste encore `crm_appointments`, supprimée.

**Recommandation** : re-baseliner (`prisma migrate diff --from-empty --to-schema-datamodel` → `0000_baseline`, `migrate resolve --applied` sur les environnements existants), ajouter `openToken @unique`, ajouter `prisma migrate diff --from-migrations --to-schema-datamodel --exit-code` en CI.

### 4.4 Intégrité référentielle

- 156 `Cascade`, 38 `SetNull`, 0 `Restrict`, 52 relations sans `onDelete`.
- **Registres financiers en cascade depuis un contact** : supprimer un `CrmContact` efface `OwnerAccount`, `OwnerAccountTransaction`, `OwnerStatement`. Supprimer un `SyndicateLot` efface `ChargeCall`, `ChargePayment`, `LatePaymentPenalty`.
- Supprimer un `User` efface `CrmActivity` et `CrmNote` créées par lui (historique perdu).
- `AuditLog.actorUserId` / `tenantId` sont des FK nullables en `SetNull` : le journal d'audit perd son acteur à la suppression. Stocker ces ids en colonnes simples sans FK.
- Aucun soft delete (`deletedAt`) ; substituts ad hoc (`ARCHIVED`, `isActive`) sur 12 modèles.
- 18 colonnes id sans FK (dont `RentalLease.crm_deal_id`, `LotTenantAssignment.leaseId`, `Membership.invitedBy`).

### 4.5 Index

- Chaque modèle avec `tenantId` a un index dessus (bon).
- **42 colonnes FK sans index** (Postgres n'indexe pas les FK) : `RentalLease.property_id / primary_renter_client_id / owner_client_id`, `CrmDeal.contactId`, `MaintenanceTicket.assigned_vendor_id / assigned_to_user_id`, tous les `created_by_user_id` du module locatif, `NewsletterCampaignRecipient.subscriberId`...
- Colonnes chaudes sans index : `Property.createdAt / price`, pas de composite `[tenantId, status]` ; `NewsletterCampaignRecipient.unsubscribeToken` (seq scan à chaque clic de désinscription) ; `AuditLog` sans `[tenantId, createdAt]`.
- `CrmContact` a 15 index dont des globaux mono-colonne (`email`, `phonePrimary`) redondants avec les versions préfixées tenant.

### 4.6 Types et modélisation

- **`Property.price` et `Property.fees` en `Float`** (`:1216-1217`) alors que 78 autres montants sont en `Decimal`. `Invoice.amountTotal Decimal(10,2)` plafonne sous 100 M, insuffisant pour l'immobilier en XOF.
- Trois conventions de devise par défaut : `"EUR"` (Property), `"FCFA"` (locatif, non ISO), `"XOF"` (syndic, patrimoine).
- Trois stratégies d'identifiants (`uuid()` en TEXT, `@db.Uuid`, `cuid()`) : cause racine des migrations de cast UUID.
- Nommage des champs en snake_case dans les modules locatif/documents/maintenance, camelCase ailleurs (`lease.tenant_id` vs `contact.tenantId` dans le client généré).
- Texte libre là où des enums existent : `Communication.status`, `ChargePayment.method` (trois enums de méthode de paiement existent déjà), `CrmContact.source` à côté de `leadSource`.
- 27 colonnes JSON dont `CrmContact.projectIntentJson` qui duplique le concept `CrmDeal` (8 enums dédiés existent).
- 37 modèles sans `@updatedAt`, dont des modèles mutables (`GMResolution`, `LatePaymentPenalty`, `NewsletterCampaignRecipient` sans aucun timestamp).
- Concept "personne" modélisé 6 fois (`User`, `TenantClient`, `CrmContact`, `LotOwnerProfile`, `LotTenantProfile`, `LotTenantAssignment`) ; "owner" pointe vers trois entités différentes selon le module ; deux tables de prestataires (`MaintenanceVendor`, `ServiceProvider`) ; quatre tables de documents ; deux systèmes d'incidents.
- 9 modèles sans aucun appel `prisma.<model>` dans `src` : `Communication`, `CommunicationPreference`, `CrmNote`, `GMProxy`, `PropertyVisitCollaborator`, `ReminderConfig`, `RentalInstallmentItem`, `RentalRefund`, `SyndicPaymentMethod`.

### 4.7 Seeds

- **`prisma/seed.ts` (cible de `prisma db seed`) fait `deleteMany()` sur `user`, `tenant`, `tenantClient`** : avec 156 cascades, cela efface toutes les données. Documenté comme commande standard dans deux guides.
- Mots de passe fixes dans 6 seeds (`Test@123456`, `Admin@123456`, `P@ssw0rd_2025`...), rôles `Instructor`/`Student` copiés d'un autre projet.
- `package.json` `db:assign:rbac` pointe vers un fichier inexistant.
- Scripts de diagnostic (`list-*.ts`, `fix-*.ts`) mélangés au dossier seeds.

### 4.8 Audit et traçabilité

- `AuditLog` couvert par 24 services sur 56. Non audités : authentification, attribution de rôles, tout le module syndic (appels de charges, paiements, écritures comptables, votes), patrimoine, newsletter, config notifications.
- `createdBy` sur 13 modèles seulement ; `updatedBy` nulle part ; `JournalEntry` a `isLocked` mais pas `postedBy`.

---

## 5. Frontend (apps/web)

### 5.1 Élevé

**F1 — Aucun code-splitting**
- `App.tsx` : 118 routes, 110 imports statiques, **0 `React.lazy`**. Le `<Suspense>` de `dashboard-layout.tsx:35` n'enveloppe rien de paresseux.
- Build : un seul `main.*.js` de **3,9 Mo brut / 1,07 Mo gzip**.
- `xlsx`, `react-big-calendar` + `moment`, `recharts`, `framer-motion`, `prismjs` chargés au démarrage.
- Correctif : `React.lazy` par domaine (syndics, patrimoine, crm, rental, portails, admin), `import('xlsx')` dynamique dans `exportToExcel`.

**F2 — ESLint non configuré**
- Aucun `.eslintrc*` ni clé `eslintConfig` : `npx eslint src` échoue immédiatement. Les plugins sont installés mais jamais branchés.
- Conséquence : `react-hooks/exhaustive-deps` n'a jamais tourné sur 209 `useEffect` (ex. `Properties.tsx:110-114` omet `loadProperties` et `filters`).

**F3 — Tests cassés et peu significatifs**
- 7 suites sur 11 en échec (12 tests sur 27). Causes : dérive d'accents (`'Comptabilite syndic'` attendu vs `Comptabilité syndic` rendu), mock `antd` sans `Form`, un spy jamais appelé.
- Les 11 fichiers ne couvrent que syndics et patrimoine ; 0 test pour auth, client API, CRM, locatif, portails. 10 sur 11 remplacent tout `antd` par des `div` et vérifient que du JSON mocké apparaît.
- `jest.config.js` déclare `ts-jest` (non installé) et 80 % de couverture, mais `react-scripts test` l'ignore ; `jest ^29` en devDeps entre en conflit avec le Jest 27 de CRA.

**F4 — Dépendances mortes ou dupliquées**

| Paquet | Fichiers l'important | Verdict |
|---|---|---|
| `next` ^16 | 0 | Mort. Exige React 19, conflit masqué par `legacy-peer-deps=true`. |
| `puppeteer` (web devDep et racine prod) | 0 | Mort. Source des 10 vulnérabilités `npm audit` racine (2 critiques, 8 hautes). |
| `moment` + `@types/moment` | 2 | Remplacer par `dayjsLocalizer` ; `@types/moment` est un stub obsolète. |
| `date-fns` | 4 | Migrer vers `dayjs` (39 fichiers). |
| `@types/xlsx` | — | Stub obsolète. |
| `xlsx` 0.18.5 | 1 | Dernière version npm ; CVE-2023-30533 et CVE-2024-22363 corrigées uniquement sur le CDN SheetJS. Remplacer par `exceljs` (déjà utilisé côté API). |
| `@radix-ui/*` + `components/ui` (16 fichiers) | 7 consommateurs | Couche shadcn quasi inutilisée à côté d'antd (173 fichiers). Supprimer ou s'y engager. |
| `lucide-react` | 34 | Second jeu d'icônes à côté de `@ant-design/icons` (129). |

Trois systèmes de style coexistent : tokens antd, Tailwind (52 fichiers), `style={{}}` inline.

### 5.2 Moyen

**F5 — Couche API contournée**
- `utils/api-client.ts` (axios, `withCredentials`) est bien centralisé (54 imports, 0 axios sauvage), mais **13 `fetch()` bruts dans 8 fichiers** le contournent (`TeamPage.tsx`, `TenantRegisterForm.tsx`, `Deposits.tsx`, `Documents.tsx`, newsletter...). Sept utilisent des URLs relatives `/api/...` sans `proxy` CRA : en dev elles reçoivent `index.html`. Deux omettent `credentials: 'include'`.
- Refresh sur 401 sans mutex : N requêtes concurrentes en 401 déclenchent N `POST /auth/refresh`. En cas d'échec, `window.location.href = '/login'` perd le `?redirect=` construit par `ProtectedRoute`.
- 16 fallbacks `http://localhost:8001` dans 15 fichiers ; `env.example` indique le port 8000.
- Gestion d'erreur par site d'appel : 400 `catch`, 193 `message.error`, 46 `alert()/confirm()` natifs ; `utils/error-handler.ts` existe mais est peu utilisé.

**F6 — Data fetching artisanal**
- 209 `useEffect`, **0 `AbortController`**, 0 flag `isMounted`, 331 `useState` booléens, 269 `setLoading` : la machine loading/error est réécrite dans chaque page.
- Waterfalls : `AuthContext.tsx:84-122` (`getMe` puis memberships en séquence, bloquant toutes les pages protégées) ; `Deposits.tsx:55-57` où `loadMovements` s'arrête sur `!deposit?.id` au premier rendu.
- Recommandation : `@tanstack/react-query` ; les 24 modules `services/` ont déjà la forme de `queryFn`.

**F7 — Sécurité client**
- `NewsletterCampaignsPage.tsx:383` injecte `preview.html` (HTML édité par l'utilisateur) via `dangerouslySetInnerHTML` sans sanitisation côté client : XSS stocké. Rendre dans un `<iframe sandbox srcdoc>`.
- `ProtectedRoute.tsx:94-96` : `requirePermission` est un TODO ; l'UI affiche des actions que le serveur refusera.
- `Penalties.tsx:278` `window.open` sans `noopener`.

**F8 — Composants surdimensionnés et dupliqués**
- > 800 lignes : `PropertyFormWizard` 1 205, `LeaseFormWizard` 1 072, `PropertyPatrimoineTab` 1 033, `DealForm` 1 018, `App.tsx` 868, `PropertyForm` 844, `ContactForm` 801.
- Doublons : `PropertyForm` (édition) vs `PropertyFormWizard` (création) ; `LeaseForm` vs `LeaseFormWizard` importés tous deux dans `LeaseFormPage` ; `DocumentVault.tsx` dans `patrimoine/` et `syndics/` ; `useAuth` exporté deux fois.
- 0 `React.memo`, 8 `useCallback` sur 72k lignes ; 15 tables `pagination={false}` sans virtualisation.

### 5.3 Faible

- `strict: true` et `tsc` propre, mais 509 `: any` et 59 `as any` (`DealForm.tsx` 30, `Payments.tsx` 18). Manquent `noUnusedLocals`, `noImplicitReturns`.
- 33 `console.log` dont un dans le rendu de `LeaseForm.tsx:404`.
- Pas d'i18n (≥ 322 littéraux français en JSX) : acceptable si le produit reste francophone.
- Accessibilité minimale (10 `aria-*`, spinners sans `role="status"`).

---

## 6. Dépôt, DevOps, maintenabilité

### 6.1 Critique

**D1 — Aucun historique git**
- `git log --all` vide, aucune branche, aucun remote, pas d'index. `.git/objects` contient 5 789 blobs orphelins (53 Mo) issus d'un `git add` jamais commité ; ces blobs sont périmés.
- Conséquence : zéro traçabilité, zéro rollback, aucune branche `main` pour ouvrir des PR. Les 16 dossiers de `specs/` décrivent un workflow par branche qui n'a jamais existé.

**D2 — `.gitignore` racine inadapté**
- Le fichier racine (279 octets) n'ignore que `node_modules` et des règles byterover. Seraient commités : `uploads/` (5 Mo, preuves de paiement), `packages/uploads/` (**211 Mo**, 136 fichiers), `packages/api/uploads/`, `assets/generated_documents/` (34 Mo de baux `.docx` par tenant), `dist_test/`, `.serena/` (cache pickle), `*.log`, `temp_migration.sql`, `missing-lease-data-report.json`.
- Trois dossiers d'uploads existent parce que `index.ts:73-77` calcule `projectRoot` depuis `process.cwd()`.
- `packages/api/.gitignore:32` contient `prisma/migrations/*.sql` (ne matche pas par chance, un niveau trop haut) et les deux sous-`.gitignore` ignorent `package-lock.json` (perte de reproductibilité).

### 6.2 Élevé

**D3 — Aucune chaîne qualité**
- Pas de `.github/workflows`, `Dockerfile`, `docker-compose`, `husky`, `lint-staged`, `commitlint`, `.nvmrc`, `.editorconfig`, champ `engines`. Node local v24 avec `react-scripts@5` (non testé au-delà de Node 20).

**D4 — Code mort et étranger au projet**
- `lib/` racine (errors, syndics) : copies anciennes de `packages/api/src/lib`, 0 import.
- `app/api/whatsapp/webhook/route.ts` : handler Next.js App Router alors que le front est CRA ; reliquat d'une direction abandonnée (`specs/013-syndic-module/plan.md:15`).
- `packages/api/dist_test/`, `packages/api/npm` (0 octet), `temp_migration.sql`, `missing-lease-data-report.json`, 8 modules `src` jamais importés (831 lignes : `communication-rbac-middleware`, `property-ownership-middleware`, `pagination-helper`, `error-utils`...).
- Scripts racine : `001 stop-services.bat` tue **tous** les processus Node de la machine et porte le titre "OphtaClinic Pro" ; `start-dev.bat` utilise le port 8000 (l'API écoute sur 8001) ; `.cursorrules` décrit un projet "UdemyClone" ; `seed-users.ts` crée des rôles Instructor/Student.

**D5 — Documentation éclatée et contradictoire**
- 21 fichiers `.md` à la racine, 17 écrits à la même minute (2026-01-14). Six docs OAuth qui se recouvrent, quatre vues d'architecture, `CONFIGURATION_WASENDER_COMPLETE.md` en double avec `docs/communication/`.
- Port backend documenté comme 8000, 5000, 3001 ou 8001 selon le fichier. Trois identités de projet (`@standard-app`, UdemyClone, OphtaClinic Pro).
- Trois dossiers d'outils IA identiques (`.agent/`, `.codex/`, `.cursor/` avec les mêmes 9 prompts spec-kit) ; `AGENTS.md`/`GEMINI.md` sont des stubs auto-générés décrivant une structure `backend/ frontend/` inexistante.
- `README.md` est celui du template : mauvais nom, mauvais script, affirmation fausse que `npm install` racine installe les sous-paquets.

### 6.3 Moyen

- Monorepo sans `workspaces` : trois lockfiles, `npm --prefix`, aucune config TS/ESLint partagée. `puppeteer` en dépendance **de production** à la racine, jamais importé (imposé par la "constitution" spec-kit, pas par le code).
- `npm outdated` : 36 paquets en retard côté API (Prisma 5→7, Express 4→5, ESLint 8 EOL, Zod 3→4), 39 côté web (React 18→19, `react-scripts` mort).
- Pas de `postinstall` pour `prisma generate` : un clone frais échoue au premier `npm run dev`.

---

## 7. Feuille de route recommandée

### Semaine 1 — Stopper l'hémorragie (sécurité et dépôt)

1. Faire tourner tous les secrets de `packages/api/.env` et le mot de passe Postgres local ; supprimer `OPENAI_API_KEY` (inutilisée).
2. Supprimer le fallback de `jwt-utils.ts:5`, ajouter `src/config/env.ts` (Zod, fail fast).
3. Réécrire le `.gitignore` racine (`uploads/`, `packages/uploads/`, `packages/api/uploads/`, `assets/generated_documents/`, `dist_test/`, `.serena/cache/`, `*.log`, `.env*` sauf `env.example`), retirer `prisma/migrations/*.sql` et `package-lock.json` des sous-`.gitignore`, puis premier commit sur `main`, `git gc`, remote.
4. Uploads : déplacer les documents privés hors du dossier statique, endpoint authentifié et scopé, `crypto.randomUUID()` pour les noms.
5. IDOR : vérifier `property.tenantId` dans `property-media-service` et `property-document-service` ; protéger `tenant-routes.ts:54, 60` et les routes de config notifications.
6. Supprimer `temp_migration.sql`, les trois scripts `create-*.js`, `001 stop-services.bat`, `test-google-oauth.html`, `test-contact-creation.js`, `lib/`, `app/`, `dist_test/`, `npm`.
7. Garder `prisma/seed.ts` derrière `NODE_ENV !== 'production'` et `ALLOW_DESTRUCTIVE_SEED`.

### Mois 1 — Fiabiliser

1. Backend : hiérarchie `AppError` + `asyncHandler` + un seul format de réponse ; transactions sur les écritures multi-étapes ; singleton Prisma unique ; corriger les N+1 du dashboard CRM et des portails.
2. Base : `Property.tenantId` obligatoire, `tenantId` sur `PropertyVisit`/`PropertyMedia`/`PropertyDocument` et les tables financières syndic ; uniques scopés par tenant ; re-baseline des migrations ; `Restrict` sur les registres financiers ; `AuditLog` sans FK nullables ; index sur les 42 FK ; `Property.price` en `Decimal(14,2)`.
3. Frontend : `.eslintrc` (`react-app` + `@typescript-eslint` + `react-hooks` + `prettier`) ; `React.lazy` par domaine ; réparer les 7 suites de tests ; supprimer `next`, `puppeteer`, `moment`, `date-fns`, `@types/moment`, `@types/xlsx` ; remplacer `xlsx` par `exceljs` ; router les 13 `fetch` bruts via `apiClient` avec mutex de refresh ; `iframe sandbox` pour l'aperçu newsletter.
4. Auth : `state` sur Google OAuth, rotation des refresh tokens, rate limit sur `/refresh`, `/reset-password`, `/invitations/accept`, signature Twilio sur le webhook, fin des mots de passe par e-mail.
5. Qualité : `.nvmrc` = 20, `engines`, husky + lint-staged, workflow GitHub Actions (`tsc --noEmit`, eslint, jest, build, `prisma migrate diff --exit-code`), `Dockerfile` API + `docker-compose` Postgres remplaçant les `.bat`.

### Trimestre — Structurer

1. npm workspaces (un lockfile), `packages/tsconfig` et `packages/eslint-config` partagés, renommage `@immotopia/*`.
2. Découper `lib/syndics/queries.ts` en services par agrégat ; factoriser les portails locataire/propriétaire ; fusionner les deux services de matching ; brancher `pagination-helper` et `validate()` partout.
3. Extension Prisma injectant `tenantId` + politiques RLS Postgres en seconde ligne de défense.
4. Migration CRA → Vite (supprime `legacy-peer-deps`, Jest 27, ESLint 8 hérités), adoption de react-query, découpage des composants > 800 lignes, fusion `PropertyForm`/`PropertyFormWizard` et `LeaseForm`/`LeaseFormWizard`.
5. Documentation : `README.md` réel + `docs/{setup,architecture,integrations,runbooks}`, fusion des 6 docs OAuth et des 4 vues d'architecture, un seul dossier de prompts IA, `database-schema.md` régénéré.
6. Réduire la dette de typage (549 `any` API, 568 web) avec `no-explicit-any: warn` puis `error` module par module ; étendre `AuditLog` à l'auth, aux rôles et au module syndic.

---

## 8. Annexe — chiffres clés

| Indicateur | API | Web |
|---|---|---|
| Fichiers / lignes | 200 / 61 400 | 300 / 72 500 |
| `any` | 549 (92 fichiers) | 568 |
| `try/catch` dans les contrôleurs | 385 | — |
| `useEffect` / `AbortController` | — | 209 / 0 |
| `React.lazy` / routes | — | 0 / 118 |
| Bundle principal | — | 3,9 Mo (1,07 Mo gzip) |
| Fichiers de test / en échec | 25 (4 vides, 2 non exécutables) | 11 / 7 |
| Instances `PrismaClient` | 3 | — |
| `$transaction` | 28 (18 dans le syndic) | — |
| Modèles Prisma / avec `tenantId` | 112 / 55 | — |
| FK sans index | 42 | — |
| Vulnérabilités `npm audit` racine | 2 critiques, 8 hautes (toutes via puppeteer) | — |
| Commits git | 0 | — |
