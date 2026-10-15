import React from 'react';
import { Button, Card, Popconfirm, Space, Tag, Typography } from 'antd';
import type { LiveResolutionRow } from '../../../types/syndic-live-types';
import { voteStatusColor, voteStatusLabel } from './live-labels';
import { majorityRuleHint, majorityRuleLabel, normalizeMajorityRule } from '../meeting-governance';
import { t } from '../../../i18n/t';

const { Paragraph, Text } = Typography;

interface LiveResolutionsPanelProps {
  resolutions: LiveResolutionRow[];
  totalLots: number;
  /** Les boutons Ouvrir / Clore ne servent qu'en séance. */
  canControlVotes: boolean;
  busyResolutionId: string | null;
  onOpen: (resolutionId: string) => void;
  onClose: (resolutionId: string) => void;
  onManualEntry: () => void;
  showManualEntry: boolean;
}

export const LiveResolutionsPanel: React.FC<LiveResolutionsPanelProps> = ({
  resolutions,
  totalLots,
  canControlVotes,
  busyResolutionId,
  onOpen,
  onClose,
  onManualEntry,
  showManualEntry
}) => {
  if (resolutions.length === 0) return <Text type="secondary">{t('Aucune resolution enregistree')}</Text>;
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {resolutions.map((resolution, index) => {
        const rule = normalizeMajorityRule(resolution.majorityRule ?? resolution.tally?.rule);
        const busy = busyResolutionId === resolution.id;
        return (
          <Card
            key={resolution.id}
            size="small"
            title={`${index + 1}. ${resolution.title}`}
            extra={<Tag color={voteStatusColor(resolution.voteStatus)}>{voteStatusLabel(resolution.voteStatus)}</Tag>}
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {resolution.description ? (
                <Paragraph style={{ marginBottom: 0 }}>{resolution.description}</Paragraph>
              ) : null}
              <Text type="secondary">
                {majorityRuleLabel(rule)} — {majorityRuleHint(rule)}
              </Text>
              <Text>
                {t('Participation : {{voted}} lot(s) sur {{total}}', {
                  voted: resolution.ballotCount,
                  total: totalLots
                })}
              </Text>
              <Text>
                {t(
                  'Pour {{for}} · Contre {{against}} · Abstention {{abstain}} (en tantièmes, référence {{reference}})',
                  {
                    for: resolution.tally.sharesFor,
                    against: resolution.tally.sharesAgainst,
                    abstain: resolution.tally.sharesAbstain,
                    reference: resolution.tally.referenceShares
                  }
                )}
              </Text>
              <Space wrap>
                {canControlVotes && resolution.voteStatus !== 'OPEN' ? (
                  <Button
                    type="primary"
                    size="small"
                    loading={busy}
                    disabled={busyResolutionId !== null}
                    onClick={() => onOpen(resolution.id)}
                  >
                    {resolution.voteStatus === 'CLOSED' ? t('Rouvrir le vote') : t('Ouvrir le vote')}
                  </Button>
                ) : null}
                {canControlVotes && resolution.voteStatus === 'OPEN' ? (
                  <Popconfirm
                    title={t('Clore le vote ?')}
                    description={t('Le résultat sera affiché aux copropriétaires connectés.')}
                    okText={t('Clore le vote')}
                    cancelText={t('Annuler')}
                    onConfirm={() => onClose(resolution.id)}
                  >
                    <Button danger size="small" loading={busy} disabled={busyResolutionId !== null}>
                      {t('Clore le vote')}
                    </Button>
                  </Popconfirm>
                ) : null}
                {showManualEntry ? (
                  <Button size="small" onClick={onManualEntry}>
                    {t('Saisir un vote')}
                  </Button>
                ) : null}
              </Space>
            </Space>
          </Card>
        );
      })}
    </Space>
  );
};
