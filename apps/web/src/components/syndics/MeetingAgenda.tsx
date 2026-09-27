import React, { useMemo, useState } from 'react';
import { Button, Card, Empty, Select, Space, Tag, Typography } from 'antd';
import { MeetingLot, MeetingProxy, MeetingResolution, VoteChoice } from '../../types/syndic-types';
import {
  contactName,
  majorityRuleHint,
  majorityRuleLabel,
  normalizeMajorityRule,
  proxyForLot
} from './meeting-governance';
import { t } from '../../i18n/t';

const { Paragraph, Text, Title } = Typography;

interface MeetingAgendaProps {
  resolutions: MeetingResolution[];
  lots: MeetingLot[];
  onVote: (resolutionId: string, lotId: string, vote: VoteChoice) => Promise<void>;
  voting?: boolean;
  /** Pouvoirs de l'AG : affiches pour information a la saisie des votes. */
  proxies?: MeetingProxy[];
  /** AG cloturee ou annulee : votes figes, plus de saisie. */
  readOnly?: boolean;
  readOnlyReason?: string;
}

export const MeetingAgenda: React.FC<MeetingAgendaProps> = ({
  resolutions,
  lots,
  onVote,
  voting = false,
  proxies = [],
  readOnly = false,
  readOnlyReason
}) => {
  const [selectedLotsByResolution, setSelectedLotsByResolution] = useState<Record<string, string>>({});
  const voteLabels: Record<VoteChoice, string> = {
    FOR: t('Pour'),
    AGAINST: t('Contre'),
    ABSTAIN: t('Abstention')
  };

  // Hooks must run on every render: this useMemo sat after the early return
  // below, so the hook order changed as soon as resolutions became non-empty.
  const lotOptions = useMemo(
    () =>
      lots.map(lot => {
        const proxy = proxyForLot(lot, proxies);
        const base = `${lot.lotNumber} (${lot.lotType}) · ${lot.generalShares} ${t('tantièmes')}`;
        return {
          value: lot.id,
          label: proxy
            ? `${base} · ${t('représenté par {{name}}', { name: contactName(proxy.representative) })}`
            : base
        };
      }),
    [lots, proxies]
  );
  const lotsById = useMemo(() => new Map(lots.map(lot => [lot.id, lot])), [lots]);

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
      {readOnly ? <Text type="secondary">{readOnlyReason || t('Séance clôturée : les votes sont figés.')}</Text> : null}
      {proxies.length > 0 ? (
        <Space wrap>
          <Text type="secondary">{t('Pouvoirs :')}</Text>
          {proxies.map(proxy => (
            <Tag key={proxy.id}>
              {t('{{grantor}} représenté par {{representative}}', {
                grantor: contactName(proxy.grantor),
                representative: contactName(proxy.representative)
              })}
            </Tag>
          ))}
        </Space>
      ) : null}
      {resolutions.map((resolution, index) => {
        const rule = resolution.tally?.rule ?? normalizeMajorityRule(resolution.majorityRule);
        const selectedProxy = proxyForLot(lotsById.get(getSelectedLotId(resolution.id) ?? ''), proxies);
        return (
          <Card key={resolution.id}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Title level={5} style={{ margin: 0 }}>
                {t('Resolution')} {index + 1}: {resolution.title}
              </Title>
              {resolution.description ? <Paragraph type="secondary">{resolution.description}</Paragraph> : null}
              <Space wrap>
                <Text type="secondary">{t('Règle de majorité :')}</Text>
                <Text>{majorityRuleLabel(rule)}</Text>
                <Text type="secondary">({majorityRuleHint(rule)})</Text>
              </Space>
              <Space wrap>
                <Text type="secondary">{t('Votes (lots) :')}</Text>
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
              {resolution.tally ? (
                <Space wrap>
                  <Text type="secondary">{t('Tantièmes :')}</Text>
                  <Text>
                    {t('pour {{for}} · contre {{against}} · abstention {{abstain}} · référence {{reference}}', {
                      for: resolution.tally.sharesFor,
                      against: resolution.tally.sharesAgainst,
                      abstain: resolution.tally.sharesAbstain,
                      reference: resolution.tally.referenceShares
                    })}
                  </Text>
                </Space>
              ) : null}
              {(resolution.votes || []).length > 0 ? (
                <Space wrap>
                  {(resolution.votes || []).map(vote => {
                    const lot = lotsById.get(vote.lotId);
                    const proxy = proxyForLot(lot, proxies);
                    return (
                      <Tag key={vote.id}>
                        {lot?.lotNumber ?? vote.lotId} : {voteLabels[vote.vote]}
                        {proxy ? ` (${t('représenté')})` : ''}
                      </Tag>
                    );
                  })}
                </Space>
              ) : null}

              {readOnly ? null : lots.length > 0 ? (
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
                  {selectedProxy ? (
                    <Tag color="purple">
                      {t('Pouvoir : représenté par {{name}}', { name: contactName(selectedProxy.representative) })}
                    </Tag>
                  ) : null}
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
        );
      })}
    </Space>
  );
};
