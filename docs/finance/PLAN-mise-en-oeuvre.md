# Plan de mise en œuvre — Gestion financière opérationnelle et suivi des chantiers

|                     |                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Document source** | PRD « Gestion financière opérationnelle et suivi des chantiers » v0.1 du 18 septembre 2026                        |
| **Dépôt**           | ImmoTopia (monorepo `packages/api` Express + Prisma, `apps/web` React + Ant Design)                               |
| **Date**            | 18 septembre 2026                                                                                                 |
| **Statut**          | Décisions de conception actées le 18 septembre 2026 (§ 12) ; lot 0 peut s'ouvrir après fusion de la refonte lot 2 |

---

## 1. Ce que le code confirme, et ce qu'il corrige dans le PRD

Toutes les affirmations ci-dessous ont été vérifiées dans le dépôt le 18 septembre 2026.

### 1.1 Réponses aux trois questions techniques du PRD (§ 14, points 10 à 12)

**Q10 · Le verrouillage des écritures est-il effectif ?** Partiellement. `JournalEntry.isLocked` existe, `lockJournalEntryBySyndicate` le positionne (`packages/api/src/lib/syndics/queries.ts:2899`), et aucune fonction de modification ou de suppression d'écriture n'est exposée : une écriture est donc de fait immuable après création. Mais le verrouillage est **manuel** (un appel dédié), jamais automatique. Le principe P-6 demande l'inverse : verrouillage à la validation de la pièce. À poser dans le lot 2 lors de la généralisation, pas un blocage.

**Q11 · Comment un paiement non affecté est-il traité ?** Le reliquat reste sur le paiement : `allocatePayment` calcule `montant − Σ allocations` et refuse si c'est nul (`rental-payment-service.ts:154`). Il n'existe ni compte créditeur ni notion d'avance ; l'allocation est restreinte aux échéances du **même bail**. Conséquence utile : l'« avance » de B4 n'a pas besoin de table nouvelle. C'est le reliquat non alloué d'un paiement, et la campagne de facturation (B3) l'impute en créant une `RentalPaymentAllocation` sur l'échéance qu'elle génère.

**Q12 · `MaintenanceVendor` devient-il un `Supplier` ?** Coexistence recommandée. `MaintenanceVendor` est un modèle léger (nom, téléphone, spécialités, tickets assignés) sans montant ni compte. Un `Supplier` distinct, avec un lien optionnel `maintenanceVendorId`, évite de toucher au module Maintenance. La fusion pourra être décidée plus tard si les mêmes noms apparaissent des deux côtés.

### 1.2 Écarts entre le PRD et l'existant

| Sujet                          | PRD                                               | Code                                                                                                                                                                                         | Conséquence                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Génération des échéances       | « Facturation du mois pour tous les baux actifs » | `generateInstallments` travaille **par bail**, génère toute la durée du bail d'un coup, et refuse s'il existe déjà une échéance (`rental-installment-service.ts:94-121`)                     | B3 exige un **nouveau** générateur par période et par tenant. La contrainte unique `(lease_id, period_year, period_month)` fournit l'idempotence gratuitement.                                                                                     |
| `OwnerAccount`                 | « Généraliser en `ThirdPartyAccount` »            | `lotId` est **obligatoire et unique** ; le contact est un `CrmContact` alors que le locataire est un `TenantClient`                                                                          | Généraliser la table en place casserait la copropriété. Créer `ThirdPartyAccount` à côté, et partager le **code** (calcul de `balanceAfter`) plutôt que la table.                                                                                  |
| Précision monétaire            | « `Decimal(14,2)` vérifié sur tous les modèles »  | `JournalEntryLine.debit/credit` et tout le locatif (`RentalInstallment`, `RentalPayment`, allocations) sont en `Decimal(12,2)` ; le locatif porte la devise `"FCFA"`, la copropriété `"XOF"` | Sans risque d'arrondi, mais la nouvelle couche doit normaliser la devise (un seul code) et les nouvelles tables naissent en `14,2`.                                                                                                                |
| Plan de comptes                | « Portée `tenantId`, `syndicateId` optionnel »    | `ChartOfAccount` et `AccountingJournal` n'ont **pas** de `tenantId` ; unicité `(syndicateId, accountNumber)` ; cascade sur la copropriété                                                    | Ajouter `tenantId` avec rétro-remplissage depuis `Syndicate`, rendre `syndicateId` nullable, et remplacer l'unicité par deux index partiels (un pour la copropriété, un pour les opérations) car PostgreSQL considère deux `NULL` comme distincts. |
| Balance                        | « Fonctionnelle »                                 | `getTrialBalanceBySyndicate` charge toutes les lignes en mémoire et agrège en JavaScript (`queries.ts:2925`)                                                                                 | Correct pour une copropriété, insuffisant pour l'exigence « 500 tiers en moins de 3 s ». La balance des tiers se calculera par `groupBy` SQL et dernier `balanceAfter`.                                                                            |
| `WorkProgram`                  | « Devient `ConstructionSite` »                    | Table `work_programs` utilisée par le module Patrimoine (page, endpoint agrégé, `dashboard-service`, test `patrimoine.work-programs.test.ts`)                                                | **Nouvelle table `ConstructionSite`** (décision actée). `WorkProgram` reste l'objet « travaux sur bien existant » du Patrimoine et reçoit un `constructionSiteId` optionnel pour dériver son coût réel d'un chantier. Rien n'est renommé.          |
| Couverture de tests comptables | « Les tests `syndics.accounting` passent »        | 4 tests API et 7 unitaires sur la comptabilité, 5 sur les comptes de lot, 3 sur les budgets                                                                                                  | Trop mince pour servir de garde-fou à une généralisation. Des tests de caractérisation sont à écrire **avant** de toucher au schéma (lot 0).                                                                                                       |

### 1.3 Conventions du dépôt que le plan réutilise

- **Spécifications** : un dossier par module sous `specs/NNN-nom/` avec `spec.md`, `plan.md`, `data-model.md`, `research.md`, `tasks.md`, `contracts/`. Le prochain numéro libre est `016`.
- **Backend** : logique de domaine dans `src/lib/<module>/` (`schemas.ts` Zod, `queries.ts`, utilitaires), contrôleurs enveloppés dans `asyncHandler`, erreurs typées de `lib/errors.ts`, routes montées dans `src/index.ts`.
- **Droits** : un middleware RBAC par module (`rental-rbac-middleware.ts`) et un seed de permissions par module (`prisma/seeds/rental-permissions-seed.ts`), accès aux menus par rôle via `RoleMenuAccess`.
- **Jobs** : `node-cron` dans `src/jobs/` (modèle : `penalty-calculation-job.ts`).
- **Tests** : Jest dans `packages/api/__tests__/{api,unit,integration}` avec middlewares mockés ; Vitest dans `apps/web/src/__tests__/`.
- **Frontend** : React Query, primitives `DataView`, `PageHeader`, `MoneyValue`, `StatCard`, `StatusTag` ; état de liste dans l'URL ; navigation dans `navigation/model.tsx` par `section`.
- **Fin de lot** : un rapport `docs/refonte/LOT-n-RAPPORT.md`. Le même rituel est proposé ici sous `docs/finance/`.

---

## 2. Décisions de conception

Toutes actées le 18 septembre 2026 (détail au § 12). Chacune est justifiée par un constat du § 1.

**D1 · Deux tables de tiers, un seul code de grand livre.** `ThirdPartyAccount` et `ThirdPartyMovement` sont créées à côté de `OwnerAccount`. La fonction qui calcule `balanceAfter` (`appendOwnerAccountTransactionTx`, `queries.ts:214`) est extraite dans `src/lib/finance/ledger.ts` et sert aux deux. La copropriété n'est pas migrée ; elle pourra l'être plus tard par une vue de compatibilité, ou jamais. P-5 est respecté au niveau du moteur, pas au niveau du stockage.

**D2 · Le lot 1 n'écrit aucune écriture en partie double.** Pour un locataire, la pièce est l'échéance, le règlement, la pénalité. Le compte de tiers suffit à produire balance et relevé. Les écritures de journal n'apparaissent qu'au lot 2 avec les fournisseurs, où elles deviennent nécessaires pour la symétrie dettes / créances. Cela fait du lot 1 un lot sans migration sensible, conforme à § 11 du PRD.

**D3 · Le compte de tiers est alimenté dans la transaction métier, et reconstructible.** Chaque service locatif qui fait bouger une créance (échéance passée à `DUE`, paiement `SUCCEEDED` alloué, pénalité appliquée, annulation) appelle le grand livre **dans sa propre transaction Prisma**. Une fonction `rebuildThirdPartyAccount(accountId)` rejoue l'historique depuis les pièces : elle sert au rétro-remplissage initial, à la reprise (§ 10 « Reprise ») et à la réconciliation si une divergence apparaît.

**D4 · La campagne de facturation est un objet.** `RentBillingRun` porte le libellé de période, la liste des baux traités et exclus avec motif, et l'horodatage. Elle réutilise le calcul de montant d'une échéance, extrait de `generateInstallments` en une fonction pure `buildInstallmentForPeriod`. L'idempotence repose sur la contrainte unique existante. La campagne applique les reliquats non alloués (avances, B4) avant de clore.

**D5 · Le chantier est une nouvelle entité `ConstructionSite`.** Table `construction_sites` portée par `tenantId`, avec `propertyId?`, `landLeaseId?`, `zone`, `managerId?`, `status`, `startDate`, `plannedEndDate?`, `progressPercent`, `closedAt?`, `finalCost?`, `budgetThresholdPercent?`, `stockEnabledAt?`. `actualCost` n'est **pas** une colonne : il est calculé (somme des `CostAllocation` validées) et exposé par l'API. `WorkProgram` est conservé pour les travaux sur bien existant et reçoit un `constructionSiteId?` : quand il est renseigné, son `actualCost` est dérivé du chantier et n'est plus saisissable, ce qui satisfait P-4 sans toucher au module Patrimoine.

**D6 · La généralisation comptable est additive et protégée.** `tenantId` ajouté et rétro-rempli, `syndicateId` rendu nullable, `scope` ∈ {SYNDICATE, OPERATIONS}, index partiels d'unicité. Toutes les fonctions `*BySyndicate` gardent leur signature ; les nouvelles fonctions opérationnelles vivent dans `lib/finance/`. Le verrouillage devient automatique pour toute écriture née d'une pièce.

**D7 · Une seule famille de droits, saisie et validation séparées.** Permissions `finance.documents.create`, `finance.documents.validate`, `finance.accounts.read`, `finance.sites.manage`, `finance.reports.read`, `finance.settings.manage`, portées par un `finance-rbac-middleware.ts` et un seed dédié. L'organisation cible est **plusieurs saisisseurs, un validateur** : toute pièce porte `createdByUserId` et `validatedByUserId`, la validation est un appel distinct de la création, et le lot 2 livre une file « Pièces à valider ».

**D9 · Devise.** Les nouvelles tables stockent `XOF` ; le grand livre normalise à l'écriture ; l'affichage passe par `MoneyValue` et dit « FCFA ». Le locatif existant n'est pas migré.

**D10 · Reprise.** Le lot 1 se limite au rétro-remplissage depuis les échéances, paiements et pénalités déjà en base. La pièce « solde initial » et l'import par tiers arrivent au lot 2. La cliente tient aujourd'hui ses comptes sur tableur : un export est à obtenir pendant le lot 0 pour calibrer les colonnes de la balance et préparer cet import.

**D8 · Vocabulaire.** Le libellé des écrans et des routes est celui de la gestionnaire : « facturer », « régler », « imputer ». Les mots « débit » et « crédit » n'apparaissent que dans les tables de la base et dans l'écran Comptabilité de la copropriété, déjà existant.

---

## 3. Découpage en lots

Le phasage du PRD est conservé. Un lot 0 de préparation est ajouté : il coûte peu et évite de généraliser un moteur mal couvert par les tests.

| Lot   | Contenu                                                                                                                      | Épopées            | Entrée                                         | Sortie                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **0** | Préparation                                                                                                                  | —                  | Fusion de `feat/refonte-lot-2` dans `main`     | Spécification 016 écrite, tests de caractérisation verts, branche ouverte, export tableur de la cliente obtenu |
| **1** | Compte de tiers locataire, balance, relevé, campagne, avances, balance âgée                                                  | E1 partiel, E2     | Lot 0                                          | Démonstration en visioconférence sur les données existantes                                                    |
| **2** | Moteur comptable généralisé, fournisseurs, factures, règlements, caisse, chantier, imputation, coût réel, file de validation | E1 complet, E3, E4 | Lot 1 livré, questions 3 à 7 du § 14 tranchées | Balance fournisseurs et coût réel de chantier dérivé                                                           |
| **3** | Budget, avenants, bons de commande, engagé, alerte, avancement, tableau de bord                                              | E5                 | Lot 2                                          | Écart budget / engagé / réalisé sur chaque chantier                                                            |
| **4** | Bailleurs, associations, salaires, tâcherons, retenue, coût par lot, clôture                                                 | E6, E7, E8         | Lot 3                                          | Bascule au patrimoine                                                                                          |
| **5** | Stock                                                                                                                        | E9                 | Besoin confirmé, lot 2 livré                   | Coût matériaux depuis les sorties                                                                              |

### 3.1 Ordre de travail à l'intérieur d'un lot

Le même ordre à chaque lot, pour que chaque étape soit vérifiable seule :

1. `data-model.md` et migration Prisma, additive, testée sur une copie de la base de démonstration.
2. `lib/finance/schemas.ts` (Zod) et `lib/finance/queries.ts` ou sous-modules, avec tests unitaires.
3. Contrôleur, routes, permissions, seed RBAC, avec tests API (middlewares mockés, comme `syndics.accounting.test.ts`).
4. Types et service frontend, puis pages, puis tests Vitest.
5. Entrées de navigation et accès menu par rôle.
6. Rapport de fin de lot et mise à jour de `docs/README.md`.

---

## 4. Lot 0 — Préparation

**Objectif.** Ne rien construire sur un socle non couvert par les tests, et figer les décisions ouvertes.

| #   | Tâche                                                                                                                                                                                                                                                                                            | Fichiers                                                                                                            | Vérification                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 0.1 | Créer la branche `feat/finance-lot-1` **depuis `main` une fois `feat/refonte-lot-2` fusionnée**. La branche actuelle porte 114 fichiers modifiés non commités ; démarrer dessus mélangerait deux chantiers.                                                                                      | —                                                                                                                   | `git status` propre                                     |
| 0.2 | Écrire `specs/016-finance-operationnelle/` : `spec.md` (dérivé du PRD), `plan.md`, `data-model.md` du lot 1, `research.md` reprenant le § 1 de ce document, `tasks.md`                                                                                                                           | `specs/016-…`                                                                                                       | Relecture par l'auteur du PRD                           |
| 0.3 | Tests de caractérisation de la comptabilité copropriété : création de plan, de journal, d'écriture équilibrée et déséquilibrée, verrouillage, balance sur période, relevé de compte de lot avec solde d'ouverture. Ils décrivent le comportement **actuel** et deviennent le garde-fou du lot 2. | `__tests__/api/syndics.accounting.characterization.test.ts`, `__tests__/unit/syndics.owner-accounts.ledger.test.ts` | ≥ 20 cas, tous verts avant toute modification de schéma |
| 0.4 | Extraire `appendOwnerAccountTransactionTx` et `roundMoney` vers `src/lib/finance/ledger.ts` sans changer le comportement                                                                                                                                                                         | `lib/syndics/queries.ts`, `lib/finance/ledger.ts`                                                                   | Tests 0.3 toujours verts                                |
| 0.5 | Extraire de `generateInstallments` une fonction pure `buildInstallmentForPeriod(lease, year, month)`                                                                                                                                                                                             | `services/rental-installment-service.ts`                                                                            | `rental-installment-generation.test.ts` vert            |
| 0.6 | Obtenir un export du tableur actuel de la cliente (balance locataires et, s'il existe, suivi fournisseurs) ; en déduire les colonnes attendues de la balance et le format du futur import de soldes                                                                                              | `specs/016-…/research.md`                                                                                           | Export archivé, colonnes listées dans la spec           |
| 0.7 | Consigner dans la spec les réponses actées : volumes moyens (50 à 200 baux, 50 fournisseurs, 10 chantiers), plusieurs saisisseurs et un validateur, devise `XOF` affichée « FCFA », reprise par rétro-remplissage seul                                                                           | `specs/016-…/spec.md`                                                                                               | Relecture                                               |
| 0.8 | Programmer avec la cliente, avant le lot 2, le point qui tranche les questions 3 à 7 du § 14 (matériaux, budget, ouvriers ou tâcherons, associés, caisse)                                                                                                                                        | —                                                                                                                   | Date fixée                                              |

Taille indicative : une semaine.

---

## 5. Lot 1 — Volet clients

**Objectif.** Transformer la réserve « ce n'est pas chiffré » en démonstration, sans table sensible.

### 5.1 Modèle de données

| Entité               | Champs principaux                                                                                                                                                                                                                            | Notes                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ThirdPartyAccount`  | `tenantId`, `kind` (enum `ThirdPartyKind` : TENANT, SUPPLIER, LANDLORD, CONTRACTOR, PARTNER, EMPLOYEE), `tenantClientId?`, `contactId?`, `supplierId?` (lot 2), `label`, `balance Decimal(14,2)`, `currency`, `isActive`                     | Unicité `(tenantId, kind, tenantClientId)` partielle ; un locataire = un compte par `TenantClient`, pas par bail, pour que le relevé suive la personne |
| `ThirdPartyMovement` | `accountId`, `tenantId`, `movementDate`, `type` (INSTALLMENT, PAYMENT, PENALTY, ADVANCE_APPLIED, WAIVER, ADJUSTMENT, OPENING_BALANCE, VOID), `debit?`, `credit?`, `balanceAfter`, `label`, `sourceType`, `sourceId`, `leaseId?`, `createdAt` | Unicité `(sourceType, sourceId, type)` pour l'idempotence du rejeu ; index `(accountId, movementDate, createdAt)`                                      |
| `RentBillingRun`     | `tenantId`, `periodYear`, `periodMonth`, `label`, `status` (RUNNING, DONE, FAILED), `startedAt`, `finishedAt`, `createdByUserId`, `summary Json` (baux facturés, exclus avec motif, avances appliquées)                                      | Unicité `(tenantId, periodYear, periodMonth)` : relancer met à jour la même campagne                                                                   |

Aucune table existante n'est modifiée. Migration purement additive.

### 5.2 Backend

| #    | Tâche                                                                                                                                                                                                                                                                                                                                                                                                                                      | Fichiers                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Migration `add_finance_third_party_accounts`                                                                                                                                                                                                                                                                                                                                                                                               | `prisma/migrations/…`                                                                                                              |
| 1.2  | `lib/finance/ledger.ts` : `appendMovementTx`, `getOrCreateTenantAccountTx`, `rebuildThirdPartyAccount`                                                                                                                                                                                                                                                                                                                                     | nouveau                                                                                                                            |
| 1.3  | Branchement dans les services locatifs, **dans la transaction existante** : échéance passée à `DUE` (débit), allocation d'un paiement `SUCCEEDED` (crédit), pénalité appliquée (débit), annulation d'échéance ou de paiement (mouvement inverse `VOID`), reliquat non alloué d'un paiement (crédit `ADVANCE`, pour que le compte devienne créditeur)                                                                                       | `rental-installment-service.ts`, `rental-payment-service.ts`, `rental-penalty-service.ts`, `rental-payment-declaration-service.ts` |
| 1.4  | Script de rétro-remplissage `scripts/finance-backfill-tenant-accounts.ts` appelant `rebuildThirdPartyAccount` pour chaque `TenantClient` locataire ; idempotent ; refuse de tourner sans `--tenant`                                                                                                                                                                                                                                        | `packages/api/scripts/`                                                                                                            |
| 1.5  | `lib/finance/billing-run.ts` : campagne par période. Sélectionne les baux `ACTIVE` dont la période est couverte, appelle `buildInstallmentForPeriod`, insère en ignorant les doublons, applique les avances (création de `RentalPaymentAllocation` depuis les paiements au reliquat positif, plus ancien d'abord), écrit le `summary`. Exclusions motivées : bail suspendu, période hors bail, échéance déjà existante, bail sans montant. | nouveau                                                                                                                            |
| 1.6  | `lib/finance/reports.ts` : balance clients (`groupBy` SQL sur les mouvements de la période + dernier `balanceAfter`, obligatoire dès le lot 1 vu les volumes moyens retenus), balance âgée (ventilation par ancienneté d'échéance depuis `RentalInstallment.due_date`), relevé paginé et borné par dates avec solde d'ouverture (même méthode que `getOwnerAccountStatementByLot`)                                                         | nouveau                                                                                                                            |
| 1.7  | Export CSV de la balance (réutiliser l'utilitaire d'export existant s'il y en a un, sinon générer côté serveur) et relevé PDF (modèle `owner-account-statement.ts`)                                                                                                                                                                                                                                                                        | `lib/finance/statement-pdf.ts`                                                                                                     |
| 1.8  | Contrôleur et routes `/api/tenants/:tenantId/finance/…` : `GET clients/balance`, `GET clients/balance-agee`, `GET accounts/:id/statement`, `GET accounts/:id/statement.pdf`, `POST billing-runs`, `GET billing-runs`, `GET billing-runs/:id`                                                                                                                                                                                               | `controllers/finance-controller.ts`, `routes/finance-routes.ts`, montage dans `index.ts`                                           |
| 1.9  | RBAC : `finance-rbac-middleware.ts`, `finance-permissions-seed.ts`, attribution aux rôles existants                                                                                                                                                                                                                                                                                                                                        | `middleware/`, `prisma/seeds/`                                                                                                     |
| 1.10 | Portail locataire : `GET /tenant-portal/…/statement` en lecture seule, borné au `TenantClient` connecté                                                                                                                                                                                                                                                                                                                                    | `tenant-portal-service.ts`, `tenant-portal-routes.ts`                                                                              |

### 5.3 Frontend

| #    | Écran                                                                                                                                               | Route                                                           | Composants                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.11 | Balance clients                                                                                                                                     | `/tenant/:tenantId/finance/clients`                             | `DataView` avec filtres période et bien dans l'URL, total en pied, bouton export, clic ligne → relevé                                            |
| 1.12 | Balance âgée                                                                                                                                        | `/tenant/:tenantId/finance/clients/agee`                        | Même liste, colonnes de tranches, tri                                                                                                            |
| 1.13 | Relevé de compte                                                                                                                                    | `/tenant/:tenantId/finance/comptes/:accountId`                  | Chronologie, `MoneyValue`, solde d'ouverture et de clôture, bouton impression PDF, bornes de dates dans l'URL                                    |
| 1.14 | Campagne de facturation                                                                                                                             | `/tenant/:tenantId/finance/facturation`                         | Sélecteur de période, lancement avec `ConfirmAction`, compte rendu (facturés / exclus avec motif / avances appliquées), historique des campagnes |
| 1.15 | Portail locataire : « Mon relevé »                                                                                                                  | page existante `TenantPortal/Payments.tsx` enrichie d'un onglet | Lecture seule                                                                                                                                    |
| 1.16 | Navigation : section `finance` dans `navigation/model.tsx` (« Finance » › Clients, Facturation), entrée dans `menu-catalog.ts`, accès menu par rôle | `navigation/`                                                   |

### 5.4 Tests

- Unitaires : grand livre (enchaînement de `balanceAfter`, arrondi, rejeu idempotent, reconstruction égale à l'incrémental), campagne (idempotence, exclusions, application des avances plus ancien d'abord, avance partielle), balance âgée (bornes de tranches).
- API : balance filtrée par période et par bien, relevé borné, campagne relancée deux fois ne duplique pas, portail locataire ne voit qu'un compte, tenant B ne voit pas tenant A.
- Frontend : les quatre écrans avec état d'URL, absence des mots « débit » et « crédit » dans le rendu (test dédié, en écho à la métrique du § 12 du PRD).
- Non-régression : suite locative existante verte (`rental.integration.test.ts`, allocation, génération).

### 5.5 Critères de sortie

- Balance clients et relevé produits sur la base de démonstration après rétro-remplissage, sans saisie.
- Campagne « Loyer de septembre 2026 » lancée deux fois : mêmes échéances, compte rendu identique.
- Un règlement sans échéance rend le compte créditeur ; la campagne suivante l'impute et le relevé le montre.
- Balance sur un exercice pour un tenant de 500 comptes simulés en moins de 3 s (script de charge dans `scripts/`).
- Démonstration en visioconférence.

Taille indicative : deux à trois semaines.

---

## 6. Lot 2 — Moteur généralisé, fournisseurs, chantier

**Objectif.** Faire exister l'argent qui sort, et le rattacher au chantier.

### 6.1 Généralisation comptable (E1 complet)

| #   | Tâche                                                                                                                                                                                                                                                         | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Migration `generalize_accounting_scope`                                                                                                                                                                                                                       | `ChartOfAccount` et `AccountingJournal` : `tenantId` ajouté et rétro-rempli depuis `syndicates.tenant_id`, puis `NOT NULL` ; `syndicateId` nullable ; `scope` ; suppression de l'unicité `(syndicateId, accountNumber)` remplacée par deux index uniques partiels (`WHERE syndicate_id IS NOT NULL` et `WHERE syndicate_id IS NULL`). `JournalEntry` : `tenantId`, `documentType`, `documentId`, `voidedByEntryId?`. `SourceType` étendu (SUPPLIER_INVOICE, SUPPLIER_PAYMENT, CASH_VOUCHER, VOID, …). `JournalEntryLine.debit/credit` passés en `14,2`. |
| 2.2 | Tests de caractérisation du lot 0 verts après migration, sans modification                                                                                                                                                                                    | Garde-fou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2.3 | `lib/finance/accounting.ts` : `postDocumentEntryTx(tx, document)` qui construit l'écriture équilibrée depuis une pièce, la verrouille immédiatement, lie `documentType/documentId` ; `voidDocumentTx` qui produit la pièce d'annulation et l'écriture inverse | Un seul chemin d'écriture pour toutes les pièces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2.4 | Plan de comptes opérationnel par tenant : création à la première pièce d'un jeu minimal (clients, fournisseurs, caisse, achats, charges de chantier), enrichissable ; un compte porteur de mouvement ne peut être que désactivé                               | `lib/finance/chart.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2.5 | Tables de compatibilité : `getTrialBalanceBySyndicate` inchangé ; nouvelle `getTrialBalance(tenantId, scope, range)` en `groupBy` SQL                                                                                                                         | `lib/finance/reports.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### 6.2 Fournisseurs (E3)

Modèles `Supplier` (`kind` MATERIALS / SERVICES / MIXED, `maintenanceVendorId?`), `SupplierInvoice` (statut DRAFT / VALIDATED / VOIDED, `journalEntryId?`), `SupplierInvoiceLine`, `SupplierPayment` et `SupplierPaymentAllocation` (un règlement couvre plusieurs factures ; un acompte sans facture rend le compte débiteur), `VoidDocument`.

Le compte de tiers `SUPPLIER` est créé à la création du fournisseur. Toute pièce porte `createdByUserId` et `validatedByUserId`. La validation d'une facture est un appel distinct (`POST …/validate`, permission `finance.documents.validate`), dans une seule transaction : passage en `VALIDATED`, écriture verrouillée, mouvement du compte fournisseur, imputations (§ 6.3). L'échec de l'une annule tout.

Écrans : liste fournisseurs, fiche avec relevé, saisie de facture avec imputation obligatoire pour un fournisseur de matériaux, règlement multi-factures, balance fournisseurs filtrable par période et par chantier, et une file « Pièces à valider » (toutes natures de pièces, filtrée par auteur) pour le validateur.

### 6.3 Chantier et imputation (E4)

- `ConstructionSite` créé (D5) ; coût réel calculé par `getSiteActualCost` (somme des `CostAllocation` validées) et exposé par l'API. `WorkProgram.constructionSiteId?` ajouté : quand il est renseigné, `actualCost` est recopié depuis le chantier par `syncWorkProgramCostTx` à chaque validation ou annulation d'imputation, et retiré des schémas Zod d'entrée de l'API Patrimoine pour ces programmes.
- `CostCategory` par tenant, avec un jeu par défaut créé au premier chantier (gros œuvre, toiture, plomberie, électricité, main-d'œuvre, matériaux, divers).
- `CostAllocation` : `documentType`, `documentId`, `siteId`, `costCategoryId`, `amount`, `validatedAt`. Invariant vérifié en base par une fonction de contrôle avant validation : Σ ventilations = montant de la pièce.
- `CashVoucher` numéroté séquentiellement par tenant et par année (séquence PostgreSQL ou table de compteur verrouillée), imputé au chantier à la validation, imprimable.
- Écrans : liste des chantiers sous `/tenant/:tenantId/finance/chantiers` (nouvelle page, distincte de `work-programs` du Patrimoine), fiche chantier avec onglets Imputations / Pièces, saisie de pièce de caisse avec impression du bon.

### 6.4 Tests et sortie

- Unitaires : construction d'écriture par type de pièce (toujours équilibrée), annulation, séquence de bons de caisse sous concurrence, recalcul du coût réel.
- API : validation atomique (on force l'échec de l'imputation et on vérifie qu'aucune écriture n'a été écrite), immuabilité d'une facture validée (HTTP 409), balance fournisseurs, coût réel dérivé.
- Non-régression : toute la suite `syndics.*` et Patrimoine verte.
- Critères de sortie : coût réel d'un chantier = somme de ses imputations sur la base de démonstration ; aucune route ne permet d'écrire `actualCost`.

Taille indicative : cinq à sept semaines. C'est le lot le plus lourd ; il est livré d'un bloc (décision actée), avec un jalon interne de revue à la fin de la généralisation comptable (§ 6.1) avant d'ouvrir les fournisseurs.

---

## 7. Lot 3 — Budget, engagements, pilotage (E5)

- **Budget de chantier** : plutôt que de rendre `SyndicateBudget.syndicateId` nullable (il porte `approvedByResolutionId`, `allocations`, `chargeCallBatches`, tous propres à la copropriété), créer `SiteBudget` et réutiliser `BudgetLineItem` en lui ajoutant `siteBudgetId?` et `costCategoryId?`, `budgetId` devenant nullable. Le composant de saisie de lignes de `SyndicBudgets.tsx` est extrait en composant partagé.
- **Avenants** : `BudgetAmendment` daté, motivé ; budget révisé = initial + avenants ; écart affiché contre les deux.
- **Bons de commande** : `PurchaseOrder`, `PurchaseOrderLine`, rapprochement d'une facture reçue sur un bon (mise à jour du statut émis / partiellement facturé / soldé).
- **Engagé** = bons non soldés + factures validées, calculé à la lecture, jamais stocké.
- **Alerte** : seuil par chantier, évaluée à chaque validation de pièce et de bon ; notification via `NotificationEvent` existant (modèle : `lib/patrimoine/notifications.ts`).
- **Avancement physique** : `SiteProgressEntry` daté, historique conservé.
- **Tableau de bord** : endpoint agrégé unique (comme l'endpoint agrégé des programmes de travaux, commit `75f910b`), un `DataView` avec code couleur sur l'écart.

Taille indicative : trois à quatre semaines.

---

## 8. Lot 4 — Bailleurs, associations, salaires, tâcherons, clôture (E6, E7, E8)

- **Bail de terrain** : `LandLease` (compte de tiers LANDLORD) rattaché à des `ConstructionSite`, `LandLeaseAccrual` mensuelle. Job `land-lease-accrual-job.ts` sur le modèle de `penalty-calculation-job.ts`, le 1er du mois, idempotent par `(landLeaseId, periodYear, periodMonth)` ; la constatation est une pièce, donc une écriture, donc une imputation au prorata sur les chantiers rattachés.
- **Associations** : `Partnership`, `PartnershipShare` ; ventilation à la campagne de facturation (le lot 1 a déjà la campagne comme point d'entrée unique) ; état de quote-part en lecture seule.
- **Salaires** : `SalaryNote` comme pièce de dépense, sans aucun calcul social ; compte de tiers EMPLOYEE.
- **Tâcherons** : `Contractor`, `ContractorContract`, `ProgressStatement` ; solde = marché − situations réglées.
- **Retenue de garantie** : `RetentionGuarantee` isolée du solde fournisseur, libération par pièce dédiée.
- **Clôture** : `closeSite` fige `finalCost`, propose la création de biens au patrimoine avec le coût de revient réparti par lot (clé surface / égalitaire / manuelle), renseigne `isCapitalized`. Réutilise la création de bien du module Propriétés.

Taille indicative : cinq à six semaines. Les sous-lots bailleurs, associations, salaires et tâcherons sont indépendants et peuvent être livrés séparément.

---

## 9. Lot 5 — Stock (E9), conditionnel

- Tables `StockItem`, `StockLocation`, `StockMovement` (unique table de mouvements, typée RECEIPT / ISSUE / TRANSFER / ADJUSTMENT), `StockCount`.
- Valorisation au coût moyen pondéré, méthode figée par tenant.
- Bascule par chantier (`ConstructionSite.stockEnabledAt`) : à partir de cette date, les factures de matériaux rattachées au chantier créent une réception au lieu d'une imputation ; l'imputation vient de la sortie. Irréversible par construction : pas de route pour remettre `stockEnabledAt` à nul.
- Rapprochement acheté / consommé / restant par article et par chantier.

Taille indicative : quatre à cinq semaines, à réévaluer une fois le besoin confirmé.

---

## 10. Ordre de grandeur global

| Lot | Durée indicative | Cumul   |
| --- | ---------------- | ------- |
| 0   | 1 semaine        | 1       |
| 1   | 2 à 3 semaines   | 3 à 4   |
| 2   | 5 à 7 semaines   | 8 à 11  |
| 3   | 3 à 4 semaines   | 11 à 15 |
| 4   | 5 à 6 semaines   | 16 à 21 |
| 5   | 4 à 5 semaines   | 20 à 26 |

Hypothèse : une personne à plein temps, au rythme observé sur la refonte (lots 0 et 1 livrés en une dizaine de jours). Ces durées sont à recalibrer sur le réel du lot 1 avant d'engager le lot 2.

---

## 11. Risques et garde-fous techniques

| Risque                                                                           | Garde-fou                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La migration comptable casse la copropriété                                      | Tests de caractérisation (lot 0) écrits **avant** ; migration rejouée sur une copie de la base de démonstration ; index partiels testés avec deux copropriétés et deux plans opérationnels dans le même tenant |
| Divergence entre le compte de tiers et les pièces                                | `rebuildThirdPartyAccount` et un test qui compare incrémental et reconstruction sur un scénario de 200 mouvements                                                                                              |
| Écriture hors transaction dans un service locatif                                | Règle de revue : tout appel au grand livre reçoit un `tx`, jamais `prisma` ; test API qui force un échec après le mouvement et vérifie l'absence de trace                                                      |
| Séquence de bons de caisse en double sous concurrence                            | Compteur verrouillé (`SELECT … FOR UPDATE`) ou séquence PostgreSQL par tenant ; test de concurrence                                                                                                            |
| ~160 erreurs TypeScript préexistantes dans l'API                                 | Les nouveaux fichiers sont ajoutés à la liste des fichiers propres ; `typecheck` ne doit pas augmenter le compte                                                                                               |
| Extension Prisma de garde tenant                                                 | Toutes les nouvelles tables portent `tenantId` ; aucun avertissement toléré dans les logs de test                                                                                                              |
| Deux devises textuelles (« FCFA », « XOF »)                                      | Le grand livre normalise en `XOF` à l'écriture ; l'affichage passe par `MoneyValue`                                                                                                                            |
| Le lot 2 démarre sans réponses aux questions 3 à 7                               | Point d'entrée du lot 2 = réponses consignées dans la spec, pas seulement lot 1 livré                                                                                                                          |
| Coexistence `ConstructionSite` / `WorkProgram` mal comprise par les utilisateurs | Libellés distincts (« Chantier » sous Finance, « Programme de travaux » sous Patrimoine) ; un programme lié à un chantier affiche le lien et masque la saisie de coût                                          |

---

## 12. Décisions actées le 18 septembre 2026

| #   | Question                          | Décision                                                                                                                                 |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Comptes de tiers                  | Tables `ThirdPartyAccount` / `ThirdPartyMovement` séparées de `OwnerAccount` ; code de grand livre partagé (D1)                          |
| 2   | Chantier                          | Nouvelle table `ConstructionSite` ; `WorkProgram` conservé pour les travaux sur bien existant, avec lien optionnel vers un chantier (D5) |
| 3   | Lot 1                             | Sans écritures de journal ; compte de tiers seul (D2)                                                                                    |
| 4   | Branche                           | `feat/finance-lot-1` créée depuis `main` après fusion de `feat/refonte-lot-2`                                                            |
| 5   | Devise                            | `XOF` stocké, « FCFA » affiché (D9)                                                                                                      |
| 6   | Visioconférence                   | Pas de visioconférence pour les questions 1, 2, 8, 9 ; réponses données par le porteur du projet ci-dessous                              |
| 7   | Reprise (question 8)              | Rétro-remplissage seul au lot 1 ; solde initial au lot 2 (D10)                                                                           |
| 8   | Lot 2                             | Un seul lot, non scindé                                                                                                                  |
| 9   | Outil actuel (question 1)         | Tableur (Excel ou Google Sheets) ; export à obtenir au lot 0                                                                             |
| 10  | Volumes (question 2)              | Moyens : 50 à 200 baux, 50 fournisseurs, 10 chantiers ; agrégation SQL dès le lot 1                                                      |
| 11  | Saisie et validation (question 9) | Plusieurs saisisseurs, un validateur ; droits séparés et file de validation au lot 2 (D7)                                                |

Restent ouvertes, à trancher avec la cliente avant le lot 2 : les questions 3 à 7 du PRD (suivi des matériaux, pratique budgétaire, statut des ouvriers, états aux associés, organisation de la caisse).
