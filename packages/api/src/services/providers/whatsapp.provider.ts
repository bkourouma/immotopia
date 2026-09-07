/**
 * WhatsApp provider for communication module.
 * Supports WaSender and Twilio.
 */
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { logger } from '../../utils/logger';

export interface WhatsAppSendOptions {
  to: string; // E.164
  body: string;
}

export interface WhatsAppTemplateOptions {
  to: string;
  templateSid: string;
  contentVariables?: Record<string, string>;
}

export interface WhatsAppImageOptions {
  to: string;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  mediaMimeType?: string;
  caption?: string;
}

export type WhatsAppProviderKind = 'wasender' | 'twilio';

interface HttpJsonResponse {
  status: number;
  data: unknown;
  rawBody: string;
}

let twilioClient: { messages: { create: (opts: unknown) => Promise<{ sid: string }> } } | null = null;

function getTwilioClient(): typeof twilioClient {
  if (twilioClient) return twilioClient;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
    return twilioClient;
  } catch {
    return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getPreferredProvider(): WhatsAppProviderKind | null {
  const preferred = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (!preferred) {
    // Auto mode: if WaSender key is present, prefer WaSender.
    if (process.env.WASENDER_API_KEY?.trim()) return 'wasender';
    return 'twilio';
  }
  if (preferred === 'wasender' || preferred === 'twilio') return preferred;
  return null;
}

function getWasenderBaseUrl(): string {
  return (process.env.WASENDER_API_BASE_URL?.trim() || 'https://wasenderapi.com/api').replace(/\/+$/, '');
}

function getWasenderTimeoutMs(): number {
  const timeout = Number.parseInt(process.env.WASENDER_TIMEOUT_MS || '10000', 10);
  if (Number.isNaN(timeout) || timeout <= 0) return 10000;
  return timeout;
}

function getObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function getArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function getStringProp(input: Record<string, unknown> | null, key: string): string | undefined {
  if (!input) return undefined;
  const value = input[key];
  return typeof value === 'string' ? value : undefined;
}

function getBooleanProp(input: Record<string, unknown> | null, key: string): boolean | undefined {
  if (!input) return undefined;
  const value = input[key];
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeJidForCompare(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  const parts = trimmed.split(':');
  const afterColon = trimmed.includes(':') ? parts[parts.length - 1] || '' : trimmed;
  return afterColon;
}

function localPartOfJid(value: string | undefined): string {
  return normalizeJidForCompare(value).split('@')[0] || '';
}

function jidsAreSame(left: string | undefined, right: string | undefined): boolean {
  const leftNormalized = normalizeJidForCompare(left);
  const rightNormalized = normalizeJidForCompare(right);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;
  return localPartOfJid(leftNormalized) === localPartOfJid(rightNormalized);
}

function extractSessionJid(payload: unknown): string | undefined {
  const root = getObject(payload);
  const data = getObject(root?.data);
  const directJid = getStringProp(data, 'jid');
  if (directJid) return directJid;
  const compositeId = getStringProp(data, 'id');
  if (!compositeId) return undefined;
  const normalized = normalizeJidForCompare(compositeId);
  return normalized || undefined;
}

function participantHasAdminRights(participant: Record<string, unknown> | null): boolean {
  if (!participant) return false;
  if (getBooleanProp(participant, 'isAdmin') === true) return true;
  if (getBooleanProp(participant, 'isSuperAdmin') === true) return true;
  const adminRole = getStringProp(participant, 'admin');
  return adminRole === 'admin' || adminRole === 'superadmin';
}

function participantHasAdminHints(participant: Record<string, unknown> | null): boolean {
  if (!participant) return false;
  return (
    Object.prototype.hasOwnProperty.call(participant, 'isAdmin') ||
    Object.prototype.hasOwnProperty.call(participant, 'isSuperAdmin') ||
    Object.prototype.hasOwnProperty.call(participant, 'admin')
  );
}

function extractMessageId(payload: unknown): string | undefined {
  const root = getObject(payload);
  const rootId = getStringProp(root, 'messageId') || getStringProp(root, 'id');
  if (rootId) return rootId;

  const data = getObject(root?.data);
  const dataId =
    getStringProp(data, 'messageId') ||
    getStringProp(data, 'id') ||
    getStringProp(data, 'message_id') ||
    getStringProp(data, 'msgId');
  if (dataId) return dataId;

  const result = getObject(root?.result);
  const resultId = getStringProp(result, 'messageId') || getStringProp(result, 'id') || getStringProp(result, 'msgId');
  return resultId;
}

function extractErrorMessage(data: unknown, rawBody: string): string {
  const obj = getObject(data);
  const messageFromRoot = getStringProp(obj, 'message') || getStringProp(obj, 'error');
  if (messageFromRoot) return messageFromRoot;
  const dataObj = getObject(obj?.data);
  const nestedMessage = getStringProp(dataObj, 'message') || getStringProp(dataObj, 'error');
  if (nestedMessage) return nestedMessage;
  return rawBody || 'Unknown provider error';
}

function postJson(
  urlString: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<HttpJsonResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const transport = target.protocol === 'http:' ? http : https;
    const body = JSON.stringify(payload);

    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port ? Number.parseInt(target.port, 10) : undefined,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body).toString(),
          ...headers
        }
      },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let data: unknown = rawBody;
          try {
            if (rawBody) data = JSON.parse(rawBody);
          } catch {
            // Keep raw body if response is not JSON.
          }

          const status = response.statusCode || 0;
          if (status >= 400) {
            const message = extractErrorMessage(data, rawBody);
            reject(new Error(`Provider HTTP ${status}: ${message}`));
            return;
          }

          resolve({ status, data, rawBody });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Provider timeout after ${timeoutMs}ms`));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function getJson(urlString: string, headers: Record<string, string>, timeoutMs: number): Promise<HttpJsonResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const transport = target.protocol === 'http:' ? http : https;

    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port ? Number.parseInt(target.port, 10) : undefined,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...headers
        }
      },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let data: unknown = rawBody;
          try {
            if (rawBody) data = JSON.parse(rawBody);
          } catch {
            // Keep raw body if response is not JSON.
          }

          const status = response.statusCode || 0;
          if (status >= 400) {
            const message = extractErrorMessage(data, rawBody);
            reject(new Error(`Provider HTTP ${status}: ${message}`));
            return;
          }

          resolve({ status, data, rawBody });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Provider timeout after ${timeoutMs}ms`));
    });
    request.on('error', reject);
    request.end();
  });
}

function shouldSkipWaSenderStatusCheck(): boolean {
  const raw = process.env.WASENDER_SKIP_STATUS_CHECK?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

async function ensureWaSenderSessionConnected(): Promise<void> {
  if (shouldSkipWaSenderStatusCheck()) return;

  const apiKey = process.env.WASENDER_API_KEY?.trim();
  const baseUrl = getWasenderBaseUrl();
  if (!apiKey || !isHttpUrl(baseUrl)) {
    throw new Error('WaSender provider not configured');
  }

  const response = await getJson(`${baseUrl}/status`, { Authorization: `Bearer ${apiKey}` }, getWasenderTimeoutMs());
  const dataObj = getObject(response.data);
  const statusRaw = getStringProp(dataObj, 'status');
  const status = String(statusRaw || '')
    .trim()
    .toLowerCase();

  if (status !== 'connected') {
    throw new Error(`WaSender session non connectee (status=${status || 'unknown'}). Reconnectez la session QR.`);
  }
}

async function ensureWaSenderGroupParticipantsSynced(groupJid: string): Promise<void> {
  if (!groupJid.endsWith('@g.us')) return;

  const apiKey = process.env.WASENDER_API_KEY?.trim();
  const baseUrl = getWasenderBaseUrl();
  if (!apiKey || !isHttpUrl(baseUrl)) {
    throw new Error('WaSender provider not configured');
  }

  const response = await getJson(
    `${baseUrl}/groups/${encodeURIComponent(groupJid)}/participants`,
    { Authorization: `Bearer ${apiKey}` },
    getWasenderTimeoutMs()
  );

  const root = getObject(response.data);
  const participants = getArray(root?.data);
  if (!participants || participants.length === 0) {
    throw new Error(
      'Participants du groupe non synchronises cote WaSender. Reconnectez la session QR puis reessayez l envoi.'
    );
  }

  const metadataResponse = await getJson(
    `${baseUrl}/groups/${encodeURIComponent(groupJid)}/metadata`,
    { Authorization: `Bearer ${apiKey}` },
    getWasenderTimeoutMs()
  );
  const metadataRoot = getObject(metadataResponse.data);
  const metadata = getObject(metadataRoot?.data);
  const announce = getBooleanProp(metadata, 'announce');
  if (announce !== true) return;

  const groupParticipants = getArray(metadata?.participants) || [];
  const userResponse = await getJson(`${baseUrl}/user`, { Authorization: `Bearer ${apiKey}` }, getWasenderTimeoutMs());
  const sessionJid = extractSessionJid(userResponse.data);
  if (!sessionJid) {
    logger.warn('WaSender session user JID unavailable during group preflight', { groupJid });
    return;
  }

  const selfParticipant = groupParticipants
    .map(item => getObject(item))
    .find(item => jidsAreSame(getStringProp(item, 'jid') || getStringProp(item, 'id'), sessionJid));

  if (!selfParticipant) {
    logger.warn('WaSender session user not found in group metadata participants; skipping strict admin check', {
      groupJid,
      sessionJid
    });
    return;
  }

  if (!participantHasAdminHints(selfParticipant)) {
    logger.warn('WaSender group participant metadata has no admin flags; skipping strict admin check', {
      groupJid,
      sessionJid
    });
    return;
  }

  if (!participantHasAdminRights(selfParticipant)) {
    throw new Error(
      'Le groupe est configure en mode admin uniquement et le compte WaSender n est pas admin dans ce groupe.'
    );
  }
}

function postBinary(
  urlString: string,
  headers: Record<string, string>,
  body: Buffer,
  contentType: string,
  timeoutMs: number
): Promise<HttpJsonResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const transport = target.protocol === 'http:' ? http : https;

    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port ? Number.parseInt(target.port, 10) : undefined,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': contentType,
          'Content-Length': body.byteLength.toString(),
          ...headers
        }
      },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let data: unknown = rawBody;
          try {
            if (rawBody) data = JSON.parse(rawBody);
          } catch {
            // Keep raw body if response is not JSON.
          }

          const status = response.statusCode || 0;
          if (status >= 400) {
            const message = extractErrorMessage(data, rawBody);
            reject(new Error(`Provider HTTP ${status}: ${message}`));
            return;
          }

          resolve({ status, data, rawBody });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Provider timeout after ${timeoutMs}ms`));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function extractPublicUrl(payload: unknown): string | undefined {
  const root = getObject(payload);
  const direct = getStringProp(root, 'publicUrl') || getStringProp(root, 'url');
  if (direct) return direct;
  const data = getObject(root?.data);
  return getStringProp(data, 'publicUrl') || getStringProp(data, 'url');
}

async function uploadBinaryToWaSender(mediaBuffer: Buffer, mediaMimeType: string): Promise<string> {
  const apiKey = process.env.WASENDER_API_KEY?.trim();
  const baseUrl = getWasenderBaseUrl();
  if (!apiKey || !isHttpUrl(baseUrl)) {
    throw new Error('WaSender provider not configured');
  }

  const response = await postBinary(
    `${baseUrl}/upload`,
    { Authorization: `Bearer ${apiKey}` },
    mediaBuffer,
    mediaMimeType || 'image/jpeg',
    getWasenderTimeoutMs()
  );
  const responseObject = getObject(response.data);
  if (responseObject?.success === false) {
    const message = extractErrorMessage(response.data, response.rawBody);
    throw new Error(`Provider rejected media upload: ${message}`);
  }

  const publicUrl = extractPublicUrl(response.data);
  if (!publicUrl || !isHttpUrl(publicUrl)) {
    throw new Error('Provider media upload did not return a valid publicUrl');
  }

  return publicUrl;
}

async function sendTextViaWaSender(options: WhatsAppSendOptions): Promise<{ messageId?: string }> {
  const apiKey = process.env.WASENDER_API_KEY?.trim();
  const baseUrl = getWasenderBaseUrl();
  if (!apiKey || !isHttpUrl(baseUrl)) {
    throw new Error('WaSender provider not configured');
  }
  await ensureWaSenderSessionConnected();
  await ensureWaSenderGroupParticipantsSynced(options.to);

  const payload: Record<string, unknown> = {
    to: options.to,
    text: options.body
  };

  // Optional session hint if your WaSender account uses named sessions.
  const session = process.env.WASENDER_SESSION?.trim();
  const sessionName = process.env.WASENDER_SESSION_NAME?.trim();
  if (session) payload.session = session;
  if (sessionName) payload.sessionName = sessionName;

  const response = await postJson(
    `${baseUrl}/send-message`,
    { Authorization: `Bearer ${apiKey}` },
    payload,
    getWasenderTimeoutMs()
  );

  const responseObject = getObject(response.data);
  if (responseObject?.success === false) {
    const message = extractErrorMessage(response.data, response.rawBody);
    throw new Error(`Provider rejected message: ${message}`);
  }

  logger.debug('WaSender message sent', { status: response.status, hasResponseBody: response.rawBody.length > 0 });
  return { messageId: extractMessageId(response.data) };
}

async function sendImageViaWaSender(options: WhatsAppImageOptions): Promise<{ messageId?: string }> {
  const apiKey = process.env.WASENDER_API_KEY?.trim();
  const baseUrl = getWasenderBaseUrl();
  if (!apiKey || !isHttpUrl(baseUrl)) {
    throw new Error('WaSender provider not configured');
  }
  await ensureWaSenderSessionConnected();
  await ensureWaSenderGroupParticipantsSynced(options.to);
  let imageUrl = options.mediaUrl;
  if (options.mediaBuffer) {
    imageUrl = await uploadBinaryToWaSender(options.mediaBuffer, options.mediaMimeType || 'image/jpeg');
  }
  if (!imageUrl || !isHttpUrl(imageUrl)) {
    throw new Error('WaSender image requires mediaBuffer or an absolute http(s) mediaUrl');
  }

  const payload: Record<string, unknown> = {
    to: options.to,
    text: options.caption || '',
    imageUrl
  };

  const session = process.env.WASENDER_SESSION?.trim();
  const sessionName = process.env.WASENDER_SESSION_NAME?.trim();
  if (session) payload.session = session;
  if (sessionName) payload.sessionName = sessionName;

  const response = await postJson(
    `${baseUrl}/send-message`,
    { Authorization: `Bearer ${apiKey}` },
    payload,
    getWasenderTimeoutMs()
  );

  const responseObject = getObject(response.data);
  if (responseObject?.success === false) {
    const message = extractErrorMessage(response.data, response.rawBody);
    throw new Error(`Provider rejected image message: ${message}`);
  }

  logger.debug('WaSender image sent', { status: response.status, hasResponseBody: response.rawBody.length > 0 });
  return { messageId: extractMessageId(response.data) };
}

async function sendTextViaTwilio(options: WhatsAppSendOptions): Promise<{ messageId?: string }> {
  const client = getTwilioClient();
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!client || !from) throw new Error('Twilio provider not configured');
  const to = options.to.startsWith('whatsapp:') ? options.to : `whatsapp:${options.to}`;
  const result = await client.messages.create({
    from: `whatsapp:${from.replace(/^whatsapp:/, '')}`,
    to,
    body: options.body
  });
  return { messageId: result.sid };
}

function sendTemplateViaTwilio(options: WhatsAppTemplateOptions): Promise<{ messageId?: string }> {
  const client = getTwilioClient();
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!client || !from) throw new Error('Twilio provider not configured');
  const to = options.to.startsWith('whatsapp:') ? options.to : `whatsapp:${options.to}`;
  const contentVariables = options.contentVariables ? JSON.stringify(options.contentVariables) : undefined;
  return client.messages
    .create({
      from: `whatsapp:${from.replace(/^whatsapp:/, '')}`,
      to,
      contentSid: options.templateSid,
      contentVariables
    })
    .then(result => ({ messageId: result.sid }));
}

function sendImageViaTwilio(options: WhatsAppImageOptions): Promise<{ messageId?: string }> {
  const client = getTwilioClient();
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!client || !from) throw new Error('Twilio provider not configured');
  if (!options.mediaUrl) throw new Error('Twilio image requires mediaUrl');
  const to = options.to.startsWith('whatsapp:') ? options.to : `whatsapp:${options.to}`;
  return client.messages
    .create({
      from: `whatsapp:${from.replace(/^whatsapp:/, '')}`,
      to,
      mediaUrl: [options.mediaUrl],
      body: options.caption || undefined
    })
    .then(result => ({ messageId: result.sid }));
}

export function getConfiguredWhatsAppProvider(): WhatsAppProviderKind | null {
  const provider = getPreferredProvider();
  if (!provider) return null;

  if (provider === 'wasender') {
    const apiKey = process.env.WASENDER_API_KEY?.trim();
    const baseUrl = getWasenderBaseUrl();
    if (!apiKey || !isHttpUrl(baseUrl)) return null;
    return 'wasender';
  }

  const client = getTwilioClient();
  return client && !!process.env.TWILIO_WHATSAPP_FROM ? 'twilio' : null;
}

export function configureWhatsAppProvider(): boolean {
  return getConfiguredWhatsAppProvider() !== null;
}

export function supportsTemplateMessages(): boolean {
  return getConfiguredWhatsAppProvider() === 'twilio';
}

export async function sendText(options: WhatsAppSendOptions): Promise<{ messageId?: string }> {
  const provider = getConfiguredWhatsAppProvider();
  if (!provider) throw new Error('WhatsApp provider not configured');
  if (provider === 'wasender') return sendTextViaWaSender(options);
  return sendTextViaTwilio(options);
}

export async function sendTemplate(options: WhatsAppTemplateOptions): Promise<{ messageId?: string }> {
  const provider = getConfiguredWhatsAppProvider();
  if (!provider) throw new Error('WhatsApp provider not configured');
  if (provider === 'wasender') {
    throw new Error('Template messages are only supported when WHATSAPP_PROVIDER=twilio');
  }
  return sendTemplateViaTwilio(options);
}

export async function sendImage(options: WhatsAppImageOptions): Promise<{ messageId?: string }> {
  const provider = getConfiguredWhatsAppProvider();
  if (!provider) throw new Error('WhatsApp provider not configured');
  if (provider === 'wasender') {
    return sendImageViaWaSender(options);
  }
  return sendImageViaTwilio(options);
}

export function handleWebhook(payload: unknown): { processed: boolean } {
  logger.debug('WhatsApp webhook received', { payload });
  return { processed: true };
}
