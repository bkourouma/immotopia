import React from 'react';
import { Button, Popconfirm, Space } from 'antd';
import { MeetingStatus } from '../../types/syndic-types';
import { t } from '../../i18n/t';

interface MeetingStatusActionsProps {
  status: MeetingStatus;
  onChange: (status: MeetingStatus) => Promise<void> | void;
  loading?: boolean;
  size?: 'small' | 'middle';
}

/**
 * Transitions d'une AG : planifiee -> en cours -> cloturee, ou planifiee ->
 * annulee. La cloture et l'annulation sont definitives, d'ou la confirmation.
 */
export const MeetingStatusActions: React.FC<MeetingStatusActionsProps> = ({
  status,
  onChange,
  loading = false,
  size = 'middle'
}) => {
  if (status === 'PLANNED') {
    return (
      <Space wrap>
        <Button size={size} type="primary" loading={loading} onClick={() => void onChange('IN_PROGRESS')}>
          {t('Ouvrir la séance')}
        </Button>
        <Popconfirm
          title={t("Annuler l'assemblée ?")}
          description={t('Une assemblée annulée ne peut plus recevoir de vote.')}
          okText={t('Oui')}
          cancelText={t('Non')}
          onConfirm={() => onChange('CANCELLED')}
        >
          <Button size={size} danger loading={loading}>
            {t("Annuler l'assemblée")}
          </Button>
        </Popconfirm>
      </Space>
    );
  }

  if (status === 'IN_PROGRESS') {
    return (
      <Popconfirm
        title={t('Clôturer la séance ?')}
        description={t('Les votes seront figés et aucune résolution ne pourra plus être ajoutée.')}
        okText={t('Oui')}
        cancelText={t('Non')}
        onConfirm={() => onChange('COMPLETED')}
      >
        <Button size={size} type="primary" loading={loading}>
          {t('Clôturer la séance')}
        </Button>
      </Popconfirm>
    );
  }

  return null;
};
