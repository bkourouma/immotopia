# 043 — Assemblée générale en direct (Syndic)

**Statut :** en cours de réalisation (branche `feat/syndic-ag-en-direct`)
**Date :** 2026-10-15
**Module :** Syndic (spec 013), portail copropriétaire (spec 021, P4)

## Objectif

Rendre l'assemblée générale interactive et suivie en direct :

1. chaque copropriétaire reçoit un **lien personnel** qui ouvre directement
   l'AG, sans mot de passe ;
2. quand il rejoint, sa **présence** est enregistrée et le **quorum** se met
   à jour en direct ;
3. le gestionnaire **émarge** lui-même ceux qui ne peuvent pas se connecter
   (présent en salle, représenté, absent) ;
4. les **résolutions** s'affichent ; le gestionnaire ouvre et clôt le vote de
   chacune ; les copropriétaires connectés votent pour leurs lots ;
5. le gestionnaire **vote pour les autres** (vote en salle, par
   correspondance, pouvoir papier) ;
6. les résultats s'affichent à la clôture de chaque vote, et le compte rendu
   Word contient la feuille de présence.

## Existant (avant ce lot)

- `GeneralMeeting`, `GMResolution`, `GMVote` (un vote par lot et par
  résolution, `@@unique([resolutionId, lotId])`), `GMProxy` (pouvoir entre
  contacts, informatif), `GMAgendaItem`.
- Votes saisis uniquement par le gestionnaire (`SYNDIC_EDIT`). Le « quorum »
  est dérivé des votes : un lot est représenté dès qu'il a voté.
- Portail copropriétaire en lecture seule ; résolutions visibles seulement
  quand l'AG est `COMPLETED`.
- Liens sans connexion : `lib/secure-links` (jeton dans le fragment `#`,
  haché SHA-256, expiration, révocation), routes publiques POST avec le jeton
  dans le corps.
- Aucune infrastructure temps réel : le direct se fait par **interrogation
  toutes les 3 secondes** (modèle `InstallmentPaymentStatusPage`).

## Décisions (prises par le Pilote, à valider par le fondateur)

| #   | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Un lien **par contact et par AG** (pas par lot) : le copropriétaire vote pour tous ses lots depuis le même écran. Lien = `SecureLink` de scope `GENERAL_MEETING_ACCESS` rattaché à un `GMParticipant`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D2  | La présence est enregistrée quand le copropriétaire clique **« Rejoindre l'assemblée »**, pas à la simple ouverture du lien (les anti-virus de messagerie ouvrent les liens).                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D3  | Quorum = tantièmes des lots **présents ou représentés** / tantièmes de tous les lots. Un lot qui a voté compte comme présent (compatibilité avec les AG déjà tenues). Le quorum reste **indicatif** : aucun seuil bloquant (pas de règle légale décidée).                                                                                                                                                                                                                                                                                                                                                                                    |
| D4  | Une résolution a un **état de vote** : `PENDING` (pas encore soumise), `OPEN` (les copropriétaires connectés votent), `CLOSED`. Plusieurs résolutions peuvent être ouvertes en même temps. Le copropriétaire ne vote que si l'AG est `IN_PROGRESS` et la résolution `OPEN`.                                                                                                                                                                                                                                                                                                                                                                  |
| D5  | Le gestionnaire peut toujours saisir ou corriger un vote tant que l'AG n'est pas clôturée (comportement existant conservé), quel que soit l'état de vote. Chaque vote garde son origine (`MANAGER`, `CO_OWNER`, `PROXY_HOLDER`) et son auteur.                                                                                                                                                                                                                                                                                                                                                                                               |
| D6  | Lots votables par un contact = lots dont il est votant **à la date de l'AG** (`votersAt`, indivision comprise) + lots des mandants qui lui ont donné un pouvoir (`GMProxy`). En indivision, n'importe quel indivisaire vote pour le lot ; le dernier vote l'emporte (revote autorisé tant que la résolution est ouverte). **Écrasement en ligne** : un vote saisi par le syndic (`MANAGER`) n'est jamais remplacé en ligne, et un mandataire ne remplace pas le vote donné par le copropriétaire lui-même (`CO_OWNER`), dans les deux cas 409 sur toute la demande ; le copropriétaire peut en revanche remplacer le vote de son mandataire. |
| D7  | Pendant un vote ouvert, le copropriétaire voit seulement le **nombre de lots ayant voté**, jamais le sens des votes des autres. Le résultat (tantièmes pour/contre/abstention, décision) s'affiche à la clôture du vote.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D8  | Les liens sont créés à l'envoi de la convocation (variable `{{meetingLink}}` dans les gabarits e-mail et WhatsApp) et peuvent être (re)générés et copiés par le gestionnaire, participant par participant. Un nouveau lien ne révoque pas les précédents ; une action « Révoquer les liens » existe. Expiration : 7 jours après la date de l'AG, plafonnée par `SECURE_LINK_MAX_TTL_DAYS`.                                                                                                                                                                                                                                                   |
| D9  | Un copropriétaire connecté au portail a un bouton « Rejoindre l'AG en direct » qui lui délivre un lien personnel (même page en direct).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D10 | Une URL de visioconférence facultative (`videoConferenceUrl`, https uniquement) s'affiche sur la page en direct. Pas de visio intégrée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D11 | Écran de projection pour la salle (lecture seule, gestionnaire connecté) : quorum, résolution en cours, résultats.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D12 | Pas de websocket ni SSE : interrogation toutes les 3 s (page publique et console du gestionnaire). Un flux poussé pourra remplacer l'interrogation plus tard sans changer le contrat.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Modèle de données (migration `20261015100000_syndic_ag_en_direct`)

```prisma
enum SecureLinkScope { ... GENERAL_MEETING_ACCESS }

enum GMResolutionVoteStatus { PENDING OPEN CLOSED }
enum GMVoteSource        { MANAGER CO_OWNER PROXY_HOLDER }
enum GMAttendanceStatus  { PRESENT REPRESENTED ABSENT }
enum GMAttendanceMode    { ONLINE IN_PERSON }
enum GMAttendanceRecorder { SELF MANAGER }

model GeneralMeeting {
  ...
  videoConferenceUrl String? @map("video_conference_url")
  participants GMParticipant[]
  attendances  GMAttendance[]
}

model GMResolution {
  ...
  voteStatus    GMResolutionVoteStatus @default(PENDING) @map("vote_status")
  voteOpenedAt  DateTime? @map("vote_opened_at")
  voteClosedAt  DateTime? @map("vote_closed_at")
}

model GMVote {
  ...
  source          GMVoteSource @default(MANAGER)
  castByUserId    String?  @map("cast_by_user_id")      // gestionnaire
  castByContactId String?  @map("cast_by_contact_id")   // copropriétaire ou mandataire
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at")
}

/// Contact invité à une AG (porteur des liens personnels). Un par contact et par AG.
model GMParticipant {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @map("tenant_id")
  meetingId    String   @map("meeting_id") @db.Uuid
  contactId    String   @map("contact_id")
  joinedAt     DateTime? @map("joined_at")     // premier « Rejoindre »
  lastSeenAt   DateTime? @map("last_seen_at")  // dernière interrogation (en ligne si < 30 s)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  @@unique([meetingId, contactId])
  @@index([tenantId])
}

/// Émargement d'un lot à une AG. Absence de ligne = absent.
model GMAttendance {
  id                     String   @id @default(uuid()) @db.Uuid
  tenantId               String   @map("tenant_id")
  meetingId              String   @map("meeting_id") @db.Uuid
  lotId                  String   @map("lot_id") @db.Uuid
  status                 GMAttendanceStatus
  mode                   GMAttendanceMode
  attendeeContactId      String?  @map("attendee_contact_id")       // qui est là (votant ou mandataire)
  representedByContactId String?  @map("represented_by_contact_id") // si REPRESENTED
  recordedBy             GMAttendanceRecorder
  recordedByUserId       String?  @map("recorded_by_user_id")
  createdAt / updatedAt
  @@unique([meetingId, lotId])
  @@index([tenantId])
}
```

`tenantId` est porté directement par les deux nouveaux modèles (garde Prisma)
en plus de la vérification par `syndicate.tenantId`. Les deux modèles entrent
dans `schema-tenant-coverage.test.ts` et `tenant-data-export/model-registry.ts`.

## Règles de calcul

- `computeMeetingAttendance(lots, votes, attendances)` : un lot est compté
  s'il a une présence `PRESENT` ou `REPRESENTED`, **ou** au moins un vote.
  Renvoie en plus `presentLots`, `presentShares`, `representedOnlyLots`,
  `representedOnlyShares`, `onlineLots`. `quorumPercent` = compté / total.
  `GeneralMeeting.quorum` est recalculé à chaque émargement et chaque vote.
- Rejoindre (copropriétaire) : pour chaque lot votable (D6), upsert de
  `GMAttendance` en `PRESENT`/`ONLINE` (lot dont il est votant) ou
  `REPRESENTED`/`ONLINE` avec `representedByContactId` (lot d'un mandant), sauf
  si le lot est déjà `PRESENT` ou `REPRESENTED` (on ne rétrograde jamais un
  émargement existant ; un `ABSENT` posé par le gestionnaire est remplacé).
- Vote copropriétaire : seulement AG `IN_PROGRESS`, résolution `OPEN`, lot
  votable par ce contact ; sinon 409 (état) ou 404 (lot étranger, même
  réponse qu'un lot inexistant). Un vote crée la présence du lot si elle
  manque (`PRESENT`/`ONLINE`, ou `REPRESENTED` pour un lot de mandant).
- Vote gestionnaire : comme aujourd'hui ; si le lot n'a pas de présence, elle
  est créée en `PRESENT`/`IN_PERSON`, `recordedBy = MANAGER`.
- Concurrence : chaque transaction d'écriture (vote, émargement, ouverture et
  clôture de vote) prend `pg_advisory_xact_lock` sur l'id de l'AG avant de
  recalculer, pour que les compteurs stockés ne perdent aucun vote
  simultané.
- Ouvrir un vote : AG `IN_PROGRESS`, résolution `PENDING` ou `CLOSED`
  (réouverture). Clore : résolution `OPEN`. La clôture de l'AG (`COMPLETED`)
  clôt toutes les résolutions ouvertes.

## Contrat d'API

Préfixe gestionnaire : `/api/tenants/:tenantId/syndics/:syndicId/assemblees/:meetingId`.
Permissions : lecture `SYNDIC_VIEW`, écriture `SYNDIC_EDIT`. Erreurs typées
(`asyncHandler`), validation zod.

### Gestionnaire

| Méthode | Chemin                                   | Corps                                                                                                                 | Réponse                                                               |
| ------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| GET     | `/direct`                                | —                                                                                                                     | `{ data: LiveMeetingAdminView }`                                      |
| PUT     | `/presences/:lotId`                      | `{ status: 'PRESENT'\|'REPRESENTED'\|'ABSENT', mode?: 'ONLINE'\|'IN_PERSON', representedByContactId?: string\|null }` | `{ data: LiveMeetingAdminView }`                                      |
| POST    | `/presences`                             | `{ lotIds: string[], status, mode? }` (émargement en masse, 500 lots max)                                             | `{ data: LiveMeetingAdminView }`                                      |
| POST    | `/resolutions/:resolutionId/ouvrir-vote` | —                                                                                                                     | `{ data: LiveMeetingAdminView }`                                      |
| POST    | `/resolutions/:resolutionId/clore-vote`  | —                                                                                                                     | `{ data: LiveMeetingAdminView }`                                      |
| GET     | `/participants`                          | —                                                                                                                     | `{ data: MeetingParticipantView[] }`                                  |
| POST    | `/participants/:contactId/lien`          | —                                                                                                                     | `{ data: { url: string, expiresAt: string } }` (jeton remis une fois) |
| DELETE  | `/participants/:contactId/liens`         | —                                                                                                                     | `{ data: { revoked: number } }`                                       |

`PATCH /:meetingId` accepte en plus `videoConferenceUrl` (`https://` seulement,
2 000 caractères max, `null` pour effacer). `GET /:meetingId` renvoie en plus
`videoConferenceUrl`, `resolutions[].voteStatus|voteOpenedAt|voteClosedAt`,
`resolutions[].votes[].source|castByContactId|updatedAt`, et `attendance`
enrichi (champs ci-dessous). Le vote existant
(`POST /resolutions/:resolutionId/votes`) reste inchangé côté contrat.

`POST /participants/:contactId/lien` refuse (404) un contact qui n'est ni
votant d'un lot de la copropriété à la date de l'AG ni mandataire d'un pouvoir
de cette AG ; refuse (409) une AG `COMPLETED` ou `CANCELLED`.

```ts
type LiveMeetingAdminView = {
  meeting: {
    id;
    type;
    status;
    scheduledAt;
    startTime;
    endTime;
    location;
    videoConferenceUrl;
    syndicate: { id; name };
  };
  attendance: {
    totalLots: number;
    totalShares: number;
    presentLots: number;
    presentShares: number; // PRESENT (+ lots ayant voté sans émargement)
    representedOnlyLots: number;
    representedOnlyShares: number; // REPRESENTED
    representedLots: number;
    representedShares: number; // présents + représentés (nom historique)
    onlineLots: number; // lots émargés ONLINE
    quorumPercent: number;
  };
  lots: Array<{
    lotId;
    lotNumber;
    generalShares;
    voters: Array<{ contactId; name }>; // votants à la date de l'AG
    attendance: null | {
      status;
      mode;
      recordedBy;
      attendeeContactId;
      attendeeName;
      representedByContactId;
      representedByName;
      updatedAt;
    };
    online: boolean; // un participant qui peut voter ce lot vu il y a < 30 s
  }>;
  resolutions: Array<{
    id;
    title;
    description;
    majorityRule;
    voteStatus;
    voteOpenedAt;
    voteClosedAt;
    ballotCount: number; // lots ayant voté
    tally: ResolutionTally; // le gestionnaire voit tout, en direct
    votes: Array<{ lotId; vote; source; castByContactId; updatedAt }>;
  }>;
  participants: { invited: number; joined: number; online: number };
  serverTime: string;
};

type MeetingParticipantView = {
  contactId;
  name;
  email;
  phone;
  lotNumbers: string[]; // lots votables (propres + pouvoirs)
  joinedAt;
  lastSeenAt;
  online: boolean;
  activeLinks: number; // liens non révoqués, non expirés
};
```

### Public (lien personnel, sans connexion)

Préfixe `/api/public/assemblees` (exclu des parseurs globaux comme
`/api/public/secure-links`). POST uniquement, JSON limité à 4 Ko, jeton dans
le corps (`{ token }`), en-têtes `no-store`, toute erreur de jeton = 404
uniforme. Limiteurs : par IP 3000/min (une salle derrière une seule IP : 20 requêtes/min par participant), par
jeton 60/min pour `etat`, 30/min pour `voter` et `rejoindre`.

| Chemin       | Corps                                                                                      | Réponse                                                     |
| ------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `/etat`      | `{ token }`                                                                                | `{ data: LiveMeetingPublicView }` (met à jour `lastSeenAt`) |
| `/rejoindre` | `{ token }`                                                                                | `{ data: LiveMeetingPublicView }` (émarge, idempotent)      |
| `/voter`     | `{ token, resolutionId, votes: [{ lotId, vote: 'FOR'\|'AGAINST'\|'ABSTAIN' }] }` (1 à 200) | `{ data: LiveMeetingPublicView }`                           |

```ts
type LiveMeetingPublicView = {
  meeting: {
    id;
    type;
    status;
    scheduledAt;
    startTime;
    endTime;
    location;
    videoConferenceUrl;
    syndicateName;
    agenda: Array<{ orderIndex; title }>;
  };
  me: { contactId; name; joined: boolean; joinedAt: string | null };
  myLots: Array<{
    lotId;
    lotNumber;
    generalShares;
    role: "OWNER" | "PROXY";
    grantorName: string | null;
    attendanceStatus: "PRESENT" | "REPRESENTED" | "ABSENT" | null;
  }>;
  attendance: {
    quorumPercent;
    representedShares;
    totalShares;
    representedLots;
    totalLots;
  };
  resolutions: Array<{
    id;
    title;
    description;
    majorityRule;
    voteStatus;
    voteOpenedAt;
    voteClosedAt;
    ballotCount: number;
    totalLots: number;
    myVotes: Array<{ lotId; vote; source }>; // votes de MES lots, quelle que soit l'origine
    result: null | {
      result;
      sharesFor;
      sharesAgainst;
      sharesAbstain;
      totalShares;
      votesFor;
      votesAgainst;
      votesAbstain;
    }; // seulement si CLOSED ou AG COMPLETED
  }>;
  canVote: boolean; // AG IN_PROGRESS et au moins un lot votable et participant ayant rejoint
  serverTime: string;
};
```

Jamais exposés : le vote des autres lots, les noms et coordonnées des autres
copropriétaires, les tantièmes par sens pendant un vote ouvert.

### Portail copropriétaire (connecté)

`POST /api/portal/copropriete/assemblees/:meetingId/acces` → `{ data: { url } }` :
délivre un lien personnel pour le contact du portail (premier contact du scope
votant ou mandataire dans cette AG ; 404 sinon ; 409 si l'AG est clôturée ou
annulée). `GET /api/portal/copropriete/assemblees` ajoute `liveAvailable:
boolean` (AG `PLANNED` ou `IN_PROGRESS` à J-1 ou plus tard).

### Convocation

`notifyMeetingConvocation` crée (ou réutilise le participant et crée) un lien
par destinataire et passe `meetingLink` aux gabarits. Gabarits par défaut
e-mail et WhatsApp de `GENERAL_MEETING_CONVOCATION` : ajout d'une phrase
« Suivez l'assemblée et votez en ligne : {{meetingLink}} ». La variable est
déclarée dans le catalogue des variables du gabarit.

### Audit

`SYNDIC_MEETING_JOINED` (acteur `PORTAL`/lien), `SYNDIC_MEETING_VOTE_CAST`
(origine, lot, résolution, sans le sens du vote dans les métadonnées
publiques), `SYNDIC_MEETING_ATTENDANCE_SET`, `SYNDIC_MEETING_VOTE_OPENED`,
`SYNDIC_MEETING_VOTE_CLOSED`, `SYNDIC_MEETING_LINK_ISSUED`,
`SYNDIC_MEETING_LINKS_REVOKED`.

### Compte rendu Word

Nouvelle section « Feuille de présence » : lot, tantièmes, votant ou
mandataire, statut (présent, représenté, absent), mode (en ligne, en salle).
Variable de gabarit `ATTENDANCE` (liste) et `ATTENDANCE_SUMMARY`.

## Écrans

- **Page publique `/ag-direct#<jeton>`** (mobile d'abord, trilingue, noindex,
  jeton retiré de la barre d'adresse) : en-tête AG, bouton visio, quorum,
  « Rejoindre l'assemblée », mes lots (et ceux que je représente), liste des
  résolutions avec l'état de vote ; résolution ouverte : boutons Pour, Contre,
  Abstention, pour tous mes lots ou lot par lot ; confirmation du vote
  enregistré ; résultat à la clôture. Interrogation toutes les 3 s, pause
  quand l'onglet est masqué. AG à venir : écran d'attente ; AG clôturée :
  résultats ; lien invalide : message neutre.
- **Console en direct du gestionnaire** (onglet « En direct » du détail de
  l'AG) : quorum en jauge, compteurs présents / représentés / en ligne ;
  tableau des lots avec point « en ligne », émargement (présent en salle,
  représenté par…, absent), émargement en masse ; résolutions avec « Ouvrir
  le vote » / « Clore le vote », participation et décompte en direct, saisie
  du vote pour un lot (existante) ; participants avec « Copier le lien » et
  « Révoquer les liens » ; champ URL de visio. Interrogation toutes les 3 s
  pendant `IN_PROGRESS`.
- **Projection** (`/tenant/:tenantId/syndics/:syndicId/assemblees/:meetingId/projection`,
  plein écran) : quorum, résolution ouverte et participation, résultats des
  résolutions closes.
- **Portail** : bouton « Rejoindre l'AG en direct » sur une AG `liveAvailable`.

## Critères d'acceptation

1. Un copropriétaire ouvre son lien, clique « Rejoindre » : ses lots passent
   présents (en ligne) et le quorum de la console augmente de leurs tantièmes
   en moins de 5 s.
2. Le gestionnaire émarge un lot « présent en salle » ou « représenté par » :
   le quorum se met à jour ; « absent » le retire (s'il n'a pas voté).
3. Le gestionnaire ouvre le vote d'une résolution : elle apparaît votable sur
   la page du copropriétaire en moins de 5 s ; le vote est enregistré avec
   l'origine `CO_OWNER` (ou `PROXY_HOLDER`) ; la participation augmente.
4. Un copropriétaire ne peut pas voter : pour un lot qui n'est pas le sien
   (404), sur une résolution non ouverte ou une AG non en cours (409), avec
   un lien révoqué ou expiré (404).
5. Le gestionnaire vote pour un lot quelconque ; l'origine `MANAGER` est
   gardée ; le copropriétaire du lot voit ce vote dans « mes votes ».
6. À la clôture du vote, le résultat (décision et tantièmes) s'affiche chez le
   copropriétaire ; pendant le vote, il ne voit que la participation.
7. La convocation contient un lien personnel fonctionnel ; le gestionnaire
   peut copier un lien pour un participant et révoquer ses liens.
8. Une agence ne voit ni n'émarge jamais un lot, un contact ou une AG d'une
   autre agence (404).
9. Le compte rendu Word contient la feuille de présence.
10. Les AG déjà tenues (votes sans émargement) gardent le même quorum.

## Hors périmètre

Visioconférence intégrée, signature électronique de la feuille de présence,
seuil de quorum légal et AG de second appel, vote par correspondance avant
séance par le copropriétaire, flux poussé (websocket/SSE), notifications
push.
