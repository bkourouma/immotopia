# Spécification 042 — Prélèvement bancaire

> **Branche** : `feat/prelevement-bancaire` · **Créée** : 15/10/2026 ·
> **Statut** (17/10/2026) : P0 (cadrage), P1 (mandats) et P2 (remises,
> contrat dans data-model.md §7) livrés. P3 (retour banque, contrat §8),
> P4 (copropriété, contrat §9) et la signature électronique du mandat (en
> option, contrat §10) sont en cours de réalisation ; P5 décrit, non réalisé ;
> P6 non planifié.
> **Documents liés** : [data-model.md](data-model.md) (schéma),
> [plan.md](plan.md) (lots, territoires, vérifications),
> [ADR-007](../../docs/architecture/adr/ADR-007-prelevement-bancaire-fichier-et-reglement-confirme.md)
> (fichier de remise, IBAN chiffré, règlement confirmé).
> **Entrées** : décisions D1 à D8 du fondateur (15/10/2026).
> Chemins relatifs à `packages/api/` sauf mention contraire.

## 1. Objectif

Une agence encaisse les loyers — puis les charges de copropriété — par
prélèvement sur le compte bancaire du débiteur, avec son autorisation signée.
ImmoTopia tient les mandats, prépare chaque mois la remise, produit le
fichier que l'agence charge sur sa banque en ligne, puis enregistre les
règlements et les rejets que la banque renvoie. L'argent va directement sur
le compte de l'agence ou du syndicat : ImmoTopia ne le touche jamais.

## 2. Contexte bancaire (Côte d'Ivoire, UEMOA)

- Le prélèvement passe par la compensation interbancaire de l'UEMOA.
- Le **créancier** (agence, ou syndicat de copropriété) signe une convention
  d'émetteur avec sa banque, qui lui attribue un numéro d'émetteur.
- Le **débiteur** signe une autorisation de prélèvement (le « mandat »),
  déposée à sa banque.
- Le créancier charge un **fichier de remise** sur sa banque en ligne. Le
  format dépend de la banque ; il n'y a pas d'API ouverte.
- Le RIB UEMOA compte 24 caractères (code banque 5, guichet 5, compte 12,
  clé 2) ; l'IBAN ivoirien 28 (`CI` + 2 chiffres de contrôle + RIB).

À obtenir de la banque pilote avant P2 (bloquant pour le format réel, pas
pour P1) : la convention et le numéro d'émetteur, un fichier de remise
exemple, la liste des codes de rejet, les délais (dépôt, compensation,
rejet), le modèle d'autorisation qu'elle accepte, une confirmation du calcul
de la clé RIB.

## 3. Décisions

| #   | Décision du fondateur (15/10/2026)                                                                                 | Traduction                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Périmètre : loyers d'abord, puis charges de copropriété ; abonnements des agences plus tard.                       | P1–P3 locatif, P4 copropriété, P6 en option non planifié. Le modèle prévoit un champ `scope` pour accueillir la copropriété sans refonte. |
| D2  | Format : CSV générique tant que la banque pilote n'a pas fourni son fichier exemple.                               | Adaptateur par banque (`DirectDebitFileFormat`), `GENERIC_CSV` seul en P2.                                                                |
| D3  | Le loyer compte comme payé **à la confirmation sur le relevé**, pas à la date de prélèvement.                      | ADR-007 §5 : `RentalPayment` créé en `SUCCESS` au constat de règlement, jamais à l'export.                                                |
| D4  | Frais de rejet refacturés au débiteur, montant réglé par agence.                                                   | `DirectDebitCreditor.rejectFeeAmount` (0 = pas de refacturation) ; écriture en P3.                                                        |
| D5  | Mandat suspendu après 2 rejets consécutifs.                                                                        | `DirectDebitCreditor.maxConsecutiveRejects` (défaut 2) ; compteur sur le mandat, remis à zéro au premier règlement.                       |
| D6  | Seule l'échéance du mois est prélevée (reste dû), sans arriérés ni pénalités, dans la limite du plafond du mandat. | Sélection P2 ; plafond `DirectDebitMandate.maxAmount`.                                                                                    |
| D7  | Prénotification 5 jours ouvrés avant le prélèvement, réglable.                                                     | `DirectDebitCreditor.prenotificationBusinessDays` (défaut 5).                                                                             |
| D8  | Offre : inclus dans les packs (pas d'extension payante pour l'instant).                                            | Route gardée par le module déjà associé à la gestion locative (et au Syndic en P4) ; aucune ligne de catalogue nouvelle.                  |

## 4. Périmètre

### 4.1 Dans le périmètre de P1 (ce lot)

- **Créanciers** : paramétrage, par agence, du ou des comptes bancaires qui
  reçoivent les prélèvements (compte de trésorerie `BANK`, numéro
  d'émetteur, format de fichier, jour de collecte, délai de prénotification,
  frais de rejet, seuil de suspension).
- **Mandats** : création, consultation, modification des champs non
  bancaires, activation, suspension, réactivation, révocation ; contrôle et
  chiffrement de l'IBAN ; PDF d'autorisation prérempli ; dépôt du scan signé
  (fichier privé) ; journal d'audit.
- Écrans : carte « Prélèvement bancaire » dans Paramètres financiers de
  l'agence (créanciers) ; onglet « Prélèvements » de la fiche du bail ;
  liste des mandats (menu Location › Prélèvements).
- Permissions, garde de module, textes fr/en/ar, wiki des fonctionnalités.

### 4.2 Hors P1, planifié

P2 remises (livré), P3 retour banque (§7), P4 copropriété (§8), signature
électronique du mandat (§9), P5 portails et automatismes (voir
[plan.md](plan.md) §1). P6 (abonnements prélevés) : non planifié.

### 4.3 Hors périmètre

Débit Mobile Money récurrent ; intégration bancaire directe ; signature
qualifiée du mandat et transmission électronique du mandat à la banque du
débiteur.

**Signature électronique du mandat : une option.** Décision de l'utilisateur
du 17/10/2026 : elle n'est plus hors périmètre. Elle s'ajoute au circuit
papier (PDF, signature manuscrite, dépôt du scan, P1), qui reste possible et
n'est pas remplacé. L'agence choisit mandat par mandat (exigences PB7,
contrat [data-model.md](data-model.md) §10).

## 5. Exigences de P1

### PB1 — Créancier

- PB1-R1. Un créancier appartient à une agence et pointe vers un
  `TreasuryAccount` **de la même agence**, de type `BANK`, actif
  (`assertBelongsToTenant` + contrôle du type ; sinon `NotFoundError` pour
  une autre agence, `BadRequestError` pour un mauvais type).
- PB1-R2. Champs : libellé, numéro d'émetteur (texte libre, 1 à 32
  caractères, facultatif tant que la convention n'est pas signée), format
  (`GENERIC_CSV`), jour de collecte (1 à 28), délai de prénotification en
  jours ouvrés (0 à 30, défaut 5), frais de rejet (≥ 0, défaut 0), seuil de
  suspension (1 à 10, défaut 2), actif.
- PB1-R3. Un seul créancier par compte de trésorerie (contrainte d'unicité ; un
  créancier désactivé occupe toujours le compte).
- PB1-R4. Un créancier qui porte des mandats non révoqués ne se supprime
  pas ; il se désactive.

### PB2 — Mandat

- PB2-R1. Un mandat lie : une agence, un créancier de l'agence, un
  débiteur `TenantClient` de l'agence, un bail (`RentalLease`) de l'agence
  dont ce client est le locataire principal ou un colocataire.
  Toute référence d'une autre agence → `NotFoundError`.
- PB2-R2. Référence unique `MDT-AAAA-NNNN` par agence, attribuée à la
  création, jamais réutilisée.
- PB2-R3. IBAN saisi avec ou sans espaces ; normalisé (majuscules, sans
  espace). Accepté : IBAN `CI` de 28 caractères valide modulo 97, ou RIB de
  24 caractères (converti en IBAN `CI` en calculant les chiffres de
  contrôle). Refus → `BadRequestError` au message traduit. Clé RIB
  incohérente → avertissement renvoyé (`warnings`), pas de refus.
- PB2-R4. L'IBAN est chiffré (`lib/direct-debit/iban-crypto.ts`, AES-256-GCM,
  clé dédiée `DIRECT_DEBIT_IBAN_KEY`, format `ddk1:<id de clé>:<iv>:<tag>:<chiffré>`
  avec l'id de clé en données associées ; anciennes clés
  `DIRECT_DEBIT_IBAN_PREVIOUS_KEYS` pour la rotation, script
  `reencrypt-direct-debit-ibans`). Les valeurs `pg1` (ancien format,
  `PAYMENT_SECRETS_KEY`) restent lisibles, jamais écrites. Sont stockés
  en clair : code banque (5 caractères), 4 derniers caractères, nom du
  titulaire. **Aucune réponse d'API ne contient l'IBAN complet** ; l'affichage
  est `CI•• •••• •••• •••• •••• 0589` (masque construit côté API). Sans
  `DIRECT_DEBIT_IBAN_KEY` valide, la création échoue proprement
  (`BadRequestError` traduite), rien n'est écrit.
- PB2-R5. Modifier l'IBAN d'un mandat est interdit : on révoque et on en crée
  un autre (une banque ne connaît que l'autorisation signée).
- PB2-R6. Statuts : `DRAFT` (créé, autorisation pas encore signée) →
  `ACTIVE` (exige un scan signé déposé et une date de signature) ;
  `ACTIVE` ↔ `SUSPENDED` (motif obligatoire) ; `DRAFT | ACTIVE | SUSPENDED` →
  `REVOKED` (motif et date obligatoires, définitif). Toute autre transition →
  `ConflictError`/`BadRequestError` typée.
- PB2-R7. Un seul mandat `DRAFT | ACTIVE | SUSPENDED` par (bail, créancier).
- PB2-R8. Plafond facultatif (`maxAmount` > 0) ; jour de collecte propre au
  mandat facultatif (sinon celui du créancier).
- PB2-R9. Un bail terminé ou résilié n'accepte pas de nouveau mandat ; ses
  mandats restent consultables.
- PB2-R10. Chaque création, transition, dépôt de scan et téléchargement du
  PDF est audité (sans IBAN dans le détail de l'audit).

### PB3 — Documents du mandat

- PB3-R1. PDF « Autorisation de prélèvement » prérempli : créancier (agence,
  numéro d'émetteur), débiteur, IBAN **complet** (le débiteur le signe et le
  remet à sa banque), référence du mandat, bail, plafond, cases de date et
  de signature. Généré à la demande, jamais stocké, réservé à la permission
  de gestion.
- PB3-R2. Scan signé : PDF ou image (JPEG, PNG), 10 Mo au plus, stocké en
  fichier privé, servi uniquement par une route authentifiée qui vérifie
  l'agence. Déposé ou remplacé **seulement sur un mandat en brouillon** ; un
  mandat actif ou suspendu garde sa preuve (révoquer et recréer pour en
  changer). L'audit ne contient pas le chemin du fichier.
- PB3-R3. Le téléchargement du PDF à IBAN complet est audité dans la base
  avant l'envoi (action critique) ; un échec d'écriture bloque l'envoi.

### PB4 — Droits et module

- PB4-R1. Deux permissions : `RENTAL_DIRECT_DEBIT_VIEW` (consulter
  créanciers et mandats, IBAN masqué) et `RENTAL_DIRECT_DEBIT_MANAGE` (tout
  le reste, y compris le PDF à IBAN complet et le scan signé). La migration de
  données accorde VIEW à tout rôle qui a `RENTAL_PAYMENTS_VIEW`, et MANAGE
  aux seuls rôles `TENANT_ADMIN` et `TENANT_MANAGER` (audit de sécurité : un
  rôle qui encaisse seulement n'accède pas aux IBAN) ; les autres rôles la
  reçoivent par l'écran des rôles. Le seed de développement les accorde par
  le préfixe `RENTAL_` (administrateur et gestionnaire).
- PB4-R2. Toutes les routes sont sous `/api/tenants/:tenantId/rental/…` :
  garde d'agence (`requireTenantAccess`) et fonctionnalité `RENTAL` de
  l'abonnement (table `lib/subscription/route-features.ts`, règle `/rental`
  existante), sans règle nouvelle.

## 6. Critères de fin de P1

1. Migration appliquée sur une base vierge et sur la base de développement ;
   `schema-tenant-coverage` et `routes-inventory` passent.
2. Tests unitaires : normalisation et contrôle IBAN/RIB (cas valides réels
   publiés, clé fausse, longueur, pays), masque, chiffrement aller-retour,
   transitions de statut, unicité PB2-R7, refus d'une référence d'une autre
   agence, aucune réponse ne contient l'IBAN.
3. `npm run typecheck`, `npm run lint`, `npm run check:architecture`, tests
   API et web ciblés verts ; `npm run test:isolation` si la base dédiée est
   disponible (sinon : dit dans la PR).
4. Recette navigateur : créer un créancier, créer un mandat sur un bail,
   télécharger le PDF, déposer un scan, activer, suspendre, révoquer ;
   l'IBAN n'est visible en clair nulle part dans l'interface ni dans les
   réponses réseau.
5. Classeur des fonctionnalités mis à jour et `npm run wiki:export` lancé.

## 7. Exigences de P3 (retour banque)

Contrat : [data-model.md](data-model.md) §8, retours de recette du staging
compris (§8.12). Décisions D3, D4 et D5 (§3).

### PB5 — Retour banque

- PB5-R1. **Constat.** Une ligne de remise déposée reçoit un constat, réglée
  ou rejetée. Le constat est **manuel** (ligne par ligne, ou toute la remise
  d'un coup) ou **importé** d'un fichier de retour. Le loyer ne compte comme
  payé qu'au constat de règlement (D3). Règles et préconditions : §8.3, §8.4.
- PB5-R2. **Règlement par encaisseur.** L'encaissement dépend du périmètre de
  la ligne (un encaisseur par périmètre). En locatif, il crée un paiement
  `DIRECT_DEBIT` réussi, la ventilation sur l'échéance et la quittance (§8.6).
  Une transaction par ligne ; une ligne déjà traitée donne un conflit clair.
- PB5-R3. **Rejet.** Le rejet porte une date, un code et/ou un motif. Il
  rend la ligne représentable, incrémente le compteur du mandat et suspend le
  mandat au seuil du créancier (D5), avec un audit critique (§8.4). Le
  débiteur reçoit un e-mail (§8.8).
- PB5-R4. **Rejet tardif.** Une ligne déjà réglée peut être rejetée après
  coup : en locatif, l'encaissement est contre-passé et sa quittance annulée.
  L'écran prévient avant de confirmer (§8.10).
- PB5-R5. **Frais de rejet.** En locatif, si le créancier fixe des frais (D4),
  ils sont refacturés sur l'échéance et exclus des sommes dues au
  propriétaire (§8.6).
- PB5-R6. **Import d'un fichier de retour.** Format `GENERIC_CSV` de retour,
  lecture en deux temps (aperçu sans écriture, puis application du même
  fichier). Fichier de 2 Mo et 5 000 lignes au plus. Chaque enregistrement est
  rapproché par sa référence d'opération ; les écarts (référence inconnue,
  montant différent, déjà traité, conflit, date hors bornes) sont écartés avec
  une raison traduite, jamais appliqués. Rejouer le fichier ne change rien
  (§8.5). Le fichier n'est pas conservé : seules son empreinte et ses
  compteurs le sont.
- PB5-R7. **Retours de recette (17/10/2026).** Les mandats non retenus à la
  sélection (brouillon, suspendu) sont listés en permanence sur la remise avec
  leur raison ; les téléchargements confirment le nom du fichier ou
  signalent l'erreur ; chaque avis de prénotification garde l'adresse
  **masquée** du destinataire et sa provenance (compte portail ou fiche
  contact), et l'écran le dit (§8.12).
- PB5-R8. **Droits et audit.** Écritures sous `RENTAL_DIRECT_DEBIT_MANAGE`,
  lecture sous `_VIEW` (PB4). Quatre actions d'audit critiques, sans IBAN
  (§8.9).

Hors P3 : §8.11.

## 8. Exigences de P4 (copropriété)

Contrat : [data-model.md](data-model.md) §9. Décision D1 (§3).

### PB6 — Copropriété

- PB6-R1. **Créancier du syndicat.** Le créancier est le compte bancaire du
  syndicat, pas un compte de trésorerie de l'agence. Un seul par syndicat
  (§9.1, §9.3).
- PB6-R2. **Mandat par lot.** Le débiteur est un contact copropriétaire du
  lot ; un seul mandat ouvert par lot et par créancier. Même contrôle et même
  chiffrement de l'IBAN, mêmes statuts, même PDF et même scan qu'en P1 (§9.3).
- PB6-R3. **Remise du syndicat.** Pour chaque lot à mandat actif : somme des
  appels de charges échus et non soldés, plus ancien d'abord, plafonnée par le
  mandat. Les pénalités de retard ne sont jamais prélevées (§9.1, §9.3).
- PB6-R4. **Règlement.** Le constat crée un paiement de charges (méthode
  `DIRECT_DEBIT`), puis les reçus et quittances de la copropriété. Un
  trop-perçu devient une avance du lot (§9.1, §9.3).
- PB6-R5. **Rejet.** Un rejet avant règlement suit PB5-R3. Le **rejet tardif
  est refusé** : aucune contre-passation d'un paiement de charges n'existe, la
  régularisation se fait en comptabilité. Les **frais de rejet ne sont pas
  refacturés**. Le compteur et la suspension (D5) s'appliquent (§9.1, §9.3).
- PB6-R6. **Étanchéité des périmètres.** Les routes et services locatifs ne
  voient que le locatif, ceux de la copropriété que le syndicat de la route :
  un identifiant de l'autre périmètre donne un 404 (§9.2).
- PB6-R7. **Droits et module.** Routes sous
  `/syndics/:syndicId/prelevements`, fonctionnalité d'abonnement `SYNDIC`,
  permissions `SYNDIC_DIRECT_DEBIT_VIEW` et `_MANAGE`, attribuées comme en
  PB4-R1 (§9.1, §9.2).
- PB6-R8. **Écran.** Onglet « Prélèvements » de Syndic › Finances : compte du
  syndicat, mandats, remises, import d'un retour (§9.6).

Hors P4 : §9.7 (les portails copropriétaire relèvent de P5).

## 9. Exigences de la signature électronique du mandat

Contrat : [data-model.md](data-model.md) §10. S'appuie sur le module de
signature ([spec 044](../044-signature-electronique/spec.md)).

### PB7 — Signature électronique du mandat (option)

- PB7-R1. **Option.** L'agence peut envoyer l'autorisation d'un mandat en
  brouillon, sans scan déposé, pour signature électronique au débiteur. Le
  papier reste possible ; déposer un scan annule une demande en cours (§10.1,
  §10.6).
- PB7-R2. **Document signé.** Le PDF à signer est l'autorisation de P1 (IBAN
  complet, car le débiteur la remet à sa banque). Le PDF scellé tient lieu de
  scan signé ; la date de signature est reprise, mais **l'activation reste un
  geste de l'agence** (§10.1, §10.4).
- PB7-R3. **Deux types de document** : mandat locatif et mandat de
  copropriété, chacun sous la permission `_MANAGE` et la fonctionnalité de son
  périmètre (§10.4).
- PB7-R4. **Code avant consultation.** Le lien ne montre rien sans le code à
  usage unique, ni le PDF ni l'IBAN. Pas de signature « sur place » (§10.2
  SIG-S1, SIG-S2, §10.5).
- PB7-R5. **L'IBAN complet reste dans le PDF.** Partout ailleurs (titre,
  messages, journaux, audit, preuve), au plus le masque. L'empreinte des
  données est non réversible (§10.2 SIG-S3, SIG-S4).
- PB7-R6. **Accès et traçabilité.** Lecture des PDF réservée aux détenteurs de
  `_MANAGE`, chaque lecture auditée avant l'envoi. La signature produit un
  audit critique (§10.2 SIG-S5, §10.7).
- PB7-R7. **Fournisseur.** Fournisseur interne ou Yousign ; avec Yousign,
  ImmoTopia garde la porte (invitation et code par ImmoTopia, lien Yousign
  remis après vérification du code). Le PDF à IBAN complet est transmis à
  Yousign : risque accepté, écrit dans SECURITY.md (§10.2 SIG-S6).

Hors périmètre : §10.8.

## 10. Critères de fin de P3

1. Migrations (statuts de ligne, puis retour banque) appliquées sur une base
   vierge et sur la base de développement ; `schema-tenant-coverage` et
   `routes-inventory` passent.
2. Tests unitaires : constat de règlement (paiement, ventilation, quittance
   idempotente, compteur remis à zéro), constat de rejet (frais, suspension au
   seuil, ligne représentable), rejet tardif et contre-passation, double
   constat concurrent, bornes de date, parseur de retour (en-têtes, formats de
   date et de montant, lignes illisibles, plafonds), rapprochement (chaque
   raison d'écart), rejeu d'un fichier, aucune réponse ne contient un IBAN
   complet ni une adresse e-mail complète.
3. `npm run typecheck`, `npm run lint`, `npm run check:architecture`, tests API
   et web ciblés verts ; `npm run test:isolation` si la base dédiée est
   disponible (sinon : dit dans la PR).
4. Recette navigateur : remise déposée, règlement d'une ligne, rejet d'une
   ligne, rejet tardif, « Tout constater réglé », import d'un retour (aperçu
   puis application, puis rejeu) ; les points de data-model.md §8.12 vérifiés.
5. Classeur des fonctionnalités mis à jour et `npm run wiki:export` lancé.

## 11. Critères de fin de P4

1. Migrations (valeurs d'énumération, copropriété, permissions) appliquées sur
   une base vierge et sur la base de développement ; couverture de schéma et
   inventaire des routes verts.
2. Tests unitaires : créancier du syndicat, mandat par lot et choix du
   copropriétaire, sélection (ordre des appels, plafond, avance, raisons de
   non-sélection), encaisseur de copropriété (paiement, quittances, rejet
   tardif refusé, aucun frais), étanchéité locatif et copropriété (404
   croisés), permissions.
3. Mêmes vérifications que le point 3 de P3.
4. Recette navigateur sur un syndicat : créancier, mandat, remise, constats,
   import d'un retour, contrôle de la comptabilité de la copropriété.
5. Classeur des fonctionnalités mis à jour et `npm run wiki:export` lancé.

## 12. Critères de fin de la signature électronique du mandat

1. Migrations (types de document, parcours code avant consultation) appliquées ;
   `signature-kinds-sync`, couverture de schéma et inventaire des routes verts.
2. Tests unitaires : conditions d'envoi (brouillon, sans scan, périmètre), refus
   du canal « sur place », aucun accès au fichier sans jeton de consultation
   valide, expiration du jeton, aucun IBAN complet hors du PDF (titre,
   messages, réponses, preuve, audit), empreinte non réversible, scellement
   puis reprise comme scan signé, annulation par dépôt d'un scan ou par
   révocation, audit des lectures, parcours Yousign simulé (aucun envoi par le
   fournisseur, lien lu en direct).
3. Mêmes vérifications que le point 3 de P3 ; les types de signature existants
   restent inchangés (tests de la spec 044 verts).
4. Recette navigateur : envoi d'un mandat locatif puis d'un mandat de
   copropriété, code demandé avant l'affichage, signature, PDF scellé tenant
   lieu de scan, activation avec la date pré-remplie.
5. Classeur des fonctionnalités mis à jour et `npm run wiki:export` lancé.
