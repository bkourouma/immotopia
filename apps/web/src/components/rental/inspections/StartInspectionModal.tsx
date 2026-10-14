import React, { useEffect, useState } from 'react';
import { DatePicker, Modal, Radio, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { InspectionTemplate, InspectionType } from '../../../services/lease-inspections-service';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface StartInspectionModalProps {
  open: boolean;
  type: InspectionType;
  confirmLoading: boolean;
  onCancel: () => void;
  onConfirm: (inspectionDate: string, template: InspectionTemplate) => void;
  /** Modèle présélectionné, d'après l'ameublement du bien (spec 040, M1). */
  defaultTemplate?: InspectionTemplate;
  /** Faux pour une sortie dont l'entrée existe : ses pièces sont reprises. */
  showTemplateChoice?: boolean;
}

/**
 * Demande la date de l'état des lieux avant de le créer.
 *
 * L'aide affichée pour une sortie rappelle que les pièces de l'entrée sont
 * reprises telles quelles, avec les mêmes identifiants, pour permettre la
 * comparaison — comportement du serveur, pas de ce formulaire, mais qu'il
 * faut annoncer avant le clic.
 *
 * Le modèle de départ (« Bâti seulement » ou « Bâti, mobilier et
 * équipements ») n'est proposé que lorsqu'aucune entrée n'est à reprendre.
 */
export const StartInspectionModal: React.FC<StartInspectionModalProps> = ({
  open,
  type,
  confirmLoading,
  onCancel,
  onConfirm,
  defaultTemplate = 'STANDARD',
  showTemplateChoice = true
}) => {
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [template, setTemplate] = useState<InspectionTemplate>(defaultTemplate);

  // Chaque ouverture repart du modèle présélectionné.
  useEffect(() => {
    if (open) setTemplate(defaultTemplate);
  }, [open, defaultTemplate]);

  return (
    <Modal
      title={type === 'ENTRY' ? t("Commencer l'état des lieux d'entrée") : t('Commencer l’état des lieux de sortie')}
      open={open}
      onCancel={onCancel}
      onOk={() => date && onConfirm(date.format('YYYY-MM-DD'), template)}
      okButtonProps={{ disabled: !date }}
      confirmLoading={confirmLoading}
      okText={t('Commencer')}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      <Text>{t('Date de l’état des lieux')}</Text>
      <DatePicker style={{ width: '100%', marginTop: 8 }} value={date} onChange={setDate} format="DD/MM/YYYY" />

      {showTemplateChoice && (
        <div style={{ marginTop: 16 }}>
          <Text id="inspection-template-label">{t('Modèle de départ')}</Text>
          <Radio.Group
            aria-labelledby="inspection-template-label"
            style={{ display: 'block', marginTop: 8 }}
            value={template}
            onChange={e => setTemplate(e.target.value as InspectionTemplate)}
          >
            <Space direction="vertical">
              <Radio value="STANDARD">{t('Bâti seulement')}</Radio>
              <Radio value="FURNISHED">{t('Bâti, mobilier et équipements')}</Radio>
            </Space>
          </Radio.Group>
        </div>
      )}

      {type === 'EXIT' && !showTemplateChoice && (
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          {t("Reprend les pièces de l'entrée pour la comparaison.")}
        </Text>
      )}
    </Modal>
  );
};

export default StartInspectionModal;
