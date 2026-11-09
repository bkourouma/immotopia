import type { TreasuryTransfer } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { t } from '../../../i18n';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { roundMoney } from '../../finance/money';
import { treasuryBalanceTx } from '../../treasury/balance';
import { createTransfer } from '../../treasury/service';
import { credentialsFrom, loadConfig } from '../../payment-gateway/config';
import { gatewayClientForMode } from '../../payment-gateway/paysecurehub';
import type {
  CreateCollectionPayoutResultDto,
  RentalCollectionAccountDto,
  RentalCollectionPayoutDto,
  RentalCollectionProviderUnavailableReason,
  RentalOnlinePaginated
} from './types';

/**
 * Compte de collecte du locatif (décision H5, contrat 049 §2.7) : aucun nouveau modèle.
 * C'est le compte de trésorerie `5525` créé par `ensureCollectionAccountTx` ; le reversement
 * est un virement de trésorerie existant (`createTransfer`) du 5525 vers un compte de
 * trésorerie de l'agence. Enregistrement comptable seulement : aucun virement réel n'est
 * déclenché chez PaySecureHub.
 */

const COLLECTION_ACCOUNT_NUMBER = '5525' as const;
const PAYOUT_REFERENCE = 'REVERSEMENT PSH';

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

const payoutBodySchema = z
  .object({
    toTreasuryAccountId: z.string().trim().min(1),
    amount: z.coerce.number().positive().max(9_999_999_999.99),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().trim().max(500).optional()
  })
  .strict();

function payoutInvalid(message: string): AppError {
  return new AppError(message, 400, ErrorCode.RENTAL_COLLECTION_PAYOUT_INVALID);
}

async function findCollectionAccount(tenantId: string) {
  return prisma.treasuryAccount.findFirst({
    where: { tenantId, accountNumber: COLLECTION_ACCOUNT_NUMBER },
    select: { id: true, chartOfAccountId: true, isActive: true, label: true }
  });
}

async function ledgerBalance(tenantId: string, chartOfAccountId: string): Promise<number> {
  return prisma.$transaction(tx => treasuryBalanceTx(tx, tenantId, chartOfAccountId));
}

const transferNumber = (year: number, sequence: number) => `VIR-${year}-${String(sequence).padStart(4, '0')}`;

async function toPayoutDtos(tenantId: string, rows: TreasuryTransfer[]): Promise<RentalCollectionPayoutDto[]> {
  if (rows.length === 0) return [];
  const accountIds = [...new Set(rows.map(row => row.toTreasuryAccountId))];
  const userIds = [...new Set(rows.map(row => row.createdByUserId).filter((id): id is string => !!id))];
  const [accounts, users] = await Promise.all([
    prisma.treasuryAccount.findMany({ where: { tenantId, id: { in: accountIds } }, select: { id: true, label: true } }),
    userIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
      : Promise.resolve([] as Array<{ id: string; fullName: string | null }>)
  ]);
  const labelById = new Map(accounts.map(row => [row.id, row.label]));
  const nameById = new Map(users.map(row => [row.id, row.fullName]));
  return rows.map(row => ({
    transferId: row.id,
    number: transferNumber(row.year, row.sequence),
    toTreasuryAccountId: row.toTreasuryAccountId,
    toLabel: labelById.get(row.toTreasuryAccountId) ?? '',
    amount: Number(row.amount),
    date: row.transferredAt.toISOString(),
    note: row.notes,
    createdByName: row.createdByUserId ? (nameById.get(row.createdByUserId) ?? null) : null,
    createdAt: row.createdAt.toISOString()
  }));
}

async function providerState(tenantId: string): Promise<RentalCollectionAccountDto['provider']> {
  const unavailable = (
    reason: RentalCollectionProviderUnavailableReason,
    message: string
  ): RentalCollectionAccountDto['provider'] => ({
    available: false,
    balance: null,
    unavailableReason: reason,
    message
  });

  const config = await loadConfig(tenantId);
  if (!config) return unavailable('NOT_CONFIGURED', t("Le paiement en ligne n'est pas encore paramétré."));
  if (config.mode === 'SIMULATOR') {
    return unavailable('SIMULATOR', t('Mode simulateur : aucun solde réel chez PaySecureHub.'));
  }
  if (!config.merchantId || !config.apiKeyEncrypted) {
    return unavailable('NO_CREDENTIALS', t("L'identifiant marchand ou la clé API n'est pas renseigné."));
  }
  try {
    const balance = await gatewayClientForMode(config.mode).getBalance(credentialsFrom(config));
    return {
      available: true,
      balance: { amount: balance.amount, currency: balance.currency, at: new Date().toISOString() },
      unavailableReason: null,
      message: null
    };
  } catch (error) {
    // Une panne du fournisseur n'est jamais un 500 : l'écran affiche le motif.
    logger.warn('collection account: solde PaySecureHub illisible', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    // Libellé fixe : le détail du fournisseur reste dans le journal, jamais à l'écran.
    return unavailable('UNREACHABLE', t('Le service de paiement est momentanément indisponible.'));
  }
}

async function fetchPayouts(tenantId: string, accountId: string, skip: number, take: number) {
  const where = { tenantId, fromTreasuryAccountId: accountId, status: { not: 'VOIDED' as const } };
  const [total, rows] = await Promise.all([
    prisma.treasuryTransfer.count({ where }),
    prisma.treasuryTransfer.findMany({
      where,
      orderBy: [{ transferredAt: 'desc' }, { id: 'desc' }],
      skip,
      take
    })
  ]);
  return { total, rows };
}

export async function getCollectionAccount(tenantId: string): Promise<RentalCollectionAccountDto> {
  const account = await findCollectionAccount(tenantId);
  const [provider, balance, recent] = await Promise.all([
    providerState(tenantId),
    account ? ledgerBalance(tenantId, account.chartOfAccountId) : Promise.resolve(0),
    account ? fetchPayouts(tenantId, account.id, 0, 5) : Promise.resolve({ total: 0, rows: [] as TreasuryTransfer[] })
  ]);
  return {
    accountNumber: COLLECTION_ACCOUNT_NUMBER,
    treasuryAccountId: account?.id ?? null,
    ledgerBalance: balance,
    currency: 'FCFA',
    provider,
    recentPayouts: await toPayoutDtos(tenantId, recent.rows)
  };
}

export async function listCollectionPayouts(
  tenantId: string,
  rawQuery: unknown
): Promise<RentalOnlinePaginated<RentalCollectionPayoutDto>> {
  const query = listQuerySchema.parse(rawQuery ?? {});
  const account = await findCollectionAccount(tenantId);
  if (!account) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  const { total, rows } = await fetchPayouts(tenantId, account.id, (query.page - 1) * query.pageSize, query.pageSize);
  return { items: await toPayoutDtos(tenantId, rows), total, page: query.page, pageSize: query.pageSize };
}

export async function createCollectionPayout(
  tenantId: string,
  userId: string,
  rawBody: unknown
): Promise<CreateCollectionPayoutResultDto> {
  const body = payoutBodySchema.parse(rawBody);
  const todayKey = new Date().toISOString().slice(0, 10);
  if (Number.isNaN(new Date(`${body.date}T12:00:00.000Z`).getTime()) || body.date > todayKey) {
    throw new AppError(t('La date du reversement ne peut pas être dans le futur.'), 400, ErrorCode.VALIDATION_ERROR);
  }

  const account = await findCollectionAccount(tenantId);
  if (!account) throw new NotFoundError(t("Le compte de collecte n'existe pas encore."));
  if (account.id === body.toTreasuryAccountId) {
    throw payoutInvalid(t('Le compte source et le compte destination doivent être différents.'));
  }

  const destination = await prisma.treasuryAccount.findFirst({
    where: { id: body.toTreasuryAccountId, tenantId },
    select: { id: true, isActive: true }
  });
  if (!destination || !destination.isActive) {
    throw payoutInvalid(t('Le compte de destination est introuvable ou désactivé.'));
  }

  // Contrôle AVANT l'appel : jamais plus que le solde comptable du compte de collecte.
  const amount = roundMoney(body.amount);
  const balanceBefore = await ledgerBalance(tenantId, account.chartOfAccountId);
  if (amount > balanceBefore) {
    throw payoutInvalid(
      t('Le montant dépasse le solde du compte de collecte ({{solde}} FCFA).', { solde: balanceBefore })
    );
  }

  const transfer = await createTransfer(tenantId, userId, {
    fromTreasuryAccountId: account.id,
    toTreasuryAccountId: body.toTreasuryAccountId,
    amount,
    transferredAt: `${body.date}T12:00:00.000Z`,
    reference: PAYOUT_REFERENCE,
    notes: body.note
  });

  logAuditEvent({
    actorUserId: userId,
    tenantId,
    actionKey: AuditActionKey.RENTAL_COLLECTION_PAYOUT_RECORDED,
    entityType: 'TreasuryTransfer',
    entityId: transfer.id,
    payload: {
      transferId: transfer.id,
      number: transfer.number,
      toTreasuryAccountId: body.toTreasuryAccountId,
      amount,
      date: body.date
    }
  });

  const [row, balanceAfter] = await Promise.all([
    prisma.treasuryTransfer.findFirstOrThrow({ where: { id: transfer.id, tenantId } }),
    ledgerBalance(tenantId, account.chartOfAccountId)
  ]);
  const [payout] = await toPayoutDtos(tenantId, [row]);
  return { payout, ledgerBalanceAfter: balanceAfter };
}
