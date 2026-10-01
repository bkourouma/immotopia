import React from 'react';
import { Button, List, Space, Tag, Typography } from 'antd';
import type { InsuranceClaimDto } from '../../types/insurance-types';
import { t } from '../../i18n/t';
import { ClaimStatusTimeline } from './ClaimStatusTimeline';
import { causeLabel, claimStatusColor, claimStatusLabel, formatAmount, formatDay } from './insurance-labels';

interface Props {
  claims: InsuranceClaimDto[];
  onOpen: (claimId: string) => void;
}

/** Sinistres d'un bien : cause, statut, montant réclamé et frise des statuts. */
export const ClaimList: React.FC<Props> = ({ claims, onOpen }) => (
  <List
    dataSource={claims}
    renderItem={claim => (
      <List.Item
        key={claim.id}
        actions={[
          <Button key="open" type="link" onClick={() => onOpen(claim.id)}>
            {t('Détail')}
          </Button>
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Typography.Text strong>{causeLabel(claim.cause)}</Typography.Text>
            <Tag color={claimStatusColor(claim.status)}>{claimStatusLabel(claim.status)}</Tag>
            <Typography.Text type="secondary">
              {formatDay(claim.occurredAt)} · {claim.policyLabel} · {formatAmount(claim.claimedAmount, claim.currency)}
            </Typography.Text>
          </Space>
          <ClaimStatusTimeline status={claim.status} rejectedAt={claim.rejectedAt} />
        </Space>
      </List.Item>
    )}
  />
);
