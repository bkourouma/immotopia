import type { PaymentGatewayConfig } from '@prisma/client';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { env, paymentGatewaySimulatorAvailable } from '../../config/env';
import { decryptSecret, isEncryptionAvailable } from './crypto';
import { ensureChartAccountTx } from '../treasury/accounts';
import type { GatewayCredentials } from './types';
import { BadRequestError } from '../../middleware/error-middleware';

/** Charge la config brute d'une agence, ou `null` si elle n'a jamais rien enregistré. */
export async function loadConfig(tenantId: string): Promise<PaymentGatewayConfig | null> {
  return prisma.paymentGatewayConfig.findUnique({ where: { tenantId } });
}

/**
 * Une config est utilisable pour créer un paiement en ligne : active, et,
 * hors simulateur, avec un identifiant marchand et une clé API enregistrés.
 */
export function isConfigUsable(config: PaymentGatewayConfig | null): config is PaymentGatewayConfig {
  if (!config || !config.isActive) return false;
  if (config.mode === 'SIMULATOR') return true;
  return Boolean(config.merchantId && config.apiKeyEncrypted);
}

/** Identifiants prêts pour un `GatewayClient`. Lève si la config n'est pas utilisable. */
export function credentialsFrom(config: PaymentGatewayConfig): GatewayCredentials {
  const apiKey = config.mode === 'SIMULATOR' ? '' : config.apiKeyEncrypted ? decryptSecret(config.apiKeyEncrypted) : '';
  if (config.mode !== 'SIMULATOR' && (!config.merchantId || !apiKey)) {
    throw new BadRequestError("Le paiement en ligne n'est pas paramétré pour cette agence.");
  }
  return {
    tenantId: config.tenantId,
    merchantId: config.merchantId ?? '',
    apiKey,
    baseUrl: env.PAYSECUREHUB_BASE_URL,
    timeoutMs: env.PAYSECUREHUB_TIMEOUT_MS
  };
}

/**
 * Compte de trésorerie de collecte PaySecureHub (5525), créé ou repris — voir
 * le contrat §1 « Compte de trésorerie ». Distinct du compte Mobile Money
 * générique « autres opérateurs » (5529, `ensureDefaultTreasuryAccountTx`) :
 * PaySecureHub encaisse pour le compte de l'agence, pas pour un opérateur
 * telco, et mérite sa propre ligne, toujours au même numéro.
 */
export async function ensureCollectionAccountTx(tx: PrismaTransactionClient, tenantId: string): Promise<string> {
  const label = 'PaySecureHub — compte de collecte';
  const existing = await tx.treasuryAccount.findFirst({
    where: { tenantId, accountNumber: '5525' },
    select: { id: true }
  });
  if (existing) return existing.id;

  const chartOfAccountId = await ensureChartAccountTx(tx, tenantId, '5525', label, 'ASSET');
  const created = await tx.treasuryAccount.create({
    data: {
      tenantId,
      kind: 'MOBILE_MONEY',
      label,
      accountNumber: '5525',
      chartOfAccountId,
      mmOperator: 'OTHER',
      isDefault: false
    },
    select: { id: true }
  });
  return created.id;
}

export { isEncryptionAvailable, paymentGatewaySimulatorAvailable };
