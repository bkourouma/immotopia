# Plan d'implémentation 048 — Paiement instantané PI-SPI (BCEAO)

**Statut** : plan proposé le 2026-11-09. Décisions du fondateur le même jour : **D1 = agences
clientes directes** (modèle A), **D2 = un opérateur de monnaie électronique** comme participant
(lequel : à choisir). D3 à D5 restent ouvertes. Aucun code. Le numéro 048 est le premier libre
(047 est le dernier dossier ; ADR suivant : 009).
**Mise à jour du 2026-11-09 (soir)** : lot Q (comptes de réception : QR et alias fournis par l'établissement, aucun QR généré) ajouté en tête.
**Documents** : [spec.md](./spec.md) · [tasks.md](./tasks.md).
**Étude source** : [docs/integrations/PI-SPI-ETUDE.md](../../docs/integrations/PI-SPI-ETUDE.md)
(faits, niveaux de preuve, inconnues). Ce plan ne répète pas l'étude : il dit quoi construire,
où, dans quel ordre et à quelles conditions.

## Résumé

Ajouter à ImmoTopia un **rail de paiement instantané « push »** : le payeur reçoit une demande de
paiement (RTP) dans son application bancaire ou son portefeuille et l'approuve ; le paiement est
irrévocable à `IRREVOCABLE`. Le rail réutilise le moteur de rapprochement existant (claims
atomiques, `decideCheckoutTransition`, tâche planifiée) mais **pas** l'interface `GatewayClient`,
bâtie pour une page hébergée. Ordre, depuis la décision « agences clientes directes » : socle et
simulateur **avec configuration par agence dès le départ**, pilote sur les loyers d'**une** agence,
puis charges de copropriété, puis abonnements ImmoTopia (même code, compte plateforme), puis
reversements sortants, puis encaissements non sollicités et rapprochement.

## Deux phases (décision du 2026-11-09, après le lot QR)

- **Phase 1 — lot Q** : l'agence ajoute le **QR et l'alias fournis par son établissement** (PI-SPI, Wave,
  Orange Money, banque…) ; ImmoTopia les **présente** au locataire ou au copropriétaire, qui paie dans sa
  propre application en saisissant lui-même le montant. **ImmoTopia ne génère aucun QR.** Sans API
  Business, sans certificat, sans compte développeur. La preuve passe par la **déclaration** de paiement
  déjà présente, validée par le gestionnaire.
- **Phase 2 — lots P0 à P7** : rail de demande de paiement (RTP), webhooks, reversements, rapprochement
  automatique. Elle **automatise** ce que le lot Q rend déjà possible ; les comptes de réception du lot Q y
  restent utilisés comme repli (rien n'est jeté).

## Conséquences du modèle A et du participant « opérateur de monnaie électronique »

- **Chaque agence est cliente de son propre participant** : certificat mTLS, identifiants OAuth, clé
  API et secret de webhook propres, chiffrés en base. ImmoTopia agit comme intégrateur technique sous
  mandat de l'agence ; les fonds vont directement au compte de l'agence, jamais chez ImmoTopia.
- **Les participants peuvent différer d'une agence à l'autre** : hôtes, URL de jeton, limites de débit
  et délais ne sont donc jamais en dur ; ils vivent dans la configuration de chaque agence.
- **Onboarding à guider** : une fiche pas à pas (compte business, certificat, URL de webhook à
  déclarer, test de connexion) et une carte « Compte PI-SPI » dans les réglages de l'agence.
- **Opérateur de monnaie électronique** (D2) : la liste des 8 acteurs ivoiriens du lancement
  (septembre 2025) n'est **pas** la liste des API Business homologuées (publiée le 2026-09-16, noms non
  lus). Il faut vérifier l'homologation de l'opérateur visé. Le plafond d'un compte professionnel de
  monnaie électronique (solde, flux mensuels) est **inconnu** : il peut être plus bas que celui d'une
  banque et brider l'encaissement des loyers ; à demander avant le pilote.
- **Mandat et responsabilité** : le mandat donné par l'agence à ImmoTopia, la responsabilité en cas
  d'erreur et la conservation des certificats sont à cadrer juridiquement avant P2.

## Ce que le code actuel impose (constats vérifiés)

- `GatewayClient` (`lib/payment-gateway/types.ts`) : `buildAway` renvoie une URL de redirection,
  `getStatus(codePaiement)` fait foi. Inadapté au push.
- `PaymentGatewayProvider` n'a qu'une valeur, `PAYSECUREHUB` (`schema.prisma:2642`) ; le fournisseur
  est **écrit en dur** dans `startInvoiceCheckout` (`services/platform-payment-service.ts:573`) et
  l'aiguillage se fait par le préfixe du code (`IMT-`, `IMP-`, `IMS-`) et `gatewayClientForMode`.
- Les délais sont ceux d'une page hébergée (`checkout-core.ts`) : rapprochement après 2 min,
  tâche toutes les 5 min, expiration à 48 h. Une RTP e-commerce expire en **3 minutes** : il faut une
  échéance par checkout et une relecture plus fine.
- L'IPN n'est jamais crue ; elle déclenche un `getStatus` serveur à serveur. Aucune signature, aucun
  filtre IP. Ce principe reste valable pour PI-SPI (le webhook n'est qu'un déclencheur) ; la
  vérification `X-Signature` et le mTLS sont à créer.
- Le compte des abonnements vient uniquement de l'environnement (`lib/payment-gateway/platform-account.ts`) ;
  c'est le plus simple à brancher en premier.
- Les secrets d'agence sont chiffrés AES-GCM (`lib/payment-gateway/crypto.ts`, `PAYMENT_SECRETS_KEY`).
- `codePaiement` fait 24 caractères (préfixe + 20 aléatoires) : il tient dans les 25 caractères du
  `txId` PI-SPI ; l'alphabet est à restreindre à `A-Za-z0-9_-`.
- L'hôte de production termine le TLS dans un nginx hôte avec certbot (`infra/nginx/*.conf`,
  `docs/workflows/DEPLOIEMENT.md`). Le mTLS du webhook s'y configure (`ssl_verify_client` avec la CA
  de la BCEAO) : **c'est un prérequis d'infrastructure, pas du code applicatif**.
- Aucun journal d'événements entrants, aucun import de relevé, aucun rail sortant.

## Décisions (D1 et D2 prises ; D3 à D5 à trancher avant P1 et P2)

| Id  | Décision                                                                                                                                             | Reco                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| D1  | Modèle d'exploitation : A (chaque agence cliente directe d'un participant), B (via un agrégateur homologué), C (ImmoTopia encaisse pour les agences) | **Décidé : A.** B reste à sonder auprès de BMI/PaySecureHub en parallèle ; C écarté                  |
| D2  | Participant et son API Business homologuée (liste BCEAO du 2026-09-16, 8 ivoiriens)                                                                  | **Décidé : un opérateur de monnaie électronique** ; opérateur précis et homologation à vérifier (P0) |
| D3  | mTLS du webhook : exigé tel quel, ou HMAC seul accepté par le participant                                                                            | Demander au participant ; sinon HMAC + relecture serveur à serveur                                   |
| D4  | Alias demandé au payeur : numéro de téléphone (si le playground l'accepte en `payeurAlias`) ou SHID                                                  | Téléphone, à prouver au playground                                                                   |
| D5  | Frais de l'API Business et qui les supporte (`feesPaidBy = CLIENT` sans objet : le payeur ne paie rien)                                              | À négocier ; décide la valeur commerciale                                                            |

## Conception

1. **Interface « rail instantané »** `lib/payment-gateway/instant/types.ts` : `requestPayment`,
   `confirmRequest`, `getRequestStatus`, `lookupAlias`, `sendPayment`, `getPaymentStatus`,
   `registerWebhook`. Ne touche pas `GatewayClient`. Deux implémentations : `pispi/client.ts` (réel)
   et `pispi/simulator.ts` (participant virtuel en mémoire + états en base, même motif que
   `recordSimulatedOutcome`).
2. **Données** (migrations additives, deux fichiers si un enum est étendu) :
   - `PaymentGatewayProvider` gagne `PISPI` ; énumération `PaymentRail` (`HOSTED_PAGE`,
     `INSTANT_RTP`) ;
   - sur les trois checkouts : `rail`, `payerAliasMasked`, `endToEndId`, `expiresAt`,
     `providerStatusReason` (tous nullables, défaut `HOSTED_PAGE`) ; le numéro de téléphone du
     payeur n'est **pas** conservé en clair (masqué + empreinte) ;
   - `PispiWebhookEvent` : journal idempotent, unicité `(txId, evCode, endToEndId)`, charge utile
     brute, rattaché au checkout ; à passer par `schema-tenant-coverage.test.ts` (cas du compte
     plateforme sans `tenantId` : vérifier la règle du test avant de modéliser).
3. **Statuts** : `INITIE`, `ENVOYE`, `CONFIRME` → `PENDING` ; `IRREVOCABLE` → `SUCCESS` (seul état qui
   crédite) ; `REJETE` → `FAILED` ; `ANNULE` → `CANCELED` ; échéance dépassée → `EXPIRED` ; état
   inconnu → `PENDING` + avertissement. `BE23` = alias inconnu, `DU03` = rejeu (relire, ne pas recréer).
4. **Client réel** : jeton OAuth `client_credentials` en cache (expiration − 60 s) ; `https.Agent`
   avec certificat client ; `X-API-Key` ; erreurs RFC 7807 → `GatewayError` ; timeouts ; aucun secret
   journalisé. Configuration : variables `PLATFORM_PISPI_*` pour le compte ImmoTopia (base URL, URL du
   jeton, identifiant et secret OAuth, clé API, certificat et clé en PEM base64, alias payé SHID,
   secret de webhook, mode), via `src/config/env.ts` et `env.example`, utilisées en P4. Pour les
   agences (modèle A, dès P1), les mêmes éléments sont stockés par agence, chiffrés en base.
5. **Webhook** : route publique `POST /api/payment-gateway/pispi/webhook/:scope` (limiteur
   `webhookRateLimiter`), corps **brut** conservé, `X-Signature` HMAC-SHA256 vérifié en temps constant,
   indicateur de client mTLS transmis par nginx, événement journalisé puis rapprochement serveur à
   serveur (`getRequestStatus`). Réponse 200 uniquement après journalisation durable ; rejeu sans effet.
6. **Rapprochement** : échéance par checkout (`expiresAt`), relecture après 15 s pour une RTP `521`,
   tâche existante conservée (5 min) comme filet ; l'expiration à 48 h ne s'applique qu'à
   `HOSTED_PAGE`.
7. **Écran payeur** (web) : saisie du numéro ou de l'alias → recherche, nom et pays affichés pour
   confirmation → « Approuvez dans votre application » avec compte à rebours → statut ; relance
   possible ; jamais de redirection externe. Recherches d'alias limitées et journalisées. Textes via
   `t()`, propriétés logiques (RTL).
8. **Sortant** (P5) : `sendPayment` avec `confirmation: true`, double validation interne, plafond par
   agence, journal d'audit, jamais sans accord explicite de l'agence ; l'écriture comptable existante
   reste la source, le virement la matérialise.

## Lots

Chaque lot : une branche `feat/pispi-*` empilée sur la précédente, une PR, hooks respectés, classeur
des fonctionnalités et `npm run wiki:export` dès qu'un écran ou une route visible apparaît.

### Lot Q — Comptes de réception de l'agence : QR et alias fournis par son établissement · taille S à M (quelques jours, estimation)

**Décision du fondateur (2026-11-09, soir).** ImmoTopia **ne génère aucun QR**. L'agence ajoute le QR
téléchargé depuis l'application de son établissement (PI-SPI, Wave, Orange Money, banque…) et/ou son
alias. ImmoTopia les **présente** au locataire ou au copropriétaire, qui ouvre sa propre application,
choisit « scanner » ou « saisir l'alias », **entre lui-même le montant** et paie. Rien n'est prérempli.

**But.** Donner au payeur les coordonnées de paiement de l'agence, au même endroit que le reste de son
parcours, puis recueillir sa déclaration de paiement. Le lot est **indépendant de PI-SPI** : un QR Wave,
Orange Money, MTN, Moov ou bancaire convient aussi ; PI-SPI n'est qu'un cas, le meilleur quand
l'établissement fournit le QR interopérable (n'importe quelle application le lit).

**Ce qui existe déjà et se prolonge** (revérifié dans le code) :

- Côté copropriété : `SyndicReceivingNumber` (opérateur, numéro, titulaire, sous-compte de trésorerie,
  actif, ordre) avec ses écrans (`components/syndics/declared-payment/ReceivingNumbersCard.tsx`,
  `components/coowner-portal/declared-payment/ReceivingNumbersCard.tsx`) et la déclaration de paiement
  (spec 047) validée par le gestionnaire.
- Côté loyers : `RentalPaymentDeclaration` existe, mais **aucun compte de réception d'agence** n'est
  configuré : c'est la vraie nouveauté du lot.

**Conception.**

1. **Compte de réception** : pour l'agence (loyers) un nouveau modèle ; pour la copropriété,
   prolongement de `SyndicReceivingNumber` (colonnes ajoutées, ou modèle commun : à trancher au tout
   début, tâche TQ03). Champs : établissement (libellé libre), nature (QR, alias, numéro, ou
   plusieurs), **image du QR** (facultative), **alias** (facultatif), **nom du titulaire attendu**,
   « scannable avec » (ex. « toutes les applications PI-SPI » ou « application Wave »), instructions
   libres, actif, ordre, sous-compte de trésorerie. Plusieurs comptes par agence ou copropriété
   (Wave, Orange Money, banque…).
2. **Image du QR** : formats PNG, JPEG ou WebP, taille bornée, métadonnées retirées
   (`stripImageMetadata`), type vérifié à la signature de fichier (`detectStockFileKind`) ; stockage
   privé, **servie uniquement par une route authentifiée** (portail ou lien sécurisé) avec garde
   d'appartenance ; jamais en statique ; aucun chemin disque dans une réponse d'API.
3. **Alias** : si l'alias est un identifiant PI-SPI (UUID v4), il est validé ; sinon texte libre
   borné. Bouton « copier ».
4. **Montant et référence** : le montant est saisi par le payeur. ImmoTopia affiche un **motif suggéré**
   à recopier (ex. « Loyer janvier — Appartement 3 ») sans promettre qu'il apparaisse chez l'agence.
   Le rapprochement se fait sur la **déclaration** (montant, date, référence de transaction de
   l'application du payeur, capture facultative) comme aujourd'hui.
5. **Affichage** : composant commun `PaymentAccountsCard` (QR agrandissable, alias copiable, nom attendu
   du bénéficiaire, étapes « Comment payer », avertissements : paiement irrévocable, vérifier le nom
   affiché par votre application) dans le portail locataire, le portail copropriétaire et la page de
   déclaration ; mention dans les PDF d'avis d'échéance et d'appels de charges (alias en texte ; QR
   image intégrée si facile avec `pdf-lib`).
6. **Preuve de paiement** : déclaration existante, validée par le gestionnaire après vérification sur
   le compte de l'agence ; paiement d'origine `DECLARED`. **Aucun crédit automatique.**
7. **Anti-détournement** : tout ajout, changement ou retrait d'un compte de réception est journalisé et
   notifié par e-mail aux administrateurs de l'agence ; l'historique garde l'ancienne valeur. Un compte
   modifié par un accès compromis redirigerait les loyers : c'est le risque principal.
8. **Cohérence QR et alias** : si les deux sont fournis, l'agence est responsable de leur concordance.
   Une lecture automatique du QR pour vérifier l'alias est une amélioration optionnelle (nouvelle
   dépendance de décodage), hors lot.

**Zone grise réglementaire, réduite mais pas nulle.** Les spécifications BCEAO disent d'interdire
l'usage du QR « pour des paiements en ligne ou à distance ». Ici ImmoTopia ne génère pas de paiement : il
affiche des coordonnées, comme une vitrine ou une facture papier, et le payeur paie dans sa propre
application. Libeller la fonction « payer l'agence » (coordonnées de paiement), jamais « paiement en
ligne », tant que le participant n'a pas confirmé par écrit.

**Risques.** Détournement de compte de réception (audit + alerte) ; QR ou alias erroné saisi par
l'agence (nom attendu affiché, test par un paiement réel de faible montant) ; fausse déclaration
(vérification sur le compte de l'agence) ; référence absente chez l'agence (rapprochement manuel par
montant, date et nom) ; QR propre à un opérateur illisible par les autres applications (champ
« scannable avec ») ; plafond du compte de l'opérateur.

**Fin de lot.** Une agence pilote ajoute son QR et son alias ; un locataire les voit sur son portail et
paie un petit montant ; il déclare ; le gestionnaire valide ; isolation entre deux agences vérifiée ;
fichier QR inaccessible sans authentification ; changement de compte journalisé et notifié ; classeur
des fonctionnalités à jour.

### P0 — Prérequis hors code (fondateur) · 1 à 4 semaines, délai non maîtrisé

- Trancher D1 à D3 ; poser les questions à BMI/PaySecureHub (propose-t-il PI-SPI, quand, à quel prix).
- Créer le compte d'accès au sandbox `developer.pispi.bceao.int` et un participant virtuel ; ouvrir un
  compte business réel chez le participant choisi ; demander le certificat mTLS (CSR) ; obtenir le
  bundle de la CA de la BCEAO ; faire déclarer l'URL de webhook.
- Lire l'API de référence et le playground ; **valider au playground** : téléphone en `payeurAlias`
  (D4), contenu exact des notifications, hôtes et préfixe de scopes, comportement de `dateLimitePaiement`.
- Livrable : fiche d'identité des environnements (sans secret), réponses écrites aux cinq inconnues.

### P1 — Socle, simulateur et configuration par agence · taille L

- Migrations (§Conception 2) ; `instant/types.ts` ; `pispi/client.ts`, `pispi/status-mapping.ts`,
  `pispi/simulator.ts` ; `pispi/webhook.ts` (vérification, journal, idempotence) ; route publique et
  contrôleur ; extension de la tâche de rapprochement ; `env.ts` + `env.example`.
- **Configuration par agence** (modèle A) : modèle de configuration chiffré (hôtes, URL de jeton,
  identifiant et secret OAuth, clé API, certificat et clé, alias payé, secret de webhook), test de
  connexion, alerte d'expiration du certificat à 30 jours, carte « Compte PI-SPI » dans les réglages
  financiers de l'agence, droit RBAC dédié.
- Tests : correspondance des statuts ; `DU03`/`BE23` ; jeton expiré ; webhook falsifié, rejoué, hors
  ordre, signature absente ; montant différent → `REVIEW` ; `txId` à caractères interdits ; fixtures
  enregistrées depuis le sandbox ; secrets jamais renvoyés ; deux agences étanches ;
  `routes-inventory` ; `schema-tenant-coverage`.
- Fin : tout passe contre le simulateur ; la configuration d'agence est utilisable ; aucun paiement
  réel.

### P2 — Pilote : loyers d'une agence (`IMT-`) · taille M

- Écran payeur sur le portail locataire et sur le lien de paiement public (spec 039) ; démarrage de
  la RTP `521`, statut en direct, relance ; rail choisi selon la configuration de l'agence, le moyen
  actuel (PaySecureHub) restant disponible.
- Même chemin d'écriture que l'existant : paiement créé, échéances affectées, avance si excédent ;
  jamais de crédit avant `IRREVOCABLE`.
- Recette : simulateur, sandbox, puis **un paiement réel de faible montant** par une agence pilote,
  sur staging, après accord explicite du fondateur ; aucune mise en production sans « oui » explicite.
- Fin : un paiement sandbox de bout en bout, rejeu de webhook sans double crédit, annulation et
  expiration vérifiées dans le navigateur, plafond du compte de l'opérateur connu.

### P3 — Charges de copropriété (`IMS-`), masse et escompte · taille L

- Configuration par copropriété (un compte par copropriété, pas de repli sur le cabinet, spec 042) ;
  portail copropriétaire et lien « Payer cet appel » ; appels en masse par demande groupée ; escompte
  d'anticipation par `remise` ; enrôlement d'un alias et RTP `401` envoyée à l'échéance.
- Prérequis : P2 validé.

### P4 — Abonnements ImmoTopia (`IMP-`) · taille S

- Même code que P2 avec un compte plateforme lu dans l'environnement (`PLATFORM_PISPI_*`) ;
  `startInvoiceCheckout` ne fixe plus `provider` en dur ; page de retour `?paiement=`.
- Prérequis : un compte business d'ImmoTopia chez un participant (démarche du fondateur).

### P5 — Reversements propriétaires sortants · taille M

- `OwnerPayout` peut déclencher `sendPayment` (unitaire puis lot) ; confirmation du nom du
  bénéficiaire ; double validation ; plafond ; statuts suivis par webhook ; échec = reversement non
  marqué payé. Droit RBAC dédié ; jamais sur un rôle de lecture.
- À ne pas faire sans décision écrite sur la responsabilité en cas d'erreur d'alias (paiement
  irrévocable).

### P6 — Encaissements non sollicités et rapprochement · taille M

- Alias (SHID) par copropriété ou site ; QR statique ou dynamique **sur place uniquement** (SDK
  `@pi-spi/qrcode` ou équivalent, CRC et GUI contrôlés) ; événement `PAIEMENT_RECU` → affectation par
  `ReferenceLabel`/alias ; file de revue pour les paiements non reconnus (nouveau modèle, tenant
  couvert). Comble l'absence d'import bancaire.
- Limite : un participant fixe un nombre d'alias par client (≈ 20 par défaut) ; un alias par bail ne
  passe pas à l'échelle.

### P7 — Finitions transverses (à chaque lot, puis lot final)

ADR-009 ; `SECURITY.md` (§6 webhooks, mTLS, signature) ; `docs/integrations/pispi.md` ; fiche
d'onboarding des agences ; catalogues i18n (`npm run i18n:extract`) ; classeur et miroir des
fonctionnalités ; recette navigateur par le circuit `demo-orchestrator` sur la démo figée ; mise à
jour de `HANDOFF.md`.

## Vérification de la constitution (AGENTS.md)

| Règle           | Application                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multi-tenant    | `tenantId` sur les nouveaux modèles porteurs ; toute référence reçue passe par `assertBelongsToTenant` ; webhook rattaché au checkout par `txId` puis tenant lu sur le checkout, jamais sur la requête |
| Erreurs         | `GatewayError` et erreurs typées de `error-middleware` ; aucun `try/catch` qui devine le statut HTTP                                                                                                   |
| Configuration   | tout par `env.ts` et `env.example` ; aucun secret en défaut ; certificats en PEM base64                                                                                                                |
| Fichiers privés | aucun certificat ni clé en `/uploads` ni dans une réponse d'API                                                                                                                                        |
| Frontend        | réseau par `api-client`, URL par `config/api`, pages en `React.lazy`, jamais `dangerouslySetInnerHTML`                                                                                                 |
| Textes          | français comme clé de traduction, propriétés logiques                                                                                                                                                  |
| Webhooks        | corps brut, signature en temps constant, relecture serveur à serveur avant écriture                                                                                                                    |

## Tests transverses

- Unitaires Jest sur client, statuts, webhook, expiration ; fixtures issues du sandbox.
- Intégration sur base dédiée (`DATABASE_URL_TEST`) : double webhook, ordre inversé, montant
  différent, reprise après échec réseau, deux agences, étanchéité (`npm run test:isolation`).
- Web Vitest : écran payeur (compte à rebours, expiration, refus, alias inconnu), traduction arabe.
- Recette navigateur sur la démo figée (simulateur) ; un seul passage réel sur staging, par le
  fondateur ou avec son accord explicite.

## Déploiement et reprise

- Drapeau par agence (réglage + variable) ; `SIMULATOR` par défaut ; réel uniquement par mode et
  configuration explicites.
- nginx : vhost ou `location` dédié au webhook avec `ssl_verify_client optional` et la CA de la BCEAO
  (si D3 l'exige) ; `nginx -t` avant rechargement ; jamais appliqué sur le serveur sans accord.
- Retour arrière : repasser le mode à `SIMULATOR` ou désactiver le drapeau ; les migrations sont
  additives, aucune ne détruit de donnée.
- Aucun déploiement ni fusion sans « oui » explicite du fondateur.

## Risques et parades

| Risque                                                     | Parade                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Documentation BCEAO contradictoire (hôtes, scopes, délais) | construire contre le playground, fixtures datées, test de contrat    |
| Participant sans API Business homologuée                   | contrôler la liste BCEAO avant tout engagement (P0)                  |
| mTLS impossible derrière l'infrastructure actuelle         | demander D3 ; repli HMAC + relecture serveur à serveur               |
| Paiement irrévocable envoyé au mauvais alias               | confirmation du nom, double validation, plafonds                     |
| Fuite de certificat ou de secret                           | chiffrement, rotation, alerte d'expiration, jamais dans les journaux |
| Frais d'API qui annulent l'intérêt économique              | D5 avant P3                                                          |
| Énumération d'alias                                        | limiteur, journalisation, résultat minimal affiché                   |
| Couverture inégale des clients (Wave incertain)            | PaySecureHub conservé en parallèle ; le payeur choisit le rail       |
