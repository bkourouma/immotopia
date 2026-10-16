import React, { useEffect, useState } from 'react';
import { Alert, Input, Modal } from 'antd';
import { t } from '../../../i18n/t';

interface ReasonModalProps {
  open: boolean;
  title: string;
  /** Texte explicatif au-dessus du champ. */
  description?: string;
  okText: string;
  /** Motif obligatoire (annulation d'une remise) ou facultatif (retrait d'une ligne). */
  required: boolean;
  loading?: boolean;
  /** Message d'erreur de l'API, affiché dans la fenêtre. */
  error?: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}

const MAX_REASON_LENGTH = 500;

/** Fenêtre de saisie d'un motif (1 à 500 caractères). */
export const ReasonModal: React.FC<ReasonModalProps> = ({
  open,
  title,
  description,
  okText,
  required,
  loading,
  error,
  onCancel,
  onSubmit
}) => {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const trimmed = reason.trim();

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText={t('Fermer')}
      okButtonProps={{ danger: true, disabled: required && !trimmed, loading }}
      onOk={() => onSubmit(trimmed)}
      onCancel={onCancel}
      destroyOnHidden
    >
      {description && <p>{description}</p>}
      <label htmlFor="direct-debit-reason" style={{ display: 'block', marginBottom: 4 }}>
        {required ? t('Motif (obligatoire)') : t('Motif (facultatif)')}
      </label>
      <Input.TextArea
        id="direct-debit-reason"
        rows={3}
        maxLength={MAX_REASON_LENGTH}
        showCount
        value={reason}
        onChange={event => setReason(event.target.value)}
      />
      {error && <Alert style={{ marginTop: 12 }} type="error" showIcon message={error} />}
    </Modal>
  );
};
