# Plan d'implémentation 039 — Lien de paiement Mobile Money d'un loyer

**Branche** : `feat/patrimoine-lien-paiement` · **Spec** : [spec.md](./spec.md) ·
**Plan de vague** : [PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md) (lot C5)

## Résumé

Le module `lib/secure-links` (spec 031) gagne une portée `INSTALLMENT_PAYMENT`. L'agence envoie à un
locataire, par WhatsApp ou e-mail, ou copie, un lien vers **une échéance** de loyer ; le locataire
l'ouvre sans compte, voit le reste dû calculé par le serveur et paie en Mobile Money sur la page
hébergée PaySecureHub (mode `SIMULATOR` en recette). Un verrou consultatif PostgreSQL empêche le
double checkout ; une page de statut publique, adressée par un code de paiement imprévisible, affiche
l'issue. L'IPN et la réconciliation existantes ne changent pas.

## Contexte technique

- API Express 4, Prisma 5, PostgreSQL, Jest ; web React 18, Ant Design, Vitest.
- Existant réutilisé : `lib/secure-links` (jeton, vérification, révocation, URL),
  `lib/payment-gateway/checkout.ts` (`startCheckout` du portail, `generateCodePaiement`,
  `reconcileCheckout*`, `isConfigUsable`, `resteDuEcheance`), `lib/payment-gateway/paysecurehub/*`
  (client réel et simulateur), `lib/patrimoine/notification-channels.ts` (routage par canal),
  `lib/patrimoine/notifications.ts` (patron de `sendOwnerMonthlyReport`),
  `routes/secure-link-public-routes.ts` et `controllers/secure-link-public-controller.ts`,
  `routes/rental-routes.ts`, `middleware/rate-limit-middleware.ts`,
  `services/audit-service.ts`.
- Migrations additives à horodatage supérieur à celles de la spec 031 : deux fichiers, car
  `ALTER TYPE … ADD VALUE` ne peut pas être suivi, dans la même transaction, d'un usage de la valeur
  ajoutée (voir DATA_MODELS.md). Aucune migration existante n'est éditée.
- Le chemin du portail locataire (`startCheckout`, `/tenant/payments?paiement=`) **ne change pas** :
  le verrou consultatif et la reprise d'URL ne s'appliquent qu'au chemin « lien ».

## Vérification de la constitution (AGENTS.md)

| Règle                          | Application                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant         | `SecureLink.tenantId` et `OnlinePaymentCheckout.tenantId` directs ; échéance chargée par `id` ET `tenantId` du lien ; routes agence sous `requireTenantAccess` ; `NotFoundError` uniforme |
| Erreurs typées, `asyncHandler` | contrôleurs enveloppés ; `AppError` 409 et 502 de `middleware/error-middleware` ; pas de `try/catch` qui devine le statut                                                                 |
| Configuration                  | aucune variable nouvelle : `SECURE_LINK_*`, `FRONTEND_URL` et `BACKEND_URL` existent déjà dans `config/env.ts` et `env.example`                                                           |
| Frontend                       | `utils/api-client`, `config/api`, pages en `React.lazy`, pas de `dangerouslySetInnerHTML` ; redirection `window.location.assign` seulement vers une URL `https` (ou `http` local)         |
| i18n                           | fr clé, `npm run i18n:extract` côté web et API (par le coordinateur) ; marges logiques                                                                                                    |
| Wiki                           | sept sous-fonctionnalités ajoutées au classeur et `npm run wiki:export` (fait avec ce lot)                                                                                                |

## Découpage par territoire de fichiers

Un fichier = un seul agent. Ordre : 1 → 2 → (3 ∥ 4 ∥ 5) → (6 ∥ 7) → 8.

### 1. Schéma, migrations, audit (fait par le coordinateur)

- `packages/api/prisma/schema.prisma` : valeur `INSTALLMENT_PAYMENT` de `SecureLinkScope` ;
  `OnlinePaymentCheckout.secureLinkId String?` (`@map("secure_link_id")`), index
  `[tenantId, secureLinkId]`.
- `packages/api/prisma/migrations/20261007150000_patrimoine_lien_paiement/migration.sql` (colonne et
  index) et `…/20261007150100_secure_link_scope_installment_payment/migration.sql` (`ALTER TYPE … ADD VALUE`).
- `packages/api/src/lib/secure-links/service.ts` : type `SecureLinkScope`, `buildSecureLinkUrl`
  (`${FRONTEND_URL}/payer#<jeton>`).
- `packages/api/src/types/audit-types.ts` : `SECURE_LINK_PAYMENT_STARTED`, `RENTAL_PAYMENT_LINK_SENT`.

### 2. Service de paiement par lien

- `packages/api/src/lib/payment-gateway/installment-payment-link.ts` :
  `createInstallmentPaymentLink`, `listInstallmentPaymentLinks`, `revokeInstallmentPaymentLink`
  (côté agence) ; `getInstallmentPaymentByToken`, `startInstallmentPaymentByToken`,
  `getInstallmentPaymentStatusByCode` (côté public). Détail :
  - vérification du jeton par `verifySecureLink` (portée `INSTALLMENT_PAYMENT`), puis lecture de
    l'échéance et du bail sous `runWithTenantContext` de l'agence du lien ; tout échec lève
    `invalidSecureLinkError()` ;
  - reste dû par `resteDuEcheance` (pénalités comprises) et arrondi à l'entier ;
  - démarrage (`startCheckoutForInstallments` dans `lib/payment-gateway/checkout.ts`) : configuration
    marchande chargée **avant** la transaction (aucune requête hors `tx` pendant qu'elle tient une
    connexion) ; transaction avec `pg_advisory_xact_lock` (clé dérivée de `tenantId` et des échéances) ;
    sous verrou, lecture **d'abord** des checkouts chevauchants (`PENDING` de moins de 15 minutes et
    tout `REVIEW`, sans limite d'âge), **puis** des échéances et du reste dû (`prepareCheckout` reçoit
    le client de transaction et la configuration) ; `REVIEW` = 409 avec message dédié ; reprise d'un
    unique `PENDING` exact (issu d'un lien, même mode que la configuration, mêmes échéances, même
    montant, URL présente) ou 409 ; sinon création du `RentalPayment` et de l'`OnlinePaymentCheckout`
    (`secureLinkId`, `createdByUserId` = créateur du lien) ; l'appel `buildAway` se fait **hors
    transaction**, avec l'URL de retour `${FRONTEND_URL}/payer/statut?paiement=<code>` ; échec =
    paiement et checkout `FAILED`, 502 ; l'URL du fournisseur est normalisée et validée **avant
    stockage** dans `requestProviderCheckout` (`normalizeProviderCheckoutUrl` : `https`, ou `http`
    en `SIMULATOR` vers l'hôte local seulement, userinfo et espaces refusés ; refus = `FAILED` et 502,
    URL jamais stockée) et revalidée au démarrage (`safeProviderUrlOrThrow`) ;
  - ouverture : le DTO public porte `paymentInProgress` (`PENDING` de moins de 15 minutes) et
    `reviewPending` (`REVIEW`) ;
  - statut par code : seulement les checkouts avec `secureLinkId` non nul et une agence non
    suspendue ; réconciliation (`reconcileCheckout`) si `PENDING` non vérifié depuis plus de 10 s,
    la fenêtre étant réservée par une écriture atomique conditionnelle de `lastCheckedAt` (un seul
    appel fournisseur par fenêtre),
    erreur fournisseur avalée ; `REVIEW` présenté `PENDING`, `EXPIRED` présenté `CANCELED`.
- `lib/payment-gateway/checkout.ts` : noyau commun de création de checkout (`prepareCheckout`,
  `createCheckoutRowsTx`, `requestProviderCheckout`, `checkoutReturnUrl`) extrait **sans changer le
  comportement du portail** (`startCheckout` : 400 et 409 inchangés, aucun verrou) ; le chemin « lien »
  est `startCheckoutForInstallments`. `lib/payment-gateway/paysecurehub/*` (réconciliation, IPN,
  simulateur) : **non modifiés** hormis l'URL de retour du simulateur si elle est codée en dur.
- Territoire exclusif : le fichier de service et le test associé.

### 3. Routes publiques et contrôleur

- `packages/api/src/routes/secure-link-public-routes.ts` : trois routes (`POST
/public/secure-links/installment-payment`, `/installment-payment/start`,
  `/installment-payment/status`), chacune avec limiteur par IP en premier, `secureLinkNoStoreHeaders`,
  `express.json({ limit: '1kb' })` ; le middleware d'erreur de parseur existant couvre les nouvelles routes.
- `packages/api/src/controllers/installment-payment-public-controller.ts` : schémas Zod bornés (champs en trop ignorés)
  (`{ token }`, `{ codePaiement }` au format `^IMT-[A-Za-z0-9]{20}$`), délégation au service, IP et
  user-agent transmis pour l'audit.
- `packages/api/src/middleware/rate-limit-middleware.ts` : `secureLinkPaymentStartRateLimiter`
  (`/start`, 10 par minute) et `secureLinkStatusRateLimiter` (`/status`, 90 par minute), clés
  distinctes de la consultation (30 par minute), mêmes en-têtes sur la 429 (FR-011).
- `packages/api/__tests__/unit/routes-inventory.test.ts` : trois entrées à la liste blanche publique,
  avec justification (jeton ou code secret, limiteur, montant jamais lu, refus uniforme).

### 4. Routes agence

- `packages/api/src/routes/rental-routes.ts` : `POST /:tenantId/rental/installments/:installmentId/payment-link`,
  `GET …/payment-links`, `DELETE …/payment-link/:linkId`, gardes `RENTAL_PAYMENTS_CREATE` et
  `RENTAL_PAYMENTS_VIEW` (nouvelles gardes locales sur le patron des voisines).
- Contrôleur agence (`controllers/…`) : corps `.strict()` `{ delivery, ttlDays? }`, réponses de
  FR-008, handlers `asyncHandler`.

### 5. Envoi et notifications

- `packages/api/src/lib/payment-gateway/installment-payment-link-send.ts` : `sendInstallmentPaymentLink`
  (plan de canaux, lien créé seulement si un canal est éligible, révoqué si tous les envois échouent,
  destinataire = fiche CRM du locataire du bail, audit `RENTAL_PAYMENT_LINK_SENT`).
- `packages/api/src/constants/email-notification-keys.ts`, `email-notification-default-templates.ts`,
  `whatsapp-notification-keys.ts`, `whatsapp-notification-default-templates.ts`,
  `notification-key-features.ts` (module `RENTAL`), `services/whatsapp-notification-config-service.ts`
  (WhatsApp opt-in) : clé `RENTER_PAYMENT_LINK_SENT` et variables `{{renterName}} {{agencyName}}
{{period}} {{amountDue}} {{paymentUrl}} {{expiresAt}}`. Les types et validateurs de communication
  suivent s'ils énumèrent les clés.

### 6. Pages web publiques

- `apps/web/src/pages/public/InstallmentPaymentPage.tsx` (`/payer`) et
  `apps/web/src/pages/public/InstallmentPaymentStatusPage.tsx` (`/payer/statut`), routes publiques en
  `React.lazy` dans `App.tsx` (hors `AppShell` et `ProtectedRoute`) ; lecture du fragment puis
  `history.replaceState` (patron : `OwnerMonthlyReportPage`) ; interrogation du statut toutes les 3 s
  tant que `PENDING` ; texte en `t()`.
- `apps/web/src/services/public-installment-payment-service.ts`,
  `apps/web/src/types/installment-payment-public-types.ts` : appels `POST` via `utils/api-client`.

### 7. Écran agence

- Action « Envoyer un lien de paiement » sur la liste des échéances
  (`apps/web/src/pages/rental/Installments.tsx`, fenêtre `InstallmentPaymentLinkModal` : envoyer au
  locataire ou copier, durée de validité) et carte « Lien de paiement Mobile Money » sur le détail
  d'une échéance (`apps/web/src/pages/rental/InstallmentDetailPage.tsx`, composant
  `InstallmentPaymentLinksPanel` : liste avec l'état du paiement, révocation). URL affichée une seule
  fois, à la copie.
- `apps/web/src/services/installment-payment-link-service.ts`,
  `apps/web/src/types/installment-payment-link-types.ts`.

### 8. Documentation et wiki

- `specs/039-patrimoine-lien-paiement/{spec,plan}.md`, `docs/governance/SECURITY.md` (règle 4 et
  sous-section « Lien de paiement d'une échéance »), `docs/architecture/DATA_MODELS.md`,
  `docs/integrations/paysecurehub.md`, classeur `docs/fonctionnalites/` et son miroir
  (`npm run wiki:export`, `npm run wiki:check`).
- `HANDOFF.md` : par le coordinateur.

## Tests

| Domaine                           | Cas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `installment-payment-link` (unit) | création : bail non actif, échéance annulée ou soldée, paiement en ligne indisponible = 400 ; échéance d'une autre agence = 404 ; reste dû recalculé (acompte et pénalité) ; lien conservé seulement s'il est envoyé ou copié                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Démarrage et idempotence          | un checkout créé avec `secureLinkId` et `createdByUserId` = créateur du lien ; reste dû relu sous le verrou (paiement confirmé entre l'ouverture et le démarrage = refus) ; reprise d'un unique `PENDING` exact à moins de 15 minutes (issu d'un lien, même mode, même montant, URL présente) ; 409 si autre échéance, autre montant, URL pas encore enregistrée, `PENDING` du portail ou d'un autre mode ; **`REVIEW` = 409 au message dédié**, `reviewPending` vrai, `paymentInProgress` faux ; URL fournisseur non conforme refusée avant stockage (`FAILED`, 502) ; 502 et `FAILED` si `buildAway` échoue ; aucune lecture hors `tx` sous verrou ; deux démarrages concurrents = un checkout (base jetable) |
| Refus uniforme                    | test paramétré : inconnu, expiré, révoqué, mauvaise portée, agence suspendue, échéance soldée ou annulée, bail non actif, code inconnu, code d'un checkout de portail, format de code invalide → réponse strictement identique (statut, corps, en-têtes)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Montant                           | un champ `amount`, `installmentId` ou `tenantId` en trop dans le corps est ignoré et n'atteint aucune requête Prisma                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Routes publiques (API)            | projection sans nom, e-mail, téléphone ni UUID technique ; corps malformé = 404 uniforme ; en-têtes sur 200, 404 et 429 ; trois limiteurs distincts : consultation 30, `/start` 10, `/status` 90 par minute ; jeton refusé en URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Statut                            | réconciliation si `PENDING` non vérifié depuis plus de 10 s, un seul appel fournisseur par fenêtre (réservation atomique de `lastCheckedAt`) ; erreur fournisseur avalée ; `REVIEW` présenté `PENDING`, `EXPIRED` présenté `CANCELED` ; paiement confirmé = `SUCCESS` et ouverture du lien = 404                                                                                                                                                                                                                                                                                                                                                                                                                |
| Routes agence (API)               | permissions `RENTAL_PAYMENTS_CREATE` et `RENTAL_PAYMENTS_VIEW` ; corps `.strict()` ; `COPY` renvoie l'URL une fois ; `SEND` non envoyé = 200 `sent:false` et aucun lien actif ; liste sans jeton, hash ni URL ; révocation idempotente ; `linkId` d'une autre échéance ou agence = 404                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Envoi (unit)                      | table des combinaisons de consentements, coordonnées, canal préféré, événement désactivé ; un seul canal ; lien révoqué si tous les envois échouent ; URL absente du sujet et des journaux ; audit sans jeton                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| IPN et réconciliation             | tests existants inchangés et verts ; IPN forgée sans effet sur le statut                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Portail locataire                 | `startCheckout` : mêmes 400 et 409 qu'avant, aucun verrou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Inventaire                        | `routes-inventory.test.ts` (trois routes publiques justifiées, trois routes agence), `schema-tenant-coverage.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Isolation                         | `npm run test:isolation` : lien de l'agence A, ouverture, démarrage et statut avec contexte B                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Web                               | page `/payer` : lecture du fragment, un seul `POST` en mode strict, état d'erreur uniforme, redirection refusée si l'URL n'est pas `https` ; page `/payer/statut` : code effacé de l'URL, interrogation toutes les 3 s, jamais de succès sur la seule URL ; section agence : envoi, copie, liste, révocation                                                                                                                                                                                                                                                                                                                                                                                                    |
| Recette (simulateur)              | payé, échoué, annulé, double ouverture, révocation, échéance soldée ; aucun appel PaySecureHub réel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Définition de fini

Tests ciblés verts, `typecheck` sans nouvelle erreur, lint, `check:architecture`, `test:isolation`,
`routes-inventory` et `schema-tenant-coverage` verts, relecture `code-reviewer` et `security-auditor`
(lien public qui écrit, verrou, statut par code), `SECURITY.md`, `DATA_MODELS.md` et `paysecurehub.md`
à jour (fait avec la spec), `npm run i18n:extract` (fr clé, en, ar), classeur wiki et
`npm run wiki:export` puis `npm run wiki:check` verts, recette en mode `SIMULATOR`, `HANDOFF.md` par
le coordinateur. Le mode `LIVE` n'est ni activé ni testé : mention explicite dans la PR.

## Sous-fonctionnalités ajoutées au wiki

Fonctionnalité « Encaisser — Liens de paiement » (gestion locative, module `RENTAL`) :

- Envoyer le lien de paiement d'une échéance (WhatsApp ou e-mail) : `POST …/installments/:installmentId/payment-link`
  (`delivery: SEND`, `RENTAL_PAYMENTS_CREATE`).
- Copier le lien de paiement d'une échéance (`delivery: COPY`, URL affichée une fois).
- Lister les liens de paiement d'une échéance et l'état du paiement : `GET …/payment-links`
  (`RENTAL_PAYMENTS_VIEW`).
- Révoquer un lien de paiement : `DELETE …/payment-link/:linkId`.
- Page publique « Payer mon loyer » : `POST /api/public/secure-links/installment-payment` et
  `…/installment-payment/start`.
- Page de statut après paiement : `POST /api/public/secure-links/installment-payment/status`.
- Notification `RENTER_PAYMENT_LINK_SENT` (e-mail et WhatsApp opt-in), configuration par agence.

## Risques

- **Fichiers très partagés** : `schema.prisma`, `app.ts`, `routes-inventory.test.ts`,
  `notification-key-features.ts`, `secure-link-public-routes.ts`, catalogues i18n, wiki. Intégrer lot
  par lot, jamais en parallèle sur le même fichier.
- **Client Prisma généré** : le lot change le schéma ; le client est régénéré dans le worktree.
- **`ALTER TYPE ADD VALUE`** : une valeur d'enum ne s'utilise pas dans la transaction qui l'ajoute ;
  d'où deux migrations et l'absence de tout `UPDATE` ou index sur la valeur dans la première. Une
  autre branche qui ajoute sa propre valeur à `SecureLinkScope` doit avoir un horodatage et un nom
  distincts.
- **Verrou consultatif** : tenu seulement le temps de la transaction de création, **jamais pendant
  l'appel réseau** à PaySecureHub ; sinon une attente du fournisseur bloquerait les ouvertures
  concurrentes. Il ne couvre que le chemin « lien » : le chemin du portail ne le prend pas, donc un
  paiement du portail et un paiement par lien simultanés sur la même échéance restent possibles
  (spec §8).
- **Régression du portail locataire** : toute extraction de code commun avec `startCheckout` est
  couverte par les tests existants du portail avant le reste.
- **Mode `LIVE`** : jamais activé en recette ; le mode d'un lien est celui de la configuration de
  l'agence, vérifié à chaque démarrage.
