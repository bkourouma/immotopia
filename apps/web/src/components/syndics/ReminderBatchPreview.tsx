import React from 'react';
import { Alert, Modal, Space, Table, Typography } from 'antd';
import { ReminderBatchPreview as ReminderBatchPreviewData } from '../../types/syndic-types';
import { reminderExclusionLabel } from './reminder-failure';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const { Text } = Typography;

interface ReminderBatchPreviewProps {
  open: boolean;
  preview: ReminderBatchPreviewData | null;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation obligatoire avant l'envoi des relances groupées : ce qui part, et ce qui est écarté. */
export const ReminderBatchPreview: React.FC<ReminderBatchPreviewProps> = ({
  open,
  preview,
  confirming,
  onConfirm,
  onCancel
}) => {
  const eligible = preview?.eligible ?? [];
  const excluded = preview?.excluded ?? [];
  const count = eligible.length;
  const { isMobile } = useBreakpoint();

  return (
    <Modal
      title={<HelpSectionTitle title={t('Relances groupées')} helpId="syndic.recouvrement.relances-groupees" />}
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText={t('Envoyer {{count}} relance(s)', { count })}
      okButtonProps={count === 0 ? { style: { display: 'none' } } : undefined}
      cancelText={count === 0 ? t('Fermer') : t('Annuler')}
      confirmLoading={confirming}
      width={680}
      style={isMobile ? { top: 16 } : undefined}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {count === 0 ? (
          <Alert type="info" showIcon message={t('Aucune relance à envoyer pour le moment.')} />
        ) : (
          <>
            <Alert
              type="warning"
              showIcon
              message={t('{{count}} relance(s) vont partir par e-mail', { count })}
              description={t(
                'L’envoi est immédiat et ne peut pas être annulé : chaque copropriétaire concerné reçoit son e-mail. Vérifiez la liste avant de confirmer.'
              )}
            />
            <Table
              size="small"
              rowKey="chargeCallId"
              pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false, size: 'small' }}
              scroll={{ y: 240 }}
              dataSource={eligible}
              columns={[
                { title: t('Lot'), dataIndex: 'lotNumber' },
                { title: t('Période'), dataIndex: 'period' },
                {
                  title: t('Niveau suivant'),
                  dataIndex: 'nextLevel',
                  render: (value: number) => t('Niveau {{level}}', { level: value })
                }
              ]}
            />
          </>
        )}
        {excluded.length > 0 ? (
          <div>
            <Text strong>{t('{{count}} appel(s) écarté(s) :', { count: excluded.length })}</Text>
            <ul style={{ margin: '4px 0 0', paddingInlineStart: 20 }}>
              {excluded.map(item => (
                <li key={`${item.chargeCallId}-${item.reason}`}>
                  {t('{{lot}} ({{period}}) : {{reason}}', {
                    lot: item.lotNumber,
                    period: item.period,
                    reason: reminderExclusionLabel(item.reason, item.reasonLabel)
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Space>
    </Modal>
  );
};
