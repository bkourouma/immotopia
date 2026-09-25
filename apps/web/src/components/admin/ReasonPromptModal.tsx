import React, { useState } from 'react';
import { Input, Modal, Space, Typography } from 'antd';
import { t } from '../../i18n/t';

const { Text } = Typography;

/**
 * Boîte de dialogue contrôlée pour « saisir un motif puis confirmer »
 * (suppression immédiate, passage en lecture seule manuelle, modification
 * d'un élément d'abonnement…).
 *
 * Remplace le motif `modal.confirm({ onOk: async () => { if (!reason) throw
 * new Error(...) } })` : lever une erreur depuis `onOk` pour garder la boîte
 * ouverte produit un rejet de promesse que rien n'attrape (AntD ne consomme
 * pas le rejet), ce que Vitest relève comme un « Unhandled Rejection » même
 * quand le test qui déclenche ce chemin passe par ailleurs. Ici, le bouton OK
 * reste simplement désactivé tant que le motif est vide quand il est requis
 * — `onConfirm` n'est jamais appelé sans motif, il n'y a donc rien à rejeter.
 */
export interface ReasonPromptModalProps {
  open: boolean;
  title: React.ReactNode;
  /** Texte affiché au-dessus du champ motif (ex. explication de l'action). */
  description?: React.ReactNode;
  /** Champs additionnels rendus entre la description et le champ motif. */
  extraContent?: React.ReactNode;
  reasonPlaceholder: string;
  /** Motif obligatoire pour activer le bouton OK. Par défaut `true`. */
  reasonRequired?: boolean;
  okText: string;
  cancelText: string;
  danger?: boolean;
  confirmLoading?: boolean;
  onCancel: () => void;
  /** Reçoit le motif (chaîne vidée des espaces en trop, éventuellement ''). */
  onConfirm: (reason: string) => void;
}

export const ReasonPromptModal: React.FC<ReasonPromptModalProps> = ({
  open,
  title,
  description,
  extraContent,
  reasonPlaceholder,
  reasonRequired = true,
  okText,
  cancelText,
  danger,
  confirmLoading,
  onCancel,
  onConfirm
}) => {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const invalid = reasonRequired && trimmed.length === 0;

  const handleAfterOpenChange = (nowOpen: boolean) => {
    if (!nowOpen) {
      setReason('');
    }
  };

  const handleOk = () => {
    if (invalid) return;
    onConfirm(trimmed);
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText={okText}
      cancelText={cancelText}
      okButtonProps={{ danger, disabled: invalid }}
      confirmLoading={confirmLoading}
      destroyOnHidden
      afterOpenChange={handleAfterOpenChange}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {description}
        {extraContent}
        <Input.TextArea
          rows={2}
          placeholder={reasonPlaceholder}
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        {reasonRequired && (
          <Text type={invalid ? 'danger' : 'secondary'}>{t('Le motif est obligatoire.')}</Text>
        )}
      </Space>
    </Modal>
  );
};

export default ReasonPromptModal;
