import React from 'react';
import { Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { ChargeScheduleRun } from '../../../types/syndic-types';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { describeScheduleError, runStatusConfig, runTriggerLabels } from './chargeScheduleLabels';
import { NotificationsSkipped } from './NotificationsSkipped';

const { Text } = Typography;

export const ScheduleRunsPanel: React.FC<{ runs: ChargeScheduleRun[]; loading: boolean }> = ({ runs, loading }) => (
  <Table
    rowKey="id"
    loading={loading}
    dataSource={runs}
    pagination={{ pageSize: 10 }}
    locale={{ emptyText: t('Aucune exécution enregistrée.') }}
    columns={[
      { title: t('Période'), dataIndex: 'periodLabel' },
      {
        title: t('Statut'),
        dataIndex: 'status',
        render: (value: ChargeScheduleRun['status']) => (
          <Tag color={runStatusConfig[value].color}>{runStatusConfig[value].label}</Tag>
        )
      },
      {
        title: t('Déclenchement'),
        dataIndex: 'trigger',
        render: (value: ChargeScheduleRun['trigger']) => runTriggerLabels[value]
      },
      { title: t('Appels créés'), dataIndex: 'callsCreated', align: 'end' },
      { title: t('Couverts'), dataIndex: 'callsCovered', align: 'end' },
      { title: t('Notifications'), dataIndex: 'notificationsSent', align: 'end' },
      {
        title: t('Avis non envoyés'),
        key: 'notificationsSkipped',
        align: 'end',
        render: (_, run) => <NotificationsSkipped count={run.notificationsSkipped} notes={run.notes} />
      },
      {
        title: t('Date'),
        dataIndex: 'createdAt',
        render: (value: string) => dayjs(value).format(dateFormat('short'))
      },
      {
        title: t('Erreur'),
        dataIndex: 'error',
        render: (value: string | null) => {
          const label = describeScheduleError(value);
          return label ? <Text type="danger">{label}</Text> : '—';
        }
      }
    ]}
  />
);
