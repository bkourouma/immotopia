import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Tag, Typography } from 'antd';
import { useAssistantTranslation } from '../../i18n/useAssistantTranslation';
import { formatArtifactCell } from '../../utils/copilot-artifact';
import { formatCopilotAmount, leaseStatusLabel } from './copilot-labels';
import type { LeaseCardItem } from '../../types/copilot';

export interface LeaseResultCardProps {
  item: LeaseCardItem;
  tenantId: string;
}

export function LeaseResultCard({ item, tenantId }: LeaseResultCardProps): React.ReactElement {
  const { locale, t } = useAssistantTranslation();
  return (
    <Card size="small" data-testid="copilot-lease-card">
      <Link to={`/tenant/${tenantId}/rental/leases/${item.id}`}>
        <Typography.Text strong>
          <bdi>{t('Bail {{number}}', { number: item.leaseNumber })}</bdi>
        </Typography.Text>
      </Link>{' '}
      <Tag>{leaseStatusLabel(item.status, t)}</Tag>
      <div>
        <Typography.Text>
          <bdi>{item.propertyLabel}</bdi>
        </Typography.Text>
      </div>
      {item.renterName ? (
        <div>
          <Typography.Text type="secondary">
            <bdi>{item.renterName}</bdi>
          </Typography.Text>
        </div>
      ) : null}
      <Typography.Text>
        {t('Loyer {{amount}} {{currency}}', {
          amount: formatCopilotAmount(item.rentAmount, locale),
          currency: item.currency
        })}
        {' · '}
        {t('depuis le {{date}}', { date: formatArtifactCell(item.startDate.slice(0, 10), 'date', locale) })}
      </Typography.Text>
    </Card>
  );
}

export default LeaseResultCard;
