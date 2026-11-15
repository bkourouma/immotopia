import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Tag, Typography } from 'antd';
import { fileUrl } from '../../config/api';
import { useAssistantTranslation } from '../../i18n/useAssistantTranslation';
import { propertyStatusLabel, propertyTypeLabel } from './copilot-labels';
import type { PropertyCardItem } from '../../types/copilot';

export interface PropertyResultCardProps {
  item: PropertyCardItem;
  tenantId: string;
}

export function PropertyResultCard({ item, tenantId }: PropertyResultCardProps): React.ReactElement {
  const { locale, t } = useAssistantTranslation();
  const thumbnail = fileUrl(item.thumbnailUrl);
  const facts = [
    item.price != null ? `${item.price.toLocaleString(locale)} ${item.currency}` : null,
    item.bedrooms != null ? t('{{count}} ch.', { count: item.bedrooms }) : null,
    item.surfaceArea != null ? `${item.surfaceArea.toLocaleString(locale)} m²` : null
  ].filter(Boolean);

  return (
    <Card size="small" data-testid="copilot-property-card">
      <div style={{ display: 'flex', gap: 12 }}>
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            width={72}
            height={72}
            loading="lazy"
            style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
          />
        ) : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link to={`/tenant/${tenantId}/properties/${item.id}`}>
            <Typography.Text strong>
              <bdi>{item.title}</bdi>
            </Typography.Text>
          </Link>
          <div>
            <Typography.Text type="secondary">
              <bdi>{item.internalReference}</bdi>
              {item.locationZone ? (
                <>
                  {' · '}
                  <bdi>{item.locationZone}</bdi>
                </>
              ) : null}
            </Typography.Text>
          </div>
          <div>
            <Tag>{propertyTypeLabel(item.propertyType, t)}</Tag>
            <Tag>{propertyStatusLabel(item.status, t)}</Tag>
          </div>
          {facts.length > 0 ? <Typography.Text>{facts.join(' · ')}</Typography.Text> : null}
        </div>
      </div>
    </Card>
  );
}

export default PropertyResultCard;
