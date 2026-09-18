# Tasks: Gestion financiere operationnelle - Volet clients (lot 1)

**Input**: Design documents from `/specs/016-finance-operationnelle/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml

**Tests**: Inclure les tests est requis pour cette feature (mouvements financiers, idempotence de la campagne, isolation multi-tenant).

**Organization**: Taches groupees par phase puis par user story, pour une implementation et une validation independantes de chaque recit.

## Format: `[ID] [P?] [Story] Description`

- `[P]`: peut etre execute en parallele (fichiers differents, dependances levees)
- `[Story]`: US1..US6 selon `spec.md`

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Ajouter les enums `ThirdPartyKind`, `ThirdPartyMovementType`, `RentBillingRunStatus` dans `packages/api/prisma/schema.prisma`
- [ ] T002 Ajouter les modeles `ThirdPartyAccount`, `ThirdPartyMovement`, `RentBillingRun` et leurs relations inverses (`Tenant`, `TenantClient`, `RentalLease`, `User`) dans `packages/api/prisma/schema.prisma`
- [ ] T003 Generer la migration `add_finance_third_party_accounts` dans `packages/api/prisma/migrations/` (additive uniquement, testee sur une copie de la base de demonstration)
- [ ] T004 Regenerer le client Prisma (`npx prisma generate` depuis `packages/api`)

**Checkpoint**: le schema compile, la migration s'applique sur une base vide et sur une copie de la base de demonstration, sans toucher a une table existante.

---

## Phase 2: Foundational (Blocking)

**But**: la couche partagee dont chaque user story a besoin pour produire le moindre resultat visible. Aucune user story n'est demontrable avant la fin de cette phase.

- [ ] T005 Implementer `getOrCreateTenantAccountTx(tx, tenantId, tenantClientId)` dans `packages/api/src/lib/finance/ledger.ts` (cree le compte `TENANT` au premier mouvement, copie `label` depuis `TenantClient`)
- [ ] T006 Implementer `appendMovementTx(tx, params)` dans `packages/api/src/lib/finance/ledger.ts` (calcule `balanceAfter` a partir du dernier mouvement du compte, respecte l'unicite `(sourceType, sourceId, type)`, met a jour `ThirdPartyAccount.balance`)
- [ ] T007 [P] Implementer `rebuildThirdPartyAccount(accountId)` dans `packages/api/src/lib/finance/ledger.ts` (rejoue l'historique des pieces sources, idempotent, utilise par le retro-remplissage et par la reconciliation)
- [ ] T008 [P] Ajouter les schemas Zod communs (bornes de dates, pagination, periode `periodYear`/`periodMonth`) dans `packages/api/src/lib/finance/schemas.ts`
- [ ] T009 [P] Ajouter les cas d'erreur finance (`FinanceAccountNotFoundError`, `BillingRunAlreadyRunningError`, ...) dans `packages/api/src/lib/errors.ts`
- [ ] T010 Brancher l'appel au grand livre dans `packages/api/src/services/rental-installment-service.ts` : une echeance qui passe au statut `DUE` (ou equivalent de facturation) declenche un mouvement `INSTALLMENT` (debit), dans la transaction Prisma existante du service
- [ ] T011 Brancher l'appel au grand livre dans `packages/api/src/services/rental-payment-service.ts` : chaque `RentalPaymentAllocation` creee par `allocatePayment` pour un paiement `SUCCEEDED` declenche un mouvement `PAYMENT` (credit) du montant alloue, dans la meme transaction
- [ ] T012 Brancher l'appel au grand livre dans `packages/api/src/services/rental-penalty-service.ts` : une penalite appliquee declenche un mouvement `PENALTY` (debit)
- [ ] T013 Brancher l'appel au grand livre dans `packages/api/src/services/rental-payment-declaration-service.ts` : l'annulation d'une echeance ou d'un paiement deja repercute declenche un mouvement `VOID` inverse, jamais une modification du mouvement d'origine
- [ ] T014 Ecrire le script `packages/api/scripts/finance-backfill-tenant-accounts.ts` : appelle `rebuildThirdPartyAccount` pour chaque `TenantClient` locataire d'un tenant donne, idempotent, refuse de tourner sans l'option `--tenant`
- [ ] T015 Creer `packages/api/src/middleware/finance-rbac-middleware.ts` avec les permissions `finance.accounts.read`, `finance.reports.read`, `finance.billing.manage`
- [ ] T016 Creer `packages/api/prisma/seeds/finance-permissions-seed.ts` et attribuer les trois permissions aux roles existants (gestionnaire, dirigeant en lecture, administrateur)
- [ ] T017 Creer le squelette de `packages/api/src/controllers/finance-controller.ts` et `packages/api/src/routes/finance-routes.ts` (aucun handler encore, juste le montage), puis monter le routeur `/api/tenants/:tenantId/finance` dans `packages/api/src/index.ts`
- [ ] T018 [P] Creer `apps/web/src/types/finance-types.ts` avec les types de domaine (`ThirdPartyAccountSummary`, `ThirdPartyMovementLine`, `RentBillingRunSummary`) alignes sur `contracts/openapi.yaml`
- [ ] T019 [P] Creer `apps/web/src/services/finance-service.ts` avec les appels reseau des sept endpoints, via `utils/api-client`

**Checkpoint**: le grand livre absorbe les evenements locatifs existants dans leur propre transaction ; un test qui force un echec apres le mouvement ne laisse aucune trace (voir tests de la phase 2). Toutes les user stories peuvent demarrer.

### Tests de la phase 2

- [ ] T020 [P] Tests unitaires du grand livre dans `packages/api/__tests__/unit/finance.ledger.test.ts` (enchainement de `balanceAfter`, arrondi `Decimal(14,2)`, rejeu idempotent via `rebuildThirdPartyAccount`, reconstruction egale a l'incremental sur un scenario de 200 mouvements)
- [ ] T021 [P] Test API qui force un echec apres l'ecriture du mouvement dans une des quatre transactions locatives et verifie l'absence de trace dans `packages/api/__tests__/integration/finance.transaction-atomicity.test.ts`
- [ ] T022 [P] Non-regression : executer et faire passer la suite locative existante (`rental.integration.test.ts`, tests de generation et d'allocation) inchangee

---

## Phase 3: User Story 1 - Voir la balance clients en un ecran (Priority: P1)

**Goal**: une ligne par locataire, total facture, total regle, solde, sans saisie.

**Independent Test**: apres retro-remplissage, ouvrir la balance clients et verifier une ligne par locataire actif avec un total de controle correct.

### Tests US1

- [ ] T023 [P] [US1] Test unitaire du calcul de balance (groupement par compte, filtre periode/bien) dans `packages/api/__tests__/unit/finance.reports.balance.test.ts`
- [ ] T024 [P] [US1] Test API de la balance filtree par periode et par bien, avec total de controle, dans `packages/api/__tests__/api/finance.clients-balance.test.ts`
- [ ] T025 [P] [US1] Test API d'isolation tenant (le tenant B ne voit pas les comptes du tenant A) dans `packages/api/__tests__/api/finance.tenant-isolation.test.ts`
- [ ] T026 [P] [US1] Test de charge : balance sur un exercice pour un tenant simule de 500 comptes en moins de 3 s, script dans `packages/api/scripts/finance-load-test.ts`

### Implementation US1

- [ ] T027 [US1] Implementer `getClientsBalance(tenantId, filters)` (agregation SQL `groupBy`, dernier `balanceAfter` par compte) dans `packages/api/src/lib/finance/reports.ts`
- [ ] T028 [US1] Implementer l'export CSV de la balance dans `packages/api/src/lib/finance/reports.ts` (ou reutilisation de l'utilitaire d'export existant du depot s'il y en a un)
- [ ] T029 [US1] Ajouter le handler `GET /clients/balance` dans `packages/api/src/controllers/finance-controller.ts`
- [ ] T030 [US1] Ajouter la route `GET /clients/balance` (permission `finance.reports.read`) dans `packages/api/src/routes/finance-routes.ts`
- [ ] T031 [US1] Ajouter les schemas Zod de requete/reponse de la balance dans `packages/api/src/lib/finance/schemas.ts`
- [ ] T032 [US1] Etendre `apps/web/src/services/finance-service.ts` avec l'appel `getClientsBalance`
- [ ] T033 [US1] Creer la page `apps/web/src/pages/finance/BalanceClients.tsx` (`DataView`, filtres periode/bien dans l'URL, total en pied, bouton export, clic ligne vers le releve)
- [ ] T034 [US1] Ajouter la route `/tenant/:tenantId/finance/clients` dans `apps/web/src/App.tsx` (chargement `React.lazy`)
- [ ] T035 [P] [US1] Test frontend de `BalanceClients.tsx` (etat d'URL, absence des mots "debit"/"credit") dans `apps/web/src/__tests__/finance/BalanceClients.test.tsx`

**Checkpoint**: US1 complet et demontrable independamment.

---

## Phase 4: User Story 2 - Consulter le releve de compte d'un locataire (Priority: P1)

**Goal**: chronologie avec solde apres chaque mouvement, bornee par dates, imprimable.

**Independent Test**: ouvrir le releve d'un locataire avec historique varie, verifier la coherence des soldes et l'export PDF.

### Tests US2

- [ ] T036 [P] [US2] Test unitaire du releve (solde d'ouverture a une date, pagination, coherence des soldes successifs) dans `packages/api/__tests__/unit/finance.reports.statement.test.ts`
- [ ] T037 [P] [US2] Test API du releve borne par dates et de l'export PDF dans `packages/api/__tests__/api/finance.account-statement.test.ts`
- [ ] T038 [P] [US2] Test API d'acces refuse a un compte d'un autre tenant dans `packages/api/__tests__/api/finance.tenant-isolation.test.ts` (etend T025)

### Implementation US2

- [ ] T039 [US2] Implementer `getAccountStatement(tenantId, accountId, range)` (methode identique a `getOwnerAccountStatementByLot`, solde d'ouverture recalcule a la borne de debut) dans `packages/api/src/lib/finance/reports.ts`
- [ ] T040 [US2] Implementer la generation PDF du releve (modele `owner-account-statement.ts`) dans `packages/api/src/lib/finance/statement-pdf.ts`
- [ ] T041 [US2] Ajouter les handlers `GET /accounts/:accountId/statement` et `GET /accounts/:accountId/statement.pdf` dans `packages/api/src/controllers/finance-controller.ts`
- [ ] T042 [US2] Ajouter les routes correspondantes (permission `finance.accounts.read`) dans `packages/api/src/routes/finance-routes.ts`
- [ ] T043 [US2] Ajouter les schemas Zod du releve (bornes de dates, pagination) dans `packages/api/src/lib/finance/schemas.ts`
- [ ] T044 [US2] Etendre `apps/web/src/services/finance-service.ts` avec `getAccountStatement` et `downloadAccountStatementPdf`
- [ ] T045 [US2] Creer la page `apps/web/src/pages/finance/Releve.tsx` (chronologie, `MoneyValue`, soldes d'ouverture/cloture, bouton impression, bornes de dates dans l'URL)
- [ ] T046 [US2] Ajouter la route `/tenant/:tenantId/finance/comptes/:accountId` dans `apps/web/src/App.tsx`
- [ ] T047 [P] [US2] Test frontend de `Releve.tsx` (etat d'URL, absence des mots "debit"/"credit") dans `apps/web/src/__tests__/finance/Releve.test.tsx`

**Checkpoint**: US2 complet et demontrable independamment.

---

## Phase 5: User Story 3 - Lancer la facturation du mois pour tous les baux actifs (Priority: P1)

**Goal**: une campagne par periode et par tenant, idempotente, avec compte rendu detaille.

**Independent Test**: lancer une campagne sur un jeu de baux varies, verifier les echeances creees, les exclusions motivees, puis relancer et verifier l'absence de doublon.

### Tests US3

- [ ] T048 [P] [US3] Test unitaire de `buildInstallmentForPeriod` (montant derive du bail, periode couverte) dans `packages/api/__tests__/unit/finance.billing-run.build-installment.test.ts`
- [ ] T049 [P] [US3] Test unitaire des motifs d'exclusion (bail suspendu, periode hors bail, echeance deja existante, loyer non renseigne) dans `packages/api/__tests__/unit/finance.billing-run.exclusions.test.ts`
- [ ] T050 [P] [US3] Test API de la campagne relancee deux fois sans duplication dans `packages/api/__tests__/api/finance.billing-run.idempotency.test.ts`
- [ ] T051 [P] [US3] Test API de l'historique des campagnes (liste et detail) dans `packages/api/__tests__/api/finance.billing-run.history.test.ts`

### Implementation US3

- [ ] T052 [US3] Extraire `buildInstallmentForPeriod(lease, periodYear, periodMonth)` (fonction pure) depuis `generateInstallments` dans `packages/api/src/services/rental-installment-service.ts`
- [ ] T053 [US3] Implementer `runBillingRun(tenantId, periodYear, periodMonth, actorUserId)` dans `packages/api/src/lib/finance/billing-run.ts` : upsert du `RentBillingRun` sur `(tenantId, periodYear, periodMonth)`, selection des baux `ACTIVE` couvrant la periode, appel a `buildInstallmentForPeriod`, insertion en ignorant les doublons `P2002`, ecriture du `summary`
- [ ] T054 [US3] Implementer la construction des motifs d'exclusion (bail suspendu, periode hors bail, echeance deja existante, loyer non renseigne) dans `packages/api/src/lib/finance/billing-run.ts`
- [ ] T055 [US3] Ajouter les handlers `POST /billing-runs`, `GET /billing-runs`, `GET /billing-runs/:runId` dans `packages/api/src/controllers/finance-controller.ts`
- [ ] T056 [US3] Ajouter les routes correspondantes (permission `finance.billing.manage` pour `POST`, `finance.reports.read` pour les `GET`) dans `packages/api/src/routes/finance-routes.ts`
- [ ] T057 [US3] Ajouter les schemas Zod de la campagne (periode, libelle) dans `packages/api/src/lib/finance/schemas.ts`
- [ ] T058 [US3] Etendre `apps/web/src/services/finance-service.ts` avec `runBillingRun`, `listBillingRuns`, `getBillingRun`
- [ ] T059 [US3] Creer la page `apps/web/src/pages/finance/Facturation.tsx` (selecteur de periode, lancement via `ConfirmAction`, compte rendu factures/exclus/avances, historique des campagnes)
- [ ] T060 [US3] Ajouter la route `/tenant/:tenantId/finance/facturation` dans `apps/web/src/App.tsx`
- [ ] T061 [P] [US3] Test frontend de `Facturation.tsx` (etat d'URL, absence des mots "debit"/"credit") dans `apps/web/src/__tests__/finance/Facturation.test.tsx`

**Checkpoint**: US3 complet et demontrable independamment (recit central de la demonstration du lot).

---

## Phase 6: User Story 4 - Encaisser un reglement sans echeance en face (Priority: P1)

**Goal**: le compte devient crediteur a l'encaissement, l'avance s'impute automatiquement des la campagne suivante, l'imputation reste visible.

**Independent Test**: encaisser un reglement sans echeance ouverte, verifier le solde crediteur et le mouvement sur le releve, puis lancer la campagne suivante et verifier l'imputation.

### Tests US4

- [ ] T062 [P] [US4] Test unitaire : un paiement `SUCCEEDED` sans allocation possible cree un mouvement `ADVANCE_RECEIVED` (credit) et rend le compte crediteur, dans `packages/api/__tests__/unit/finance.ledger.advance.test.ts`
- [ ] T063 [P] [US4] Test unitaire : la campagne consomme le reglement non alloue le plus ancien en premier, y compris en cas d'avances multiples, dans `packages/api/__tests__/unit/finance.billing-run.advance-application.test.ts`
- [ ] T064 [P] [US4] Test unitaire : une avance partielle laisse un reliquat crediteur apres l'imputation, dans `packages/api/__tests__/unit/finance.billing-run.advance-application.test.ts`
- [ ] T065 [P] [US4] Test API bout en bout : encaissement sans echeance -> compte crediteur -> campagne suivante -> compte solde, dans `packages/api/__tests__/api/finance.advance-lifecycle.test.ts`

### Implementation US4

- [ ] T066 [US4] Completer le branchement de `packages/api/src/services/rental-payment-service.ts` (task T011) : quand un paiement `SUCCEEDED` ne peut etre alloue a aucune echeance existante, declencher un mouvement `ADVANCE_RECEIVED` (credit) referencant le paiement (`sourceType: RENTAL_PAYMENT`)
- [ ] T067 [US4] Implementer, dans `packages/api/src/lib/finance/billing-run.ts`, l'application des avances avant la cloture de la campagne : recherche des mouvements `ADVANCE_RECEIVED` non consommes du compte, tri par date croissante, creation d'une `RentalPaymentAllocation` sur la nouvelle echeance et d'un mouvement `ADVANCE_APPLIED` (debit) qui reference cette allocation (`sourceType: RENT_BILLING_RUN`)
- [ ] T068 [US4] Consigner les avances appliquees dans `RentBillingRun.summary` (`advancesApplied`)

**Checkpoint**: US4 complet ; le releve produit par US2 montre distinctement l'`ADVANCE_RECEIVED` et l'`ADVANCE_APPLIED` correspondants.

---

## Phase 7: User Story 5 - Voir la balance agee (Priority: P2)

**Goal**: la balance clients ventilee par anciennete d'echeance.

**Independent Test**: verifier que chaque solde en retard tombe dans la bonne tranche et que le tri par colonne fonctionne.

### Tests US5

- [ ] T069 [P] [US5] Test unitaire des bornes de tranches (a echoir, <30j, 30-60, 60-90, >90) dans `packages/api/__tests__/unit/finance.reports.aging.test.ts`
- [ ] T070 [P] [US5] Test API de la balance agee dans `packages/api/__tests__/api/finance.clients-balance-agee.test.ts`

### Implementation US5

- [ ] T071 [US5] Implementer `getClientsAgingBalance(tenantId, asOfDate)` (ventilation par anciennete depuis `RentalInstallment.due_date`) dans `packages/api/src/lib/finance/reports.ts`
- [ ] T072 [US5] Ajouter le handler `GET /clients/balance-agee` dans `packages/api/src/controllers/finance-controller.ts`
- [ ] T073 [US5] Ajouter la route correspondante (permission `finance.reports.read`) dans `packages/api/src/routes/finance-routes.ts`
- [ ] T074 [US5] Etendre `apps/web/src/services/finance-service.ts` avec `getClientsAgingBalance`
- [ ] T075 [US5] Creer la page `apps/web/src/pages/finance/BalanceAgee.tsx` (memes filtres que la balance, colonnes de tranches, tri)
- [ ] T076 [US5] Ajouter la route `/tenant/:tenantId/finance/clients/agee` dans `apps/web/src/App.tsx`
- [ ] T077 [P] [US5] Test frontend de `BalanceAgee.tsx` (etat d'URL, absence des mots "debit"/"credit") dans `apps/web/src/__tests__/finance/BalanceAgee.test.tsx`

**Checkpoint**: US5 complet et demontrable independamment.

---

## Phase 8: User Story 6 - Consulter mon solde depuis le portail locataire (Priority: P3)

**Goal**: le locataire voit son propre releve, en lecture seule.

**Independent Test**: se connecter au portail d'un locataire et verifier qu'il ne voit que son propre compte.

### Tests US6

- [ ] T078 [P] [US6] Test API : le portail locataire ne renvoie que le compte du `TenantClient` connecte, jamais un autre, dans `packages/api/__tests__/api/finance.tenant-portal-statement.test.ts`

### Implementation US6

- [ ] T079 [US6] Ajouter la fonction de lecture bornee au `TenantClient` connecte dans `packages/api/src/services/tenant-portal-service.ts` (reutilise `getAccountStatement` de `lib/finance/reports.ts`)
- [ ] T080 [US6] Ajouter la route `GET /tenant-portal/finance/statement` dans `packages/api/src/routes/tenant-portal-routes.ts`, protegee par `middleware/tenant-portal-access.ts`
- [ ] T081 [US6] Etendre `apps/web/src/pages/TenantPortal/Payments.tsx` d'un onglet "Mon solde" (lecture seule, reutilise l'affichage du releve de US2)
- [ ] T082 [P] [US6] Test frontend de l'onglet solde dans `apps/web/src/__tests__/finance/TenantPortalStatement.test.tsx`

**Checkpoint**: US6 complet et demontrable independamment.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T083 [P] Ajouter la section `finance` (Clients, Facturation) dans `apps/web/src/navigation/model.tsx` et l'entree correspondante dans le catalogue de menus
- [ ] T084 [P] Etendre l'acces menu par role pour la section `finance` (reprise du mecanisme `RoleMenuAccess` existant)
- [ ] T085 Executer le script de retro-remplissage (T014) sur la base de demonstration et verifier que la balance clients (US1) correspond aux echeances et paiements deja enregistres
- [ ] T086 Executer la batterie de tests backend du module finance (`packages/api`) et la suite locative complete, verifier zero regression
- [ ] T087 Executer la batterie de tests frontend du module finance (`apps/web`)
- [ ] T088 Executer le script de charge (T026) et consigner le resultat (cible : moins de 3 s pour 500 comptes)
- [ ] T089 Rediger `docs/finance/LOT-1-RAPPORT.md` selon le rituel des rapports de refonte, et mettre a jour `docs/README.md`

---

## Dependencies & Execution Order

- Phase 1 -> Phase 2 obligatoires avant toute user story.
- US1, US2, US3, US4 sont P1. US1 et US2 partagent `lib/finance/reports.ts` mais des fonctions distinctes (`getClientsBalance` vs `getAccountStatement`) : parallelisables des la phase 2 terminee.
- US3 depend de la phase 2 (grand livre) et de la fonction `buildInstallmentForPeriod` qu'elle extrait elle-meme (T052) ; elle ne depend pas de US1/US2.
- US4 depend de US3 (la campagne est ce qui applique l'avance) et complete le branchement de paiement pose en phase 2 (T011) : a mener juste apres ou avec US3.
- US5 reutilise `lib/finance/reports.ts` (US1) mais est independante dans son critere de test ; peut demarrer des que T027 est disponible.
- US6 depend de US2 (reutilise `getAccountStatement`) ; c'est la derniere story de priorite P1-P2 a boucler avant le polish, coherent avec sa priorite P3.
- Polish en dernier, apres toutes les user stories.

## Parallel Opportunities

- T001/T002 sequentiels (meme fichier `schema.prisma`), mais T005/T007, T008, T009 en parallele une fois le schema genere (T004).
- T010-T013 (branchement dans les quatre services locatifs) touchent quatre fichiers distincts : parallelisables entre eux, mais chacun doit rester dans la transaction Prisma existante du service qu'il modifie.
- Pour chaque user story : les taches de tests marquees `[P]` en parallele, puis backend et frontend en flux separes une fois les fonctions de `lib/finance/` disponibles.
- T083/T084 (navigation) en parallele des dernieres user stories, des que les routes frontend existent.

## Implementation Strategy

### MVP First

1. Completer Phase 1 + Phase 2 (fondation, non parallelisable en substance : c'est la piece qui conditionne tout le reste).
2. Livrer US1 (balance clients) et US2 (releve) ensemble : c'est le socle de toute demonstration.
3. Livrer US3 (campagne), puis US4 (avances) immediatement apres, car US4 depend de la mecanique de campagne.
4. Livrer US5 (balance agee).
5. Livrer US6 (portail locataire).
6. Polish, recette, rapport de fin de lot.

### Incremental Delivery

1. Release A: US1 + US2 (chiffrage visible, pas encore d'action de saisie)
2. Release B: US3 + US4 (le geste operationnel mensuel complet)
3. Release C: US5
4. Release D: US6
