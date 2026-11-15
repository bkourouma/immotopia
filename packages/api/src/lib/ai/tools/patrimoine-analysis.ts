import { randomUUID } from 'node:crypto';
import { t } from '../../../i18n';
import { getNetWorth, getNetWorthHistory } from '../../../services/patrimoine-assets-service';
import { netWorthHistoryQuerySchema, netWorthQuerySchema } from '../../patrimoine/asset-schemas';
import type { AnalysisTable, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const permission = 'PATRIMOINE_PERSONAL_VIEW';
const dateProperty = { type: 'string', format: 'date' };
const netWorthHistorySchema = netWorthHistoryQuerySchema.pick({ from: true, to: true });
const hrefFor = (tenantId: string) => `/tenant/${encodeURIComponent(tenantId)}/patrimoine/valeur-nette`;

function columns(): AnalysisTable['columns'] {
  return [
    { key: 'date', label: t('Date'), type: 'date' },
    { key: 'totalAssets', label: t('Total des actifs'), type: 'currency' },
    { key: 'totalDebts', label: t('Total des dettes'), type: 'currency' },
    { key: 'netWorth', label: t('Valeur nette'), type: 'currency' },
    { key: 'currency', label: t('Devise') }
  ];
}

function rules() {
  return [
    t('Chaque actif retenu utilise sa dernière valorisation à la date étudiée, convertie en XOF au taux enregistré.'),
    t(
      'Les dettes correspondent au capital restant dû des prêts actuellement actifs. Les montants sans taux de change exploitable sont écartés.'
    ),
    t('La valeur nette est égale au total des actifs moins le total des dettes.')
  ];
}

export const patrimonyNetWorthTool: CopilotToolDefinition<typeof netWorthQuerySchema> = {
  name: 'patrimony_net_worth',
  description:
    'Calcule la valeur des actifs, les dettes actives et la valeur nette en XOF selon la définition de l’écran Patrimoine. Indique la part peu fiable ou inconnue et les exclusions. Date de valorisation facultative, aujourd’hui par défaut. Pour une évolution mensuelle, utiliser patrimony_history.',
  inputSchema: netWorthQuerySchema,
  jsonSchema: { type: 'object', additionalProperties: false, properties: { asOf: dateProperty } },
  feature: 'PATRIMOINE',
  requiredPermission: permission,
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    const result = await getNetWorth(ctx.tenantId, input);
    const date = result.asOf.toISOString().slice(0, 10);
    const row = {
      date,
      totalAssets: result.totalAssets,
      totalDebts: result.totalDebts,
      netWorth: result.netWorth,
      currency: result.currency,
      lowReliabilityShare: result.lowReliabilityShare,
      excludedAssets: result.excluded.length,
      excludedLoans: result.excludedLoans.length
    };
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Valorisation du patrimoine'),
      query: { tool: 'patrimony_net_worth', asOf: date },
      columns: [
        ...columns(),
        { key: 'lowReliabilityShare', label: t('Part peu fiable ou inconnue (%)'), type: 'number' },
        { key: 'excludedAssets', label: t('Actifs exclus'), type: 'number' },
        { key: 'excludedLoans', label: t('Dettes exclues'), type: 'number' }
      ],
      rows: [row],
      provenance: {
        source: t('Valeur nette'),
        href: hrefFor(ctx.tenantId),
        period: date,
        calculatedAt: new Date().toISOString(),
        rules: rules()
      }
    };
    return outcome({ artifactId: artifact.id, rows: [row] }, { type: 'artifact', artifact });
  }
};

export const patrimonyHistoryTool: CopilotToolDefinition<typeof netWorthHistorySchema> = {
  name: 'patrimony_history',
  description:
    'Calcule l’évolution mensuelle des actifs, des dettes et de la valeur nette en XOF selon l’écran Patrimoine, sur 60 mois au plus. Dates from et to au format AAAA-MM-JJ, douze mois jusqu’à aujourd’hui par défaut. Les valorisations des actifs sont historiques, les dettes sont les prêts actuellement actifs.',
  inputSchema: netWorthHistorySchema,
  jsonSchema: { type: 'object', additionalProperties: false, properties: { from: dateProperty, to: dateProperty } },
  feature: 'PATRIMOINE',
  requiredPermission: permission,
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    const now = new Date();
    const to = input.to ?? now.toISOString().slice(0, 10);
    const history = await getNetWorthHistory(ctx.tenantId, { ...input, to });
    const rows = history.map(point => ({ ...point, currency: 'XOF' }));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Évolution de la valeur nette'),
      query: { tool: 'patrimony_history', ...input, to },
      columns: columns(),
      rows,
      provenance: {
        source: t('Valeur nette'),
        href: hrefFor(ctx.tenantId),
        period: `${rows[0]?.date ?? to} – ${to}`,
        calculatedAt: now.toISOString(),
        rules: rules()
      }
    };
    return outcome({ artifactId: artifact.id, rows: rows.slice(-10) }, { type: 'artifact', artifact });
  }
};
