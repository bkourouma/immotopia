# Plan — clôture d'exercice du module Syndic

**Spécification** : [spec.md](./spec.md) · **Modèle** : [data-model.md](./data-model.md) ·
**API** : [contracts/openapi.yaml](./contracts/openapi.yaml) · **Tâches** : [tasks.md](./tasks.md)
**Date** : 2026-09-29 · **Base** : `main` `6c454886` · **Statut** : proposition, aucun code écrit

## 1. Résumé

La clôture d'un exercice devient une fonction du produit : un **exercice**
modélisé (`SyndicFiscalYear`), un **garde unique** qui refuse toute pièce datée
dans un exercice clos, des **contrôles** et un **aperçu** sans effet de bord,
une **clôture atomique** qui génère les OD, fige les soldes de lots et de
fonds, ouvre N+1 et son écriture d'ouverture, un **dossier de comptes** PDF,
le lien avec l'**AGO** (soumission, constat d'approbation) et la
**régularisation des charges** après le vote.

Rien n'existe encore : le plan suit les motifs déjà en place —
`lib/syndics/provider-invoices.ts` (S6) pour la comptabilité de copropriété,
`lib/finance/site-closing.ts` pour les bloqueurs de clôture,
`lib/syndics/charge-receipts.ts` pour les originaux figés et
`lib/syndics/charge-allocation.ts` pour les verrous de lot.

## 2. Contexte technique

| Élément            | Choix                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack              | TypeScript 5, Express 4, Prisma 5, PostgreSQL ; React 18, Ant Design, Vite (monorepo npm workspaces).                                                                                                                                                                                                  |
| Tests              | Jest côté API (`packages/api/__tests__/{unit,api,integration}`), Vitest côté web ; `npm run test:isolation` (base `DATABASE_URL_TEST`).                                                                                                                                                                |
| Contraintes AGENTS | `tenantId` sur tout modèle et vérification de chaque identifiant reçu (`assertBelongsToTenant`) ; erreurs typées de `middleware/error-middleware` ; jamais de `include: { user: true }` ; `t()` avec le texte français comme clé ; propriétés CSS logiques ; aucune variable d'environnement nouvelle. |
| PDF                | `pdf-lib` et `resolveDocumentBranding` (`lib/documents/document-branding.ts`), comme les quittances et avis d'appel.                                                                                                                                                                                   |
| Stockage privé     | Identifiant de stockage jamais renvoyé ; fichier lu par une route authentifiée (modèle : `lib/syndics/provider-invoice-files.ts`, `charge-receipt-delivery.ts`).                                                                                                                                       |
| Erreurs            | `AppError` porte déjà `code` et `data` : sous-classes `FiscalYearClosedError`, `ClosingBlockedError`, etc., statut 409 ou 422.                                                                                                                                                                         |
| Dates              | Jours UTC (`utcDay`, `lib/syndics/period.ts`), comme le reste du module.                                                                                                                                                                                                                               |

## 3. Contrôle de conformité au dépôt (AGENTS.md)

| Règle                       | Application                                                                                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant      | Chaque route : `authenticate`, `requireTenantAccess`, `enforcePropertyTenantIsolation`, garde de permission. Tout id du corps ou de l'URL est contrôlé contre l'agence **et** la copropriété. Les 8 modèles portent `tenantId` (`schema-tenant-coverage`). |
| Routes                      | Gardes posées **route par route**, pas en `router.use` (leçon des routeurs S6 et finance : monté sur `/api`, un `use` traverserait toute requête). Test `routes-inventory`.                                                                                |
| Erreurs                     | Services lèvent des erreurs typées ; contrôleurs en `asyncHandler` ; aucun `try/catch` qui devine le statut.                                                                                                                                               |
| Fichiers privés             | Dossier de comptes stocké en privé ; jamais servi en statique ; test `portal-no-disk-paths` étendu.                                                                                                                                                        |
| Textes                      | Tout libellé par `t()` ; `npm run i18n:extract` (API et web) ; arabe et anglais complets ; marges logiques.                                                                                                                                                |
| Wiki                        | Mis à jour par lot (`npm run wiki:export`, `wiki:check` en CI) : voir §9.                                                                                                                                                                                  |
| Migrations                  | Additives, testées sur une copie de la base de démonstration avant tout autre environnement.                                                                                                                                                               |
| `queries.ts` (5 029 lignes) | Code nouveau dans `fiscal-year-*.ts` ; les fonctions existantes ne reçoivent qu'un appel de garde d'une ligne.                                                                                                                                             |

## 4. Architecture

### 4.1 Permissions par route

Middleware `syndic-fiscal-year-rbac-middleware.ts` (modèle :
`finance-rbac-middleware.ts`) : `requireFiscalYearView`, `requireFiscalYearPrepare`,
`requireFiscalYearClose`, `requireFiscalYearReopen`, chacune un
`requirePermission('SYNDIC_FISCAL_YEAR_…')`. Le super-administrateur est refusé
sur les routes d'écriture (il ne clôture pas les exercices d'une agence).
Seed `syndic-fiscal-year-permissions-seed.ts` (modèle :
`finance-permissions-seed.ts`), appelé avant la boucle générique de
`rbac-seed.ts` : `TENANT_ADMIN` reçoit les quatre, `TENANT_MANAGER` et
`TENANT_ACCOUNTANT` reçoivent `VIEW` et `PREPARE`.

| Droit     | Routes                                                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIEW`    | `GET exercices`, `GET exercices/:year`, `controles`, `dossier`, `regularisation/apercu`, `releves-bancaires` (lecture), `parametres-cloture` (lecture)                                                            |
| `PREPARE` | `POST exercices`, `PATCH exercices/:year`, `apercu-cloture`, `releves-bancaires` (écriture), `PUT parametres-cloture`, `plan-minimal`, `dossier/publication`, `soumission-ag`, `budget-suivant`, `reprise-soldes` |
| `CLOSE`   | `cloture`, `constat-approbation`, `POST regularisation`                                                                                                                                                           |
| `REOPEN`  | `reouverture`                                                                                                                                                                                                     |

Les routes existantes (`balance`, `grand-livre`) gardent `PROPERTIES_VIEW`.
Le portail réutilise `requireCoOwnerPortalAccess` et `resolveCoOwnerScope`.

### 4.2 Le garde de verrou (`fiscal-year-guard.ts`)

```text
assertFiscalYearOpenTx(tx, tenantId, syndicateId, date):
  year = date.getUTCFullYear()
  ensureFiscalYearTx(tx, tenantId, syndicateId, year)      # lecture d'abord ; INSERT ... ON CONFLICT DO NOTHING si absente
  row  = SELECT status FROM syndic_fiscal_years WHERE ... FOR SHARE
  if row.status = CLOSED                                   -> FiscalYearClosedError (409)

assertBudgetYearOpenTx(tx, syndicateId, date):             # regle ACTUELLE, inchangee (FR-007)
  if a budget of `year` is CLOSED                          -> ConflictError « Exercice clos : ... »
  # appelee seulement par les factures et paiements de prestataires
```

- Le corps actuel de `assertFiscalYearOpenTx` (`provider-invoice-accounting.ts`)
  devient `assertBudgetYearOpenTx`, **sans changement de comportement**, et
  les quatre appels de `provider-invoices.ts` appellent en plus le garde
  généralisé ; pour les annulations, ce garde reçoit la date **propre** de la
  pièce (FR-044) et le contrôle du budget garde la date du jour, comme
  aujourd'hui.
- **Ordre global des verrous** : ligne d'exercice (partagé ou exclusif) → verrou
  consultatif de lot (`lockLotTx`, identifiants croissants) → fonds (`lockFundsTx`,
  identifiants croissants). Chaque opération gardée pose son garde **en premier**
  dans la transaction. Le commentaire d'en-tête de `fund-credits.ts` (lots
  avant fonds) reste vrai et s'étend en amont.
- `FOR SHARE` sur une ligne qui existe : contention négligeable entre
  écritures ; la clôture prend `FOR UPDATE` et attend les écritures en cours.

### 4.3 L'aperçu (`fiscal-year-preview.ts`)

Fonction **pure sur des lectures** (aucune écriture) qui renvoie contrôles,
écritures proposées, instantanés, rapprochement de trésorerie, résumé et
empreinte. Elle est la seule source de calcul : la clôture l'appelle telle
quelle dans sa transaction.

- **Agrégations SQL par lot** (`fiscal-year-figures.ts`) : appelé par période,
  encaissé (`kind = CASH`), pénalités, remises, ajustements ; mouvements de
  fonds par `occurredAt` ; dépenses par facture (fonds, compte, poste de budget).
  Pas de chargement d'objets par lot (cible FR-104).
- **Solde de lot à la date d'arrêté** : chaîne du compte
  (`chronologicalBalanceStrictlyBefore`) sur les transactions **existantes**
  plus, **en mémoire**, celles que le rapprochement
  (`reconcileOwnerAccountLedgerForLot`) créerait. La clôture fait ensuite le
  rapprochement réel ; comme l'aperçu l'a déjà simulé, l'empreinte ne change
  pas (test dédié, CA-09).
- **Résultat par fonds** (`fiscal-year-result.ts`, calcul pur) : produits par
  fonds = appels × parts de fonds ; charges par fonds = factures TTC non
  annulées par fonds de facture (repli : fonds des paiements) ; reliquat =
  « non affecté ». Les parts de fonds d'un appel sont celles de
  `fundSharesForCallTx` (`fund-credits.ts`, déjà exporté, **un appel à la
  fois**) : le calcul en lot (une requête par budget, pas une par appel) est
  à écrire pour tenir FR-104, avec un test d'égalité entre les deux
  implémentations sur le jeu de référence.
- **Constructeurs d'écritures** (`fiscal-year-entries.ts`, purs) : `APP`, `TRV`,
  `PEN`, `AJU`, `ENC`, `AFF`, `OUV`, `REG` ; chacun rend des lignes équilibrées ;
  `AFF` se calcule sur la balance **après** `APP` à `ENC` et les écritures
  S6 ; `OUV` sur la balance **après** `AFF`.
- **Empreinte** : SHA-256 d'un JSON canonique (clés triées, montants en
  centimes entiers) des écritures, des instantanés et de la liste des codes de
  contrôle bloquants et avertissements.

### 4.4 La clôture atomique (`fiscal-year-close.ts`)

```text
closeFiscalYear(actor, tenantId, syndicateId, year, body):
  assert SYNDIC_FISCAL_YEAR_CLOSE, copropriete de l'agence
  tx (timeout 60 s):
    pg_advisory_xact_lock(hashtext('syndic-fiscal-year:' || syndicateId))
    ensure fiscal year ; SELECT ... FOR UPDATE
    refuse si CLOSED (FISCAL_YEAR_ALREADY_CLOSED)
    lots d'activite, tries par id : lockLotTx puis reconcileOwnerAccountLedgerForLotTx
    preview = computePreview(tx, ...)                      # meme fonction que GET apercu
    if preview.hash != body.previewHash                    -> PREVIEW_STALE   (rien n'est ecrit)
    if preview a un bloquant                               -> CLOSING_BLOCKED
    if des avertissements ne sont pas reconnus             -> WARNINGS_NOT_ACKNOWLEDGED
    ensure journaux OD N et N+1 ; poster APP, TRV, PEN, AJU, ENC ; poster AFF ; poster OUV
    UPDATE journal_entries SET is_locked, locked_by_closing_id  (bulk, exercice)
    budgets de N -> CLOSED (statuts precedents memorises)
    echeanciers ACTIVE d'appels soldes -> COMPLETED (ids memorises)
    INSERT closing v(n+1), lot_balances, fund_balances, summary fige
    ensure exercice N+1 (OPEN) ; exercice N -> CLOSED, closedAt, closedById
  apres commit : logAuditEvent ; generer le dossier PDF (echec journalise, rejouable)
```

- Le dossier est **paresseux et rejouable** : `GET …/dossier` le reconstruit
  depuis `summary` s'il manque (comme les quittances S3), et stocke le
  résultat.
- Une seule requête de mise à jour groupée verrouille les écritures ; pas de
  boucle par écriture.
- Délai de la transaction : les 300 lots du jeu de charge doivent tenir dans
  15 s ; sinon, découper (rapprochement des lots avant la transaction, sous
  verrous courts, puis recomptage de l'empreinte dans la transaction).

### 4.5 Réouverture (`fiscal-year-reopen.ts`)

Une transaction : verrou exclusif d'exercice ; conditions FR-050 ; pour chaque
écriture `closing_id` de la version active, `reverseSyndicEntryTx` (écritures de
sens inverse datées de la date d'origine de l'écriture contre-passée : pour
`OUV-(N+1)`, la date de N+1) ; `UPDATE` des écritures `locked_by_closing_id` de
cette version ; budgets et échéanciers restaurés depuis la version ; exercice
`OPEN` ; approbation à `NOT_SUBMITTED` ; version marquée `reopenedAt`,
`reopenedById`, `reopenReason` ; audit.

### 4.6 Régularisation (`fiscal-year-regularisation*.ts`)

- **Plan pur** (`…-plan.ts`) : entrées = postes des budgets appelés en
  campagnes `REGULAR`, factures rattachées, clés de répartition, répartition
  du budget par lot, montant appelé par lot ; sortie = lignes
  `{ lotId, provisions, share, delta }` et totaux. Réutilise `distributeLineAmount`
  (à exporter) pour les poids et l'arrondi (le dernier lot absorbe le reliquat).
- **Application** : une transaction ; lots triés par identifiant croissant
  (`sortLotIdsForLocking`) ; pour un excédent : `ChargePayment` de nature
  `REGULARISATION` (`unallocatedAmount = delta`), crédit du compte de lot de
  type `PAYMENT` avec `sourceId` = ce paiement (sinon le rapprochement du
  grand livre le recréerait), libellé « Régularisation charges N », puis
  `applyLotAdvanceTx` et l'émission des quittances des appels soldés (mêmes
  fonctions que `recordLotPayment`) ; pour un déficit :
  campagne `EXCEPTIONAL` et appels via `createChargeCallBatchWithCallsTx` ;
  écriture `REG` ; enregistrement `SyndicRegularisation` (unicité par exercice).
- **Le crédit de fonds se saute au bon endroit.** `applyLotAdvanceTx` impute
  les avances **dans l'ordre d'ancienneté, toutes natures mêlées**, et ce à
  chaque création d'appels (émission du T1, programmation, campagne) : le
  filtre « pas de crédit de fonds pour un paiement `REGULARISATION` » va donc
  **dans `creditFundsForAllocationsTx`** (une requête sur la nature des
  paiements des éléments), pas seulement dans le chemin de la régularisation.
- **Consommateurs de `ChargePayment` à adapter** (5 fichiers, R-02) :
  `charge-allocation.ts` (création, reçus, avance), `charge-receipts.ts`
  (pas de `RECEIPT` pour `REGULARISATION`), `fund-credits.ts` (pas de crédit),
  `charge-monthly-tracking.ts`, `coowner-portal-finance.ts` (« Mes paiements » :
  libellé « Régularisation », exclu des encaissements), et
  `getFinanceSummaryBySyndicate` (nouveau total `totalCashReceived`, `totalPaid`
  inchangé).

### 4.7 AG et approbation (`fiscal-year-approval.ts`)

- `soumission-ag` : dans une transaction, crée l'AG `ORDINARY` (ou relie une AG
  non `COMPLETED` ni `CANCELLED` de la copropriété), ajoute quatre résolutions
  typées avec la majorité par défaut, renseigne `accountsMeetingId` et
  `accountsResolutionId`, passe à `SUBMITTED`. Réutilise `createMeetingWithResolutions`
  et `addResolutionToMeeting`. Quand elle crée l'AG, elle appelle ensuite
  `notifyMeetingConvocation` comme `createMeetingHandler` (la convocation
  part dans le contrôleur aujourd'hui, pas dans le service) : hors
  transaction, échec journalisé.
- `constat-approbation` : recalcule le résultat de la résolution avec
  `computeResolutionTally` sur les votes et les lots, jamais depuis
  `GMResolution.result` seul ; exige `meeting.status = COMPLETED`.
- `GMResolution.resolutionKind` : ajouté aux schémas Zod de création et de
  modification des résolutions, sans effet sur l'existant.

## 5. Structure du code

```text
packages/api/
├── prisma/
│   ├── schema.prisma                                  # +5 enums, +8 modèles, +7 colonnes (data-model.md)
│   ├── migrations/<horodatage>_syndic_cloture_<lot>/      # additive, une par lot ; rollback.sql joint à la PR
│   └── seeds/syndic-fiscal-year-permissions-seed.ts
├── src/
│   ├── lib/syndics/
│   │   ├── fiscal-year.ts                  # ensure, lecture, dates
│   │   ├── fiscal-year-guard.ts            # garde unique et erreurs typées
│   │   ├── fiscal-year-settings.ts         # paramétrage, plan minimal, journaux OD
│   │   ├── fiscal-year-figures.ts          # agrégations SQL par exercice
│   │   ├── fiscal-year-checks.ts           # catalogue CLO-*
│   │   ├── fiscal-year-result.ts           # résultat par fonds (pur)
│   │   ├── fiscal-year-entries.ts          # constructeurs d'écritures (purs)
│   │   ├── fiscal-year-preview.ts          # aperçu et empreinte
│   │   ├── fiscal-year-close.ts            # clôture atomique et instantanés
│   │   ├── fiscal-year-reopen.ts
│   │   ├── fiscal-year-approval.ts         # soumission à l'AG, constat
│   │   ├── fiscal-year-regularisation.ts
│   │   ├── fiscal-year-regularisation-plan.ts   # calcul pur
│   │   ├── fiscal-year-dossier-pdf.ts      # PDF (pdf-lib)
│   │   ├── fiscal-year-dossier-files.ts    # stockage privé
│   │   ├── fiscal-year-portal.ts           # lecture portail
│   │   └── fiscal-year-schemas.ts          # Zod .strict()
│   ├── controllers/syndic-fiscal-year-controller.ts
│   ├── routes/syndic-fiscal-year-routes.ts            # monté dans src/index.ts
│   ├── middleware/syndic-fiscal-year-rbac-middleware.ts
│   └── types/audit-types.ts                            # + actions d'audit
└── __tests__/
    ├── unit/syndic-fiscal-year.{guard,entries,result,checks,preview-hash,regularisation-plan}.test.ts
    ├── api/syndic-fiscal-year.routes.test.ts
    └── integration/syndic-fiscal-year.{close-flow,concurrency,reopen,regularisation}.test.ts

apps/web/src/
├── pages/syndics/SyndicFiscalYears.tsx                 # liste des exercices et assistant
├── pages/CoOwnerPortal/FiscalYears.tsx                 # exercices publiés
├── components/syndics/fiscal-year/                     # ClosingChecksPanel, ClosingPreviewPanel,
│                                                       # ClosingSettingsForm, TreasuryPanel, BankChecksTable,
│                                                       # ApprovalPanel, RegularisationPanel, FiscalYearBanner
├── services/syndic-fiscal-year-service.ts
├── types/syndic-fiscal-year-types.ts
└── __tests__/syndics/FiscalYears*.test.tsx
```

Écrans existants touchés : `SyndicWorkspaceLayout.tsx` (onglet « Exercices » dans
la famille Finances), `App.tsx` (route `/tenant/:tenantId/syndics/:syndicId/exercices`,
`React.lazy`), `SyndicAccounting.tsx` (sélecteur d'exercice, bandeau « Exercice
clos »), `SyndicBudgets.tsx` (statut d'exercice), `SyndicOwnerAccount.tsx` (ligne
« Solde reporté »), `SyndicMeetingDetail.tsx` (badge « Approbation des comptes
N »), `FundMovementsDrawer.tsx` (filtre par exercice), portail : fiche
copropriété.

## 6. Changements dans le code existant

| Fichier                                                                                                         | Changement                                                                                                                                                                                                                                                                                   | Lot    | Risque                          |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------- |
| `provider-invoice-accounting.ts`                                                                                | `assertFiscalYearOpenTx` devient `assertBudgetYearOpenTx` (comportement inchangé) et un garde généralisé est ajouté à côté ; `postSyndicEntryTx` et `reverseSyndicEntryTx` acceptent `sourceType = MANUAL` et un `closingId` (aujourd'hui typés sur `PROVIDER_INVOICE` / `PROVIDER_PAYMENT`) | C0, C2 | faible                          |
| `provider-invoices.ts`                                                                                          | annulations : date propre de la pièce ; écriture de `occurredAt` sur les mouvements de fonds                                                                                                                                                                                                 | C0     | moyen (comportement, FR-044)    |
| `queries.ts` (rapprochement)                                                                                    | extraire `reconcileOwnerAccountLedgerForLotTx(tx, …)` : la fonction actuelle ouvre sa **propre** transaction (`prisma.$transaction`) et ne peut pas être appelée dans celle de la clôture ; refactoring sans changement de comportement                                                      | C2     | faible                          |
| `queries.ts`                                                                                                    | garde dans `createJournalEntryBySyndicate` (+ FR-005), `createOwnerAccountAdjustmentByLot`, `createLatePaymentPenaltyForChargeCall`, `createChargeCallAndUpdateStatus`, `createChargeCallBatchWithCallsTx`, `createBudgetBySyndicate` ; balance et grand livre par `exercice`                | C0     | moyen (fichier de 5 029 lignes) |
| `charge-allocation.ts`                                                                                          | garde sur `paidAt` (`recordLotPaymentTx`) ; nature `kind`                                                                                                                                                                                                                                    | C0, C5 | moyen                           |
| `charge-schedule-runner.ts`                                                                                     | garde sur `periodStart` avant émission                                                                                                                                                                                                                                                       | C0     | faible                          |
| `fund-credits.ts`                                                                                               | `occurredAt` explicite dans `recordFundMovementTx` ; pas de crédit pour `REGULARISATION` (`fundSharesForCallTx` est déjà exporté)                                                                                                                                                            | C0, C5 | moyen (verrous)                 |
| `charge-receipts.ts`, `coowner-portal-finance.ts`, `charge-monthly-tracking.ts`, `getFinanceSummaryBySyndicate` | nature `REGULARISATION` (§4.6)                                                                                                                                                                                                                                                               | C5     | moyen (R-02)                    |
| `owner-account-statement.ts`, `coowner-portal-statement.ts`                                                     | ligne « Solde reporté au 01/01/N+1 »                                                                                                                                                                                                                                                         | C3     | faible                          |
| Résolutions et `updateBudgetBySyndicate`                                                                        | `resolutionKind` ; refus d'une résolution `REJECTED` comme approbation de budget (FR-066)                                                                                                                                                                                                    | C4     | faible                          |
| `src/index.ts`, `rbac-seed.ts`, `audit-types.ts`                                                                | montage du routeur, seed des droits, actions d'audit                                                                                                                                                                                                                                         | C0     | faible                          |

## 7. Lots livrables

Une PR par lot. Vérifications communes à chaque lot : `npm run typecheck` (aucune
erreur nouvelle dans un fichier propre), `npm run lint`, `npm run
check:architecture`, tests ciblés puis `npm test`, `npm run test:web`,
`npm run test:isolation` dès qu'une donnée d'agence est touchée, `npm run
i18n:extract`, `npm run wiki:export`, `code-reviewer`. `security-auditor`
obligatoire pour C0 (verrou et permissions), C3 (fichiers et portail) et C5
(comptes de lots).

### C0 — Socle : exercice, garde, paramétrage (taille M)

- **Contenu** : migration (tables `SyndicFiscalYear`, `SyndicClosingSettings`,
  colonnes `occurred_at`, `equity_account_id`, `income_account_id`, seed des
  droits) ; `ensureFiscalYearTx`, `assertFiscalYearOpenTx` généralisé et posé
  sur les opérations de FR-040 ; reprise de `occurred_at` ; `balance` et
  `grand-livre` par `exercice` ; FR-005 ; paramétrage et plan minimal ; écran
  « Exercices » **en lecture** (liste, statut, dates) et écran de paramétrage
  comptable ; routes `GET/POST exercices`, `GET exercices/:year`,
  `parametres-cloture`, `plan-minimal`.
- **Tests** : garde (unitaire), refus datés sur chacune des huit opérations
  (API), balance par exercice, migration sur copie, isolation.
- **Sortie** : CA-01, 11, 13, 31, 32, 34, 44 (création de budget), 47 ; CA-39, 40.
- **Ne livre pas** : aucune clôture. Le verrou existe mais aucun exercice n'est
  clos tant que C2 n'est pas livré ; la règle du budget `CLOSED` continue de
  fonctionner à l'identique. Livrable seul.

### C1 — Contrôles et aperçu (taille M)

- **Contenu** : `fiscal-year-figures.ts`, `-checks.ts`, `-result.ts`, `-entries.ts`,
  `-preview.ts` ; solde de relevé bancaire (`SyndicBankCheck`) ; routes `controles`,
  `apercu-cloture`, `releves-bancaires` ; écrans « Contrôles », « Trésorerie » et
  « Aperçu » de l'assistant (lecture seule).
- **Tests** : constructeurs d'écritures sur le jeu de référence (unitaire),
  catalogue de contrôles, empreinte stable, aperçu ≤ 5 s sur le jeu de charge.
- **Sortie** : CA-02, 03, 04 (aperçu), 05, 30 (aperçu), 41, 42, 43.
- **Livrable seul** : le syndic voit ce que donnerait la clôture.

### C2 — Clôture, ouverture N+1, réouverture (taille L)

- **Contenu** : `fiscal-year-close.ts`, `-reopen.ts`, instantanés ; création de
  N+1 et de l'écriture d'ouverture ; verrouillage en bloc ; budgets et
  échéanciers ; audit ; routes `cloture`, `reouverture` ; étape « Confirmer » de
  l'assistant ; `SyndicateBudget`/écritures affichent l'état d'exercice.
- **Tests** : intégration complète sur le jeu de référence (CA-04, 06 à 10, 12, 14,
  15, 33), concurrence à deux connexions (CA-29), charge (CA-30), non-régression
  de la suite Syndic.
- **Sortie** : CA-04 à 15, 29, 30, 33, 37, 44 ; CA-40.
- **Point d'attention** : lot le plus large en surface transactionnelle. Prévoir
  une revue dédiée de l'ordre des verrous.

### C3 — Dossier de comptes et portail (taille M)

- **Contenu** : PDF, stockage privé, publication, route de téléchargement,
  reconstruction paresseuse, export tableur _(optionnel)_ ; portail : liste
  des exercices publiés, dossier, ligne « Solde reporté » ; test
  `portal-no-disk-paths` étendu.
- **Sortie** : CA-25, 26 (sauf le résultat de l'approbation, ajouté par C4).

### C4 — AG et approbation (taille M)

- **Contenu** : `resolutionKind`, `soumission-ag`, `constat-approbation`, visa et
  date limite indicative, FR-066, badge sur l'AG, affichage du résultat au
  portail.
- **Tests** : CA-16, 17, 18 ; résultats du scénario N.9 rejoués (résolution 1,
  900 contre 100).
- **Sortie** : CA-16 à 18, 46, complète CA-26.

### C5 — Régularisation (taille L, dernier)

- **Contenu** : `ChargePayment.kind`, plan pur, aperçu, application, écriture
  `REG`, appels de régularisation ; adaptation des cinq consommateurs (§4.6) ;
  écran « Régularisation ».
- **Tests** : plan pur (jeu de référence et jeu à déficit), atomicité (échec au
  5ᵉ lot), reçus et fonds non touchés, totaux d'encaissements, imputation sur le
  T1 2027.
- **Sortie** : CA-19 à 24, 45 ; CA-40 avec les tests des cinq consommateurs adaptés.

### C6 — Compléments (taille S à M, indépendants)

Reprise du premier exercice (FR-008, CA-35), budget N+1 préparé (FR-037,
CA-36), écran « Comptes bancaires » (Q11), alerte de fin d'exercice.
Chacun peut être écarté sans conséquence pour les autres lots.

**Chemin critique** : C0 → C1 → C2 → C4 → C5 ; C3 en parallèle de C4 ; C6 après C2.

## 8. Vérifications et recette

- **Fixture d'intégration** : le jeu de référence (spec §9) construit par une
  fonction de test qui rejoue les opérations de la partie E à L du scénario
  avec des dates explicites ; réutilisée par C1, C2, C4 et C5.
- **Recette navigateur** : après chaque lot visible, sur la démo isolée
  (`npm run demo:sync -- <ref> --migrate`, ports 8800 et 3300). La partie N du
  scénario est **réécrite** pour jouer les écrans : N.6 (écritures), N.7, N.8
  (constats remplacés par vérifications), N.10 (régularisation), N.11
  (ouverture). Règles absolues du scénario inchangées (pas de SMS, pas de
  paiement en ligne).
- **Migration** : `prisma migrate deploy` sur une copie de la base de démo, suite
  Syndic verte, puis exécution de `rollback.sql` sur une seconde copie
  (avant toute clôture) pour prouver le retour arrière.
- **Charge** : script `packages/api/scripts/syndic-fiscal-year-load-test.ts` (300 lots,
  4 000 appels, 5 000 paiements, 500 écritures) ; mesure de l'aperçu, de la
  clôture et des contrôles.

## 9. Inventaire des fonctionnalités à ajouter (wiki)

Par lot, feuille `Sous-fonctionnalites`, modules `SYNDIC` :

- **C0** : liste des exercices ; détail d'un exercice ; paramétrage comptable de
  la clôture ; création du plan comptable minimal ; balance et grand livre par
  exercice _(modifiée)_ ; refus des écritures dans un exercice clos _(modifiée :
  écritures, factures, paiements, appels, ajustements)_.
- **C1** : contrôles avant clôture ; aperçu de la clôture ; solde de relevé
  bancaire (saisie, suppression).
- **C2** : clôturer un exercice ; rouvrir un exercice ; annulation de facture et
  de paiement de prestataire _(modifiée : exercice clos)_.
- **C3** : télécharger le dossier de comptes ; publier le dossier ; portail :
  exercices publiés, dossier ; relevé de lot avec solde reporté _(modifiée)_.
- **C4** : soumettre les comptes à l'AG ; constater l'approbation ; visa et date
  limite ; type de résolution _(modifiée)_ ; approbation d'un budget par une
  résolution _(modifiée)_.
- **C5** : aperçu de la régularisation ; appliquer la régularisation ; crédit de
  régularisation dans les paiements du portail _(modifiée)_.
- **Permissions** : `SYNDIC_FISCAL_YEAR_VIEW`, `_PREPARE`, `_CLOSE`, `_REOPEN`.

## 10. Décisions d'architecture à consigner

- **ADR-005 « Exercice de copropriété et verrou d'écriture »** (à écrire au
  démarrage de C0, modèle `ADR-000-template.md`) : une ligne d'exercice par
  année, `FOR SHARE` / `FOR UPDATE`, ordre global des verrous, dates métier
  contre dates de saisie (`occurred_at`), compatibilité avec le mode budget
  `CLOSED`.
- Mise à jour de `docs/governance/SECURITY.md` (verrou d'exercice, dossier privé,
  portail) et de `docs/architecture/DATA_MODELS.md` à la livraison de C0.
