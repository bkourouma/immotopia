# Data Model: Gestion financiere operationnelle - Fournisseurs et chantiers (lot 2)

**Feature**: 017-finance-fournisseurs-chantiers
**Date**: 2026-09-18
**Status**: Draft

## Overview

Ce lot touche le schema en deux temps distincts, deliberement separes en deux migrations (voir `plan.md`, Complexity Tracking) :

1. **Generalisation** (`generalize_accounting_scope`) : quatre tables existantes de la copropriete (`ChartOfAccount`, `AccountingJournal`, `JournalEntry`, `JournalEntryLine`) et un enum (`SourceType`) sont etendus pour porter une ecriture qui n'appartient a aucune copropriete. C'est la seule partie de ce lot qui touche des tables en production. Aucune ligne existante n'est supprimee ni deplacee ; le risque est celui d'une contrainte d'unicite mal reconstruite, pas celui d'une perte de donnees.
2. **Creation** (`add_finance_suppliers_sites`) : dix tables neuves, toutes portees par `tenantId` des l'origine, plus une colonne ajoutee a `WorkProgram` (existant, deja `tenantId`).

Toutes les nouvelles tables suivent les conventions du lot 1 : cle primaire `String @id @default(uuid()) @db.Uuid`, colonnes `camelCase` mappees en `snake_case`, montants en `Decimal(14,2)`, devise stockee `XOF`.

## 1. Migration `generalize_accounting_scope`

### 1.1 Ce qui casse si on ne fait rien

Verifie dans `packages/api/prisma/schema.prisma` (lignes 3416-3457) : `ChartOfAccount` et `AccountingJournal` n'ont **aucune colonne `tenantId`** aujourd'hui. Leur seule portee est `syndicateId String @db.Uuid` (obligatoire), et leur isolation tenant passe par une jointure implicite : `assertSyndicateTenantOwnership(tenantId, syndicateId)` (`lib/syndics/queries.ts:90-104`) verifie que `Syndicate.tenantId` correspond, a chaque appel. C'est fonctionnel pour la copropriete, mais insuffisant des qu'une ecriture n'a plus de copropriete a nommer : il n'existe alors aucune colonne sur laquelle filtrer.

L'unicite actuelle est `@@unique([syndicateId, accountNumber])` (`schema.prisma:3437`). Rendre `syndicateId` nullable pour permettre un compte "operationnel" cree cette situation : deux comptes operationnels du meme tenant, tous deux `syndicateId = NULL`, portant le meme `accountNumber`, ne violeraient **pas** cette contrainte, parce que PostgreSQL traite deux `NULL` comme distincts l'un de l'autre dans une contrainte d'unicite standard. Le PRD (§6.3) et le plan (§1.2, tableau "Ecarts") l'affirment tous deux ; c'est verifie ligne a ligne ci-dessus et confirme exact.

**Consequence** : la contrainte `@@unique([syndicateId, accountNumber])` doit disparaitre du schema Prisma et etre remplacee par deux index uniques **partiels**, un par perimetre :

```sql
CREATE UNIQUE INDEX "chart_of_accounts_syndicate_account_number_key"
  ON "chart_of_accounts" ("syndicate_id", "account_number")
  WHERE "syndicate_id" IS NOT NULL;

CREATE UNIQUE INDEX "chart_of_accounts_tenant_account_number_operations_key"
  ON "chart_of_accounts" ("tenant_id", "account_number")
  WHERE "syndicate_id" IS NULL;
```

Meme schema pour `accounting_journals` sur `(syndicate_id, code)` -- **verification requise avant redaction finale de la migration** : l'unicite actuelle de `AccountingJournal` n'est en realite **pas** declaree comme `@@unique` dans le schema (`schema.prisma:3441-3457` ne porte qu'un `@@index([syndicateId])` et un `@@index([syndicateId, fiscalYear])`, aucun `@@unique`). Le plan (§6.1, tache 2.1) parle de "suppression de l'unicite (syndicateId, accountNumber)" sans mentionner de contrainte equivalente sur les journaux : **ceci est une affirmation du plan non verifiee** qui, une fois verifiee ici, s'avere concerner uniquement `ChartOfAccount`. Aucune migration d'index partiel n'est donc necessaire sur `AccountingJournal` pour une question d'unicite ; seule l'addition de `tenantId` et `scope` s'y applique.

### 1.2 Le precedent deja dans le depot

Deux precedents existent deja dans ce depot pour exactement ce cas de figure, verifies par lecture directe :

- **Precedent d'index partiel** : `packages/api/prisma/migrations/20260211130000_add_campaign_open_tracking/migration.sql:25` cree `CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_campaign_recipients_open_token_key" ON "newsletter_campaign_recipients"("open_token") WHERE "open_token" IS NOT NULL;`. Le champ Prisma correspondant, `openToken String? @map("open_token")` (`schema.prisma:2541`), ne porte **aucun** attribut `@unique` ou `@@unique` : Prisma ne sait pas representer une contrainte d'unicite partielle (`WHERE`) dans son DSL de schema, meme avec les previews disponibles a la version utilisee ici (`generator client { provider = "prisma-client-js" }`, sans `previewFeatures`, verifie en tete de `schema.prisma`). **Consequence directe pour ce lot** : les deux index partiels de `ChartOfAccount` seront crees par SQL brut dans le fichier de migration, et le champ `syndicateId` du modele Prisma ne portera aucune annotation d'unicite ; un commentaire au-dessus du modele documentera l'invariant DB que Prisma ne peut pas exprimer, exactement comme le fait deja le commentaire de la migration 20260211130000 pour `open_token`.
- **Precedent de retro-remplissage `tenantId`** : `packages/api/prisma/migrations/20260907120000_tenant_scoping_and_money_precision/migration.sql` ajoute `tenant_id` a quatre tables enfants de `Property` (`property_media`, `property_documents`, `property_status_history`, `property_visits`), le retro-remplit par une jointure `UPDATE ... FROM`, puis cree les index et contraintes d'unicite tenant-portees. C'est le patron exact suivi ci-dessous. **Confirme applique** : cette migration porte en en-tete la mention `-- NOT YET APPLIED: this migration was generated offline (no database was reachable)`, mais `npx prisma migrate status` confirme que l'environnement verifie est a jour avec 32 migrations, celle-ci comprise -- l'en-tete est perime (redige au moment de la generation hors ligne du fichier, avant sa fusion et son application reelles), pas la migration. Voir `research.md` §4.4 pour le detail de cette verification.

### 1.3 Sequence exacte de la migration

Dans l'ordre, en un seul fichier `migration.sql`, sur le modele du controle prealable deja en usage dans ce depot (`CONTRIBUTING.md`, "Une migration qui touche a des donnees existantes commence par un controle qui l'arrete avec un message clair") :

1. **Controle prealable.** Verifie qu'aucun `ChartOfAccount.syndicateId` ni `AccountingJournal.syndicateId` ne pointe vers un `Syndicate` inexistant ou orphelin de `tenantId` (en pratique, `Syndicate.tenantId` est une colonne obligatoire depuis l'origine du modele -- verifie `schema.prisma:2789` -- donc ce controle doit trouver zero ligne aujourd'hui ; il reste ecrit explicitement, sur le meme principe defensif que la migration 20260907120000, pour arreter proprement plutot que d'echouer a mi-parcours si l'hypothese s'averait fausse au moment de l'execution reelle).
2. **Ajout des colonnes**, nullables dans un premier temps : `ALTER TABLE "chart_of_accounts" ADD COLUMN "tenant_id" TEXT;` et `ALTER TABLE "chart_of_accounts" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'SYNDICATE';` (idem pour `accounting_journals`, idem pour `tenant_id` sur `journal_entries` -- voir §1.4). `scope` recoit une valeur par defaut a la creation de la colonne pour que les lignes existantes, toutes de copropriete, n'aient rien a mettre a jour explicitement.
3. **Retro-remplissage** par jointure, sur le modele exact de la migration 20260907120000 :

   ```sql
   UPDATE "chart_of_accounts" c
   SET "tenant_id" = s."tenant_id"
   FROM "syndicates" s
   WHERE c."syndicate_id" = s."id";

   UPDATE "accounting_journals" j
   SET "tenant_id" = s."tenant_id"
   FROM "syndicates" s
   WHERE j."syndicate_id" = s."id";
   ```

4. **Controle post-remplissage.** Compte les lignes ou `tenant_id` reste `NULL` apres l'`UPDATE` ; si ce compte est non nul, la migration s'arrete avec un message explicite plutot que de continuer vers une contrainte `NOT NULL` qui echouerait de toute facon, mais avec un message Postgres brut.
5. **Colonnes obligatoires** : `ALTER TABLE "chart_of_accounts" ALTER COLUMN "tenant_id" SET NOT NULL;` (idem journaux). `syndicate_id` devient nullable : `ALTER TABLE "chart_of_accounts" ALTER COLUMN "syndicate_id" DROP NOT NULL;` (idem journaux).
6. **Suppression de l'ancienne contrainte** : `ALTER TABLE "chart_of_accounts" DROP CONSTRAINT IF EXISTS "chart_of_accounts_syndicate_id_account_number_key";` (le nom exact de la contrainte generee par Prisma est a verifier dans le SQL de la migration d'origine de `@@unique([syndicateId, accountNumber])`, `IF EXISTS` couvrant l'ecart si le nom differe).
7. **Creation des deux index partiels** decrits en §1.1.
8. **Index d'usage courant** : `CREATE INDEX "chart_of_accounts_tenant_id_idx" ON "chart_of_accounts"("tenant_id");` et equivalent sur `accounting_journals`, pour que les futures requetes operationnelles (sans `syndicateId`) filtrent sur un index et non sur un scan complet.
9. **Cle etrangere** : `ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;` (idem journaux).

**Rejeu.** Chaque etape est ecrite pour tolerer une seconde execution sans erreur : `ADD COLUMN` precede d'un controle d'existence (`information_schema.columns`, sur le modele du `DO $$ ... IF NOT EXISTS ...` deja utilise par la migration 20260211130000), `CREATE INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`. C'est le comportement demande par le mandat ("ce qui se passe si elle est rejouee") et verifie par le test d'integration `finance.migration-rehearsal.test.ts` (voir `tasks.md`), qui l'applique deux fois de suite sur une copie de la base de demonstration.

### 1.4 JournalEntry, JournalEntryLine, SourceType

- `JournalEntry` recoit `tenantId String` (retro-rempli depuis `journal.syndicateId -> syndicate.tenantId`, meme mecanisme, en joignant par `journal_id`), `documentType String?` et `documentId String?` (remplacent l'usage generique de `sourceType`/`sourceId` pour les pieces de ce lot, sans toucher aux valeurs deja ecrites par la copropriete), et `voidedByEntryId String? @db.Uuid` (auto-relation, pour retrouver l'ecriture inverse d'une annulation).
- `JournalEntryLine.debit` et `.credit` passent de `Decimal(12,2)` a `Decimal(14,2)` par un simple `ALTER COLUMN ... TYPE DECIMAL(14,2)` (elargissement, jamais destructif : verifie que Postgres autorise cet elargissement de precision sans perte pour des valeurs deja stockees, ce qui est le cas ici car 12,2 est un sous-ensemble strict de 14,2).
- `SourceType` (`schema.prisma:2723-2728`, valeurs actuelles `CHARGE_PAYMENT, MANUAL, PENALTY, FUND`) est etendu avec `SUPPLIER_INVOICE, SUPPLIER_PAYMENT, CASH_VOUCHER, VOID`. Verifie avant extension : cet enum n'est reference qu'a un seul endroit du schema, `JournalEntry.sourceType` (`schema.prisma:3465`, seule occurrence de `SourceType` trouvee dans tout `schema.prisma`) ; ajouter des valeurs a un enum Postgres est une operation non bloquante et sans risque de collision avec l'usage existant, ce que le lot 1 avait deja etabli pour `ThirdPartyKind` (`data-model.md` du lot 1, §"Enums").

```prisma
enum SourceType {
  CHARGE_PAYMENT
  MANUAL
  PENALTY
  FUND
  SUPPLIER_INVOICE
  SUPPLIER_PAYMENT
  CASH_VOUCHER
  VOID
}

enum AccountingScope {
  SYNDICATE
  OPERATIONS
}
```

Modeles modifies (extraits, les champs et relations existants ne sont pas repetes) :

```prisma
model ChartOfAccount {
  // ... champs existants inchanges ...
  syndicateId String? @db.Uuid @map("syndicate_id")   // devient optionnel
  tenantId    String  @map("tenant_id")               // nouveau, obligatoire
  scope       AccountingScope @default(SYNDICATE) @map("scope") // nouveau

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // @@unique([syndicateId, accountNumber]) retire : remplace par les deux
  // index uniques partiels crees en SQL brut (voir §1.1) ; Prisma ne peut pas
  // exprimer une contrainte WHERE dans son DSL (meme precedent que le champ
  // `openToken` de NewsletterCampaignRecipient).
  @@index([tenantId])
  @@index([tenantId, scope])
}

model AccountingJournal {
  // ... champs existants inchanges ...
  syndicateId String? @db.Uuid @map("syndicate_id")
  tenantId    String  @map("tenant_id")
  scope       AccountingScope @default(SYNDICATE) @map("scope")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([tenantId, scope, fiscalYear])
}

model JournalEntry {
  // ... champs existants inchanges ...
  tenantId        String   @map("tenant_id")
  documentType    String?  @map("document_type")
  documentId      String?  @map("document_id")
  voidedByEntryId String?  @db.Uuid @map("voided_by_entry_id")

  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  voidedByEntry JournalEntry? @relation("EntryVoid", fields: [voidedByEntryId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([documentType, documentId])
}
```

### 1.5 Ce que la generalisation ne change pas

- `assertSyndicateTenantOwnership` reste la garde d'isolation pour tout le chemin copropriete existant ; elle n'est pas modifiee, conformement a la decision D6 ("Toutes les fonctions `*BySyndicate` gardent leur signature"). Une nouvelle garde `assertOperationalAccountingTenantOwnership(tenantId, chartOfAccountId | journalId)` est ajoutee dans `lib/finance/accounting.ts` pour le chemin operationnel, qui filtre directement sur la nouvelle colonne `tenantId` sans jointure.
- `getTrialBalanceBySyndicate` (`queries.ts:2862`) n'est pas modifiee. Une nouvelle fonction `getTrialBalance(tenantId, scope, range)` est ajoutee dans `lib/finance/reports.ts`, qui agrege en `groupBy` SQL sur `tenantId` et `scope`, jamais en memoire (meme correction que le lot 1 avait appliquee a la balance clients).
- `lockJournalEntryBySyndicate` (`queries.ts:2836`) n'est pas modifiee et reste le chemin de verrouillage manuel de la copropriete. Le chemin operationnel ne l'utilise jamais : `postDocumentEntryTx` (§3) verrouille dans la meme transaction que la creation, ce qui est le changement de comportement voulu par le defaut n°2 ci-dessous.

## 2. Les cinq defauts du §6.1 bis : ce qui change et pourquoi

Chaque defaut a ete verifie dans le code (voir `research.md` pour les emplacements exacts) et dans les tests de caracterisation du lot 0 avant d'ecrire cette section. Pour chacun : le comportement actuel, le test qui le fige, la correction, et le test apres correction.

### Defaut 1 -- Une ecriture desequilibree peut etre enregistree

**Actuel** : `isJournalEntryBalanced` (`lib/syndics/finance-utils.ts`) additionne les valeurs brutes des lignes puis arrondit les deux totaux, alors que chaque ligne n'est arrondie qu'au moment de l'insertion (`roundMoney(Number(line.debit ?? 0))` dans `createJournalEntryBySyndicate`, `queries.ts:2807-2808`). Le test `syndics.accounting.characterization.test.ts:662` ("SURPRISE : l equilibre est verifie AVANT arrondi") le demontre avec deux lignes de 0,005 au debit et une de 0,01 au credit : le controle accepte (0,005+0,005=0,01), mais les lignes stockees valent 0,01+0,01=0,02 au debit contre 0,01 au credit.

**Correction, portee par `postDocumentEntryTx` uniquement** : chaque ligne est arrondie **avant** le controle d'equilibre, et le controle recompare les valeurs deja arrondies -- les memes que celles qui seront stockees. `isJournalEntryBalanced` de `lib/syndics/finance-utils.ts` n'est **pas modifiee** (elle continue de servir le chemin copropriete existant, inchangee, conformement a la decision D6) ; une nouvelle fonction `buildBalancedEntryLines` dans `lib/finance/accounting.ts` fait le controle correct pour tout ce qui passe par le nouveau chemin d'ecriture.

**Test** : `syndics.accounting.characterization.test.ts:662` reste **inchange** et vert -- il decrit le comportement du chemin copropriete existant, qui n'est pas touche. Un nouveau test `finance.accounting.post-document-entry.test.ts` verifie, sur le meme scenario (deux demi-centimes), que le nouveau chemin refuse l'ecriture (l'equilibre est verifie sur les valeurs arrondies, qui ne s'annulent pas plus qu'avant, mais le refus intervient desormais **avant** stockage, jamais apres). Sans objet aujourd'hui en XOF entier (le franc CFA n'a pas de subdivision, voir defaut 4) ; le scenario de test reste ecrit en centimes pour rester comparable au cas copropriete, et sera rejoue en unites entieres une fois la decision du defaut 4 prise.

### Defaut 2 -- `isLocked` n'est lu nulle part ailleurs que dans la fonction qui le pose

**Actuel** : confirme par le test `syndics.accounting.characterization.test.ts:767-808` ("IMMUTABILITE") : aucune route ne modifie ni ne supprime une ecriture, mais ce n'est pas parce que le code consulte `isLocked` et refuse -- c'est parce qu'aucune route de modification n'existe. Le test `:809` ("SURPRISE : une ecriture verrouillee n'empeche pas d'en creer une autre a la meme reference") le confirme : verrouiller une ecriture ne bloque meme pas la creation d'une seconde ecriture portant la meme reference dans le meme journal.

**Correction** : `postDocumentEntryTx` verrouille (`isLocked = true`) dans la **meme transaction** que la creation de l'ecriture, jamais par un appel separe. Toute tentative de reutiliser le chemin copropriete existant (`createJournalEntryBySyndicate`, `lockJournalEntryBySyndicate`) pour une piece operationnelle est explicitement rejetee au niveau du type (le chemin operationnel n'accepte pas de `syndicateId`). Le comportement copropriete existant (verrouillage manuel, sans lecture d'`isLocked` ailleurs) **n'est pas corrige** dans ce lot : le corriger reviendrait a changer le comportement de la copropriete deja demontree, hors du perimetre "generaliser sans dupliquer" que ce lot vise ; il est deliberement laisse identique et couvert par les memes tests inchanges.

**Test** : `syndics.accounting.characterization.test.ts:767-808` restent verts et inchanges, toujours vrais pour le chemin copropriete. Un nouveau test `finance.accounting.post-document-entry.test.ts` verifie que, sur le chemin operationnel, une deuxieme piece portant la meme reference ne peut pas creer une seconde ecriture sans passer par un `VoidDocument` explicite de la premiere -- c'est le changement de comportement voulu, distinct et non retro-applique a la copropriete.

### Defaut 3 -- Le releve replie ouverture et cloture sur le solde actuel quand la periode est vide

**Actuel** : `getOwnerAccountStatementByLot` (`queries.ts:2570-2608`) calcule `openingBalance` et `closingBalance` depuis `Number(account.balance)` (le solde **courant** du compte) des que `transactions.length === 0` sur la periode demandee, plutot que depuis le dernier mouvement anterieur a la borne de debut. Le test `syndics.owner-accounts.ledger.test.ts:459` ("SURPRISE : sur une periode sans mouvement, le releve affiche le solde ACTUEL, pas celui de la periode") le demontre.

**Correction** : deja appliquee, mais **uniquement pour le nouveau grand livre du lot 1** -- `lib/finance/reports.ts` (`getBalanceStrictlyBefore`, `getBalanceAtOrBefore`, lignes 342-371) calcule bien l'ouverture depuis le dernier mouvement anterieur a la borne, jamais depuis le solde courant. Ce lot **ne touche pas** a `getOwnerAccountStatementByLot` de la copropriete (meme raisonnement que le defaut 2 : corriger changerait un comportement deja demontre). En revanche, le releve **fournisseur** de ce lot (`getSupplierStatement`, nouveau dans `lib/finance/reports.ts`) reutilise directement `getBalanceStrictlyBefore`/`getBalanceAtOrBefore` du lot 1, generalisees pour accepter `kind: SUPPLIER` en plus de `TENANT` -- le defaut n'est donc jamais introduit dans le code neuf de ce lot, il ne l'a jamais ete depuis le lot 1.

**Test** : `syndics.owner-accounts.ledger.test.ts:459` reste inchange (chemin copropriete non touche). Aucun nouveau test "SURPRISE" n'est necessaire pour le releve fournisseur : le comportement correct est deja garanti par les tests du lot 1 sur `getBalanceStrictlyBefore`/`getBalanceAtOrBefore`, etendus a `kind: SUPPLIER` par un cas de test supplementaire dans `finance.reports.statement.test.ts` (fichier du lot 1, etendu ici).

### Defaut 4 -- `roundMoney` arrondit au centime, avec un comportement non deterministe a la demie

**Actuel** : `roundMoney` (`lib/finance/money.ts:13-15`, deplacee depuis `lib/syndics/finance-utils.ts` au lot 1 sans changement de comportement) fait `Number(value.toFixed(MONEY_PRECISION))` avec `MONEY_PRECISION = 2`. `toFixed` herite de la representation binaire flottante de JavaScript : le test `syndics.owner-accounts.ledger.test.ts:318` ("SURPRISE : roundMoney arrondit 100.005 a 100.00 (vers le bas)") le demontre -- la demie ne s'arrondit pas de facon previsible, parce que 100.005 n'est pas exactement representable en binaire.

**Decision a prendre explicitement, comme le demande le plan** : le XOF (franc CFA) n'a pas de subdivision inferieure au franc. Cette specification retient **une precision d'arrondi a l'unite pour toute nouvelle ecriture operationnelle** (`ROUND_HALF_UP` sur l'unite, implemente par une fonction deterministe qui n'utilise pas `toFixed` sur une valeur flottante -- par exemple via `decimal.js`, deja une dependance transitoire de Prisma pour `Prisma.Decimal`, ou par un calcul en centimes entiers avant division). `MONEY_PRECISION` reste a `2` pour la colonne `Decimal(14,2)` (le stockage ne change pas, conformement a D9 du plan, pour rester coherent avec le lot 1 et la copropriete), mais la fonction d'arrondi **applicative** utilisee par le nouveau chemin d'ecriture (`postDocumentEntryTx`) arrondit a l'unite avant de stocker, de sorte que la partie decimale stockee soit toujours `.00` pour toute piece de ce lot. `roundMoney` de `lib/finance/money.ts` **n'est pas modifiee** : elle continue de servir le lot 1 et la copropriete a l'identique (meme raisonnement de non-retro-application que les defauts 2 et 3). Une nouvelle fonction `roundMoneyXof` est ajoutee a `lib/finance/money.ts`, documentee comme reservee au chemin de ce lot.

**Test** : `syndics.owner-accounts.ledger.test.ts:318` reste inchange (chemin copropriete et lot 1, non touches). Un nouveau test `finance.accounting.post-document-entry.test.ts` verifie que `roundMoneyXof(100.5)` et `roundMoneyXof(100.4)` produisent des resultats deterministes et documentes (respectivement 101 et 100, arrondi a l'unite la plus proche, demie arrondie vers le haut), rejoue plusieurs fois pour ecarter tout doute sur la representation flottante.

### Defaut 5 -- Une violation d'unicite de numero de compte remonte brute en 400

**Actuel** : confirme par le test `syndics.accounting.characterization.test.ts:375` ("SURPRISE : la violation d'unicite (syndicateId, accountNumber) ressort en 400 Prisma brut") : le code Prisma `P2002` n'est pas intercepte specifiquement dans le controleur de creation de compte, et remonte tel quel via le gestionnaire d'erreur generique en 400 avec le message technique de Prisma.

**Correction** : `lib/finance/chart.ts` (creation de compte operationnel) et le point de creation de compte copropriete (`createChartOfAccountBySyndicate`) interceptent tous deux `P2002` et le traduisent via `conflict()` (deja disponible dans `lib/errors.ts:28`, utilisee ailleurs dans le depot -- aucune nouvelle infrastructure d'erreur necessaire) en une reponse HTTP **409** avec un message metier ("Ce numero de compte existe deja pour cette copropriete" ou "... pour ce plan operationnel", selon `scope`). C'est le seul des cinq defauts corrige **des deux cotes** (copropriete et operationnel), parce que la correction est peu couteuse, strictement additive (une interception d'erreur plus specifique n'enleve aucun comportement existant, elle ne fait que remplacer un 400 par un 409 plus juste), et **est le garde-fou exact de la migration elle-meme** : c'est justement l'ancienne contrainte `@@unique([syndicateId, accountNumber])` que la migration remplace par des index partiels, donc le chemin d'erreur qui la couvre doit etre correct avant que la contrainte ne change de forme.

**Test** : `syndics.accounting.characterization.test.ts:375` est **mis a jour** (c'est le seul des cinq cas ou le test copropriete lui-meme change) : son intitule devient `'corrigee (lot 2) : la violation d'unicite (syndicateId, accountNumber) renvoie 409 avec un message metier'`, il perd son prefixe `SURPRISE`, et son assertion passe de `expect(response.status).toBe(400)` a `expect(response.status).toBe(409)`. Un commentaire au-dessus du test renvoie explicitement a `specs/017-finance-fournisseurs-chantiers/data-model.md#defaut-5`, pour qu'une future lecture du fichier de caracterisation comprenne immediatement pourquoi ce cas, seul parmi les cinq, a change sa propre assertion plutot que d'en gagner une nouvelle a cote.

### Deux ecarts mineurs signales par le plan, traites au meme moment

- **Intervalle de dates invalide : 500 sur les ecritures, 400 sur la balance** (`syndics.accounting.characterization.test.ts:711`). Chemin copropriete non touche (meme raisonnement que les defauts 2 a 4) : le test reste inchange. Le nouveau chemin operationnel (`lib/finance/schemas.ts`, deja dote de `withRangeOrderValidation` depuis le lot 1) valide systematiquement l'ordre des bornes via Zod avant tout appel a Prisma, ce qui produit 400 partout par construction ; aucun 500 n'est possible sur le code neuf.
- **`onlyActive` ne reconnait que la chaine exacte `'false'`** (`listChartOfAccountsBySyndicate`, controleur ligne 2130 : `req.query.onlyActive !== 'false'`). Chemin copropriete non touche. Le nouveau schema Zod du plan de comptes operationnel (`lib/finance/schemas.ts`) declare `onlyActive` comme un booleen coerce (`z.coerce.boolean()`), qui refuse toute valeur autre que les representations booleennes canoniques plutot que de n'en reconnaitre qu'une seule par exclusion.

## 3. Entites nouvelles

### 3.1 VoidDocument

Piece d'annulation, generique a toute piece de ce lot (facture fournisseur, reglement fournisseur, piece de caisse). Principe P-6 du PRD : ce qui est valide ne bouge plus, on annule, on ne modifie jamais.

```prisma
enum VoidableDocumentType {
  SUPPLIER_INVOICE
  SUPPLIER_PAYMENT
  CASH_VOUCHER
}

model VoidDocument {
  id               String               @id @default(uuid()) @db.Uuid
  tenantId         String               @map("tenant_id")
  documentType     VoidableDocumentType @map("document_type")
  documentId       String               @map("document_id") @db.Uuid
  reason           String
  voidedByUserId   String               @map("voided_by_user_id")
  voidedAt         DateTime             @default(now()) @map("voided_at")
  reversingEntryId String?              @db.Uuid @map("reversing_entry_id")

  tenant         Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  voidedBy       User          @relation(fields: [voidedByUserId], references: [id])
  reversingEntry JournalEntry? @relation(fields: [reversingEntryId], references: [id], onDelete: SetNull)

  @@unique([documentType, documentId])
  @@index([tenantId])
  @@map("void_documents")
}
```

Une seule annulation par piece (`@@unique([documentType, documentId])`) : ce lot ne modelise pas l'annulation d'une annulation. `documentId` n'est pas une relation Prisma directe, par le meme raisonnement que `ThirdPartyMovement.sourceId` au lot 1 (pointe vers des tables de nature differente selon `documentType`).

### 3.2 Supplier

```prisma
enum SupplierKind {
  MATERIALS
  SERVICES
  MIXED
}

model Supplier {
  id                  String       @id @default(uuid()) @db.Uuid
  tenantId            String       @map("tenant_id")
  name                String
  kind                SupplierKind
  contactPhone        String?      @map("contact_phone")
  contactEmail        String?      @map("contact_email")
  maintenanceVendorId String?      @map("maintenance_vendor_id")
  thirdPartyAccountId String       @unique @map("third_party_account_id") @db.Uuid
  isActive            Boolean      @default(true) @map("is_active")
  createdAt           DateTime     @default(now()) @map("created_at")
  updatedAt           DateTime     @updatedAt @map("updated_at")

  tenant            Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  maintenanceVendor MaintenanceVendor? @relation(fields: [maintenanceVendorId], references: [id], onDelete: SetNull)
  thirdPartyAccount ThirdPartyAccount  @relation(fields: [thirdPartyAccountId], references: [id], onDelete: Cascade)
  invoices          SupplierInvoice[]

  @@index([tenantId])
  @@index([tenantId, isActive])
  @@index([maintenanceVendorId])
  @@map("suppliers")
}
```

**Verifie avant redaction** : `MaintenanceVendor` (`schema.prisma:2295-2318`) est confirme sans aucun champ de montant, avec un `tenant_id` obligatoire (nom de colonne deja en snake_case natif dans le modele Prisma existant, sans `@map` -- convention plus ancienne que celle des modeles recents ; le lien `maintenanceVendorId` de `Supplier` ne cree aucune contrainte sur ce point, il reference simplement `id`). Le lien est `onDelete: SetNull` : supprimer un prestataire de maintenance ne doit jamais emporter le fournisseur qui lui est lie, celui-ci portant potentiellement des factures validees immuables.

`thirdPartyAccountId` est une relation directe et obligatoire (contrairement a `ThirdPartyAccount.tenantClientId`, optionnel au lot 1) : un `Supplier` sans compte de tiers n'a pas de sens, alors qu'un `ThirdPartyAccount` de type `SUPPLIER` n'a pas besoin de porter la reference inverse en `unique` cote `ThirdPartyAccount` (un compte pourrait en theorie precede sa fiche fournisseur pendant une reprise ; ce lot ne traite pas ce cas, la creation du fournisseur cree systematiquement son compte dans la meme transaction).

### 3.3 SupplierInvoice / SupplierInvoiceLine

```prisma
enum SupplierInvoiceStatus {
  DRAFT
  VALIDATED
  VOIDED
}

model SupplierInvoice {
  id              String                @id @default(uuid()) @db.Uuid
  tenantId        String                @map("tenant_id")
  supplierId      String                @map("supplier_id") @db.Uuid
  siteId          String?               @map("site_id") @db.Uuid
  invoiceDate     DateTime              @map("invoice_date")
  reference       String
  amount          Decimal               @db.Decimal(14, 2)
  currency        String                @default("XOF")
  status          SupplierInvoiceStatus @default(DRAFT)
  journalEntryId  String?               @map("journal_entry_id") @db.Uuid
  createdByUserId String                @map("created_by_user_id")
  validatedByUserId String?             @map("validated_by_user_id")
  validatedAt     DateTime?             @map("validated_at")
  createdAt       DateTime              @default(now()) @map("created_at")
  updatedAt       DateTime              @updatedAt @map("updated_at")

  tenant       Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  supplier     Supplier             @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  site         ConstructionSite?    @relation(fields: [siteId], references: [id], onDelete: SetNull)
  journalEntry JournalEntry?        @relation(fields: [journalEntryId], references: [id], onDelete: SetNull)
  createdBy    User                 @relation("SupplierInvoiceCreatedBy", fields: [createdByUserId], references: [id])
  validatedBy  User?                @relation("SupplierInvoiceValidatedBy", fields: [validatedByUserId], references: [id])
  lines        SupplierInvoiceLine[]
  allocations  CostAllocation[]
  paymentAllocations SupplierPaymentAllocation[]

  @@unique([tenantId, supplierId, reference])
  @@index([tenantId, status])
  @@index([supplierId])
  @@index([siteId])
  @@map("supplier_invoices")
}

model SupplierInvoiceLine {
  id          String   @id @default(uuid()) @db.Uuid
  invoiceId   String   @map("invoice_id") @db.Uuid
  label       String
  amount      Decimal  @db.Decimal(14, 2)
  createdAt   DateTime @default(now()) @map("created_at")

  invoice SupplierInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
  @@map("supplier_invoice_lines")
}
```

**Regle metier portee par le schema, pas seulement par la validation applicative** : `siteId` est nullable dans le schema (un fournisseur `SERVICES` peut ne jamais avoir de chantier), mais `lib/finance/suppliers.ts` refuse la creation d'une facture sans `siteId` quand `Supplier.kind` vaut `MATERIALS` ou `MIXED` (FR-010 de `spec.md`). Ce n'est pas une contrainte SQL conditionnelle (Postgres le permettrait par une contrainte `CHECK` avec sous-requete, non supportee nativement) : c'est une regle de service, testee par `finance.supplier-invoices.test.ts`.

`@@unique([tenantId, supplierId, reference])` : deux factures d'un meme fournisseur ne peuvent pas porter la meme reference, meme cree deux fois par erreur de reseau -- meme mecanisme d'idempotence par contrainte que le lot 1 (une tentative en double leve `P2002`, traduit en 409 par la meme regle que le defaut 5).

### 3.4 SupplierPayment / SupplierPaymentAllocation

```prisma
model SupplierPayment {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id")
  supplierId      String   @map("supplier_id") @db.Uuid
  paymentDate     DateTime @map("payment_date")
  amount          Decimal  @db.Decimal(14, 2)
  currency        String   @default("XOF")
  method          String
  journalEntryId  String?  @map("journal_entry_id") @db.Uuid
  createdByUserId String   @map("created_by_user_id")
  validatedByUserId String? @map("validated_by_user_id")
  validatedAt     DateTime? @map("validated_at")
  createdAt       DateTime @default(now()) @map("created_at")

  tenant       Tenant                      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  supplier     Supplier                    @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  journalEntry JournalEntry?               @relation(fields: [journalEntryId], references: [id], onDelete: SetNull)
  createdBy    User                        @relation("SupplierPaymentCreatedBy", fields: [createdByUserId], references: [id])
  validatedBy  User?                       @relation("SupplierPaymentValidatedBy", fields: [validatedByUserId], references: [id])
  allocations  SupplierPaymentAllocation[]

  @@index([tenantId])
  @@index([supplierId])
  @@map("supplier_payments")
}

model SupplierPaymentAllocation {
  id        String   @id @default(uuid()) @db.Uuid
  paymentId String   @map("payment_id") @db.Uuid
  invoiceId String   @map("invoice_id") @db.Uuid
  amount    Decimal  @db.Decimal(14, 2)
  createdAt DateTime @default(now()) @map("created_at")

  payment SupplierPayment @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  invoice SupplierInvoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict)

  @@unique([paymentId, invoiceId])
  @@index([paymentId])
  @@index([invoiceId])
  @@map("supplier_payment_allocations")
}
```

Meme forme que `RentalPaymentAllocation` du module locatif (`schema.prisma:1874-1892`), transposee au sens inverse (ici, l'entreprise paie ; la-bas, elle est payee). `onDelete: Restrict` sur `SupplierPaymentAllocation.invoice` : une facture ne peut jamais disparaitre tant qu'un reglement lui est alloue (coherent avec l'immuabilite des pieces validees).

### 3.5 ConstructionSite

```prisma
enum ConstructionSiteStatus {
  PLANNED
  IN_PROGRESS
  SUSPENDED
  CLOSED
}

model ConstructionSite {
  id                      String                 @id @default(uuid()) @db.Uuid
  tenantId                String                 @map("tenant_id")
  name                    String
  zone                    String
  propertyId              String?                @map("property_id")
  landLeaseId             String?                @map("land_lease_id") @db.Uuid
  managerId               String?                @map("manager_id")
  status                  ConstructionSiteStatus @default(PLANNED)
  startDate               DateTime               @map("start_date")
  plannedEndDate          DateTime?              @map("planned_end_date")
  progressPercent         Int                    @default(0) @map("progress_percent")
  closedAt                DateTime?              @map("closed_at")
  finalCost               Decimal?               @map("final_cost") @db.Decimal(14, 2)
  budgetThresholdPercent  Int?                   @map("budget_threshold_percent")
  stockEnabledAt          DateTime?              @map("stock_enabled_at")
  createdAt               DateTime               @default(now()) @map("created_at")
  updatedAt               DateTime               @updatedAt @map("updated_at")

  tenant      Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  property    Property?         @relation(fields: [propertyId], references: [id], onDelete: SetNull)
  manager     User?             @relation("ConstructionSiteManager", fields: [managerId], references: [id], onDelete: SetNull)
  allocations CostAllocation[]
  invoices    SupplierInvoice[]
  cashVouchers CashVoucher[]
  workPrograms WorkProgram[]

  @@index([tenantId])
  @@index([tenantId, status])
  @@index([propertyId])
  @@map("construction_sites")
}
```

**`actualCost` n'est pas une colonne** (decision D5 du plan, reprise a l'identique) : il est calcule par `getSiteActualCost(tenantId, siteId)` dans `lib/finance/sites.ts`, somme des `CostAllocation` dont la piece source est validee, jamais stocke ni exposee en champ modifiable. `finalCost`, en revanche, **est** une colonne : c'est la valeur figee a la cloture du chantier (lot 4), volontairement presente des ce lot dans le schema pour eviter une migration supplementaire au lot 4, mais non renseignee ni exploitee par ce lot (`closedAt` et `finalCost` restent `NULL` pour tout chantier cree ou modifie par ce lot). `landLeaseId` n'a pas de relation Prisma vers une table `LandLease` -- cette table n'existe pas avant le lot 4 -- il est stocke en `String? @db.Uuid` simple, sans contrainte de cle etrangere, sur le meme principe qu'un champ "reserve pour un lot futur" documente explicitement en commentaire.

`landLeaseId` merite d'etre signale comme un choix reversible : s'il s'avere, au lot 4, que le bail de terrain doit porter plusieurs chantiers avec une cle differente, ce champ sera retire sans avoir jamais ete exploite -- son cout de reversibilite est nul puisqu'aucune donnee n'y est ecrite avant le lot 4.

### 3.6 CostCategory

```prisma
model CostCategory {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @map("tenant_id")
  label     String
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")

  tenant      Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  allocations CostAllocation[]

  @@unique([tenantId, label])
  @@index([tenantId])
  @@map("cost_categories")
}
```

Jeu par defaut (gros oeuvre, toiture, plomberie, electricite, main-d'oeuvre, materiaux, divers) cree par `finance-cost-categories-seed.ts`, appele a la creation du premier chantier d'un tenant (pas au seed global de la base, pour ne pas peupler un tenant qui n'utilisera jamais les chantiers) -- voir `tasks.md`.

### 3.7 CostAllocation

```prisma
enum CostAllocationSourceType {
  SUPPLIER_INVOICE
  CASH_VOUCHER
}

model CostAllocation {
  id             String                   @id @default(uuid()) @db.Uuid
  tenantId       String                   @map("tenant_id")
  siteId         String                   @map("site_id") @db.Uuid
  costCategoryId String                   @map("cost_category_id") @db.Uuid
  sourceType     CostAllocationSourceType @map("source_type")
  sourceId       String                   @map("source_id") @db.Uuid
  amount         Decimal                  @db.Decimal(14, 2)
  validatedAt    DateTime?                @map("validated_at")
  voidedAt       DateTime?                @map("voided_at")
  createdAt      DateTime                 @default(now()) @map("created_at")

  tenant       Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  site         ConstructionSite @relation(fields: [siteId], references: [id], onDelete: Restrict)
  costCategory CostCategory     @relation(fields: [costCategoryId], references: [id], onDelete: Restrict)

  @@index([tenantId])
  @@index([siteId, validatedAt])
  @@index([sourceType, sourceId])
  @@map("cost_allocations")
}
```

**Invariant central du lot** (FR-020, verifie par `finance.cost-allocation.invariant.test.ts`) : pour une meme `(sourceType, sourceId)`, `SUM(amount)` doit toujours egaler le montant de la piece source. Ce n'est pas une contrainte SQL (la somme porte sur plusieurs lignes, une contrainte `CHECK` par ligne ne peut pas l'exprimer) : c'est un controle applicatif execute juste avant la validation de la piece, dans la meme transaction. `siteId` et `costCategoryId` sont `onDelete: Restrict` : une imputation validee ne peut jamais perdre son chantier ou son poste, ce qui garantirait un cout reel faux sans que rien ne le signale.

`voidedAt` distingue une imputation annulee (par la piece d'annulation de sa source) d'une imputation jamais validee : `getSiteActualCost` ne somme que les lignes ou `validatedAt IS NOT NULL AND voidedAt IS NULL`.

### 3.8 CashVoucher

```prisma
model CashVoucher {
  id              String    @id @default(uuid()) @db.Uuid
  tenantId        String    @map("tenant_id")
  voucherNumber   Int       @map("voucher_number")
  voucherYear     Int       @map("voucher_year")
  siteId          String    @map("site_id") @db.Uuid
  costCategoryId  String    @map("cost_category_id") @db.Uuid
  beneficiaryName String    @map("beneficiary_name")
  amount          Decimal   @db.Decimal(14, 2)
  currency        String    @default("XOF")
  reason          String
  voucherDate     DateTime  @map("voucher_date")
  journalEntryId  String?   @map("journal_entry_id") @db.Uuid
  createdByUserId String    @map("created_by_user_id")
  validatedByUserId String? @map("validated_by_user_id")
  validatedAt     DateTime? @map("validated_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  tenant       Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  site         ConstructionSite @relation(fields: [siteId], references: [id], onDelete: Restrict)
  costCategory CostCategory     @relation(fields: [costCategoryId], references: [id], onDelete: Restrict)
  journalEntry JournalEntry?    @relation(fields: [journalEntryId], references: [id], onDelete: SetNull)
  createdBy    User             @relation("CashVoucherCreatedBy", fields: [createdByUserId], references: [id])
  validatedBy  User?            @relation("CashVoucherValidatedBy", fields: [validatedByUserId], references: [id])

  @@unique([tenantId, voucherYear, voucherNumber])
  @@index([tenantId])
  @@index([siteId])
  @@map("cash_vouchers")
}
```

**Numerotation sequentielle sous concurrence** (FR-022) : `voucherNumber` n'est **pas** `@default(autoincrement())` -- un auto-increment Postgres est global a la table, alors que la sequence exigee ici est **par tenant et par annee**. La numerotation passe par une fonction `nextCashVoucherNumber(tx, tenantId, voucherYear)` qui verrouille une ligne de compteur (`SELECT ... FOR UPDATE` sur une table `finance_sequence_counters(tenant_id, sequence_name, year, last_value)`, nouvelle table de support minimale, non listee separement ci-dessus car elle ne porte aucune donnee metier) avant d'incrementer, dans la transaction de validation de la piece de caisse -- jamais a la lecture, jamais hors transaction. C'est le meme risque que celui deja identifie par le plan (§11, "Sequence de bons de caisse en double sous concurrence") et le meme remede que celui qu'il propose.

**Sur la decision de caisse unique** (actee le 18 septembre 2026, voir `spec.md` et `research.md` §4.1) : ce modele ne porte volontairement aucun champ `cashRegisterId`. Ce choix laisse un risque residuel, chiffre plutot que laisse dans le flou : si l'organisation de la cliente evoluait vers plusieurs caisses, la migration a prevoir serait d'ajouter `CashRegister` (id, tenantId, label) et `cashRegisterId` sur `CashVoucher`, de retro-remplir avec une caisse unique par defaut pour les pieces deja emises, puis de rendre le champ obligatoire -- une migration de meme forme que celle du §1, mais sans son risque d'unicite (aucune contrainte n'existerait encore sur une colonne qui n'existe pas encore).

## 4. WorkProgram (existant, etendu)

```prisma
model WorkProgram {
  // ... champs existants inchanges (voir schema.prisma:3771-3793) ...
  constructionSiteId String? @map("construction_site_id") @db.Uuid

  site ConstructionSite? @relation(fields: [constructionSiteId], references: [id], onDelete: SetNull)

  @@index([constructionSiteId])
}
```

**Verifie avant redaction** : `packages/api/src/lib/patrimoine/schemas.ts:72-81`, `updateWorkProgramSchema` accepte aujourd'hui `actualCost: z.number().nonnegative().optional()` en entree, et `packages/api/src/lib/patrimoine/queries.ts:429,449` l'ecrit tel quel dans `Prisma.Decimal`. C'est le point de couture exact a modifier : la validation Zod devient conditionnelle (`actualCost` retire du schema d'entree accepte quand `constructionSiteId` est deja renseigne sur le programme concerne -- verifie en base avant validation, pas seulement au niveau du schema statique, puisque Zod seul ne peut pas connaitre l'etat existant d'un enregistrement). `syncWorkProgramCostTx(tx, constructionSiteId)` (nouveau, dans `lib/finance/cost-allocation.ts`) est appelee a la fin de toute transaction qui valide ou annule une `CostAllocation`, et met a jour `WorkProgram.actualCost` pour chaque programme dont `constructionSiteId` correspond -- l'ecriture reste dans `lib/finance/`, jamais dans `lib/patrimoine/`, conformement a la regle de couture de `plan.md` ("le module Patrimoine ne connait pas les details d'imputation").

## 5. Relations inversees a ajouter (modeles existants)

```prisma
// Tenant
suppliers          Supplier[]
supplierInvoices   SupplierInvoice[]
supplierPayments   SupplierPayment[]
constructionSites  ConstructionSite[]
costCategories     CostCategory[]
costAllocations    CostAllocation[]
cashVouchers       CashVoucher[]
voidDocuments      VoidDocument[]
chartOfAccounts    ChartOfAccount[]    // nouveau : ChartOfAccount n'avait aucune relation Tenant avant ce lot
accountingJournals AccountingJournal[] // idem
journalEntries     JournalEntry[]      // idem

// MaintenanceVendor
suppliers Supplier[]

// Property
constructionSites ConstructionSite[]

// User (quatre paires createdBy/validatedBy, plus le manager de chantier et l'annulateur)
supplierInvoicesCreated  SupplierInvoice[] @relation("SupplierInvoiceCreatedBy")
supplierInvoicesValidated SupplierInvoice[] @relation("SupplierInvoiceValidatedBy")
supplierPaymentsCreated  SupplierPayment[] @relation("SupplierPaymentCreatedBy")
supplierPaymentsValidated SupplierPayment[] @relation("SupplierPaymentValidatedBy")
cashVouchersCreated      CashVoucher[]     @relation("CashVoucherCreatedBy")
cashVouchersValidated    CashVoucher[]     @relation("CashVoucherValidatedBy")
managedConstructionSites ConstructionSite[] @relation("ConstructionSiteManager")
voidedDocuments          VoidDocument[]
```

## 6. Invariants transverses

- Toute piece de ce lot (`SupplierInvoice`, `SupplierPayment`, `CashVoucher`) nait `DRAFT`/sans `validatedAt`, ne produit aucune ecriture ni aucune imputation avant sa validation, et devient immuable des que `validatedAt` est renseigne (US11 de `spec.md`).
- `Σ CostAllocation.amount` pour une meme piece source = montant de cette piece, verifie avant toute validation, jamais apres (meme discipline que le defaut 1 : le controle porte sur les valeurs qui seront effectivement stockees).
- `ConstructionSite.actualCost` (calcule, jamais stocke) = `Σ CostAllocation.amount` de ce chantier ou `validatedAt IS NOT NULL AND voidedAt IS NULL`.
- Toute ecriture de ce lot passe par `postDocumentEntryTx` ; aucune fonction de ce lot n'accepte un client Prisma hors transaction (meme garde-fou que le lot 1, verifie par un test qui force un echec apres l'ecriture du mouvement et attend l'absence de toute trace).
- Aucun champ `debit`/`credit` n'est expose par l'API de lecture de ce lot ; le contrat (`contracts/openapi.yaml`) traduit en "montant facture" / "montant regle" / "solde" / "imputation", meme convention que le lot 1.
- Montants : `Decimal(14,2)` sur toutes les tables nouvelles ; arrondi applicatif a l'unite pour le XOF sur le chemin d'ecriture de ce lot (defaut 4) ; jamais de `number`/`float` en base.
