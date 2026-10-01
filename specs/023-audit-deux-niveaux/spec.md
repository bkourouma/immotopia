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

## 7. Lecture (phases 2 et 4)

| Niveau     | Route                              | Garde                                       | Filtre forcé                                       |
| ---------- | ---------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| Agence     | `GET /api/tenants/:tenantId/audit` | `requireTenantAccess` + `TENANT_AUDIT_VIEW` | `tenantId` de l'URL vérifié, `visibility = TENANT` |
| Plateforme | `GET /api/admin/audit`             | `PLATFORM_AUDIT_VIEW`                       | aucun, `tenantId` optionnel                        |

Pagination par curseur `(createdAt, id)`. Consulter ou exporter écrit
`AUDIT_VIEWED` / `AUDIT_EXPORTED` (catégorie `SECURITY`, `PLATFORM_ONLY`).

## 8. Plan et état

| Phase | Contenu                                                                                            | État    |
| ----- | -------------------------------------------------------------------------------------------------- | ------- |
| 0     | ADR-006 et cette spec                                                                              | fait    |
| 1     | Migration, catalogue, contexte, écriture critique (capacité), arrêt propre, contrôleur             | fait    |
| 2     | Route et page « Journal d'activité » côté agence, permission `TENANT_AUDIT_VIEW`, test d'isolation | à faire |
| 3     | Événements de sécurité (403, exports, téléchargements, portails), capture avant/après ciblée       | à faire |
| 4     | Console plateforme (filtres, `requestId`, export audité), `PLATFORM_AUDIT_*`                       | à faire |
| 5     | Rétention, scellés, séparation des marqueurs anti-doublon                                          | à faire |
