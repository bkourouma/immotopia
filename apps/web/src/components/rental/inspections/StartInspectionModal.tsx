import React, { useState } from 'react';
import { DatePicker, Modal, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { InspectionType } from '../../../services/lease-inspections-service';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface StartInspectionModalProps {
  open: boolean;
  type: InspectionType;
  confirmLoading: boolean;
  onCancel: () => void;
  onConfirm: (inspectionDate: string) => void;
}

/**
 * Demande la date de l'état des lieux avant de le créer.
 *
 * L'aide affichée pour une sortie rappelle que les pièces de l'entrée sont
 * reprises telles quelles, avec les mêmes identifiants, pour permettre la
 * comparaison — comportement du serveur, pas de ce formulaire, mais qu'il
 * faut annoncer avant le clic.
 */
export const StartInspectionModal: React.FC<StartInspectionModalProps> = ({
  open,
  type,
  confirmLoading,
  onCancel,
  onConfirm
}) => {
  const [date, setDate] = useState<Dayjs | null>(dayjs());

  return (
    <Modal
      title={type === 'ENTRY' ? t("Commencer l'état des lieux d'entrée") : t('Commencer l’état des lieux de sortie')}
      open={open}
      onCancel={onCancel}
      onOk={() => date && onConfirm(date.format('YYYY-MM-DD'))}
      okButtonProps={{ disabled: !date }}
      confirmLoading={confirmLoading}
      okText={t('Commencer')}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      <Text>{t('Date de l’état des lieux')}</Text>
      <DatePicker style={{ width: '100%', marginTop: 8 }} value={date} onChange={setDate} format="DD/MM/YYYY" />

      {type === 'EXIT' && (
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          {t("Reprend les pièces de l'entrée pour la comparaison.")}
        </Text>
      )}
    </Modal>
  );
};

export default StartInspectionModal;
