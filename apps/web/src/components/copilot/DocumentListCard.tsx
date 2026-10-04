import React from 'react';
import { Card, Tag, Typography } from 'antd';
import { t } from '../../i18n/t';
import type { DocumentCardItem } from '../../types/copilot';
import { DocumentDownloadCard } from './DocumentDownloadCard';

export interface DocumentListCardProps {
  scope: 'lease' | 'property';
  items: DocumentCardItem[];
  tenantId: string;
  /** Bien concerné : requis pour télécharger une pièce de bien (absent des items). */
  propertyId?: string;
}

export function DocumentListCard({ scope, items, tenantId, propertyId }: DocumentListCardProps): React.ReactElement {
  const title = scope === 'lease' ? t('Documents du bail') : t('Documents du bien');
  return (
    <Card size="small" title={title} data-testid="copilot-document-list">
      {items.length === 0 ? (
        <Typography.Text type="secondary">{t('Aucun document.')}</Typography.Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(doc => {
            const pid = doc.propertyId ?? propertyId;
            const canDownload = doc.downloadable && (doc.kind === 'rental' || Boolean(pid));
            return canDownload ? (
              <DocumentDownloadCard
                key={`${doc.kind}-${doc.id}`}
                tenantId={tenantId}
                kind={doc.kind}
                documentId={doc.id}
                propertyId={pid}
                filename={doc.label}
                label={doc.label}
              />
            ) : (
              <div key={`${doc.kind}-${doc.id}`}>
                <Typography.Text>
                  <bdi>{doc.label}</bdi>
                </Typography.Text>{' '}
                <Tag>{doc.type}</Tag>
                {doc.status ? <Tag>{doc.status}</Tag> : null}
                {doc.date ? <Typography.Text type="secondary">{doc.date.slice(0, 10)}</Typography.Text> : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default DocumentListCard;
