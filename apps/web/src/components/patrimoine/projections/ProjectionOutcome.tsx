import React from 'react';
import { Alert } from 'antd';
import type { ProjectionResponse, ProjectionScenarioKey } from '../../../services/patrimoine-projections-service';
import { t } from '../../../i18n/t';
import { AssumptionsPanel, type AssumptionOverrides } from './AssumptionsPanel';
import { collectWarnings, warningText } from './projection-helpers';
import { ProjectionChartCard, ProjectionTableCard, SimulationDeltaCard } from './ProjectionResults';

/** Avertissements du calcul (base et simulation), en texte lisible. */
const WarningsAlert: React.FC<{ data: ProjectionResponse; nameOfAsset: (id: string) => string | undefined }> = ({
  data,
  nameOfAsset
}) => {
  const warnings = collectWarnings(data);
  if (warnings.length === 0) return null;
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 'var(--space-4)' }}
      title={t('À savoir sur ces résultats')}
      description={
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {warnings.map((warning, index) => (
            <li key={index}>
              {warningText(warning, warning.code === 'ASSET_WITHOUT_VALUE' ? nameOfAsset(warning.assetId) : undefined)}
            </li>
          ))}
        </ul>
      }
    />
  );
};

/** Résultats d'une projection : avertissements, courbe, écart de simulation, tableau annuel et hypothèses. */
export const ProjectionOutcome: React.FC<{
  data: ProjectionResponse;
  baseScenario: ProjectionScenarioKey;
  compare: boolean;
  nameOfAsset: (id: string) => string | undefined;
  overrides: AssumptionOverrides;
  onApply: (overrides: AssumptionOverrides) => void;
  onReset: () => void;
}> = ({ data, baseScenario, compare, nameOfAsset, overrides, onApply, onReset }) => (
  <>
    <WarningsAlert data={data} nameOfAsset={nameOfAsset} />
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <ProjectionChartCard data={data} baseScenario={baseScenario} compare={compare} />
      <SimulationDeltaCard data={data} />
      <ProjectionTableCard points={data.base.points} />
      <AssumptionsPanel used={data.assumptionsUsed} overrides={overrides} onApply={onApply} onReset={onReset} />
    </div>
  </>
);
