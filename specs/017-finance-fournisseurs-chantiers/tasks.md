# Tasks: Gestion financiere operationnelle - Fournisseurs et chantiers (lot 2)

**Input**: Design documents from `/specs/017-finance-fournisseurs-chantiers/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml

**Tests**: Inclure les tests est requis pour cette feature (migration a risque, ecritures en partie double, invariants d'imputation, immuabilite, concurrence de numerotation).

**Organization**: Taches groupees par phase puis par user story, pour une implementation et une validation independantes de chaque recit. La generalisation comptable (US1) est bloquante pour toutes les autres : aucune facture, aucun reglement, aucune piece de caisse ne peut s'ecrire avant elle.

## Format: `[ID] [P?] [Story] Description`

- `[P]`: peut etre execute en parallele (fichiers differents, dependances levees)
- `[Story]`: US1..US12 selon `spec.md`

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Ecrire le script de repetition de migration `packages/api/scripts/finance-migration-rehearsal.ts` : copie la base de demonstration, applique `generalize_accounting_scope`, rapporte le nombre de lignes retro-remplies et les eventuelles violations, sans encore modifier le schema reel
- [ ] T002 Verifier l'etat reel des migrations sur l'environnement de demonstration (`npx prisma migrate status` depuis `packages/api`), en particulier si `20260907120000_tenant_scoping_and_money_precision` a ete appliquee (research.md §4.4) ; consigner le resultat dans `research.md`
- [ ] T003 Ajouter l'enum `AccountingScope` et etendre `SourceType` (`SUPPLIER_INVOICE`, `SUPPLIER_PAYMENT`, `CASH_VOUCHER`, `VOID`) dans `packages/api/prisma/schema.prisma`
- [ ] T004 Ajouter `tenantId`, `scope`, rendre `syndicateId` optionnel sur `ChartOfAccount` et `AccountingJournal` ; ajouter `tenantId`, `documentType`, `documentId`, `voidedByEntryId` sur `JournalEntry` ; elargir `JournalEntryLine.debit`/`.credit` en `Decimal(14,2)` dans `packages/api/prisma/schema.prisma`
- [ ] T005 Ecrire la migration `generalize_accounting_scope` (`packages/api/prisma/migrations/`) selon la sequence de `data-model.md` §1.3 : controle prealable, colonnes nullables, retro-remplissage par jointure, controle post-remplissage, colonnes obligatoires, suppression de l'ancienne contrainte `ChartOfAccount`, creation des deux index partiels, index d'usage, cles etrangeres -- chaque etape tolerante a une seconde execution (`IF NOT EXISTS` / `IF EXISTS`)
- [ ] T006 Executer T001 (repetition) sur une copie de la base de demonstration, deux fois de suite, et verifier l'absence d'erreur et de doublon a la seconde execution
- [ ] T007 Regenerer le client Prisma (`npx prisma generate` depuis `packages/api`)

**Checkpoint**: la migration de generalisation est rejouable, testee sur une copie de la base de demonstration, et ne modifie aucune donnee de copropriete existante au-dela du retro-remplissage de `tenantId`.

### Tests de la phase 1

- [ ] T008 [P] Test d'integration `finance.migration-rehearsal.test.ts` : applique la migration deux fois sur une base de test, verifie l'idempotence et l'absence de ligne orpheline (`tenant_id IS NULL`)
- [ ] T009 [P] Executer la suite de caracterisation du lot 0 (`syndics.accounting.characterization.test.ts`, `syndics.owner-accounts.ledger.test.ts`) apres la migration seule (avant toute correction de defaut) et verifier qu'elle est integralement verte : la migration seule ne doit changer aucun comportement observable

---

## Phase 2: User Story 1 - Generaliser le moteur comptable sans casser la copropriete (Priority: P1)

**Goal**: le plan de comptes et les journaux acceptent une ecriture sans copropriete, sans jamais compromettre la copropriete existante ; les cinq defauts du §6.1 bis sont corriges avec une distinction claire entre "corrige pour le nouveau chemin" et "corrige partout".

**Independent Test**: voir `spec.md`, User Story 1.

### Tests US1 (avant implementation, sur le comportement actuel puis corrige)

- [ ] T010 [P] [US1] Mettre a jour le test `syndics.accounting.characterization.test.ts:375` (defaut 5, le seul corrige des deux cotes) : retirer le prefixe `SURPRISE`, changer l'assertion de 400 vers 409, ajouter un commentaire renvoyant a `data-model.md#defaut-5`
- [ ] T011 [P] [US1] Ecrire `packages/api/__tests__/unit/finance.accounting.post-document-entry.test.ts` : construction d'une ecriture equilibree par type de piece, refus d'une ecriture desequilibree sur les valeurs arrondies (defaut 1, chemin operationnel), verrouillage automatique a la creation (defaut 2, chemin operationnel), determinisme de `roundMoneyXof` a la demie (defaut 4)
- [ ] T012 [P] [US1] Ecrire `packages/api/__tests__/unit/finance.reports.supplier-statement.test.ts` : le releve fournisseur calcule l'ouverture depuis le dernier mouvement anterieur a la borne (reutilisation de `getBalanceStrictlyBefore`/`getBalanceAtOrBefore` du lot 1, generalisees a `kind: SUPPLIER` -- defaut 3, jamais introduit)
- [ ] T013 [P] [US1] Verifier que `syndics.accounting.characterization.test.ts:767-808` (defaut 2, IMMUTABILITE) et `syndics.owner-accounts.ledger.test.ts:459` (defaut 3) restent verts et **inchanges** apres toute l'implementation de ce lot (chemin copropriete non touche)
- [ ] T014 [P] [US1] Test API d'isolation tenant sur le plan de comptes operationnel : un tenant B ne peut ni lire ni creer un compte ou un journal du tenant A, dans `packages/api/__tests__/api/finance.accounting-tenant-isolation.test.ts`

### Implementation US1

- [ ] T015 [US1] Implementer `roundMoneyXof(value)` dans `packages/api/src/lib/finance/money.ts` (arrondi deterministe a l'unite, sans dependre de `toFixed` sur une valeur flottante) ; ne pas modifier `roundMoney` existante
- [ ] T016 [US1] Implementer `buildBalancedEntryLines(lines)` dans `packages/api/src/lib/finance/accounting.ts` (arrondit chaque ligne avant de verifier l'equilibre, sur les valeurs qui seront stockees) ; ne pas modifier `isJournalEntryBalanced` existante
- [ ] T017 [US1] Implementer `postDocumentEntryTx(tx, params)` dans `packages/api/src/lib/finance/accounting.ts` : construit l'ecriture equilibree depuis une piece (`documentType`/`documentId`), la verrouille dans la meme transaction, refuse une seconde ecriture pour la meme piece sans annulation prealable
- [ ] T018 [US1] Implementer `voidDocumentTx(tx, params)` dans `packages/api/src/lib/finance/accounting.ts` : cree la `VoidDocument`, l'ecriture inverse liee par `voidedByEntryId`, sans jamais modifier l'ecriture d'origine
- [ ] T019 [US1] Implementer `assertOperationalAccountingTenantOwnership(tenantId, chartOfAccountId | journalId)` dans `packages/api/src/lib/finance/accounting.ts` (garde d'isolation du chemin operationnel, distincte de `assertSyndicateTenantOwnership` qui reste inchangee)
- [ ] T020 [US1] Implementer le plan de comptes operationnel par tenant dans `packages/api/src/lib/finance/chart.ts` : creation d'un jeu minimal (clients, fournisseurs, caisse, achats, charges de chantier) a la premiere piece d'un tenant, enrichissable, un compte porteur de mouvement peut etre desactive mais jamais supprime
- [ ] T021 [US1] Traduire `P2002` en reponse 409 via `conflict()` (`lib/errors.ts`) dans `lib/finance/chart.ts` (creation de compte operationnel) **et** dans le point de creation de compte copropriete existant (`createChartOfAccountBySyndicate`, `lib/syndics/queries.ts`) -- seule modification de ce lot sur le chemin copropriete, justifiee par `data-model.md` defaut 5
- [ ] T022 [US1] Ajouter `getTrialBalance(tenantId, scope, range)` dans `packages/api/src/lib/finance/reports.ts` (agregation `groupBy` SQL, jamais en memoire) ; ne pas modifier `getTrialBalanceBySyndicate`
- [ ] T023 [US1] Etendre `getBalanceStrictlyBefore`/`getBalanceAtOrBefore`/`getAccountStatement` (`lib/finance/reports.ts`, lot 1) pour accepter `kind: SUPPLIER` en plus de `kind: TENANT`
- [ ] T024 [US1] Ajouter les schemas Zod du plan de comptes et des journaux operationnels dans `packages/api/src/lib/finance/schemas.ts`, avec validation systematique de l'ordre des bornes de dates (aucun 500 possible sur le code neuf) et `onlyActive` en `z.coerce.boolean()`

**Checkpoint**: US1 complet. Aucune facture, aucun reglement, aucune piece de caisse ne peut encore s'ecrire (US2-US10 en dependent), mais le chemin d'ecriture et le plan de comptes operationnel existent et sont testes isolement.

---

## Phase 3: User Story 2 - Creer un fournisseur et son compte de tiers (Priority: P1)

**Goal**: un fournisseur cree porte immediatement un compte de tiers `SUPPLIER` a solde zero.

### Tests US2

- [ ] T025 [P] [US2] Test unitaire de creation de fournisseur (compte de tiers cree dans la meme transaction) dans `packages/api/__tests__/unit/finance.suppliers.create.test.ts`
- [ ] T026 [P] [US2] Test API de creation, liaison optionnelle a un `MaintenanceVendor`, refus de facturation pour un fournisseur inactif, dans `packages/api/__tests__/api/finance.suppliers.test.ts`

### Implementation US2

- [ ] T027 [US2] Migration `add_finance_suppliers_sites` (partie fournisseurs) : `Supplier`, extension `ThirdPartyKind`-consommateur (aucune modification d'enum necessaire, `SUPPLIER` existe deja depuis le lot 1) dans `packages/api/prisma/schema.prisma` et `prisma/migrations/`
- [ ] T028 [US2] Implementer `createSupplier(tenantId, data)` dans `packages/api/src/lib/finance/suppliers.ts` (cree `Supplier` et son `ThirdPartyAccount` de type `SUPPLIER` dans la meme transaction, reutilise `getOrCreateTenantAccountTx`-equivalent du lot 1 generalise a `SUPPLIER`)
- [ ] T029 [US2] Ajouter les handlers et routes `POST /suppliers`, `GET /suppliers`, `GET /suppliers/:supplierId` dans `finance-controller.ts`/`finance-routes.ts` (permission `finance.documents.create` pour la creation, `finance.accounts.read` pour la lecture -- gardes deja existantes depuis le lot 1, voir `research.md` §3.1)
- [ ] T030 [US2] Etendre `apps/web/src/services/finance-service.ts` et `finance-types.ts` avec les appels fournisseurs
- [ ] T031 [US2] Creer la page `apps/web/src/pages/finance/Fournisseurs.tsx` (liste, creation, lien optionnel vers un `MaintenanceVendor`)
- [ ] T032 [P] [US2] Test frontend de `Fournisseurs.tsx` (absence des mots "debit"/"credit") dans `apps/web/src/__tests__/finance/Fournisseurs.test.tsx`

**Checkpoint**: US2 complet et demontrable independamment (un fournisseur existe, avec un solde a zero visible).

---

## Phase 4: User Story 3 - Saisir une facture fournisseur et l'imputer a un chantier (Priority: P1)

**Goal**: une facture brouillon avec imputation, validee en une transaction atomique.

**Depend de**: US1 (chemin d'ecriture), US2 (fournisseur), US7 (chantier doit exister pour imputer -- mais la saisie en brouillon sans validation ne le requiert pas immediatement ; l'imputation, elle, le requiert).

### Tests US3

- [ ] T033 [P] [US3] Test unitaire de l'invariant d'imputation (Σ CostAllocation = montant facture) dans `packages/api/__tests__/unit/finance.cost-allocation.invariant.test.ts`
- [ ] T034 [P] [US3] Test unitaire du refus de saisie sans chantier pour un fournisseur MATERIALS/MIXED, acceptation pour SERVICES, dans `packages/api/__tests__/unit/finance.suppliers.invoice-rules.test.ts`
- [ ] T035 [P] [US3] Test API de validation atomique : on force l'echec de la creation d'imputation apres l'ecriture du mouvement de compte, on verifie l'absence de toute trace (ecriture, mouvement, imputation), dans `packages/api/__tests__/api/finance.supplier-invoices.atomicity.test.ts`
- [ ] T036 [P] [US3] Test API d'immuabilite : une facture validee refuse toute modification/suppression (409), la correction passe par `VoidDocument`, dans `packages/api/__tests__/api/finance.supplier-invoices.test.ts`

### Implementation US3

- [ ] T037 [US3] Migration (partie factures) : `SupplierInvoice`, `SupplierInvoiceLine`, `VoidDocument`, `VoidableDocumentType` dans `schema.prisma`/`prisma/migrations/`
- [ ] T038 [US3] Implementer la creation de facture brouillon (avec lignes) dans `packages/api/src/lib/finance/suppliers.ts`
- [ ] T039 [US3] Implementer la validation de facture dans `packages/api/src/lib/finance/suppliers.ts` : verifie l'invariant de somme, appelle `postDocumentEntryTx`, deplace le compte fournisseur, cree les `CostAllocation`, tout dans une seule transaction
- [ ] T040 [US3] Implementer l'annulation de facture (`voidSupplierInvoice`) dans `lib/finance/suppliers.ts`, appelant `voidDocumentTx`
- [ ] T041 [US3] Ajouter les handlers/routes `POST /suppliers/:supplierId/invoices`, `POST /supplier-invoices/:invoiceId/validate`, `POST /supplier-invoices/:invoiceId/void` (permission `finance.documents.create` pour la creation, `finance.documents.validate` pour la validation -- garde deja existante) dans `finance-controller.ts`/`finance-routes.ts`
- [ ] T042 [US3] Etendre `finance-service.ts`/`finance-types.ts`
- [ ] T043 [US3] Creer la page `apps/web/src/pages/finance/FactureFournisseur.tsx` (saisie, imputation obligatoire ou non selon la nature du fournisseur, validation via `ConfirmAction`)
- [ ] T044 [P] [US3] Test frontend dans `apps/web/src/__tests__/finance/FactureFournisseur.test.tsx`

**Checkpoint**: US3 complet, demontrable avec un chantier deja cree (voir Phase 7).

---

## Phase 5: User Story 4 - Regler une facture fournisseur, total ou partiel (Priority: P1)

**Goal**: reglement multi-factures, acompte rendant le compte debiteur.

### Tests US4

- [ ] T045 [P] [US4] Test unitaire de repartition d'un reglement sur plusieurs factures dans `packages/api/__tests__/unit/finance.supplier-payments.allocation.test.ts`
- [ ] T046 [P] [US4] Test unitaire d'un acompte sans facture rendant le compte debiteur dans le meme fichier
- [ ] T047 [P] [US4] Test API d'immuabilite d'un reglement valide dans `packages/api/__tests__/api/finance.supplier-payments.test.ts`

### Implementation US4

- [ ] T048 [US4] Migration (partie reglements) : `SupplierPayment`, `SupplierPaymentAllocation`
- [ ] T049 [US4] Implementer la creation et la validation d'un reglement dans `packages/api/src/lib/finance/suppliers.ts` (repartition explicite sur une ou plusieurs factures, appel a `postDocumentEntryTx`)
- [ ] T050 [US4] Ajouter les handlers/routes `POST /suppliers/:supplierId/payments`, `POST /supplier-payments/:paymentId/validate` dans `finance-controller.ts`/`finance-routes.ts`
- [ ] T051 [US4] Etendre `finance-service.ts`/`finance-types.ts`
- [ ] T052 [US4] Creer la page `apps/web/src/pages/finance/ReglementFournisseur.tsx` (selection de factures, montant, acompte)
- [ ] T053 [P] [US4] Test frontend dans `apps/web/src/__tests__/finance/ReglementFournisseur.test.tsx`

**Checkpoint**: US4 complet ; le cycle facture -> reglement est demontrable de bout en bout.

---

## Phase 6: User Story 5 - Voir la balance fournisseurs (Priority: P1)

### Tests US5

- [ ] T054 [P] [US5] Test unitaire de la balance fournisseurs (groupement, filtre periode/chantier) dans `packages/api/__tests__/unit/finance.reports.supplier-balance.test.ts`
- [ ] T055 [P] [US5] Test API filtree par chantier dans `packages/api/__tests__/api/finance.suppliers-balance.test.ts`

### Implementation US5

- [ ] T056 [US5] Implementer `getSuppliersBalance(tenantId, filters)` dans `lib/finance/reports.ts` (agregation SQL, generalisation de `getClientsBalance` du lot 1 a `kind: SUPPLIER` et au filtre par chantier)
- [ ] T057 [US5] Ajouter le handler/route `GET /suppliers/balance` (`finance.reports.read`)
- [ ] T058 [US5] Etendre `finance-service.ts`
- [ ] T059 [US5] Creer la page `apps/web/src/pages/finance/BalanceFournisseurs.tsx`
- [ ] T060 [P] [US5] Test frontend

**Checkpoint**: US5 complet et demontrable independamment.

---

## Phase 7: User Story 6 - Ouvrir le releve d'un fournisseur (Priority: P2)

### Tests US6

- [ ] T061 [P] [US6] Test API du releve fournisseur, ouverture calculee depuis le dernier mouvement anterieur a la borne (voir T012) dans `packages/api/__tests__/api/finance.supplier-statement.test.ts`

### Implementation US6

- [ ] T062 [US6] Implementer `getSupplierStatement` (generalisation de `getAccountStatement` du lot 1, voir T023)
- [ ] T063 [US6] Ajouter le handler/route `GET /accounts/:accountId/statement` (reutilise la route du lot 1, generalisee a `SUPPLIER`)
- [ ] T064 [US6] Creer la page `apps/web/src/pages/finance/ReleveFournisseur.tsx` (reutilise le composant de chronologie du lot 1)
- [ ] T065 [P] [US6] Test frontend

**Checkpoint**: US6 complet.

---

## Phase 8: User Story 7 - Creer un chantier sans bien preexistant (Priority: P1)

### Tests US7

- [ ] T066 [P] [US7] Test unitaire de creation d'un chantier sans `propertyId`, cout reel a zero, dans `packages/api/__tests__/unit/finance.sites.create.test.ts`
- [ ] T067 [P] [US7] Test frontend qui verifie la distinction visuelle "Chantier" (Finance) / "Programme de travaux" (Patrimoine) dans `apps/web/src/__tests__/finance/Chantiers.test.tsx`

### Implementation US7

- [ ] T068 [US7] Migration (partie chantiers) : `ConstructionSite`, `ConstructionSiteStatus`, `CostCategory`
- [ ] T069 [US7] Implementer `createConstructionSite`, `listConstructionSites` dans `packages/api/src/lib/finance/sites.ts`
- [ ] T070 [US7] Implementer `finance-cost-categories-seed.ts` (jeu par defaut, cree au premier chantier d'un tenant, pas au seed global)
- [ ] T071 [US7] Ajouter les handlers/routes `POST /sites`, `GET /sites`, `GET /sites/:siteId` (permission `finance.sites.manage` pour l'ecriture -- garde deja existante, voir `research.md` §3.1)
- [ ] T072 [US7] Etendre `finance-service.ts`/`finance-types.ts`
- [ ] T073 [US7] Creer la page `apps/web/src/pages/finance/Chantiers.tsx` (liste, creation, libelle explicite "Chantier")

**Checkpoint**: US7 complet ; les factures et pieces de caisse (US3, US10) peuvent desormais s'imputer a un vrai chantier.

---

## Phase 9: User Story 8 - Voir le cout reel d'un chantier, derive des imputations (Priority: P1)

### Tests US8

- [ ] T074 [P] [US8] Test unitaire : cout reel = somme des imputations validees, diminue apres annulation, dans `packages/api/__tests__/unit/finance.sites.actual-cost.test.ts`
- [ ] T075 [P] [US8] Test qui epingle la surface publique de `lib/finance/sites.ts` : aucune fonction n'accepte `actualCost` en parametre d'ecriture (meme patron que le test d'immuabilite du lot 0), dans `packages/api/__tests__/api/finance.sites.actual-cost-surface.test.ts`

### Implementation US8

- [ ] T076 [US8] Implementer `getSiteActualCost(tenantId, siteId)` dans `lib/finance/sites.ts` (somme SQL des `CostAllocation` validees non annulees)
- [ ] T077 [US8] Exposer le cout reel calcule dans la reponse de `GET /sites/:siteId`, jamais en champ accepte par `POST`/`PATCH`

**Checkpoint**: US8 complet.

---

## Phase 10: User Story 9 - Consulter le detail d'un chantier (Priority: P2)

### Tests US9

- [ ] T078 [P] [US9] Test API du detail (imputations par date, nature, poste, sous-totaux) dans `packages/api/__tests__/api/finance.sites.detail.test.ts`

### Implementation US9

- [ ] T079 [US9] Implementer `getSiteDetail(tenantId, siteId)` dans `lib/finance/sites.ts` (liste des imputations avec lien vers la piece d'origine, sous-totaux par poste)
- [ ] T080 [US9] Ajouter le handler/route `GET /sites/:siteId/detail`
- [ ] T081 [US9] Creer la page `apps/web/src/pages/finance/FicheChantier.tsx` (onglets Imputations / Pieces)
- [ ] T082 [P] [US9] Test frontend

**Checkpoint**: US9 complet.

---

## Phase 11: User Story 10 - Emettre une piece de caisse pour un ouvrier (Priority: P1)

**Rappel**: l'organisation de la caisse est une decision actee le 18 septembre 2026 (caisse unique par tenant, gestionnaire emettrice, dirigeant validateur), pas une hypothese ; voir `spec.md`, section "Decision actee : la caisse".

### Tests US10

- [ ] T083 [P] [US10] Test unitaire de concurrence de numerotation : deux pieces emises quasi simultanement pour le meme tenant recoivent des numeros distincts, dans `packages/api/__tests__/unit/finance.cash-voucher.sequence.test.ts`
- [ ] T084 [P] [US10] Test API de creation, imputation a la validation, impression, dans `packages/api/__tests__/api/finance.cash-vouchers.test.ts`

### Implementation US10

- [ ] T085 [US10] Migration (partie caisse) : `CashVoucher`, table de support `finance_sequence_counters` (compteur verrouille par tenant/annee/sequence)
- [ ] T086 [US10] Implementer `nextCashVoucherNumber(tx, tenantId, voucherYear)` dans `lib/finance/cash-vouchers.ts` (`SELECT ... FOR UPDATE` sur le compteur, dans la transaction de validation)
- [ ] T087 [US10] Implementer la creation et la validation d'une piece de caisse dans `lib/finance/cash-vouchers.ts` (numerotation, ecriture via `postDocumentEntryTx`, `CostAllocation` vers le chantier et le poste)
- [ ] T088 [US10] Implementer l'impression de la piece de caisse dans `lib/finance/cash-vouchers.ts` (modele PDF, sur le patron de `statement-pdf.ts` du lot 1)
- [ ] T089 [US10] Ajouter les handlers/routes `POST /sites/:siteId/cash-vouchers`, `POST /cash-vouchers/:voucherId/validate`, `GET /cash-vouchers/:voucherId.pdf`
- [ ] T090 [US10] Creer la page `apps/web/src/pages/finance/PieceDeCaisse.tsx`
- [ ] T091 [P] [US10] Test frontend

**Checkpoint**: US10 complet et demontrable, sur la base de la caisse unique par tenant actee le 18 septembre 2026.

---

## Phase 12: User Story 11 - Valider une piece financiere avant qu'elle ne s'impute (Priority: P1)

**Depend de**: US3, US4, US10 (les trois natures de piece a valider doivent exister pour que la file ait un contenu a montrer, mais la file elle-meme peut etre construite des que la premiere piece brouillon existe).

### Tests US11

- [ ] T092 [P] [US11] Test API : une piece creee par une saisisseuse reste brouillon, invisible de toute balance, dans `packages/api/__tests__/api/finance.validation-queue.test.ts`
- [ ] T093 [P] [US11] Test API : un utilisateur sans `finance.documents.validate` ne peut pas valider, dans le meme fichier
- [ ] T094 [P] [US11] Test API : filtre de la file par auteur et par nature de piece, dans le meme fichier

### Implementation US11

- [ ] T095 [US11] Implementer `listPendingDocuments(tenantId, filters)` dans `lib/finance/validation-queue.ts` (union des factures, reglements et pieces de caisse brouillon)
- [ ] T096 [US11] Ajouter le handler/route `GET /validation-queue` (permission `finance.documents.validate`, garde deja existante)
- [ ] T097 [US11] Creer la page `apps/web/src/pages/finance/PiecesAValider.tsx`
- [ ] T098 [P] [US11] Test frontend

**Checkpoint**: US11 complet ; la separation saisie/validation est demontrable sur les trois natures de piece.

---

## Phase 13: User Story 12 - Lier un programme de travaux existant a un chantier (Priority: P3)

### Tests US12

- [ ] T099 [P] [US12] Test unitaire : poser le lien met immediatement `WorkProgram.actualCost` a jour, dans `packages/api/__tests__/unit/finance.work-program-sync.test.ts`
- [ ] T100 [P] [US12] Test unitaire : une nouvelle imputation validee sur le chantier met a jour le programme lie, dans le meme fichier
- [ ] T101 [P] [US12] Test API : `updateWorkProgramSchema` refuse `actualCost` en entree quand `constructionSiteId` est deja renseigne, accepte sinon (non-regression), dans `packages/api/__tests__/api/finance.patrimoine-non-regression.test.ts`

### Implementation US12

- [ ] T102 [US12] Ajouter `constructionSiteId` sur `WorkProgram` dans `schema.prisma`/migration
- [ ] T103 [US12] Implementer `syncWorkProgramCostTx(tx, constructionSiteId)` dans `lib/finance/cost-allocation.ts`, appelee a la fin de toute transaction qui valide ou annule une `CostAllocation`
- [ ] T104 [US12] Modifier `packages/api/src/lib/patrimoine/schemas.ts` (`updateWorkProgramSchema`) pour rendre `actualCost` conditionnellement refuse
- [ ] T105 [US12] Ajouter le handler/route de rattachement (`PATCH /work-programs/:id/construction-site`) dans `patrimoine-controller.ts`/`patrimoine-routes.ts`
- [ ] T106 [US12] Etendre `apps/web/src/pages/patrimoine/work-programs/WorkProgramForm.tsx` (champ de lien, cout en lecture seule si lie)
- [ ] T107 [P] [US12] Test frontend dans `apps/web/src/__tests__/patrimoine/work-programs.test.tsx` (fichier existant, etendu)

**Checkpoint**: US12 complet ; le module Patrimoine n'est touche qu'a la marge, sans regression sur les programmes non lies.

---

## Phase 14: Polish & Cross-Cutting

- [ ] T108 [P] Ajouter la section `finance` (Fournisseurs, Chantiers, Pieces a valider) dans `apps/web/src/navigation/model.tsx`, en complement des entrees deja posees par le lot 1
- [ ] T109 [P] Etendre l'acces menu par role pour les nouvelles entrees
- [ ] T110 Executer l'integralite de la suite de caracterisation du lot 0 et verifier que seuls les cas documentes par `data-model.md` §2 different de l'etat du lot 1
- [ ] T111 Executer la suite locative, copropriete et Patrimoine completes, verifier zero regression non voulue
- [ ] T112 Executer la suite de tests backend et frontend du module finance
- [ ] T113 Rediger `docs/finance/LOT-2-RAPPORT.md` selon le rituel des rapports de lot, en rappelant que l'organisation de la caisse (caisse unique par tenant, gestionnaire emettrice, dirigeant validateur) est une decision actee le 18 septembre 2026, et non une hypothese du lot

---

## Dependencies & Execution Order

- Phase 1 (migration) -> Phase 2 (US1) obligatoires avant toute autre user story : aucune piece de ce lot ne peut s'ecrire avant que le chemin `postDocumentEntryTx` et le plan de comptes operationnel n'existent.
- US2 (fournisseur) ne depend que de US1.
- US3 (facture) depend de US1 et US2 ; son imputation reelle (au-dela du brouillon) depend de US7 (chantier). Les deux peuvent etre menees en parallele jusqu'a l'etape de validation.
- US4 (reglement) depend de US3 (il lui faut des factures a regler).
- US5 (balance fournisseurs) et US6 (releve fournisseur) reutilisent `lib/finance/reports.ts` generalise en US1 ; ils peuvent demarrer des que US2 et US3 fournissent des donnees a agreger.
- US7 (chantier), US8 (cout reel), US9 (detail) forment une chaine : US8 et US9 lisent ce que US3/US10 imputent, mais leur code (agregation, endpoint) peut etre ecrit des que US7 existe, avant meme que US3/US10 ne produisent de vraies imputations.
- US10 (caisse) depend de US1 (chemin d'ecriture) et US7 (chantier) ; independante de US3/US4.
- US11 (validation) depend de l'existence d'au moins une nature de piece brouillon (US3 au minimum) mais sa mecanique (file, filtre) est ecrite une fois pour toutes les natures.
- US12 (lien WorkProgram) depend de US7, US8 et de la fonction d'imputation de US3/US10 (elle re-synchronise a chaque imputation validee) ; c'est la derniere story fonctionnelle du lot, coherent avec sa priorite P3.
- Polish en dernier.

## Parallel Opportunities

- T003/T004/T005 sequentiels (meme fichier `schema.prisma` et meme migration), mais T008/T009 en parallele une fois la migration rejouee.
- Les taches de tests marquees `[P]` de chaque phase en parallele entre elles ; backend et frontend en flux separes une fois les fonctions de `lib/finance/` disponibles pour la story.
- US5/US6 (rapports fournisseurs) et US7/US8/US9 (chantier) sont deux flux independants une fois US1-US4 livrees ; parallelisables entre deux binomes d'agents.
- T108/T109 (navigation) des que les routes frontend de chaque story existent.

## Implementation Strategy

### MVP First

1. Phase 1 + Phase 2 (migration, generalisation, non parallelisable en substance -- c'est le risque du lot, traite en premier et isolement).
2. US2 + US3 + US4 (cycle fournisseur complet : creer, facturer, imputer, regler).
3. US7 + US8 (chantier et cout reel derive -- la seconde moitie de la demonstration).
4. US5 + US6 (balance et releve fournisseurs, symetriques du lot 1).
5. US11 (validation), des qu'une piece existe a valider.
6. US9, US10, US12 (detail, caisse, lien Patrimoine).
7. Polish, recette, rapport de fin de lot.

### Incremental Delivery

1. Release A : generalisation seule, verifiee par la suite de caracterisation (aucune valeur demontrable pour l'utilisatrice, mais le risque du lot est leve en premier).
2. Release B : cycle fournisseur (US2-US6).
3. Release C : chantier et imputation (US7-US9, US12).
4. Release D : caisse et validation (US10-US11).
