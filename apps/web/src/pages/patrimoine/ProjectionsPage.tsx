import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Card, Switch } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listAssets, listDebts } from '../../services/patrimoine-assets-service';
import {
  runProjection,
  runScenario,
  type ProjectionRequest,
  type ProjectionResponse,
  type ProjectionScenarioKey,
  type ScenarioDto,
  type ScenarioInput,
  type SimulationOperation
} from '../../services/patrimoine-projections-service';
import { useAuth } from '../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, SkeletonStats, StateBlock } from '../../components/primitives';
import { apiErrorMessage } from '../../components/patrimoine/actifs/asset-format';
import { AssumptionsPanel, type AssumptionOverrides } from '../../components/patrimoine/projections/AssumptionsPanel';
import { NumField, SelectField } from '../../components/patrimoine/projections/projection-fields';
import {
  DEFAULT_HORIZON,
  MAX_HORIZON,
  SCENARIO_KEYS,
  collectWarnings,
  scenarioLabel,
  warningText
} from '../../components/patrimoine/projections/projection-helpers';
import {
  ProjectionChartCard,
  ProjectionTableCard,
  SimulationDeltaCard
} from '../../components/patrimoine/projections/ProjectionResults';
import { ScenariosPanel } from '../../components/patrimoine/projections/ScenariosPanel';
import { SimulationPanel } from '../../components/patrimoine/projections/SimulationPanel';
import { t } from '../../i18n/t';

const NO_OVERRIDES: AssumptionOverrides = { growth: {} };

function assumptionsBody(overrides: AssumptionOverrides): ProjectionRequest['assumptions'] {
  const hasGrowth = Object.keys(overrides.growth).length > 0;
  if (!hasGrowth && overrides.inflation === undefined) return undefined;
  return {
    ...(hasGrowth ? { growthPercentByClass: overrides.growth } : {}),
    ...(overrides.inflation !== undefined ? { inflationPercent: overrides.inflation } : {})
  };
}

/**
 * Projections du patrimoine : valeur nette année par année selon un scénario,
 * hypothèses modifiables, simulations d'opérations et scénarios enregistrés.
 * Rien de ce qui est calculé ici n'est écrit sur les données réelles.
 */
export const ProjectionsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  const [horizon, setHorizon] = useState(String(DEFAULT_HORIZON));
  const [baseScenario, setBaseScenario] = useState<ProjectionScenarioKey>('CENTRAL');
  const [compare, setCompare] = useState(false);
  const [overrides, setOverrides] = useState<AssumptionOverrides>(NO_OVERRIDES);
  const [operations, setOperations] = useState<SimulationOperation[]>([]);
  const [applied, setApplied] = useState<SimulationOperation[]>([]);
  // Scénario ouvert : son résultat vient de `runScenario` tant que rien n'a été modifié.
  const [opened, setOpened] = useState<{ id: string; at: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  const touch = () => setDirty(true);
  const horizonYears = Math.min(MAX_HORIZON, Math.max(1, Math.round(Number(horizon)) || DEFAULT_HORIZON));
  const scenarioMode = opened !== null && !dirty;

  const request: ProjectionRequest = {
    horizonYears,
    baseScenario,
    ...(assumptionsBody(overrides) ? { assumptions: assumptionsBody(overrides) } : {}),
    ...(compare ? { compareScenarios: true } : {})
  };

  const baseline = useQuery({
    queryKey: queryKey('patrimoine-projection', agence, { ...request }),
    queryFn: () => runProjection(agence as string, request),
    enabled: Boolean(agence) && !scenarioMode,
    staleTime: STALE_TIME.list,
    retry: false
  });

  const simulationRequest: ProjectionRequest = { ...request, operations: applied };
  const simulation = useQuery({
    queryKey: queryKey('patrimoine-simulation', agence, { ...simulationRequest }),
    queryFn: () => runProjection(agence as string, simulationRequest),
    enabled: Boolean(agence) && !scenarioMode && applied.length > 0,
    staleTime: STALE_TIME.list,
    retry: false
  });

  const scenarioRun = useQuery({
    queryKey: queryKey('patrimoine-scenario-run', agence, { id: opened?.id, at: opened?.at, compare }),
    queryFn: () => runScenario(agence as string, (opened as { id: string }).id, { compareScenarios: compare }),
    enabled: Boolean(agence) && scenarioMode,
    staleTime: 0,
    retry: false
  });

  const assetsQuery = useQuery({
    queryKey: queryKey('patrimoine-assets', agence, {}),
    queryFn: () => listAssets(agence as string),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });
  const debtsQuery = useQuery({
    queryKey: queryKey('patrimoine-debts', agence, {}),
    queryFn: () => listDebts(agence as string, {}),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  if (!agence) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucune agence sélectionnée')}
        description={t('Votre compte doit être rattaché à une agence pour consulter son patrimoine.')}
      />
    );
  }

  const active = scenarioMode ? scenarioRun : baseline;
  const data: ProjectionResponse | undefined = scenarioMode
    ? scenarioRun.data
    : baseline.data && {
        ...baseline.data,
        simulated: simulation.data?.simulated,
        delta: simulation.data?.delta
      };
  const empty = data ? (data.base.points[0]?.assets ?? 0) <= 0 : false;
  const assets = assetsQuery.data ?? [];
  const nameOfAsset = (id: string) => assets.find(asset => asset.id === id)?.name;

  const openScenario = (scenario: ScenarioDto) => {
    setHorizon(String(scenario.horizonYears));
    setBaseScenario(scenario.baseScenario);
    setOverrides({
      growth: scenario.assumptions.growthPercentByClass ?? {},
      inflation: scenario.assumptions.inflationPercent
    });
    setOperations(scenario.operations);
    setApplied(scenario.operations);
    setOpened({ id: scenario.id, at: Date.now() });
    setDirty(false);
  };

  const current: ScenarioInput = {
    name: '',
    horizonYears,
    baseScenario,
    ...(assumptionsBody(overrides) ? { assumptions: assumptionsBody(overrides) } : {}),
    operations
  };

  return (
    <>
      <PageHeader
        title={t('Projections')}
        subtitle={t('Votre valeur nette année par année, selon des hypothèses que vous pouvez modifier')}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 'var(--space-4)' }}
        title={t('Ces projections reposent sur des hypothèses indicatives, elles ne sont pas une prévision.')}
        description={t(
          'Les mensualités de vos dettes sont supposées payées par vos revenus, qui ne sont pas modélisés : la valeur nette augmente donc du capital remboursé.'
        )}
      />

      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'flex-end' }}>
          <NumField
            id="projection-horizon"
            label={t('Horizon (années)')}
            value={horizon}
            onChange={value => {
              touch();
              setHorizon(value);
            }}
            min={1}
            max={MAX_HORIZON}
            step={1}
          />
          <SelectField
            id="projection-scenario"
            label={t('Scénario de base')}
            value={baseScenario}
            onChange={value => {
              touch();
              setBaseScenario(value as ProjectionScenarioKey);
              setOverrides(NO_OVERRIDES);
            }}
            options={SCENARIO_KEYS.map(key => ({ value: key, label: scenarioLabel(key) }))}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 32 }}>
            <Switch checked={compare} onChange={setCompare} />
            <span>{t('Comparer les trois scénarios')}</span>
          </label>
        </div>
      </Card>

      {active.error ? (
        <StateBlock
          variant="error"
          description={apiErrorMessage(active.error, t('Impossible de calculer la projection.'))}
          actions={[{ label: t('Réessayer'), onClick: () => active.refetch(), primary: true }]}
        />
      ) : active.isPending || !data ? (
        <SkeletonStats rows={3} aria-label={t('Projection en cours de chargement')} />
      ) : empty ? (
        <StateBlock
          variant="empty"
          title={t("Aucune projection pour l'instant")}
          description={
            <>
              {t('Ajoutez un actif avec une valeur pour lancer une projection')}{' '}
              <Link to={`/tenant/${agence}/patrimoine/actifs`}>{t('Mes actifs')}</Link>
            </>
          }
        />
      ) : (
        <>
          {collectWarnings(data).length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 'var(--space-4)' }}
              title={t('À savoir sur ces résultats')}
              description={
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  {collectWarnings(data).map((warning, index) => (
                    <li key={index}>
                      {warningText(
                        warning,
                        warning.code === 'ASSET_WITHOUT_VALUE' ? nameOfAsset(warning.assetId) : undefined
                      )}
                    </li>
                  ))}
                </ul>
              }
            />
          )}
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <ProjectionChartCard data={data} baseScenario={baseScenario} compare={compare} />
            <SimulationDeltaCard data={data} />
            <ProjectionTableCard points={data.base.points} />
            <AssumptionsPanel
              used={data.assumptionsUsed}
              overrides={overrides}
              onApply={next => {
                touch();
                setOverrides(next);
              }}
              onReset={() => {
                touch();
                setOverrides(NO_OVERRIDES);
              }}
            />
          </div>
        </>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
        <SimulationPanel
          horizon={horizonYears}
          operations={operations}
          assets={assets}
          debts={debtsQuery.data ?? []}
          onChange={next => {
            touch();
            setOperations(next);
          }}
          onRun={() => {
            touch();
            setApplied(operations);
          }}
          running={simulation.isFetching}
          outdated={JSON.stringify(operations) !== JSON.stringify(applied)}
          canRun={operations.length > 0 || applied.length > 0}
          error={scenarioMode ? null : simulation.error}
        />
        <ScenariosPanel tenantId={agence} current={current} onOpen={openScenario} openedId={opened?.id ?? null} />
      </div>
    </>
  );
};
