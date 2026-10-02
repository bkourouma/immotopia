import React from 'react';
import { Card, Table, Typography } from 'antd';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  ProjectionPoint,
  ProjectionResponse,
  ProjectionScenarioKey
} from '../../../services/patrimoine-projections-service';
import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';
import { formatAmount } from '../actifs/asset-format';
import {
  SCENARIO_KEYS,
  SCENARIO_STROKES,
  buildChartRows,
  formatSigned,
  scenarioLabel,
  yearLabel
} from './projection-helpers';

const compact = (value: unknown) =>
  new Intl.NumberFormat(activeLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value ?? 0));
const full = (value: unknown) => formatAmount(Number(Array.isArray(value) ? value[0] : (value ?? 0)), 'XOF');

/**
 * Courbe de la valeur nette par année. Chaque courbe a un nom en légende et un
 * motif de trait : la couleur ne porte jamais seule le sens. Le tableau annuel
 * placé dessous est l'alternative textuelle du graphique.
 */
export const ProjectionChartCard: React.FC<{
  data: ProjectionResponse;
  baseScenario: ProjectionScenarioKey;
  compare: boolean;
}> = ({ data, baseScenario, compare }) => {
  const rows = buildChartRows(data);
  return (
    <Card title={t('Valeur nette par année')}>
      <div
        role="img"
        aria-label={t('Courbe de la valeur nette par année ; les valeurs exactes figurent dans le tableau annuel.')}
        style={{ width: '100%', height: 320 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis width={70} tickFormatter={compact} />
            <Tooltip formatter={full} labelFormatter={label => yearLabel(Number(label))} />
            <Legend />
            {compare ? (
              SCENARIO_KEYS.map(key => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={t('Scénario {{nom}}', { nom: scenarioLabel(key) })}
                  stroke={SCENARIO_STROKES[key].color}
                  strokeDasharray={SCENARIO_STROKES[key].dash}
                  strokeWidth={key === baseScenario ? 3 : 2}
                  dot={false}
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey="base"
                name={t('Base ({{nom}})', { nom: scenarioLabel(baseScenario) })}
                stroke={SCENARIO_STROKES[baseScenario].color}
                strokeWidth={2}
                dot={false}
              />
            )}
            {data.simulated && (
              <Line
                type="monotone"
                dataKey="simulated"
                name={t('Simulation')}
                stroke="#fa8c16"
                strokeDasharray="6 3"
                strokeWidth={2}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

/** Tableau annuel de la trajectoire de base : actifs, dettes, valeur nette et valeur réelle. */
export const ProjectionTableCard: React.FC<{ points: ProjectionPoint[] }> = ({ points }) => (
  <Card title={t('Tableau annuel')}>
    <Table<ProjectionPoint>
      size="small"
      rowKey="year"
      pagination={false}
      dataSource={points}
      scroll={{ x: 'max-content' }}
      columns={[
        { title: t('Année'), dataIndex: 'year', render: (year: number) => yearLabel(year) },
        {
          title: t('Actifs'),
          dataIndex: 'assets',
          align: 'end',
          render: (value: number) => formatAmount(value, 'XOF')
        },
        {
          title: t('Dettes'),
          dataIndex: 'debts',
          align: 'end',
          render: (value: number) => formatAmount(value, 'XOF')
        },
        {
          title: t('Valeur nette'),
          dataIndex: 'netWorth',
          align: 'end',
          render: (value: number) => formatAmount(value, 'XOF')
        },
        {
          title: t("Valeur réelle (pouvoir d'achat d'aujourd'hui)"),
          dataIndex: 'realNetWorth',
          align: 'end',
          render: (value: number) => formatAmount(value, 'XOF')
        }
      ]}
    />
  </Card>
);

interface DeltaRow {
  year: number;
  base: number;
  simulated: number;
  delta: number;
}

/** Écart entre la simulation et la base, année par année, avec la phrase de synthèse. */
export const SimulationDeltaCard: React.FC<{ data: ProjectionResponse }> = ({ data }) => {
  if (!data.simulated) return null;
  const deltas = new Map((data.delta ?? []).map(entry => [entry.year, entry.netWorth]));
  const simulated = new Map(data.simulated.points.map(point => [point.year, point.netWorth]));
  const rows: DeltaRow[] = data.base.points.map(point => {
    const sim = simulated.get(point.year) ?? point.netWorth;
    return {
      year: point.year,
      base: point.netWorth,
      simulated: sim,
      delta: deltas.get(point.year) ?? sim - point.netWorth
    };
  });
  const last = rows[rows.length - 1];
  return (
    <Card title={t('Écart avec la base')}>
      {last && (
        <Typography.Paragraph strong>
          {t("Valeur nette à l'année {{year}} : {{ecart}} par rapport à la base", {
            year: last.year,
            ecart: formatSigned(last.delta)
          })}
        </Typography.Paragraph>
      )}
      <Table<DeltaRow>
        size="small"
        rowKey="year"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: t('Année'), dataIndex: 'year', render: (year: number) => yearLabel(year) },
          {
            title: t('Base'),
            dataIndex: 'base',
            align: 'end',
            render: (value: number) => formatAmount(value, 'XOF')
          },
          {
            title: t('Simulation'),
            dataIndex: 'simulated',
            align: 'end',
            render: (value: number) => formatAmount(value, 'XOF')
          },
          {
            title: t('Écart'),
            dataIndex: 'delta',
            align: 'end',
            render: (value: number) => formatSigned(value)
          }
        ]}
      />
    </Card>
  );
};
