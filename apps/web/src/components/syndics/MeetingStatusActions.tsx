import React from 'react';
import { Button, Popconfirm, Space } from 'antd';
import { MeetingStatus } from '../../types/syndic-types';
import { t } from '../../i18n/t';
import { helpAnchor } from '../../help';

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
        <Popconfirm
          title={t('Ouvrir la séance ?')}
          description={t(
            'La séance passe « En cours » : les votes peuvent être ouverts. Vous pourrez ensuite la clôturer, mais pas revenir à « Planifiée ».'
          )}
          okText={t('Ouvrir la séance')}
          cancelText={t('Pas maintenant')}
          onConfirm={() => onChange('IN_PROGRESS')}
        >
          <Button size={size} type="primary" loading={loading} {...helpAnchor('ag-ouvrir')}>
            {t('Ouvrir la séance')}
          </Button>
        </Popconfirm>
        <Popconfirm
          title={t("Annuler l'assemblée ?")}
          description={t("L'assemblée sera annulée définitivement : plus aucun vote ni modification ne sera possible.")}
          okText={t("Annuler l'assemblée")}
          okButtonProps={{ danger: true }}
          cancelText={t('Conserver')}
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
        description={t(
          'Les votes seront figés, les résultats enregistrés et aucune résolution ne pourra plus être ajoutée. Cette action est définitive.'
        )}
        okText={t('Clôturer la séance')}
        cancelText={t('Pas maintenant')}
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
