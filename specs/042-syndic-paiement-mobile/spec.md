# Spécification 042 — Paiement mobile money des charges de copropriété

**Branche** : `feat/syndic-paiement-mobile` (3 PR empilées, voir [plan.md](./plan.md))
**Créée** : 2026-10-15
**Statut** : spécification, avant réalisation
**Portée** : le copropriétaire règle ses appels de charges en mobile money (Wave, Orange Money, MTN,
Moov) ou par carte, via PaySecureHub, depuis le portail copropriétaire ou depuis un lien sécurisé reçu
sans connexion. Mode `SIMULATOR` en développement et en recette ; **le mode `LIVE` n'est ni activé ni
validé** (clés BMI absentes).

Références : [plan.md](./plan.md) · [tasks.md](./tasks.md) · [contracts.md](./contracts.md) (routes et
types, **à lire avant d'écrire du code**) · spec [039](../039-patrimoine-lien-paiement/spec.md) (même
mécanique côté loyers, dont celle-ci reprend les garanties) · spec [031](../031-patrimoine-canaux-liens-securises/spec.md)
(`lib/secure-links`) · [plan 021](../021-syndic-besoins-prospect/plan.md) (règle P2 d'affectation et d'avance,
quittances P5) · [paysecurehub.md](../../docs/integrations/paysecurehub.md) · SECURITY.md §6 « Webhooks de
paiement » et §12 bis « Liens publics à jeton ».

## 1. Contexte

Le plan 021 avait écarté le paiement en ligne des charges (« chantier séparé, plus tard », décision P4).
Les loyers, eux, se paient déjà en ligne (lot 7, portail locataire) et par lien (spec 039), mais sur le
compte marchand **de l'agence**. Pour les charges, l'argent appartient à la **copropriété** (un syndicat
n'est pas le cabinet qui le gère) : chaque copropriété a donc son propre compte marchand PaySecureHub, et
ses encaissements ne transitent jamais par le compte du cabinet.

Existant réutilisé, non modifié dans son comportement :

- `recordLotPaymentTx` (`lib/syndics/charge-allocation.ts`) : affectation aux appels, avance du reliquat
  (règle P2), crédit du compte du lot, fonds, écriture comptable ; puis reçus et quittances (lot S3) ;
- `lib/payment-gateway` : clients PaySecureHub (réel et simulateur), cœur `checkout-core.ts`, chiffrement
  des clés (`PAYMENT_SECRETS_KEY`) ;
- `lib/secure-links` : jeton à 256 bits, seul le SHA-256 stocké, fragment d'URL, refus uniforme ;
- `evaluateFeatureAccess` / `evaluateSchedulingGate` pour le droit SYNDIC.

## 2. Décisions (fixées le 2026-10-15, non négociables)

| #   | Décision                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Un compte marchand PaySecureHub par copropriété**. Aucun repli sur le compte du cabinet (`PaymentGatewayConfig`). Une copropriété sans configuration active et utilisable n'affiche ni bouton « Payer » ni lien.                                                              |
| D2  | **Appels entiers seulement**. Le copropriétaire coche un ou plusieurs appels ouverts ; le montant est le reste dû recalculé par le serveur ; aucun montant libre. Si un appel est soldé entre-temps, l'excédent devient une avance (règle P2).                                  |
| D3  | **Frais** : suivent `PaymentGatewayConfig.feesPaidBy` de l'agence, `CLIENT` si l'agence n'a pas de configuration. ImmoTopia ne calcule aucun frais : le paramétrage réel est chez PaySecureHub, la valeur ne sert qu'à l'annoncer au payeur et se retrouve dans `providerFees`. |
| D4  | **Lien « Payer cet appel » sans connexion** dans les avis d'appel et les relances (e-mail, WhatsApp), livré dans ce chantier.                                                                                                                                                   |

Choix techniques arrêtés par le Pilote : modèles `SyndicPaymentGatewayConfig` et `SyndicOnlineCheckout`
(code `IMS-` + 20 caractères) ; `ChargePayment` gagne `idempotencyKey` unique, `providerTransactionId`
unique et `origin` ; vérification du statut toujours serveur-à-serveur avec la clé **de la copropriété** ;
compte de trésorerie 5525 dans le plan comptable de la copropriété ; portail vérifié explicitement pour le
droit SYNDIC. Détail dans [plan.md](./plan.md).

## 3. Acteurs

| Acteur                       | Accès                                                                  | Ce qu'il fait                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Copropriétaire** (portail) | Session `/copropriete`, périmètre = ses lots                           | Coche des appels, paie, suit le statut                                                                                              |
| **Copropriétaire** (lien)    | Aucun compte ; jeton dans le fragment de l'URL                         | Ouvre « Payer cet appel », paie, voit le statut                                                                                     |
| **Gestionnaire du syndic**   | `SYNDIC_VIEW` / `SYNDIC_EDIT` ; `TENANT_SETTINGS_EDIT` pour la clé API | Configure le compte marchand, suit les paiements, vérifie, tranche un `REVIEW`, saisit un reversement, copie/envoie/révoque un lien |
| **PaySecureHub**             | IPN non signée ; statut redemandé avec la clé de la copropriété        | Encaisse, notifie                                                                                                                   |
| **Système**                  | Tâche planifiée                                                        | Rapproche les `PENDING`, expire après 48 h                                                                                          |

## 4. Parcours

### P1 — Le gestionnaire configure le compte de la copropriété

1. Sur la fiche de la copropriété, onglet « Paiement en ligne », il saisit identifiant marchand et clé API
   (écriture seule), choisit le mode, teste la connexion, active.
2. L'écran affiche l'état (clé enregistrée : « se termine par 1234 »), le résultat du dernier test, l'URL
   de notification à communiquer à PaySecureHub, la valeur de `feesPaidBy` de l'agence (information) et le
   solde du compte 5525.
3. Tant que la configuration n'est pas **utilisable** (active ; en `LIVE`, identifiant + clé), aucun
   copropriétaire ne voit « Payer » et aucun lien n'est créé.

### P2 — Le copropriétaire paie depuis le portail

1. Sur « Mes appels », chaque appel ouvert d'une copropriété payable porte une case à cocher ; un bandeau
   affiche le total des appels cochés et « Payer en ligne » (mention des frais si `CLIENT`, du mode
   simulateur si besoin).
2. Il clique : le serveur recalcule le reste dû, crée la tentative, et renvoie l'URL de la page hébergée ;
   le navigateur y est redirigé.
3. Au retour sur `/copropriete/appels?paiement=<code>`, l'écran interroge le serveur toutes les 3 s
   (environ 2 minutes) tant que le paiement est en cours, puis affiche payé (avec le numéro du reçu ou de la
   quittance), échoué, annulé ou « en cours de vérification par le syndic ».
4. Appel déjà couvert par un paiement en cours : case grisée, message « Paiement en cours ».

### P3 — Le copropriétaire paie depuis un lien

1. L'avis d'appel ou la relance (e-mail, WhatsApp) contient « Payer en ligne : <lien> ». Le lien est
   `/payer-charges#<jeton>` : le jeton est dans le fragment, puis dans le **corps** d'un POST.
2. La page affiche le nom de la copropriété, le lot, la période, l'échéance, le **reste dû actuel**, les
   moyens de paiement ; « Payer maintenant » redirige vers PaySecureHub.
3. Le retour est `/payer-charges/statut?paiement=<code>` : page de statut publique, mêmes règles que P2.
4. Lien invalide, expiré, révoqué, appel soldé, copropriété sans configuration, lot revendu : la **même** page
   « Lien invalide ou expiré ».

### P4 — Le gestionnaire suit, vérifie, tranche, reverse

1. **Liste** « Paiements en ligne » : filtres par statut, origine, lot, dates ; pastilles de comptage ;
   les `REVIEW` en premier plan.
2. **Vérifier** : interroge PaySecureHub avec la clé de la copropriété (cas d'IPN perdue).
3. **Trancher un `REVIEW`** : voir §6. L'écran affiche le motif, le montant demandé et reçu, le payeur, les
   appels visés ; décision `Accepter` ou `Refuser` avec une note obligatoire.
4. **Reversement** : quand PaySecureHub verse l'argent à la banque de la copropriété, le gestionnaire
   enregistre montant, date et référence ; l'écriture 5525 → 521 est passée. Rien n'est déclenché chez le
   fournisseur.
5. **Lien** (fiche d'un appel) : copier, envoyer, lister, révoquer.

## 5. Exigences

### Configuration par copropriété

- **R1** — `SyndicPaymentGatewayConfig` : une ligne par copropriété (`syndicateId` unique), `tenantId`,
  mode `SIMULATOR`/`LIVE`, `isActive`, `merchantId`, `apiKeyEncrypted` (AES-256-GCM, `PAYMENT_SECRETS_KEY`,
  comme l'agence), `apiKeyLast4`, résultat du dernier test. Sans ligne : valeurs par défaut renvoyées, rien
  d'écrit.
- **R2** — La clé n'est jamais renvoyée, journalisée, auditée ni préremplie : seule `apiKeyLast4` sort. La
  route de lecture ne renvoie que `apiKeyConfigured` et `apiKeyLast4`.
- **R3** — Une configuration est **utilisable** si elle est active et, en `LIVE`, a identifiant et clé. Le
  mode `SIMULATOR` est refusé là où `paymentGatewaySimulatorAvailable` est faux.
- **R4** — **Aucun repli** : si la configuration de la copropriété n'est pas utilisable, le paiement est
  indisponible, même si l'agence a un compte actif. Un test d'architecture interdit que le moteur Syndic
  importe `loadConfig` de l'agence.
- **R5** — Modifier le mode, l'identifiant marchand ou la clé pendant qu'un paiement de la copropriété est
  `PENDING` est refusé (409) : la vérification utiliserait un autre compte.
- **R6** — Écriture de la configuration et test de connexion : `SYNDIC_EDIT` **et** `TENANT_SETTINGS_EDIT`
  (la clé API est un secret de paiement, comme pour l'agence). Lecture : `SYNDIC_VIEW`.

### Paiement : démarrage

- **R7** — Seuls des appels **entiers** sont payables. Le montant = somme des restes dus (affectations
  incluses) recalculés par le serveur à chaque ouverture et chaque démarrage, arrondie à l'entier (FCFA). Il
  n'est ni dans l'URL, ni dans le lien, ni lu d'une requête.
- **R8** — De 1 à 24 appels, d'**un seul lot** et d'une seule copropriété, tous en devise `XOF`/`FCFA`.
  Un appel soldé, annulé ou hors périmètre est refusé (400/404).
- **R9** — Le droit SYNDIC de l'agence est vérifié **explicitement** (le portail est hors garde
  d'abonnement) : agence active et `evaluateFeatureAccess(…, 'SYNDIC', écriture)` selon le mode
  `off`/`warn`/`enforce`. Refus : 403 au portail ; 404 uniforme sur le lien.
- **R10** — Un verrou consultatif `(tenantId, lotId)` sérialise le démarrage. Un `PENDING` de moins de
  15 minutes couvrant un appel en commun est **repris** s'il est d'origine identique, aux mêmes appels, même
  montant, même mode et déjà muni de son URL ; sinon 409. Un `REVIEW` (sans limite d'âge) bloque (409).
- **R11** — L'appel à `build-away` se fait **hors transaction**, avec la clé de la copropriété. Échec ou URL
  refusée : la tentative passe `FAILED`, réponse 502, aucune URL stockée. L'URL fournisseur est validée
  (`https`, ou `http` local en simulateur ; ni identifiants ni espaces).
- **R12** — Code de paiement `IMS-` + 20 caractères aléatoires (imprévisible), unique, donné au payeur et au
  fournisseur. Le payeur est le copropriétaire **réel** : contact du lot dans le périmètre (portail), ou
  copropriétaire principal actuel du lot (lien).
- **R13** — Frais (D3) : `feesPaidBy` de l'agence (défaut `CLIENT`) est exposé aux écrans pour annoncer
  « des frais de l'opérateur peuvent s'ajouter » ; `providerFees` est conservé sur la tentative ; aucune
  somme n'est ajoutée ou retranchée par ImmoTopia.

### Paiement : confirmation

- **R14** — Le statut qui fait foi est **toujours** redemandé à PaySecureHub, serveur à serveur, avec la clé
  de la copropriété. L'IPN n'est pas signée : elle sert seulement à retrouver la tentative et à déclencher
  cette redemande. Un paramètre d'URL « payé » n'est jamais cru.
- **R15** — Sur succès, **une seule transaction** : claim atomique de la tentative (`PENDING` → `SUCCESS`),
  `recordLotPaymentTx` (méthode `MOBILE_MONEY`, référence = code de paiement, `idempotencyKey` = code,
  `providerTransactionId`, origine `ONLINE`), reçus et quittances, `chargePaymentId`. L'envoi des documents
  se fait **après** le commit. Un rejeu (IPN répétée, tâche planifiée, page de statut) ne crée rien de plus :
  claim déjà pris, `idempotencyKey` et `providerTransactionId` uniques.
- **R16** — Règle P2 : le paiement est affecté aux appels visés encore ouverts ; si l'un a été soldé entre-temps
  (paiement manuel concurrent), l'excédent devient une **avance** du lot, jamais un refus.
- **R17** — Échec, annulation fournisseur : `FAILED`/`CANCELED`, aucune écriture métier. Sans réponse après
  48 h : `EXPIRED` (après une dernière vérification).
- **R18** — Passent en `REVIEW`, **sans rien enregistrer** : montant payé ≠ montant demandé
  (`AMOUNT_MISMATCH`), exercice clos (`FISCAL_YEAR_CLOSED`), appel disparu ou étranger au lot
  (`CALLS_UNAVAILABLE`), transaction fournisseur déjà enregistrée (`DUPLICATE_TRANSACTION`). Un état contraire
  (échec/annulation) rapporté **après** un succès ne défait rien : la tentative passe `REVIEW`
  (`CONTRARY_STATE`), l'encaissement reste.
- **R19** — La vérification (bouton, IPN, tâche) n'enregistre **jamais** un encaissement pour une tentative
  en `REVIEW` : seule la décision du gestionnaire le fait.

### Décision du gestionnaire sur un `REVIEW`

- **R20** — `ACCEPT` enregistre l'encaissement du **montant reçu** (par la même fonction que R15, une seule
  transaction), sur une date `paidAt` au choix (utile pour sortir d'un exercice clos) ; `REJECT` n'enregistre
  rien et marque `FAILED` avec la note. Une note est obligatoire et auditée. Deux décisions concurrentes :
  une seule gagne (claim atomique sur `REVIEW`).
- **R21** — `CONTRARY_STATE` avec encaissement déjà enregistré : `ACCEPT` clôt le suivi ; `REJECT` est refusé (pas
  d'annulation d'encaissement dans ce chantier). `CONTRARY_STATE` sans encaissement (succès tardif après
  expiration, l'argent est parti) : `ACCEPT` encaisse comme R20, `REJECT` est permis (`FAILED`, sans
  remboursement). `DUPLICATE_TRANSACTION` : `REJECT` seulement.
- **R22** — Refuser ne rembourse pas : l'argent reste chez PaySecureHub. L'écran le dit ; le remboursement se
  fait hors ImmoTopia.

### Comptabilité

- **R23** — Un encaissement en ligne débite le compte de trésorerie **5525 « PaySecureHub (mobile money) »**
  du plan comptable SYNDICATE de la copropriété (créé à la demande, sans modifier l'existant) et crédite 450,
  ligne rattachée au lot, au lieu de 521/571. Le choix du compte est **explicite** (paramètre du moteur), pas
  déduit du texte libre `method`.
- **R24** — Le gestionnaire saisit un **reversement** (montant, date, référence, note) : écriture
  **débit 521 / crédit 5525**, dans le journal banque. Montant ≤ solde du 5525 ; référence unique par
  copropriété ; exercice ouvert. Aucun virement n'est déclenché ; l'automatisation est hors périmètre.
- **R25** — L'écran de configuration affiche le solde comptable du 5525 et, à part, le solde fournisseur
  (route dédiée), pour le rapprochement. Les frais retenus par le fournisseur ne sont pas comptabilisés ici.

### Lien sécurisé

- **R26** — Nouvelle portée `CHARGE_CALL_PAYMENT` de `lib/secure-links` ; `objectType = 'ChargeCall'`,
  `objectId` = identifiant de l'appel. **Un lien = un appel.** URL `${FRONTEND_URL}/payer-charges#<jeton>`.
  Hérite sans les modifier des garanties de la spec 031 (jeton 256 bits, hash seul stocké, durée, refus
  uniforme, limiteur, en-têtes, audit, révocation).
- **R27** — À **chaque** ouverture et démarrage : jeton valide, agence active et non suspendue, droit SYNDIC
  (R9), appel présent dans une copropriété de l'agence, reste dû > 0, configuration de la copropriété
  utilisable, et **le copropriétaire actuel du lot est propriétaire depuis avant l'appel** (sinon l'appel
  relève de l'ancien propriétaire). Tout échec : la même 404 « Lien invalide ou expiré. ».
- **R28** — Routes publiques `charge-call-payment`, `/start`, `/status` : jeton ou code dans le corps,
  limiteurs aux clés propres (30/10/90 par minute et par IP) posés avant toute vérification, en-têtes
  anti-cache/indexation sur toute réponse, parseur 1 Ko, aucun montant ni identifiant lu du corps. Le statut
  ne lit que les tentatives d'origine lien.
- **R29** — Les avis d'appel et les relances (e-mail, WhatsApp) contiennent `{{paymentBlock}}` /
  `{{paymentUrl}}` quand un lien est disponible ; sinon le message part inchangé. La création du lien ne
  fait jamais échouer l'envoi.
- **R30** — La relance cible le **copropriétaire réel** : même règle que l'avis d'appel
  (`resolveChargeCallRecipient` : `ownerContactId` puis `coownerId`, contrôle « copropriétaire actuel »), et
  non plus seulement `lot.owner`.
- **R31** — Le gestionnaire peut copier un lien (URL montrée une seule fois), l'envoyer (événement
  `CHARGE_CALL_PAYMENT_LINK_SENT`), le lister (sans jeton ni URL) et le révoquer.

### Routes et écrans

- **R32** — Contrats de [contracts.md](./contracts.md), sans écart. Enveloppe `{ success, data }`, erreurs
  typées, contrôleurs en `asyncHandler`, corps Zod `.strict()`.
- **R33** — Disponibilité côté portail : route `GET /paiements-en-ligne/disponibilite` par copropriété, plus
  deux champs additifs par appel dans `GET /appels` (`onlinePayable`, `onlineCheckout`).
- **R34** — Écrans : portail (cases à cocher, bandeau, retour), pages publiques `/payer-charges` et
  `/payer-charges/statut`, onglet gestionnaire « Paiement en ligne » (configuration, liste, vérifier,
  trancher, reversements), action « Lien de paiement » sur un appel. Tout libellé via `t()` (fr/en/ar), marges
  logiques.
- **R35** — Journal d'audit : configuration modifiée, paiement démarré, confirmé, mis en revue, tranché,
  reversement saisi, lien envoyé, révoqué, ouvert. Aucun jeton, URL de lien ni clé dans une charge utile.

## 6. États d'une tentative (`SyndicOnlineCheckout`)

```text
                    ┌──────────── FAILED / CANCELED (fournisseur) ───────────┐
 PENDING ───────────┼── SUCCESS (encaissement enregistré, une transaction) ──┼─> SUCCESS ──(état contraire)──> REVIEW[CONTRARY_STATE]
   │                └── REVIEW[AMOUNT_MISMATCH | FISCAL_YEAR_CLOSED |        │
   │                           CALLS_UNAVAILABLE | DUPLICATE_TRANSACTION]   │
   └─ 48 h sans réponse ─> EXPIRED                                          │
 REVIEW ── ACCEPT ─> SUCCESS (encaissement du montant reçu, sauf CONTRARY_STATE déjà encaissé / DUPLICATE_TRANSACTION)
        └─ REJECT ─> FAILED  (sauf CONTRARY_STATE déjà encaissé : refusé)
```

Vues publiques : `REVIEW` → `PENDING` (+ `underReview`), `EXPIRED` → `CANCELED`.

## 7. Sécurité

| #   | Menace                                                          | Mesure                                                                                                                                                                                  |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | IPN falsifiée                                                   | Jamais crue ; le statut est redemandé au fournisseur avec la clé de la copropriété (R14). Toujours 200, code inconnu tu.                                                                |
| S2  | Double encaissement (IPN rejouée, deux onglets, tâche)          | Claim atomique, `idempotencyKey` et `providerTransactionId` uniques, une transaction (R15).                                                                                             |
| S3  | Montant falsifié                                                | Aucun montant lu d'une requête ; recalcul serveur ; écart avec le fournisseur → `REVIEW` (R7, R18).                                                                                     |
| S4  | Fuite de la clé marchande                                       | Chiffrée au repos, écriture seule, jamais renvoyée ni journalisée ; permission `TENANT_SETTINGS_EDIT` ; audit sans valeur (R2, R6, R35).                                                |
| S5  | Argent d'une copropriété sur le compte d'une autre / du cabinet | Une configuration par copropriété, aucun repli (R4) ; la vérification utilise la clé de la copropriété de la tentative ; test d'architecture.                                           |
| S6  | Accès à un lot ou un appel d'autrui                             | Portail : périmètre `resolveCoOwnerScope`, appels via `ownedChargeCallsWhere`, 404 sinon. `ChargeCall` n'a pas de `tenantId` : toujours chargé par sa copropriété (`tenantId`) d'abord. |
| S7  | Lien deviné ou volé                                             | 256 bits, hash seul stocké, fragment puis corps, 404 uniforme, limiteurs, durée bornée, révocation, inopérant dès l'appel soldé ou le lot revendu (R26–R28).                            |
| S8  | Énumération de codes de paiement                                | Code `IMS-` + 20 aléatoires ; statut public limité aux tentatives d'origine lien ; 404 uniforme ; limiteur 90/min.                                                                      |
| S9  | Redirection ouverte                                             | URL fournisseur validée avant stockage et avant redirection, côté serveur et côté web (R11).                                                                                            |
| S10 | Contournement de l'abonnement                                   | Vérification explicite du droit SYNDIC sur le portail et le lien (R9).                                                                                                                  |
| S11 | Gestionnaire d'une autre agence / copropriété                   | `requireTenantAccess` + `assertSyndicateOfTenant` ; un `checkoutId` d'une autre copropriété répond 404.                                                                                 |
| S12 | Agence suspendue                                                | Aucun nouveau paiement ; mais l'IPN et la vérification continuent (l'argent est déjà versé), comme pour les loyers.                                                                     |
| S13 | Déni de service sur les routes publiques / fournisseur          | Limiteurs par IP, un seul appel fournisseur par fenêtre de 10 s pour la page de statut, parseur 1 Ko.                                                                                   |

## 8. Cas limites

1. **Paiement manuel concurrent** : le gestionnaire solde un appel pendant que le copropriétaire paie en
   ligne → l'encaissement en ligne se pose sur les appels encore ouverts, l'excédent devient avance (R16).
2. **Deux onglets / deux appareils** : verrou consultatif ; second « Payer » repris ou 409 (R10).
3. **Avance déjà présente sur le lot** : elle s'impute d'elle-même aux nouveaux appels ; le montant demandé
   est le reste dû des appels cochés (déjà net de l'avance imputée).
4. **Indivision** : le portail paie au nom du contact de la session ; le lien au nom du copropriétaire
   principal actuel. L'encaissement reste celui du **lot**.
5. **Lot revendu après l'envoi du lien** : lien inopérant (R27) ; l'ancien propriétaire ne paie pas pour le
   nouveau.
6. **Configuration désactivée ou clé changée pendant un paiement** : le changement de clé est refusé tant
   qu'un `PENDING` existe (R5) ; la désactivation n'empêche pas la réconciliation des tentatives en cours.
7. **Exercice clos** à la date du succès : `REVIEW`, l'argent est chez le fournisseur ; `ACCEPT` avec une
   date d'exercice ouvert (R20).
8. **IPN avant redirection / avant l'URL stockée** : la tentative existe déjà (créée avant `build-away`) ; le
   rapprochement fonctionne.
9. **Page de statut rechargée** : reprise grâce au code gardé en `sessionStorage`, effacé dès réponse terminale.
10. **Fournisseur injoignable** à la lecture du statut : l'état stocké est renvoyé ; la tâche reprendra.
11. **Devise** autre que XOF/FCFA : indisponible (R8).
12. **Appel à reste dû décimal** : montant arrondi à l'entier ; l'écart éventuel (< 1 FCFA) est absorbé par
    l'affectation (reste dû ou avance).
13. **Copropriété supprimée** : suppression en cascade de la configuration ; les tentatives suivent
    (`onDelete: Cascade` sur copropriété, `Restrict` sur configuration tant qu'une tentative existe).
14. **Avis envoyé pour un appel déjà couvert** : aucun message (comportement existant) donc aucun lien.

## 9. Hors périmètre

- **Montant libre** ou paiement partiel d'un appel (D2).
- **Compte marchand du cabinet** comme repli ou comme option (D1).
- **Automatisation du reversement** : pas d'appel à une API de virement, pas de rapprochement automatique
  avec le relevé fournisseur ; saisie manuelle seulement.
- **Mode `LIVE`** : codé et testable contre le client réel simulé, mais non validé faute de clés BMI ; non
  activé en production par ce chantier.
- **Annulation d'un encaissement en ligne**, remboursement du payeur, litiges.
- **Lien multi-appels** ou lien « tout le lot » (un lien = un appel).
- **QR code / lien dans le PDF** de l'avis d'appel (le lien est dans le texte du message).
- **Frais PaySecureHub** en comptabilité (charge 627) et leur refacturation.
- Paiement des charges par le **locataire** du lot, par un tiers sans lien avec le lot.
- Paiement d'autres sommes (pénalités isolées, fonds travaux hors appel).

## 10. Questions ouvertes

| #   | Question                                                                                                                                                                                                                             | Impact si non tranchée                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Q1  | `montant` du statut PaySecureHub : montant demandé ou frais compris (point 4 de `paysecurehub.md`) ? Si frais compris avec `CLIENT`, **chaque paiement passerait en `REVIEW`** (R18).                                                | Bloquant pour le `LIVE`, sans effet en simulateur    |
| Q2  | Le schéma amorcé dans l'arbre documente la portée du lien sur `SYNDICATE_LOT` (lot), cette spec retient `ChargeCall` (un appel). Confirmer « un lien = un appel ».                                                                   | Corriger le commentaire et l'objet du lien avant PR1 |
| Q3  | Durée des liens joints automatiquement aux messages : 30 jours (maximum) retenu ; une durée plus courte ?                                                                                                                            | Réglage                                              |
| Q4  | Refus d'un `REVIEW` `CONTRARY_STATE` : impossible faute d'annulation d'encaissement. Ouvrir un chantier d'annulation de `ChargePayment` ?                                                                                            | Le gestionnaire corrige à la main (régularisation)   |
| Q5  | Droits : la clé exige `TENANT_SETTINGS_EDIT` **en plus** de `SYNDIC_EDIT`. Un rôle « gestionnaire syndic » sans réglages agence ne peut donc pas configurer. Acceptable ?                                                            | Qui peut configurer                                  |
| Q6  | Plusieurs copropriétés sous le même compte marchand PaySecureHub (même clé) : autorisé techniquement, mais la vérification ne distingue alors pas les copropriétés côté fournisseur. Interdire (unicité du couple identifiant/clé) ? | Mélange d'argent côté fournisseur                    |
| Q7  | Moyens annoncés : liste fixe (Wave, Orange, MTN, Moov, carte) ; la carte dépend-elle du contrat BMI ?                                                                                                                                | Libellé de l'écran                                   |
| Q8  | Lien joint aussi aux relances automatiques planifiées (`reminder-delivery`) en plus des relances manuelles ?                                                                                                                         | Périmètre M6 (prévu : oui, par le même résolveur)    |
