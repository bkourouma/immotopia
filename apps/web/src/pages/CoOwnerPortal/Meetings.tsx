import React, { useState } from 'react';
import { App, Alert, Button, Card, Col, Descriptions, Drawer, List, Radio, Row, Space, Tag, Typography } from 'antd';
import { CalendarOutlined, EnvironmentOutlined, RightOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { SkeletonList, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';
import {
  castMyVote,
  listMyMeetings,
  type CoOwnerMeeting,
  type CoOwnerResolution,
  type CoOwnerVoteChoice
} from '../../services/coowner-portal-service';
import { majorityRuleLabel, meetingStatusLabel, meetingTypeLabel, ResolutionResultTag, voteLabel } from './labels';
import { portalErrorMessage } from './portal-error';

const { Title, Text, Paragraph } = Typography;

const MEETINGS_KEY = ['coowner-portal', 'meetings'];
const VOTE_CHOICES: CoOwnerVoteChoice[] = ['FOR', 'AGAINST', 'ABSTAIN'];

/**
 * Assemblées générales des copropriétés du copropriétaire, en cartes de deux
 * par ligne : date, lieu, état, et un bouton qui ouvre le détail (ordre du
 * jour, résolutions). Tant que l'assemblée est ouverte, le copropriétaire y
 * vote pour ses lots, résolution par résolution, et peut changer d'avis ;
 * une fois clôturée, le détail porte le résultat de chaque résolution (règle
 * de majorité, tantièmes, statut). Seuls les totaux sont rendus par l'API —
 * jamais le vote d'un autre lot que les siens.
 */
const isOpen = (meeting: CoOwnerMeeting) => meeting.status === 'PLANNED' || meeting.status === 'IN_PROGRESS';

const canVote = (meeting: CoOwnerMeeting) =>
  isOpen(meeting) && meeting.votableLots.length > 0 && meeting.resolutions.length > 0;

const statusColor = (meeting: CoOwnerMeeting) =>
  meeting.status === 'COMPLETED'
    ? 'green'
    : meeting.status === 'CANCELLED'
      ? 'default'
      : meeting.status === 'IN_PROGRESS'
        ? 'orange'
        : 'blue';

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

function VotableResolution({ meeting, resolution }: { meeting: CoOwnerMeeting; resolution: CoOwnerResolution }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const vote = useMutation({
    mutationFn: (input: { lotId: string; choice: CoOwnerVoteChoice }) =>
      castMyVote(resolution.id, input.lotId, input.choice),
    onSuccess: () => {
      message.success(t('Vote enregistré'));
      void queryClient.invalidateQueries({ queryKey: MEETINGS_KEY });
    },
    onError: error => message.error(portalErrorMessage(error, t("Impossible d'enregistrer le vote.")))
  });

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Text strong>{resolution.title}</Text>
      {resolution.description ? <Paragraph style={{ marginBottom: 0 }}>{resolution.description}</Paragraph> : null}
      <Text type="secondary">{majorityRuleLabel(resolution.rule)}</Text>
      {meeting.votableLots.map(lot => {
        const current = resolution.myVotes.find(myVote => myVote.lotId === lot.lotId)?.vote;
        return (
          <Space key={lot.lotId} wrap align="center">
            <Text>{t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber })}</Text>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              value={current}
              disabled={vote.isPending}
              aria-label={t('Votre vote pour le lot {{lotNumber}}', { lotNumber: lot.lotNumber })}
              onChange={event => vote.mutate({ lotId: lot.lotId, choice: event.target.value as CoOwnerVoteChoice })}
              options={VOTE_CHOICES.map(choice => ({ value: choice, label: voteLabel(choice) }))}
            />
          </Space>
        );
      })}
    </Space>
  );
}

function MeetingDetail({ meeting }: { meeting: CoOwnerMeeting }) {
  const open = isOpen(meeting);
  const voting = canVote(meeting);
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Descriptions size="small" column={1}>
        <Descriptions.Item label={t('Copropriété')}>{meeting.syndicate ?? '—'}</Descriptions.Item>
        <Descriptions.Item label={t('Date')}>{dayjs(meeting.scheduledAt).format('DD/MM/YYYY HH:mm')}</Descriptions.Item>
        <Descriptions.Item label={t('Lieu')}>{meeting.location || t('Non précisé')}</Descriptions.Item>
        <Descriptions.Item label={t('Statut')}>
          <Tag color={statusColor(meeting)}>{meetingStatusLabel(meeting.status)}</Tag>
        </Descriptions.Item>
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

      {open && meeting.resolutions.length > 0 ? (
        <div>
          <Text strong>{t('Résolutions soumises au vote')}</Text>
          {voting ? (
            <Alert
              style={{ marginBlock: 8 }}
              type="info"
              showIcon
              message={t("Choisissez Pour, Contre ou Abstention. Vous pouvez modifier votre vote jusqu'à la clôture.")}
            />
          ) : (
            <Alert
              style={{ marginBlock: 8 }}
              type="warning"
              showIcon
              message={t("Vous n'êtes pas désigné pour voter à cette assemblée.")}
            />
          )}
          <List
            dataSource={meeting.resolutions}
            rowKey={resolution => resolution.id}
            renderItem={resolution => (
              <List.Item>
                {voting ? (
                  <VotableResolution meeting={meeting} resolution={resolution} />
                ) : (
                  <Space direction="vertical" size={4}>
                    <Text strong>{resolution.title}</Text>
                    {resolution.description ? <Text type="secondary">{resolution.description}</Text> : null}
                  </Space>
                )}
              </List.Item>
            )}
          />
        </div>
      ) : null}

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
  );
}

function MeetingCard({ meeting, onOpen }: { meeting: CoOwnerMeeting; onOpen: () => void }) {
  const voting = canVote(meeting);
  const voted =
    voting && meeting.resolutions.every(resolution => resolution.myVotes.length >= meeting.votableLots.length);
  return (
    <Card
      hoverable
      style={{ height: '100%' }}
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12, height: '100%' } }}
      onClick={onOpen}
    >
      <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start">
        <Text strong>{meetingTypeLabel(meeting.type)}</Text>
        <Tag color={statusColor(meeting)} style={{ marginInlineEnd: 0 }}>
          {meetingStatusLabel(meeting.status)}
        </Tag>
      </Space>
      <Space direction="vertical" size={4}>
        <Text>
          <CalendarOutlined aria-hidden /> {dayjs(meeting.scheduledAt).format('DD/MM/YYYY HH:mm')}
        </Text>
        <Text type="secondary">{meeting.syndicate ?? '—'}</Text>
        <Text type="secondary">
          <EnvironmentOutlined aria-hidden /> {meeting.location || t('Non précisé')}
        </Text>
      </Space>
      <Space wrap size={4}>
        <Tag>{t('{{count}} point(s) à l’ordre du jour', { count: meeting.agenda.length })}</Tag>
        {meeting.resolutions.length > 0 ? (
          <Tag>{t('{{count}} résolution(s)', { count: meeting.resolutions.length })}</Tag>
        ) : null}
        {voting ? <Tag color={voted ? 'green' : 'gold'}>{voted ? t('Vote enregistré') : t('Vote à faire')}</Tag> : null}
      </Space>
      <div style={{ marginTop: 'auto' }}>
        <Button
          type={voting && !voted ? 'primary' : 'default'}
          icon={<RightOutlined />}
          iconPosition="end"
          onClick={event => {
            event.stopPropagation();
            onOpen();
          }}
        >
          {voting && !voted ? t('Voter') : t('Voir le détail')}
        </Button>
      </div>
    </Card>
  );
}

export default function CoOwnerMeetings() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    data: meetings,
    isPending,
    error,
    refetch
  } = useQuery({
    queryKey: MEETINGS_KEY,
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

  const selected = meetings.find(meeting => meeting.id === selectedId) ?? null;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2}>{t('Assemblées générales')}</Title>
        <Text type="secondary">
          {t('Convocations, ordre du jour, vote des résolutions et résultats pour vos copropriétés.')}
        </Text>
      </div>
      {meetings.length === 0 ? (
        <StateBlock variant="empty" description={t("Aucune assemblée générale n'est programmée.")} />
      ) : (
        <Row gutter={[16, 16]}>
          {meetings.map(meeting => (
            <Col key={meeting.id} xs={24} lg={12}>
              <MeetingCard meeting={meeting} onOpen={() => setSelectedId(meeting.id)} />
            </Col>
          ))}
        </Row>
      )}
      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        width="min(640px, 100vw)"
        title={selected ? meetingTypeLabel(selected.type) : ''}
        destroyOnClose
      >
        {selected ? <MeetingDetail meeting={selected} /> : null}
      </Drawer>
    </Space>
  );
}
