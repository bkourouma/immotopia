# Tâches 042 — Paiement mobile money des charges de copropriété

**Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md) · **Contrats** : [contracts.md](./contracts.md)

Cocher une tâche seulement quand son code **et** son test sont écrits. `[P]` = peut avancer en parallèle
d'autres tâches du même lot. Chemins : `API/` = `packages/api/`, `WEB/` = `apps/web/`. « (amorcé) » : déjà
présent dans l'arbre au 2026-10-15, à relire et compléter, pas à refaire.

## M1 — Schéma, migrations, audit, erreurs (PR1)

- [ ] T001 `API/prisma/schema.prisma` : corriger le commentaire de `SecureLinkScope.CHARGE_CALL_PAYMENT`
      (objet = `ChargeCall`, `objectId` = id de l'appel) (amorcé)
- [ ] T002 `API/prisma/schema.prisma` : ajouter à `SyndicOnlineCheckout` `contactId`, `receivedAmount`,
      `reviewKind` (enum `SyndicReviewKind`), `resolution` (enum `SyndicCheckoutResolution`), index
      `[syndicateId, createdAt]` (amorcé)
- [ ] T003 `API/prisma/migrations/20261015120000_syndic_paiement_mobile/migration.sql` : refléter T002 (ou
      migration additive si les fichiers sont déjà commités) (amorcé)
- [ ] T004 [P] `API/src/lib/secure-links/service.ts` : `SecureLinkScope` + `CHARGE_CALL_PAYMENT`,
      `buildSecureLinkUrl` -> `/payer-charges#<jeton>` ; test dans `secure-links.service.test.ts`
- [ ] T005 [P] `API/src/types/audit-types.ts` : huit clés d'audit du plan (M1)
- [ ] T006 [P] `API/src/middleware/error-middleware.ts` : codes de contracts §0.2 dans `ErrorCode`
- [ ] T007 [P] `API/src/lib/payment-gateway/codes.ts` : `SYNDIC_CODE_PREFIX`, `generateSyndicCodePaiement`,
      `isSyndicCodePaiement` + test (20 caractères, préfixe `IMS-`)
- [ ] T008 `API/__tests__/unit/schema-tenant-coverage.test.ts` : entrées `SyndicPaymentGatewayConfig` et
      `SyndicOnlineCheckout`
- [ ] T009 [P] `docs/architecture/DATA_MODELS.md` : deux modèles, trois colonnes de `ChargePayment`, nouvelle portée
- [ ] T010 `npm run db:generate` (hors agents : le coordinateur) puis `npm run typecheck`

## M2 — Moteur de paiement (PR1)

Comptabilité et affectation :

- [ ] T011 `API/src/lib/syndics/provider-invoice-accounting.ts` : `SyndicAccountNumber` + `'5525'`, graine
      « PaySecureHub (mobile money) » (classe 5, ASSET), hors `SYNDIC_PROVIDER_ACCOUNT_SEEDS` ; test
      `syndics.accounting.test.ts`
- [ ] T012 `API/src/lib/syndics/charge-collection-accounting.ts` : `treasuryAccountNumber?` (5525 -> journal banque) ;
      test dans `syndics.charge-collection-accounting.test.ts` (débit 5525 / crédit 450, idempotence inchangée)
- [ ] T013 `API/src/lib/syndics/charge-allocation.ts` : `LotPaymentInput` + `idempotencyKey?`, `providerTransactionId?`,
      `origin?`, `treasuryAccountNumber?` ; `recordLotPaymentTx` les écrit et les transmet ; test : comportement
      manuel inchangé, paiement en ligne tracé
- [ ] T014 `API/src/lib/syndics/online-payment/types.ts` : types de contracts §0.1 et DTO des sections 1 à 3

Configuration :

- [ ] T015 [P] `API/src/lib/syndics/online-payment/gateway-config.ts` : chargement, `isSyndicConfigUsable`,
      `syndicCredentialsFrom`, disponibilité (frais de l'agence, `CLIENT` par défaut)
- [ ] T016 [P] `API/src/lib/syndics/online-payment/feature-gate.ts` : `assertSyndicOnlinePaymentAllowed` sur
      `evaluateSchedulingGate` (modes `off`/`warn`/`enforce`)
- [ ] T017 `API/src/lib/syndics/online-payment/gateway-settings.ts` : lecture (jamais la clé), mise à jour (R3, R5,
      audit sans valeur), test de connexion, solde fournisseur, solde comptable du 5525
- [ ] T018 `API/__tests__/unit/syndics.online-payment-config.test.ts` : clé absente des DTO et des journaux ; 400/409
      de contracts 1.2 ; aucun repli sur l'agence ; test d'architecture (pas d'import de `loadConfig` agence)

Démarrage, rapprochement, succès :

- [ ] T019 `API/src/lib/syndics/online-payment/checkout-start.ts` : verrou consultatif, chevauchements, montant entier,
      création, `build-away` hors transaction, `FAILED` + 502
- [ ] T020 `API/src/lib/syndics/online-payment/checkout-settle.ts` : claim + `recordLotPaymentTx` + reçus +
      `chargePaymentId` en une transaction ; classement des échecs métier en `ReviewKind`
- [ ] T021 `API/src/lib/syndics/online-payment/checkout-reconcile.ts` : statut avec la clé de la copropriété,
      `decideCheckoutTransition`, fenêtre de 10 s, `REVIEW` sans écriture, envoi après commit
- [ ] T022 `API/src/lib/syndics/online-payment/checkout-review.ts` : `ACCEPT` / `REJECT` (tableau de contracts 1.7)
- [ ] T023 `API/src/lib/syndics/online-payment/payout.ts` : reversement 521/5525, liste, solde du 5525, doublon
- [ ] T024 [P] `API/src/lib/syndics/online-payment/checkout-queries.ts` : liste filtrée, compteurs, DTO gestionnaire,
      DTO portail, vue publique
- [ ] T025 `API/__tests__/unit/syndics.online-checkout.test.ts` : succès (un encaissement, une écriture, reçus),
      rejeu, concurrence, appel soldé -> avance, cinq `ReviewKind` sans écriture, REVIEW jamais encaissé par la
      vérification
- [ ] T026 `API/__tests__/unit/syndics.online-review.test.ts` : chaque décision × chaque `reviewKind`, double décision
- [ ] T027 `API/__tests__/unit/syndics.online-payout.test.ts` : solde insuffisant, doublon, exercice clos

Intégration au reste de la plateforme :

- [ ] T028 `API/src/controllers/payment-gateway-public-controller.ts` : IPN `IMS-` -> moteur Syndic ; simulateur `IMS-`
      (page, issue, redirection vers l'URL de retour de la tentative) ; test `payment-gateway-simulator-redirect`
- [ ] T029 `API/src/lib/payment-gateway/paysecurehub/simulator-client.ts` : `getStatus` pour `IMS-`
- [ ] T030 `API/src/jobs/online-payment-reconciliation-job.ts` : `reconcilePendingSyndicCheckouts` (≥ 2 min, expiration 48 h)

## M2b — API de configuration (PR1)

- [ ] T031 `API/src/routes/syndic-online-payment-routes.ts` : routes 1.1 à 1.4, gardes de contracts §1 (dont
      `TENANT_SETTINGS_EDIT` sur 1.2 et 1.3)
- [ ] T032 `API/src/controllers/syndic-online-payment-controller.ts` : handlers 1.1 à 1.4, Zod `.strict()`
- [ ] T033 [P] `API/src/middleware/rate-limit-middleware.ts` : limiteurs gestionnaire (test, solde, écriture)
- [ ] T034 `API/src/app.ts` : montage du routeur sur `/api`
- [ ] T035 `API/__tests__/unit/routes-inventory.test.ts` + test de routes (permissions, 404 d'une autre agence)
- [ ] T036 Revue : `typecheck`, `lint`, `check:architecture`, `i18n:extract` (API), relecture sécurité PR1, **PR1**

## M3 — API portail (PR2)

- [ ] T037 `API/src/lib/syndics/online-payment/portal.ts` : disponibilité, démarrage, lecture par code (périmètre,
      `ownedChargeCallsWhere`, payeur = contact du lot)
- [ ] T038 `API/src/controllers/coowner-online-payment-controller.ts` : trois handlers, droit SYNDIC, Zod `.strict()`
- [ ] T039 `API/src/routes/coowner-portal-routes.ts` : trois routes (`disponibilite` avant `:codePaiement`)
- [ ] T040 `API/src/lib/syndics/coowner-portal.ts` : `onlinePayable` et `onlineCheckout` sur `listCoOwnerChargeCalls`
- [ ] T041 `API/__tests__/unit/coowner-online-payment.test.ts` : périmètre, 404, reprise, 409 (`IN_PROGRESS`,
      `UNDER_REVIEW`), 403 `SYNDIC_FEATURE_DENIED`, montant jamais lu du corps, statut limité au périmètre
- [ ] T042 `API/__tests__/unit/routes-inventory.test.ts` : trois routes du portail

## M4 — Écrans portail (PR2)

- [ ] T043 [P] `WEB/src/services/coowner-portal-service.ts` : types et fonctions de contracts §2
- [ ] T044 `WEB/src/pages/CoOwnerPortal/ChargeCallsTable.tsx` : cases à cocher (même lot, `onlinePayable`,
      `onlineCheckout === 'NONE'`), appel grisé « Paiement en cours »
- [ ] T045 `WEB/src/pages/CoOwnerPortal/ChargeCalls.tsx` : bandeau (total, frais si `CLIENT`, mode simulateur),
      « Payer en ligne », redirection gardée `https`
- [ ] T046 `WEB/src/pages/CoOwnerPortal/OnlinePaymentReturn.tsx` : `?paiement=`, relance 3 s / ~2 min, états payé,
      échoué, annulé, en vérification, numéro du document ; ne croit pas l'URL
- [ ] T047 `WEB/src/__tests__/coowner-portal/online-payment.test.tsx` : aucun bouton sans disponibilité, total, URL
      refusée, retour
- [ ] T048 `npm run i18n:extract` (web)

## M5 — Gestionnaire (PR2)

API :

- [ ] T049 `API/src/routes/syndic-online-payment-routes.ts` : routes 1.5 à 1.9
- [ ] T050 `API/src/controllers/syndic-online-payment-controller.ts` : handlers 1.5 à 1.9 (filtres Zod, pagination,
      corps `.strict()`), limiteurs
- [ ] T051 `API/__tests__/unit/syndic-online-payment-routes.test.ts` : liste, `verifier`, `trancher`, reversements,
      permissions, 404 d'une autre copropriété
- [ ] T052 `API/__tests__/unit/routes-inventory.test.ts` : routes 1.5 à 1.9

Web :

- [ ] T053 [P] `WEB/src/services/syndic-online-payment-service.ts` : types de contracts §0.1 et §1, une fonction par route
- [ ] T054 `WEB/src/pages/syndics/SyndicOnlinePayments.tsx` + route et onglet (`App.tsx`, `SyndicWorkspaceLayout`)
- [ ] T055 [P] `WEB/src/components/syndics/online-payment/GatewayConfigCard.tsx` : clé jamais préremplie, test, URL
      de notification, soldes
- [ ] T056 [P] `WEB/src/components/syndics/online-payment/CheckoutsTable.tsx` : filtres, pastilles, action « Vérifier »
- [ ] T057 [P] `WEB/src/components/syndics/online-payment/ReviewDecisionModal.tsx` : motif, montants, note, `paidAt`,
      rappel « le remboursement se fait hors ImmoTopia »
- [ ] T058 [P] `WEB/src/components/syndics/online-payment/PayoutModal.tsx` + liste des reversements
- [ ] T059 `WEB/src/__tests__/syndics/online-payment.test.tsx`
- [ ] T060 `npm run i18n:extract` (web et API), relecture sécurité, **PR2**

## M6 — Lien sécurisé et messages (PR3)

API :

- [ ] T061 `API/src/lib/syndics/online-payment/charge-call-link.ts` : création, liste, révocation, lecture par jeton,
      démarrage, statut par code ; R27 (agence, droit SYNDIC, reste dû, configuration, lot revendu)
- [ ] T062 `API/src/lib/syndics/online-payment/charge-call-link-send.ts` : plan de canaux, événement
      `CHARGE_CALL_PAYMENT_LINK_SENT`, destinataire réel, révocation si échec partout
- [ ] T063 [P] `API/src/constants/*` : clé d'événement e-mail et WhatsApp, modèles par défaut, rattachement `SYNDIC`
- [ ] T064 `API/src/lib/syndics/charge-call-payment-url.ts` : résolveur par défaut qui crée le lien (un appel, durée
      `SECURE_LINK_MAX_TTL_DAYS`, jamais d'exception) (amorcé)
- [ ] T065 `API/src/lib/syndics/notifications.ts` : corriger la récursion de `resolveChargeCallRecipient` ; relance
      sur le copropriétaire réel (amorcé)
- [ ] T066 `API/src/controllers/charge-call-payment-public-controller.ts` + `API/src/routes/secure-link-public-routes.ts` :
      trois routes publiques, limiteurs aux clés propres, 404 uniforme
- [ ] T067 `API/src/routes/syndic-online-payment-routes.ts` + contrôleur : routes 1.10 (créer, lister, révoquer)
- [ ] T068 `API/__tests__/unit/charge-call-payment-link.service.test.ts` + `charge-call-payment.public-route.test.ts` :
      uniformité du 404 dans chaque cause, en-têtes, limiteurs, aucun montant lu, statut limité aux liens
- [ ] T069 `API/__tests__/unit/syndics.notifications-payment-url.test.ts` : lien présent/absent, relance au `coowner`
- [ ] T070 `API/__tests__/unit/routes-inventory.test.ts` : trois routes publiques + trois routes 1.10

Web :

- [ ] T071 [P] `WEB/src/services/public-charge-call-payment-service.ts`, `charge-call-payment-link-service.ts`
- [ ] T072 `WEB/src/pages/public/ChargeCallPaymentPage.tsx` : fragment -> corps du POST, montant restant dû, redirection
      gardée
- [ ] T073 `WEB/src/pages/public/ChargeCallPaymentStatusPage.tsx` : relance 3 s / ~2 min, `sessionStorage`, message neutre
- [ ] T074 `WEB/src/App.tsx` : routes `/payer-charges` et `/payer-charges/statut` (zone publique)
- [ ] T075 [P] `WEB/src/components/syndics/ChargeCallPaymentLinkButton.tsx` + `ChargeCallPaymentLinksPanel.tsx`, branchés
      dans `SyndicCharges.tsx`
- [ ] T076 `WEB/src/__tests__/public/charge-call-payment-page.test.tsx` et `…-status-page.test.tsx`
- [ ] T077 `npm run i18n:extract` (web et API)

## Clôture (par le coordinateur)

- [ ] T078 Compléter `docs/integrations/paysecurehub.md` (flux Syndic, un compte par copropriété, 5525, Q1 et Q6)
- [ ] T079 Wiki : sous-fonctionnalités listées dans le plan, `npm run wiki:export`, `npm run wiki:check`
- [ ] T080 `npm run typecheck`, `npm run lint`, `npm run check:architecture`, `npm test`, `npm run test:web`
- [ ] T081 Relecture `code-reviewer` + `security-auditor` (PR1 et PR3 en priorité)
- [ ] T082 Recette navigateur en simulateur (parcours du plan, section « Tests »)
- [ ] T083 `docs/workflows/HANDOFF.md` : état, pièges, mode `LIVE` non validé, points Q1 à Q8
