# Plan d'implémentation 042 — Paiement mobile money des charges de copropriété

**Branche** : `feat/syndic-paiement-mobile` · **Spec** : [spec.md](./spec.md) · **Contrats** :
[contracts.md](./contracts.md) · **Tâches** : [tasks.md](./tasks.md)

## Résumé

Chaque copropriété reçoit son propre compte marchand PaySecureHub (`SyndicPaymentGatewayConfig`). Une
tentative de paiement (`SyndicOnlineCheckout`, code `IMS-…`) vise un ou plusieurs appels entiers d'un lot.
La confirmation est toujours redemandée au fournisseur avec la clé de la copropriété ; sur succès, **une
transaction** pose l'encaissement par `recordLotPaymentTx` (méthode `MOBILE_MONEY`), les reçus et
quittances. Les cas douteux vont en `REVIEW`, tranchés par le gestionnaire. Le copropriétaire paie depuis le
portail ou depuis un lien sécurisé (`CHARGE_CALL_PAYMENT`, un lien = un appel) joint aux avis d'appel et aux
relances. L'argent encaissé repose sur le compte 5525 de la copropriété jusqu'à l'écriture manuelle de
reversement 5525 → 521.

## Contexte technique

- API Express 4, Prisma 5, PostgreSQL, Jest ; web React 18, Ant Design, Vitest.
- **Réutilisé tel quel** : `lib/syndics/charge-allocation.ts` (`recordLotPaymentTx`, `lockLotTx`),
  `lib/syndics/charge-receipts.ts` (`issueReceiptsForPaymentTx`) et `charge-receipt-delivery.ts`
  (`scheduleChargeDocumentDelivery`), `lib/payment-gateway/crypto.ts` (chiffrement),
  `paysecurehub/*` (client réel et simulateur), `lib/secure-links`, `lib/syndics/coowner-portal.ts`
  (`resolveCoOwnerScope`, `ownedChargeCallsWhere`), `lib/syndics/charge-schedule-tenant-gate.ts`
  (`evaluateSchedulingGate`), `lib/patrimoine/notification-channels.ts` (plan de canaux).
- **Réutilisé et étendu** : `lib/payment-gateway/checkout-core.ts` (amorcé : `requestProviderCheckoutRedirect`,
  `fetchNormalizedProviderStatus`, `decideCheckoutTransition`, `normalizeProviderCheckoutUrl`) ;
  `lib/syndics/charge-collection-accounting.ts` ; `lib/syndics/provider-invoice-accounting.ts` (graines de
  comptes) ; `lib/payment-gateway/codes.ts` ; `controllers/payment-gateway-public-controller.ts` (IPN,
  simulateur) ; `jobs/online-payment-reconciliation-job.ts`.
- **Aucune variable d'environnement nouvelle**.
- **Le chemin des loyers ne change pas de comportement** : `checkout.ts` n'est touché que par l'extraction du
  cœur (déjà amorcée, couverte par `payment-gateway-checkout-core.test.ts`).
- Migrations additives, **deux fichiers** (`ALTER TYPE … ADD VALUE` sépare l'ajout de la valeur de son
  usage) ; aucune migration déjà commitée n'est éditée (voir note M1).

## État de l'arbre au 2026-10-15 (à connaître avant de coder)

D'autres agents ont déjà écrit dans le worktree ; ce plan s'y raccorde :

| Pièce                                                                                 | État            | À corriger / compléter                                                                                                                                                |
| ------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma` : 2 modèles, 2 enums, 3 colonnes de `ChargePayment`, valeur de portée | écrit           | Ajouts de la section M1 ci-dessous ; **commentaire de `CHARGE_CALL_PAYMENT` à corriger** (objet = `ChargeCall`, pas `SYNDICATE_LOT`)                                  |
| Migrations `20261015115900_…` et `20261015120000_…`                                   | écrites         | Compléter (non commitées) avec les ajouts M1                                                                                                                          |
| `checkout-core.ts` + test                                                             | écrit           | Aucune dépendance Syndic ; sert M2                                                                                                                                    |
| `charge-call-payment-url.ts`, gabarits `{{paymentBlock}}`, `notifications.ts`         | écrit, en cours | **Bug** : `resolveChargeCallRecipient` s'appelle elle-même (récursion infinie) ; elle doit lire `lot.ownerContactId ? lot.owner : lot.coownerId ? lot.coowner : null` |

## Vérification de la constitution (AGENTS.md)

| Règle                          | Application                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant         | `tenantId` direct sur les deux nouveaux modèles ; `ChargeCall`/`SyndicateLot` (sans `tenantId`) toujours chargés après leur copropriété (`assertSyndicateOfTenant`) ; `NotFoundError` uniforme ; `schema-tenant-coverage` |
| Erreurs typées, `asyncHandler` | codes de [contracts.md §0.2](./contracts.md) ajoutés à `ErrorCode` ; pas de `try/catch` qui devine un statut                                                                                                              |
| Configuration                  | aucune variable nouvelle                                                                                                                                                                                                  |
| Frontend                       | `utils/api-client`, `config/api`, pages en `React.lazy`, pas de `dangerouslySetInnerHTML`, redirection fournisseur seulement `https` (ou `http` local)                                                                    |
| i18n                           | français = clé ; `npm run i18n:extract` côté API et web ; marges logiques                                                                                                                                                 |
| Wiki                           | sous-fonctionnalités ajoutées au classeur + `npm run wiki:export` (section « Wiki »)                                                                                                                                      |
| Secrets                        | clé API chiffrée, écriture seule, jamais journalisée ni auditée                                                                                                                                                           |

## Lots

Un fichier = un seul agent. Chemins relatifs à `packages/api/` (API) ou `apps/web/` (web).

### M1 — Schéma, migrations, audit, erreurs

Territoire : le coordinateur / un agent schéma.

- `prisma/schema.prisma` (déjà amorcé) — **ajouts à `SyndicOnlineCheckout`** :
  `contactId String?` (`CrmContact.id` du payeur, champ simple), `receivedAmount Decimal? @db.Decimal(14,2)`
  (montant payé selon le fournisseur), `reviewKind SyndicReviewKind?`, `resolution SyndicCheckoutResolution?` ;
  enums `SyndicReviewKind { AMOUNT_MISMATCH FISCAL_YEAR_CLOSED CALLS_UNAVAILABLE DUPLICATE_TRANSACTION CONTRARY_STATE }`
  et `SyndicCheckoutResolution { ACCEPTED REJECTED }` ; index `@@index([syndicateId, createdAt])`.
  `Tenant`, `Syndicate`, `SyndicateLot`, `ChargePayment` : relations déjà posées.
- Migrations : `prisma/migrations/20261015115900_secure_link_scope_charge_call_payment/` (déjà écrite) et
  `…/20261015120000_syndic_paiement_mobile/` (à compléter). **Note** : tant que ces deux fichiers ne sont pas
  commités, les compléter ; sinon une migration additive `…_syndic_paiement_mobile_complement`.
- `src/lib/secure-links/service.ts` : type `SecureLinkScope` + `'CHARGE_CALL_PAYMENT'`, `buildSecureLinkUrl`
  -> `${FRONTEND_URL}/payer-charges#<jeton>`.
- `src/types/audit-types.ts` : `SYNDIC_GATEWAY_CONFIG_UPDATED`, `SYNDIC_ONLINE_PAYMENT_STARTED`,
  `SYNDIC_ONLINE_PAYMENT_CONFIRMED`, `SYNDIC_ONLINE_PAYMENT_REVIEW`, `SYNDIC_ONLINE_PAYMENT_RESOLVED`,
  `SYNDIC_GATEWAY_PAYOUT_RECORDED`, `SYNDIC_CHARGE_PAYMENT_LINK_SENT`, `SECURE_LINK_CHARGE_PAYMENT_STARTED`.
- `src/middleware/error-middleware.ts` : membres de `ErrorCode` listés dans contracts §0.2.
- `src/lib/payment-gateway/codes.ts` : `SYNDIC_CODE_PREFIX = 'IMS-'`, `generateSyndicCodePaiement()`,
  `isSyndicCodePaiement()`.
- `__tests__/unit/schema-tenant-coverage.test.ts` (entrées des deux modèles), `docs/architecture/DATA_MODELS.md`.

### M2 — Moteur de paiement (sans route)

Territoire : un agent API. Dossier `src/lib/syndics/online-payment/` (nouveau) sauf mention.

- `types.ts` : types partagés de contracts §0.1 (source des DTO).
- `gateway-config.ts` : `loadSyndicGatewayConfig(tenantId, syndicateId)`, `isSyndicConfigUsable`,
  `syndicCredentialsFrom` (réutilise le déchiffrement de `payment-gateway/crypto.ts`), `getSyndicOnlineAvailability`
  (config + droit SYNDIC + agence active + `feesPaidBy` de l'agence, défaut `CLIENT`).
  **Interdit d'importer `loadConfig`/`isConfigUsable` de l'agence** (R4, test d'architecture).
- `gateway-settings.ts` : `getSyndicGatewaySettings`, `updateSyndicGatewaySettings` (schéma Zod, règles
  R3/R5, upsert, audit), `testSyndicGatewayConnection`, `getSyndicProviderBalance`. Calqué sur
  `payment-gateway/settings.ts`.
- `feature-gate.ts` : `assertSyndicOnlinePaymentAllowed(tenantId)` et variante non levante, sur
  `evaluateSchedulingGate` (`charge-schedule-tenant-gate.ts`, inchangé).
- `checkout-start.ts` : `startSyndicCheckout({ tenantId, syndicateId, lotId, chargeCallIds, origin,
tenantClientId?, secureLinkId?, payerContactId, actorUserId })` : configuration chargée **avant** la
  transaction ; transaction avec `pg_advisory_xact_lock(hash(tenantId, lotId))` ; sous verrou, chevauchements
  d'abord, puis appels et restes dus (affectations), montant entier ; création de la tentative ; `build-away`
  **hors transaction** par `requestProviderCheckoutRedirect` (`validateUrl: true`) ; échec = `FAILED` + 502.
  Renvoie `{ checkout, reused }`.
- `checkout-reconcile.ts` : `reconcileSyndicCheckout(tenantId, checkoutId)` et `reconcileSyndicCheckoutPublic(code)` :
  statut par `fetchNormalizedProviderStatus` avec la clé de la copropriété ; `decideCheckoutTransition` ;
  `SUCCEED` -> `settleSyndicCheckoutTx` ; `FAIL`/`CANCEL`/`REVIEW`/`TOUCH`. Sur `REVIEW` en cours : mise à jour
  du suivi seulement (R19). `claimStatusWindow` (10 s) pour les lectures publiques/portail.
- `checkout-settle.ts` : `settleSyndicCheckoutTx(tx, checkout, { paidAt, amount, source })` partagé par le
  succès automatique et `ACCEPT` : claim, `recordLotPaymentTx`, `issueReceiptsForPaymentTx`, `chargePaymentId`.
  Classe les échecs métier (`BadRequestError` d'exercice clos, `NotFoundError`, `P2002` sur
  `providerTransactionId`) en `ReviewKind` ; **les autres erreurs ne sont pas avalées** (la tentative reste
  `PENDING`, la tâche reprendra).
- `checkout-review.ts` : `decideSyndicCheckout` (ACCEPT/REJECT, règles du tableau de contracts §1.7).
- `checkout-queries.ts` : `listSyndicCheckouts` (filtres, pagination, compteurs), `toCheckoutRow`, `toCoOwnerCheckout`
  (réponse portail), `toPublicStatus`.
- `payout.ts` : `recordGatewayPayout`, `listGatewayPayouts`, `getCollectionBalance` (écriture 521/5525).
- `charge-allocation.ts` (modifié, **un seul agent**) : `LotPaymentInput` gagne `idempotencyKey?`,
  `providerTransactionId?`, `origin?` ('MANUAL' | 'ONLINE'), `treasuryAccountNumber?` ('521' | '571' | '5525') ;
  `recordLotPaymentTx` les écrit sur `ChargePayment` et les transmet à `postChargePaymentEntryTx`.
  Comportement inchangé quand ils sont absents.
- `charge-collection-accounting.ts` (modifié) : `ChargePaymentEntryInput.treasuryAccountNumber?` ; 5525 =
  journal banque, libellé « Encaissement appel de charges - lot X (IMS-…) ».
- `provider-invoice-accounting.ts` (modifié) : `SyndicAccountNumber` + `'5525'` ; graine
  `{ 5525, 'PaySecureHub (mobile money)', classe 5, ASSET }` ; **non** ajoutée à `SYNDIC_PROVIDER_ACCOUNT_SEEDS`.
- `lib/payment-gateway/checkout-core.ts` : réutilisé ; retouches seulement si un manque est constaté (signaler).
- `lib/payment-gateway/paysecurehub/simulator-client.ts` : `getStatus` lit aussi `syndicOnlineCheckout` pour les
  codes `IMS-`.
- `controllers/payment-gateway-public-controller.ts` : IPN et simulateur aiguillent `IMS-` vers le moteur
  Syndic ; redirection finale du simulateur = URL de retour de la tentative (portail ou lien).
- `jobs/online-payment-reconciliation-job.ts` : `reconcilePendingSyndicCheckouts()` (≥ 2 min, expiration 48 h),
  contexte d'agence par tentative.
- Tests unitaires dans `__tests__/unit/` (voir « Tests »).

### M2b — API de configuration (avec M2, dans la PR1)

- `src/routes/syndic-online-payment-routes.ts` (nouveau, **toutes** les routes gestionnaire de contracts §1) :
  en PR1 seulement les routes 1.1 à 1.4 ; 1.5 à 1.10 arrivent en M5.
- `src/controllers/syndic-online-payment-controller.ts` (nouveau) : handlers `asyncHandler`, schémas Zod.
- `src/app.ts` : montage du routeur sur `/api` (à côté des autres routeurs Syndic).
- `src/middleware/rate-limit-middleware.ts` : limiteurs gestionnaire (test 10/min, solde 10/min, écriture
  20/min) et trois limiteurs publics `chargePaymentView/Start/Status`.
- `__tests__/unit/routes-inventory.test.ts` : entrées des routes ajoutées à chaque PR.

### M3 — API portail (PR2)

- `src/controllers/coowner-online-payment-controller.ts` (nouveau) : `GET disponibilite`, `POST`, `GET :codePaiement`.
- `src/routes/coowner-portal-routes.ts` : trois routes (ordre : `disponibilite` avant `:codePaiement`).
- `src/lib/syndics/coowner-portal.ts` : `listCoOwnerChargeCalls` gagne `onlinePayable` et `onlineCheckout`
  (un chargement de disponibilité par copropriété du périmètre, une requête de tentatives ouvertes).
- `src/lib/syndics/online-payment/portal.ts` (nouveau) : `startCoOwnerCheckout(scope, body)`,
  `getCoOwnerCheckout(scope, code)`, `getCoOwnerAvailability(scope)` ; contrôle du périmètre et des appels
  par `ownedChargeCallsWhere`, payeur = `scope.lots[].contactId`.
- Tests : portail (périmètre, 404, reprise/409, REVIEW), `onlinePayable`.

### M4 — Écrans portail (PR2, en parallèle de M3 dès que contracts est gelé)

- `src/services/coowner-portal-service.ts` : types `CoOwnerOnlineCheckout`, `CoOwnerOnlinePaymentAvailability`,
  champs `onlinePayable`/`onlineCheckout` ; fonctions `getOnlinePaymentAvailability`, `startOnlinePayment`,
  `getOnlinePayment`.
- `src/pages/CoOwnerPortal/ChargeCalls.tsx` + `ChargeCallsTable.tsx` : cases à cocher (appels `onlinePayable` et
  `onlineCheckout === 'NONE'` d'un même lot), bandeau total + « Payer en ligne », garde `isSafeCheckoutUrl`
  avant `window.location.assign`.
- `src/pages/CoOwnerPortal/OnlinePaymentReturn.tsx` (nouveau) : lit `?paiement=`, interroge toutes les 3 s
  (~2 min), affiche payé (numéro du document), échoué, annulé, en vérification ; ne croit pas l'URL.
- Tests Vitest : `__tests__/coowner-portal/…`.

### M5 — Gestionnaire (PR2)

API (`packages/api`) :

- `src/routes/syndic-online-payment-routes.ts` + `controllers/syndic-online-payment-controller.ts` : routes 1.5 à
  1.9 (liste, vérifier, trancher, reversements).
- `src/lib/syndics/online-payment/checkout-queries.ts`, `checkout-review.ts`, `payout.ts` (livrés en M2,
  branchés ici).

Web (`apps/web`) :

- `src/services/syndic-online-payment-service.ts` (nouveau) : types de contracts §0.1 et §1, une fonction par route.
- `src/pages/syndics/SyndicOnlinePayments.tsx` (nouveau, onglet famille « Finances ») + route dans `App.tsx`
  (`/tenant/:tenantId/syndics/:syndicId/paiements-en-ligne`, `React.lazy`) + entrée dans
  `SyndicWorkspaceLayout` (barre d'onglets).
- `src/components/syndics/online-payment/` : `GatewayConfigCard.tsx` (formulaire, clé en écriture seule, test,
  URL de notification, solde 5525 et solde fournisseur), `CheckoutsTable.tsx` (filtres, pastilles),
  `ReviewDecisionModal.tsx` (motif, montants, note, `paidAt`, rappel de remboursement), `PayoutModal.tsx` +
  liste des reversements.
- Tests Vitest : formulaire (clé jamais préremplie), décision REVIEW, reversement.

### M6 — Lien sécurisé et messages (PR3)

API :

- `src/lib/syndics/online-payment/charge-call-link.ts` (nouveau) : `createChargeCallPaymentLink`,
  `listChargeCallPaymentLinks`, `revokeChargeCallPaymentLink`, `getChargeCallPaymentByToken`,
  `startChargeCallPaymentByToken`, `getChargeCallPaymentStatusByCode` (calqué sur
  `payment-gateway/installment-payment-link.ts`) ; règle « copropriétaire actuel depuis avant l'appel » (R27).
- `src/lib/syndics/online-payment/charge-call-link-send.ts` (nouveau) : envoi par `planChannels` /
  `sendOnPlannedChannels`, événement `CHARGE_CALL_PAYMENT_LINK_SENT`, destinataire = `resolveChargeCallRecipient`.
- `src/lib/syndics/charge-call-payment-url.ts` : le résolveur par défaut crée le lien (jamais d'exception).
- `src/lib/syndics/notifications.ts` : corriger `resolveChargeCallRecipient` ; `notifyChargeCallReminder` déjà
  aligné sur l'avis ; `src/lib/syndics/reminder-delivery.ts` inchangé.
- `src/constants/email-notification-keys.ts`, `email-notification-default-templates.ts`,
  `whatsapp-notification-keys.ts`, `whatsapp-notification-default-templates.ts`, `notification-key-features.ts`
  (`CHARGE_CALL_PAYMENT_LINK_SENT` -> `SYNDIC`).
- `src/routes/secure-link-public-routes.ts` + `controllers/charge-call-payment-public-controller.ts` (trois routes
  publiques) ; `src/app.ts` inchangé (le préfixe `/api/public/secure-links` est déjà exclu des parseurs globaux).
- `src/routes/syndic-online-payment-routes.ts` + contrôleur : routes 1.10 (créer, lister, révoquer).
- `__tests__/unit/routes-inventory.test.ts` : trois entrées publiques avec justification.

Web :

- `src/services/public-charge-call-payment-service.ts` et `src/services/charge-call-payment-link-service.ts`.
- `src/pages/public/ChargeCallPaymentPage.tsx`, `ChargeCallPaymentStatusPage.tsx` + routes `/payer-charges` et
  `/payer-charges/statut` dans `App.tsx` (zone des routes publiques, à côté de `/payer`).
- `src/components/syndics/ChargeCallPaymentLinkButton.tsx` + `ChargeCallPaymentLinksPanel.tsx`, branchés dans
  `SyndicCharges.tsx` (action sur un appel ouvert, masquée si la copropriété n'est pas payable en ligne).

## Ordre et parallélisme

```text
M1 ─┬─> M2 ──┬─> M2b ──> [PR1]
    │        │
    │        ├─> M3 ─┐
    │        └─> M5 ─┼─> [PR2]      M4 (web) peut démarrer dès que contracts.md est gelé
    │                │
    └────────────────┴─> M6 ──> [PR3]
```

- M1 d'abord (types Prisma générés pour tous). M2 puis M2b dans la PR1.
- **PR2** : M3 (API) et M4 (web) en parallèle sur le contrat ; M5 API et M5 web en parallèle ; trois territoires
  de fichiers disjoints (`coowner-*`, `syndic-online-payment-*`, `pages/syndics`).
- **PR3** : M6 API et M6 web en parallèle ; la correction de `resolveChargeCallRecipient` peut partir dès PR1.
- Fichiers à agent unique : `charge-allocation.ts`, `charge-collection-accounting.ts`,
  `provider-invoice-accounting.ts` (M2) ; `routes/syndic-online-payment-routes.ts` et son contrôleur
  (un seul agent par PR) ; `App.tsx` (un seul agent web par PR).

## PR empilées

| PR  | Base   | Contenu                                              | Livre                                                                                                     |
| --- | ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| PR1 | `main` | M1 + M2 + API de configuration (contracts 1.1 à 1.4) | Configuration par copropriété, moteur testé, comptes 5525 ; **aucun écran, aucun bouton « Payer »**       |
| PR2 | PR1    | M3 + M4 + M5                                         | Paiement depuis le portail, suivi, vérification, décision `REVIEW`, reversements ; écran de configuration |
| PR3 | PR2    | M6                                                   | Lien « Payer cet appel », pages publiques, messages, envoi/copie/révocation, relance ciblée               |

Chaque PR : `npm run typecheck`, `npm run lint`, `npm run check:architecture`, tests ciblés, `npm run
wiki:export`. La fusion reste à l'utilisateur.

## Tests

- **Moteur (PR1)** : succès -> un encaissement, un seul crédit de compte, une écriture 5525/450, reçus ;
  rejeu (IPN × 2, vérification × 2) -> rien de plus ; deux réconciliations concurrentes -> un seul vainqueur ;
  montant différent / exercice clos / appel disparu / transaction dupliquée / état contraire -> `REVIEW`,
  **zéro écriture** ; appel soldé entre-temps -> avance ; clé de la copropriété utilisée pour le statut (et
  jamais celle de l'agence) ; aucune configuration utilisable -> 400 sans repli ; changement de clé avec un
  `PENDING` -> 409 ; la clé n'apparaît dans aucun DTO ni journal ; `schema-tenant-coverage` ;
  test d'architecture (le moteur Syndic n'importe pas `loadConfig` de l'agence).
- **Portail (PR2)** : périmètre (lot d'un autre copropriétaire, appel antérieur à l'acquisition -> 404) ; montant
  jamais lu du corps ; reprise / 409 / `REVIEW` ; droit SYNDIC refusé -> 403 ; `onlinePayable` faux sans
  configuration ; statut limité au périmètre.
- **Gestionnaire (PR2)** : liste filtrée, pagination, compteurs ; `trancher` (chaque `reviewKind` × décision, double
  décision concurrente) ; `verifier` ; reversement (solde insuffisant, doublon, exercice clos) ; permissions
  (`TENANT_SETTINGS_EDIT` manquante -> 403).
- **Lien (PR3)** : 404 uniforme dans chaque cause (jeton, expiré, révoqué, mauvaise portée, agence suspendue,
  appel soldé, configuration absente, lot revendu) ; en-têtes et limiteurs ; aucun montant lu du corps ;
  statut limité aux tentatives d'origine lien ; relance au `coowner` quand `ownerContactId` est vide ;
  envoi sans lien quand le résolveur renvoie `null` ; le message part même si la création du lien échoue.
- **Web** : portail (cases, total, bandeau, interdiction de rediriger vers une URL non `https`), pages publiques
  (fragment, statut avec relance, `sessionStorage`), configuration (clé jamais préremplie), `REVIEW`.
- **Recette navigateur** (hors agents de réalisation) : parcours complet en simulateur : configurer, payer au
  portail, payer par lien, forcer un écart de montant, trancher, saisir un reversement.

## Définition de fini

- Les 35 exigences de la spec ont un test ou une vérification nommée.
- `contracts.md` et le code ne divergent pas (revue croisée API/web).
- Aucun appel à `loadConfig` de l'agence dans le périmètre Syndic ; aucune clé dans un journal (relecture
  `security-auditor` sur les trois PR, en particulier PR1 et PR3).
- `docs/integrations/paysecurehub.md` complété (flux Syndic, compte par copropriété, 5525, points ouverts Q1/Q6) ;
  `docs/architecture/DATA_MODELS.md` à jour ; i18n extraite ; wiki exporté ; `HANDOFF.md` mis à jour.
- Mode `LIVE` **non** activé ni annoncé comme validé.

## Sous-fonctionnalités à ajouter au wiki

Rapporter au coordinateur (classeur `docs/fonctionnalites/`), regroupées sous le module Syndic :

1. Configuration du compte marchand PaySecureHub d'une copropriété (mode, clé, test, activation).
2. Paiement en ligne des appels de charges depuis le portail copropriétaire.
3. Page « Payer cet appel » sans connexion (lien sécurisé) et page de statut.
4. Lien de paiement joint aux avis d'appel et aux relances ; envoi, copie et révocation d'un lien par le gestionnaire.
5. Suivi des paiements en ligne d'une copropriété (liste, filtres, vérification).
6. Décision sur un paiement à vérifier (accepter / refuser).
7. Reversement du compte de collecte vers la banque de la copropriété (écriture 5525 → 521).
8. Disponibilité du paiement en ligne par copropriété et par appel (portail).
9. Relance d'appel envoyée au copropriétaire réel (correction).

## Risques

| Risque                                                                           | Parade                                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Le montant du statut inclut les frais (Q1) : tout paiement en `REVIEW` en `LIVE` | Non bloquant en simulateur ; lever avec BMI avant tout `LIVE` ; la décision `ACCEPT` reste possible        |
| Divergence schéma amorcé / spec (portée du lien sur le lot, champs manquants)    | Section « État de l'arbre » et M1 : le coordinateur transmet les corrections à l'agent schéma              |
| Deux agents sur `charge-allocation.ts` ou `App.tsx`                              | Territoires ci-dessus ; un seul agent par fichier                                                          |
| Verrou consultatif et verrou de lot en ordre inverse (interblocage)              | Démarrage : verrou consultatif seul ; succès : claim puis `lockLotTx` ; aucun chemin ne prend l'inverse    |
| Une panne d'un envoi de reçu annule l'encaissement                               | Envoi **après** commit (`scheduleChargeDocumentDelivery`), jamais dans la transaction                      |
| Comptes 5525 créés par erreur dans le plan du cabinet                            | `ensureSyndicAccountsTx` (portée SYNDICATE) ; test : aucun appel à `ensureCollectionAccountTx` de l'agence |
| Rejet de la migration par `ALTER TYPE … ADD VALUE` dans la même transaction      | Deux fichiers de migration                                                                                 |
