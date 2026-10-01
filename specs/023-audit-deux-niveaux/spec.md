# Spécification 023 — Journal d'audit à deux niveaux

> Décision d'architecture :
> [ADR-006](../../docs/architecture/adr/ADR-006-audit-deux-niveaux.md).
> Cette spec décrit le contrat ; l'ADR en donne les raisons.

## 1. Objectif

Tracer qui a fait quoi, quand et d'où, à deux niveaux :

- **Agence (tenant)** : un administrateur d'agence consulte le journal de **son**
  agence, et uniquement les événements qui lui sont destinés.
- **Plateforme (global)** : le super-administrateur consulte tout — toutes les
  agences, plus les actions propres à la plateforme (connexion super-admin,
  catalogue, réglage IA, facturation interne).

## 2. Vocabulaire

| Terme              | Sens                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `scope`            | `TENANT` : l'événement concerne une agence (`tenantId` obligatoire). `PLATFORM` : action de plateforme, `tenantId` facultatif. |
| `visibility`       | `TENANT` : lisible par l'agence concernée. `PLATFORM_ONLY` : réservé à la plateforme.                                          |
| `category`         | `AUTH`, `DATA`, `ADMIN`, `SECURITY`, `BILLING`, `EXPORT`, `AI`, `SYSTEM`.                                                      |
| `outcome`          | `SUCCESS`, `FAILURE`, `DENIED`.                                                                                                |
| `actorType`        | `USER`, `SUPER_ADMIN`, `PORTAL`, `SYSTEM`, `AI`.                                                                               |
| événement critique | Écrit dans la transaction métier : pas de commit sans trace.                                                                   |

## 3. Modèle de données

Table `audit_logs` (colonnes existantes inchangées), colonnes ajoutées :

| Colonne       | Type                   | Défaut          | Rôle                                           |
| ------------- | ---------------------- | --------------- | ---------------------------------------------- |
| `scope`       | enum `AuditScope`      | `PLATFORM`      | Niveau de l'événement                          |
| `visibility`  | enum `AuditVisibility` | `PLATFORM_ONLY` | Qui peut le lire                               |
| `category`    | enum `AuditCategory`   | `DATA`          | Famille d'action                               |
| `outcome`     | enum `AuditOutcome`    | `SUCCESS`       | Résultat                                       |
| `actor_type`  | enum `AuditActorType`  | `USER`          | Nature de l'acteur                             |
| `actor_label` | text null              | —               | Nom/e-mail de l'acteur au moment de l'action   |
| `request_id`  | text null              | —               | Regroupe les événements d'une même requête     |
| `source`      | text null              | —               | `http`, `job`, `script`, `ai`                  |
| `changes`     | jsonb null             | —               | `{ champ: { before, after } }`, champs rédigés |

Contrainte : `CHECK (scope = 'PLATFORM' OR tenant_id IS NOT NULL)`.

Index ajoutés : `(tenant_id, visibility, created_at DESC)`,
`(scope, created_at DESC)`, `(request_id)`.

Immuabilité : déclencheur `audit_logs_immutable` (`BEFORE UPDATE OR DELETE`),
qui lève une exception, sauf dans une session où `app.audit_purge = 'on'`
(posé uniquement par la fonction de purge de la phase 5).

**Rattrapage des lignes existantes** : `scope = TENANT` si `tenant_id` n'est pas
nul, sinon `PLATFORM` ; `visibility = TENANT` sauf pour les actions du
catalogue marquées `PLATFORM_ONLY` ; `category` d'après le préfixe de
`action_key`.

## 4. Catalogue des actions

`packages/api/src/types/audit-catalog.ts` : `Record<AuditActionKey, AuditCatalogEntry>`.

```ts
interface AuditCatalogEntry {
  category: AuditCategory;
  visibility: AuditVisibility; // défaut quand l'appelant n'en donne pas
  critical?: boolean; // à écrire via recordAuditEvent(tx, …)
  redact?: string[]; // clés de payload/changes à masquer
}
```

Une clé de type `string` libre reste acceptée par `logAuditEvent` (compatibilité,
`AuditLogEntry.actionKey: AuditActionKey | string`) ; elle reçoit la valeur par
défaut `category = DATA`, `visibility = PLATFORM_ONLY` — fermée par défaut.

Test : `__tests__/unit/audit-catalog.test.ts` échoue si une valeur de
`AuditActionKey` n'a pas d'entrée, si une clé écrite en chaîne littérale
(`actionKey: 'XXX'`) n'est pas au catalogue, ou si le rattrapage SQL de la
migration diverge du catalogue. Le catalogue couvre les 130 clés en usage, dont
44 qui circulaient en chaîne libre avant l'ADR.

## 5. Contexte de requête

`RequestContextData` (`utils/request-context.ts`) devient :

```ts
{ ip, userAgent, requestId, actor?: { userId, type, tenantId?, label? } }
```

- `requestContextMiddleware` génère `requestId` (UUID) ; l'en-tête
  `X-Request-Id` entrant n'est **pas** repris tel quel s'il dépasse 64
  caractères ou sort de `[A-Za-z0-9._-]`.
- `authenticate` renseigne `actor.userId` (via `setAuditActor`).
- `requireTenantAccess` renseigne `actor.tenantId` ; un super-admin agissant
  sur une agence a `actor.type = SUPER_ADMIN`.
- `logAuditEvent` complète `actorUserId`, `tenantId`, `requestId`, `actorType`
  depuis ce contexte quand l'appelant ne les fournit pas. **Une valeur fournie
  par l'appelant l'emporte toujours** (connexion échouée : pas encore d'acteur).

## 6. Écriture

- `logAuditEvent(entry): void` — inchangé pour l'appelant, enrichi, file en
  mémoire. La file est plafonnée (`AUDIT_QUEUE_MAX = 10 000`) : au-delà, les
  plus anciens sont écartés avec un `logger.error` (aujourd'hui elle peut croître
  sans limite si la base est indisponible).
- `recordAuditEvent(tx, entry): Promise<void>` — écrit via le client de la
  transaction fournie ; une erreur d'écriture fait échouer la transaction.
- Arrêt : `audit-service` enregistre `flushAuditEvents` dans le registre de
  crochets d'arrêt (`utils/shutdown-hooks.ts`), exécuté par
  `disconnectDatabase()` **avant** `$disconnect()`. Plus de `process.exit` dans
  `audit-service`.

### Phase 3 : accès, authentification, actions critiques, avant/après

- **Accès** (`middleware/audit-access-middleware.ts`, monté une fois dans
  `app.ts`) : observe la **réponse**, pas la route, donc couvre toutes les routes
  et les portails.
  - 403 → `ACCESS_DENIED` (visible de l'agence du membre), ou
    `TENANT_ACCESS_DENIED` quand l'utilisateur vise l'URL d'une agence dont il
    n'est pas membre : écrit **sans agence** (`PLATFORM_ONLY`), pour ne pas
    révéler son identité à l'agence visée ni polluer une agence inexistante. Les
    403 commerciaux (`TENANT_SUSPENDED`, `SUBSCRIPTION_READ_ONLY`,
    `MODULE_NOT_INCLUDED`, `MODULE_READ_ONLY`, `QUOTA_EXCEEDED`,
    `OWN_ASSETS_ONLY`) ne sont pas des refus de droit. Anti-inondation : un même
    refus = une ligne par minute, 30 refus par minute et par utilisateur.
  - 200 avec un PDF, un Word, un CSV, un classeur, une archive ou un
    `Content-Disposition: attachment` → `DOCUMENT_DOWNLOADED`, ou
    `DATA_EXPORTED` (CSV, classeur, archive), avec le chemin normalisé (UUID
    remplacés par `:id`), l'objet visé et le nom du fichier. L'export de données
    d'agence (`/data-exports`) a ses propres événements et n'est pas doublé.
- **Authentification** (`services/audit-auth-events.ts`) : une connexion n'a
  pas d'agence ; chaque événement (`AUTH_LOGIN_SUCCEEDED`, `AUTH_LOGIN_FAILED`,
  `AUTH_LOGOUT`, `AUTH_TOKEN_REUSE_DETECTED`, `AUTH_PASSWORD_RESET_COMPLETED`)
  s'écrit **une fois par agence active** de l'utilisateur (membre actif ou
  client de portail, 10 au plus) ; sans agence, une ligne de plateforme. Les deux
  derniers sont écrits dans la transaction de leur effet. Non câblés à ce jour :
  `AUTH_GOOGLE_LOGIN`, `AUTH_TOKEN_REFRESHED`, `AUTH_PASSWORD_RESET_REQUESTED`,
  `AUTH_EMAIL_VERIFIED`, et l'échec de connexion d'un e-mail inconnu.
- **Actions critiques** : 30 des actions marquées `critical` s'écrivent par
  `recordAuditEvent(tx, …)` dans la transaction de leur effet (membres et rôles,
  agences, abonnements et dérogations, réglage IA, export de données demandé,
  factures, mandats, biens, baux, dépôts, pénalités, portail copropriétaire,
  fonds de copropriété, suppressions de contact, de modèle et de prestataire).
  Exceptions assumées : `AI_ACTION_EXECUTED` (le document est écrit par
  `generateDocument`, qui prend ses propres connexions et écrit sur disque : à
  traiter avec une refonte de ce générateur) ; `TENANT_DATA_EXPORT_DOWNLOADED`
  n'est plus marqué critique (un fichier servi, aucune écriture à rendre
  atomique) ; `ROLE_REMOVED` est marqué critique mais n'est écrit nulle part
  (le retrait d'un rôle passe par `ROLE_ASSIGNED`, qui remplace l'ensemble).
- **Avant/après** : `lib/audit/changes.ts` (`diffForAudit(avant, modifications)`)
  remplit `changes` ; branché sur les affaires CRM, les contacts, les biens, les
  baux et les pénalités. L'extension Prisma automatique n'est pas retenue (voir
  l'ADR). Les champs sensibles des contacts (notes internes, salaire, pièce
  d'identité) sont exclus de `changes`.
- **Catalogue** : `CRM_DEAL_UPDATED` et `CRM_DEAL_STAGE_CHANGED` (écrites par une
  variable, oubliées du premier catalogue) y entrent ; la migration
  `20261007110000` rattrape leurs lignes historiques en suspendant le
  déclencheur d'immuabilité le temps du correctif — l'unique exception.

## 7. Lecture (phases 2 et 4)

| Niveau     | Route                              | Garde                                                        | Filtre forcé                                       |
| ---------- | ---------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| Agence     | `GET /api/tenants/:tenantId/audit` | `authenticate` + `requireTenantAccess` + `TENANT_AUDIT_VIEW` | `tenantId` de l'URL vérifié, `visibility = TENANT` |
| Plateforme | `GET /api/admin/audit`             | `PLATFORM_TENANTS_VIEW` (`PLATFORM_AUDIT_VIEW` en phase 4)   | aucun, `tenantId` optionnel                        |

### Niveau agence (phase 2, livré)

- **Lecteur unique** : `services/audit-read-service.ts` (`getTenantAuditLogs`).
  `tenantId` est un paramètre séparé de `filters`, qui n'a aucun champ
  `tenantId` ni `visibility` : rien à écraser. `AuditLog` reste exempté de
  l'extension de garde tenant ; l'étanchéité repose sur ce module et sur son
  test de bout en bout (`__tests__/integration/isolation.test.ts`, bloc
  « Journal d'activité »).
- **Paramètres** (`lib/audit/tenant-audit-schemas.ts`, `.strict()`) :
  `category`, `outcome`, `actionKey`, `actorUserId`, `entityType`, `entityId`,
  `startDate`, `endDate` (AAAA-MM-JJ, bornes incluses, `endDate` jusqu'à
  23:59:59.999 UTC), `cursor`, `limit` (1 à 100, 50 par défaut). Tout autre
  paramètre — `tenantId`, `visibility`, `scope` — est refusé en 400.
- **Réponse** : `{ success, data: { logs[], nextCursor } }`. Pagination par
  curseur opaque `(createdAt, id)` ; `nextCursor` est nul à la dernière page ;
  tri `createdAt DESC, id DESC`, servi par l'index
  `(tenant_id, visibility, created_at DESC)`.
- **Personnel de la plateforme** : une ligne dont `actorType = SUPER_ADMIN`
  est renvoyée sans identité, sans `actorLabel`, sans IP ni navigateur ; le
  web affiche « Support ImmoTopia ».
- **Libellés de ressource** : `enrichAuditLogsWithResourceLabels(logs,
tenantId)` borne chaque requête à l'agence (sans cela, la garde Prisma
  signalerait des requêtes sans filtre d'agence, et une ligne dont
  l'`entityId` désigne l'objet d'une autre agence en afficherait le libellé).
  Un `entityId` qui n'est pas un UUID est écarté pour les quatre modèles à
  identifiant UUID natif, et un échec de résolution ne fait jamais échouer le
  journal : les libellés sont cosmétiques.
- **Abonnement** : `/audit` est classé `CORE` dans
  `lib/subscription/route-features.ts` (lecture seule, jamais bloquée par un
  module non souscrit).
- **Audit de l'audit** : la première page d'une consultation (sans `cursor`)
  écrit `AUDIT_VIEWED` (`SECURITY`, `PLATFORM_ONLY`, filtres sans `cursor` ni
  `limit`) ; « charger plus » n'en écrit pas.
- **Permission** : `TENANT_AUDIT_VIEW`, attribuée à `TENANT_ADMIN` et
  `PLATFORM_SUPER_ADMIN` seulement (`prisma/seeds/audit-permissions-seed.ts`,
  migration `20261007100000_audit_tenant_permission`). Ni gestionnaire, ni
  agent, ni comptable ; un rôle personnalisé la reçoit explicitement.
- **Web** : page « Journal d'activité » (`/tenant/:tenantId/activity`), entrée
  du groupe « Agence », réservée à `TENANT_AUDIT_VIEW`.

### Niveau plateforme (phase 4)

Pagination par curseur, `PLATFORM_AUDIT_VIEW` / `PLATFORM_AUDIT_EXPORT`,
consulter ou exporter écrit `AUDIT_VIEWED` / `AUDIT_EXPORTED`.

## 8. Plan et état

| Phase | Contenu                                                                                            | État    |
| ----- | -------------------------------------------------------------------------------------------------- | ------- |
| 0     | ADR-006 et cette spec                                                                              | fait    |
| 1     | Migration, catalogue, contexte, écriture critique (capacité), arrêt propre, contrôleur             | fait    |
| 2     | Route et page « Journal d'activité » côté agence, permission `TENANT_AUDIT_VIEW`, test d'isolation | à faire |
| 3     | Événements de sécurité (403, exports, téléchargements, portails), capture avant/après ciblée       | fait    |
| 4     | Console plateforme (filtres, `requestId`, export audité), `PLATFORM_AUDIT_*`                       | à faire |
| 5     | Rétention, scellés, séparation des marqueurs anti-doublon                                          | à faire |
