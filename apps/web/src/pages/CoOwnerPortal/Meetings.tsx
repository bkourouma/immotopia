import React, { useState } from 'react';
import { Alert, Button, Card, Descriptions, List, Pagination, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ListSearch, SkeletonList, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';
import {
  listMyMeetings,
  requestLiveAccess,
  type CoOwnerMeeting,
  type CoOwnerResolution
} from '../../services/coowner-portal-service';
import { majorityRuleLabel, meetingStatusLabel, meetingTypeLabel, ResolutionResultTag, voteLabel } from './labels';
import { portalErrorMessage } from './portal-error';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';

const { Title, Text, Paragraph } = Typography;

// Champ libre : type d'assemblée, copropriété, lieu et ordre du jour. Constantes de module : filtrage mémoïsé.
const TEXTE_RECHERCHE = [
  (meeting: CoOwnerMeeting) => meetingTypeLabel(meeting.type),
  (meeting: CoOwnerMeeting) => meeting.syndicate,
  (meeting: CoOwnerMeeting) => meeting.location,
  (meeting: CoOwnerMeeting) => meeting.agenda.map(item => item.title)
];
const ACCESSEURS = {
  status: (meeting: CoOwnerMeeting) => meeting.status,
  date: (meeting: CoOwnerMeeting) => meeting.scheduledAt
};

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

/** Le lien reçu du serveur n'est suivi que s'il est en http(s) : jamais `javascript:` ni `data:`. */
function isNavigableLiveUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Bouton « Rejoindre l'AG en direct » : délivre le lien personnel puis y navigue. */
function JoinLiveButton({ meetingId }: { meetingId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await requestLiveAccess(meetingId);
      if (!isNavigableLiveUrl(url)) throw new Error('invalid-url');
      window.location.assign(url);
    } catch (err) {
      setError(portalErrorMessage(err, t("Impossible de rejoindre l'assemblée en direct pour le moment.")));
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Button type="primary" loading={loading} onClick={() => void join()}>
        {t("Rejoindre l'AG en direct")}
      </Button>
      {error ? <Alert type="error" showIcon message={error} /> : null}
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

        {meeting.liveAvailable ? <JoinLiveButton meetingId={meeting.id} /> : null}

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
    staleTime: 30_000,
    queryFn: () => listMyMeetings()
  });

  // Déclarés dans le corps : les libellés se retraduisent au changement de langue.
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Type, copropriété, lieu, ordre du jour…')
    },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: (['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const).map(status => ({
        value: status,
        label: meetingStatusLabel(status)
      }))
    },
    { key: 'date', type: 'dateRange', label: t('Date'), primary: true }
  ];
  const local = useLocalListSearch<CoOwnerMeeting>(meetings, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
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
        <>
          <ListSearch {...local.searchProps} />
          {local.total === 0 ? (
            <StateBlock
              variant="no-results"
              description={t('Aucun élément ne correspond aux filtres appliqués.')}
              actions={[{ label: t('Effacer les critères'), onClick: local.clear, primary: true }]}
            />
          ) : (
            local.pageItems.map(meeting => <MeetingCard key={meeting.id} meeting={meeting} />)
          )}
          {local.total > local.pageSize ? (
            <Pagination
              current={local.page}
              pageSize={local.pageSize}
              total={local.total}
              showSizeChanger={false}
              onChange={(nextPage, nextSize) => local.dataViewProps.onPageChange(nextPage, nextSize)}
              style={{ alignSelf: 'center' }}
            />
          ) : null}
        </>
      )}
    </Space>
  );
}
