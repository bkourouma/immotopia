import React, { useState } from 'react';
import { Col, DatePicker, Row, Space, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { queryKey, STALE_TIME } from '../../../../lib/query-keys';
import { getStockWhatsappOverview } from '../../../../services/finance-stock-whatsapp-service';
import type { WhatsappMeasures as Measures } from '../../../../types/finance-stock-whatsapp-types';
import { StatCard } from '../../../primitives/StatCard';
import { StateBlock } from '../../../primitives/StateBlock';
import { SkeletonStats } from '../../../primitives/Skeleton';
import { dateFormat, formatNumber, formatPercent } from '../../../../i18n/format';
import { handleApiError } from '../../../../utils/error-handler';
import { t } from '../../../../i18n/t';

export const STOCK_WHATSAPP_OVERVIEW_ENTITY = 'stock-whatsapp-overview';

/** Un taux rendu en fraction (0 à 1) : « 88 % », ou « — » sans donnée. */
function rate(value: number | null | undefined): string {
  return typeof value === 'number' ? formatPercent(Math.round(value * 100), 0) : '—';
}

function count(value: number | null | undefined): string {
  return typeof value === 'number' ? formatNumber(value) : '—';
}

const MeasureCards: React.FC<{ measures: Measures }> = ({ measures }) => {
  const cartes = [
    { label: t('Photos analysées'), value: count(measures.photosAnalyzed) },
    {
      label: t('Délai médian jusqu’à la confirmation'),
      value:
        typeof measures.medianSecondsToConfirm === 'number'
          ? t('{{seconds}} s', { seconds: formatNumber(Math.round(measures.medianSecondsToConfirm)) })
          : '—',
      hint: t('Objectif : moins de 45 s')
    },
    {
      label: t('Comptages validés sans correction'),
      value: rate(measures.acceptedFirstTimeRate),
      hint: t('Objectif : 88 % et plus')
    },
    { label: t('Lignes avec photo de preuve'), value: rate(measures.proofCoverageRate), hint: t('Objectif : 100 %') },
    { label: t('Photos illisibles'), value: rate(measures.unreadableRate) },
    { label: t('Articles non reconnus'), value: rate(measures.unrecognizedRate) },
    { label: t('Analyses en échec'), value: rate(measures.failedRate) }
  ];
  return (
    <Row gutter={[16, 16]}>
      {cartes.map(carte => (
        <Col key={carte.label} xs={24} sm={12} lg={8}>
          <StatCard label={carte.label} value={carte.value} hint={carte.hint} />
        </Col>
      ))}
    </Row>
  );
};

/**
 * Sous-onglet « Mesures » (ecrans §5.4) : `overview.measures` du mois choisi.
 * Mesures de l'agence entière, jamais par personne (W14-R7).
 */
export const WhatsappMeasures: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const [month, setMonth] = useState<Dayjs>(() => dayjs());
  const mois = month.format('YYYY-MM');

  const query = useQuery({
    queryKey: queryKey(STOCK_WHATSAPP_OVERVIEW_ENTITY, tenantId, { month: mois }),
    queryFn: () => getStockWhatsappOverview(tenantId, mois),
    staleTime: STALE_TIME.list
  });

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <DatePicker
        picker="month"
        allowClear={false}
        value={month}
        format={dateFormat('month')}
        onChange={value => value && setMonth(value)}
        aria-label={t('Mois')}
      />
      {query.isPending ? (
        <SkeletonStats />
      ) : query.error ? (
        <StateBlock
          variant="error"
          description={handleApiError(query.error)}
          actions={[{ label: t('Réessayer'), onClick: () => void query.refetch(), primary: true }]}
        />
      ) : (
        <MeasureCards measures={query.data.measures} />
      )}
      <Typography.Text type="secondary">
        {t('Mesures de l’agence entière. Aucune mesure par personne.')}
      </Typography.Text>
    </Space>
  );
};

export default WhatsappMeasures;
