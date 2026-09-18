# Quickstart: Gestion financiere operationnelle - Fournisseurs et chantiers (lot 2)

**Feature**: 017-finance-fournisseurs-chantiers
**Date**: 2026-09-18

**Etat**: comme le quickstart du lot 1, ce document decrit la sequence de mise en route et de verification **une fois le lot 2 implemente** (`tasks.md`). Aucune des commandes ci-dessous n'a ete executee contre du code reel au moment de la redaction : ce lot n'existe pour l'instant qu'a l'etat de specification.

## Prerequis

- Les prerequis du lot 1 (Node 20, PostgreSQL, `npm install` a la racine) restent valables.
- Le lot 1 doit etre fusionne et sa migration appliquee : le grand livre (`lib/finance/ledger.ts`) et les comptes de tiers locataires sont reutilises par ce lot.
- **Prealable specifique a ce lot** : verifier l'etat reel des migrations Prisma sur l'environnement cible avant de commencer (`npx prisma migrate status` depuis `packages/api`). Sur l'environnement deja verifie pour cette specification, la chaine compte 32 migrations a jour, `20260907120000_tenant_scoping_and_money_precision` comprise (voir `research.md` §1.5/§4.4) ; revalider ce point sur tout autre environnement avant d'interpreter un ecart de schema inattendu.

## 1. Repetition de la migration a risque, avant de la jouer pour de vrai

Contrairement au lot 1 (purement additif, aucune table existante touchee), ce lot modifie des tables en production depuis la spec 014 (`ChartOfAccount`, `AccountingJournal`, `JournalEntry`). La sequence recommandee :

```bash
cd packages/api
# 1. Sur une copie de la base de demonstration (jamais la base reelle) :
npx ts-node scripts/finance-migration-rehearsal.ts --source <url_base_demo> --target <url_copie>

# 2. Verifier le rapport : nombre de lignes retro-remplies sur ChartOfAccount
#    et AccountingJournal, zero ligne orpheline (tenant_id NULL), zero erreur.

# 3. Executer la suite de caracterisation du lot 0 CONTRE LA COPIE, avant toute
#    correction de defaut, pour verifier que la migration seule ne change rien
#    d'observable :
npx jest --runInBand __tests__/api/syndics.accounting.characterization.test.ts __tests__/unit/syndics.owner-accounts.ledger.test.ts
```

Seulement apres ce rehearsal reussi, appliquer pour de vrai :

```bash
npx prisma validate
npx prisma migrate dev --name generalize_accounting_scope
npx prisma migrate dev --name add_finance_suppliers_sites
npm run prisma:generate
```

## 2. Verifier les cinq defauts corriges

Apres l'implementation complete de `tasks.md` Phase 2 (US1), executer la suite de caracterisation a nouveau et comparer avec `data-model.md` §2 :

```bash
cd packages/api
npx jest --runInBand __tests__/api/syndics.accounting.characterization.test.ts __tests__/unit/syndics.owner-accounts.ledger.test.ts
```

**Attendu** : tous les cas passent, sauf celui du defaut 5 (`syndics.accounting.characterization.test.ts:375`) dont l'**intitule et l'assertion ont change** (409 au lieu de 400, prefixe `SURPRISE` retire). Tout autre cas dont l'assertion aurait change sans etre documente dans `data-model.md` §2 est une regression, pas une correction voulue.

## 3. Lancer l'API et le web

```bash
npm run dev        # API (port 8001) + web (port 3000) ensemble
```

## 4. Routes du lot (reference)

Prefixe : `/api/tenants/:tenantId/finance` (voir `contracts/openapi.yaml` pour le detail complet).

- Fournisseurs : `POST /suppliers`, `GET /suppliers`, `GET /suppliers/:supplierId`
- Factures : `POST /suppliers/:supplierId/invoices`, `POST /supplier-invoices/:invoiceId/validate`, `POST /supplier-invoices/:invoiceId/void`
- Reglements : `POST /suppliers/:supplierId/payments`, `POST /supplier-payments/:paymentId/validate`
- Balance et releve fournisseurs : `GET /suppliers/balance`, `GET /accounts/:accountId/statement` (route du lot 1, generalisee)
- Chantiers : `POST /sites`, `GET /sites`, `GET /sites/:siteId`, `GET /sites/:siteId/detail`
- Pieces de caisse : `POST /sites/:siteId/cash-vouchers`, `POST /cash-vouchers/:voucherId/validate`, `GET /cash-vouchers/:voucherId.pdf`
- Validation : `GET /validation-queue`

Endpoint Patrimoine etendu :

- `PATCH /api/tenants/:tenantId/patrimoine/work-programs/:id/construction-site`

## 5. Verifications automatisees a executer une fois le lot implemente

```bash
cd packages/api
npx jest --runInBand __tests__/unit/finance.*.test.ts __tests__/api/finance.*.test.ts __tests__/integration/finance.*.test.ts

cd apps/web
npx vitest run src/__tests__/finance
```

Non-regression (rappel des criteres de sortie, `spec.md` SC-007) :

```bash
cd packages/api
npx jest --runInBand __tests__/integration/rental.integration.test.ts
npx jest --runInBand __tests__/api/syndics.accounting.characterization.test.ts __tests__/unit/syndics.owner-accounts.ledger.test.ts
npx jest --runInBand __tests__/api/patrimoine.work-programs.test.ts
```

## 6. Scenario de bout en bout (demonstration du lot)

Rejoue le recit central : creer un fournisseur, creer un chantier, facturer, imputer, regler, constater le cout reel derive.

1. **Creer un chantier** : `POST /tenants/{tenantId}/finance/sites` `{ "name": "Residence Zone 4", "zone": "Zone 4", "startDate": "2026-10-01" }` -> chantier cree, cout reel a zero.
2. **Creer un fournisseur de materiaux** : `POST /tenants/{tenantId}/finance/suppliers` `{ "name": "Quincaillerie Diallo", "kind": "MATERIALS" }` -> fournisseur cree, compte de tiers a solde zero.
3. **Saisir une facture rattachee au chantier** : `POST /tenants/{tenantId}/finance/suppliers/{supplierId}/invoices` avec `siteId`, montant et imputation (poste "gros oeuvre") -> facture en brouillon.
4. **Valider la facture** : `POST /tenants/{tenantId}/finance/supplier-invoices/{invoiceId}/validate` (necessite le droit `finance.documents.validate`) -> ecriture postee et verrouillee, compte fournisseur credite, imputation creee.
5. **Verifier le cout reel du chantier** : `GET /tenants/{tenantId}/finance/sites/{siteId}` -> `actualCost` egal au montant de la facture.
6. **Verifier la balance fournisseurs** : `GET /tenants/{tenantId}/finance/suppliers/balance` -> le fournisseur apparait avec le solde du.
7. **Regler la facture** : `POST /tenants/{tenantId}/finance/suppliers/{supplierId}/payments` avec allocation sur la facture -> compte fournisseur solde.
8. **Emettre une piece de caisse sur le meme chantier** : `POST /tenants/{tenantId}/finance/sites/{siteId}/cash-vouchers`, la valider -> numero sequentiel attribue, cout reel du chantier augmente d'autant.
9. **Consulter le detail du chantier** : `GET /tenants/{tenantId}/finance/sites/{siteId}/detail` -> deux imputations (facture, piece de caisse), sous-totaux par poste.
10. **Tenter une modification de la facture validee** : `PATCH` ou suppression -> 409, message metier.

## 7. Verification metier obligatoire

- Aucun ecran ni aucune reponse d'API de ce lot n'expose les mots "debit" ou "credit" ; "imputer" est le seul mot nouveau ajoute au vocabulaire de l'utilisatrice.
- Aucune route n'accepte d'ecrire `ConstructionSite.actualCost` ; il n'est jamais present que comme valeur calculee dans les reponses de lecture.
- Toute piece financiere de ce lot (facture, reglement, piece de caisse) reste brouillon, sans ecriture, sans imputation, jusqu'a sa validation explicite par un utilisateur distinct portant `finance.documents.validate`.
- La migration `generalize_accounting_scope`, rejouee sur une copie de la base de demonstration, ne modifie aucune donnee de copropriete au-dela du retro-remplissage de `tenantId` (verifie par le rapport de `finance-migration-rehearsal.ts`).
- La suite de caracterisation du lot 0 reste verte, a l'exception documentee du seul cas du defaut 5.
