# 046 — Discussion écrite modérée dans la visio de l'AG (Syndic)

**Statut :** réalisé, recette jouée, PR à relire (branche `feat/syndic-ag-visio-discussion`, empilée sur `feat/syndic-ag-visio`, PR 144)
**Date :** 2026-10-16
**Module :** Syndic (spec 013), AG en direct (spec 043), visio intégrée (spec 045)

## Objectif

La spec 045 (décision V10) a laissé la salle de visio sans discussion écrite :
le copropriétaire écoute, regarde et lève la main. Le fondateur a décidé le
2026-10-16 d'ouvrir **une discussion écrite modérée** aux copropriétaires
présents en visio, dans un lot distinct de la PR 144 :

1. le copropriétaire qui a rejoint l'AG et se trouve dans la salle de visio
   écrit de courts messages, visibles de tous les participants de la salle ;
2. le gestionnaire écrit aussi (annonces, réponses) ;
3. le gestionnaire **modère** : il masque un message, coupe l'écriture d'un
   participant, ferme ou rouvre la discussion pour toute la salle ;
4. les messages sont **conservés** par ImmoTopia et relus par le gestionnaire
   dans la console, y compris après la séance ;
5. **rien ne se vote par la discussion** : le vote reste celui de la spec 043.

## Conception retenue (évaluation de la recommandation)

Deux voies possibles :

- **A. Donner `canPublishData` aux copropriétaires** et laisser chaque client
  publier ses messages dans LiveKit. Rejetée : aucun contrôle serveur avant
  la diffusion (longueur, débit, contenu), aucune trace durable, masquage et
  coupure impossibles sans réécrire les permissions de chacun, aucun
  historique pour celui qui arrive en retard ; et tout sujet de données
  ajouté plus tard (comme `ag-refresh`) devrait se défendre contre des
  messages forgés par un participant.
- **B. Messages envoyés à l'API d'ImmoTopia, stockés, puis diffusés par le
  serveur.** Retenue : route publique par lien personnel (même gabarit que
  la spec 043 : POST, jeton dans le corps, 404 uniforme, limiteur par IP puis
  par jeton, zod), stockage en base avec `tenantId`, diffusion par
  `sendData` côté serveur sur le sujet dédié `ag-discussion`. **Personne
  n'obtient `canPublishData`** (ni copropriétaire, ni gestionnaire) : tout
  message de données vient du serveur, et le client rejette un message qui
  porte un émetteur, comme pour `ag-refresh` (V11). Aucune donnée de vote,
  de lot, de tantième ni de coordonnée ne passe par ce canal.

## Décisions

Le principe (discussion écrite modérée pour les copropriétaires en visio,
lot distinct de la PR 144) est **décidé par le fondateur le 2026-10-16**. Les
règles M ci-dessous sont des valeurs par défaut du Pilote, choisies pour être
les plus sûres, **à valider par le fondateur** ; aucune ne bloque la
réalisation.

| #   | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **Qui écrit.** Le copropriétaire porteur d'un lien personnel valide, quand l'AG est `IN_PROGRESS`, qu'il l'a rejointe (`joinedAt`, D2 de la spec 043), que la visio est configurée et qu'il est **présent dans la salle de visio** (même contrôle que la main levée, V7). Le gestionnaire (`SYNDIC_EDIT`) écrit pendant `IN_PROGRESS`, sans être tenu d'être dans la salle. Personne d'autre : pas de lecture ni d'écriture anonyme.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| M2  | **Qui lit.** Les participants présents dans la salle reçoivent les messages en direct. Un copropriétaire qui remplit M1 sauf la présence dans la salle lit l'historique (les **200 derniers** messages) par HTTP, à la connexion et après une reconnexion. Après la clôture ou l'annulation de l'AG, les copropriétaires n'y ont plus accès (409). Le gestionnaire (`SYNDIC_VIEW`) relit toute la discussion (les 1 000 derniers messages) à tout moment, y compris après la séance.                                                                                                                                                                                                                                                                                                                                                                                                           |
| M3  | **Format.** Texte brut, **500 caractères au plus** après normalisation : espaces de début et de fin retirés, retours chariot unifiés en `\n`, caractères de contrôle retirés (sauf le saut de ligne), ainsi que les contrôles bidirectionnels (U+202A–U+202E, U+2066–U+2069), les invisibles (U+200B, U+2060, U+FEFF, U+00AD) et les caractères « tag » (U+E0000–U+E007F) — ZWNJ/ZWJ et LRM/RLM/ALM sont gardés (persan, emojis composés, arabe mixte) ; lignes blanches réduites, au plus deux sauts de ligne consécutifs. Vide ou sans caractère visible après normalisation : 400. À l'écran, nom et texte sont isolés (`<bdi dir="auto">`) : un texte arabe dans une page française, ou l'inverse, ne déborde pas sur son voisinage. Le texte n'est **jamais interprété** comme HTML ni Markdown ; les adresses web restent du texte, **non cliquables** (pas d'hameçonnage par la salle). |
| M4  | **Débit.** Envoi limité à **10 messages par minute et par lien** (limiteur par jeton, clé propre à la discussion) et à **120 par minute et par AG**, gestionnaire compris (compteur en mémoire du processus ; au-delà 429 « Trop de messages dans cette assemblée, patientez un instant ») ; lecture de l'historique limitée à 30 par minute et par lien. Au-delà : 429 « Vous écrivez trop vite, patientez un instant » côté écran. Le limiteur par IP partagé de la spec 043 s'applique d'abord.                                                                                                                                                                                                                                                                                                                                                                                             |
| M5  | **Ouverture.** La discussion est **ouverte par défaut** dès que l'AG est en cours. Le gestionnaire la **ferme** ou la **rouvre** pour toute la salle (`GeneralMeeting.chatClosedAt`). Fermée : les copropriétaires lisent toujours mais n'écrivent plus (409) ; le gestionnaire peut encore écrire (annonces). Clôture ou annulation de l'AG : plus personne n'écrit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| M6  | **Couper l'écriture d'un participant** (`GMParticipant.chatMutedAt`) : il lit toujours, n'écrit plus (409) ; il en est prévenu dans la salle par un message ciblé. La coupure vaut pour toute l'AG et survit à une reconnexion. « Rétablir l'écriture » l'annule. L'exclusion de la visio (V9) ne coupe pas l'écriture, mais retire le participant de la salle, donc il ne peut plus écrire (M1) tant qu'il n'y revient pas. La fermeture (M5) et la coupure sont relues dans la transaction qui crée le message : un envoi en vol au moment de l'une ou l'autre est refusé (sans verrou de ligne : deux requêtes rigoureusement simultanées restent possibles).                                                                                                                                                                                                                               |
| M7  | **Masquer un message** : le message disparaît chez tous au profit de la mention « Message masqué par le gestionnaire » ; son texte n'est **plus jamais servi aux copropriétaires**. Il reste en base, visible du gestionnaire dans la console avec la marque « masqué », et peut être **rétabli**. Pas de suppression définitive dans ce lot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| M8  | **Conservation.** Messages stockés en base (`GMChatMessage`, `tenantId` porté), conservés tant que l'AG existe et supprimés avec elle, sans purge automatique, dans l'esprit de R10 de la spec 045 (conservation jusqu'à suppression, décision du fondateur du 2026-10-16) ; pas de suppression unitaire dans ce lot (masquage seulement, M7). Inclus dans l'export complet des données de l'agence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| M9  | **Procès-verbal.** La discussion **n'entre pas** dans le procès-verbal ni dans le compte rendu Word : un message n'est ni une intervention en séance ni un vote. Le gestionnaire la relit dans la console et reporte au procès-verbal, à la main, ce qu'il juge utile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| M10 | **Information des participants.** Mention permanente en tête du panneau : « Vos messages sont visibles de tous les participants de la visio et conservés par le syndic. Un message ne vaut pas vote. » Pas de consentement séparé.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| M11 | **Enregistrement.** L'enregistrement vidéo de la spec 045 (Egress composite, grille LiveKit) **ne capte pas** la discussion : le panneau n'est pas dans la grille enregistrée. Les messages, eux, sont conservés en base (M8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M12 | **Identité affichée.** Nom du contact pour un copropriétaire ; prénom et nom de l'utilisateur, avec la marque « Gestionnaire », pour le gestionnaire. Le nom est **figé à l'envoi**. Aucune autre donnée (lot, tantièmes, coordonnées). L'identité LiveKit de l'auteur (id du `GMParticipant` ou `gestionnaire-<userId>`, déjà visible de toute la salle, V4 et V13) accompagne le message pour que chacun reconnaisse les siens.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| M13 | **Audit.** Les actions de modération sont auditées, sans le texte des messages : `SYNDIC_MEETING_CHAT_MESSAGE_HIDDEN`, `SYNDIC_MEETING_CHAT_MESSAGE_RESTORED`, `SYNDIC_MEETING_CHAT_PARTICIPANT_MUTED`, `SYNDIC_MEETING_CHAT_PARTICIPANT_UNMUTED`, `SYNDIC_MEETING_CHAT_OPENED`, `SYNDIC_MEETING_CHAT_CLOSED`. L'envoi d'un message n'est pas audité : la ligne du message (auteur, horodatage) en est la trace durable, et un audit par message doublerait le volume sans rien apprendre de plus.                                                                                                                                                                                                                                                                                                                                                                                             |
| M14 | **Isolation.** Toute lecture et écriture est filtrée par `tenantId` et par l'AG ; un `messageId` ou un `participantId` d'une autre AG ou d'une autre agence reçoit la même 404 qu'un objet inexistant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| M15 | **Diffusion au mieux.** Le message est d'abord enregistré, puis diffusé par `sendData` (fiable, sujet `ag-discussion`) ; un échec de diffusion est journalisé sans détail et ne fait pas échouer l'envoi (les autres le verront à leur prochaine lecture de l'historique).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Modèle de données (migration `20261016150000_syndic_ag_discussion`)

```prisma
enum GMChatAuthorKind {
  COOWNER
  MANAGER
}

/// Message de la discussion écrite de la visio d'une AG (spec 046).
model GMChatMessage {
  id             String           @id @default(uuid()) @db.Uuid
  tenantId       String           @map("tenant_id")
  meetingId      String           @map("meeting_id") @db.Uuid
  authorKind     GMChatAuthorKind @map("author_kind")
  /// GMParticipant auteur (COOWNER) ; nul pour le gestionnaire.
  participantId  String?          @map("participant_id") @db.Uuid
  /// Utilisateur auteur (MANAGER) ; nul pour un copropriétaire.
  authorUserId   String?          @map("author_user_id")
  /// Nom affiché, figé à l'envoi (M12).
  authorName     String           @map("author_name")
  /// Texte brut normalisé, 500 caractères au plus (M3).
  body           String
  hiddenAt       DateTime?        @map("hidden_at")
  hiddenByUserId String?          @map("hidden_by_user_id")
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")

  tenant      Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  meeting     GeneralMeeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  participant GMParticipant? @relation(fields: [participantId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([meetingId, createdAt])
  @@map("gm_chat_messages")
}

// GeneralMeeting : chatClosedAt DateTime? @map("chat_closed_at")  -- discussion fermée (M5)
// GMParticipant  : chatMutedAt  DateTime? @map("chat_muted_at")   -- écriture coupée (M6)
```

`GMChatMessage` porte `tenantId` : `schema-tenant-coverage.test.ts` le classe
cloisonné et `tenant-data-export/model-registry.ts` l'exporte, tous deux en le
déduisant du schéma (comme `GMRecording`, R7).

## Contrat d'API

Erreurs typées (`asyncHandler`), validation zod. Visio non configurée :
**409** « La visio intégrée n'est pas activée » (écriture). LiveKit
injoignable pour le contrôle de présence : **503** « La visio est
momentanément indisponible ».

```ts
type DiscussionMessageView = {
  id: string;
  authorKind: "COOWNER" | "MANAGER";
  authorIdentity: string; // identité LiveKit : id du GMParticipant ou `gestionnaire-<userId>`
  authorName: string;
  body: string | null; // null quand le message est masqué (vue copropriétaire)
  hidden: boolean;
  createdAt: string; // ISO
};
```

### Public (lien personnel)

Préfixe `/api/public/assemblees`, mêmes protections que la spec 043 : POST
seulement, JSON 4 Ko, en-têtes `no-store`, limiteur par IP partagé, puis
limiteur par jeton ; jeton absent, mal formé, inconnu, expiré ou révoqué =
404 uniforme ; reste du corps invalide = 400 avec le détail des champs.

| Chemin                | Limiteur par jeton          | Corps             | Réponse                                                                                                                                                          |
| --------------------- | --------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/discussion`         | 30/min (`discussion`)       | `{ token }`       | `{ data: PublicDiscussionView }` — 409 si visio non configurée, AG non `IN_PROGRESS` ou pas rejoint                                                              |
| `/discussion/envoyer` | 10/min (`discussion-envoi`) | `{ token, body }` | `{ data: DiscussionMessageView }` — 409 si discussion fermée, écriture coupée, pas dans la visio, AG non en cours, pas rejoint ; 400 si `body` vide ou trop long |

```ts
type PublicDiscussionView = {
  open: boolean; // discussion ouverte pour la salle (M5)
  muted: boolean; // mon écriture est coupée (M6)
  canWrite: boolean; // open && !muted (la présence dans la salle se vérifie à l'envoi)
  maxLength: number; // 500
  messages: DiscussionMessageView[]; // 200 derniers, ordre chronologique ; masqués avec body null
};
```

Messages d'erreur 409 (français, clé de traduction) :
« La discussion est fermée par le gestionnaire »,
« Le gestionnaire a suspendu votre droit d'écrire »,
et ceux de la spec 045 : « Vous n'êtes pas dans la visio »,
« L'assemblée n'est pas en cours : la visio est fermée »,
« Rejoignez l'assemblée avant d'entrer en visio ».

### Gestionnaire

Préfixe `/api/tenants/:tenantId/syndics/:syndicId/assemblees/:meetingId`.

| Méthode | Chemin                                          | Permission  | Corps                  | Réponse                                                                                                          |
| ------- | ----------------------------------------------- | ----------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET     | `/visio/discussion`                             | SYNDIC_VIEW | —                      | `{ data: ManagerDiscussionView }` (toujours 200 pour une AG de l'agence, même visio non configurée ou AG close)  |
| POST    | `/visio/discussion/messages`                    | SYNDIC_EDIT | `{ body }`             | `{ data: ManagerDiscussionMessageView }` — 409 si AG non `IN_PROGRESS` ou visio non configurée                   |
| POST    | `/visio/discussion/messages/:messageId/masquer` | SYNDIC_EDIT | `{ hidden: boolean }`  | `{ data: ManagerDiscussionMessageView }` — 404 si le message n'est pas de cette AG ; idempotent                  |
| POST    | `/visio/discussion/etat`                        | SYNDIC_EDIT | `{ open: boolean }`    | `{ data: { open: boolean } }` — 409 si AG close ou annulée ; idempotent                                          |
| POST    | `/visio/participants/:participantId/ecriture`   | SYNDIC_EDIT | `{ allowed: boolean }` | `{ data: { participantId: string; muted: boolean } }` — 404 si le participant n'est pas de cette AG ; idempotent |

```ts
type ManagerDiscussionMessageView = Omit<DiscussionMessageView, "body"> & {
  body: string; // toujours le texte, même masqué
  participantId: string | null;
  hiddenAt: string | null;
  hiddenByName: string | null;
};

type ManagerDiscussionView = {
  enabled: boolean; // visio configurée (écriture possible)
  open: boolean;
  maxLength: number; // 500
  mutedParticipantIds: string[]; // GMParticipant dont l'écriture est coupée
  messages: ManagerDiscussionMessageView[]; // 1 000 derniers, ordre chronologique
};
```

`MeetingVisioAdminView.participants[]` (spec 045) gagne `chatMuted: boolean`
(toujours `false` pour un gestionnaire).

Les corps des routes du gestionnaire sont `.strict()`. Le texte suit M3
(normalisation puis 1 à 500 caractères).

### Messages de données (sujet `ag-discussion`)

Envoyés par le serveur seulement (`sendData`, fiable), JSON :

| Contenu                                                    | Destinataires                                          | Quand                                           |
| ---------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `{ "type": "message", "message": DiscussionMessageView }`  | toute la salle                                         | message envoyé (copropriétaire ou gestionnaire) |
| `{ "type": "hidden", "id": "<messageId>" }`                | toute la salle                                         | message masqué                                  |
| `{ "type": "restored", "message": DiscussionMessageView }` | toute la salle                                         | message rétabli                                 |
| `{ "type": "state", "open": boolean }`                     | toute la salle                                         | discussion fermée ou rouverte                   |
| `{ "type": "muted", "muted": boolean }`                    | le seul participant concerné (`destinationIdentities`) | écriture coupée ou rétablie                     |

Le client ignore tout message de ce sujet qui porte un participant émetteur,
tout contenu illisible et tout type inconnu ; il dédoublonne par `id` (l'auteur
reçoit son propre message par la réponse HTTP et par la diffusion).

### Audit

Voir M13. Charge : `meetingId`, `messageId` ou `participantId` (et
`contactId`), jamais le texte.

## Écrans

- **Salle (`MeetingVisioRoom`)**, pour le copropriétaire et le gestionnaire,
  quand l'écran lui fournit la discussion : bouton « Discussion » dans la
  barre du bas, avec pastille du nombre de messages non lus. Il ouvre un
  panneau : à côté de la grille sur une salle large (≥ 768 px), à la place
  de la grille sur une salle étroite (bouton « Retour à la vidéo »). Le
  panneau montre la mention M10, la liste des messages (nom, marque
  « Gestionnaire », heure, texte en `pre-wrap` avec coupure des mots longs ;
  message masqué : « Message masqué par le gestionnaire » en italique),
  rôle `log` pour les lecteurs d'écran, défilement automatique vers le bas
  sauf si l'utilisateur a remonté la liste. Zone de saisie : 500 caractères
  avec compteur, Entrée envoie, Maj+Entrée revient à la ligne, bouton
  « Envoyer ». Discussion fermée : « Le gestionnaire a fermé la
  discussion. » ; écriture coupée : « Le gestionnaire a suspendu votre droit
  d'écrire. » ; trop vite : « Vous écrivez trop vite, patientez un
  instant. ». Pour le gestionnaire, chaque message porte « Masquer » ou
  « Rétablir » (le texte d'un message masqué reste lisible pour lui, grisé).
- **Page publique `/ag-direct`** : la salle reçoit la discussion du
  copropriétaire ; rien d'autre ne change. Sur mobile, le panneau vit dans
  l'onglet « Visio ».
- **Console (onglet « En direct »)** : carte « Discussion » sous la visio
  intégrée : interrupteur « Discussion ouverte aux copropriétaires », liste
  complète (vue du gestionnaire, masqués compris avec la marque « masqué »),
  « Masquer » / « Rétablir », zone de saisie du gestionnaire pendant la
  séance ; lecture toutes les 5 s pendant `IN_PROGRESS`, une fois sinon.
  Après la séance, la carte reste en lecture seule si des messages existent.
  Liste des participants en visio : action « Couper l'écriture » /
  « Rétablir l'écriture » et marque « écriture coupée ».

Toutes les marges en propriétés logiques (RTL arabe), tous les libellés par
`t()`, aucun `dangerouslySetInnerHTML`.

## Critères d'acceptation

1. Sans variables LiveKit : aucune discussion dans les écrans ;
   `POST /discussion` et `/discussion/envoyer` répondent 409 ;
   `GET /visio/discussion` répond 200 `enabled: false`.
2. Un copropriétaire qui a rejoint l'AG en cours et se trouve dans la salle
   envoie un message ; tous les participants de la salle le voient sans
   recharger, avec son nom ; il apparaît dans la console.
3. Avant « Rejoindre », hors `IN_PROGRESS` : 409 ; hors de la salle : 409
   à l'envoi ; jeton invalide, expiré ou révoqué : 404 ; plus de 10 envois
   par minute : 429 ; texte vide ou de plus de 500 caractères : 400.
4. Un texte contenant du HTML ou du script s'affiche tel quel, en texte, sans
   être exécuté ni interprété ; une adresse web n'est pas cliquable.
5. Le gestionnaire masque un message : il disparaît chez tous (mention
   « masqué ») et l'historique public ne le sert plus ; il le rétablit : il
   réapparaît.
6. Le gestionnaire coupe l'écriture d'un participant : ce dernier en est
   prévenu et son envoi reçoit 409 ; rétablie, il écrit de nouveau.
7. Le gestionnaire ferme la discussion : les copropriétaires ne peuvent plus
   écrire (409, mention dans le panneau), le gestionnaire si ; il la rouvre.
8. Une agence ne lit, n'écrit, ne masque ni ne coupe rien dans une AG d'une
   autre agence (404) ; un `messageId` d'une autre AG de la même agence : 404.
9. Aucun participant n'obtient `canPublishData` ; un message de données
   portant un émetteur est ignoré par le client.
10. Après la clôture, le gestionnaire relit la discussion dans la console ;
    les copropriétaires n'y accèdent plus (409).

## Recette (2026-10-16)

Jouée dans le navigateur sur l'instance de démo (base `immotopia_demo`,
migration `20261016150000` appliquée) avec la pile LiveKit locale gratuite de
`docs/recette/SCENARIO_SYNDIC_AG_VISIO.md`, AG « recette visio 2 » d'Horizon
Syndic Gestion, deux copropriétaires (A, B) et la gestionnaire ; scénario
D1–D9 du même document.

Passés : message de A reçu en direct par B (pastille « 1 message non lu »),
HTML et adresse affichés en texte (aucune image, aucun gras, aucun lien,
aucune alerte), Maj+Entrée, compteur 500, 429 au 11e envoi de la minute avec
le texte conservé, message du gestionnaire marqué « Gestionnaire », masquer
(disparition en direct, `body: null` dans l'historique public `no-store`) et
rétablir, couper l'écriture (avis ciblé, saisie désactivée, 409 par l'API, B
écrit toujours) et la rétablir, fermer la discussion (409 pour les
copropriétaires, le gestionnaire écrit encore, mention propre au
gestionnaire) et la rouvrir, 409 hors de la salle, 404 pour un lien inconnu,
400 pour un texte vide, trop long ou fait de seuls caractères invisibles,
contrôle bidirectionnel retiré et RLM gardé, 404 pour un message inexistant
ou d'une autre AG et pour une autre agence, corps strict (400), relecture
d'une AG close par le gestionnaire ; 375 px en arabe (RTL, onglets, panneau
à la place de la grille, « Retour à la vidéo ») ; grande largeur (panneau de
339 px à côté de la grille) ; écriture dans la transaction sur PostgreSQL ;
aucun texte de message dans les journaux de l'API, aucun avertissement de la
garde de tenant.

Corrigé pendant la recette et les relectures : panneau ouvert en haut de la
liste au lieu des derniers messages, ponctuation d'un message français
déplacée dans une page arabe (isolement `<bdi dir="auto">`), historique non
relu à la connexion LiveKit, grille remontée à l'arrivée de la discussion,
relecture tardive qui annulait un événement plus récent, caractères
bidirectionnels et invisibles, plafond par AG, course contrôle → écriture.

Non vérifié : clôture de l'AG pendant la discussion dans le navigateur
(couvert par les tests de l'API), perte réelle de messages entre le montage
et la connexion (couverte par un test), LiveKit Cloud, charge (300
participants, 120 messages par minute), plusieurs instances de l'API (le
plafond par AG est propre au processus).

## Hors périmètre

Messages privés, réactions, pièces jointes, mise en forme, liens cliquables,
traduction, suppression définitive, purge automatique, export de la
discussion, insertion au procès-verbal, discussion hors visio (portail),
filtre automatique de contenu, notification hors de la salle.
