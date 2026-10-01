# Plan d'implémentation 032 — Assurances, sinistres et carnet d'entretien

**Branche** : `feat/patrimoine-assurances` · **Spec** : [spec.md](./spec.md) ·
**Plan de vague** : [PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md) (lot B1)

## Résumé

Trois briques rattachées à un bien : des **polices d'assurance** au statut dérivé de leurs
dates, des **sinistres** suivis par une machine à états (table de transitions unique,
historique, pièces, reste à charge calculé) et un **carnet d'entretien** chronologique
exportable en CSV. Une alerte e-mail quotidienne prévient les administrateurs de l'agence
des polices proches de l'échéance, des prochaines échéances d'entretien et des fins de
garantie. Aucune dépense n'est créée, aucune permission n'est ajoutée : les routes
réutilisent `PROPERTIES_VIEW` / `PROPERTIES_EDIT`.

## Contexte technique

- API Express 4, Prisma 5, PostgreSQL, Jest ; web React 18, Ant Design, Vitest.
- Existant réutilisé : `utils/property-tenant-guard.ts` (`getPropertyForTenant`),
  `utils/tenant-ownership.ts` (`assertBelongsToTenant`), `routes/patrimoine-entities-routes.ts`
  (modèle de garde), `lib/patrimoine/notifications.ts` (`alertLoanMaturity`, patron des
  alertes), `lib/patrimoine/notification-channels.ts` (`escapeHtml`, `applyTemplate`),
  `services/email-service.ts`, `services/audit-service.ts` (`logAuditEvent`,
  `flushAuditEvents`), `jobs/document-expiry-alert-job.ts`, routes de documents de bien
  (`POST …/properties/:id/documents`, `GET …/documents/:documentId/file`).
- Migration additive `20261007120000_patrimoine_assurances_sinistres`, postérieure à
  `20261007110000_secure_links` ; aucune migration existante n'est éditée.
- Fichiers que le lot **ne modifie pas** : `lib/patrimoine/{yield,queries,notifications}.ts`,
  `lib/patrimoine/entities/*`, `lib/patrimoine/export/*`,
  `components/patrimoine/PropertyPatrimoineTab.tsx`, `services/patrimoine-service.ts`. Les
  helpers privés de `notifications.ts` sont dupliqués localement.

## Vérification de la constitution (AGENTS.md)

| Règle                          | Application                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant         | `tenantId` direct sur les cinq modèles ; routes sous `requireTenantAccess` ; biens par `getPropertyForTenant`, autres références par `assertBelongsToTenant` ; `NotFoundError` uniforme |
| Erreurs typées, `asyncHandler` | contrôleurs enveloppés ; `BadRequestError`, `ConflictError`, `NotFoundError` de `middleware/error-middleware` ; aucun `try/catch` qui devine un statut                                  |
| Configuration                  | aucune nouvelle variable d'environnement                                                                                                                                                |
| Permissions                    | aucune nouvelle ; `PROPERTIES_VIEW` en lecture, `PROPERTIES_EDIT` en écriture et en transition                                                                                          |
| Fichiers uploadés              | aucun fichier géré par le lot : liaisons vers des `PropertyDocument` ; téléversement et téléchargement par les routes existantes ; jamais de chemin disque dans une réponse             |
| Frontend                       | `utils/api-client`, `config/api`, onglets et page en `React.lazy`, pas de `dangerouslySetInnerHTML`                                                                                     |
| i18n                           | fr clé, `npm run i18n:extract` côté web et API par le coordinateur ; marges logiques                                                                                                    |
| Wiki                           | sous-fonctionnalités signalées au coordinateur (voir ci-dessous)                                                                                                                        |

## Architecture par couche

Un fichier = un seul agent. Ordre : 1 → 2 → (3 ∥ 4) → 5 → 6.

### 1. Schéma, migration et constantes (fait par le coordinateur)

- `packages/api/prisma/schema.prisma` : enums `InsuranceCoverageType`, `InsuranceClaimCause`,
  `InsuranceClaimStatus`, `InsuranceClaimDocumentKind`, `MaintenanceLogCategory` ; modèles
  `InsurancePolicy`, `InsuranceClaim`, `InsuranceClaimDocument`,
  `InsuranceClaimStatusHistory`, `MaintenanceLogEntry` ; relations inverses sur `Tenant`,
  `Property`, `PropertyDocument`, `MaintenanceTicket`, `PropertyExpense`, `MaintenanceVendor`.
- `packages/api/prisma/migrations/20261007120000_patrimoine_assurances_sinistres/migration.sql`.
- `packages/api/src/types/audit-types.ts` : `PATRIMOINE_INSURANCE_POLICY_ALERT_SENT`,
  `PATRIMOINE_MAINTENANCE_DUE_ALERT_SENT`, `PATRIMOINE_INSURANCE_CLAIM_DECLARED`,
  `PATRIMOINE_INSURANCE_CLAIM_STATUS_CHANGED`.
- `packages/api/src/services/tenant-data-export/model-registry.ts` : les cinq modèles
  rejoignent l'export d'agence (données de l'agence, sans secret).

### 2. Domaine pur : `lib/patrimoine/insurance/`

- `claim-status.ts` : table unique des transitions, `canTransition(from, to)`,
  `allowedNextStatuses(from)` (fonctions pures, sans accès base).
- `policy-status.ts` : `derivePolicyStatus(policy, now)` et `daysToExpiry` (comparaison par
  jour calendaire UTC, seuil de 30 jours).
- `amounts.ts` : `computeOutOfPocket(claimed, indemnified)` (centimes entiers ou `Decimal`),
  conversions `Decimal` vers `number` pour les DTO.
- `schemas.ts` : schémas Zod `.strict()` des polices, sinistres, transitions, pièces ;
  `maintenance-log-schemas.ts` : schémas du carnet. Dates `YYYY-MM-DD` ou ISO complet.
- `maintenance-log-csv.ts` : sérialisation CSV (BOM, `;`, colonnes fixes, neutralisation
  des formules, guillemets doublés).
- `dto.ts` : projections Prisma vers `InsurancePolicyDto`, `InsuranceClaimDto`,
  `InsuranceClaimDetailDto`, `MaintenanceLogEntryDto` (montants en `number`, dates ISO).

### 3. Services et contrôleurs API

- `packages/api/src/lib/patrimoine/insurance/policy-service.ts` : liste (avec filtre sur le
  statut dérivé, appliqué après lecture et décompte `claimsCount`), création, lecture,
  modification, suppression (409 si sinistres). Vérifie `documentId` (même agence, même bien).
- `packages/api/src/lib/patrimoine/insurance/claim-service.ts` : liste, création, détail
  (pièces et historique, `select` explicite `{ id, fullName }` sur `User`), modification,
  suppression (`DECLARED` seulement), pièces (liaison, doublon 409, retrait).
- `packages/api/src/lib/patrimoine/insurance/claim-transition-service.ts` : une
  `prisma.$transaction` qui contrôle la matrice, applique les règles de `SETTLED` et
  `REJECTED`, fait la mise à jour conditionnelle `updateMany where { id, tenantId, status }`
  (0 ligne : 409), écrit l'horodatage dédié, la ligne d'historique et l'audit.
- `packages/api/src/lib/patrimoine/insurance/maintenance-log-service.ts` : liste
  chronologique (`performedAt` décroissant puis `createdAt` décroissant), création,
  modification, suppression, export CSV ; vérifie prestataire (`tenantField: 'tenant_id'`)
  et document.
- `packages/api/src/controllers/patrimoine-insurance-controller.ts` : handlers
  `asyncHandler` ; `.parse()` du schéma en tête de chaque handler ; `tenantId` pris de
  l'URL validée, `createdByUserId` de `req.user.userId`.
- `packages/api/src/routes/patrimoine-insurance-routes.ts`, monté dans `app.ts` (une ligne,
  après `patrimoineEntitiesRoutes`) : `authenticate`, `requireTenantAccess`,
  `requirePropertyPermission(...)` sur **chaque** route (pas de `router.use` nu). La route
  `/maintenance-log/export` est déclarée **avant** toute route `/:entryId`.
- Garde `routes-inventory.test.ts` et `route-features` : le préfixe
  `/tenants/:tenantId/patrimoine` est déjà rattaché à la fonctionnalité `PATRIMOINE`.

### 4. Alertes et job

- `packages/api/src/lib/patrimoine/insurance-alerts.ts` : `alertExpiringInsurancePolicies`,
  `alertMaintenanceDeadlines`, `runInsuranceAlerts` (voir « Alertes »). En-tête du fichier :
  le routeur de canaux de #92 n'est pas appliqué, car les destinataires sont des
  utilisateurs internes.
- `packages/api/src/constants/email-notification-keys.ts`,
  `email-notification-default-templates.ts`, `notification-key-features.ts` : une clé
  `INSURANCE_DEADLINE_ALERT`, fonctionnalité `PATRIMOINE`. Les types de
  `types/communication-types.ts` et `utils/communication-validators.ts` suivent s'ils
  énumèrent les clés.
- `packages/api/src/jobs/document-expiry-alert-job.ts` : import, **une** ligne
  `accumulate(report, await runInsuranceAlerts(tenant.id, { now }))` et mise à jour du
  commentaire de tête.

### 5. Web

- `apps/web/src/types/insurance-types.ts` : reflet exact des DTO, enums, libellés (`t()`).
- `apps/web/src/services/insurance-service.ts` (via `utils/api-client`) : `listInsurancePolicies`,
  `createInsurancePolicy`, `updateInsurancePolicy`, `deleteInsurancePolicy`,
  `listInsuranceClaims`, `getInsuranceClaim`, `createInsuranceClaim`, `updateInsuranceClaim`,
  `deleteInsuranceClaim`, `changeInsuranceClaimStatus`, `attachClaimDocument`,
  `detachClaimDocument`, `listMaintenanceLog`, `createMaintenanceLogEntry`,
  `updateMaintenanceLogEntry`, `deleteMaintenanceLogEntry`, `downloadMaintenanceLogCsv`.
- `apps/web/src/components/insurance/` : `PropertyInsuranceTab.tsx` (props
  `{ propertyId, tenantId }`), `PropertyMaintenanceLogTab.tsx` (mêmes props),
  `ClaimStatusTimeline.tsx`, et les formulaires et tiroirs nécessaires (police, sinistre,
  changement de statut, pièces, entrée de carnet).
- `apps/web/src/pages/insurance/InsuranceClaimsPage.tsx` (export par défaut) : route
  `/tenant/:tenantId/patrimoine/claims`, en `React.lazy`.
- `apps/web/src/pages/properties/PropertyDetail.tsx` : deux onglets « Assurances et
  sinistres » et « Carnet d'entretien », composants chargés en `React.lazy`.
- Navigation : entrée « Sinistres » sous la section patrimoine (`navigation/model.tsx`,
  `menu-catalog.ts`, `route-labels.ts`, miroir web de `route-features` si présent),
  permissions identiques à celles de la page Patrimoine.

### 6. Intégration et recette

`typecheck`, `lint`, `check:architecture`, `i18n:extract`, `measure:entry`, wiki, passation :
voir « Définition de fini ».

## Modèle de données

Migration additive `20261007120000_patrimoine_assurances_sinistres` ; **aucun `ADD VALUE`**
sur un enum existant (la nature d'une pièce vit dans `InsuranceClaimDocumentKind` ; le type
`INSURANCE` de `PropertyDocumentType` existe déjà).

### Enums

| Enum                         | Valeurs                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `InsuranceCoverageType`      | `MULTIRISK_HOME`, `MULTIRISK_BUILDING`, `OWNER_LIABILITY`, `OTHER`                                   |
| `InsuranceClaimCause`        | `WATER_DAMAGE`, `FIRE`, `THEFT`, `STRUCTURAL`, `STORM`, `OTHER`                                      |
| `InsuranceClaimStatus`       | `DECLARED`, `INSURER_NOTIFIED`, `EXPERTISE`, `SETTLED`, `REJECTED`, `CLOSED`                         |
| `InsuranceClaimDocumentKind` | `PHOTO_BEFORE`, `PHOTO_AFTER`, `QUOTE`, `EXPERT_REPORT`, `INSURER_LETTER`, `INVOICE`                 |
| `MaintenanceLogCategory`     | `PLUMBING`, `ELECTRICAL`, `AIR_CONDITIONING`, `GENERATOR`, `ROOF_WATERPROOFING`, `PAINTING`, `OTHER` |

Le statut d'une police (`UPCOMING`, `ACTIVE`, `EXPIRING_SOON`, `EXPIRED`) n'est **pas** un
enum de base : il est dérivé à la lecture.

### Tables

| Table                            | Colonnes principales                                                                                                                                                                                                                                                                                                                                                             | Relations et index                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `insurance_policies`             | `id` uuid, `tenant_id`, `property_id`, `insurer`, `policy_number`, `coverage_type`, `start_date`, `end_date`, `annual_premium` decimal(14,2) nul, `currency` (`XOF`), `notes`, `document_id` nul, `created_by_user_id` nul, `created_at`, `updated_at`                                                                                                                           | `Tenant` et `Property` en cascade ; `PropertyDocument` en `SetNull` ; index `(tenant_id)`, `(tenant_id, property_id)`, `(tenant_id, end_date)`                                                                                                                                                                                                                     |
| `insurance_claims`               | `id` uuid, `tenant_id`, `property_id`, `policy_id` uuid, `ticket_id` uuid nul, `expense_id` uuid nul, `occurred_at`, `declared_at`, `cause`, `description`, `status` (`DECLARED`), `claimed_amount`, `indemnified_amount` nul, `deductible` nul (decimal(14,2)), `currency`, `rejection_reason` nul, cinq horodatages nuls, `created_by_user_id` nul, `created_at`, `updated_at` | `Tenant` et `Property` en cascade ; `InsurancePolicy` en **`NoAction`** (un `Restrict` immédiat ferait échouer la suppression en cascade d'un bien ou d'une agence ; le 409 de `deletePolicy` reste la protection) ; `MaintenanceTicket` et `PropertyExpense` en `SetNull` ; index `(tenant_id)`, `(tenant_id, status)`, `(tenant_id, property_id)`, `(policy_id)` |
| `insurance_claim_documents`      | `id` uuid, `tenant_id`, `claim_id` uuid, `document_id`, `kind`, `created_at`                                                                                                                                                                                                                                                                                                     | cascade depuis le sinistre, le document et l'agence ; **unique `(claim_id, document_id)`** ; index `(tenant_id)`, `(document_id)`                                                                                                                                                                                                                                  |
| `insurance_claim_status_history` | `id` uuid, `tenant_id`, `claim_id` uuid, `from_status` nul, `to_status`, `note` nul, `changed_by_user_id` nul, `changed_at`                                                                                                                                                                                                                                                      | cascade depuis le sinistre et l'agence ; index `(tenant_id)`, `(claim_id, changed_at)`                                                                                                                                                                                                                                                                             |
| `maintenance_log_entries`        | `id` uuid, `tenant_id`, `property_id`, `category`, `performed_at`, `vendor_id` uuid nul, `cost` decimal(14,2) nul, `currency`, `description`, `next_due_date` nul, `warranty_end_date` nul, `document_id` nul, `created_by_user_id` nul, `created_at`, `updated_at`                                                                                                              | `Tenant` et `Property` en cascade ; `MaintenanceVendor` et `PropertyDocument` en `SetNull` ; index `(tenant_id)`, `(tenant_id, property_id, performed_at)`, `(tenant_id, next_due_date)`, `(tenant_id, warranty_end_date)`                                                                                                                                         |

Notes :

- Le reste à charge n'a **aucune colonne** : calculé à la lecture (FR-012).
- Les contraintes métier (`endDate >= startDate`, montants >= 0, `occurredAt` pas dans le
  futur, indemnité <= réclamé) sont contrôlées par les schémas Zod et les services, pas par
  des `CHECK` SQL : elles dépendent de l'état ou de l'horloge.
- Les cinq modèles ont un `tenantId` direct : `schema-tenant-coverage.test.ts` n'a rien à
  déduire par relation ; `tenant-data-export.registry` les couvre.
- Les identifiants de bien, de document et d'agence sont du texte (comme les modèles
  voisins) ; ceux de police, sinistre, ticket, dépense et prestataire sont des `uuid`.

## Contrat d'API

Préfixe `/api/tenants/:tenantId/patrimoine`. Réponses `{ success: true, data }` (201 à la
création, 204 sans corps à la suppression) ; erreurs typées via `asyncHandler`. Montants en
`number`, dates en ISO 8601.

| Méthode | Chemin                                                   | Permission        | Corps / requête                                                                                                                | Réponse                                     |
| ------- | -------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| GET     | `/insurance/policies?propertyId=&status=`                | `PROPERTIES_VIEW` | `status` ∈ `UPCOMING`, `ACTIVE`, `EXPIRING_SOON`, `EXPIRED`                                                                    | liste de `InsurancePolicyDto`               |
| POST    | `/insurance/policies`                                    | `PROPERTIES_EDIT` | `{ propertyId, insurer, policyNumber, coverageType, startDate, endDate, annualPremium?, currency?, notes?, documentId? }`      | 201 `InsurancePolicyDto`                    |
| GET     | `/insurance/policies/:policyId`                          | `PROPERTIES_VIEW` |                                                                                                                                | `InsurancePolicyDto`                        |
| PATCH   | `/insurance/policies/:policyId`                          | `PROPERTIES_EDIT` | mêmes champs sauf `propertyId`, tous facultatifs (`documentId: null` pour délier)                                              | `InsurancePolicyDto`                        |
| DELETE  | `/insurance/policies/:policyId`                          | `PROPERTIES_EDIT` |                                                                                                                                | 204 ; 409 si sinistres                      |
| GET     | `/insurance/claims?propertyId=&status=&policyId=&limit=` | `PROPERTIES_VIEW` | `limit` 200 par défaut, 500 au plus ; tri `declaredAt` décroissant                                                             | liste de `InsuranceClaimDto`                |
| POST    | `/insurance/claims`                                      | `PROPERTIES_EDIT` | `{ propertyId, policyId, ticketId?, expenseId?, occurredAt, cause, description, claimedAmount, deductible? }`                  | 201 `InsuranceClaimDetailDto`               |
| GET     | `/insurance/claims/:claimId`                             | `PROPERTIES_VIEW` |                                                                                                                                | `InsuranceClaimDetailDto`                   |
| PATCH   | `/insurance/claims/:claimId`                             | `PROPERTIES_EDIT` | `description`, `cause`, `occurredAt`, `claimedAmount`, `deductible`, `ticketId`, `expenseId` (facultatifs)                     | `InsuranceClaimDetailDto` ; 409 si `CLOSED` |
| DELETE  | `/insurance/claims/:claimId`                             | `PROPERTIES_EDIT` |                                                                                                                                | 204 ; 409 si non `DECLARED`                 |
| POST    | `/insurance/claims/:claimId/status`                      | `PROPERTIES_EDIT` | `{ toStatus, note?, indemnifiedAmount?, deductible?, rejectionReason? }`                                                       | `InsuranceClaimDetailDto`                   |
| POST    | `/insurance/claims/:claimId/documents`                   | `PROPERTIES_EDIT` | `{ documentId, kind }`                                                                                                         | 201 liaison ; 409 doublon                   |
| DELETE  | `/insurance/claims/:claimId/documents/:linkId`           | `PROPERTIES_EDIT` |                                                                                                                                | 204                                         |
| GET     | `/maintenance-log?propertyId=&category=`                 | `PROPERTIES_VIEW` | `propertyId` **obligatoire**                                                                                                   | liste de `MaintenanceLogEntryDto`           |
| GET     | `/maintenance-log/export?propertyId=`                    | `PROPERTIES_VIEW` | déclarée **avant** toute route `/:entryId`                                                                                     | CSV (`Content-Disposition: attachment`)     |
| POST    | `/maintenance-log`                                       | `PROPERTIES_EDIT` | `{ propertyId, category, performedAt, description, vendorId?, cost?, currency?, nextDueDate?, warrantyEndDate?, documentId? }` | 201 `MaintenanceLogEntryDto`                |
| PATCH   | `/maintenance-log/:entryId`                              | `PROPERTIES_EDIT` | champs facultatifs sauf `propertyId`                                                                                           | `MaintenanceLogEntryDto`                    |
| DELETE  | `/maintenance-log/:entryId`                              | `PROPERTIES_EDIT` |                                                                                                                                | 204                                         |

Routes **réutilisées** (non modifiées) : `POST /tenants/:tenantId/properties/:id/documents`
(téléversement d'une pièce, type `INSURANCE` ou `OTHER`, renvoie le document) et
`GET …/properties/:id/documents/:documentId/file` (téléchargement).

### Erreurs

| Cas                                                                                                                                                                                                                                                                         | Statut |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Corps invalide, champ inconnu (dont `outOfPocketAmount`), dates incohérentes, montant négatif, indemnité > réclamé, `SETTLED` sans indemnité, `REJECTED` sans motif, `occurredAt` futur, `propertyId` absent du carnet                                                      | 400    |
| Référence d'une autre agence ou inexistante (bien, police, ticket, dépense, document, prestataire, sinistre, entrée, liaison, ticket ou dépense d'un autre bien)                                                                                                            | 404    |
| Police avec sinistres, sinistre non `DECLARED` à supprimer, sinistre `CLOSED` à modifier, doublon de pièce, transition hors matrice, conflit de statut concurrent, pièce ajoutée ou retirée sur un sinistre `CLOSED`, changement de devise d'une police ayant des sinistres | 409    |
| Droit insuffisant (`PROPERTIES_VIEW` ou `PROPERTIES_EDIT`)                                                                                                                                                                                                                  | 403    |

### DTO (JSON)

```text
InsurancePolicyDto { id, propertyId, propertyReference: string|null, insurer, policyNumber, coverageType,
  startDate, endDate, annualPremium: number|null, currency, notes: string|null, documentId: string|null,
  status: 'UPCOMING'|'ACTIVE'|'EXPIRING_SOON'|'EXPIRED', daysToExpiry: number, claimsCount: number,
  createdAt, updatedAt }
InsuranceClaimDto { id, propertyId, propertyReference: string|null, policyId, policyLabel: string /* « Assureur · n° police » */,
  ticketId: string|null, ticketTitle: string|null, expenseId: string|null, occurredAt, declaredAt, cause,
  description, status, claimedAmount: number, indemnifiedAmount: number|null, deductible: number|null,
  outOfPocketAmount: number|null /* calculé ; null avant SETTLED, REJECTED, CLOSED */, currency,
  rejectionReason: string|null, insurerNotifiedAt, expertiseAt, settledAt, rejectedAt, closedAt (ISO|null),
  allowedNextStatuses: InsuranceClaimStatus[], documentsCount: number, createdAt, updatedAt }
InsuranceClaimDetailDto = InsuranceClaimDto & {
  documents: { id /* linkId */, documentId, kind, fileName, mimeType: string|null, createdAt }[],
  history: { id, fromStatus: Status|null, toStatus: Status, note: string|null, changedAt,
             changedByName: string|null }[] }
MaintenanceLogEntryDto { id, propertyId, category, performedAt, vendorId: string|null, vendorName: string|null,
  cost: number|null, currency, description, nextDueDate: string|null, warrantyEndDate: string|null,
  documentId: string|null, createdAt, updatedAt }
```

`changedByName` vient d'un `select` explicite `{ id, fullName }` sur `User`, jamais de
l'objet complet. Aucune réponse ne contient de chemin de fichier.

### Garde d'isolation

Toute référence (`propertyId`, `policyId`, `ticketId`, `expenseId`, `documentId`,
`vendorId`, `claimId`, `entryId`, `linkId`) est vérifiée par agence **avant** lecture ou
écriture : `getPropertyForTenant` pour les biens, `assertBelongsToTenant`
(`tenantField: 'tenant_id'` pour `maintenanceTicket` et `maintenanceVendor`) pour le reste ;
les documents et dépenses sont aussi contrôlés contre **le même bien**. L'identifiant d'URL
d'un sinistre, d'une police ou d'une entrée est cherché avec `{ id, tenantId }`. Toutes les
requêtes portent `tenantId`.

### Matrice de transitions

| De                 | Vers                                 | Effet                                                                        |
| ------------------ | ------------------------------------ | ---------------------------------------------------------------------------- |
| `DECLARED`         | `INSURER_NOTIFIED`                   | pose `insurerNotifiedAt`                                                     |
| `INSURER_NOTIFIED` | `EXPERTISE`                          | pose `expertiseAt`                                                           |
| `INSURER_NOTIFIED` | `SETTLED` (raccourci, point ouvert)  | pose `settledAt` ; `indemnifiedAmount` obligatoire                           |
| `INSURER_NOTIFIED` | `REJECTED` (raccourci, point ouvert) | pose `rejectedAt` ; `rejectionReason` obligatoire ; indemnité forcée à 0     |
| `EXPERTISE`        | `SETTLED`                            | pose `settledAt` ; `indemnifiedAmount` obligatoire (0 <= montant <= réclamé) |
| `EXPERTISE`        | `REJECTED`                           | pose `rejectedAt` ; `rejectionReason` obligatoire ; indemnité forcée à 0     |
| `SETTLED`          | `CLOSED`                             | pose `closedAt`                                                              |
| `REJECTED`         | `CLOSED`                             | pose `closedAt`                                                              |
| `CLOSED`           | (aucune)                             | sinistre figé                                                                |

## Alertes

- `alertExpiringInsurancePolicies(tenantId, { daysAhead = 30, now })` : polices dont
  `endDate` est dans [`now`, `now + daysAhead`] ; `KIND = POLICY`.
- `alertMaintenanceDeadlines(tenantId, { daysAhead = 30, now })` : entrées dont
  `nextDueDate` (`KIND = DUE`, « prochaine échéance ») ou `warrantyEndDate`
  (`KIND = WARRANTY`, « fin de garantie ») est dans la fenêtre.
- `runInsuranceAlerts(tenantId, { now })` : agrège les deux, renvoie
  `{ matched, sent, skippedNoRecipient, skippedAlreadySent, failed }`.
- Patron de `alertLoanMaturity` : destinataires = administrateurs actifs (`TENANT_ADMIN`),
  repli `Tenant.contactEmail` ; e-mail via `emailService` ; valeurs HTML échappées
  (`escapeHtml` et `applyTemplate` de `notification-channels.ts`) ; anti-doublon par
  `AuditLog` (`entityType` + `entityId` = `${id}::${KIND}::${YYYY-MM-DD}`) avec vidange
  (`flush`) immédiate après chaque écriture ; marques `PATRIMOINE_INSURANCE_POLICY_ALERT_SENT`
  (polices) et `PATRIMOINE_MAINTENANCE_DUE_ALERT_SENT` (entretien).
- Une seule clé `INSURANCE_DEADLINE_ALERT`, variables `{{alertTitle}}`, `{{itemLabel}}`,
  `{{propertyReference}}`, `{{dueDate}}` ; événement désactivé pour l'agence : rien envoyé,
  rien marqué.
- Pas de routeur de canaux (lot 031) : destinataires internes, sans consentement CRM ; pas de
  WhatsApp. Le choix est écrit en tête de `insurance-alerts.ts`.
- Déclenchement : `jobs/document-expiry-alert-job.ts` (cron quotidien existant), une ligne
  ajoutée ; aucun nouveau job, aucune nouvelle variable d'environnement.

## Écrans

| Écran                                                    | Contenu                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onglet « Assurances et sinistres » (fiche d'un bien)     | liste des polices avec pastille de statut dérivé et jours restants ; liste des sinistres du bien ; ajout et modification d'une police ; déclaration d'un sinistre ; tiroir de détail d'un sinistre avec `ClaimStatusTimeline`, pièces (rattacher un document existant ou en téléverser un) et boutons limités à `allowedNextStatuses` ; reste à charge affiché à partir de `SETTLED`, `REJECTED`, `CLOSED` |
| Formulaire de changement de statut                       | note facultative ; montant indemnisé et franchise pour « Indemnisé » ; motif pour « Refusé » ; confirmation avant clôture                                                                                                                                                                                                                                                                                  |
| Onglet « Carnet d'entretien »                            | liste chronologique, filtre par catégorie, ajout, modification, suppression, bouton « Exporter en CSV », mise en évidence des échéances et garanties proches                                                                                                                                                                                                                                               |
| Page « Sinistres » `/tenant/:tenantId/patrimoine/claims` | tableau de tous les sinistres de l'agence, regroupement ou filtres par statut, bien et police ; lien vers la fiche du bien ; lecture seule sans `PROPERTIES_EDIT`                                                                                                                                                                                                                                          |

Tous les boutons d'écriture sont masqués ou désactivés sans `PROPERTIES_EDIT` ; le serveur
reste l'autorité (403). Aucun texte hors `t()`.

## i18n

- Texte français = clé : libellés des statuts de police et de sinistre, des causes, des types
  de couverture, des natures de pièce, des catégories d'entretien, des messages d'erreur
  affichés, des titres d'onglets et de la page, des colonnes et de l'export.
- Côté API : nouveau gabarit e-mail `INSURANCE_DEADLINE_ALERT` (fr, en, ar) ; en-têtes du CSV
  (français, colonnes fixes) ; test `notification-catalogs.accents` pour les accents.
- `npm run i18n:extract` dans `apps/web` et `packages/api` : lancé par le coordinateur, qui
  reporte les traductions en et ar. Les agents enveloppent les textes avec `t()` sans lancer
  l'extraction.
- Marges et alignements en propriétés logiques (`ms-`, `me-`, `margin-inline-start`,
  `align: 'end'`).

## Tests

| Domaine                     | Cas                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim-status` (unit)       | toute la matrice : chaque couple (de, vers) de 6 × 6 ; `allowedNextStatuses` par statut ; `CLOSED` sans issue                                                                                                                                                                                                                                                                                                                                                             |
| `policy-status` (unit)      | veille, jour même, lendemain de la fin ; J-30 et J-31 ; début demain (`UPCOMING`) ; `daysToExpiry`                                                                                                                                                                                                                                                                                                                                                                        |
| `computeOutOfPocket` (unit) | jamais négatif ; pas d'erreur d'arrondi flottant (centimes) ; `null` d'indemnité traité comme 0                                                                                                                                                                                                                                                                                                                                                                           |
| Schémas Zod (unit)          | `.strict()` : `outOfPocketAmount`, `tenantId`, `createdByUserId`, `indemnifiedAmount` en PATCH rejetés ; dates `YYYY-MM-DD` et ISO ; devise 3 lettres majuscules                                                                                                                                                                                                                                                                                                          |
| Polices (API)               | création et liste avec statut dérivé ; `endDate < startDate` = 400 ; suppression avec sinistres = 409 ; `documentId` d'un autre bien ou d'une autre agence = 404                                                                                                                                                                                                                                                                                                          |
| Sinistres (API)             | création (`DECLARED`, première ligne d'historique, audit) ; chaque transition valide (champ horodaté, historique, audit, une transaction) ; transitions invalides ; `SETTLED` sans montant = 400 ; `REJECTED` sans motif = 400 ; reste à charge à `SETTLED`, `REJECTED`, `CLOSED` et `null` avant ; `PATCH` d'un sinistre `CLOSED` = 409 ; `claimed < indemnified` = 400 ; suppression non `DECLARED` = 409 ; course sur le statut = 409 ; aucune `PropertyExpense` créée |
| Pièces (API)                | rattachement ; doublon = 409 ; document d'un autre bien ou d'une autre agence = 404 ; retrait de la liaison sans suppression du document                                                                                                                                                                                                                                                                                                                                  |
| Isolation (API)             | test paramétré : bien, police, ticket, dépense, document, prestataire, sinistre, entrée, liaison d'une autre agence = même 404 qu'un inexistant ; ticket ou dépense d'un autre bien de la même agence = 404                                                                                                                                                                                                                                                               |
| Permissions (API)           | 403 sans `PROPERTIES_VIEW` en lecture, sans `PROPERTIES_EDIT` en écriture et en transition                                                                                                                                                                                                                                                                                                                                                                                |
| Carnet et CSV (unit + API)  | tri `performedAt` puis `createdAt` décroissants ; `propertyId` obligatoire (400) ; BOM, séparateur `;`, colonnes fixes ; neutralisation de `=`, `+`, `-` et `@` ; guillemets et points-virgules dans une cellule ; `Content-Disposition` ; route `export` avant `/:entryId` ; échéances antérieures à l'intervention = 400                                                                                                                                                |
| Alertes (unit)              | police et échéances dans la fenêtre ; hors fenêtre ignorées ; 2e passage = 0 envoi ; événement désactivé = rien envoyé ni marqué ; aucun destinataire = `skippedNoRecipient` ; HTML échappé ; compteurs de `runInsuranceAlerts`                                                                                                                                                                                                                                           |
| Job (unit)                  | `runInsuranceAlerts` appelé pour chaque agence ; l'échec d'une agence n'arrête pas les suivantes (comportement existant conservé)                                                                                                                                                                                                                                                                                                                                         |
| Inventaire                  | `routes-inventory.test.ts`, `route-features`, `schema-tenant-coverage.test.ts`, `tenant-data-export.registry`, `notification-catalogs.accents`                                                                                                                                                                                                                                                                                                                            |
| Isolation de bout en bout   | `npm run test:isolation` : sinistre ou police de l'agence A lus, modifiés et supprimés avec le contexte de l'agence B                                                                                                                                                                                                                                                                                                                                                     |
| Web                         | onglets : affichage des statuts dérivés, boutons de transition limités à `allowedNextStatuses`, formulaire « Indemnisé » (montant obligatoire) et « Refusé » (motif obligatoire), reste à charge, rattachement de pièce, export CSV ; page « Sinistres » : filtres et lecture seule sans droit d'écriture                                                                                                                                                                 |

Les tests ciblent les fichiers du lot (un seul Jest ou Vitest à la fois sur ce poste lent) ;
un échec par délai se rejoue seul avant tout diagnostic.

## Définition de fini

Tests ciblés verts, `typecheck` sans nouvelle erreur, lint, `check:architecture`,
`test:isolation`, `routes-inventory`, `route-features`, `schema-tenant-coverage`,
`tenant-data-export.registry`, `notification-catalogs.accents`, `measure:entry` sans
dégradation, relecture `code-reviewer` et `security-auditor` (isolation par agence, fichiers
privés, injection dans le CSV), `DATA_MODELS.md` à jour pour les cinq modèles,
`npm run i18n:extract` (fr clé, en, ar), wiki des fonctionnalités + `npm run wiki:export`
par le coordinateur, `HANDOFF.md` par le coordinateur.

## Sous-fonctionnalités à ajouter au wiki (pour le coordinateur)

Fonctionnalité « Patrimoine » (ou « Gestion des biens » selon le classeur) :

- Polices d'assurance d'un bien : création, modification, suppression, statut dérivé
  (à venir, active, expire bientôt, échue).
- Déclaration d'un sinistre et suivi par statuts (déclaré, assureur prévenu, expertise,
  indemnisé, refusé, clos) avec historique horodaté.
- Pièces d'un sinistre (devis, rapport d'expert, courrier de l'assureur, photos, facture) et
  reste à charge calculé.
- Carnet d'entretien d'un bien : liste chronologique, ajout, modification, suppression,
  export CSV.
- Page d'ensemble « Sinistres » et entrée de menu « Sinistres ».
- Alertes e-mail : fin de police, prochaine échéance d'entretien, fin de garantie
  (événement `INSURANCE_DEADLINE_ALERT`).
- Routes API : `GET/POST/PATCH/DELETE …/patrimoine/insurance/policies`,
  `GET/POST/PATCH/DELETE …/patrimoine/insurance/claims`,
  `POST …/insurance/claims/:id/status`, `POST/DELETE …/insurance/claims/:id/documents`,
  `GET/POST/PATCH/DELETE …/patrimoine/maintenance-log`, `GET …/maintenance-log/export`.
- Aucune permission ni fonctionnalité d'abonnement nouvelle (`PROPERTIES_VIEW`,
  `PROPERTIES_EDIT`, `PATRIMOINE`).

## Points ouverts

- **Raccourci sans expertise** : `INSURER_NOTIFIED` vers `SETTLED` ou `REJECTED` est autorisé
  (petits sinistres réglés sur dossier). Le supprimer imposerait une expertise systématique ;
  à trancher avec le métier. La table unique de `claim-status.ts` rend le changement trivial.
- **Période de la police** : pas de contrôle que `occurredAt` tombe entre `startDate` et
  `endDate` (avenants, déclaration tardive, police renouvelée). À décider.
- **Routeur de canaux (#92)** non appliqué : destinataires internes, pas de consentement CRM.
- **Pas de PDF** du carnet d'entretien : CSV uniquement.
- **Une seule clé e-mail** `INSURANCE_DEADLINE_ALERT` pour les trois alertes : pas de
  désactivation séparée par agence ; **pas de clé WhatsApp**.
- **Statut dérivé et filtre** : le filtre `status` des polices est appliqué après lecture
  (statut non stocké) ; acceptable tant que le nombre de polices par agence reste modeste.
  Un index sur les dates et un filtre SQL équivalent seraient à prévoir au-delà.
- **Lecture du fichier d'une pièce** : passe par la route existante des documents de bien,
  donc par ses permissions ; un utilisateur sans accès aux documents du bien voit la liaison
  mais ne peut pas télécharger le fichier.
- **Franchise** : informative, sans effet sur le reste à charge.

## Risques

- **Fichiers très partagés** : `schema.prisma`, `app.ts`, `routes-inventory.test.ts`,
  `notification-key-features.ts`, `email-notification-*`, `document-expiry-alert-job.ts`,
  `PropertyDetail.tsx`, `navigation/*`, catalogues i18n, wiki. Intégrer par couche, jamais en
  parallèle sur le même fichier.
- **Client Prisma généré** : le schéma et la migration sont posés par le coordinateur avant les
  agents ; la base jetable `ass` sert aux tests, jamais une autre base.
- **Statut dérivé et fuseau** : comparer des jours calendaires UTC, pas des instants, pour
  éviter un décalage d'un jour autour de minuit ; couvert par les tests aux bornes.
- **Calcul monétaire** : `Decimal` de Prisma vers `number` seulement à la sortie du DTO ; le
  calcul du reste à charge se fait avant, en centimes entiers ou en `Decimal`.
- **Injection CSV** : les descriptions et noms de prestataires sont saisis par des
  utilisateurs ; la neutralisation s'applique à toute cellule, pas seulement aux colonnes
  « libres ».
- **Course sur le statut** : la mise à jour conditionnelle doit rester dans la même
  transaction que l'écriture de l'historique et de l'audit ; sinon une transition perdue
  laisserait une ligne d'historique orpheline.
- **Faux positifs d'alerte** : le marquage anti-doublon est écrit et vidangé immédiatement
  après l'envoi ; un échec d'envoi ne marque pas, de sorte que l'alerte est retentée au
  passage suivant.
