import React from 'react';
import { Alert, Button, Card, Col, Descriptions, Progress, Row, Space, Typography } from 'antd';
import type { CapacityBreakdown } from '../../services/subscription-account-service';
import { formatMoney } from '../primitives';
import { capacityLabel } from './subscription-account-labels';
import type { SubscriptionAccount } from './useSubscriptionAccount';
import { formatNumber } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface Props {
  account: SubscriptionAccount;
  /** Ouvre l'onglet « Packs et extensions ». */
  onAddExtension: () => void;
}

function percentOf(capacity: CapacityBreakdown): number {
  if (capacity.limit > 0) return Math.min(100, Math.round((capacity.used / capacity.limit) * 100));
  return capacity.used > 0 ? 100 : 0;
}

/** Onglet « Consommation » : par capacité, inclus, extensions, dérogations, limite, utilisé et dépassement. */
export const SubscriptionUsageTab: React.FC<Props> = ({ account, onAddExtension }) => {
  const { overview, overviewError } = account;
  if (!overview) {
    return <Alert type="error" showIcon message={overviewError ?? t('Erreur lors du chargement du compte')} />;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {!overview.isParticulier && (
        <div>
          <Button onClick={onAddExtension}>{t('Ajouter une extension')}</Button>
        </div>
      )}
      <Row gutter={[16, 16]}>
        {overview.capacities.map(capacity => {
          const percent = percentOf(capacity);
          return (
            <Col key={capacity.key} xs={24} md={12} xl={8}>
              <Card size="small" title={capacityLabel(capacity.key)} style={{ height: '100%' }}>
                <Progress
                  percent={percent}
                  status={percent >= 100 ? 'exception' : 'normal'}
                  strokeColor={
                    percent >= 100
                      ? 'var(--color-error-text)'
                      : percent >= 80
                        ? 'var(--color-warning-text)'
                        : 'var(--color-success-text)'
                  }
                  format={() => `${capacity.used} / ${capacity.limit}`}
                />
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t('Inclus (packs)')}>{formatNumber(capacity.included)}</Descriptions.Item>
                  <Descriptions.Item label={t('Extensions')}>{formatNumber(capacity.extensions)}</Descriptions.Item>
                  {capacity.overrides > 0 && (
                    <Descriptions.Item label={t('Dérogations')}>{formatNumber(capacity.overrides)}</Descriptions.Item>
                  )}
                  <Descriptions.Item label={t('Limite')}>{formatNumber(capacity.limit)}</Descriptions.Item>
                  <Descriptions.Item label={t('Utilisé')}>{formatNumber(capacity.used)}</Descriptions.Item>
                </Descriptions>
                {capacity.overage > 0 && (
                  <Alert
                    style={{ marginBlockStart: 'var(--space-2)' }}
                    type="warning"
                    showIcon
                    message={t('Dépassement : {{value}}', { value: formatNumber(capacity.overage) })}
                    description={
                      capacity.estimatedOverageAmount !== null ? (
                        <Text>
                          {t('Montant estimé à ce jour (HT) : {{value}}', {
                            value: formatMoney(capacity.estimatedOverageAmount)
                          })}
                        </Text>
                      ) : undefined
                    }
                  />
                )}
              </Card>
            </Col>
          );
        })}
      </Row>
    </Space>
  );
};
