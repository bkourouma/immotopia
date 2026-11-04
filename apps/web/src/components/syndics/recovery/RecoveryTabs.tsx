import React from 'react';
import { Button, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { MoneyValue, formatMoney } from '../../primitives';
import {
  listLatePaymentPenaltiesPage,
  listPaymentRemindersPage,
  listPaymentSchedulesPage,
  type LatePaymentPenaltiesPageQuery,
  type PaymentRemindersPageQuery,
  type PaymentSchedulesPageQuery
} from '../../../services/syndic-service';
import type { LatePaymentPenalty, PaymentReminder, PaymentSchedule, ReminderStatus } from '../../../types/syndic-types';
import { useListSearch } from '../../../hooks/useListSearch';
import type { SearchCriterion } from '../../../utils/list-search';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { formatLotLabel } from '../../../utils/syndic-lot-label';
import { paymentScheduleStatusLabel, reminderChannelLabel } from '../labels';
import { reminderFailureLabel } from '../reminder-failure';
import { useSyndicLotOptions } from '../finances/lot-options';
import { recoveryKeys } from './query-keys';
import { ServerListTab } from './ServerListTab';
import {
  ownerLabel,
  reminderChannelOptions,
  reminderStatusLabels,
  reminderStatusOptions,
  scheduleStatusOptions
} from './recovery-labels';

const { Text } = Typography;

interface TabProps {
  tenantId: string;
  syndicId: string;
}

/** Niveaux de relance acceptés par l'API (1 à 4 à la création). */
const REMINDER_LEVELS = ['1', '2', '3', '4'] as const;

/**
 * Historique des relances — paginé et filtré par le serveur (préfixe d'URL
 * « re ») : champ libre, statut, canal, niveau, date d'envoi et lot.
 */
export const RemindersTab: React.FC<TabProps> = ({ tenantId, syndicId }) => {
  const lotOptions = useSyndicLotOptions(tenantId, syndicId);
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Lot, propriétaire, période de l’appel…')
    },
    { key: 'status', type: 'multiSelect', label: t('Statut'), primary: true, options: reminderStatusOptions },
    { key: 'channel', type: 'multiSelect', label: t('Canal'), primary: true, options: reminderChannelOptions },
    {
      key: 'level',
      type: 'select',
      label: t('Niveau'),
      options: REMINDER_LEVELS.map(level => ({ value: level, label: t('Niveau {{level}}', { level }) }))
    },
    { key: 'sent', type: 'dateRange', label: t('Date d’envoi'), api: ['from', 'to'] },
    { key: 'lotId', type: 'select', label: t('Lot'), options: lotOptions, placeholder: t('Tous les lots') }
  ];
  const search = useListSearch({
    paramPrefix: 're',
    ariaLabel: t('Rechercher dans les relances'),
    apiNames: { sort: false },
    criteria
  });

  const columns: ColumnsType<PaymentReminder> = [
    { title: t('Niveau'), dataIndex: 'reminderLevel' },
    { title: t('Canal'), dataIndex: 'channel', render: (value: string) => reminderChannelLabel(value) },
    {
      title: t('Statut'),
      dataIndex: 'status',
      render: (value: ReminderStatus) => <Tag>{reminderStatusLabels[value] ?? value}</Tag>
    },
    { title: t('Lot'), render: (_, item) => formatLotLabel(item.lot, item.lotId) },
    { title: t('Propriétaire'), render: (_, item) => ownerLabel(item.lot?.owner) },
    {
      title: t('Envoyé le'),
      dataIndex: 'sentAt',
      render: (value: string) => dayjs(value).format(dateFormat('dateTime'))
    },
    {
      title: t('Cause'),
      render: (_, item) =>
        item.status === 'FAILED' ? reminderFailureLabel(item.failureCode, item.failureMessage) || '-' : '-'
    }
  ];

  return (
    <ServerListTab<PaymentReminder>
      queryKey={recoveryKeys.reminders(tenantId, syndicId)}
      search={search}
      fetchPage={params => listPaymentRemindersPage(tenantId, syndicId, params as PaymentRemindersPageQuery)}
      columns={columns}
      rowKey="id"
      exportFilename={t('Historique relances')}
      emptyText={t('Aucune relance envoyée pour cette copropriété.')}
    />
  );
};

/**
 * Pénalités de retard — paginées et filtrées par le serveur (préfixe d'URL
 * « pe ») : champ libre, active / remise, lot.
 */
export const PenaltiesTab: React.FC<TabProps & { onWaive: (penalty: LatePaymentPenalty) => void }> = ({
  tenantId,
  syndicId,
  onWaive
}) => {
  const lotOptions = useSyndicLotOptions(tenantId, syndicId);
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Lot, propriétaire…') },
    {
      key: 'waived',
      type: 'boolean',
      label: t('Statut'),
      primary: true,
      tristate: true,
      trueLabel: t('Remise'),
      falseLabel: t('Active')
    },
    {
      key: 'lotId',
      type: 'select',
      label: t('Lot'),
      primary: true,
      options: lotOptions,
      placeholder: t('Tous les lots')
    }
  ];
  const search = useListSearch({
    paramPrefix: 'pe',
    ariaLabel: t('Rechercher dans les pénalités'),
    apiNames: { sort: false },
    criteria
  });

  const columns: ColumnsType<LatePaymentPenalty> = [
    { title: t('Lot'), render: (_, item) => formatLotLabel(item.lot, item.lotId) },
    { title: t('Propriétaire'), render: (_, item) => ownerLabel(item.lot?.owner) },
    { title: t('Jours retard'), dataIndex: 'daysLate' },
    { title: t('Taux'), dataIndex: 'penaltyRate', render: (value: number) => `${value}%` },
    {
      title: t('Montant'),
      dataIndex: 'penaltyAmount',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} />
    },
    {
      title: t('Statut'),
      render: (_, item) =>
        item.waived ? <Tag color="orange">{t('Remise')}</Tag> : <Tag color="red">{t('Active')}</Tag>
    },
    {
      title: t('Action'),
      exportable: false,
      render: (_, item) =>
        item.waived ? (
          <Text type="secondary">-</Text>
        ) : (
          <Button size="small" onClick={() => onWaive(item)}>
            {t('Remise')}
          </Button>
        )
    }
  ];

  return (
    <ServerListTab<LatePaymentPenalty>
      queryKey={recoveryKeys.penalties(tenantId, syndicId)}
      search={search}
      // `waived` part en « true » / « false » : c'est ce qu'attend l'API (le type du service dit boolean).
      fetchPage={params =>
        listLatePaymentPenaltiesPage(tenantId, syndicId, params as unknown as LatePaymentPenaltiesPageQuery)
      }
      columns={columns}
      rowKey="id"
      exportFilename={t('Pénalités de retard')}
      emptyText={t('Aucune pénalité de retard pour cette copropriété.')}
    />
  );
};

/**
 * Échéanciers — paginés et filtrés par le serveur (préfixe d'URL « ec ») :
 * champ libre, statut, lot.
 */
export const SchedulesTab: React.FC<TabProps> = ({ tenantId, syndicId }) => {
  const lotOptions = useSyndicLotOptions(tenantId, syndicId);
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Lot, propriétaire, période de l’appel…')
    },
    { key: 'status', type: 'multiSelect', label: t('Statut'), primary: true, options: scheduleStatusOptions },
    {
      key: 'lotId',
      type: 'select',
      label: t('Lot'),
      primary: true,
      options: lotOptions,
      placeholder: t('Tous les lots')
    }
  ];
  const search = useListSearch({
    paramPrefix: 'ec',
    ariaLabel: t('Rechercher dans les échéanciers'),
    apiNames: { sort: false },
    criteria
  });

  const columns: ColumnsType<PaymentSchedule> = [
    { title: t('Lot'), render: (_, item) => formatLotLabel(item.lot, item.lotId) },
    { title: t('Propriétaire'), render: (_, item) => ownerLabel(item.lot?.owner) },
    { title: t('Appel'), render: (_, item) => item.chargeCall?.period || '-' },
    {
      title: t('Montant total'),
      dataIndex: 'totalAmount',
      align: 'end',
      render: (value: number | string) => <MoneyValue value={value} />
    },
    {
      title: t('Accord'),
      dataIndex: 'agreedAt',
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Échéances'),
      render: (_, item) =>
        (item.instalments || [])
          .map(inst => `${dayjs(inst.dueDate).format(dateFormat('short'))} (${formatMoney(inst.amount)})`)
          .join(' | ') || '-'
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      render: (value: string) => <Tag>{paymentScheduleStatusLabel(value)}</Tag>
    }
  ];

  return (
    <ServerListTab<PaymentSchedule>
      queryKey={recoveryKeys.schedules(tenantId, syndicId)}
      search={search}
      fetchPage={params => listPaymentSchedulesPage(tenantId, syndicId, params as PaymentSchedulesPageQuery)}
      columns={columns}
      rowKey="id"
      exportFilename={t('Échéanciers')}
      emptyText={t('Aucun échéancier pour cette copropriété.')}
    />
  );
};
