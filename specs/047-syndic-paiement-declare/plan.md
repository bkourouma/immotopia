# Plan d'implémentation 047 — Paiement mobile money déclaré par le copropriétaire

**Branche de réalisation** : `feat/syndic-paiement-declare` (3 PR empilées) · **Spec** : [spec.md](./spec.md) ·
**Contrats** : [contracts.md](./contracts.md) · **Tâches** : [tasks.md](./tasks.md)

## Résumé

Chaque copropriété déclare ses **numéros de réception** mobile money (`SyndicReceivingNumber`), chacun adossé
à un sous-compte de trésorerie 5521x de son plan comptable. Le copropriétaire paie hors d'ImmoTopia, puis
dépose une **déclaration** (`SyndicPaymentDeclaration`) répartie en **lignes**, une par lot
(`SyndicPaymentDeclarationLine`). Une capture du SMS est facultative et peut être pré-lue par une IA de
vision (`SyndicPaymentProofRead`). Tant que la déclaration attend, rien n'est crédité ; seule la suspension
des relances automatiques (D7) et le blocage du paiement en ligne des mêmes appels (R15) en découlent. La
**validation** par le gestionnaire pose, dans une seule transaction, un encaissement par ligne via
`recordLotPaymentTx` (origine `DECLARED`, compte 5521x), les reçus et quittances, puis envoie les documents
après le commit.

## Contexte technique

- API Express 4, Prisma 5, PostgreSQL, Jest ; web React 18, Ant Design, Vitest.
- **Réutilisé tel quel** : `lib/syndics/charge-allocation.ts` (`recordLotPaymentTx`, `lockLotTx`),
  `lib/syndics/charge-receipts.ts` (`issueReceiptsForPaymentTx`), `charge-receipt-delivery.ts`
  (`scheduleChargeDocumentDelivery`), `lib/syndics/coowner-portal.ts` (`resolveCoOwnerScope`,
  `ownedChargeCallsWhere`), `lib/syndics/provider-invoice-accounting.ts` (`assertFiscalYearOpenTx`),
  `lib/files/private-files.ts` (`privateUploadPath`, `readPrivateUpload`, `sendPrivateFile`),
  `lib/finance/stock-pieces-jointes.ts` (`detectStockFileKind`, `stripImageMetadata`, `sha256Hex`),
  `lib/syndics/online-payment/feature-gate.ts` (droit SYNDIC sur le portail),
  `lib/patrimoine/notification-channels.ts` (`planChannels`, `sendOnPlannedChannels`).
- **Réutilisé et étendu** :
  - `lib/syndics/charge-allocation.ts` : `LotPaymentInput.origin` accepte `'DECLARED'` ;
    `treasuryAccountNumber` accepte un sous-compte 5521x ;
  - `lib/syndics/charge-collection-accounting.ts` : `CollectionTreasuryAccount` devient
    `'521' | '571' | '5525' | ReceivingAccountNumber` (chaîne `5521` suivie d'un rang) ;
  - `lib/syndics/provider-invoice-accounting.ts` : `ensureSyndicReceivingAccountTx` (création à la demande
    d'un compte 5521x dans le plan SYNDICATE de la copropriété, jamais dans celui du cabinet) ;
  - `lib/syndics/queries.ts` : `runReminderBatchForSyndicate` ignore les appels visés par une déclaration
    `PENDING` de moins de N jours ouvrés (D7) ;
  - `lib/syndics/online-payment/checkout-start.ts` : chevauchement avec une déclaration `PENDING` → 409
    (R15) ;
  - `lib/syndics/coowner-portal.ts` : `listCoOwnerChargeCalls` gagne `pendingDeclaration` ; `onlinePayable`
    tient compte des déclarations en attente ;
  - fournisseurs de vision de la spec 041 (`lib/stock-whatsapp/vision/schema.ts` : `runVisionCall`,
    `imageToBase64`, `VisionCallError` ; `gemini-provider.ts` : `buildGeminiRequest`, `extractGeminiText`) :
    les fonctions de transport sont **déplacées** dans `lib/ai/vision/` (sans changement de comportement,
    réexportées depuis l'ancien emplacement) pour être partagées par le stock et le paiement déclaré.
- **Variables d'environnement nouvelles** (dans `src/config/env.ts` et `env.example`) :
  `PAYMENT_PROOF_VISION_PROVIDER` (`disabled` | `fake` | `gemini` | `openrouter`, défaut `disabled`),
  `PAYMENT_PROOF_VISION_MODEL`, `PAYMENT_PROOF_VISION_TIMEOUT_MS` (défaut 15000). Les clés
  `GEMINI_API_KEY` / `OPENROUTER_API_KEY` existantes sont réutilisées. `fake` refusé en production (même
  règle que `STOCK_VISION_PROVIDER`).
- Migrations additives, **deux fichiers** : `…_syndic_paiement_declare_enum` (`ALTER TYPE
"ChargePaymentOrigin" ADD VALUE 'DECLARED'`) puis `…_syndic_paiement_declare` (tables, index, contraintes).

## Vérification de la constitution (AGENTS.md)

| Règle                          | Application                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant         | `tenantId` direct sur les cinq nouveaux modèles ; `SyndicateLot` et `ChargeCall` (sans `tenantId`) chargés après leur copropriété ; `receivingNumberId`, `lotId`, `chargeCallIds` vérifiés par `assertBelongsToTenant` ou équivalent avant écriture ; 404 uniforme. |
| Erreurs typées, `asyncHandler` | codes de [contracts.md §0.2](./contracts.md) ajoutés à `ErrorCode` ; aucun `try/catch` qui devine un statut.                                                                                                                                                        |
| Configuration                  | trois variables `PAYMENT_PROOF_VISION_*` via `env.ts`, documentées dans `env.example` ; aucune valeur par défaut de secret.                                                                                                                                         |
| Fichiers uploadés              | captures sous `uploads/syndics/payment-proofs/…` : le préfixe `syndics/**` est déjà refusé en statique par `uploads-access-middleware.ts` ; lecture par route authentifiée seulement.                                                                               |
| Frontend                       | `utils/api-client`, `config/api`, pages en `React.lazy`, pas de `dangerouslySetInnerHTML` ; aperçu de la capture par `blob:` issu d'une route authentifiée.                                                                                                         |
| i18n                           | français = clé ; `npm run i18n:extract` dans les deux paquets ; marges logiques ; renommage de l'onglet (D16) : reporter les traductions en/ar de l'ancien libellé.                                                                                                 |
| Wiki                           | sous-fonctionnalités ci-dessous au classeur + `npm run wiki:export`, dans chaque PR qui en livre.                                                                                                                                                                   |
| Pas de `include: { user }`     | relecteur et déclarant chargés par `select` explicite.                                                                                                                                                                                                              |

## Hypothèse comptable H1 (révisable)

La question Q9 (plan de comptes des numéros de réception) n'est pas tranchée par un comptable. Le chantier
retient l'hypothèse **la plus prudente**, c'est-à-dire la plus facile à défaire, et la documente comme
révisable :

- **un sous-compte par numéro de réception**, sous le compte 552 « Monnaie électronique — téléphone
  portable » (SYSCOHADA révisé), numéroté `5521` suivi d'un rang (`55211`, `55212`…), libellé
  « <Opérateur> <numéro masqué> » ;
- créé **à la demande**, à l'enregistrement du numéro, **dans le plan SYNDICATE de la copropriété seulement**
  (jamais dans celui du cabinet) ; un numéro partagé (D10) a un sous-compte dans chaque copropriété ;
- **aucun compte existant n'est modifié, renommé ni supprimé** ; `5525` reste à PaySecureHub (spec 042) ;
- le numéro du compte est **stocké sur le numéro de réception** (`treasuryAccountNumber`) et toute la
  numérotation vit dans une seule fonction (`ensureSyndicReceivingAccountTx`).

Pourquoi c'est la plus prudente : des sous-comptes fins se **regroupent** sans perte (ils se totalisent
dans 552 sur la balance), alors qu'un compte unique ne se **redécoupe** pas après coup. Si le comptable
retient un autre schéma (compte unique, autre racine), on change la fonction de numérotation et le
`treasuryAccountNumber` des numéros ; les écritures déjà passées restent justes et se reclassent par une
écriture de virement de compte à compte. Aucune migration de données n'est alors nécessaire. Tâche T069 :
validation par le comptable avant la mise en production.

## Lots

Un fichier = un seul agent. Chemins relatifs à `packages/api/` (API) ou `apps/web/` (web).

### N1 — Schéma, migrations, audit, erreurs (PR1)

- `prisma/schema.prisma` :
  - `enum ChargePaymentOrigin` + `DECLARED` ;
  - `model SyndicReceivingNumber` (R1) : `id`, `tenantId`, `syndicateId`, `operator MobileMoneyOperator`,
    `phoneNumber` (E.164), `holderName`, `label?`, `treasuryAccountNumber`, `isActive`, `sortOrder`,
    dates ; `@@unique([syndicateId, operator, phoneNumber])`, `@@index([tenantId, phoneNumber])` (détection
    du numéro partagé, D10) ; `onDelete: Restrict` depuis les déclarations ;
  - `model SyndicDeclaredPaymentSettings` (R4) : `syndicateId @unique`, `tenantId`, `enabled` (défaut faux,
    D11), `reviewAlertBusinessDays` (défaut 3, D12), `proofRequired` (défaut faux, D14), `payerInstructions?`,
    `aiPrefillEnabled` (défaut faux, D9) ; sans ligne = valeurs par défaut, rien d'écrit ;
  - `enum SyndicDeclarationStatus { PENDING APPROVED REJECTED CANCELED }`,
    `enum SyndicDeclarationRejectReason { NOT_FOUND AMOUNT_MISMATCH REFERENCE_USED WRONG_NUMBER OTHER }` ;
  - `model SyndicPaymentDeclaration` (R6) : `tenantId`, `syndicateId`, `receivingNumberId`, instantané du
    numéro (`receivingOperator`, `receivingPhone`, `receivingHolderName`, S10), `declaredByContactId?`,
    `declaredByUserId?`, `payerPhone`, `amount Decimal(14,2)`, `paidAt`, `transactionReference` (normalisée),
    `comment?`, `proofFileUrl?`, `proofSha256?`, `proofReadId?`, `aiPrefill Json?`, `aiEditedFields
String[]`, `status`, `reviewedByUserId?`, `reviewedAt?`, `acceptedAmount?`, `acceptedPaidAt?`,
    `rejectReason?`, `reviewNote?`, `canceledAt?`, dates ; index `[tenantId, syndicateId, status, createdAt]`,
    `[receivingNumberId, transactionReference]` ;
  - **unicité partielle** (migration SQL brute, Prisma ne l'exprime pas) : index unique sur
    `(receiving_phone, transaction_reference)` `WHERE status IN ('PENDING','APPROVED')` dans la portée de
    l'agence (`tenant_id`). Elle tient pour un numéro partagé entre copropriétés (D10) et arbitre les
    concurrences (R10) ;
  - `model SyndicPaymentDeclarationLine` : `tenantId`, `declarationId` (`onDelete: Cascade`), `lotId`,
    `amount`, `acceptedAmount?`, `chargeCallIds String[]`, `chargePaymentId? @unique` ;
    `@@unique([declarationId, lotId])` ;
  - `model SyndicPaymentProofRead` (R26, D9) : `tenantId`, `syndicateId`, `contactId`, `tempFileUrl?`,
    `sha256`, `provider`, `model`, `outcome` (`OK` | `UNREADABLE` | `NOT_A_PAYMENT` | `FAILED` |
    `DISABLED`), `result Json?`, `latencyMs`, `consumedAt?` (lié à une déclaration), `expiresAt` (24 h),
    `createdAt` ; index `[tenantId, createdAt]` (quota mensuel), `[contactId, createdAt]`, `[expiresAt]`.
- Migrations : `prisma/migrations/2026MMDDhhmm00_syndic_paiement_declare_enum/` puis
  `…_syndic_paiement_declare/`.
- `src/types/audit-types.ts` : `SYNDIC_RECEIVING_NUMBER_CREATED`, `…_UPDATED`, `…_DEACTIVATED`,
  `SYNDIC_DECLARED_PAYMENT_SETTINGS_UPDATED`, `SYNDIC_PAYMENT_DECLARATION_CREATED`, `…_CANCELED`,
  `…_APPROVED`, `…_REJECTED`, `SYNDIC_PAYMENT_PROOF_READ`.
- `src/middleware/error-middleware.ts` : codes de contracts §0.2.
- `__tests__/unit/schema-tenant-coverage.test.ts` (cinq modèles) ; `docs/architecture/DATA_MODELS.md`.

### N2 — Moteur (sans route) (PR1)

Dossier `src/lib/syndics/declared-payment/` (nouveau) sauf mention.

- `types.ts` : types de contracts §0.1 (source des DTO).
- `phone.ts` : `normalizeIvorianMsisdn(input)` → `+225XXXXXXXXXX` ou `null` (10 chiffres après l'indicatif,
  préfixes 01/05/07/27…) ; `maskPhone` pour l'affichage (`07 •• •• •• 12`).
- `reference.ts` : `normalizeTransactionReference` (majuscules, sans espaces, `[A-Z0-9.-]{4,40}`).
- `receiving-numbers.ts` : `listReceivingNumbers`, `createReceivingNumber`, `updateReceivingNumber`,
  `deactivateReceivingNumber` (R1–R3) ; à la création, `ensureSyndicReceivingAccountTx` alloue le compte
  5521x ; `sharedWithCount` (même numéro dans d'autres copropriétés de l'agence, D10).
- `settings.ts` : `getDeclaredPaymentSettings`, `updateDeclaredPaymentSettings` (Zod, audit),
  `getDeclaredPaymentAvailability(tenantId, syndicateId)` (activé + au moins un numéro actif + droit SYNDIC).
- `business-days.ts` : `addBusinessDays(date, n)` (lundi–vendredi, sans jours fériés dans ce chantier) et
  `isOverdue(createdAt, n, now)`.
- `declaration-create.ts` : `createDeclaration({ tenantId, syndicateId, actor, input, proof? })` (R8–R11) :
  contrôle du périmètre (portail) ou de l'agence (gestionnaire, P4), numéro actif de la copropriété, lots
  distincts de la copropriété, appels ouverts du lot de leur ligne, somme des lignes = montant, plafond
  5 000 000 (D13), bornes de date, référence normalisée ; capture : `detectStockFileKind`, 5 Mo,
  `stripImageMetadata`, stockage privé, `sha256Hex` ; `proofRequired` respecté ; liaison d'une lecture IA
  (`proofReadId` du même contact, non consommée, non expirée) qui fournit aussi le fichier ; calcul de
  `aiEditedFields` (champs proposés par l'IA puis modifiés) ; `P2002` sur l'index partiel → 409
  `DECLARATION_REFERENCE_USED` ; limite de 10 `PENDING` par lot.
- `declaration-cancel.ts` : `cancelDeclaration` (déclarant, `PENDING` seulement, claim atomique).
- `declaration-alerts.ts` : `computeDeclarationAlerts(tx|prisma, declaration)` (R17) : référence déjà portée
  par un `ChargePayment` de la copropriété ; doublon probable (même numéro, même montant, même payeur,
  ±10 minutes) ; excédent / paiement partiel par ligne ; déclarant qui n'est plus copropriétaire du lot ;
  champs IA modifiés ; numéro destinataire lu ≠ numéro choisi (R28) ; exercice clos ; en retard.
- `declaration-review.ts` :
  - `approveDeclaration({ tenantId, syndicateId, declarationId, actorUserId, correction? })` (R16, R18,
    R19) : claim `UPDATE … WHERE status = 'PENDING'` (0 ligne → 409 `DECLARATION_NOT_PENDING`) ;
    `assertFiscalYearOpenTx` sur la date retenue ; pour chaque ligne, dans l'ordre des `lotId` (évite les
    interblocages), `recordLotPaymentTx` (`method: 'MOBILE_MONEY'`, `reference`, `idempotencyKey:
'DECL-' + line.id`, `origin: 'DECLARED'`, `chargeCallIds`, `treasuryAccountNumber` du numéro,
    `actorUserId`) puis `issueReceiptsForPaymentTx` ; `chargePaymentId` posé sur la ligne ; renvoie les
    documents émis ; l'**appelant** déclenche après le commit `scheduleChargeDocumentDelivery` et la notification (voir « Lots par territoire ») ;
  - `rejectDeclaration(…, { reason, note })` (R20) : claim, rien d'autre.
- `declaration-queries.ts` : `listDeclarations` (filtres, pagination, compteurs `pending`, `overdue`,
  `suspectedDuplicate`), `getDeclarationDetail` (avec alertes, reste dû actuel des appels visés),
  `toCoOwnerDeclaration`, `pendingDeclarationsByCall(lotIds)` (pour le portail, les relances et R15).
- `proof-files.ts` : chemins `uploads/syndics/payment-proofs/<tenantId>/<syndicateId>/` (définitif) et
  `…/tmp/<tenantId>/` (lecture IA), `getDeclarationProofForTenant`, `purgeExpiredProofReads()`.
- Modifiés (agent unique chacun) : `charge-allocation.ts`, `charge-collection-accounting.ts`,
  `provider-invoice-accounting.ts` (voir « Contexte technique »).

### N3 — API gestionnaire de configuration (PR1)

- `src/routes/syndic-declared-payment-routes.ts` (nouveau, toutes les routes gestionnaire de contracts §1 ;
  en PR1 seulement 1.1 à 1.5) et `src/controllers/syndic-declared-payment-controller.ts` (nouveau).
- `src/app.ts` : montage sur `/api`, à côté de `syndic-online-payment-routes`.
- `src/middleware/rate-limit-middleware.ts` : `syndicDeclaredWriteRateLimiter` (20/min).
- `__tests__/unit/routes-inventory.test.ts`.

### N4 — API portail et effets d'attente (PR2)

- `src/controllers/coowner-declared-payment-controller.ts` (nouveau) et `src/routes/coowner-portal-routes.ts`
  (routes de contracts §2 sauf la lecture IA ; `multer` mémoire, 5 Mo, un fichier `proof`, posé **après**
  `authenticate` et `requireCoOwnerPortalAccess`, limiteur avant le parseur).
- `src/lib/syndics/declared-payment/portal.ts` (nouveau) : `getCoOwnerDeclaredAvailability(scope)`,
  `createCoOwnerDeclaration(scope, body, file)`, `listCoOwnerDeclarations(scope)`,
  `cancelCoOwnerDeclaration(scope, id)` ; droit SYNDIC vérifié explicitement.
- `src/lib/syndics/coowner-portal.ts` : `pendingDeclaration` par appel ; `onlinePayable` faux si une
  déclaration `PENDING` vise l'appel.
- `src/lib/syndics/online-payment/checkout-start.ts` : 409 `CHARGE_CALL_DECLARATION_PENDING` (R15).
- `src/lib/syndics/queries.ts` : `runReminderBatchForSyndicate` (D7).
- `src/middleware/rate-limit-middleware.ts` : `coOwnerDeclarationCreateLimiter` (10/min par compte).

### N5 — API gestionnaire de validation et notifications (PR2)

- `syndic-declared-payment-routes.ts` + contrôleur : routes 1.6 à 1.11.
- `src/lib/syndics/declared-payment/notifications.ts` (nouveau) : accusé de réception, validation, validation
  corrigée, rejet (copropriétaire) ; nouvelle déclaration (gestionnaires `SYNDIC_EDIT` de l'agence, regroupée
  par heure, D12) ; alerte quotidienne des déclarations en retard.
- Clés de notification : `src/constants/email-notification-keys.ts`, `email-notification-default-templates.ts`,
  `whatsapp-notification-keys.ts`, `whatsapp-notification-default-templates.ts`,
  `notification-key-features.ts` (→ `SYNDIC`) : `SYNDIC_PAYMENT_DECLARATION_RECEIVED`, `…_APPROVED`,
  `…_REJECTED`, `SYNDIC_PAYMENT_DECLARATION_TO_REVIEW` (interne).
- `src/jobs/syndic-declared-payment-job.ts` (nouveau) : toutes les heures, notification regroupée et purge des
  lectures IA expirées ; une fois par jour (8 h, Africa/Abidjan), alerte « en retard ». Enregistré dans
  l'ordonnanceur existant.

### N6 — Écrans (PR2)

Web (`apps/web`), deux territoires disjoints :

- **Portail** : `src/services/coowner-portal-service.ts` (types et fonctions de contracts §2) ;
  `src/pages/CoOwnerPortal/ChargeCalls.tsx` + `ChargeCallsTable.tsx` (bouton « J'ai payé par mobile money »,
  état « Paiement déclaré, en vérification », case de paiement en ligne grisée) ;
  `src/components/coowner-portal/declared-payment/` (nouveau) : `ReceivingNumbersCard.tsx` (numéros,
  copie, consigne), `DeclarationForm.tsx` (lots et parts, appels, numéro, payeur, montant, date et heure,
  référence, capture, commentaire ; contrôle « somme des parts = montant »), `DeclarationsList.tsx` ;
  `src/pages/CoOwnerPortal/Payments.tsx` : section « Mes déclarations ».
- **Gestionnaire** : `src/services/syndic-declared-payment-service.ts` (nouveau) ;
  `src/components/syndics/declared-payment/` (nouveau) : `ReceivingNumbersCard.tsx`,
  `DeclaredSettingsCard.tsx`, `DeclarationsTable.tsx` (pastilles, filtres, tri retard/doublon en tête),
  `DeclarationDrawer.tsx` (détail, aperçu de la capture, alertes, champs IA), `ApproveModal.tsx`
  (correction : montant, date, répartition, appels ; note obligatoire si correction), `RejectModal.tsx`,
  `DeclareForThirdPartyModal.tsx` (P4) ; `src/pages/syndics/SyndicOnlinePayments.tsx` : deux blocs en
  plus ; `src/components/navigation/SyndicWorkspaceLayout.tsx` : onglet renommé « Paiements » (D16), même
  route `/paiements-en-ligne` (aucun lien cassé) ; pastille sur l'appel dans `SyndicCharges.tsx`.

### N7 — Pré-remplissage IA (PR3)

- `src/lib/ai/vision/` (nouveau, déplacement du transport de la spec 041 : `run-vision-call.ts`,
  `gemini-transport.ts`, `openrouter-transport.ts`) ; `lib/stock-whatsapp/vision/*` réimporte depuis là
  (comportement inchangé, tests du stock verts sans retouche).
- `src/lib/syndics/declared-payment/vision/` (nouveau) : `prompt.ts` (consigne : lire un SMS ou un écran de
  confirmation de transfert Orange Money, MTN MoMo, Moov Money ou Wave, renvoyer seulement le JSON),
  `schema.ts` (JSON Schema + Zod strict de contracts §0.1 `PaymentProofReading`), `index.ts`
  (`getPaymentProofVisionProvider()`, `disabled` par défaut), `fake-provider.ts` (déterministe, lit une
  consigne dans le nom de fichier en développement et en test seulement), `gemini-provider.ts`,
  `openrouter-provider.ts`.
- `src/lib/syndics/declared-payment/proof-read.ts` : `readPaymentProof(scope, syndicateId, file)` :
  disponibilité (`aiPrefillEnabled` + fournisseur ≠ `disabled`), limiteurs (5/min, 30/jour par contact),
  **quota de 300 lectures par mois et par agence** (compte de `SyndicPaymentProofRead`, D9), stockage
  temporaire, appel avec délai, validation, contrôles croisés (R28 : numéro destinataire ∈ numéros actifs,
  référence déjà déclarée), journal `SyndicPaymentProofRead`, audit sans valeurs. Ne lève jamais pour une
  panne du fournisseur (R30) : `outcome: 'FAILED'`.
- `src/config/env.ts`, `env.example` : variables `PAYMENT_PROOF_VISION_*`.
- Route portail 2.3 + limiteurs `coOwnerProofReadLimiter` ; `GET .../paiements-declares/reglages` expose
  `aiPrefillAvailable`.
- Web : `DeclarationForm.tsx` (envoi de la capture d'abord, champs marqués « Lu automatiquement,
  vérifiez », suivi des champs retouchés) ; `DeclarationDrawer.tsx` (témoins IA) ; `DeclaredSettingsCard.tsx`
  (interrupteur IA, compteur du mois).

## Lots par territoire de fichiers (découpage de réalisation)

Les sections N1 à N7 ci-dessus décrivent le **contenu** ; la réalisation se distribue par **territoire** :
chaque lot ci-dessous a ses fichiers, qu'aucun autre lot ne touche dans la même PR. Les numéros de tâches
renvoient à [tasks.md](./tasks.md).

| Lot    | Territoire                                     | Fichiers (chemins `API/` = `packages/api/`, `WEB/` = `apps/web/`)                                                                                                                                                                                                                                                                    | Contenu (plan)  | Tâches          | PR  | Dépend de                        |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------------- | --- | -------------------------------- |
| **L1** | Schéma et migrations                           | `API/prisma/schema.prisma`, `API/prisma/migrations/…_syndic_paiement_declare*/`, `API/src/types/audit-types.ts`, `API/src/middleware/error-middleware.ts`, `API/__tests__/unit/schema-tenant-coverage.test.ts`, `docs/architecture/DATA_MODELS.md`                                                                                   | N1              | T001–T009       | 1   | contrats gelés                   |
| **L2** | Moteur API et comptabilité                     | `API/src/lib/syndics/declared-payment/*` (hors `portal.ts`, `vision/`, `proof-read.ts` ; `notifications.ts` en version sans effet), `API/src/lib/syndics/charge-allocation.ts`, `charge-collection-accounting.ts`, `provider-invoice-accounting.ts`                                                                                  | N2              | T010–T024       | 1   | L1                               |
| **L3** | API agence (routes gestionnaire)               | `API/src/routes/syndic-declared-payment-routes.ts`, `API/src/controllers/syndic-declared-payment-controller.ts`, `API/src/app.ts`, `API/__tests__/unit/routes-inventory.test.ts` (PR1)                                                                                                                                               | N3, N5 (routes) | T025–T031, T040 | 1–2 | L2 ; en PR2 les signatures de L5 |
| **L4** | API portail copropriétaire et effets d'attente | `API/src/lib/syndics/declared-payment/portal.ts`, `API/src/controllers/coowner-declared-payment-controller.ts`, `API/src/routes/coowner-portal-routes.ts`, `API/src/lib/syndics/coowner-portal.ts`, `online-payment/checkout-start.ts`, `lib/syndics/queries.ts`, `rate-limit-middleware.ts` (PR2), `routes-inventory.test.ts` (PR2) | N4              | T032–T039       | 2   | L2 ; signatures de L5            |
| **L5** | Notifications et quittances                    | `API/src/lib/syndics/declared-payment/notifications.ts`, constantes `API/src/constants/{email,whatsapp}-notification-*.ts` et `notification-key-features.ts`, `API/src/jobs/syndic-declared-payment-job.ts` et son inscription, gabarits                                                                                             | N5 (envois)     | T041–T044       | 2   | L2                               |
| **L6** | Écran portail copropriétaire                   | `WEB/src/services/coowner-portal-service.ts`, `WEB/src/components/coowner-portal/declared-payment/*`, `WEB/src/pages/CoOwnerPortal/{ChargeCalls,ChargeCallsTable,Payments}.tsx`, tests `WEB/src/__tests__/coowner-portal/…`                                                                                                          | N6 (portail)    | T045–T050       | 2   | contrats §2 (API simulée)        |
| **L7** | Écran agence                                   | `WEB/src/services/syndic-declared-payment-service.ts`, `WEB/src/components/syndics/declared-payment/*`, `WEB/src/pages/syndics/{SyndicOnlinePayments,SyndicCharges}.tsx`, `WEB/src/components/navigation/SyndicWorkspaceLayout.tsx`                                                                                                  | N6 (agence)     | T051–T057       | 2   | contrats §1 (API simulée)        |
| **L8** | Pré-remplissage IA                             | `API/src/lib/ai/vision/*`, `API/src/lib/stock-whatsapp/vision/*` (réexports), `API/src/lib/syndics/declared-payment/{vision/*,proof-read.ts}`, `API/src/config/env.ts`, `API/env.example` ; puis retouches de fichiers de L2, L4, L6 et L7 listées en T063–T065                                                                      | N7              | T059–T066       | 3   | L2, L4, L6, L7 fusionnés         |

**Quittances** : aucun nouveau générateur. La validation (L2, `approveDeclaration`) appelle
`issueReceiptsForPaymentTx` dans la transaction et renvoie les documents ; l'appelant (contrôleur de L3)
déclenche après le commit `scheduleChargeDocumentDelivery` puis `notifyDeclarationApproved` de L5. Ainsi L2
ne dépend pas de L5, et L3 n'a besoin que des **signatures** de L5, fixées ici :

```ts
// API/src/lib/syndics/declared-payment/notifications.ts (L5)
export function notifyDeclarationReceived(
  tenantId: string,
  declarationId: string,
): void; // L4 après création
export function notifyDeclarationApproved(
  tenantId: string,
  declarationId: string,
  documents: IssuedChargeDocument[],
): void; // L3
export function notifyDeclarationRejected(
  tenantId: string,
  declarationId: string,
): void; // L3
// Ne lèvent jamais : un échec d'envoi est journalisé, la décision reste acquise.
```

L2 crée ce fichier en PR1 avec ces trois fonctions **sans effet** (journal seulement) ; L5 en écrit le
corps en PR2 sans changer les signatures. C'est le seul point de rendez-vous entre L3, L4 et L5.

**Fichiers partagés entre lots, jamais dans la même PR** : `rate-limit-middleware.ts` (L3 en PR1, L4 en
PR2, L8 en PR3) ; `routes-inventory.test.ts` (L3 en PR1, L4 puis L3 en PR2 — **séquentiels** : L4 d'abord,
L3 ensuite) ; `coowner-portal-routes.ts` (L4 en PR2, L8 en PR3).

## Ordre et parallélisme

```text
                      ┌──> L3 (routes 1.1–1.5) ──> [PR1]
L1 ──> L2 ────────────┤
                      ├──> L5 ──┐
                      ├──> L4 ──┼──> L3 (routes 1.6–1.11) ──> [PR2] ──> L8 ──> [PR3]
L6, L7 (web) ─────────┴─────────┘     (sur contrats gelés, API simulée)
```

- **PR1** : L1, puis L2 (deux agents : `declaration-*` d'un côté, les trois fichiers comptables de l'autre),
  puis L3 (routes 1.1 à 1.5).
- **PR2** : L4, L5, L6 et L7 en parallèle (territoires disjoints) ; L3 (routes 1.6 à 1.11) après L4 pour
  `routes-inventory.test.ts`.
- **PR3** : L8 seul.
- Fichiers à agent unique : voir le tableau ; `App.tsx` n'est touché par aucun lot (même route
  `/paiements-en-ligne`).

## PR empilées

| PR  | Base | Contenu      | Livre                                                                                                       |
| --- | ---- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| PR1 | main | N1 + N2 + N3 | Modèles, moteur testé (déclaration, validation, rejet), numéros et réglages par API ; **aucun écran**       |
| PR2 | PR1  | N4 + N5 + N6 | Déclaration depuis le portail, file de validation, notifications, relances suspendues, onglet « Paiements » |
| PR3 | PR2  | N7           | Pré-remplissage IA de la capture, quota mensuel, témoins IA côté gestionnaire                               |

Chaque PR : `npm run typecheck`, `npm run lint`, `npm run check:architecture`, tests ciblés,
`npm run test:isolation` (PR1 et PR2), `npm run wiki:export`. Relecture `code-reviewer` + `security-auditor`
sur les trois (portail, fichiers, paiements). La fusion reste à l'utilisateur.

## Tests

- **Moteur (PR1)** : validation → un `ChargePayment` par ligne (`origin = DECLARED`), un crédit de compte par
  lot, écriture 450 / 5521x, reçus ou quittances ; validation × 2 concurrentes → une seule ; rejet → zéro
  écriture ; montant inférieur → paiement partiel ; supérieur → avance ; appel soldé entre-temps → avance ;
  exercice clos → 400 sans date de remplacement ; correction (montant, date, répartition) ; même référence
  sur le même numéro → 409, y compris sur un numéro partagé par deux copropriétés ; référence libérée après
  rejet ; lots d'une autre copropriété ou d'une autre agence → 404 ; somme des lignes ≠ montant → 400 ;
  plafond ; bornes de date ; `schema-tenant-coverage`.
- **Comptabilité (PR1)** : compte 5521x créé dans le plan de la copropriété et non dans celui du cabinet ;
  rang suivant attribué au numéro suivant ; numéro partagé → un compte dans chaque copropriété.
- **Portail (PR2)** : périmètre (lot d'un autre copropriétaire → 404) ; capture refusée si type réel ≠
  image/PDF ou > 5 Mo ; EXIF retiré ; `proofRequired` ; annulation `PENDING` seulement ; `pendingDeclaration`
  et `onlinePayable` ; démarrage d'un paiement en ligne sur un appel déclaré → 409 ; droit SYNDIC refusé → 403.
- **Relances (PR2)** : appel visé par une déclaration de moins de 3 jours ouvrés non relancé ; relancé au-delà ;
  déclaration rejetée ou annulée → relance normale.
- **Gestionnaire (PR2)** : liste, filtres, compteurs, tri ; alertes (chaque cas de R17) ; capture servie par la
  route privée, 404 depuis une autre agence et en statique ; permissions (`SYNDIC_VIEW` lit, `SYNDIC_EDIT`
  valide, D8) ; P4 (déclaration par le gestionnaire).
- **IA (PR3)** : `disabled` → 409 `PROOF_READ_UNAVAILABLE` et formulaire manuel ; faux fournisseur → champs
  proposés ; sortie invalide → champs abandonnés ; panne → `FAILED` sans exception ; quota mensuel atteint
  → 429 `PROOF_READ_QUOTA_EXCEEDED` ; numéro destinataire étranger → alerte ; champs modifiés après lecture
  → `aiEditedFields` ; tests du stock (spec 041) inchangés et verts.
- **Web** : formulaire (somme des parts, champs obligatoires, référence normalisée à l'affichage), liste du
  portail, file gestionnaire, modales de validation et de rejet, témoins IA.
- **Recette navigateur** (hors agents de réalisation, instance de démo) : configurer deux numéros, déclarer
  avec capture, valider avec correction, rejeter, redéclarer, vérifier quittance et comptabilité.

## Définition de fini

- Les 38 exigences de la spec et les critères du §10 ont un test ou une vérification nommée.
- `contracts.md` et le code ne divergent pas.
- Aucune capture accessible en statique ; aucune image ni valeur lue par l'IA dans un journal ou un audit.
- `docs/architecture/DATA_MODELS.md`, `env.example`, i18n, wiki et `HANDOFF.md` à jour.

## Sous-fonctionnalités à ajouter au wiki

Module Syndic :

1. Numéros de réception mobile money d'une copropriété (ajout, modification, désactivation, numéro partagé).
2. Réglages du paiement déclaré (activation, délai d'alerte, capture obligatoire, consigne, IA).
3. Déclaration d'un paiement mobile money depuis le portail copropriétaire (plusieurs lots, capture).
4. Suivi et annulation de ses déclarations par le copropriétaire.
5. File de validation des paiements déclarés (filtres, alertes, retard, doublons).
6. Validation, validation avec correction et rejet motivé d'une déclaration.
7. Déclaration saisie par le gestionnaire pour le compte d'un copropriétaire.
8. Pré-remplissage par IA de la capture de paiement (PR3).
9. Relances automatiques suspendues pendant la vérification d'une déclaration.
10. Onglet « Paiements » de la copropriété (ex-« Paiements en ligne »).

## Risques

| Risque                                                                   | Parade                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Hypothèse H1 contredite par le comptable (Q9)                            | Numérotation isolée dans `ensureSyndicReceivingAccountTx` : un changement de schéma ne touche qu'une fonction |
| Interblocage entre lignes d'une même déclaration (plusieurs `lockLotTx`) | Lignes traitées dans l'ordre croissant de `lotId` ; aucun autre chemin ne verrouille deux lots                |
| Déplacement du transport de vision casse l'inventaire WhatsApp           | Réexports depuis l'ancien emplacement ; suite de tests 041 lancée telle quelle dans PR3                       |
| Coût de l'IA                                                             | `disabled` par défaut, activation par agence, quota mensuel, limiteurs par contact                            |
| File qui s'accumule et copropriétaire relancé à tort                     | Suspension D7 bornée à 3 jours ouvrés, alerte quotidienne au gestionnaire                                     |
| Index unique partiel ignoré par `prisma migrate dev` (dérive de schéma)  | Migration SQL écrite à la main et documentée ; test d'intégration qui vérifie le 409 sur concurrence          |
| Renommage de l'onglet perd les traductions                               | Reporter en/ar de « Paiements en ligne » sur « Paiements » après `i18n:extract` (piège AGENTS.md)             |
