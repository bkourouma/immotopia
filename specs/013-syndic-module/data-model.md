# Data Model: Module de gestion des syndics de copropriété ImmoTopia

**Feature**: 013-syndic-module  
**Date**: 2026-03-04  
**Status**: Draft

## Overview

Ce document décrit le modèle de données du module syndic, en s’appuyant sur Prisma et PostgreSQL, avec isolation stricte par organisation (`organizationId` via relation à `Organization` ou via les liens aux copropriétés).  
Les noms de tables suivent le snake_case, les identifiants sont en UUID, et chaque entité dispose de champs d’audit (`createdAt`, `updatedAt`).

---

## Enums

### SyndicateStatus

```prisma
enum SyndicateStatus {
  ACTIVE
  IN_LIQUIDATION
  IN_DISPUTE
}
```

### LotType

```prisma
enum LotType {
  APARTMENT
  PARKING
  CELLAR
  OFFICE
  COMMERCIAL
  OTHER
}
```

### ChargeCallStatus

```prisma
enum ChargeCallStatus {
  PENDING
  PARTIAL
  PAID
  OVERDUE
}
```

### MeetingType

```prisma
enum MeetingType {
  ORDINARY
  EXTRAORDINARY
}
```

### MeetingStatus

```prisma
enum MeetingStatus {
  PLANNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
```

### ResolutionResult

```prisma
enum ResolutionResult {
  APPROVED
  REJECTED
  DEFERRED
}
```

### VoteChoice

```prisma
enum VoteChoice {
  FOR
  AGAINST
  ABSTAIN
}
```

### SyndicateDocType

```prisma
enum SyndicateDocType {
  REGULATION
  GENERAL_MEETING_MINUTES
  DIAGNOSTIC
  INSURANCE
  BUDGET
  OTHER
}
```

### ContractStatus

```prisma
enum ContractStatus {
  ACTIVE
  EXPIRED
  TERMINATED
}
```

---

## Core Models

### Syndicate

Représente une copropriété gérée par une organisation.

**Table**: `syndicates`

**Champs**:

- `id` (String, UUID, PK) – identifiant unique de la copropriété  
- `organizationId` (String, FK → organizations.id) – organisation propriétaire des données  
- `name` (String) – nom de la copropriété  
- `address` (String) – adresse postale principale  
- `cadastralReference` (String?) – référence cadastrale, optionnelle  
- `totalLots` (Int, default 0) – nombre total de lots (informative, peut être recalculée)  
- `totalBuildings` (Int, default 1) – nombre de bâtiments  
- `status` (SyndicateStatus, default ACTIVE) – état de la copropriété  
- `regulationDocUrl` (String?) – URL du règlement de copropriété stocké dans un système de fichiers / storage  
- `createdAt` (DateTime, default now())  
- `updatedAt` (DateTime, updatedAt)

**Relations**:

- `organization` → `Organization` (belongsTo, via `organizationId`)  
- `lots` → `SyndicateLot[]` (hasMany)  
- `generalMeetings` → `GeneralMeeting[]` (hasMany)  
- `serviceContracts` → `MaintenanceContract[]` (hasMany)  
- `commonAssets` → `CommonAreaAsset[]` (hasMany)  
- `documents` → `SyndicateDocument[]` (hasMany)  
- `funds` → `SyndicateFund[]` (hasMany)  
- `chargeCall` → `ChargeCall[]` (hasMany) – l’ensemble des appels de charges rattachés à la copropriété

**Indexes / contraintes**:

- Index sur `organizationId` pour l’isolation multi-tenant  
- Index sur `(organizationId, name)` pour la recherche  
- Optionnellement index sur `status` pour filtrer les copropriétés actives

---

### SyndicateLot

Représente un lot de copropriété (appartement, parking, cave, bureau, commerce, etc.).

**Table**: `syndicate_lots`

**Champs**:

- `id` (String, UUID, PK)  
- `syndicateId` (String, FK → syndicates.id)  
- `propertyId` (String?, FK → properties.id) – lien facultatif avec un bien du module Property  
- `ownerId` (String?, FK → contacts.id) – lien vers un contact propriétaire dans le CRM  
- `lotNumber` (String) – numéro de lot (souvent issu du règlement)  
- `lotType` (LotType) – type de lot  
- `generalShares` (Int) – tantièmes généraux  
- `specialShares` (Int?) – tantièmes spéciaux, optionnels  
- `ownerSince` (DateTime?) – date de début de détention par le propriétaire actuel  
- `createdAt` (DateTime, default now())  
- `updatedAt` (DateTime, updatedAt)

**Relations**:

- `syndicate` → `Syndicate` (belongsTo)  
- `property` → `Property?` (belongsTo optionnel)  
- `owner` → `Contact?` (belongsTo optionnel)  
- `votes` → `GMVote[]` (hasMany) – votes exprimés par ce lot aux AG  
- `chargeItems` → `ChargeCall[]` (hasMany) – appels de charges associés à ce lot

**Indexes / contraintes**:

- Index sur `syndicateId`  
- Index sur `(syndicateId, lotNumber)` pour éviter les doublons dans une copropriété  
- Index sur `ownerId` pour retrouver rapidement les lots d’un même copropriétaire

---

### ChargeCall

Représente un appel de charges pour un lot et une période donnée.

**Table**: `charge_calls`

**Champs**:

- `id` (String, UUID, PK)  
- `syndicateId` (String, FK → syndicates.id)  
- `lotId` (String, FK → syndicate_lots.id)  
- `period` (String) – identifiant fonctionnel de période (ex. `2024-Q1`, `2024-ANNUEL`)  
- `amount` (Decimal) – montant appelé pour ce lot et cette période  
- `currency` (String, default `"XOF"`) – code devise  
- `dueDate` (DateTime) – date d’échéance  
- `status` (ChargeCallStatus, default PENDING) – statut de l’appel  
- `createdAt` (DateTime, default now())  
- `updatedAt` (DateTime, updatedAt)

**Relations**:

- `syndicate` → `Syndicate` (belongsTo)  
- `lot` → `SyndicateLot` (belongsTo)  
- `payments` → `ChargePayment[]` (hasMany)

**Indexes / contraintes**:

- Index sur `syndicateId`  
- Index sur `lotId`  
- Index sur `(syndicateId, period)` pour les synthèses par période  
- Index sur `status` et `dueDate` pour les vues d’impayés

**State transitions**:

- `PENDING` → `PARTIAL` dès qu’un paiement partiel est enregistré  
- `PENDING` → `PAID` si le montant total est réglé en une fois  
- `PARTIAL` → `PAID` quand la somme des paiements atteint ou dépasse le montant dû  
- `PENDING`/`PARTIAL` → `OVERDUE` lorsque `dueDate` est dépassée et qu’il reste un solde

---

### ChargePayment

Représente un règlement (paiement) d’un appel de charges.

**Table**: `charge_payments`

**Champs**:

- `id` (String, UUID, PK)  
- `chargeCallId` (String, FK → charge_calls.id)  
- `amount` (Decimal) – montant payé  
- `paidAt` (DateTime) – date de paiement  
- `method` (String?) – mode de paiement (virement, mobile money, chèque…)  
- `reference` (String?) – référence libre (référence bancaire, numéro de transaction)  
- `createdAt` (DateTime, default now())

**Relations**:

- `chargeCall` → `ChargeCall` (belongsTo)

**Indexes / contraintes**:

- Index sur `chargeCallId`  
- Possibilité d’indexer `paidAt` pour les analyses temporelles

**Règles de validation métier**:

- `amount` > 0  
- La somme de tous les paiements d’un `ChargeCall` ne doit pas être négative (contrôlé applicativement)

---

### GeneralMeeting

Représente une Assemblée Générale de copropriété.

**Table**: `general_meetings`

**Champs**:

- `id` (String, UUID, PK)  
- `syndicateId` (String, FK → syndicates.id)  
- `type` (MeetingType) – ordinaire ou extraordinaire  
- `scheduledAt` (DateTime) – date/heure prévue  
- `location` (String?) – lieu (physique ou virtuel)  
- `quorum` (Decimal?) – quorum atteint (exprimé en pourcentage de tantièmes ou autre convention)  
- `status` (MeetingStatus, default PLANNED)  
- `minutesUrl` (String?) – lien vers le procès-verbal (document)  
- `createdAt` (DateTime, default now())  
- `updatedAt` (DateTime, updatedAt)

**Relations**:

- `syndicate` → `Syndicate` (belongsTo)  
- `resolutions` → `GMResolution[]` (hasMany)  
- `proxies` → `GMProxy[]` (hasMany)

**State transitions**:

- `PLANNED` → `IN_PROGRESS` au démarrage effectif de l’AG  
- `IN_PROGRESS` → `COMPLETED` à la clôture de l’AG avec PV associé  
- `PLANNED` → `CANCELLED` si l’AG est annulée avant sa tenue

---

### GMResolution

Représente une résolution soumise au vote lors d’une AG.

**Table**: `gm_resolutions`

**Champs**:

- `id` (String, UUID, PK)  
- `meetingId` (String, FK → general_meetings.id)  
- `title` (String) – titre court de la résolution  
- `description` (String?) – description détaillée  
- `majorityRule` (String?) – texte décrivant la règle de majorité (article 24, 25, 26, etc.)  
- `result` (ResolutionResult?) – résultat final (approuvée, rejetée, reportée)  
- `votesFor` (Int, default 0) – nombre de votes « pour » (en unités de voix)  
- `votesAgainst` (Int, default 0) – nombre de votes « contre »  
- `votesAbstain` (Int, default 0) – nombre de votes « abstention »  
- `sharesFor` (Int, default 0) – somme des tantièmes « pour »  
- `createdAt` (DateTime, default now())

**Relations**:

- `meeting` → `GeneralMeeting` (belongsTo)  
- `votes` → `GMVote[]` (hasMany)

**Règles métier**:

- Les compteurs (`votesFor`, `votesAgainst`, `votesAbstain`, `sharesFor`) sont dérivés des `GMVote` et des tantièmes des `SyndicateLot`, mis à jour via services applicatifs.

---

### GMVote

Représente le vote d’un lot sur une résolution.

**Table**: `gm_votes`

**Champs**:

- `id` (String, UUID, PK)  
- `resolutionId` (String, FK → gm_resolutions.id)  
- `lotId` (String, FK → syndicate_lots.id)  
- `vote` (VoteChoice) – pour, contre, abstention  
- `createdAt` (DateTime, default now())

**Relations**:

- `resolution` → `GMResolution` (belongsTo)  
- `lot` → `SyndicateLot` (belongsTo)

**Contraintes**:

- Unicité logique attendue de `(resolutionId, lotId)` pour éviter les votes en double (peut être modélisée par un index unique).

---

### GMProxy

Représente un pouvoir / mandat de représentation pour une AG.

**Table**: `gm_proxies`

**Champs**:

- `id` (String, UUID, PK)  
- `meetingId` (String, FK → general_meetings.id)  
- `grantorId` (String) – identifiant du copropriétaire mandant (lien logique vers `Contact`)  
- `representativeId` (String) – identifiant du mandataire (lien logique vers `Contact`)  
- `createdAt` (DateTime, default now())

**Relations**:

- `meeting` → `GeneralMeeting` (belongsTo)

---

### ServiceProvider

Représente un prestataire de services (ascensoriste, entreprise de nettoyage, etc.).

**Table**: `service_providers`

**Champs**:

- `id` (String, UUID, PK)  
- `organizationId` (String, FK → organizations.id)  
- `name` (String) – nom du prestataire  
- `specialty` (String?) – spécialité (ascenseur, nettoyage, sécurité, etc.)  
- `email` (String?)  
- `phone` (String?)  
- `createdAt` (DateTime, default now())  
- `updatedAt` (DateTime, updatedAt)

**Relations**:

- `organization` → `Organization` (belongsTo)  
- `contracts` → `MaintenanceContract[]` (hasMany)

---

### MaintenanceContract

Représente un contrat de maintenance liant un prestataire à une copropriété.

**Table**: `maintenance_contracts`

**Champs**:

- `id` (String, UUID, PK)  
- `syndicateId` (String, FK → syndicates.id)  
- `providerId` (String, FK → service_providers.id)  
- `nature` (String) – nature du contrat (ascenseur, nettoyage, chaudière, etc.)  
- `startDate` (DateTime) – date de début  
- `endDate` (DateTime?) – date de fin prévue, optionnelle  
- `annualAmount` (Decimal?) – montant annuel, optionnel  
- `currency` (String, default `"XOF"`)  
- `renewalAlertDays` (Int, default 30) – nombre de jours avant la date de fin pour déclencher l’alerte  
- `status` (ContractStatus, default ACTIVE) – statut du contrat  
- `createdAt` (DateTime, default now())  
- `updatedAt` (DateTime, updatedAt)

**Relations**:

- `syndicate` → `Syndicate` (belongsTo)  
- `provider` → `ServiceProvider` (belongsTo)

**State transitions**:

- `ACTIVE` → `EXPIRED` automatiquement lorsque `endDate` est dépassée (logique applicative ou job)  
- `ACTIVE`/`EXPIRED` → `TERMINATED` manuellement lorsqu’un contrat est résilié

---

### CommonAreaAsset

Représente un équipement ou une partie commune de la copropriété.

**Table**: `common_area_assets`

**Champs**:

- `id` (String, UUID, PK)  
- `syndicateId` (String, FK → syndicates.id)  
- `name` (String) – nom de l’équipement / partie commune  
- `category` (String) – catégorie (ascenseur, chaudière, toiture, portail, etc.)  
- `lastMaintenanceDate` (DateTime?) – date de dernière maintenance  
- `nextMaintenanceDate` (DateTime?) – prochaine date souhaitée de maintenance  
- `notes` (String?) – remarques métier  
- `createdAt` (DateTime, default now())  
- `updatedAt` (DateTime, updatedAt)

**Relations**:

- `syndicate` → `Syndicate` (belongsTo)

---

### SyndicateDocument

Représente un document lié à la copropriété.

**Table**: `syndicate_documents`

**Champs**:

- `id` (String, UUID, PK)  
- `syndicateId` (String, FK → syndicates.id)  
- `title` (String) – titre du document  
- `type` (SyndicateDocType) – type de document (règlement, PV, diagnostic, etc.)  
- `fileUrl` (String) – URL du fichier dans le storage  
- `expiresAt` (DateTime?) – date d’expiration éventuelle (ex. attestations d’assurance, diagnostics)  
- `createdAt` (DateTime, default now())

**Relations**:

- `syndicate` → `Syndicate` (belongsTo)

**Indexes / contraintes**:

- Index sur `(syndicateId, type)` pour filtrer par type de document  
- Index sur `expiresAt` pour les alertes de renouvellement

---

### SyndicateFund

Représente un fonds financier associé à une copropriété (compte courant, fonds de travaux…).

**Table**: `syndicate_funds`

**Champs**:

- `id` (String, UUID, PK)  
- `syndicateId` (String, FK → syndicates.id)  
- `name` (String) – nom du fonds (ex. « Compte courant », « Fonds de travaux »)  
- `balance` (Decimal, default 0) – solde actuel  
- `currency` (String, default `"XOF"`)  
- `updatedAt` (DateTime, updatedAt)  
- `createdAt` (DateTime, default now())

**Relations**:

- `syndicate` → `Syndicate` (belongsTo)

---

## Validation Rules (transversales)

- Tous les montants monétaires (`amount`, `annualAmount`, `balance`, etc.) doivent être positifs ou nuls; seules des opérations applicatives autorisées peuvent diminuer un solde.  
- Les dates de fin (`endDate`, `expiresAt`, `nextMaintenanceDate`) doivent être postérieures aux dates de début associées (`startDate`, `lastMaintenanceDate`) lorsqu’elles sont toutes renseignées.  
- Toutes les requêtes Prisma sur ces modèles doivent filtrer par `organizationId` (directement ou via la relation à `Syndicate`), afin de respecter l’isolation multi-tenant.

---

## Business Flows reliés au modèle

- **Création copropriété** → création d’un `Syndicate`, puis de `SyndicateLot` associés et, si besoin, de `SyndicateFund` par défaut (compte courant).  
- **Émission d’un appel de charges** → création de plusieurs `ChargeCall` pour chaque `SyndicateLot` concerné; les `ChargePayment` viendront ajuster les statuts.  
- **Organisation d’une AG** → création d’un `GeneralMeeting`, de plusieurs `GMResolution`, puis de `GMVote` par lot et éventuellement de `GMProxy`.  
- **Gestion des prestataires** → création d’un `ServiceProvider` au niveau de l’organisation, puis de `MaintenanceContract` par copropriété et, si besoin, lien logique à des `CommonAreaAsset` ou tickets de maintenance externes.

