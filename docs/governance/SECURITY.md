# Modèle de menace — ImmoTopia

En cas de désaccord avec [AGENTS.md](../../AGENTS.md), AGENTS.md prime. Ce
document décrit les mécanismes de sécurité **tels qu'implémentés
aujourd'hui**, avec leur fichier, pas un objectif. L'état détaillé de la
dette de sécurité est dans [AUDIT_CODE.md](../../AUDIT_CODE.md) (section 2) ;
ce document n'en reproduit que ce qui reste vérifiable et pertinent pour
la conduite à tenir.

## 1. Actifs à protéger

- **Données des agences** (tenants) : biens, contacts CRM, baux, données
  financières et comptables, isolées entre agences (`tenantId`).
- **Pièces jointes privées** : baux, preuves de paiement de loyer,
  justificatifs de pénalité, pièces jointes de maintenance, documents
  syndic.
- **Identifiants et secrets** : mots de passe (hashés), jetons de session,
  clés API tierces (paiement, notification), stockés via des variables
  d'environnement validées (`src/config/env.ts`).
- **Paiements** : transactions PaySecureHub (loyers et abonnements
  plateforme), clés API d'agrégateur par agence.
- **Données personnelles** des utilisateurs, clients de portail
  (locataires, propriétaires, copropriétaires) et contacts CRM.

## 2. Acteurs

- **Utilisateur d'agence** : membre authentifié d'un tenant, droits
  déterminés par son rôle (`services/permission-service.ts`).
- **Super-administrateur plateforme** (`globalRole === 'SUPER_ADMIN'`) :
  contourne les contrôles tenant par conception
  (`middleware/tenant-middleware.ts`, `middleware/subscription-feature-middleware.ts`) —
  compte à protéger en priorité absolue.
- **Client de portail** : locataire, propriétaire ou copropriétaire,
  authentifié mais cantonné à ses propres objets via
  `middleware/tenant-portal-access.ts`, `owner-portal-access.ts`,
  `coowner-portal-access.ts`.
- **Anonyme** : accès aux routes publiques volontaires uniquement
  (authentification, pages de simulateur de paiement, IPN de webhook —
  liste blanche explicite dans `__tests__/unit/routes-inventory.test.ts`).
- **Webhooks tiers** : notifications IPN PaySecureHub, webhook WhatsApp —
  non authentifiés par nature, traités comme entièrement non fiables (§6).

## 3. Authentification

JWT (`utils/jwt-utils.ts`), lu depuis un cookie `httpOnly` `accessToken`
en priorité, avec repli sur l'en-tête `Authorization: Bearer` pour les
clients API (`middleware/auth-middleware.ts`). Aucun jeton n'est stocké en
`localStorage` côté client. Les refresh tokens sont conservés hashés
(SHA-256) en base, pas en clair. Le secret JWT est validé au démarrage par
`src/config/env.ts` : longueur minimale de 32 caractères et rejet explicite
des valeurs d'exemple connues (`PLACEHOLDER_SECRETS`) — le process ne
démarre pas sinon.

`revokeTenantSessions` (`middleware/session-invalidation.ts`) révoque en
masse les refresh tokens actifs d'une agence, utilisé à la suspension d'un
tenant.

## 4. Isolation multi-tenant et IDOR

Trois lignes de défense, dans l'ordre où une requête les traverse :

1. **Contexte posé à l'entrée** : `requireTenantAccess`
   (`middleware/tenant-middleware.ts`) résout et pose `req.tenantContext`
   à partir de la session, jamais d'un paramètre fourni par le client sans
   vérification.
2. **Vérification d'appartenance avant écriture** : `assertBelongsToTenant`
   (`utils/tenant-ownership.ts`) pour un identifiant reçu dans le corps
   d'une requête (`siteId`, `contactId`, utilisateur assigné…) ;
   `getPropertyForTenant` (`utils/property-tenant-guard.ts`) et
   `enforcePropertyTenantIsolation`
   (`middleware/tenant-isolation-middleware.ts`) pour les biens et leurs
   enfants, qui ne portent pas `tenantId` en base. Une référence vers une
   autre agence lève `NotFoundError` — la même erreur qu'un objet
   inexistant, pour ne jamais confirmer l'existence d'une ressource
   étrangère.
3. **Filet de sécurité au niveau Prisma** : `utils/prisma-tenant-guard-extension.ts`,
   activée par `TENANT_GUARD_MODE` (`off` / `warn` par défaut / `enforce`).
   Dérive du schéma (`Prisma.dmmf`) la liste des modèles porteurs de
   `tenantId`/`tenant_id` et vérifie, pour chaque requête exécutée dans un
   contexte tenant, que le `where` nomme le tenant et qu'aucune ligne
   renvoyée n'appartient à une autre agence. En mode `warn`, journalise
   sans bloquer ; en `enforce`, lève une erreur générique 500 côté client
   (le détail reste dans les logs). Des modèles enfants sans champ
   `tenantId` propre existent (`SyndicateLot`, `ChargeCall`,
   `GeneralMeeting`, lignes d'écriture comptable…) : cette extension ne
   peut pas les couvrir directement, il faut vérifier le parent d'abord.

Un middleware plus ancien, `middleware/property-ownership-middleware.ts`,
n'est monté sur aucune route à ce jour : ne pas s'y fier comme garde
active, le contrôle réel pour les biens passe par
`enforcePropertyTenantIsolation` + `getPropertyForTenant`.

**Filet en sortie** : `middleware/response-sanitizer-middleware.ts`
retire récursivement `passwordHash`/`password_hash`/`tokenHash`/`token_hash`
de tout corps JSON avant l'envoi, y compris si un `include: { user: true }`
s'était glissé quelque part. C'est un filet, pas une autorisation à
utiliser `include` — la règle reste : toujours un `select` explicite sur
`User`.

**Garde-fous automatisés** : `__tests__/unit/routes-inventory.test.ts`
(toute route doit porter une garde tenant/portail/plateforme, sauf liste
blanche explicite) et `__tests__/unit/schema-tenant-coverage.test.ts`
(tout modèle Prisma doit être classé cloisonné/enfant/global). L'étanchéité
de bout en bout se vérifie avec `npm run test:isolation`, qui utilise une
base dédiée (`DATABASE_URL_TEST`).

### Journal d'audit

Deux niveaux (agence, plateforme) dans une seule table, décrits dans
[ADR-006](../architecture/adr/ADR-006-audit-deux-niveaux.md). Ce qui protège
le journal lui-même :

- l'agence ne lit que ses lignes `visibility = TENANT`, par un lecteur unique
  (`audit-read-service.ts`) qui pose `tenantId` lui-même ; le personnel de la
  plateforme y apparaît sans identité, IP ni navigateur ;
- un déclencheur refuse `UPDATE` et `DELETE` (la purge de rétention passe par
  `audit_logs_purge`, 180 jours minimum, partitions scellées seulement) ;
- des scellés quotidiens chaînés (racines de Merkle) détectent une ligne
  modifiée, supprimée ou une chaîne réécrite : `GET /api/admin/audit/integrity`,
  job quotidien, alerte `AUDIT_INTEGRITY_FAILED` ;
- **limite** : les scellés sont dans la même base ; un compte qui peut tout
  réécrire peut recalculer la chaîne. Ancrer la tête de chaîne hors de la base
  ([RUNBOOK](../workflows/RUNBOOK.md), « Journal d'audit »).

## 5. Fichiers privés

`middleware/uploads-access-middleware.ts` s'exécute avant
`express.static` sur le mont `/uploads` et n'autorise qu'une liste blanche
exacte de chemins publics par nature (médias de bien, logos d'agence,
images WhatsApp) ; tout le reste répond 404, avec ou sans session — même
réponse qu'un fichier inexistant, pour ne rien laisser deviner. Chaque
document privé (bail, preuve de paiement, pièce jointe de maintenance,
document syndic) sort par une route authentifiée qui vérifie le droit de
l'appelant sur l'objet précis, jamais par le mont statique.

Une réponse de portail ne porte jamais de chemin disque ni d'identifiant
de stockage `/uploads/...` d'un fichier privé : les services de portail
utilisent un `select` explicite avec, le cas échéant, un `downloadPath`
relatif à l'API (`lib/files/portal-files.ts`). Garde-fou automatisé :
`__tests__/api/portal-no-disk-paths.test.ts`. Ce point a fait l'objet d'un
correctif récent (commit `fix(portails): aucune réponse de portail ne
porte de chemin disque`), après qu'un `select` implicite avait exposé le
chemin absolu de plusieurs types de documents.

`PropertyDocument.tenantId` peut être `null` sur d'anciennes lignes
(héritage) ; certaines requêtes appliquent donc le motif
`OR: [{ tenantId }, { tenantId: null }]` pour continuer à trouver ces
documents historiques. Ce motif n'est sûr que si `propertyId` a déjà été
vérifié comme appartenant au tenant courant avant la requête (par exemple
via une lecture de `Property` scopée par `tenantId`) : une ligne
`tenantId: null` n'est alors accessible que si elle est rattachée à un bien
déjà confirmé dans l'agence. Sans cette vérification préalable, ce serait
une fuite inter-agence. Suivent ce motif `lib/properties/document-files.ts`
et `lib/patrimoine/owner-portal-view.ts`.

## 6. Webhooks de paiement

Les notifications IPN de PaySecureHub
(`controllers/payment-gateway-public-controller.ts`) sont montées **avant**
les routeurs authentifiés (`app.ts`) et ne sont, par construction, jamais
crues sur parole : le contenu de la requête entrante ne sert qu'à
retrouver la référence du paiement, puis à déclencher une réconciliation
serveur-à-serveur (`reconcileCheckoutPublic`, `reconcilePlatformCheckoutPublic`)
qui redemande le statut réel à l'agrégateur avec la clé de l'agence. Le
handler répond toujours `200`, y compris pour un code inconnu, afin de ne
rien révéler à un tiers qui fabriquerait une fausse notification. Un
`webhookRateLimiter` dédié (120 requêtes/minute,
`middleware/rate-limit-middleware.ts`) s'applique sur ces routes ainsi que
sur le webhook WhatsApp.

**Aucune vérification de signature cryptographique ni de filtrage par
adresse IP source de l'IPN n'est en place** — ce point est documenté comme
non traité dans `docs/integrations/paysecurehub.md` lui-même (§ « Non
couvert », point 3), pas seulement observé ici. Le modèle de réconciliation
serveur-à-serveur limite l'impact d'une IPN forgée (elle ne peut que
déclencher une vérification, jamais imposer un statut), mais n'empêche pas
un tiers de provoquer des appels superflus vers l'agrégateur.

Le **lien de paiement d'une échéance** (spec 039) ne change rien à ce modèle : il crée les
checkouts, l'IPN et la réconciliation les confirment. L'URL de retour du fournisseur pointe sur la
page publique `/payer/statut?paiement=<code>`, qui interroge la route de statut
(`POST /api/public/secure-links/installment-payment/status`) ; cette route réconcilie
serveur à serveur et ne croit jamais l'URL de retour. La création concurrente de checkouts pour une
même échéance est sérialisée par un verrou consultatif PostgreSQL, qui relit le reste dû sous le verrou (voir « 12 bis »). La route de statut a son propre limiteur (90 par minute et par IP) et réserve la réconciliation par une écriture atomique de `lastCheckedAt`.

## 7. Assainissement des entrées

- Validation Zod en entrée de la quasi-totalité des routes récentes
  (`.parse()`/`.strict()` — voir
  [CODING_STANDARDS.md](CODING_STANDARDS.md) §2.6) ; Zod élimine par
  construction les clés non déclarées d'un corps de requête (pas de mass
  assignment).
- `middleware/validation-middleware.ts` sanitize en plus les chaînes du
  corps (`sanitizeString` : retire `<`, `>`, le protocole `javascript:`,
  les attributs `on*=`) pour les routes qui passent par `validate(schema)`
  (`auth-routes.ts`, `crm-routes.ts`). **Conséquence pour la connexion** :
  `validate(loginSchema)` nettoie aussi le champ `password` (et l'e-mail) avant
  la comparaison. Un mot de passe contenant `<`, `>`, `javascript:` ou un motif
  `onxxx=`, ou commençant ou finissant par une espace, ne se compare donc jamais
  tel quel : haché tel que saisi puis comparé sous sa forme nettoyée, le compte
  ne pourrait plus se connecter. Le seed du premier SUPER_ADMIN
  (`prisma/seeds/create-platform-super-admin.ts`, validation dans
  `utils/bootstrap-admin-input.ts`) refuse ces mots de passe, en plus de 12
  caractères minimum, 72 octets au plus (limite de bcrypt) et des règles de
  robustesse de la plateforme, et valide l'e-mail comme la connexion. Sa fonction
  `sanitizeLikeLogin` **reproduit** `sanitizeString` : toute modification de
  celle-ci doit être répercutée, et `__tests__/unit/bootstrap-admin-input.test.ts`
  exécute le vrai middleware de connexion pour échouer si les deux divergent.
- Aucune injection SQL : les rares `$queryRaw` du code sont en template
  tagué (paramétrage automatique par Prisma), jamais en concaténation de
  chaîne.
- Le HTML de newsletter est assaini côté serveur avec DOMPurify
  (`services/newsletter-campaign.service.ts`) avant stockage et envoi.
- Côté web, aucun contenu utilisateur ne passe par
  `dangerouslySetInnerHTML` ; le seul rendu de HTML utilisateur (aperçu de
  newsletter) est isolé dans une `<iframe sandbox>`
  (`pages/newsletter/NewsletterCampaignsPage.tsx`).
- `uploadsAccessGuard` rejette explicitement les tentatives de traversée
  de chemin (`..`, octet nul) avant toute résolution de fichier.

## 8. Secrets et configuration

Toute variable d'environnement passe par `src/config/env.ts` (schéma Zod,
validé une fois au démarrage, échec rapide si un secret est absent, trop
court ou reprend une valeur d'exemple). `env.example` ne doit contenir que
des valeurs vides ou factices — jamais une valeur réelle, jamais lue par
un agent ou un outil dans ce dépôt.

**`VITE_*` est public par construction** : toute variable ainsi préfixée
est intégrée en clair dans le bundle JavaScript livré au navigateur
(`apps/web/src/config/api.ts`). N'y placer aucun secret.

**Un fichier de secrets par environnement.** Le staging
(`app.immotopia.cloud`) et la production (`clients.immotopia.cloud`) tournent
sur le même serveur, chacun dans sa pile, avec son fichier hors dépôt
(`/home/deployer/immotopia-saas.env`, `/home/deployer/immotopia-prod.env`,
mode 600) et ses propres `JWT_SECRET`, mot de passe Postgres et
`PAYMENT_SECRETS_KEY` (la clé qui chiffre les clés de paiement des agences ; à
sauvegarder hors serveur, sa perte les rend illisibles). `deploy.sh prod` refuse
un `JWT_SECRET`, un mot de passe Postgres ou une `PAYMENT_SECRETS_KEY` identique
à celui du staging (comparaison d'empreintes, rien n'est affiché), et refuse de
déployer si le fichier du staging est illisible (l'unicité ne serait pas
prouvée). Il refuse aussi `PAYMENT_GATEWAY_SIMULATOR=1`, **quelle que soit son
écriture** (`export … = "1"` compris), un fichier où une clé critique est
définie plusieurs fois (Compose applique la dernière occurrence : les contrôles
lisent la même, et un doublon ajouté en fin de fichier ne les contourne pas), un
mot de passe Postgres de moins de 24 caractères ou contenant `REMPLACER`, et un
`JWT_SECRET` contenant `REMPLACER`. Les clés d'intégration (e-mail, SMTP, Twilio,
WaSender, Google, Anthropic, OpenRouter, PaySecureHub) identiques à celles du
staging donnent un avertissement, de même qu'une clé renseignée dans le fichier
du staging : celui-ci ne porte aucun identifiant de la production (messagerie,
SMS, WhatsApp, IA, compte de paiement), un essai n'y doit jamais joindre de
vraies personnes. Les scripts purgent les variables héritées du shell
(`STACK_NAME`, `WEB_PORT`, `POSTGRES_PASSWORD`…) : un réglage oublié dans une
session ne peut pas viser la mauvaise pile ; `IMMOTOPIA_ALLOW_OVERRIDE=1`, réservé
aux essais locaux, est refusé pour la production par `deploy.sh` et
`bootstrap.sh`. Décision :
[ADR-005](../architecture/adr/ADR-005-environnements-staging-production.md) ;
procédure : [DEPLOIEMENT.md](../workflows/DEPLOIEMENT.md).

**Déployer la production.** `deploy.sh prod` prouve l'état git au lieu de le
supposer : git utilisable, version identifiable, arbre propre, `origin/main`
présent et `HEAD` dedans, sinon échec ; `HEAD` et l'arbre sont revérifiés juste
avant la construction des images et juste avant les migrations. Un verrou
(`flock`, `/tmp/immotopia-deploy.lock`) n'autorise qu'un `deploy.sh` à la fois.
Dès que la base est initialisée, un `db-*.sql.gz` de moins de 24 heures doit
exister dans `BACKUP_DIR` avant toute migration (aucune exigence au tout premier
déploiement) ; le contrôle ne porte que sur l'existence d'un fichier récent, pas
sur sa validité (voir §13).

**Premier compte SUPER_ADMIN.** `infra/scripts/bootstrap.sh` recueille toutes les
saisies (e-mail deux fois, nom, confirmation, mot de passe deux fois sans écho)
**avant** la première écriture : sans terminal ou en cas d'abandon, rien n'est
écrit. Le mot de passe est transmis par un tube à l'entrée standard du seed, ni en
argument, ni dans l'environnement, ni sur disque, ni affiché. Le seed ne fait que
créer : un e-mail déjà présent est refusé, sans promotion ni changement de mot de
passe (règles de validation : §7).

**Seeds de développement.** L'image `migrate` embarque tout
`packages/api/prisma/seeds/`. Six seeds à comptes ou mots de passe connus, ou à
suppressions, refusent `NODE_ENV=production` (code de sortie 1) par la garde
`prisma/seeds/assert-not-production.ts` : `create-super-admin.ts`,
`seed-quick-login-users.ts`, `seed-comprehensive-data.ts`, `seed-crm-data.ts`,
`seed-tenant-members.ts`, `seed-users.ts`. Les `seed-demo-*.ts` ne sont **pas**
gardés (§13). Le bundle web de production est, lui, refusé au build s'il contient
un identifiant de démonstration (`infra/compose/Dockerfile.web`).

## 9. Réseau

CORS à origine unique : `middleware/cors-middleware.ts` n'autorise que
`FRONTEND_URL`, avec les cookies (`Access-Control-Allow-Credentials`)
seulement pour cette origine ; une requête sans en-tête `Origin` (client
API direct) reçoit un CORS ouvert sans identifiants. Helmet est actif
(`app.ts`). Rate limiting par route sensible (inscription, connexion, mot
de passe oublié/réinitialisé, renvoi de vérification, acceptation
d'invitation, rafraîchissement de session — `middleware/rate-limit-middleware.ts`)
plus un plancher global (`globalApiRateLimiter`) et le limiteur webhook
dédié (§6).

Les deux environnements sont cloisonnés : chaque pile a sa base, ses volumes et
son réseau Docker, ses ports ne sont publiés que sur `127.0.0.1` (le nginx de
l'hôte est la seule porte d'entrée, un vhost et un certificat par
sous-domaine), le service `api` ne publie aucun port (il n'est joignable que par
le réseau interne de la pile, à travers le nginx de l'image web) —
`infra/scripts/check-infra.sh` vérifie ces deux points sur le rendu Compose —, et
les cookies d'authentification sont posés sans attribut `domain`
(`utils/auth-cookies.ts`) : une session ouverte sur un sous-domaine n'existe pas
sur l'autre. Le CORS n'autorise que le `FRONTEND_URL` de la pile.

**En-têtes HTTP du nginx embarqué** (`infra/nginx/spa.conf`, les deux piles) :
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` et
`Referrer-Policy: strict-origin-when-cross-origin`. Dans nginx, un `add_header`
défini dans un `location` annule l'héritage de ceux du niveau supérieur : les
trois lignes sont répétées dans chaque `location` qui en définit un, et tout
nouveau `location` avec `add_header` doit faire de même. Pour `/api/`, `/uploads/`
et `/health`, nginx masque (`proxy_hide_header`) ceux que Helmet pose déjà, pour
n'émettre qu'un jeu. **Éprouvé en local** (image web réelle, faux upstream imitant
Helmet, 2026-09-29) : `nginx -t` valide, trois en-têtes sur le SPA, les assets et
les icônes, un seul jeu sur l'API. **À confirmer** derrière le nginx de l'hôte, en
HTTPS : la commande de vérification est dans
[DEPLOIEMENT.md](../workflows/DEPLOIEMENT.md).

Le conteneur jetable de `infra/scripts/restore-check.sh` contient une copie
complète de la base et tourne en authentification `trust` : il est lancé sans
aucun réseau (`--network none`, injoignable de l'hôte comme des autres
conteneurs) et supprimé avec son volume anonyme (`docker rm -f -v`), suppression
vérifiée avant d'être annoncée (avertissement avec la commande à lancer sinon).
Éprouvé en local le 2026-09-29 (restauration réussie, conteneur et volume
supprimés, nombre de volumes Docker inchangé) ; à refaire sur le serveur.

## 10. Protection des données personnelles

- Les mots de passe sont hashés (bcrypt).
- `forgot-password` ne révèle jamais si un compte existe pour l'e-mail
  fourni.
- Les jetons de réinitialisation et de vérification sont à usage unique et
  expirent.
- `response-sanitizer-middleware.ts` (§4) empêche qu'un champ sensible
  (`passwordHash`, `tokenHash`) fuite dans une réponse JSON, quelle que
  soit la cause.
- Les catalogues de traduction et les gabarits de document ne portent
  aucune donnée personnelle : ce sont des textes d'interface.

## 11. Conduite à tenir en cas de faille

Aucune procédure formelle d'astreinte ou de notification n'est
documentée dans le dépôt à la date de rédaction (voir « Points ouverts »).
En l'absence de procédure dédiée, appliquer par défaut :

1. Isoler : révoquer les sessions concernées
   (`revokeTenantSessions`, `middleware/session-invalidation.ts`) et, si
   un secret est compromis, le faire tourner (nouveau `JWT_SECRET` invalide
   tous les jetons existants au redémarrage).
2. Qualifier l'ampleur : une agence, plusieurs, ou une donnée plateforme —
   distinguer une fuite intra-tenant (bug applicatif) d'une fuite
   inter-tenant (IDOR, faille de l'extension Prisma).
3. Corriger la cause avant de rouvrir l'accès, avec un test de
   non-régression dans `__tests__/unit` ou `__tests__/api` qui aurait
   détecté la faille (modèle : `__tests__/api/portal-no-disk-paths.test.ts`).
4. Consigner l'incident et sa correction dans le changelog de sécurité du
   projet (à défaut d'outil dédié, un commit `fix(sécurité): ...` explicite
   et daté).

## 12. Assistant IA (ImmoCopilot)

Assistant conversationnel intégré à la coquille d'agence
(`lib/ai/*`, `routes/ai-routes.ts`, `controllers/ai-controller.ts`). Décision et
alternatives : [ADR-004](../architecture/adr/ADR-004-assistant-ia-immocopilot.md).
Plan de réalisation : [PLAN_IMMOCOPILOT.md](../architecture/PLAN_IMMOCOPILOT.md).

**Désactivé par défaut.** `AI_PROVIDER=disabled` : `GET /ai/status` répond
`enabled: false`, le bouton est masqué, `POST /ai/chat` et
`POST /ai/actions/execute` (comme `/reject`) répondent 503 `AI_DISABLED`. Le faux fournisseur
(`fake`) n'est accepté que si la variable **brute** `NODE_ENV` vaut
explicitement `development` ou `test` (`config/env.ts`) : `NODE_ENV` absent,
`production` ou `staging` le refuse au démarrage (un déploiement qui oublie
`NODE_ENV` ne peut pas l'activer) ; quand il est actif, un avertissement est
écrit au démarrage. `anthropic` exige `ANTHROPIC_API_KEY`, `openrouter` exige
`OPENROUTER_API_KEY` et un identifiant de modèle OpenRouter (`AI_MODEL`), sans
valeur par défaut pour les clés.

**Réglage par le super-admin ; clés en environnement.** Fournisseur, modèle,
effort et repli se choisissent dans l'administration de la plateforme
(`/api/platform/ai-settings`, table `platform_ai_settings`, prioritaire sur
`AI_*` qui servent de défauts). Routes gardées par `requirePermission('PLATFORM_TENANTS_*')`
et `requireSuperAdmin` (rôle relu en base). Les clés API (`OPENROUTER_API_KEY`,
`ANTHROPIC_API_KEY`) ne sont **jamais** stockées en base ni renvoyées : la
réponse n'indique que leur présence. Chaque modification est auditée
(`AI_SETTINGS_UPDATED`, sans secret). La règle « `fake` interdit en production »
vaut aussi à l'exécution, et un fournisseur sans clé désactive l'assistant
plutôt que de planter.

**Transfert de données personnelles : décision juridique.** Avec
`AI_PROVIDER=anthropic` ou `openrouter` (qui relaie en plus vers le fournisseur du
modèle choisi, second sous-traitant à couvrir), le texte saisi et les résultats d'outils quittent
l'infrastructure pour le fournisseur du modèle. Ces résultats contiennent des
données personnelles (nom du locataire principal, montant et période d'une
quittance) et des données commerciales (références, adresses, prix). Activer
l'assistant en production est une **décision juridique et contractuelle**
(accord de traitement, information des agences, base légale), à prendre avant
de poser la clé ; ce n'est pas un réglage technique.

**Minimisation des données envoyées au fournisseur.**

- Chaque outil renvoie une **projection** explicite (`select`, jamais l'objet
  du service) : jamais d'e-mail, de téléphone, de chemin de fichier
  (`file_path`), de `mm_phone`, de notes ni de propriétaire. Les biens publics
  d'autres agences, que `listProperties` inclut, sont écartés.
- Sorties plafonnées : 10 éléments et 8 Ko par résultat d'outil (`call_read`, la passerelle
  générique, a son propre plafond de 12 000 caractères : voir plus bas).
- Le jeton de proposition n'est jamais renvoyé au modèle : il ne sort que par
  l'événement d'interface `action_proposal`.
- Le contexte d'écran (page courante) est vérifié côté serveur (entité de
  l'agence, permission de l'outil correspondant) et réduit à une référence
  assainie : jamais le titre ni un texte libre. Un chemin d'une autre agence est
  ignoré.
- Aucune conversation n'est persistée ni conservée dans le navigateur. Les
  journaux d'audit ne contiennent ni le texte des messages ni celui des
  réponses.
- Les journaux de `generateDocument` et du contrôleur de génération n'écrivent
  plus de numéro de téléphone ni de `filePath` en clair : des booléens
  (`hasX`) disent seulement si la valeur existe.

**Jamais d'écriture depuis le chat.** L'orchestrateur (`lib/ai/orchestrator.ts`)
n'importe ni le générateur de documents ni l'exécuteur : les outils du registre
sont en lecture, ou préparent une proposition qui n'écrit rien
(`propose_rental_document`, `plan_write`). Cet outil ne signe une proposition que pour un
`leaseId` **vu** dans la même requête : identifiant renvoyé par un résultat
d'outil (`search_leases`, `list_lease_documents`) ou issu du contexte d'écran
vérifié. Sinon il répond `NOT_POSSIBLE` (raison `lease_not_seen`) : un contenu
injecté ne peut pas faire proposer un document pour un bail que l'utilisateur
n'a pas vu. Un outil demandé par le modèle hors du registre
autorisé de l'utilisateur est refusé, non exécuté et audité (`AI_TOOL_DENIED`).
Les résultats d'outils et le contexte d'écran sont déclarés **données, pas
instructions** dans l'invite système, première ligne de défense contre
l'injection ; les gardes serveur (aucun outil d'écriture, jeton, confirmation
humaine, permission par outil) sont la vraie protection.

**Artefacts** (`show_artifact`, événement SSE `artifact`). Données d'affichage
seulement (tableau, Markdown, graphique) : l'outil ne lit ni n'écrit rien, il
re-présente des résultats déjà passés par des outils soumis à leurs permissions.
Schéma Zod strict : `id` généré par le serveur, jamais par le modèle ; HTML et
liens `javascript:` refusés ; limites (500 lignes, 20 colonnes, 20 000 caractères
de Markdown, 200 points, 6 séries) ; au-delà de 500 lignes, troncature avec
`truncated: true`. Le web rend le Markdown par un composant sûr
(`SafeMarkdown`), jamais par `dangerouslySetInnerHTML`.

**Passerelle générique en lecture** (`list_capabilities`, `call_read`,
`lib/ai/gateway/*`, plan V2 étape 3). L'assistant consulte tout ce que l'interface
permet de consulter sans un outil par route.

- **Catalogue généré, sans DELETE.** `catalog.generated.json` est produit par
  `npm run ai:catalog` depuis la pile Express réelle : routes d'agence seulement
  (`requireTenantAccess`, préfixe `/api/tenants/:tenantId`). Exclus par construction :
  `/auth`, `/admin`, `/platform`, `/portal`, l'assistant lui-même, les routes publiques
  et les webhooks, **toute route `DELETE`** et toute écriture destructrice déguisée en
  POST (chemin finissant par `/delete`, `/remove`, `/destroy`, `/purge`). Un test échoue
  si le fichier est périmé, si une telle route y figure ou si une route d'agence n'a pas
  d'entrée. Le catalogue est un INDEX : il n'accorde aucun droit.
- **Loopback sous l'identité de l'utilisateur.** `call_read` n'accepte qu'un id GET du
  catalogue, non sensible, et rejoue la requête vers l'API elle-même
  (`127.0.0.1` et `PORT` de `config/env.ts`, jamais une URL ou un hôte fournis par le
  modèle) avec le **même jeton** que la requête de chat (cookie `accessToken` ou
  `Authorization: Bearer`) : pas de compte de service. Toute la chaîne réelle s'applique
  (authentification, accès à l'agence, permission de la route, abonnement, garde Prisma,
  limiteurs ; `X-Forwarded-For` reprend l'IP de l'appelant pour que limiteurs et audit
  voient l'utilisateur) : c'est elle qui fait autorité. Le jeton n'est porté que par une
  fonction du contexte d'outil (`loopbackHeaders`) : jamais journalisé, jamais renvoyé au
  modèle, jamais dans l'audit. `:tenantId` est imposé depuis le contexte ; les autres
  paramètres de chemin sont un UUID ou un jeton simple (`^[A-Za-z0-9_-]{1,64}$`),
  encodés ; la requête est limitée à 20 clés de valeurs primitives. L'URL de base ne se
  change que par `setLoopbackBaseUrlForTests`, refusé hors `NODE_ENV=test`.
- **Données sensibles.** Les chemins évoquant un secret (secret, token, credential,
  password, api-key, webhook, jwt, invitation, session de connexion, passerelle de
  paiement, lien sécurisé…) sont marqués `sensitive` : absents de `list_capabilities`,
  refusés par `call_read` (même refus qu'un id inconnu). En plus, toute clé de la
  réponse dont le nom évoque `password`, `secret`, `token`, `apiKey`, `authorization`,
  `hash`, `credential`, `cookie` est remplacée par `[masqué]` à toute profondeur, ainsi
  qu'un JWT ou un `Bearer …` égaré dans une valeur ; `iban` et `rib` restent visibles
  (données métier). C'est un filet : les `select` explicites des services restent la règle.
- **Plafonds.** Délai 10 s, abandon avec la connexion du chat, redirections non suivies,
  JSON seulement (sinon « contenu non textuel, non affiché »), 2 Mio lus au plus
  (au-delà : 413 renvoyé au modèle, qui doit filtrer ou paginer). Avant retour au
  modèle : tableaux de plus de 50 éléments, chaînes de plus de 500 caractères,
  objets de plus de 100 clés et profondeur au-delà de 6 tronqués ; total d'environ
  12 000 caractères (paliers de plus en plus stricts, `truncated: true`). Erreur HTTP :
  `{ ok: false, status, message }`, sans pile. Le contenu renvoyé est une donnée, jamais
  une instruction (invite système, règle 2 et règle de la passerelle).
- **Permission des outils.** `PROPERTIES_VIEW`, comme `show_artifact` : la plus faible des
  permissions de lecture (socle CORE). Elle n'ouvre rien par elle-même, la route appelée
  vérifie la sienne ; limite connue : un rôle sans `PROPERTIES_VIEW` ne reçoit pas la
  passerelle. `list_capabilities` filtre selon les permissions que le catalogue connaît
  (gardes `requirePermission` et variantes) et laisse passer le reste.
- **Lecture seule.** `call_read` n'appelle que des routes GET ; les écritures du catalogue
  (POST, PUT, PATCH) ne passent que par `plan_write` puis la confirmation humaine (bloc
  « Écritures génériques » plus bas). Limites : le catalogue ne porte ni schéma de requête ni
  schéma de corps ; une route GET à effet de bord éventuel reste exécutée sous les droits de
  l'utilisateur.

**Jeton de proposition** (`lib/ai/proposal-token.ts`).

- Forme `v1.<claims>.<signature>` : HMAC-SHA256, clé dérivée par HKDF de
  `JWT_SECRET` (faire tourner `JWT_SECRET` invalide les propositions en cours),
  comparaison par `timingSafeEqual`.
- Liée à l'utilisateur (`sub`), à l'agence (`tid`), à l'action et aux arguments
  résolus **par le serveur** (`leaseId`, `paymentId`, `installmentId`, ou
  bail et dates du relevé) : le client ne peut rien modifier.
- Durée `AI_PROPOSAL_TTL_SECONDS` (300 s par défaut, 60 à 900) ; `AI_WRITE_PLAN_TTL_SECONDS`
  (900 s par défaut, 300 à 3600) pour un plan d'écriture. Deux actions portées par le même jeton
  et la même clé : `GENERATE_RENTAL_DOCUMENT` et `EXECUTE_CAPABILITY` ; chaque vérificateur
  refuse le jeton de l'autre (`BAD_CLAIMS`). Taille maximale 16 384 caractères (un plan porte le
  corps de la requête, 8 Ko, en base64url).
- **Usage unique, atomique** : table mémoire (double clic simultané dans le
  processus, sans aller-retour base), puis ligne `AuditLog`
  `AI_PROPOSAL_REDEEMED`. Son `findFirst` puis `create` s'exécutent dans une
  transaction qui détient un verrou consultatif PostgreSQL propre au jeton
  (`pg_advisory_xact_lock(hashtext('ai-proposal:<agence>:<jti>'))`,
  `lib/ai/advisory-lock.ts`) : deux instances d'API, ou un redémarrage entre
  deux requêtes, ne peuvent pas toutes deux voir « absent » puis écrire. Le
  verrou est relâché au commit ou au rollback, jamais orphelin ; aucune
  contrainte d'unicité ni migration. Un rejeu répond 409 `PROPOSAL_ALREADY_USED`.
- Signature, utilisateur ou agence incorrects : le même code
  `PROPOSAL_INVALID` (400) côté client ; l'audit distingue le motif.

**Confirmation d'une quittance** (`POST /ai/actions/execute`, `lib/ai/actions/execute-rental-document.ts`).
Porte de génération de documents (la confirmation d'un plan d'écriture a la sienne, plus bas).
Les permissions `RENTAL_DOCUMENTS_GENERATE` et `RENTAL_DOCUMENTS_VIEW` ne sont plus des gardes de
route (elles dépendent de l'action du jeton) : le contrôleur les vérifie pour cette action, comme le
module « location » de l'abonnement en mode `enforce`. Ordre : signature, expiration,
utilisateur et agence, `RENTAL_DOCUMENTS_GENERATE` **et**
`RENTAL_DOCUMENTS_VIEW` (permissions relues : la carte de résultat renvoie vers
le téléchargement, qui exige VIEW), usage unique, **revalidation de
l'appartenance de chaque identifiant** (bail, paiement, échéance, cohérence
`payment.lease_id`), idempotence, puis `generateDocument`. L'idempotence des
quittances est une section critique **par paiement** (`withExclusiveSection`,
clé `ai-receipt:<agence>:<paiement>`) : file d'attente locale au processus,
puis verrou consultatif PostgreSQL tenu par une transaction gardienne (attente
de connexion 10 s, durée maximale 120 s). Deux jetons distincts pour le même
paiement, même sur deux instances, se suivent : le second voit la quittance
FINAL du premier et la renvoie (`alreadyExisted`). Toute erreur non typée
devient « La génération du document a échoué. » (détail journalisé, jamais
renvoyé).

**Écritures génériques** (`plan_write`, `lib/ai/tools/plan-write.ts`,
`lib/ai/actions/execute-capability.ts`, plan V2 étape 4). L'assistant peut proposer toute écriture
d'agence du catalogue (POST, PUT, PATCH) ; il n'écrit jamais : seule la route de confirmation humaine écrit.

- **Aucune suppression, jamais.** Le catalogue n'a ni `DELETE` ni suffixe destructeur
  (`/delete`, `/remove`, `/destroy`, `/purge`). La règle est revérifiée trois fois : à l'émission
  (`findWritableEntry`), à la lecture des claims du jeton (l'id doit être `POST|PUT|PATCH /api/tenants/:tenantId…`,
  donc un jeton `DELETE` forgé, même signé avec la vraie clé, est refusé comme invalide) et à l'exécution
  (catalogue relu, `isDestructive`, `loopbackWrite` n'accepte que POST, PUT, PATCH).
- **Le plan, pas le récit du modèle.** `title` et `steps` (≤ 120 et ≤ 240 caractères, 1 à 8 étapes, texte
  brut, ni HTML ni caractère de contrôle) sont du texte non fiable du modèle. Ce que l'humain
  approuve est CALCULÉ PAR LE SERVEUR : enregistrement visé (lu par un GET loopback), avant/après champ
  par champ (corps aplati en notation pointée, champs inchangés omis), avertissements, sensibilité. Le
  modèle ne peut fournir aucun de ces champs (schéma strict). Si l'état actuel est illisible (403, 404,
  autre erreur, délai), le plan est refusé : l'utilisateur ne pourrait pas écrire.
  Une action sur une ressource (`/x/:id/verbe`) lit la ressource parente pour nommer la cible. Le plan
  rappelle toujours que « le serveur peut modifier d'autres champs » (dates, statuts, montants calculés).
- **Corps borné.** Objet JSON de 8 Ko au plus (sérialisé), 4 niveaux d'imbrication, clés `__proto__`,
  `constructor`, `prototype` refusées (validé sur la valeur d'origine : Zod écarterait `__proto__` en
  silence). Paramètres de chemin et de requête comme `call_read`. `:tenantId` est imposé par le serveur.
- **Ce que l'humain voit de la requête (audit étape 4).** Tout ce qui part à la route est montré, calculé
  par le serveur depuis la requête signée, jamais par le modèle :
  `pathParams` (`{ name, value }[]`, identifiants bruts hors `tenantId`), `query` (`{ key, value }[]`, valeur
  `[masqué]` si la clé évoque un secret) et `stateReadAt` (ISO, instant de la lecture de l'état « avant »,
  pour juger de sa fraîcheur). Une `query` non vide ajoute l'avertissement « Paramètres envoyés à la route : … »
  ET force `requiresTypedConfirmation` (elle ne figure pas dans les changements). `query`, `pathParams` et
  `stateReadAt` sont dans `displayHash`. `requiresTypedConfirmation` reste la SEULE source pour la saisie du mot
  côté interface ; l'exécuteur le recalcule (chemin, corps, query) et le plan signé le complète (voir
  `requireConfirmation` plus bas).
- **Parent visé par une création imbriquée.** `POST /syndics/:syndicId/charges/batch`, ou une action
  (`/x/:id/verbe`) : le serveur lit par GET loopback la ressource qui porte le dernier paramètre de chemin
  (`lastParamAncestorPath`, ou `parentResourcePath` pour une action) et renseigne `target` (libellé lisible).
  Parent illisible (403, 404, autre erreur, délai) : plan refusé, comme pour une mise à jour. Sans route de lecture
  connue pour ce parent (3 routes du catalogue sur 26 créations imbriquées) : plan accepté, `target` = identifiant
  brut, `resolved: false`, avertissement « n'a pas pu être vérifié ».
- **Liste remplacée.** Le corps remplace un tableau en entier ; comparés par indice, les éléments retirés
  n'apparaîtraient pas. Si un tableau du corps est plus court que celui de l'état, le plan émet un changement de
  niveau liste (`before` « [N éléments] », `after` « [M éléments] »), l'avertissement « Liste remplacée : N éléments
  retirés » et exige le mot. Seul l'état lu à l'émission le sait : le drapeau est donc SIGNÉ
  (`args.requireConfirmation`, inclus dans `planHash` seulement s'il est vrai) et l'exécuteur l'applique ; le retirer
  d'un jeton re-signé rend l'empreinte incohérente.
- **Champ protégé.** Un champ écrit dont le nom évoque un secret : valeur jamais affichée, avertissement
  « Champ protégé : valeur non affichée ».
- **Masquage.** Toute clé évoquant un secret (`password`, `secret`, `token`, `apiKey`, `hash`…) est
  affichée `[masqué]` avant ET après, jamais comparée ; un JWT ou un `Bearer` perdu dans une valeur
  aussi ; les valeurs de plus de 300 caractères sont tronquées à l'AFFICHAGE seulement (avertissement),
  la requête signée reste exacte. `resultPreview` à l'exécution est masqué et réduit comme `call_read`, et les clés `file_path`, `filePath` et `path`
  (chemins disque) en sont retirées à toute profondeur (`stripDiskPaths`).
  Le corps complet voyage dans le jeton, que seul le navigateur de l'utilisateur reçoit : c'est son
  propre contenu, mais ne jamais mettre de secret dans un plan.
- **Plan > 30 changements** : 30 affichés, `changesTruncated`, avertissement, et le mot de confirmation
  devient obligatoire (l'humain ne peut pas lire le reste).
- **Écritures sensibles** (plan en rouge, `sensitive`, `sensitiveReason`, mot `CONFIRMER` à saisir). Test par
  MOT de chemin (segment découpé sur `-`, `_`, majuscules ; singulier ou pluriel ; un paramètre n'est pas
  un mot), liste dans `SENSITIVE_WRITE_WORDS` (`gateway/path-rules.ts`) : paiement (pay, payment, payout,
  refund, transfer, paiement, remboursement, virement, deposit, movement, remise, upgrade, release), envois
  (send, email, mail, sms, whatsapp, notify, notification, remind, relance, campaign, newsletter, envoi,
  convocation, renvoyer, resend), signature (sign, signature), comptabilité (validate, approve, close, cloture,
  lock, verrouiller, invoice, facture, void, annulation, ajustement, billing, issue, ecriture), comptes et droits
  (role, permission, invite, activate, suspend, password, users, disable, enable, revoke), imports et masse (import,
  bulk, batch), changements d'état difficiles à annuler (`lifecycle` : resiliation, termination, terminate, cancel,
  dispose, archive, publish, complete). Suites de mots : `external-access`, `generer-appels`, `generer-manquantes`,
  `billing-runs` ; `status` seulement sur un bail (`/leases/:id/status`). **Sensibilité par le CORPS**
  (`bodySensitivity`) : sur une route `users`, `memberships` ou `collaborators`, une clé `roles`, `role`,
  `permissions`, `isActive`, `status`, `password` ou `email` (à toute profondeur) rend l'écriture sensible même si le
  chemin est banal. `assessWrite` combine chemin, corps et query, à l'identique à l'émission et à l'exécution. Un
  test porte la liste explicite de routes réelles du catalogue (`PATCH /users/:userId`, `…/disable`,
  `…/revoke-sessions`, `external-access`, `deposits/:id/movements`, `billing-runs`, `subscription/upgrade`,
  `…/envoi`, `…/convocation`, `…/verrouiller`, `…/events/termination`, `leases/:id/status`, `…/cancel`, `…/dispose`,
  `…/publish`) et vérifie qu'aucune écriture du catalogue contenant un mot de la liste n'y échappe. **Ce n'est pas
  une liste blanche** : une écriture non classée reste soumise à l'ACCORD SIMPLE (carte, changements calculés par le
  serveur, bouton d'approbation, sans mot à saisir) et la route réelle garde la permission ; un nom de route
  inattendu peut donc passer entre les mailles, d'où la liste large (faux positifs acceptés : un mot de plus à
  saisir). Les chemins évoquant un secret ou un jeton (`reset-password`, passerelle de paiement, liens sécurisés,
  invitations) restent **interdits**, pas seulement renforcés.
- **Jeton `EXECUTE_CAPABILITY`.** Claims `args = { capabilityId, pathParams, query, body, planHash }`,
  liés à `sub`, `tid`, `jti` à usage unique (table mémoire puis `AuditLog` sous verrou consultatif, comme
  les quittances), expiration `AI_WRITE_PLAN_TTL_SECONDS` = 900 s : il faut lire le plan, ses changements et
  saisir un mot (300 s suffisaient pour une carte de quittance, pas pour ceci ; plancher 300 s).
  `planHash` = SHA-256 de la forme canonique de la requête approuvée `{ capabilityId, pathParams, query,
body[, requireConfirmation] }` : les `changes` affichés sont une fonction déterministe de ce corps et de l'état lu, c'est donc
  bien la requête que l'accord autorise. Il est recalculable à partir des seuls arguments : toute
  incohérence (jeton forgé) est refusée avant l'écriture. L'empreinte de ce que l'humain a VU (`displayHash`,
  plan sans jeton) est journalisée à l'émission.
- **Exécution** (`POST /ai/actions/execute`, aiguillée par l'action du jeton lue sans confiance, chaque
  exécuteur revérifie tout). Ordre : signature, expiration, utilisateur, agence → `planHash` recalculé →
  catalogue revérifié (existe, POST/PUT/PATCH, ni destructif ni sensible-interdit) → permissions que le
  catalogue connaît (relues, jeton non consommé si refus) → mot de confirmation si exigé → usage unique →
  **appel loopback** (`127.0.0.1`, `PORT`, méthode, chemin résolu, requête, corps JSON, délai 30 s,
  redirections non suivies, jamais rejoué) avec les **en-têtes d'authentification de la requête de
  confirmation** : l'écriture s'exécute sous l'identité de l'utilisateur QUI CONFIRME et traverse toute la chaîne
  réelle (authentification, accès à l'agence, permission de la route, abonnement, validation du corps,
  garde Prisma, limiteurs, audit propre de la route, `X-Request-Id` repris). Aucun compte de service.
  Mot manquant ou erroné : `CONFIRMATION_REQUIRED` (400) AVANT la réclamation, le jeton n'est PAS consommé
  (l'utilisateur ressaisit dans le délai). Toute autre issue après la réclamation consomme le jeton ; une
  réponse de la route (200, 403, 422…) devient `CapabilityExecutedPayload { ok, status, message, resultPreview }`
  (HTTP 201 si la route a réussi, 200 sinon). Un délai de 30 s répond 504 : l'écriture a pu aboutir, elle n'est
  pas rejouée.
- **Audit.** `AI_PROPOSAL_ISSUED` (`entityType AI_PROPOSAL`) : capabilityId, `planHash`, `displayHash`,
  nature, sensibilité, nombre de changements, `requestId`. `AI_ACTION_EXECUTED` (`entityType AI_CAPABILITY`) :
  qui, agence, capabilityId, `planHash`, statut HTTP, `ok`, `requestId`. `AI_ACTION_REJECTED` : motif
  (`PLAN_HASH_MISMATCH`, `CAPABILITY_NOT_ALLOWED`, `PERMISSION_REVOKED`, `CONFIRMATION_REQUIRED`, `NO_AUTH_HEADERS`,
  motifs du jeton). Jamais le corps brut, ni une valeur, ni un jeton d'accès.
- **Refus d'un plan** (`POST /ai/actions/reject`, `{ proposalToken }`, `rejectActionHandler`). Mêmes middlewares que
  `execute` (authentification, agence, collaborateur, garde de l'assistant, limiteur PROPRE au refus : 30 par minute, compteur séparé de celui des
  confirmations), sans permission de
  génération : refuser n'écrit rien. Vérifie signature, `sub`, `tid`, puis CONSOMME le jeton par le même mécanisme
  d'usage unique (`redeemProposal`) : un plan refusé ne peut plus être confirmé, même volé. Audit
  `AI_PROPOSAL_REJECTED` (action et `capabilityId`, jamais le jeton ni le corps). Idempotent : jeton déjà utilisé ou
  expiré, réponse 200 `{ rejected: false }` sans erreur ; signature, utilisateur ou agence incorrects :
  `PROPOSAL_INVALID` (400), jeton non consommé. La route n'est pas au catalogue (`/ai/` exclu) ; `route-features` la
  classe CORE et lecture-like (`READ_LIKE_POSTS`) : un abonnement en lecture seule ne bloque pas un refus.
- **Abonnement.** `/ai/actions` passe de RENTAL à CORE dans `lib/subscription/route-features.ts` : sinon une
  agence sans module location ne pourrait pas confirmer une écriture générique. Le module RENTAL reste exigé pour
  confirmer une quittance (contrôleur) et la route appelée par loopback porte son propre module.

| Menace                                                                                | Réponse                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection de prompt qui déclenche un plan trompeur (titre rassurant, corps différent) | L'humain voit les changements calculés par le serveur sur le corps réellement signé, pas le récit du modèle ; la requête exécutée est celle du jeton (`planHash`) ; données lues = données (invite, règles 2 et 3) ; 3 plans au plus par requête ; plan sensible ou volumineux : mot à saisir |
| Plan à rallonge qui cache des champs                                                  | Plus de 30 changements : mot obligatoire, avertissement « N autres changements ne sont pas affichés »                                                                                                                                                                                         |
| Rejeu d'un plan ou double clic                                                        | Usage unique (mémoire puis `AuditLog` sous verrou consultatif) ; `PROPOSAL_ALREADY_USED` (409) ; jamais de relance automatique                                                                                                                                                                |
| Confusion d'agence ou d'utilisateur                                                   | `sub` et `tid` du jeton comparés à la requête authentifiée ; `:tenantId` imposé dans le chemin ; l'appel loopback vise l'agence de la route et traverse `requireTenantAccess` et la garde Prisma                                                                                              |
| Élévation de permission                                                               | Aucune permission fixe n'est accordée à l'IA : la route réelle vérifie celle de l'écriture sous l'identité du confirmeur ; permissions du catalogue relues avant de consommer le jeton ; un rôle sans `PROPERTIES_VIEW` n'a pas l'outil                                                       |
| Suppression                                                                           | Absente du catalogue, refusée à l'émission, dans les claims et à l'exécution ; test avec jeton forgé signé                                                                                                                                                                                    |
| Effets externes (paiement, envoi, signature, clôture)                                 | Plan sensible, mot `CONFIRMER`, raison affichée ; chemins secrets interdits                                                                                                                                                                                                                   |
| Jeton volé                                                                            | Lié à l'utilisateur et à l'agence, usage unique, 900 s, jamais renvoyé au modèle ni journalisé ; il faut aussi les en-têtes d'authentification de la requête                                                                                                                                  |
| Paramètres de requête cachés à l'humain (ex. `?force=true`)                           | `query` calculé depuis la requête signée et montré (secrets masqués), avertissement serveur, mot de confirmation obligatoire, dans `displayHash`                                                                                                                                              |
| Création ou action dont le parent visé est ignoré de l'humain                         | Parent lu par GET loopback : `target` lisible et `pathParams` bruts affichés ; parent illisible : plan refusé                                                                                                                                                                                 |
| Écriture sensible non reconnue par son chemin                                         | Liste de mots élargie, suites de mots, détection par le corps sur les routes de comptes ; une écriture non classée reste à l'accord simple (documenté, pas de liste blanche)                                                                                                                  |
| Liste remplacée qui efface des éléments sans le montrer                               | Changement de niveau liste, avertissement, mot exigé et signé dans le jeton (`requireConfirmation`)                                                                                                                                                                                           |
| Jeton d'un plan refusé réutilisé (volé, conservé)                                     | `POST /ai/actions/reject` consomme le jeton (usage unique) ; l'exécution répond ensuite 409                                                                                                                                                                                                   |
| Fuite de secret dans un plan ou un résultat                                           | Masquage avant/après et de `resultPreview`, valeurs longues tronquées à l'affichage, audit sans corps                                                                                                                                                                                         |

Limites connues de l'étape 4 : le catalogue ne porte pas le schéma des corps (le modèle devine les champs ; la
route réelle valide et refuse) ; certains POST du catalogue sont des lectures (`…/search`, `…/export`) et passent par
un plan inutilement lourd ; les valeurs « avant » d'une mise à jour supposent que la route GET du même chemin (ou du
parent) renvoie les mêmes noms de champs que ceux du corps, sinon le plan signale les champs absents ; une écriture
« annuler » n'existe pas (pas de défaire automatique) ; l'écriture et son audit de route ne sont pas atomiques avec la
réclamation du jeton (un échec après réclamation consomme le plan) ; les limiteurs restent en mémoire, par instance.

**Contrôle d'accès.** Toutes les routes `/ai/*` passent `authenticate`,
`requireTenantAccess`, `requireTenantCollaborator` (les clients de portail sont
refusés) puis `requireAiAssistantAccess` : **refus du super-admin** en MVP.
`tenantId` et `userId` viennent de `req.tenantContext` et `req.user`, jamais du
corps ni du modèle ; un schéma strict rejette une clé `tenantId` en entrée d'un
outil. Chaque outil vérifie sa permission (`PROPERTIES_VIEW`,
`RENTAL_LEASES_VIEW`, `RENTAL_DOCUMENTS_VIEW`, `RENTAL_DOCUMENTS_GENERATE`) ; la passerelle
de lecture ajoute en plus celle de la route appelée (voir ci-dessus).
`propose_rental_document` et la confirmation d'une quittance exigent
`RENTAL_DOCUMENTS_GENERATE` **et** `RENTAL_DOCUMENTS_VIEW` ; la confirmation d'un plan d'écriture
n'exige aucune permission fixe (la route réellement appelée porte celle de l'écriture) ; en
mode `enforce`, les modules de l'abonnement filtrent aussi les outils
(`/ai` et `/ai/actions` en CORE ; le module RENTAL d'une quittance est vérifié par le contrôleur). Le cache des permissions dure
5 minutes : une révocation peut mettre ce temps à s'appliquer. Le correctif
RBAC des routes de documents (`routes/document-routes.ts`) retire au rôle
`TENANT_AGENT` la génération et le téléchargement, qui n'avaient aucune garde.

**Limites de débit** (en mémoire, par instance d'API :
`middleware/rate-limit-middleware.ts`). Les limites par utilisateur et par
agence sont complétées par un **plafond par agence**, tous collaborateurs
confondus (sinon N collaborateurs consommeraient N fois le quota) ; il est posé
après les limiteurs par utilisateur, pour qu'un utilisateur déjà bloqué ne
consomme pas le budget commun.

| Route                      | Clé                   | Limite                                                    |
| -------------------------- | --------------------- | --------------------------------------------------------- |
| `POST /ai/chat`            | utilisateur et agence | 20 par minute                                             |
| `POST /ai/chat`            | utilisateur et agence | 300 par jour                                              |
| `POST /ai/chat`            | agence seule          | `AI_TENANT_MINUTE_LIMIT` par minute (100 par défaut)      |
| `POST /ai/chat`            | agence seule          | `AI_TENANT_DAILY_LIMIT` par jour (3000 par défaut)        |
| `POST /ai/actions/execute` | utilisateur et agence | 10 par minute (quittances et plans d'écriture)            |
| `POST /ai/actions/reject`  | utilisateur et agence | 30 par minute (compteur propre, jetons invalides compris) |

Une IA qui chaîne des écritures reste bornée : au plus 3 plans d'écriture par requête de chat (donc
au plus 3 cartes d'accord à lire), 4 tours d'outils et 8 appels d'outils par requête, 20 requêtes de
chat par minute, et chaque plan ne s'exécute que par une confirmation humaine, limitée à 10 par
minute. L'appel loopback de la confirmation traverse en plus les limiteurs de la route appelée
(IP de l'utilisateur transmise par `X-Forwarded-For`).

Autres plafonds : 20 messages de 4 000 caractères et 24 000 au total par
requête ; `AI_MAX_TOOL_ROUNDS` tours d'outils (4 par défaut) et 8 appels d'outils
au plus ; `AI_REQUEST_TIMEOUT_MS` par appel au fournisseur.

**Audit** (`AuditLog`, clés de `types/audit-types.ts`) : `AI_CHAT_TURN` (sans
texte : fournisseur, issue, nombre de tours et d'outils ; son `entityId` est le
`requestId` **généré par le serveur** : le `conversationId` du client n'est
qu'un écho pour l'interface, jamais une clé d'audit), `AI_TOOL_CALLED`,
`AI_TOOL_DENIED`, `AI_PROPOSAL_ISSUED`, `AI_PROPOSAL_REDEEMED`,
`AI_ACTION_EXECUTED`, `AI_ACTION_REJECTED`, `AI_PROPOSAL_REJECTED` (refus humain d'un plan ; voir « Écritures génériques » pour le contenu des
événements d'un plan). Sauf la réclamation du jeton
(synchrone, sous verrou), l'écriture passe par la file asynchrone `logAuditEvent`.

**Flux SSE.** En-têtes `Cache-Control: no-cache, no-transform` (le middleware
de compression ne doit pas mettre le flux en tampon) et `X-Accel-Buffering: no` ;
la fermeture de la connexion annule l'appel au fournisseur. Côté web : rendu
Markdown maison en éléments React, sans lien, image ni HTML, jamais
`dangerouslySetInnerHTML`.

**Limites connues.** L'usage unique des jetons et l'idempotence des quittances
sont atomiques entre instances (verrous consultatifs PostgreSQL). Les
**limiteurs de débit restent en mémoire, par instance** : avec N instances,
les plafonds effectifs sont multipliés par N (pas de compteur partagé). Le
compteur de numérotation de `generateDocument` n'est pas transactionnel
(défaut existant ; les quittances de l'assistant sont sérialisées par paiement,
pas les autres chemins de génération). Les refus du fournisseur sont
traités (`PROVIDER_REFUSAL`) ; un repli serveur est actif par défaut
(`AI_REFUSAL_FALLBACK=off` le coupe).

## 12 bis. Liens publics à jeton

Un lien public donne accès **sans compte** à un objet précis : celui qui possède l'URL
est, pour le serveur, le destinataire. Le module générique `lib/secure-links` (spec
[031](../../specs/031-patrimoine-canaux-liens-securises/spec.md), modèle `SecureLink` dans
[DATA_MODELS.md](../architecture/DATA_MODELS.md)) en porte trois usages : le rapport
mensuel d'un propriétaire, l'accès en lecture seule des tiers de confiance (lot B3, spec
[034](../../specs/034-patrimoine-acces-tiers-confiance/spec.md), notaire, expert-comptable,
banquier, détaillé en section 12 ter) et le paiement d'une échéance de loyer (spec
[039](../../specs/039-patrimoine-lien-paiement/spec.md), sous-section « Lien de paiement
d'une échéance » ci-dessous). Toute nouvelle route publique à jeton réutilise ce module et ses
mesures ; une route qui accepterait un jeton autrement est refusée en relecture.

**Mécanisme.** Jeton de 32 octets aléatoires (`crypto.randomBytes`), base64url, renvoyé
une seule fois à la création ; seul son SHA-256 est stocké (`SecureLink.tokenHash`,
unique). Expiration 7 jours par défaut (`SECURE_LINK_DEFAULT_TTL_DAYS`), 30 au plus
(`SECURE_LINK_MAX_TTL_DAYS`) ; révocation par `revokedAt`. Portée unique par lien
(`scope`) et objet unique (`objectType` + `objectId`). Le jeton transite dans le **fragment**
de l'URL partagée (`/rapport-proprietaire#<jeton>`, ou `/acces-partage#<jeton>` pour la portée
des tiers de confiance), puis en **corps** d'un `POST` ; il n'est jamais dans le chemin ni dans
la chaîne de requête.

| Menace                                      | Mesure retenue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fuite du lien (transfert, capture, partage) | Impossible à empêcher : on borne l'impact. Un seul objet, lecture seule, expiration, révocation à tout moment, consultations comptées (`viewCount`, `lastViewedAt`) et journalisées. Aucune donnée de contact dans la réponse publique                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Devinette                                   | 256 bits d'entropie, générateur cryptographique ; limiteur de débit par IP en plus. Pas de jeton court, pas de code à chiffres                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Énumération et mesure de temps              | Refus **uniforme** : inconnu, expiré, révoqué, mauvaise portée, agence inactive, objet disparu donnent la même 404 « Lien invalide ou expiré. » (statut, corps, en-têtes). Recherche par hash : la protection principale est la **préimage** (le serveur ne compare que le SHA-256 d'un jeton de 256 bits, impossible à deviner ni à reconstruire par mesure de temps) ; la comparaison à temps constant (`timingSafeEqual`) n'est qu'une défense en profondeur                                                                                                                                                                                                |
| Rejeu après révocation ou expiration        | `revokedAt`, `expiresAt`, portée et statut de l'agence contrôlés côté serveur à chaque appel ; aucun cache du verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Abus et déni de service                     | Limiteur de débit par IP, 30 requêtes par minute, appliqué avant toute vérification, **un seul budget partagé par toutes les routes publiques à jeton** (en mémoire, par instance : voir « Limites » et 12 ter) ; corps **borné à 1 Ko** par un parseur JSON propre à la route (les parseurs globaux de 10 Mo l'ignorent : `app.ts`), toute erreur de corps (JSON invalide, trop gros, encodage refusé) devient la même 404 uniforme avec les mêmes en-têtes, sans journaliser le message du parseur ; seul `token` est lu ; la 429 du limiteur de la route porte les mêmes en-têtes que les autres réponses (voir « Limites » pour la 429 du plancher global) |
| Journaux d'accès et journaux applicatifs    | Le jeton n'est jamais dans l'URL : le fragment ne part pas au serveur et le `POST` le porte en corps. `requestLogger` journalise `req.url` (voir « Points ouverts ») : un jeton en URL y serait écrit, donc interdit                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Cache, `Referer`, indexation                | `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` sur **toutes** les réponses publiques, refus compris ; la page n'a aucun lien sortant ; un fragment n'est jamais transmis dans `Referer`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Accès inter-agences (IDOR)                  | La route publique n'accepte **aucun** identifiant : seul le jeton compte. L'objet est chargé par `id` ET `tenantId` du lien. Côté agence, `linkId` est vérifié contre le relevé et l'agence ; `NotFoundError` uniforme                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Base de données compromise                  | Seul le hash est stocké : il ne permet pas de reconstruire une URL valide. Aucun jeton, ni hash, dans `AuditLog`, journaux ni réponses de liste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Lien utilisé comme porte vers autre chose   | Aucune session, aucun cookie, aucun jeton d'authentification émis ; une route n'accepte que sa propre portée ; le lien ne désigne qu'un objet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Agence suspendue ou désactivée              | Agence active (`isActive`) et non `SUSPENDED` exigée à chaque consultation ; sinon refus uniforme, sans révéler la raison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Envoi à un destinataire non consentant      | Canal choisi seulement avec consentement **et** coordonnée exploitable ; un seul canal par message ; le destinataire vient du contact du propriétaire, jamais d'un paramètre ; l'URL va dans le corps, jamais dans un sujet d'e-mail                                                                                                                                                                                                                                                                                                                                                                                                                           |

**Journal.** Création, consultation réussie et révocation passent par `logAuditEvent`
(`SECURE_LINK_CREATED`, `SECURE_LINK_VIEWED`, `SECURE_LINK_REVOKED`), rattachées à
l'agence du lien. Le payload porte `linkId`, `scope`, `objectType`, `objectId` ; jamais le
jeton, jamais son hash. L'événement de consultation porte aussi l'adresse IP et le
user-agent de l'appelant (colonnes `ipAddress` et `userAgent` du journal), seule trace de
l'accès hors compteur ; il n'est écrit qu'après une lecture réussie. Les refus ne sont pas
journalisés un par un (ils ne portent pas d'agence connue) : le volume est limité par le
limiteur de débit. La portée `EXTERNAL_ACCESS_GRANT` ne passe pas par `recordSecureLinkView` :
ses consultations sont journalisées sous `EXTERNAL_ACCESS_GRANT_VIEWED` et comptées sur
l'accès (section 12 ter).

**Isolation et contexte d'agence.** La recherche par `tokenHash` est la **seule** lecture
sans contexte d'agence du module, confinée à `lib/secure-links` (même statut que la liste des
agences d'un job). Elle est suivie d'un `runWithTenantContext` sur l'agence du lien : le
reste de la requête passe par l'extension Prisma d'isolation (`TENANT_GUARD_MODE`).

**Règles pour une nouvelle portée.**

1. Ajouter une valeur à `SecureLinkScope`, un cas dans `buildSecureLinkUrl` et une fonction de
   lecture de l'objet ; pas de clé étrangère polymorphe.
2. Un lien = un objet. Jamais de portée « tout l'espace d'un client ». Quand l'objet est un
   accès à plusieurs biens (`ExternalAccessGrant`, section 12 ter), son périmètre est
   **explicite** (biens et entités énumérés par l'agence), relu et refiltré par agence à
   chaque appel, et le lien ne vit jamais au-delà de l'échéance de l'accès (`maxExpiresAt`) ;
   la révocation de l'accès révoque tous ses liens (`revokeSecureLinksForObject`).
3. Réponse publique par projection explicite (`select`), sans coordonnées de contact, sans
   chemin de fichier, sans identifiant technique.
4. Lecture seule d'abord. Un lien qui déclenche une écriture (paiement) exige un lot et une
   relecture de sécurité propres : le lot C5 (spec
   [039](../../specs/039-patrimoine-lien-paiement/spec.md), portée `INSTALLMENT_PAYMENT`) est ce
   lot pour le paiement d'une échéance ; ses mesures sont dans la sous-section « Lien de
   paiement d'une échéance ». Toute autre écriture déclenchée par un lien public exige son
   propre lot.
5. Route inscrite à la liste blanche de `routes-inventory.test.ts` avec sa justification,
   limiteur de débit (`secureLinkPublicRateLimiter`, partagé : voir 12 ter), trois en-têtes de
   réponse ci-dessus, refus uniforme testé.

**Export d'agence.** `SecureLink` est exclu de l'export de données de l'agence
(`services/tenant-data-export/model-registry.ts`) : le hash est un secret d'accès, l'archive
ne doit pas le contenir. Les quatre modèles `ExternalAccessGrant*` du lot B3, qui ne portent
aucun secret, sont exportés (section 12 ter).

**Limites connues.**

- Un lien divulgué donne accès en lecture à un seul objet jusqu'à expiration ou révocation
  (pour la portée des tiers de confiance, à tout le périmètre de l'accès : section 12 ter) ;
  aucune vérification d'identité du porteur n'est faite (pas de code complémentaire).
- Le limiteur de débit est en mémoire, par instance (comme les autres, voir « Points
  ouverts ») ; la latence de réponse entre un jeton inconnu et un jeton connu mais refusé
  n'est pas rendue strictement identique : l'entropie du jeton rend l'énumération vaine.
- Le plancher de débit **global** de l'API (1000 requêtes par 15 minutes et par IP,
  appliqué avant toutes les routes) peut répondre 429 sans les en-têtes no-store /
  noindex / no-referrer : il s'exécute avant le routeur public. Cette 429 ne porte
  aucune donnée ; le défaut est documenté, pas corrigé.
- **Libellé libre des dépenses exposé.** Le rapport public reprend le `label` de chaque
  ligne du relevé, donc le libellé libre d'une dépense saisie par l'agence : un
  commentaire interne saisi dans ce libellé serait visible du porteur du lien. À l'agence
  de n'y mettre rien d'interne. **Point ouvert** (filtrage ou libellé public distinct à
  décider).
- **Chaque envoi manuel ou copie de lien crée un nouveau lien actif** sans révoquer les
  précédents : plusieurs liens valides coexistent pour un même relevé jusqu'à expiration
  ou révocation manuelle (la liste de l'écran agence les montre). **Point ouvert**
  (révocation automatique des liens précédents à envisager).
- **Alertes propriétaire par WhatsApp : opt-in par agence.** Les clés WhatsApp
  `OWNER_LEASE_ENDING_SOON`, `OWNER_DOCUMENT_EXPIRY_ALERT` et `OWNER_MONTHLY_REPORT_SENT`
  sont **désactivées sans ligne de configuration** (`defaultWhatsappEnabled`) : le
  consentement WhatsApp vaut `true` par défaut en base, et les activer par défaut aurait
  envoyé des alertes non sollicitées aux propriétaires d'agences qui avaient coupé
  l'alerte e-mail. **Changement de comportement** : les alertes de bail et de document,
  jusque-là e-mail seulement, peuvent désormais partir par WhatsApp (canal préféré du
  contact, ou repli) **dès que l'agence active la clé** ; sans activation, rien ne change.
  L'écran de configuration reflète l'état réel (clé désactivée tant qu'aucune ligne n'existe).
- **Aucune garde logicielle de simulation hors tests.** L'envoi d'e-mail n'est coupé que
  par `NODE_ENV=test` ; le fournisseur WhatsApp n'a pas de simulateur. En développement, la
  protection contre un envoi réel est : job mensuel désactivé par défaut
  (`PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED=false`), WhatsApp opt-in, fournisseurs non
  configurés. Un envoi manuel depuis l'écran agence part réellement si un fournisseur est
  configuré.
- Un relevé `DRAFT`, ou calculé selon une version obsolète du calcul, ne peut ni recevoir
  de lien ni être envoyé (409 `ConflictError`) : même garde que l'envoi du relevé.
- Le message qui porte le lien (WhatsApp, e-mail) est stocké par des tiers (fournisseur,
  boîte du destinataire) ; l'expiration courte est la parade.
- La révocation automatique à la suppression de l'objet n'est pas prévue (spec 031, points
  ouverts). La ré-émission d'un lien expiré n'existe pas pour le rapport mensuel ; pour un
  accès de tiers de confiance, l'agence en émet un nouveau (« Renvoyer un lien », 12 ter).

## 12 ter. Accès des tiers de confiance

Un notaire, un expert-comptable ou un banquier consulte, sans compte, une partie du
patrimoine d'un client de l'agence : le lot B3 (spec
[034](../../specs/034-patrimoine-acces-tiers-confiance/spec.md), modèles `ExternalAccessGrant*`
dans [DATA_MODELS.md](../architecture/DATA_MODELS.md)) est la seconde portée de
`lib/secure-links`, `EXTERNAL_ACCESS_GRANT`. Toutes les mesures de la section 12 bis
s'appliquent telles quelles (jeton de 256 bits haché, fragment puis corps de `POST`, refus
uniforme, en-têtes, limiteur, corps de 1 Ko). Cette section couvre ce que le lot ajoute ou
aggrave : un lien qui ouvre **un périmètre de plusieurs biens et plusieurs rubriques** et non
un seul objet, un accès qui peut être permanent, des documents privés et des données
patrimoniales sensibles.

**Mécanisme.**

- **Un accès nominatif** (`ExternalAccessGrant`) : type de tiers, bénéficiaire (nom et e-mail
  saisis par l'agence), **périmètre explicite** (biens listés et entités détentrices listées,
  développées en biens par `PropertyHolding` à chaque consultation), **rubriques** accordées
  (`VALUATIONS`, `YIELD_RATIOS`, `LOANS`, `EXPENSES`, `RENTS`, `DOCUMENTS`, `TITLES_OWNERSHIP` ;
  jamais une liste vide), documents partageables liés un par un, échéance ou aucune.
- **Périmètre.** Un bien est ouvert s'il appartient à l'agence ou s'il est un bien CLIENT sous
  mandat de gestion **actif** de cette agence, selon la même règle à l'écriture et à chaque
  consultation : un mandat échu referme l'accès sans action de l'agence. Il n'existe pas de
  périmètre « tout ce que possède X ». Un périmètre qui se vide donne la 404 uniforme. Il est plafonné à **100 biens**, entités
  développées comprises : 400 à l'écriture ; à la consultation, si des entités ont grossi, la
  vue est tronquée aux 100 premiers biens par titre et `summary.truncated` vaut `true`.
- **Rubriques.** Seules les rubriques accordées sont **lues et renvoyées** : une rubrique non
  accordée est absente de la réponse, pas masquée. Projection par `select` explicite, jamais
  par sérialisation d'un objet Prisma.
- **Lien.** `SecureLink` de portée `EXTERNAL_ACCESS_GRANT`, `objectType = 'ExternalAccessGrant'`,
  `objectId` = identifiant de l'accès ; URL partagée `<FRONTEND_URL>/acces-partage#<jeton>`
  (jeton dans le fragment, puis dans le corps d'un `POST`). Chaque lien vit au plus
  `SECURE_LINK_MAX_TTL_DAYS` (7 jours par défaut) et **jamais au-delà de l'échéance de
  l'accès** (`maxExpiresAt`). Plusieurs liens peuvent être actifs ensemble ; un renvoi ne
  révoque les précédents que sur demande (`revokePreviousLinks`).
- **Permanent = réémission, pas jeton éternel.** Un accès sans échéance reste valable jusqu'à
  révocation, mais aucun de ses liens ne l'est : à l'expiration d'un lien, l'agence en émet un
  autre (« Renvoyer un lien »).
- **Révocation.** Révoquer l'accès pose `revokedAt` sur lui **et** sur tous ses liens ;
  changer `recipientEmail` révoque aussi les liens actifs. Indépendamment de l'état du lien,
  l'accès lui-même est **relu à chaque appel** (existe, non révoqué, non expiré) : un lien
  encore valide d'un accès révoqué ou expiré répond la 404 uniforme.
- **Routes publiques.** `POST /api/public/external-access/patrimoine` (`{ token }`) et
  `POST /api/public/external-access/documents/download` (`{ token, documentRef }`) : aucun
  identifiant de bien, d'agence, d'entité ou de document ne vient de l'appelant. `documentRef`
  est l'identifiant de la ligne de liaison de CET accès (jamais celui du document ni un chemin),
  revérifié avec la rubrique `DOCUMENTS` et le périmètre courant ; le fichier part en pièce
  jointe (`attachment`, `nosniff`).

| Menace                                  | Mesure retenue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Énumération (accès, biens, documents)   | Aucun identifiant accepté de l'appelant public : seul le jeton compte, le document se désigne par une `ref` opaque. Refus public **uniforme** : jeton inconnu, expiré ou révoqué, mauvaise portée, agence inactive, accès révoqué, expiré ou supprimé, périmètre vide, `documentRef` invalide, corps malformé donnent la même 404 « Lien invalide ou expiré. ». Côté agence, toute référence inconnue ou étrangère donne la même `NotFoundError`                                                                                                                                                                                                                                            |
| Fuite inter-tenant                      | `tenantId` direct sur les quatre modèles ; lecture sous `runWithTenantContext` de l'agence du lien, `tenantId` du lien dans chaque requête ; entités et mandats filtrés par agence ; extension Prisma active ; propriétaire désigné revérifié dans l'agence ; identifiants reçus côté agence revérifiés avant écriture                                                                                                                                                                                                                                                                                                                                                                      |
| Élévation de portée : rubriques         | Clés d'une rubrique présentes seulement si elle est accordée, rubriques relues à chaque appel ; retirer une rubrique agit à la requête suivante sans réémettre de lien ; liste vide refusée ; défauts minimaux par type (banquier, expert-comptable, notaire)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Élévation de portée : périmètre         | Périmètre explicite, entités développées à chaque appel et refiltrées (bien de l'agence ou bien CLIENT sous mandat actif) ; un nouveau bien ne rejoint un accès que par une action de l'agence ou par la participation d'une entité listée ; documents vérifiés dans le périmètre à l'écriture, à la consultation et au téléchargement                                                                                                                                                                                                                                                                                                                                                      |
| Jeton volé ou transféré                 | Impossible à empêcher sans identité du porteur : on borne l'impact. Lecture seule ; lien borné par `SECURE_LINK_MAX_TTL_DAYS` et par l'échéance de l'accès ; révocation de l'accès et de tous ses liens à tout moment ; changement d'e-mail révoque les liens **avant** l'écriture du nouvel e-mail (échec fermé) ; consultations comptées et journalisées avec IP et user-agent                                                                                                                                                                                                                                                                                                            |
| Rejeu après révocation ou expiration    | Jeton (révocation, échéance, portée, agence) **et** accès (`revokedAt`, `expiresAt`, périmètre) contrôlés côté serveur à chaque appel, vue comme téléchargement, sans cache du verdict ; la révocation de l'accès révoque aussi ses liens                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Données personnelles de tiers           | Projection explicite : ni e-mail ni téléphone, ni identité de locataire, ni nom de co-indivisaire (pourcentages seuls), ni texte libre interne (libellé ou fournisseur d'une dépense, notes), ni chemin disque, ni identifiant technique de bien, d'agence, d'entité ou de propriétaire. En `TITLES_OWNERSHIP`, seules les personnes **morales** de l'agence **explicitement listées** dans l'accès sont nommées (nom, forme, pays, RCCM, numéro fiscal, quote-part) ; un accès par biens seuls n'en nomme aucune ; toute autre détention est agrégée en `otherHoldersSharePercent`, sans nom ni identifiant. L'e-mail du bénéficiaire n'est jamais dans la vue publique ni dans le journal |
| Déni de service par grand périmètre     | Périmètre plafonné à 100 biens (400 à l'écriture, troncature signalée à la consultation) ; 200 lignes de dépenses par bien ; rendement calculé par lots de 5 biens (environ 6 requêtes par bien) ; limiteur par IP avant toute vérification ; corps de 1 Ko. Coût borné mais non nul : voir limites                                                                                                                                                                                                                                                                                                                                                                                         |
| Téléchargement hors périmètre           | `documentRef` = ligne de liaison de CET accès, bien encore dans le périmètre (mandat compris), rubrique `DOCUMENTS` accordée, accès valide ; sinon 404 uniforme. Document non lié, lié à un autre accès ou dont le bien est sorti du périmètre : 0 octet servi. `attachment` et `nosniff`, jamais de chemin disque                                                                                                                                                                                                                                                                                                                                                                          |
| Journalisation                          | Création, modification, révocation, envoi de lien, consultation et téléchargement journalisés (voir ci-dessous), IP et user-agent en colonnes ; jamais le jeton, son hash, l'URL du lien ni l'e-mail du bénéficiaire ; message du parseur non journalisé                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Accès permanent devenu jeton éternel    | Aucun lien n'est permanent (durée bornée) ; l'accès reste révocable et visible dans la liste, avec son statut (`ACTIVE`, `EXPIRING`, `EXPIRED`, `REVOKED`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Envoi du lien à un mauvais destinataire | Destinataire lu sur l'accès, jamais fourni à l'envoi ; URL dans le corps de l'e-mail, jamais dans le sujet ni un journal ; valeurs échappées dans le HTML ; un seul e-mail par envoi, action explicite de l'agence (le tiers n'a pas de fiche CRM : aucun contrôle de consentement CRM)                                                                                                                                                                                                                                                                                                                                                                                                     |

**Permissions (aucune nouvelle).** Lecture (liste, détail, options, documents d'un bien,
journal) : `PROPERTIES_VIEW` ; création, modification, révocation, renvoi de lien :
`PROPERTIES_EDIT` (`requireAnyPropertyPermission` et `requirePropertyPermission`, comme
`patrimoine-routes.ts`). Le périmètre porte sur des biens et leurs documents : qui peut voir ou
modifier un bien décide déjà de qui le consulte, et une permission dédiée multiplierait les
rôles à reconfigurer pour une fonction que les gestionnaires de biens exercent déjà. Les
routes d'agence sont sous `/tenants/:tenantId/patrimoine`, donc soumises à la fonctionnalité
d'abonnement `PATRIMOINE` (`lib/subscription/route-features.ts`).

**Journal.** Six événements `logAuditEvent`, `entityType = 'ExternalAccessGrant'`, `entityId` =
identifiant de l'accès : `EXTERNAL_ACCESS_GRANT_CREATED` (écrit après l'émission du lien :
jamais pour un accès supprimé par compensation), `_UPDATED` (noms des champs
modifiés, jamais leurs valeurs), `_REVOKED`, `_LINK_SENT` (`linkId`, `emailSent`), `_VIEWED` et
`_DOCUMENT_DOWNLOADED` (`documentRef`, nom du document). Les consultations et téléchargements
publics sont attribués à l'agence de l'accès (`actorUserId` nul) et portent l'adresse IP et le
user-agent (tronqué à 500 caractères, sans saut de ligne) en colonnes ; ils ne sont écrits
qu'après une lecture réussie ; l'événement d'audit est écrit avant le compteur, chacun isolé :
l'échec du compteur ne supprime pas la trace d'audit et aucun des deux ne transforme la lecture
en erreur. Pour cette portée, `recordSecureLinkView` n'est pas appelé : pas de
`SECURE_LINK_VIEWED`, et seuls `viewCount` et `lastViewedAt` **de l'accès** sont mis à jour
(pas ceux du `SecureLink`) ; chaque création et révocation d'un lien produit en revanche
`SECURE_LINK_CREATED` et `SECURE_LINK_REVOKED`. Les refus ne sont pas journalisés un par un. Le
journal d'un accès (`GET …/external-access/:grantId/access-log`, 50 lignes par défaut, 100 au
plus) ne renvoie que des clés connues (`CREATED`, `UPDATED`, `REVOKED`, `LINK_SENT`, `VIEWED`,
`DOCUMENT_DOWNLOADED`) et jamais la charge brute.

**Isolation.** Même schéma qu'en 12 bis : la recherche par `tokenHash` est la seule lecture
sans contexte d'agence ; tout le reste de la requête publique passe sous `runWithTenantContext`
de l'agence du lien. Les lectures de `Property` ne sélectionnent jamais `tenantId` (nul pour un
bien CLIENT sous mandat).

**Export d'agence.** Les quatre modèles `ExternalAccessGrant*` sont **exportés** (ils ne
portent aucun secret : classement `DIRECT` sur `tenantId`, dérivé du schéma) ; l'e-mail du
bénéficiaire y figure comme donnée de l'agence. `SecureLink` reste exclu.

**Limites connues.**

- **Un lien divulgué ouvre tout le périmètre et toutes les rubriques de l'accès**, pas un seul
  objet comme en 12 bis, jusqu'à expiration du lien ou révocation de l'accès. Aucune
  vérification d'identité du porteur (pas de code complémentaire) : la borne d'impact est la
  durée du lien, la révocation et le journal.
- **Limiteur de débit partagé.** Les deux routes publiques utilisent le **même** limiteur que
  le rapport mensuel (`secureLinkPublicRateLimiter`, 30 requêtes par minute et par IP, clé
  commune) : un tiers qui consulte puis télécharge plusieurs documents, ou plusieurs porteurs
  derrière une même adresse, épuisent le budget des autres liens publics de cette adresse. Il
  est en mémoire, par instance (voir 13).
- **`PROPERTIES_EDIT` suffit à ouvrir des documents privés à un tiers** : l'agence choisit les
  documents d'un bien partagés, sans permission distincte. Une permission dédiée serait un
  ajout de la plateforme, hors de ce lot.
- **Messages de validation en français brut.** Les messages des schémas `zod` de l'API d'agence
  (date d'expiration invalide, rubrique vide, e-mail invalide…) sont écrits en français sans
  passer par `t()` : non traduits en anglais ni en arabe.
- **Données exposées par la rubrique `TITLES_OWNERSHIP`** : nom, forme juridique, pays, RCCM
  et numéro fiscal des seules personnes morales de l'agence explicitement listées dans l'accès
  (un accès par biens seuls n'en nomme aucune : pour nommer une société, l'agence l'ajoute à
  l'accès) ; les autres détentions ne sortent que sous forme d'un pourcentage agrégé.
- **Plus-value latente et dépenses capitalisées.** La plus-value de la rubrique `VALUATIONS`
  vient du moteur de rendement, dont le coût de revient inclut les dépenses capitalisées du
  bien : un tiers qui voit valeur et plus-value peut en déduire un ordre de grandeur. Inférence
  acceptée.
- **Coût résiduel d'une consultation.** Borné (100 biens, environ 6 requêtes de rendement par
  bien, par lots de 5) mais non nul, sur une route anonyme ; le limiteur par IP est partagé et
  en mémoire, un porteur de lien valide peut en consommer le budget.
- **Vue publique non conditionnée à l'abonnement `PATRIMOINE`.** Seules les routes d'agence le
  sont : un accès déjà émis reste lisible si l'agence perd `PATRIMOINE` (une agence suspendue
  ou inactive reste refusée). Décision produit à prendre.
- **Pas de limiteur propre à `send-link`** : la route est authentifiée (`PROPERTIES_EDIT`) mais
  chaque appel peut émettre un lien et un e-mail.
- **Un document téléchargé échappe ensuite à tout contrôle** ; le fichier est lu en mémoire
  puis envoyé en une réponse (pas de flux).
- **Un renvoi n'invalide pas les anciens liens** sauf `revokePreviousLinks` ; la durée du lien
  est validée **avant** toute révocation et, à la création, avant celle de l'accès (la
  suppression compensatoire ne couvre que l'échec de `createSecureLink`, jamais un e-mail
  parti).
- **Retirer la rubrique `DOCUMENTS` supprime les documents liés** : repartager un document crée
  une nouvelle `ref`.
- L'envoi de l'e-mail n'est coupé que par `NODE_ENV=test` (voir 12 bis) : en développement,
  un envoi depuis l'écran agence part réellement si un fournisseur est configuré.

### Lien de paiement d'une échéance

Portée `INSTALLMENT_PAYMENT` (lot C5, spec [039](../../specs/039-patrimoine-lien-paiement/spec.md)) :
un `SecureLink` désigne **une** échéance de loyer (`objectType = "RentalInstallment"`) ; son
porteur peut lancer le paiement Mobile Money de cette échéance et en lire le statut, sans compte.
C'est la première portée publique qui **écrit** (un `RentalPayment` `PENDING` et un
`OnlinePaymentCheckout`). Mécanisme, jeton, refus uniforme, limiteur et en-têtes : ceux de ce
paragraphe 12 bis, inchangés. URL partagée `/payer#<jeton>` ; page de statut
`/payer/statut?paiement=<codePaiement>`. Routes publiques : `POST
/api/public/secure-links/installment-payment`, `…/start` (10 par minute et par IP) et
`…/status` (90 par minute et par IP, limiteur distinct ; consultation à 30 par minute), avec le
jeton ou le code **en corps**.

| Menace propre au paiement                     | Mesure retenue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Montant choisi par l'appelant                 | Le montant n'est ni dans le lien ni dans le corps : seuls `token` et `codePaiement` sont lus. Le reste dû est **recalculé côté serveur** (`resteDuEcheance`, pénalités comprises) à chaque ouverture et à chaque démarrage ; le checkout est créé avec ce montant. Aucun identifiant (agence, bail, échéance, locataire) n'est accepté de l'appelant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Double paiement, course entre deux ouvertures | **Verrou consultatif** `pg_advisory_xact_lock` (clé dérivée de l'agence et des échéances) dans la transaction de création, **sur le chemin « lien » seulement** ; configuration chargée avant la transaction, toutes les lectures sous verrou passent par `tx`. Ordre sous verrou : checkouts chevauchants, puis échéances et reste dû (relus sous le verrou : pas de TOCTOU côté lien). Un seul checkout actif par échéance : reprise d'un unique `PENDING` exact (moins de 15 minutes, issu d'un lien, même mode, mêmes échéances et montant, URL enregistrée) ; 409 sinon (autres échéances, autre montant, `PENDING` du portail, première requête encore en attente du fournisseur) ; **tout checkout `REVIEW` bloque, sans limite d'âge**, avec un message dédié. Le verrou n'est jamais tenu pendant l'appel réseau au fournisseur |
| Rejeu après paiement, révocation, expiration  | À chaque appel : jeton, portée, agence active, bail `ACTIVE`, échéance non annulée, reste dû > 0. Un paiement confirmé rend le lien inopérant (404 uniforme) sans le révoquer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Redirection ouverte                           | L'URL de paiement est `checkout.checkoutUrl`, fournie par PaySecureHub ou le simulateur : jamais construite depuis une entrée de l'appelant. Le **serveur la normalise et la valide avant de la stocker** (`normalizeProviderCheckoutUrl` : `https` exigé, `http` seulement en `SIMULATOR` vers `localhost`, `127.0.0.1` ou `[::1]`, userinfo et espaces refusés) : une URL refusée n'est jamais stockée (paiement et checkout `FAILED`, 502). Elle est revalidée au démarrage, puis la page refait le contrôle avant de rediriger. L'URL de retour est construite côté serveur (`FRONTEND_URL`)                                                                                                                                                                                                                                         |
| Fuite de données du locataire                 | Réponse publique **minimale**, par projection explicite : agence, période, échéance, montant, moyens de paiement ; ni nom, ni e-mail, ni téléphone, ni identifiant technique                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Statut par code de paiement                   | `/status` ne répond que pour un checkout issu d'un lien (`secureLinkId` non nul) d'une agence non suspendue ; code imprévisible (`IMT-` + 20 alphanumériques aléatoires), format validé avant lecture, **lecture seule** (ni démarrage, ni annulation) ; refus uniforme sinon. Limiteur dédié (90 par minute et par IP) ; réconciliation réservée par écriture atomique de `lastCheckedAt` (un seul appel fournisseur par fenêtre de 10 s). La page efface le code de l'URL, ne le garde qu'en `sessionStorage` de l'onglet (effacé sur réponse terminale) et **ne prend jamais le paramètre d'URL pour une preuve de paiement** : le statut vient du serveur, qui réconcilie auprès de l'agrégateur                                                                                                                                     |
| IPN falsifiée                                 | **Inchangée** (voir §6) : l'IPN ne fait que déclencher une réconciliation serveur à serveur avec la clé de l'agence ; le lot n'ajoute aucune route d'IPN et ne touche ni `reconcileCheckout*` ni le simulateur                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Mode `LIVE` en recette                        | Aucun mode `LIVE` n'est activé ni testé par le lot ; le mode est celui de la configuration de l'agence, jamais choisi par le lien ; la recette passe par `SIMULATOR`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Envoi du lien au mauvais destinataire         | Destinataire lu sur la fiche CRM du locataire du bail (rapprochement déterministe : la plus ancienne en cas de doublon d'e-mail), jamais fourni ; consentement du canal et coordonnée exploitable ; un seul canal par message ; WhatsApp opt-in ; l'URL dans le corps, jamais dans un sujet (un `subjectOverride` d'e-mail ne reçoit aucune variable d'URL) ni un journal ; aucun lien conservé si rien n'est envoyé                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Permission côté agence.** Création, envoi et révocation exigent `RENTAL_PAYMENTS_CREATE`, la
liste `RENTAL_PAYMENTS_VIEW` (aucune permission nouvelle : le lien déclenche la création d'un
paiement locatif). Un lien ou une échéance d'une autre agence lève la même `NotFoundError` qu'un
objet inexistant.

**Journal.** Aux événements `SECURE_LINK_*` s'ajoutent `SECURE_LINK_PAYMENT_STARTED` (démarrage,
créé ou repris) et `RENTAL_PAYMENT_LINK_SENT` (envoi : canal, `linkId`, `installmentId`) ; jamais
le jeton, l'URL du lien ni l'URL de paiement. Un checkout issu d'un lien porte `secureLinkId` ; le
paiement et le checkout portent comme acteur (`created_by_user_id`) l'agent qui a créé le lien : c'est
la traçabilité réelle de l'origine du paiement (l'audit de démarrage n'a pas d'acteur, le locataire
n'ayant pas de compte).

**Limites connues.** Un lien divulgué permet à son porteur de **payer** cette échéance (rien
d'autre) jusqu'à expiration ou révocation. Pas de révocation automatique des liens précédents de
la même échéance (le verrou évite néanmoins plusieurs checkouts actifs). Limiteurs de débit en
mémoire, par instance (30, 10 et 90 par minute), alors que le verrou consultatif est partagé entre
instances. **Le chemin du portail locataire ne prend pas le verrou** : un paiement lancé depuis le
portail et un autre depuis un lien, au même instant, sur la même échéance restent possibles (un
`PENDING` du portail déjà présent donne 409 au lien, sans reprise). Un second lien de la même échéance
qui reprend le checkout du premier affiche « aucun paiement » dans la liste de l'agence (jointure par
`secureLinkId`). **Un checkout `REVIEW` n'est pas repris par la tâche planifiée** : seul le bouton
« Vérifier » de l'agence ou un règlement manuel le résout, et il bloque tous les liens de l'échéance
(le locataire voit « contactez votre agence ») ; **point ouvert** à décider : action « trancher un
`REVIEW` » et borne d'âge. **Pas de liste blanche d'hôtes** pour l'URL du fournisseur ; en simulateur, un
`BACKEND_URL` en `http` sur un hôte non local est refusé (le staging sert le simulateur en `https`).
Pas de paiement partiel ; une échéance par lien. Au-delà de 15 minutes, un nouveau checkout peut être
créé alors que l'ancien reste `PENDING` (48 h) : un double règlement tardif est confirmé par la
réconciliation existante, le surplus restant en avance sur le compte du locataire. Durée de validité
d'un lien `build-away` non utilisé inconnue (point 7 de
[paysecurehub.md](../integrations/paysecurehub.md)). **Mode `LIVE` non validé** et envoi réel non
vérifié.

## 13. Points ouverts

Ce qui suit n'a pas pu être vérifié comme couvert dans le code au moment
de la rédaction, ou est un point explicitement documenté comme non traité
ailleurs dans le dépôt — à ne pas présenter comme résolu :

- **Signature et filtrage IP des IPN PaySecureHub** — non implémentés,
  documenté comme tel dans `docs/integrations/paysecurehub.md` (§6).
- **`middleware/logging-middleware.ts` journalise `req.url` en entier**,
  y compris la chaîne de requête. `middleware/error-middleware.ts` évite
  délibérément la chaîne de requête dans ses propres logs pour cette
  raison (un jeton à usage unique de vérification d'e-mail ou de
  désinscription newsletter y transite) ; `requestLogger` ne fait pas la
  même exclusion. À vérifier avant de considérer ce risque clos.
- **Procédure formelle de réponse à incident** (astreinte, notification
  aux agences, obligations réglementaires locales) — aucun document dédié
  trouvé dans le dépôt ; la section 11 ci-dessus est une conduite par
  défaut, pas une procédure validée.
- **Mode réel PaySecureHub** — signalé comme non validé en mémoire de
  session de l'équipe ; ce document ne porte que sur le mode simulateur et
  le contrat d'API tel que lu dans le code.
- **Politique de conservation / suppression des données personnelles**
  (droit à l'oubli, durée de rétention des pièces jointes de portail) —
  aucun mécanisme dédié trouvé dans le code à la date de rédaction.
- **Sauvegardes de la production** — les scripts existent
  (`infra/scripts/backup.sh`, `restore-check.sh`) mais n'ont jamais tourné sur
  le serveur : copie hors serveur, cron et restauration réelle restent à
  éprouver avant toute donnée réelle. Les sauvegardes contiennent toutes les
  données personnelles de la production : les chiffrer hors serveur (remote
  rclone chiffré recommandé) et en restreindre l'accès. Aucune alerte n'avertit
  d'un échec de sauvegarde ; `deploy.sh prod` refuse sans dump de moins de 24
  heures, mais ne contrôle que l'existence d'un fichier récent, pas sa validité.
  Les copies `rclone` ne connaissent ni rotation (la copie hors serveur n'est
  jamais purgée) ni contrôle du type de remote (rien ne vérifie qu'il est de
  type `crypt`). Voir [DEPLOIEMENT.md](../workflows/DEPLOIEMENT.md).
- **Garde-fous du filet multi-tenant et des quotas en `warn`** —
  `make-env.sh` livre `TENANT_GUARD_MODE=warn` et `SUBSCRIPTION_ENFORCEMENT=warn`
  dans les deux environnements : tant qu'on ne passe pas à `enforce` (d'abord sur
  le staging), l'extension Prisma d'isolation journalise sans bloquer, et les
  quotas d'abonnement ne sont pas appliqués.
- **Staging accessible publiquement** avec le panneau de comptes de démonstration
  et le simulateur de paiement (`app.immotopia.cloud`). L'en-tête `X-Robots-Tag`
  évite l'indexation, pas l'accès. À envisager : `auth_basic` ou une liste
  d'adresses IP dans le vhost du staging.
- **Secrets visibles de l'intérieur de l'hôte** — le fichier de secrets alimente
  l'environnement des conteneurs : `docker inspect` et `docker exec` les affichent
  à tout membre du groupe `docker` de l'hôte.
- **Postgres de la production publié sur `127.0.0.1:5437` sans usage** : tous les
  scripts passent par `docker exec`, aucun par ce port. Surface locale inutile, à
  retirer par un override Compose propre à la production.
- **Images de base flottantes** (`node:20-alpine`, `nginx:1.27-alpine`,
  `postgres:16-alpine`, `alpine`) : référencées par étiquette, pas par digest ;
  leur contenu peut changer à un `--pull` sans qu'un fichier du dépôt change.
- **Seeds de démonstration non gardés** — `seed-demo-*.ts` (et, d'après une
  recherche de `assertNotProduction`, `syndic-demo-seed.ts` et
  `syndic-demo-fund-movements.ts`) ne refusent pas `NODE_ENV=production`, alors
  qu'ils sont dans l'image `migrate` : la garde `assert-not-production.ts` ne
  couvre que six seeds de développement (§8). Aucun script de déploiement ne les
  lance ; défense en profondeur non résolue.
- **Limiteurs de débit en mémoire, par instance**
  (`middleware/rate-limit-middleware.ts`, aucun magasin partagé) : remis à zéro
  à chaque redémarrage, multipliés par le nombre d'instances de l'API. Sans
  conséquence tant qu'il n'y a qu'une instance par pile.
