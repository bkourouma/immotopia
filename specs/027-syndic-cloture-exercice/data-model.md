# Modèle de données — clôture d'exercice du module Syndic

**Spécification** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md)
**Date** : 2026-09-29 · **Statut** : proposition, aucun code écrit

Ce document décrit le schéma Prisma **proposé**. Il est **additif** : aucune
table, aucune colonne, aucun enum existant n'est supprimé, renommé ni retypé.
Les colonnes ajoutées à des tables existantes sont nullables ou portent une
valeur par défaut constante ; aucune valeur n'est ajoutée à un enum existant
(un `ALTER TYPE … ADD VALUE` ne se défait pas). Conventions reprises du
schéma actuel : clé `String @id @default(uuid()) @db.Uuid`, colonnes en
`snake_case` via `@map`, tables via `@@map`, `tenantId String @map("tenant_id")`
sur chaque modèle nouveau (test `schema-tenant-coverage`), montants
`Decimal(14, 2)`, devise `XOF`.

Rappel de l'état vérifié le 29/09/2026 (`main` `6c454886`) : l'exercice n'est
aujourd'hui qu'un entier (`SyndicateBudget.fiscalYear`,
`AccountingJournal.fiscalYear`, année civile UTC de la date des pièces) ;
`Syndicate.fiscalYear` (1 à 12) n'est lu par aucun code. Le seul verrou est
`assertFiscalYearOpenTx` (`lib/syndics/provider-invoice-accounting.ts`), fondé
sur l'existence d'un budget `CLOSED` de l'année.

## 1. Enums nouveaux

```prisma
/// Etat d'un exercice : ouvert aux ecritures, ou clos (comptes arretes).
enum SyndicFiscalYearStatus {
  OPEN
  CLOSED
}

/// Approbation des comptes par l'assemblee generale, distincte du
/// verrouillage : les comptes sont d'abord arretes (CLOSED), puis soumis.
enum SyndicAccountsApprovalStatus {
  NOT_SUBMITTED
  SUBMITTED
  APPROVED
  REJECTED
}

/// Decision de l'AG sur le solde des charges courantes de l'exercice.
enum SyndicRegularisationDecision {
  /// Excedent credite / deficit appele, lot par lot.
  SETTLE_PER_LOT
  /// Aucun mouvement sur les lots : le fonds absorbe l'ecart.
  KEEP_IN_FUND
}

/// Nature d'un `ChargePayment`. REGULARISATION est une avance NON monetaire :
/// ni recu, ni credit de fonds, ni encaissement (voir spec FR-073).
enum ChargePaymentKind {
  CASH
  REGULARISATION
}

/// Objet d'une resolution d'AG, pour relier les votes aux actions de cloture.
enum GmResolutionKind {
  ACCOUNTS_APPROVAL
  DISCHARGE
  RESULT_ALLOCATION
  BUDGET_APPROVAL
  OTHER
}
```

## 2. Modèles nouveaux

### 2.1 `SyndicFiscalYear` — un exercice d'une copropriété

```prisma
model SyndicFiscalYear {
  id                   String                       @id @default(uuid()) @db.Uuid
  tenantId             String                       @map("tenant_id")
  syndicateId          String                       @map("syndicate_id") @db.Uuid
  /// Annee de reference (exercice calendaire en V1 : du 01/01 au 31/12).
  year                 Int
  startDate            DateTime                     @map("start_date") @db.Date
  endDate              DateTime                     @map("end_date") @db.Date
  status               SyndicFiscalYearStatus       @default(OPEN)
  closedAt             DateTime?                    @map("closed_at")
  closedById           String?                      @map("closed_by_id")
  approvalStatus       SyndicAccountsApprovalStatus @default(NOT_SUBMITTED) @map("approval_status")
  /// AG et resolution ou les comptes sont soumis (verifies a l'ecriture).
  accountsMeetingId    String?                      @map("accounts_meeting_id") @db.Uuid
  accountsResolutionId String?                      @map("accounts_resolution_id") @db.Uuid
  approvedAt           DateTime?                    @map("approved_at")
  approvedById         String?                      @map("approved_by_id")
  approvalNote         String?                      @map("approval_note")
  /// Visa libre de verification des comptes avant l'AG (le conseil syndical
  /// n'est pas modelise, voir spec §3).
  reviewedBy           String?                      @map("reviewed_by")
  reviewedAt           DateTime?                    @map("reviewed_at") @db.Date
  /// Date limite INDICATIVE d'approbation, saisie par le syndic. Aucun delai
  /// legal n'est code [A VALIDER — juriste].
  approvalDueDate      DateTime?                    @map("approval_due_date") @db.Date
  createdAt            DateTime                     @default(now()) @map("created_at")
  updatedAt            DateTime                     @updatedAt @map("updated_at")

  tenant            Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  syndicate         Syndicate                 @relation(fields: [syndicateId], references: [id], onDelete: Cascade)
  accountsMeeting   GeneralMeeting?           @relation("FiscalYearAccountsMeeting", fields: [accountsMeetingId], references: [id], onDelete: SetNull)
  accountsResolution GMResolution?            @relation("FiscalYearAccountsResolution", fields: [accountsResolutionId], references: [id], onDelete: SetNull)
  closings          SyndicFiscalYearClosing[]
  regularisation    SyndicRegularisation?
  bankChecks        SyndicBankCheck[]

  @@unique([syndicateId, year])
  @@index([tenantId])
  @@index([tenantId, syndicateId, status])
  @@map("syndic_fiscal_years")
}
```

**Création.** À la demande, par `ensureFiscalYearTx(tx, tenantId, syndicateId, year)`
(`INSERT … ON CONFLICT DO NOTHING`, puis lecture), appelée par le garde de
verrouillage (spec FR-041), par la liste des exercices et par la clôture.
Aucune migration de données : les exercices apparaissent quand le code les
touche. Un budget déjà `CLOSED` ne clôt pas l'exercice : sa règle actuelle
(refus des factures et paiements de prestataires de l'année) reste un contrôle
à part (spec FR-007).

**Dates.** V1 : exercice calendaire (`startDate` = 01/01, `endDate` = 31/12).
Les deux colonnes existent pour qu'un exercice décalé n'exige aucune migration
plus tard (question ouverte Q6).

### 2.2 `SyndicFiscalYearClosing` — une version de clôture

```prisma
model SyndicFiscalYearClosing {
  id                    String    @id @default(uuid()) @db.Uuid
  tenantId              String    @map("tenant_id")
  fiscalYearId          String    @map("fiscal_year_id") @db.Uuid
  /// 1, 2, 3… : une reouverture puis une nouvelle cloture cree la version suivante.
  version               Int
  /// SHA-256 de l'apercu sur lequel la cloture s'est appuyee.
  previewHash           String    @map("preview_hash")
  /// Chiffres figes (voir §4). Jamais recalcule : c'est l'ORIGINAL.
  summary               Json
  /// Avertissements reconnus par l'utilisateur : [{ code, note? }].
  acknowledgedWarnings  Json      @map("acknowledged_warnings")
  /// Budgets touches et leur statut d'avant : [{ budgetId, previousStatus }].
  budgetStatuses        Json      @map("budget_statuses")
  /// Echeanciers passes a COMPLETED par la cloture : [paymentScheduleId].
  completedScheduleIds  Json      @map("completed_schedule_ids")
  /// Identifiant de stockage PRIVE du « dossier de comptes » (jamais renvoye
  /// au client ; lu par une route authentifiee).
  dossierFilePath       String?   @map("dossier_file_path")
  dossierPublishedAt    DateTime? @map("dossier_published_at")
  closedById            String?   @map("closed_by_id")
  closedAt              DateTime  @default(now()) @map("closed_at")
  reopenedAt            DateTime? @map("reopened_at")
  reopenedById          String?   @map("reopened_by_id")
  reopenReason          String?   @map("reopen_reason")

  tenant       Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  fiscalYear   SyndicFiscalYear          @relation(fields: [fiscalYearId], references: [id], onDelete: Cascade)
  lotBalances  SyndicClosingLotBalance[]
  fundBalances SyndicClosingFundBalance[]

  @@unique([fiscalYearId, version])
  @@index([tenantId])
  @@index([fiscalYearId, reopenedAt])
  @@map("syndic_fiscal_year_closings")
}
```

La version « active » est celle dont `reopenedAt` est nul (au plus une, voir
I-2). Une version réouverte est **conservée** : c'est la trace de ce qui avait
été arrêté.

### 2.3 `SyndicClosingLotBalance` — solde reporté d'un lot

```prisma
model SyndicClosingLotBalance {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @map("tenant_id")
  closingId      String   @map("closing_id") @db.Uuid
  lotId          String   @map("lot_id") @db.Uuid
  /// Copropriétaire du lot A LA DATE d'arrete (le lot peut avoir change de main).
  ownerContactId String?  @map("owner_contact_id")
  /// Tous les montants sont signes du point de vue du copropriétaire :
  /// positif = il DOIT (debiteur), negatif = la copropriete lui DOIT (crediteur).
  openingBalance Decimal  @map("opening_balance") @db.Decimal(14, 2)
  calledAmount   Decimal  @map("called_amount") @db.Decimal(14, 2)
  cashReceived   Decimal  @map("cash_received") @db.Decimal(14, 2)
  penalties      Decimal  @db.Decimal(14, 2)
  waivers        Decimal  @db.Decimal(14, 2)
  adjustments    Decimal  @db.Decimal(14, 2)
  /// Credits de regularisation (nature REGULARISATION) dates de l'exercice,
  /// en positif : ils diminuent le solde sans etre un encaissement.
  regularisations Decimal @default(0) @db.Decimal(14, 2)
  /// Ecart d'identite, normalement 0 ; non nul quand des appels chevauchent
  /// deux exercices (controle CLO-W08).
  otherMovements Decimal  @default(0) @map("other_movements") @db.Decimal(14, 2)
  closingBalance Decimal  @map("closing_balance") @db.Decimal(14, 2)
  /// Part crediteur non affectee a un appel a la date d'arrete (avance, >= 0).
  advance        Decimal  @db.Decimal(14, 2)
  createdAt      DateTime @default(now()) @map("created_at")

  tenant  Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  closing SyndicFiscalYearClosing @relation(fields: [closingId], references: [id], onDelete: Cascade)
  lot     SyndicateLot            @relation(fields: [lotId], references: [id], onDelete: Cascade)

  @@unique([closingId, lotId])
  @@index([tenantId])
  @@index([lotId])
  @@map("syndic_closing_lot_balances")
}
```

Identité : `closingBalance = openingBalance + calledAmount + penalties − waivers

- adjustments − cashReceived − regularisations + otherMovements`. Sur un exercice
antérieur à toute régularisation, `regularisations` vaut 0.

### 2.4 `SyndicClosingFundBalance` — solde reporté d'un fonds

```prisma
model SyndicClosingFundBalance {
  id                String   @id @default(uuid()) @db.Uuid
  tenantId          String   @map("tenant_id")
  closingId         String   @map("closing_id") @db.Uuid
  fundId            String   @map("fund_id") @db.Uuid
  openingBalance    Decimal  @map("opening_balance") @db.Decimal(14, 2)
  /// Credits hors annulations de paiements prestataires.
  credits           Decimal  @db.Decimal(14, 2)
  /// Debits NETS des annulations (comme le tableau N.4 du scenario de recette).
  debits            Decimal  @db.Decimal(14, 2)
  closingBalance    Decimal  @map("closing_balance") @db.Decimal(14, 2)
  /// Solde du compte de capitaux propres lie au fonds APRES affectation du
  /// resultat (nul si le fonds n'a pas de compte lie). L'ecart avec
  /// `closingBalance` est explique dans le rapprochement de tresorerie.
  accountingBalance Decimal? @map("accounting_balance") @db.Decimal(14, 2)
  createdAt         DateTime @default(now()) @map("created_at")

  tenant  Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  closing SyndicFiscalYearClosing @relation(fields: [closingId], references: [id], onDelete: Cascade)
  fund    SyndicateFund           @relation(fields: [fundId], references: [id], onDelete: Cascade)

  @@unique([closingId, fundId])
  @@index([tenantId])
  @@map("syndic_closing_fund_balances")
}
```

Identité : `closingBalance = openingBalance + credits − debits`.

### 2.5 `SyndicClosingSettings` — comptes utilisés par la clôture

Une ligne par copropriété. Elle dit **quels comptes du plan de la copropriété**
reçoivent les écritures générées. Le choix des comptes est **[À VALIDER —
expert-comptable]** : rien n'est figé dans le code, tout est paramétrable.

```prisma
model SyndicClosingSettings {
  id                             String   @id @default(uuid()) @db.Uuid
  tenantId                       String   @map("tenant_id")
  syndicateId                    String   @unique @map("syndicate_id") @db.Uuid
  /// Copropriétaires — comptes individuels (4500 dans le scénario de recette).
  ownersAccountId                String?  @map("owners_account_id") @db.Uuid
  /// Banque (521).
  bankAccountId                  String?  @map("bank_account_id") @db.Uuid
  /// Produits des appels de charges courantes (7010) et de travaux (7020).
  callIncomeRegularAccountId     String?  @map("call_income_regular_account_id") @db.Uuid
  callIncomeExceptionalAccountId String?  @map("call_income_exceptional_account_id") @db.Uuid
  /// Produits divers : pénalités de retard (7580).
  penaltyIncomeAccountId         String?  @map("penalty_income_account_id") @db.Uuid
  /// Contrepartie des ajustements manuels de compte de lot (sans défaut).
  adjustmentAccountId            String?  @map("adjustment_account_id") @db.Uuid
  /// Résultat non affecté à un fonds (produits ou charges sans fonds).
  pendingResultAccountId         String?  @map("pending_result_account_id") @db.Uuid
  /// Code du journal d'opérations diverses (« OD »), créé par exercice.
  journalCode                    String   @default("OD") @map("journal_code")
  createdAt                      DateTime @default(now()) @map("created_at")
  updatedAt                      DateTime @updatedAt @map("updated_at")

  tenant    Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  syndicate Syndicate @relation(fields: [syndicateId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@map("syndic_closing_settings")
}
```

Les identifiants de comptes se vérifient tous contre la copropriété de
l'agence (`assertBelongsToTenant` + `syndicateId`), comme
`createChartOfAccountBySyndicate` le fait pour `parentAccountId`. Le compte de
capitaux propres de chaque fonds est porté par le fonds (§3), pas ici.

Plan comptable minimal proposé (créé par `ensureClosingAccountsTx`, sur le
modèle de `ensureSyndicProviderAccountsTx`) — numéros et intitulés repris du
scénario de recette C.9, **[À VALIDER — expert-comptable]** :

| N°   | Intitulé                              | Classe | Type   |
| ---- | ------------------------------------- | -----: | ------ |
| 1010 | Fonds de roulement                    |      1 | EQUITY |
| 1020 | Fonds de travaux                      |      1 | EQUITY |
| 4500 | Copropriétaires — comptes individuels |      4 | ASSET  |
| 521  | Banque                                |      5 | ASSET  |
| 7010 | Appels de charges courantes           |      7 | INCOME |
| 7020 | Appels de fonds travaux               |      7 | INCOME |
| 7580 | Produits divers (pénalités)           |      7 | INCOME |

Les comptes 401, 521, 624 et 6241 existent déjà par les factures de
prestataires ; un compte existant n'est jamais recréé.

### 2.6 `SyndicBankCheck` — solde du relevé bancaire saisi

```prisma
model SyndicBankCheck {
  id               String   @id @default(uuid()) @db.Uuid
  tenantId         String   @map("tenant_id")
  fiscalYearId     String   @map("fiscal_year_id") @db.Uuid
  label            String
  accountRef       String?  @map("account_ref")
  statementDate    DateTime @map("statement_date") @db.Date
  statementBalance Decimal  @map("statement_balance") @db.Decimal(14, 2)
  note             String?
  createdById      String?  @map("created_by_id")
  createdAt        DateTime @default(now()) @map("created_at")

  tenant     Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  fiscalYear SyndicFiscalYear @relation(fields: [fiscalYearId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([fiscalYearId])
  @@map("syndic_bank_checks")
}
```

Ce n'est **pas** un rapprochement bancaire : c'est un chiffre saisi (un par
compte, à la date d'arrêté) que la clôture compare au solde du compte 521.
Le modèle `SyndicPaymentMethod` (comptes de paiement des avis d'appel, sans
écran, constat N.8-9) n'est ni modifié ni remplacé.

### 2.7 `SyndicRegularisation` et `SyndicRegularisationLine`

Régularisation des charges courantes décidée par l'AG, **appliquée une seule
fois** par exercice.

```prisma
model SyndicRegularisation {
  id            String                       @id @default(uuid()) @db.Uuid
  tenantId      String                       @map("tenant_id")
  fiscalYearId  String                       @unique @map("fiscal_year_id") @db.Uuid
  decision      SyndicRegularisationDecision
  /// Resolution RESULT_ALLOCATION approuvee qui autorise l'application.
  meetingId     String                       @map("meeting_id") @db.Uuid
  resolutionId  String                       @map("resolution_id") @db.Uuid
  /// Date d'effet des mouvements (dans l'exercice ouvert suivant).
  effectiveDate DateTime                     @map("effective_date") @db.Date
  /// Reference de l'ecriture et des credits : « REG-2026 ».
  reference     String
  totalSurplus  Decimal                      @map("total_surplus") @db.Decimal(14, 2)
  totalDeficit  Decimal                      @map("total_deficit") @db.Decimal(14, 2)
  journalEntryId String?                     @map("journal_entry_id") @db.Uuid
  appliedById   String?                      @map("applied_by_id")
  appliedAt     DateTime                     @default(now()) @map("applied_at")

  tenant     Tenant                     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  fiscalYear SyndicFiscalYear           @relation(fields: [fiscalYearId], references: [id], onDelete: Cascade)
  lines      SyndicRegularisationLine[]

  @@index([tenantId])
  @@map("syndic_regularisations")
}

model SyndicRegularisationLine {
  id               String   @id @default(uuid()) @db.Uuid
  tenantId         String   @map("tenant_id")
  regularisationId String   @map("regularisation_id") @db.Uuid
  lotId            String   @map("lot_id") @db.Uuid
  /// Provisions appelees au titre des budgets de charges courantes de N.
  provisions       Decimal  @db.Decimal(14, 2)
  /// Part du reel (factures rattachees, reparties par la cle de leur poste).
  share            Decimal  @db.Decimal(14, 2)
  /// provisions - share : positif = excedent (credit), negatif = deficit (appel).
  delta            Decimal  @db.Decimal(14, 2)
  /// Credit de regularisation cree (excedent, decision SETTLE_PER_LOT).
  creditPaymentId  String?  @map("credit_payment_id") @db.Uuid
  /// Appel de regularisation cree (deficit, decision SETTLE_PER_LOT).
  chargeCallId     String?  @map("charge_call_id") @db.Uuid
  createdAt        DateTime @default(now()) @map("created_at")

  tenant         Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  regularisation SyndicRegularisation @relation(fields: [regularisationId], references: [id], onDelete: Cascade)
  lot            SyndicateLot         @relation(fields: [lotId], references: [id], onDelete: Cascade)

  @@unique([regularisationId, lotId])
  @@index([tenantId])
  @@map("syndic_regularisation_lines")
}
```

## 3. Colonnes ajoutées à des tables existantes

Toutes nullables ou à défaut constant. Aucune n'est requise par le code
existant.

| Table (modèle)                                       | Colonne                                                     | Rôle                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `charge_payments` (`ChargePayment`)                  | `kind ChargePaymentKind @default(CASH)`                     | Distingue l'encaissement de la régularisation (avance non monétaire). Défaut `CASH` : les lignes existantes sont intactes.                                                                                                                                                                               |
| `syndicate_fund_movements` (`SyndicateFundMovement`) | `occurred_at DateTime?` + index `(fund_id, occurred_at)`    | **Date métier** du mouvement. `created_at` est la date de saisie : un règlement du 30/12 saisi le 05/01 doit compter dans l'exercice clos. Reprise : voir §6.                                                                                                                                            |
| `syndicate_funds` (`SyndicateFund`)                  | `equity_account_id UUID?` → `chart_of_accounts` (`SetNull`) | Compte de capitaux propres du fonds (1010, 1020) pour l'affectation du résultat.                                                                                                                                                                                                                         |
| `syndicate_budgets` (`SyndicateBudget`)              | `income_account_id UUID?` → `chart_of_accounts` (`SetNull`) | Surcharge facultative du compte de produit des appels de ce budget (sinon : compte par défaut selon `BatchType`).                                                                                                                                                                                        |
| `gm_resolutions` (`GMResolution`)                    | `resolution_kind GmResolutionKind?`                         | Objet de la résolution (approbation des comptes, quitus, affectation du résultat, budget). Nul = résolution libre.                                                                                                                                                                                       |
| `journal_entries` (`JournalEntry`)                   | `closing_id UUID?` + `locked_by_closing_id UUID?` (index)   | `closing_id` : écritures **créées** par une clôture (contre-passées à la réouverture). `locked_by_closing_id` : écritures **verrouillées** par elle (les seules déverrouillées à la réouverture ; un verrou posé à la main reste). Sans clé étrangère (comme `sourceId`), pour ne pas alourdir la table. |

Les relations inverses (`Tenant`, `Syndicate`, `SyndicateLot`, `SyndicateFund`,
`GeneralMeeting`, `GMResolution`) ne portent aucune colonne : elles s'ajoutent
au schéma Prisma seulement.

## 4. Contenu de `SyndicFiscalYearClosing.summary`

Objet JSON figé à la clôture, lu tel quel par le dossier de comptes et par
l'écran. Les montants sont des nombres (unité monétaire, deux décimales).

```json
{
  "period": { "start": "2026-01-01", "end": "2026-12-31", "year": 2026 },
  "calls": {
    "count": 44,
    "total": 17000000,
    "byNature": { "REGULAR": 12000000, "EXCEPTIONAL": 5000000 }
  },
  "cashReceived": 16700000,
  "penalties": { "applied": 30000, "waived": 30000, "net": 0 },
  "regularisationCredits": 0,
  "adjustments": { "debit": 0, "credit": 0 },
  "providerInvoices": {
    "count": 22,
    "totalTTC": 15320300,
    "paid": 15320300,
    "unpaid": 0
  },
  "expenses": [
    { "accountNumber": "624", "amount": 10836300 },
    { "accountNumber": "6241", "amount": 4484000 }
  ],
  "budgets": [
    {
      "budgetId": "…",
      "label": "Budget charges courantes 2026",
      "forecast": 12000000,
      "actual": 10836300,
      "variance": 1163700
    }
  ],
  "result": {
    "income": 17000000,
    "expenses": 15320300,
    "net": 1679700,
    "byFund": [
      {
        "fundId": "…",
        "income": 12000000,
        "expenses": 10836300,
        "result": 1163700
      },
      {
        "fundId": "…",
        "income": 5000000,
        "expenses": 4484000,
        "result": 516000
      }
    ],
    "unallocated": 0
  },
  "receivables": { "lots": 1, "total": 300000 },
  "advances": { "lots": 0, "total": 0 },
  "treasury": {
    "bankAccount": 5379700,
    "fundsTotal": 5379700,
    "advances": 0,
    "unfundedAllocations": 0,
    "gap": 0,
    "statementBalances": []
  },
  "entries": [
    {
      "reference": "APP-2026",
      "date": "2026-12-31",
      "debit": 12000000,
      "credit": 12000000
    }
  ]
}
```

(Les valeurs sont celles du jeu de référence, spec §9 — scénario de recette,
partie N.)

## 5. Lectures dérivées (aucune colonne)

- Solde d'un lot à une date : chaîne chronologique du compte de lot
  (`chronologicalBalanceStrictlyBefore`, `lib/syndics/owner-account-running-balance.ts`),
  sur `OwnerAccountTransaction.transactionDate`.
- Avance d'un lot à une date : somme des paiements du lot (`CASH` ou
  `REGULARISATION`) dont `paidAt` est antérieur ou égal à la date, moins la
  somme des affectations dont la **date d'effet** l'est aussi — `paidAt` du
  paiement pour une affectation `PAYMENT`, `createdAt` pour une imputation
  d'avance (`ChargePaymentAllocation` n'a pas de date métier propre ; exact
  en saisie au fil de l'eau, approché sinon, risque R-01).
- Solde d'un fonds à une date : somme des `SyndicateFundMovement` dont
  `occurredAt` (à défaut `createdAt`) est antérieur ou égal à la date.
- Solde d'un compte comptable sur un exercice : lignes d'écritures dont
  `entryDate` tombe dans `[startDate, endDate]`.

## 6. Migration

- **Découpage** : une migration additive **par lot livrable**
  (`<horodatage>_syndic_cloture_<lot>`), pour que chaque PR ne porte que ce
  qu'elle utilise. Le schéma décrit plus haut est l'état final ; les relations
  vers les modèles d'un lot suivant s'ajoutent avec ce lot.

  | Lot | Enums                                                    | Tables                                                                                       | Colonnes ajoutées                                                                                 |
  | --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
  | C0  | `SyndicFiscalYearStatus`, `SyndicAccountsApprovalStatus` | `syndic_fiscal_years`, `syndic_closing_settings`                                             | `occurred_at`, `equity_account_id`, `income_account_id`, `closing_id`, `locked_by_closing_id` (5) |
  | C1  | —                                                        | `syndic_bank_checks`                                                                         | —                                                                                                 |
  | C2  | —                                                        | `syndic_fiscal_year_closings`, `syndic_closing_lot_balances`, `syndic_closing_fund_balances` | —                                                                                                 |
  | C4  | `GmResolutionKind`                                       | —                                                                                            | `gm_resolutions.resolution_kind` (1)                                                              |
  | C5  | `ChargePaymentKind`, `SyndicRegularisationDecision`      | `syndic_regularisations`, `syndic_regularisation_lines`                                      | `charge_payments.kind` (1)                                                                        |

  Total : 5 enums, 8 tables, 7 colonnes. Le lot C3 (dossier, portail) n'ajoute
  aucune structure : `dossier_file_path` et `dossier_published_at` sont déjà
  dans `syndic_fiscal_year_closings` (C2).

- **Contenu** : `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE … ADD COLUMN`
  nullable ou à défaut constant (§3), index. Aucune suppression, aucun
  `ALTER TYPE`.
- **Reprise de données** (une seule) : `syndicate_fund_movements.occurred_at`.
  Règle au mieux, documentée dans le rapport de migration :
  - `PROVIDER_PAYMENT` → `syndic_provider_payments.paid_at` ;
  - `PROVIDER_PAYMENT_REVERSAL` → `syndic_provider_payments.cancelled_at`
    (repli `created_at`) ;
  - `CHARGE_PAYMENT` → `charge_payments.paid_at` quand le mouvement a été écrit
    dans la même transaction que le paiement (écart de `created_at` inférieur
    à 5 secondes), sinon `created_at` (imputation d'avance) ;
  - `OPENING`, `MANUAL_ADJUSTMENT`, `MANUAL_EXPENSE` → `created_at`.
    Les nouveaux mouvements écrivent `occurred_at` explicitement.
- **Retour arrière** : une migration Prisma n'a pas de « down ». Le lot fournit
  un script `rollback.sql` (revue avec la PR) qui supprime les 8 tables, les 7
  colonnes ajoutées et les 5 types, dans l'ordre inverse. Il est sûr tant
  qu'aucune clôture n'a été jouée en production ; après, les tables portent
  l'historique des arrêtés et ne se suppriment pas à la légère.
- **Vérification** : `prisma migrate deploy` sur une copie de la base de
  démonstration (`npm run demo:sync -- <ref> --migrate`), puis la suite
  Syndic inchangée doit rester verte. Ajouter un `ADD COLUMN` avec défaut
  constant est instantané depuis PostgreSQL 11 : **vérifier la version de la
  base de production** avant le déploiement de `ChargePayment.kind`.
- **Client Prisma** : `npx prisma generate` depuis `packages/api`. Un worktree
  dont `node_modules` est une jonction ne doit pas régénérer le client partagé
  (piège documenté dans le HANDOFF).

## 7. Invariants à tester

| #    | Invariant                                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-1  | Un seul exercice par `(copropriété, année)` ; `startDate ≤ endDate` ; en V1, 01/01 et 31/12 de l'année.                                                                                                                      |
| I-2  | Au plus une clôture **active** (`reopenedAt` nul) par exercice ; versions consécutives `1, 2, 3…`.                                                                                                                           |
| I-3  | À partir du lot C2 : exercice `CLOSED` ⇔ une clôture active existe ; exercice `OPEN` ⇔ aucune (au lot C0, les tests posent `CLOSED` directement).                                                                            |
| I-4  | Pour chaque lot : `closingBalance` égal à la chaîne du compte de lot à la date d'arrêté, et somme des lots égale au solde du compte des copropriétaires après écritures de clôture (lorsque la comptabilité est paramétrée). |
| I-5  | Pour chaque fonds : `opening + credits − debits = closing`, et `closing` = somme des mouvements jusqu'à la date d'arrêté.                                                                                                    |
| I-6  | Toute écriture générée est équilibrée ; après l'écriture d'affectation, les comptes de classes 6 et 7 sont à zéro sur l'exercice ; l'écriture d'ouverture est équilibrée.                                                    |
| I-7  | Aucune pièce **datée** dans un exercice `CLOSED` n'est créée après la clôture, sauf les pièces de la clôture elle-même (`closing_id`).                                                                                       |
| I-8  | Un `ChargePayment` de nature `REGULARISATION` ne crédite aucun fonds, n'émet aucun reçu et n'entre dans aucun total d'encaissements.                                                                                         |
| I-9  | `approvalStatus = APPROVED` exige une résolution `APPROVED` d'une assemblée `COMPLETED` de la même copropriété (vérifié à l'écriture, pas seulement à l'affichage).                                                          |
| I-10 | Une régularisation par exercice au plus (`fiscal_year_id` unique) ; somme des `delta` de ses lignes = `totalSurplus − totalDeficit`.                                                                                         |
