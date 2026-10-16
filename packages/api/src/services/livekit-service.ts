import {
  AccessToken,
  DataPacket_Kind,
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  RoomServiceClient,
  S3Upload,
  TrackSource,
  WebhookReceiver,
  type EgressInfo,
  type ParticipantInfo,
  type VideoGrant,
  type WebhookEvent
} from 'livekit-server-sdk';
import { env } from '../config/env';
import { t } from '../i18n';
import { AppError, ConflictError, ErrorCode } from '../middleware/error-middleware';
import { logger } from '../utils/logger';

/**
 * Visio integree a l'AG en direct (spec 045) : enveloppe mince du SDK serveur
 * LiveKit, portee d'Ecole Digitale (`livekit.service.ts`) : salles, jetons,
 * moderation, enregistrement (Egress composite MP4 vers un stockage S3 ; la
 * lecture et la suppression de l'objet sont dans `meeting-recording-storage`)
 * et verification de la signature des webhooks.
 *
 * Les identifiants viennent de `config/env.ts` (jamais de `process.env`). Ni le
 * secret ni un jeton ne sont journalises.
 */

/** Salle de 300 participants au plus, fermee 10 minutes apres le depart du dernier. */
export const ROOM_MAX_PARTICIPANTS = 300;
export const ROOM_EMPTY_TIMEOUT_SECONDS = 600;
/** Duree de vie d'un jeton de connexion (LiveKit le renouvelle tant que la connexion vit). */
export const VISIO_TOKEN_TTL_SECONDS = 600;
/** Attribut LiveKit portant l'horodatage ISO de la main levee. */
export const HAND_RAISED_ATTRIBUTE = 'main_levee';
/** Sujet du message de donnees qui demande au client de relire l'etat. */
export const REFRESH_TOPIC = 'ag-refresh';

/** LiveKit injoignable ou en erreur inattendue (503). */
export class VisioUnavailableError extends AppError {
  /** Cause d'origine (statut LiveKit), jamais serialisee dans la reponse ni journalisee. */
  readonly cause?: unknown;
  constructor(cause?: unknown) {
    super(t('La visio est momentanément indisponible'), 503, ErrorCode.VISIO_UNAVAILABLE);
    this.cause = cause;
  }
}

export interface VisioToken {
  token: string;
  serverUrl: string;
  identity: string;
  roomName: string;
  expiresAt: string;
}

export interface MintTokenInput {
  roomName: string;
  identity: string;
  name: string;
}

interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function isVisioEnabled(): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

function config(): LiveKitConfig {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new ConflictError(t("La visio intégrée n'est pas activée"));
  }
  return { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET };
}

/** Salle d'une AG : ne peut pas entrer en collision entre agences. */
export function buildMeetingRoomName(tenantId: string, meetingId: string): string {
  return `t_${tenantId}__ag_${meetingId}`;
}

// Le client REST attend une URL http(s) : celle de la salle (ws/wss) est convertie.
function restUrl(url: string): string {
  return url.replace(/^ws(s?):\/\//, 'http$1://');
}

let client: RoomServiceClient | null = null;

function roomClient(): RoomServiceClient {
  if (!client) {
    const cfg = config();
    client = new RoomServiceClient(restUrl(cfg.url), cfg.apiKey, cfg.apiSecret);
  }
  return client;
}

let egressClient: EgressClient | null = null;

function egress(): EgressClient {
  if (!egressClient) {
    const cfg = config();
    egressClient = new EgressClient(restUrl(cfg.url), cfg.apiKey, cfg.apiSecret);
  }
  return egressClient;
}

/** Remise a zero des instances paresseuses (tests). */
export function _resetLiveKitServiceForTests(): void {
  client = null;
  egressClient = null;
}

function isNotFound(error: unknown): boolean {
  const e = error as { status?: number; code?: string } | null;
  return e?.status === 404 || e?.code === 'not_found';
}

/**
 * Execute un appel LiveKit. Avec `notFoundValue`, une salle ou un participant
 * absent est un resultat normal (valeur de repli). Tout autre echec devient
 * `VisioUnavailableError`, sans le message du SDK (il peut citer l'hote).
 */
async function call<T>(label: string, run: () => Promise<T>, notFoundValue?: { value: T }): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (notFoundValue && isNotFound(error)) return notFoundValue.value;
    logger.warn('LiveKit call failed', {
      operation: label,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      status: (error as { status?: number } | null)?.status
    });
    throw new VisioUnavailableError(error);
  }
}

async function mint(input: MintTokenInput, grant: VideoGrant): Promise<VisioToken> {
  const cfg = config();
  const expiresAt = new Date(Date.now() + VISIO_TOKEN_TTL_SECONDS * 1000);
  const accessToken = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: VISIO_TOKEN_TTL_SECONDS
  });
  accessToken.addGrant({ roomJoin: true, room: input.roomName, ...grant });
  const token = await call('mintToken', () => accessToken.toJwt());
  return {
    token,
    serverUrl: cfg.url,
    identity: input.identity,
    roomName: input.roomName,
    expiresAt: expiresAt.toISOString()
  };
}

/** Copropriétaire : il regarde, écoute et lève la main ; ni publication ni données. */
export function mintParticipantToken(input: MintTokenInput): Promise<VisioToken> {
  return mint(input, {
    canSubscribe: true,
    canPublish: false,
    canPublishData: false,
    canUpdateOwnMetadata: false
  });
}

/** Gestionnaire : publie micro, caméra et partage d'écran ; PAS de `roomAdmin` (modération par l'API). */
export function mintModeratorToken(input: MintTokenInput): Promise<VisioToken> {
  return mint(input, {
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [
      TrackSource.MICROPHONE,
      TrackSource.CAMERA,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO
    ],
    canPublishData: false,
    canUpdateOwnMetadata: false
  });
}

/** Crée la salle si elle manque (idempotent côté LiveKit : un second appel la renvoie). */
export async function ensureRoom(roomName: string): Promise<void> {
  await call('createRoom', () =>
    roomClient().createRoom({
      name: roomName,
      maxParticipants: ROOM_MAX_PARTICIPANTS,
      emptyTimeout: ROOM_EMPTY_TIMEOUT_SECONDS
    })
  );
}

/** Participants présents dans la salle ; salle inexistante = liste vide. */
export async function listRoomParticipants(roomName: string): Promise<ParticipantInfo[]> {
  return call('listParticipants', () => roomClient().listParticipants(roomName), { value: [] });
}

/** Un participant de la salle, ou `null` s'il n'y est pas (ou si la salle n'existe pas). */
export async function getRoomParticipant(roomName: string, identity: string): Promise<ParticipantInfo | null> {
  return call<ParticipantInfo | null>('getParticipant', () => roomClient().getParticipant(roomName, identity), {
    value: null
  });
}

/** Lève ou baisse la main : attribut visible de tous, posé par le serveur seulement. */
export async function setHandRaised(roomName: string, identity: string, raised: boolean): Promise<boolean> {
  return call(
    'updateParticipant',
    async () => {
      await roomClient().updateParticipant(roomName, identity, {
        attributes: { [HAND_RAISED_ATTRIBUTE]: raised ? new Date().toISOString() : '' }
      });
      return true;
    },
    // Parti entre la lecture et l'ecriture : l'appelant repond 409, pas 503.
    { value: false }
  );
}

/** Donne (micro et caméra) ou retire le droit de publier ; la main est baissée dans les deux cas. */
export async function setCanSpeak(roomName: string, identity: string, allowed: boolean): Promise<boolean> {
  return call(
    'updateParticipant',
    async () => {
      await roomClient().updateParticipant(roomName, identity, {
        permission: {
          canSubscribe: true,
          canPublish: allowed,
          canPublishData: false,
          canPublishSources: allowed ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : []
        },
        attributes: { [HAND_RAISED_ATTRIBUTE]: '' }
      });
      return true;
    },
    { value: false }
  );
}

/**
 * Retire un participant de la salle (absent = rien à faire). Avec `revokeTokens`, les jetons de
 * connexion émis avant maintenant sont invalidés (`revokeTokenTs`) : il ne peut pas rentrer avec
 * celui qu'il détient déjà.
 */
export async function removeParticipant(
  roomName: string,
  identity: string,
  options: { revokeTokens?: boolean } = {}
): Promise<void> {
  const revokeTokenTs = options.revokeTokens ? BigInt(Math.floor(Date.now() / 1000)) : undefined;
  await call(
    'removeParticipant',
    () => roomClient().removeParticipant(roomName, identity, revokeTokenTs ? { revokeTokenTs } : undefined),
    { value: undefined }
  );
}

/** Ferme la salle (inexistante = rien à faire). */
export async function deleteRoom(roomName: string): Promise<void> {
  await call('deleteRoom', () => roomClient().deleteRoom(roomName), { value: undefined });
}

/** Message de données « relis l'état » à toute la salle ; aucune donnée de vote. Salle absente ignorée. */
export async function sendRefreshSignal(roomName: string): Promise<void> {
  await call(
    'sendData',
    () =>
      roomClient().sendData(roomName, new TextEncoder().encode('{"type":"refresh"}'), DataPacket_Kind.RELIABLE, {
        topic: REFRESH_TOPIC
      }),
    { value: undefined }
  );
}

/** La salle existe-t-elle côté LiveKit (même vide) ? */
export async function roomExists(roomName: string): Promise<boolean> {
  const rooms = await call('listRooms', () => roomClient().listRooms([roomName]));
  return rooms.some(room => room.name === roomName);
}

// --- Enregistrement (spec 045, R3) ------------------------------------------

/** Enregistrement possible : visio configuree ET stockage S3 (bucket et cles). */
export function isRecordingEnabled(): boolean {
  return Boolean(
    isVisioEnabled() &&
    env.LIVEKIT_RECORDING_S3_BUCKET &&
    env.LIVEKIT_RECORDING_S3_ACCESS_KEY &&
    env.LIVEKIT_RECORDING_S3_SECRET
  );
}

/** Prefixe des objets, termine par « / ». */
export function recordingKeyPrefix(): string {
  const prefix = env.LIVEKIT_RECORDING_S3_PREFIX ?? 'ag-enregistrements/';
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

/** Cle S3 de l'objet : <prefixe><agence>/<assemblee>/<enregistrement>.mp4 */
export function buildRecordingStorageKey(tenantId: string, meetingId: string, recordingId: string): string {
  return `${recordingKeyPrefix()}${tenantId}/${meetingId}/${recordingId}.mp4`;
}

/** Etats d'un egress encore en cours cote LiveKit. */
export function isEgressActive(info: Pick<EgressInfo, 'status'>): boolean {
  return (
    info.status === EgressStatus.EGRESS_STARTING ||
    info.status === EgressStatus.EGRESS_ACTIVE ||
    info.status === EgressStatus.EGRESS_ENDING
  );
}

/** Demarre l'egress composite MP4 (grille) vers le stockage S3 ; rend l'identifiant de l'egress. */
export async function startMeetingRecording(roomName: string, storageKey: string): Promise<string> {
  if (!isRecordingEnabled()) throw new ConflictError(t("L'enregistrement n'est pas activé"));
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: storageKey,
    // Pas de manifeste <egressId>.json a cote du MP4 dans le bucket.
    disableManifest: true,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: env.LIVEKIT_RECORDING_S3_ACCESS_KEY,
        secret: env.LIVEKIT_RECORDING_S3_SECRET,
        region: env.LIVEKIT_RECORDING_S3_REGION,
        bucket: env.LIVEKIT_RECORDING_S3_BUCKET,
        endpoint: env.LIVEKIT_RECORDING_S3_ENDPOINT ?? '',
        forcePathStyle: env.LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE === '1'
      })
    }
  });
  const info = await call('startRoomCompositeEgress', () =>
    egress().startRoomCompositeEgress(
      roomName,
      { file: output },
      { layout: 'grid', encodingOptions: EncodingOptionsPreset.H264_720P_30 }
    )
  );
  return info.egressId;
}

/** Arrete l'egress ; un egress deja termine (412) ou inconnu (404) n'est pas une erreur. */
export async function stopEgress(egressId: string): Promise<void> {
  return call('stopEgress', async () => {
    try {
      await egress().stopEgress(egressId);
    } catch (error) {
      if (isNotFound(error) || (error as { status?: number } | null)?.status === 412) return;
      throw error;
    }
  });
}

/** Etat d'un egress, ou `null` s'il est inconnu de LiveKit. */
export async function getEgressStatus(egressId: string): Promise<EgressInfo | null> {
  const list = await call<EgressInfo[]>('listEgress', () => egress().listEgress({ egressId }), { value: [] });
  return list.find(item => item.egressId === egressId) ?? null;
}

/** Verifie la signature d'un webhook LiveKit (corps brut) ; leve si absente ou invalide. */
export async function verifyWebhook(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent> {
  const cfg = config();
  if (!authHeader) throw new Error('missing authorization');
  return new WebhookReceiver(cfg.apiKey, cfg.apiSecret).receive(rawBody, authHeader);
}
