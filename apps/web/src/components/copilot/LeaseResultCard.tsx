import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Tag, Typography } from 'antd';
import { t } from '../../i18n/t';
import type { LeaseCardItem } from '../../types/copilot';

export interface LeaseResultCardProps {
  item: LeaseCardItem;
  tenantId: string;
}

export function LeaseResultCard({ item, tenantId }: LeaseResultCardProps): React.ReactElement {
  return (
    <Card size="small" data-testid="copilot-lease-card">
      <Link to={`/tenant/${tenantId}/rental/leases/${item.id}`}>
        <Typography.Text strong>{t('Bail {{number}}', { number: item.leaseNumber })}</Typography.Text>
      </Link>{' '}
      <Tag>{item.status}</Tag>
      <div>
        <Typography.Text>{item.propertyLabel}</Typography.Text>
      </div>
      {item.renterName ? (
        <div>
          <Typography.Text type="secondary">{item.renterName}</Typography.Text>
        </div>
      ) : null}
      <Typography.Text>
        {t('Loyer {{amount}} {{currency}}', { amount: item.rentAmount, currency: item.currency })}
        {' · '}
        {t('depuis le {{date}}', { date: item.startDate.slice(0, 10) })}
      </Typography.Text>
    </Card>
  );
}

export default LeaseResultCard;
