# 045 — Visio intégrée à l'AG en direct (Syndic)

**Statut :** réalisé, recette jouée, PR à relire (branche `feat/syndic-ag-visio`)
**Date :** 2026-10-16
**Module :** Syndic (spec 013), AG en direct (spec 043)
**Numéro :** 044 étant pris par la signature électronique, ce lot porte le 045.

## Objectif

Tenir l'assemblée générale en visioconférence **dans ImmoTopia**, à côté du
vote en ligne de la spec 043 :

1. le copropriétaire qui a rejoint l'AG en direct entre dans la salle vidéo
   depuis la même page, voit et entend le gestionnaire, lève la main ;
2. le gestionnaire anime la salle depuis sa console : il parle, partage son
   écran, donne et retire la parole, exclut un intrus ;
3. le gestionnaire **enregistre** la séance (décision du fondateur du
   2026-10-16) ; tous les participants en sont avertis ; le fichier est
   rapatrié dans le stockage privé d'ImmoTopia et rattaché à l'AG ;
4. le vote reste celui de la spec 043 (routes HTTP, registre durable,
   tantièmes, audit, verrou consultatif) : **rien ne se vote par la vidéo**.

## Origine du code

Le module de classes en direct d'École Digitale (`bkourouma/EcoleDigitaleV2`)
repose sur LiveKit : `apps/api/src/services/livekit.service.ts` (salle, jeton,
modération, enregistrement, webhooks) et
`packages/ui/src/components/LiveSessionRoom.tsx` (grille, barre de contrôle,
main levée). ImmoTopia **porte** ce code et intègre LiveKit lui-même, comme
`formation-pro-public` le fait pour son propre domaine d'authentification :
aucun appel à l'API d'École Digitale à l'exécution.

## Décisions

V1, V5, V6 (projet dédié, entrée sans droit de publier, parole donnée par le
gestionnaire) et la livraison jusqu'à la PR sont **confirmées par le
fondateur le 2026-10-16**, ainsi que LiveKit Cloud (V1), le chat modéré en lot
suivant (V10), l'information dans la convocation (R2) et la conservation jusqu'à
suppression (R10) ; l'enregistrement entre dans le lot (R1–R10
ci-dessous, V14 remplacée). Les autres décisions V sont des valeurs par
défaut du Pilote, à valider.

| #   | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | **Projet LiveKit dédié à ImmoTopia sur LiveKit Cloud** (décision du fondateur du 2026-10-16), jamais celui d'École Digitale. Variables `LIVEKIT_URL` (`wss://`, `ws://` toléré en développement et test seulement), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (32 caractères au moins) : les trois ou aucune. Le compte et le projet sont créés par l'utilisateur (dépense), puis les clés posées dans l'environnement du staging et de la production (déploiement avec son accord).                                                                                                                                                                              |
| V2  | **Visio facultative.** Sans LiveKit configuré, rien ne change : la page garde le lien externe `videoConferenceUrl` (D10 de la spec 043). Configurée, la visio intégrée est proposée sur toutes les AG de l'agence ; le lien externe, s'il est renseigné, reste affiché en secours.                                                                                                                                                                                                                                                                                                                                                                              |
| V3  | **Une salle par AG** : `t_<tenantId>__ag_<meetingId>`, 300 participants au plus, fermeture automatique 10 min après le départ du dernier participant. Créée à la première demande de jeton. La clôture (`COMPLETED`) ou l'annulation (`CANCELLED`) de l'AG ferme la salle (au mieux : un échec n'empêche pas la clôture).                                                                                                                                                                                                                                                                                                                                       |
| V4  | **Copropriétaire** : jeton délivré seulement si l'AG est `IN_PROGRESS` **et** qu'il a rejoint (`joinedAt`). Entrer en visio n'émarge pas, sortir de la visio ne désémarge pas : la présence reste le clic sur « Rejoindre l'assemblée » (D2 inchangée). Identité LiveKit = id du `GMParticipant` ; nom = nom du contact ; aucune métadonnée, aucune coordonnée.                                                                                                                                                                                                                                                                                                 |
| V5  | **Le copropriétaire entre micro et caméra coupés, sans droit de publier** (`canPublish: false`), sans canal de données (`canPublishData: false`), sans droit de changer son nom (`canUpdateOwnMetadata: false`). Il écoute, regarde et lève la main.                                                                                                                                                                                                                                                                                                                                                                                                            |
| V6  | **Gestionnaire = modérateur** (`SYNDIC_EDIT`) : identité `gestionnaire-<userId>`, nom = prénom et nom ; publie micro, caméra et partage d'écran ; jeton délivré en `PLANNED` (préparation) et `IN_PROGRESS`. Le jeton ne porte **pas** `roomAdmin` : toute modération passe par l'API d'ImmoTopia, qui vérifie la permission et audite.                                                                                                                                                                                                                                                                                                                         |
| V7  | **Lever la main** par l'API (`POST /api/public/assemblees/visio/main`) : le serveur pose l'attribut LiveKit `main_levee` (horodatage ISO) sur le participant, visible de tous, y compris d'un gestionnaire qui arrive après. Pas de canal de données, donc pas d'usurpation d'identité.                                                                                                                                                                                                                                                                                                                                                                         |
| V8  | **Donner la parole** (gestionnaire) : `updateParticipant` avec `canPublish: true` limité au micro et à la caméra (pas de partage d'écran), et la main est baissée. **Retirer la parole** : `canPublish: false` (LiveKit retire les pistes publiées). Un copropriétaire qui se reconnecte reçoit un jeton sans droit de publier : il relève la main.                                                                                                                                                                                                                                                                                                             |
| V9  | **Exclure** : retire le participant de la salle. Option « Révoquer aussi ses liens personnels » (réutilise la révocation de la spec 043) : sans elle, il peut revenir (sans droit de parole, il ne peut rien perturber) ; avec elle, les liens sont révoqués d'abord, puis le retrait invalide les jetons LiveKit déjà émis (`revokeTokenTs`) : il ne peut plus ni revenir ni voter avec ses liens, le gestionnaire peut lui en délivrer un nouveau. Les jetons LiveKit durent 10 min (renouvelés par LiveKit tant que la connexion vit). Un `gestionnaire-<userId>` qui n'est plus membre actif de l'agence est retiré de la salle à la lecture de la console. |
| V10 | **Pas de discussion écrite dans ce lot** (personne n'a `canPublishData`). Décision du fondateur du 2026-10-16 : une **discussion écrite modérée** par le gestionnaire sera ouverte aux copropriétaires dans un **lot suivant** (modération, règle de conservation et place au procès-verbal à y définir) : c'est la **spec 046**, toujours sans `canPublishData` (messages passant par l'API).                                                                                                                                                                                                                                                                  |
| V11 | **Signal de rafraîchissement** : à l'ouverture et à la clôture d'un vote, le serveur envoie dans la salle un message de données (sujet `ag-refresh`, contenu `{"type":"refresh"}`, aucune donnée de vote), au mieux, après la transaction. Le client relance aussitôt sa lecture HTTP ; il n'accepte ce signal que du serveur (message sans participant émetteur). L'interrogation toutes les 3 s reste la référence.                                                                                                                                                                                                                                           |
| V12 | **« En visio » dans la console** : `GET /visio` interroge la salle (`listParticipants`) à chaque lecture, sans stockage. Le seul webhook LiveKit traité est `egress_ended` (R4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| V13 | Dans la salle, chaque participant voit le **nom** des autres participants présents en visio, comme en séance physique. Aucune autre donnée (lots, tantièmes, coordonnées) n'y circule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| V14 | **Enregistrement dans le lot** (décision du fondateur du 2026-10-16) : voir R1–R10.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| V15 | La connexion à la salle se fait **sur un clic** (« Rejoindre la visio ») : les navigateurs exigent un geste pour jouer le son, et le copropriétaire choisit d'entrer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Enregistrement (décision du fondateur du 2026-10-16)

| #   | Règle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Démarrage et arrêt par le gestionnaire** (`SYNDIC_EDIT`), AG `IN_PROGRESS`, visio et enregistrement configurés. Un seul enregistrement actif par AG (409 sinon). La clôture de l'AG ferme la salle, ce qui termine l'enregistrement en cours.                                                                                                                                                                                                                                                                                                                                                                                                     |
| R2  | **Information des participants** (décision du fondateur du 2026-10-16) : une phrase dans la **convocation** (variable `{{recordingNotice}}` des gabarits e-mail et WhatsApp, remplie quand l'enregistrement est configuré) et l'avis **« Cette assemblée est enregistrée »** visible de tous : sur la page publique avant l'entrée en visio (`visio.recording` dans la vue `etat`), dans la salle pendant l'enregistrement (état d'enregistrement de la salle tenu par LiveKit), et dans la console.                                                                                                                                                |
| R3  | **LiveKit Egress composite MP4** (grille) vers un stockage **compatible S3** dédié, configuré par `env.ts` et `env.example` : `LIVEKIT_RECORDING_S3_BUCKET`, `LIVEKIT_RECORDING_S3_REGION` (défaut `us-east-1`), `LIVEKIT_RECORDING_S3_ENDPOINT` (facultatif : MinIO ou autre S3 compatible), `LIVEKIT_RECORDING_S3_ACCESS_KEY`, `LIVEKIT_RECORDING_S3_SECRET`, `LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE` (`0`/`1`), `LIVEKIT_RECORDING_S3_PREFIX` (défaut `ag-enregistrements/`). Bucket et clés : tous ou aucun ; sans eux, la visio fonctionne sans bouton d'enregistrement. Clé de l'objet : `<préfixe><tenantId>/<meetingId>/<recordingId>.mp4`. |
| R4  | **Webhook LiveKit** `POST /api/webhooks/livekit` : corps brut, signature vérifiée (`WebhookReceiver`, clés du projet), signature absente ou invalide = 401 sans détail. Seul `egress_ended` agit (les autres événements : 200 sans effet). **Idempotent par `event.id`** (colonne unique sur l'enregistrement) ; un egress inconnu = 200 sans effet.                                                                                                                                                                                                                                                                                                |
| R5  | **Rapatriement** : à `egress_ended` réussi, l'enregistrement passe `PROCESSING`, le fichier est téléchargé en flux depuis le stockage S3 vers le stockage privé d'ImmoTopia (`UPLOADS_DIR`, dossier `syndics/<syndicId>/assemblees/<meetingId>/enregistrements/`), puis passe `AVAILABLE` (taille, durée) et l'objet S3 est supprimé (au mieux). Échec de l'egress ou du rapatriement : `FAILED` avec un motif, l'objet S3 est conservé. Le traitement suit la réponse 200 du webhook.                                                                                                                                                              |
| R6  | **Jamais servi en statique** : lecture (flux avec `Range`, pour le lecteur vidéo) et téléchargement par une route authentifiée `SYNDIC_VIEW`, **audités** (`SYNDIC_MEETING_RECORDING_ACCESSED`, une fois par lecture ou téléchargement). **« Supprimer l'enregistrement »** en `SYNDIC_EDIT` : fichier effacé du disque et objet S3 restant effacé, ligne conservée en `DELETED` (trace). Pas d'accès copropriétaire dans ce lot.                                                                                                                                                                                                                   |
| R7  | **Modèle** `GMRecording` avec `tenantId` porté (garde Prisma), dans `schema-tenant-coverage.test.ts` et `tenant-data-export/model-registry.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R8  | **Audit** : `SYNDIC_MEETING_RECORDING_STARTED`, `SYNDIC_MEETING_RECORDING_STOPPED`, `SYNDIC_MEETING_RECORDING_AVAILABLE` (charge avec le statut final, y compris l'échec), `SYNDIC_MEETING_RECORDING_DELETED`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R9  | L'enregistrement capte ce qui est publié dans la salle (gestionnaire, copropriétaires à qui la parole est donnée), jamais le vote ni les écrans de vote.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R10 | **Conservation jusqu'à suppression manuelle** par le gestionnaire (décision du fondateur du 2026-10-16) : aucune purge automatique. La base juridique de l'enregistrement reste à formaliser par le fondateur. Les fichiers d'une AG ou d'une agence supprimée sont effacés par un lot distinct (session « Effacer les enregistrements d'AG à la suppression »).                                                                                                                                                                                                                                                                                    |
| R11 | **Reprise** : un enregistrement arrêté dont le webhook n'arrive pas, ou un rapatriement bloqué, est repris à la lecture de la liste (vérification auprès de LiveKit) ; un échec de rapatriement se relance par « Réessayer » (`SYNDIC_EDIT`). Taille rapatriée bornée par `LIVEKIT_RECORDING_MAX_BYTES` (au-delà : échec motivé). Le manifeste JSON de l'Egress est désactivé : seul le MP4 est écrit dans le bucket.                                                                                                                                                                                                                               |

```prisma
enum GMRecordingStatus { RECORDING PROCESSING AVAILABLE FAILED DELETED }

/// Enregistrement d'une AG en visio (spec 045, R1-R10).
model GMRecording {
  id              String            @id @default(uuid()) @db.Uuid
  tenantId        String            @map("tenant_id")
  meetingId       String            @map("meeting_id") @db.Uuid
  egressId        String            @unique @map("egress_id")
  status          GMRecordingStatus @default(RECORDING)
  storageKey      String            @map("storage_key")        // clé S3 de l'objet produit
  fileUrl         String?           @map("file_url")           // identifiant de stockage privé /uploads/...
  fileSize        BigInt?           @map("file_size")
  durationSeconds Int?              @map("duration_seconds")
  failureReason   String?           @map("failure_reason")
  webhookEventId  String?           @unique @map("webhook_event_id") // idempotence egress_ended
  startedAt       DateTime          @default(now()) @map("started_at")
  startedByUserId String?           @map("started_by_user_id")
  stoppedAt       DateTime?         @map("stopped_at")
  stoppedByUserId String?           @map("stopped_by_user_id")
  endedAt         DateTime?         @map("ended_at")
  deletedAt       DateTime?         @map("deleted_at")
  deletedByUserId String?           @map("deleted_by_user_id")
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")
  @@index([tenantId])
  @@index([meetingId])
  @@map("gm_recordings")
}
```

| Méthode | Chemin (préfixe gestionnaire)             | Permission  | Réponse                                                                                                             |
| ------- | ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| POST    | `/visio/enregistrement/demarrer`          | SYNDIC_EDIT | `{ data: MeetingRecordingView }` — 409 si déjà en cours, AG non en cours ou enregistrement non configuré            |
| POST    | `/visio/enregistrement/arreter`           | SYNDIC_EDIT | `{ data: MeetingRecordingView }` — 409 si aucun en cours                                                            |
| GET     | `/enregistrements`                        | SYNDIC_VIEW | `{ data: MeetingRecordingView[] }` (le plus récent d'abord)                                                         |
| GET     | `/enregistrements/:recordingId/fichier`   | SYNDIC_VIEW | flux `video/mp4` (`Range`, `Content-Disposition` inline ; `?telecharger=1` en pièce jointe), 404 si non `AVAILABLE` |
| POST    | `/enregistrements/:recordingId/reessayer` | SYNDIC_EDIT | `{ data: MeetingRecordingView }` — 409 hors échec de rapatriement                                                   |
| DELETE  | `/enregistrements/:recordingId`           | SYNDIC_EDIT | `{ data: MeetingRecordingView }`                                                                                    |

```ts
type MeetingRecordingView = {
  id: string;
  status: "RECORDING" | "PROCESSING" | "AVAILABLE" | "FAILED" | "DELETED";
  startedAt: string;
  stoppedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  fileSize: number | null;
  failureReason: string | null;
  startedByName: string | null;
};
```

`MeetingVisioAdminView` gagne `recording: { enabled: boolean; active: MeetingRecordingView | null }`
et la vue publique `visio` gagne `recording: boolean`.

Recette locale gratuite : `livekit-server --dev` relié à Redis,
`livekit/egress`, MinIO. Si l'Egress local ne tourne pas sous Windows, la PR
le dit « non vérifié ». Aucun compte LiveKit Cloud ni bucket payant sans
l'accord de l'utilisateur.

## Configuration

`packages/api/src/config/env.ts` (et `env.example`) :

```dotenv
# Visio intégrée à l'AG en direct (spec 045). Projet LiveKit DÉDIÉ à ImmoTopia.
# Les trois ou aucune ; vides = visio intégrée désactivée (lien externe seul).
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

Développement local sans dépense :
`docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp -e LIVEKIT_KEYS="devkey: <secret de 32 caractères>" livekit/livekit-server --dev --bind 0.0.0.0 --node-ip 127.0.0.1`,
puis `LIVEKIT_URL=ws://localhost:7880`.

## Contrat d'API

Erreurs typées (`asyncHandler`), validation zod. LiveKit injoignable :
**503** « La visio est momentanément indisponible ». Visio non configurée :
**409** « La visio intégrée n'est pas activée ». Aucune réponse ne contient
le secret LiveKit.

### Public (lien personnel)

Préfixe `/api/public/assemblees`, mêmes protections que la spec 043 : POST
seulement, JSON 4 Ko, en-têtes `no-store`, limiteur par IP partagé, puis
limiteur par jeton **20/min** (`visio` et `visio/main` ensemble), toute
erreur de jeton = 404 uniforme.

| Chemin        | Corps                        | Réponse                                                                                                      |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/visio`      | `{ token }`                  | `{ data: { serverUrl, token, identity, roomName, expiresAt } }` — 409 si AG non `IN_PROGRESS` ou pas rejoint |
| `/visio/main` | `{ token, raised: boolean }` | `{ data: { raised: boolean } }` — 409 si le participant n'est pas dans la salle                              |

`LiveMeetingPublicView` (spec 043) gagne `visio: { enabled: boolean }`
(LiveKit configuré). Aucune autre donnée.

### Gestionnaire

Préfixe `/api/tenants/:tenantId/syndics/:syndicId/assemblees/:meetingId`.
`:participantId` = id d'un `GMParticipant` de **cette** AG de **cette**
agence (sinon 404, même réponse qu'un objet inexistant).

| Méthode | Chemin                                       | Permission  | Corps                       | Réponse                                                                                             |
| ------- | -------------------------------------------- | ----------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| GET     | `/visio`                                     | SYNDIC_VIEW | —                           | `{ data: MeetingVisioAdminView }`                                                                   |
| POST    | `/visio/jeton`                               | SYNDIC_EDIT | —                           | `{ data: { serverUrl, token, identity, roomName, expiresAt } }` — 409 si AG `COMPLETED`/`CANCELLED` |
| POST    | `/visio/participants/:participantId/parole`  | SYNDIC_EDIT | `{ allowed: boolean }`      | `{ data: MeetingVisioAdminView }` — 409 si absent de la salle                                       |
| POST    | `/visio/participants/:participantId/exclure` | SYNDIC_EDIT | `{ revokeLinks?: boolean }` | `{ data: MeetingVisioAdminView & { revokedLinks: number } }`                                        |

```ts
type MeetingVisioAdminView = {
  enabled: boolean; // LiveKit configuré
  roomName: string | null;
  roomActive: boolean; // la salle existe côté LiveKit
  participants: Array<{
    identity: string;
    kind: "COOWNER" | "MANAGER";
    participantId: string | null; // GMParticipant (COOWNER)
    contactId: string | null; // COOWNER
    name: string;
    handRaisedAt: string | null;
    canSpeak: boolean; // droit de publier
    joinedAt: string | null; // entrée dans la salle
  }>;
};
```

Les participants LiveKit dont l'identité n'est ni un `GMParticipant` de
l'AG ni `gestionnaire-<userId>` d'un membre de l'agence sont ignorés.

### Audit

`SYNDIC_MEETING_VISIO_TOKEN_ISSUED` (rôle `MODERATOR`/`PARTICIPANT`,
participant ou utilisateur, jamais le jeton), `SYNDIC_MEETING_VISIO_SPEAK_GRANTED`,
`SYNDIC_MEETING_VISIO_SPEAK_REVOKED`, `SYNDIC_MEETING_VISIO_PARTICIPANT_REMOVED`
(avec le nombre de liens révoqués). La main levée n'est pas auditée.

## Écrans

- **Page publique `/ag-direct`** : si `visio.enabled`, AG `IN_PROGRESS` et
  participant ayant rejoint, une carte « Visio de l'assemblée » propose
  « Rejoindre la visio ». Connecté : grille vidéo, bouton « Lever la main /
  Baisser la main », micro et caméra visibles seulement quand la parole est
  donnée, « Quitter la visio ». Grand écran (≥ 992 px) : vidéo à gauche,
  résolutions et vote à droite ; mobile : onglets « Visio » et « Votes »
  (pastille sur « Votes » quand un vote est ouvert), la vidéo reste connectée
  quand on passe sur l'onglet des votes. Sans visio : écran inchangé.
- **Console du gestionnaire** (onglet « En direct ») : carte « Visio
  intégrée » avec « Ouvrir la visio » (salle intégrée dans la console),
  liste des participants en visio, mains levées en tête, actions « Donner la
  parole », « Retirer la parole », « Exclure » (confirmation, case « Révoquer
  aussi ses liens »), marque « en visio » dans la liste des participants.
  Lecture de `/visio` toutes les 3 s pendant `IN_PROGRESS`. Le champ du lien
  externe reste disponible.
- **Enregistrement** : dans la carte « Visio intégrée », « Enregistrer la
  séance » / « Arrêter l'enregistrement » (si l'enregistrement est
  configuré) avec un voyant « Enregistrement en cours » ; carte
  « Enregistrements » (statut, date, durée, taille, « Lire » dans un lecteur
  vidéo, « Télécharger », « Supprimer » avec confirmation). Page publique :
  avis « Cette assemblée est enregistrée » avant l'entrée en visio et pendant
  l'enregistrement ; dans la salle, bandeau du même texte tant que LiveKit
  signale un enregistrement en cours.
- Le composant de salle est chargé à la demande (`React.lazy`) : le poids de
  `livekit-client` n'entre pas dans le paquet initial.

## Critères d'acceptation

1. Sans variables LiveKit, l'API démarre et les écrans de la spec 043 sont
   inchangés (lien externe seul) ; `/visio` répond 409.
2. Un copropriétaire qui a rejoint une AG en cours obtient un jeton ; avant
   « Rejoindre » ou hors `IN_PROGRESS`, 409 ; jeton invalide, expiré ou
   révoqué, 404.
3. Le jeton du copropriétaire ne permet ni de publier ni d'envoyer des
   données ; celui du gestionnaire publie mais n'a pas `roomAdmin`.
4. Le copropriétaire voit et entend le gestionnaire, lève la main ; la main
   apparaît dans la console ; « Donner la parole » lui ouvre micro et caméra,
   « Retirer la parole » les coupe.
5. Pendant la visio, le gestionnaire ouvre un vote : le panneau de vote du
   copropriétaire se met à jour sans recharger la page et le vote passe par
   `/voter` (origine `CO_OWNER`, registre et audit de la spec 043).
6. « Exclure » retire le participant de la salle ; avec révocation, son lien
   ne délivre plus de jeton (404) et ne permet plus de voter.
7. Une agence ne délivre jamais un jeton, ne donne pas la parole et n'exclut
   pas un participant d'une AG d'une autre agence (404).
8. La clôture de l'AG ferme la salle.
9. Le gestionnaire démarre l'enregistrement : l'avis « Cette assemblée est
   enregistrée » apparaît chez tous les participants et sur la page avant
   l'entrée en visio ; il l'arrête : l'enregistrement devient disponible
   dans la console après le webhook, se lit et se télécharge par une route
   authentifiée, se supprime ; un second webhook identique est sans effet ;
   une signature invalide est refusée ; aucun fichier n'est accessible par
   `/uploads` ni par une autre agence.

## Recette (2026-10-16)

Jouée dans le navigateur sur l'instance de démo avec une pile locale gratuite
(LiveKit 1.9.1, Egress 1.15, Redis, SeaweedFS pour le S3 — les images MinIO ne
sont plus publiées librement) : voir `docs/recette/SCENARIO_SYNDIC_AG_VISIO.md`.
Caméra et micro remplacés par une source de synthèse (le navigateur de recette
n'a pas de périphérique).

Passés : jeton refusé avant « Rejoindre » (409) et pour un lien inconnu (404) ;
le copropriétaire voit la vidéo du gestionnaire et entend son son (niveau
mesuré), sans micro ni caméra ; main levée visible dans la salle et en tête de
la console ; parole donnée puis retirée (le gestionnaire entend le
copropriétaire) ; boutons de vote affichés 162 ms après l'ouverture du vote
(signal du serveur), vote `CO_OWNER` enregistré, résultat à la clôture, sans
coupure de la visio ; enregistrement démarré, avis unique dans la salle,
arrêt, webhook, « Disponible » en moins de 5 s, lecture (206, MP4 H.264
1280×720 + AAC, image de la séance), téléchargement, suppression (fichier et
objet S3 effacés) ; `/uploads/…` direct 404, lecture sans session 401,
webhook sans signature ou faux 401 ; exclusion simple puis retour, exclusion
avec révocation (3 liens révoqués, lien invalide ensuite) ; isolation par
l'API (AG, participant ou enregistrement d'une autre AG ou agence : 404) ;
mobile 375 px (onglets, une seule salle conservée), arabe en RTL ; clôture de
l'AG qui ferme la salle.

Corrigé pendant la recette : lecture du MP4 en 403 sous un dossier caché,
manifeste JSON de l'Egress laissé dans le bucket, avis d'enregistrement en
double, boutons micro/caméra sans nom accessible, et double connexion de la
salle sous `React.StrictMode` (« same identity is already in the room »).

Non vérifié : le changement de point de rupture à chaud (l'émulation du
panneau ne le déclenche pas sans rechargement ; couvert par un test), le refus
par LiveKit d'un jeton déjà émis après exclusion (`revokeTokenTs`), le bouton
« Activer le son » sur un vrai blocage d'autoplay, un vrai périphérique, la
charge (300 participants), LiveKit Cloud.

Limite constatée, non corrigée dans ce lot : changer de langue pendant la visio
remonte toute l'application (`key={language}` dans `App.tsx`) et déconnecte de
la salle ; il faut la rouvrir.

## Hors périmètre

Accès des copropriétaires aux enregistrements, purge automatique,
discussion écrite (lot distinct : spec 046), webhooks LiveKit autres que `egress_ended`, sous-titres,
traduction simultanée, salle d'attente, vote par la vidéo, choix de la visio
AG par AG, facturation de l'usage LiveKit par agence.
