# Plan: Valorisation par classe d'actif et fiabilité (lot 2)

**Spec**: [spec.md](spec.md) | **Décision**: [ADR-005](../../docs/architecture/adr/ADR-005-patrimoine-multi-actifs.md)

## Modèle de données

- `ValuationMethod` gagne : `DEPRECIATION_LINEAR`, `DEPRECIATION_DECLINING`, `EQUITY_SHARE`,
  `UNIT_COST`, `BALANCE`, `ACCRUED_SAVINGS`, `DISCOUNTED_CLAIM`, `UNIT_VALUE`. Migration additive
  (`ALTER TYPE … ADD VALUE`), aucune ligne existante réécrite.
- `AssetValuation.reliability` (`ValuationReliability`, déjà présent depuis le lot 1) est renseigné par le
  serveur à chaque création et modification ; ajout de `reliabilityReason String?` (raison lisible, clé de
  raison stable, traduite côté web).
- `Asset.details` : `detailsVersion` passe à 2. Nouveaux champs facultatifs par classe (schémas zod `.strict()`
  étendus, la version 1 reste lisible) :
  - `REAL_ESTATE` : `legalStatus` (`TITRE_FONCIER`, `ACD`, `CERTIFICAT_PROPRIETE`, `LETTRE_ATTRIBUTION`,
    `ATTESTATION_COUTUMIERE`, `AUTRE`).
  - `VEHICLE_EQUIPMENT` : `usefulLifeYears`, `residualValuePercent`, `depreciationMethod`
    (`LINEAR` | `DECLINING`), `decliningRatePercent`.
  - `BUSINESS_EQUITY` : `companyValue` (valeur de l'entreprise) ou `companyEquity`,
    `netIncome` avec `earningsMultiple`.
  - `INVENTORY` : `writeDownPercent`.
  - `RECEIVABLE` : `principal`, `collectibilityPercent`.
  - `AGRICULTURE` : `unitValue` (par tête, par hectare ou par unité de récolte).
  - `SAVINGS_INVESTMENT` : `principal`, `expectedRatePercent` (existe déjà).

## Domaine pur (`lib/patrimoine/assets/`)

- `valuation-methods.ts` : `suggestValuation(assetClass, input, asOf)` renvoie
  `{ ok: true, amount, method, details: string[] } | { ok: false, missing: string[] }`. Une fonction par
  méthode, moins de 50 lignes chacune, arrondi par `roundMoneyXof`.
- `reliability.ts` : `computeReliability({ assetClass, method, valuatedAt, asOf, legalStatus })` renvoie
  `{ level, reasons: string[] }`. Règles : base par méthode (expertise haute ; solde haute ; méthodes
  calculées moyenne ; saisie manuelle faible ou moyenne selon la présence d'une source) ; perte d'un niveau
  au-delà du seuil de péremption de la classe, de deux au-delà du double ; plafond `LOW` pour un statut
  juridique fragile, `MEDIUM` si non renseigné.
- `staleness.ts` : seuil par classe (comptes et mobile money 3 mois, stocks 3 mois, épargne 6 mois,
  créances et agriculture 6 mois, véhicules 12 mois, entreprises 12 mois, immobilier et biens meubles 24
  mois).
- `net-worth.ts` : ajoute `lowReliabilityShare` (part de la valeur reposant sur `LOW`) au résultat ; le
  calcul reçoit la fiabilité de chaque valorisation.

## API (extension du contrat du lot 1)

- `POST /patrimoine/assets/:assetId/valuations/suggest` : corps facultatif `{ asOf? }` ; lit les détails de
  l'actif ; renvoie la suggestion ou la liste des champs manquants ; n'écrit rien.
- Les routes de valorisation du lot 1 calculent et renvoient `reliability`, `reliabilityReason`, `method`.
- `GET /patrimoine/net-worth` renvoie `lowReliabilityShare` et, par actif, `stale: boolean`.
- Permissions inchangées (`PROPERTIES_VIEW` en lecture, `PROPERTIES_EDIT` en écriture).

## Interface

- Fiche d'actif, onglet Valeurs : bouton « Calculer une valeur » qui affiche la suggestion, la méthode et
  les hypothèses, et propose de l'enregistrer telle quelle ou modifiée ; badge de fiabilité avec la raison en
  infobulle sur chaque valeur.
- Formulaire d'actif : champs de valorisation propres à la classe, et statut juridique pour l'immobilier.
- Liste des actifs et valeur nette : pastille « valeur périmée », indicateur de la part de valeur peu fiable.

## Territoires

| Étape | Territoire                                                                       | Dépend de   |
| ----- | -------------------------------------------------------------------------------- | ----------- |
| A     | Migration de l'enum, `reliabilityReason`, schémas de détails étendus             | —           |
| B     | Domaine pur : méthodes, fiabilité, péremption, valeur nette, tests               | A (types)   |
| C     | Service et routes : suggestion, fiabilité serveur, extension valeur nette, tests | A, B        |
| E     | Interface, traductions fr, en, ar                                                | C (contrat) |
| F     | Recette, wiki, HANDOFF                                                           | tous        |

## Risques

| Risque                                             | Réponse                                                         |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Une valeur suggérée prise pour une valeur certaine | Jamais d'écriture automatique ; méthode et hypothèses affichées |
| Fiabilité manipulable par le client                | Calculée côté serveur, champ refusé en entrée                   |
| Poids et seuils contestables                       | Constantes nommées et testées, ajustables sans migration        |
| Liste des statuts juridiques inexacte pour un pays | Valeur `AUTRE` ; revue par un juriste local avant communication |
