import React, { useState } from 'react';
import { Alert, Button, Card, Typography } from 'antd';
import { downloadDocument } from '../../services/rental-service';
import { downloadPropertyDocumentFile } from '../../services/property-service';
import { saveBlob } from '../../utils/save-blob';
import { t } from '../../i18n/t';

export interface DocumentDownloadCardProps {
  tenantId: string;
  /** `rental` : GET /documents/:id/download ; `property` : GET /properties/:pid/documents/:id/file. */
  kind: 'rental' | 'property';
  documentId: string;
  /** Requis pour `kind === 'property'`. */
  propertyId?: string;
  /** Nom proposé à défaut d'en-tête Content-Disposition. */
  filename: string;
  label?: string;
  /** Format affiché (ex. « Word (.docx) »). */
  formatLabel?: string;
}

export function DocumentDownloadCard({
  tenantId,
  kind,
  documentId,
  propertyId,
  filename,
  label,
  formatLabel
}: DocumentDownloadCardProps): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const file =
        kind === 'property' && propertyId
          ? await downloadPropertyDocumentFile(tenantId, propertyId, documentId, filename)
          : await downloadDocument(tenantId, documentId, filename);
      saveBlob(file.blob, file.filename);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card size="small" data-testid="copilot-download-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong>{label ?? filename}</Typography.Text>
          {formatLabel ? (
            <div>
              <Typography.Text type="secondary">{formatLabel}</Typography.Text>
            </div>
          ) : null}
        </div>
        <Button type="primary" size="small" loading={loading} onClick={handleDownload}>
          {t('Télécharger')}
        </Button>
      </div>
      {failed ? (
        <Alert
          type="error"
          showIcon
          role="alert"
          style={{ marginBlockStart: 8 }}
          title={t('Le téléchargement a échoué. Réessayez.')}
        />
      ) : null}
    </Card>
  );
}

export default DocumentDownloadCard;
