import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Space, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { PropertyDocument } from '../../types/property-types';
import { deletePropertyDocument, listPropertyDocuments } from '../../services/property-service';
import { DocumentVault } from '../patrimoine/DocumentVault';
import { apiErrorMessage } from '../patrimoine/patrimoine-labels';
import { PropertyDocumentUpload } from './PropertyDocumentUpload';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';

interface Props {
  tenantId: string;
  propertyId: string;
}

/**
 * Onglet « Documents » de la fiche d'un bien (titre foncier, diagnostics, plans…).
 *
 * Les documents d'un bien relèvent du socle : l'onglet est proposé quel que
 * soit le pack. Le fichier se télécharge par la route protégée
 * (`DocumentVault`), jamais par un lien statique.
 */
export const PropertyDocumentsTab: React.FC<Props> = ({ tenantId, propertyId }) => {
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDocuments(await listPropertyDocuments(tenantId, propertyId));
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Impossible de charger les documents.')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (documentId: string) => {
    setDeletingId(documentId);
    try {
      await deletePropertyDocument(tenantId, propertyId, documentId);
      feedback.success(t('Document supprimé.'));
      await load();
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Suppression impossible.')));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <Spin />;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {adding && (
        <Card title={t('Ajouter un document')}>
          <PropertyDocumentUpload
            propertyId={propertyId}
            tenantId={tenantId}
            onUploadComplete={() => {
              setAdding(false);
              feedback.success(t('Document ajouté.'));
              void load();
            }}
          />
        </Card>
      )}
      <DocumentVault
        documents={documents}
        tenantId={tenantId}
        propertyId={propertyId}
        onDelete={remove}
        deletingId={deletingId}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(open => !open)}>
            {adding ? t('Annuler') : t('Ajouter un document')}
          </Button>
        }
      />
    </Space>
  );
};
