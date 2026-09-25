import { z } from 'zod';
import type { SmsMessage } from '@prisma/client';
import { prisma } from '../../utils/database';
import { env } from '../../config/env';
import { t } from '../../i18n';
import { BadRequestError, ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { getSmsProvider, SmsBalance, SmsProviderError } from '../../services/providers/sms';
import { normalizeCiPhone } from './phone';

/**
 * SMS — lot SMS-1 : réglages agence et envoi de test.
 *
 * Décision produit (prime sur la spec) : un seul compte Orange, au nom
 * d'ImmoTopia. Pas d'identifiants propres par agence, pas de chiffrement.
 * Chaque agence n'a que des réglages (activé/désactivé, nom d'expéditeur,
 * quota mensuel), modifiables seulement par le super-admin ; l'agence les
 * voit en lecture seule.
 */

export interface TenantSmsOverviewDto {
  enabled: boolean;
  senderName: string;
  senderNameIsDefault: boolean;
  monthlyQuota: number;
  monthlyQuotaIsDefault: boolean;
  usedThisMonth: number;
  remainingThisMonth: number;
  provider: 'orange' | 'log';
  platformConfigured: boolean;
}

export interface PlatformSmsStatusDto {
  provider: 'orange' | 'log';
  configured: boolean;
  senderAddress: string;
  platformSenderName: string;
  balance: SmsBalance | null;
  error: string | null;
}

export const updateTenantSmsSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  senderName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,11}$/, "Le nom d'expéditeur doit faire 1 à 11 caractères alphanumériques, sans espace.")
    .nullable()
    .optional(),
  monthlyQuota: z.number().int().min(0).max(1_000_000).nullable().optional()
});

export type UpdateTenantSmsSettingsInput = z.infer<typeof updateTenantSmsSettingsSchema>;

export const sendTestSmsSchema = z.object({
  to: z.string().min(1, 'Numéro requis.'),
  body: z.string().trim().max(1000).optional()
});

export type SendTestSmsInput = z.infer<typeof sendTestSmsSchema>;

/** Vérifie que l'agence existe — même `NotFoundError` qu'ailleurs, sans rien confirmer de plus. */
async function assertTenantExists(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    throw new NotFoundError('Agence introuvable.');
  }
}

function platformConfigured(): boolean {
  if (env.SMS_PROVIDER === 'orange') {
    return Boolean(env.ORANGE_SMS_CLIENT_ID && env.ORANGE_SMS_CLIENT_SECRET);
  }
  return true;
}

/** Minuit le 1er du mois en cours, fuseau Africa/Abidjan (= UTC, pas d'heure d'été en Côte d'Ivoire). */
function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

async function countUsedThisMonth(tenantId: string): Promise<number> {
  return prisma.smsMessage.count({
    where: {
      tenantId,
      createdAt: { gte: startOfCurrentMonth() },
      status: { not: 'FAILED' }
    }
  });
}

export async function getTenantSmsOverview(tenantId: string): Promise<TenantSmsOverviewDto> {
  await assertTenantExists(tenantId);

  const settings = await prisma.tenantSmsSettings.findUnique({ where: { tenantId } });
  const usedThisMonth = await countUsedThisMonth(tenantId);

  const senderNameIsDefault = !settings?.senderName;
  const senderName = settings?.senderName || env.ORANGE_SMS_PLATFORM_SENDER_NAME || '';

  const monthlyQuotaIsDefault = settings?.monthlyQuota === null || settings?.monthlyQuota === undefined;
  const monthlyQuota = settings?.monthlyQuota ?? env.SMS_DEFAULT_MONTHLY_QUOTA;

  return {
    enabled: settings?.enabled ?? false,
    senderName,
    senderNameIsDefault,
    monthlyQuota,
    monthlyQuotaIsDefault,
    usedThisMonth,
    remainingThisMonth: Math.max(0, monthlyQuota - usedThisMonth),
    provider: env.SMS_PROVIDER,
    platformConfigured: platformConfigured()
  };
}

export async function updateTenantSmsSettings(
  tenantId: string,
  input: UpdateTenantSmsSettingsInput
): Promise<TenantSmsOverviewDto> {
  await assertTenantExists(tenantId);

  const existing = await prisma.tenantSmsSettings.findUnique({ where: { tenantId } });

  const enabled = input.enabled ?? existing?.enabled ?? false;
  const senderName = input.senderName !== undefined ? input.senderName : (existing?.senderName ?? null);
  const monthlyQuota = input.monthlyQuota !== undefined ? input.monthlyQuota : (existing?.monthlyQuota ?? null);

  await prisma.tenantSmsSettings.upsert({
    where: { tenantId },
    create: { tenantId, enabled, senderName, monthlyQuota },
    update: { enabled, senderName, monthlyQuota }
  });

  return getTenantSmsOverview(tenantId);
}

export async function getPlatformSmsStatus(): Promise<PlatformSmsStatusDto> {
  const provider = getSmsProvider();
  let balance: SmsBalance | null = null;
  let error: string | null = null;

  try {
    balance = await provider.getBalance();
  } catch (err) {
    error = err instanceof SmsProviderError ? err.message : 'Impossible de lire le solde SMS.';
  }

  return {
    provider: env.SMS_PROVIDER,
    configured: platformConfigured(),
    senderAddress: env.ORANGE_SMS_SENDER_ADDRESS,
    platformSenderName: env.ORANGE_SMS_PLATFORM_SENDER_NAME,
    balance,
    error
  };
}

export async function testPlatformSmsConnection(): Promise<{ ok: boolean; message: string }> {
  const provider = getSmsProvider();
  const result = await provider.testConnection();
  return { ...result, message: t(result.message) };
}

export async function sendTestSms(
  tenantId: string,
  input: SendTestSmsInput,
  userId: string | undefined
): Promise<SmsMessage> {
  await assertTenantExists(tenantId);

  const to = normalizeCiPhone(input.to);
  if (!to) {
    throw new BadRequestError('Numéro invalide. Utilisez un numéro ivoirien à 10 chiffres (ex. 0102030405).');
  }

  const settings = await prisma.tenantSmsSettings.findUnique({ where: { tenantId } });
  const monthlyQuota = settings?.monthlyQuota ?? env.SMS_DEFAULT_MONTHLY_QUOTA;
  const usedThisMonth = await countUsedThisMonth(tenantId);
  if (usedThisMonth >= monthlyQuota) {
    throw new ConflictError('Quota SMS mensuel épuisé pour cette agence.');
  }

  const senderName = settings?.senderName || env.ORANGE_SMS_PLATFORM_SENDER_NAME || null;
  const body = input.body && input.body.trim() ? input.body.trim() : t('Message de test ImmoTopia.');

  const provider = getSmsProvider();

  const message = await prisma.smsMessage.create({
    data: {
      tenantId,
      to,
      body,
      senderName,
      status: 'QUEUED',
      provider: provider.kind,
      notificationKey: null,
      createdByUserId: userId ?? null
    }
  });

  try {
    const result = await provider.sendText({ to, body, senderName: senderName ?? undefined });
    return prisma.smsMessage.update({
      where: { id: message.id },
      data: {
        status: 'SENT',
        providerMessageId: result.providerMessageId,
        sentAt: new Date()
      }
    });
  } catch (error) {
    const errorMessage = error instanceof SmsProviderError ? error.message : "Échec de l'envoi du SMS.";
    return prisma.smsMessage.update({
      where: { id: message.id },
      data: { status: 'FAILED', errorMessage }
    });
  }
}
