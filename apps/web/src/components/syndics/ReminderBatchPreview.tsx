import React from 'react';
import { Alert, Modal, Space, Table, Typography } from 'antd';
import { ReminderBatchPreview as ReminderBatchPreviewData } from '../../types/syndic-types';
import { reminderExclusionLabel } from './reminder-failure';
import { t } from '../../i18n/t';

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

  return (
    <Modal
      title={t('Relances groupées')}
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText={t('Envoyer {{count}} relance(s)', { count })}
      cancelText={count === 0 ? t('Fermer') : t('Annuler')}
      okButtonProps={count === 0 ? { style: { display: 'none' } } : undefined}
      confirmLoading={confirming}
      width={680}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {count === 0 ? (
          <Alert type="info" showIcon message={t('Aucune relance à envoyer pour le moment.')} />
        ) : (
          <>
            <Text strong>{t('{{count}} relance(s) vont partir par e-mail :', { count })}</Text>
            <Table
              size="small"
              rowKey="chargeCallId"
              pagination={false}
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
