import { z } from 'zod';
import type { PaymentGatewayConfig } from '@prisma/client';
import { prisma } from '../../utils/database';
import { env } from '../../config/env';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';
import { encryptSecret, isEncryptionAvailable, last4 } from './crypto';
import { credentialsFrom, ensureCollectionAccountTx, loadConfig, paymentGatewaySimulatorAvailable } from './config';
import { gatewayClientForMode } from './paysecurehub';
import { GatewayError } from './types';

/**
 * Paramètres « Paiement en ligne » de l'agence — contrat §3.1.
 *
 * Sans config en base, `getPaymentGatewaySettings` renvoie les valeurs par
 * défaut sans rien écrire, même principe que les autres paramètres agence
 * (`lib/settings/finance-settings.ts`).
 */
export interface PaymentGatewaySettingsDto {
  provider: 'PAYSECUREHUB';
  mode: 'SIMULATOR' | 'LIVE';
  isActive: boolean;
  merchantId: string | null;
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  treasuryAccountId: string | null;
  treasuryAccountLabel: string | null;
  feesPaidBy: 'CLIENT' | 'AGENCY';
  callbackUrl: string;
  simulatorAvailable: boolean;
  encryptionAvailable: boolean;
  lastTest: { at: string; ok: boolean; message: string } | null;
}

export const updatePaymentGatewaySettingsSchema = z.object({
  mode: z.enum(['SIMULATOR', 'LIVE']).optional(),
  isActive: z.boolean().optional(),
  merchantId: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform(value => (value ? value : null)),
  // Écriture seule : absent = inchangé, '' = efface la clé enregistrée.
  apiKey: z.string().max(500).optional(),
  treasuryAccountId: z.string().uuid().nullish(),
  feesPaidBy: z.enum(['CLIENT', 'AGENCY']).optional()
});

export type UpdatePaymentGatewaySettingsInput = z.infer<typeof updatePaymentGatewaySettingsSchema>;

function callbackUrl(): string {
  return `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/paysecurehub/ipn`;
}

function toSettingsDto(config: PaymentGatewayConfig | null): PaymentGatewaySettingsDto {
  return {
    provider: 'PAYSECUREHUB',
    mode: config?.mode ?? 'SIMULATOR',
    isActive: config?.isActive ?? false,
    merchantId: config?.merchantId ?? null,
    apiKeyConfigured: Boolean(config?.apiKeyEncrypted),
    apiKeyLast4: config?.apiKeyLast4 ?? null,
    treasuryAccountId: config?.treasuryAccountId ?? null,
    treasuryAccountLabel: null,
    feesPaidBy: config?.feesPaidBy ?? 'CLIENT',
    callbackUrl: callbackUrl(),
    simulatorAvailable: paymentGatewaySimulatorAvailable,
    encryptionAvailable: isEncryptionAvailable(),
    lastTest: config?.lastTestAt
      ? {
          at: config.lastTestAt.toISOString(),
          ok: Boolean(config.lastTestOk),
          message: t(config.lastTestMessage ?? '')
        }
      : null
  };
}

export async function getPaymentGatewaySettings(tenantId: string): Promise<PaymentGatewaySettingsDto> {
  const config = await loadConfig(tenantId);
  const dto = toSettingsDto(config);

  if (config?.treasuryAccountId) {
    const account = await prisma.treasuryAccount.findFirst({
      where: { id: config.treasuryAccountId, tenantId },
      select: { label: true, accountNumber: true }
    });
    dto.treasuryAccountLabel = account ? `${account.accountNumber} — ${account.label}` : null;
  }

  return dto;
}

export async function updatePaymentGatewaySettings(
  tenantId: string,
  input: UpdatePaymentGatewaySettingsInput
): Promise<PaymentGatewaySettingsDto> {
  const existing = await loadConfig(tenantId);

  const mode = input.mode ?? existing?.mode ?? 'SIMULATOR';
  const isActive = input.isActive ?? existing?.isActive ?? false;
  const merchantId = input.merchantId !== undefined ? input.merchantId : (existing?.merchantId ?? null);
  const feesPaidBy = input.feesPaidBy ?? existing?.feesPaidBy ?? 'CLIENT';

  if (mode === 'SIMULATOR' && !paymentGatewaySimulatorAvailable) {
    throw new BadRequestError("Le mode simulateur n'est pas disponible sur ce serveur.");
  }

  let apiKeyEncrypted = existing?.apiKeyEncrypted ?? null;
  let apiKeyLast4 = existing?.apiKeyLast4 ?? null;
  if (input.apiKey !== undefined) {
    if (input.apiKey === '') {
      apiKeyEncrypted = null;
      apiKeyLast4 = null;
    } else {
      if (!isEncryptionAvailable()) {
        throw new BadRequestError(
          "Le chiffrement des clés API n'est pas configuré sur ce serveur (PAYMENT_SECRETS_KEY manquante)."
        );
      }
      apiKeyEncrypted = encryptSecret(input.apiKey);
      apiKeyLast4 = last4(input.apiKey);
    }
  }

  if (isActive && mode === 'LIVE' && (!merchantId || !apiKeyEncrypted)) {
    throw new BadRequestError(
      "Renseignez l'identifiant marchand et la clé API avant d'activer le paiement en ligne réel."
    );
  }

  const treasuryAccountId =
    input.treasuryAccountId !== undefined ? input.treasuryAccountId : (existing?.treasuryAccountId ?? null);

  if (treasuryAccountId) {
    const account = await prisma.treasuryAccount.findFirst({
      where: { id: treasuryAccountId, tenantId },
      select: { kind: true, isActive: true }
    });
    if (!account) {
      throw new BadRequestError('Compte de trésorerie introuvable.');
    }
    if (!account.isActive) {
      throw new BadRequestError('Ce compte de trésorerie est désactivé.');
    }
    if (account.kind !== 'MOBILE_MONEY' && account.kind !== 'BANK') {
      throw new BadRequestError('Ce compte de trésorerie ne peut pas recevoir les paiements en ligne.');
    }
  }

  const row = await prisma.$transaction(async tx => {
    // Contrat §1 : à l'activation, sans compte désigné, on ouvre (ou reprend)
    // le compte de collecte 5525.
    const resolvedTreasuryAccountId =
      treasuryAccountId ?? (isActive ? await ensureCollectionAccountTx(tx, tenantId) : null);

    const data = {
      provider: 'PAYSECUREHUB' as const,
      mode,
      isActive,
      merchantId,
      apiKeyEncrypted,
      apiKeyLast4,
      treasuryAccountId: resolvedTreasuryAccountId,
      feesPaidBy
    };

    return tx.paymentGatewayConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data
    });
  });

  return toSettingsDto(row);
}

export async function testPaymentGatewayConnection(tenantId: string): Promise<{
  ok: boolean;
  message: string;
  balance: { amount: number; currency: string; at: string } | null;
}> {
  const config = await loadConfig(tenantId);
  const mode = config?.mode ?? 'SIMULATOR';

  let result: { ok: boolean; message: string; balance: { amount: number; currency: string; at: string } | null };

  if (mode === 'SIMULATOR') {
    result = { ok: true, message: 'Mode simulateur : connexion toujours disponible.', balance: null };
  } else if (!config?.merchantId || !config?.apiKeyEncrypted) {
    result = {
      ok: false,
      message: "Renseignez l'identifiant marchand et la clé API avant de tester la connexion.",
      balance: null
    };
  } else {
    try {
      const credentials = credentialsFrom(config);
      const client = gatewayClientForMode(mode);
      const balance = await client.getBalance(credentials);
      result = { ok: true, message: 'Connexion réussie.', balance: { ...balance, at: new Date().toISOString() } };
    } catch (error) {
      const message = error instanceof GatewayError ? error.message : 'Impossible de contacter PaySecureHub.';
      result = { ok: false, message, balance: null };
    }
  }

  const lastTest = { lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message };
  await prisma.paymentGatewayConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      provider: 'PAYSECUREHUB',
      mode,
      isActive: config?.isActive ?? false,
      merchantId: config?.merchantId ?? null,
      apiKeyEncrypted: config?.apiKeyEncrypted ?? null,
      apiKeyLast4: config?.apiKeyLast4 ?? null,
      treasuryAccountId: config?.treasuryAccountId ?? null,
      feesPaidBy: config?.feesPaidBy ?? 'CLIENT',
      ...lastTest
    },
    update: lastTest
  });

  // `result.message` reste en français en base (`lastTestMessage`) — seule la
  // réponse de cet appel est traduite, à la langue de la requête en cours.
  return { ...result, message: t(result.message) };
}
