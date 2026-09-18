# Implementation Plan: Gestion financiere operationnelle - Fournisseurs et chantiers (lot 2)

**Branch**: `[017-finance-fournisseurs-chantiers]` | **Date**: 2026-09-18 | **Spec**: [`specs/017-finance-fournisseurs-chantiers/spec.md`](./spec.md)
**Input**: Feature specification from `/specs/017-finance-fournisseurs-chantiers/spec.md`, PRD `docs/finance/PRD-gestion-financiere-chantiers.md`, Plan de mise en oeuvre `docs/finance/PLAN-mise-en-oeuvre.md` (§6), `docs/finance/LOT-1-RAPPORT.md`

## Summary

Ce lot fait exister l'argent qui sort. Il generalise d'abord le moteur comptable de copropriete (`ChartOfAccount`, `AccountingJournal`, `JournalEntry`) pour qu'il soit porte par `tenantId` et puisse servir des ecritures sans `syndicateId`, en corrigeant au passage les cinq defauts que les tests de caracterisation du lot 0 ont fixes comme garde-fou (§6.1 bis du plan). Il introduit ensuite les fournisseurs (`Supplier`, `SupplierInvoice`, `SupplierPayment`) et un chantier de premiere classe (`ConstructionSite`, decision D5 : une table neuve, pas un renommage de `WorkProgram`), relies par une imputation (`CostAllocation`) dont la somme, par chantier, devient le cout reel derive - jamais saisi. Une file de validation separe pour la premiere fois la saisie de la validation (decision D7), un droit deja scaffold sans usage depuis le lot 1. Une piece de caisse (`CashVoucher`) suit l'organisation de caisse actee par le porteur du projet le 18 septembre 2026 en reponse a la question 7 du PRD (§14) : une seule caisse par tenant, la gestionnaire emet, le dirigeant valide.

Ce lot reutilise integralement le grand livre du lot 1 (`lib/finance/ledger.ts`, `lib/finance/money.ts`) pour le calcul de `balanceAfter` des comptes de tiers fournisseurs, et ajoute au-dessus un chemin d'ecriture en partie double (`postDocumentEntryTx`) qui n'existait pas encore : le lot 1 n'ecrivait volontairement aucune ecriture de journal (decision D2). C'est le lot le plus lourd du plan (cinq a sept semaines) et le plus risque (PRD §13, "la generalisation casse la comptabilite de copropriete") : sa migration touche des tables en production depuis la spec 014.

## Technical Context

**Language/Version**: TypeScript 5.x (backend Node.js + frontend React 18)
**Primary Dependencies**: Express 4, Prisma 5, Zod, Jest (backend), React, Ant Design, React Query, Vitest (frontend)
**Storage**: PostgreSQL via Prisma (`packages/api/prisma/schema.prisma`)
**Testing**: Jest backend (`packages/api/__tests__/{unit,api,integration}`), Vitest frontend (`apps/web/src/__tests__/`), plus la suite de caracterisation du lot 0 (`syndics.accounting.characterization.test.ts`, `syndics.owner-accounts.ledger.test.ts`, 54 cas) comme garde-fou de non-regression explicite
**Target Platform**: Application web SaaS ImmoTopia multi-tenant (API Node.js + SPA React)
**Project Type**: Monorepo web application (`packages/api` + `apps/web`)
**Performance Goals**: aucun seuil chiffre nouveau specifie par le PRD pour les fournisseurs ou les chantiers ; les agregations (balance fournisseurs, cout reel de chantier) sont ecrites en `groupBy` SQL par prudence, sur le meme principe que la balance clients du lot 1, sans qu'un chiffre de charge n'ait ete demande pour ce lot
**Constraints**: isolation tenant stricte sur toute nouvelle entite ; migration de generalisation additive et **rejouable** (retro-remplissage `tenantId`, index partiels remplacant l'unicite `(syndicateId, accountNumber)`) ; aucune table de copropriete supprimee ni renommee ; aucune ecriture desequilibree ne doit plus pouvoir etre stockee (correction du defaut §6.1 bis n°1) ; toute piece validee est immuable, corrigee uniquement par annulation ; aucun ecran n'expose "debit" ou "credit" ; montants `Decimal(14,2)`, devise stockee `XOF`, affichee "FCFA" ; non-regression totale des suites locative, copropriete et Patrimoine existantes
**Scale/Scope**: generalisation de 4 modeles existants (`ChartOfAccount`, `AccountingJournal`, `JournalEntry`, `JournalEntryLine`) et 1 enum (`SourceType`) ; environ 10 nouvelles entites Prisma (`VoidDocument`, `Supplier`, `SupplierInvoice`, `SupplierInvoiceLine`, `SupplierPayment`, `SupplierPaymentAllocation`, `ConstructionSite`, `CostCategory`, `CostAllocation`, `CashVoucher`) et leurs enums associes ; 1 modele existant etendu (`WorkProgram.constructionSiteId`) ; une vingtaine de nouveaux endpoints sous `/api/tenants/:tenantId/finance/*` ; six ecrans neufs plus l'extension d'un ecran Patrimoine existant

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Pre-Phase 0 :

- Principe I (UI en francais uniquement) : conforme. Tous les libelles des six ecrans de ce lot sont en francais ; aucun mot "debit" ni "credit" n'est expose (FR-028, SC-004 de `spec.md`) ; le mot "imputer" remplace "debiter/crediter" comme le lot 1 avait etabli "facturer/regler".
- Principe II (aucune donnee fictive) : conforme. Aucun seed fictif de fournisseur ou de chantier n'est ajoute par ce lot au-dela des jeux de postes de depense par defaut, qui sont un parametrage, pas une donnee metier.
- Principe III (stack imposee) : conforme. TypeScript + Express + Prisma + PostgreSQL + React, sans nouvelle dependance (la sequence de numerotation des pieces de caisse s'appuie sur une sequence PostgreSQL native ou un verrou `SELECT ... FOR UPDATE`, pas sur une bibliotheque tierce).
- Principe IV (debogage systematique) : conforme. Les six ecrans seront verifies avec Vitest et, en cas d'anomalie visuelle, les outils standards du depot, avant integration.
- Principe V (workflow et qualite) : conforme, avec une exigence renforcee propre a ce lot : la migration de generalisation est **rejouee sur une copie de la base de demonstration** avant toute fusion (voir `research.md`, section migration), et la suite de caracterisation du lot 0 sert de critere de non-regression explicite et nomme, pas seulement de "tests existants qui doivent passer".

Post-Phase 1 : a revalider une fois `data-model.md`, `research.md` et `contracts/` geles ; le point d'attention principal reste la sequence exacte des operations de la migration `generalize_accounting_scope` (voir `data-model.md`, section Migration), qui n'a pas encore ete executee contre une copie reelle de la base de demonstration au moment de la redaction de ce document.

Resultat : aucun blocage constitutionnel pour demarrer la phase de conception detaillee. Le risque du lot n'est pas constitutionnel, il est technique et documente dans `research.md`.

## Project Structure

### Documentation (this feature)

```text
specs/017-finance-fournisseurs-chantiers/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- tasks.md
|-- quickstart.md
`-- contracts/
    `-- openapi.yaml
```

### Source Code (repository root)

```text
packages/api/
|-- prisma/
|   |-- schema.prisma                                 # generalisation ChartOfAccount/AccountingJournal/JournalEntry,
|   |                                                  # extension SourceType, nouveaux modeles et enums
|   `-- migrations/
|       |-- <horodatage>_generalize_accounting_scope/  # tenantId + scope + index partiels, additive et rejouable
|       `-- <horodatage>_add_finance_suppliers_sites/   # Supplier, SupplierInvoice(Line), SupplierPayment(Allocation),
|                                                        # ConstructionSite, CostCategory, CostAllocation, CashVoucher,
|                                                        # VoidDocument, WorkProgram.constructionSiteId
|-- src/
|   |-- lib/
|   |   |-- finance/
|   |   |   |-- ledger.ts                              # inchange dans son API publique (lot 1) ; reutilise pour SUPPLIER
|   |   |   |-- money.ts                                # roundMoney revu (defaut §6.1 bis n°4 : precision XOF)
|   |   |   |-- accounting.ts                           # nouveau : postDocumentEntryTx, voidDocumentTx (chemin d'ecriture unique)
|   |   |   |-- chart.ts                                # nouveau : plan de comptes operationnel par tenant, jeu minimal
|   |   |   |-- suppliers.ts                            # nouveau : creation fournisseur, facture, reglement, allocations
|   |   |   |-- sites.ts                                # nouveau : ConstructionSite, CostCategory, getSiteActualCost
|   |   |   |-- cost-allocation.ts                      # nouveau : imputation, controle de somme, sync WorkProgram
|   |   |   |-- cash-vouchers.ts                        # nouveau : numerotation sequentielle, impression
|   |   |   |-- reports.ts                              # etendu : balance fournisseurs, releve fournisseur
|   |   |   |-- validation-queue.ts                     # nouveau : file "Pieces a valider"
|   |   |   |-- schemas.ts                              # etendu : schemas Zod fournisseurs/chantiers/caisse
|   |   |   `-- types.ts                                # etendu
|   |   |-- syndics/
|   |   |   |-- queries.ts                              # signatures `*BySyndicate` inchangees ; nouvelles fonctions
|   |   |   |                                           # generiques vivent dans lib/finance/, pas ici
|   |   |   `-- finance-utils.ts                        # roundMoney reexporte depuis lib/finance/money.ts, inchange
|   |   `-- patrimoine/
|   |       |-- queries.ts                              # sync WorkProgram.actualCost depuis ConstructionSite
|   |       `-- schemas.ts                              # actualCost retire de updateWorkProgramSchema quand
|   |                                                    # constructionSiteId est renseigne (validation conditionnelle)
|   |-- controllers/
|   |   |-- finance-controller.ts                       # etendu : fournisseurs, chantiers, caisse, validation
|   |   `-- patrimoine-controller.ts                     # etendu : rattachement chantier sur un programme de travaux
|   |-- routes/
|   |   |-- finance-routes.ts                            # etendu
|   |   `-- patrimoine-routes.ts                          # etendu (une route de rattachement)
|   |-- middleware/
|   |   `-- finance-rbac-middleware.ts                   # inchange : les six gardes existent deja depuis le lot 1
|   |                                                     # (requireDocumentsValidate, requireSitesManage,
|   |                                                     # requireSettingsManage) sans route qui les utilise encore
|   `-- scripts/
|       `-- finance-migration-rehearsal.ts               # nouveau : rejoue generalize_accounting_scope sur une copie
|                                                          # de la base de demonstration et rapporte les ecarts
|-- prisma/seeds/
|   |-- finance-permissions-seed.ts                      # inchange (permissions deja creees au lot 1)
|   `-- finance-cost-categories-seed.ts                  # nouveau : jeu de postes par defaut
`-- __tests__/
    |-- api/
    |   |-- syndics.accounting.characterization.test.ts # mis a jour : cas SURPRISE corriges, garde-fou du lot
    |   |-- finance.suppliers.test.ts
    |   |-- finance.supplier-invoices.test.ts
    |   |-- finance.supplier-payments.test.ts
    |   |-- finance.construction-sites.test.ts
    |   |-- finance.cost-allocations.test.ts
    |   |-- finance.cash-vouchers.test.ts
    |   `-- finance.validation-queue.test.ts
    |-- unit/
    |   |-- syndics.owner-accounts.ledger.test.ts        # mis a jour : cas SURPRISE corriges
    |   |-- finance.accounting.post-document-entry.test.ts
    |   |-- finance.cost-allocation.invariant.test.ts
    |   `-- finance.cash-voucher.sequence.test.ts
    `-- integration/
        |-- finance.migration-rehearsal.test.ts          # migration rejouee deux fois, verifie l'idempotence
        `-- finance.patrimoine-non-regression.test.ts

apps/web/
`-- src/
    |-- types/
    |   `-- finance-types.ts                             # etendu
    |-- services/
    |   `-- finance-service.ts                           # etendu
    |-- pages/finance/
    |   |-- Fournisseurs.tsx
    |   |-- FactureFournisseur.tsx
    |   |-- ReglementFournisseur.tsx
    |   |-- BalanceFournisseurs.tsx
    |   |-- ReleveFournisseur.tsx
    |   |-- Chantiers.tsx
    |   |-- FicheChantier.tsx                            # onglets Imputations / Pieces
    |   |-- PieceDeCaisse.tsx
    |   `-- PiecesAValider.tsx
    |-- pages/patrimoine/work-programs/
    |   `-- WorkProgramForm.tsx                           # etendu : lien chantier, champ cout en lecture seule si lie
    `-- __tests__/finance/
        |-- Fournisseurs.test.tsx
        |-- BalanceFournisseurs.test.tsx
        |-- ReleveFournisseur.test.tsx
        |-- Chantiers.test.tsx
        |-- FicheChantier.test.tsx
        |-- PieceDeCaisse.test.tsx
        `-- PiecesAValider.test.tsx
```

**Structure Decision**: extension du module `finance` cree au lot 1, qui reste un pair de `syndics` et `patrimoine`. La generalisation comptable vit entierement dans `lib/finance/` (nouveaux fichiers `accounting.ts`, `chart.ts`) : les fonctions `*BySyndicate` de `lib/syndics/queries.ts` gardent leur signature exacte, conformement a la decision D6 du plan, pour qu'aucun appelant existant n'ait a changer. Le rattachement `WorkProgram.constructionSiteId` est le seul point de couture avec le module Patrimoine, limite a une extension de schema Zod (validation conditionnelle) et une synchronisation appelee depuis `lib/finance/cost-allocation.ts`, jamais l'inverse : le module Patrimoine ne connait pas les details d'imputation, il lit seulement un cout reel.

## Complexity Tracking

| Violation                                                                                                                      | Why Needed                                                                                                                                                                                                 | Simpler Alternative Rejected Because                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deux migrations Prisma dans le meme lot (`generalize_accounting_scope` puis `add_finance_suppliers_sites`) plutot qu'une seule | La generalisation touche des tables en production (copropriete) et doit pouvoir etre rejouee et verifiee isolement avant que les nouvelles tables, elles sans risque (purement additives), ne s'y ajoutent | Une migration unique melangerait un changement a risque eleve (nullable + index partiels sur des tables existantes) et des creations de table sans risque, rendant plus difficile un rollback cible si la premiere partie echouait en repetition |
