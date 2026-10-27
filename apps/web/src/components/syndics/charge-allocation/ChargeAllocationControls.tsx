import React, { useEffect, useRef, useState } from 'react';
import { Alert, Radio, Space, Spin, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { MoneyValue, Table } from '../../primitives';
import type { ChargeAllocationMethod } from '../../../types/syndic-types';
import { getLotTypeRates, type LotTypeRatesView } from '../../../services/syndic-lot-type-rates-service';
import type { AllocationPreviewResult } from '../../../utils/charge-allocation-preview';
import { displayCurrency } from '../../../utils/syndic-currency';
import { getLotTypeLabel } from '../../../utils/syndic-lot-label';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/**
 * Éléments partagés du mode de répartition d'un appel de charges (menu lot 2) :
 * sélecteur du mode, aperçu par lot en lecture seule, chargement non bloquant
 * du barème par type de lot de la copropriété.
 */

/** Libellé court du mode, aussi utilisé dans les tableaux. */
export function allocationMethodLabel(method: ChargeAllocationMethod | undefined | null): string {
  switch (method) {
    case 'BY_LOT_TYPE':
      return t('Par type de lot');
    case 'EQUAL':
      return t('Équitablement');
    default:
      return t('Par tantièmes');
  }
}

function allocationMethodHelp(method: ChargeAllocationMethod): string {
  switch (method) {
    case 'BY_LOT_TYPE':
      return t(
        'Applique le barème de la copropriété : un montant par lot pour chaque type de lot (appartement, parking…). Rien à saisir ici.'
      );
    case 'EQUAL':
      return t('Le total est divisé à parts égales entre les lots concernés, quels que soient leurs tantièmes.');
    default:
      return t('Le total est réparti au prorata des tantièmes généraux de chaque lot.');
  }
}

export const AllocationMethodRadio: React.FC<{
  value?: ChargeAllocationMethod;
  onChange?: (value: ChargeAllocationMethod) => void;
}> = ({ value = 'SHARES', onChange }) => (
  <Space direction="vertical" size={4} style={{ width: '100%' }}>
    <Radio.Group
      optionType="button"
      buttonStyle="solid"
      value={value}
      onChange={event => onChange?.(event.target.value as ChargeAllocationMethod)}
      options={[
        { label: allocationMethodLabel('SHARES'), value: 'SHARES' },
        { label: allocationMethodLabel('BY_LOT_TYPE'), value: 'BY_LOT_TYPE' },
        { label: allocationMethodLabel('EQUAL'), value: 'EQUAL' }
      ]}
    />
    <Text type="secondary" style={{ fontSize: 12 }}>
      {allocationMethodHelp(value)}
    </Text>
  </Space>
);

export type LotTypeRatesStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * Charge le barème de la copropriété, seulement quand `enabled` (option « Par
 * type de lot » choisie). Jamais bloquant : un échec donne `unavailable`.
 */
export function useLotTypeRatesForAllocation(
  tenantId: string | null | undefined,
  syndicId: string | null | undefined,
  enabled: boolean
) {
  const [view, setView] = useState<LotTypeRatesView | null>(null);
  const [status, setStatus] = useState<LotTypeRatesStatus>('idle');
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !tenantId || !syndicId) return;
    const key = `${tenantId}:${syndicId}`;
    if (loadedKey.current === key) return;
    let cancelled = false;
    setStatus('loading');
    getLotTypeRates(tenantId, syndicId)
      .then(data => {
        if (cancelled) return;
        loadedKey.current = key;
        setView(data);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setView(null);
        setStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tenantId, syndicId]);

  return { rates: status === 'ready' ? (view?.rates ?? {}) : null, status };
}

/** Message affiché (et bloquant) quand le barème n'a pas pu être lu. */
export const ratesUnavailableMessage = () =>
  t('Le barème par type de lot est indisponible : réessayez dans un instant');

export const AllocationPreview: React.FC<{
  method: ChargeAllocationMethod;
  result: AllocationPreviewResult | null;
  currency?: string;
  ratesStatus: LotTypeRatesStatus;
  tenantId?: string | null;
  syndicId?: string | null;
}> = ({ method, result, currency, ratesStatus, tenantId, syndicId }) => {
  const settingsLink =
    tenantId && syndicId ? (
      <Link to={`/tenant/${tenantId}/syndics/${syndicId}`}>{t('Paramétrer le barème de la copropriété')}</Link>
    ) : null;

  if (method === 'BY_LOT_TYPE' && ratesStatus === 'loading') {
    return (
      <div style={{ padding: 8, textAlign: 'center' }}>
        <Spin size="small" />
      </div>
    );
  }
  if (method === 'BY_LOT_TYPE' && ratesStatus === 'unavailable') {
    return <Alert type="warning" showIcon message={ratesUnavailableMessage()} />;
  }
  if (!result) return null;

  if (result.error) {
    if (method === 'BY_LOT_TYPE') {
      return (
        <Alert
          type="warning"
          showIcon
          message={
            <Space direction="vertical" size={2}>
              <span>{result.error}</span>
              {result.errorKind === 'LOT_TYPE_RATES' ? settingsLink : null}
            </Space>
          }
        />
      );
    }
    return <Text type="danger">{result.error}</Text>;
  }

  const shownCurrency = displayCurrency(currency);
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Table
        // Aperçu en lecture seule, rien d'émis : pas d'export.
        exportable={false}
        size="small"
        rowKey="lotId"
        dataSource={result.lines}
        pagination={{ pageSize: 5, hideOnSinglePage: true }}
        columns={[
          { title: t('Lot'), dataIndex: 'lotNumber' },
          { title: t('Type'), dataIndex: 'lotType', render: (value: string) => getLotTypeLabel(value) ?? value },
          {
            title: t('Montant'),
            dataIndex: 'amount',
            align: 'end',
            render: (value: number) => <MoneyValue value={value} currency={shownCurrency} />
          }
        ]}
      />
      <Text strong>
        {method === 'BY_LOT_TYPE' ? t("Total de l'appel") : t('Total à répartir')} :{' '}
        <MoneyValue value={result.totalAmount} currency={shownCurrency} />
      </Text>
    </Space>
  );
};
