# Research: Gestion financiere operationnelle - Fournisseurs et chantiers (lot 2)

**Feature**: 017-finance-fournisseurs-chantiers
**Date**: 2026-09-18
**Status**: Complete pour le lot 2 (reprend et revrifie le §6 du plan de mise en oeuvre, le §6.1 bis, et les affirmations du PRD sur E3/E4)

Ce document reprend le §6 "Lot 2 -- Moteur generalise, fournisseurs, chantier" du plan de mise en oeuvre, verifie chaque affirmation dans le depot le 18 septembre 2026, et signale les ecarts trouves. Il complete `docs/finance/LOT-1-RAPPORT.md`, dont la section 6 ("Ce qui reste ouvert") annoncait deja plusieurs des points traites ici.

## 1. Verifications directes sur le schema

### 1.1 `ChartOfAccount` et `AccountingJournal` n'ont pas de `tenantId`

**Confirme.** `schema.prisma:3416-3439` (`ChartOfAccount`) et `schema.prisma:3441-3457` (`AccountingJournal`) ne portent qu'un champ `syndicateId String @db.Uuid` obligatoire, sans aucune colonne `tenantId`. L'isolation tenant passe par la jointure `assertSyndicateTenantOwnership(tenantId, syndicateId)` (`lib/syndics/queries.ts:90-104`), appelee explicitement au debut de chaque fonction `*BySyndicate`. Le plan (§1.2, tableau "Ecarts") l'affirmait deja ; confirme a l'identique.

### 1.2 L'unicite `(syndicateId, accountNumber)` existe -- mais uniquement sur `ChartOfAccount`

**Confirme, avec une precision que le plan ne faisait pas.** `@@unique([syndicateId, accountNumber])` est bien present sur `ChartOfAccount` (`schema.prisma:3437`). En revanche, `AccountingJournal` (`schema.prisma:3441-3457`) ne porte **aucune** contrainte `@@unique` du tout -- seulement deux `@@index`. Le plan (§6.1, tache 2.1) decrit la migration comme remplacant "l'unicite (syndicateId, accountNumber)" par des index partiels, formulation qui, lue vite, pourrait laisser croire que le meme mecanisme s'applique aux deux tables. Ce n'est pas le cas : **seul `ChartOfAccount` a besoin de deux index partiels pour une question d'unicite** ; `AccountingJournal` n'a besoin que de l'ajout de `tenantId` et `scope`, sans reconstruction d'aucune contrainte d'unicite. Voir `data-model.md` §1.1 pour le detail.

### 1.3 PostgreSQL traite deux `NULL` comme distincts dans une contrainte d'unicite

**Confirme, comportement standard de PostgreSQL** (et de la norme SQL), non specifique a ce depot : une contrainte `UNIQUE` standard n'empeche jamais deux lignes de porter simultanement `NULL` sur une des colonnes contraintes, quelle que soit la valeur des autres colonnes. C'est la raison technique exacte pour laquelle rendre `ChartOfAccount.syndicateId` nullable sans rien changer d'autre romprait le controle d'unicite pour les comptes operationnels (deux comptes operationnels, tous deux `syndicateId = NULL`, portant le meme `accountNumber`, ne se heurteraient a rien). La solution retenue (deux index uniques partiels, un par valeur de `scope`) est documentee en detail dans `data-model.md` §1.1, avec un precedent deja present dans le depot (§1.4 ci-dessous).

### 1.4 Un precedent d'index partiel existe deja dans le depot

**Trouvaille non anticipee par le plan.** `packages/api/prisma/migrations/20260211130000_add_campaign_open_tracking/migration.sql:25` cree deja un index unique partiel (`CREATE UNIQUE INDEX ... WHERE "open_token" IS NOT NULL`) sur `newsletter_campaign_recipients.open_token`. Le champ Prisma correspondant (`schema.prisma:2541`, `openToken String? @map("open_token")`) ne porte aucune annotation `@unique` : Prisma ne sait pas exprimer une contrainte `WHERE` dans son DSL de schema, meme avec les previews disponibles ici (`generator client { provider = "prisma-client-js" }` ne declare aucun `previewFeatures`, verifie en tete de fichier). **Consequence pour ce lot** : la migration `generalize_accounting_scope` suit exactement ce patron -- SQL brut pour les deux index partiels, schema Prisma sans `@@unique` correspondant, invariant documente par un commentaire au-dessus du modele. Ce precedent confirme que la methode n'est pas une invention de cette specification mais une pratique deja etablie du depot, ce qui reduit le risque percu de la migration.

### 1.5 Un second precedent existe pour le retro-remplissage de `tenantId`

**Trouvaille non anticipee par le plan, verifiee et confirmee appliquee.** `packages/api/prisma/migrations/20260907120000_tenant_scoping_and_money_precision/migration.sql` ajoute `tenant_id` a quatre tables enfants de `Property`, le retro-remplit par une jointure `UPDATE ... FROM`, puis pose les contraintes. C'est le patron suivi par `data-model.md` §1.3. **Correction apportee a cette specification** : l'en-tete de ce fichier de migration porte la mention `-- NOT YET APPLIED: this migration was generated offline (no database was reachable)`, ce qui avait fait signaler ici une reserve sur son execution reelle. `npx prisma migrate status` confirme que l'environnement verifie est a jour avec 32 migrations, **celle-ci comprise** : l'en-tete est perime (il decrivait l'etat du depot au moment de sa redaction hors ligne, avant sa fusion et son application reelles), la migration elle-meme ne l'est pas. Voir §4.4 pour le detail de cette correction et son absence de consequence sur ce lot.

### 1.6 `SourceType` n'est reference qu'une seule fois dans tout le schema

**Confirme.** Une recherche exhaustive de `SourceType` dans `schema.prisma` ne trouve que deux occurrences : la declaration de l'enum (`schema.prisma:2723-2728`) et son unique usage, `JournalEntry.sourceType` (`schema.prisma:3465`). Etendre cet enum avec quatre valeurs nouvelles (`SUPPLIER_INVOICE`, `SUPPLIER_PAYMENT`, `CASH_VOUCHER`, `VOID`) ne risque donc de perturber aucun autre point du schema. Ce constat renforce, sans le remettre en cause, ce que le lot 1 avait deja etabli pour `ThirdPartyKind` : ajouter des valeurs a un enum Postgres existant est une operation sans risque de collision.

### 1.7 `JournalEntryLine.debit`/`.credit` sont bien en `Decimal(12,2)`, `ThirdPartyMovement` et consorts en `Decimal(14,2)`

**Confirme**, deja etabli par le plan (§1.2) et re-confirme par lecture directe : `schema.prisma:3484-3485` (`JournalEntryLine`). Elargir `Decimal(12,2)` vers `Decimal(14,2)` par `ALTER COLUMN ... TYPE` est un elargissement de precision, jamais destructif pour les valeurs deja stockees (12,2 est un sous-ensemble strict de 14,2).

## 2. Verifications directes sur le code (services, controleurs, tests)

### 2.1 `isJournalEntryBalanced` verifie l'equilibre avant l'arrondi de chaque ligne

**Confirme, avec le code exact.** `lib/syndics/finance-utils.ts` :

```ts
export function isJournalEntryBalanced(lines: Array<{ debit?: number | null; credit?: number | null }>): boolean {
  const totals = lines.reduce(...)  // somme les valeurs BRUTES
  return roundMoney(totals.debit) === roundMoney(totals.credit);  // arrondit seulement le TOTAL
}
```

alors que `createJournalEntryBySyndicate` (`queries.ts:2807-2808`) arrondit chaque **ligne** individuellement au moment de l'insertion : `roundMoney(Number(line.debit ?? 0))`. Le controle et le stockage n'operent donc pas sur les memes valeurs. Confirme mot pour mot par le test `syndics.accounting.characterization.test.ts:662-685`, avec le scenario exact (0,005 + 0,005 au debit contre 0,01 au credit) et le resultat stocke divergent (0,02 contre 0,01).

### 2.2 `isLocked` n'est lu que par la fonction qui le pose

**Confirme.** Recherche de toute lecture de `isLocked` en dehors de `lockJournalEntryBySyndicate` (`queries.ts:2836-2860`) : aucune trouvee dans `lib/syndics/queries.ts`. Le test `syndics.accounting.characterization.test.ts:794-808` le demontre en deux temps : la surface publique du module ne contient que `list`, `create` et `lock` pour les ecritures (aucune route de modification/suppression n'existe, donc rien n'a besoin de lire le drapeau pour se proteger), et une ecriture verrouillee n'empeche meme pas la creation d'une seconde ecriture a la meme reference dans le meme journal -- preuve que le verrouillage ne conditionne aucune autre operation du module.

### 2.3 `getOwnerAccountStatementByLot` replie sur le solde courant en l'absence de mouvement dans la periode

**Confirme, code exact.** `queries.ts:2586-2593` :

```ts
const openingBalance =
  transactions.length > 0
    ? roundMoney(
        Number(transactions[0].balanceAfter) -
          Number(transactions[0].debit ?? 0) +
          Number(transactions[0].credit ?? 0),
      )
    : roundMoney(Number(account.balance)); // <- solde COURANT, pas celui de la periode
```

Confirme par le test `syndics.owner-accounts.ledger.test.ts:459-474`. **Verifie egalement, et c'est un point que le plan ne detaillait pas** : le nouveau grand livre du lot 1 ne reproduit **pas** ce defaut. `lib/finance/reports.ts:342-371` (`getBalanceStrictlyBefore`, `getBalanceAtOrBefore`) calcule bien l'ouverture depuis le dernier mouvement anterieur a la borne demandee, jamais depuis le solde courant du compte. Consequence directe pour ce lot : le releve fournisseur (US6 de `spec.md`) peut reutiliser directement ces deux fonctions, generalisees a `kind: SUPPLIER`, sans jamais introduire le defaut -- il n'a jamais existe dans le code du lot 1.

### 2.4 `roundMoney` utilise `toFixed`, dont le comportement a la demie depend de la representation flottante

**Confirme, code exact.** `lib/finance/money.ts:13-15` : `Number(value.toFixed(MONEY_PRECISION))`. Confirme par le test `syndics.owner-accounts.ledger.test.ts:318-326`, qui demontre que `roundMoney(100.005)` vaut `100.00` (arrondi vers le bas) plutot que `100.01`, parce que `100.005` n'a pas de representation binaire exacte. Ce comportement est une propriete du JavaScript standard (`Number.prototype.toFixed`), pas un bug local a ce depot ; ce qui est local, c'est le choix de continuer a l'utiliser pour des montants dont la subdivision (le centime) n'a pas de sens pour le XOF.

### 2.5 `onlyActive` ne reconnait que la chaine exacte `'false'`

**Confirme, code exact.** `packages/api/src/controllers/syndic-controller.ts:2130` : `const onlyActive = req.query.onlyActive !== 'false';`. Toute autre valeur (`'0'`, `'FALSE'`, `'no'`, une chaine vide) est traitee comme "actif seulement". Confirme par le test `syndics.accounting.characterization.test.ts:437-446`.

### 2.6 Un intervalle de dates invalide renvoie 500 sur les ecritures, 400 sur la balance

**Confirme.** Test `syndics.accounting.characterization.test.ts:711-722`, deux appels identiques sur `/ecritures` (500) et `/balance` (400) avec les memes bornes inversees. Cause : les deux controleurs ne valident pas les bornes de la meme facon avant d'appeler `queries.ts` ; un seul des deux passe par un schema Zod qui rejette explicitement l'ordre invalide.

## 3. Trouvailles non demandees par le mandat, mais pertinentes pour le lot 2

### 3.1 Les six permissions du droit financier sont deja creees et scaffold, sans route qui les utilise

**Trouvaille significative, non anticipee par le plan.** `packages/api/src/middleware/finance-rbac-middleware.ts` (livre par le lot 1) expose deja les six gardes de la decision D7 : `requireAccountsRead`, `requireReportsRead`, `requireDocumentsCreate`, **`requireDocumentsValidate`**, **`requireSitesManage`**, **`requireSettingsManage`**. Les trois derniers ne sont utilises par **aucune route** aujourd'hui (`finance-routes.ts` du lot 1 n'en monte que trois : `requireReportsRead`, `requireAccountsRead`, `requireDocumentsCreate`). Le seed correspondant (`prisma/seeds/finance-permissions-seed.ts`) attribue deja les six permissions aux roles existants, avec une repartition documentee en commentaire : `TENANT_ACCOUNTANT` saisit sans valider, `TENANT_ADMIN` recoit les six droits (donc peut deja valider), `TENANT_MANAGER` lit sans saisir ni valider, `TENANT_AGENT` ne recoit rien.

**Consequence pour ce lot** : la tache "creer les droits de validation" annoncee par le plan (§6.2, "Toute piece porte createdByUserId et validatedByUserId... permission finance.documents.validate") **n'est pas a faire** -- elle est deja faite. Le lot 2 se contente de **monter des routes** derriere `requireDocumentsValidate` et `requireSitesManage`, sans toucher au middleware ni au seed. C'est une simplification reelle du travail restant, a signaler explicitement pour qu'aucun agent d'implementation ne recree ces gardes par erreur.

### 3.2 `WorkProgram.actualCost` est deja saisissable par l'API Patrimoine, precisement localise

**Confirme, avec les lignes exactes.** `packages/api/src/lib/patrimoine/schemas.ts:72-81` (`updateWorkProgramSchema`) accepte `actualCost: z.number().nonnegative().optional()`. `packages/api/src/lib/patrimoine/queries.ts:429` et `:449` le recoivent et l'ecrivent (`typeof data.actualCost === 'number' ? new Prisma.Decimal(data.actualCost) : undefined`). Le PRD (§2.2) dit que "son cout reel est un champ que rien n'alimente" -- ce qui est vrai au sens ou rien ne le **calcule automatiquement**, mais il **est** bel et bien saisissable manuellement des aujourd'hui, ce qui est une nuance que le PRD ne fait pas et que cette specification corrige : FR-024 de `spec.md` retire ce champ de la saisie **seulement** pour un programme deja rattache a un chantier, pas pour tous les programmes.

### 3.3 `MaintenanceVendor` utilise une convention de nommage de colonnes plus ancienne

**Trouvaille secondaire, sans consequence sur la conception.** `schema.prisma:2295-2318` : les colonnes de `MaintenanceVendor` sont nommees directement en snake_case dans le modele Prisma (`tenant_id`, `is_active`, `created_at`), sans passer par l'attribut `@map` que tous les modeles plus recents utilisent avec des noms de champ Prisma en camelCase. Le lien `Supplier.maintenanceVendorId -> MaintenanceVendor.id` fonctionne a l'identique quelle que soit cette convention (la cle primaire `id` est neutre), donc ce n'est pas un obstacle -- seulement un signe que `MaintenanceVendor` est un modele plus ancien que ceux introduits par les specs 013-016, coherent avec la decision de ne pas le fusionner avec `Supplier`.

## 4. Questions du PRD tranchees le 18 septembre 2026, et ce qui reste effectivement ouvert

### 4.1 La caisse (question 7 du PRD) -- decision actee, hypothese confirmee mot pour mot

Le PRD (§14, question 7) et le plan (§12, note finale) laissaient tous deux cette question sans reponse. La premiere version de cette specification (`spec.md`, alors section "Hypothese a reviser en priorite") posait l'hypothese explicite d'une caisse unique par tenant, validee par le porteur du droit `finance.documents.validate`. **Le porteur du projet a tranche cette question le 18 septembre 2026, confirmant l'hypothese mot pour mot** : une seule caisse par tenant, la gestionnaire emet la piece, le dirigeant valide, et le validateur reste celui qui porte `finance.documents.validate` -- sans caisse ni role de "caissier" distinct. `spec.md` (section "Decision actee : la caisse") reprend desormais cette reponse comme une decision, pas une hypothese.

Cette specification continue de ne creer **aucune** table `CashRegister`. Ce qui etait presente comme le cout de reversibilite d'une hypothese devient un **risque residuel documente** : `data-model.md` §3.8 chiffre precisement ce que couterait un changement d'organisation futur vers plusieurs caisses (une migration additive supplementaire, sans risque d'unicite puisqu'aucune donnee n'existerait encore sur le champ ajoute) -- utile a connaitre, mais ne decrivant plus une incertitude ouverte sur le lot en cours.

### 4.2 Les questions 3, 4, 5, 6 du PRD -- toutes tranchees le 18 septembre 2026

Le plan (§12) les citait comme "a trancher avec la cliente avant le lot 2" ; c'est desormais fait, par reponse du porteur du projet. Aucune ne change le perimetre de ce lot (elles conditionnent les lots 3 a 5, hors perimetre de cette specification), mais toutes ferment une incertitude que la premiere version de ce document signalait comme non levee :

- **Question 3, suivi des materiaux** : un suivi existe deja, tenu a la main (cahier ou fichier). Consequence pour le lot 5 (PRD §11, plan §9) : il **cesse d'etre conditionnel**. La condition d'entree du PRD ("besoin confirme par la cliente") est remplie ; le lot remplace une pratique existante plutot que d'en inventer une, ce qui reduit sensiblement son risque d'adoption par rapport a un stock cree sans pratique prealable a raccrocher.
- **Question 4, budget de chantier** : un budget est etabli avant demarrage et compare au realise. Consequence pour le lot 3 (PRD epopee E5, plan §7) : **pleinement justifie**, sans reserve sur l'usage reel que la cliente ferait d'un budget de chantier.
- **Question 5, statut des ouvriers** : les deux, selon le chantier -- salaries et tacherons coexistent. Consequence pour le lot 4 (PRD epopee E8, plan §8) : il devra livrer **les deux modeles** (`SalaryNote` d'une part, `Contractor`/`ContractorContract`/`ProgressStatement` de l'autre), et non un choix exclusif entre les deux.
- **Question 6, etats aux associes** : aucun etat de quote-part n'est formalise aujourd'hui chez la cliente. Consequence pour le lot 4 (PRD epopee E7, recit "etat de quote-part" priorite C) : la ventilation des loyers et **un ecran de consultation** de la quote-part suffisent a repondre au besoin reel ; rien n'impose la construction d'un envoi periodique, que le PRD ne classait deja qu'en priorite "pourrait" (C).

Ces quatre reponses sont refletees dans `spec.md`, section "Suites prevues".

### 4.3 Le decompte exact des 54 cas de caracterisation n'a pas ete recompte un a un

Confirme : les deux fichiers existent (`syndics.accounting.characterization.test.ts`, 889 lignes ; `syndics.owner-accounts.ledger.test.ts`, 486 lignes) et les cas cites nommement dans ce document et dans `data-model.md` ont ete verifies un a un par lecture directe. Le chiffre total de "54 cas" provient de `LOT-1-RAPPORT.md` (§3) et n'a pas ete recompte exhaustivement (`describe`/`it` un par un sur l'integralite des deux fichiers) pour cette specification ; seuls les cas pertinents pour les cinq defauts et les deux ecarts mineurs l'ont ete. **Ce point reste effectivement ouvert**, a la difference des quatre questions ci-dessus.

### 4.4 La migration `20260907120000_tenant_scoping_and_money_precision` -- confirmee appliquee, en-tete perime

**Corrige par rapport a la premiere version de ce document**, qui signalait ici une reserve non levee. `npx prisma migrate status` confirme que l'environnement verifie est a jour avec 32 migrations, `20260907120000_tenant_scoping_and_money_precision` comprise. La mention `-- NOT YET APPLIED: this migration was generated offline (no database was reachable)` en tete de ce fichier de migration (voir §1.5) est donc **perimee, pas la migration elle-meme** : elle decrivait l'etat du depot au moment ou le fichier a ete redige hors ligne, avant sa fusion et son application reelles. Sans consequence sur ce lot au-dela de cette correction : `Property.tenant_id` sur les quatre tables enfants (`property_media`, `property_documents`, `property_status_history`, `property_visits`) est bien present dans la base, comme dans `schema.prisma`. Le patron de retro-remplissage documente en §1.5 et repris par `data-model.md` §1.3 reste valable a l'identique ; seule l'incertitude qui l'accompagnait est levee -- ce n'est donc plus une reserve a verifier en debut de lot 2, mais un precedent confirme sur lequel s'appuyer directement.

## 5. Conventions du depot reutilisees par ce lot

Toutes reverifiees par lecture directe, en complement de `research.md` du lot 1 (section 3, non reprise ici a l'identique) :

- **Erreurs** : `conflict()` (409) existe deja dans `lib/errors.ts:28` et est deja utilise ailleurs dans le depot ; la traduction du defaut 5 (`P2002` -> 409) ne demande aucune nouvelle infrastructure d'erreur.
- **Sequences protegees par verrou** : aucun exemple direct de `SELECT ... FOR UPDATE` sur un compteur applicatif n'a ete trouve ailleurs dans le depot au moment de cette verification ; la numerotation des pieces de caisse (`data-model.md` §3.8) introduit ce patron pour la premiere fois, ce qui justifie un test de concurrence dedie (`finance.cash-voucher.sequence.test.ts`, voir `tasks.md`) plutot que la reprise d'un test existant.
- **RBAC** : confirme (§3.1 ci-dessus) que les six permissions du module financier existent deja ; ce lot ne cree ni middleware ni seed nouveaux pour les droits, seulement de nouvelles routes qui les consomment.
- **Frontend** : les primitives `DataView`, `PageHeader`, `MoneyValue`, `ConfirmAction` du lot 1 sont reutilisees telles quelles pour les six nouveaux ecrans (`Fournisseurs`, `BalanceFournisseurs`, `ReleveFournisseur`, `Chantiers`, `FicheChantier`, `PieceDeCaisse`, `PiecesAValider`), sans nouvelle primitive necessaire au perimetre de ce lot.
