import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { getPropertyForTenant, propertyTenantWhere } from '../../../utils/property-tenant-guard';
import { COPILOT_ARTIFACT_MAX_ROWS, type AnalysisTable, type CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const permission = 'PROPERTIES_VIEW';
const inputSchema = z.object({ programId: z.string().uuid().optional() }).strict();

export const reservedPropertiesTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'reserved_sale_properties',
  description:
    'Inventorie les biens et lots proposés à la vente dont le statut actuel est Réservé. programId filtre les lots dont ce bien est le programme ou immeuble parent. Les prix sont les prix affichés, pas des acomptes ni des montants de contrats de réservation.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { programId: { type: 'string', format: 'uuid' } }
  },
  feature: 'SALES',
  requiredPermission: permission,
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    if (input.programId) await getPropertyForTenant(input.programId, ctx.tenantId);
    const date = new Date().toISOString();
    const records = await prisma.property.findMany({
      where: {
        ...propertyTenantWhere(ctx.tenantId),
        status: 'RESERVED',
        transactionModes: { has: 'SALE' },
        ...(input.programId
          ? {
              containerParentId: input.programId,
              containerParent: propertyTenantWhere(ctx.tenantId)
            }
          : {})
      },
      select: {
        id: true,
        internalReference: true,
        title: true,
        price: true,
        currency: true,
        locationZone: true,
        containerParent: { select: { title: true, tenantId: true } }
      },
      orderBy: [{ internalReference: 'asc' }, { id: 'asc' }],
      take: COPILOT_ARTIFACT_MAX_ROWS + 1
    });
    const href = `/tenant/${encodeURIComponent(ctx.tenantId)}/properties`;
    const rows = records.slice(0, COPILOT_ARTIFACT_MAX_ROWS).map(property => ({
      reference: property.internalReference,
      name: property.title,
      href: `${href}/${encodeURIComponent(property.id)}`,
      program: property.containerParent?.tenantId === ctx.tenantId ? property.containerParent.title : null,
      zone: property.locationZone,
      price: property.price,
      currency: property.currency === 'FCFA' ? 'XOF' : property.currency
    }));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Biens et lots réservés à la vente'),
      query: { tool: 'reserved_sale_properties', ...input },
      columns: [
        { key: 'reference', label: t('Référence') },
        { key: 'name', label: t('Bien ou lot'), linkKey: 'href' },
        { key: 'program', label: t('Programme / immeuble') },
        { key: 'zone', label: t('Zone') },
        { key: 'price', label: t('Prix affiché'), type: 'currency' },
        { key: 'currency', label: t('Devise') }
      ],
      rows,
      truncated: records.length > rows.length,
      provenance: {
        source: t('Parc immobilier'),
        href,
        period: date.slice(0, 10),
        calculatedAt: date,
        rules: [
          t(
            'Le statut Réservé est celui de la fiche du bien ou du lot à la date du calcul. Le prix est le prix affiché.'
          )
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, items: rows.slice(0, 8), truncated: artifact.truncated },
      { type: 'artifact', artifact }
    );
  }
};
