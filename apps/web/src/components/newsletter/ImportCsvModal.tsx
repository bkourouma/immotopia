import React, { useState } from 'react';
import { App, Modal, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { ImportResult } from '../../services/newsletter.service';
import { t } from '../../i18n/t';

const { Dragger } = Upload;

interface ImportCsvModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (file: File) => Promise<ImportResult>;
}

export function ImportCsvModal({ open, onClose, onImport }: ImportCsvModalProps) {
  const { message } = App.useApp();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleOk = async () => {
    if (!file) {
      message.warning(t('Sélectionnez un fichier CSV.'));
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await onImport(file);
      setResult(r);
      if (r.accepted > 0) {
        message.success(t('{{accepted}} adresse(s) importée(s).', { accepted: r.accepted }));
      }
      if (r.rejected > 0) {
        message.warning(
          t('{{rejected}} rejetée(s). {{value}}', {
            rejected: r.rejected,
            value: r.errors.length ? r.errors.slice(0, 3).join(' ') : ''
          })
        );
      }
      if (r.duplicateCount > 0) {
        message.info(t('{{duplicateCount}} doublon(s) ignoré(s).', { duplicateCount: r.duplicateCount }));
      }
      setFile(null);
    } catch (e) {
      message.error((e as Error).message || t("Erreur lors de l'import."));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    onClose();
  };

  return (
    <Modal
      title={t('Importer des abonnés (CSV)')}
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText={t('Importer')}
      destroyOnClose
    >
      <p style={{ marginBottom: 16 }}>
        {t('Le fichier doit contenir une colonne')} <strong>email</strong> et optionnellement <strong>name</strong>.
      </p>
      <Dragger
        accept=".csv"
        maxCount={1}
        beforeUpload={f => {
          setFile(f);
          return false;
        }}
        onRemove={() => setFile(null)}
        fileList={file ? [{ uid: '1', name: file.name, status: 'done' }] : []}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
        </p>
        <p className="ant-upload-text">{t('Cliquez ou glissez un fichier CSV ici')}</p>
      </Dragger>
      {result && (
        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
          <strong>{t('Résultat :')}</strong> {result.accepted} {t('accepté(s),')} {result.rejected} {t('rejeté(s),')}{' '}
          {result.duplicateCount} doublon(s)
          {result.errors.length > 0 && (
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {result.errors.length > 5 && <li>... et {result.errors.length - 5} autres</li>}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
