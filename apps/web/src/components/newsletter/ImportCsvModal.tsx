import React, { useState } from 'react';
import { Modal, Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { ImportResult } from '../../services/newsletter.service';

const { Dragger } = Upload;

interface ImportCsvModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (file: File) => Promise<ImportResult>;
}

export function ImportCsvModal({ open, onClose, onImport }: ImportCsvModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleOk = async () => {
    if (!file) {
      message.warning('Sélectionnez un fichier CSV.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await onImport(file);
      setResult(r);
      if (r.accepted > 0) {
        message.success(`${r.accepted} adresse(s) importée(s).`);
      }
      if (r.rejected > 0) {
        message.warning(`${r.rejected} rejetée(s). ${r.errors.length ? r.errors.slice(0, 3).join(' ') : ''}`);
      }
      if (r.duplicateCount > 0) {
        message.info(`${r.duplicateCount} doublon(s) ignoré(s).`);
      }
      setFile(null);
    } catch (e) {
      message.error((e as Error).message || 'Erreur lors de l\'import.');
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
      title="Importer des abonnés (CSV)"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText="Importer"
      destroyOnClose
    >
      <p style={{ marginBottom: 16 }}>
        Le fichier doit contenir une colonne <strong>email</strong> et optionnellement <strong>name</strong>.
      </p>
      <Dragger
        accept=".csv"
        maxCount={1}
        beforeUpload={(f) => {
          setFile(f);
          return false;
        }}
        onRemove={() => setFile(null)}
        fileList={file ? [{ uid: '1', name: file.name, status: 'done' }] : []}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
        </p>
        <p className="ant-upload-text">Cliquez ou glissez un fichier CSV ici</p>
      </Dragger>
      {result && (
        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
          <strong>Résultat :</strong> {result.accepted} accepté(s), {result.rejected} rejeté(s), {result.duplicateCount} doublon(s)
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
