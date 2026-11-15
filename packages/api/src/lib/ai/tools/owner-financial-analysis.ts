import { randomUUID } from 'node:crypto';
import { StatementStatus } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError } from '../../../middleware/error-middleware';
import { assertThirdPartyAllowedForTenant } from '../../../services/own-assets-barrier-service';
import { prisma } from '../../../utils/database';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { listPostedOwnerBalances, payoutNumber } from '../../owner-account/service';
import { OWNER_STATEMENT_COMPUTATION_VERSION } from '../../patrimoine/owner-statement-computation';
import { listOwnerStatementAmounts } from '../../patrimoine/queries';
import type { AnalysisTable, CopilotToolDefinition } from '../contracts';
import { closedMonthBounds, monthPattern } from './rental-arrears';
import { assertToolPermission, outcome } from './tool-utils';

const STATEMENT_PERMISSION = 'OWNER_STATEMENTS_VIEW';
const PAYOUT_PERMISSION = 'FINANCE_ACCOUNTS_READ';
const MAX_ROWS = 100;
const month = z.string().regex(monthPattern);
const monthProperty = { type: 'string', pattern: monthPattern.source };
const idProperty = { type: 'string', format: 'uuid' };
const periodSchema = z.object({ periodFrom: month.optional(), periodTo: month.optional() });

function resolvePeriod(input: z.infer<typeof periodSchema>, now: Date) {
  const periodFrom = input.periodFrom ?? input.periodTo ?? closedMonthBounds(undefined, now).period;
  const periodTo = input.periodTo ?? periodFrom;
  if (periodFrom > periodTo) throw new BadRequestError(t('La période demandée est invalide.'));
  return { periodFrom, periodTo };
}

function ownerLabel(owner: { firstName: string | null; lastName: string | null; legalName: string | null }) {
  return owner.legalName || [owner.firstName, owner.lastName].filter(Boolean).join(' ') || t('Propriétaire');
}

const statementsSchema = periodSchema
  .extend({
    ownerContactId: z.string().uuid().optional(),
    propertyId: z.string().uuid().optional(),
    status: z.nativeEnum(StatementStatus).optional()
  })
  .strict();

export const ownerStatementsTool: CopilotToolDefinition<typeof statementsSchema> = {
  name: 'owner_statements',
  description:
    'Analyse les relevés de gérance enregistrés par mois, propriétaire (identifiant de contact), bien et statut. Affiche les recettes, dépenses, honoraires, TVA et net du relevé. Le filtre par bien sélectionne les relevés qui le contiennent, avec leurs montants complets. Par défaut : dernier mois clos.',
  inputSchema: statementsSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      periodFrom: monthProperty,
      periodTo: monthProperty,
      ownerContactId: idProperty,
      propertyId: idProperty,
      status: { type: 'string', enum: Object.values(StatementStatus) }
    }
  },
  feature: 'RENTAL',
  requiredPermission: STATEMENT_PERMISSION,
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, STATEMENT_PERMISSION);
    await assertThirdPartyAllowedForTenant(ctx.tenantId, 'OWNER_STATEMENT');
    await assertBelongsToTenant(prisma, 'crmContact', input.ownerContactId, ctx.tenantId);
    if (input.propertyId) await getPropertyForTenant(input.propertyId, ctx.tenantId);
    const now = new Date();
    const period = resolvePeriod(input, now);
    const records = await listOwnerStatementAmounts(
      ctx.tenantId,
      { ...input, ...period, status: input.status ? [input.status] : undefined },
      MAX_ROWS + 1
    );
    const href = `/tenant/${encodeURIComponent(ctx.tenantId)}/patrimoine/statements`;
    const statuses = { DRAFT: t('Brouillon'), SENT: t('Envoyé'), PAID: t('Payé') };
    const rows = records.slice(0, MAX_ROWS).map(row => ({
      owner: ownerLabel(row.owner),
      href: `${href}/${row.id}`,
      period: row.period,
      status: statuses[row.status],
      currency: row.currency === 'FCFA' ? 'XOF' : row.currency,
      revenue: row.totalRevenue.toNumber(),
      expenses: row.totalExpenses.toNumber(),
      fees: row.totalManagementFees.toNumber(),
      vat: row.totalManagementFeesVat.toNumber(),
      net: row.netAmount.toNumber(),
      calculation:
        row.computationVersion >= OWNER_STATEMENT_COMPUTATION_VERSION ? t('Calcul actuel') : t('Ancien calcul')
    }));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Montants des relevés de gérance'),
      query: { tool: 'owner_statements', ...input, ...period },
      columns: [
        { key: 'owner', label: t('Propriétaire'), linkKey: 'href' },
        { key: 'period', label: t('Période') },
        { key: 'status', label: t('Statut') },
        { key: 'revenue', label: t('Recettes'), type: 'currency' },
        { key: 'expenses', label: t('Dépenses'), type: 'currency' },
        { key: 'fees', label: t('Honoraires de gestion'), type: 'currency' },
        { key: 'vat', label: t('TVA sur les honoraires'), type: 'currency' },
        { key: 'net', label: t('Net du relevé'), type: 'currency' },
        { key: 'currency', label: t('Devise') },
        { key: 'calculation', label: t('Version du calcul') }
      ],
      rows,
      truncated: records.length > MAX_ROWS,
      provenance: {
        source: t('Relevés de gérance'),
        href,
        period: `${period.periodFrom} – ${period.periodTo}`,
        calculatedAt: now.toISOString(),
        rules: [
          t(
            'Les montants figurent sur les relevés enregistrés. Le solde du compte propriétaire et les reversements sont des mesures distinctes.'
          ),
          t('Les relevés issus de l’ancien calcul sont signalés dans le tableau.'),
          ...(input.propertyId ? [t('Chaque montant couvre le relevé complet qui inclut le bien sélectionné.')] : [])
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, rows: rows.slice(0, 10), truncated: artifact.truncated },
      { type: 'artifact', artifact }
    );
  }
};

const payoutsSchema = periodSchema.extend({ ownerClientId: z.string().uuid().optional() }).strict();

const balancesSchema = z.object({ ownerClientId: z.string().uuid().optional() }).strict();

export const ownerBalancesTool: CopilotToolDefinition<typeof balancesSchema> = {
  name: 'owner_balances',
  description:
    'Liste les soldes positifs à reverser aux propriétaires, d’après les écritures déjà inscrites dans leurs comptes. Accepte un identifiant de compte client propriétaire. La consultation ne synchronise pas le grand livre. Aucune période historique.',
  inputSchema: balancesSchema,
  jsonSchema: { type: 'object', additionalProperties: false, properties: { ownerClientId: idProperty } },
  feature: 'RENTAL',
  requiredPermission: PAYOUT_PERMISSION,
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PAYOUT_PERMISSION);
    await assertThirdPartyAllowedForTenant(ctx.tenantId, 'OWNER_ACCOUNT');
    await assertBelongsToTenant(prisma, 'tenantClient', input.ownerClientId, ctx.tenantId);
    const balances = await listPostedOwnerBalances(ctx.tenantId, input.ownerClientId, MAX_ROWS + 1);
    const calculatedAt = new Date().toISOString();
    const href = `/tenant/${encodeURIComponent(ctx.tenantId)}/finance/owner-accounts`;
    const rows = balances.slice(0, MAX_ROWS).map(account => ({
      owner: account.name || t('Propriétaire'),
      href: `${href}/${encodeURIComponent(account.id)}`,
      balance: account.balance,
      currency: account.currency === 'FCFA' ? 'XOF' : account.currency
    }));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Soldes à reverser aux propriétaires'),
      query: { tool: 'owner_balances', ...input },
      columns: [
        { key: 'owner', label: t('Propriétaire'), linkKey: 'href' },
        { key: 'balance', label: t('Solde à reverser'), type: 'currency' },
        { key: 'currency', label: t('Devise') }
      ],
      rows,
      truncated: balances.length > MAX_ROWS,
      provenance: {
        source: t('Comptes propriétaires'),
        href: `${href}?soldeDu=1`,
        period: calculatedAt.slice(0, 10),
        calculatedAt,
        rules: [
          t(
            'Seuls les soldes positifs issus des écritures déjà inscrites sont affichés. La consultation ne synchronise pas les comptes.'
          )
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, rows: rows.slice(0, 10), truncated: artifact.truncated },
      { type: 'artifact', artifact }
    );
  }
};

export const ownerPayoutsTool: CopilotToolDefinition<typeof payoutsSchema> = {
  name: 'owner_payouts',
  description:
    'Liste les reversements propriétaires validés par mois de paiement et, facultativement, par propriétaire (identifiant de compte client). Par défaut : dernier mois clos. Consulte les écritures existantes sans synchroniser les comptes.',
  inputSchema: payoutsSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { periodFrom: monthProperty, periodTo: monthProperty, ownerClientId: idProperty }
  },
  feature: 'RENTAL',
  requiredPermission: PAYOUT_PERMISSION,
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PAYOUT_PERMISSION);
    await assertThirdPartyAllowedForTenant(ctx.tenantId, 'OWNER_ACCOUNT');
    await assertBelongsToTenant(prisma, 'tenantClient', input.ownerClientId, ctx.tenantId);
    const now = new Date();
    const period = resolvePeriod(input, now);
    const start = new Date(period.periodFrom + '-01T00:00:00Z');
    const next = new Date(period.periodTo + '-01T00:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + 1);
    const records = await prisma.ownerPayout.findMany({
      where: {
        tenantId: ctx.tenantId,
        ownerClientId: input.ownerClientId,
        ownerClient: { tenantId: ctx.tenantId },
        status: 'VALIDATED',
        paidAt: { gte: start, lt: next }
      },
      select: {
        year: true,
        sequence: true,
        paidAt: true,
        amount: true,
        ownerClientId: true,
        ownerClient: { select: { user: { select: { fullName: true } } } }
      },
      orderBy: [{ paidAt: 'desc' }, { id: 'asc' }],
      take: MAX_ROWS + 1
    });
    const href = `/tenant/${encodeURIComponent(ctx.tenantId)}/finance/owner-accounts`;
    const rows = records.slice(0, MAX_ROWS).map(row => ({
      number: payoutNumber(row.year, row.sequence),
      owner: row.ownerClient.user.fullName || t('Propriétaire'),
      href: `${href}/${encodeURIComponent(row.ownerClientId)}`,
      paidAt: row.paidAt.toISOString().slice(0, 10),
      amount: row.amount.toNumber(),
      currency: 'XOF'
    }));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Reversements propriétaires exécutés'),
      query: { tool: 'owner_payouts', ...input, ...period },
      columns: [
        { key: 'number', label: t('Numéro') },
        { key: 'owner', label: t('Propriétaire'), linkKey: 'href' },
        { key: 'paidAt', label: t('Date du reversement'), type: 'date' },
        { key: 'amount', label: t('Montant reversé'), type: 'currency' },
        { key: 'currency', label: t('Devise') }
      ],
      rows,
      truncated: records.length > MAX_ROWS,
      provenance: {
        source: t('Comptes propriétaires'),
        href,
        period: `${period.periodFrom} – ${period.periodTo}`,
        calculatedAt: now.toISOString(),
        rules: [t('Seuls les reversements validés en XOF sont inclus selon leur date de paiement.')]
      }
    };
    return outcome(
      { artifactId: artifact.id, rows: rows.slice(0, 10), truncated: artifact.truncated },
      { type: 'artifact', artifact }
    );
  }
};
