import React from 'react';
import { Button, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ConfirmAction, MoneyValue } from '../../primitives';
import { ChargeSchedule } from '../../../types/syndic-types';
import { t } from '../../../i18n/t';
import {
  amountSourceLabels,
  describeScheduleError,
  formatDay,
  frequencyLabels,
  runStatusConfig
} from './chargeScheduleLabels';
import { ChargeScheduleRunNotices } from '../ChargeScheduleRunNotices';

const { Text } = Typography;

export const ScheduleTable: React.FC<{
  tenantId: string | null | undefined;
  syndicId: string | null | undefined;
  onNoticesResent: (scheduleId: string) => void;
  schedules: ChargeSchedule[];
  busyId: string | null;
  onOpen: (schedule: ChargeSchedule) => void;
  onExecute: (schedule: ChargeSchedule) => void;
  onPause: (schedule: ChargeSchedule) => void;
  onResume: (schedule: ChargeSchedule) => void;
  onDelete: (schedule: ChargeSchedule) => void;
}> = ({ tenantId, syndicId, onNoticesResent, schedules, busyId, onOpen, onExecute, onPause, onResume, onDelete }) => {
  const columns: ColumnsType<ChargeSchedule> = [
    {
      title: t('Libellé'),
      dataIndex: 'label',
      key: 'label',
      render: (value: string, schedule) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          <Text type="secondary">{frequencyLabels[schedule.frequency]}</Text>
        </Space>
      )
    },
    {
      title: t('Source et montant'),
      key: 'source',
      render: (_, schedule) =>
        schedule.amountSource === 'FIXED' ? (
          <Space direction="vertical" size={0}>
            <Text>{amountSourceLabels.FIXED}</Text>
            <Text type="secondary">
              <MoneyValue value={schedule.fixedAmount ?? 0} currency={schedule.currency} />
            </Text>
          </Space>
        ) : (
          <Space direction="vertical" size={0}>
            <Text>{amountSourceLabels.BUDGET}</Text>
            <Text type="secondary">
              {schedule.budget ? `${schedule.budget.label} (${schedule.budget.fiscalYear})` : '—'}
            </Text>
          </Space>
        )
    },
    {
      title: t('Prochaine émission'),
      key: 'next',
      render: (_, schedule) =>
        schedule.nextPeriod ? (
          <Space direction="vertical" size={0}>
            <Text>{schedule.nextPeriod.label}</Text>
            <Text type="secondary">
              {t('Émission')} {formatDay(schedule.nextPeriod.issueDate)} · {t('Échéance')}{' '}
              {formatDay(schedule.nextPeriod.dueDate)}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">{t('Aucune (fin de programmation atteinte)')}</Text>
        )
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_, schedule) =>
        schedule.active ? <Tag color="green">{t('Active')}</Tag> : <Tag color="default">{t('En pause')}</Tag>
    },
    {
      title: t('Dernière exécution'),
      key: 'lastRun',
      render: (_, schedule) =>
        schedule.lastRun ? (
          <Space direction="vertical" size={0}>
            <Tag color={runStatusConfig[schedule.lastRun.status].color}>
              {schedule.lastRun.periodLabel} · {runStatusConfig[schedule.lastRun.status].label}
            </Tag>
            {schedule.lastRun.error ? (
              <Text type="danger" style={{ fontSize: 12 }}>
                {describeScheduleError(schedule.lastRun.error)}
              </Text>
            ) : null}
            {schedule.lastRun.status === 'SUCCESS' ? (
              <ChargeScheduleRunNotices
                run={schedule.lastRun}
                tenantId={tenantId}
                syndicId={syndicId}
                scheduleId={schedule.id}
                onResent={() => onNoticesResent(schedule.id)}
              />
            ) : null}
          </Space>
        ) : (
          <Text type="secondary">{t('Aucune')}</Text>
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_, schedule) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => onOpen(schedule)}>
            {t('Ouvrir')}
          </Button>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            loading={busyId === schedule.id}
            disabled={!schedule.active}
            onClick={() => onExecute(schedule)}
          >
            {t('Exécuter maintenant')}
          </Button>
          {schedule.active ? (
            <Button
              size="small"
              icon={<PauseCircleOutlined />}
              loading={busyId === schedule.id}
              onClick={() => void onPause(schedule)}
            >
              {t('Pause')}
            </Button>
          ) : (
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              loading={busyId === schedule.id}
              onClick={() => void onResume(schedule)}
            >
              {t('Reprise')}
            </Button>
          )}
          <ConfirmAction
            title={t('Supprimer la programmation « {{label}} » ?', { label: schedule.label })}
            description={t(
              "Si des appels ont déjà été émis, la programmation sera désactivée au lieu d'être supprimée."
            )}
            okText={t('Supprimer')}
            danger
            onConfirm={() => onDelete(schedule)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === schedule.id}>
              {t('Supprimer')}
            </Button>
          </ConfirmAction>
        </Space>
      )
    }
  ];

  return (
    <Table
      rowKey="id"
      scroll={{ x: 'max-content' }}
      dataSource={schedules}
      columns={columns}
      pagination={{ pageSize: 10 }}
      locale={{ emptyText: t('Aucune programmation pour cette copropriété.') }}
    />
  );
};
