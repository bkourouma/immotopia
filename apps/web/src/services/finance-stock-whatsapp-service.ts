/**
 * Frontière réseau de l'inventaire de chantier par WhatsApp — lot 041
 * (ecrans §7). Une fonction par route du contrat
 * (`specs/041-inventaire-whatsapp/contracts/openapi.yaml`), nommée d'après son
 * `operationId`. Les écrans appellent ces fonctions et rien d'autre.
 *
 * Mêmes règles que les services du stock du lot 040 :
 *
 *  - aucun corps ne répète un identifiant que le chemin porte déjà (`tenantId`,
 *    `registrationId`, `captureId`, `sessionId`) ;
 *  - chaque corps est recomposé champ par champ : l'inscription n'envoie que
 *    `userId`, `phone`, `siteIds` ;
 *  - une lecture qui renvoie `meta` rend `{ data, meta }` ;
 *  - la photo d'une capture se lit par `apiClient` en `blob`, jamais par un lien
 *    direct : chaque lecture est tracée côté serveur (`DOCUMENT_DOWNLOADED`).
 *
 * Le webhook Meta (`/api/webhooks/whatsapp-cloud/events`) n'a pas de fonction :
 * il n'est appelé que par Meta.
 *
 * `base()` et `toQuery()` sont recopiées : aucun service du dépôt n'en importe
 * un autre.
 */

import apiClient from '../utils/api-client';
import type {
  AdvanceSimulatorClockRequest,
  CaptureSummary,
  CapturesFilters,
  CaptureView,
  ConversationMessage,
  CountFieldCaptures,
  CreateRegistrationRequest,
  CursorMeta,
  EligibleMember,
  FieldCountRow,
  FieldCountsFilters,
  RegistrationsFilters,
  RegistrationView,
  RegistrationWithCode,
  RemoveCapturePhotoRequest,
  RevokeRegistrationRequest,
  SessionsFilters,
  SessionView,
  SimulatorConversation,
  SimulatorConversationQuery,
  SimulatorInjectResult,
  SimulatorPhotoMessage,
  SimulatorTextOrReply,
  SiteRef,
  StockMeta,
  UpdateRegistrationSitesRequest,
  WhatsappOverview
} from '../types/finance-stock-whatsapp-types';

type ApiResponse<T> = { success: boolean; data: T };
type ApiResponseWithMeta<T, M> = { success: boolean; data: T; meta?: M };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance/stock/whatsapp`;
}

function toQuery(filters?: Record<string, string | number | boolean | undefined>): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/** Absent, on ne suppose rien de favorable : valeurs non visibles. */
function stockMetaOf(body: { meta?: StockMeta }): StockMeta {
  return body.meta ?? { valuesVisible: false, blindLocationIds: [] };
}

function cursorMetaOf(body: { meta?: CursorMeta }): CursorMeta {
  return { nextCursor: body.meta?.nextCursor ?? null };
}

function trimmedOrUndefined(value: string | null | undefined): string | undefined {
  const texte = (value ?? '').trim();
  return texte ? texte : undefined;
}

/** Exactement une cible : l'inscription, sinon le numéro libre. */
function simulatorTarget(input: { registrationId?: string; freePhone?: string }): {
  registrationId?: string;
  freePhone?: string;
} {
  const registrationId = trimmedOrUndefined(input.registrationId);
  if (registrationId) return { registrationId };
  const freePhone = trimmedOrUndefined(input.freePhone);
  return freePhone ? { freePhone } : {};
}

// ---------------------------------------------------------------------------
// Passerelle, quota, mesures
// ---------------------------------------------------------------------------

/** `GET /overview` — passerelle, analyse, quota et mesures du mois (défaut : mois courant UTC). */
export async function getStockWhatsappOverview(tenantId: string, month?: string): Promise<WhatsappOverview> {
  const response = await apiClient.get<ApiResponse<WhatsappOverview>>(
    `${base(tenantId)}/overview${toQuery({ month: trimmedOrUndefined(month) })}`
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Inscriptions
// ---------------------------------------------------------------------------

/** `GET /eligible-members` — membres actifs titulaires du rôle Chef de chantier. */
export async function listStockWhatsappEligibleMembers(tenantId: string): Promise<EligibleMember[]> {
  const response = await apiClient.get<ApiResponse<EligibleMember[]>>(`${base(tenantId)}/eligible-members`);
  return response.data.data;
}

/** `GET /eligible-sites` — chantiers ouverts, basculés au stock, lieu actif. */
export async function listStockWhatsappEligibleSites(tenantId: string): Promise<SiteRef[]> {
  const response = await apiClient.get<ApiResponse<SiteRef[]>>(`${base(tenantId)}/eligible-sites`);
  return response.data.data;
}

/** `GET /registrations` */
export async function listStockWhatsappRegistrations(
  tenantId: string,
  filters?: RegistrationsFilters
): Promise<RegistrationView[]> {
  const response = await apiClient.get<ApiResponse<RegistrationView[]>>(
    `${base(tenantId)}/registrations${toQuery({ status: filters?.status })}`
  );
  return response.data.data;
}

/** `POST /registrations` — rend le code d'activation, UNE seule fois. */
export async function createStockWhatsappRegistration(
  tenantId: string,
  request: CreateRegistrationRequest
): Promise<RegistrationWithCode> {
  const corps: CreateRegistrationRequest = {
    userId: request.userId,
    phone: request.phone.trim(),
    siteIds: [...request.siteIds]
  };
  const response = await apiClient.post<ApiResponse<RegistrationWithCode>>(`${base(tenantId)}/registrations`, corps);
  return response.data.data;
}

/** `GET /registrations/{registrationId}` */
export async function getStockWhatsappRegistration(
  tenantId: string,
  registrationId: string
): Promise<RegistrationView> {
  const response = await apiClient.get<ApiResponse<RegistrationView>>(
    `${base(tenantId)}/registrations/${registrationId}`
  );
  return response.data.data;
}

/** `PATCH /registrations/{registrationId}` — remplace les chantiers affectés. */
export async function updateStockWhatsappRegistrationSites(
  tenantId: string,
  registrationId: string,
  request: UpdateRegistrationSitesRequest
): Promise<RegistrationView> {
  const corps: UpdateRegistrationSitesRequest = { siteIds: [...request.siteIds] };
  const response = await apiClient.patch<ApiResponse<RegistrationView>>(
    `${base(tenantId)}/registrations/${registrationId}`,
    corps
  );
  return response.data.data;
}

/** `POST /registrations/{registrationId}/regenerate-code` — nouveau code, 72 h, essais remis à zéro. */
export async function regenerateStockWhatsappActivationCode(
  tenantId: string,
  registrationId: string
): Promise<RegistrationWithCode> {
  const response = await apiClient.post<ApiResponse<RegistrationWithCode>>(
    `${base(tenantId)}/registrations/${registrationId}/regenerate-code`,
    {}
  );
  return response.data.data;
}

/** `POST /registrations/{registrationId}/revoke` — motif facultatif. */
export async function revokeStockWhatsappRegistration(
  tenantId: string,
  registrationId: string,
  request?: RevokeRegistrationRequest
): Promise<RegistrationView> {
  const reason = trimmedOrUndefined(request?.reason);
  const corps: RevokeRegistrationRequest = reason ? { reason } : {};
  const response = await apiClient.post<ApiResponse<RegistrationView>>(
    `${base(tenantId)}/registrations/${registrationId}/revoke`,
    corps
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Comptages terrain
// ---------------------------------------------------------------------------

/** `GET /field-counts` — stock théorique et dernier comptage, sous les masques du lot 040. */
export async function listStockFieldCounts(
  tenantId: string,
  filters?: FieldCountsFilters
): Promise<{ data: FieldCountRow[]; meta: StockMeta }> {
  const response = await apiClient.get<ApiResponseWithMeta<FieldCountRow[], StockMeta>>(
    `${base(tenantId)}/field-counts${toQuery({
      siteId: filters?.siteId,
      locationId: filters?.locationId,
      itemId: filters?.itemId,
      source: filters?.source,
      cursor: filters?.cursor,
      limit: filters?.limit
    })}`
  );
  return { data: response.data.data, meta: stockMetaOf(response.data) };
}

// ---------------------------------------------------------------------------
// Captures et preuve
// ---------------------------------------------------------------------------

/** `GET /captures` */
export async function listStockFieldCaptures(
  tenantId: string,
  filters?: CapturesFilters
): Promise<{ data: CaptureSummary[]; meta: CursorMeta }> {
  const response = await apiClient.get<ApiResponseWithMeta<CaptureSummary[], CursorMeta>>(
    `${base(tenantId)}/captures${toQuery({
      countId: filters?.countId,
      locationId: filters?.locationId,
      itemId: filters?.itemId,
      outcome: filters?.outcome,
      from: filters?.from,
      to: filters?.to,
      cursor: filters?.cursor,
      limit: filters?.limit
    })}`
  );
  return { data: response.data.data, meta: cursorMetaOf(response.data) };
}

/** `GET /captures/{captureId}` — détail pour le visualiseur de preuve. */
export async function getStockFieldCapture(tenantId: string, captureId: string): Promise<CaptureView> {
  const response = await apiClient.get<ApiResponse<CaptureView>>(
    `${base(tenantId)}/captures/${encodeURIComponent(captureId)}`
  );
  return response.data.data;
}

/** `GET /captures/{captureId}/file` — la photo, en blob (lecture tracée par le serveur). */
export async function getStockFieldCaptureFile(tenantId: string, captureId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`${base(tenantId)}/captures/${encodeURIComponent(captureId)}/file`, {
    responseType: 'blob'
  });
  return response.data;
}

/** `POST /captures/{captureId}/remove-photo` — motif de 3 à 500 caractères ; l'empreinte reste. */
export async function removeStockFieldCapturePhoto(
  tenantId: string,
  captureId: string,
  request: RemoveCapturePhotoRequest
): Promise<CaptureView> {
  const corps: RemoveCapturePhotoRequest = { reason: request.reason.trim() };
  const response = await apiClient.post<ApiResponse<CaptureView>>(
    `${base(tenantId)}/captures/${encodeURIComponent(captureId)}/remove-photo`,
    corps
  );
  return response.data.data;
}

/** `GET /counts/{countId}/captures` — source de l'inventaire et capture de chaque ligne (aucun attendu). */
export async function listStockCountFieldCaptures(tenantId: string, countId: string): Promise<CountFieldCaptures> {
  const response = await apiClient.get<ApiResponse<CountFieldCaptures>>(
    `${base(tenantId)}/counts/${encodeURIComponent(countId)}/captures`
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** `GET /sessions` */
export async function listStockWhatsappSessions(
  tenantId: string,
  filters?: SessionsFilters
): Promise<{ data: SessionView[]; meta: CursorMeta }> {
  const response = await apiClient.get<ApiResponseWithMeta<SessionView[], CursorMeta>>(
    `${base(tenantId)}/sessions${toQuery({
      registrationId: filters?.registrationId,
      open: filters?.open,
      cursor: filters?.cursor
    })}`
  );
  return { data: response.data.data, meta: cursorMetaOf(response.data) };
}

/** `GET /sessions/{sessionId}/messages` */
export async function listStockWhatsappSessionMessages(
  tenantId: string,
  sessionId: string
): Promise<ConversationMessage[]> {
  const response = await apiClient.get<ApiResponse<ConversationMessage[]>>(
    `${base(tenantId)}/sessions/${sessionId}/messages`
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Simulateur (transport `log` seulement)
// ---------------------------------------------------------------------------

/**
 * `POST /simulator/messages` — un texte ou une réponse de bouton (JSON), ou une
 * photo (`multipart`, champ « file », légende facultative).
 */
export async function injectStockWhatsappSimulatorMessage(
  tenantId: string,
  message: SimulatorTextOrReply | SimulatorPhotoMessage
): Promise<SimulatorInjectResult> {
  const url = `${base(tenantId)}/simulator/messages`;
  if ('file' in message) {
    const formData = new FormData();
    const target = simulatorTarget(message);
    if (target.registrationId) formData.append('registrationId', target.registrationId);
    if (target.freePhone) formData.append('freePhone', target.freePhone);
    const caption = trimmedOrUndefined(message.caption);
    if (caption) formData.append('caption', caption);
    if (message.fileName) {
      formData.append('file', message.file, message.fileName);
    } else {
      formData.append('file', message.file);
    }
    const response = await apiClient.post<ApiResponse<SimulatorInjectResult>>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
  }

  const corps: SimulatorTextOrReply = { ...simulatorTarget(message) };
  const replyId = trimmedOrUndefined(message.replyId);
  if (replyId) {
    corps.replyId = replyId;
    const replyTitle = trimmedOrUndefined(message.replyTitle);
    if (replyTitle) corps.replyTitle = replyTitle;
  } else if (message.text !== undefined) {
    corps.text = message.text;
  }
  const response = await apiClient.post<ApiResponse<SimulatorInjectResult>>(url, corps);
  return response.data.data;
}

/** `GET /simulator/conversation` — fil d'une inscription ou d'un numéro libre ; `after` pour la relecture. */
export async function getStockWhatsappSimulatorConversation(
  tenantId: string,
  query: SimulatorConversationQuery
): Promise<SimulatorConversation> {
  const target = simulatorTarget(query);
  const response = await apiClient.get<ApiResponse<SimulatorConversation>>(
    `${base(tenantId)}/simulator/conversation${toQuery({ ...target, after: trimmedOrUndefined(query.after) })}`
  );
  return response.data.data;
}

/** `POST /simulator/sessions/{sessionId}/advance` — recule l'horloge de 10 ou 30 minutes. */
export async function advanceStockWhatsappSimulatorClock(
  tenantId: string,
  sessionId: string,
  request: AdvanceSimulatorClockRequest
): Promise<SessionView> {
  const corps: AdvanceSimulatorClockRequest = { minutes: request.minutes };
  const response = await apiClient.post<ApiResponse<SessionView>>(
    `${base(tenantId)}/simulator/sessions/${sessionId}/advance`,
    corps
  );
  return response.data.data;
}
