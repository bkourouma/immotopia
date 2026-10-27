import React, { useCallback, useMemo, useState } from 'react';
import { Badge, Button, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { LiveLotRow } from '../../../types/syndic-live-types';
import { attendanceLabel } from './live-labels';
import { t } from '../../../i18n/t';

const { Text } = Typography;

export interface ContactOption {
  contactId: string;
  name: string;
}

export interface LotAttendanceChange {
  status: 'PRESENT' | 'REPRESENTED' | 'ABSENT';
  mode?: 'IN_PERSON';
  representedByContactId?: string | null;
}

interface LiveLotsTableProps {
  lots: LiveLotRow[];
  contacts: ContactOption[];
  /** Mandataire de la procuration, par mandant (contactId d'un votant du lot). */
  proxyHolders?: Record<string, ContactOption>;
  readOnly: boolean;
  /** Lots dont un émargement est en cours : seule leur ligne est désactivée. */
  busyLotIds?: ReadonlySet<string>;
  /** Un menu déroulant d'émargement s'ouvre ou se ferme (la console suspend alors le rafraîchissement). */
  onMenuOpenChange?: (open: boolean) => void;
  onSetLot: (lotId: string, data: LotAttendanceChange) => void;
  onBulk: (lotIds: string[], status: 'PRESENT' | 'ABSENT') => void;
}

const REP_PREFIX = 'rep:';

/** Valeur courante du sélecteur d'émargement d'un lot. */
function currentValue(lot: LiveLotRow): string {
  const attendance = lot.attendance;
  if (!attendance || attendance.status === 'ABSENT') return 'ABSENT';
  if (attendance.status === 'REPRESENTED') {
    return attendance.representedByContactId ? `${REP_PREFIX}${attendance.representedByContactId}` : 'REPRESENTED';
  }
  return attendance.mode === 'ONLINE' ? 'PRESENT_ONLINE' : 'PRESENT';
}

/** Mandataire de la procuration du lot : celui du premier votant qui en a donné une. */
function lotProxyHolder(lot: LiveLotRow, proxyHolders?: Record<string, ContactOption>): ContactOption | null {
  if (!proxyHolders) return null;
  for (const voter of lot.voters) {
    const holder = proxyHolders[voter.contactId];
    if (holder) return holder;
  }
  return null;
}

const NO_BUSY_LOTS: ReadonlySet<string> = new Set();

const LiveLotsTableInner: React.FC<LiveLotsTableProps> = ({
  lots,
  contacts,
  proxyHolders,
  readOnly,
  busyLotIds = NO_BUSY_LOTS,
  onMenuOpenChange,
  onSetLot,
  onBulk
}) => {
  const [selected, setSelected] = useState<string[]>([]);

  const contactOptions = useMemo(
    () => contacts.map(contact => ({ value: `${REP_PREFIX}${contact.contactId}`, label: contact.name })),
    [contacts]
  );

  /**
   * Options d'émargement de chaque lot. « Représenté » n'est offert en un clic que si une procuration
   * désigne un mandataire pour ce lot ; « Représenté par… » exclut les votants du lot (un propriétaire ne
   * se représente pas lui-même : l'API refuse). Le tableau d'options est partagé entre lots de mêmes votants.
   */
  const optionsByLot = useMemo(() => {
    const mandataireChoices = new Map<string, typeof contactOptions>();
    const result = new Map<string, Array<Record<string, unknown>>>();
    lots.forEach(lot => {
      const voterIds = lot.voters.map(voter => voter.contactId);
      const key = voterIds.slice().sort().join('|');
      let choices = mandataireChoices.get(key);
      if (!choices) {
        const excluded = new Set(voterIds.map(id => `${REP_PREFIX}${id}`));
        choices = contactOptions.filter(option => !excluded.has(option.value));
        mandataireChoices.set(key, choices);
      }
      const holder = lotProxyHolder(lot, proxyHolders);
      const holderIsVoter = holder !== null && voterIds.includes(holder.contactId);
      result.set(lot.lotId, [
        { value: 'PRESENT', label: t('Présent en salle') },
        { value: 'PRESENT_ONLINE', label: t('Présent en ligne'), disabled: true },
        { value: 'ABSENT', label: t('Absent') },
        { value: 'REPRESENTED', label: t('Représenté'), disabled: holder === null || holderIsVoter },
        { label: t('Représenté par…'), options: choices }
      ]);
    });
    return result;
  }, [lots, contactOptions, proxyHolders]);

  const handleChange = useCallback(
    (lot: LiveLotRow, value: string) => {
      if (value === 'PRESENT') onSetLot(lot.lotId, { status: 'PRESENT', mode: 'IN_PERSON' });
      else if (value === 'ABSENT') onSetLot(lot.lotId, { status: 'ABSENT' });
      else if (value === 'REPRESENTED') {
        // Procuration connue : on envoie explicitement son mandataire, sans sélecteur.
        const holder = lotProxyHolder(lot, proxyHolders);
        if (holder && !lot.voters.some(voter => voter.contactId === holder.contactId)) {
          onSetLot(lot.lotId, { status: 'REPRESENTED', mode: 'IN_PERSON', representedByContactId: holder.contactId });
        }
      } else if (value.startsWith(REP_PREFIX)) {
        const contactId = value.slice(REP_PREFIX.length);
        // Garde de sécurité : jamais un votant du lot comme mandataire.
        if (lot.voters.some(voter => voter.contactId === contactId)) return;
        onSetLot(lot.lotId, {
          status: 'REPRESENTED',
          mode: 'IN_PERSON',
          representedByContactId: contactId
        });
      }
    },
    [onSetLot, proxyHolders]
  );

  // Colonnes stables d'un rendu à l'autre tant que les lots, options et lignes occupées ne changent pas.
  const columns = useMemo<ColumnsType<LiveLotRow>>(
    () => [
      {
        title: t('Lot'),
        dataIndex: 'lotNumber',
        key: 'lot',
        sorter: (a, b) => a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true })
      },
      { title: t('Tantièmes'), dataIndex: 'generalShares', key: 'shares', align: 'end' },
      {
        title: t('Votant(s)'),
        key: 'voters',
        render: (_: unknown, lot) => (lot.voters.length > 0 ? lot.voters.map(voter => voter.name).join(t(' et ')) : '-')
      },
      {
        title: t('En ligne'),
        key: 'online',
        render: (_: unknown, lot) => (
          <Badge status={lot.online ? 'success' : 'default'} text={lot.online ? t('En ligne') : t('Hors ligne')} />
        )
      },
      {
        title: t('Statut'),
        key: 'status',
        render: (_: unknown, lot) => {
          const status = lot.attendance?.status ?? 'ABSENT';
          const color = status === 'ABSENT' ? 'default' : status === 'REPRESENTED' ? 'purple' : 'green';
          return (
            <Space size={4} wrap>
              <Tag color={color}>{attendanceLabel(status)}</Tag>
              {lot.attendance?.status === 'REPRESENTED' && lot.attendance.representedByName ? (
                <Text type="secondary">{lot.attendance.representedByName}</Text>
              ) : null}
            </Space>
          );
        }
      },
      {
        title: t('Émargement'),
        key: 'attendance',
        render: (_: unknown, lot) => (
          <Select
            size="small"
            style={{ minWidth: 190 }}
            value={currentValue(lot)}
            options={optionsByLot.get(lot.lotId)}
            disabled={readOnly || busyLotIds.has(lot.lotId)}
            showSearch
            optionFilterProp="label"
            aria-label={t('Émargement du lot {{lotNumber}}', { lotNumber: lot.lotNumber })}
            onChange={value => handleChange(lot, value)}
            onOpenChange={onMenuOpenChange}
          />
        )
      }
    ],
    [optionsByLot, readOnly, busyLotIds, onMenuOpenChange, handleChange]
  );

  const selectionBusy = selected.some(id => busyLotIds.has(id));

  const bulk = useCallback(
    (status: 'PRESENT' | 'ABSENT') => {
      onBulk(selected, status);
      setSelected([]);
    },
    [onBulk, selected]
  );

  return (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      {readOnly ? null : (
        <Space wrap>
          <Text type="secondary">{t('{{count}} lot(s) sélectionné(s)', { count: selected.length })}</Text>
          <Button size="small" disabled={selected.length === 0 || selectionBusy} onClick={() => bulk('PRESENT')}>
            {t('Marquer présents en salle')}
          </Button>
          <Button size="small" disabled={selected.length === 0 || selectionBusy} onClick={() => bulk('ABSENT')}>
            {t('Marquer absents')}
          </Button>
        </Space>
      )}
      <Table<LiveLotRow>
        size="small"
        rowKey="lotId"
        dataSource={lots}
        columns={columns}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        rowSelection={
          readOnly
            ? undefined
            : {
                selectedRowKeys: selected,
                onChange: keys => setSelected(keys.map(String)),
                preserveSelectedRowKeys: true
              }
        }
        locale={{ emptyText: t('Aucun lot') }}
      />
    </Space>
  );
};

/** Mémoïsé : la console se rend souvent (polling, visio), la table et ses menus ouverts ne doivent pas être recréés. */
export const LiveLotsTable = React.memo(LiveLotsTableInner);
