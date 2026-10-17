# Tâches 047 — Paiement mobile money déclaré par le copropriétaire

**Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md) · **Contrats** : [contracts.md](./contracts.md)

Cocher une tâche seulement quand son code **et** son test sont écrits. `[P]` = peut avancer en parallèle
d'autres tâches du même lot. Chemins : `API/` = `packages/api/`, `WEB/` = `apps/web/`. Un fichier = un seul
agent à la fois.

## N1 — Schéma, migrations, audit, erreurs (PR1)

- [ ] T001 `API/prisma/schema.prisma` : `ChargePaymentOrigin` + `DECLARED`
- [ ] T002 `API/prisma/schema.prisma` : modèles `SyndicReceivingNumber`, `SyndicDeclaredPaymentSettings`,
      `SyndicPaymentDeclaration`, `SyndicPaymentDeclarationLine`, `SyndicPaymentProofRead` ; enums
      `SyndicDeclarationStatus`, `SyndicDeclarationRejectReason` ; relations vers `Tenant`, `Syndicate`,
      `SyndicateLot`, `ChargePayment` (plan N1)
- [ ] T003 `API/prisma/migrations/…_syndic_paiement_declare_enum/migration.sql` : `ALTER TYPE … ADD VALUE
    'DECLARED'` seul
- [ ] T004 `API/prisma/migrations/…_syndic_paiement_declare/migration.sql` : tables, index, contraintes **et**
      index unique partiel `(tenant_id, receiving_phone, transaction_reference) WHERE status IN
    ('PENDING','APPROVED')` écrit à la main, commenté
- [ ] T005 [P] `API/src/types/audit-types.ts` : neuf clés du plan N1
- [ ] T006 [P] `API/src/middleware/error-middleware.ts` : codes de contracts §0.2
- [ ] T007 `API/__tests__/unit/schema-tenant-coverage.test.ts` : cinq modèles
- [ ] T008 [P] `docs/architecture/DATA_MODELS.md` : cinq modèles, valeur `DECLARED`, index partiel
- [ ] T009 `npm run db:generate` (coordinateur) puis `npm run typecheck`

## N2 — Moteur (PR1)

Comptabilité et affectation (un agent par fichier) :

- [ ] T010 `API/src/lib/syndics/provider-invoice-accounting.ts` : `ensureSyndicReceivingAccountTx(tx, tenantId,
    syndicateId, { operator, phoneNumber })` : rang suivant libre sous 5521 dans le plan SYNDICATE de la
      copropriété, libellé « <Opérateur> <numéro masqué> », classe 5, ASSET ; réutilise le compte si le même
      numéro existe déjà dans cette copropriété ; test `syndics.accounting.test.ts` (jamais dans le plan du
      cabinet ; numéro partagé = un compte par copropriété)
- [ ] T011 `API/src/lib/syndics/charge-collection-accounting.ts` : `CollectionTreasuryAccount` accepte un
      sous-compte `5521\d+` ; journal banque ; libellé « … (mobile money <référence>) » ; test débit 5521x /
      crédit 450
- [ ] T012 `API/src/lib/syndics/charge-allocation.ts` : `origin` accepte `'DECLARED'`, transmet le sous-compte ;
      test : saisie manuelle et paiement en ligne inchangés

Briques du dossier `API/src/lib/syndics/declared-payment/` :

- [ ] T013 `types.ts` : types de contracts §0.1 et DTO des sections 1 et 2
- [ ] T014 [P] `phone.ts` : `normalizeIvorianMsisdn`, `maskPhone` + tests (formats locaux, +225, espaces, refus)
- [ ] T015 [P] `reference.ts` : `normalizeTransactionReference` + tests
- [ ] T016 [P] `business-days.ts` : `addBusinessDays`, `businessDaysBetween`, `isOverdue` + tests (week-ends)
- [ ] T017 `receiving-numbers.ts` : liste, création (avec T010), modification (refus de changer opérateur ou
      numéro s'il existe une déclaration), désactivation, suppression conditionnelle, `sharedWithCount`,
      `treasuryBalance` ; audit ; tests
- [ ] T018 `settings.ts` : lecture (valeurs par défaut sans ligne), mise à jour Zod, `usable`,
      `getDeclaredPaymentAvailability` ; tests
- [ ] T019 `proof-files.ts` : chemins définitif et temporaire sous `uploads/syndics/payment-proofs/`,
      enregistrement (type réel par `detectStockFileKind`, 5 Mo, `stripImageMetadata`, `sha256Hex`), lecture
      privée `getDeclarationProofForTenant`, `purgeExpiredProofReads` ; tests (refus d'un `.jpg` qui est un
      exécutable, EXIF retiré, 404 hors agence)
- [ ] T020 `declaration-create.ts` : `createDeclaration` (R8–R11, D13, D14, D15) ; `P2002` de l'index partiel →
      `DECLARATION_REFERENCE_USED` ; limite de 10 `PENDING` par lot ; calcul de `aiEditedFields` quand une
      lecture est liée ; tests (somme des lignes, lots d'une autre copropriété, appel d'un autre lot, plafond,
      bornes de date, numéro inactif, deux déclarations concurrentes de même référence → une seule)
- [ ] T021 [P] `declaration-cancel.ts` : annulation par le déclarant, claim `PENDING` ; tests
- [ ] T022 `declaration-alerts.ts` : chaque alerte de contracts §0.1 `DeclarationAlert` ; tests un par un
- [ ] T023 `declaration-review.ts` : `approveDeclaration` (claim, exercice, lignes triées par `lotId`,
      `recordLotPaymentTx` + `issueReceiptsForPaymentTx` par ligne, correction, documents renvoyés, envoi après
      commit) et `rejectDeclaration` ; tests : un encaissement par ligne, `origin = DECLARED`, partiel, excédent
      en avance, appel soldé entre-temps, exercice clos, correction, deux validations concurrentes → une seule,
      rejet sans écriture, référence libérée après rejet
- [ ] T024 `declaration-queries.ts` : liste (filtres, tri, compteurs), détail, vues portail,
      `pendingDeclarationsByCall` ; tests

## N3 — API gestionnaire de configuration (PR1)

- [ ] T025 `API/src/controllers/syndic-declared-payment-controller.ts` : handlers 1.1 à 1.5 (`asyncHandler`, Zod
      strict)
- [ ] T026 `API/src/routes/syndic-declared-payment-routes.ts` : routes 1.1 à 1.5, gardes par chemin
- [ ] T027 `API/src/app.ts` : montage sur `/api`
- [ ] T028 [P] `API/src/middleware/rate-limit-middleware.ts` : `syndicDeclaredWriteRateLimiter`
- [ ] T029 `API/__tests__/unit/routes-inventory.test.ts` : routes 1.1 à 1.5
- [ ] T030 Tests d'intégration des routes 1.1 à 1.5 (permissions `SYNDIC_VIEW` / `SYNDIC_EDIT`, copropriété
      d'une autre agence → 404)
- [ ] T031 `npm run typecheck`, `npm run lint`, `npm run check:architecture`, `npm test` ciblé,
      `npm run test:isolation` ; classeur (sous-fonctionnalités 1 et 2) + `npm run wiki:export` ; PR1

## N4 — API portail et effets d'attente (PR2)

- [ ] T032 `API/src/lib/syndics/declared-payment/portal.ts` : disponibilité, création (périmètre de chaque lot,
      déclarant = contact de la session), liste, annulation ; droit SYNDIC explicite ; tests
- [ ] T033 `API/src/controllers/coowner-declared-payment-controller.ts` : 2.1, 2.4, 2.5, 2.6 ; `multer` mémoire
      5 Mo, champ `proof`, `payload` JSON validé strict
- [ ] T034 `API/src/routes/coowner-portal-routes.ts` : quatre routes, littéraux avant `:declarationId`,
      limiteur avant le parseur
- [ ] T035 [P] `API/src/middleware/rate-limit-middleware.ts` : `coOwnerDeclarationCreateLimiter`
- [ ] T036 `API/src/lib/syndics/coowner-portal.ts` : `pendingDeclaration` par appel ; `onlinePayable` faux si
      déclaration en attente ; tests
- [ ] T037 `API/src/lib/syndics/online-payment/checkout-start.ts` : 409 `CHARGE_CALL_DECLARATION_PENDING` ; test
- [ ] T038 `API/src/lib/syndics/queries.ts` : `runReminderBatchForSyndicate` saute les appels visés par une
      déclaration `PENDING` de moins de N jours ouvrés ; `createManualReminderForChargeCall` renvoie
      `pendingDeclaration` ; tests (avant, après N jours, rejetée, annulée)
- [ ] T039 `API/__tests__/unit/routes-inventory.test.ts` : routes portail

## N5 — API gestionnaire de validation et notifications (PR2)

- [ ] T040 `API/src/controllers/syndic-declared-payment-controller.ts` + routes : 1.6 à 1.11 ; tests
      d'intégration (filtres, tri, preuve privée, validation, rejet, P4, permissions)
- [ ] T041 [P] Constantes de notification (`email-notification-keys.ts`, `email-notification-default-templates.ts`,
      `whatsapp-notification-keys.ts`, `whatsapp-notification-default-templates.ts`,
      `notification-key-features.ts`) : quatre clés de contracts §3.4, gabarits fr
- [ ] T042 `API/src/lib/syndics/declared-payment/notifications.ts` : envois copropriétaire (accusé, validation avec
      documents, rejet) et gestionnaires (regroupé, retard) par `planChannels` ; un échec d'envoi ne défait
      jamais une validation ; tests
- [ ] T043 `API/src/jobs/syndic-declared-payment-job.ts` + inscription dans l'ordonnanceur : regroupement horaire,
      alerte quotidienne 8 h (Africa/Abidjan), purge des lectures expirées ; tests
- [ ] T044 `npm run i18n:extract` (API)

## N6 — Écrans (PR2)

Portail (un agent) :

- [ ] T045 `WEB/src/services/coowner-portal-service.ts` : types et fonctions de contracts §2
- [ ] T046 `WEB/src/components/coowner-portal/declared-payment/ReceivingNumbersCard.tsx` : numéros, copie, consigne
- [ ] T047 `WEB/src/components/coowner-portal/declared-payment/DeclarationForm.tsx` : lots et parts, appels,
      numéro, payeur, montant, date et heure, référence, capture, commentaire ; somme des parts = montant ;
      utilisable à 360 px de large
- [ ] T048 `WEB/src/components/coowner-portal/declared-payment/DeclarationsList.tsx` + section dans
      `WEB/src/pages/CoOwnerPortal/Payments.tsx` (statut, motif, annulation)
- [ ] T049 `WEB/src/pages/CoOwnerPortal/ChargeCalls.tsx` + `ChargeCallsTable.tsx` : bouton « J'ai payé par mobile
      money », état « Paiement déclaré, en vérification », case de paiement en ligne grisée
- [ ] T050 Tests Vitest `WEB/src/__tests__/coowner-portal/…` (formulaire, liste, annulation, appel en
      vérification)

Gestionnaire (un autre agent) :

- [ ] T051 `WEB/src/services/syndic-declared-payment-service.ts` : types et fonctions de contracts §1
- [ ] T052 `WEB/src/components/syndics/declared-payment/ReceivingNumbersCard.tsx` et `DeclaredSettingsCard.tsx`
      (avertissement de numéro partagé, solde du sous-compte)
- [ ] T053 `WEB/src/components/syndics/declared-payment/DeclarationsTable.tsx` et `DeclarationDrawer.tsx` (pastilles,
      filtres, alertes, aperçu de la capture en `blob:` depuis 1.8)
- [ ] T054 `WEB/src/components/syndics/declared-payment/ApproveModal.tsx`, `RejectModal.tsx`,
      `DeclareForThirdPartyModal.tsx`
- [ ] T055 `WEB/src/pages/syndics/SyndicOnlinePayments.tsx` : blocs « Paiement par transfert mobile money » et
      « Paiements déclarés » ; `WEB/src/components/navigation/SyndicWorkspaceLayout.tsx` : onglet « Paiements »
      (D16), même route ; pastille sur l'appel dans `WEB/src/pages/syndics/SyndicCharges.tsx`
- [ ] T056 Tests Vitest (numéros, file, validation corrigée, rejet, P4)
- [ ] T057 `npm run i18n:extract` (web) ; reporter en/ar de « Paiements en ligne » sur « Paiements »
- [ ] T058 Vérifications de PR2 (typecheck, lint, architecture, tests, isolation) ; classeur (3 à 7, 9, 10) +
      `npm run wiki:export` ; recette navigateur sur l'instance de démo ; PR2

## N7 — Pré-remplissage IA (PR3)

- [ ] T059 `API/src/lib/ai/vision/` : déplacer `runVisionCall`, `imageToBase64`, `VisionCallError`,
      `buildGeminiRequest`, `extractGeminiText` et le transport OpenRouter, paramétrés par consigne et schéma ;
      réexports dans `API/src/lib/stock-whatsapp/vision/*` ; suite de tests 041 verte sans retouche
- [ ] T060 `API/src/config/env.ts` + `API/env.example` : `PAYMENT_PROOF_VISION_PROVIDER`, `…_MODEL`,
      `…_TIMEOUT_MS` ; `fake` refusé en production ; test de configuration
- [ ] T061 `API/src/lib/syndics/declared-payment/vision/` : `prompt.ts`, `schema.ts` (JSON Schema + Zod strict de
      `PaymentProofReading`), `index.ts`, `fake-provider.ts`, `gemini-provider.ts`, `openrouter-provider.ts` ;
      tests (sortie invalide abandonnée champ par champ, délai dépassé)
- [ ] T062 `API/src/lib/syndics/declared-payment/proof-read.ts` : disponibilité, limiteurs, quota mensuel de 300 par
      agence, stockage temporaire, contrôles croisés R28, journal, audit sans valeurs, panne → `UNREADABLE`
      sans exception ; tests
- [ ] T063 Route 2.3 (contrôleur, route, `coOwnerProofReadLimiter`) ; `aiPrefillAvailable` dans 1.5 et 2.1 ;
      `routes-inventory.test.ts`
- [ ] T064 `declaration-create.ts` : `proofReadId` (même contact, non consommé, non expiré), capture reprise,
      `aiPrefill` et `aiEditedFields` ; tests
- [ ] T065 Web : `DeclarationForm.tsx` (capture d'abord, champs « Lu automatiquement, vérifiez », suivi des
      retouches), `DeclarationDrawer.tsx` (témoins IA), `DeclaredSettingsCard.tsx` (interrupteur, compteur) ;
      tests Vitest
- [ ] T066 `npm run i18n:extract` (deux paquets), vérifications, classeur (8) + `npm run wiki:export`,
      relecture `security-auditor` (injection par l'image, fichiers, quota) ; PR3

## Hors agents de réalisation

- [ ] T067 Relecture `code-reviewer` + `security-auditor` de PR1, PR2 et PR3 (portail, fichiers, paiements)
- [ ] T068 Recette navigateur complète (plan, « Tests ») et anomalies au bus `.agent-bus/`
- [ ] T069 Validation des comptes 5521x par le comptable (Q9) avant mise en production
- [ ] T070 `docs/workflows/HANDOFF.md` à chaque PR
