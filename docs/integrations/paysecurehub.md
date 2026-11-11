# PaySecureHub (BMI Finance CI) — agrégateur de paiement

Agrégateur retenu le 24 septembre 2026 pour le paiement en ligne des loyers
(lot 7 de la gestion locative). Il remplace CinetPay, envisagé jusque-là.

Source : documentation remise par l'éditeur (fichier Word « documentation
payhubsecure », conservé hors du dépôt : ses exemples contiennent les
coordonnées d'une personne réelle). Le produit s'appelle PayHub, mais toutes les
adresses sont en `paysecurehub.com`.

## Décisions ImmoTopia

- **Un compte marchand par agence.** Chaque agence saisit son `ApiKey` et son
  `MerchantId` dans ses paramètres. Les loyers arrivent sur son compte de
  collecte à elle ; ImmoTopia ne détient jamais l'argent (pas de mode
  agrégateur, pas de question d'agrément BCEAO).
- **Page de paiement hébergée** (`build-away`) : le locataire choisit son
  moyen (Wave, Orange Money, MTN, Moov, carte Visa) sur la page PaySecureHub.
  Pas d'OTP ni de redirection Wave à gérer chez nous.
- **La notification (IPN) n'est jamais crue sur parole.** Elle n'est pas
  signée : n'importe qui peut en fabriquer une. À sa réception, on redemande le
  statut à PaySecureHub avec la clé de l'agence (`status/transact`) et seule
  cette réponse fait foi.
- **Simulateur.** Tant que les identifiants de test ne sont pas fournis, une
  agence peut basculer en mode `SIMULATOR` : une fausse page de paiement servie
  par l'API reproduit les trois issues (payé, échoué, annulé).

## API

Base : `https://rest-airtime.paysecurehub.com/api`. En-têtes : `ApiKey`,
`MerchantId` (sauf `/data-ws/pays` et `/data-ws/providers`), `Content-Type:
application/json`.

| Appel                                               | Usage chez nous                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /payhub-ws/build-away`                        | Crée la demande et renvoie `{ tokens, url, code, message }` ; `url` est la page où rediriger le locataire.                                              |
| `POST /airtime/status/transact` `{ codePaiement }`  | Statut faisant foi. Réponse : `payments.state`, `payments.transactionId`, `payments.amount`, `payments.fees`, `payments.serviceName`, `payments.error`. |
| `GET /data-ws/solde`                                | Solde du compte de collecte ; sert de « tester la connexion ».                                                                                          |
| `GET /data-ws/providers`                            | Opérateurs disponibles (non utilisé au lot 7).                                                                                                          |
| `POST /mrchd_ws/paymentReq` puis `/{pmId}/payments` | Paiement direct sans page hébergée — non retenu.                                                                                                        |

Corps de `build-away` : `code_paiement` (notre référence, renvoyée dans
l'IPN), `nom_usager`, `prenom_usager`, `telephone`, `email`,
`libelle_article`, `quantite`, `montant` (entier, en FCFA), `lib_order`,
`Url_Retour`, `Url_Callback`.

Les frais de la plateforme s'ajoutent au montant ou sont retenus sur l'agence
selon un paramétrage fait **chez PaySecureHub** ; ImmoTopia se contente de le
recopier (`feesPaidBy`) pour l'annoncer au locataire.

## Lien de paiement envoyé par l'agence

Lot C5 (spec [039](../../specs/039-patrimoine-lien-paiement/spec.md)). Depuis l'écran des échéances,
l'agence envoie (WhatsApp ou e-mail) ou copie un lien vers **une** échéance ; le locataire paie
sans compte. C'est le même `build-away` que le paiement du portail locataire : seuls changent le
point d'entrée (un lien public à jeton) et l'URL de retour.

**Flux.**

1. L'agence crée le lien (`POST …/rental/installments/:installmentId/payment-link`) : un
   `SecureLink` de portée `INSTALLMENT_PAYMENT`, URL `${FRONTEND_URL}/payer#<jeton>`.
2. Le locataire ouvre `/payer` : la page envoie le jeton en corps de
   `POST /api/public/secure-links/installment-payment` et affiche le reste dû **calculé par le
   serveur** (pénalités comprises).
3. « Payer maintenant » : `POST …/installment-payment/start`. La configuration marchande est chargée
   avant la transaction ; le serveur prend ensuite un **verrou consultatif**, relit sous verrou les
   checkouts chevauchants puis le reste dû, crée un `RentalPayment` `PENDING` et un
   `OnlinePaymentCheckout` portant `secureLinkId`, puis appelle `build-away` **hors transaction**. La
   réponse est `checkout.checkoutUrl` (la `url` de PaySecureHub, ou la fausse page du simulateur), que
   le **serveur normalise et valide avant de la stocker** : `https` exigé, `http` seulement en mode
   `SIMULATOR` vers `localhost`, `127.0.0.1` ou `[::1]`, identifiants intégrés et espaces refusés ; une
   URL refusée n'est jamais stockée (paiement et checkout `FAILED`, 502). La page ne redirige le
   navigateur que vers une URL `https` (`http` en développement local). Un second démarrage **reprend**
   le même `checkoutUrl` si le seul checkout actif est un `PENDING` exact de moins de 15 minutes, issu
   d'un lien, du même mode, dont l'URL est enregistrée ; sinon 409 (un `PENDING` du portail aussi). Un
   checkout `REVIEW`, sans limite d'âge, bloque toujours (409 « Votre paiement est en cours de
   vérification par l'agence. Contactez votre agence. »).
4. Le locataire paie chez PaySecureHub, qui le renvoie sur `Url_Retour` et notifie l'IPN
   (`Url_Callback`).
5. **URL de retour** : `${FRONTEND_URL}/payer/statut?paiement=<codePaiement>` pour un checkout issu
   d'un lien (jamais le jeton) ; le portail locataire garde `/tenant/payments?paiement=`. Le
   simulateur renvoie sur la même URL selon l'origine du checkout.
6. **Statut par code** : la page `/payer/statut` lit `paiement`, l'efface de l'URL (elle le garde en
   `sessionStorage` de l'onglet pour reprendre après un rechargement, et l'efface dès qu'une réponse
   est terminale), puis interroge
   `POST …/installment-payment/status` (`{ codePaiement }`, format `IMT-` + 20 caractères
   alphanumériques) toutes les 3 s tant que `PENDING` (environ 2 minutes au plus). La route ne
   répond que pour un checkout issu d'un lien, d'une agence non suspendue, et renvoie état
   (`PENDING`, `SUCCESS`, `FAILED`, `CANCELED`), montant, période et nom de l'agence ; `REVIEW` est
   présenté `PENDING` et `EXPIRED` `CANCELED`. Si le checkout est `PENDING` et n'a pas été vérifié
   depuis plus de 10 s, la route redemande le statut à PaySecureHub (`status/transact`, clé de
   l'agence) ; la fenêtre est réservée par une écriture atomique de `lastCheckedAt`, donc **un seul appel
   au fournisseur par fenêtre de 10 s**. Une erreur de l'agrégateur est avalée et l'état stocké est
   renvoyé. La route a son propre limiteur (90 par minute et par IP), distinct de la consultation
   (30) et du démarrage (10) ; un 429 ou une panne survenant après un état « en cours » ne met pas fin
   à l'attente côté page.

**Ce qui reste inchangé.**

- **L'IPN** : même route, même handler, jamais crue sur parole ; elle ne sert qu'à retrouver la
  référence puis à déclencher la réconciliation serveur à serveur. Le lot n'ajoute aucune route d'IPN.
- **La réconciliation** (`reconcileCheckout*`, `reconcilePendingCheckouts`) et la machine à états
  des paiements : seule source de vérité du changement d'état. Ni l'URL de retour ni la page de statut
  ne confirment un paiement.
- **Le mode `SIMULATOR`** : même fausse page de paiement et mêmes trois issues (payé, échoué,
  annulé) ; son retour pointe sur `/payer/statut` pour un checkout issu d'un lien.
- **Un compte marchand par agence** : le lien ne choisit ni la clé ni le mode ; les conditions
  `usable` (voir « Disponibilité durcie ») sont recontrôlées à chaque ouverture et à chaque démarrage.
- **Le portail locataire** : mêmes réponses 400 et 409, aucun verrou.

**Non validé.** Le mode `LIVE` n'est ni activé ni testé pour ce lot : la recette passe par
`SIMULATOR`, et aucun appel réel à PaySecureHub n'a été fait avec un lien de paiement. L'envoi réel du
lien (WhatsApp, e-mail) n'est pas non plus vérifié.

**Points ouverts propres au lien** (en plus de la liste ci-dessous) :

- **Durée de validité d'une page `build-away` non utilisée** (point 7) : inconnue. Le lien d'ImmoTopia
  vit 7 jours (30 au plus), la reprise d'un checkout s'arrête à 15 minutes ; un locataire qui revient
  plus tard déclenche un nouveau `build-away` alors que l'ancien checkout reste `PENDING` (la tâche
  planifiée ne l'expire qu'après 48 h) : s'il paie ensuite les deux pages, le second règlement est
  confirmé par la réconciliation existante et le surplus reste en avance sur le compte du locataire
  (comportement existant, identique au portail). Le comportement d'une page expirée chez PaySecureHub
  est à confirmer.
- **Montant frais compris ou non** (point 4) : le lien demande à PaySecureHub le reste dû de
  l'échéance ; le traitement du montant renvoyé par `status/transact` est celui de la réconciliation
  existante, non modifié.
- **Portail contre lien** : le portail locataire ne prend pas le verrou consultatif ; un paiement du
  portail et un paiement par lien simultanés sur la même échéance restent possibles. Un `PENDING` du
  portail déjà présent donne 409 au lien (pas de reprise). Un second lien qui reprend le checkout du
  premier affiche « aucun paiement » dans la liste de l'agence.
- **Checkout `REVIEW`** (écart de montant, état contraire, transaction en double ou échéance indisponible,
  constatés par la réconciliation) : il bloque tout nouveau démarrage par lien (409), sans limite d'âge ; la
  page désactive « Payer » (`reviewPending`) et invite à contacter l'agence. Il se tranche par la décision
  décrite dans « Décision sur un paiement en `REVIEW` » ci-dessous. **Borne d'âge** : le contrat (spec 049)
  n'en fixe aucune ; un `REVIEW` reste bloquant tant qu'il n'est pas tranché.
- **URL fournisseur** : pas de liste blanche d'hôtes ; en simulateur, un `BACKEND_URL` en `http` sur un
  hôte non local est refusé, donc le staging doit servir le simulateur en `https`.
- **Pas de paiement partiel**, **une seule échéance par lien**.
- **Pas de révocation automatique des liens précédents** de la même échéance.

## Décision sur un paiement en `REVIEW` (locatif)

Spec [049](../../specs/049-locatif-paiement-parite-syndic/contracts.md), §2.5 et §2.6. Le gestionnaire
tranche avec `POST /api/tenants/:tenantId/rental/online-payments/:checkoutId/resolve`, permission
`RENTAL_PAYMENTS_ALLOCATE`, corps `{ decision: 'ACCEPT' | 'REJECT', note?, paidAt? }`.

- **Note** : obligatoire pour `REJECT` (1 à 500 caractères), facultative pour `ACCEPT`. `paidAt` n'est admis
  qu'avec `ACCEPT`.
- **Claim atomique** : une mise à jour conditionnelle sur `status = 'REVIEW'` fait passer la tentative en
  `SUCCESS` ou `FAILED` ; deux décisions concurrentes n'ont qu'un vainqueur, l'autre reçoit 409.
- **Vérifier une tentative `EXPIRED` est permis** : cela permet de relire un succès tardif de la passerelle
  survenu après l'expiration.
- **Jamais encaissé automatiquement** : ni la vérification manuelle (`…/verify`, `…/online-check`), ni le
  retour portail ou l'IPN, ni le job de rapprochement n'encaissent une tentative en `REVIEW` ; ils ne
  mettent à jour que l'état fournisseur, le montant reçu et les compteurs de vérification. Seule la
  décision tranche.
- **Matrice par `reviewKind`** :

| `reviewKind`                                                    | ACCEPT                                                                 | REJECT                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------- |
| `AMOUNT_MISMATCH`                                               | encaisse le montant reçu sur les échéances visées encore ouvertes      | refus simple                |
| `INSTALLMENT_UNAVAILABLE`                                       | encaisse sur les échéances encore ouvertes ; sinon paiement non alloué | refus simple                |
| `DUPLICATE_TRANSACTION`                                         | 409 `REVIEW_NOT_ACCEPTABLE`                                            | refus simple                |
| `CONTRARY_STATE`, déjà encaissé (`collected`)                   | aucun nouvel encaissement, clôt en `SUCCESS`                           | 409 `REVIEW_NOT_REJECTABLE` |
| `CONTRARY_STATE`, non encaissé (succès tardif après expiration) | encaisse le montant reçu                                               | refus simple                |

- **`REJECT` ne rembourse rien** : l'argent reste chez PaySecureHub, le remboursement éventuel se règle
  avec l'agrégateur ; le `RentalPayment` passe en `FAILED`.
- L'encaissement passe par le service d'allocation existant et reste idempotent ; le surplus reste non
  alloué.

## Compte de collecte (locatif)

Spec 049, §2.7. Aucun nouveau modèle : le compte de collecte est le compte de trésorerie **5525**
« PaySecureHub » créé par `ensureCollectionAccountTx` (`lib/payment-gateway/config.ts`).

- `GET …/rental/online-payments/collection-account` (`RENTAL_PAYMENTS_VIEW`) : solde **comptable** (solde du
  5525, 0 s'il n'existe pas ; la route ne le crée pas) et solde **fournisseur** (`GET /data-ws/solde` avec les
  identifiants de l'agence). Si le solde fournisseur est indisponible : `balance: null` et
  `unavailableReason` parmi `NOT_CONFIGURED`, `SIMULATOR`, `NO_CREDENTIALS`, `UNREACHABLE`. La route répond
  toujours 200 : une panne fournisseur n'est jamais un 500.
- **Reversement** : `POST …/rental/online-payments/collection-account/payouts` (`RENTAL_PAYMENTS_ALLOCATE`)
  crée un **virement de trésorerie existant** du 5525 vers un compte de trésorerie de l'agence, numéroté
  `VIR-AAAA-NNNN`. C'est un **enregistrement comptable seulement** : aucun virement réel n'est déclenché chez
  PaySecureHub ; le gestionnaire le fait de son côté. Le montant doit être inférieur ou égal au solde du
  5525, contrôlé avant l'appel (`RENTAL_COLLECTION_PAYOUT_INVALID`, 400). L'historique
  (`…/collection-account/payouts`) liste les virements issus du 5525, hors annulés.

## Disponibilité durcie (locatif)

Spec 049, §2.8 et §2.9.

- **Règle unique** `resolveRentalOnlineAvailability(tenantId)`, partagée par le gestionnaire, le portail, le
  lien public, les relances et la création de lien : `usable` = configuration active ET (mode ≠ `SIMULATOR`
  OU simulateur autorisé sur le serveur) ET droit `RENTAL` de l'agence. Motifs : `NOT_CONFIGURED`,
  `INACTIVE`, `SIMULATOR_FORBIDDEN`, `SUBSCRIPTION`. **Pas de repli** : si `usable` est faux, le démarrage
  d'un paiement ou la création d'un lien est refusé (400 `RENTAL_ONLINE_PAYMENT_UNAVAILABLE`).
- **Portail locataire** : limiteurs 60 par minute et par IP sur `availability`, 10 par minute et par
  utilisateur sur le démarrage, 60 par minute et par utilisateur sur la lecture ; garde `RENTAL` (403
  `RENTAL_FEATURE_DENIED`), sauf `availability` qui répond `available: false`.
- **Lien public d'échéance** : à l'ouverture et au démarrage, le serveur recontrôle que le bail n'est pas
  terminé. Le lien n'est **pas révoqué en base** : aucun effet de bord à l'ouverture.
- **Limite connue : changement de locataire non contrôlé.** Le lien public ne mémorise pas le locataire pour
  lequel il a été émis (colonne manquante sur `SecureLink`) : si le locataire du bail change après l'envoi,
  rien ne le détecte. Le code d'erreur `RENTAL_ONLINE_PAYMENT_LEASE_TENANT_CHANGED` est déclaré mais jamais
  levé. Correctif : ajouter la colonne (migration) puis refuser le lien dont le locataire n'est plus celui
  du bail.
- **Configuration marchande** : changer le mode, le `merchantId` ou la clé alors qu'une tentative est
  `PENDING` est refusé (409 `GATEWAY_CHECKOUTS_PENDING`).
- **Relances** : une relance d'échéance n'inclut un lien de paiement que si `usable` est vrai ; sinon elle
  part sans lien. Les relances sont manuelles ou par lot, jamais planifiées.

## Points ouverts à poser à BMI

1. Liste exhaustive des valeurs de `payments.state` (vus : `PENDDING`,
   `CANCEL` ; supposés : `SUCCESSFUL`, `FAILED`) et du champ `code` de l'IPN.
2. Environnement de test (URL et identifiants de bac à sable).
3. Signature ou adresses IP sources de l'IPN, pour filtrer en amont.
4. `montant` du statut : montant demandé ou montant frais compris ? (l'exemple
   de statut montre 5 USD et 5 de frais).
5. Reversement du compte de collecte vers la banque de l'agence : délai,
   frais, relevé téléchargeable pour le rapprochement.
6. Pays couverts : la documentation ne montre que la Côte d'Ivoire et le
   Sénégal (XOF). Guinée (GNF) ?
7. Durée de validité d'un lien `build-away` non utilisé.
