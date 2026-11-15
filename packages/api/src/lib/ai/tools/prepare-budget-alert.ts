import { z } from 'zod';
import { t } from '../../../i18n';
import { ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { budgetAlertThreshold } from '../../finance/schemas-pilotage';
import type { CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const siteId = z.string().uuid();
const permission = 'FINANCE_SITES_MANAGE';
const schema = z
  .object({
    site: z.string().trim().min(1).max(160),
    thresholdPercent: budgetAlertThreshold
  })
  .strict();

export const prepareBudgetAlertTool: CopilotToolDefinition<typeof schema> = {
  name: 'prepare_budget_alert',
  description:
    'Prépare le formulaire de seuil d’alerte du budget d’un chantier. ' +
    'Demander le nom exact du chantier (ou utiliser son UUID vérifié) et un pourcentage entier. ' +
    'Le seuil compare l’engagé au budget révisé. L’utilisateur décide dans le formulaire du chantier.',
  inputSchema: schema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['site', 'thresholdPercent'],
    properties: {
      site: { type: 'string', maxLength: 160 },
      thresholdPercent: { type: 'integer', minimum: 1, maximum: 2147483647 }
    }
  },
  requiredPermission: permission,
  additionalPermissions: ['FINANCE_ACCOUNTS_READ'],
  feature: 'CONSTRUCTION',
  kind: 'proposal',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    assertToolPermission(ctx, 'FINANCE_ACCOUNTS_READ');
    const matches = await prisma.constructionSite.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(siteId.safeParse(input.site).success
          ? { id: input.site }
          : { name: { equals: input.site, mode: 'insensitive' } })
      },
      select: { id: true, name: true, status: true },
      take: 2
    });
    if (matches.length > 1) throw new ConflictError(t('Plusieurs chantiers portent ce nom.'));
    const [site] = matches;
    if (!site) throw new NotFoundError(t('Chantier introuvable.'));
    if (site.status === 'CLOSED') throw new ConflictError(t('Le chantier est clôturé.'));
    const alert = {
      kind: 'construction_budget' as const,
      siteId: site.id,
      siteName: site.name,
      thresholdPercent: input.thresholdPercent
    };
    return outcome(
      { prepared: true, siteName: site.name, thresholdPercent: input.thresholdPercent },
      {
        type: 'prepared_alert',
        alert
      }
    );
  }
};
