# Plan d'implémentation 034 — Accès en lecture seule pour tiers de confiance

**Branche** : `feat/patrimoine-tiers-confiance` · **Spec** : [spec.md](./spec.md) ·
**Plan de vague** : [PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md) (lot B3) ·
**Socle** : [spec 031](../031-patrimoine-canaux-liens-securises/spec.md) (`lib/secure-links`)

## Résumé

L'agence crée un accès nominatif (`ExternalAccessGrant`) pour un notaire, un
expert-comptable ou un banquier : périmètre explicite de biens et d'entités, rubriques
autorisées, documents liés, échéance ou accès permanent. Le tiers reçoit par e-mail un lien
`SecureLink` de portée `EXTERNAL_ACCESS_GRANT`, l'ouvre sans compte et lit, en lecture
seule, les seules rubriques accordées ; il télécharge les seuls documents liés. Le lot étend
`lib/secure-links` (portée, plafond lié à l'accès, révocation en bloc), ajoute deux routes
publiques sur le gabarit de la spec 031 et neuf routes agence, une notification e-mail, un
écran « Accès partagés » et la page publique `/acces-partage`.

## Contexte technique

- API Express 4, Prisma 5, PostgreSQL, Jest ; web React 18, Ant Design, Vitest.
- Existant réutilisé : `lib/secure-links/` (`token.ts`, `service.ts`, `errors.ts`,
  `invalidSecureLinkError`, `createSecureLink`, `verifySecureLink`, `buildSecureLinkUrl`),
  `routes/secure-link-public-routes.ts` et `controllers/secure-link-public-controller.ts`
  (gabarit : limiteur, en-têtes, parseur 1 Ko, erreur de corps), `app.ts` (exclusion des
  préfixes publics des parseurs globaux), `middleware/rate-limit-middleware.ts`,
  `routes/patrimoine-routes.ts` (`requireAnyPropertyPermission`),
  `lib/patrimoine/yield.ts` (`buildPropertyYieldInput` et fonctions pures, **sans les
  modifier**), `ownerSharesByProperty`, `VALUATION_ORDER_BY`,
  `getPropertyDocumentFileForTenant`, `utils/tenant-ownership.ts`
  (`assertBelongsToTenant`), `lib/owner-portal-scope.ts` (`activeMandateWhere`), `services/audit-service.ts`
  (`logAuditEvent`), `services/email-service.ts`, `lib/patrimoine/notifications.ts` (patron
  d'envoi), constantes de notification, `OwnerMonthlyReportPage.tsx` (patron de page
  publique).
- Migrations additives à horodatage supérieur à `20261007110000` (lot A3) : aucune
  migration existante n'est éditée.
- Les agents back et web partagent un contrat de conception (routes, DTO, modèle) dont la
  spec reprend les exigences. Un écart nécessaire se signale au coordinateur ; il ne se
  contourne pas.

## Vérification de la constitution (AGENTS.md)

| Règle                          | Application                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant         | `tenantId` direct sur les quatre modèles ; routes agence sous `requireTenantAccess` ; identifiants reçus vérifiés par agence (`assertBelongsToTenant` pour le propriétaire ; `propertiesInAgencyScope` et `entitiesInAgency` de `lib/external-access/scope.ts` pour les biens et les entités) ; `NotFoundError` uniforme ; vue publique lue sous le contexte d'agence du lien |
| Erreurs typées, `asyncHandler` | contrôleurs enveloppés ; erreurs de `middleware/error-middleware` ; 400/409 par erreurs typées, pas de statut deviné d'un message                                                                                                                                                                                                                                             |
| Permissions                    | `PROPERTIES_VIEW` pour les lectures, `PROPERTIES_EDIT` pour les écritures, mêmes gardes que `patrimoine-routes.ts` (`requireAnyPropertyPermission`, `requirePropertyPermission`) ; aucune nouvelle permission (spec, H3)                                                                                                                                                      |
| Configuration                  | aucune variable nouvelle : `SECURE_LINK_DEFAULT_TTL_DAYS` et `SECURE_LINK_MAX_TTL_DAYS` existantes, via `config/env.ts`                                                                                                                                                                                                                                                       |
| Frontend                       | `utils/api-client`, `config/api`, pages en `React.lazy`, pas de `dangerouslySetInnerHTML` ; téléchargement en blob par `POST`                                                                                                                                                                                                                                                 |
| i18n                           | fr clé, `npm run i18n:extract` côté web et API ; marges logiques ; arabe (RTL) vérifié                                                                                                                                                                                                                                                                                        |
| Fichiers uploadés              | document servi uniquement par la route de téléchargement, jamais en statique, sans chemin disque                                                                                                                                                                                                                                                                              |
| Wiki                           | sous-fonctionnalités signalées au coordinateur (voir plus bas)                                                                                                                                                                                                                                                                                                                |

## Découpage par territoire de fichiers

Un fichier = un seul agent. Ordre : 1 → 2 → (3 ∥ 4 ∥ 5 ∥ 6) → 7 → 8. Les couches 3, 4 et 5
ne partagent aucun fichier ; la couche 6 (web) se développe en parallèle des couches 3 à 5
sur le seul contrat de la spec (sections 3 et 4 du contrat de conception).

### 1. Schéma, migrations et audit

- `packages/api/prisma/schema.prisma` : enums `ExternalAccessType` et
  `ExternalAccessSection` ; modèles `ExternalAccessGrant`, `ExternalAccessGrantProperty`,
  `ExternalAccessGrantEntity`, `ExternalAccessGrantDocument` (`tenantId` direct, `@@map` en
  snake_case, `@map` des colonnes comme `SecureLink`, index `[tenantId]`,
  `[tenantId, revokedAt]`, `[grantId]`, unicités et cascades de FR-002) ; valeur
  `EXTERNAL_ACCESS_GRANT` ajoutée à `SecureLinkScope` ; relations inverses sur `Tenant`,
  `User`, `TenantClient`, `Property`, `PropertyDocument` et `HoldingEntity`.
- `packages/api/prisma/migrations/20261007140000_patrimoine_acces_tiers/migration.sql`
  (enums et quatre tables) puis, **séparée**,
  `20261007140100_secure_link_scope_external_access/migration.sql`
  (`ALTER TYPE "SecureLinkScope" ADD VALUE 'EXTERNAL_ACCESS_GRANT';`, non utilisée dans la
  même migration : PostgreSQL interdit d'employer une valeur d'enum dans la transaction qui
  l'ajoute).
- `packages/api/src/types/audit-types.ts` : six événements `EXTERNAL_ACCESS_GRANT_*` (FR-035).
- `packages/api/src/services/tenant-data-export/model-registry.ts` : **non modifié**. Le
  classement est dérivé du schéma : les quatre modèles sont exportés (`DIRECT` sur
  `tenantId`), `SecureLink` reste dans `EXCLUDED_MODELS` ; un test de
  `__tests__/unit/tenant-data-export.registry.test.ts` le vérifie (hypothèse H7 bis).

### 2. Extension de `lib/secure-links`

- `packages/api/src/lib/secure-links/` : type `SecureLinkScope` étendu ;
  `buildSecureLinkUrl` : cas `EXTERNAL_ACCESS_GRANT` →
  `${FRONTEND_URL}/acces-partage#<jeton>` ; option `maxExpiresAt` de `createSecureLink`
  (échéance = minimum de la durée demandée plafonnée et de `maxExpiresAt` ; plafond
  inchangé, refus au-delà) ; `revokeSecureLinksForObject(tenantId, objectType, objectId,
actorUserId)` (idempotente, bornée à l'agence, journalise la révocation). `countActiveSecureLinksByObject`
  (liens non révoqués et non échus d'un lot d'objets, une requête `groupBy` bornée à l'agence)
  fournit `activeLinkCount` à la couche 3. Le noyau (`token.ts`, `verifySecureLink`) ne change pas.
- Tests unitaires : `maxExpiresAt` borne l'échéance ; plafond et défaut inchangés ;
  révocation en bloc idempotente et sans effet sur une autre agence ou un autre objet.

### 3. Bibliothèque métier `lib/external-access` et routes agence

- `packages/api/src/lib/external-access/` (noms livrés) :
  - `sections.ts` : types, rubriques, défauts par type, normalisation (dédoublonnage, ordre
    canonique), constantes (`EXTERNAL_ACCESS_OBJECT_TYPE`, plafonds de saisie) ; module pur ;
  - `schemas.ts` : schémas `zod` stricts (création, modification, renvoi, journal) ;
  - `scope.ts` : règle de périmètre **unique** (`agencyPropertyWhere` : bien de l'agence ou bien
    CLIENT sans agence sous mandat actif), développement des entités par `PropertyHolding`,
    `resolveGrantScope` (périmètre effectif, dédoublonné, refiltré par agence) ;
  - `service.ts` : liste, détail, options du formulaire, documents d'un bien, journal,
    création, modification, révocation, renvoi, statut calculé (`REVOKED` / `EXPIRED` /
    `EXPIRING` / `ACTIVE`), `GrantSummary` et `GrantDetail`, vérification par agence de tous les
    identifiants reçus, document dans le périmètre résultant, émission des liens
    (`createSecureLink` avec `maxExpiresAt`), durée de lien validée avant toute écriture ou
    révocation, annulation de la création limitée à l'échec de `createSecureLink`, envoi de
    l'e-mail, événements d'audit ; modification : seuls les identifiants ajoutés sont
    revérifiés, le reste est élagué en silence, retirer `DOCUMENTS` supprime les documents ;
    propriétaire désigné éligible (même filtre que les options) ; entité sans détention = 400 ;
  - `index.ts` : exports.
- `packages/api/src/routes/external-access-routes.ts` et
  `controllers/external-access-controller.ts` : les neuf routes de FR-025 sous
  `/api/tenants/:tenantId/patrimoine/external-access`, gardées route par route par
  `requireAnyPropertyPermission(['PROPERTIES_VIEW'])` (lectures) ou
  `requirePropertyPermission('PROPERTIES_EDIT')` (écritures), comme `patrimoine-routes.ts` ;
  chemins littéraux (`scope-options`, `property-documents/:propertyId`) déclarés avant
  `/:grantId` ; `zod` lu par `.parse` ; `asyncHandler`. Montage dans `app.ts` après les routeurs
  du patrimoine (point de contact avec la couche 4, voir plus bas) ; routes couvertes par la
  règle `PATRIMOINE` de `lib/subscription/route-features.ts`.
- Aucun jeton, aucun hash, aucun e-mail du bénéficiaire dans le payload d'audit.

### 4. Routes publiques et vue (`lib/external-access/view.ts`)

- `packages/api/src/routes/external-access-public-routes.ts` et
  `controllers/external-access-public-controller.ts`, sur le gabarit de
  `secure-link-public-routes.ts` : `PUBLIC_EXTERNAL_ACCESS_PREFIX =
'/api/public/external-access'`, `POST /public/external-access/patrimoine` et
  `POST /public/external-access/documents/download` ; limiteur de débit par IP en premier
  (`secureLinkPublicRateLimiter`, le même objet que le rapport mensuel : un seul budget partagé) ;
  en-têtes de FR-014 sur succès, refus et 429 du limiteur de route ; parseur
  `express.json({ limit: '1kb' })` propre ; middleware d'erreur local qui convertit toute
  erreur de corps en `invalidSecureLinkError()` sans journaliser le message du parseur ;
  schémas Zod `{ token }` et `{ token, documentRef }` (`documentRef` borné à 64 caractères).
  Aucun `authenticate`.
- `packages/api/src/lib/external-access/view.ts` : `getExternalAccessViewByToken` vérifie le
  jeton (`verifySecureLink`, portée `EXTERNAL_ACCESS_GRANT`), charge l'accès par `id` et
  `tenantId` du lien sous `runWithTenantContext`, revérifie `revokedAt` et `expiresAt`,
  résout le périmètre (vide : refus uniforme), puis construit le `ExternalAccessViewDto`
  **uniquement avec les rubriques accordées**, par `select` explicites (aucun e-mail, téléphone, identité de
  locataire, nom de co-indivisaire, texte libre, fournisseur, chemin ou identifiant
  technique). Réutilise `buildPropertyYieldInput` et les fonctions pures de
  `lib/patrimoine/yield.ts`, `ownerSharesByProperty` et `VALUATION_ORDER_BY` sans les
  modifier. Enregistre la consultation seulement après succès : `viewCount` et `lastViewedAt` **du grant**
  et audit `EXTERNAL_ACCESS_GRANT_VIEWED` avec IP et user-agent ; `recordSecureLinkView` n'est
  pas appelé (compteurs du `SecureLink` inchangés).
- `getExternalAccessDocumentByToken` : mêmes vérifications, rubrique `DOCUMENTS`,
  `documentRef` = ligne de liaison de cet accès, bien encore dans le périmètre ; fichier lu
  par `getPropertyDocumentFileForTenant(..., { managedByMandate: true })` ; réponse unique
  depuis un tampon en mémoire (pas de flux) avec `Content-Disposition: attachment` et
  `X-Content-Type-Options: nosniff` ; audit du téléchargement après lecture réussie.
- `packages/api/src/app.ts` : exclusion du préfixe dans les parseurs globaux (`PUBLIC_TOKEN_PREFIXES`), montage du
  routeur public (qui porte les deux routes) avant les routeurs d'agence, montage du routeur de
  la couche 3 après `patrimoineEntitiesRoutes`.
  **Fichier partagé par les couches 3 et 4 : un seul agent le modifie** (celui de la
  couche 4).
- `packages/api/__tests__/unit/routes-inventory.test.ts` : les deux routes publiques à la
  liste blanche, avec justification ; les neuf routes agence classées.
- Écarts du DTO livré avec le contrat initial, repris dans la spec (FR-017, FR-018) :
  `valuation` vaut `null` (clé présente) sans valorisation et les autres rubriques accordées
  sont toujours présentes (`[]` ou objet) ; `yield.netNetYield` est `null` sans `LOANS` ;
  `summary.ownerShareApplied` est ajouté (totaux pondérés par la quote-part du propriétaire
  désigné) ; plafond de 100 biens par accès (400 à l'écriture, troncature et `summary.truncated`
  à la consultation) ; dépenses sur 24 mois glissants, 200 lignes au plus par bien, total sur
  12 mois ; `grossYield` et `netYield` à `null` sans valorisation ; `titles` ne nomme que les
  personnes morales explicitement listées dans l'accès (accès par biens seuls : aucun détail),
  le reste est agrégé en `otherHoldersSharePercent` ; changement d'e-mail : liens révoqués avant
  l'écriture du nouvel e-mail ; audit de création écrit après l'émission du lien ;
  un périmètre vide est une 404 uniforme. Téléchargement : `Content-Disposition` encodé selon
  la RFC 5987. Audit de consultation écrit avant le compteur, chacun isolé.

### 5. Notification e-mail

- `packages/api/src/constants/email-notification-keys.ts`,
  `email-notification-default-templates.ts` (gabarit français accentué, variables
  `{{recipientName}}`, `{{agencyName}}`, `{{accessType}}`, `{{accessUrl}}`,
  `{{expiresAt}}`), `notification-key-features.ts` (fonctionnalité `PATRIMOINE`), (les
  types et validateurs de `types/communication-types.ts` et
  `utils/communication-validators.ts` n'ont pas eu besoin d'être modifiés). Clé :
  `EXTERNAL_ACCESS_LINK_SENT`.
- Fonction d'envoi dans `lib/external-access/mailer.ts` : destinataire = `recipientEmail` de
  l'accès ; URL dans le corps, jamais dans le sujet ni un journal ; valeurs échappées dans le
  HTML ; ne lève jamais ; retour `{ sent, reason? }` avec `reason` parmi `NOT_REQUESTED`,
  `EVENT_DISABLED`, `SEND_FAILED`. La mise à jour de `lastLinkSentAt` et l'audit `…_LINK_SENT`
  sont faits par l'émission du lien (`issueLink` de `service.ts`), à chaque création ou renvoi.
  Aucun contrôle de consentement CRM. L'envoi n'est coupé que par `NODE_ENV=test` (pas de
  simulateur en développement).
- Test d'accents sur le gabarit et test d'apparition de la clé dans les écrans de
  configuration (réutilise le test existant du catalogue).

### 6. Web

- Fichiers neufs : `apps/web/src/types/external-access.ts`,
  `apps/web/src/services/external-access-service.ts` (ne **pas** toucher
  `patrimoine-service.ts`), `apps/web/src/pages/patrimoine/external-access/*` (liste,
  assistant de création en quatre étapes, modification, renvoi, révocation avec
  confirmation, journal), `apps/web/src/pages/public/ExternalAccessViewPage.tsx`.
- Édits minimes : `App.tsx` (route agence `/tenant/:tenantId/patrimoine/external-access` et
  route publique `/acces-partage` hors `AppShell` et `ProtectedRoute`, toutes deux en
  `React.lazy`), `navigation/menu-catalog.ts`, `navigation/model.tsx`,
  `navigation/route-labels.ts`, `navigation/route-features.ts` inchangé (la règle `patrimoine` existante couvre la route), son
  test `__tests__/navigation/route-features.test.ts` étendu ; entrée de menu
  `patrimoine-external-access`, permission `PROPERTIES_VIEW`.
- Page publique : jeton lu de `location.hash`, gardé en mémoire, fragment retiré
  (`history.replaceState`), `POST` via `utils/api-client`, bandeau « Accès en lecture seule
  accordé par <agence> », une section par rubrique reçue, téléchargement par `POST` en blob,
  404 uniforme = « Lien invalide ou expiré. », `robots` et `referrer` posés le temps du
  montage, aucun lien sortant, feuille de style d'impression.
- Écran agence : pas de bouton « copier » sur la liste ; l'URL n'est montrée qu'à la création
  et au renvoi, une seule fois ; actions de modification masquées sans `PROPERTIES_EDIT`.
- Texte en `t()`, marges logiques ; catalogues i18n web mis à jour (`npm run i18n:extract`).

### 7. Tests

| Domaine                        | Cas                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/secure-links` (unit)      | `maxExpiresAt` ; plafond et défaut inchangés ; révocation en bloc idempotente, bornée à l'agence et à l'objet                                                                                                                                                                                                 |
| Défauts et validation (unit)   | défauts par type ; liste de rubriques vide = 400 ; aucun bien ni entité = 400 ; échéance passée refusée ; statut `EXPIRING` sous 7 jours, permanent jamais `EXPIRING`                                                                                                                                         |
| Périmètre (unit)               | union biens et entités sans doublon ; entité d'une autre agence refusée ; bien client sans mandat actif refusé ; participation retirée = bien absent à la consultation suivante ; périmètre vide = 404 uniforme                                                                                               |
| Refus uniforme (API)           | test paramétré : inconnu, expiré, révoqué, mauvaise portée (lien de rapport propriétaire), agence suspendue, accès révoqué, accès expiré, accès supprimé, corps malformé ou trop gros, `documentRef` invalide → statut, corps et en-têtes strictement identiques                                              |
| Vue publique (API)             | une rubrique non accordée = clé absente (test par rubrique, synthèse comprise) ; balayage de la réponse : 0 e-mail, téléphone, identité de locataire, nom de co-indivisaire, texte libre, chemin, identifiant technique ; champ en trop ignoré ; en-têtes sur 200, 404, 429                                   |
| Téléchargement (API)           | succès : `attachment`, `nosniff`, en-têtes, 0 chemin ; ref d'un autre accès, bien retiré, rubrique retirée, document non lié = 404 uniforme ; audit écrit après lecture                                                                                                                                       |
| Révocation et expiration (API) | consultation et téléchargement après révocation = 404 ; après expiration de l'accès (liens non expirés) = 404 ; accès permanent : lien borné ; changement d'`recipientEmail` révoque les liens actifs ; renvoi avec `revokePreviousLinks`                                                                     |
| Routes agence (API)            | permissions `PROPERTIES_VIEW` / `PROPERTIES_EDIT` ; identifiants d'une autre agence = `NotFoundError` identique à un inconnu ; liste, détail et journal sans jeton ni hash ni e-mail dans le payload d'audit ; URL renvoyée une fois ; `PATCH` révoqué et renvoi expiré = 409                                 |
| Notification (unit)            | gabarit accentué ; URL dans le corps, pas dans le sujet ; valeurs HTML échappées ; échec d'envoi = création conservée, `email.sent = false` ; aucun envoi réel sous `NODE_ENV=test`                                                                                                                           |
| Journal (API)                  | un événement par création, modification, révocation, envoi, consultation, téléchargement ; IP et user-agent en colonnes ; `limit` plafonné à 100                                                                                                                                                              |
| Inventaire                     | `routes-inventory.test.ts` (deux routes publiques justifiées), `schema-tenant-coverage.test.ts` (quatre modèles), registre d'export                                                                                                                                                                           |
| Isolation                      | `external-access.db.test.ts` (base réelle jetable, `TENANT_GUARD_MODE=enforce`) lancé avec `isolation.test.ts` par `npm run test:isolation` (helper `__tests__/helpers/run-isolation-tests.js`) : accès et lien de l'agence A, appels depuis le contexte B (routes agence et consultation publique)           |
| Non-régression 031             | suites de `lib/secure-links` et du rapport propriétaire inchangées et vertes                                                                                                                                                                                                                                  |
| Web                            | page publique : lecture et retrait du fragment, `POST`, rubriques rendues selon la réponse, téléchargement, état d'erreur uniforme ; écran agence : liste et statuts, assistant et défauts par type, renvoi (URL affichée une fois), révocation avec confirmation, journal ; menu et route (`route-features`) |

Fichiers livrés : `__tests__/unit/external-access.{mailer,public-route,route-features,sections-schemas,service,view}.test.ts`,
`secure-links.external-access.test.ts`, extensions de `routes-inventory.test.ts` et de
`tenant-data-export.registry.test.ts` ; `__tests__/api/external-access.routes.test.ts` ;
`__tests__/integration/external-access.db.test.ts` ; côté web `external-access-page`,
`external-access-service` et `external-access-view-page` sous `__tests__/patrimoine/`.

### 8. Documentation et wiki

- `docs/architecture/DATA_MODELS.md` : section « ExternalAccessGrant » (quatre modèles, deux
  enums, règles, export d'agence) et extension de `SecureLinkScope` dans la section
  `SecureLink` ; `docs/governance/SECURITY.md` : nouvelle section « 12 ter. Accès des tiers de
  confiance » (périmètre explicite, accès permanent = réémission de liens, durée de lien
  bornée, révocation en bloc, limites) et mises à jour de « 12 bis » ; `docs/workflows/HANDOFF.md`
  par le coordinateur.
- Wiki des fonctionnalités et `npm run wiki:export` par le coordinateur.

## Définition de fini

Tests ciblés verts, `typecheck` sans nouvelle erreur, lint, `check:architecture`,
`routes-inventory`, `schema-tenant-coverage`, `test:isolation`, relecture `code-reviewer` et
`security-auditor` (lien public, périmètre, téléchargement), `DATA_MODELS.md` et
`SECURITY.md` à jour, `npm run i18n:extract` (fr clé, en, ar, côté API et web), wiki des
fonctionnalités et `npm run wiki:export` par le coordinateur, `HANDOFF.md` par le
coordinateur.

## Sous-fonctionnalités à ajouter au wiki (pour le coordinateur)

Fonctionnalité « Patrimoine » (ou « Gestion des propriétaires » selon le classeur) :

- Écran « Accès partagés » : liste des accès tiers (statut, type, bénéficiaire, périmètre,
  rubriques, consultations).
- Création guidée d'un accès (type, bénéficiaire, périmètre, rubriques avec défauts par type,
  documents partageables, durée).
- Modification d'un accès (rubriques, échéance, périmètre, documents, bénéficiaire).
- Renvoi d'un lien d'accès (URL affichée une seule fois, révocation facultative des liens
  précédents) et révocation d'un accès avec ses liens.
- Journal des consultations et téléchargements d'un accès.
- Page publique « Accès partagé » en lecture seule, avec téléchargement de documents liés et
  impression navigateur.
- Notification e-mail du lien d'accès (`EXTERNAL_ACCESS_LINK_SENT`).
- Routes API : `GET/POST …/patrimoine/external-access`, `GET …/scope-options`,
  `GET …/property-documents/:propertyId`, `GET/PATCH …/:grantId`,
  `POST …/:grantId/revoke`, `POST …/:grantId/send-link`, `GET …/:grantId/access-log` ;
  `POST /api/public/external-access/patrimoine` et
  `POST /api/public/external-access/documents/download`.
- Entrée de menu `patrimoine-external-access` (permission `PROPERTIES_VIEW`).

## Risques

- **Périmètre multi-objets** : contrairement à la spec 031 (un lien = un relevé), un lien
  ouvre ici un périmètre de biens et plusieurs rubriques. Le contrôle repose sur la
  revérification de l'accès à chaque appel et sur la projection par rubrique ; ces deux
  points sont les cibles de la relecture de sécurité.
- **Fuite par une jointure oubliée** : toute requête de la vue publique passe par un `select`
  explicite ; un test balaie la réponse complète à la recherche de coordonnées et d'identifiants
  techniques. Ne jamais sérialiser un objet Prisma.
- **Documents** : une `ref` valide d'un autre accès ou d'un bien sorti du périmètre ne doit
  jamais servir un fichier ; vérification faite à la consultation et au téléchargement, pas
  seulement à l'écriture.
- **Coût d'une consultation publique** : borné par le plafond de 100 biens (environ 6 requêtes
  de rendement par bien, par lots de 5) mais non nul, sur une route anonyme ; le limiteur par IP
  est partagé et en mémoire (SECURITY.md, § 12 ter).
- **Abonnement `PATRIMOINE`** : la vue publique n'y est pas conditionnée ; décision produit à
  prendre (spec, section 8). Pas de limiteur propre à `send-link`.
- **Limiteur partagé** : les routes publiques de ce lot et celles du rapport mensuel partagent un
  seul budget (30 requêtes par minute et par IP, en mémoire, par instance) ; un tiers qui
  télécharge plusieurs documents peut gêner d'autres liens publics de la même adresse (SECURITY.md,
  § 12 ter).
- **Valeur d'enum PostgreSQL** : l'ajout de `EXTERNAL_ACCESS_GRANT` est une migration séparée,
  jamais utilisée dans la migration des tables.
- **Fichiers très partagés** : `schema.prisma`, `app.ts`, `routes-inventory.test.ts`,
  `notification-key-features.ts`, catalogues i18n, `App.tsx` et fichiers de navigation. Intégrer
  couche par couche, jamais en parallèle sur le même fichier ; `app.ts` n'est touché que par la
  couche 4.
- **Client Prisma généré** : le lot change le schéma ; il a ses propres dépendances
  (`npm ci`, pas de jonction) pour ne pas désynchroniser le client partagé.
- **Journal de requêtes** : `requestLogger` journalise `req.url`. Le jeton ne passe jamais en URL
  (fragment, puis corps, y compris pour le téléchargement) ; tout ajout futur d'un jeton en URL
  est interdit par FR-013.
- **Fournisseurs de développement** : l'e-mail n'est coupé que par `NODE_ENV=test` ; aucun
  simulateur logiciel en développement (voir SECURITY.md, § 12 bis). Un envoi depuis l'écran
  agence part réellement si un fournisseur est configuré.
- **Dépendance au lot A3** : le lot suppose `lib/secure-links` fusionné (spec 031) ; les noms
  exacts des fonctions réutilisées sont à confirmer à la lecture du code avant de coder.
