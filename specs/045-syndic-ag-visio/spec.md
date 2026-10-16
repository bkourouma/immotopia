# 045 — Visio intégrée à l'AG en direct (Syndic)

**Statut :** en cours de réalisation (branche `feat/syndic-ag-visio`)
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
3. le vote reste celui de la spec 043 (routes HTTP, registre durable,
   tantièmes, audit, verrou consultatif) : **rien ne se vote par la vidéo**.

## Origine du code

Le module de classes en direct d'École Digitale (`bkourouma/EcoleDigitaleV2`)
repose sur LiveKit : `apps/api/src/services/livekit.service.ts` (salle, jeton,
modération, enregistrement, webhooks) et
`packages/ui/src/components/LiveSessionRoom.tsx` (grille, barre de contrôle,
main levée). ImmoTopia **porte** ce code et intègre LiveKit lui-même, comme
`formation-pro-public` le fait pour son propre domaine d'authentification :
aucun appel à l'API d'École Digitale à l'exécution.

## Décisions (Pilote, valeurs par défaut à valider par le fondateur)

| #   | Décision                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | **Projet LiveKit dédié à ImmoTopia** (LiveKit Cloud ou serveur auto-hébergé), jamais celui d'École Digitale. Variables `LIVEKIT_URL` (`wss://`, `ws://` toléré en développement et test seulement), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (32 caractères au moins) : les trois ou aucune. L'ouverture d'un compte payant reste une décision du fondateur.                                    |
| V2  | **Visio facultative.** Sans LiveKit configuré, rien ne change : la page garde le lien externe `videoConferenceUrl` (D10 de la spec 043). Configurée, la visio intégrée est proposée sur toutes les AG de l'agence ; le lien externe, s'il est renseigné, reste affiché en secours.                                                                                                              |
| V3  | **Une salle par AG** : `t_<tenantId>__ag_<meetingId>`, 300 participants au plus, fermeture automatique 10 min après le départ du dernier participant. Créée à la première demande de jeton. La clôture (`COMPLETED`) ou l'annulation (`CANCELLED`) de l'AG ferme la salle (au mieux : un échec n'empêche pas la clôture).                                                                      |
| V4  | **Copropriétaire** : jeton délivré seulement si l'AG est `IN_PROGRESS` **et** qu'il a rejoint (`joinedAt`). Entrer en visio n'émarge pas, sortir de la visio ne désémarge pas : la présence reste le clic sur « Rejoindre l'assemblée » (D2 inchangée). Identité LiveKit = id du `GMParticipant` ; nom = nom du contact ; aucune métadonnée, aucune coordonnée.                                  |
| V5  | **Le copropriétaire entre micro et caméra coupés, sans droit de publier** (`canPublish: false`), sans canal de données (`canPublishData: false`), sans droit de changer son nom (`canUpdateOwnMetadata: false`). Il écoute, regarde et lève la main.                                                                                                                                             |
| V6  | **Gestionnaire = modérateur** (`SYNDIC_EDIT`) : identité `gestionnaire-<userId>`, nom = prénom et nom ; publie micro, caméra et partage d'écran ; jeton délivré en `PLANNED` (préparation) et `IN_PROGRESS`. Le jeton ne porte **pas** `roomAdmin` : toute modération passe par l'API d'ImmoTopia, qui vérifie la permission et audite.                                                         |
| V7  | **Lever la main** par l'API (`POST /api/public/assemblees/visio/main`) : le serveur pose l'attribut LiveKit `main_levee` (horodatage ISO) sur le participant, visible de tous, y compris d'un gestionnaire qui arrive après. Pas de canal de données, donc pas d'usurpation d'identité.                                                                                                         |
| V8  | **Donner la parole** (gestionnaire) : `updateParticipant` avec `canPublish: true` limité au micro et à la caméra (pas de partage d'écran), et la main est baissée. **Retirer la parole** : `canPublish: false` (LiveKit retire les pistes publiées). Un copropriétaire qui se reconnecte reçoit un jeton sans droit de publier : il relève la main.                                            |
| V9  | **Exclure** : retire le participant de la salle. Option « Révoquer aussi ses liens personnels » (réutilise la révocation de la spec 043) : sans elle, il peut revenir (sans droit de parole, il ne peut rien perturber) ; avec elle, il ne peut plus ni revenir ni voter avec ses liens, le gestionnaire peut lui en délivrer un nouveau. Les jetons LiveKit durent 10 min (renouvelés par LiveKit tant que la connexion vit). |
| V10 | **Pas de discussion écrite** dans ce lot (personne n'a `canPublishData`) : modération et trace écrite hors procès-verbal à trancher avec l'enregistrement.                                                                                                                                                                                                                                      |
| V11 | **Signal de rafraîchissement** : à l'ouverture et à la clôture d'un vote, le serveur envoie dans la salle un message de données (sujet `ag-refresh`, contenu `{"type":"refresh"}`, aucune donnée de vote), au mieux, après la transaction. Le client relance aussitôt sa lecture HTTP ; il n'accepte ce signal que du serveur (message sans participant émetteur). L'interrogation toutes les 3 s reste la référence. |
| V12 | **« En visio » dans la console** : `GET /visio` interroge la salle (`listParticipants`) à chaque lecture. Pas de webhook ni de stockage dans ce lot (rien à conserver sans enregistrement).                                                                                                                                                                                                     |
| V13 | Dans la salle, chaque participant voit le **nom** des autres participants présents en visio, comme en séance physique. Aucune autre donnée (lots, tantièmes, coordonnées) n'y circule.                                                                                                                                                                                                        |
| V14 | **Enregistrement hors périmètre** (lot suivant : base juridique, consentement, conservation). Egress n'est pas porté.                                                                                                                                                                                                                                                                          |
| V15 | La connexion à la salle se fait **sur un clic** (« Rejoindre la visio ») : les navigateurs exigent un geste pour jouer le son, et le copropriétaire choisit d'entrer.                                                                                                                                                                                                                          |

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

| Chemin        | Corps                          | Réponse                                                                                                          |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `/visio`      | `{ token }`                    | `{ data: { serverUrl, token, identity, roomName, expiresAt } }` — 409 si AG non `IN_PROGRESS` ou pas rejoint |
| `/visio/main` | `{ token, raised: boolean }`   | `{ data: { raised: boolean } }` — 409 si le participant n'est pas dans la salle                                 |

`LiveMeetingPublicView` (spec 043) gagne `visio: { enabled: boolean }`
(LiveKit configuré). Aucune autre donnée.

### Gestionnaire

Préfixe `/api/tenants/:tenantId/syndics/:syndicId/assemblees/:meetingId`.
`:participantId` = id d'un `GMParticipant` de **cette** AG de **cette**
agence (sinon 404, même réponse qu'un objet inexistant).

| Méthode | Chemin                                         | Permission  | Corps                       | Réponse                                                                    |
| ------- | ---------------------------------------------- | ----------- | --------------------------- | -------------------------------------------------------------------------- |
| GET     | `/visio`                                       | SYNDIC_VIEW | —                           | `{ data: MeetingVisioAdminView }`                                          |
| POST    | `/visio/jeton`                                 | SYNDIC_EDIT | —                           | `{ data: { serverUrl, token, identity, roomName, expiresAt } }` — 409 si AG `COMPLETED`/`CANCELLED` |
| POST    | `/visio/participants/:participantId/parole`    | SYNDIC_EDIT | `{ allowed: boolean }`      | `{ data: MeetingVisioAdminView }` — 409 si absent de la salle             |
| POST    | `/visio/participants/:participantId/exclure`   | SYNDIC_EDIT | `{ revokeLinks?: boolean }` | `{ data: MeetingVisioAdminView & { revokedLinks: number } }`              |

```ts
type MeetingVisioAdminView = {
  enabled: boolean; // LiveKit configuré
  roomName: string | null;
  roomActive: boolean; // la salle existe côté LiveKit
  participants: Array<{
    identity: string;
    kind: 'COOWNER' | 'MANAGER';
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

## Hors périmètre

Enregistrement (Egress), discussion écrite, webhooks LiveKit, sous-titres,
traduction simultanée, salle d'attente, vote par la vidéo, choix de la visio
AG par AG, facturation de l'usage LiveKit par agence.
