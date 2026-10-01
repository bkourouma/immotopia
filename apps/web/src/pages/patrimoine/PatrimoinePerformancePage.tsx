import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Select, Space, Spin, Typography } from 'antd';
import { YieldCalculator, type YieldAssumptionsInput } from '../../components/patrimoine/YieldCalculator';
import { YieldProjectionChart } from '../../components/patrimoine/YieldProjectionChart';
import { getPatrimoinePerformance } from '../../services/patrimoine-service';
import { listProperties } from '../../services/property-service';
import type { PropertyYieldData } from '../../types/patrimoine-types';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/t';
import { loadYieldAssumptions, persistYieldAssumptions } from '../../components/patrimoine/yield-assumptions-storage';

const { Title, Text } = Typography;

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
  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  const [propertyOptions, setPropertyOptions] = useState<Array<{ label: string; value: string }>>([]);
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
    if (!effectiveTenantId) return;
    const run = async () => {
      try {
        const properties = await listProperties(effectiveTenantId, { page: 1, limit: 100 });
        setPropertyOptions(properties.properties.map(property => ({ value: property.id, label: property.title })));
      } catch {
        setPropertyOptions([]);
      }
    };
    void run();
  }, [effectiveTenantId]);

  useEffect(() => {
    setAssumptionsState(null);
    setData(null);
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
  }, [assumptions, effectiveTenantId, propertyId]);

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ marginBottom: 0 }}>
            {t('Performance Patrimoine')}
          </Title>
          <Text type="secondary">{t('Rendement brut, net, net-net et projection')}</Text>
        </div>

        <Select
          allowClear
          placeholder={t('Sélectionnez un bien')}
          style={{ width: '100%' }}
          showSearch
          optionFilterProp="label"
          filterOption={(input, option) =>
            typeof option?.label === 'string' && option.label.toLowerCase().includes(input.toLowerCase())
          }
          options={propertyOptions}
          value={propertyId}
          onChange={value => setPropertyId(value)}
        />

        {!propertyId ? (
          <Alert type="info" showIcon message={t('Sélectionnez un bien pour afficher la performance.')} />
        ) : null}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin />
          </div>
        ) : null}
        {error ? <Alert type="error" showIcon message={error} /> : null}
        {propertyId ? (
          <>
            <YieldCalculator
              data={data}
              loading={loading}
              assumptions={assumptions ?? DEFAULT_ASSUMPTIONS}
              syncStatus={syncStatus}
              onRecalculate={handleRecalculate}
            />
            <YieldProjectionChart data={data?.projection ?? []} />
          </>
        ) : null}
      </Space>
    </>
  );
};
