import React, { useMemo, useState } from 'react';
import { Button, Card, Empty, Select, Space, Typography } from 'antd';
import { MeetingResolution, SyndicateLot, VoteChoice } from '../../types/syndic-types';
import { t } from '../../i18n/t';

const { Paragraph, Text, Title } = Typography;

interface MeetingAgendaProps {
  resolutions: MeetingResolution[];
  lots: SyndicateLot[];
  onVote: (resolutionId: string, lotId: string, vote: VoteChoice) => Promise<void>;
  voting?: boolean;
}

export const MeetingAgenda: React.FC<MeetingAgendaProps> = ({ resolutions, lots, onVote, voting = false }) => {
  const [selectedLotsByResolution, setSelectedLotsByResolution] = useState<Record<string, string>>({});

  // Hooks must run on every render: this useMemo sat after the early return
  // below, so the hook order changed as soon as resolutions became non-empty.
  const lotOptions = useMemo(
    () =>
      lots.map(lot => ({
        value: lot.id,
        label: `${lot.lotNumber} (${lot.lotType})`
      })),
    [lots]
  );

  if (resolutions.length === 0) {
    return <Empty description={t('Aucune resolution enregistree')} />;
  }

  const getSelectedLotId = (resolutionId: string) => selectedLotsByResolution[resolutionId] || lots[0]?.id;

  const handleSelectLot = (resolutionId: string, lotId: string) => {
    setSelectedLotsByResolution(prev => ({ ...prev, [resolutionId]: lotId }));
  };

  const handleVoteClick = async (resolutionId: string, vote: VoteChoice) => {
    const lotId = getSelectedLotId(resolutionId);
    if (!lotId) return;
    await onVote(resolutionId, lotId, vote);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {resolutions.map((resolution, index) => (
        <Card key={resolution.id}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Title level={5} style={{ margin: 0 }}>
              {t('Resolution')} {index + 1}: {resolution.title}
            </Title>
            {resolution.description ? <Paragraph type="secondary">{resolution.description}</Paragraph> : null}
            <Space>
              <Text type="secondary">Majorite:</Text>
              <Text>{resolution.majorityRule || t('Simple')}</Text>
            </Space>
            <Space>
              <Text type="secondary">Votes:</Text>
              <Text>
                {t('Pour')} {resolution.votesFor}
              </Text>
              <Text>
                {t('Contre')} {resolution.votesAgainst}
              </Text>
              <Text>
                {t('Abstention')} {resolution.votesAbstain}
              </Text>
            </Space>

            {lots.length > 0 ? (
              <Space wrap>
                <Text type="secondary">{t('Lot votant :')}</Text>
                <Select
                  size="small"
                  style={{ minWidth: 220 }}
                  value={getSelectedLotId(resolution.id)}
                  showSearch
                  optionFilterProp="label"
                  options={lotOptions}
                  onChange={value => handleSelectLot(resolution.id, value)}
                  disabled={voting}
                />
                <Button size="small" onClick={() => void handleVoteClick(resolution.id, 'FOR')} loading={voting}>
                  {t('Pour')}
                </Button>
                <Button size="small" onClick={() => void handleVoteClick(resolution.id, 'AGAINST')} loading={voting}>
                  {t('Contre')}
                </Button>
                <Button size="small" onClick={() => void handleVoteClick(resolution.id, 'ABSTAIN')} loading={voting}>
                  {t('Abstention')}
                </Button>
              </Space>
            ) : (
              <Text type="secondary">{t('Aucun lot disponible pour voter.')}</Text>
            )}
          </Space>
        </Card>
      ))}
    </Space>
  );
};
