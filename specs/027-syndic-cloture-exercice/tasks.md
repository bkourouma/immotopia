# Tâches — clôture d'exercice du module Syndic

**Entrées** : [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md),
[contracts/openapi.yaml](./contracts/openapi.yaml)
**Statut** : proposition. **Aucune tâche n'est engagée** : la décision du 29/09/2026
est de spécifier seulement.

**Tests** : requis pour chaque lot (mouvements financiers, verrou, isolation
multi-tenant, portail).

## Format : `[ID] [P?] [Lot] Description` (fichier ; critère)

- `[P]` : peut se faire en parallèle (fichiers différents, dépendances levées).
- `Lot` : C0 à C6, voir [plan.md](./plan.md) §7. CA : critère d'acceptation de
  [spec.md](./spec.md) §10.
- Chemins : `packages/api/…` (API), `apps/web/src/…` (web). Ne pas modifier
  `queries.ts` au-delà d'un appel de garde d'une ligne par fonction.

## Phase 0 — Décisions à obtenir avant le lot concerné

- [ ] T000a Trancher **Q1 et Q2** (référentiel, comptes, affectation du résultat) avec un expert-comptable ; consigner dans l'ADR-005 et dans `data-model.md` §2.5 (bloque C0, C1, C2).
- [ ] T000b Trancher **Q3, Q4, Q5** (cadre légal, deux temps, réouverture) avec un juriste (bloque C2, C4).
- [ ] T000c Trancher **Q8, Q9, Q14, Q15** (régularisation, séparation des tâches, mutation de lot, annulation) (bloque C2, C5).
- [ ] T000d Trancher **Q6, Q7, Q11, Q12, Q13** (exercices décalés, budget provisoire, comptes bancaires, portail, avoirs) : chacun peut être différé sans bloquer C0 à C2.

## Lot C0 — Socle : exercice, garde, paramétrage

**But** : verrou fiable de toutes les écritures datées, exercice modélisé, balance
par exercice, paramétrage comptable. Aucune clôture encore.

- [ ] T001 [C0] Ajouter enums `SyndicFiscalYearStatus`, `SyndicAccountsApprovalStatus` et modèles `SyndicFiscalYear`, `SyndicClosingSettings` dans `packages/api/prisma/schema.prisma` (data-model §1, §2.1, §2.5) ; relations inverses `Tenant`, `Syndicate`, `GeneralMeeting`, `GMResolution`.
- [ ] T002 [C0] Ajouter les colonnes `SyndicateFundMovement.occurredAt` (+ index), `SyndicateFund.equityAccountId`, `SyndicateBudget.incomeAccountId`, `JournalEntry.closingId` et `lockedByClosingId` (data-model §3).
- [ ] T003 [C0] Générer la migration du lot `<horodatage>_syndic_cloture_socle` (additive, une migration par lot, data-model §6) avec la reprise de `occurred_at` (data-model §6) et le `rollback.sql` ; l'appliquer sur une copie de la base de démonstration ; vérifier la version de PostgreSQL (CA-32, 38).
- [ ] T004 [C0] `npx prisma generate` depuis `packages/api` (hors jonction partagée).
- [ ] T005 [C0] Créer `middleware/syndic-fiscal-year-rbac-middleware.ts` et `prisma/seeds/syndic-fiscal-year-permissions-seed.ts` ; l'appeler avant la boucle générique de `rbac-seed.ts` (CA-28).
- [ ] T006 [C0] `lib/syndics/fiscal-year.ts` : `ensureFiscalYearTx`, lecture, dates calendaires (CA-01).
- [ ] T007 [C0] `lib/syndics/fiscal-year-guard.ts` : `assertFiscalYearOpenTx` généralisé (ensure + `FOR SHARE`), erreur `FiscalYearClosedError` (409, code `FISCAL_YEAR_CLOSED`) ; renommer l'existant de `provider-invoice-accounting.ts` en `assertBudgetYearOpenTx` sans changer son comportement, et l'appeler à côté du nouveau garde dans `provider-invoices.ts` (CA-11).
- [ ] T008 [P] [C0] Test unitaire des gardes : exercice `CLOSED`, exercice ouvert, ligne absente (créée puis ouverte), règle du budget `CLOSED` inchangée et limitée aux factures et paiements de prestataires (`__tests__/unit/syndic-fiscal-year.guard.test.ts`).
- [ ] T009 [C0] Poser le garde dans chaque opération de FR-040 : `createJournalEntryBySyndicate`, `createOwnerAccountAdjustmentByLot`, `createLatePaymentPenaltyForChargeCall`, `createChargeCallAndUpdateStatus`, `createChargeCallBatchWithCallsTx`, `createBudgetBySyndicate`, `recordLotPaymentTx`, exécution de programmation (`charge-schedule-runner.ts`) — **en premier** dans la transaction (ordre des verrous, plan §4.2).
- [ ] T010 [C0] Annulations de facture et de paiement de prestataire : tester la date **propre** de la pièce (FR-044) ; adapter les tests existants qui annulent après clôture de budget (CA-13).
- [ ] T011 [C0] FR-005 : refuser (422) une écriture dont la date sort de l'exercice de son journal dans `createJournalEntryBySyndicate` (CA-34).
- [ ] T012 [C0] Écrire `occurredAt` sur tous les mouvements de fonds (`recordFundMovementTx` : paramètre explicite ; paiements de charges, imputations d'avance, paiements et annulations de prestataires, ajustements manuels, ouverture) (CA-32).
- [ ] T013 [C0] `balance` et `grand-livre` : paramètre `exercice` ; défaut inchangé sans paramètre (CA-31).
- [ ] T014 [P] [C0] `lib/syndics/fiscal-year-settings.ts` : lecture et écriture du paramétrage, vérification d'appartenance de chaque compte et fonds, `ensureClosingAccountsTx` (plan minimal), `ensureOdJournalTx`.
- [ ] T015 [P] [C0] `lib/syndics/fiscal-year-schemas.ts` (Zod `.strict()`), `controllers/syndic-fiscal-year-controller.ts`, `routes/syndic-fiscal-year-routes.ts` : `GET/POST exercices`, `GET exercices/:year`, `PATCH exercices/:year`, `parametres-cloture`, `plan-minimal` ; monter dans `src/index.ts`.
- [ ] T016 [C0] Actions d'audit dans `types/audit-types.ts` ; audit du paramétrage (CA-37).
- [ ] T017 [P] [C0] Tests API du lot : huit refus datés en exercice clos (le clos est simulé en posant `status = CLOSED` sur la ligne d'exercice, dans les tests seulement), balance par exercice, permissions, isolation entre agences, budget `CLOSED` sans clôture d'exercice (`__tests__/api/syndic-fiscal-year.routes.test.ts`) ; `routes-inventory`, `schema-tenant-coverage` (CA-27, 39, 44, 47).
- [ ] T018 [P] [C0] Web : `types/syndic-fiscal-year-types.ts`, `services/syndic-fiscal-year-service.ts` ; page `pages/syndics/SyndicFiscalYears.tsx` (liste en lecture) ; onglet « Exercices » (`SyndicWorkspaceLayout.tsx`) ; route `React.lazy` (`App.tsx`).
- [ ] T019 [C0] Web : écran de paramétrage comptable (comptes, comptes de capitaux propres des fonds, bouton « Créer le plan minimal ») ; sélecteur d'exercice et bandeau « Exercice clos » dans `SyndicAccounting.tsx`.
- [ ] T020 [C0] i18n (API et web), wiki, ADR-005, `SECURITY.md`, `DATA_MODELS.md`, HANDOFF.

**Point de contrôle C0** : la suite Syndic existante passe ; aucun exercice ne peut encore être clos par l'utilisateur ; la règle du budget `CLOSED` se comporte exactement comme avant.

## Lot C1 — Contrôles et aperçu (lecture seule)

- [ ] T021 [C1] Ajouter `SyndicBankCheck` (data-model §2.6) ; routes `releves-bancaires` (lecture, écriture, suppression, refusées si l'exercice est clos).
- [ ] T022 [C1] `lib/syndics/fiscal-year-figures.ts` : agrégations SQL par exercice — appelé par période et par nature, encaissé, pénalités, remises, ajustements, dépenses par fonds et par compte, mouvements de fonds par `occurredAt` (aucune boucle par lot).
- [ ] T023 [P] [C1] `fiscal-year-result.ts` : résultat par fonds, calcul pur ; variante en lot des parts de fonds avec test d'égalité contre `fundSharesForCallTx` (CA-03, 07).
- [ ] T024 [P] [C1] `fiscal-year-entries.ts` : constructeurs purs `APP`, `TRV`, `PEN`, `AJU`, `ENC`, `AFF`, `OUV` ; chaque écriture équilibrée ; test sur le jeu de référence (montants du spec §9).
- [ ] T025 [C1] `fiscal-year-checks.ts` : catalogue `CLO-B01` à `CLO-I03` (spec FR-013), seuils en constantes nommées ; lectures pures (aucun rapprochement en base) (CA-02, 10).
- [ ] T026 [C1] `fiscal-year-preview.ts` : solde de lot à la date d'arrêté avec rapprochement simulé en mémoire, instantanés, rapprochement de trésorerie, empreinte SHA-256 canonique (CA-05, 06).
- [ ] T027 [P] [C1] Tests unitaires : constructeurs, résultat par fonds, catalogue, stabilité de l'empreinte avant et après rapprochement réel, contrôles et aperçu sans effet de bord, ajustement manuel, solde de relevé (`syndic-fiscal-year.{entries,result,checks,preview-hash}.test.ts`) (CA-41, 42, 43).
- [ ] T028 [C1] Routes `GET …/controles` et `GET …/apercu-cloture` (permissions `VIEW` et `PREPARE`).
- [ ] T029 [C1] Fixture d'intégration « Flamboyants » : rejoue les parties E à L du scénario avec dates explicites ; réutilisée par les lots suivants (`__tests__/helpers/fixtures-fiscal-year.ts`).
- [ ] T030 [P] [C1] Web : composants `ClosingChecksPanel`, `TreasuryPanel`, `BankChecksTable`, `ClosingPreviewPanel` ; assistant en étapes (paramétrage, contrôles, trésorerie, aperçu) dans `SyndicFiscalYears.tsx`.
- [ ] T031 [C1] Test de charge de l'aperçu (300 lots) : `scripts/syndic-fiscal-year-load-test.ts` (CA-30, aperçu ≤ 5 s).
- [ ] T032 [C1] i18n, wiki, HANDOFF.

## Lot C2 — Clôture, ouverture de N+1, réouverture

- [ ] T033 [C2] Ajouter `SyndicFiscalYearClosing`, `SyndicClosingLotBalance`, `SyndicClosingFundBalance` (data-model §2.2 à §2.4) et migration additive.
- [ ] T034 [C2] Élargir `postSyndicEntryTx` et `reverseSyndicEntryTx` (`sourceType = MANUAL`, `closingId`, date de contre-passation explicite) ; extraire `reconcileOwnerAccountLedgerForLotTx` de `queries.ts` (la version actuelle ouvre sa propre transaction) sans changer son comportement.
- [ ] T035 [C2] `fiscal-year-close.ts` : transaction unique (plan §4.4) ; verrou consultatif de copropriété, `FOR UPDATE` d'exercice, rapprochement des lots triés, recalcul et comparaison d'empreinte, pose des écritures, verrouillage en bloc, budgets `CLOSED`, échéanciers `COMPLETED`, instantanés, exercice N+1 et `OUV-(N+1)` (CA-04, 06 à 10, 33).
- [ ] T036 [C2] `fiscal-year-reopen.ts` : conditions, contre-passations, restauration, versions (CA-14, 15).
- [ ] T037 [C2] Routes `POST …/cloture` et `POST …/reouverture` ; erreurs typées `ClosingBlockedError`, `PreviewStaleError`, `WarningsNotAcknowledgedError` ; audit après validation.
- [ ] T038 [P] [C2] Test d'intégration du flux complet sur le jeu de référence : aperçu → clôture → contrôles des chiffres du spec §9 → règlement de B02 en N+1 (CA-12) → réouverture → version 2 (`syndic-fiscal-year.close-flow.test.ts`).
- [ ] T039 [P] [C2] Test de concurrence à deux connexions (paiement daté N pendant la clôture ; après la clôture) ; absence d'interblocage (CA-29) (`…concurrency.test.ts`).
- [ ] T040 [P] [C2] Tests de refus : bloquants, avertissements non reconnus, séquence des exercices, aperçu périmé, double clôture (CA-09, 10).
- [ ] T041 [C2] Web : étape « Confirmer » (avertissements reconnus un à un, note pour `CLO-W02`, empreinte), boutons « Clôturer » et « Rouvrir » (motif), affichage de l'exercice clos ; état d'exercice dans `SyndicBudgets.tsx` et `SyndicAccounting.tsx`.
- [ ] T042 [C2] Revue `security-auditor` (droits, verrou, contre-passation) et revue dédiée de l'ordre des verrous ; test de charge de la clôture (CA-30, clôture ≤ 15 s).
- [ ] T043 [C2] i18n, wiki, scénario de recette N réécrit (N.6, N.7, N.8, N.11), HANDOFF.

## Lot C3 — Dossier de comptes et portail

- [ ] T044 [C3] `fiscal-year-dossier-pdf.ts` (pdf-lib, en-tête via `resolveDocumentBranding`) : page de garde, état financier, fonds, trésorerie, créances, dettes, balance (contenu à valider par l'expert-comptable, Q1).
- [ ] T045 [C3] `fiscal-year-dossier-files.ts` : stockage privé, lecture par route authentifiée, reconstruction à l'identique depuis `summary` si le fichier manque ; génération après validation de la clôture, échec journalisé.
- [ ] T046 [C3] Routes `GET …/dossier` et `PUT …/dossier/publication` (CA-25).
- [ ] T047 [P] [C3] Portail : `GET /portal/copropriete/coproprietes/:syndicId/exercices` et `…/:year/dossier` (`resolveCoOwnerScope`, masquage avant acquisition, limiteur PDF) ; ligne « Solde reporté au 01/01/N+1 » dans le relevé de lot et son PDF (CA-26).
- [ ] T048 [P] [C3] Test `portal-no-disk-paths` étendu ; tests d'isolation portail (autre copropriété, autre agence).
- [ ] T049 [P] [C3] Web : bouton « Télécharger le dossier » et « Publier » ; page portail `FiscalYears.tsx` ; ligne « Solde reporté » dans `SyndicOwnerAccount.tsx`.
- [ ] T050 [C3] _(optionnel)_ export tableur de la balance et du grand livre par exercice.
- [ ] T051 [C3] Revue `security-auditor` (fichiers privés, portail) ; i18n, wiki, HANDOFF.

## Lot C4 — AG et approbation

- [ ] T052 [C4] Enum `GmResolutionKind` et colonne `GMResolution.resolutionKind` (migration additive) ; schémas Zod de création et de modification des résolutions.
- [ ] T053 [C4] `fiscal-year-approval.ts` : `soumission-ag` (création ou rattachement d'une AG, quatre résolutions typées, majorité par défaut) ; `constat-approbation` (résultat relu par `computeResolutionTally`, AG `COMPLETED` exigée) (CA-16, 17).
- [ ] T054 [C4] FR-066 : refuser `approvedByResolutionId` désignant une résolution `REJECTED` dans `updateBudgetBySyndicate` (CA-18) ; adapter les tests existants.
- [ ] T055 [C4] Visa (`reviewedBy`, `reviewedAt`) et date limite indicative : `PATCH exercices/:year` ; mention sur le dossier.
- [ ] T056 [P] [C4] Tests : scénario N.9 rejoué (résolution 1 approuvée 900 contre 100), rejet, AG non clôturée, réouverture après rejet, date limite indicative dépassée (CA-46).
- [ ] T057 [P] [C4] Web : `ApprovalPanel` (soumettre, constater), badge « Approbation des comptes N » sur la fiche d'AG, résultat au portail (complète CA-26).
- [ ] T058 [C4] i18n, wiki, HANDOFF.

## Lot C5 — Régularisation après le vote

- [ ] T059 [C5] Enums `ChargePaymentKind`, `SyndicRegularisationDecision`, modèles `SyndicRegularisation`, `SyndicRegularisationLine`, colonne `ChargePayment.kind` ; migration ; **vérifier la version de PostgreSQL** (`ADD COLUMN … DEFAULT`).
- [ ] T060 [C5] Adapter les cinq consommateurs de `ChargePayment` (plan §4.6) : reçus, crédits de fonds (filtre dans `creditFundsForAllocationsTx`, y compris pour les imputations d'avance d'une création d'appels ordinaire), encaissements, « Mes paiements » du portail, `getFinanceSummaryBySyndicate` (`totalCashReceived`) ; **un test par consommateur** (CA-22).
- [ ] T061 [P] [C5] `fiscal-year-regularisation-plan.ts` : calcul pur, réutilise `distributeLineAmount` (à exporter) ; tests sur le jeu de référence (CA-19) et sur un jeu à déficit.
- [ ] T062 [C5] `fiscal-year-regularisation.ts` : aperçu et application atomique (lots triés, `applyLotAdvanceTx`, appels de régularisation, écriture `REG`, unicité par exercice) (CA-20, 21, 23, 24).
- [ ] T063 [C5] Routes `GET …/regularisation/apercu` et `POST …/regularisation` (permission `CLOSE`).
- [ ] T064 [P] [C5] Tests d'intégration : `SETTLE_PER_LOT` du jeu de référence (B02 à 183 630, avances des sept autres lots), échec au 5ᵉ lot sans reste, `KEEP_IN_FUND`, imputation sur le T1 2027 sans crédit de fonds, seconde application refusée après `KEEP_IN_FUND` (CA-45) (`…regularisation.test.ts`).
- [ ] T065 [P] [C5] Web : `RegularisationPanel` (aperçu lot par lot, décision, confirmation renforcée).
- [ ] T066 [C5] Revue `security-auditor` (comptes de lots) ; i18n, wiki, scénario N.10 réécrit, HANDOFF.

## Lot C6 — Compléments (indépendants)

- [ ] T067 [C6] Reprise des soldes du premier exercice : `GET/POST …/reprise-soldes` (proposition d'après les fonds et les lots, validation, écriture `OUV-N`) (CA-35).
- [ ] T068 [C6] `POST …/budget-suivant` : copie des postes du budget de N en brouillon, base prévisionnel ou réalisé (CA-36).
- [ ] T069 [C6] Écran « Comptes bancaires » (CRUD `SyndicPaymentMethod`) si Q11 le retient.
- [ ] T070 [C6] Alerte de fin d'exercice (notification au gestionnaire à l'approche du 31/12 et quand un exercice clos n'est pas approuvé au-delà de la date limite) ; budget provisoire si Q7 le retient.

## Dépendances

C0 → C1 → C2 → C4 → C5 ; C3 en parallèle de C4 ; C6 après C2. Chaque lot est livrable
seul (voir spec §11). T000a à T000c précèdent respectivement C0-C1, C2-C4 et C2-C5.

## Vérifications à la fin de chaque lot

`npm run typecheck`, `npm run lint`, `npm run check:architecture`, tests ciblés
puis `npm test` et `npm run test:web`, `npm run test:isolation`,
`npm run i18n:extract`, `npm run wiki:export` et `npm run wiki:check`,
`code-reviewer` ; recette navigateur sur la démo isolée pour un lot visible.
