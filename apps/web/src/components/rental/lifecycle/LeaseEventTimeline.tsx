import React from 'react';
import { Timeline, Typography, Empty } from 'antd';
import { EditOutlined, SyncOutlined, FileTextOutlined, StopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { LeaseEvent, LeaseEventInitiator, LeaseEventType } from '../../../services/lease-lifecycle-service';
import { formatMoney } from '../../primitives';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/** Format d'affichage imposé au panneau : `DD/MM/YYYY`. */
function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : '';
}

const ICON_BY_TYPE: Record<LeaseEventType, React.ReactNode> = {
  REVISION: <EditOutlined />,
  RENEWAL: <SyncOutlined />,
  AMENDMENT: <FileTextOutlined />,
  TERMINATION: <StopOutlined />
};

const COLOR_BY_TYPE: Record<LeaseEventType, string> = {
  REVISION: 'blue',
  RENEWAL: 'green',
  AMENDMENT: 'gold',
  TERMINATION: 'red'
};

function initiatorLabel(initiatedBy: LeaseEventInitiator | null): string {
  switch (initiatedBy) {
    case 'TENANT':
      return t('à l’initiative du locataire');
    case 'LANDLORD':
      return t('à l’initiative du bailleur');
    case 'MUTUAL':
      return t('d’un commun accord');
    default:
      return '';
  }
}

/**
 * La phrase d'un événement de la vie du bail.
 *
 * Une phrase par type, close sur elle-même — pas de fragments dispersés dans
 * des `<span>` séparés — pour que l'historique se lise sans effort. Les
 * montants passent par `formatMoney` (le même moteur que `<MoneyValue>`) et non
 * par le composant : ici l'unité ne se répète qu'une fois par phrase, comme
 * dans « de 150 000 à 157 500 FCFA », ce qu'un `<MoneyValue>` par valeur ne
 * permettrait pas.
 */
export function describeLeaseEvent(event: LeaseEvent): string {
  switch (event.type) {
    case 'REVISION': {
      const from = formatMoney(event.previousRent, { currency: null });
      const to = formatMoney(event.newRent);
      const date = formatDate(event.effectiveDate);
      let phrase = t('Loyer révisé de {{from}} à {{to}} au {{date}}', { from, to, date });
      if (event.revisionRate != null) {
        const sign = event.revisionRate >= 0 ? '+' : '';
        phrase += ` (${sign}${event.revisionRate} %)`;
      }
      const n = event.details?.installmentsUpdated;
      if (n) {
        phrase += ` — ${t('{{n}} échéance(s) recalculée(s)', { n })}`;
      }
      return phrase;
    }
    case 'RENEWAL': {
      const date = formatDate(event.newEndDate);
      let phrase = t('Bail renouvelé jusqu’au {{date}}', { date });
      const n = event.details?.installmentsCreated;
      if (n) {
        phrase += ` — ${t('{{n}} échéance(s) créée(s)', { n })}`;
      }
      return phrase;
    }
    case 'AMENDMENT': {
      const date = formatDate(event.effectiveDate);
      return t('Avenant du {{date}} : {{summary}}', { date, summary: event.summary ?? '' });
    }
    case 'TERMINATION': {
      const date = formatDate(event.effectiveDate);
      const noticeDate = formatDate(event.noticeDate);
      const initiator = initiatorLabel(event.initiatedBy);
      let phrase = t('Bail résilié au {{date}}, {{initiator}} (préavis du {{noticeDate}})', {
        date,
        initiator,
        noticeDate
      });
      if (event.moveOutDate) {
        phrase += ` — ${t('sortie des lieux le {{date}}', { date: formatDate(event.moveOutDate) })}`;
      }
      return phrase;
    }
    default:
      return event.summary ?? '';
  }
}

interface LeaseEventTimelineProps {
  events: LeaseEvent[];
}

/**
 * Historique de la vie du bail, du plus récent au plus ancien.
 *
 * Le contrat (§A) rend déjà les événements dans cet ordre : pas de tri côté
 * client.
 */
export const LeaseEventTimeline: React.FC<LeaseEventTimelineProps> = ({ events }) => {
  if (events.length === 0) {
    return <Empty description={t('Aucun événement enregistré')} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const items = events.map(event => ({
    key: event.id,
    dot: (
      <span style={{ color: `var(--ant-${COLOR_BY_TYPE[event.type]}-6, inherit)` }}>{ICON_BY_TYPE[event.type]}</span>
    ),
    color: COLOR_BY_TYPE[event.type],
    children: (
      <div>
        <Text>{describeLeaseEvent(event)}</Text>
        <div style={{ marginTop: 2 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('Par {{name}}, le {{date}}', {
              name: event.createdByName ?? t('Système'),
              date: formatDate(event.createdAt)
            })}
          </Text>
        </div>
      </div>
    )
  }));

  return <Timeline items={items} />;
};
