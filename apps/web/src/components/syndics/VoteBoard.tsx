import React, { useMemo } from 'react';
import { Button, Card, Col, Popconfirm, Progress, Row, Statistic, Tag, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Table } from '../primitives';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { MeetingAttendance, MeetingResolution } from '../../types/syndic-types';
import { majorityRuleLabel, normalizeMajorityRule } from './meeting-governance';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';

const { Text } = Typography;

interface VoteBoardProps {
  quorum: number | string | null | undefined;
  resolutions: MeetingResolution[];
  /** Tantiemes representes sur le total, calcules par l'API. */
  attendance?: MeetingAttendance;
  /** AG cloturee ou annulee : la decision est affichee meme si un vote est reste ouvert. */
  frozen?: boolean;
  /**
   * Suppression d'une résolution : l'action n'apparaît que si ce gestionnaire est fourni, que l'AG
   * n'est pas figée et que la résolution n'a ni vote ouvert ni vote saisi.
   */
  onDeleteResolution?: (resolutionId: string) => Promise<void> | void;
  /** Résolution en cours de suppression (bouton en chargement). */
  deletingResolutionId?: string | null;
}

/** Une résolution n'est supprimable que tant qu'aucun vote n'a été ouvert ni saisi. */
export function canDeleteResolution(resolution: MeetingResolution): boolean {
  const status = resolution.voteStatus ?? 'PENDING';
  const hasVotes =
    (resolution.votes?.length ?? 0) > 0 || resolution.votesFor + resolution.votesAgainst + resolution.votesAbstain > 0;
  return status === 'PENDING' && !hasVotes;
}

/** « 2 lots · 300 tantièmes » : nombre de lots et poids en tantiemes. */
function formatCount(lots: number, shares?: number) {
  if (shares === undefined) return String(lots);
  return t('{{lots}} lot(s) · {{shares}} tantièmes', { lots, shares });
}

// Recherche LOCALE (résolutions reçues en entier, préfixe d'URL « vb »). Le filtre ne change que
// l'AFFICHAGE : ni décompte, ni quorum, ni résultat ne sont recalculés.
const TEXTE_RECHERCHE = [(resolution: MeetingResolution) => resolution.title];

export const VoteBoard: React.FC<VoteBoardProps> = ({
  quorum,
  resolutions,
  attendance,
  frozen = false,
  onDeleteResolution,
  deletingResolutionId = null
}) => {
  const rawQuorum = typeof quorum === 'number' ? quorum : Number(quorum);
  const storedQuorum = Number.isFinite(rawQuorum) ? rawQuorum : 0;
  const quorumPercent = Number((attendance ? attendance.quorumPercent : storedQuorum).toFixed(2));
  const resultLabels: Record<string, string> = {
    PENDING: t('En attente'),
    APPROVED: t('Approuvée'),
    REJECTED: t('Rejetée'),
    DEFERRED: t('Reportée')
  };
  const resultColors: Record<string, string> = { APPROVED: 'green', REJECTED: 'red', DEFERRED: 'orange' };

  // Le critère « Résultat » porte sur la valeur AFFICHÉE dans la colonne : « Vote en cours » masque
  // la décision provisoire tant que l'AG n'est pas figée.
  const searchAccessors = useMemo(
    () => ({
      result: (resolution: MeetingResolution) =>
        !frozen && resolution.voteStatus === 'OPEN' ? 'OPEN' : (resolution.result ?? 'PENDING')
    }),
    [frozen]
  );
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Titre de la résolution…')
    },
    {
      key: 'result',
      type: 'multiSelect',
      label: t('Résultat'),
      primary: true,
      options: [
        { value: 'OPEN', label: t('Vote en cours') },
        { value: 'PENDING', label: resultLabels.PENDING },
        { value: 'APPROVED', label: resultLabels.APPROVED },
        { value: 'REJECTED', label: resultLabels.REJECTED },
        { value: 'DEFERRED', label: resultLabels.DEFERRED }
      ]
    }
  ];
  const local = useLocalListSearch<MeetingResolution>(resolutions, {
    paramPrefix: 'vb',
    ariaLabel: t('Rechercher dans les résolutions'),
    defaultPageSize: 8,
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: searchAccessors
  });

  const columns: ColumnsType<MeetingResolution> = [
    {
      title: t('Résolution'),
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: t('Règle'),
      key: 'rule',
      render: (_: unknown, resolution) =>
        majorityRuleLabel(resolution.tally?.rule ?? normalizeMajorityRule(resolution.majorityRule))
    },
    {
      title: t('Pour'),
      key: 'for',
      render: (_: unknown, resolution) => formatCount(resolution.votesFor, resolution.tally?.sharesFor)
    },
    {
      title: t('Contre'),
      key: 'against',
      render: (_: unknown, resolution) => formatCount(resolution.votesAgainst, resolution.tally?.sharesAgainst)
    },
    {
      title: t('Abstention'),
      key: 'abstain',
      render: (_: unknown, resolution) => formatCount(resolution.votesAbstain, resolution.tally?.sharesAbstain)
    },
    {
      title: t('Total de référence'),
      key: 'reference',
      render: (_: unknown, resolution) =>
        resolution.tally ? t('{{shares}} tantièmes', { shares: resolution.tally.referenceShares }) : '-'
    },
    {
      title: t('Résultat'),
      key: 'result',
      // Resultat enregistre (recalcule a chaque vote et fige a la cloture).
      render: (_: unknown, resolution) => {
        // Vote ouvert : la decision provisoire est masquee, seuls les decomptes restent visibles.
        if (!frozen && resolution.voteStatus === 'OPEN') return <Tag color="blue">{t('Vote en cours')}</Tag>;
        const value = resolution.result ?? 'PENDING';
        return <Tag color={resultColors[value]}>{resultLabels[value] || value}</Tag>;
      }
    }
  ];

  if (onDeleteResolution && !frozen) {
    columns.push({
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, resolution) =>
        canDeleteResolution(resolution) ? (
          <Popconfirm
            title={t('Supprimer cette résolution ?')}
            okText={t('Supprimer')}
            cancelText={t('Annuler')}
            okButtonProps={{ danger: true }}
            onConfirm={() => onDeleteResolution(resolution.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deletingResolutionId === resolution.id}>
              {t('Supprimer')}
            </Button>
          </Popconfirm>
        ) : null
    });
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Card>
          <Statistic
            title={<HelpSectionTitle title={t('Quorum')} helpId="syndic.assemblees.detail.quorum" />}
            value={quorumPercent}
            suffix="%"
          />
          <Progress percent={Math.min(100, Math.max(0, quorumPercent))} />
          {attendance ? (
            <Text type="secondary">
              {t('{{represented}} / {{total}} tantièmes représentés', {
                represented: attendance.representedShares,
                total: attendance.totalShares
              })}
            </Text>
          ) : null}
        </Card>
      </Col>
      <Col xs={24} md={16}>
        <Card title={t('Résultats des résolutions')}>
          <Table<MeetingResolution>
            helpId="syndic.assemblees.detail.resultats"
            {...local.tableProps}
            aria-label={t('Résultats des résolutions')}
            exportFilename={t('Resultats des resolutions')}
            exportFetchAll={local.exportAll}
            scroll={{ x: 'max-content' }}
            rowKey="id"
            columns={columns}
            pagination={{ ...local.tableProps.pagination, hideOnSinglePage: true, showSizeChanger: false }}
            locale={local.isFiltered ? undefined : { emptyText: t('Aucun vote enregistré') }}
          />
        </Card>
      </Col>
    </Row>
  );
};
