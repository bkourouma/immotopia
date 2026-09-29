import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listAssets, listDebts } from '../../services/patrimoine-assets-service';
import {
  runProjection,
  runScenario,
  type ProjectionRequest,
  type ProjectionResponse,
  type ProjectionScenarioKey,
  type ScenarioDto,
  type ScenarioSettings,
  type SimulationOperation
} from '../../services/patrimoine-projections-service';
import { useAuth } from '../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, SkeletonStats, StateBlock } from '../../components/primitives';
import { apiErrorMessage } from '../../components/patrimoine/actifs/asset-format';
import type { AssumptionOverrides } from '../../components/patrimoine/projections/AssumptionsPanel';
import { ProjectionControls } from '../../components/patrimoine/projections/ProjectionControls';
import { ProjectionOutcome } from '../../components/patrimoine/projections/ProjectionOutcome';
import { DEFAULT_HORIZON, parseHorizon } from '../../components/patrimoine/projections/projection-helpers';
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

const HORIZON_DEBOUNCE_MS = 400;

/** Valeur qui ne suit `value` qu'après `delay` ms sans changement (un appel par pause de frappe, pas par touche). */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

const NotSelected: React.FC = () => (
  <StateBlock
    variant="empty"
    title={t('Aucune agence sélectionnée')}
    description={t('Votre compte doit être rattaché à une agence pour consulter son patrimoine.')}
  />
);

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
  // Saisie invalide (vide, 0, hors 1..30) : erreur de champ et aucun appel ; jamais de repli silencieux.
  const horizonInput = parseHorizon(horizon);
  const debouncedHorizon = useDebounced(horizon, HORIZON_DEBOUNCE_MS);
  const settledHorizon = parseHorizon(debouncedHorizon);
  const horizonYears = settledHorizon ?? DEFAULT_HORIZON;
  const horizonReady = horizonInput !== null && horizon === debouncedHorizon;
  const scenarioMode = opened !== null && !dirty;

  const assumptions = assumptionsBody(overrides);
  const request: ProjectionRequest = {
    horizonYears,
    baseScenario,
    ...(assumptions ? { assumptions } : {}),
    ...(compare ? { compareScenarios: true } : {})
  };

  const baseline = useQuery({
    queryKey: queryKey('patrimoine-projection', agence, { ...request }),
    queryFn: () => runProjection(agence as string, request),
    enabled: Boolean(agence) && !scenarioMode && horizonReady,
    staleTime: STALE_TIME.list,
    retry: false
  });

  // Le résultat de la comparaison n'est lu que sur la projection de base : la simulation ne la demande pas.
  const { compareScenarios: _compare, ...withoutCompare } = request;
  const simulationRequest: ProjectionRequest = { ...withoutCompare, operations: applied };
  const simulation = useQuery({
    queryKey: queryKey('patrimoine-simulation', agence, { ...simulationRequest }),
    queryFn: () => runProjection(agence as string, simulationRequest),
    enabled: Boolean(agence) && !scenarioMode && horizonReady && applied.length > 0,
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

  if (!agence) return <NotSelected />;

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

  // Réglages enregistrables ; `assumptions` toujours présent (même vide) : « Mettre à jour » remplace les réglages.
  const current: ScenarioSettings | null =
    horizonInput === null
      ? null
      : { horizonYears: horizonInput, baseScenario, assumptions: assumptions ?? {}, operations };

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

      <ProjectionControls
        horizon={horizon}
        horizonInvalid={horizonInput === null}
        baseScenario={baseScenario}
        compare={compare}
        onHorizon={value => {
          touch();
          setHorizon(value);
        }}
        onBaseScenario={value => {
          touch();
          setBaseScenario(value);
          setOverrides(NO_OVERRIDES);
        }}
        onCompare={setCompare}
      />

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
        <ProjectionOutcome
          data={data}
          baseScenario={baseScenario}
          compare={compare}
          nameOfAsset={nameOfAsset}
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
