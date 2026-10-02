import React, { useRef, useState } from 'react';
import { Button, Popconfirm, Select, Space, Typography } from 'antd';
import { DownloadOutlined, PaperClipOutlined } from '@ant-design/icons';
import { attachClaimDocument, detachClaimDocument } from '../../services/insurance-service';
import { downloadPropertyDocumentFile, uploadDocument } from '../../services/property-service';
import type { InsuranceClaimDetailDto, InsuranceClaimDocumentKind } from '../../types/insurance-types';
import { apiErrorMessage } from '../patrimoine/patrimoine-labels';
import { saveBlob } from '../../utils/save-blob';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { DOC_KIND_VALUES, docKindLabel, options } from './insurance-labels';

interface Props {
  tenantId: string;
  claim: InsuranceClaimDetailDto;
  canEdit: boolean;
  onChanged: () => void;
}

/**
 * Pièces d'un sinistre, groupées par nature. Ajouter = téléverser par la
 * route existante des documents du bien, puis rattacher ; retirer = défaire
 * la liaison (le document reste dans la GED du bien). Le téléchargement passe
 * par la route authentifiée des documents du bien (jamais une URL statique).
 */
export const ClaimDocuments: React.FC<Props> = ({ tenantId, claim, canEdit: canEditProp, onChanged }) => {
  // Un sinistre clos n'est plus modifiable : l'API refuse (409) le rattachement
  // d'une pièce, et le téléversement préalable laissait un document orphelin.
  const closed = claim.status === 'CLOSED';
  const canEdit = canEditProp && !closed;
  const [kind, setKind] = useState<InsuranceClaimDocumentKind>('PHOTO_BEFORE');
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const add = async (file: File) => {
    if (closed) return;
    setBusy(true);
    let documentId: string | null = null;
    try {
      const uploaded = await uploadDocument(tenantId, claim.propertyId, file, 'INSURANCE', undefined, false);
      documentId = uploaded.id as string;
      await attachClaimDocument(tenantId, claim.id, { documentId, kind });
      feedback.success(t('Pièce ajoutée.'));
      onChanged();
    } catch (error) {
      if (documentId) {
        // Le fichier est bien téléversé : on le dit, pour ne pas laisser croire qu'il est perdu.
        feedback.error(
          t(
            "Le fichier a été téléversé dans les documents du bien, mais n'a pas pu être rattaché au sinistre. Il reste dans les documents du bien."
          )
        );
        onChanged();
      } else {
        feedback.error(apiErrorMessage(error, t('Ajout de la pièce impossible.')));
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const download = async (documentId: string, fileName: string) => {
    setDownloadingId(documentId);
    try {
      const file = await downloadPropertyDocumentFile(tenantId, claim.propertyId, documentId, fileName);
      saveBlob(file.blob, file.filename);
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Téléchargement impossible.')));
    } finally {
      setDownloadingId(null);
    }
  };

  const remove = async (linkId: string) => {
    try {
      await detachClaimDocument(tenantId, claim.id, linkId);
      feedback.success(t('Pièce retirée.'));
      onChanged();
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Retrait impossible.')));
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {DOC_KIND_VALUES.map(value => {
        const rows = claim.documents.filter(doc => doc.kind === value);
        if (rows.length === 0) return null;
        return (
          <div key={value}>
            <Typography.Text strong>{docKindLabel(value)}</Typography.Text>
            {rows.map(doc => (
              <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  <PaperClipOutlined aria-hidden="true" /> {doc.fileName}
                </span>
                <span>
                  <Button
                    size="small"
                    type="link"
                    icon={<DownloadOutlined />}
                    loading={downloadingId === doc.documentId}
                    aria-label={t('Télécharger {{nom}}', { nom: doc.fileName })}
                    onClick={() => download(doc.documentId, doc.fileName)}
                  >
                    {t('Télécharger')}
                  </Button>
                  {canEdit && (
                    <Popconfirm
                      title={t('Retirer cette pièce du sinistre ?')}
                      okText={t('Retirer')}
                      cancelText={t('Annuler')}
                      onConfirm={() => remove(doc.id)}
                    >
                      <Button size="small" type="link" danger>
                        {t('Retirer')}
                      </Button>
                    </Popconfirm>
                  )}
                </span>
              </div>
            ))}
          </div>
        );
      })}
      {claim.documents.length === 0 && <Typography.Text type="secondary">{t('Aucune pièce.')}</Typography.Text>}
      {canEditProp && closed && (
        <Typography.Text type="secondary">{t('Sinistre clos : les pièces ne sont plus modifiables.')}</Typography.Text>
      )}
      {canEdit && (
        <Space wrap>
          <Select
            value={kind}
            onChange={setKind}
            options={options(DOC_KIND_VALUES, docKindLabel)}
            style={{ minWidth: 180 }}
            aria-label={t('Nature de la pièce')}
          />
          <input
            ref={input}
            type="file"
            hidden
            data-testid="claim-file-input"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void add(file);
            }}
          />
          <Button icon={<PaperClipOutlined />} loading={busy} onClick={() => input.current?.click()}>
            {t('Ajouter une pièce')}
          </Button>
        </Space>
      )}
    </Space>
  );
};
