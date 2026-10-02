import React, { useState } from 'react';
import { Alert, Button, Card, Tag, Typography } from 'antd';
import type { AssetClass } from '../../../services/patrimoine-assets-service';
import type { ProjectionAssumptions } from '../../../services/patrimoine-projections-service';
import { ASSET_CLASS_KEYS, assetClassLabel } from '../actifs/asset-classes';
import { t } from '../../../i18n/t';
import { NumField } from './projection-fields';

export interface AssumptionOverrides {
  growth: Partial<Record<AssetClass, number>>;
  inflation?: number;
}

const GROWTH_MIN = -50;
const GROWTH_MAX = 100;
const INFLATION_MIN = 0;
const INFLATION_MAX = 100;

const inRange = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;

const Editor: React.FC<{
  used: ProjectionAssumptions;
  overrides: AssumptionOverrides;
  onApply: (overrides: AssumptionOverrides) => void;
  onReset: () => void;
}> = ({ used, overrides, onApply, onReset }) => {
  const classes = ASSET_CLASS_KEYS.filter(key => used.growthPercentByClass[key] !== undefined);
  const [growth, setGrowth] = useState<Record<string, string>>(() =>
    Object.fromEntries(classes.map(key => [key, String(used.growthPercentByClass[key])]))
  );
  const [inflation, setInflation] = useState(String(used.inflationPercent));
  const [error, setError] = useState<string | null>(null);
  const customized = Object.keys(overrides.growth).length > 0 || overrides.inflation !== undefined;

  const apply = () => {
    const nextGrowth: Partial<Record<AssetClass, number>> = { ...overrides.growth };
    for (const key of classes) {
      const value = Number(growth[key]);
      if (growth[key]?.trim() === '' || !inRange(value, GROWTH_MIN, GROWTH_MAX)) {
        setError(t("La croissance doit être comprise entre −50 % et 100 %, et l'inflation entre 0 % et 100 %."));
        return;
      }
      if (value !== used.growthPercentByClass[key] || key in nextGrowth) nextGrowth[key] = value;
    }
    const inflationValue = Number(inflation);
    if (inflation.trim() === '' || !inRange(inflationValue, INFLATION_MIN, INFLATION_MAX)) {
      setError(t("La croissance doit être comprise entre −50 % et 100 %, et l'inflation entre 0 % et 100 %."));
      return;
    }
    setError(null);
    onApply({
      growth: nextGrowth,
      inflation:
        inflationValue !== used.inflationPercent || overrides.inflation !== undefined ? inflationValue : undefined
    });
  };

  return (
    <>
      <Typography.Paragraph type="secondary">
        {t("Croissance annuelle nominale supposée pour chaque classe d'actifs, et inflation annuelle.")}
      </Typography.Paragraph>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        {classes.map(key => (
          <div key={key} style={{ flex: '1 1 200px', minWidth: 180 }}>
            <NumField
              id={`hyp-${key}`}
              label={`${assetClassLabel(key)} (%)`}
              value={growth[key] ?? ''}
              onChange={value => setGrowth(current => ({ ...current, [key]: value }))}
              min={GROWTH_MIN}
              max={GROWTH_MAX}
            />
            {key in overrides.growth && <Tag color="orange">{t('Personnalisée')}</Tag>}
          </div>
        ))}
        <div style={{ flex: '1 1 200px', minWidth: 180 }}>
          <NumField
            id="hyp-inflation"
            label={t('Inflation (%)')}
            value={inflation}
            onChange={setInflation}
            min={INFLATION_MIN}
            max={INFLATION_MAX}
          />
          {overrides.inflation !== undefined && <Tag color="orange">{t('Personnalisée')}</Tag>}
        </div>
      </div>
      {error && <Alert type="error" showIcon style={{ marginTop: 'var(--space-3)' }} title={error} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
        <Button type="primary" onClick={apply}>
          {t('Appliquer les hypothèses')}
        </Button>
        <Button onClick={onReset} disabled={!customized}>
          {t('Rétablir les hypothèses par défaut')}
        </Button>
      </div>
      <Typography.Paragraph type="secondary" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
        {customized
          ? t('Les classes marquées « Personnalisée » utilisent votre valeur ; les autres suivent le scénario choisi.')
          : t('Aucune hypothèse personnalisée : toutes les valeurs suivent le scénario choisi.')}
      </Typography.Paragraph>
    </>
  );
};

/** Hypothèses effectivement utilisées, avec édition des surcharges (bornées) et retour aux valeurs par défaut. */
export const AssumptionsPanel: React.FC<{
  used: ProjectionAssumptions;
  overrides: AssumptionOverrides;
  onApply: (overrides: AssumptionOverrides) => void;
  onReset: () => void;
}> = props => (
  <Card title={t('Hypothèses')}>
    <Editor key={JSON.stringify(props.used)} {...props} />
  </Card>
);
