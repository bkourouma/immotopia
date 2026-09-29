import React from 'react';
import { Card, Switch } from 'antd';
import type { ProjectionScenarioKey } from '../../../services/patrimoine-projections-service';
import { t } from '../../../i18n/t';
import { NumField, SelectField } from './projection-fields';
import { MAX_HORIZON, SCENARIO_KEYS, scenarioLabel } from './projection-helpers';

/** Réglages généraux de la projection : horizon, scénario de base, comparaison des trois scénarios. */
export const ProjectionControls: React.FC<{
  horizon: string;
  horizonInvalid: boolean;
  baseScenario: ProjectionScenarioKey;
  compare: boolean;
  onHorizon: (value: string) => void;
  onBaseScenario: (value: ProjectionScenarioKey) => void;
  onCompare: (value: boolean) => void;
}> = ({ horizon, horizonInvalid, baseScenario, compare, onHorizon, onBaseScenario, onCompare }) => (
  <Card style={{ marginBottom: 'var(--space-4)' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'flex-end' }}>
      <NumField
        id="projection-horizon"
        label={t('Horizon (années)')}
        value={horizon}
        onChange={onHorizon}
        min={1}
        max={MAX_HORIZON}
        step={1}
        error={horizonInvalid ? t('Indiquez un horizon de 1 à 30 ans') : undefined}
      />
      <SelectField
        id="projection-scenario"
        label={t('Scénario de base')}
        value={baseScenario}
        onChange={value => onBaseScenario(value as ProjectionScenarioKey)}
        options={SCENARIO_KEYS.map(key => ({ value: key, label: scenarioLabel(key) }))}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 32 }}>
        <Switch checked={compare} onChange={onCompare} />
        <span>{t('Comparer les trois scénarios')}</span>
      </label>
    </div>
  </Card>
);
