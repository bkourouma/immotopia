import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Space } from 'antd';
import { PageHeader, SkeletonStats, StateBlock } from '../../components/primitives';
import { YieldCalculator, type YieldAssumptionsInput } from '../../components/patrimoine/YieldCalculator';
import { YieldProjectionChart } from '../../components/patrimoine/YieldProjectionChart';
import { getPatrimoinePerformance } from '../../services/patrimoine-service';
import { PropertySearchSelect } from '../../components/patrimoine/PropertySearchSelect';
import type { PropertyYieldData } from '../../types/patrimoine-types';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/t';
import { loadYieldAssumptions, persistYieldAssumptions } from '../../components/patrimoine/yield-assumptions-storage';

const DEFAULT_ASSUMPTIONS: YieldAssumptionsInput = {
  years: 10,
  valueGrowthRate: 0.03,
  rentGrowthRate: 0.02,
  expenseGrowthRate: 0.025,
  vacancyRate: 0.05
};

export const PatrimoinePerformancePage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<PropertyYieldData | null>(null);
  // Hypothèses indexées par bien : jamais utilisées pour un autre bien que celui d'origine.
  const [assumptionsState, setAssumptionsState] = useState<{
    propertyId: string;
    value: YieldAssumptionsInput;
  } | null>(null);
  const assumptions = assumptionsState && assumptionsState.propertyId === propertyId ? assumptionsState.value : null;
  const currentPropertyId = useRef<string | undefined>(undefined);
  currentPropertyId.current = propertyId;
  const [syncStatus, setSyncStatus] = useState<'synced' | 'local'>('synced');

  useEffect(() => {
    setAssumptionsState(null);
    setData(null);
    setError(null);
    if (!effectiveTenantId || !propertyId) return;
    let annule = false;
    setLoading(true);
    void loadYieldAssumptions(effectiveTenantId, propertyId).then(loaded => {
      if (annule) return;
      setAssumptionsState({ propertyId, value: loaded.assumptions ?? DEFAULT_ASSUMPTIONS });
      setSyncStatus(loaded.synced ? 'synced' : 'local');
    });
    return () => {
      annule = true;
    };
  }, [effectiveTenantId, propertyId]);

  const handleRecalculate = async (next: YieldAssumptionsInput) => {
    if (!effectiveTenantId || !propertyId) return;
    const cible = propertyId;
    const { synced } = await persistYieldAssumptions(effectiveTenantId, cible, next);
    if (currentPropertyId.current !== cible) return; // le bien a changé pendant l'enregistrement
    setSyncStatus(synced ? 'synced' : 'local');
    setAssumptionsState({ propertyId: cible, value: next });
  };

  useEffect(() => {
    if (!effectiveTenantId || !propertyId) {
      setLoading(false);
      setData(null);
      return;
    }
    if (!assumptions) return;
    let annule = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getPatrimoinePerformance(effectiveTenantId, propertyId, assumptions);
        if (annule) return;
        setData({
          grossYield: result.grossYield,
          netYield: result.netYield,
          netNetYield: result.netNetYield,
          latentCapitalGain: result.latentCapitalGain,
          projectedAtHorizon: result.projectedAtHorizon,
          projection: result.projection,
          assumptions: result.assumptions,
          assumptionsSaved: result.assumptionsSaved,
          ratios: result.ratios
        });
      } catch (e: any) {
        if (!annule) setError(e?.response?.data?.error || t('Erreur chargement performance'));
      } finally {
        if (!annule) setLoading(false);
      }
    };
    void run();
    return () => {
      annule = true;
    };
  }, [assumptions, effectiveTenantId, propertyId, attempt]);

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <PageHeader title={t('Performance Patrimoine')} subtitle={t('Rendement brut, net, net-net et projection')} />

        <PropertySearchSelect
          tenantId={effectiveTenantId}
          ariaLabel={t('Sélectionnez un bien')}
          placeholder={t('Sélectionnez un bien')}
          style={{ width: '100%' }}
          value={propertyId}
          onChange={setPropertyId}
        />

        {!propertyId ? (
          <StateBlock
            variant="empty"
            title={t('Aucun bien sélectionné')}
            description={t('Choisissez un bien dans la liste ci-dessus pour afficher sa performance.')}
          />
        ) : (
          <>
            <YieldCalculator
              data={data}
              loading={loading}
              assumptions={assumptions ?? DEFAULT_ASSUMPTIONS}
              syncStatus={syncStatus}
              onRecalculate={handleRecalculate}
            />
            {error ? (
              <StateBlock
                variant="error"
                description={t('Impossible de calculer la performance de ce bien.')}
                detail={error}
                onRetry={() => setAttempt(n => n + 1)}
              />
            ) : loading && !data ? (
              <SkeletonStats rows={4} />
            ) : (
              <YieldProjectionChart data={data?.projection ?? []} />
            )}
          </>
        )}
      </Space>
    </>
  );
};
