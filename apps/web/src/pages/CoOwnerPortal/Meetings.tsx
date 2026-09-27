import React from 'react';
import { Card, Descriptions, List, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { SkeletonList, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';
import { listMyMeetings, type CoOwnerMeeting, type CoOwnerResolution } from '../../services/coowner-portal-service';
import { majorityRuleLabel, meetingStatusLabel, meetingTypeLabel, ResolutionResultTag, voteLabel } from './labels';
import { portalErrorMessage } from './portal-error';

const { Title, Text, Paragraph } = Typography;

/**
 * Assemblées générales des copropriétés du copropriétaire : date, lieu,
 * ordre du jour ; une fois l'assemblée clôturée, le résultat de chaque
 * résolution (règle de majorité, tantièmes, statut). Seuls les totaux sont
 * rendus par l'API — jamais le vote d'un autre lot que les siens.
 */
function ResolutionResult({ resolution }: { resolution: CoOwnerResolution }) {
  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <Space wrap>
        <Text strong>{resolution.title}</Text>
        <ResolutionResultTag result={resolution.result} />
      </Space>
      {resolution.description ? <Paragraph style={{ marginBottom: 0 }}>{resolution.description}</Paragraph> : null}
      <Descriptions size="small" column={1}>
        <Descriptions.Item label={t('Règle')}>{majorityRuleLabel(resolution.rule)}</Descriptions.Item>
        <Descriptions.Item label={t('Tantièmes')}>
          {t('Pour {{for}} · Contre {{against}} · Abstention {{abstain}} — sur {{total}}', {
            for: resolution.sharesFor,
            against: resolution.sharesAgainst,
            abstain: resolution.sharesAbstain,
            total: resolution.totalShares
          })}
        </Descriptions.Item>
        {resolution.myVotes.length > 0 ? (
          <Descriptions.Item label={t('Votre vote')}>
            {resolution.myVotes
              .map(vote => t('Lot {{lotNumber}} : {{vote}}', { lotNumber: vote.lotNumber, vote: voteLabel(vote.vote) }))
              .join(' · ')}
          </Descriptions.Item>
        ) : null}
      </Descriptions>
    </Space>
  );
}

function MeetingCard({ meeting }: { meeting: CoOwnerMeeting }) {
  return (
    <Card
      title={`${meetingTypeLabel(meeting.type)} — ${dayjs(meeting.scheduledAt).format('DD/MM/YYYY HH:mm')}`}
      extra={
        <Tag color={meeting.status === 'COMPLETED' ? 'green' : meeting.status === 'CANCELLED' ? 'default' : 'blue'}>
          {meetingStatusLabel(meeting.status)}
        </Tag>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions size="small" column={1}>
          <Descriptions.Item label={t('Copropriété')}>{meeting.syndicate ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Lieu')}>{meeting.location || t('Non précisé')}</Descriptions.Item>
        </Descriptions>

        <div>
          <Text strong>{t('Ordre du jour')}</Text>
          {meeting.agenda.length === 0 ? (
            <div>
              <Text type="secondary">{t("L'ordre du jour n'est pas encore publié.")}</Text>
            </div>
          ) : (
            <ol style={{ marginBlock: 8, paddingInlineStart: 20 }}>
              {meeting.agenda.map(item => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ol>
          )}
        </div>

        {meeting.status === 'COMPLETED' ? (
          <div>
            <Text strong>{t('Résultats des résolutions')}</Text>
            {meeting.resolutions.length === 0 ? (
              <div>
                <Text type="secondary">{t("Aucune résolution n'a été soumise au vote.")}</Text>
              </div>
            ) : (
              <List
                dataSource={meeting.resolutions}
                rowKey={resolution => resolution.id}
                renderItem={resolution => (
                  <List.Item>
                    <ResolutionResult resolution={resolution} />
                  </List.Item>
                )}
              />
            )}
          </div>
        ) : null}
      </Space>
    </Card>
  );
}

export default function CoOwnerMeetings() {
  const {
    data: meetings,
    isPending,
    error,
    refetch
  } = useQuery({
    queryKey: ['coowner-portal', 'meetings'],
    queryFn: () => listMyMeetings()
  });

  if (isPending) return <SkeletonList rows={3} />;

  if (error || !meetings) {
    return (
      <StateBlock
        variant="error"
        description={portalErrorMessage(error, t('Impossible de charger les assemblées générales.'))}
        actions={[{ label: t('Réessayer'), onClick: () => void refetch(), primary: true }]}
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2}>{t('Assemblées générales')}</Title>
        <Text type="secondary">{t('Convocations, ordre du jour et résultats des votes de vos copropriétés.')}</Text>
      </div>
      {meetings.length === 0 ? (
        <StateBlock variant="empty" description={t("Aucune assemblée générale n'est programmée.")} />
      ) : (
        meetings.map(meeting => <MeetingCard key={meeting.id} meeting={meeting} />)
      )}
    </Space>
  );
}
