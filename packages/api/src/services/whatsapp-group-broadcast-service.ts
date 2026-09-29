import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { logger } from '../utils/logger';
import { BadRequestError } from '../middleware/error-middleware';
import { getProjectRoot } from '../utils/project-root';
import {
  configureWhatsAppProvider,
  getConfiguredWhatsAppProvider,
  sendImage,
  sendText,
  type WhatsAppProviderKind
} from './providers/whatsapp.provider';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

const MIME_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png'
};

export interface SendManualGroupBroadcastInput {
  tenantId: string;
  message: string;
  imageFile?: Express.Multer.File;
}

export interface SendManualGroupBroadcastResult {
  provider: WhatsAppProviderKind;
  target: string;
  messageId?: string;
  mediaUrl?: string | null;
  usedFallbackTextOnly?: boolean;
}

function getApiBaseUrl(): string {
  return (
    process.env.API_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    `http://localhost:${process.env.PORT || '8001'}`
  ).replace(/\/+$/, '');
}

function getGroupBroadcastTarget(): string {
  const target = process.env.WHATSAPP_GROUP_BROADCAST_TO?.trim();
  if (!target) {
    throw new BadRequestError("L'envoi groupé WhatsApp n'est pas configuré pour cette agence.");
  }
  return target;
}

function normalizeMessage(raw: string): string {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function validateImageFile(file: Express.Multer.File): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype || '')) {
    throw new BadRequestError('Type d’image invalide. Formats acceptés : JPEG, PNG.');
  }
}

function inferExtension(file: Express.Multer.File): string {
  const fromName = path.extname(file.originalname || '').toLowerCase();
  if (fromName && Object.values(MIME_TYPE_TO_EXT).includes(fromName)) return fromName;
  return MIME_TYPE_TO_EXT[file.mimetype] || '.jpg';
}

async function saveBroadcastImage(
  tenantId: string,
  file: Express.Multer.File
): Promise<{ relativeUrl: string; absoluteUrl: string }> {
  const projectRoot = getProjectRoot();
  const uploadDir = path.join(projectRoot, 'uploads', 'whatsapp', 'group-broadcast', tenantId);
  await fs.mkdir(uploadDir, { recursive: true });

  const ext = inferExtension(file);
  const fileName = `group-${Date.now()}-${randomBytes(5).toString('hex')}${ext}`;
  const fullPath = path.join(uploadDir, fileName);

  await fs.writeFile(fullPath, file.buffer);

  const relativeUrl = `/uploads/whatsapp/group-broadcast/${tenantId}/${fileName}`;
  return {
    relativeUrl,
    absoluteUrl: `${getApiBaseUrl()}${relativeUrl}`
  };
}

export async function sendManualGroupBroadcast(
  input: SendManualGroupBroadcastInput
): Promise<SendManualGroupBroadcastResult> {
  const message = normalizeMessage(input.message);
  const hasImage = Boolean(input.imageFile);

  if (!message && !hasImage) {
    throw new BadRequestError('Le message ou une image est requis.');
  }
  if (message.length > 4000) {
    throw new BadRequestError('Message trop long (4 000 caractères au maximum).');
  }

  const target = getGroupBroadcastTarget();

  const notConfigured =
    "L'envoi WhatsApp n'est pas configuré pour cette agence. Contactez l'administrateur de la plateforme pour l'activer.";
  if (!configureWhatsAppProvider()) {
    throw new BadRequestError(notConfigured);
  }
  const provider = getConfiguredWhatsAppProvider();
  if (!provider) {
    throw new BadRequestError(notConfigured);
  }

  let relativeMediaUrl: string | null = null;

  if (input.imageFile) {
    validateImageFile(input.imageFile);
    const upload = await saveBroadcastImage(input.tenantId, input.imageFile);
    relativeMediaUrl = upload.relativeUrl;

    try {
      const result = await sendImage({
        to: target,
        mediaUrl: upload.absoluteUrl,
        mediaBuffer: input.imageFile.buffer,
        mediaMimeType: input.imageFile.mimetype || 'image/jpeg',
        caption: message || undefined
      });

      logger.info('WhatsApp group broadcast sent with image', {
        tenantId: input.tenantId,
        provider,
        target
      });

      return {
        provider,
        target,
        messageId: result.messageId,
        mediaUrl: relativeMediaUrl
      };
    } catch (error) {
      if (!message) {
        throw error;
      }

      logger.warn('WhatsApp group image broadcast failed, fallback to text', {
        tenantId: input.tenantId,
        provider,
        target,
        error: error instanceof Error ? error.message : String(error)
      });

      const result = await sendText({ to: target, body: message });
      return {
        provider,
        target,
        messageId: result.messageId,
        mediaUrl: relativeMediaUrl,
        usedFallbackTextOnly: true
      };
    }
  }

  const result = await sendText({ to: target, body: message });
  logger.info('WhatsApp group broadcast sent', {
    tenantId: input.tenantId,
    provider,
    target
  });

  return {
    provider,
    target,
    messageId: result.messageId,
    mediaUrl: null
  };
}
