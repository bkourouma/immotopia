import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Select, Space, Spin, Typography } from 'antd';
import { YieldCalculator, type YieldAssumptionsInput } from '../../components/patrimoine/YieldCalculator';
import { YieldProjectionChart } from '../../components/patrimoine/YieldProjectionChart';
import { getPatrimoinePerformance } from '../../services/patrimoine-service';
import { listProperties } from '../../services/property-service';
import type { PropertyYieldData } from '../../types/patrimoine-types';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

const DEFAULT_ASSUMPTIONS: YieldAssumptionsInput = {
  years: 10,
  valueGrowthRate: 0.03,
  rentGrowthRate: 0.02,
  expenseGrowthRate: 0.025,
  vacancyRate: 0.05
};

function assumptionsStorageKey(tenantId: string, propertyId: string): string {
  return `patrimoine:performance:assumptions:${tenantId}:${propertyId}`;
}

function parseStoredAssumptions(raw: string | null): YieldAssumptionsInput | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<YieldAssumptionsInput>;
    if (
      typeof parsed.years !== 'number' ||
      typeof parsed.valueGrowthRate !== 'number' ||
      typeof parsed.rentGrowthRate !== 'number' ||
      typeof parsed.expenseGrowthRate !== 'number' ||
      typeof parsed.vacancyRate !== 'number'
    ) {
      return null;
    }
    return parsed as YieldAssumptionsInput;
  } catch {
    return null;
  }
}

export const PatrimoinePerformancePage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);
  const [propertyOptions, setPropertyOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [data, setData] = useState<PropertyYieldData | null>(null);
  const [assumptions, setAssumptions] = useState<YieldAssumptionsInput>(DEFAULT_ASSUMPTIONS);

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
    if (!effectiveTenantId || !propertyId) {
      setAssumptions(DEFAULT_ASSUMPTIONS);
      return;
    }
    const key = assumptionsStorageKey(effectiveTenantId, propertyId);
    const stored = parseStoredAssumptions(window.localStorage.getItem(key));
    setAssumptions(stored || DEFAULT_ASSUMPTIONS);
  }, [effectiveTenantId, propertyId]);

  useEffect(() => {
    if (!effectiveTenantId || !propertyId) return;
    const key = assumptionsStorageKey(effectiveTenantId, propertyId);
    window.localStorage.setItem(key, JSON.stringify(assumptions));
  }, [assumptions, effectiveTenantId, propertyId]);

  useEffect(() => {
    if (!effectiveTenantId || !propertyId) {
      setLoading(false);
      setData(null);
      return;
    }
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getPatrimoinePerformance(effectiveTenantId, propertyId, assumptions);
        setData({
          grossYield: result.grossYield,
          netYield: result.netYield,
          netNetYield: result.netNetYield,
          latentCapitalGain: result.latentCapitalGain,
          projectedAtHorizon: result.projectedAtHorizon,
          projection: result.projection
        });
      } catch (e: any) {
        setError(e?.response?.data?.error || t('Erreur chargement performance'));
      } finally {
        setLoading(false);
      }
    };
    void run();
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
              assumptions={assumptions}
              onRecalculate={nextAssumptions => setAssumptions(nextAssumptions)}
            />
            <YieldProjectionChart data={data?.projection ?? []} />
          </>
        ) : null}
      </Space>
    </>
  );
};
