import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { getPropertyForTenant, propertyTenantWhere } from '../../../utils/property-tenant-guard';
import { agreementNumber } from '../../sales/numbering';
import { COPILOT_ARTIFACT_MAX_ROWS, type AnalysisTable, type CopilotToolDefinition } from '../contracts';
import { assertToolPermission, isoDay, outcome } from './tool-utils';

const permission = 'CRM_DEALS_VIEW';
const inputSchema = z
  .object({
    programId: z.string().uuid().optional(),
    signedFrom: z.string().date().optional(),
    signedTo: z.string().date().optional(),
    onlyOverdue: z.boolean().optional()
  })
  .strict();

export const saleCommitmentsTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'sale_commitments',
  description:
    'Suit les ventes engagées par un compromis signé en cours. Liste le bien ou lot, la date de signature, le prix convenu, le dépôt prévu et la date prévue de l’acte. programId filtre le programme parent, signedFrom et signedTo la signature (inclus), onlyOverdue les actes dont la date prévue est passée. Le dépôt prévu ne constitue pas un encaissement. Pour les biens au seul statut Réservé, utiliser reserved_sale_properties.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      programId: { type: 'string', format: 'uuid' },
      signedFrom: { type: 'string', format: 'date' },
      signedTo: { type: 'string', format: 'date' },
      onlyOverdue: { type: 'boolean' }
    }
  },
  feature: 'SALES',
  requiredPermission: permission,
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    const { programId, signedFrom, signedTo, onlyOverdue } = input;
    if (signedFrom && signedTo && signedFrom > signedTo)
      throw new BadRequestError(t('La période demandée est invalide.'));
    if (programId) await getPropertyForTenant(programId, ctx.tenantId);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const propertyScope = propertyTenantWhere(ctx.tenantId);
    const records = await prisma.saleAgreement.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'SIGNED',
        signedAt: {
          not: null,
          gte: signedFrom ? new Date(signedFrom) : undefined,
          lte: signedTo ? new Date(signedTo) : undefined
        },
        ...(onlyOverdue ? { expectedDeedDate: { lt: new Date(today) } } : {}),
        property: {
          ...propertyScope,
          ...(programId ? { containerParentId: programId, containerParent: propertyScope } : {})
        }
      },
      select: {
        id: true,
        year: true,
        sequence: true,
        price: true,
        depositAmount: true,
        signedAt: true,
        expectedDeedDate: true,
        property: { select: { title: true, currency: true } }
      },
      orderBy: [{ expectedDeedDate: 'asc' }, { id: 'asc' }],
      take: COPILOT_ARTIFACT_MAX_ROWS + 1
    });
    const href = `/tenant/${encodeURIComponent(ctx.tenantId)}/sales`;
    const rows = records.slice(0, COPILOT_ARTIFACT_MAX_ROWS).map(record => ({
      number: agreementNumber(record.year, record.sequence),
      href: `${href}/agreements/${record.id}`,
      property: record.property.title,
      signedAt: isoDay(record.signedAt),
      expectedDeedDate: isoDay(record.expectedDeedDate),
      price: record.price.toNumber(),
      deposit: record.depositAmount?.toNumber() ?? null,
      currency: record.property.currency === 'FCFA' ? 'XOF' : record.property.currency || 'XOF'
    }));
    const period =
      signedFrom && signedTo
        ? `${signedFrom} – ${signedTo}`
        : signedFrom
          ? t('À partir du {{date}}', { date: signedFrom })
          : signedTo
            ? t('Jusqu’au {{date}}', { date: signedTo })
            : t('Toutes les dates de signature');
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Compromis de vente signés en cours'),
      query: { tool: 'sale_commitments', ...input },
      columns: [
        { key: 'number', label: t('Compromis'), linkKey: 'href' },
        { key: 'property', label: t('Bien ou lot') },
        { key: 'signedAt', label: t('Date de signature'), type: 'date' },
        { key: 'expectedDeedDate', label: t('Date prévue de l’acte'), type: 'date' },
        { key: 'price', label: t('Prix convenu'), type: 'currency' },
        { key: 'deposit', label: t('Dépôt prévu'), type: 'currency' },
        { key: 'currency', label: t('Devise') }
      ],
      rows,
      truncated: records.length > rows.length,
      provenance: {
        source: t('Compromis de vente'),
        href,
        period,
        calculatedAt: now.toISOString(),
        rules: [
          t(
            'Seuls les compromis signés et encore en cours sont inclus. Le dépôt prévu est le montant inscrit au compromis.'
          ),
          ...(onlyOverdue ? [t('La date prévue de l’acte est antérieure au {{date}}.', { date: today })] : [])
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, items: rows.slice(0, 8), truncated: artifact.truncated },
      { type: 'artifact', artifact }
    );
  }
};
