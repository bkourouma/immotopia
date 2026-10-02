# Spécification 034 — Accès en lecture seule pour tiers de confiance

**Branche** : `feat/patrimoine-tiers-confiance` (lot B3 de la feuille de route
[PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md))
**Créée** : 2026-10-01
**Statut** : livré, relectures sécurité faites (`code-reviewer`, `security-auditor`) ; ce texte décrit
le code livré, les écarts avec le contrat initial y sont intégrés
**Portée** : capacité 14 du plan (accès « tiers de confiance » : notaire, expert-comptable,
banquier), en **lecture seule**, par lien sécurisé, sans compte pour le tiers.

Références : [plan.md](./plan.md) · spec
[031](../031-patrimoine-canaux-liens-securises/spec.md) (infrastructure `lib/secure-links`, dont
ce lot est la seconde portée) · modèles `ExternalAccessGrant*` et `SecureLink` dans
[DATA_MODELS.md](../../docs/architecture/DATA_MODELS.md) · modèle de menace dans
[SECURITY.md](../../docs/governance/SECURITY.md), section « 12 bis. Liens publics à jeton ».

## 1. Synthèse

Un notaire, un expert-comptable ou un banquier a besoin de consulter une partie du
patrimoine d'un client de l'agence (valorisations, emprunts, loyers, titres…) sans qu'on lui
ouvre un compte ni qu'on lui montre le reste. L'agence crée pour lui un **accès**
(`ExternalAccessGrant`) : un bénéficiaire nominatif, un **périmètre explicite** de biens (et
éventuellement d'entités détentrices), un jeu de **rubriques** autorisées, une échéance (ou
aucune : accès permanent) et, le cas échéant, une liste de **documents partageables**. Le
tiers reçoit par e-mail un **lien sécurisé** : il l'ouvre sans compte, lit les seules
rubriques accordées, et télécharge les seuls documents liés à son accès.

Le lot s'appuie sur `lib/secure-links` (spec 031) : jeton aléatoire haché en base, fragment
d'URL puis corps de `POST`, refus uniforme, en-têtes anti-cache, limiteur de débit. Il y
ajoute une portée (`EXTERNAL_ACCESS_GRANT`), une vue publique projetée par rubrique, un
téléchargement de document par référence opaque, une administration par l'agence et un
journal des consultations. Un accès **permanent** n'est pas un jeton éternel : l'agence
réémet des liens à durée bornée.

Le lot livre :

- quatre modèles (`ExternalAccessGrant` et ses trois tables de liaison) et leurs migrations ;
- l'extension de `lib/secure-links` (portée, plafond d'expiration lié à l'accès, révocation
  en bloc des liens d'un objet) ;
- deux routes publiques (vue, téléchargement) et neuf routes agence ;
- une notification e-mail du lien ;
- l'écran agence « Accès partagés » et la page publique `/acces-partage`.

## 2. Scénarios utilisateur

### US1 — L'agence crée un accès pour un tiers (P1)

Un gestionnaire ouvre « Accès partagés » et crée, en quatre étapes, l'accès d'un notaire,
d'un expert-comptable ou d'un banquier.

1. **Étant donné** un gestionnaire disposant de `PROPERTIES_EDIT`, **quand** il choisit le
   type `BANKER` sans toucher aux rubriques, **alors** les rubriques proposées sont
   `VALUATIONS`, `YIELD_RATIOS` et `LOANS` ; pour `ACCOUNTANT` : `EXPENSES`, `RENTS` et
   `LOANS` ; pour `NOTARY` : `TITLES_OWNERSHIP`, `DOCUMENTS` et `VALUATIONS`. Aucune autre
   rubrique n'est ouverte par défaut.
2. **Étant donné** ces défauts, **quand** le gestionnaire ajoute ou retire des rubriques avant
   de valider, **alors** l'accès est créé avec exactement les rubriques choisies ; une liste
   de rubriques vide est refusée (400).
3. **Étant donné** une demande sans aucun bien ni aucune entité, **quand** elle est soumise,
   **alors** elle est refusée (400) : le périmètre est toujours explicite.
4. **Étant donné** une demande valide, **quand** elle est soumise, **alors** l'accès est créé,
   un lien est émis et son URL complète est renvoyée **une seule fois** dans la réponse, et
   un e-mail part vers le bénéficiaire (sauf `sendEmail: false`) ; la réponse indique si
   l'e-mail est parti et, sinon, pourquoi (`email.reason` : `NOT_REQUESTED`, `EVENT_DISABLED`
   ou `SEND_FAILED`).
5. **Étant donné** un bien, une entité, un propriétaire ou un document d'une autre agence (ou
   inexistant) dans la demande, **quand** elle est soumise, **alors** la réponse est la même
   `NotFoundError` dans tous les cas et rien n'est créé. Un bien qui n'est dans le périmètre
   de l'agence ni comme bien de l'agence ni comme bien client sous mandat actif (FR-003) est
   traité de la même façon.
6. **Étant donné** un propriétaire désigné (`ownerClientId`, facultatif), **quand** le tiers
   consulte l'accès, **alors** le nom de ce propriétaire et sa quote-part par bien sont
   affichés à titre informatif et les totaux de la synthèse sont pondérés par cette
   quote-part (`summary.ownerShareApplied`, FR-004) ; le périmètre n'est pas modifié.

### US2 — Le tiers ouvre son lien sans compte et lit les rubriques accordées (P1)

1. **Étant donné** un lien valide `…/acces-partage#<jeton>`, **quand** le tiers l'ouvre,
   **alors** la page envoie le jeton en **corps** d'un `POST`, retire le fragment de la barre
   d'adresse et affiche en lecture seule un bandeau « Accès en lecture seule accordé par
   <agence> » puis une section par rubrique accordée.
2. **Étant donné** un accès sans la rubrique `LOANS`, **quand** le tiers consulte, **alors** la
   réponse ne contient aucune clé d'emprunt, ni au niveau des biens ni dans la synthèse :
   la rubrique n'est pas masquée, elle est absente. Inversement, une rubrique accordée est
   toujours présente, vide si besoin (`[]`, objet à zéro, ou `valuation: null`, FR-018) ; sans
   `LOANS`, `yield.netNetYield` vaut `null` (clé présente).
3. **Étant donné** un bien dont le périmètre résulte d'une entité détentrice, **quand** les
   participations de l'entité changent, **alors** la consultation suivante reflète le nouveau
   périmètre (développement à chaque appel, filtré par agence).
4. **Étant donné** n'importe quelle consultation réussie, **alors** la réponse ne contient
   aucun e-mail ni téléphone, aucune identité de locataire, aucun nom de co-indivisaire
   (seulement des pourcentages), aucun texte libre interne, aucun chemin de fichier et aucun
   identifiant technique de bien, d'agence, d'entité ou de propriétaire.
5. **Étant donné** une page ouverte, **quand** le tiers l'imprime, **alors** le navigateur
   ouvre sa boîte d'impression (aucun PDF serveur).

### US3 — Tout refus est identique (P1)

1. **Étant donné** un jeton inconnu, expiré, révoqué, d'une autre portée, d'une agence
   inactive, ou un accès révoqué, expiré, supprimé ou dont le périmètre est devenu vide, **quand** la page
   envoie le jeton,
   **alors** la réponse est la même 404 « Lien invalide ou expiré. » (statut, corps, en-têtes
   identiques).
2. **Étant donné** un corps malformé, trop gros ou d'encodage refusé, **quand** il est reçu,
   **alors** la réponse est la même 404 uniforme.
3. **Étant donné** plus de requêtes que le plafond du limiteur, **alors** la réponse est une
   429 portant les mêmes en-têtes anti-cache et anti-indexation.

### US4 — Le tiers télécharge un document partagé (P1)

1. **Étant donné** la rubrique `DOCUMENTS` accordée et un document que l'agence a lié à
   l'accès, **quand** le tiers voit la liste, **alors** chaque document porte une `ref`
   opaque, jamais l'identifiant du document ni un chemin.
2. **Étant donné** une `ref` valide, **quand** le tiers la soumet avec son jeton, **alors** le
   fichier est servi en pièce jointe (`Content-Disposition: attachment`,
   `X-Content-Type-Options: nosniff`) avec les en-têtes anti-cache.
3. **Étant donné** une `ref` inconnue, appartenant à un autre accès, dont le bien est sorti du
   périmètre, ou une rubrique `DOCUMENTS` retirée, **quand** le téléchargement est demandé,
   **alors** la même 404 uniforme est renvoyée.
4. **Étant donné** un document que l'agence n'a pas explicitement lié, **alors** il n'apparaît
   dans aucune liste et aucune `ref` ne permet de l'obtenir, même s'il appartient à un bien
   du périmètre.
5. **Étant donné** un document à lier qui n'appartient à aucun bien du périmètre, **quand**
   l'agence l'ajoute (création ou modification), **alors** l'écriture est refusée par la même
   `NotFoundError` (404) qu'un document inconnu ; ajouter des documents sans la rubrique
   `DOCUMENTS` est refusé en 400.

### US5 — L'agence modifie rubriques, périmètre et échéance (P1)

1. **Étant donné** un accès actif, **quand** l'agence retire une rubrique, **alors** la
   consultation suivante ne la contient plus (aucun cache), sans réémission de lien.
2. **Étant donné** un bien retiré du périmètre, **quand** le tiers consulte ou télécharge,
   **alors** le bien disparaît de la vue et ses documents ne sont plus téléchargeables.
3. **Étant donné** un changement de `recipientEmail`, **quand** il est enregistré, **alors**
   tous les liens actifs de l'accès sont révoqués : l'ancien destinataire ne peut plus lire,
   et l'agence renvoie un lien au nouveau destinataire.
4. **Étant donné** un accès révoqué, **quand** l'agence tente de le modifier, **alors** la
   réponse est 409.

### US6 — Expiration et accès permanent (P1)

1. **Étant donné** un accès créé avec une date d'expiration, **quand** cette date passe,
   **alors** tout lien de l'accès répond la 404 uniforme, même s'il n'avait pas atteint sa
   propre échéance.
2. **Étant donné** un lien émis, **alors** son échéance est au plus la durée de lien
   demandée (par défaut et plafond de `lib/secure-links`) et jamais postérieure à
   l'échéance de l'accès.
3. **Étant donné** un accès permanent (sans échéance), **quand** un lien arrive à échéance,
   **alors** l'accès existe toujours mais plus aucun lien valide : l'agence doit émettre un
   nouveau lien (US8). Aucun lien n'est valable plus de la durée maximale.
4. **Étant donné** la liste des accès, **alors** un accès non révoqué qui expire dans les
   7 jours est signalé « expirant » ; un accès permanent n'est jamais « expirant ».

### US7 — L'agence révoque un accès, effet immédiat (P1)

1. **Étant donné** un accès actif avec des liens actifs, **quand** l'agence le révoque,
   **alors** l'accès porte `revokedAt` et tous ses liens sont révoqués.
2. **Étant donné** une révocation, **quand** le tiers recharge sa page ou lance un
   téléchargement, **alors** la réponse est la 404 uniforme, immédiatement.
3. **Étant donné** un accès déjà révoqué, **quand** il est révoqué à nouveau, **alors**
   l'appel réussit sans effet ni erreur.

### US8 — L'agence renvoie un lien (P2)

1. **Étant donné** un accès actif ou permanent, **quand** le gestionnaire clique « Renvoyer un
   lien », **alors** un nouveau lien est émis (réponse 201), son URL est affichée une seule
   fois (avec un bouton « Copier ») et un e-mail part vers le bénéficiaire (sauf
   `sendEmail: false`).
2. **Étant donné** `revokePreviousLinks: true`, **alors** les liens précédents sont révoqués,
   **avant** l'émission du nouveau ; la durée de lien demandée (`linkTtlDays`) est validée
   avant toute révocation, donc un refus pour durée hors plafond ne ferme aucun lien ; par
   défaut les anciens restent valides jusqu'à leur échéance ou leur révocation.
3. **Étant donné** un accès révoqué ou expiré, **quand** un renvoi est demandé, **alors** la
   réponse est 409 et aucun lien n'est créé.
4. **Étant donné** une liste d'accès, **alors** aucun bouton « copier » n'y figure : une URL
   n'existe qu'à la création et au renvoi.

### US9 — L'agence consulte le journal des consultations (P2)

1. **Étant donné** un accès consulté, **quand** le gestionnaire ouvre son journal, **alors** il
   voit, du plus récent au plus ancien (50 lignes par défaut, 100 au plus), les créations,
   modifications, révocations, envois de lien, consultations et téléchargements (nom du
   document), avec la date, l'adresse IP et le user-agent, et les rubriques concernées.
2. **Étant donné** le journal, la liste et le détail, **alors** aucun jeton ni hash n'y figure.

### US10 — Étanchéité entre agences (P1)

1. **Étant donné** un accès de l'agence A, **quand** un utilisateur de l'agence B appelle une
   route agence avec son identifiant, **alors** la réponse est la même `NotFoundError` qu'un
   accès inexistant.
2. **Étant donné** le lien d'un accès de l'agence A, **quand** il est consulté, **alors** les
   données lues sont celles de l'agence A uniquement, quel que soit l'appelant, et aucun
   identifiant fourni par l'appelant n'est pris en compte.
3. **Étant donné** un utilisateur sans `PROPERTIES_VIEW` ou `PROPERTIES_EDIT`, **quand** il
   appelle une route correspondante, **alors** la réponse est un refus de permission.

## 3. Exigences fonctionnelles

### Modèle et périmètre

- **FR-001** : le modèle `ExternalAccessGrant` porte `tenantId`, `type`
  (`NOTARY`, `ACCOUNTANT`, `BANKER`), `recipientName`, `recipientEmail`, `ownerClientId`
  (facultatif, relation `TenantClient` en `SetNull`), `sections` (liste de
  `ExternalAccessSection`), `expiresAt` (nul = permanent), `revokedAt`, `createdByUserId`
  (relation `User` en `SetNull`), `viewCount`, `lastViewedAt`, `lastLinkSentAt`, `createdAt`,
  `updatedAt`. Les rubriques sont `VALUATIONS`, `YIELD_RATIOS`, `LOANS`, `EXPENSES`, `RENTS`,
  `DOCUMENTS`, `TITLES_OWNERSHIP`.
- **FR-002** : trois tables de liaison, chacune avec `tenantId` direct, suppression en
  cascade avec l'accès (et avec le bien, l'entité ou le document visé) et unicité : `ExternalAccessGrantProperty` (`grantId`, `propertyId`,
  unique par couple), `ExternalAccessGrantEntity` (`grantId`, `entityId` vers
  `HoldingEntity`, unique par couple), `ExternalAccessGrantDocument` (`grantId`, `propertyId`,
  `documentId` vers `PropertyDocument`, unique par `grantId` + `documentId`). Index sur
  `[tenantId]`, `[tenantId, revokedAt]` et `[grantId]`.
- **FR-003** : le périmètre est **explicite** : liste de biens et/ou d'entités détentrices.
  Au moins un bien ou une entité est exigé (400 sinon). Il n'existe aucun périmètre
  « tout ce que possède X ». Le périmètre effectif d'une consultation est l'union, sans
  doublon, des biens listés et des biens obtenus en développant chaque entité par
  `PropertyHolding`, **à chaque appel**, puis refiltrés par une règle unique
  (`lib/external-access/scope.ts`, à l'écriture comme à la consultation) : un bien est dans le
  périmètre s'il appartient à l'agence, ou s'il est un bien CLIENT sans agence (`tenantId`
  nul) sous mandat de gestion actif de cette agence (même définition que le portail
  propriétaire, `activeMandateWhere`) ; un bien d'une autre agence, ou client sans mandat
  actif, se comporte comme un bien inexistant. Plafonds : **100 biens par accès, entités développées comprises**
  (400 à l'écriture au-delà ; à la consultation, si des entités ont grossi, la vue est
  tronquée aux 100 premiers biens par titre et `summary.truncated` vaut `true`), 50 entités et
  200 documents. Une liste de biens ou d'entités fournie mais dont rien n'est dans le
  périmètre est refusée en 404, non en 400 ; une entité qui ne détient aucun bien est refusée
  en 400 (à la création, et à la modification quand `entityIds` est fourni).
- **FR-004** : `ownerClientId` est facultatif, vérifié à la création : il doit être un client de l'agence
  éligible comme propriétaire (même filtre que `scope-options` : client de type propriétaire,
  désigné sur un bail ou indivisaire), sinon 404 ; aucune route ne le modifie ensuite. Il est
  **informatif** : il fournit le nom affiché
  (`ownerName`, « Propriétaire » à défaut de nom) et la quote-part par bien
  (`ownerSharesByProperty`, `sharePercent`), et pondère les **totaux** de la synthèse par
  cette quote-part, comme le portail propriétaire (`summary.ownerShareApplied` vaut `true`
  dès qu'une quote-part d'indivision a été trouvée pour un bien du périmètre). Un bien sans
  ligne d'indivision appartient en entier au propriétaire désigné : `sharePercent` est nul et
  le total le compte à 100 %. Les valeurs détaillées par bien restent celles du bien entier.
  Il n'élargit ni ne restreint le périmètre.
- **FR-005** : à la création, des `sections` omises prennent les défauts du type (BANKER :
  `VALUATIONS` + `YIELD_RATIOS` + `LOANS` ; ACCOUNTANT : `EXPENSES` + `RENTS` + `LOANS` ;
  NOTARY : `TITLES_OWNERSHIP` + `DOCUMENTS` + `VALUATIONS`). Des `sections` fournies sont
  appliquées telles quelles (dédoublonnées, remises dans l'ordre canonique) ; une liste vide, à la création comme à la modification, est
  refusée (400). Rien d'autre n'est ouvert par défaut.
- **FR-006** : un document n'est partageable que s'il est lié à l'accès
  (`ExternalAccessGrantDocument`, un document par ligne) **et** appartient à un bien du
  périmètre. Cette appartenance est vérifiée à l'écriture, puis à **chaque** consultation et
  téléchargement. La rubrique `DOCUMENTS` doit être accordée pour que les documents
  apparaissent ou se téléchargent ; fournir des `documentIds` sans elle est refusé en 400 à
  l'écriture. À la modification, `documentIds` remplace la liste entière ; un changement de
  périmètre sans `documentIds` retire les documents dont le bien a quitté le périmètre.
  Retirer la rubrique `DOCUMENTS` (modification de `sections`) **supprime** les documents
  liés : repartager un document crée une nouvelle `ref`. `PropertyDocument` n'est pas modifié (hors relation
  inverse Prisma).
- **FR-007** : `expiresAt` nul signifie accès permanent ; une date doit être dans le futur à
  la création et à la modification (400, validation `zod`). Le statut affiché est dérivé :
  `REVOKED` si `revokedAt`, sinon `EXPIRED` si l'échéance est passée, sinon `EXPIRING` si
  l'échéance tombe dans les 7 jours, sinon `ACTIVE`. Un accès permanent est `ACTIVE`.

### Liens (`lib/secure-links`)

- **FR-008** : le lien d'un accès est un `SecureLink` de portée `EXTERNAL_ACCESS_GRANT`,
  `objectType = 'ExternalAccessGrant'`, `objectId` = identifiant de l'accès. `SecureLinkScope`
  est étendu dans `schema.prisma`, dans le type TypeScript et dans `buildSecureLinkUrl`. Le
  noyau de la spec 031 (génération, hachage, vérification) ne change pas.
- **FR-009** : l'URL partagée est `${FRONTEND_URL}/acces-partage#<jeton>` : le jeton est dans
  le **fragment**. Il est renvoyé une seule fois, à la création de l'accès ou au renvoi ;
  aucune liste, aucun détail, aucun journal ne le contient ni ne contient son hash.
- **FR-010** : chaque lien vit au plus `SECURE_LINK_MAX_TTL_DAYS` (par défaut
  `SECURE_LINK_DEFAULT_TTL_DAYS`) et **jamais au-delà de `expiresAt` de l'accès** : option
  `maxExpiresAt` ajoutée à `createSecureLink`. Une durée `linkTtlDays` au-delà du plafond est
  refusée (400), comme en 031 (FR-003) ; une échéance d'accès déjà passée est refusée (400)
  par `createSecureLink`. Un accès permanent n'a pas de plafond d'accès mais
  ses liens restent bornés.
- **FR-011** : `revokeSecureLinksForObject(tenantId, objectType, objectId, actorUserId)` est
  ajoutée à `lib/secure-links` : elle pose `revokedAt` sur tous les liens actifs de l'objet,
  est idempotente, ne touche que l'agence donnée et journalise chaque lien révoqué
  (`SECURE_LINK_REVOKED`, identifiant seulement). `countActiveSecureLinksByObject` (liens non
  révoqués et non échus d'un lot d'objets, en une requête) sert à `activeLinkCount`.
- **FR-012** : la révocation d'un accès pose `revokedAt` et révoque tous ses liens (FR-011),
  l'un après l'autre dans le même appel (sans transaction commune : l'accès étant relu à
  chaque consultation, il se referme dès `revokedAt`). Sur un accès déjà révoqué, l'appel
  referme encore les liens restés actifs, sans nouvel événement. Un `recipientEmail` modifié
  révoque aussi les liens actifs, **avant** l'écriture du nouvel e-mail (échec fermé : si la
  révocation échoue, rien n'a changé ; si l'écriture échoue ensuite, les anciens liens sont
  déjà fermés et l'agence peut en renvoyer un).
  `revokePreviousLinks` lors d'un renvoi révoque les liens actifs précédents avant d'émettre
  le nouveau.

### Vue publique

- **FR-013** : `POST /api/public/external-access/patrimoine` avec `{ "token": "…" }`. Même
  gabarit que la route de la spec 031 : limiteur de débit par IP appliqué **avant** toute
  vérification ; parseur JSON propre à la route borné à 1 Ko, le préfixe
  `PUBLIC_EXTERNAL_ACCESS_PREFIX = '/api/public/external-access'` étant exclu des parseurs
  globaux d'`app.ts` ; toute erreur de corps (JSON invalide, trop gros, encodage refusé) est
  convertie en la 404 uniforme, sans journaliser le message du parseur ; aucune route
  n'accepte le jeton en chemin ni en paramètre de requête.
- **FR-014** : toute réponse publique du lot (200, 404, 429 du limiteur de la route,
  téléchargement compris) porte `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`
  et `Referrer-Policy: no-referrer`.
- **FR-015** : à **chaque** appel, le serveur vérifie, sans cache : le jeton (non expiré, non
  révoqué, portée `EXTERNAL_ACCESS_GRANT`, agence active, selon la spec 031) **et** l'accès
  lui-même (existe, `revokedAt` nul, `expiresAt` nul ou futur, périmètre non vide : la vue
  d'un périmètre vide est une 404 uniforme, non une vue sans bien). Un bien qui sort du
  périmètre entre deux lectures (`NotFoundError` du calcul de rendement) donne le même
  refus. Tout échec renvoie
  `invalidSecureLinkError()` : la même 404 « Lien invalide ou expiré. », mêmes en-têtes.
- **FR-016** : seul `token` est lu du corps (et `documentRef` pour le téléchargement) ; aucun
  identifiant de bien, d'agence, d'entité ou de propriétaire n'est accepté de l'appelant. Les
  données sont lues sous le contexte d'agence du lien, par `tenantId` du lien.
- **FR-017** : la réponse de la vue (`ExternalAccessViewDto`) contient toujours
  l'identification : `agencyName`, `grantType`, `recipientName`, `ownerName` (nul si aucun
  propriétaire désigné), `linkExpiresAt`, `accessExpiresAt` (nul si permanent), `currency`
  (`XOF`), `sections` (les rubriques accordées), `summary.propertyCount`,
  `summary.ownerShareApplied` (FR-004), `summary.truncated` (présent, à `true`, seulement si le
  périmètre développé a dépassé le plafond de FR-003) et, par bien, `reference`, `title`, `address`, `city`,
  `sharePercent` (nul sans propriétaire désigné, ou pour un bien qu'il détient en entier).
  Les biens sont triés par titre.
- **FR-018** : les clés d'une rubrique n'existent **que si la rubrique est accordée** ; une
  rubrique accordée est **toujours présente**, vide si besoin. Chaque rubrique n'est lue en
  base que si elle est accordée.
  - `VALUATIONS` : `valuation` = `null` (clé présente) si le bien n'a aucune valorisation ;
    sinon valeur estimée la plus récente (`VALUATION_ORDER_BY`), date, coût d'acquisition (le
    premier non nul de l'historique), devise, `latentCapitalGain` (nul si inconnue ; calculée par le moteur de rendement, dont le coût de
    revient inclut les dépenses capitalisées du bien : inférence acceptée, voir limites
    assumées) et
    `history` (24 lignes au plus). En synthèse : `totalEstimatedValue` et
    `totalLatentCapitalGain` (nul si aucune plus-value n'est connue), pondérés par la
    quote-part (FR-004) ;
  - `YIELD_RATIOS` : `yield` (rendements brut, net, net-net, loyer annuel, charges annuelles),
    calculé avec les fonctions pures de `lib/patrimoine/yield.ts` sans les modifier ;
    `grossYield` et `netYield` valent `null` pour un bien sans valorisation (valeur courante
    nulle : un 0 % serait trompeur) ; `netNetYield` vaut `null` si `LOANS` n'est pas accordée
    (il se déduit des mensualités de prêt) ; les entrées de rendement sont calculées par lots de
    5 biens (concurrence limitée) ;
  - `LOANS` : `loans` (`[]` sans prêt ; prêteur, capital, capital restant, taux, mensualité,
    devise, dates, statut, tous statuts). En synthèse, `totalRemainingLoanCapital` (prêts
    actifs seulement, pondéré par la quote-part) ;
  - `EXPENSES` : `expenses` = `totalLast12Months` (12 mois glissants, sur toutes les lignes
    de la fenêtre) et `items` (date, catégorie, montant ; **24 mois glissants, 200 lignes au
    plus par bien**, plus récentes d'abord ; **sans aucun texte libre**) ;
  - `RENTS` : `rents` (`[]` sans bail ; baux `ACTIVE`, `SUSPENDED` ou `ENDED` : statut, dates,
    loyer, charges, périodicité, **sans identité de locataire**) ;
  - `TITLES_OWNERSHIP` : `titles` (type de bien, surface, type de propriété ; `holdings`
    (`[]` si aucune) ne détaille que les **personnes morales** (forme juridique différente de
    `INDIVIDUAL`) de l'agence **explicitement listées dans l'accès**
    (`ExternalAccessGrantEntity`) : nom, forme juridique, pays, RCCM, numéro fiscal,
    pourcentage. Un accès **par biens seuls** (aucune entité listée) ne détaille donc aucune
    société ; pour en nommer une, l'agence l'ajoute à l'accès. Toutes les autres détentions
    (personne physique, entité hors de l'accès, ou toutes les détentions d'un accès sans
    entité) sont agrégées dans `otherHoldersSharePercent` (somme des pourcentages, `null`
    s'il n'y en a pas), sans nom ni identifiant ; et `ownerSharePercent` du propriétaire désigné) ;
  - `DOCUMENTS` : `documents` (`[]` si aucun ; `ref`, nom, type, taille, type MIME, date),
    limités aux documents liés à l'accès (FR-006).
- **FR-019** : la réponse ne contient **jamais** : e-mail ou téléphone (propriétaire,
  bénéficiaire, locataires, tiers), identité des locataires, nom d'un co-indivisaire ou d'une personne physique détentrice (seuls les pourcentages sont
  exposés, agrégés dans `otherHoldersSharePercent`), texte libre interne (descriptions de dépenses, notes),
  fournisseurs, chemin disque, identifiant technique de bien, d'agence, d'entité ou de
  propriétaire. La projection est faite par `select` explicite, jamais par sérialisation
  d'un objet Prisma.
- **FR-020** : une consultation réussie incrémente `viewCount`, met à jour `lastViewedAt` de
  **l'accès** et journalise `EXTERNAL_ACCESS_GRANT_VIEWED` (FR-035) ; rien n'est écrit avant
  une lecture réussie, l'événement d'audit est écrit d'abord, puis le compteur, chacun isolé : l'échec du compteur
  ne supprime pas la trace d'audit, et aucun des deux ne transforme la lecture en erreur
  (avertissement applicatif sans jeton). `recordSecureLinkView` n'est **pas** appelé : ni les
  compteurs du `SecureLink` ni `SECURE_LINK_VIEWED` ne sont touchés pour cette portée. Un
  téléchargement ne modifie pas `viewCount`.
- **FR-021** : la page publique `/acces-partage` (`ExternalAccessViewPage`) lit le jeton dans
  `location.hash`, le **garde en mémoire** et retire le fragment de la barre d'adresse dès
  la lecture ; elle envoie le jeton en corps d'un `POST`, affiche un bandeau « Accès en
  lecture seule accordé par <agence> » et une section par rubrique reçue ; le
  téléchargement d'un document est un `POST` (blob) réutilisant le jeton en mémoire. Elle
  pose `robots: noindex, nofollow` et `referrer: no-referrer` le temps du montage, n'a aucun
  lien sortant, prévoit une feuille de style d'impression, est trilingue (fr/en/ar) et
  utilise des marges logiques. Sur 404, elle affiche « Lien invalide ou expiré. » et rien
  d'autre ; recharger la page exige de rouvrir le lien reçu.

### Documents

- **FR-022** : `POST /api/public/external-access/documents/download` avec
  `{ "token", "documentRef" }` (`documentRef` : chaîne d'au plus 64 caractères). Il revérifie
  le jeton et l'accès (FR-015), que la rubrique `DOCUMENTS` est accordée, que `documentRef`
  est l'identifiant d'une ligne de liaison **de cet accès**, et que le bien de la ligne est
  encore dans le périmètre (FR-003). Tout échec renvoie la même 404 uniforme.
- **FR-023** : `documentRef` est l'identifiant de la ligne de liaison, jamais celui du
  `PropertyDocument` ni un chemin. Le fichier est lu par
  `getPropertyDocumentFileForTenant(..., { managedByMandate: true })` puis envoyé en une
  seule réponse depuis un tampon en mémoire (pas de flux), avec `Content-Type`,
  `Content-Length`, `Content-Disposition: attachment; filename*=UTF-8''…` (nom encodé selon la RFC 5987,
  `'`, `(`, `)` et `*` compris),
  `X-Content-Type-Options: nosniff` et les en-têtes de FR-014. Aucune réponse ne contient de
  chemin disque.
- **FR-024** : le téléchargement journalise `EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED`
  (FR-030) après lecture réussie du fichier.

### Routes agence

- **FR-025** : sous `/api/tenants/:tenantId/patrimoine/external-access` (JWT et
  `requireTenantAccess`), réponses `{ success: true, data }` :

  | Route                                 | Permission        | Effet                                                                                                                                                         |
  | ------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `GET /`                               | `PROPERTIES_VIEW` | liste des accès (`GrantSummary[]`, enveloppe `{ items }`), 500 au plus, plus récents d'abord                                                                  |
  | `GET /scope-options`                  | `PROPERTIES_VIEW` | `types`, rubriques, défauts par type, `maxLinkTtlDays`, propriétaires, biens (avec propriétaire indicatif) et entités actives de l'agence, 500 au plus chacun |
  | `GET /property-documents/:propertyId` | `PROPERTIES_VIEW` | documents d'un bien du périmètre de l'agence (id, nom, type, taille, date ; 500 au plus ; 404 hors périmètre)                                                 |
  | `POST /`                              | `PROPERTIES_EDIT` | crée l'accès et un lien, envoie l'e-mail ; 201, URL renvoyée une seule fois                                                                                   |
  | `GET /:grantId`                       | `PROPERTIES_VIEW` | détail (`GrantDetail`)                                                                                                                                        |
  | `PATCH /:grantId`                     | `PROPERTIES_EDIT` | modifie rubriques, échéance, bénéficiaire, périmètre, documents ; révoqué = 409                                                                               |
  | `POST /:grantId/revoke`               | `PROPERTIES_EDIT` | révoque l'accès et ses liens ; idempotent ; renvoie le détail                                                                                                 |
  | `POST /:grantId/send-link`            | `PROPERTIES_EDIT` | émet un nouveau lien (`linkTtlDays`, `revokePreviousLinks`, `sendEmail`) ; 201 ; révoqué ou expiré = 409                                                      |
  | `GET /:grantId/access-log`            | `PROPERTIES_VIEW` | journal (`?limit=`, 50 par défaut, 100 au plus ; enveloppe `{ items }`)                                                                                       |

- **FR-026** : les lectures passent par `requireAnyPropertyPermission(['PROPERTIES_VIEW'])` et
  les écritures par `requirePropertyPermission('PROPERTIES_EDIT')`, exactement comme
  `patrimoine-routes.ts`, posées route par route. Aucune nouvelle permission n'est créée :
  le périmètre d'un accès porte sur des biens et leurs documents, et qui peut modifier un bien
  décide déjà de qui le consulte (justification complète en hypothèse H3).
- **FR-027** : tout identifiant reçu (`propertyIds`, `entityIds`, `ownerClientId`,
  `documentIds`, `grantId`) est vérifié comme appartenant à l'agence avant lecture ou
  écriture (propriétaire : client de l'agence éligible, même filtre que `scope-options` ; `propertiesInAgencyScope` pour les biens, avec
  la règle de FR-003 ; `entitiesInAgency` pour les entités ; `loadShareableDocuments` pour les
  documents ; `grantId` lu avec `tenantId`). Une référence d'une autre agence lève la même
  `NotFoundError` qu'un objet inexistant. Un document est en outre vérifié comme appartenant à
  un bien **du périmètre résultant** (FR-006), sinon la même `NotFoundError` (404) est levée. À la modification (FR-029), seuls les
  identifiants **ajoutés** sont revérifiés.
- **FR-028** : `POST /` accepte `type`, `recipientName`, `recipientEmail`, `ownerClientId?`,
  `propertyIds`, `entityIds`, `sections?`, `documentIds`, `expiresAt?` (ISO ; nul =
  permanent), `linkTtlDays?` (entier de 1 à `SECURE_LINK_MAX_TTL_DAYS`, validé par `zod` puis revalidé
  **avant toute écriture**), `sendEmail?` (défaut `true`). Le corps est strict : un champ non
  prévu est refusé (400) ; `propertyIds`, `entityIds` (UUID) et `documentIds` valent `[]` par
  défaut. La réponse 201 contient `grant` (détail), `link` (`id`, `url`, `expiresAt`) et
  `email` (`sent`, `reason?` : `NOT_REQUESTED`, `EVENT_DISABLED` ou `SEND_FAILED`). L'échec
  d'envoi de l'e-mail n'annule pas la création : `email.sent` vaut `false` avec son motif, et
  l'agence peut renvoyer le lien. En revanche, si la création du lien (`createSecureLink`) échoue, l'accès créé est
  **supprimé** (ses lignes de périmètre partent en cascade) et
  l'erreur est renvoyée. L'événement `EXTERNAL_ACCESS_GRANT_CREATED` est écrit **après**
  l'émission du lien : jamais pour un accès supprimé par compensation. Une durée de lien hors plafond est refusée (400) avant la création de l'accès ; la
  suppression compensatoire ne vaut que pour l'échec de `createSecureLink`, jamais après le
  départ d'un e-mail.
- **FR-029** : `PATCH` accepte `sections?`, `expiresAt?` (nul = permanent), `recipientName?`,
  `recipientEmail?`, `propertyIds?`, `entityIds?`, `documentIds?` ; le corps est strict et doit
  contenir au moins un champ ; un champ absent est inchangé, une liste fournie remplace la
  liste entière ; `ownerClientId` n'est pas modifiable. Seuls les identifiants **ajoutés**
  (biens, entités, documents) sont revérifiés (404 s'ils sont d'une autre agence ou hors
  périmètre) ; ceux déjà présents mais sortis du périmètre ou de l'agence (mandat échu…) sont
  **élagués en silence**, et un document lié dont le bien a quitté le périmètre est retiré.
  Retirer la rubrique `DOCUMENTS` supprime les documents liés (FR-006). Les règles de FR-003, FR-005, FR-006 et FR-007 s'appliquent à l'état résultant.
  Le changement de `recipientEmail` révoque les liens actifs avant l'écriture (FR-012). Aucune modification
  ne prolonge un lien existant : prolonger l'accès ne rend pas un lien expiré valide.
- **FR-030** : `GrantSummary` : `id`, `type`, `recipientName`, `recipientEmail`,
  `ownerClientId`, `ownerName`, `sections`, `expiresAt`, `permanent`, `revokedAt`, `status`
  (FR-007), `propertyCount`, `entityCount`, `documentCount`, `viewCount`, `lastViewedAt`,
  `lastLinkSentAt`, `activeLinkCount` (liens non révoqués et non échus), `createdAt`. `ownerName`
  est le seul nom du propriétaire désigné (jamais son e-mail ni son téléphone). `GrantDetail` y
  ajoute `properties`
  (`id`, `title`, `reference`), `entities` (`id`, `name`) et `documents` (`id` du
  `PropertyDocument`, `propertyId`, `fileName`). Aucune de ces réponses ne contient de jeton
  ni de hash.
- **FR-031** : l'écran « Accès partagés » (`/tenant/:tenantId/patrimoine/external-access`,
  entrée de menu `patrimoine-external-access`, visible avec `PROPERTIES_VIEW`, page en
  `React.lazy`) propose : la liste (statut actif / expirant / expiré / révoqué, type,
  bénéficiaire, périmètre, rubriques, dernière consultation, nombre de consultations) ; la
  création guidée en quatre étapes (type et bénéficiaire ; périmètre : propriétaire, biens,
  entités ; rubriques avec les défauts du type modifiables, puis documents partageables ;
  durée : permanent ou date, et durée du lien) ; la modification des rubriques, de
  l'échéance et du périmètre ; « Renvoyer un lien » (URL affichée une fois, avec copie) ;
  « Révoquer » avec confirmation ; le journal des consultations. Les actions de modification
  exigent `PROPERTIES_EDIT`.

### Notification

- **FR-032** : nouvelle clé e-mail `EXTERNAL_ACCESS_LINK_SENT`, rattachée à la fonctionnalité
  d'abonnement `PATRIMOINE` (`notification-key-features.ts`), avec catalogue, gabarit par
  défaut en français correctement accentué (test d'accents) et variables
  `{{recipientName}}`, `{{agencyName}}`, `{{accessType}}`, `{{accessUrl}}`,
  `{{expiresAt}}` (`expiresAt` = échéance du lien). Elle apparaît dans les écrans de
  configuration des notifications, désactivable avec modèle personnalisable par agence.
- **FR-033** : le destinataire est le `recipientEmail` de l'accès, jamais un paramètre de
  l'appel d'envoi. Le bénéficiaire est un tiers sans fiche CRM : **aucun contrôle de
  consentement CRM** n'est fait, l'envoi étant une action explicite de l'agence. L'URL figure
  dans le corps, jamais dans le sujet ni dans un journal applicatif ; les valeurs injectées
  dans le gabarit HTML sont échappées.
- **FR-034** : chaque émission de lien (création, renvoi) met à jour `lastLinkSentAt`, que
  l'e-mail soit parti ou non (`sendEmail: false`, événement désactivé, échec), et journalise
  `…_LINK_SENT` (`linkId`, `emailSent`). L'envoi d'e-mail n'est coupé que par `NODE_ENV=test` :
  en développement, un envoi part réellement si un fournisseur est configuré (SECURITY.md,
  § 12 bis).

### Journalisation

- **FR-035** : événements `logAuditEvent` ajoutés à `types/audit-types.ts` :
  `EXTERNAL_ACCESS_GRANT_CREATED`, `EXTERNAL_ACCESS_GRANT_UPDATED`,
  `EXTERNAL_ACCESS_GRANT_REVOKED`, `EXTERNAL_ACCESS_GRANT_LINK_SENT`,
  `EXTERNAL_ACCESS_GRANT_VIEWED`, `EXTERNAL_ACCESS_GRANT_DOCUMENT_DOWNLOADED`, avec
  `entityType: 'ExternalAccessGrant'` et `entityId` = identifiant de l'accès. Chaque
  création, modification, révocation, envoi de lien, consultation réussie et téléchargement
  réussi produit un événement.
- **FR-036** : le payload contient `grantId`, `linkId`, les `sections` consultées,
  `documentRef` et le nom du document téléchargé ; la création porte aussi le type, les
  rubriques et les décomptes, la modification les **noms** des champs modifiés (jamais les
  valeurs), l'envoi de lien `emailSent` ; jamais l'e-mail du bénéficiaire, jamais un jeton ni
  son hash. L'adresse IP et le user-agent de l'appelant (tronqué à 500 caractères, sans saut de
  ligne) sont écrits dans les colonnes `ipAddress` et `userAgent` du journal, nulle part
  ailleurs. Les consultations et téléchargements publics sont
  attribués au `tenantId` de l'accès, avec `actorUserId: null`. Les refus ne sont pas
  journalisés un par un (comme en 031).
- **FR-037** : `GET /:grantId/access-log` lit `AuditLog` filtré par `tenantId`,
  `entityType = 'ExternalAccessGrant'` et `entityId` ; il renvoie 50 lignes par défaut, 100 au
  plus (`id`, `at`, `action`, `ipAddress`, `userAgent`, et selon le cas `sections`,
  `documentName`), du plus récent au plus ancien. `action` vaut `CREATED`, `UPDATED`,
  `REVOKED`, `LINK_SENT`, `VIEWED` ou `DOCUMENT_DOWNLOADED` ; seules ces clés et les rubriques
  connues sortent, jamais la charge brute.

### Transverse

- **FR-038** : chaque nouvelle route passe `routes-inventory.test.ts` ; les deux routes
  publiques sont inscrites à la liste blanche des routes publiques avec leur justification
  (jeton secret, limiteur, lecture seule, objet unique). Les quatre nouveaux modèles passent
  `schema-tenant-coverage.test.ts` (`tenantId` direct).
- **FR-039** : les quatre modèles sont exportés dans l'export d'agence (ils ne portent aucun
  secret) : classés `DIRECT` sur `tenantId` par la dérivation automatique de
  `services/tenant-data-export/model-registry.ts`, qui n'a pas été modifié ; un test de
  `tenant-data-export.registry.test.ts` le vérifie. `SecureLink` y reste exclu.
- **FR-040** : tout libellé visible passe par `t()` (fr clé, en, ar) ; marges en propriétés
  logiques ; l'écran agence et la page publique sont lisibles en arabe (RTL).
- **FR-041** : le lot n'introduit aucune variable d'environnement : il réutilise
  `SECURE_LINK_DEFAULT_TTL_DAYS` et `SECURE_LINK_MAX_TTL_DAYS` de la spec 031.
- **FR-042** : les migrations sont additives : `20261007140000_patrimoine_acces_tiers`
  (enums et quatre tables) puis, **séparée**, `20261007140100_secure_link_scope_external_access`
  (`ALTER TYPE "SecureLinkScope" ADD VALUE 'EXTERNAL_ACCESS_GRANT'`, valeur non utilisée dans
  la même migration). Aucune migration existante n'est éditée.
- **FR-043** : le wiki des fonctionnalités reçoit les sous-fonctionnalités du lot (voir
  plan.md), puis `npm run wiki:export`.

## 4. Menaces et mesures

Détail du modèle de menace générique : SECURITY.md, « 12 bis. Liens publics à jeton ». Les
mesures de la spec 031 (jeton de 256 bits, hash seul en base, refus uniforme, fragment puis
corps, limiteur, en-têtes) s'appliquent telles quelles ; le tableau ci-dessous couvre ce que
ce lot ajoute ou aggrave : un lien plus durable, un périmètre multi-biens, des documents et
des données patrimoniales sensibles.

| Menace                                                         | Mesure retenue                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Vérification                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Énumération d'identifiants (accès, biens, documents)           | Aucun identifiant n'est accepté de l'appelant public : seul le jeton compte. Le document se désigne par une `ref` opaque (ligne de liaison) vérifiée contre l'accès du jeton. Côté agence, toute référence inconnue ou étrangère donne la même `NotFoundError`. Refus public uniforme                                                                                                                                                                              | FR-016, FR-023, FR-027 ; test paramétré des refus                     |
| Fuite inter-tenant                                             | Quatre modèles avec `tenantId` direct ; lecture sous le contexte d'agence du lien ; propriétés et entités chargées par `tenantId` ; développement des entités et mandats filtrés par agence ; garde Prisma active ; `NotFoundError` uniforme côté agence                                                                                                                                                                                                           | FR-002, FR-016, FR-027, FR-038 ; `external-access.db.test.ts`         |
| Élévation de portée : rubriques                                | Les clés d'une rubrique n'existent que si elle est accordée ; rubriques relues à chaque appel ; liste vide refusée ; défauts minimaux par type                                                                                                                                                                                                                                                                                                                     | FR-005, FR-018 ; test : rubrique non accordée = clé absente           |
| Élévation de portée : périmètre                                | Périmètre explicite, jamais dynamique « tout ce que possède X » ; entités développées à chaque appel et filtrées par agence ; documents vérifiés dans le périmètre à l'écriture, à la consultation et au téléchargement ; aucun identifiant de bien lu de l'appelant                                                                                                                                                                                               | FR-003, FR-006, FR-016 ; test : bien hors périmètre absent            |
| Jeton volé ou transféré                                        | Impossible à empêcher sans identité du porteur : on borne l'impact. Lecture seule ; durée de lien bornée ; jamais au-delà de l'échéance de l'accès ; révocation de l'accès et de tous ses liens à tout moment ; consultations comptées et journalisées avec IP et user-agent ; changement d'e-mail révoque les liens avant l'écriture                                                                                                                              | FR-010, FR-012, FR-015, FR-020, FR-036 ; limites ci-dessous           |
| Rejeu après révocation ou expiration                           | Jeton, `grant.revokedAt` et `grant.expiresAt` revérifiés côté serveur à chaque appel (vue et téléchargement), sans cache du verdict ; révocation de l'accès révoque aussi ses liens                                                                                                                                                                                                                                                                                | FR-012, FR-015 ; tests : après révocation puis après expiration = 404 |
| Fuite de données personnelles de tiers                         | Projection par `select` explicite ; aucun e-mail, téléphone, identité de locataire, nom de co-indivisaire (pourcentages seuls), texte libre ni fournisseur ; en `TITLES_OWNERSHIP`, seules les personnes morales **explicitement listées** dans l'accès sont nommées (un accès par biens seuls ne nomme aucune société), toute autre détention est agrégée sans nom ni identifiant ; l'e-mail du bénéficiaire ne figure ni dans la vue publique ni dans le journal | FR-018, FR-019, FR-036 ; test : balayage de la réponse complète       |
| Téléchargement hors périmètre                                  | `documentRef` = ligne de liaison de CET accès, bien encore dans le périmètre, rubrique `DOCUMENTS` accordée, accès valide ; sinon 404 uniforme ; aucun chemin disque ; `attachment` et `nosniff`                                                                                                                                                                                                                                                                   | FR-006, FR-022, FR-023 ; tests : ref d'un autre accès, bien retiré    |
| Devinette du jeton                                             | Hérité de 031 : 256 bits, générateur cryptographique ; limiteur par IP en premier ; pas de code court                                                                                                                                                                                                                                                                                                                                                              | spec 031 FR-002, FR-006 ; FR-013                                      |
| Journaux d'accès et journaux applicatifs                       | Jeton jamais dans l'URL (fragment, puis corps de `POST`, y compris pour le téléchargement) ; payload d'audit sans jeton, hash ni e-mail ; message du parseur non journalisé ; URL du lien jamais dans un sujet ni un journal                                                                                                                                                                                                                                       | FR-009, FR-013, FR-033, FR-036 ; test : aucune route n'accepte l'URL  |
| Cache, `Referer`, indexation                                   | `no-store`, `noindex, nofollow`, `no-referrer` sur toutes les réponses publiques, téléchargement compris ; page sans lien sortant ; fragment retiré de la barre d'adresse, jeton gardé en mémoire                                                                                                                                                                                                                                                                  | FR-014, FR-021 ; test : en-têtes sur 200, 404, 429, flux              |
| Déni de service et abus du téléchargement                      | Limiteur de débit par IP avant toute vérification (partagé avec les autres liens publics) ; corps borné à 1 Ko ; un seul champ lu ; fichier lu en mémoire puis envoyé en une réponse                                                                                                                                                                                                                                                                               | FR-013, FR-023                                                        |
| Déni de service par grand périmètre                            | Plafond de 100 biens par accès, entités développées comprises (400 à l'écriture, troncature signalée à la consultation) ; 200 lignes de dépenses par bien ; rendement calculé par lots de 5 biens ; corps de 1 Ko ; limiteur par IP avant toute vérification                                                                                                                                                                                                       | FR-003, FR-018 ; limite résiduelle ci-dessous                         |
| Accès permanent transformé en jeton éternel                    | Un accès permanent ne rend aucun lien permanent : chaque lien est borné par `SECURE_LINK_MAX_TTL_DAYS` ; la continuité passe par la réémission d'un lien par l'agence ; l'accès reste révocable et visible dans la liste                                                                                                                                                                                                                                           | FR-010, FR-007 ; test : lien d'un accès permanent expire              |
| Changement d'e-mail du bénéficiaire                            | Les liens actifs sont révoqués à la modification de `recipientEmail` : un ancien destinataire ou un lien transféré ne survit pas au changement ; l'agence renvoie un lien au nouveau destinataire                                                                                                                                                                                                                                                                  | FR-012, FR-029 ; test : lien ancien = 404 après changement            |
| Base de données compromise                                     | Seul le hash des jetons est stocké (`SecureLink`, exclu de l'export d'agence) ; aucun jeton dans `AuditLog` ni dans les réponses ; l'e-mail du bénéficiaire reste une donnée d'agence, absente des journaux                                                                                                                                                                                                                                                        | FR-009, FR-036, FR-039 ; test : 0 jeton en clair en base              |
| Lien utilisé comme porte vers autre chose                      | Portée dédiée ; la route d'une portée refuse un lien d'une autre portée (refus uniforme) ; aucune session, aucun cookie ; une route publique de ce lot n'accepte que `EXTERNAL_ACCESS_GRANT`                                                                                                                                                                                                                                                                       | FR-008, FR-015 ; test : lien de rapport propriétaire refusé           |
| Agence suspendue ou désactivée                                 | Statut de l'agence contrôlé à chaque appel par la vérification de 031                                                                                                                                                                                                                                                                                                                                                                                              | FR-015                                                                |
| Envoi du lien à un mauvais destinataire ou par un canal exposé | Destinataire lu sur l'accès, jamais fourni à l'envoi ; URL dans le corps uniquement ; valeurs échappées dans le HTML ; un seul e-mail par envoi ; envoi explicite de l'agence                                                                                                                                                                                                                                                                                      | FR-033, FR-034                                                        |
| Exposition par un utilisateur de l'agence sans droit suffisant | Création, modification, révocation et renvoi exigent `PROPERTIES_EDIT` ; consultation de la liste et du journal exige `PROPERTIES_VIEW`                                                                                                                                                                                                                                                                                                                            | FR-025, FR-026 ; test de permissions                                  |

**Limites assumées.**

- Un lien divulgué donne accès en lecture, jusqu'à son expiration ou sa révocation, à **tout
  le périmètre et à toutes les rubriques** de l'accès, et pas à un seul objet comme en 031 ;
  l'impact est plus large, d'où la durée de lien bornée, la révocation immédiate et le
  journal. Aucune vérification d'identité du porteur n'est faite.
- Les liens actifs précédents ne sont pas révoqués automatiquement lors d'un renvoi (sauf
  `revokePreviousLinks`).
- La rubrique `TITLES_OWNERSHIP` expose les noms, RCCM et numéros fiscaux des seules
  personnes morales de l'agence explicitement listées dans l'accès (`ExternalAccessGrantEntity`) ;
  un accès par biens seuls n'en nomme aucune, et les autres détentions (personnes physiques,
  entités hors accès) ne sont données que sous forme d'un pourcentage agrégé.
- La plus-value latente (rubrique `VALUATIONS`) vient du moteur de rendement, dont le coût de
  revient inclut les dépenses capitalisées du bien : un tiers qui voit la valeur et la
  plus-value peut en déduire un ordre de grandeur de ces dépenses. Inférence acceptée.
- Le coût d'une consultation est **borné mais non nul** (100 biens au plus, environ 6
  requêtes de rendement par bien, par lots de 5) sur une route anonyme ; le limiteur par IP
  (30 requêtes par minute) est partagé avec les autres liens publics et en mémoire, par
  instance : un porteur de lien valide peut consommer ce budget.
- Un document téléchargé échappe ensuite à tout contrôle : l'agence ne lie que ce qu'elle
  accepte de voir quitter la plateforme.
- Les limiteurs de débit sont en mémoire, par instance ; le plancher de débit global peut
  répondre 429 sans les en-têtes de FR-014 (limites déjà documentées dans SECURITY.md).
- Le limiteur de la vue et du téléchargement est **le même objet** que celui du rapport mensuel
  de la spec 031 : un seul budget de 30 requêtes par minute et par IP pour tous les liens
  publics ; un tiers qui télécharge plusieurs documents peut atteindre la limite et gêner
  d'autres liens publics de la même adresse.
- `PROPERTIES_EDIT` suffit à ouvrir des documents privés d'un bien à un tiers ; une permission
  distincte serait un ajout de la plateforme, hors lot.
- Les messages de validation `zod` de l'API d'agence sont écrits en français brut, sans `t()`
  (non traduits en anglais ni en arabe).
- Un renvoi avec `revokePreviousLinks` révoque les anciens liens avant d'émettre le nouveau ;
  la durée demandée est validée avant, donc seul un échec technique de l'émission les laisse
  révoqués.

## 5. Entités clés

- **`ExternalAccessGrant`** (nouveau) : l'accès nominatif d'un tiers ; porte type,
  bénéficiaire, rubriques, échéance, révocation, compteurs de consultation.
- **`ExternalAccessGrantProperty`**, **`ExternalAccessGrantEntity`** (nouveaux) : le
  périmètre explicite, par bien et par entité détentrice (`HoldingEntity`).
- **`ExternalAccessGrantDocument`** (nouveau) : un document partageable lié à l'accès, dans
  un bien du périmètre ; son identifiant est la `ref` publique.
- **`SecureLink`** (existant, spec 031) : le lien ; portée `EXTERNAL_ACCESS_GRANT` ajoutée,
  `objectType = 'ExternalAccessGrant'`, `objectId` = identifiant de l'accès.
- **`TenantClient`** (existant) : propriétaire désigné, facultatif et informatif.
- **`PropertyHolding`**, **`HoldingEntity`** (existants) : développement d'une entité en
  biens ; données de la rubrique `TITLES_OWNERSHIP`.
- **`Property`**, **`PropertyDocument`**, valorisations, emprunts, dépenses, baux (existants,
  inchangés) : sources en lecture seule de la vue publique.
- **`AuditLog`** (existant) : journal des consultations, téléchargements et envois.

## 6. Hypothèses

- **H1 — Permanent = réémission de liens.** Un accès sans échéance reste valable jusqu'à
  révocation, mais chaque lien est borné par `SECURE_LINK_MAX_TTL_DAYS` ; l'agence réémet un
  lien (« Renvoyer un lien »). Il n'existe pas de jeton éternel.
- **H2 — Périmètre explicite et non dynamique.** Le périmètre est une liste de biens et/ou
  d'entités choisis à la main ; une entité est développée en biens à chaque consultation, ce
  qui reflète ses participations du moment, mais un nouveau bien d'un propriétaire n'entre
  jamais dans un accès sans action de l'agence (sauf s'il devient une participation d'une
  entité listée). Un périmètre qui se vide (biens supprimés, mandat échu, participations retirées) rend la
  même 404 uniforme que tout refus, non une vue sans bien.
- **H3 — Permissions `PROPERTIES_VIEW` / `PROPERTIES_EDIT`.** Le périmètre d'un accès porte
  sur des biens et leurs documents ; les écrans voisins du patrimoine (`patrimoine-routes.ts`)
  se gardent par ces mêmes permissions via `requireAnyPropertyPermission`. Une permission
  dédiée multiplierait les rôles à reconfigurer pour une fonction que les gestionnaires de
  biens exercent déjà, et celui qui peut voir ou modifier un bien peut décider de qui le
  consulte. L'accès reste modifiable seulement avec `PROPERTIES_EDIT` (création, modification,
  révocation, renvoi ; `PROPERTIES_VIEW` pour la liste, le détail, les options, les documents
  d'un bien et le journal). Conséquence assumée : `PROPERTIES_EDIT` suffit à ouvrir à un tiers
  les documents privés d'un bien ; une permission distincte serait un ajout de la plateforme.
- **H4 — Pas de vérification d'identité du porteur du lien.** Aucun code complémentaire (SMS,
  e-mail) n'est demandé : qui possède l'URL est, pour le serveur, le bénéficiaire. La borne
  d'impact est la durée de lien, la révocation et le journal.
- **H5 — E-mail du bénéficiaire sans consentement CRM.** Le bénéficiaire est un tiers sans
  fiche CRM ; l'envoi est une action explicite de l'agence, vers l'adresse qu'elle a
  saisie. Aucun contrôle de consentement CRM ne s'applique.
- **H6 — L'échec d'envoi ne bloque pas.** Si l'e-mail ne part pas, l'accès et son lien sont
  créés ; la réponse porte `email.sent = false` et un motif (`NOT_REQUESTED`, `EVENT_DISABLED`,
  `SEND_FAILED`), l'URL n'étant renvoyée qu'une fois, l'agence la copie ou renvoie un lien.
- **H7 — Valeurs de repli.** Sans `linkTtlDays`, la durée de lien est le défaut de la spec 031.
  Le limiteur de la vue et du téléchargement est celui de la spec 031 (par IP, avant
  toute vérification), partagé par toutes les routes publiques à jeton. Une échéance d'accès
  passée est refusée à l'écriture (400, validation `zod`) ; un document hors périmètre, comme
  un bien ou une entité hors agence, est refusé par la `NotFoundError` uniforme (404).
- **H7 bis — Export d'agence.** Les quatre modèles ne portent aucun secret (le hash des jetons
  reste dans `SecureLink`, exclu) : ils sont classés dans l'export d'agence. Le bénéficiaire
  (`recipientEmail`) y figure comme donnée de l'agence ; le choix est à confirmer en
  relecture.
- **H8 — Rubriques du rapport.** Les champs précis de chaque rubrique suivent le schéma
  Prisma existant ; FR-018 décrit la forme livrée (clés toujours présentes pour une rubrique
  accordée, `valuation: null` sans valorisation, plafonds par bien).
- **H9 — Révocation en bloc.** Les liens révoqués avec l'accès sont rattachés à l'utilisateur
  qui a agi (`actorUserId`) ; un accès consulté après révocation répond la 404 uniforme que
  le lien ait été révoqué ou non, la vérification de l'accès étant autonome.
- **H10 — Points ouverts.** Voir la section 8.

## 7. Critères de succès

- **SC-001** : 100 % des refus des deux routes publiques (inconnu, expiré, révoqué, mauvaise
  portée, agence inactive, accès révoqué, accès expiré, accès supprimé, `documentRef`
  invalide, corps malformé) renvoient un statut, un corps et des en-têtes identiques (test
  paramétré).
- **SC-002** : 100 % des réponses publiques (200, 404, 429 du limiteur de route,
  téléchargement de fichier) portent les trois en-têtes de FR-014.
- **SC-003** : pour chaque rubrique non accordée, 0 clé correspondante dans la réponse
  complète (test par rubrique, y compris la synthèse).
- **SC-004** : 0 e-mail, 0 téléphone, 0 identité de locataire, 0 nom de co-indivisaire, 0
  texte libre interne, 0 chemin disque et 0 identifiant technique dans la réponse complète
  d'un jeu de données qui en contient (balayage du JSON).
- **SC-005** : une révocation est effective à la requête suivante : vue et téléchargement
  répondent 404 immédiatement, et 100 % des liens de l'accès portent `revokedAt`.
- **SC-006** : un lien d'accès n'expire jamais après l'accès ; un lien d'un accès permanent
  expire au plus `SECURE_LINK_MAX_TTL_DAYS` jours après son émission ; une durée supérieure
  au plafond est refusée.
- **SC-007** : un document non lié à l'accès, lié à un autre accès, ou dont le bien est sorti
  du périmètre n'est jamais servi (0 octet de fichier dans ces cas).
- **SC-008** : 0 jeton en clair en base, dans `AuditLog` et dans les journaux applicatifs sur
  un cycle création, consultation, téléchargement, renvoi, révocation.
- **SC-009** : 100 % des créations, modifications, révocations, envois de lien, consultations
  et téléchargements produisent l'événement d'audit correspondant, avec IP et user-agent pour
  les accès publics.
- **SC-010** : un accès, un bien, une entité, un propriétaire ou un document de l'agence A
  appelé depuis l'agence B ne renvoie aucune donnée (`external-access.db.test.ts`, lancé avec `isolation.test.ts` par
  `npm run test:isolation` sur une base jetable, garde Prisma en `enforce`) ; la réponse est identique à celle d'un
  identifiant inexistant.
- **SC-011** : la modification de `recipientEmail` révoque 100 % des liens actifs de l'accès.
- **SC-012** : typecheck sans nouvelle erreur, lint, `check:architecture`,
  `routes-inventory`, `schema-tenant-coverage`, `test:isolation` verts ; relecture
  `code-reviewer` et `security-auditor` faite.

## 8. Points ouverts et hors périmètre

- **Code complémentaire** (SMS ou e-mail) pour authentifier le porteur du lien : non prévu ;
  dépend du lot SMS.
- **Accès en écriture** (dépôt de pièces, commentaires, signature) : hors lot ; un lien qui
  écrit exige un lot et une relecture de sécurité propres (SECURITY.md, § 12 bis).
- **Notification au propriétaire** à chaque consultation de son patrimoine par un tiers :
  non prévue ; le journal agence suffit pour l'instant.
- **Révocation automatique des anciens liens** lors d'un renvoi ou d'une modification de
  périmètre : non décidée ; le choix est laissé à l'agence (`revokePreviousLinks`).
- **Portail connecté pour les tiers** (compte invité, rôle `requireGuestAccess`) : écarté au
  profit du lien sécurisé ; à reconsidérer si l'usage appelle une authentification forte.
- **Multi-devises** : la vue est en XOF ; l'affichage dans d'autres devises attend le lot
  dédié (capacité 11).
- **Rubriques supplémentaires** (sinistres, assurances, fiscalité) et dossier bancaire
  complet : hors lot (lots ultérieurs de la feuille de route).
- **PDF serveur** : absent ; l'impression passe par le navigateur.
- **Texte libre des libellés** : non exposé ; un libellé public distinct reste à décider si
  une rubrique en réclame.
- **Limiteurs de débit partagés entre instances** : non prévus (voir SECURITY.md). Un limiteur
  distinct pour ce lot, qui cesserait de partager son budget avec le rapport mensuel, n'est
  pas décidé.
- **Permission distincte** pour le partage avec des tiers : non prévue (H3) ; un ajout de la
  plateforme.
- **Messages de validation `zod` traduits** (`t()`) : non faits.
- **Changement du propriétaire désigné** (`ownerClientId`) après création : non prévu ; il faut
  créer un nouvel accès.
- **Abonnement `PATRIMOINE` et vue publique** : la vue et le téléchargement publics ne sont pas
  conditionnés à l'abonnement `PATRIMOINE` de l'agence (seules les routes d'agence le sont).
  Un accès déjà émis reste donc lisible si l'agence perd `PATRIMOINE` ; une agence suspendue ou
  inactive reste refusée. Décision produit à prendre.
- **Limiteur propre à `send-link`** : aucun ; la route est authentifiée (`PROPERTIES_EDIT`) mais
  chaque appel peut émettre un lien et un e-mail.
