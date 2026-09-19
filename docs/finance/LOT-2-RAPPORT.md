# Lot 2 — Moteur généralisé, fournisseurs, chantiers · Rapport de fin de lot

> Périmètre : `docs/finance/PLAN-mise-en-oeuvre.md` §6.
> Spécification : `specs/017-finance-fournisseurs-chantiers/`.
> Branche : `feat/finance-lot-0`.
> 18 septembre 2026.

---

## 1. Ce que le lot livre

Le lot 1 avait fait exister l'argent qui rentre. Celui-ci fait exister l'argent qui sort, et le rattache au chantier qui l'a consommé.

| Livrable                                                          | Où                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Moteur comptable généralisé, partagé avec la copropriété          | `packages/api/src/lib/finance/accounting.ts`                            |
| Fournisseurs, comptes de tiers et balance fournisseurs            | `lib/finance/suppliers.ts`                                              |
| Factures reçues, validation atomique, annulation par pièce liée   | `lib/finance/suppliers.ts`                                              |
| Règlements multi-factures, et acompte sans facture                | `lib/finance/suppliers.ts`                                              |
| Chantiers, postes de dépense, coût réel dérivé                    | `lib/finance/sites.ts`, `cost-allocation.ts`                            |
| Pièces de caisse numérotées par agence et par année, imprimables  | `lib/finance/cash.ts`                                                   |
| File de validation, pour l'organisation « plusieurs saisisseurs » | `lib/finance/validation-queue.ts`                                       |
| Vingt endpoints                                                   | `controllers/finance-{suppliers,sites}-controller.ts` et leurs routeurs |
| Sept écrans                                                       | `apps/web/src/pages/finance/`                                           |
| Parcours de bout en bout et contrôleur d'invariants               | `packages/api/scripts/finance-{e2e,verify}-lot2.ts`                     |

Neuf tables neuves. Trois tables existantes de la copropriété généralisées à l'agence (`ChartOfAccount`, `AccountingJournal`, `JournalEntry`), sans rien retirer à ce qu'elles portaient déjà. Les six permissions du lot 1 suffisent : deux d'entre elles, jusqu'ici inutilisées, trouvent ici leur emploi.

Le coût réel d'un chantier n'a **aucune colonne**. Ce n'est pas un oubli : c'est la forme la plus forte du principe P-4 du PRD. Il n'existe aucune route pour l'écrire parce qu'il n'existe rien à écrire — `getSiteActualCost` le recalcule à chaque lecture. Le seul coût recopié du module est celui du programme de travaux du Patrimoine quand il est rattaché à un chantier, et une route qui tenterait de le saisir reçoit un 409.

---

## 2. Le défaut qui justifie à lui seul ce rapport

Les tests unitaires du lot 2 remplacent Prisma par une doublure. Ils vérifient la logique ; ils ne touchent jamais PostgreSQL. Au moment de l'intégration, **aucun `INSERT` du module n'avait encore atteint une vraie base**, et les quarante-deux suites étaient vertes.

J'ai écrit un parcours de bout en bout (`scripts/finance-e2e-lot2.ts`) qui rejoue le travail de la gestionnaire en appelant les fonctions de production elles-mêmes, sur un tenant jetable, nettoyé après coup. Il a trouvé ceci au premier essai :

```
prisma:query SELECT pg_advisory_xact_lock(hashtext($1))
prisma:error Failed to deserialize column of type 'void'.
```

`pg_advisory_xact_lock` renvoie `void`. Le désérialiseur de `$queryRaw` ne sait pas lire ce type. **La création d'une pièce de caisse échouait donc à tous les coups**, dès le premier appel de production, sur une fonctionnalité que trente tests déclaraient bonne.

Le verrou consultatif lui-même était le bon choix — c'est même la meilleure idée que le lot ait produite, parce qu'il protège la toute première pièce de l'année, ce qu'un verrou de ligne sur une table vide ne fait pas. Seul son mode d'appel était faux : `$executeRaw`, qui n'attend aucune colonne en retour, et non `$queryRaw`.

La leçon ne porte pas sur Prisma. **Une suite qui simule sa base ne peut rien dire de sa base.** Le lot 1 avait eu sa vérification contre une vraie base (rapport §8) et y avait gagné la découverte du piège d'abandon de transaction ; le lot 2 en a été privé jusqu'à l'intégration, et a failli livrer une caisse entièrement inopérante.

---

## 3. Les autres défauts trouvés à l'intégration

### Trois trous dans le contrat, tous de ma main

Même faiblesse qu'au lot 1, et pour la même raison : j'ai gelé seul des contrats que personne n'a relus avant que les agents ne les implémentent fidèlement.

| Défaut                                                                                    | Conséquence si livré                                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Supplier.accountId` côté web, `thirdPartyAccountId` sur le fil                           | Le champ arrivait toujours `undefined`, et TypeScript ne pouvait pas le voir : c'est le type qui mentait       |
| `PendingDocument` sans `createdByUserId`                                                  | Le filtre « Saisi par » aurait envoyé un libellé là où l'API attend un identifiant. Deux homonymes suffisaient |
| Numéro de pièce de caisse : attribué à la validation au contrat, à la saisie dans le code | Un brouillon abandonné consommait son numéro et laissait un trou dans le carnet                                |

Les trois sont corrigés. Le troisième méritait un arbitrage, et l'a reçu : voir §6.

Il mérite aussi une nuance. Le contrat OpenAPI et le modèle de données disaient **tous deux** « attribué à la validation », et le modèle de données le disait mot pour mot depuis le gel du lot. C'est donc l'implémentation qui a dérivé du document, et non l'inverse comme pour les deux autres. Personne ne l'a vu, parce que personne ne relit un document quand le code compile et que les tests passent.

### Un schéma qui ne tenait pas debout

La première migration du lot a échoué et s'est intégralement annulée, pour une raison bête et instructive : `Supplier.maintenanceVendorId` était déclaré en `String` alors que sa cible est un `uuid`. Se sont ajoutées huit relations inverses manquantes entre les modèles neufs, et une imputation déclarée comme relation Prisma depuis la facture — ce qui est impossible, puisqu'une imputation peut naître d'une facture comme d'une pièce de caisse. Elle désigne sa pièce par un couple `(sourceType, sourceId)`, exactement comme le lot 1 le fait pour ses mouvements.

### Trois plans comptables au lieu d'un

Trois agents avaient chacun écrit son amorçage du plan de comptes, avec des numéros divergents : trésorerie en 521 chez l'un, 571 chez l'autre ; charges de chantier en 604 contre 605. Consolidé sur `accounting.ts`, qui est désormais le seul chemin.

### Deux pannes latentes, sans rapport avec ce lot

- `audit-service.ts` passait un `null` ordinaire à une colonne `Json?` de Prisma, qui exige la sentinelle `DbNull`. L'erreur de typage empêchait `ts-jest` de charger **toute** suite dont le graphe de modules touchait ce fichier — ce qui est arrivé dès qu'un garde de droits l'a importé.
- Le relevé imprimé formatait ses montants avec `toLocaleString('fr-FR')`, qui émet une espace fine insécable (U+202F) que les polices standard de `pdf-lib` ne savent pas encoder. Le PDF cassait sur tout montant à quatre chiffres ou plus.

### Un raccordement oublié

`syncWorkProgramCostTx` existait, était testée, et n'était appelée de nulle part. Raccordée à ses trois points d'appel. À l'annulation, les chantiers concernés sont lus **avant** la mise à jour groupée : après, ils portent tous `voidedAt` et la requête ne trouve plus rien.

---

## 4. Ce que les agents ont mieux fait que ma spécification

Deux fois, un agent a rendu une solution meilleure que celle que je lui avais demandée.

Le **verrou consultatif** pour la numérotation. Ma spécification prévoyait une table de compteur verrouillée par `SELECT ... FOR UPDATE`. L'agent a relevé qu'un verrou de ligne ne verrouille rien quand il n'y a pas encore de ligne — c'est-à-dire précisément pour la première pièce de l'année, le moment où deux saisies simultanées feraient le plus de dégâts. Le verrou consultatif se pose sur une clé, pas sur une ligne.

L'**arrondi monétaire**, restreint au seul chemin d'écriture du lot 2. Je demandais de changer `roundMoney` globalement. L'agent a montré que cela modifierait des montants déjà en base dans quatre modules, pour un gain nul en franc CFA, qui n'a pas de subdivision.

---

## 5. Vérifié contre une vraie base

Le parcours de bout en bout crée un chantier, un fournisseur de matériaux, une facture imputée sur deux postes, la valide, saisit deux pièces de caisse et n'en valide qu'une, règle une partie de la facture, verse un acompte sans facture, puis relit tout. Il produit **trente-trois constats, tous tenus**, et supprime son tenant jetable derrière lui.

Les totaux sont choisis pour se vérifier de tête. La facture de 5 000 000 se retrouve à l'identique dans le compte du fournisseur, dans le coût réel du chantier et dans la somme des sous-totaux par poste. La pièce de caisse validée s'y ajoute, la seconde pièce non validée ne s'y ajoute pas. Le règlement puis l'acompte ramènent le solde à 3 300 000, que la balance fournisseurs affiche et totalise.

Cinq contrôles portent sur des invariants plutôt que sur des montants : aucune écriture déséquilibrée, toutes verrouillées, aucun numéro en double, aucun brouillon numéroté, et une suite de numéros continue depuis 1 — c'est ce dernier qui donne corps à la décision du 19 septembre.

Un second script (`scripts/finance-verify-lot2.ts`) contrôle ces mêmes invariants sur une base quelconque, en lecture seule. Il refuse de compter un succès quand il n'a rien examiné : un contrôle qui tourne à vide n'est pas un contrôle qui passe.

---

## 6. Ce qui reste ouvert

**Le point d'arbitrage est tranché.** Le numéro d'une pièce de caisse est attribué à la **validation**, décision de la cliente du 19 septembre 2026. Un brouillon abandonné ne consomme donc aucun rang, et le carnet reste continu — ce qu'un contrôle comptable attend, et ce qu'un carnet à souches fait naturellement.

Ce qui a changé :

- `voucherNumber` et `voucherYear` deviennent facultatifs en base (migration `20260919090000_number_cash_voucher_at_validation`). L'index unique tient toujours : PostgreSQL considère deux valeurs nulles comme distinctes, si bien que les brouillons coexistent sans se gêner.
- La saisie ne prend plus le verrou de séquence : sans numéro à tirer, elle n'a plus rien à protéger. Le verrou passe à la validation, où il sert.
- Le numéro est écrit dans la même mise à jour conditionnelle que la validation elle-même. Ou les deux passent, ou aucun des deux : si une autre transaction valide la pièce entre-temps, le rang tiré repart avec l'abandon sans avoir été consommé.
- L'année de la séquence suit la **date de la pièce**, jamais le jour de la validation. Une pièce datée du 31 décembre validée le 2 janvier appartient à l'exercice de sa date, comme l'écriture qui la porte.
- Le bon imprimé d'un brouillon porte « Pièce n° : attribué à la validation », et non un tiret, qui se lirait comme un numéro sur un papier qu'on remet à quelqu'un.

**La contrepartie, assumée.** On ne peut plus remettre un numéro au bénéficiaire avant que le validateur ne soit passé. C'est le prix d'un carnet sans trou.

Le reste, par ordre d'importance :

- Les tests unitaires du lot 2 simulent entièrement Prisma. Tant que cela reste vrai, le parcours de bout en bout est le seul filet contre les défauts de schéma, et il doit tourner à chaque intégration.
- `POST supplier-payments/{id}/validate` figure au contrat mais n'existe pas : un règlement naît déjà validé. `listSupplierPayments` existe mais ne figure pas au contrat. À réconcilier.
- Aucun lien entre un poste de dépense et un compte du plan comptable. Prévu au lot 3, sans quoi l'imputation analytique et l'imputation comptable resteront deux mondes séparés.
- Deux écarts mineurs hérités de la copropriété, relevés au lot 0 et toujours là : un intervalle de dates invalide donne 500 sur les écritures et 400 sur la balance ; le filtre `onlyActive` ne reconnaît que la chaîne exacte `false`.
- L'API émet encore des alias de champs hérités, que rien ne lit.
- Le dépôt n'a pas de `.gitattributes`, ce qui fait apparaître environ deux cents fichiers comme modifiés par simple changement de fins de ligne.
- Le typage de l'API compte encore 101 erreurs préexistantes, héritées d'avant le module financier. Aucune ne vient de ce lot, qui en a retiré une.

---

## 7. Chiffres

| Mesure                         | Fin du lot 1 | Fin du lot 2 |
| ------------------------------ | ------------ | ------------ |
| Suites de tests backend        | 35           | 42           |
| dont ignorées                  | 4            | 4            |
| Tests backend                  | 289          | 432          |
| dont ignorés                   | 4            | 4            |
| Fichiers de tests web          | 37           | 41           |
| Tests web                      | 351          | 405          |
| Erreurs de typage, API         | 102          | **101**      |
| Erreurs de typage, web         | 0            | 0            |
| Constats contre une vraie base | 0            | **33**       |

Le décompte d'erreurs de type baisse encore d'une unité, comme au lot 1 et pour la même raison : la ligne retirée était une panne en attente, pas une gêne de typage. Aucun fichier auparavant à zéro erreur n'en a gagné.

Reproduire : `npx ts-node packages/api/scripts/finance-baseline.ts`, puis `npx ts-node --transpile-only packages/api/scripts/finance-e2e-lot2.ts`.

---

## 8. Ce que la prochaine visioconférence doit montrer

Dans cet ordre, parce qu'il suit celui du travail réel.

1. Une facture fournisseur saisie, imputée sur deux postes d'un chantier, puis **laissée en brouillon**. Montrer que le chantier ne coûte encore rien.
2. La même facture validée par quelqu'un d'autre, depuis la file « Pièces à valider ». Le coût du chantier bouge alors, sans que personne n'ait tapé un montant de coût.
3. La fiche du chantier : sept postes, des sous-totaux qui somment au coût réel, et chaque imputation qui **nomme la pièce dont elle vient** plutôt que d'afficher son identifiant.
4. Une pièce de caisse saisie : elle n'a **pas** de numéro, et le bon imprimé le dit en toutes lettres. La même validée : le numéro apparaît à cet instant, jamais avant.
5. La balance fournisseurs, avec un acompte qui apparaît en négatif, et le total de contrôle en pied de liste.
6. Une tentative de modification d'une facture validée, qui échoue.

Aucun de ces écrans ne prononce les mots « débit » ni « crédit ». La partie double existe sous chacun d'eux et n'en sort jamais.
