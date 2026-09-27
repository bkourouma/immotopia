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
  (`auth-routes.ts`, `crm-routes.ts`).
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

## 12. Points ouverts

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
