# Data Model: Patrimoine multi-actifs (lot 1)

**Feature**: 023-patrimoine-multi-actifs
**Date**: 2026-09-29
**Status**: Draft (esquisse Prisma à valider avant migration)

## Overview

`Asset` devient la racine du patrimoine d'un tenant. Les entités patrimoniales
existantes (valorisations, prêts, dépenses, travaux, documents, parts détenues)
passent de `propertyId` à `assetId`. `Property` reste le référentiel de la fiche
immobilière ; `OwnerStatement` et `OwnerStatementItem` (relevés de gérance) restent
rattachés au bien : ils relèvent de la gestion pour compte de tiers, pas du
patrimoine propre.

## Enums

```prisma
enum AssetClass {
  REAL_ESTATE
  BUSINESS_EQUITY
  INVENTORY
  VEHICLE_EQUIPMENT
  CASH
  SAVINGS_INVESTMENT
  RECEIVABLE
  AGRICULTURE
  MOVABLE
  OTHER
}

enum AssetStatus {
  ACTIVE
  DISPOSED   // vendu, cédé ou détruit : sort de la valeur nette à disposedAt
  ARCHIVED
}

enum ValuationReliability {
  HIGH
  MEDIUM
  LOW
}
```

`ValuationMethod` existant (`MANUAL`, `MARKET_ESTIMATE`, `EXPERT_APPRAISAL`)
s'enrichit au lot 2 (`DEPRECIATION`, `EQUITY_SHARE`, `UNIT_COST`, `BALANCE`,
`DISCOUNTED_CLAIM`). Le lot 1 n'utilise que les valeurs existantes.

## Entités

### Asset

- But : un élément du patrimoine, de n'importe quelle classe.
- Champs : `id` (uuid), `tenantId`, `name`, `assetClass`, `status`, `currency`
  (défaut `XOF`), `exchangeRateToXof` (nul si XOF), `acquisitionCost`,
  `acquisitionDate`, `disposedAt`, `holdingEntityId?`, `propertyId?` (unique),
  `details Json`, `detailsVersion Int`, `notes`, `createdByUserId`, dates.
- Relations : N:1 `Tenant` ; 1:1 facultatif `Property` ; N:1 facultatif
  `HoldingEntity` ; 1:N `AssetValuation`, `AssetLoan`, `PropertyExpense`,
  `WorkProgram`, `PatrimonyDocument`, `AssetHolding`.
- Règles :
  - `propertyId` renseigné seulement si `assetClass = REAL_ESTATE` ; le bien
    appartient au même tenant (`assertBelongsToTenant`) ;
  - `details` validé par le schéma zod de la classe (`detailsVersion` permet de
    faire évoluer le schéma) ;
  - `currency != XOF` exige `exchangeRateToXof > 0`.
- Index : `(tenantId, status)`, `(tenantId, assetClass)`, unique `(propertyId)`.

### AssetValuation (modifié)

- `propertyId` est remplacé par `assetId`.
- Champs conservés : `valuatedAt`, `estimatedValue`, `currency`, `acquisitionCost`,
  `acquisitionDate`, `method`, `notes`.
- Champs ajoutés : `source String?`, `reliability ValuationReliability?` (rempli au
  lot 2, nul au lot 1).
- Règle : `estimatedValue > 0`.
- Index : `(tenantId, assetId, valuatedAt)`.

### AssetLoan (renommé depuis `PropertyLoan`)

- `propertyId` est remplacé par `assetId` **facultatif** : une dette personnelle
  n'est pas adossée.
- Autres champs et règles inchangés (`lender`, `capitalAmount`,
  `remainingCapital`, `interestRate`, `monthlyPayment`, dates, `status`).

### PropertyExpense, WorkProgram, PatrimonyDocument, PropertyHolding

- `propertyId` est remplacé par `assetId` (obligatoire pour la dépense, le programme
  de travaux et la part détenue ; facultatif pour le document, qui garde
  `ownerContactId`).
- `PropertyHolding` est renommé `AssetHolding` ; unicité `(assetId, entityId)`.
- Aucun autre champ ne change.

### HoldingEntity (inchangé)

Forme juridique (SCI, HOLDING, COMPANY, INDIVIDUAL, OTHER), pays fiscal, parent.
Sert de détenteur de n'importe quel actif.

## Détails par classe (schémas zod, `details`)

| Classe               | Attributs du lot 1                                                            |
| -------------------- | ----------------------------------------------------------------------------- |
| `REAL_ESTATE`        | aucun (tout est sur `Property`)                                               |
| `BUSINESS_EQUITY`    | raison sociale, forme OHADA, pays, pourcentage détenu (0 à 100), secteur      |
| `INVENTORY`          | désignation, quantité, unité, coût unitaire                                   |
| `VEHICLE_EQUIPMENT`  | type, marque, modèle, année, immatriculation ou numéro de série               |
| `CASH`               | établissement ou opérateur (banque, Orange Money, Wave, MTN, Moov), type      |
| `SAVINGS_INVESTMENT` | type (placement, tontine, assurance-vie, autre), organisme, taux attendu      |
| `RECEIVABLE`         | débiteur, échéance, taux                                                      |
| `AGRICULTURE`        | nature (plantation, cheptel, récolte), culture ou espèce, surface ou effectif |
| `MOVABLE`            | désignation, catégorie                                                        |
| `OTHER`              | libellé libre                                                                 |

Au lot 1, la valeur courante vient d'une valorisation saisie ; ces attributs
décrivent l'actif et préparent les méthodes du lot 2. Aucun attribut ne contient de
donnée sensible (pas de numéro de compte complet : au plus les quatre derniers
chiffres).

## Valeur nette (calcul, pas de table)

```text
valeur courante d'un actif = dernière AssetValuation à la date de calcul,
  convertie en XOF (estimatedValue × exchangeRateToXof si la devise diffère)
actifs      = somme des valeurs courantes des Asset ACTIVE (ou DISPOSED après la date)
dettes      = somme des remainingCapital des AssetLoan ACTIVE, convertis en XOF
valeur nette = actifs - dettes
```

Un actif sans valorisation, ou dont le taux de change manque, est exclu du
calcul et listé dans `excluded[]`.

## Migration

- Schéma : nouvelles tables et colonnes, puis renommages et remplacement de
  `propertyId` par `assetId` dans une migration Prisma.
- Données : pour chaque `Property` portant au moins une valorisation, un prêt, une
  dépense, un programme de travaux, un document ou une part détenue, création d'un
  `Asset` `REAL_ESTATE` (`name` = référence interne du bien, `propertyId`, devise
  XOF) puis rattachement des lignes existantes.
- Création à la volée : à l'avenir, mettre un bien « au patrimoine » crée son
  actif (à confirmer au plan : point d'entrée exact).
- Vérification : les comptes de lignes avant et après sont égaux, et les
  résultats de rendement et de fiscalité du jeu de démonstration sont identiques.

## Invariants transverses

- Tout modèle porte `tenantId` et figure dans `schema-tenant-coverage`.
- Un identifiant reçu (`assetId`, `propertyId`, `holdingEntityId`) est vérifié comme
  appartenant au tenant avant écriture ; une référence d'un autre tenant lève la
  même `NotFoundError` qu'un objet inexistant.
- Aucun `include: { user: true }` : toujours un `select`.
- Montants en `Decimal`, arrondi XOF via `roundMoneyXof`.
