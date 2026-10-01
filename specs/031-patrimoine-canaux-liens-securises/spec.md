# Spécification 031 — Canaux WhatsApp patrimoine et liens sécurisés

**Branche** : `feat/patrimoine-canaux` (lot A3 de la feuille de route
[PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md))
**Créée** : 2026-10-01
**Statut** : en cours
**Portée** : capacité 10 du plan (WhatsApp / lien sécurisé), **sans SMS**.

Références : [plan.md](./plan.md) · modèle `SecureLink` dans
[DATA_MODELS.md](../../docs/architecture/DATA_MODELS.md) · modèle de menace dans
[SECURITY.md](../../docs/governance/SECURITY.md), section « 12 bis. Liens publics à jeton ».

## 1. Synthèse

L'agence envoie à un propriétaire son **rapport mensuel** (le relevé de gérance
`OwnerStatement` d'un mois) par WhatsApp ou par e-mail, avec un **lien sécurisé** :
le propriétaire l'ouvre sans compte, lit son relevé en lecture seule et peut
l'imprimer ou l'enregistrer en PDF depuis son navigateur. Le lien est un
jeton aléatoire, haché en base, borné dans le temps et révocable.

Le lot livre aussi :

- une **infrastructure générique** `lib/secure-links`, réutilisée plus tard par les
  lots paiement par lien et tiers de confiance ;
- le **routage par canal** des messages propriétaire (WhatsApp ou e-mail, un seul canal
  par message) ;
- deux alertes propriétaire (échéance de bail, document à renouveler) qui gagnent le canal
  WhatsApp ;
- un **job mensuel** optionnel qui envoie les rapports du mois précédent.

## 2. Scénarios utilisateur

### US1 — L'agence envoie le rapport mensuel d'un propriétaire (P1)

Depuis la fiche d'un relevé, un gestionnaire envoie le rapport du mois : un lien
sécurisé est créé et transmis au propriétaire par le meilleur canal disponible.

1. **Étant donné** un relevé `SENT` ou `PAID` d'un propriétaire qui préfère WhatsApp
   (`preferredContactChannel`), avec consentement WhatsApp et numéro exploitable,
   **quand** le gestionnaire clique « Envoyer le rapport
   du mois », **alors** un `SecureLink` est créé, un seul message WhatsApp contenant
   `{{reportUrl}}` part, et aucun e-mail n'est envoyé.
2. **Étant donné** un propriétaire sans préférence, ou sans consentement WhatsApp, mais
   avec e-mail et consentement e-mail, **quand** l'envoi est demandé, **alors** le message part par
   e-mail (repli) et un seul.
3. **Étant donné** un propriétaire sans canal éligible, **quand** l'envoi est demandé,
   **alors** aucun message ne part et la réponse indique le motif (aucun canal joignable).
4. **Étant donné** un tenant dont l'événement est désactivé pour le canal choisi,
   **quand** l'envoi est demandé, **alors** ce canal est écarté et le routage passe au
   suivant ; si aucun ne reste, aucun message ne part.

### US2 — Le propriétaire ouvre son rapport sans compte (P1)

1. **Étant donné** un lien valide `…/rapport-proprietaire#<jeton>`, **quand** le
   propriétaire l'ouvre, **alors** la page envoie le jeton en **corps** d'un `POST` et
   affiche en lecture seule les lignes de ce relevé et leurs totaux.
2. **Étant donné** un jeton inconnu, expiré, révoqué, d'une autre portée, d'une agence
   inactive ou dont le relevé a disparu, **quand** la page l'envoie, **alors** la réponse
   est la même 404 « Lien invalide ou expiré. » dans tous les cas.
3. **Étant donné** une page de rapport ouverte, **quand** le propriétaire clique
   « Imprimer / enregistrer en PDF », **alors** le navigateur ouvre sa boîte d'impression
   (aucun PDF n'est produit par le serveur).
4. **Étant donné** un lien valide, **quand** il est consulté, **alors** `viewCount` croît
   de 1, `lastViewedAt` est mis à jour et un événement `SECURE_LINK_VIEWED` est journalisé.

### US3 — L'agence liste, copie et révoque les liens (P1)

1. **Étant donné** un relevé, **quand** le gestionnaire ouvre la section « Rapport
   mensuel et liens sécurisés », **alors** il voit les liens actifs (création, expiration,
   nombre de consultations, dernière consultation) — jamais un jeton.
2. **Étant donné** « Copier le lien », **quand** le gestionnaire crée un lien, **alors**
   l'URL complète n'est affichée qu'à cette création ; elle ne peut pas être relue ensuite.
3. **Étant donné** un lien actif, **quand** le gestionnaire le révoque, **alors** la
   consultation suivante répond la même 404 uniforme et `SECURE_LINK_REVOKED` est journalisé.

### US4 — Envoi automatique mensuel (P2)

1. **Étant donné** `PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED=true`, **quand** le job tourne
   l'un des 10 premiers jours du mois, **alors** il envoie le rapport de chaque relevé
   non `DRAFT` du mois précédent, une seule fois par relevé.
2. **Étant donné** un relevé déjà envoyé par le job, **quand** le job repasse le
   lendemain, **alors** il l'ignore.
3. **Étant donné** le 11 du mois ou plus tard, **quand** le job tourne, **alors** il
   n'envoie rien.
4. **Étant donné** un environnement de développement, **quand** le job envoie,
   **alors** les fournisseurs restent en mode journal/simulateur (aucun envoi réel).

### US5 — Alertes propriétaire par WhatsApp (P2)

1. **Étant donné** un bail actif qui se termine sous 30 jours et un propriétaire
   joignable par WhatsApp, **quand** l'alerte part, **alors** elle utilise l'événement
   WhatsApp `OWNER_LEASE_ENDING_SOON` et pas l'e-mail.
2. **Étant donné** un document à renouveler sous 30 jours, **quand** l'alerte part,
   **alors** elle utilise `OWNER_DOCUMENT_EXPIRY_ALERT` (WhatsApp) ou la clé e-mail
   existante `DOCUMENT_EXPIRY_ALERT` (repli), jamais les deux pour le même message.
3. **Étant donné** une alerte déjà envoyée pour la même échéance, **quand** le job
   quotidien repasse, **alors** aucun doublon n'est émis, quel que soit le canal.

## 3. Exigences fonctionnelles

### Liens sécurisés (`lib/secure-links`)

- **FR-001** : le modèle `SecureLink` porte `tenantId`, `scope`
  (`OWNER_MONTHLY_REPORT`), `objectType`, `objectId`, `tokenHash` (unique),
  `expiresAt`, `revokedAt`, `createdByUserId`, `viewCount`, `lastViewedAt`.
  `objectType` + `objectId` sont de simples chaînes : aucune clé étrangère polymorphe.
- **FR-002** : un jeton = 32 octets aléatoires cryptographiques encodés en base64url
  (43 caractères). Il est renvoyé **une seule fois**, à la création. Seul son SHA-256
  est stocké ; le clair n'apparaît ni en base, ni dans un journal, ni dans
  `AuditLog`, ni dans une réponse de liste.
- **FR-003** : `expiresAt` vaut 7 jours par défaut (`SECURE_LINK_DEFAULT_TTL_DAYS`),
  plafonné à 30 jours (`SECURE_LINK_MAX_TTL_DAYS`). Une durée demandée au-delà du
  plafond est refusée (400), pas tronquée en silence. Les deux variables passent par
  `config/env.ts` et sont documentées dans `env.example`.
- **FR-004** : la vérification hache le jeton reçu, retrouve la ligne par `tokenHash` et
  compare à temps constant (défense en profondeur ; la protection principale est la
  préimage SHA-256 d'un jeton de 256 bits). Elle exige : non expiré, non révoqué, `scope` attendu par la
  route, agence active (`Tenant.isActive` vrai et statut différent de `SUSPENDED`) et objet
  visé encore présent.
- **FR-005** : tout échec de vérification renvoie **la même réponse** : 404, même corps
  « Lien invalide ou expiré. », mêmes en-têtes. Aucun message ne distingue inconnu,
  expiré, révoqué, mauvaise portée, agence inactive ou objet disparu.
- **FR-006** : la route publique est protégée par un limiteur de débit par IP (30 requêtes
  par minute), appliqué **avant** toute vérification du jeton ; au-delà, 429 avec les
  en-têtes de FR-007.
- **FR-007** : toute réponse publique du lot porte `Cache-Control: no-store`,
  `X-Robots-Tag: noindex, nofollow` et `Referrer-Policy: no-referrer` (succès comme refus).
- **FR-008** : chaque création, consultation réussie et révocation écrit un événement
  `logAuditEvent` : `SECURE_LINK_CREATED`, `SECURE_LINK_VIEWED`, `SECURE_LINK_REVOKED`.
  Le payload contient `linkId`, `scope`, `objectType`, `objectId` ; jamais le jeton ni
  son hash. La consultation est attribuée au `tenantId` du lien ; elle n'est écrite qu'après
  une lecture réussie (un relevé disparu ne produit aucun `SECURE_LINK_VIEWED`) et porte
  l'adresse IP et le user-agent de l'appelant (champs `ipAddress` et `userAgent` du journal),
  jamais ailleurs que dans ce journal.
- **FR-009** : la révocation pose `revokedAt` (la ligne est conservée pour l'historique) ;
  révoquer un lien déjà révoqué est sans effet et sans erreur.
- **FR-010** : l'URL partagée est `${FRONTEND_URL}/rapport-proprietaire#<jeton>` : le
  jeton est dans le **fragment**. La page publique le lit dans `location.hash` et
  l'envoie en corps JSON d'un `POST /api/public/secure-links/owner-monthly-report`
  (`{ "token": "…" }`, corps **borné à 1 Ko** par un parseur JSON propre à la route ;
  un corps malformé, trop gros ou d'encodage refusé reçoit le même refus 404 uniforme,
  avec les mêmes en-têtes, qu'un jeton inconnu, sans journaliser le message du parseur). Aucune route n'accepte le jeton en chemin ou
  en paramètre de requête.

### Rapport public

- **FR-011** : la réponse publique ne contient que le relevé visé par le lien :
  `agencyName`, `ownerName` (nom de la personne ou raison sociale), `period` (`YYYY-MM`),
  `currency`, `expiresAt`, `totals` (loyer dû, revenus, arriérés, honoraires, TVA sur
  honoraires, dépenses, net) et `properties` regroupées par bien (`reference`, `title`,
  lignes `label` / `type` / `amount`, `subtotal` = net du bien). `totals` porte aussi
  `withholdingTax` (retenue à la source, déduite) et `depositRetained` (dépôt de garantie
  conservé, ajouté) : lignes `OTHER` reconnues à leur libellé produit par le calcul du
  relevé ; elles entrent dans le `subtotal` avec leur signe, de sorte que la somme des
  `subtotal` égale `totals.netAmount`, seul net affiché. Elle ne contient **aucun** e-mail ni
  téléphone du propriétaire, aucun identifiant technique (agence, propriétaire, bien,
  relevé), aucun chemin de fichier.
- **FR-012** : aucun identifiant de bien, d'agence, de propriétaire ou de relevé n'est
  accepté de l'appelant : seul `token` est lu du corps, tout autre champ est ignoré et
  n'atteint jamais une requête Prisma.
- **FR-013** : le relevé est chargé par `id` **et** `tenantId` du lien, dans le contexte
  d'agence du lien (garde multi-tenant active).
- **FR-014** : la page `/rapport-proprietaire` est lisible sans compte, en lecture seule,
  trilingue (fr/en/ar), avec un bouton « Imprimer / enregistrer en PDF » (impression
  navigateur) et une feuille de style d'impression. Elle pose `robots: noindex, nofollow`
  et `referrer: no-referrer` le temps qu'elle est montée, et **retire le fragment** de la
  barre d'adresse dès qu'elle l'a lu : le jeton ne reste ni dans l'historique ni sur une
  capture d'écran ; recharger la page exige donc de rouvrir le lien reçu.

### Routes agence

- **FR-015** : sous `/api/tenants/:tenantId/owner-statements/:statementId`, avec les
  permissions existantes (aucune nouvelle permission) :

  | Route                          | Permission              | Effet                                                 |
  | ------------------------------ | ----------------------- | ----------------------------------------------------- |
  | `POST /secure-links`           | `OWNER_STATEMENTS_EDIT` | crée un lien ; renvoie l'URL **une seule fois**       |
  | `GET /secure-links`            | `OWNER_STATEMENTS_VIEW` | liste les liens du relevé, sans jeton ni hash         |
  | `DELETE /secure-links/:linkId` | `OWNER_STATEMENTS_EDIT` | révoque le lien                                       |
  | `POST /send-monthly-report`    | `OWNER_STATEMENTS_EDIT` | crée un lien et envoie le rapport par le canal retenu |

- **FR-016** : un relevé ou un lien d'une autre agence, ou inexistant, lève la même
  `NotFoundError`. `linkId` est vérifié comme appartenant au relevé **et** à l'agence.
- **FR-017** : l'écran « Rapport mensuel et liens sécurisés » de la fiche d'un relevé
  permet d'envoyer le rapport du mois, de créer et copier un lien, de lister les liens
  actifs et de les révoquer.

### Notifications et routage par canal

- **FR-018** : nouveaux événements, rattachés à la fonctionnalité d'abonnement
  `PATRIMOINE` (`notification-key-features.ts`) : `OWNER_MONTHLY_REPORT_SENT` (e-mail
  **et** WhatsApp, variable `{{reportUrl}}`), `OWNER_LEASE_ENDING_SOON` et
  `OWNER_DOCUMENT_EXPIRY_ALERT` (WhatsApp). Ces trois clés WhatsApp sont **OPT-IN** :
  désactivées tant que l'agence n'a pas de ligne de configuration (`consentWhatsapp` vaut
  `true` par défaut en base ; les activer d'office enverrait des messages non sollicités).
  Conséquence : les alertes bail et document, jusqu'ici e-mail seulement, peuvent partir
  par WhatsApp dès que l'agence active la clé. Les clés e-mail `LEASE_ENDING_SOON` et
  `DOCUMENT_EXPIRY_ALERT` et la clé WhatsApp `LEASE_ENDING_SOON` (destinée au
  locataire) restent inchangées.
- **FR-019** : le routage choisit **un seul canal par message**. WhatsApp est éligible
  si le contact a `consentWhatsapp`, un numéro exploitable (`whatsappNumber`, à défaut
  `phonePrimary`) et la configuration WhatsApp du tenant activée pour l'événement. L'e-mail
  est éligible si le contact a `consentEmail`, une adresse et la configuration e-mail
  activée. Ordre d'essai : le canal préféré du contact (`preferredContactChannel`) d'abord
  s'il est géré, puis l'autre canal (repli) ; sans préférence exploitable (vide, `CALL`,
  `SMS`), e-mail puis WhatsApp. Le premier canal éligible dont l'envoi réussit gagne : si
  son envoi échoue, le suivant est tenté, et un seul message est finalement délivré.
  Sinon aucun envoi, avec un motif (`EVENT_DISABLED` si l'agence a coupé un canal
  utilisable par le contact, `NO_ELIGIBLE_CHANNEL`, `SEND_FAILED`). Une alerte d'échéance
  part si au moins un des deux canaux est activé par l'agence ; les destinataires sans aucun
  canal consenti, adressable ET activé sont écartés en amont (comptés `skippedNoRecipient`,
  pas `failed`). Quand tous les canaux éligibles échouent à l'envoi, le résultat du rapport
  mensuel est `SEND_FAILED` (distinct de `NO_ELIGIBLE_CHANNEL`).
- **FR-020** : le canal `SMS` de `preferredContactChannel` n'est pas routé (hors
  périmètre) ; il équivaut à une absence de préférence. Ajouter le SMS plus tard = une
  valeur de canal, un envoyeur et une entrée de préférence dans
  `lib/patrimoine/notification-channels.ts`.
- **FR-021** : anti-doublon par `AuditLog` : une alerte (bail, document) ou un rapport
  automatique n'est pas renvoyé pour la même échéance ou le même relevé, quel que soit
  le canal (marque du rapport : `PATRIMOINE_OWNER_MONTHLY_REPORT_SENT`). L'envoi manuel `send-monthly-report` est une action explicite de l'agence et
  peut être rejoué (chaque envoi crée un nouveau lien).
- **FR-022** : le message ne contient ni montant ni coordonnées du propriétaire : seul le
  lien donne accès au détail. L'URL figure dans le corps du message, jamais dans le sujet
  d'un e-mail ni dans un journal applicatif. Les valeurs injectées dans un modèle HTML d'e-mail sont
  échappées ; celles des variantes texte (WhatsApp, sujet) ne le sont pas.

### Job mensuel

- **FR-023** : `jobs/owner-monthly-report-job.ts` ne démarre que si
  `PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED=true` (défaut `false`, via `config/env.ts` et
  `env.example`).
- **FR-024** : cron quotidien en UTC. Il n'agit que les 10 premiers jours du mois, sur les
  relevés dont `period` est le mois précédent et dont `status` n'est pas `DRAFT`, et
  jamais deux fois pour le même relevé.
- **FR-025** : le job ne génère aucun relevé : un relevé inexistant n'est pas créé.
- **FR-026** : agences traitées l'une après l'autre, chacune dans son contexte d'agence ;
  l'échec d'une agence ou d'un relevé est journalisé et n'arrête pas les suivants.
- **FR-027** : pas de garde logicielle d'envoi simulé hors `NODE_ENV=test` pour l'e-mail,
  et le fournisseur WhatsApp n'a pas de simulateur. La protection contre un envoi réel en
  développement est : job désactivé par défaut (FR-023), WhatsApp opt-in (FR-018), et
  fournisseurs non configurés en développement.

### Transverse

- **FR-028** : chaque nouvelle route passe `routes-inventory.test.ts` ; la route publique
  est inscrite à la liste blanche des routes publiques avec sa justification. `SecureLink`
  passe `schema-tenant-coverage.test.ts` (champ `tenantId` direct).
- **FR-029** : tout libellé visible passe par `t()` (fr clé, en, ar) ; marges en propriétés
  logiques.
- **FR-030** : l'événement `OWNER_MONTHLY_REPORT_SENT` et les deux événements d'alerte
  apparaissent dans les écrans de configuration de notifications existants, avec
  désactivation et modèle personnalisable par agence.

## 4. Menaces et mesures

Détail du modèle de menace générique : SECURITY.md, « 12 bis. Liens publics à jeton ».

| Menace                                                | Mesure retenue                                                                                                                                                                                                                                                               | Vérification                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Fuite du lien par transfert, capture d'écran, partage | Portée limitée à un relevé ; expiration 7 jours (max 30) ; révocation à tout moment ; lecture seule ; consultations comptées et journalisées pour repérer un usage anormal                                                                                                   | FR-001, FR-003, FR-009, FR-008                         |
| Devinette du jeton                                    | 32 octets aléatoires = 256 bits d'entropie ; générateur cryptographique (`crypto.randomBytes`)                                                                                                                                                                               | FR-002 ; test : longueur, alphabet, unicité            |
| Énumération et mesure de temps                        | Refus uniforme (même statut, corps, en-têtes) ; recherche par hash (protection principale : préimage SHA-256 d'un jeton de 256 bits) ; comparaison à temps constant en défense en profondeur. Un écart de latence résiduel n'a pas de prise : sans le jeton, rien à énumérer | FR-004, FR-005 ; test : tous les refus identiques      |
| Abus, force brute, déni de service                    | Limiteur de débit par IP (30 par minute) avant toute vérification ; corps borné à 1 Ko (parseur propre à la route, erreurs de corps = 404 uniforme) ; un seul champ lu                                                                                                       | FR-006, FR-010                                         |
| Fuite par journaux d'accès                            | Jeton dans le **fragment** (jamais envoyé au serveur) puis en corps de `POST` : absent de l'URL, donc des journaux d'accès et de `requestLogger` (qui journalise `req.url`)                                                                                                  | FR-010 ; test : aucune route n'accepte le jeton en URL |
| Fuite par cache, `Referer`, moteurs de recherche      | `Cache-Control: no-store`, `Referrer-Policy: no-referrer` (le fragment n'est de toute façon jamais transmis dans `Referer`), `X-Robots-Tag: noindex, nofollow`, page sans lien sortant                                                                                       | FR-007                                                 |
| Accès inter-agences (IDOR)                            | Aucun identifiant accepté de l'appelant ; relevé chargé par `id` ET `tenantId` du lien ; routes agence : `linkId` vérifié contre relevé et agence ; `NotFoundError` uniforme                                                                                                 | FR-012, FR-013, FR-016 ; `test:isolation`              |
| Rejeu après révocation ou expiration                  | `revokedAt` et `expiresAt` contrôlés à **chaque** consultation, côté serveur, sans cache applicatif du verdict                                                                                                                                                               | FR-004 ; test : consultation après révocation = 404    |
| Base de données compromise                            | Seul le SHA-256 du jeton est stocké ; le clair n'existe qu'à la création, dans la réponse et dans le message envoyé ; un hash de jeton aléatoire de 256 bits ne se retourne pas                                                                                              | FR-002 ; test : 0 jeton en clair en base               |
| Lien utilisé comme porte vers autre chose             | Portée unique (`OWNER_MONTHLY_REPORT`) et objet unique : la route d'une portée refuse un lien d'une autre portée ; aucune session, aucun cookie, aucun accès aux autres routes                                                                                               | FR-004, FR-005                                         |
| Agence suspendue ou désactivée                        | Statut de l'agence contrôlé à chaque consultation : refus uniforme                                                                                                                                                                                                           | FR-004                                                 |
| Consentement des destinataires                        | Envoi seulement avec consentement du canal **et** coordonnée exploitable ; un seul canal par message ; événement désactivable par agence                                                                                                                                     | FR-019, FR-030                                         |
| Message envoyé au mauvais destinataire                | Le destinataire est lu sur le contact du propriétaire du relevé, jamais fourni par l'appelant ; l'URL n'est jamais placée dans un sujet d'e-mail ni dans un journal du lot (`EmailService` journalise sujet et destinataire, pas le corps)                                   | FR-019, FR-022                                         |

Limites assumées : un lien divulgué donne accès en lecture à **un seul** relevé,
jusqu'à son expiration ou sa révocation. Les limiteurs de débit sont en mémoire, par
instance (point déjà ouvert dans SECURITY.md).

## 5. Entités clés

- **`SecureLink`** (nouveau) : voir DATA_MODELS.md. Rattaché à `Tenant` ; `createdByUserId`
  référence l'utilisateur qui l'a créé (nul pour un lien créé par le job).
- **`OwnerStatement`** / **`OwnerStatementItem`** (existants, inchangés) : objet visé,
  `objectType = "OwnerStatement"`, `objectId = id`.
- **`CrmContact`** (existant) : source du consentement (`consentEmail`,
  `consentWhatsapp`), des coordonnées et de `preferredContactChannel`.
- **`AuditLog`** (existant) : journal des événements de lien et marque anti-doublon.

## 6. Hypothèses

- Un relevé doit exister : l'agence le génère ; le job n'en génère aucun.
- Le lien est révocable à tout moment ; sa durée est bornée (7 jours par défaut, 30 au plus).
- Un lien divulgué donne accès en lecture à **un** relevé jusqu'à expiration ou révocation.
- WhatsApp : le fournisseur (`WHATSAPP_PROVIDER`, Wasender ou Twilio) est configuré hors de
  ce lot. Sans configuration, l'envoi WhatsApp est ignoré et le routage retombe sur
  l'e-mail. `WHATSAPP_PROVIDER` n'est pas migré vers `config/env.ts` (dérive existante,
  signalée dans le plan) ; tout code neuf du lot lit ses variables via `config/env.ts`.
- Le routage prévoit une entrée de plus pour le SMS plus tard ; elle n'est pas livrée.
- Un nouvel envoi (ou une copie de lien) crée un nouveau lien ; les anciens liens du même
  relevé restent valides jusqu'à expiration ou révocation. **Point ouvert** : pas de
  révocation automatique des liens précédents.
- Point ouvert : le rapport public reprend le libellé libre des dépenses ; un commentaire
  interne saisi dans un libellé serait visible du porteur du lien (à l'agence de l'éviter).
- Un relevé `DRAFT` ou de version de calcul obsolète est refusé (409) pour la création d'un
  lien comme pour l'envoi du rapport.
- Le plancher de débit global peut répondre 429 sans les en-têtes de FR-007 (il précède la
  route) ; documenté, non corrigé.
- Aucun simulateur logiciel hors `NODE_ENV=test` : voir FR-027.

## 7. Critères de succès

- **SC-001** : 100 % des refus de la route publique (inconnu, expiré, révoqué, mauvaise
  portée, agence inactive, objet disparu) renvoient un statut, un corps et des en-têtes
  identiques (test paramétré).
- **SC-002** : 0 jeton en clair en base, dans `AuditLog` et dans les journaux applicatifs
  (test de non-régression sur un cycle création, consultation, révocation).
- **SC-003** : 100 % des créations, consultations et révocations produisent un événement
  d'audit correspondant.
- **SC-004** : un lien créé sans durée expire 7 jours après sa création ; une durée
  supérieure à 30 jours est refusée.
- **SC-005** : 100 % des réponses publiques portent les trois en-têtes de FR-007.
- **SC-006** : 0 réponse publique ne contient d'e-mail, de téléphone ni d'identifiant
  technique (contrôle sur la réponse complète).
- **SC-007** : une consultation avec le `tenantId` d'une autre agence ne renvoie aucune
  donnée (`test:isolation`).
- **SC-008** : sur un jeu de contacts couvrant les combinaisons de consentement,
  coordonnées et canal préféré, chaque message part par au plus un canal, et jamais vers
  un canal sans consentement.
- **SC-009** : le job envoie 0 rapport en dehors des 10 premiers jours du mois et 1 seul par
  relevé, quel que soit le nombre de passages.
- **SC-010** : typecheck sans nouvelle erreur, lint, `check:architecture`,
  `routes-inventory`, `schema-tenant-coverage`, `test:isolation` verts ; relecture
  `code-reviewer` et `security-auditor` faite.

## 8. Points ouverts et hors périmètre

- **PDF serveur** : absent ; l'impression passe par le navigateur.
- **Section « patrimoine » enrichie** (valorisations, rendements) dans le rapport : hors lot.
- **Canal SMS** : attend la fusion de `feat/sms-lot-1` (spec 020).
- **Durée configurable par agence** : non prévue ; seuls les plafonds d'environnement.
- **Révocation automatique** des liens à la suppression ou à la recomposition du relevé :
  non décidée ; le lien d'un relevé disparu répond déjà la 404 uniforme.
- **Ré-émission automatique** d'un lien expiré : non prévue ; l'agence renvoie le rapport.
- **Lien créé par un envoi dont aucun canal n'aboutit** : révocation automatique non décidée.
- **Fonctionnalité d'abonnement `PATRIMOINE` retirée** après l'envoi : le lien déjà émis
  reste valable jusqu'à expiration ; non revérifié à la consultation.
- **Limiteurs de débit partagés entre instances** : non prévus (voir SECURITY.md).
