import React from 'react';
import { Alert, Card, Descriptions, Skeleton, Space, Typography } from 'antd';
import { FinalSettlement } from '../../../services/lease-lifecycle-service';
import { MoneyValue } from '../../primitives';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface FinalSettlementCardProps {
  settlement: FinalSettlement | null;
  loading: boolean;
}

/**
 * Carte « Solde de tout compte », affichée seulement une fois le bail résilié.
 *
 * Le signe du solde change le libellé, pas seulement la couleur : un
 * propriétaire lit « à restituer », un locataire en dette lit « reste dû » —
 * jamais un solde négatif nu qui obligerait à interpréter le signe.
 */
export const FinalSettlementCard: React.FC<FinalSettlementCardProps> = ({ settlement, loading }) => {
  if (loading) {
    return (
      <Card title={t('Solde de tout compte')}>
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  if (!settlement) return null;

  const solde = settlement.balanceToRefund;
  const soldePositif = solde >= 0;

  return (
    <Card title={t('Solde de tout compte')}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('Dépôt détenu')}>
            <MoneyValue value={settlement.depositHeld} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Impayés')}>
            <MoneyValue value={settlement.arrears} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Retenues (état des lieux)')}>
            {settlement.deductions.length === 0 ? (
              <Text type="secondary">{t('Aucune')}</Text>
            ) : (
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                {settlement.deductions.map((deduction, index) => (
                  <div
                    key={`${deduction.label}-${index}`}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                  >
                    <Text>{deduction.label}</Text>
                    <MoneyValue value={deduction.amount} />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Text strong>{t('Total des retenues')}</Text>
                  <Text strong>
                    <MoneyValue value={settlement.deductionsTotal} />
                  </Text>
                </div>
              </Space>
            )}
          </Descriptions.Item>
        </Descriptions>

        <div>
          <Text strong style={{ fontSize: 'var(--font-size-lg, 16px)' }}>
            {soldePositif ? t('À restituer au locataire : ') : t('Reste dû par le locataire : ')}
            <MoneyValue value={Math.abs(solde)} />
          </Text>
        </div>

        {settlement.exitInspectionStatus !== 'FINALIZED' && (
          <Alert
            type="warning"
            showIcon
            message={t("L'état des lieux de sortie n'est pas finalisé : les retenues peuvent encore évoluer.")}
          />
        )}
      </Space>
    </Card>
  );
};
