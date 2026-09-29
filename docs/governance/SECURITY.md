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
`POST /ai/actions/execute` répondent 503 `AI_DISABLED`. Le faux fournisseur
(`fake`) n'est accepté que si la variable **brute** `NODE_ENV` vaut
explicitement `development` ou `test` (`config/env.ts`) : `NODE_ENV` absent,
`production` ou `staging` le refuse au démarrage (un déploiement qui oublie
`NODE_ENV` ne peut pas l'activer) ; quand il est actif, un avertissement est
écrit au démarrage. `anthropic` exige `ANTHROPIC_API_KEY`, sans valeur par
défaut.

**Transfert de données personnelles : décision juridique.** Avec
`AI_PROVIDER=anthropic`, le texte saisi et les résultats d'outils quittent
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
- Sorties plafonnées : 10 éléments et 8 Ko par résultat d'outil.
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
(`propose_rental_document`). Cet outil ne signe une proposition que pour un
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

**Jeton de proposition** (`lib/ai/proposal-token.ts`).

- Forme `v1.<claims>.<signature>` : HMAC-SHA256, clé dérivée par HKDF de
  `JWT_SECRET` (faire tourner `JWT_SECRET` invalide les propositions en cours),
  comparaison par `timingSafeEqual`.
- Liée à l'utilisateur (`sub`), à l'agence (`tid`), à l'action et aux arguments
  résolus **par le serveur** (`leaseId`, `paymentId`, `installmentId`, ou
  bail et dates du relevé) : le client ne peut rien modifier.
- Durée `AI_PROPOSAL_TTL_SECONDS` (300 s par défaut, 60 à 900).
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

**Confirmation** (`POST /ai/actions/execute`, `lib/ai/actions/execute-rental-document.ts`).
Seule porte de génération de l'assistant. Ordre : signature, expiration,
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

**Contrôle d'accès.** Toutes les routes `/ai/*` passent `authenticate`,
`requireTenantAccess`, `requireTenantCollaborator` (les clients de portail sont
refusés) puis `requireAiAssistantAccess` : **refus du super-admin** en MVP.
`tenantId` et `userId` viennent de `req.tenantContext` et `req.user`, jamais du
corps ni du modèle ; un schéma strict rejette une clé `tenantId` en entrée d'un
outil. Chaque outil vérifie sa permission (`PROPERTIES_VIEW`,
`RENTAL_LEASES_VIEW`, `RENTAL_DOCUMENTS_VIEW`, `RENTAL_DOCUMENTS_GENERATE`).
`propose_rental_document` et `POST /ai/actions/execute` exigent
`RENTAL_DOCUMENTS_GENERATE` **et** `RENTAL_DOCUMENTS_VIEW` ; en
mode `enforce`, les modules de l'abonnement filtrent aussi les outils
(`/ai` en CORE, `/ai/actions` en RENTAL). Le cache des permissions dure
5 minutes : une révocation peut mettre ce temps à s'appliquer. Le correctif
RBAC des routes de documents (`routes/document-routes.ts`) retire au rôle
`TENANT_AGENT` la génération et le téléchargement, qui n'avaient aucune garde.

**Limites de débit** (en mémoire, par instance d'API :
`middleware/rate-limit-middleware.ts`). Les limites par utilisateur et par
agence sont complétées par un **plafond par agence**, tous collaborateurs
confondus (sinon N collaborateurs consommeraient N fois le quota) ; il est posé
après les limiteurs par utilisateur, pour qu'un utilisateur déjà bloqué ne
consomme pas le budget commun.

| Route                      | Clé                   | Limite                                               |
| -------------------------- | --------------------- | ---------------------------------------------------- |
| `POST /ai/chat`            | utilisateur et agence | 20 par minute                                        |
| `POST /ai/chat`            | utilisateur et agence | 300 par jour                                         |
| `POST /ai/chat`            | agence seule          | `AI_TENANT_MINUTE_LIMIT` par minute (100 par défaut) |
| `POST /ai/chat`            | agence seule          | `AI_TENANT_DAILY_LIMIT` par jour (3000 par défaut)   |
| `POST /ai/actions/execute` | utilisateur et agence | 10 par minute                                        |

Autres plafonds : 20 messages de 4 000 caractères et 24 000 au total par
requête ; `AI_MAX_TOOL_ROUNDS` tours d'outils (4 par défaut) et 8 appels d'outils
au plus ; `AI_REQUEST_TIMEOUT_MS` par appel au fournisseur.

**Audit** (`AuditLog`, clés de `types/audit-types.ts`) : `AI_CHAT_TURN` (sans
texte : fournisseur, issue, nombre de tours et d'outils ; son `entityId` est le
`requestId` **généré par le serveur** : le `conversationId` du client n'est
qu'un écho pour l'interface, jamais une clé d'audit), `AI_TOOL_CALLED`,
`AI_TOOL_DENIED`, `AI_PROPOSAL_ISSUED`, `AI_PROPOSAL_REDEEMED`,
`AI_ACTION_EXECUTED`, `AI_ACTION_REJECTED`. Sauf la réclamation du jeton
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
