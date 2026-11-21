import React from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ConfirmAction, DataCard, MoneyValue, Table, formatMoney, useConfirmAction } from '../../primitives';
import type { MenuProps } from 'antd';
import { ChargeSchedule } from '../../../types/syndic-types';
import { t } from '../../../i18n/t';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import {
  amountSourceLabels,
  describeScheduleError,
  formatDay,
  frequencyLabels,
  runStatusConfig
} from './chargeScheduleLabels';
import { ChargeScheduleRunNotices } from '../ChargeScheduleRunNotices';
import { displayCurrency } from '../../../utils/syndic-currency';
import { allocationMethodLabel } from '../charge-allocation/ChargeAllocationControls';
import { ResponsiveList } from '../charge-allocation/ChargeFormLayout';

const { Text } = Typography;

/** Libellé de répartition d'une programmation : précise le périmètre des tantièmes (montant fixe). */
function scheduleAllocationLabel(schedule: ChargeSchedule): string {
  const isShares = !schedule.allocationMethod || schedule.allocationMethod === 'SHARES';
  if (schedule.amountSource === 'FIXED' && isShares && schedule.includeAnnexLots !== undefined) {
    return schedule.includeAnnexLots ? t('Tantièmes (tous les lots)') : t('Tantièmes (lots principaux)');
  }
  return allocationMethodLabel(schedule.allocationMethod);
}

// Accesseurs stables (hors composant) : les libellés sont lus dans les fonctions pour suivre la langue.
const TEXTE_RECHERCHE = [
  (schedule: ChargeSchedule) => schedule.label,
  (schedule: ChargeSchedule) => frequencyLabels[schedule.frequency],
  (schedule: ChargeSchedule) => (schedule.budget ? schedule.budget.label : undefined)
];
const ACCESSEURS = {
  statut: (schedule: ChargeSchedule) => schedule.active,
  source: (schedule: ChargeSchedule) => schedule.amountSource
};

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
  const confirm = useConfirmAction();
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Libellé, fréquence, budget…')
    },
    {
      key: 'statut',
      type: 'boolean',
      label: t('Statut'),
      primary: true,
      tristate: true,
      trueLabel: t('Active'),
      falseLabel: t('En pause')
    },
    {
      key: 'source',
      type: 'select',
      label: t('Source'),
      primary: true,
      options: [
        { value: 'BUDGET', label: amountSourceLabels.BUDGET },
        { value: 'FIXED', label: amountSourceLabels.FIXED }
      ]
    }
  ];
  const local = useLocalListSearch<ChargeSchedule>(schedules, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS,
    defaultPageSize: 10,
    paramPrefix: 'prog',
    ariaLabel: t('Rechercher dans les programmations')
  });

  const columns: ColumnsType<ChargeSchedule> = [
    {
      title: t('Libellé'),
      dataIndex: 'label',
      key: 'label',
      exportValue: schedule => `${schedule.label} — ${frequencyLabels[schedule.frequency]}`,
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
      exportValue: schedule =>
        schedule.amountSource === 'FIXED'
          ? `${amountSourceLabels.FIXED} — ${
              schedule.allocationMethod === 'BY_LOT_TYPE'
                ? t('Barème par type de lot')
                : formatMoney(schedule.fixedAmount ?? 0, { currency: displayCurrency(schedule.currency) })
            } (${scheduleAllocationLabel(schedule)})`
          : schedule.budget
            ? `${amountSourceLabels.BUDGET} — ${schedule.budget.label} (${schedule.budget.fiscalYear})`
            : amountSourceLabels.BUDGET,
      render: (_, schedule) =>
        schedule.amountSource === 'FIXED' ? (
          <Space direction="vertical" size={0}>
            <Text>{amountSourceLabels.FIXED}</Text>
            <Text type="secondary">
              {schedule.allocationMethod === 'BY_LOT_TYPE' ? (
                t('Barème par type de lot')
              ) : (
                <MoneyValue value={schedule.fixedAmount ?? 0} currency={displayCurrency(schedule.currency)} />
              )}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {scheduleAllocationLabel(schedule)}
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
      exportValue: schedule =>
        schedule.nextPeriod
          ? `${schedule.nextPeriod.label} — ${t('Émission')} ${formatDay(schedule.nextPeriod.issueDate)} · ${t('Échéance')} ${formatDay(schedule.nextPeriod.dueDate)}`
          : t('Aucune (fin de programmation atteinte)'),
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
      exportValue: schedule => (schedule.active ? t('Active') : t('En pause')),
      render: (_, schedule) =>
        schedule.active ? <Tag color="green">{t('Active')}</Tag> : <Tag color="default">{t('En pause')}</Tag>
    },
    {
      title: t('Dernière exécution'),
      key: 'lastRun',
      exportValue: schedule => {
        const run = schedule.lastRun;
        if (!run) return t('Aucune');
        const error = run.error ? describeScheduleError(run.error) : '';
        return `${run.periodLabel} · ${runStatusConfig[run.status].label}${error ? ` — ${error}` : ''}`;
      },
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

  /** Carte mobile : « Ouvrir » en action visible, le reste derrière « ⋮ » (suppression avec confirmation). */
  const renderCard = (schedule: ChargeSchedule) => {
    const run = schedule.lastRun;
    const busy = busyId === schedule.id;
    const menu: NonNullable<MenuProps['items']> = [
      {
        key: 'execute',
        icon: <ThunderboltOutlined />,
        label: t('Exécuter maintenant'),
        disabled: !schedule.active || busy,
        onClick: () => onExecute(schedule)
      },
      schedule.active
        ? {
            key: 'pause',
            icon: <PauseCircleOutlined />,
            label: t('Pause'),
            disabled: busy,
            onClick: () => void onPause(schedule)
          }
        : {
            key: 'resume',
            icon: <PlayCircleOutlined />,
            label: t('Reprise'),
            disabled: busy,
            onClick: () => void onResume(schedule)
          },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        danger: true,
        label: t('Supprimer'),
        disabled: busy,
        onClick: () =>
          confirm({
            title: t('Supprimer la programmation « {{label}} » ?', { label: schedule.label }),
            description: t(
              "Si des appels ont déjà été émis, la programmation sera désactivée au lieu d'être supprimée."
            ),
            okText: t('Supprimer'),
            danger: true,
            onConfirm: () => onDelete(schedule)
          })
      }
    ];
    return (
      <DataCard
        title={schedule.label}
        subtitle={frequencyLabels[schedule.frequency]}
        status={schedule.active ? <Tag color="green">{t('Active')}</Tag> : <Tag color="default">{t('En pause')}</Tag>}
        fields={[
          {
            label: t('Montant'),
            value:
              schedule.amountSource === 'FIXED' ? (
                schedule.allocationMethod === 'BY_LOT_TYPE' ? (
                  t('Barème par type de lot')
                ) : (
                  <MoneyValue value={schedule.fixedAmount ?? 0} currency={displayCurrency(schedule.currency)} />
                )
              ) : schedule.budget ? (
                `${schedule.budget.label} (${schedule.budget.fiscalYear})`
              ) : (
                amountSourceLabels.BUDGET
              )
          },
          { label: t('Répartition'), value: scheduleAllocationLabel(schedule) },
          {
            label: t('Prochaine émission'),
            value: schedule.nextPeriod
              ? `${schedule.nextPeriod.label} · ${formatDay(schedule.nextPeriod.issueDate)}`
              : t('Aucune (fin de programmation atteinte)')
          },
          {
            label: t('Dernière exécution'),
            value: run ? (
              <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
                <Tag color={runStatusConfig[run.status].color} style={{ marginInlineEnd: 0 }}>
                  {run.periodLabel} · {runStatusConfig[run.status].label}
                </Tag>
                {run.error ? (
                  <Text type="danger" style={{ fontSize: 12 }}>
                    {describeScheduleError(run.error)}
                  </Text>
                ) : null}
              </Space>
            ) : (
              t('Aucune')
            )
          }
        ]}
        primaryAction={{ label: t('Ouvrir'), onClick: () => onOpen(schedule), loading: busy }}
        secondaryActions={menu}
      />
    );
  };

  const tableNode = (
    <Table
      helpId="syndic.programmation.liste.tableau"
      {...local.tableProps}
      exportFilename={t('Programmation des appels de charges')}
      exportFetchAll={local.exportAll}
      rowKey="id"
      scroll={{ x: 'max-content' }}
      columns={columns}
      locale={local.isFiltered ? undefined : { emptyText: t('Aucune programmation pour cette copropriété.') }}
    />
  );

  return (
    <ResponsiveList<ChargeSchedule>
      table={tableNode}
      columns={columns}
      cards={{
        ...local.dataViewProps,
        'aria-label': t('Programmation des appels de charges'),
        helpId: 'syndic.programmation.liste.tableau',
        export: { filename: t('Programmation des appels de charges'), fetchAll: local.exportAll },
        emptyDescription: t(
          'Aucune programmation pour cette copropriété : créez-en une avec « Nouvelle programmation ».'
        ),
        rowKey: schedule => schedule.id,
        renderCard
      }}
    />
  );
};
