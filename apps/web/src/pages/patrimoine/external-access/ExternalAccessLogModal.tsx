import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listExternalAccessLog } from '../../../services/external-access-service';
import type { ExternalAccessGrantSummary, ExternalAccessLogEntry } from '../../../types/external-access';
import { StateBlock, SkeletonList, Table } from '../../../components/primitives';
import { activeLocale } from '../../../i18n/format';
import { queryKey } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { accessLogActionLabel, accessSectionLabel } from './external-access-labels';

const { Text } = Typography;

/** Préfixe d'URL de la barre du journal (la page « Accès partagés » porte déjà ses propres clés). */
const LOG_PREFIX = 'jrn';

// Accesseurs stables (hors composant). Le champ libre cherche ce que le tableau affiche :
// l'événement, le document ou les rubriques, l'adresse IP.
const TEXTE_RECHERCHE = [
  (e: ExternalAccessLogEntry) => accessLogActionLabel(e.action),
  (e: ExternalAccessLogEntry) => e.documentName,
  (e: ExternalAccessLogEntry) => (e.sections ?? []).map(accessSectionLabel),
  (e: ExternalAccessLogEntry) => e.ipAddress
];
const ACCESSEURS = {
  evenement: (e: ExternalAccessLogEntry) => e.action,
  date: (e: ExternalAccessLogEntry) => e.at
};

interface Props {
  tenantId: string;
  grant: ExternalAccessGrantSummary | null;
  onClose: () => void;
}

/** Journal des consultations, téléchargements et envois d'un accès. */
export const ExternalAccessLogModal: React.FC<Props> = ({ tenantId, grant, onClose }) => {
  const [, setSearchParams] = useSearchParams();
  const logQuery = useQuery({
    queryKey: queryKey('external-access-log', tenantId, { grantId: grant?.id }),
    queryFn: () => listExternalAccessLog(tenantId, grant?.id as string),
    enabled: grant !== null,
    // Un journal se relit à chaque ouverture : il n'est jamais « frais ».
    staleTime: 0
  });

  // Options tirées des événements réellement journalisés (une valeur inconnue s'affiche telle quelle).
  const actionOptions = useMemo(
    () =>
      Array.from(new Set((logQuery.data ?? []).map(entry => entry.action))).map(action => ({
        value: action,
        label: accessLogActionLabel(action)
      })),
    [logQuery.data]
  );
  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Événement, document, rubrique, adresse IP…')
    },
    { key: 'evenement', type: 'multiSelect', label: t('Événement'), primary: true, options: actionOptions },
    { key: 'date', type: 'dateRange', label: t('Date') }
  ];
  const local = useLocalListSearch<ExternalAccessLogEntry>(logQuery.data, {
    paramPrefix: LOG_PREFIX,
    ariaLabel: t('Rechercher dans le journal'),
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  // À la fermeture, les clés `jrn.*` ne restent pas dans l'adresse de la page.
  const close = () => {
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        for (const key of Array.from(next.keys())) {
          if (key.startsWith(`${LOG_PREFIX}.`)) next.delete(key);
        }
        return next;
      },
      { replace: true }
    );
    onClose();
  };

  return (
    <Modal
      open={grant !== null}
      width={760}
      title={grant ? t('Journal — {{name}}', { name: grant.recipientName }) : ''}
      onCancel={close}
      footer={null}
      destroyOnHidden
    >
      {logQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger le journal.')}
          actions={[{ label: t('Réessayer'), onClick: () => logQuery.refetch(), primary: true }]}
        />
      ) : logQuery.isPending ? (
        <SkeletonList rows={4} aria-label={t('Journal en cours de chargement')} />
      ) : (logQuery.data ?? []).length === 0 ? (
        <StateBlock variant="empty" description={t('Aucune consultation pour le moment.')} />
      ) : (
        <>
          <Text type="secondary" style={{ display: 'block', marginBlockEnd: 8 }}>
            {t('Recherche sur les 100 derniers événements.')}
          </Text>
          <Table<ExternalAccessLogEntry>
            {...local.tableProps}
            aria-label={t('Journal des consultations')}
            exportFilename={t('Journal — {{name}}', { name: grant?.recipientName ?? '' })}
            exportFetchAll={local.exportAll}
            size="small"
            rowKey="id"
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: t('Date'),
                dataIndex: 'at',
                render: (value: string) => new Date(value).toLocaleString(activeLocale())
              },
              {
                title: t('Événement'),
                dataIndex: 'action',
                render: (value: string) => <Tag>{accessLogActionLabel(value)}</Tag>
              },
              {
                title: t('Détail'),
                render: (_: unknown, entry) =>
                  entry.documentName ? (
                    <Text>{entry.documentName}</Text>
                  ) : entry.sections && entry.sections.length > 0 ? (
                    <Text>{entry.sections.map(accessSectionLabel).join(', ')}</Text>
                  ) : (
                    '—'
                  )
              },
              {
                title: t('Adresse IP'),
                dataIndex: 'ipAddress',
                render: (value: string | null) => (value ? <bdi dir="ltr">{value}</bdi> : '—')
              }
            ]}
          />
        </>
      )}
    </Modal>
  );
};
