import type {
  MajorityRule,
  MeetingStatus,
  MeetingType,
  ResolutionTally,
  ResolutionVoteStatus,
  VoteChoice,
  VoteSource
} from './syndic-types';

/**
 * Contrat « AG en direct » (spec 043). Les formes reprennent mot pour mot la
 * section « Contrat d'API » de `specs/043-syndic-ag-en-direct/spec.md`.
 */

export type AttendanceStatus = 'PRESENT' | 'REPRESENTED' | 'ABSENT';
export type AttendanceMode = 'ONLINE' | 'IN_PERSON';
export type AttendanceRecorder = 'SELF' | 'MANAGER';

export interface LiveAttendanceSummary {
  totalLots: number;
  totalShares: number;
  presentLots: number;
  presentShares: number;
  representedOnlyLots: number;
  representedOnlyShares: number;
  /** Présents + représentés (nom historique). */
  representedLots: number;
  representedShares: number;
  onlineLots: number;
  quorumPercent: number;
}

export interface LiveLotAttendance {
  status: AttendanceStatus;
  mode: AttendanceMode;
  recordedBy: AttendanceRecorder;
  attendeeContactId: string | null;
  attendeeName: string | null;
  representedByContactId: string | null;
  representedByName: string | null;
  updatedAt: string;
}

export interface LiveLotRow {
  lotId: string;
  lotNumber: string;
  generalShares: number;
  voters: Array<{ contactId: string; name: string }>;
  attendance: LiveLotAttendance | null;
  /** Un participant qui peut voter ce lot a été vu il y a moins de 30 s. */
  online: boolean;
}

export interface LiveResolutionRow {
  id: string;
  title: string;
  description?: string | null;
  majorityRule?: string | null;
  voteStatus: ResolutionVoteStatus;
  voteOpenedAt: string | null;
  voteClosedAt: string | null;
  /** Lots ayant voté. */
  ballotCount: number;
  tally: ResolutionTally;
  votes: Array<{
    lotId: string;
    vote: VoteChoice;
    source: VoteSource;
    castByContactId: string | null;
    updatedAt: string;
  }>;
}

export interface LiveMeetingAdminView {
  meeting: {
    id: string;
    type: MeetingType;
    status: MeetingStatus;
    scheduledAt: string;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    videoConferenceUrl: string | null;
    syndicate: { id: string; name: string };
  };
  attendance: LiveAttendanceSummary;
  lots: LiveLotRow[];
  resolutions: LiveResolutionRow[];
  participants: { invited: number; joined: number; online: number };
  serverTime: string;
}

export interface MeetingParticipantView {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Lots votables (propres + pouvoirs). */
  lotNumbers: string[];
  joinedAt: string | null;
  lastSeenAt: string | null;
  online: boolean;
  /** Liens non révoqués et non expirés. */
  activeLinks: number;
}

export interface SetLotAttendanceRequest {
  status: AttendanceStatus;
  mode?: AttendanceMode;
  representedByContactId?: string | null;
}

export interface SetBulkAttendanceRequest {
  lotIds: string[];
  status: AttendanceStatus;
  mode?: AttendanceMode;
}

export interface ParticipantLink {
  url: string;
  expiresAt: string;
}

/* ------------------------------------------------------------ vue publique */

export type PublicResolutionResult = 'APPROVED' | 'REJECTED' | 'DEFERRED' | 'PENDING' | null;

export interface LiveMeetingPublicView {
  meeting: {
    id: string;
    type: MeetingType;
    status: MeetingStatus;
    scheduledAt: string;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    videoConferenceUrl: string | null;
    syndicateName: string;
    agenda: Array<{ orderIndex: number; title: string }>;
  };
  me: { contactId: string; name: string; joined: boolean; joinedAt: string | null };
  myLots: Array<{
    lotId: string;
    lotNumber: string;
    generalShares: number;
    role: 'OWNER' | 'PROXY';
    grantorName: string | null;
    attendanceStatus: AttendanceStatus | null;
  }>;
  attendance: {
    quorumPercent: number;
    representedShares: number;
    totalShares: number;
    representedLots: number;
    totalLots: number;
  };
  resolutions: Array<{
    id: string;
    title: string;
    description?: string | null;
    majorityRule?: MajorityRule | string | null;
    voteStatus: ResolutionVoteStatus;
    voteOpenedAt: string | null;
    voteClosedAt: string | null;
    ballotCount: number;
    totalLots: number;
    myVotes: Array<{ lotId: string; vote: VoteChoice; source: VoteSource }>;
    /** Seulement si le vote est clos ou l'AG terminée. */
    result: null | {
      result: PublicResolutionResult;
      sharesFor: number;
      sharesAgainst: number;
      sharesAbstain: number;
      totalShares: number;
      votesFor: number;
      votesAgainst: number;
      votesAbstain: number;
    };
  }>;
  canVote: boolean;
  /** Visio intégrée (spec 045). Une réponse sans ce champ vaut `enabled: false`. */
  visio?: {
    enabled: boolean;
    /** Une séance est enregistrée en ce moment (avis R2). */
    recording?: boolean;
    /** Ce participant peut-il activer micro et caméra (V16) ? Absent d'une API plus ancienne : oui. */
    mediaAllowed?: boolean;
  };
  serverTime: string;
}

export type PublicLiveResolution = LiveMeetingPublicView['resolutions'][number];

/* ------------------------------------------------------------------- visio */

/** Connexion à la salle de visio (spec 045) : jeton LiveKit à durée courte. */
export interface VisioJoinInfo {
  serverUrl: string;
  token: string;
  identity: string;
  roomName: string;
  expiresAt: string;
  /** Droit d'activer micro et caméra décidé par le serveur à l'émission du jeton (V16). */
  mediaAllowed?: boolean;
}

/** Droit de publier d'un participant (V16a) : `DEFAULT` suit l'interdiction globale. */
export type MeetingMediaPolicy = 'DEFAULT' | 'ALLOWED' | 'BLOCKED';

/** État d'une piste publiée : publiée ou non, coupée ou non. */
export interface MeetingVisioTrackState {
  published: boolean;
  muted: boolean;
}

export interface MeetingVisioParticipant {
  identity: string;
  kind: 'COOWNER' | 'MANAGER';
  /** GMParticipant (copropriétaire). */
  participantId: string | null;
  contactId: string | null;
  name: string;
  handRaisedAt: string | null;
  /** Droit de publier micro et caméra. */
  canSpeak: boolean;
  /** Droit d'activer micro et caméra décidé par le serveur (V16). Absent d'une API plus ancienne : `canSpeak`. */
  mediaAllowed?: boolean;
  mediaPolicy?: MeetingMediaPolicy;
  mic?: MeetingVisioTrackState;
  camera?: MeetingVisioTrackState;
  joinedAt: string | null;
  /** Écriture dans la discussion coupée (spec 046, M6). Absent d'une API plus ancienne : `false`. */
  chatMuted?: boolean;
}

export type MeetingRecordingStatus = 'RECORDING' | 'PROCESSING' | 'AVAILABLE' | 'FAILED' | 'DELETED';

export interface MeetingRecordingView {
  id: string;
  status: MeetingRecordingStatus;
  startedAt: string;
  stoppedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  fileSize: number | null;
  failureReason: string | null;
  startedByName: string | null;
}

export interface MeetingVisioAdminView {
  enabled: boolean;
  roomName: string | null;
  roomActive: boolean;
  participants: MeetingVisioParticipant[];
  /** Micros et caméras interdits à tous les copropriétaires (V16d). Absent d'une API plus ancienne : `false`. */
  mediaLocked?: boolean;
  /** Vrai quand l'API n'a pas pu relire la salle ou les enregistrements : la liste peut être incomplète. */
  degraded?: boolean;
  /** Absent d'une API plus ancienne : traité comme « enregistrement non configuré ». */
  recording?: { enabled: boolean; active: MeetingRecordingView | null };
}

/* ------------------------------------------------------------- discussion (spec 046) */

/** Message de la discussion écrite de la visio. `body` est nul quand le message est masqué (vue copropriétaire). */
export interface DiscussionMessageView {
  id: string;
  authorKind: 'COOWNER' | 'MANAGER';
  /** Identité LiveKit : id du GMParticipant ou `gestionnaire-<userId>`. */
  authorIdentity: string;
  authorName: string;
  body: string | null;
  hidden: boolean;
  createdAt: string;
}

export interface PublicDiscussionView {
  /** Discussion ouverte pour la salle (M5). */
  open: boolean;
  /** Mon écriture est coupée (M6). */
  muted: boolean;
  /** `open && !muted` ; la présence dans la salle se vérifie à l'envoi. */
  canWrite: boolean;
  maxLength: number;
  messages: DiscussionMessageView[];
}

export type ManagerDiscussionMessageView = Omit<DiscussionMessageView, 'body'> & {
  /** Toujours le texte, même masqué. */
  body: string;
  participantId: string | null;
  hiddenAt: string | null;
  hiddenByName: string | null;
};

export interface ManagerDiscussionView {
  /** Visio configurée (écriture possible). */
  enabled: boolean;
  open: boolean;
  maxLength: number;
  mutedParticipantIds: string[];
  messages: ManagerDiscussionMessageView[];
}
