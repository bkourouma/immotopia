# Spécification 039 — Lien de paiement Mobile Money d'un loyer

**Branche** : `feat/patrimoine-lien-paiement` (lot C5 de la feuille de route
[PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md](../../docs/architecture/PLAN-PATRIMOINE-FEUILLE-DE-ROUTE.md))
**Créée** : 2026-10-01
**Statut** : implémentée et relue ; en attente de la recette
navigateur et de la validation du mode réel PaySecureHub (non testé)
**Portée** : capacité 12 du plan (paiement par lien), Mobile Money via PaySecureHub,
mode `SIMULATOR` en développement et en recette ; le mode `LIVE` n'est ni activé ni testé.

Références : [plan.md](./plan.md) · spec [031](../031-patrimoine-canaux-liens-securises/spec.md)
(infrastructure `lib/secure-links`, dont cette spec hérite) · modèles `SecureLink` et
`OnlinePaymentCheckout` dans [DATA_MODELS.md](../../docs/architecture/DATA_MODELS.md) · modèle de
menace dans [SECURITY.md](../../docs/governance/SECURITY.md), sections « 6. Webhooks de paiement »
et « 12 bis. Liens publics à jeton » · intégration :
[paysecurehub.md](../../docs/integrations/paysecurehub.md).

## 1. Synthèse

L'agence envoie à un locataire un **lien de paiement** pour **une échéance** de loyer, par
WhatsApp ou par e-mail, ou le copie pour le transmettre elle-même. Le locataire l'ouvre
**sans compte**, voit l'agence, la période et le **montant restant dû** (calculé par le
serveur), clique « Payer maintenant » et règle en Mobile Money (Wave, Orange Money, MTN, Moov)
sur la page hébergée PaySecureHub. Il revient ensuite sur une **page de statut** publique qui
lui indique si le paiement est confirmé. La confirmation reste celle de l'IPN et de la
réconciliation serveur à serveur existantes : ce lot n'en change rien.

C'est la première portée de lien public qui **déclenche une écriture** (création d'un
`RentalPayment` `PENDING` et d'un `OnlinePaymentCheckout`). La règle 4 de SECURITY.md §12 bis
(« un lien qui déclenche une écriture exige un lot et une relecture de sécurité propres ») fait
de ce lot ce lot propre : le montant n'est jamais fourni par l'appelant, un verrou consultatif
empêche le double checkout, et l'écran de statut ne se fie jamais à l'URL de retour.

Le lot livre :

- la portée `INSTALLMENT_PAYMENT` de `lib/secure-links` et le service
  `lib/payment-gateway/installment-payment-link.ts` (création, liste, révocation, lecture
  publique, démarrage du paiement, statut par code) ;
- trois routes agence (`POST`/`GET`/`DELETE` sous `…/installments/:installmentId`) et trois
  routes publiques (`/installment-payment`, `/start`, `/status`) ;
- l'envoi du lien par WhatsApp ou e-mail (événement `RENTER_PAYMENT_LINK_SENT`) ;
- les pages web `/payer` et `/payer/statut` et la section agence de l'écran des échéances.

## 2. Scénarios utilisateur

### US1 — L'agence envoie le lien de paiement d'une échéance (P1)

Depuis l'écran des échéances, un gestionnaire envoie au locataire le lien de paiement de
l'échéance : un `SecureLink` est créé et transmis par le meilleur canal disponible.

1. **Étant donné** une échéance `DUE` ou `OVERDUE` d'un bail `ACTIVE`, dont le locataire a un
   consentement WhatsApp et un numéro exploitable, avec l'événement `RENTER_PAYMENT_LINK_SENT`
   activé pour WhatsApp, **quand** le gestionnaire clique « Envoyer le lien de paiement »,
   **alors** un seul message WhatsApp contenant `{{paymentUrl}}` part, aucun e-mail n'est
   envoyé et `RENTAL_PAYMENT_LINK_SENT` est journalisé.
2. **Étant donné** un locataire sans consentement WhatsApp (ou WhatsApp désactivé par l'agence,
   état par défaut) mais avec e-mail et consentement e-mail, **quand** l'envoi est demandé,
   **alors** le message part par e-mail et un seul.
3. **Étant donné** un locataire sans canal éligible, ou un événement désactivé, **quand**
   l'envoi est demandé, **alors** aucun message ne part, **aucun lien n'est conservé** et la
   réponse indique le motif.
4. **Étant donné** un envoi dont tous les canaux éligibles échouent, **quand** l'envoi est
   demandé, **alors** le lien créé est révoqué et le motif est `SEND_FAILED`.
5. **Étant donné** une échéance soldée, annulée, d'un bail non `ACTIVE`, ou d'une agence sans
   compte de paiement en ligne utilisable, **quand** l'envoi est demandé, **alors** il est
   refusé (400) et aucun lien n'est créé. Le contrôle de l'échéance se fait à la création du lien,
   **après** le plan de canaux : sans canal éligible, la réponse reste 200 `sent: false` avec son
   motif.

### US2 — L'agence copie le lien, le liste et le révoque (P1)

1. **Étant donné** une échéance éligible, **quand** le gestionnaire clique « Copier le lien »,
   **alors** l'URL complète n'est affichée qu'à cette création ; elle ne peut pas être relue.
2. **Étant donné** une échéance, **quand** le gestionnaire ouvre la liste des liens, **alors** il
   voit pour chaque lien l'état (actif, expiré, révoqué), la création, l'expiration, le nombre
   et la date de dernière ouverture et **l'état du paiement associé** (aucun, en cours, payé,
   échoué, annulé, expiré, à vérifier) — jamais un jeton, un hash ni une URL.
3. **Étant donné** un lien actif, **quand** le gestionnaire le révoque, **alors** l'ouverture
   suivante répond la même 404 uniforme et `SECURE_LINK_REVOKED` est journalisé ; révoquer un
   lien déjà révoqué est sans effet et sans erreur.
4. **Étant donné** une échéance qui a déjà deux liens actifs, **quand** le gestionnaire en
   crée un troisième, **alors** les deux premiers restent valides (point ouvert, §8).

### US3 — Le locataire ouvre le lien sans compte (P1)

1. **Étant donné** un lien valide `…/payer#<jeton>`, **quand** le locataire l'ouvre, **alors** la
   page envoie le jeton en **corps** d'un `POST` et affiche le nom de l'agence, la période, la
   date d'échéance, le **montant restant dû** et les moyens de paiement ; si l'agence est en mode
   simulateur, la page l'indique.
2. **Étant donné** un jeton inconnu, expiré, révoqué, d'une autre portée, d'une agence inactive
   ou suspendue, d'une échéance disparue, annulée ou **déjà soldée**, d'un bail non `ACTIVE`,
   **quand** la page l'envoie, **alors** la réponse est la même 404 « Lien invalide ou
   expiré. » dans tous les cas.
3. **Étant donné** une échéance dont un acompte a été enregistré depuis l'envoi, **quand** le
   locataire ouvre le lien, **alors** le montant affiché est le **nouveau** reste dû (jamais
   celui du moment de l'envoi).
4. **Étant donné** un lien valide, **quand** il est ouvert avec succès, **alors** `viewCount`
   croît de 1, `lastViewedAt` est mis à jour et `SECURE_LINK_VIEWED` est journalisé.

### US4 — Le locataire paie et revient sur la page de statut (P1)

1. **Étant donné** la page de paiement, **quand** le locataire clique « Payer maintenant »,
   **alors** le serveur recalcule le reste dû, crée le paiement `PENDING` et le checkout (portant
   `secureLinkId`), et renvoie l'URL de paiement fournie par PaySecureHub (ou le simulateur) ;
   le navigateur y est redirigé, `SECURE_LINK_PAYMENT_STARTED` est journalisé.
2. **Étant donné** un paiement réussi chez le fournisseur, **quand** le locataire revient sur
   `/payer/statut?paiement=<code>`, **alors** la page demande le statut au serveur, qui
   réconcilie auprès de l'agrégateur si le statut n'a pas été vérifié depuis plus de 10 secondes ;
   tant que l'état est « en cours », la page réinterroge toutes les 3 secondes (environ 2 minutes
   au plus) puis affiche payé, échoué ou annulé. Après un rechargement, elle reprend la vérification
   grâce au code gardé en `sessionStorage` (effacé dès qu'une réponse est terminale).
3. **Étant donné** un retour avec un code inventé, d'un portail locataire, d'une agence
   suspendue, ou au format invalide, **alors** la même 404 uniforme est renvoyée et la page
   affiche un message neutre.
4. **Étant donné** un retour dont le paramètre d'URL affirme « payé » ou toute autre issue,
   **alors** la page ne le croit pas : seul le statut serveur compte.

### US5 — Double ouverture et paiement déjà en cours (P1)

1. **Étant donné** deux ouvertures simultanées du même lien (ou deux liens de la même échéance)
   suivies de deux « Payer maintenant », **quand** les deux requêtes arrivent ensemble, **alors**
   un seul checkout actif est créé. La requête suivante **reprend** le même `checkoutUrl`
   (`reused`) uniquement si le seul checkout actif est un `PENDING` de moins de 15 minutes **issu d'un
   lien** (`secureLinkId` non nul), **du même mode que la configuration de l'agence**, aux mêmes
   échéances, au même montant, et **déjà muni de son URL de paiement** ; tant que la première requête
   attend la réponse de l'agrégateur (l'URL n'est pas encore enregistrée), la concurrente reçoit la
   409 ci-dessous et le locataire réessaie.
2. **Étant donné** un checkout `PENDING` récent qui couvre d'autres échéances, a un autre montant, a
   été lancé depuis le portail locataire (pas de `secureLinkId`) ou a été créé dans un autre mode,
   **quand** le locataire clique « Payer maintenant », **alors** il reçoit une 409 « Un paiement en
   ligne est déjà en cours pour cette échéance. » et aucun second checkout n'est créé.
   **Étant donné** un checkout `REVIEW` (écart de montant, à trancher par l'agence, sans limite d'âge),
   **alors** le démarrage répond 409 « Votre paiement est en cours de vérification par l'agence.
   Contactez votre agence. », l'ouverture du lien renvoie `reviewPending: true` et la page désactive
   « Payer maintenant » en invitant à contacter l'agence.
3. **Étant donné** une échéance soldée par un paiement confirmé (par ce lien, le portail ou
   l'agence), **quand** le locataire rouvre le lien, **alors** la 404 uniforme est renvoyée : le
   lien est devenu inopérant.
4. **Étant donné** que PaySecureHub ne répond pas à la création du paiement, **quand** le locataire
   clique « Payer maintenant », **alors** le paiement et le checkout sont marqués `FAILED`, la
   réponse est 502 et le locataire peut réessayer.

## 3. Exigences fonctionnelles

### Lien de paiement (portée `INSTALLMENT_PAYMENT`)

- **FR-001** : le lien est un `SecureLink` de portée `INSTALLMENT_PAYMENT`, `objectType =
"RentalInstallment"`, `objectId` = identifiant de l'échéance. **Un lien = une échéance**, jamais
  un bail ni un ensemble d'échéances. L'URL partagée est `${FRONTEND_URL}/payer#<jeton>` : le
  jeton est dans le fragment, puis en corps de `POST`. Le lot hérite, sans les modifier, de
  FR-002 à FR-010 de la spec 031 (jeton de 256 bits, seul le SHA-256 stocké, durée de
  7 jours par défaut et 30 au plus via `SECURE_LINK_DEFAULT_TTL_DAYS` et
  `SECURE_LINK_MAX_TTL_DAYS`, vérification, refus uniforme, limiteur, en-têtes, audit,
  révocation).
- **FR-002** : la création d'un lien exige : échéance de l'agence (sinon `NotFoundError`,
  identique à une échéance inexistante), bail `ACTIVE`, échéance non `CANCELED`, reste dû strictement
  positif, compte de paiement en ligne de l'agence **utilisable** (`isConfigUsable`). Sinon 400
  avec un message clair. Un bail ou une échéance d'une autre agence ne se distingue pas d'un objet
  inexistant.
- **FR-003** : le locataire destinataire et payeur est `RentalLease.primary_renter_client_id` du bail
  de l'échéance. Il n'est jamais fourni par l'appelant (agence ou public).
- **FR-004** : le **montant n'est ni dans le lien, ni dans l'URL, ni lu de la requête**. Il est
  recalculé côté serveur à chaque ouverture et à chaque démarrage : reste dû de l'échéance
  (`resteDuEcheance`, pénalités comprises, déduction des paiements `SUCCESS` et des
  allocations), arrondi à l'entier (FCFA).
- **FR-005** : à **chaque ouverture** et à chaque démarrage, le serveur recontrôle : jeton valide
  (FR-004 de la spec 031, agence active et non `SUSPENDED`), échéance présente dans l'agence du
  lien, non `CANCELED`, reste dû > 0, bail `ACTIVE`, compte de paiement en ligne de l'agence
  utilisable. Tout échec renvoie le refus uniforme ; un
  paiement confirmé rend donc le lien inopérant sans le révoquer.
- **FR-006** : la consultation n'est enregistrée (`viewCount`, `lastViewedAt`,
  `SECURE_LINK_VIEWED`) qu'**après** une lecture réussie ; elle est attribuée à l'agence du lien et
  porte IP et user-agent dans `AuditLog`, nulle part ailleurs.

### Routes agence

- **FR-007** : sous `/api/tenants/:tenantId/rental/installments/:installmentId`, derrière
  `requireTenantAccess` et la fonctionnalité d'abonnement `RENTAL` (préfixe `/rental`), **sans nouvelle
  permission** :

  | Route                          | Permission               | Effet                                                                                            |
  | ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------ |
  | `POST /payment-link`           | `RENTAL_PAYMENTS_CREATE` | corps `{ delivery: 'SEND' \| 'COPY', ttlDays? }` (1 à 30) ; envoie le lien ou le crée pour copie |
  | `GET /payment-links`           | `RENTAL_PAYMENTS_VIEW`   | liste les liens de l'échéance avec l'état du paiement associé, sans jeton, hash ni URL           |
  | `DELETE /payment-link/:linkId` | `RENTAL_PAYMENTS_CREATE` | révoque le lien ; idempotent                                                                     |

  Justification de la permission : le lien déclenche la création d'un `RentalPayment` `PENDING` et
  d'un checkout ; la permission existante la plus proche est celle de création d'un paiement locatif.

- **FR-008** : `POST /payment-link` a un corps `.strict()`. `COPY` : 201 `{ linkId, url, expiresAt,
amountDue, currency }`, l'URL n'étant renvoyée **qu'une seule fois**. `SEND` : 201 `{ sent: true,
channel, linkId, expiresAt, amountDue, currency }` si un message est parti ; 200 `{ sent: false,
reason }` sinon, **aucun lien n'étant conservé**. Une durée au-delà de 30 jours est refusée (400),
  jamais tronquée.
- **FR-009** : `linkId` est vérifié comme appartenant à l'échéance **et** à l'agence ; sinon
  `NotFoundError` uniforme.
- **FR-010** : `amountDue` renvoyé à l'agence est celui du moment de la création, à titre
  informatif ; il n'engage pas le paiement (FR-004).

### Routes publiques

- **FR-011** : routes montées dans `routes/secure-link-public-routes.ts`, préfixe
  `/api/public/secure-links`, le jeton dans le **corps** :

  | Route                              | Corps                                        | Succès                                           |
  | ---------------------------------- | -------------------------------------------- | ------------------------------------------------ |
  | `POST /installment-payment`        | `{ token }`                                  | 200 `InstallmentPaymentPublicDto`                |
  | `POST /installment-payment/start`  | `{ token }`                                  | 200 `{ checkoutUrl }` (limiteur à 10 par minute) |
  | `POST /installment-payment/status` | `{ codePaiement }` (`^IMT-[A-Za-z0-9]{20}$`) | 200 `InstallmentPaymentStatusDto`                |

  Chaque route : limiteur par IP **avant** toute vérification, avec trois limiteurs distincts (clés
  séparées) : consultation **30 par minute**, démarrage `/start` **10 par minute**, statut `/status`
  **90 par minute** (la page de statut interroge toutes les 3 s, soit 20 par minute, et plusieurs
  onglets ou rechargements doivent passer), en-têtes `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`,
  `Referrer-Policy: no-referrer` sur toute réponse (succès et refus), parseur JSON propre borné à
  1 Ko, toute erreur de corps = la même 404 uniforme sans journaliser le message du parseur,
  schéma Zod borné dont les champs en trop sont ignorés (jamais lus). **Aucun montant, aucun identifiant** (agence, bail, échéance,
  checkout, locataire) n'est lu du corps : seuls `token` ou `codePaiement`.

- **FR-012** : tout refus (jeton ou code) est la même 404 « Lien invalide ou expiré. », mêmes
  en-têtes (FR-005 de la spec 031). Les causes ne sont pas distinguées : inconnu, expiré, révoqué,
  mauvaise portée, agence inactive ou suspendue, échéance disparue, annulée ou soldée, bail non
  actif, code de paiement sans lien, format de code invalide.
- **FR-013** : la réponse de `/installment-payment` est une **projection minimale** :
  `agencyName`, `periodYear`, `periodMonth`, `dueDate`, `amountDue`, `currency`, `expiresAt`,
  `paymentMethods`, `simulated`, `paymentInProgress` (checkout `PENDING` de moins de 15 minutes) et
  `reviewPending` (checkout `REVIEW`, sans limite d'âge). Elle ne contient **aucun** nom, e-mail ni
  téléphone du locataire ou du propriétaire, aucun identifiant technique, aucun détail du bail ni du
  bien.
- **FR-014** : la réponse de `/status` est : `status` (`PENDING`, `SUCCESS`, `FAILED`, `CANCELED`),
  `amount`, `currency`, `agencyName`, `periodYear`, `periodMonth`. `REVIEW` est présenté
  `PENDING` et `EXPIRED` `CANCELED` : aucun état interne n'est exposé.

### Démarrage du paiement et idempotence

- **FR-015** : `/start` recalcule le reste dû (FR-004), vérifie les conditions de FR-005 et la
  configuration marchande, puis crée un `RentalPayment` `PENDING` (méthode `MOBILE_MONEY`) et un
  `OnlinePaymentCheckout` `PENDING` portant `secureLinkId` = identifiant du lien et
  `createdByUserId` = `SecureLink.createdByUserId`, `installmentIds` = l'échéance du lien.
- **FR-016** : l'URL de paiement renvoyée est **`checkout.checkoutUrl`**, fournie par le
  fournisseur ou le simulateur (`buildAway`). Elle n'est jamais construite à partir d'une entrée de
  l'appelant. Le **serveur la valide avant de la stocker**, dans `requestProviderCheckout` : forme
  normalisée (`normalizeProviderCheckoutUrl`), `https` exigé, `http` seulement en mode `SIMULATOR` et vers
  `localhost`, `127.0.0.1` ou `[::1]`, identifiants intégrés (userinfo) et espaces refusés. Une URL
  refusée **n'est jamais stockée** : le paiement et le checkout passent `FAILED` et la réponse est une
  502, sans journaliser l'URL. L'URL stockée est revalidée au démarrage (y compris pour une reprise). La
  page web refait le contrôle (`https`, ou `http` vers l'hôte local) avant de rediriger. Limites : en
  mode simulateur, un `BACKEND_URL` en `http` sur un hôte non local est refusé (le staging doit servir
  le simulateur en `https`) ; il n'y a **pas de liste blanche d'hôtes** (point ouvert).
- **FR-017** : l'URL de retour transmise au fournisseur (et au simulateur) est
  `${FRONTEND_URL}/payer/statut?paiement=<codePaiement>` : jamais le jeton du lien. Le portail
  locataire garde `/tenant/payments?paiement=` et son comportement exact (400 et 409 inchangés).
- **FR-018** : **verrou consultatif** `pg_advisory_xact_lock`, clé dérivée de l'agence et des
  échéances, pris au début de la transaction de création, **sur le chemin « lien » seulement**. La
  configuration marchande est chargée **avant** la transaction et toutes les lectures de la
  transaction passent par le client transactionnel (`tx`) : aucune requête hors transaction pendant
  qu'elle tient une connexion (pas d'épuisement du pool). Ordre de lecture sous verrou : **checkouts
  chevauchants d'abord, puis échéances et reste dû**, de sorte qu'une réconciliation `SUCCESS` entre les
  deux lectures est vue côté échéance (soldée) et ne laisse pas passer un doublon. Le reste dû et tous
  les contrôles (bail actif, échéance non annulée, reste dû > 0, compte marchand utilisable) sont donc
  **relus sous le verrou** : pas de fenêtre entre lecture et création côté lien. Sont « actifs » les
  checkouts `PENDING` de moins de 15 minutes **et tout checkout `REVIEW`, sans limite d'âge**. Un
  `REVIEW` donne toujours la 409 dédiée (« Votre paiement est en cours de vérification par
  l'agence. Contactez votre agence. »), jamais une reprise. Un unique `PENDING` **issu d'un lien**,
  **du même mode que la configuration**, aux mêmes échéances, au même montant et **muni de son URL de
  paiement** est **repris** (même `checkoutUrl`, `reused: true`, aucun second paiement) ; dans tous
  les autres cas de chevauchement (autres échéances, autre montant, `PENDING` du portail ou d'un autre
  mode, URL pas encore enregistrée, plusieurs checkouts actifs), 409 « Un paiement en ligne est déjà
  en cours pour cette échéance. », sans `codePaiement` ni URL dans la réponse. Un checkout `PENDING`
  actif fait valoir `paymentInProgress` et un `REVIEW` `reviewPending` à l'ouverture. Deux démarrages
  concurrents, même sur deux instances d'API, ne créent donc jamais deux checkouts actifs.
- **FR-019** : si l'agrégateur échoue à la création, le paiement et le checkout passent `FAILED`
  (même traitement que le portail), la réponse est 502 et aucune URL n'est renvoyée.
- **FR-020** : `SECURE_LINK_PAYMENT_STARTED` est journalisé à chaque démarrage (créé ou repris) :
  `linkId`, `installmentId`, `checkoutId`, `amount`, `reused` ; jamais le jeton ni l'URL de
  paiement. Le paiement et le checkout créés portent `created_by_user_id` / `createdByUserId` =
  l'agent qui a créé le lien (`SecureLink.createdByUserId`) : c'est la traçabilité réelle de l'origine
  du paiement, l'événement d'audit lui-même n'ayant pas d'acteur (le locataire n'a pas de compte).

### Statut après paiement

- **FR-021** : `/status` ne répond que pour les checkouts portant un `secureLinkId` non nul et dont
  l'agence est active et non `SUSPENDED` ; sinon refus uniforme. Le **code de paiement**
  (`IMT-` + 20 caractères alphanumériques aléatoires, `generateCodePaiement`) est imprévisible, à
  usage de **lecture seule** : il ne donne accès à rien d'autre qu'au statut du checkout et ne
  permet ni démarrage, ni annulation, ni remboursement.
- **FR-022** : si le checkout est `PENDING` et que la dernière vérification date de plus de
  10 secondes, le serveur réconcilie auprès de l'agrégateur (statut serveur à serveur, avec la clé de
  l'agence). La fenêtre est **réservée par une écriture atomique de `lastCheckedAt`** (mise à jour
  conditionnelle) : un seul appel au fournisseur par fenêtre de 10 secondes, quel que soit le nombre
  de requêtes ou d'instances ; une erreur du fournisseur est avalée et le statut connu est renvoyé. L'IPN et
  `reconcileCheckout*` restent la seule source de vérité du changement d'état : ce lot ne les
  modifie pas.
- **FR-023** : la page `/payer/statut` lit `paiement`, **l'efface de l'URL**
  (`history.replaceState`) et le garde dans `sessionStorage` (onglet courant seulement, effacé dès
  qu'une réponse est terminale ou invalide) pour reprendre après un rechargement. Elle interroge
  `/status`, réinterroge toutes les 3 s tant que `PENDING` (environ 2 minutes au plus) et affiche
  payé, échoué, annulé ou en cours. Un 429 ou une panne passagère **survenant après un état « en
  cours » ne sont pas terminaux** : la page garde l'état « en cours » et réessaie toutes les 6 s dans
  la même borne. Elle ne considère
  **jamais** le paramètre d'URL comme une preuve de paiement.

### Pages web publiques

- **FR-024** : `/payer` (lecture du fragment puis `history.replaceState`, jeton gardé en mémoire,
  écoute de `hashchange`, pas de double `POST` en mode strict de React, comme
  `OwnerMonthlyReportPage`) affiche agence, période, montant, moyens de paiement et un bouton
  « Payer maintenant ». Elle pose `robots: noindex, nofollow` et `referrer: no-referrer` le temps
  qu'elle est montée, sans lien sortant. Trilingue (fr/en/ar), sans compte.
- **FR-025** : quand un paiement `PENDING` est déjà en cours (`paymentInProgress`), la page l'affiche
  (« Un paiement est déjà en cours pour cette échéance ») sans bloquer le bouton : un nouveau clic
  reprend le même `checkoutUrl` si le checkout est repris, ou reçoit la 409 (message « Patientez
  quelques minutes puis réessayez »). Quand un checkout `REVIEW` existe (`reviewPending`), la page
  affiche « Votre paiement est en cours de vérification par l'agence. Contactez votre agence si le
  problème persiste. » et **désactive « Payer maintenant »** ; la 409 du démarrage porte le même
  message. La page ne crée jamais de second checkout actif.

### Envoi par WhatsApp et e-mail

- **FR-026** : nouvel événement `RENTER_PAYMENT_LINK_SENT`, e-mail **et** WhatsApp, rattaché à la
  fonctionnalité d'abonnement `RENTAL` (`notification-key-features.ts`). WhatsApp est
  **OPT-IN** (désactivé tant que l'agence n'a pas de ligne de configuration, comme les clés
  propriétaire de la spec 031) ; l'e-mail est activé par défaut. Variables : `{{renterName}}`,
  `{{agencyName}}`, `{{period}}`, `{{amountDue}}`, `{{paymentUrl}}`, `{{expiresAt}}`.
  L'événement est désactivable et son modèle personnalisable par agence dans les écrans de
  configuration des notifications existants.
- **FR-027** : le routage suit FR-019 de la spec 031 : **un seul canal par message**, consentement
  du canal **et** coordonnée exploitable, canal préféré du contact d'abord puis repli. Le
  destinataire est la fiche CRM du locataire du bail (rapprochée par l'e-mail du compte du locataire, comme
  `resolveCrmContactId`), **jamais fourni par l'appelant**. Quand plusieurs fiches partagent cet
  e-mail, le choix est **déterministe** : la plus ancienne (`createdAt`, puis `id`). Motifs de non-envoi :
  `NO_ELIGIBLE_CHANNEL`, `EVENT_DISABLED`, `SEND_FAILED`, `RENTER_CONTACT_NOT_FOUND`.
- **FR-028** : ordre d'envoi : plan de canaux d'abord ; le lien n'est créé que si un canal est
  éligible ; il est **révoqué** si tous les envois échouent. L'URL figure dans le corps du message,
  jamais dans le sujet d'un e-mail ni dans un journal applicatif : un `subjectOverride` d'agence ne
  reçoit **aucune variable d'URL** (`paymentUrl`, `reportUrl`), même s'il la référence. Les valeurs injectées dans un
  modèle HTML sont échappées. Audit `RENTAL_PAYMENT_LINK_SENT` : canal, `linkId`,
  `installmentId` ; jamais le jeton ni l'URL.
- **FR-029** : un nouvel envoi crée un nouveau lien (action explicite de l'agence) ; il n'y a pas
  d'envoi automatique, de relance planifiée ni d'anti-doublon.

### Transverse

- **FR-030** : chaque nouvelle route passe `routes-inventory.test.ts` ; les trois routes
  publiques sont inscrites à la liste blanche avec leur justification. Aucun nouveau modèle ;
  `OnlinePaymentCheckout` reste couvert par `schema-tenant-coverage.test.ts`
  (`tenantId` direct).
- **FR-031** : tout libellé visible passe par `t()` (fr clé, en, ar) ; marges en propriétés
  logiques.
- **FR-032** : aucun envoi réel, aucune transaction réelle, aucun mode `LIVE` en recette : le
  simulateur reproduit les trois issues (payé, échoué, annulé) et l'URL de retour du simulateur
  est la page `/payer/statut`.

## 4. Menaces et mesures

Détail du modèle de menace générique : SECURITY.md, « 12 bis. Liens publics à jeton » et sous-section
« Lien de paiement d'une échéance ».

| Menace                                                 | Mesure retenue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Vérification                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Montant modifiable par l'appelant                      | Le montant n'est ni dans le lien, ni dans l'URL, ni dans le corps : seuls `token` ou `codePaiement` sont lus (schéma Zod borné, champs en trop ignorés). Le reste dû est recalculé côté serveur à chaque ouverture et à chaque démarrage ; le checkout est créé avec ce montant                                                                                                                                                                                                                                                                         | FR-004, FR-011, FR-015 ; test : un champ `amount` en trop est ignoré                                                  |
| Rejeu du lien                                          | `revokedAt`, `expiresAt`, portée, agence, bail `ACTIVE`, échéance non annulée et reste dû > 0 recontrôlés à **chaque** appel, sans cache du verdict ; un paiement confirmé rend le lien inopérant ; le rejeu de « démarrer » est idempotent (FR-018)                                                                                                                                                                                                                                                                                                    | FR-005, FR-018 ; test : ouverture après paiement, après révocation = 404                                              |
| Double paiement                                        | Verrou consultatif `pg_advisory_xact_lock` (agence, échéances) dans la transaction de création, avec **checkouts chevauchants puis reste dû et contrôles relus sous le verrou** (pas de TOCTOU côté lien, aucune lecture hors `tx`) : un seul checkout actif par échéance ; reprise à l'identique d'un unique `PENDING` exact (< 15 min, issu d'un lien, même mode, mêmes échéances et montant, URL présente) ; 409 sinon, **tout `REVIEW` (sans limite d'âge) bloquant** avec message dédié. Limite : le portail locataire ne prend pas ce verrou (§8) | FR-018 ; test : deux démarrages concurrents = un checkout ; test : `REVIEW` = 409 ; test : `PENDING` du portail = 409 |
| Lien volé, divulgué, transféré                         | Impossible à empêcher ; on borne l'impact : un seul objet (une échéance), expiration 7 jours (30 au plus), révocation immédiate, consultations comptées et journalisées. Le porteur ne peut **que payer** cette échéance : il ne voit aucune donnée de contact, ne peut ni choisir le montant ni rediriger l'argent (le compte marchand est celui de l'agence)                                                                                                                                                                                          | FR-001, FR-013 ; SECURITY.md §12 bis                                                                                  |
| Énumération et mesure de temps                         | Refus uniforme (même statut, corps, en-têtes) pour jeton et pour code de paiement ; recherche par hash ; limiteur par IP avant toute vérification (30 par minute, 10 pour `/start`, 90 pour `/status`) ; entropie de 256 bits du jeton, de 20 caractères alphanumériques aléatoires du code                                                                                                                                                                                                                                                             | FR-011, FR-012 ; test paramétré : tous les refus identiques                                                           |
| Redirection ouverte                                    | L'URL de paiement est `checkout.checkoutUrl` du fournisseur ou du simulateur, jamais construite depuis une entrée de l'appelant ; **normalisée et validée côté serveur avant stockage** (`https` exigé, `http` en `SIMULATOR` vers l'hôte local seulement, userinfo et espaces refusés ; refus = `FAILED` et 502, URL jamais stockée), revalidée au démarrage, puis contrôlée par la page ; l'URL de retour est construite côté serveur à partir de `FRONTEND_URL`. Pas de liste blanche d'hôtes (§8)                                                   | FR-016, FR-017 ; test API : URL non conforme refusée et non stockée ; test web : URL non `https` refusée              |
| IPN falsifiée                                          | **Inchangée** : l'IPN ne sert qu'à retrouver la référence, puis le statut est redemandé à l'agrégateur avec la clé de l'agence (serveur à serveur) ; elle ne peut pas imposer un statut ni un montant. Le lot n'ajoute aucune route d'IPN                                                                                                                                                                                                                                                                                                               | FR-022 ; SECURITY.md §6 ; test : IPN forgée sans effet                                                                |
| Échéance d'un autre locataire ou d'une autre agence    | Le jeton désigne l'échéance ; locataire = `primary_renter_client_id` du bail, jamais fourni ; échéance chargée par `id` ET `tenantId` du lien ; côté agence, `installmentId` et `linkId` vérifiés par agence, `NotFoundError` uniforme ; checkout créé dans l'agence du lien                                                                                                                                                                                                                                                                            | FR-002, FR-003, FR-009 ; `test:isolation`                                                                             |
| Lien pour une échéance déjà soldée ou annulée          | Création refusée (400) ; ouverture et démarrage refusés (404 uniforme) dès que le reste dû est nul, l'échéance annulée ou le bail non actif                                                                                                                                                                                                                                                                                                                                                                                                             | FR-002, FR-005 ; test : échéance soldée = 404                                                                         |
| Fuite de données du locataire                          | Réponse publique **minimale** et par projection explicite (`select`) : agence, période, échéance, montant, moyens ; ni nom, ni e-mail, ni téléphone, ni identifiant technique ; le statut par code ne renvoie que l'état, le montant et la période                                                                                                                                                                                                                                                                                                      | FR-013, FR-014 ; test : 0 e-mail, téléphone ni identifiant dans la réponse                                            |
| Code de paiement du retour (`/payer/statut?paiement=`) | Référence imprévisible (`IMT-` + 20 alphanumériques), lecture seule, limitée aux checkouts issus d'un lien ; format validé avant lecture ; code effacé de l'URL par la page et gardé seulement en `sessionStorage` de l'onglet (effacé sur réponse terminale) ; le paramètre n'est jamais une preuve de paiement (le statut vient du serveur, réconcilié auprès de l'agrégateur)                                                                                                                                                                        | FR-021, FR-023 ; test : code inventé ou checkout de portail = 404                                                     |
| Course entre deux ouvertures                           | Verrou consultatif dans la transaction de création, valable entre instances ; reprise de l'URL ou 409 au lieu d'un second checkout ; verrou jamais tenu pendant l'appel réseau ; pas de verrou sur le chemin du portail locataire (inchangé), d'où la limite « portail contre lien » (§8)                                                                                                                                                                                                                                                               | FR-018                                                                                                                |
| Agence suspendue ou désactivée                         | Statut de l'agence contrôlé à chaque ouverture, démarrage et lecture de statut : refus uniforme ; le compte marchand doit rester utilisable                                                                                                                                                                                                                                                                                                                                                                                                             | FR-005, FR-021                                                                                                        |
| Mode LIVE activé par erreur en recette                 | Aucun mode `LIVE` n'est activé ni testé par ce lot ; la recette et les tests passent par `SIMULATOR` ; le mode de l'agence est celui de sa configuration, jamais choisi par le lien ni l'appelant                                                                                                                                                                                                                                                                                                                                                       | FR-032 ; points ouverts §8                                                                                            |
| Envoi au mauvais destinataire, sans consentement       | Destinataire lu sur la fiche CRM du locataire du bail (rapprochement déterministe : la plus ancienne), jamais fourni ; un seul canal par message ; consentement du canal et coordonnée exploitable ; WhatsApp opt-in ; événement désactivable ; l'URL va dans le corps, jamais dans un sujet (un `subjectOverride` ne reçoit aucune variable d'URL) ni un journal ; aucun lien conservé si rien n'est envoyé                                                                                                                                            | FR-027, FR-028 ; test : table des combinaisons de consentements                                                       |
| Abus, force brute, déni de service                     | Limiteur par IP avant tout, à trois niveaux distincts (consultation 30 par minute, `/start` 10 par minute, `/status` 90 par minute) ; réconciliation de `/status` réservée par écriture atomique de `lastCheckedAt` (un seul appel fournisseur par fenêtre de 10 s) ; corps borné à 1 Ko, erreurs de corps = 404 uniforme ; un seul champ lu                                                                                                                                                                                                            | FR-011, FR-022                                                                                                        |
| Fuite par journaux, cache, `Referer`, indexation       | Jeton dans le fragment puis en corps de `POST` ; code de paiement effacé de l'URL ; `no-store`, `no-referrer`, `noindex` sur toutes les réponses ; audit sans jeton ni URL                                                                                                                                                                                                                                                                                                                                                                              | FR-006, FR-011, FR-020, FR-028                                                                                        |
| Abus par un collaborateur (création en masse de liens) | Permission `RENTAL_PAYMENTS_CREATE` ; chaque création et chaque envoi journalisés avec l'acteur ; la liste d'agence montre tous les liens                                                                                                                                                                                                                                                                                                                                                                                                               | FR-007 ; `SECURE_LINK_CREATED`, `RENTAL_PAYMENT_LINK_SENT`                                                            |

Limites assumées : un lien divulgué permet à son porteur de **payer** une échéance (rien d'autre)
jusqu'à son expiration ou sa révocation ; aucune vérification d'identité du porteur n'est faite.
Les limiteurs de débit sont en mémoire, par instance (point déjà ouvert dans SECURITY.md).

## 5. Entités clés

- **`SecureLink`** (existant, spec 031) : nouvelle valeur d'enum `INSTALLMENT_PAYMENT`.
- **`OnlinePaymentCheckout`** (existant) : nouveau champ `secureLinkId` (texte, nul pour un paiement
  du portail locataire), index `(tenantId, secureLinkId)`. Pas de clé étrangère : comme `leaseId`.
- **`RentalInstallment`** (existant, inchangé) : objet visé, `objectType = "RentalInstallment"`.
- **`RentalLease`** (existant) : source du locataire (`primary_renter_client_id`) et du statut `ACTIVE`.
- **`RentalPayment`** (existant) : créé `PENDING` au démarrage, confirmé par l'IPN ou la réconciliation.
- **`CrmContact`** (existant) : source du consentement, des coordonnées et du canal préféré.
- **`AuditLog`** (existant) : `SECURE_LINK_*`, `SECURE_LINK_PAYMENT_STARTED`, `RENTAL_PAYMENT_LINK_SENT`.

## 6. Hypothèses

- Un seul compte marchand par agence (PaySecureHub) ; le lien ne le choisit pas.
- Une échéance par lien ; **pas de paiement partiel** : le locataire règle le reste dû en entier,
  un acompte se fait par les autres circuits (portail, agence).
- Les frais de la plateforme s'ajoutent ou sont retenus selon le paramétrage chez PaySecureHub ;
  ImmoTopia ne les ajoute pas au montant du lien (point ouvert 4 de paysecurehub.md).
- WhatsApp et e-mail : fournisseurs configurés hors de ce lot ; sans configuration, l'envoi
  WhatsApp est ignoré et le routage retombe sur l'e-mail.
- Aucune garde logicielle d'envoi simulé hors `NODE_ENV=test` (voir spec 031, FR-027) : un envoi
  manuel part réellement si un fournisseur est configuré.
- Le lien reste valide tant que le reste dû est positif : il suit les acomptes et pénalités
  enregistrés depuis l'envoi.

## 7. Critères de succès

- **SC-001** : 100 % des refus des trois routes publiques (jeton inconnu, expiré, révoqué, mauvaise
  portée, agence suspendue, échéance soldée ou annulée, bail non actif, code inconnu ou de portail,
  format invalide) renvoient un statut, un corps et des en-têtes identiques (test paramétré).
- **SC-002** : 0 montant lu du corps ou de l'URL : un champ `amount`, `installmentId` ou `tenantId`
  ajouté au corps ne change ni le montant du checkout, ni l'objet visé (test).
- **SC-003** : sur 2 à 10 démarrages concurrents du même lien, **1 seul** checkout `PENDING` est créé ;
  les autres reçoivent le même `checkoutUrl` (`reused`) ou la 409, jamais une seconde URL ; un
  checkout `REVIEW` bloque tout nouveau démarrage (409, message dédié) et fait valoir `reviewPending`,
  un `PENDING` du portail donne 409 (test avec la base jetable).
- **SC-004** : 0 jeton en clair et 0 URL de lien en base, dans `AuditLog` et dans les journaux
  applicatifs, et 0 URL de paiement dans `AuditLog` et les journaux, sur un cycle envoi, ouverture,
  démarrage, statut, révocation (l'URL de paiement fournisseur reste dans `OnlinePaymentCheckout.checkoutUrl`,
  comme pour le portail).
- **SC-005** : 100 % des réponses publiques portent les trois en-têtes ; 0 réponse publique ne
  contient d'e-mail, de téléphone, de nom de locataire ni d'identifiant technique.
- **SC-006** : après un paiement confirmé (IPN simulée ou réconciliation), l'ouverture du lien
  répond 404 et `/status` renvoie `SUCCESS`, sans modification du code de l'IPN ni de la réconciliation.
- **SC-007** : une consultation, un démarrage ou un statut avec le contexte d'une autre agence ne
  renvoie aucune donnée (`test:isolation`).
- **SC-008** : sur un jeu de contacts couvrant les combinaisons de consentement, coordonnées et canal
  préféré, chaque message part par au plus un canal, jamais vers un canal sans consentement, et un
  envoi sans canal ne laisse aucun lien actif.
- **SC-009** : `/start` et `/status` renvoient un 404 uniforme pour une agence suspendue.
- **SC-010** : recette complète en mode `SIMULATOR` (payé, échoué, annulé, double ouverture,
  révocation) sans aucun appel réseau vers PaySecureHub réel.
- **SC-011** : les trois limiteurs publics sont distincts (30, 10 et 90 par minute et par IP) : 31
  consultations en une minute sont refusées (429 avec les trois en-têtes) sans affecter `/status` ;
  11 démarrages, idem ; 20 interrogations de statut par minute passent.
- **SC-012** : typecheck sans nouvelle erreur, lint, `check:architecture`, `routes-inventory`,
  `schema-tenant-coverage`, `test:isolation`, `wiki:check` verts ; relecture `code-reviewer` et
  `security-auditor` faite.

## 8. Points ouverts et hors périmètre

- **Pas de révocation automatique des liens précédents** : chaque envoi ou copie crée un lien actif de
  plus ; plusieurs liens valides coexistent pour une échéance. Le verrou consultatif garantit qu'ils
  ne produisent pas plusieurs checkouts actifs.
- **Limiteurs de débit en mémoire**, par instance : avec N instances, les plafonds sont multipliés
  par N (point déjà ouvert dans SECURITY.md). Le verrou consultatif, lui, est partagé entre instances.
- **Durée de validité d'un lien `build-away` non utilisé** : inconnue (point 7 de
  [paysecurehub.md](../../docs/integrations/paysecurehub.md)) ; la reprise d'un checkout s'arrête à
  15 minutes, le locataire retombe sinon sur un nouveau checkout.
- **Portail contre lien** : le chemin du portail locataire (`startCheckout`) ne prend pas le verrou
  consultatif (son comportement est inchangé) ; un paiement lancé depuis le portail et un autre lancé
  depuis un lien **au même instant** sur la même échéance restent possibles. Le verrou ne protège
  que « lien contre lien ».
- **`REVIEW` non résolu automatiquement** : un checkout `REVIEW` (écart de montant constaté par la
  réconciliation) n'est pas repris par la tâche planifiée (qui ne traite que les `PENDING`) ; seul le
  bouton « Vérifier » de l'agence ou un règlement manuel le résout. Tant qu'il existe, il **bloque
  tous les liens de l'échéance**, sans limite d'âge. **Point ouvert à décider avec l'utilisateur** :
  une action « trancher un REVIEW » côté agence et/ou une borne d'âge.
- **Reprise et second lien** : la reprise ne vise que les checkouts issus d'un lien et du même mode ;
  un `PENDING` du portail donne 409 (pas de reprise). Un second lien de la même échéance qui reprend le
  checkout du premier n'a pas de checkout propre : la liste de l'agence l'affiche « aucun paiement »
  (la jointure se fait par `secureLinkId`) alors que le paiement est en cours.
- **URL fournisseur** : pas de liste blanche d'hôtes (point ouvert) ; en simulateur, un `BACKEND_URL`
  en `http` sur un hôte non local est refusé (le staging doit servir le simulateur en `https`).
- **Double règlement tardif** : le verrou et la reprise ne couvrent que les checkouts `PENDING` de
  moins de 15 minutes. Au-delà, un nouveau checkout peut être créé alors que l'ancien reste
  `PENDING` (expiré par la tâche planifiée après 48 h) ; si le locataire paie les deux pages, la
  réconciliation existante confirme les deux et le surplus reste en avance sur son compte
  (comportement du portail, inchangé).
- **Montant frais compris ou non** : `payments.amount` de l'agrégateur (point 4 de
  paysecurehub.md) : tant que ce point n'est pas tranché, le rapprochement du montant confirmé se
  fait avec les règles existantes de la réconciliation, inchangées.
- **Pas de paiement partiel** ni de paiement de plusieurs échéances par un lien : une échéance, le
  reste dû en entier.
- **Mode `LIVE` PaySecureHub non validé** : ni activé ni testé ; la recette passe par `SIMULATOR`.
  Un **envoi réel** (WhatsApp, e-mail) n'a pas été vérifié non plus.
- **Pas d'IPN signée** : point existant (SECURITY.md §6, paysecurehub.md point 3), non corrigé ici ;
  la réconciliation serveur à serveur le compense.
- **Relance automatique** d'un lien non payé, **rappel avant échéance** et **lien dans les messages
  de retard** : non prévus.
- **Révocation automatique** à l'annulation de l'échéance ou à la fin du bail : le lien devient
  inopérant (404 uniforme) sans être marqué révoqué.
- **Fonctionnalité d'abonnement `RENTAL` retirée** après l'envoi : le lien déjà émis reste valable
  jusqu'à expiration ; non revérifié à l'ouverture.
