# ImmoCopilot — limiteurs, pool de connexions et jeton de proposition

Note d'exploitation sur ce qui borne l'assistant IA (`packages/api/src/lib/ai`,
`middleware/rate-limit-middleware.ts`). Complète
[PLAN_IMMOCOPILOT.md](PLAN_IMMOCOPILOT.md) et
[ADR-004](adr/ADR-004-assistant-ia-immocopilot.md).

## 1. Limiteurs de débit : par instance, pas partagés

| Limiteur                  | Route                      | Plafond                        | Clé                |
| ------------------------- | -------------------------- | ------------------------------ | ------------------ |
| `aiChatRateLimiter`       | `POST /ai/chat`            | 20 par minute                  | utilisateur+agence |
| `aiChatDailyLimiter`      | `POST /ai/chat`            | 300 par jour                   | utilisateur+agence |
| `aiTenantChatRateLimiter` | `POST /ai/chat`            | `AI_TENANT_MINUTE_LIMIT` (100) | agence             |
| `aiTenantDailyLimiter`    | `POST /ai/chat`            | `AI_TENANT_DAILY_LIMIT` (3000) | agence             |
| `aiActionRateLimiter`     | `POST /ai/actions/execute` | 10 par minute                  | utilisateur+agence |

Ce sont des `express-rate-limit` au magasin par défaut : les compteurs vivent
**dans la mémoire du processus**. Avec N instances d'API, chacune compte à
part, et le plafond effectif est **N × la valeur configurée** (par utilisateur
comme par agence). Un redémarrage remet les compteurs à zéro.

### Pourquoi pas de magasin partagé

Recherche faite dans le code et les dépendances : aucun Redis (ni `ioredis`, ni
`rate-limit-redis`), aucune table Postgres de compteurs, aucun autre magasin
partagé n'existe. Les créer imposerait soit une dépendance et un service
d'infrastructure nouveaux, soit un modèle Prisma (donc une migration et le
classement `schema-tenant-coverage`) écrit à chaque message du chat. Un compteur
en base ajouterait en outre un aller-retour PostgreSQL sur un chemin qui doit
rester léger, et consommerait une connexion du pool étudié plus bas. Le risque
que cela couvre est un coût (appels au fournisseur LLM), pas une fuite de
données : il ne justifie pas ce coût d'infrastructure tant que l'on tourne sur
une ou quelques instances.

### Ce qui est fait à la place

- Au démarrage, **en production et si `AI_PROVIDER` n'est pas `disabled`**, un
  seul avertissement (`console.warn`, comme les autres contrôles de
  `config/env.ts`) rappelle que les plafonds sont comptés par instance et donne
  les valeurs configurées (`lib/ai/pool-guard.ts`, `perInstanceLimitersWarning`).
- Consigne d'exploitation avec N instances : soit fixer une **affinité de
  session** au répartiteur (un utilisateur retombe sur la même instance, ce qui
  rend le plafond par utilisateur exact), soit **diviser** `AI_TENANT_MINUTE_LIMIT`
  et `AI_TENANT_DAILY_LIMIT` par N pour que le plafond total par agence reste
  celui voulu. Les plafonds par utilisateur (20/min, 300/jour, 10/min) sont
  des constantes du code : les revoir si N grandit.
- Ce qui reste **partagé et exact** entre instances : l'usage unique du jeton de
  proposition et l'idempotence des quittances (verrous consultatifs PostgreSQL,
  `lib/ai/advisory-lock.ts`). La limite ne porte que sur les compteurs de débit.

Si l'on dépasse quelques instances, la suite naturelle est un magasin partagé
(Redis + `rate-limit-redis`) derrière les mêmes limiteurs : c'est une décision
d'infrastructure à prendre à ce moment, avec ADR.

## 2. `connection_limit` et pool de connexions

Prisma ouvre un pool par processus. Sans `connection_limit` dans
`DATABASE_URL`, sa taille vaut `2 × nombre de processeurs + 1` : imprévisible
d'une machine à l'autre. Les quittances générées par l'assistant occupent le
pool de façon inhabituelle : chaque section exclusive garde une connexion
« gardienne » (le verrou consultatif) pendant toute la génération, plus au moins
une connexion de travail. `MAX_CONCURRENT_EXCLUSIVE_SECTIONS = 2` par processus
(`lib/ai/pool-guard.ts`, réexporté par `advisory-lock.ts`) borne cela à
**4 connexions** ; les appels en trop attendent en mémoire, sans connexion
(`Semaphore`).

`config/env.ts` contrôle donc `connection_limit` au démarrage, par
`connectionLimitWarnings` (`lib/ai/pool-guard.ts`). Jamais bloquant :

| Cas                                                | Réaction                                         |
| -------------------------------------------------- | ------------------------------------------------ |
| valeur non numérique, décimale, `0` ou négative    | avertissement, toujours (assistant actif ou non) |
| absente, assistant actif                           | avertissement : ajouter `?connection_limit=10`   |
| `< 8` (4 sections exclusives + 4 de trafic), actif | avertissement « trop bas », risque P2024         |
| `>= 8`, ou assistant `disabled` (absente ou basse) | silence                                          |

Le message ne reprend jamais l'URL (elle porte le mot de passe), seulement la
valeur du paramètre, tronquée à 32 caractères. Le seuil recommandé est
`RECOMMENDED_CONNECTION_LIMIT` (8) : à ajuster si `MAX_CONCURRENT_EXCLUSIVE_SECTIONS`
change, et à relever pour le trafic réel de l'API.

### Comportement mesuré en cas de saturation

Prouvé sur PostgreSQL réel par `__tests__/integration/ai-concurrency-pool.test.ts`
(instance à pool minuscule, `pool_timeout=2`) :

- **Aucune requête ne reste suspendue.** Pool entièrement occupé de l'extérieur :
  les 6 confirmations concurrentes échouent après `pool_timeout` (bien avant la
  fin du blocage) ; pool de 2 connexions et 10 quittances distinctes : les 10
  échouent en un peu plus de 10 s au total (attente de pool, puis délai
  d'attente du verrou). Le pool est libre ensuite (aucune connexion « idle in
  transaction » ne traîne) et une requête normale aboutit.
- **Refus « propre », mais ni 429 ni 503.** L'erreur Prisma (`P2024`, ou `P2028`
  pour une transaction) est convertie par `executeRentalDocument` en
  `BadRequestError('La génération du document a échoué.')`, donc **HTTP 400**
  `BAD_REQUEST`, sans détail interne (détail journalisé). Si elle survient
  pendant la réclamation du jeton (`redeemProposal`), elle remonte brute au
  gestionnaire global, qui la masque en 500 générique ; le jeton n'est alors pas
  consommé. Le client ne peut donc pas distinguer « pool saturé, réessayez »
  d'un échec de génération. **Amélioration possible** (non faite : elle touche
  le catalogue i18n, en conflit avec une autre branche) : détecter
  `P2024`/`P2028` et répondre 503 `SERVICE_UNAVAILABLE`.
- Les limiteurs de débit ne protègent pas du pool : ils comptent les requêtes,
  pas les connexions. Le pool est protégé par le plafond de sections (2) et par
  `connection_limit`.

## 3. Jeton de proposition consommé après un échec : fail-closed voulu

`executeRentalDocument` réclame le jeton (`redeemProposal`, usage unique) **avant**
de générer, puis revalide et génère. Conséquence : si la génération échoue (modèle
introuvable, DOCX invalide, pool saturé pendant la génération…), le jeton reste
consommé. Le même jeton rejoué reçoit `409 PROPOSAL_ALREADY_USED` ; l'utilisateur
redemande une proposition à l'assistant, qui en signe une nouvelle.

C'est un choix **fail-closed**, assumé :

- l'usage unique est la garantie de sécurité centrale (une confirmation = une
  action, y compris entre instances) ; la rendre « rejouable en cas d'échec »
  exigerait de distinguer les échecs sûrs des échecs partiels (document écrit
  mais réponse perdue), et rouvrirait la double génération ;
- le coût est faible : une proposition se refait en un message, et l'idempotence
  des quittances (une quittance FINAL existante est renvoyée, pas regénérée)
  garantit qu'une nouvelle proposition pour le même paiement ne duplique rien ;
- seule exception : une panne de base **pendant la réclamation** libère la
  réservation mémoire, car rien n'a été écrit : le jeton reste utilisable.

Tests : `ai-concurrency-pool.test.ts` (base réelle : échec de génération, puis
rejeu du même jeton -> 409, aucun document, puis nouvelle proposition -> succès) ;
`ai.execute-action.test.ts` (jeton consommé après un échec de revalidation).

## 4. Tests

```bash
# base jetable dédiée, migrations appliquées d'abord
DATABASE_URL_TEST=... TEST_DATABASE_URL=... DATABASE_URL=... \
  npm test -w @immotopia/api -- --selectProjects api --runTestsByPath \
  __tests__/integration/ai-concurrency.test.ts \
  __tests__/integration/ai-concurrency-pool.test.ts
```

Sans `DATABASE_URL_TEST` égale à `DATABASE_URL`, ces suites s'ignorent
(`describe.skip`) : ce n'est pas une preuve. Piège : `utils/database.ts`
réutilise `globalThis.prisma` hors production ; pour simuler plusieurs instances
avec des pools distincts, ces tests le retirent avant de charger les modules
isolés (sinon toutes les « instances » partagent le pool du test).
Tests unitaires : `ai.pool-guard.test.ts`, `env-ai-pool-warnings.test.ts`.
