# Plan d'implémentation 031 — Canaux WhatsApp patrimoine et liens sécurisés

**Branche** : `feat/patrimoine-canaux` · **Spec** : [spec.md](./spec.md) ·
**Plan de vague** : [PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md) (lot A3)

## Résumé

Un module générique `lib/secure-links` émet, vérifie et révoque des jetons de lien
public. Le premier usage est le rapport mensuel d'un propriétaire : l'agence (à la main
ou par un job) envoie le lien par WhatsApp ou par e-mail, un seul canal par message ; le
propriétaire lit son relevé sur une page publique en lecture seule. Les alertes
propriétaire d'échéance de bail et de document gagnent le canal WhatsApp.

## Contexte technique

- API Express 4, Prisma 5, PostgreSQL, Jest ; web React 18, Ant Design, Vitest.
- Existant réutilisé : `lib/patrimoine/notifications.ts` (`sendOwnerStatement`,
  alertes de bail et de document, anti-doublon par `AuditLog`),
  `services/whatsapp-notification-send-service.ts`, `services/email-service.ts`,
  `services/audit-service.ts` (`logAuditEvent`, `flushAuditEvents`),
  `middleware/rate-limit-middleware.ts`, `routes/owner-statements-routes.ts`,
  `jobs/document-expiry-alert-job.ts` (patron du job).
- Migration additive à horodatage supérieur à `20261006150000` et distinct de ceux des
  lots A1 et A2 ; aucune migration existante n'est éditée.

## Vérification de la constitution (AGENTS.md)

| Règle                          | Application                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant         | `SecureLink.tenantId` direct ; routes agence sous `requireTenantAccess` ; relevé chargé par `id` ET `tenantId` ; `NotFoundError` uniforme |
| Erreurs typées, `asyncHandler` | contrôleurs enveloppés ; erreurs de `middleware/error-middleware`                                                                         |
| Configuration                  | trois variables via `config/env.ts` et `env.example` ; pas de valeur par défaut pour un secret (le lot n'en introduit aucun)              |
| Frontend                       | `utils/api-client`, `config/api`, page en `React.lazy`, pas de `dangerouslySetInnerHTML`                                                  |
| i18n                           | fr clé, `npm run i18n:extract` côté web et API ; marges logiques                                                                          |
| Wiki                           | sous-fonctionnalités signalées au coordinateur (voir ci-dessous)                                                                          |

## Découpage par territoire de fichiers

Un fichier = un seul agent. Ordre : 1 → 2 → (3 ∥ 4) → 5 → 6.

### 1. Schéma et configuration

- `packages/api/prisma/schema.prisma` : enum `SecureLinkScope`, modèle `SecureLink`,
  relation inverse sur `Tenant` (et sur `User` pour `createdByUserId`).
- `packages/api/prisma/migrations/20261007110000_secure_links/migration.sql`.
- `packages/api/src/config/env.ts`, `packages/api/env.example` :
  `SECURE_LINK_DEFAULT_TTL_DAYS` (7), `SECURE_LINK_MAX_TTL_DAYS` (30),
  `PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED` (false). Le défaut ne peut pas dépasser le plafond.
- `packages/api/src/types/audit-types.ts` : `SECURE_LINK_CREATED`, `SECURE_LINK_VIEWED`,
  `SECURE_LINK_REVOKED` et `PATRIMOINE_OWNER_MONTHLY_REPORT_SENT` (marque anti-doublon).
- `packages/api/src/services/tenant-data-export/model-registry.ts` : `SecureLink` exclu de
  l'export d'agence, avec sa raison (le hash est un secret d'accès).

### 2. Infrastructure `lib/secure-links`

- `packages/api/src/lib/secure-links/` : génération du jeton (`crypto.randomBytes(32)`,
  base64url), hachage SHA-256, `createSecureLink`, `verifySecureLink`, `recordSecureLinkView`,
  `revokeSecureLink`, `listSecureLinks` (fichiers `token.ts`, `service.ts`, `errors.ts`),
  construction de l'URL (`${FRONTEND_URL}/rapport-proprietaire#<jeton>`).
- `verifySecureLink` : rejette d'emblée un jeton de forme invalide, hache, lit par `tokenHash`
  **hors contexte d'agence** (seule lecture transverse du module, comme les jobs), compare à
  temps constant (`crypto.timingSafeEqual`, défense en profondeur : la protection principale
  est la préimage SHA-256 d'un jeton de 256 bits), contrôle portée, révocation, expiration et
  agence active, sans effet de bord. L'appelant lit ensuite l'objet sous
  `runWithTenantContext` de l'agence du lien. Toute cause d'échec lève la même erreur (404,
  « Lien invalide ou expiré. ») ; la cause réelle n'est jamais écrite dans la réponse.
- `recordSecureLinkView` : incrément de `viewCount` atomique (`increment`), `lastViewedAt`, audit
  `SECURE_LINK_VIEWED` avec IP et user-agent ; appelé seulement après une lecture réussie.
- Une portée de plus (lots paiement, tiers de confiance) = une valeur de `SecureLinkScope`,
  un cas dans `buildSecureLinkUrl` et une fonction de lecture de l'objet sur le modèle de
  `getOwnerMonthlyReportByToken` ; le noyau (`token.ts`, `verifySecureLink`) ne change pas.

### 3. Route publique et page publique

- `packages/api/src/routes/secure-link-public-routes.ts` et
  `controllers/secure-link-public-controller.ts`, montés avant les routeurs d'agence dans
  `app.ts` (`app.use('/api', …)`) : `POST /public/secure-links/owner-monthly-report`, parseur
  JSON propre à la route (`express.json({ limit: '1kb' })`, le parseur global de `app.ts`
  ignore le préfixe `/api/public/secure-links/`), middleware d'erreur local qui convertit toute
  erreur de corps en la même 404 uniforme sans journaliser le message du parseur, schéma
  Zod `{ token }` (longueur bornée, corps malformé = même 404 uniforme),
  `secureLinkPublicRateLimiter` (30 par minute et par IP, avant toute vérification) dans
  `rate-limit-middleware.ts`, en-têtes de FR-007 posés sur **toutes** les réponses (succès,
  404 et 429). Aucun `authenticate`.
- `packages/api/src/lib/patrimoine/owner-monthly-report.ts` : `getOwnerMonthlyReportByToken`
  vérifie le jeton, charge le relevé par `id` et `tenantId` du lien sous
  `runWithTenantContext`, projette par `select` explicite (sans e-mail, téléphone ni
  identifiant technique), puis enregistre la consultation seulement après succès.
- `packages/api/__tests__/unit/routes-inventory.test.ts` : entrée à la liste blanche
  publique, avec justification (jeton secret, limiteur, lecture seule, objet unique).
- Web : `apps/web/src/pages/public/OwnerMonthlyReportPage.tsx`, route `/rapport-proprietaire`
  publique en `React.lazy` dans `App.tsx` (hors `AppShell` et `ProtectedRoute`), lecture de
  `location.hash` puis retrait du fragment (`history.replaceState`), `POST` via
  `utils/api-client`, feuille de style d'impression, bouton « Imprimer / enregistrer en PDF »
  (`window.print`), balises `robots` et `referrer`. La page n'affiche rien d'autre que la
  réponse ; texte en `t()`.

### 4. Routes agence et écran

- `packages/api/src/routes/owner-statements-routes.ts` : quatre routes de FR-015, mêmes
  gardes que les routes voisines (`requirePropertyPermission` / `requireAnyPropertyPermission`,
  barrière `requireThirdPartyAllowed('OWNER_STATEMENT')` héritée).
- `packages/api/src/controllers/owner-statements-controller.ts` : handlers
  `asyncHandler`. Vérification que `statementId` appartient à l'agence
  (`findFirst({ where: { id, tenantId } })`), puis que `linkId` appartient à ce relevé et à
  l'agence.
- Web : section « Rapport mensuel et liens sécurisés » dans
  `apps/web/src/pages/patrimoine/statements/OwnerStatementDetailPage.tsx` (composant
  dédié sous `components/patrimoine/`), service réseau et types du contrat.
  L'URL renvoyée à la création est affichée une fois, avec un bouton « Copier ».

### 5. Notifications et routage par canal

- `packages/api/src/constants/email-notification-keys.ts`, `email-notification-default-templates.ts`,
  `whatsapp-notification-keys.ts`, `whatsapp-notification-default-templates.ts`,
  `notification-key-features.ts` : `OWNER_MONTHLY_REPORT_SENT` (e-mail et WhatsApp,
  `{{reportUrl}}`), WhatsApp `OWNER_LEASE_ENDING_SOON`, `OWNER_DOCUMENT_EXPIRY_ALERT` ;
  fonctionnalité `PATRIMOINE`. Les types de `types/communication-types.ts` et
  `utils/communication-validators.ts` suivent s'ils énumèrent les clés.
- `packages/api/src/lib/patrimoine/notification-channels.ts` : routeur de canaux
  (éligibilité par canal, canal préféré puis repli, un seul message délivré, motif de
  non-envoi ; point d'extension SMS). `lib/patrimoine/notifications.ts` : envoi du rapport
  mensuel (création du lien, routage, envoi, anti-doublon) ; `alertExpiringLeases` et
  `alertExpiringDocuments` passent par le routage pour les propriétaires. `sendOwnerStatement`
  et la route `POST /send` existantes restent inchangées.
- Le lot ne modifie ni `WHATSAPP_PROVIDER` ni le fournisseur : il appelle
  `sendWhatsappNotification` comme aujourd'hui.

### 6. Job mensuel

- `packages/api/src/jobs/owner-monthly-report-job.ts`, démarré depuis `src/index.ts` si
  `PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED`. Patron : `document-expiry-alert-job.ts` (liste des
  agences hors contexte, traitement séquentiel dans `runWithTenantContext`, rapport de passage
  journalisé). Fenêtre : jours 1 à 10 UTC ; période cible = mois précédent (`YYYY-MM`) ;
  relevés `status != DRAFT` sans marque d'envoi automatique dans `AuditLog`.

## Tests

| Domaine                     | Cas                                                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/secure-links` (unit)   | jeton : longueur, alphabet, unicité ; seul le hash est écrit ; TTL par défaut et plafond ; comparaison à temps constant ; révocation idempotente                                                                     |
| Refus uniforme              | test paramétré : inconnu, expiré, révoqué, mauvaise portée, agence suspendue, relevé supprimé → réponse strictement identique (statut, corps, en-têtes)                                                              |
| Route publique (API)        | succès : projection sans e-mail/téléphone/UUID technique ; champ en trop ignoré ; corps malformé = 404 uniforme ; en-têtes FR-007 sur 200, 404, 429 ; `viewCount` et audit ; jeton refusé en URL                     |
| Routes agence (API)         | permissions ; relevé ou lien d'une autre agence = `NotFoundError` ; liste sans jeton ni hash ; URL renvoyée une seule fois ; `DRAFT` et version de calcul obsolète refusés (409) pour la création de lien et l'envoi |
| Routage par canal (unit)    | table des combinaisons : consentements, coordonnées, canal préféré (dont `SMS`/vide), configuration désactivée par canal ; un seul canal ; motif de non-envoi                                                        |
| Alertes propriétaire (unit) | bail et document par WhatsApp puis repli e-mail ; anti-doublon tous canaux                                                                                                                                           |
| Job (unit)                  | horloge simulée : jour 3 envoie, jour 11 n'envoie pas, deuxième passage n'envoie pas ; `DRAFT` ignoré ; échec d'une agence isolé ; drapeau désactivé = job non démarré                                               |
| Inventaire                  | `routes-inventory.test.ts` (route publique justifiée), `schema-tenant-coverage.test.ts`                                                                                                                              |
| Isolation                   | `npm run test:isolation` : lien de l'agence A, consultation avec contexte B                                                                                                                                          |
| Web                         | page publique : lecture du fragment, appel `POST`, état d'erreur uniforme, bouton d'impression ; section agence : envoi, copie, liste, révocation                                                                    |

## Définition de fini

Tests ciblés verts, `typecheck` sans nouvelle erreur, lint, `check:architecture`,
`test:isolation`, relecture `code-reviewer` et `security-auditor` (lien public et jeton),
`DATA_MODELS.md` et `SECURITY.md` à jour (fait avec la spec), `npm run i18n:extract`
(fr clé, en, ar), wiki des fonctionnalités + `npm run wiki:export` par le coordinateur,
`HANDOFF.md` par le coordinateur.

## Sous-fonctionnalités à ajouter au wiki (pour le coordinateur)

Fonctionnalité « Patrimoine » (ou « Gestion des propriétaires » selon le classeur) :

- Lien sécurisé de rapport mensuel : création, copie, liste, révocation (écran de relevé).
- Page publique « Rapport propriétaire » en lecture seule, avec impression / PDF navigateur.
- Envoi du rapport mensuel par WhatsApp ou e-mail (routage par canal et consentement).
- Envoi automatique mensuel du rapport (job, désactivé par défaut).
- Alertes propriétaire d'échéance de bail et de document à renouveler par WhatsApp.
- Routes API : `POST/GET/DELETE …/owner-statements/:id/secure-links`,
  `POST …/send-monthly-report`, `POST /api/public/secure-links/owner-monthly-report`.
- Événements de notification : `OWNER_MONTHLY_REPORT_SENT`, `OWNER_LEASE_ENDING_SOON`,
  `OWNER_DOCUMENT_EXPIRY_ALERT`.

## Risques

- **Fichiers très partagés** : `schema.prisma`, `app.ts`, `routes-inventory.test.ts`,
  `notification-key-features.ts`, catalogues i18n, wiki. Intégrer lot par lot, jamais en
  parallèle sur le même fichier (plan de vague, §5).
- **Client Prisma généré** : le lot change le schéma, il a ses propres dépendances
  (`npm ci`, pas de jonction) pour ne pas désynchroniser le client partagé.
- **Contexte d'agence à la vérification** : la recherche par `tokenHash` est la seule lecture
  sans contexte ; elle est circonscrite à une fonction nommée, commentée et testée.
- **Journal de requêtes** : `requestLogger` journalise `req.url`. Le jeton n'y passe jamais
  (fragment puis corps) ; tout ajout futur d'un jeton en URL est interdit par FR-010.
- **Fournisseurs de développement** : vérifier que le mode journal des fournisseurs
  n'écrit pas le corps du message (donc l'URL) dans les journaux.
