import { randomUUID } from 'node:crypto';
import { BudgetStatus } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError, NotFoundError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { attachBudgetActuals } from '../../syndics/budget-actuals';
import { assertSyndicateOfTenant } from '../../syndics/charge-allocation';
import { roundMoney } from '../../syndics/finance-utils';
import type { AnalysisTable, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const permission = 'SYNDIC_VIEW';
const maxBudgets = 100;
const maxLines = 500;
const inputSchema = z
  .object({
    syndicateId: z.string().uuid(),
    fiscalYear: z.number().int().min(1900).max(9998),
    budgetId: z.string().uuid().optional(),
    status: z.nativeEnum(BudgetStatus).optional()
  })
  .strict();

export const syndicateBudgetTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'syndicate_budget',
  description:
    'Compare le budget prévisionnel et le réalisé par poste dans une copropriété et un exercice. Affiche chaque budget séparément, avec filtres facultatifs par budget et statut. L’écart est le prévisionnel moins le réalisé.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['syndicateId', 'fiscalYear'],
    properties: {
      syndicateId: { type: 'string', format: 'uuid' },
      fiscalYear: { type: 'integer', minimum: 1900, maximum: 9998 },
      budgetId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: Object.values(BudgetStatus) }
    }
  },
  requiredPermission: permission,
  feature: 'SYNDIC',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    const { syndicateId, fiscalYear, budgetId, status } = input;
    await assertSyndicateOfTenant(prisma, ctx.tenantId, syndicateId);
    const budgets = await prisma.syndicateBudget.findMany({
      where: { id: budgetId, syndicateId, syndicate: { tenantId: ctx.tenantId }, fiscalYear, status },
      select: {
        id: true,
        label: true,
        fiscalYear: true,
        currency: true,
        status: true,
        lines: {
          select: { id: true, category: true, description: true, amountForecast: true, amountActual: true },
          orderBy: [{ category: 'asc' }, { description: 'asc' }, { id: 'asc' }],
          take: maxLines + 1
        }
      },
      orderBy: [{ label: 'asc' }, { id: 'asc' }],
      take: maxBudgets + 1
    });
    if (budgetId && budgets.length === 0) throw new NotFoundError(t('Budget de copropriété introuvable.'));
    if (budgets.length > maxBudgets) throw new BadRequestError(t('Trop de budgets. Précisez le budget ou son statut.'));

    const lineCount = budgets.reduce((count, budget) => count + budget.lines.length, 0);
    let remaining = maxLines;
    const visibleBudgets = budgets
      .map(budget => {
        const lines = budget.lines.slice(0, remaining);
        remaining -= lines.length;
        return { ...budget, lines };
      })
      .filter(budget => budget.lines.length > 0);
    const calculated = await attachBudgetActuals(ctx.tenantId, syndicateId, visibleBudgets);
    const statusLabels: Record<BudgetStatus, string> = {
      DRAFT: t('Brouillon'),
      APPROVED: t('Approuvé'),
      REVISED: t('Révisé'),
      CLOSED: t('Clôturé')
    };
    const rows = calculated.flatMap(budget =>
      (budget.lines ?? []).map(line => {
        const forecast = Number(line.amountForecast);
        return {
          budget: budget.label,
          status: statusLabels[budget.status],
          currency: budget.currency === 'FCFA' ? 'XOF' : budget.currency,
          category: line.category,
          line: line.description,
          forecast,
          actual: line.actualTotal,
          variance: roundMoney(forecast - line.actualTotal)
        };
      })
    );
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Écarts budgétaires de copropriété'),
      query: { tool: 'syndicate_budget', ...input },
      columns: [
        { key: 'budget', label: t('Budget') },
        { key: 'status', label: t('Statut') },
        { key: 'currency', label: t('Devise') },
        { key: 'category', label: t('Catégorie') },
        { key: 'line', label: t('Poste budgétaire') },
        { key: 'forecast', label: t('Prévisionnel'), type: 'currency' },
        { key: 'actual', label: t('Réalisé'), type: 'currency' },
        { key: 'variance', label: t('Écart'), type: 'currency' }
      ],
      rows,
      truncated: lineCount > maxLines,
      provenance: {
        source: t('Budgets de copropriété'),
        href: `/tenant/${encodeURIComponent(ctx.tenantId)}/syndics/${syndicateId}/budgets`,
        period: String(fiscalYear),
        calculatedAt: new Date().toISOString(),
        rules: [
          t(
            'Le réalisé inclut les factures non annulées et les coûts d’incident rattachés au poste qui ne sont pas déjà comptabilisés.'
          ),
          t('L’écart correspond au prévisionnel moins le réalisé. Un écart négatif indique un dépassement.')
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, items: rows.slice(0, 10), truncated: lineCount > 10 },
      { type: 'artifact', artifact }
    );
  }
};
