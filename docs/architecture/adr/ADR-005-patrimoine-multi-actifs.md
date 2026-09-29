# ADR-005 : patrimoine multi-actifs, socle `Asset` et valeur nette consolidée

## Statut

Proposé

## Date

2026-09-29

## Contexte

Le module Patrimoine (spec `specs/015-patrimoine-module`, lots P0 à P5) est bâti
sur le bien immobilier : valorisations, prêts, dépenses, travaux, documents et
parts détenues portent tous un `propertyId` (`AssetValuation`, `PropertyLoan`,
`PropertyExpense`, `WorkProgram`, `PropertyHolding`). La spec 015 interdit en
outre au module de créer un bien (FR-012) ou de dupliquer ses champs (FR-013). Le
rendement et les projections (`lib/patrimoine/yield.ts`, `projectYield`)
supposent des loyers et des baux ; le moteur fiscal (`lib/patrimoine/tax`)
couvre la taxe foncière et l'impôt sur revenus locatifs de la Côte d'Ivoire et
du Mali seulement (`FiscalCountry`, « un nouveau pays = une migration »).

L'objectif produit a changé : ImmoTopia n'a aucun client et vise le grand public
de l'UEMOA (8 pays, monnaie unique XOF, cadre juridique OHADA) : des particuliers
qui possèdent un immeuble mais aussi des stocks, des véhicules, des parts
d'entreprise, de l'épargne, du mobile money, des plantations, des créances. Ils
doivent connaître la valeur de leur patrimoine et faire des projections et des
simulations sur l'ensemble.

Faits qui contraignent la décision :

- aucun client existant : pas de compatibilité de données à préserver, seulement
  les jeux de démonstration ;
- le tenant est aujourd'hui une agence (`TenantType` : `AGENCY`, `OPERATOR`) ;
  un pack `MODULE_PATRIMOINE` existe déjà (« biens détenus en propre ») et compte
  sur la métrique `BIENS_DETENUS` ;
- `TaxParameter` est global (sans `tenantId`) et porte déjà un statut
  `A_VALIDER` / `VALIDE`, une `source` et un `sourceUrl` ; le moteur calcule avec
  un paramètre `A_VALIDER` mais marque le résultat comme non validé
  (`engine.ts`, `allValidated`) ;
- l'assistant IA existant (ADR-004) est en lecture seule, sans recherche web, et
  soumis à une décision juridique sur les données personnelles.

## Décision

1. **Un modèle `Asset` porté par le tenant** (table `assets`) devient la racine
   du patrimoine. Il porte : nom, **classe d'actif**, statut, devise (XOF par
   défaut), date et coût d'acquisition, entité détentrice, et des attributs
   propres à la classe (`details`, JSON validé par un schéma zod par classe).
2. **Classes d'actifs** (enum `AssetClass`) : `REAL_ESTATE`, `BUSINESS_EQUITY`
   (parts et actions de sociétés), `INVENTORY` (stocks et marchandises),
   `VEHICLE_EQUIPMENT`, `CASH` (comptes bancaires et mobile money),
   `SAVINGS_INVESTMENT` (placements, tontines, assurance-vie), `RECEIVABLE`
   (créances et prêts consentis), `AGRICULTURE` (plantations, cheptel, récoltes),
   `MOVABLE` (biens meubles de valeur), `OTHER`. Un terrain est de l'immobilier
   (`PropertyType.TERRAIN`).
3. **L'immobilier reste maître de sa fiche.** Un `Asset` `REAL_ESTATE` porte un
   `propertyId` unique et facultatif ; adresse, surface, baux et statut restent
   sur `Property`. Les autres classes n'ont pas de `Property`.
4. **Valorisation par classe, historisée.** `AssetValuation` passe de
   `propertyId` à `assetId`. Chaque point garde méthode, date, source et un
   indicateur de **fiabilité** (`HIGH`, `MEDIUM`, `LOW`) dérivé de la méthode, de
   l'ancienneté de la valeur et, pour l'immobilier, du **statut juridique** (titre
   foncier, ACD, lettre d'attribution, attestation villageoise…). Une fonction
   pure par classe calcule une valeur suggérée à partir des attributs (parts ×
   valeur de l'entreprise, quantité × coût unitaire, amortissement linéaire ou
   dégressif, solde, capital + intérêts) ; l'utilisateur confirme ou saisit la
   sienne. L'interface affiche toujours méthode, date et fiabilité.
5. **Généralisation des entités liées.** `PropertyLoan`, `PropertyExpense`,
   `WorkProgram`, `PatrimonyDocument` et `PropertyHolding` se rattachent à
   `assetId`. Un prêt peut ne pas être adossé (`assetId` nul) : la valeur nette
   soustrait aussi les dettes personnelles.
6. **Valeur nette consolidée** : actifs (dernière valeur de chaque actif) moins
   dettes, en XOF, avec répartition par classe et évolution dans le temps. Un
   actif sans valeur n'est pas compté et est signalé.
7. **Projections et simulations consolidées** (lots ultérieurs) : un moteur pur
   projette chaque classe avec ses hypothèses (croissance, rendement,
   amortissement, remboursement). Les **scénarios** (prudent, central,
   optimiste) sont des jeux d'hypothèses nommés. Une **simulation** applique des
   opérations hypothétiques (vente, achat, emprunt, remboursement anticipé) à une
   **copie** des données ; elle ne modifie jamais le patrimoine réel.
8. **Fiscalité : seul l'immobilier est calculé.** Les autres classes n'ont pas de
   calcul d'impôt ; l'interface écrit « impôt non calculé ». Les pays de l'UEMOA
   autres que CI et ML sont suivis et valorisés sans impôt tant que leurs
   paramètres ne sont pas chargés.
9. **Collecte assistée par IA des paramètres fiscaux d'un pays** (lot dédié, après
   le socle). Quand un pays sans paramètres est choisi, un job de collecte
   interroge un modèle avec recherche web et produit des lignes `TaxParameter` au
   statut `A_VALIDER`, **chacune avec `source` et `sourceUrl` obligatoires** (une
   ligne sans source est rejetée). Le modèle ne calcule jamais un impôt : il ne
   fournit que des paramètres, que le moteur existant applique. Seul le nom du pays
   et l'année quittent l'infrastructure : aucune donnée personnelle. L'utilisateur
   relit chaque paramètre avec sa source et le valide pour **son usage** ; la
   promotion en paramètre global `VALIDE` reste réservée à un administrateur
   plateforme. Un résultat fondé sur un paramètre non promu est affiché « indicatif,
   non vérifié par ImmoTopia ». Il faudra donc un statut ou une portée par tenant
   pour les validations personnelles : c'est l'objet du lot dédié et de son ADR.
10. **Onboarding particulier** : un tenant de type particulier (nouvelle valeur de
    `TenantType`, à trancher au lot 4) avec inscription en libre-service, palier
    gratuit ou très bas limité en nombre d'actifs, paiement par mobile money si
    PaySecureHub le permet. Hors lot 1.
11. **Découpage en lots** : 1 socle (`Asset`, classes, valorisation manuelle,
    valeur nette, migration) ; 2 méthodes de valorisation par classe ; 3
    projections et simulations ; 4 onboarding et tarification particulier ; 5
    exports et portail ; 6 collecte fiscale par IA.

## Conséquences positives

- Le produit s'adresse à tous ceux qui ont un patrimoine, plus seulement à ceux
  qui ont de l'immobilier géré par une agence.
- L'immobilier garde ses moteurs (rendement, fiscalité CI/ML, portail
  propriétaire) : le socle les alimente, il ne les remplace pas.
- Aucune compatibilité arrière à porter : la migration est une refonte propre, et
  les jeux de démonstration sont régénérés.
- La fiabilité affichée protège la crédibilité des chiffres : une estimation
  n'est pas présentée comme un fait.
- La collecte fiscale par IA n'envoie aucune donnée personnelle et réutilise le
  statut `A_VALIDER` et le marquage « non validé » du moteur.

## Conséquences négatives

- Refonte large : les tables, routes, gardes d'isolation, exports PDF et Excel,
  traductions (fr, en, ar) et le wiki des fonctionnalités sont tous touchés ;
  chaque nouveau modèle passe `schema-tenant-coverage`, chaque nouvelle route
  `routes-inventory`.
- Le rendement et les projections par bien deviennent un cas particulier de
  `REAL_ESTATE` ; le portail propriétaire et les relevés de gérance doivent
  continuer de passer par les données du bien.
- `details` en JSON évite dix tables mais déplace la validation dans le code : un
  schéma zod par classe, versionné, est indispensable.
- Une valeur d'entreprise, de véhicule ou de cheptel reste une estimation : le
  produit doit assumer un discours de fourchette, pas de valeur exacte.
- Une IA qui collecte de la fiscalité peut se tromper ou citer une source
  périmée : la validation humaine et la mention « indicatif » sont obligatoires,
  et la responsabilité d'un calcul fondé sur un paramètre validé par l'utilisateur
  reste à cadrer juridiquement.
- Le pack `MODULE_PATRIMOINE`, la métrique `BIENS_DETENUS` et les
  entitlements doivent être repensés au lot 4 (un actif non immobilier ne compte
  pas comme un bien détenu).

## Alternatives écartées

- **Un module séparé « fortune » à côté de Patrimoine** — dupliquerait les
  valorisations, prêts, documents et entités détentrices déjà en place, avec deux
  valeurs nettes qui divergeraient.
- **Une table par classe d'actif** — dix modèles à couvrir par l'inventaire tenant
  et autant de routes, pour des attributs qui changent souvent ; `Asset` avec
  `details` validé par classe suffit.
- **Fiscalité multi-pays et multi-classes dès le départ** — chantier énorme et
  fragile ; l'impôt reste réservé à l'immobilier, les autres pays arrivent par la
  collecte assistée.
- **Connexions bancaires, boursières ou mobile money automatiques** — les
  cibles saisissent à la main ; aucune API fiable n'est garantie dans la zone.
- **Laisser l'IA calculer directement l'impôt** — non reproductible, non
  auditable ; elle ne propose que des paramètres sourcés que le moteur applique.
- **Valider un paramètre collecté pour tous les utilisateurs** — l'erreur d'un
  utilisateur se propagerait à tous ; la promotion globale reste un acte
  d'administrateur plateforme.

## Liens

- `specs/023-patrimoine-multi-actifs/` (spec, plan, modèle de données, tâches)
- `specs/015-patrimoine-module/` (module immobilier existant)
- `docs/architecture/adr/ADR-004-assistant-ia-immocopilot.md` (cadre IA, données
  personnelles)
- `packages/api/prisma/schema.prisma` (`AssetValuation`, `PropertyLoan`,
  `PropertyHolding`, `HoldingEntity`, `TaxParameter`)
- `packages/api/src/lib/patrimoine/` (`yield.ts`, `tax/engine.ts`)
- `docs/PROPOSITION_MODELE_ECONOMIQUE_2026.md` (packs et tarification)
