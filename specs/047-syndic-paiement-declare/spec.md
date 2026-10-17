# Spécification 047 — Paiement mobile money déclaré par le copropriétaire

**Branche** : `docs/spec-syndic-paiement-declare` (spécification seule ; réalisation dans une branche à venir)
**Créée** : 2026-10-17
**Statut** : spécification, avant réalisation — D7 à D10 tranchées le 2026-10-17, dix questions encore ouvertes au §11
**Portée** : le copropriétaire paie ses charges **hors d'ImmoTopia**, par un transfert mobile money vers un
numéro que le syndic lui communique (Orange Money, MTN MoMo, Moov Money, Wave). Il vient ensuite **déclarer**
ce paiement sur le portail. Une capture du SMS de confirmation est facultative ; si elle est jointe, une IA
peut **pré-remplir** le formulaire. Le gestionnaire **valide** ou **rejette** chaque déclaration. Seule la
validation crée un encaissement.

Références : spec [042](../042-syndic-paiement-mobile/spec.md) (paiement en ligne PaySecureHub, dont celle-ci
reprend l'onglet, les garanties d'encaissement et le traitement des cas en revue) · [plan 021](../021-syndic-besoins-prospect/plan.md)
(règle P2 d'affectation et d'avance, quittances P5) · spec [041](../041-inventaire-whatsapp/) (fournisseurs de
vision IA) · SECURITY.md (fichiers privés, isolation par agence).

## 1. Contexte et intention

Aujourd'hui, la plupart des syndics ivoiriens encaissent les charges **sur un numéro mobile money** de la
copropriété ou du cabinet. Ils rapprochent ensuite à la main les SMS reçus et les captures envoyées par
WhatsApp. Le paiement en ligne (spec 042) supprime ce rapprochement, mais il exige un compte marchand
PaySecureHub par copropriété et des frais d'opérateur. Beaucoup de syndics ne l'activeront pas tout de suite.

Le paiement déclaré **range l'habitude existante** :

- le syndic peut l'activer dès le premier jour, sans contrat ni clé API ;
- toutes les preuves arrivent au même endroit, chacune rattachée à un lot et à des appels précis ;
- le copropriétaire suit sa déclaration (en attente, validée, rejetée) et reçoit sa quittance.

Les deux modes coexistent : une copropriété peut proposer le paiement en ligne, le paiement déclaré, les deux,
ou aucun. Le paiement déclaré est le mode **par défaut** recommandé à l'activation du module Syndic (Q1).

### Existant réutilisé (vérifié dans le code le 2026-10-17)

| Brique                                                                        | Emploi ici                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordLotPaymentTx` (`lib/syndics/charge-allocation.ts`)                     | Validation : affectation aux appels désignés, avance du reliquat (P2), crédit du compte du lot, imputation des avances. `idempotencyKey` et `origin` déjà acceptés. |
| `issueReceiptsForPaymentTx` (`lib/syndics/charge-receipts.ts`)                | Reçus et quittances émis dans la même transaction que l'encaissement.                                                                                               |
| `postChargePaymentEntryTx` (`lib/syndics/charge-collection-accounting.ts`)    | Écriture 450 / trésorerie. Le compte de trésorerie est **un paramètre explicite** (`treasuryAccountNumber`), aujourd'hui `521 \| 571 \| 5525`, à étendre (R22).     |
| `settleSyndicCheckoutTx` (`lib/syndics/online-payment/checkout-settle.ts`)    | Modèle de règlement : claim atomique, contrôle d'exercice (`assertFiscalYearOpenTx`), encaissement, documents, envoi **après** commit.                              |
| `RentalPaymentDeclaration` + `rental-payment-declaration-service.ts`          | Même besoin côté loyers (locataire → gestionnaire) : statuts `PENDING/APPROVED/REJECTED/CANCELED`, opérateur, numéro payeur, référence, preuve, note de revue.      |
| `lib/files/private-files.ts`, `lib/rental/proof-files.ts`                     | Stockage et lecture des preuves hors statique, 404 hors agence.                                                                                                     |
| `MobileMoneyOperator` (`ORANGE`, `MTN`, `MOOV`, `WAVE`, `OTHER`)              | Opérateur d'un numéro de réception et du payeur.                                                                                                                    |
| `lib/stock-whatsapp/vision/*` (Gemini, OpenRouter, faux fournisseur, coupure) | Transport et garde-fous du pré-remplissage IA (§5.5). Types propres au stock : un lecteur dédié est à écrire.                                                       |
| Onglet « Paiements en ligne » de la copropriété (spec 042)                    | Accueille la configuration des numéros et la file de validation.                                                                                                    |

**Ce qui n'existe pas** : aucun numéro de réception par copropriété (`TreasuryAccount` est au niveau de
l'**agence**, pas de la copropriété) ; aucune déclaration côté Syndic ; aucun envoi de fichier sur le portail
copropriétaire (toutes ses routes sont en lecture, sauf le démarrage d'un paiement en ligne) ; aucune
annulation d'un `ChargePayment` exposée (seule l'écriture d'extourne existe).

## 2. Décisions retenues dans cette spec

D1 à D6 : choix de rédaction ; D7 à D10 : tranchées par Baba le 2026-10-17. Le reste est au §11.

| #   | Décision                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Rien n'est crédité avant validation.** Une déclaration ne modifie ni le reste dû, ni le compte du lot, ni la comptabilité, ni les relances. Elle ne produit qu'un indicateur « paiement déclaré en attente » (R14).       |
| D2  | **Numéros de réception par copropriété**, comme les comptes marchands de la spec 042. Aucun repli sur un numéro du cabinet.                                                                                                 |
| D3  | **Référence de transaction obligatoire.** C'est elle qui permet de retrouver le paiement sur le relevé de l'opérateur et de bloquer une double déclaration.                                                                 |
| D4  | **Montant libre** (contrairement à la spec 042) : le copropriétaire déclare ce qu'il a réellement envoyé. Un montant inférieur se pose en paiement partiel, un montant supérieur devient une avance, par la règle P2.       |
| D5  | **La validation passe par le même moteur que la saisie manuelle** (`recordLotPaymentTx` + reçus/quittances) : une seule logique d'affectation dans l'application.                                                           |
| D6  | **L'IA ne fait que pré-remplir.** Le copropriétaire relit et valide chaque champ ; le gestionnaire voit si un champ vient de l'IA et s'il a été retouché. L'IA ne valide jamais, ne rejette jamais, ne crédite jamais rien. |
| D7  | **Relances suspendues N jours au plus** (décision Baba du 2026-10-17, ex-Q3) : un appel visé par une déclaration `PENDING` n'est pas relancé automatiquement pendant N jours, puis la relance reprend (R14).                |
| D8  | **`SYNDIC_EDIT` suffit pour valider ou rejeter** (décision du 2026-10-17, ex-Q5) ; une permission dédiée viendra si un client la demande.                                                                                   |
| D9  | **Lecture IA incluse et plafonnée** (décision du 2026-10-17, ex-Q7) : coupée par défaut, activable par agence, environ 300 lectures par mois incluses dans le pack Syndic (R25, R29).                                       |
| D10 | **Un même numéro peut servir à plusieurs copropriétés** de l'agence, avec avertissement (décision du 2026-10-17, ex-Q2) ; le rapprochement repose sur la référence (R2, R24).                                               |

## 3. Acteurs

| Acteur                     | Accès                                                  | Ce qu'il fait                                                                                |
| -------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Copropriétaire**         | Session portail `/copropriete`, périmètre = ses lots   | Voit les numéros, déclare, joint une capture, suit, annule tant que la déclaration attend    |
| **Gestionnaire du syndic** | `SYNDIC_VIEW` / `SYNDIC_EDIT` (D8)                     | Configure les numéros, valide, ajuste le montant, rejette, déclare à la place d'un tiers     |
| **Système**                | Tâche planifiée                                        | Alerte sur les déclarations en attente depuis plus de N jours, purge des captures orphelines |
| **Fournisseur de vision**  | Appel serveur à serveur, sur décision de l'agence (D9) | Lit la capture et propose des valeurs                                                        |

## 4. Parcours

### P1 — Le gestionnaire configure les numéros de réception

1. Onglet « Paiements en ligne » de la copropriété, nouveau bloc **« Paiement par transfert mobile money »**,
   sous le compte PaySecureHub.
2. Il ajoute un ou plusieurs numéros : opérateur, numéro (format ivoirien vérifié, 10 chiffres après
   l'indicatif +225), nom du titulaire tel qu'il s'affiche chez l'opérateur, libellé facultatif (« Numéro
   charges courantes »), compte de trésorerie associé (R22), actif ou inactif.
3. Un interrupteur **« Accepter les paiements déclarés »** au niveau de la copropriété. Tant qu'il est coupé
   ou qu'aucun numéro n'est actif, le portail n'affiche rien.
4. Réglages de la copropriété : délai d'alerte N (3 jours ouvrés par défaut, Q4), capture obligatoire ou non
   (facultative par défaut), consigne libre affichée au copropriétaire (« Indiquez le numéro de lot en motif »).

### P2 — Le copropriétaire paie, puis déclare

1. Sur « Mes appels », chaque copropriété qui accepte les déclarations affiche **« J'ai payé par mobile
   money »** et la liste des numéros actifs (opérateur, numéro, titulaire), avec un bouton pour copier le
   numéro et la consigne.
2. Il effectue le transfert depuis son téléphone, hors d'ImmoTopia.
3. Il ouvre le formulaire (R9) :
   - le **lot**, s'il en a plusieurs ;
   - les **appels visés** : cases à cocher sur les appels ouverts du lot, total du reste dû affiché ; aucune
     case cochée = « affecter aux plus anciens » (règle P2) ;
   - le **numéro de réception** choisi dans la liste ;
   - le **numéro payeur** (prérempli avec son numéro de profil, modifiable) ;
   - le **montant envoyé** ;
   - la **date et l'heure** du transfert ;
   - la **référence de transaction** figurant dans le SMS de l'opérateur ;
   - une **capture** du SMS ou de l'écran de confirmation (facultative) ;
   - un commentaire libre (facultatif).
4. S'il joint d'abord la capture et que le pré-remplissage est activé, les champs reconnus se remplissent
   avec la mention « Lu automatiquement, vérifiez » (§5.5). Il corrige au besoin, puis envoie.
5. Confirmation : « Déclaration envoyée au syndic. Elle sera vérifiée avant d'être portée à votre compte. »
   Les appels visés affichent « Paiement déclaré, en vérification » ; leur reste dû **ne change pas**.
6. Liste « Mes déclarations » : statut, montant, date, motif du rejet le cas échéant. Annulation possible tant
   que la déclaration est `PENDING`.

### P3 — Le gestionnaire valide

1. **File « Paiements déclarés »** dans l'onglet « Paiements en ligne », à côté de la liste PaySecureHub.
   Pastilles : en attente, en retard (> N jours), doublon suspecté. Filtres : statut, numéro de réception,
   lot, période. Les déclarations en retard et les doublons suspectés passent en tête.
2. Le détail d'une déclaration affiche le lot, le déclarant, les appels visés et leur reste dû **actuel**, le
   numéro de réception, le numéro payeur, le montant, la date et l'heure, la référence, la capture (aperçu,
   servie par une route privée), les champs lus par l'IA avec un témoin « retouché par le déclarant », et les
   alertes (R17).
3. Il compare avec le relevé de son téléphone ou de son compte opérateur, puis choisit :
   - **Valider** : l'encaissement est créé pour le montant déclaré, à la date déclarée ;
   - **Valider avec correction** : montant reçu, date ou appels visés différents ; note obligatoire,
     montrée au copropriétaire ;
   - **Rejeter** : motif obligatoire choisi dans une liste (« Paiement introuvable », « Montant ne
     correspondant pas », « Référence déjà utilisée », « Numéro de réception erroné », « Autre ») et complété
     d'un texte libre, montré au copropriétaire.
4. Après validation, le copropriétaire reçoit sa quittance (ou son reçu de paiement partiel) par le canal
   habituel, et l'appel passe payé ou partiellement payé.

### P4 — Le gestionnaire déclare pour un tiers

Un copropriétaire âgé qui fait payer un enfant, ou un paiement reçu sans déclaration : le gestionnaire crée
la déclaration lui-même depuis la fiche du lot (mêmes champs), puis la valide. Ce parcours remplace la saisie
manuelle quand la preuve est un transfert mobile money, et conserve la référence et la capture au même
endroit.

## 5. Exigences

### 5.1 Numéros de réception

- **R1** — Nouveau modèle `SyndicReceivingNumber` : `tenantId`, `syndicateId`, `operator`
  (`MobileMoneyOperator`), `phoneNumber` (normalisé E.164), `holderName`, `label?`,
  `treasuryAccountNumber` (R22), `isActive`, `sortOrder`, dates. Unicité `(syndicateId, operator,
phoneNumber)`.
- **R2** — Le même numéro peut servir à plusieurs copropriétés de la même agence (un cabinet qui encaisse
  sur un seul numéro). L'écran le signale : « Ce numéro reçoit aussi les paiements de N autres copropriétés :
  le rapprochement se fera sur la référence. » (D10).
- **R3** — Un numéro qui porte des déclarations ne se supprime pas : il se désactive. Les déclarations
  existantes restent lisibles et validables.
- **R4** — Réglages de la copropriété, sur `SyndicPaymentGatewayConfig` ou dans un modèle voisin
  `SyndicDeclaredPaymentSettings` (choix technique laissé au plan) : `declaredPaymentsEnabled`,
  `reviewAlertDays` (défaut 3 jours ouvrés), `proofRequired` (défaut faux), `payerInstructions` (texte, 500
  caractères), `aiPrefillEnabled` (défaut faux, D9).
- **R5** — Lecture : `SYNDIC_VIEW`. Écriture : `SYNDIC_EDIT`. Pas de secret, donc pas de
  `TENANT_SETTINGS_EDIT` (différence assumée avec la clé API de la spec 042).

### 5.2 Déclaration

- **R6** — Nouveau modèle `SyndicPaymentDeclaration` : `tenantId`, `syndicateId`, `lotId`,
  `receivingNumberId`, `declaredByContactId?` (copropriétaire) ou `declaredByUserId?` (gestionnaire, P4),
  `payerPhone`, `amount` (montant déclaré), `paidAt` (date et heure), `transactionReference`,
  `chargeCallIds` (appels visés, peut être vide), `comment?`, `proofFileUrl?`, `aiPrefill?` (JSON, R27),
  `status`, `reviewedByUserId?`, `reviewedAt?`, `reviewDecision?`, `acceptedAmount?`, `rejectionReason?`,
  `reviewNote?`, `chargePaymentId?` (unique), dates.
- **R7** — Statuts : `PENDING` → `APPROVED` | `REJECTED` | `CANCELED` (annulée par le déclarant). Une
  déclaration n'est jamais supprimée.
- **R8** — Le serveur contrôle : lot dans le périmètre du copropriétaire (`resolveCoOwnerScope`), appels
  visés ouverts et appartenant au lot (404 sinon, comme un appel inexistant), numéro de réception actif et
  appartenant à la même copropriété, copropriété qui accepte les déclarations, montant > 0 et ≤ un plafond
  (Q6), date pas plus tard que maintenant + 10 minutes et pas plus tôt que 90 jours, référence de 4 à 40
  caractères alphanumériques (tirets et points tolérés), normalisée en majuscules sans espaces.
- **R9** — Corps Zod `.strict()`, multipart limité à la capture : JPEG, PNG, WebP ou PDF, 5 Mo au plus, type
  vérifié sur le contenu et pas seulement sur l'extension, EXIF retiré, stockée sous
  `uploads/syndic/payment-proofs/<agence>/<copropriété>/` et jamais servie en statique.
- **R10** — **Doublon** : une référence déjà présente sur une déclaration `PENDING` ou `APPROVED` du même
  numéro de réception est **refusée** au déclarant (409 « Cette référence de transaction a déjà été
  déclarée. »). Les doublons probables (même numéro de réception, même montant, même numéro payeur, à moins de
  10 minutes d'écart, références différentes) sont acceptés mais signalés au gestionnaire (R17).
- **R11** — Limites : 10 déclarations `PENDING` au plus par lot ; limiteur 10 par minute et par compte sur la
  création ; limiteur dédié sur la lecture IA (R26).
- **R12** — Annulation par le déclarant : seulement `PENDING`, sans motif obligatoire, journalisée.
- **R13** — Un appel visé soldé entre la déclaration et la validation ne bloque pas : la validation affecte
  aux appels encore ouverts et met l'excédent en avance (P2, comme la spec 042, R16).

### 5.3 Effets d'une déclaration en attente

- **R14** — Une déclaration `PENDING` ne change **rien** au reste dû, au compte du lot, aux fonds, à la
  comptabilité ni à l'état de l'appel. Elle produit seulement :
  - sur le portail : « Paiement déclaré, en vérification » sur les appels visés ;
  - côté gestionnaire : une pastille sur l'appel et le lot ;
  - pour les **relances automatiques** : l'appel visé par une déclaration `PENDING` de moins de N jours
    n'est pas relancé ; la relance reprend normalement au-delà (D7). Les relances manuelles restent
    possibles et affichent l'existence de la déclaration.
- **R15** — Une déclaration `PENDING` bloque le paiement en ligne des **mêmes appels** (spec 042) pour
  éviter un double paiement : case grisée, « Paiement déclaré en vérification ». Le copropriétaire peut
  annuler sa déclaration pour payer en ligne.

### 5.4 Validation par le gestionnaire

- **R16** — Une seule transaction, sur le modèle de `settleSyndicCheckoutTx` : claim atomique
  `PENDING` → `APPROVED` (deux validations concurrentes : une seule gagne, l'autre reçoit 409),
  `assertFiscalYearOpenTx` sur la date retenue, `recordLotPaymentTx` (méthode `MOBILE_MONEY`, référence =
  référence de transaction, `idempotencyKey` = `DECL-<id de la déclaration>`, origine `DECLARED`, appels
  visés), écriture 450 / compte de trésorerie du numéro de réception, `issueReceiptsForPaymentTx`, liaison
  `chargePaymentId`. Notifications et envoi des documents **après** le commit.
- **R17** — Alertes affichées avant décision, sans bloquer : référence déjà portée par un `ChargePayment`
  (saisie manuelle antérieure) de la même copropriété ; doublon probable (R10) ; montant supérieur au reste
  dû des appels visés (« L'excédent de X FCFA deviendra une avance ») ; montant inférieur (« Paiement
  partiel ») ; déclarant qui n'est plus copropriétaire du lot ; champ lu par l'IA puis modifié par le
  déclarant (R27) ; date dans un exercice clos.
- **R18** — **Valider avec correction** : le gestionnaire peut changer le montant retenu, la date ou les
  appels visés ; une note est obligatoire. Le montant déclaré reste conservé à côté du montant retenu. Le
  copropriétaire voit les deux et la note.
- **R19** — **Exercice clos** à la date déclarée : la validation demande une date dans un exercice ouvert
  (comme `ACCEPT` en spec 042, R20) ; la date déclarée reste conservée.
- **R20** — **Rejet** : statut `REJECTED`, motif de la liste + texte (10 caractères au moins), rien
  d'enregistré. Une déclaration rejetée ne se rouvre pas : le copropriétaire en dépose une nouvelle (la
  référence redevient libre, R10 ne bloquant que `PENDING` et `APPROVED`).
- **R21** — **Revenir sur une validation** : hors périmètre (pas d'annulation de `ChargePayment` exposée
  aujourd'hui, Q8). Le gestionnaire régularise par les moyens existants.

### 5.5 Comptabilité

- **R22** — Chaque numéro de réception est rattaché à un compte de trésorerie du **plan comptable de la
  copropriété**. Proposition (à confirmer par le comptable, Q9) : sous-comptes de **552 « Monnaie
  électronique — téléphone portable »** (SYSCOHADA révisé), un par numéro, créés à la demande (`55211`,
  `55212`…), libellé « Orange Money 07 xx xx xx 12 ». `5525` reste réservé à PaySecureHub (spec 042). Le
  type `CollectionTreasuryAccount` est élargi en conséquence, et le compte est toujours passé
  **explicitement**, jamais déduit du texte libre `method`.
- **R23** — Le **reversement** du numéro mobile money vers la banque de la copropriété (débit 521 / crédit
  552x) se saisit comme celui de la spec 042 (R24), en choisissant le numéro concerné. Solde comptable de
  chaque numéro affiché dans le bloc de configuration.
- **R24** — Un numéro partagé entre plusieurs copropriétés (R2) porte un sous-compte **dans chaque**
  copropriété : chaque plan comptable ne voit que ses propres encaissements.

### 5.6 Pré-remplissage par IA de la capture

- **R25** — Fonction facultative, activée par l'agence (`aiPrefillEnabled`) et disponible seulement si un
  fournisseur de vision est configuré sur le serveur (D9). Sinon, la capture est simplement jointe, sans
  lecture.
- **R26** — Déroulé : la capture est envoyée **avant** la déclaration (`POST
/paiements-declares/lecture`), stockée en zone temporaire privée (24 h), puis lue par un lecteur dédié
  `lib/syndics/declared-payment/vision/` qui réutilise le transport et les garde-fous des fournisseurs de la
  spec 041 (Gemini, OpenRouter, faux fournisseur en développement et en test, coupure par défaut, délai
  borné). Le résultat est validé par un schéma Zod strict : `operator?`, `amount?` (entier FCFA),
  `paidAt?`, `transactionReference?`, `payerPhone?`, `recipientPhone?`, `recipientName?`, `confidence` par
  champ, `quality` (`OK`, `UNREADABLE`, `NOT_A_PAYMENT`). Tout champ invalide est abandonné, jamais deviné.
- **R27** — Les valeurs lues sont **proposées**, jamais imposées : le formulaire les affiche comme
  pré-remplies, le copropriétaire valide. Le serveur conserve dans `aiPrefill` la proposition brute, le
  fournisseur, le modèle et la confiance. Le gestionnaire voit pour chaque champ s'il a été lu par l'IA, et
  surtout s'il a été **modifié** après lecture (alerte R17).
- **R28** — Contrôles croisés faits par le serveur, pas par l'IA : le numéro destinataire lu doit
  correspondre à l'un des numéros actifs de la copropriété (sinon alerte « La capture montre un autre numéro
  de réception ») ; la référence lue passe par le même contrôle de doublon (R10).
- **R29** — Coût et abus : limiteur 5 lectures par minute et 30 par jour par compte copropriétaire ;
  plafond mensuel de lectures par agence (D9) ; le prompt ne contient aucune donnée personnelle autre que
  l'image ; aucune image n'est conservée par ImmoTopia au-delà de la déclaration ou de 24 h si elle est
  abandonnée ; le fournisseur est appelé sans conservation lorsque son API le permet.
- **R30** — Panne ou délai dépassé du fournisseur : le formulaire reste utilisable à la main, message « La
  lecture automatique n'a pas abouti, remplissez les champs. » La lecture ne fait jamais échouer une
  déclaration.

### 5.7 Notifications

- **R31** — Copropriétaire : accusé de réception à l'envoi (portail, et e-mail si l'adresse est connue) ;
  validation (quittance ou reçu en pièce jointe, comme un paiement saisi) ; validation avec correction (note) ;
  rejet (motif et note). Canaux : ceux déjà utilisés pour les quittances (e-mail, WhatsApp si activé).
- **R32** — Gestionnaire : compteur dans l'onglet et sur le tableau de bord du syndic ; une notification
  interne à chaque nouvelle déclaration (regroupée par copropriété toutes les heures, Q4) ; une alerte
  quotidienne pour les déclarations en attente depuis plus de N jours.

### 5.8 Routes, écrans, audit

- **R33** — Portail (`/api/coowner-portal`) : `GET /paiements-declares/disponibilite?syndicId=` (numéros
  actifs, consigne, réglages publics) ; `POST /paiements-declares/lecture` (capture → proposition) ;
  `POST /paiements-declares` ; `GET /paiements-declares` ; `POST /paiements-declares/:id/annulation` ;
  champ additif `pendingDeclaration` par appel dans `GET /appels`.
- **R34** — Gestionnaire (`/api/tenants/:tenantId/syndics/:syndicId`) : CRUD
  `/numeros-reception` ; `GET/PUT /paiements-declares/reglages` ; `GET /paiements-declares` (filtres,
  pagination) ; `GET /paiements-declares/:id` ; `GET /paiements-declares/:id/preuve` (fichier privé) ;
  `POST /paiements-declares/:id/validation` ; `POST /paiements-declares/:id/rejet` ; `POST
/lots/:lotId/paiements-declares` (P4). Contrats détaillés à écrire dans `contracts.md` au moment du plan.
- **R35** — Enveloppe `{ success, data }`, erreurs typées, contrôleurs en `asyncHandler`, routes inscrites
  dans `routes-inventory.test.ts`, nouveaux modèles dans `schema-tenant-coverage.test.ts` (tous portent
  `tenantId`).
- **R36** — Écrans : bloc de configuration et file de validation dans l'onglet « Paiements en ligne » (dont
  le titre devient « Paiements » si l'onglet porte les deux modes, Q10) ; bouton, formulaire et liste « Mes
  déclarations » sur le portail ; pastilles sur l'appel et le lot côté gestionnaire. Tout libellé via `t()`
  (fr/en/ar), marges logiques, formulaire utilisable sur téléphone (le copropriétaire déclare depuis le
  téléphone qui vient de payer).
- **R37** — Journal d'audit : numéro ajouté, modifié, désactivé ; réglages modifiés ; déclaration créée,
  lue par l'IA (sans l'image ni les valeurs), annulée, validée (avec ou sans correction), rejetée. Aucune
  image ni capture dans une charge utile d'audit.
- **R38** — Wiki des fonctionnalités et `npm run wiki:export` dans la PR de réalisation.

## 6. États d'une déclaration

```text
            ┌── annulation par le déclarant ──> CANCELED
 PENDING ───┼── validation (avec ou sans correction) ──> APPROVED  (ChargePayment + quittance, une transaction)
            └── rejet (motif obligatoire) ──> REJECTED  (rien d'enregistré ; nouvelle déclaration possible)

 PENDING depuis plus de N jours : même statut, marqué « en retard » (alerte, tri en tête de file)
```

## 7. Sécurité

| #   | Menace                                                     | Mesure                                                                                                                                                                     |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Fausse déclaration (paiement jamais effectué)              | Rien n'est crédité avant validation humaine (D1, R14) ; la validation se fait contre le relevé de l'opérateur ; la référence est obligatoire (D3).                         |
| S2  | Même transfert déclaré deux fois (deux lots, deux comptes) | Référence unique par numéro de réception parmi `PENDING`/`APPROVED` (R10) ; alerte si la référence existe sur un `ChargePayment` (R17) ; `idempotencyKey` par déclaration. |
| S3  | Capture retouchée                                          | L'IA ne valide rien (D6) ; la preuve qui fait foi est le relevé de l'opérateur ; alerte si un champ lu a été modifié (R27).                                                |
| S4  | Accès au lot ou aux appels d'autrui                        | Périmètre `resolveCoOwnerScope`, appels chargés par leur copropriété (`ChargeCall` n'a pas de `tenantId`), 404 uniforme.                                                   |
| S5  | Fuite d'une capture (données bancaires et personnelles)    | Fichier privé hors statique, route avec permission et contrôle d'agence, EXIF retiré, zone temporaire purgée à 24 h, jamais dans l'audit.                                  |
| S6  | Fichier piégé                                              | Type vérifié sur le contenu, taille plafonnée, PDF non rendu côté serveur, aperçu en image dans une balise sans script.                                                    |
| S7  | Injection d'instructions via l'image (prompt injection)    | Sortie de l'IA contrainte par schéma Zod, champs typés et bornés, aucune action déclenchée par la sortie ; les valeurs ne vont que dans un formulaire relu par un humain.  |
| S8  | Abus de l'IA (coût)                                        | Limiteurs par compte, plafond par agence, fonction coupée par défaut (R29).                                                                                                |
| S9  | Gestionnaire d'une autre agence ou d'une autre copropriété | `requireTenantAccess` + `assertSyndicateOfTenant` ; numéro de réception et déclaration chargés par `tenantId` et `syndicateId` ; extension `prisma-tenant-guard`.          |
| S10 | Numéro de réception détourné (gestionnaire malveillant)    | Toute modification d'un numéro est auditée ; le numéro affiché au portail est celui du jour, la déclaration garde un instantané (opérateur, numéro, titulaire).            |
| S11 | Contournement de l'abonnement                              | Droit SYNDIC vérifié explicitement sur les routes du portail (comme spec 042, R9).                                                                                         |

## 8. Cas limites

1. **Paiement partiel** : montant inférieur au reste dû des appels visés → affecté aux plus anciens des
   appels visés ; reçu de paiement partiel ; l'appel reste ouvert pour le solde.
2. **Plusieurs appels en un transfert** : appels cochés, affectation dans l'ordre d'ancienneté (P2).
3. **Montant supérieur** : l'excédent devient une avance du lot, imputée d'elle-même aux appels suivants ;
   alerte au gestionnaire avant validation (R17).
4. **Aucun appel coché** : affectation aux plus anciens appels ouverts du lot, puis avance.
5. **Déclaration d'un tiers** (enfant, locataire) : le transfert vient d'un numéro inconnu ; c'est le
   copropriétaire qui déclare depuis son compte, ou le gestionnaire (P4). Pas de déclaration sans compte.
6. **Un transfert pour deux lots** du même copropriétaire : deux déclarations avec la même référence sont
   refusées (R10). Une seule déclaration sur un lot, puis répartition par le gestionnaire ? Q11.
7. **Lot revendu** après la déclaration : la validation reste possible (le paiement a eu lieu), l'alerte
   R17 le signale ; l'encaissement va au lot, la règle de l'ancien propriétaire s'applique comme pour une
   saisie manuelle.
8. **Paiement manuel concurrent** : le gestionnaire saisit le même paiement à la main avant de voir la
   déclaration → alerte de référence existante (R17) ; il rejette avec le motif « Référence déjà utilisée ».
9. **Paiement en ligne et déclaration sur le même appel** : bloqué dans les deux sens (R15 et spec 042).
10. **Numéro désactivé** pendant qu'une déclaration attend : la déclaration reste validable ; le numéro ne
    s'affiche plus au portail.
11. **Exercice clos** à la date déclarée : date d'exercice ouvert demandée à la validation (R19).
12. **Frais d'opérateur** : le copropriétaire déclare le montant **reçu** par le syndic (le SMS de
    l'opérateur l'indique). Le gestionnaire corrige si besoin (R18). Aucun frais comptabilisé.
13. **Capture illisible ou qui n'est pas un paiement** : `quality` ≠ `OK`, aucun champ prérempli, message
    au copropriétaire, capture conservée s'il continue.
14. **Devise** : FCFA seulement.

## 9. Hors périmètre

- Rapprochement **automatique** avec un relevé d'opérateur (import CSV Wave Business ou Orange Money, API
  opérateur) : étape suivante naturelle, une fois la file en service (Q12).
- Validation automatique, même partielle, sur la foi de l'IA.
- Annulation d'une déclaration validée ou d'un `ChargePayment` (Q8).
- Remboursement d'un trop-perçu au copropriétaire (l'excédent reste en avance).
- Paiement déclaré en **espèces, chèque ou virement bancaire** : la structure le permettrait (le modèle
  `RentalPaymentDeclaration` couvre ces méthodes) mais le besoin exprimé est le mobile money (Q13).
- Paiement déclaré des **loyers** : existe déjà (`RentalPaymentDeclaration`) ; l'harmoniser avec cette spec
  (numéros de réception, IA) est un chantier séparé.
- Déclaration depuis WhatsApp (envoi de la capture au numéro de l'agence) : possible plus tard avec le
  transport de la spec 041.

## 10. Critères d'acceptation observables

1. Une copropriété sans numéro actif ou avec l'interrupteur coupé n'affiche aucun bouton de déclaration sur
   le portail.
2. Un copropriétaire déclare 50 000 FCFA sur un appel de 50 000 : l'appel affiche « en vérification », son
   reste dû reste à 50 000, la comptabilité de la copropriété est inchangée.
3. Le gestionnaire valide : l'appel passe payé, une quittance est émise et envoyée, l'écriture 450 /
   sous-compte du numéro est passée, `ChargePayment.origin = DECLARED`.
4. Une seconde déclaration avec la même référence sur le même numéro est refusée (409).
5. Une déclaration de 60 000 sur cet appel, validée, laisse 10 000 en avance du lot.
6. Un rejet n'écrit rien et le copropriétaire voit le motif.
7. Deux validations simultanées : une seule réussit.
8. Avec l'IA activée et le faux fournisseur, une capture produit des champs préremplis marqués comme tels ;
   un champ modifié après lecture déclenche l'alerte côté gestionnaire.
9. Avec l'IA coupée ou en panne, la déclaration se fait entièrement à la main.
10. Une capture n'est jamais accessible par une URL statique, ni à un gestionnaire d'une autre agence (404).
11. `npm run test:isolation` passe avec les nouveaux modèles et routes.

## 11. Décisions produit ouvertes (pour Baba)

| #   | Question                                                                                                                                   | Proposition par défaut                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Q1  | Le paiement déclaré est-il activé par défaut sur toute nouvelle copropriété, ou le syndic l'active-t-il lui-même ?                         | Coupé par défaut, mis en avant à la création de la copropriété             |
| Q4  | Délai N avant alerte « en retard » et fréquence des notifications au gestionnaire ?                                                        | 3 jours ouvrés ; notification regroupée par heure ; alerte quotidienne     |
| Q6  | Plafond de montant par déclaration ?                                                                                                       | 5 000 000 FCFA (au-delà, l'opérateur bloque de toute façon les transferts) |
| Q8  | Ouvrir un chantier « annuler un paiement de charges » (validation par erreur) ?                                                            | Oui, chantier séparé ; utile aussi à la spec 042 (Q4 de 042)               |
| Q9  | Comptes 552x par numéro de réception : à faire valider par le comptable de référence.                                                      | Sous-comptes de 552, un par numéro                                         |
| Q10 | Renommer l'onglet « Paiements en ligne » en « Paiements » puisqu'il portera les deux modes ?                                               | Oui                                                                        |
| Q11 | Un transfert qui couvre deux lots du même copropriétaire : une déclaration répartie par lot, ou deux déclarations avec la même référence ? | Une déclaration avec répartition par lot (la référence reste unique)       |
| Q12 | Programmer l'import de relevé opérateur (Wave Business, Orange Money) pour la validation en masse juste après ?                            | Oui, après trois mois d'usage réel                                         |
| Q13 | Étendre la déclaration aux virements bancaires et aux dépôts d'espèces en agence ?                                                         | Non dans ce chantier                                                       |
| Q14 | Faut-il exiger la capture (`proofRequired`) par défaut ? Elle aide le gestionnaire mais freine le copropriétaire.                          | Facultative par défaut, réglable par copropriété                           |
