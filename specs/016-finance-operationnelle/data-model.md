# Data Model: Gestion financiere operationnelle - Volet clients (lot 1)

**Feature**: 016-finance-operationnelle
**Date**: 2026-09-18
**Status**: Draft

## Overview

Ce lot ajoute trois entites, toutes nouvelles, toutes portees par `tenantId`. Aucune table existante n'est modifiee : la migration est purement additive (voir `research.md` §"Ecarts entre le PRD et l'existant" pour la raison de ce choix, en particulier pourquoi `OwnerAccount` n'est pas reutilise). Les montants sont en `Decimal(14,2)`, la devise stockee est `XOF` (affichee "FCFA" par le composant `MoneyValue`, conformement a la decision D9 du plan de mise en oeuvre).

Le detail des champs suit les conventions observees sur les modeles les plus recents du schema (`WorkProgram`, `PatrimonyDocument`) : nom de champ en camelCase, colonne mappee en snake_case via `@map`, table mappee via `@@map`, cle primaire `String @id @default(uuid()) @db.Uuid`.

## Enums

```prisma
enum ThirdPartyKind {
  TENANT
  SUPPLIER
  LANDLORD
  CONTRACTOR
  PARTNER
  EMPLOYEE
}
```

Les six valeurs sont celles du plan de mise en oeuvre (§5.1) et de la table 6.1 du PRD. Seule `TENANT` est peuplee par ce lot : les cinq autres n'ont ni table source, ni service, ni ecran avant les lots 2 (`SUPPLIER`), 4 (`LANDLORD`, `CONTRACTOR`, `PARTNER`, `EMPLOYEE`). L'enum est cree en entier des maintenant pour eviter une migration d'enum plus tard (Postgres ne permet pas de retirer une valeur d'enum facilement, mais en ajouter est sans risque ; le plan choisit explicitement de figer l'enum au lot 1 pour cette raison).

```prisma
enum ThirdPartyMovementType {
  INSTALLMENT
  PAYMENT
  ADVANCE_RECEIVED
  ADVANCE_APPLIED
  PENALTY
  WAIVER
  ADJUSTMENT
  OPENING_BALANCE
  VOID
}
```

**Ecart assume par rapport au plan.** Le plan de mise en oeuvre liste au §5.1 huit valeurs (`INSTALLMENT, PAYMENT, PENALTY, ADVANCE_APPLIED, WAIVER, ADJUSTMENT, OPENING_BALANCE, VOID`), mais son §5.2 (tache 1.3) decrit le reliquat non alloue d'un paiement comme un mouvement crediteur distinct, nomme `ADVANCE` dans le texte — une neuvieme valeur jamais listee dans l'enum. Les deux sections du plan se contredisent donc sur le nombre de valeurs necessaires pour representer une avance. Cette specification tranche en faveur de deux valeurs distinctes et symetriques :

- `ADVANCE_RECEIVED` (credit) : pose au moment ou un paiement encaisse laisse un reliquat sans echeance a lui opposer (Recit 4, US4). C'est ce mouvement qui rend le compte crediteur.
- `ADVANCE_APPLIED` (**debit**) : pose au moment ou la campagne de facturation impute un reliquat sur une echeance generee. Il vient **toujours par paire** avec un `PAYMENT` au credit du meme montant, sous la meme cle de piece.

  **Deux corrections successives, le 18 septembre 2026.** Cette valeur a d'abord ete decrite comme un debit, puis requalifiee comme sans effet sur le solde, avant de revenir a un debit. La troisieme lecture est la bonne, et voici pourquoi les deux premieres etaient fausses.

  Un reglement encaisse sans echeance en face est credite **en entier** (`ADVANCE_RECEIVED`) : le compte passe crediteur. L'echeance du mois suivant le debite (`INSTALLMENT`). Si l'imputation s'arretait la, un debit de plus redemanderait au locataire un argent deja verse — c'est ce qui avait fait retirer le montant.

  Mais l'imputation cree une `RentalPaymentAllocation`, et `rebuildThirdPartyAccount` rejoue **toute** allocation comme un reglement au credit, sous `(RENTAL_PAYMENT_ALLOCATION, id, PAYMENT)`. Une campagne qui n'ecrirait pas ce credit laisserait le rejeu l'ajouter apres coup, et le solde deviendrait faux.

  La forme correcte ecrit donc les deux : `ADVANCE_APPLIED` au debit reprend le credit de l'avance, `PAYMENT` au credit le repose au titre de l'allocation. Le solde ne bouge pas, les deux s'annulant, mais le releve montre distinctement l'avance consommee et le loyer regle — ce qu'exige le besoin B4. Et surtout, les deux chemins qui alimentent un compte, le temps reel et le rejeu, ecrivent sous les memes cles.

  **La lecon vaut au-dela de ce champ.** Deux agents avaient bati deux modeles chacun coherent avec lui-meme, et la contradiction n'est apparue qu'en les faisant se rencontrer. Un invariant a verifier a chaque lot : pour toute piece, le temps reel et `rebuildThirdPartyAccount` doivent produire exactement les memes mouvements.

```prisma
enum RentBillingRunStatus {
  RUNNING
  DONE
  FAILED
}
```

Valeurs reprises telles quelles du plan (§5.1).

## Entites

### 1) ThirdPartyAccount

Compte de tiers a solde courant. Pour ce lot, seul `kind = TENANT` est cree, un compte par `TenantClient` (pas par bail), pour que le releve suive la personne meme si elle change de bail.

```prisma
model ThirdPartyAccount {
  id             String          @id @default(uuid()) @db.Uuid
  tenantId       String          @map("tenant_id")
  kind           ThirdPartyKind
  tenantClientId String?         @map("tenant_client_id")
  label          String
  balance        Decimal         @default(0) @db.Decimal(14, 2)
  currency       String          @default("XOF")
  isActive       Boolean         @default(true) @map("is_active")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")

  tenant       Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  tenantClient TenantClient?         @relation(fields: [tenantClientId], references: [id], onDelete: Cascade)
  movements    ThirdPartyMovement[]

  @@unique([tenantId, kind, tenantClientId])
  @@index([tenantId])
  @@index([tenantId, kind])
  @@index([tenantClientId])
  @@map("third_party_accounts")
}
```

**Champs.**

| Champ                     | Type Prisma                            | Colonne                     | Regle                                                                                                                                                                        |
| ------------------------- | -------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                      | `String @id @default(uuid()) @db.Uuid` | `id`                        | genere                                                                                                                                                                       |
| `tenantId`                | `String`                               | `tenant_id`                 | obligatoire, FK `Tenant` ; isolation multi-tenant                                                                                                                            |
| `kind`                    | `ThirdPartyKind`                       | `kind`                      | `TENANT` pour ce lot                                                                                                                                                         |
| `tenantClientId`          | `String?`                              | `tenant_client_id`          | FK `TenantClient`, obligatoire en pratique pour `kind = TENANT` ; nullable dans le schema car les kinds des lots suivants n'auront pas de `TenantClient`                     |
| `label`                   | `String`                               | `label`                     | nom affiche, copie depuis `TenantClient` a la creation du compte (evite une jointure sur chaque ligne de balance)                                                            |
| `balance`                 | `Decimal(14,2)`                        | `balance`                   | denormalise, egal au dernier `balanceAfter` du compte ; recalculable par `rebuildThirdPartyAccount`                                                                          |
| `currency`                | `String`                               | `currency`                  | `"XOF"` par defaut                                                                                                                                                           |
| `isActive`                | `Boolean`                              | `is_active`                 | `true` par defaut ; permet de desactiver un compte sans le supprimer (aucune suppression prevue, y compris pour les futurs kinds, par coherence avec le principe P-2 du PRD) |
| `createdAt` / `updatedAt` | `DateTime`                             | `created_at` / `updated_at` | standard                                                                                                                                                                     |

**Contraintes et index.**

- `@@unique([tenantId, kind, tenantClientId])` : empeche la creation de deux comptes `TENANT` pour le meme `TenantClient` dans le meme tenant. Cette unicite fonctionne sans index partiel tant que seul `kind = TENANT` existe (tous les `tenantClientId` sont alors non nuls) ; **des le lot 2**, quand un `kind` sans `tenantClientId` sera cree (`SUPPLIER`), Postgres traitera chaque `NULL` comme distinct des autres, ce qui est le comportement voulu (pas de collision fausse entre deux fournisseurs). Aucune migration corrective n'est donc necessaire au lot 2 pour cette table specifiquement.
- `@@index([tenantId])`, `@@index([tenantId, kind])` : les listes de balance filtrent toujours par tenant, parfois par nature de tiers.
- `@@index([tenantClientId])` : jointure depuis le module locatif (ouverture du releve depuis la fiche locataire).

### 2) ThirdPartyMovement

Chaque ligne du releve. Nait exclusivement d'une piece existante (echeance, paiement, penalite, annulation) ou de la campagne (avance appliquee). Jamais de saisie libre (principe P-2 du PRD).

```prisma
model ThirdPartyMovement {
  id            String                 @id @default(uuid()) @db.Uuid
  accountId     String                 @map("account_id") @db.Uuid
  tenantId      String                 @map("tenant_id")
  movementDate  DateTime               @map("movement_date")
  type          ThirdPartyMovementType
  debit         Decimal?               @db.Decimal(14, 2)
  credit        Decimal?               @db.Decimal(14, 2)
  balanceAfter  Decimal                @map("balance_after") @db.Decimal(14, 2)
  label         String
  sourceType    String                 @map("source_type")
  sourceId      String                 @map("source_id")
  leaseId       String?                @map("lease_id") @db.Uuid
  createdAt     DateTime               @default(now()) @map("created_at")

  account ThirdPartyAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  tenant  Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  lease   RentalLease?      @relation(fields: [leaseId], references: [id], onDelete: SetNull)

  @@unique([sourceType, sourceId, type])
  @@index([accountId, movementDate, createdAt])
  @@index([tenantId, movementDate])
  @@index([leaseId])
  @@map("third_party_movements")
}
```

**Champs.**

| Champ          | Type Prisma              | Colonne         | Regle                                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountId`    | `String @db.Uuid`        | `account_id`    | FK `ThirdPartyAccount`                                                                                                                                                                                                                                                                         |
| `tenantId`     | `String`                 | `tenant_id`     | denormalise depuis le compte, pour filtrer sans jointure et pour l'extension de garde tenant                                                                                                                                                                                                   |
| `movementDate` | `DateTime`               | `movement_date` | date metier du mouvement (date d'echeance, date de paiement, date d'application de l'avance) — distincte de `createdAt`, qui est la date d'ecriture technique                                                                                                                                  |
| `type`         | `ThirdPartyMovementType` | `type`          | voir enum ci-dessus                                                                                                                                                                                                                                                                            |
| `debit`        | `Decimal(14,2)?`         | `debit`         | nullable ; renseigne pour `INSTALLMENT`, `PENALTY`, `ADVANCE_APPLIED`, `ADJUSTMENT` (sens debiteur), et pour le mouvement inverse d'un `VOID` de credit                                                                                                                                        |
| `credit`       | `Decimal(14,2)?`         | `credit`        | nullable ; renseigne pour `PAYMENT`, `ADVANCE_RECEIVED`, `WAIVER`, et pour le mouvement inverse d'un `VOID` de debit                                                                                                                                                                           |
| `balanceAfter` | `Decimal(14,2)`          | `balance_after` | `balanceAfter` du mouvement precedent du meme compte, plus `debit`, moins `credit` (principe P-3 du PRD, meme calcul que `OwnerAccountTransaction.balanceAfter`)                                                                                                                               |
| `label`        | `String`                 | `label`         | libelle affiche sur le releve, en francais, jamais "debit"/"credit" (ex. "Loyer de septembre 2026", "Reglement Mobile Money", "Avance imputee sur loyer d'octobre 2026")                                                                                                                       |
| `sourceType`   | `String`                 | `source_type`   | identifie la piece d'origine : `RENTAL_INSTALLMENT`, `RENTAL_PAYMENT_ALLOCATION`, `RENTAL_PENALTY`, `RENTAL_PAYMENT` (pour `ADVANCE_RECEIVED`, quand le paiement n'est associe a aucune allocation), `RENT_BILLING_RUN` (pour `ADVANCE_APPLIED`, reference l'allocation creee par la campagne) |
| `sourceId`     | `String`                 | `source_id`     | identifiant de la piece source ; stocke en `String` simple (non `@db.Uuid` strict, ni relation Prisma directe) car il pointe vers des tables de nature differente selon `sourceType` — comparable au `sourceId` deja present sur `OwnerAccountTransaction`                                     |
| `leaseId`      | `String? @db.Uuid`       | `lease_id`      | optionnel, permet de filtrer un releve par bien/bail sans repasser par la piece source ; alimente pour tous les types issus du module locatif                                                                                                                                                  |

**Contraintes et index.**

- `@@unique([sourceType, sourceId, type])` : garantit l'idempotence du rejeu. `rebuildThirdPartyAccount` peut relancer la meme reconstruction sans dupliquer un mouvement, et le branchement dans les services locatifs peut etre appele deux fois par erreur (retry applicatif) sans consequence. Une meme piece peut engendrer plusieurs types de mouvements a des moments differents (ex. une echeance genere un `INSTALLMENT` puis, si son paiement echoue et le paiement est annule, un `VOID` reference la meme piece mais avec un type different) : la cle a trois colonnes le permet.
- `@@index([accountId, movementDate, createdAt])` : ordre d'affichage du releve (chronologique, puis par ordre d'ecriture en cas d'egalite de date).
- `@@index([tenantId, movementDate])` : calcul de la balance par periode en `groupBy` SQL (voir `research.md`, correction du point "Balance" du plan).
- `@@index([leaseId])` : filtre de la balance clients par bien (le bien se retrouve par `RentalLease.property_id`).

### 3) RentBillingRun

Campagne de facturation mensuelle. Un objet par periode et par tenant.

```prisma
model RentBillingRun {
  id              String               @id @default(uuid()) @db.Uuid
  tenantId        String               @map("tenant_id")
  periodYear      Int                  @map("period_year")
  periodMonth     Int                  @map("period_month")
  label           String
  status          RentBillingRunStatus @default(RUNNING)
  startedAt       DateTime             @default(now()) @map("started_at")
  finishedAt      DateTime?            @map("finished_at")
  createdByUserId String               @map("created_by_user_id")
  summary         Json?

  tenant      Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdBy   User   @relation(fields: [createdByUserId], references: [id])

  @@unique([tenantId, periodYear, periodMonth])
  @@index([tenantId, status])
  @@map("rent_billing_runs")
}
```

**Champs.**

| Champ                        | Type Prisma            | Colonne                        | Regle                                                                                                                                                                                                                                                   |
| ---------------------------- | ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `periodYear` / `periodMonth` | `Int`                  | `period_year` / `period_month` | meme grain que `RentalInstallment.period_year` / `period_month`, pour que la generation reutilise directement la contrainte unique existante de cette table                                                                                             |
| `label`                      | `String`               | `label`                        | ex. "Loyer de septembre 2026", saisi ou derive du mois/annee a la creation                                                                                                                                                                              |
| `status`                     | `RentBillingRunStatus` | `status`                       | `RUNNING` a la creation, `DONE` a la cloture normale, `FAILED` si la transaction echoue avant la fin (aucune ligne partielle : voir `research.md`)                                                                                                      |
| `startedAt` / `finishedAt`   | `DateTime`             | `started_at` / `finished_at`   | mesure de duree, utile au suivi de performance                                                                                                                                                                                                          |
| `createdByUserId`            | `String`               | `created_by_user_id`           | FK `User`, obligatoire (D7 du plan : toute piece porte un auteur, meme si la validation separee n'arrive qu'au lot 2)                                                                                                                                   |
| `summary`                    | `Json?`                | `summary`                      | structure : `{ "billed": [{ leaseId, installmentId, amount }], "excluded": [{ leaseId, reason }], "advancesApplied": [{ tenantClientId, installmentId, amount, sourcePaymentId }] }` ; nullable tant que la campagne est `RUNNING`, rempli a la cloture |

**Contraintes et index.**

- `@@unique([tenantId, periodYear, periodMonth])` : relancer la campagne sur la meme periode met a jour le meme enregistrement (upsert) plutot que d'en creer un second ; c'est le mecanisme d'idempotence au niveau de la campagne elle-meme, distinct de celui des echeances (qui repose sur `RentalInstallment`'s propre contrainte unique).
- `@@index([tenantId, status])` : liste des campagnes en cours ou en echec.

## Relations inversees sur modeles existants

Ajouts strictement additifs, sans modification de colonne existante :

### Tenant (existant)

```prisma
thirdPartyAccounts  ThirdPartyAccount[]
thirdPartyMovements ThirdPartyMovement[]
rentBillingRuns     RentBillingRun[]
```

### TenantClient (existant)

```prisma
thirdPartyAccounts ThirdPartyAccount[]
```

### RentalLease (existant)

```prisma
thirdPartyMovements ThirdPartyMovement[]
```

### User (existant)

```prisma
rentBillingRuns RentBillingRun[] @relation("RentBillingRunCreatedBy")
```

(Nom de relation explicite, par coherence avec les autres relations `*CreatedBy` deja presentes sur `RentalPayment.createdBy` et `RentalRefund.createdBy`.)

## Invariants transverses

- Aucune creation, modification ou suppression des tables `RentalInstallment`, `RentalPayment`, `RentalPaymentAllocation`, `RentalPenalty`, `TenantClient` par ce lot : elles restent la source de verite, ce lot n'en est qu'une projection en lecture accumulee.
- `ThirdPartyMovement.balanceAfter` est toujours egal au `balanceAfter` du mouvement precedent du meme compte (par `movementDate` puis `createdAt`), plus `debit`, moins `credit`. Le premier mouvement d'un compte part d'un solde de zero (aucune reprise de solde d'ouverture manuel dans ce lot ; voir Assumptions de `spec.md`).
- `ThirdPartyAccount.balance` est toujours egal au `balanceAfter` du dernier `ThirdPartyMovement` du compte (ou zero si aucun mouvement). Il est recalculable a tout moment par `rebuildThirdPartyAccount` et ne doit jamais diverger silencieusement : un ecart signale un bogue d'integration, jamais un etat metier valide.
- Toute ecriture dans `ThirdPartyMovement` a lieu dans la meme transaction Prisma que la piece qui la declenche (echeance, allocation de paiement, penalite, annulation). Un appel au grand livre hors transaction est une erreur de revue, pas une variante acceptable (garde-fou repris du plan §11).
- Aucun champ `debit`/`credit` n'est expose par l'API de lecture sous ces noms a l'utilisatrice : les endpoints et les schemas Zod traduisent en "montant facture" / "montant regle" / "solde" au niveau du contrat (voir `contracts/openapi.yaml`), meme si les colonnes internes portent ces noms pour rester coherentes avec le vocabulaire comptable du reste du schema.
- Montants : `Decimal(14,2)` sur les trois nouvelles tables, jamais de `number`/`float` en base ni dans les calculs serveur (utilisation de `Prisma.Decimal` / `decimal.js`, comme le reste du domaine financier du depot).
