# PI-SPI (BCEAO) — étude d'intégration pour ImmoTopia

> Suite : spécification, plan et tâches dans
> [specs/048-paiement-instantane-pispi/](../../specs/048-paiement-instantane-pispi/plan.md). Décisions
> du 2026-11-09 : agences clientes directes de leur participant ; participant de type opérateur de
> monnaie électronique. Les recommandations du §8 (pilote sur les abonnements) sont dépassées sur ce
> point : le plan commence par les loyers d'une agence.

Étude du 2026-11-09. Recherche documentaire uniquement : aucun code modifié,
aucun compte sandbox créé, aucun appel d'API réel. Chaque affirmation porte son
niveau de preuve : **[officiel]** (portail développeur ou site de la BCEAO,
lu le 2026-11-09), **[presse]** (article de presse, non confirmé par la BCEAO),
**[tiers]** (blog d'intégrateur), **[à vérifier]**.

## 1. Ce qu'est PI-SPI

Plateforme Interopérable du Système de Paiement Instantané de l'UEMOA, conçue
et opérée par la BCEAO. Lancée le 2025-09-30 à Dakar [officiel]. Disponible
24 h/24, 7 j/7, huit pays, FCFA uniquement [officiel]. Modèle « hub » : chaque
participant (banque, émetteur de monnaie électronique, établissement de
paiement, microfinance) se connecte une seule fois à la BCEAO et peut payer
tous les autres [officiel].

Calendrier [presse sauf mention] :

- 2026-09-16 : première liste de 24 API Business homologuées (mise à jour le 17) ; Côte d'Ivoire : 8, Sénégal : 9.
- 2026-09-30 : échéance de connexion des banques, EME et établissements de
  paiement ; 175 participants autorisés à servir le public, dont 38 en Côte
  d'Ivoire (25 banques, 10 EME, 3 microfinances). Microfinances : 2027-06-30.
- 2026-10-02 : Avis BCEAO n° 0019 [officiel] ; depuis le 2026-11-02, les
  transactions de monnaie électronique interopérables entre personnes
  physiques passent obligatoirement par PI-SPI.
- 2027-06-01 : alignement des conditions tarifaires transfrontalières.

Statut de Wave : sources contradictoires [presse]. Ne pas bâtir un parcours
qui suppose Wave actif via PI-SPI sans vérification.

## 2. Règles structurantes qui conditionnent notre produit [officiel]

Source : guide « Vue d'ensemble » du portail développeur.

1. **ISO 20022** comme langage commun entre participants et PI-SPI.
2. **Aucun prélèvement (direct debit).** Seule l'initiative du bénéficiaire
   admise est la **demande de paiement (RTP)**, que le payeur accepte ou rejette.
3. **Double confirmation du destinataire** (nom/pays affichés au payeur).
4. **Irrévocabilité** une fois confirmé ; **20 s** de traitement maximum.
5. **Pas de chargeback.** Annulation = demande d'annulation que le bénéficiaire
   accepte (→ retour de fonds) ou refuse [officiel].
6. Les participants **doivent exposer l'API Business** aux clients entreprises
   (type B) qui veulent automatiser ; aucun autre canal n'est autorisé.
7. Types de clients : P (particulier), C (commerçant personne physique),
   B (personne morale), G (administration). Un virement reçu par un P est un
   « transfert » jusqu'à 30 par mois civil, au-delà un « paiement » ; tout ce
   que reçoit un B est un « paiement ».

Conséquence immédiate : **la spec 042 « prélèvement » ne peut pas s'appuyer
sur PI-SPI telle quelle** ; l'équivalent est une RTP envoyée chaque échéance,
avec acceptation du locataire à chaque fois (voir §6).

## 3. Accès technique : l'API Business [officiel]

Une entreprise **ne se connecte pas à la BCEAO**. Elle ouvre un compte
business chez un participant dont l'API Business est **homologuée** ; c'est
la passerelle de ce participant qui expose l'API.

Sécurité (trois couches) :

- OAuth 2.0 `client_credentials` ; jeton d'une heure, lié au certificat mTLS.
- **mTLS** avec un certificat délivré par la CA de la BCEAO (CSR soumise via le
  participant).
- En-tête `X-API-Key` (limites : sandbox 100/min, production 1 000/min, à
  négocier).

Scopes (extraits) : `demande_paiement.write|read`, `demande_paiement_reponse.write`,
`demande_paiement_groupe.write|read`, `paiement.write|read`,
`paiement_groupe.write|read`, `retour_fonds.write`, `demande_annulation.write`,
`demande_annulation_reponse.write`, `alias.read|write|delete`,
`enrolement_alias.read`, `compte.read`, `webhook.read|write|delete`.

Identifiants : `txId` (fourni par nous, unique, ≤ 25 caractères pour un QR),
`endToEndId` (créé par le participant), `instructionId` (lot).

Alias [officiel] : **SHID** = UUID v4 de 36 caractères, clé par défaut, seul
alias admis dans un QR ; MBNO (téléphone) pour les P ; **MCOD** (code marchand)
pour USSD, réservé aux B/C. Résolution via le Répertoire des Alias Centralisé.
Un B peut avoir plusieurs alias (≈ 20 par défaut) : **un alias par bien /
copropriété / mandant** permet de suivre les flux sans passer par les
références libres.

Endpoints cités par les guides [officiel] : `POST /demandes-paiements`,
`PUT /demandes-paiements/{txId}/confirmations`, `GET /demandes-paiements`
(filtres `instructionId`, `statut`), `POST /demandes-paiements-groupes`,
`PUT /demandes-paiements-groupes/{instructionId}/confirmations`,
`GET /alias/{cle}`. Hôtes cités : `sandbox.api.pi-bceao.com/piz/v1` ; jeton
sandbox via un domaine Cognito ; `api.pispi.bceao.int` pour la sécurité.
**Les guides se contredisent sur les hôtes et sur le préfixe de scopes
(`piz/…`) : se fier au playground et à l'API de référence, pas aux
exemples.** Un blog tiers mentionne un préfixe `/{CODE}/` devant les chemins ;
non retrouvé dans les guides officiels.

### Demande de paiement (RTP) — catégories [officiel]

| Catégorie | Usage               | Particularités                                                                                                               |
| --------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `500`     | Paiement sur site   | pas de `dateLimitePaiement` ; expire sous 24 h                                                                               |
| `521`     | E-commerce immédiat | `dateLimitePaiement` obligatoire, **moins de 3 min**                                                                         |
| `401`     | Facture             | `dateLimitePaiement` (date) ; `dateLimiteReponse` optionnelle (défaut +90 j) ; remise possible ; `refDocType`/`refDocNumero` |

Champs communs : `txId`, `confirmation`, `categorie`, `payeurAlias`,
`payeAlias`, `montant` (entier FCFA), `motif`. Options : `remise` (taux ≤ 1 %
ou montant), `debitDiffere`, PICO/PICASH (retrait espèces), `logoUrl`.

`confirmation: true` → la plateforme renvoie nom et pays du payeur, statut
`INITIE`, 24 h pour confirmer (`ENVOYE`) ou annuler (`ANNULE`). Idempotent.

### Statuts [officiel]

- Paiement : `INITIE` → `ENVOYE` → `CONFIRME` → **`IRREVOCABLE`** (final,
  seul état qui vaut encaissement) ; `REJETE` et `ANNULE` finaux ; raison dans
  `statutRaison`.
- RTP : `INITIE`, `ENVOYE`, `IRREVOCABLE`, `REJETE` (refus ou expiration),
  `ANNULE`. Rejets à la création : `BE23` (alias payeur inconnu), `DU03`
  (`txId` déjà utilisé).
- Lot de RTP : `INITIE`, `CONFIRME`, `ANNULE` ; délai 24/48/72 h selon 500/1000
  transactions.

### Webhooks [officiel]

Événements : `PAIEMENT_RECU`, `PAIEMENT_ENVOYE`, `PAIEMENT_REJETE`,
`RTP_RECU`, `RTP_REJETE`, `RTP_ENVOYE`, `RTP_REPONSE_REJETE`,
`ANNULATION_DEMANDE`, `RETOUR_RECU`, `RETOUR_ENVOYE`, `RETOUR_REJETE`,
`ANNULATION_REJETE`, `ANNULATION_REPONSE_REJETE`. Stratégies d'URL : générale,
par alias, par événement, par alias + événement. Maximum **20 webhooks**.
Sécurité : HTTPS, **mTLS avec certificat de la CA BCEAO**, en-tête
`X-Signature` = HMAC-SHA256 du corps brut. Les notifications peuvent être
rejouées [tiers].

### QR code [officiel]

EMV « Merchant-Presented-Mode » uniquement ; GUI `int.bceao.pi` ; ID 36 =
SHID ; `ReferenceLabel` = `txId` (≤ 25 caractères) ; CRC16 (poly 0x1021, init
0xFFFF) ; aucune donnée personnelle. Statique : un QR par point de vente,
`txId` identifie la caisse. Dynamique : un `txId` par transaction.
**« Interdire l'usage du QR pour les paiements en ligne ou à distance »**
(guide des spécifications) : le QR est réservé au sur-place. SDK officiel :
`@pi-spi/qrcode` (npm, JavaScript). Les directives de charte graphique
(boutons de paiement en ligne, logos) sont annoncées « bientôt ».

## 4. Coûts et limites

- Particulier → particulier : gratuit jusqu'à 8 000 FCFA/jour/participant,
  puis 0 à 0,8 % HT ; réception gratuite [presse, Avis 0019 non lu en entier :
  le PDF n'était pas accessible].
- Entreprises : plafond d'opération jusqu'à 100 millions FCFA, plafonds
  inférieurs fixables par la banque ; **frais entre personnes morales libres,
  fixés par le participant** [presse]. Aucune grille « commerçant » publique
  retrouvée. **Les frais de l'API Business sont à négocier avec le
  participant.**
- Pas de chargeback : litiges et remboursements sont de notre responsabilité
  [officiel + tiers].
- Mono-devise (FCFA), huit pays [officiel].

## 5. Ce qui n'a pas pu être vérifié

- Texte intégral de l'Avis n° 0019 (PDF non lu) ; grille tarifaire commerçants.
- Liste nominative des 8 API Business ivoiriennes (le communiqué du
  2026-09-16 n'a pas été lu ; la presse cite Ecobank, Mansa Bank, Standard
  Chartered, MTN MFS sans confirmer qu'ils figurent dans la liste).
- Spécification OpenAPI complète (pages « API référence » et « Playground »
  non parcourues), guides « Retours & annulations » et « Réception des
  paiements » (ce dernier « en cours de rédaction »).
- Conditions commerciales, délais d'ouverture et exigences KYC des participants.
- Statut de Wave. Prix et SLA de tout agrégateur.

## 6. État du code ImmoTopia face à PI-SPI

Cartographie faite le 2026-11-09 (lecture seule) ; les points marqués ✔ ont
été revérifiés à la main, les autres viennent du rapport de l'agent de
lecture.

- Aucune occurrence de PI-SPI, PISPI, « virement instantané » dans le code,
  les specs ni les docs ; « BCEAO » une seule fois
  (`docs/integrations/paysecurehub.md`, sur l'absence d'agrément).
- Un seul fournisseur : PaySecureHub (BMI Finance CI), modes `LIVE` /
  `SIMULATOR`. ✔ `enum PaymentGatewayProvider { PAYSECUREHUB }`
  (`schema.prisma:2642`).
- ✔ `GatewayClient` (`packages/api/src/lib/payment-gateway/types.ts`) est
  construit pour une **page hébergée** : `buildAway()` renvoie une URL de
  redirection, `getStatus(codePaiement)` fait foi. PI-SPI n'a pas de page
  hébergée : c'est un rail « push » (le payeur approuve dans son application).
- ✔ L'IPN n'est jamais crue, elle déclenche un `getStatus` serveur à serveur ;
  **aucune vérification de signature ni de filtre IP** (aucune occurrence de
  `hmac` ou `signature` dans `payment-gateway-public-controller.ts`). Ce modèle
  est compatible avec la consigne PI-SPI « un webhook n'est qu'un
  déclencheur » ; la signature `X-Signature` et le mTLS exigés par PI-SPI
  seraient une capacité nouvelle.
- Trois modèles de checkout parallèles (`OnlinePaymentCheckout` loyers `IMT-`,
  `PlatformPaymentCheckout` abonnements `IMP-`, `SyndicOnlineCheckout` charges
  `IMS-`) et deux modèles de configuration (`PaymentGatewayConfig` par agence,
  `SyndicPaymentGatewayConfig` par copropriété) ; abonnements : compte unique
  ImmoTopia lu dans l'environnement. Pas de journal d'événements entrants.
- Idempotence : mises à jour conditionnelles, `decideCheckoutTransition`
  (un succès ne redescend jamais), unicités `psp_transaction_id`,
  `providerTransactionId`. Tâche de rapprochement toutes les 5 minutes
  (`online-payment-reconciliation-job.ts`) : **trop lente pour une RTP
  e-commerce qui expire en 3 minutes**.
- Codes de paiement : préfixe de 4 caractères + 20 aléatoires = 24
  caractères, donc **dans la limite de 25 caractères du `txId`** PI-SPI.
- **Aucun import de relevé bancaire ni rapprochement ligne à ligne** ; les
  reversements propriétaires (`OwnerPayout`) et les règlements fournisseurs
  sont de simples enregistrements, aucun rail sortant. Les webhooks PI-SPI
  (`PAIEMENT_RECU` avec `txId`, alias) combleraient ce manque.
- Prélèvement (spec 042, ADR-007) : remises par fichier bancaire,
  `GENERIC_CSV`.
- Prochain numéro de spec libre : **048** (deux dossiers `042-` existent déjà ;
  047 est le dernier). Prochain ADR : 009.

## 7. Analyse : où PI-SPI s'insère

| Besoin ImmoTopia                                     | Mécanisme PI-SPI                                                                                                                     | Verdict                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Abonnements / factures ImmoTopia (`IMP-`)            | RTP catégorie `401` (facture) ou `521` (immédiat) vers l'alias du client                                                             | **Meilleur pilote** : compte unique, identifiants en environnement, aucune agence à habiliter |
| Loyer payé par le locataire (lien / portail, `IMT-`) | RTP `521` (< 3 min) après saisie de l'alias ; ou RTP `401` envoyée à l'échéance à un alias enrôlé                                    | Bon ajustement, change l'écran (plus de page hébergée)                                        |
| Charges de copropriété (`IMS-`)                      | Idem, un compte par copropriété                                                                                                      | Idem ; l'entité titulaire du compte est à clarifier (§8)                                      |
| Prélèvement (spec 042)                               | **Interdit** (« aucun direct debit ») ; remplaçable par RTP mensuelle à acceptation à chaque fois, ou paiement programmé côté payeur | Ne remplace pas le prélèvement                                                                |
| Reversement propriétaire                             | `POST /paiements-envoyes` (+ lots), avec confirmation du bénéficiaire                                                                | Gain réel (aujourd'hui simple écriture), mais irrévocable : double validation, plafonds       |
| Rapprochement / encaissement sur place               | Webhooks `PAIEMENT_RECU`, alias par copropriété ou site, QR statique ou dynamique                                                    | Comble l'absence de relevé ; QR **sur place uniquement**                                      |
| Remboursement                                        | `retour_fonds.write`, demande d'annulation                                                                                           | Pas de chargeback : processus à écrire                                                        |

Point de friction d'usage : un alias SHID est un UUID de 36 caractères,
inutilisable à la main. Le guide « Paiements » indique qu'un alias payeur peut
être un SHID, un MCOD **ou un numéro de téléphone** : l'écran de paiement
devrait donc demander le numéro de téléphone. **À prouver dans le playground**
(les exemples officiels de la RTP `521` n'utilisent que des SHID).

Le payeur n'est jamais débité sans acceptation : pas de relance automatique
« à son insu », ce qui est un avantage de conformité et une perte de
fiabilité de recouvrement par rapport au prélèvement.

## 8. Modèles d'exploitation (décision à prendre)

L'API Business est exposée par un **participant** à ses clients de type B/G.
Trois façons d'y accéder :

- **A. Agence cliente directe.** Chaque agence (ou copropriété) ouvre un compte
  business chez un participant homologué, obtient son certificat mTLS et ses
  identifiants ; ImmoTopia les stocke chiffrés par agence (comme
  `PaymentGatewayConfig`) et agit pour son compte. Les fonds vont directement
  à l'agence. Lourd à l'onboarding (certificat, KYC, participant différent par
  agence), mais aucun statut réglementaire pour ImmoTopia.
- **B. Via un agrégateur déjà homologué** (PaySecureHub/BMI ou un établissement
  de paiement ivoirien). Intégration unique, onboarding léger, c'est le modèle
  actuel. **Inconnu : aucun agrégateur n'a été confirmé comme exposant PI-SPI**
  (une comparaison commerciale cite Jèko avec un QR PI-SPI, sans preuve
  officielle).
- **C. ImmoTopia client unique et encaisse pour les agences.** À écarter :
  détenir et reverser des fonds relève du statut d'établissement de paiement,
  ce que le projet évite explicitement.

Recommandation : lancer en parallèle (1) la question à BMI/PaySecureHub
(propose-t-il PI-SPI, quand, à quel prix ?), (2) un pilote **A sur les
abonnements** avec le compte ImmoTopia (Alliance Consultants) chez un
participant homologué, car il n'implique aucun tiers à habiliter.
Questions juridiques : mandat donné par l'agence à ImmoTopia pour manier ses
identifiants ; responsabilité en cas de fraude ; traitement des données
d'identité renvoyées par la recherche d'alias (nom, pays, ville).

## 9. Conception proposée (spec 048)

1. **Nouveau rail, pas un nouveau `GatewayClient`.** Garder `GatewayClient`
   pour les passerelles hébergées et ajouter une interface « rail instantané »
   (`requestPayment`, `getRequestStatus`, `confirmRequest`, `lookupAlias`,
   `sendPayment`, `registerWebhook`). Ajouter `PISPI` à
   `PaymentGatewayProvider` ; ajouter aux checkouts les champs `rail`,
   `payerAlias`, `endToEndId` (nullables) ; le simulateur apprend la RTP.
2. **Statuts** : `INITIE`, `ENVOYE`, `CONFIRME` → `PENDING` ;
   `IRREVOCABLE` → `SUCCESS` (seul état qui crédite) ; `REJETE` → `FAILED` ;
   `ANNULE` → `CANCELED` ; expiration 3 min (521) ou date limite (401) →
   `EXPIRED`. Inconnu = `PENDING` + avertissement (comme aujourd'hui).
3. **Identifiants** : `txId` = notre `codePaiement` (24 caractères, alphabet
   `A-Za-z0-9_-` seulement) ; `DU03` = rejeu, relire le statut ; `BE23` =
   alias inconnu.
4. **Client** : jeton OAuth mis en cache par agence (expiration − 60 s),
   `https.Agent` avec certificat client par agence, `X-API-Key`, erreurs
   RFC 7807 vers `GatewayError`. Certificat, clé, secret OAuth et secret de
   webhook chiffrés AES-GCM (`PAYMENT_SECRETS_KEY`, `crypto.ts`), jamais
   renvoyés par l'API. Alerte d'expiration de certificat à 30 jours.
5. **Webhook** : route publique dédiée, URL par agence, **mTLS vérifié avec la
   CA de la BCEAO** + `X-Signature` HMAC-SHA256 sur le **corps brut**, puis,
   comme aujourd'hui, `getStatus` serveur à serveur avant toute écriture ;
   journal d'événements idempotent (nouvelle table, à couvrir par
   `schema-tenant-coverage.test.ts`). **Prérequis d'infrastructure** : le mTLS
   se termine à l'entrée ; vérifier ce que fait le reverse proxy de production
   (`docs/workflows/DEPLOIEMENT.md`) avant de promettre cette exigence.
6. **Rapprochement** : abaisser le délai de relecture des RTP en attente (5 min
   actuel contre 3 min d'expiration) et ajouter la relecture à échéance.
7. **Écran** : saisie du numéro ou de l'alias → recherche (nom, pays affichés
   pour confirmation) → « approuvez dans votre application » avec compte à
   rebours → statut. Limiter et journaliser les recherches d'alias
   (énumération).
8. **Sortant** : reversements propriétaires via `POST /paiements-envoyes` avec
   `confirmation: true`, double validation interne, plafond, journal ; jamais
   sans accord explicite de l'agence.
9. **Sécurité et docs** : ADR-009, section dans `SECURITY.md` (§6 webhooks),
   `env.example`, `env.ts`, classeur des fonctionnalités + `wiki:export`,
   catalogues i18n.

### Lots proposés

| Lot | Contenu                                                                                                                                                                          | Dépend de       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| P0  | Décisions (§8), questions à BMI, choix du participant, ouverture du compte sandbox et du compte réel par le fondateur (compte, KYC et certificat sont des actes de l'entreprise) | —               |
| P1  | Adaptateur + simulateur RTP/alias, configuration chiffrée, webhook signé, journal, tests                                                                                         | P0 (sandbox)    |
| P2  | Pilote abonnements ImmoTopia (`IMP-`) en réel                                                                                                                                    | P1, compte réel |
| P3  | Loyers et charges : écran payeur, RTP `401` à l'échéance                                                                                                                         | P2              |
| P4  | Reversements propriétaires sortants                                                                                                                                              | P2              |
| P5  | Encaissements non sollicités, QR sur place, rapprochement par alias                                                                                                              | P1              |
| P6  | Wiki, i18n, ADR, recette navigateur                                                                                                                                              | chaque lot      |

## 10. Risques

- **Pas de chargeback, irrévocabilité** : toute erreur d'alias ou de montant
  est définitive ; la double confirmation du bénéficiaire est obligatoire.
- **Homologation** : un participant peut servir le public sans API Business
  homologuée ; vérifier sa présence sur la liste BCEAO avant tout engagement.
- **Calendrier** : l'échéance microfinance est 2027-06-30 ; Wave reste
  incertain ; la couverture n'est pas garantie le premier jour pour chaque
  client.
- **Documentation en évolution** : guides contradictoires (hôtes, préfixe de
  scopes `piz/`, délai de traitement 10 s sur le site grand public contre 20 s
  dans le guide), « Réception des paiements » et « Directives » non rédigés.
  Construire contre le playground et l'API de référence.
- **mTLS et webhooks** : exigence d'infrastructure à valider.
- **Coûts** : frais de l'API Business inconnus ; le paiement gratuit pour le
  payeur retire la logique `feesPaidBy = CLIENT`.
- **Vie privée** : la recherche d'alias renvoie nom, pays et ville d'un tiers.
