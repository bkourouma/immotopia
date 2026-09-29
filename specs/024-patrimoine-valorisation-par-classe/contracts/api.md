# Contrat API — valorisation par classe et fiabilité (lot 2)

Extension du contrat du lot 1 (`specs/023-patrimoine-multi-actifs/contracts/api.md`), mêmes
préfixe, middlewares, permissions (`PROPERTIES_VIEW` en lecture, `PROPERTIES_EDIT` en écriture),
formes d'erreurs. Tout ce qui n'est pas dit ici est inchangé.

## Méthodes de valorisation

`ValuationMethod` (Prisma) devient :
`MANUAL`, `MARKET_ESTIMATE`, `EXPERT_APPRAISAL`, `DEPRECIATION_LINEAR`, `DEPRECIATION_DECLINING`,
`EQUITY_SHARE`, `UNIT_COST`, `BALANCE`, `ACCRUED_SAVINGS`, `DISCOUNTED_CLAIM`, `UNIT_VALUE`.

## Fiabilité

```ts
type Reliability = "HIGH" | "MEDIUM" | "LOW";
// Clés de raison stables, traduites côté web :
type ReliabilityReason =
  | "METHOD_EXPERT" // expertise
  | "METHOD_BALANCE" // solde saisi
  | "METHOD_COMPUTED" // méthode calculée à partir des attributs
  | "METHOD_MANUAL_WITH_SOURCE" // saisie manuelle avec source
  | "METHOD_MANUAL_NO_SOURCE" // saisie manuelle sans source
  | "STALE_ONE_LEVEL" // au-delà du seuil de péremption de la classe
  | "STALE_TWO_LEVELS" // au-delà du double du seuil
  | "LEGAL_STATUS_FRAGILE" // statut juridique fragile : plafond LOW
  | "LEGAL_STATUS_UNKNOWN"; // statut juridique non renseigné : plafond MEDIUM
```

La fiabilité est **calculée par le serveur** à la création et à la modification d'une valorisation,
et recalculée en lecture pour l'ancienneté (la valeur stockée est celle à la saisie ; l'API renvoie
la valeur effective à la date du jour). Un corps de requête qui contient `reliability` ou
`reliabilityReasons` est refusé (schémas `.strict()`).

`AssetValuationDto` gagne :

```ts
reliability: Reliability | null; // null : valorisation antérieure au lot 2, traitée comme LOW/METHOD_MANUAL_NO_SOURCE
reliabilityReasons: ReliabilityReason[];
```

`AssetDto` gagne : `stale: boolean` (valeur périmée selon le seuil de la classe) et
`currentValue.reliability: Reliability | null`.

## Suggestion de valeur (aucune écriture)

`POST /patrimoine/assets/:assetId/valuations/suggest` — corps `{ asOf?: 'YYYY-MM-DD' }` (défaut
aujourd'hui), lecture seule donc permission `PROPERTIES_VIEW`.

```ts
type SuggestResponse =
  | {
      ok: true;
      amount: number; // XOF entier, ou devise de l'actif
      currency: string;
      method: ValuationMethod;
      assumptions: { key: string; value: string | number }[]; // ex. { key: 'usefulLifeYears', value: 5 }
    }
  | {
      ok: false;
      missing: string[]; // clés des champs manquants, sous `details.`
      // Raison métier d'un refus qui n'est pas un champ manquant (facultative) :
      reason?: "ZERO_VALUE" | "OUT_OF_RANGE" | "ACQUISITION_DATE_IN_FUTURE";
    };
```

Réponse `{ data: SuggestResponse }`. `ok: false` est une réponse **200**, pas une erreur : c'est un
résultat métier (« il manque la durée d'utilité »). Actif inexistant ou d'un autre tenant : 404.
Classes sans méthode calculable (`MOVABLE`, `OTHER`, `REAL_ESTATE`) : `ok: false, missing: []` et
`assumptions` absentes. Aucune valorisation n'est créée ; l'interface propose ensuite un `POST
/valuations` classique avec le montant et la méthode confirmés par l'utilisateur.

## Valeur nette

`NetWorthResult` gagne `lowReliabilityShare: number` (points de pourcentage 0..100, deux
décimales : part de la valeur totale qui repose sur des valeurs de fiabilité `LOW` ou `null`),
et chaque entrée de `assets[]` gagne `reliability: Reliability | null` et `stale: boolean`.

## Détails de classe (`details`, `detailsVersion` 2)

Champs facultatifs ajoutés (schémas `.strict()` ; la version 1 reste lisible) :

| Classe               | Champs                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `REAL_ESTATE`        | `legalStatus`: `TITRE_FONCIER` \| `ACD` \| `CERTIFICAT_PROPRIETE` \| `LETTRE_ATTRIBUTION` \| `ATTESTATION_COUTUMIERE` \| `AUTRE`           |
| `VEHICLE_EQUIPMENT`  | `usefulLifeYears` (1..50), `residualValuePercent` (0..100), `depreciationMethod`: `LINEAR` \| `DECLINING`, `decliningRatePercent` (0..100) |
| `BUSINESS_EQUITY`    | `companyValue` (>=0), ou `netIncome` (>=0) et `earningsMultiple` (>0 .. 100)                                                               |
| `INVENTORY`          | `writeDownPercent` (0..100)                                                                                                                |
| `RECEIVABLE`         | `principal` (>=0), `collectibilityPercent` (0..100)                                                                                        |
| `AGRICULTURE`        | `unitValue` (>=0)                                                                                                                          |
| `SAVINGS_INVESTMENT` | `principal` (>=0) (`expectedRatePercent` existe déjà)                                                                                      |

Les montants de ces champs sont dans la devise de l'actif (convention du lot 1 : `estimatedValue` suit la
devise de l'actif).

## Règles de cohérence ajoutées après relecture

- **Méthode calculée vérifiée par le serveur.** À la création ou à la modification d'une valorisation dont
  la méthode est calculée (`DEPRECIATION_LINEAR`, `DEPRECIATION_DECLINING`, `EQUITY_SHARE`, `UNIT_COST`,
  `ACCRUED_SAVINGS`, `DISCOUNTED_CLAIM`, `UNIT_VALUE`), le serveur recalcule la suggestion à la date de la
  valorisation. Si le montant ne correspond pas (écart de plus de 1 unité en XOF, de 0,01 dans une autre
  devise), la valorisation est enregistrée avec la méthode `MANUAL` : un montant retouché à la main n'est
  jamais présenté comme calculé. `BALANCE` (solde saisi), `MANUAL`, `MARKET_ESTIMATE` et `EXPERT_APPRAISAL`
  ne sont pas concernés.
- **Estimation de marché.** `MARKET_ESTIMATE` est traitée comme une saisie manuelle pour la fiabilité
  (faible sans source, moyenne avec source), avec les mêmes clés de raison que `MANUAL`.
- **Expertise.** `EXPERT_APPRAISAL` exige une `source` non vide (erreur 422, champ `source`).
- **Suggestion nulle ou hors bornes.** Une suggestion dont le montant est nul, non fini ou supérieur à
  999 999 999 999,99 est renvoyée `ok: false` avec `reason` (`ZERO_VALUE` ou `OUT_OF_RANGE`) et
  `missing: []`. Une date d'acquisition postérieure à la date de calcul, pour les seules classes qui
  utilisent cette date, est renvoyée `ok: false` avec `reason: 'ACQUISITION_DATE_IN_FUTURE'`.
- **`stale`** n'est vrai que pour un actif `ACTIVE`.
- **`asOf`** de la suggestion est borné à 1900-01-01 … 2100-12-31.
- **Valorisations saisies par le module Bien** (`/properties/:propertyId/valuations` et bascule d'un lot de
  chantier) calculent et stockent la fiabilité comme celles des actifs.
