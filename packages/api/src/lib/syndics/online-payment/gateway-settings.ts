import { z } from 'zod';
import type { SyndicPaymentGatewayConfig } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { env } from '../../../config/env';
import { t } from '../../../i18n';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { decryptSecret, encryptSecret, isEncryptionAvailable, last4 } from '../../payment-gateway/crypto';
import { paymentGatewaySimulatorAvailable } from '../../payment-gateway/config';
import { gatewayClientForMode } from '../../payment-gateway/paysecurehub';
import { GatewayError } from '../../payment-gateway/types';
import { assertSyndicateOfTenant } from '../charge-allocation';
import {
  isSyndicConfigUsable,
  loadAgencyFeesPaidBy,
  loadSyndicGatewayConfig,
  syndicCredentialsFrom
} from './gateway-config';
import type { FeesPaidBy, GatewayMode } from './types';
import { getCollectionBalance } from './payout';

/**
 * Configuration du paiement mobile PAR COPROPRIETE (spec 042, contrat §1.1 a 1.4).
 *
 * Calque de `lib/payment-gateway/settings.ts` (agence) mais sur
 * `SyndicPaymentGatewayConfig` : une ligne par copropriete, sa propre cle API
 * chiffree. Jamais de repli sur la configuration de l'agence (R4) : seul
 * `feesPaidBy` de l'agence est lu, a titre d'information.
 */

export interface SyndicPaymentGatewaySettings {
  syndicateId: string;
  provider: 'PAYSECUREHUB';
  mode: GatewayMode;
  isActive: boolean;
  merchantId: string | null;
  /** La cle n'est JAMAIS renvoyee : seulement sa presence et ses 4 derniers caracteres. */
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  usable: boolean;
  callbackUrl: string;
  simulatorAvailable: boolean;
  encryptionAvailable: boolean;
  lastTest: { at: string; ok: boolean; message: string } | null;
  agencyFeesPaidBy: FeesPaidBy;
  collectionAccount: { accountNumber: '5525'; exists: boolean; balance: number };
  updatedAt: string | null;
}

export interface SyndicPaymentGatewayTestResult {
  ok: boolean;
  message: string;
  balance: { amount: number; currency: string; at: string } | null;
}

export interface SyndicProviderBalance {
  available: boolean;
  balance: { amount: number; currency: string; at: string } | null;
  message: string | null;
}

export const updateSyndicGatewaySettingsSchema = z
  .object({
    mode: z.enum(['SIMULATOR', 'LIVE']).optional(),
    isActive: z.boolean().optional(),
    // Absent = inchange ; '' ou null = efface.
    merchantId: z
      .string()
      .trim()
      .max(120)
      .nullish()
      .transform(value => (value === undefined ? undefined : value ? value : null)),
    // Ecriture seule : absent = inchangee ; '' = efface ; jamais prerempli cote web.
    apiKey: z.string().max(500).optional()
  })
  .strict();

export type UpdateSyndicGatewaySettingsInput = z.infer<typeof updateSyndicGatewaySettingsSchema>;

function callbackUrl(): string {
  return `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/paysecurehub/ipn`;
}

export async function getSyndicGatewaySettings(
  tenantId: string,
  syndicateId: string
): Promise<SyndicPaymentGatewaySettings> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const [config, feesPaidBy, collectionAccount, balance] = await Promise.all([
    loadSyndicGatewayConfig(tenantId, syndicateId),
    loadAgencyFeesPaidBy(tenantId),
    // Lecture seule : le compte 5525 n'est jamais cree ici.
    prisma.chartOfAccount.findFirst({
      where: { tenantId, syndicateId, accountNumber: '5525' },
      select: { id: true }
    }),
    getCollectionBalance(prisma, tenantId, syndicateId)
  ]);

  return {
    syndicateId,
    provider: 'PAYSECUREHUB',
    mode: config?.mode ?? 'SIMULATOR',
    isActive: config?.isActive ?? false,
    merchantId: config?.merchantId ?? null,
    apiKeyConfigured: Boolean(config?.apiKeyEncrypted),
    apiKeyLast4: config?.apiKeyEncrypted ? (config.apiKeyLast4 ?? null) : null,
    usable: isSyndicConfigUsable(config),
    callbackUrl: callbackUrl(),
    simulatorAvailable: paymentGatewaySimulatorAvailable,
    encryptionAvailable: isEncryptionAvailable(),
    lastTest: config?.lastTestAt
      ? {
          at: config.lastTestAt.toISOString(),
          ok: Boolean(config.lastTestOk),
          message: t(config.lastTestMessage ?? '')
        }
      : null,
    agencyFeesPaidBy: feesPaidBy,
    collectionAccount: {
      accountNumber: '5525',
      exists: Boolean(collectionAccount),
      balance
    },
    updatedAt: config?.updatedAt.toISOString() ?? null
  };
}

/** Vrai si la cle enregistree est differente de celle recue (ou si elle disparait). */
function apiKeyWouldChange(existing: SyndicPaymentGatewayConfig | null, apiKey: string | undefined): boolean {
  if (apiKey === undefined) return false;
  if (apiKey === '') return Boolean(existing?.apiKeyEncrypted);
  if (!existing?.apiKeyEncrypted) return true;
  try {
    return decryptSecret(existing.apiKeyEncrypted) !== apiKey;
  } catch {
    return true;
  }
}

export async function updateSyndicGatewaySettings(
  tenantId: string,
  syndicateId: string,
  input: UpdateSyndicGatewaySettingsInput,
  actorUserId: string | null
): Promise<SyndicPaymentGatewaySettings> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const existing = await loadSyndicGatewayConfig(tenantId, syndicateId);

  const currentMode: GatewayMode = existing?.mode ?? 'SIMULATOR';
  const mode: GatewayMode = input.mode ?? currentMode;
  const isActive = input.isActive ?? existing?.isActive ?? false;
  const currentMerchantId = existing?.merchantId ?? null;
  const merchantId = input.merchantId !== undefined ? input.merchantId : currentMerchantId;

  // Le simulateur n'est refuse que s'il est demande ou s'il servirait a encaisser.
  if (mode === 'SIMULATOR' && !paymentGatewaySimulatorAvailable && (input.mode === 'SIMULATOR' || isActive)) {
    throw new AppError(
      t("Le mode simulateur n'est pas disponible sur ce serveur."),
      400,
      ErrorCode.GATEWAY_SIMULATOR_UNAVAILABLE
    );
  }

  let apiKeyEncrypted = existing?.apiKeyEncrypted ?? null;
  let apiKeyLast4 = existing?.apiKeyLast4 ?? null;
  if (input.apiKey !== undefined) {
    if (input.apiKey === '') {
      apiKeyEncrypted = null;
      apiKeyLast4 = null;
    } else {
      if (!isEncryptionAvailable()) {
        throw new AppError(
          t("Le chiffrement des clés API n'est pas configuré sur ce serveur (PAYMENT_SECRETS_KEY manquante)."),
          400,
          ErrorCode.GATEWAY_ENCRYPTION_UNAVAILABLE
        );
      }
      apiKeyEncrypted = encryptSecret(input.apiKey);
      apiKeyLast4 = last4(input.apiKey);
    }
  }

  if (isActive && mode === 'LIVE' && (!merchantId || !apiKeyEncrypted)) {
    throw new AppError(
      t("Renseignez l'identifiant marchand et la clé API avant d'activer le paiement en ligne réel."),
      400,
      ErrorCode.GATEWAY_CREDENTIALS_REQUIRED
    );
  }

  const merchantIdChanged = merchantId !== currentMerchantId;
  const apiKeyChanged = apiKeyWouldChange(existing, input.apiKey);
  const modeChanged = mode !== currentMode;

  const saved = await prisma.$transaction(async tx => {
    // Changer de compte alors qu'un paiement attend sa confirmation : la verification
    // interrogerait un autre compte que celui du lancement. Activer/desactiver reste permis.
    if (modeChanged || merchantIdChanged || apiKeyChanged) {
      const pending = await tx.syndicOnlineCheckout.count({ where: { tenantId, syndicateId, status: 'PENDING' } });
      if (pending > 0) {
        throw new AppError(
          t(
            'Des paiements sont en attente de confirmation : modifiez le mode, l’identifiant marchand ou la clé une fois ces paiements terminés.'
          ),
          409,
          ErrorCode.GATEWAY_CHECKOUTS_PENDING
        );
      }
    }

    const data = {
      provider: 'PAYSECUREHUB' as const,
      mode,
      isActive,
      merchantId,
      apiKeyEncrypted,
      apiKeyLast4,
      updatedByUserId: actorUserId
    };
    return tx.syndicPaymentGatewayConfig.upsert({
      where: { syndicateId },
      create: { tenantId, syndicateId, ...data },
      update: data
    });
  });

  if (actorUserId) {
    // Jamais la cle, ni son chiffre, ni ses 4 derniers caracteres.
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SYNDIC_GATEWAY_CONFIG_UPDATED,
      entityType: 'SyndicPaymentGatewayConfig',
      entityId: saved.id,
      payload: { syndicateId, mode, isActive, merchantIdChanged, apiKeyChanged }
    });
  }

  return getSyndicGatewaySettings(tenantId, syndicateId);
}

export async function testSyndicGatewayConnection(
  tenantId: string,
  syndicateId: string
): Promise<SyndicPaymentGatewayTestResult> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const config = await loadSyndicGatewayConfig(tenantId, syndicateId);
  const mode: GatewayMode = config?.mode ?? 'SIMULATOR';

  let result: SyndicPaymentGatewayTestResult;
  if (mode === 'SIMULATOR') {
    result = paymentGatewaySimulatorAvailable
      ? { ok: true, message: 'Mode simulateur : connexion toujours disponible.', balance: null }
      : { ok: false, message: "Le mode simulateur n'est pas disponible sur ce serveur.", balance: null };
  } else if (!config?.merchantId || !config.apiKeyEncrypted) {
    result = {
      ok: false,
      message: "Renseignez l'identifiant marchand et la clé API avant de tester la connexion.",
      balance: null
    };
  } else {
    try {
      // La cle utilisee est celle de la copropriete.
      const balance = await gatewayClientForMode(mode).getBalance(syndicCredentialsFrom(config));
      result = { ok: true, message: 'Connexion réussie.', balance: { ...balance, at: new Date().toISOString() } };
    } catch (error) {
      const message = error instanceof GatewayError ? error.message : 'Impossible de contacter PaySecureHub.';
      result = { ok: false, message, balance: null };
    }
  }

  const lastTest = { lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message };
  await prisma.syndicPaymentGatewayConfig.upsert({
    where: { syndicateId },
    // Ligne creee inactive si elle n'existait pas.
    create: { tenantId, syndicateId, provider: 'PAYSECUREHUB', mode, isActive: false, ...lastTest },
    update: lastTest
  });

  return { ...result, message: t(result.message) };
}

export async function getSyndicProviderBalance(tenantId: string, syndicateId: string): Promise<SyndicProviderBalance> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const config = await loadSyndicGatewayConfig(tenantId, syndicateId);
  const mode: GatewayMode = config?.mode ?? 'SIMULATOR';

  if (mode === 'SIMULATOR') {
    return { available: false, balance: null, message: t('Mode simulateur') };
  }
  if (!config?.merchantId || !config.apiKeyEncrypted) {
    return {
      available: false,
      balance: null,
      message: t("Renseignez l'identifiant marchand et la clé API pour consulter le solde.")
    };
  }
  try {
    const balance = await gatewayClientForMode(mode).getBalance(syndicCredentialsFrom(config));
    return { available: true, balance: { ...balance, at: new Date().toISOString() }, message: null };
  } catch (error) {
    const message = error instanceof GatewayError ? error.message : 'Impossible de contacter PaySecureHub.';
    return { available: false, balance: null, message: t(message) };
  }
}
