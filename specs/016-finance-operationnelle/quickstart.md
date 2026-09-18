# Quickstart: Gestion financiere operationnelle - Volet clients (lot 1)

**Feature**: 016-finance-operationnelle
**Date**: 2026-09-18

**Etat**: ce document decrit la sequence de mise en route et de verification **une fois le lot 1 implemente** (`tasks.md`). Aucune des commandes ci-dessous n'a encore ete executee contre du code reel : contrairement aux quickstarts des specs 014 et 015 (qui consignent un resultat de verification deja obtenu), ce lot n'existe pour l'instant qu'a l'etat de specification. Deux commandes signalees a la section 2 n'existent pas encore dans `packages/api/package.json` et devront etre ajoutees par le lot 1 (taches T014 et T026 de `tasks.md`).

## Prerequis

- Node.js 20 (voir `.nvmrc` a la racine du depot)
- PostgreSQL disponible, variables d'environnement API configurees (`packages/api/.env`, voir `env.example`)
- Dependances installees **a la racine uniquement** (`npm install`), jamais separement dans `apps/web` ou `packages/api` (monorepo npm workspaces, un seul `package-lock.json` - `CONTRIBUTING.md`)

## 1. Migration et client Prisma

Depuis `packages/api` :

```bash
cd packages/api
npx prisma validate
npx prisma migrate dev --name add_finance_third_party_accounts
npm run prisma:generate
```

Ou, depuis la racine du monorepo, en suivant la forme documentee par `CONTRIBUTING.md` :

```bash
npm run prisma:migrate -w @immotopia/api
```

`npx prisma validate` et `npm run prisma:generate` (= `prisma generate`) sont verifies dans `packages/api/package.json`. `npx prisma migrate dev` fonctionne sans etre un script npm nomme, car `prisma` est une dependance du paquet ; c'est aussi la forme employee telle quelle par `specs/015-patrimoine-module/quickstart.md`.

## 2. Retro-remplir les comptes de tiers locataires

Le script de retro-remplissage (`packages/api/scripts/finance-backfill-tenant-accounts.ts`, tache T014 de `tasks.md`) rejoue `rebuildThirdPartyAccount` pour chaque `TenantClient` locataire du tenant vise, a partir des echeances, paiements et penalites deja en base. Il refuse de tourner sans l'option `--tenant`.

```bash
cd packages/api
npx ts-node scripts/finance-backfill-tenant-accounts.ts --tenant <tenantId>
```

**A creer par le lot 1** : ce script n'a aujourd'hui aucune entree dans `packages/api/package.json`. Tous les scripts ponctuels existants du paquet en ont une (`check:missing-lease-data`, `check:property-data`, `debug:lease-property-select`, `ensure:whatsapp-maintenance`...) ; par coherence, le lot 1 doit ajouter une entree du meme type, par exemple :

```json
"finance:backfill-tenant-accounts": "ts-node scripts/finance-backfill-tenant-accounts.ts"
```

Le script de charge a 500 comptes (`packages/api/scripts/finance-load-test.ts`, tache T026) n'a lui non plus aucune entree ; le lot 1 devra de meme y ajouter, par exemple, `"finance:load-test": "ts-node scripts/finance-load-test.ts"`.

## 3. Lancer l'API et le web

Depuis la racine du monorepo (commandes verifiees dans `package.json` racine) :

```bash
npm run dev        # API (port 8001) + web (port 3000) ensemble
```

ou separement :

```bash
npm run dev:api     # API seule
npm run dev:web     # web seul
```

## 4. Routes du lot (reference)

Prefixe : `/api/tenants/:tenantId/finance` (voir `contracts/openapi.yaml` pour le detail complet).

- Balance : `GET /clients/balance`, `GET /clients/balance-agee`
- Compte de tiers : `GET /accounts/:accountId/statement`, `GET /accounts/:accountId/statement.pdf`
- Campagne de facturation : `POST /billing-runs`, `GET /billing-runs`, `GET /billing-runs/:runId`

Endpoints locatifs existants reutilises par le scenario de la section 6 (verifies dans `packages/api/src/routes/rental-routes.ts`) :

- `POST /api/tenants/:tenantId/rental/payments` (encaisser un reglement)
- `POST /api/tenants/:tenantId/rental/payments/:paymentId/allocate` (allouer un reglement a une ou plusieurs echeances)

## 5. Verifications automatisees a executer une fois le lot implemente

Backend (forme reprise de `specs/014-integrer-specs-complementaires/quickstart.md` et `specs/015-patrimoine-module/quickstart.md`, script `test` = `jest` verifie dans `packages/api/package.json`) :

```bash
cd packages/api
npx jest --runInBand __tests__/unit/finance.*.test.ts __tests__/api/finance.*.test.ts
```

Frontend : **attention**, contrairement a ce que citent les quickstarts des specs 014 et 015 (`npm test -- --watchAll=false --testPathPattern=...`, une syntaxe Jest/CRA), le script `test` de `apps/web/package.json` est aujourd'hui `vitest run` — ce depot a migre vers Vitest cote web (confirme par `AGENTS.md`, "Vitest côté web", et par le script reel). La syntaxe `--testPathPattern` n'existe pas pour Vitest ; la commande correcte est :

```bash
cd apps/web
npx vitest run src/__tests__/finance
```

Non-regression locative (rappel du critere de sortie du lot, `spec.md` SC-006) :

```bash
cd packages/api
npx jest --runInBand __tests__/integration/rental.integration.test.ts
```

## 6. Scenario de bout en bout (demonstration du lot)

Rejoue le recit central du lot : facturer un mois, encaisser un reglement sans echeance en face, relancer la campagne, constater que l'avance s'est imputee et que le releve le montre. Toutes les requetes portent le prefixe `/api`.

1. **Facturer le mois de septembre 2026** pour tous les baux actifs :
   `POST /tenants/{tenantId}/finance/billing-runs`
   `{ "periodYear": 2026, "periodMonth": 9, "label": "Loyer de septembre 2026" }`
   -> une echeance est creee pour chaque bail actif eligible ; le compte rendu liste les baux factures et les exclus avec motif.

2. **Verifier la balance** : `GET /tenants/{tenantId}/finance/clients/balance` doit refleter les echeances de septembre fraichement generees pour chaque locataire concerne.

3. **Encaisser un reglement sans echeance en face** pour un locataire dont l'echeance d'octobre n'existe pas encore :
   `POST /tenants/{tenantId}/rental/payments` avec le montant du loyer, sans `installmentId` disponible a allouer (aucune echeance d'octobre n'existe encore a ce stade).

4. **Verifier que le compte devient crediteur** : `GET /tenants/{tenantId}/finance/accounts/{accountId}/statement` doit montrer un mouvement `ADVANCE_RECEIVED` (credit) et un solde negatif (crediteur) pour ce locataire.

5. **Relancer la campagne pour octobre 2026** :
   `POST /tenants/{tenantId}/finance/billing-runs`
   `{ "periodYear": 2026, "periodMonth": 10, "label": "Loyer d'octobre 2026" }`
   -> la nouvelle echeance d'octobre est generee pour ce locataire, et le solde crediteur disponible lui est impute automatiquement avant la cloture de la campagne.

6. **Constater l'imputation** :
   - le compte rendu de la campagne (`GET /tenants/{tenantId}/finance/billing-runs/{runId}`) liste ce locataire dans `advancesApplied` ;
   - le releve (`GET /tenants/{tenantId}/finance/accounts/{accountId}/statement`) montre desormais la paire de mouvements `INSTALLMENT` (l'echeance d'octobre) et `ADVANCE_APPLIED` (l'avance consommee), avec un solde de cloture coherent (solde regle si l'avance couvrait exactement l'echeance, ou solde partiellement crediteur/debiteur sinon).

7. **Relancer une seconde fois la meme campagne d'octobre** (idempotence) : `POST /tenants/{tenantId}/finance/billing-runs` avec les memes `periodYear`/`periodMonth` ne cree aucune echeance supplementaire et renvoie un compte rendu equivalent.

## 7. Verification metier obligatoire

- Aucun ecran ni aucune reponse d'API de ce lot n'expose les mots "debit" ou "credit" (voir `spec.md` FR-014 et SC-005).
- Toute requete est isolee par `tenantId` : un compte, un mouvement ou une campagne d'un autre tenant renvoie un acces refuse, jamais une fuite de donnee.
- Aucune table existante (`RentalInstallment`, `RentalPayment`, `RentalPaymentAllocation`, `TenantClient`, `OwnerAccount`) n'est modifiee par la migration du lot 1.
- La suite de tests locative existante reste verte apres l'introduction du lot (section 5).
