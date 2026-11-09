# Tâches 048 — Paiement instantané PI-SPI

**Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md) · Brouillon du 2026-11-09, aucune tâche
commencée. `API/` = `packages/api/src`, `WEB/` = `apps/web/src`. `[P]` = parallélisable (fichiers
distincts). Une branche empilée et une PR par lot ; classeur des fonctionnalités et
`npm run wiki:export` dans toute PR qui change un écran ou une route.

## P0 — Prérequis hors code (fondateur, bloquant pour P1 réel)

- [ ] T001 Choisir l'opérateur de monnaie électronique ; vérifier son API Business homologuée sur la
      liste BCEAO du 2026-09-16 ; demander le plafond d'un compte professionnel, ses frais et ses
      délais d'ouverture.
- [ ] T002 Créer le compte d'accès au sandbox `developer.pispi.bceao.int`, un participant virtuel et un
      compte business de test (acte du fondateur).
- [ ] T003 Lire l'API de référence et le playground ; consigner par écrit : alias téléphone en
      `payeurAlias` (D4), contenu exact des notifications, hôtes et préfixe de scopes, comportement
      de `dateLimitePaiement`, existence d'un mode de test sans mTLS.
- [ ] T004 Poser D3 (mTLS exigé ?) et D5 (frais) au participant ; obtenir le bundle de la CA de la
      BCEAO si le mTLS est exigé.
- [ ] T005 Sonder BMI/PaySecureHub : PI-SPI proposé, calendrier, frais (option B en parallèle).
- [ ] T006 Cadrer le mandat agence → ImmoTopia et la responsabilité (juridique).
- [ ] T007 Lire le texte de l'Avis n° 0019 (PDF de la BCEAO) et la grille tarifaire entreprises.

## P1 — Socle, simulateur et configuration par agence

Données

- [ ] T010 Migration 1 : `ALTER TYPE "PaymentGatewayProvider" ADD VALUE 'PISPI'` (fichier seul).
      `API/../prisma/migrations/…_pispi_enum`.
- [ ] T011 Migration 2 : énumération `PaymentRail`, colonnes `rail`, `payerAliasMasked`,
      `endToEndId`, `expiresAt`, `providerStatusReason` sur `OnlinePaymentCheckout`,
      `PlatformPaymentCheckout`, `SyndicOnlineCheckout` ; tables `PispiAccountConfig`,
      `SyndicPispiAccountConfig`, `PispiWebhookEvent` ; index et unicités. Vérifier la règle du
      test de couverture pour un modèle sans `tenantId`.
- [ ] T012 Test `schema-tenant-coverage` et `prisma generate`.

Rail

- [ ] T013 [P] `API/lib/payment-gateway/instant/types.ts` : interface du rail, états normalisés,
      `InstantGatewayError`.
- [ ] T014 [P] `API/lib/payment-gateway/pispi/status-mapping.ts` + test unitaire exhaustif.
- [ ] T015 [P] `API/lib/payment-gateway/pispi/oauth.ts` : jeton `client_credentials`, cache par agence
      (expiration − 60 s), erreurs RFC 7807.
- [ ] T016 `API/lib/payment-gateway/pispi/client.ts` : `https.Agent` mTLS par agence, `X-API-Key`,
      `requestPayment`, `confirmRequest`, `getRequestStatus`, `lookupAlias`, timeouts. Dépend de
      T013, T015.
- [ ] T017 [P] `API/lib/payment-gateway/pispi/simulator.ts` : participant virtuel en mémoire +
      états en base ; scénarios succès, refus, expiration, alias inconnu, rejeu.
- [ ] T018 `API/lib/payment-gateway/instant/index.ts` : sélecteur selon la configuration de
      l'agence (`PISPI` ou `SIMULATOR`). Dépend de T016, T017.

Configuration

- [ ] T019 `API/lib/payment-gateway/pispi/config.ts` : lecture, écriture chiffrée, `isConfigUsable`,
      expiration du certificat ; réutilise `crypto.ts`.
- [ ] T020 `API/config/env.ts` + `packages/api/env.example` : variables de simulateur et de
      validation ; aucun secret en défaut.
- [ ] T021 Routes et contrôleur de réglages `…/settings/pispi` (GET, PUT, test) dans
      `agency-settings-routes.ts` ; droit RBAC dédié (clé de permission + seed) ; secrets jamais
      renvoyés.
- [ ] T022 [P] Web : `WEB/components/settings/PispiAccountCard.tsx` dans les réglages financiers,
      `WEB/services/pispi-service.ts`, textes via `t()`.

Webhook

- [ ] T023 `API/lib/payment-gateway/pispi/webhook.ts` : corps brut, HMAC en temps constant,
      journalisation idempotente, résolution du checkout par `txId`.
- [ ] T024 Route publique `POST /api/payment-gateway/pispi/webhook/:scope` + contrôleur, montée avant
      les routeurs authentifiés (comme l'IPN existante), `webhookRateLimiter`.
- [ ] T025 Rapprochement : `reconcilePispiCheckout` qui relit le statut et applique
      `decideCheckoutTransition` ; échéance par checkout dans `checkout-core.ts`.
- [ ] T026 Tâche planifiée : relecture des RTP en attente à échéance + filet de 5 minutes ;
      expiration à 48 h limitée au rail `HOSTED_PAGE`.

Tests et fin de lot

- [ ] T027 Tests unitaires : jeton expiré, `DU03`, `BE23`, signature absente ou fausse, rejeu, ordre
      inversé, montant différent → revue, `txId` interdit, secrets jamais renvoyés.
- [ ] T028 Tests d'intégration (base dédiée) : deux agences étanches ; webhook sans effet croisé ;
      `routes-inventory`.
- [ ] T029 `npm run typecheck`, lint, `check:architecture`, `i18n:extract`.

## P2 — Pilote : loyers d'une agence

- [ ] T030 `API/lib/payment-gateway/checkout.ts` : `startInstantCheckout` (RTP `521`, alias, montant
      entier, `txId` = code de paiement), reprise d'une demande récente, journal d'audit.
- [ ] T031 Contrôleurs et routes : portail locataire (disponibilité, recherche d'alias limitée,
      démarrage, statut) et lien de paiement public (spec 039), limiteurs dédiés.
- [ ] T032 [P] Web : `WEB/components/payment/InstantPaymentPanel.tsx` (saisie, confirmation du nom,
      compte à rebours, états) ; intégration dans `pages/TenantPortal/Payments.tsx` et
      `pages/public/InstallmentPaymentPage.tsx` ; suivi par sondage court.
- [ ] T033 Côté agence : `OnlineCheckoutStatus` affiche le rail et la raison de statut ; relance du
      rapprochement manuel pour une RTP.
- [ ] T034 Tests web (états, expiration, alias inconnu, arabe) et API (affectation, avance, doublon).
- [ ] T035 Classeur des fonctionnalités + `wiki:export` ; recette navigateur sur le simulateur.
- [ ] T036 **Recette réelle** : un paiement de faible montant chez l'agence pilote, sur staging, avec
      accord explicite du fondateur ; plafond du compte noté.

## P3 — Charges de copropriété, masse et escompte

- [ ] T040 Configuration par copropriété (`SyndicPispiAccountConfig`), sans repli sur le cabinet.
- [ ] T041 `startSyndicInstantCheckout` ; portail copropriétaire et lien « Payer cet appel ».
- [ ] T042 Demande groupée : création, confirmation, suivi par lot (`instructionId`), délai adaptatif.
- [ ] T043 Escompte par `remise` ; enrôlement d'un alias ; RTP `401` à l'échéance.
- [ ] T044 Tests, classeur, recette navigateur.

## P4 — Abonnements ImmoTopia

- [ ] T050 `API/lib/payment-gateway/pispi/platform-account.ts` (`PLATFORM_PISPI_*`) ; env et
      `env.example`.
- [ ] T051 `startInvoiceCheckout` : supprimer le `provider` en dur, choisir le rail ; retour
      `?paiement=`.
- [ ] T052 Tests (une période par règlement), classeur, recette.

## P5 — Reversements sortants

- [ ] T060 Droit RBAC dédié, plafond par agence, double validation.
- [ ] T061 `sendPayment` unitaire puis lot ; confirmation du nom ; statuts par webhook.
- [ ] T062 `OwnerPayout` : marqué payé seulement à `IRREVOCABLE` ; échec traçable.
- [ ] T063 Tests (alias erroné, plafond, double validation), classeur.
- [ ] T064 Décision écrite sur la responsabilité avant mise en service réelle.

## P6 — Encaissements non sollicités et rapprochement

- [ ] T070 Alias SHID par copropriété ou site ; QR sur place (CRC, GUI contrôlés).
- [ ] T071 `PAIEMENT_RECU` → affectation par référence ou alias ; file de revue des paiements non
      reconnus (modèle et écran).
- [ ] T072 Tests, classeur, recette.

## P7 — Finitions

- [ ] T080 ADR-009 ; `docs/governance/SECURITY.md` ; `docs/integrations/pispi.md` ; fiche
      d'onboarding des agences.
- [ ] T081 Mise à jour de `docs/workflows/HANDOFF.md`.
