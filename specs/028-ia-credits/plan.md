# Plan — facturation des crédits IA d'ImmoCopilot

**Spécification** : [spec.md](./spec.md) · **Modèle** : [data-model.md](./data-model.md) ·
**API** : [contracts/openapi.yaml](./contracts/openapi.yaml) · **Tâches** : [tasks.md](./tasks.md)
**Date** : 2026-09-29 · **Base** : `main` `6c454886` · **Statut** : proposition, aucun code écrit

## 1. Résumé

L'assistant devient mesurable, puis facturable, sans nouveau moteur de
facturation : une **table d'usage** écrite à la fin de chaque requête (lot A),
un **portefeuille de crédits à lots et journal en ajout seul** avec
**réservation atomique** avant l'appel au modèle (lot B), et trois flux qui
réutilisent les factures, les paiements et le catalogue existants — **packs**
comme extensions du catalogue (lot C), **dépassement** comme facture mensuelle
séparée (lot D), **recharge** comme facture réglée puis crédits (lot E).

Le plan suit les motifs déjà en place : `withTransactionalAdvisoryLock`
(`lib/ai/advisory-lock.ts`) pour la concurrence, `platform-invoice-service.ts`
et `platform-payment-service.ts` pour les factures et le règlement,
`subscription-usage-job.ts` pour la tâche planifiée et les alertes,
`addSubscriptionItem` et `changePack` pour les packs, la garde du palier gratuit
de la spec 026 pour un contrôle indépendant de `SUBSCRIPTION_ENFORCEMENT`.

## 2. Contexte technique

| Élément            | Choix                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack              | TypeScript 5, Express 4, Prisma 5, PostgreSQL ; React 18, Ant Design, Vite (monorepo npm workspaces) ; SDK `@anthropic-ai/sdk` 0.129.0 (`packages/api/package.json:59`).                                                                                                                                                                                            |
| Tests              | Jest côté API (`packages/api/__tests__/{unit,api,integration}`), Vitest côté web ; `npm run test:isolation` (base `DATABASE_URL_TEST`) pour la concurrence et l'étanchéité. Les tests de l'orchestrateur simulent Prisma et l'audit (`__tests__/unit/ai.orchestrator.test.ts:25-44`) : l'orchestrateur ne doit donc **pas** importer de service de base de données. |
| Contraintes AGENTS | `tenantId` sur tout modèle et vérification de chaque identifiant reçu (`assertBelongsToTenant`) ; erreurs typées de `middleware/error-middleware` ; jamais de `include: { user: true }` ; `t()` avec le texte français comme clé ; propriétés CSS logiques ; **aucune variable d'environnement nouvelle**.                                                          |
| SQL brut           | Les requêtes `$queryRaw` de la réservation **contournent** l'extension Prisma de garde d'agence (`TENANT_GUARD_MODE`) : elles filtrent `tenant_id` à la main (FR-019).                                                                                                                                                                                              |
| Dates              | Jours et mois **UTC**, comme le reste des abonnements (`utcDay`, `subscription-usage-job.ts:75`) ; module pur `lib/ai/billing/ai-period.ts`.                                                                                                                                                                                                                        |
| Argent             | FCFA entiers HT (`roundFcfa`, `lib/subscription/pricing.ts:56`) ; TVA `PLATFORM_TAX_RATE_PERCENT` (`catalog.ts:63`) ; coûts fournisseur en dollars (`Decimal(14, 6)`).                                                                                                                                                                                              |
| Paiement           | PaySecureHub, mode `PLATFORM_PAYSECUREHUB_MODE` (`SIMULATOR` par défaut, `config/env.ts:108`) ; jamais de crédit sur la parole d'un IPN.                                                                                                                                                                                                                            |

## 3. Contrôle de conformité au dépôt (AGENTS.md)

| Règle                  | Application                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation multi-tenant | Chaque route d'agence : `authenticate`, `requireTenantAccess`, garde de permission. Les huit modèles : cinq portent `tenantId`, trois sont classés `GLOBAL_MODELS` (`schema-tenant-coverage.test.ts:61`). Tout identifiant reçu (`itemId`, `invoiceId`, `userId`) est vérifié par `assertBelongsToTenant`. Le contexte d'agence de la tâche : `runWithTenantContext`. |
| Routes                 | Gardes posées **route par route**. Les routes d'agence vivent sous `/subscription/ai`, préfixe **EXEMPT** de `route-features.ts:44` : une agence en lecture seule doit pouvoir voir et payer (aucune entrée à ajouter à la table, mais `route-features.test.ts` doit toujours passer). `routes-inventory.test.ts` : lignes à ajouter.                                 |
| Erreurs                | Services et middleware lèvent des erreurs typées (`AppError` porte déjà `code` et `data`, `ai-access-middleware.ts:19-23`) ; contrôleurs en `asyncHandler` ; aucun `try/catch` qui devine le statut.                                                                                                                                                                  |
| Audit                  | `logAuditEvent` pour les **gestes** ; **jamais** pour la facturation elle-même (file en mémoire, `audit-service.ts:12-13`). Aucun contenu de conversation.                                                                                                                                                                                                            |
| Textes                 | Tout libellé par `t()` ; `npm run i18n:extract` (API et web) ; arabe et anglais complets ; marges logiques ; montants formatés par langue.                                                                                                                                                                                                                            |
| Configuration          | Aucune variable nouvelle : réglages en base (`PlatformAiBillingSettings`, cache 30 s comme `getEffectiveAiConfig` de la PR #61).                                                                                                                                                                                                                                      |
| Migrations             | Additives, une par lot, enum isolé (data-model §6) ; testées sur une copie de la base de démonstration avant tout autre environnement.                                                                                                                                                                                                                                |
| Wiki                   | Mis à jour par lot (`npm run wiki:export`, `wiki:check` en CI) : §9.                                                                                                                                                                                                                                                                                                  |
| Fichiers volumineux    | `subscription-v2-service.ts` (1 688 lignes) et `platform-invoice-service.ts` (1 063) ne grossissent pas : le code neuf vit dans `lib/ai/billing/` et `services/ai-*.ts`, les fichiers existants ne reçoivent que des points d'accroche (§6).                                                                                                                          |

## 4. Architecture

### 4.1 Vue d'ensemble : ce qui se passe pour une requête

```text
POST /api/tenants/:tenantId/ai/chat                          (ai-routes.ts:32-40)
  authenticate → requireTenantAccess → requireTenantCollaborator
  → requireAiAssistantAccess → aiChatRateLimiter → aiChatDailyLimiter
  → aiTenantChatRateLimiter → aiTenantDailyLimiter            (429 RATE_LIMITED, inchangés)
  → requireAiQuota                                             (NOUVEAU : 403 / 402 / 503, JSON)
  → chatHandler
       validation du corps (400) → outils permis (403) → contexte d'écran
       → createBillingSession() + reserve()                    (NOUVEAU : atomique, 402 / 503)
       → openSseStream
       → runChat({ …, billing })
            boucle fournisseur/outils   (cumul de `usage`, `emittedText`)
            billing.settle(summary)    (NOUVEAU : consomme ou libère ; jamais d'exception)
            logAuditEvent(AI_CHAT_TURN)                        (enrichi : crédits, jamais de contenu)
            emit(done)
       → stream.end() ; finally : filet de libération
```

Trois décisions structurent le reste :

1. **Le portefeuille est en base et fait foi.** Les limiteurs en mémoire restent
   un frein par instance, jamais un quota (R-15).
2. **L'orchestrateur ne touche pas la base.** Il reçoit un _port_
   (`AiBillingSession`, défini dans `contracts.ts`) que le contrôleur construit ;
   le test statique de `ai.orchestrator.test.ts:746-760` (aucun import de
   génération de document) et les mocks Prisma de ce test restent valables.
3. **Réserver après les validations, juste avant le flux** : une requête
   invalide ne réserve rien ; une requête qui atteint le flux a toujours un
   crédit réservé ou une décision de passer (`SHADOW`, `UNBILLED`).

### 4.2 Mesure (lot A)

**Contrat.** `lib/ai/contracts.ts:249-253` : `LlmTurnResult` gagne
`usage?: LlmUsage` avec `LlmUsage = { inputTokens; outputTokens;
cacheReadTokens?; cacheWriteTokens?; model?; costUsd? }`. Champ **facultatif** :
les tests et les fournisseurs existants restent valides.

- **Anthropic** (`providers/anthropic-provider.ts:179-188`) : `message` vient de
  `stream.finalMessage()` (`:179`) ; renvoyer `usage` depuis `message.usage`
  (`input_tokens`, `output_tokens`, `cache_read_input_tokens`,
  `cache_creation_input_tokens`) et `model` depuis `message.model`. Le repli
  serveur (`fallbacks: 'default'`, `:155`) peut servir un autre modèle : la valeur
  de `message.model` fait foi, pas `env.AI_MODEL`.
- **Faux fournisseur** (`providers/fake-provider.ts`) : usage déterministe
  déduit de la longueur du script, avec un pas qui permet de tester l'absence
  d'usage.
- **OpenRouter** (**après la PR #61**, `providers/openrouter-provider.ts`,
  `buildRequest` `:258-292`) : demander l'usage dans le flux et lire le dernier
  fragment (jetons et coût). **Le format exact est à confirmer par lecture de la
  documentation du fournisseur au moment de l'implémentation** ; aucun test ne
  doit supposer un champ non vérifié. Sans coût rapporté, calcul par tarif.
- **Un tour qui lève** (abandon, délai, erreur) ne renvoie pas d'usage : il rend
  la requête `usage_complete = false`. L'usage partiel d'un flux coupé n'est pas
  reconstitué (borne inférieure non estimée en V1).

**Orchestrateur** (`lib/ai/orchestrator.ts:108-232`) : accumule `usage` sur les
tours (`+=`), note `providerCalls` (un par `runTurn` terminé ou non), pose
`emittedText = true` dans le rappel `text_delta` déjà présent (`:148`), et
construit un `ChatRunSummary` (`outcome`, `errorCode`, `emittedText`, `usage`,
`usageComplete`, `rounds`, `toolCalls`, `providerCalls`, `durationMs`, `model`).
Avant `logAuditEvent(AI_CHAT_TURN)` (`:210`) il appelle
`await input.billing?.settle(summary)` dans un `try/catch` (D8). Le payload de
l'audit reçoit `creditsCharged`, `source`, `usageComplete` — **jamais** de contenu.

**Écriture.** `services/ai-usage-service.ts` :

- `recordUsageEvent(summary, ctx)` (lot A) : `INSERT` avec `ON CONFLICT
(request_id) DO UPDATE` (idempotence FR-007), `await`, dans une transaction
  courte ; `status = SETTLED`, `credits_charged = 0`, `source = UNBILLED`.
- File de reprise `retryQueue` (mémoire, 1 000 entrées, attente 1, 5, 30 s) pour
  un échec **après** la réponse ; au-delà, audit `AI_USAGE_WRITE_FAILED` et alerte.
  La file n'est **pas** un registre : elle ne sert qu'à ne pas perdre une écriture
  sur une panne brève ; le balayeur (§4.3) reste le filet.

**Coût.** `lib/ai/billing/ai-pricing.ts` (pur) : `resolveModelPrice(prices,
provider, model, at)` (dernière ligne dont `effectiveFrom ≤ at`) et
`computeRequestCost(usage, price, fx)` → `{ costUsd, costXof, costSource }`
selon F2 (spec §7.2). Le tarif et le taux employés sont copiés sur l'événement :
un changement ultérieur ne réécrit aucun coût passé (FR-008). Le coût rapporté
par un fournisseur prime sur le calcul.

**Lecture super-admin** (lot A) : `GET /api/admin/ai-billing/usage` (agrégats par
agence, modèle et mois), `GET/POST /api/admin/ai-billing/model-prices`,
`GET/PUT /api/admin/ai-billing/settings` (mode, taux de change, délais).

### 4.3 Portefeuille et réservation (lot B)

**Module** `services/ai-credits-service.ts` (fonctions, pas de classe) :

| Fonction                                       | Rôle                                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensureMonthlyGrantsTx(tx, tenantId, now)`     | Crée les lots du mois (gratuit, packs) ; `INSERT … ON CONFLICT DO NOTHING` sur les index uniques partiels ; ajuste le gratuit à la hausse (FR-041).                     |
| `reserveCredit(input)`                         | Transaction courte sous verrou ; choisit le lot, décrémente, écrit `RESERVE` et l'événement `RESERVED`, tient `AiUsageMonth` ; renvoie une réservation ou une décision. |
| `settleRequest(reservation, summary)`          | Règle de FR-022 : `CONSUME` ou `RELEASE` ; met à jour l'événement (jetons, coût, issue) **conditionnellement** ; met à jour les compteurs du mois.                      |
| `releaseRequest(requestId, reason)`            | Libération explicite (filet du contrôleur, balayeur).                                                                                                                   |
| `getWalletSnapshot(tenantId, now)`             | Solde par source, alloué et consommé du mois, réservé, dates ; sans verrou ; sert `GET /ai/status`, le 402 et l'écran.                                                  |
| `expireGrants(now)`, `sweepOrphanReservations` | Tâche (§4.6).                                                                                                                                                           |
| `adjustGrantTx`, `grantAdminCreditsTx`         | Restitution, crédits offerts, report à la montée de pack.                                                                                                               |

**Réservation** (pseudo-SQL, tout dans une transaction sous
`withTransactionalAdvisoryLock('ai-credits:' + tenantId, fn, { maxWaitMs: 2000,
timeoutMs: 4000 })`) :

```sql
-- 1. lots du mois (idempotent)                        ensureMonthlyGrantsTx
-- 2. quel lot ?  (sources permises par la phase, FR-033)
SELECT id, source, unit_value_xof FROM ai_credit_grants
 WHERE tenant_id = $1 AND remaining > 0
   AND valid_from <= $now AND expires_at > $now AND source = ANY($allowed)
 ORDER BY consume_rank, expires_at, created_at
 LIMIT 1 FOR UPDATE;
-- 3. décrément gardé
UPDATE ai_credit_grants SET remaining = remaining - 1 WHERE id = $grant AND remaining > 0
 RETURNING remaining;                                   -- 0 ligne : on retente l'étape 2 (au plus 3 fois)
-- 4. journal et événement
INSERT INTO ai_credit_ledger (tenant_id, grant_id, usage_event_id, entry_type, delta, remaining_after)
 VALUES ($1, $grant, $event, 'RESERVE', -1, $remaining);
INSERT INTO ai_usage_events (…, status, source, allocations, unit_value_xof, period_key, mode)
 VALUES (…, 'RESERVED', $source, $alloc, $unit, $periodKey, $mode);
-- 5. compteurs du mois : requests + 1 (plafond dur, FR-037) ; overage_credits + 1 pour un dépassement (voir ci-dessous)
```

Si aucun lot ne convient : décision _dépassement_ si FR-062 le permet — pas de
lot, `source = OVERAGE`, `overage_unit_price` figé, `AiUsageMonth.overage_credits`
incrémenté **dans la même transaction** avec la vérification du plafond (I-13) —,
sinon `AiCreditsExhaustedError` (402). En `SHADOW`, la décision « refus » devient
`UNBILLED` avec `shadow_blocked = true`.

**Articulation avec `lib/ai/advisory-lock.ts`, sans le copier à l'aveugle.**
Le fichier fournit deux outils :

- `withTransactionalAdvisoryLock(key, fn, options)` (`:31-43`) : une transaction
  interactive qui prend `pg_advisory_xact_lock(hashtextextended(key, 0))`,
  relâché au commit ou au rollback, y compris sur perte de connexion. **C'est
  l'outil de la réservation** : verrou par agence, ~1 à 5 ms de détention, une
  connexion du pool pendant ce temps. Les délais par défaut (`maxWait` 5 s,
  `timeout` 10 s, `:16-17`) sont trop généreux pour un chat : la réservation
  passe `maxWaitMs: 2000`, `timeoutMs: 4000`, et une attente dépassée devient
  `AiBillingUnavailableError` (D8).
- `withExclusiveSection(key, fn)` (`:136-144`) : mutex local **puis** sémaphore de
  processus limité à `MAX_CONCURRENT_EXCLUSIVE_SECTIONS = 2` (`:67`), pour des
  sections longues qui gardent leurs propres connexions (génération de
  document). **Ne pas l'employer ici** : deux réservations simultanées de deux
  agences différentes attendraient déjà l'une l'autre, et tout le chat de
  l'instance passerait par deux guichets. Un test statique l'interdit (CA-46).

Le motif d'usage unique du jeton de proposition (verrou autour d'une ligne
d'audit) est un _test-and-set_ sur une ligne ; le portefeuille est un
_compteur_ multi-lots avec ordre : d'où le verrou par agence et la sélection
ordonnée, pas un verrou par ligne.

**Verrous et ordre.** Tout code qui modifie `remaining` (réservation,
règlement, libération, expiration, `ADJUST`, `REFUND`) prend le verrou
`ai-credits:<tenantId>`. Ordre global : **verrou de crédits → verrou de
facturation d'agence** (`lockTenantBillingTx`, `platform-invoice-service.ts:128`,
clé distincte) **→ verrous de ligne**. L'insertion d'un lot neuf (recharge réglée,
pack) ne modifie aucun restant existant : elle n'a pas besoin du verrou de crédits.

**Règlement** (`settleRequest`, fin de `runChat`) : dans une transaction sous le
même verrou, mise à jour conditionnelle de l'événement
(`WHERE request_id = $1 AND status = 'RESERVED'`, I-4) ; consommation → ligne
`CONSUME` (delta 0) et compteurs du mois ; libération → `RELEASE` (+1) **si le lot
n'a pas expiré** (FR-023), sinon rien ; le coût et les jetons s'écrivent dans tous
les cas. Le règlement échoue en douceur : reprise en file, puis balayeur.

**Gratuit.** `countActiveCollaborators(tenantId)` : `Membership` `ACTIVE` dont
l'utilisateur est actif et détient au moins un `UserRole` de rôle de portée
`TENANT` (la définition de `tenant-middleware.ts:127-152`), en une requête
d'agrégat. `freeCredits = min(g × k, K)`, `k ≥ 1` ; dérogation
`freeCreditsOverride` prioritaire. Instantané au premier accès du mois ; la hausse
de FR-041 recompte les collaborateurs **au plus une fois par heure et par agence**
(cache mémoire, hors du verrou), pas à chaque requête.

### 4.4 Contrôle avant le modèle (lot B)

**Middleware** `middleware/ai-quota-middleware.ts` → `requireAiQuota`, inséré dans
`routes/ai-routes.ts:32-40` **après** `aiTenantDailyLimiter` :

1. lit `TenantAiSettings` (cache court, invalidé à l'écriture) : interrupteur
   éteint → `AiTenantDisabledError` (403 `AI_TENANT_DISABLED`, `data.by` =
   `TENANT` ou `PLATFORM`), **dans tous les modes** (FR-035) ;
2. lit le mode (`getAiBillingMode()`, cache 30 s) ; `OFF` → passe ;
3. plafond dur mensuel (`AiUsageMonth.requests`) → 429
   `AI_MONTHLY_LIMIT_REACHED` (`SHADOW` et `ENFORCE`) ;
4. en `ENFORCE` : pré-contrôle sans effet de bord (`getWalletSnapshot`, phase via
   `getEntitlements`, `getSubscriptionEnforcement()`) → 402 typé si un refus est
   certain.

Les erreurs sont des sous-classes d'`AppError` (`lib/ai/billing/ai-errors.ts`),
sur le modèle d'`AiDisabledError` (`ai-access-middleware.ts:19-23`). Aucun corps
SSE n'est ouvert : la réponse est du JSON typé (FR-031).

**Contrôleur** (`controllers/ai-controller.ts:103-136`) : après
`resolvePageContext` (`:114`) et **avant** `openSseStream` (`:116`) :

```text
const session = await beginAiBilling({ tenantId, userId, requestId, provider, permissions })
   // ENFORCE : réserve ou lève 402 / 503 ; SHADOW : réserve, ne lève jamais ; OFF : session sans réservation
try { … runChat({ …, billing: session }) } finally { stream.end(); await session.ensureClosed() }
```

`ensureClosed()` libère toute réservation restée `RESERVED` (exception entre la
réservation et `runChat`) ; il est sans effet si `settle` a déjà eu lieu.

**Phase et `SUBSCRIPTION_ENFORCEMENT`** (FR-033) : `allowedSources(phase,
enforcement)` est une fonction **pure** (`lib/ai/billing/ai-policy.ts`) qui
rend les sources permises et le motif d'un éventuel refus ; en `warn` le motif
est journalisé et compté (même compteur que `getSubscriptionGuardCounters`,
`subscription-feature-middleware.ts:48-60`) sans refuser. `getEntitlements`
(cache 30 s, `subscription-v2-service.ts:305-350`) donne la phase et
`quotaPolicy` ; un échec de lecture des droits ne ferme pas l'assistant
(comme `entitledFeatures`, `ai-controller.ts:47-60`).

**`GET /ai/status`** (`ai-controller.ts:77-93`) : en `ENFORCE`, ajoute
`credits` (solde par source, alloué et consommé, remise à zéro, `canPurchase`,
dépassement) ; ajoute la raison `TENANT_DISABLED` ; **n'enlève aucun champ**
(FR-126). `canPurchase` = l'utilisateur détient `TENANT_SETTINGS_EDIT`
(`getUserPermissions`, déjà chargé par `resolveAvailableTools`,
`ai-controller.ts:63-74`).

**Web.** `utils/event-stream.ts:10-14,73-77` : `EventStreamError` ne porte que
`status`, `code` et `message` ; le corps `data` des 402 (solde, `purchasePath`,
`canPurchase`) serait perdu. Ajouter `data?: unknown` à l'erreur levée, puis le
transmettre par `hooks/useCopilotChat.ts:33-47` à un composant
`CopilotBlockedNotice` qui garde le texte saisi.

### 4.5 Facturation

#### 4.5.1 Packs : `AI_REQUESTS` est un flux, pas un stock (clé au lot B, packs au lot C)

Le catalogue sait déjà vendre une extension avec une capacité
(`CatalogCapacity`, `catalog.ts:47-52`). Mais toute la mécanique de capacité
suppose un **stock** :

| Code                                                                                | Ce qu'il fait                                                                                                       | Effet d'un `AI_REQUESTS` dans `CAPACITY_KEYS`                                                                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `computeCapacityLimits`, `buildEntitlements` (`entitlements.ts:157-182,465-481`)    | Somme des capacités par clé, `used`/`remaining`/`overBy`                                                            | L'IA apparaîtrait comme une capacité des droits (`entitlements.capacities`), lue par le menu et les jauges génériques (`TenantSubscriptionSettings.tsx:230`) |
| `getUsage` (`subscription-v2-service.ts:211-229`)                                   | Appelle un fournisseur d'usage par clé à **chaque** calcul de droits (cache 30 s)                                   | Une requête de comptage de plus par recalcul, sans objet                                                                                                     |
| `computeOverageForUsage` (`:1408-1450`)                                             | `extensionCodes: Record<CapacityKeyCode, string>` : clé manquante = erreur de types ; facture le **pic** d'un stock | Un dépassement IA serait facturé comme un stock, au mauvais prix et dans la mauvaise facture                                                                 |
| `recordUsageSnapshots`, `evaluateQuotaAlerts` (`subscription-usage-job.ts:288-389`) | Pic quotidien et alertes par clé de `CAPACITY_KEYS`                                                                 | Relevés quotidiens et alertes doublonnés avec les nôtres                                                                                                     |

**Décision (D13).** L'enum Prisma `CapacityKey` reçoit `AI_REQUESTS` (elle est
lue par `CatalogCapacity`, `QuotaAlert`, `InvoiceLine`, `CapacityOverride`), mais
`CAPACITY_KEYS` **ne le contient pas**. `lib/subscription/catalog.ts` gagne :

```text
export type CatalogCapacityKeyCode = CapacityKeyCode | 'AI_REQUESTS'   // clés portées par le catalogue
export const FLOW_CAPACITY_KEYS = ['AI_REQUESTS'] as const              // flux mensuels, hors stocks
```

`toCatalogEntry` (`subscription-v2-service.ts:95`) lit les capacités du
catalogue avec ce type élargi ; un test échoue si `AI_REQUESTS` entre dans
`CAPACITY_KEYS` (R-09). **Alternative sans migration d'enum** (Q19) :
`rules.aiCredits` dans `catalog_items.rules` — on perd la réutilisation des tables
liées mais on évite un `ALTER TYPE` irréversible.

**Pack IA.** Trois `CatalogItem` `EXTENSION` (`EXT_IA_100/500/2000`, prix de D6),
ajoutés à `DEFAULT_CATALOG`, au seed (`prisma/seeds/catalog-seed.ts`) et à une
migration d'amorçage (précédent `20261001101600_patrimoine_pack_catalogue`).
`rules.requiresAnyOf` : tous les packs de base ; `rules.aiPack: true`.

**Achat** : `services/ai-pack-service.ts` :

- `subscribeAiPack(tenantId, code, actor)` : vérifie mode `ENFORCE`, phase (hors
  essai, hors lecture seule), pack unique (aucun autre élément `aiPack` en
  vigueur), puis **appelle `addSubscriptionItem`** (`:591`) — prorata, lien
  `parentItemId`, prix figé, audit — et `ensureMonthlyGrantsTx` pour le lot du mois
  proratisé (FR-054).
- `changeAiPack(tenantId, code, actor)` : montée = ajout du nouveau, retrait
  immédiat de l'ancien avec **avoir au prorata**, report du restant du lot
  (`adjustGrantTx` `ADJUST`) ; descente = retrait de l'ancien à l'échéance et
  ajout programmé (`SCHEDULED`). La logique de `changePack` (`:887-1097`) est
  aujourd'hui limitée aux éléments de nature `PACK` (`:898`) : la généraliser aux
  extensions `aiPack` **en l'extrayant** (fonction interne réutilisée) plutôt que
  de la dupliquer.
- `cancelAiPack(tenantId, actor)` : retrait à l'échéance (`removeSubscriptionItem`,
  `:760`).
- Lots de pack : `PACK_MONTHLY` par élément et par mois (FR-054),
  `expires_at = min(fin du mois, endsAt)` ; remise à zéro et création lazy par
  `ensureMonthlyGrantsTx`. Alerte de plancher de marge (FR-056) au moment de
  l'ajout par le super-admin.

Rien à changer dans `entitlements.ts` ni dans les usage providers ; les lignes
de facture d'un pack IA sont des lignes `EXTENSION` ordinaires
(`computeRecurringLines`).

#### 4.5.2 Dépassement : facture mensuelle séparée (lot D)

`services/ai-overage-billing-service.ts` :

- `billClosedMonths(now)` : pour chaque `AiUsageMonth` `OPEN` d'un mois **échu**
  et sans réservation orpheline (I-6), calcule les lignes : crédits de
  dépassement **réglés** groupés par `overage_unit_price`, ligne `USAGE`
  `quantité × prix` ; total nul → `WAIVED`.
- Le brouillon est un `PlatformInvoiceDraft` (`platform-invoice-service.ts:135-150`)
  de nature `AI_USAGE` ; **ne pas passer par `generateInvoiceForPeriod`**
  (`:487`), qui refuse pendant l'essai et après résiliation (`:493-501`) : une
  dette d'usage existe même si l'abonnement s'est arrêté. On appelle
  `generateInvoiceForPeriodTx` (`:302`) puis `issuePlatformInvoiceTx` (`:445`) dans
  une transaction sous `lockTenantBillingTx` ; le champ `subscriptionId` du
  brouillon devient nullable.
- L'unicité vient de l'index partiel des factures `AI_USAGE` (data-model §6) et de
  `AiUsageMonth.overage_invoice_id` ; la reprise après course renvoie la facture
  existante, comme `generateInvoiceForPeriod` (`:517-525`).
- Après émission : `sendPlatformInvoiceEmail` (`:903`), audit, `AiUsageMonth`
  `INVOICED`.
- `markOverdueInvoices` (`:566-575`) : ajouter `AI_USAGE` à la liste des natures
  (`billingNature: { in: [...] }`, `:571`) ; c'est ce qui déclenche la suspension du
  dépassement (FR-066), lue par `reserveCredit` (« facture `AI_USAGE` `OVERDUE` »).
- **Avoir** : `issueCreditNote` (`:595-739`) refuse aujourd'hui toute nature hors
  `PERIOD` et `OVERAGE` (`:603`) ; l'étendre à `AI_USAGE` avec l'effet « mois
  rouvert » (`overage_invoice_id = null`, statut `OPEN`).
- **PDF et libellés** : `platform-invoice-pdf.ts:169` (libellé de la période),
  `platform-invoice-labels.ts:18-20`, `InvoicesTab.tsx:75,377`,
  `platform-billing-service.ts:16`.
- Type `InvoiceNature` (TS) et `PlatformInvoiceNature` (enum) : `AI_USAGE`
  (migration d'enum isolée, lot D).

#### 4.5.3 Recharge prépayée (lot E) — le seul vrai chantier nouveau

`services/ai-topup-service.ts` :

- `createTopupOrder(tenantId, offerCode, quantity, actor)` : vérifie `ENFORCE`,
  charge l'offre, **réutilise un brouillon identique de moins de 15 minutes**
  (double clic), sinon crée un brouillon `AI_TOPUP` (ligne `USAGE` « Recharge de N
  requêtes IA », `metadata.aiKind = 'AI_TOPUP'`, TVA 18 %, `periodStart = now`),
  puis appelle `startInvoiceCheckout` (`platform-payment-service.ts:432`) et
  renvoie facture et paiement.
- **Modification de `startInvoiceCheckout`** : `PAYABLE_INVOICE_STATUSES`
  (`:57`) exclut `DRAFT` ; pour la seule nature `AI_TOPUP`, accepter `DRAFT`
  (`:446-448`), et libeller l'article et la commande d'après l'offre au lieu du
  numéro de facture provisoire (`:495-498`, `libOrder: Facture ${invoiceNumber}`).
- **Modification de `settlePlatformInvoiceTx`** (`:175-223`, porte unique) : si la
  nature est `AI_TOPUP` et le statut `DRAFT`, appeler `issuePlatformInvoiceTx`
  (`:445`) **dans la même transaction** avant de créer le règlement (numéro
  continu, mentions figées), puis, après la mise à jour « payée », appeler
  `grantTopupCreditsTx(tx, invoice)` : un lot `TOPUP`
  (`expires_at = paidAt + validityMonths`, `unit_value_xof = prix HT / crédits`),
  une ligne `GRANT`, `invoice_id` unique. Rejeu d'IPN ou de constat : la fonction
  est déjà idempotente (`created: false`, `:185-187`) et l'unicité protège.
- **Garde de `applyPaymentToSubscriptionTx`** (`:234-275`) : ajouter en tête
  `if (invoice.billingNature === 'AI_TOPUP') return 'NONE'`. Sans elle, une
  facture **sans période** est traitée comme réglant l'échéance d'un abonnement
  `PAST_DUE` (`:257-261`) : une recharge ferait sortir un impayé de la lecture
  seule (R-10, CA-28). Le paramètre `invoice` du type doit porter la nature.
- **Constat manuel** : `recordManualPayment` (`:332`) passe par
  `settlePlatformInvoiceTx` ; le brouillon `AI_TOPUP` doit donc apparaître dans la
  liste super-admin (`includeDrafts`) avec l'action « constater le paiement ».
- **Purge** : brouillons `AI_TOPUP` de plus de 48 h supprimés par la tâche (ils
  n'ont jamais eu de numéro), avec audit ; les paiements en cours (`PENDING`) de
  moins de 15 minutes sont respectés (`RESUME_WINDOW_MS`).
- **Avoir** : `issueCreditNote` étendu à `AI_TOPUP` **sans effet de bord sur
  l'abonnement**, refusé (409) si le lot est entamé, sinon `REFUND` négatif du lot.
- **Enum** : `PlatformInvoiceNature.AI_TOPUP` (migration isolée, lot E).

### 4.6 Tâche planifiée `jobs/ai-credits-job.ts` (lot B, étendue aux lots D et E)

Deux planifications UTC, démarrées par `startAiCreditsJob()` à côté de
`startSubscriptionUsageJob()` (`index.ts:57`), exécutées **par agence dans
`runWithTenantContext`** (comme `subscription-usage-job.ts:153`) et
**idempotentes** (plusieurs instances font tourner le même cron) :

- **toutes les heures, à `hh:20`** (décalée de `hh:15` de la tâche d'abonnement,
  `subscription-usage-job.ts:541`) : balayage des réservations orphelines
  (FR-024), écritures `EXPIRE` des lots échus, alertes 80/100 % de l'allocation
  (`QuotaAlert`, motif de `evaluateQuotaAlerts`, `:341-389`) et du plafond
  (horodatages de `AiUsageMonth`), alerte d'expiration de recharge à J-30, purge
  des brouillons de recharge, alertes super-admin (modèle sans tarif, budget du
  gratuit, usage incomplet) ;
- **tous les jours à 02:45 UTC** (après la tâche d'abonnement de 02:30,
  `:540`) : `billClosedMonths` (FR-064). Le 1er du mois traite le mois écoulé ;
  les autres jours rattrapent un mois manqué.

Les alertes réutilisent `agencyAdminRecipients` (exporté,
`subscription-usage-job.ts:102`) ; la fonction `notify` (`:149`) est privée :
l'**exporter** ou l'extraire dans `lib/subscription/notify.ts` plutôt que de la
copier. Contrairement à `runSubscriptionUsageCycle` (`:462-513`), la tâche n'est
pas limitée aux abonnements vivants (`LIVE_STATUSES`, `:57`) : une dette d'usage
et une recharge à faire expirer existent après une résiliation.

### 4.7 Super-admin, marge et recalcul des prix (lots A à E)

- `lib/ai/billing/ai-economics.ts` : fonctions **pures** F1 à F11 (spec §7.2) —
  `unitPrice`, `grossMargin`, `marginAtUsage`, `costBreakeven`, `minUnitPrice`,
  `freeCost`, `conversionBreakeven`, `netMarginAfterGateway`. Test unitaire qui
  reproduit les tableaux 7.5 à 7.7 (CA-47).
- `services/ai-margin-service.ts` : agrégats `AiUsageMonth` et événements par
  mois, agence, source et modèle ; revenu imputé = Σ `unit_value_xof × crédits` ;
  casse = Σ restants des lots échus ; frais de passerelle réels via
  `platform_payment_checkouts.provider_fees` des factures liées.
- `scripts/ai-margin-report.ts` : rapport en console et CSV du §7 sur les
  **données réelles** (`c` moyen et 95ᵉ centile par modèle, marges par produit,
  points morts, conversion) — l'outil du gel des prix (§7.10 de la spec).
- `scripts/ai-credits-reconcile.ts` : recalcule `AiUsageMonth` et vérifie
  I-1 à I-5, I-14 depuis les événements et le journal (lecture seule par défaut).
- Écrans : `pages/admin/AiBilling.tsx` (réglages, tarifs, marge, alertes) à côté de
  `pages/admin/AiSettings.tsx` (PR #61), onglet `AiCreditsTab.tsx` dans la fiche
  agence (`components/admin/tenant-detail/`).

### 4.8 Interface web (lots B à E)

- **Tiroir** : `CopilotCreditsGauge` (jauge `Progress` avec `aria-*`),
  `CopilotBlockedNotice` ; `CopilotStatus` (`types/copilot.ts:117-123`) étendu de
  façon rétrocompatible ; `CopilotRoot` continue de masquer l'assistant quand
  `enabled` est faux (`:53,72`), y compris pour `TENANT_DISABLED`.
- **Écran** `pages/tenant/TenantAiSettings.tsx` (route `React.lazy`
  `/tenant/:tenantId/settings/assistant-ia` dans `App.tsx`, lien depuis
  `TenantSettings.tsx:244` et `TenantSubscriptionSettings.tsx`) : cartes
  `AiUsageCard`, `AiPackCard`, `AiTopupCard`, `AiOverageCard`, `AiSwitchCard`,
  historique `AiUsageHistory`.
- **Erreurs** : `utils/subscription-denial-notice.ts:114` renvoie déjà vers les
  réglages d'abonnement ; le refus IA a son propre chemin (`purchasePath`).
- **Factures** : libellés des natures dans `platform-invoice-labels.ts`,
  `InvoicesTab.tsx` (action « constater le paiement » d'un brouillon de recharge),
  `TenantInvoicesSection.tsx`.
- Réseau par `utils/api-client` ; URLs par `config/api` ; libellés par `t()` ;
  aucun `dangerouslySetInnerHTML`.

### 4.9 Permissions par route

Aucune permission nouvelle : les routes d'agence emploient les droits de
réglages existants, les routes plateforme ceux des abonnements.

| Route (préfixe)                                                                       | Garde                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /tenants/:tenantId/ai/status`                                                    | collaborateur (`requireAiStatusAccess`) — inchangé ; répond aussi à un compte sans permission de réglage                                        |
| `POST /tenants/:tenantId/ai/chat`                                                     | inchangé + `requireAiQuota`                                                                                                                     |
| `GET /tenants/:tenantId/subscription/ai`, `…/usage`, `…/offers`                       | `authenticate`, `requireTenantAccess`, `TENANT_SETTINGS_VIEW`                                                                                   |
| `PUT …/subscription/ai/settings`, `PUT` et `DELETE …/ai/pack`, `POST …/ai/topups`     | `authenticate`, `requireTenantAccess`, `TENANT_SETTINGS_EDIT`                                                                                   |
| `GET/PUT /admin/ai-billing/settings`, `…/model-prices`, `…/topup-offers`              | `requirePermission('PLATFORM_SUBSCRIPTIONS_VIEW/EDIT')` puis `requireSuperAdmin` (double garde, réglage global jamais délégué, comme la PR #61) |
| `GET /admin/ai-billing/margin`, `…/usage`                                             | `PLATFORM_SUBSCRIPTIONS_VIEW`                                                                                                                   |
| `GET /admin/tenants/:tenantId/ai-billing` (+ `…/usage`, `…/ledger`, `…/usage/export`) | `PLATFORM_SUBSCRIPTIONS_VIEW`                                                                                                                   |
| `POST …/ai-billing/grants`, `PUT …/ai-billing/overrides`                              | `PLATFORM_SUBSCRIPTIONS_EDIT`                                                                                                                   |

`TENANT_SETTINGS_EDIT` n'est attribué au seed qu'à `TENANT_ADMIN`
(`rbac-seed.ts:39,222`) : c'est l'administrateur seul qui achète et active le
dépassement, sans contrôle ad hoc.

## 5. Structure du code

```text
packages/api/src/
  ├── lib/ai/
  │    ├── contracts.ts                    # + LlmUsage, ChatRunSummary, AiBillingSession, CopilotStatus.credits
  │    ├── orchestrator.ts                 # cumul d'usage, emittedText, billing.settle (port)
  │    ├── providers/                      # anthropic / fake (A) ; openrouter (A2, après PR #61)
  │    └── billing/
  │         ├── ai-pricing.ts              # tarifs, F2
  │         ├── ai-period.ts               # mois UTC, prorata, périodes
  │         ├── ai-policy.ts               # sources permises selon phase et mode (pur)
  │         ├── ai-errors.ts               # erreurs typées 402/403/429/503
  │         ├── ai-schemas.ts              # Zod .strict()
  │         └── ai-economics.ts            # F1 à F11 (pur)
  ├── services/
  │    ├── ai-usage-service.ts             # écriture des événements, file de reprise
  │    ├── ai-credits-service.ts           # portefeuille : réservation, règlement, expiration
  │    ├── tenant-ai-settings-service.ts   # interrupteur, dépassement, dérogations
  │    ├── ai-billing-settings-service.ts  # réglages plateforme, tarifs, offres (cache 30 s)
  │    ├── ai-pack-service.ts              # lot C
  │    ├── ai-overage-billing-service.ts   # lot D
  │    ├── ai-topup-service.ts             # lot E
  │    └── ai-margin-service.ts
  ├── middleware/ai-quota-middleware.ts
  ├── controllers/{ai-billing-controller,platform-ai-billing-controller}.ts
  ├── routes/{ai-billing-routes,platform-ai-billing-routes}.ts
  ├── jobs/ai-credits-job.ts
  └── prisma/{migrations/…_ia_credits_*, seeds/ai-billing-seed.ts}
packages/api/scripts/{ai-margin-report.ts, ai-credits-reconcile.ts}

apps/web/src/
  ├── types/ai-credits.ts
  ├── services/ai-credits-service.ts
  ├── hooks/useAiCredits.ts
  ├── components/copilot/{CopilotCreditsGauge,CopilotBlockedNotice}.tsx
  ├── components/ai/{AiUsageCard,AiPackCard,AiTopupCard,AiOverageCard,AiSwitchCard,AiUsageHistory}.tsx
  ├── pages/tenant/TenantAiSettings.tsx
  ├── pages/admin/AiBilling.tsx
  └── components/admin/tenant-detail/AiCreditsTab.tsx
```

Tests : API `__tests__/unit/ai.{usage,pricing,economics,policy,period}.test.ts`,
`ai.credits.*.test.ts`, `ai.quota-middleware.test.ts`, `ai.billing-routes.test.ts`,
`ai.topup-settlement.test.ts` ; intégration `__tests__/integration/ai-credits.*.test.ts`
(base réelle) ; web `src/__tests__/copilot/credits-*.test.tsx`,
`src/__tests__/settings/tenant-ai-settings.test.tsx`.

## 6. Changements dans le code existant

| Fichier (lignes)                                                                                                                             | Changement                                                                                                                                                                                | Lot   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `lib/ai/contracts.ts:249-253`                                                                                                                | `LlmTurnResult.usage?`, type `LlmUsage`, `ChatRunSummary`, port `AiBillingSession`                                                                                                        | A, B  |
| `lib/ai/contracts.ts:158-164`, `:23-34`                                                                                                      | `CopilotStatus.credits?` et raison `TENANT_DISABLED` ; `CopilotErrorCode` reçoit les codes 402/403/429/503 de FR-031                                                                      | B     |
| `lib/ai/providers/anthropic-provider.ts:179-188`                                                                                             | Renvoyer `usage` et `model` de `message`                                                                                                                                                  | A     |
| `lib/ai/providers/fake-provider.ts`                                                                                                          | Usage déterministe et cas « sans usage »                                                                                                                                                  | A     |
| `lib/ai/providers/openrouter-provider.ts` (PR #61, `buildRequest` `:258-292`)                                                                | Demander et lire l'usage du flux                                                                                                                                                          | A2    |
| `lib/ai/orchestrator.ts:108-232`                                                                                                             | Cumul d'usage, `emittedText`, `providerCalls`, `ChatRunSummary`, `await input.billing?.settle(…)` avant `AI_CHAT_TURN` (`:210`), payload d'audit enrichi                                  | A, B  |
| `controllers/ai-controller.ts:77-93`                                                                                                         | `credits` dans le statut                                                                                                                                                                  | B     |
| `controllers/ai-controller.ts:103-136`                                                                                                       | Réservation entre `resolvePageContext` (`:114`) et `openSseStream` (`:116`), `try/finally`, passage de la session à `runChat`                                                             | B     |
| `routes/ai-routes.ts:32-40`                                                                                                                  | `requireAiQuota` après `aiTenantDailyLimiter`                                                                                                                                             | B     |
| `types/audit-types.ts:119-125`                                                                                                               | Clés `AI_SETTINGS_CHANGED`, `AI_OVERAGE_CONFIGURED`, `AI_PACK_CHANGED`, `AI_TOPUP_*`, `AI_CREDITS_GRANTED`, `AI_CREDITS_ADJUSTED`, `AI_BILLING_SETTINGS_CHANGED`, `AI_USAGE_WRITE_FAILED` | A à E |
| `lib/subscription/catalog.ts:19,28,47-52`                                                                                                    | `CatalogCapacityKeyCode` et `FLOW_CAPACITY_KEYS` (lot B) ; `EXTENSION.IA_*` et entrées de `DEFAULT_CATALOG` (lot C) ; **`CAPACITY_KEYS` inchangé**                                        | B, C  |
| `services/subscription-v2-service.ts:95`, `:887-1097`                                                                                        | `toCatalogEntry` lit le type élargi ; `changePack` : extraction du cœur pour les extensions `aiPack`. **`getUsage` (`:222`) et `computeOverageForUsage` (`:1408`) inchangés**             | C     |
| `services/platform-invoice-service.ts:135-150,206-273`                                                                                       | `PlatformInvoiceDraft.subscriptionId` nullable ; constructeurs de brouillon `AI_USAGE` et `AI_TOPUP` (dans `services/ai-*`, pas ici)                                                      | D, E  |
| `services/platform-invoice-service.ts:566-575`                                                                                               | `markOverdueInvoices` : ajouter `AI_USAGE`                                                                                                                                                | D     |
| `services/platform-invoice-service.ts:595-603`                                                                                               | `issueCreditNote` : natures `AI_USAGE` et `AI_TOPUP` avec leurs effets                                                                                                                    | D, E  |
| `services/platform-payment-service.ts:57,175-223,234-275,432-451,495-498`                                                                    | Voir §4.5.3 : brouillon payable pour `AI_TOPUP`, émission au règlement, lot `TOPUP`, garde de renouvellement, libellé                                                                     | E     |
| `lib/subscription/platform-invoice-pdf.ts:169`                                                                                               | Libellé de période des deux natures                                                                                                                                                       | D, E  |
| `jobs/subscription-usage-job.ts:149`                                                                                                         | Exporter `notify` (ou l'extraire)                                                                                                                                                         | B     |
| `index.ts:57`                                                                                                                                | `startAiCreditsJob()`                                                                                                                                                                     | B     |
| `routes/tenant-routes.ts:118-129`, `routes/admin-routes.ts:123`                                                                              | Monter `ai-billing-routes` et `platform-ai-billing-routes`                                                                                                                                | A à E |
| `prisma/seeds/catalog-seed.ts`, migration d'amorçage                                                                                         | Packs IA, offre de recharge                                                                                                                                                               | C, E  |
| `__tests__/unit/schema-tenant-coverage.test.ts:61`                                                                                           | `GLOBAL_MODELS` : `PlatformAiBillingSettings`, `AiModelPrice`, `AiTopupOffer`                                                                                                             | A, E  |
| `__tests__/unit/routes-inventory.test.ts:231-247`                                                                                            | Routes ajoutées                                                                                                                                                                           | A à E |
| `apps/web/src/types/copilot.ts:117-123`                                                                                                      | `CopilotStatus` étendu (rétrocompatible)                                                                                                                                                  | B     |
| `apps/web/src/utils/event-stream.ts:10-14,73-77`                                                                                             | `data?` dans `EventStreamError`                                                                                                                                                           | B     |
| `apps/web/src/hooks/useCopilotChat.ts:33-47`                                                                                                 | Transmettre `data` du 402 ; états « bloqué »                                                                                                                                              | B     |
| `apps/web/src/components/copilot/CopilotDrawer.tsx`, `CopilotRoot.tsx:53,72`                                                                 | Jauge, refus, masquage `TENANT_DISABLED`                                                                                                                                                  | B     |
| `apps/web/src/pages/tenant/TenantSubscriptionSettings.tsx:228-257`                                                                           | Lien vers l'écran « Assistant IA » ; **la carte « Consommation » ne change pas**                                                                                                          | C     |
| `apps/web/src/components/subscription/platform-invoice-labels.ts:18-20`, `InvoicesTab.tsx:75,377`, `services/platform-billing-service.ts:16` | Natures `AI_USAGE`, `AI_TOPUP`                                                                                                                                                            | D, E  |
| `packages/api/env.example`                                                                                                                   | **Inchangé** (FR-124)                                                                                                                                                                     | —     |

## 7. Lots livrables

### A — Mesure seule (taille M, 5 à 7 j)

**But** : connaître le coût réel par requête, par agence et par modèle, sans rien
changer pour l'agence. Mode `OFF`.

- Migration `ia_credits_mesure` (data-model §6) ; `GLOBAL_MODELS`.
- `LlmUsage`, Anthropic, faux fournisseur ; **A2** (après la PR #61) : OpenRouter.
- Orchestrateur : cumul, `ChatRunSummary`, port `billing` ; `ai-usage-service.ts`
  (mode `OFF` : événement `UNBILLED`) ; `ai-pricing.ts`, `ai-period.ts`.
- Réglages plateforme (`mode`, `usdToXofRate`), tarifs de modèles, routes
  d'administration et vue super-admin de l'usage et du coût ; alerte « modèle sans
  tarif » ; audit enrichi.
- `scripts/ai-margin-report.ts` (version A : `c` moyen et 95ᵉ centile).
- Tests : unitaires (pricing, période, cumul), orchestrateur (usage cumulé, audit
  sans contenu), API (routes admin, isolation), intégration (événement écrit,
  idempotence), `schema-tenant-coverage`, `routes-inventory`.
- **Sortie du lot** : deux semaines de mesure, rapport de coût, Q5 et Q6 tranchées.

### B — Portefeuille, dix gratuits, contrôle avant le modèle (taille L, 10 à 14 j)

- Migrations `ia_credits_enum_capacity` (isolée : `AI_REQUESTS`) puis
  `ia_credits_portefeuille` ; `CatalogCapacityKeyCode`, `FLOW_CAPACITY_KEYS` et
  son test de garde ; `AiBillingMode` opérant ; verrouillage
  et réservation ; `ensureMonthlyGrantsTx`, gratuit ; règlement et libération ;
  balayeur ; tâche horaire ; `TenantAiSettings` et interrupteur ; `requireAiQuota`
  et erreurs typées ; contrôleur ; `GET /ai/status` étendu.
- Web : jauge, refus, `CopilotBlockedNotice`, `data` des erreurs SSE.
- Super-admin : solde, journal, crédits offerts, dérogations, coupure forcée,
  mode (`SHADOW` puis `ENFORCE`).
- Tests : concurrence sur base réelle (CA-08), règle de consommation (CA-09),
  orphelines (CA-10), phases et modes (CA-13, CA-14), pannes (CA-40), isolation,
  web (CA-37).
- **Sortie** : `SHADOW` en production, deux semaines d'observation des blocages
  qui auraient eu lieu.

### C — Packs mensuels et achat en libre-service (taille M, 6 à 9 j)

- Migration `ia_credits_catalogue` (la clé `AI_REQUESTS` existe depuis le lot B,
  avec `FLOW_CAPACITY_KEYS` et son test de garde) ; `ai-pack-service.ts` ; lots `PACK_MONTHLY` ; routes d'agence et écran (packs,
  offres) ; plancher de marge côté super-admin.
- Tests : achat, unicité, montée et descente, prorata, cycle annuel, refus
  (essai, lecture seule, hors `ENFORCE`), entitlements inchangés (CA-19 à CA-23).

### D — Dépassement facturé avec plafond et alertes (taille L, 8 à 12 j)

- Migrations `ia_credits_enum_usage` puis `ia_credits_depassement` ; opt-in et
  plafond ; réservation de dépassement (FR-062) ; `ai-overage-billing-service.ts` ;
  `markOverdueInvoices` et avoir étendus ; PDF et libellés ; alertes du plafond ;
  écran (dépassement) ; suspension pour impayé.
- Tests : plafond exact (CA-24), alertes idempotentes (CA-25), facture (CA-26),
  suspension (CA-27), avoir et mois rouvert (CA-31).

### E — Recharges prépayées (taille L, 8 à 12 j)

- Migrations `ia_credits_enum_topup` puis `ia_credits_recharges` ;
  `ai-topup-service.ts` ; modifications de `startInvoiceCheckout`,
  `settlePlatformInvoiceTx`, `applyPaymentToSubscriptionTx` ; purge ; avoir ;
  écran (recharge, retour de paiement).
- Tests : règlement et rejeu d'IPN (CA-28), **abonnement `PAST_DUE` inchangé**,
  série `IMT` sans trou (CA-30), quantités (CA-29), simulateur PaySecureHub de
  bout en bout.

## 8. Vérifications et recette

À la fin de chaque lot : `npm run typecheck` (aucune erreur ajoutée dans un
fichier propre), `npm run lint`, `npm test`, `npm run test:web` sur les fichiers
touchés, `npm run test:isolation`, `npm run check:architecture`,
`npm run i18n:extract` (API et web) sans orphelin, `npm run wiki:export` puis
`wiki:check`, suite d'abonnement et de facturation inchangée verte.

**Recette** : scénario rejouable avec le faux fournisseur (usage déterministe) et
le simulateur PaySecureHub : gratuit jusqu'à zéro → refus 402 → pack → dépassement
plafonné → recharge → fin de mois (horloge simulée) → facture de dépassement.
Les dates sont injectables (`now`) dans tous les services pour ne pas dépendre de
l'horloge.

**Charge** : 50 agences, 20 requêtes simultanées par agence, base réelle ; aucune
saturation du pool, réservation p95 mesurée (FR-123).

## 9. Inventaire des fonctionnalités à ajouter (wiki)

À reporter dans `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx`
(`npm run wiki:export`) par lot ; fonctionnalités **existantes** modifiées :
« Assistant IA ImmoCopilot » (`Connaître l'état de l'assistant`,
`Discuter avec l'assistant`), « Abonnements par packs » (`Ajouter un pack`,
factures, avoirs, paiement en ligne). **Nouvelle fonctionnalité « Crédits IA »** :

| Lot | Sous-fonctionnalités                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Mesurer chaque requête (interne) ; consulter l'usage et le coût (super-admin) ; gérer le tarif des modèles ; régler taux de change et mode                                                                                   |
| B   | Voir sa jauge de requêtes ; recevoir un refus 402 typé ; éteindre l'assistant pour l'agence ; consulter solde et journal (super-admin) ; accorder des crédits offerts ; déroger par agence ; couper l'assistant d'une agence |
| C   | Consulter les offres IA ; souscrire, changer, retirer un pack IA ; consulter l'écran « Assistant IA »                                                                                                                        |
| D   | Activer le dépassement et fixer son plafond ; recevoir les alertes 80/100 % ; consulter la facture de dépassement ; suspension pour impayé                                                                                   |
| E   | Acheter une recharge ; payer une recharge en ligne ; constater le paiement d'une recharge (super-admin) ; avoir sur une recharge                                                                                             |

Mises à jour des documents : `docs/governance/SECURITY.md` (minimisation, jetons
et coûts réservés au super-admin, mode et tarifs), `docs/workflows/RUNBOOK.md`
(section « Assistant IA » : mode, prix, taux, reprise, balayeur),
`docs/architecture/DATA_MODELS.md`, HANDOFF ; scénario de recette.

## 10. Décisions d'architecture à consigner

- **ADR « Crédits IA d'ImmoCopilot »** (numéro à confirmer au démarrage du lot A :
  004 est pris par l'assistant, 005 par le module Patrimoine sur une autre
  branche et cité par la spec 027 ; modèle `ADR-000-template.md`) : usage en
  table dédiée et non en audit ; portefeuille à lots et journal en ajout seul ;
  réservation sous verrou par agence et **non** `withExclusiveSection` ; mode
  propre à l'IA indépendant de `SUBSCRIPTION_ENFORCEMENT` ; `AI_REQUESTS` hors de
  `CAPACITY_KEYS` ; recharge en brouillon jusqu'au règlement ; fail-closed avant /
  fail-open après.
- Mise à jour de `PLAN-ABONNEMENTS.md` (§7 : les décisions D3, D4, D7, D9, D10 et D12
  s'appliquent aux crédits IA ; écart de D15 nommé, Q15).
