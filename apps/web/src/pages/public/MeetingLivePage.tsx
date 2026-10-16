import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Grid, Progress, Result, Space, Spin, Tabs, Tag, Typography } from 'antd';
import {
  fetchPublicMeetingState,
  fetchPublicVisioToken,
  isSafeVideoUrl,
  joinPublicMeeting,
  setPublicHandRaised,
  votePublicMeeting
} from '../../services/public-meeting-live-service';
import type { LiveMeetingPublicView, PublicLiveResolution, VisioJoinInfo } from '../../types/syndic-live-types';
import type { VoteChoice } from '../../types/syndic-types';
import { LIVE_POLL_INTERVAL_MS, LIVE_POLL_RETRY_INTERVAL_MS, useVisiblePolling } from '../../hooks/useVisiblePolling';
import {
  attendanceLabel,
  clampPercent,
  formatDateTime,
  meetingTypeTitle,
  resultColor,
  resultLabel,
  VOTE_CHOICES,
  voteChoiceLabel,
  voteSourceLabel,
  voteStatusColor,
  voteStatusLabel
} from '../../components/syndics/live/live-labels';
import {
  majorityRuleHint,
  majorityRuleLabel,
  normalizeMajorityRule
} from '../../components/syndics/meeting-governance';
import { t } from '../../i18n/t';

const { Paragraph, Text, Title } = Typography;

// `livekit-client` pèse lourd : la salle n'est chargée qu'au clic sur « Rejoindre la visio ».
const MeetingVisioRoom = React.lazy(() => import('../../components/syndics/visio/MeetingVisioRoom'));

/** Clé de `sessionStorage` : permet à un rechargement de reprendre l'AG sans le fragment. */
export const MEETING_TOKEN_STORAGE_KEY = 'immotopia:meeting-live-token';
export { LIVE_POLL_INTERVAL_MS as MEETING_POLL_INTERVAL_MS };

type ViewState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; view: LiveMeetingPublicView };

function storeToken(token: string): void {
  try {
    window.sessionStorage.setItem(MEETING_TOKEN_STORAGE_KEY, token);
  } catch {
    // Stockage indisponible : le jeton reste en mémoire, un rechargement le perdra.
  }
}

function forgetToken(): void {
  try {
    window.sessionStorage.removeItem(MEETING_TOKEN_STORAGE_KEY);
  } catch {
    // Rien à effacer.
  }
}

/**
 * Lit le jeton dans le fragment (`#<jeton>`), le retire de la barre d'adresse et
 * le garde en mémoire (et en `sessionStorage` pour survivre à un rechargement).
 * Sans fragment, reprend le jeton mémorisé.
 */
function consumeToken(): string | null {
  const fromHash = window.location.hash.replace(/^#/, '').trim();
  if (fromHash) {
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    } catch {
      // Sans importance : le jeton est déjà lu.
    }
    storeToken(fromHash);
    return fromHash;
  }
  try {
    return window.sessionStorage.getItem(MEETING_TOKEN_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function installMeta(entries: Array<{ name: string; content: string }>): () => void {
  const created = entries.map(({ name, content }) => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    document.head.appendChild(meta);
    return meta;
  });
  return () => created.forEach(meta => meta.remove());
}

function isOver(view: LiveMeetingPublicView): boolean {
  return view.meeting.status === 'COMPLETED' || view.meeting.status === 'CANCELLED';
}

/** Garde la vue la plus récente (une lecture lente ne doit pas écraser un vote qui vient d'aboutir). */
function newest(previous: ViewState, next: LiveMeetingPublicView): LiveMeetingPublicView {
  if (
    previous.kind === 'ok' &&
    previous.view.serverTime &&
    next.serverTime &&
    previous.view.serverTime > next.serverTime
  ) {
    return previous.view;
  }
  return next;
}

/** Un vote est ouvert et au moins un de mes lots n'y a pas encore voté (pastille de l'onglet « Votes »). */
function hasPendingVote(view: LiveMeetingPublicView): boolean {
  if (view.meeting.status !== 'IN_PROGRESS' || !view.canVote) return false;
  return view.resolutions.some(
    resolution =>
      resolution.voteStatus === 'OPEN' &&
      view.myLots.some(lot => !resolution.myVotes.some(vote => vote.lotId === lot.lotId))
  );
}

function visioFailureMessage(result: { status: string; message?: string }): string {
  if (result.status === 'conflict') {
    return result.message || t("La visio n'est ouverte que pendant l'assemblée, une fois que vous l'avez rejointe.");
  }
  if (result.status === 'rate_limited') return t('Trop de tentatives, réessayez dans quelques instants.');
  if (result.status === 'unavailable') return t('La visio est momentanément indisponible, réessayez.');
  return t("Accès à la visio impossible. Votre lien n'est peut-être plus valide.");
}

/* -------------------------------------------------------------------- blocs */

const MeetingHeader: React.FC<{ view: LiveMeetingPublicView }> = ({ view }) => {
  const { meeting } = view;
  const over = meeting.status === 'COMPLETED' || meeting.status === 'CANCELLED';
  const videoUrl = !over && isSafeVideoUrl(meeting.videoConferenceUrl) ? meeting.videoConferenceUrl : null;
  return (
    <Card>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Text type="secondary">{meeting.syndicateName}</Text>
        <Title level={3} style={{ margin: 0 }}>
          {meetingTypeTitle(meeting.type)}
        </Title>
        <Text>{formatDateTime(meeting.scheduledAt)}</Text>
        {meeting.location ? <Text type="secondary">{meeting.location}</Text> : null}
        {videoUrl ? (
          <div style={{ marginBlockStart: 8 }}>
            <Button type="primary" size="large" block href={videoUrl} target="_blank" rel="noopener noreferrer">
              {t('Rejoindre la visioconférence')}
            </Button>
          </div>
        ) : null}
      </Space>
    </Card>
  );
};

const QuorumCard: React.FC<{ view: LiveMeetingPublicView }> = ({ view }) => {
  const { attendance } = view;
  return (
    <Card size="small" title={t('Quorum')}>
      <Progress percent={clampPercent(attendance.quorumPercent)} aria-label={t('Quorum')} />
      <Text type="secondary">
        {t('{{represented}} / {{total}} tantièmes représentés · {{lots}} / {{totalLots}} lots', {
          represented: attendance.representedShares,
          total: attendance.totalShares,
          lots: attendance.representedLots,
          totalLots: attendance.totalLots
        })}
      </Text>
    </Card>
  );
};

const MyLotsCard: React.FC<{ view: LiveMeetingPublicView }> = ({ view }) => (
  <Card size="small" title={t('Mes lots')}>
    {view.myLots.length === 0 ? (
      <Text type="secondary">{t("Aucun lot n'est associé à votre lien.")}</Text>
    ) : (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {view.myLots.map(lot => (
          <div key={lot.lotId} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Text strong>{t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber })}</Text>
            <Text type="secondary">{t('{{shares}} tantièmes', { shares: lot.generalShares })}</Text>
            {lot.role === 'PROXY' ? (
              <Tag color="purple">
                {lot.grantorName ? t('Représente {{name}}', { name: lot.grantorName }) : t('Représenté par pouvoir')}
              </Tag>
            ) : null}
            {lot.attendanceStatus ? (
              <Tag color={lot.attendanceStatus === 'ABSENT' ? 'default' : 'green'}>
                {attendanceLabel(lot.attendanceStatus)}
              </Tag>
            ) : null}
          </div>
        ))}
      </Space>
    )}
  </Card>
);

interface VoteNotice {
  lotIds: string[];
  vote: VoteChoice;
}

interface ResolutionCardProps {
  view: LiveMeetingPublicView;
  resolution: PublicLiveResolution;
  busy: boolean;
  /** Dernier vote envoyé depuis cette page : n'est confirmé que tant que le serveur le confirme. */
  notice: VoteNotice | null;
  onVote: (resolutionId: string, lotIds: string[], vote: VoteChoice) => void;
}

const ResolutionCard: React.FC<ResolutionCardProps> = ({ view, resolution, busy, notice, onVote }) => {
  const open = resolution.voteStatus === 'OPEN' && view.meeting.status === 'IN_PROGRESS';
  const voteByLot = new Map(resolution.myVotes.map(vote => [vote.lotId, vote]));
  // Un lot dont le vote a été saisi par le syndic ne peut plus être modifié par le copropriétaire.
  const lockedLotIds = new Set(resolution.myVotes.filter(vote => vote.source === 'MANAGER').map(vote => vote.lotId));
  const lockedLots = view.myLots.filter(lot => lockedLotIds.has(lot.lotId));
  const allLotIds = view.myLots.filter(lot => !lockedLotIds.has(lot.lotId)).map(lot => lot.lotId);
  const result = resolution.result;
  const votingAllowed = open && view.canVote;
  const rule = normalizeMajorityRule(resolution.majorityRule);
  // La confirmation reflète les votes actuels du serveur : elle disparaît si un vote a été écrasé.
  const confirmedNotice =
    notice !== null &&
    notice.lotIds.every(lotId => {
      const current = voteByLot.get(lotId);
      return current !== undefined && current.vote === notice.vote && current.source !== 'MANAGER';
    });

  return (
    <Card
      size="small"
      title={resolution.title}
      extra={<Tag color={voteStatusColor(resolution.voteStatus)}>{voteStatusLabel(resolution.voteStatus)}</Tag>}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {resolution.description ? <Paragraph style={{ marginBottom: 0 }}>{resolution.description}</Paragraph> : null}
        <Text type="secondary">
          {majorityRuleLabel(rule)} — {majorityRuleHint(rule)}
        </Text>

        {resolution.voteStatus === 'OPEN' ? (
          <Text type="secondary">
            {t('{{voted}} lot(s) sur {{total}} ont voté', {
              voted: resolution.ballotCount,
              total: resolution.totalLots
            })}
          </Text>
        ) : null}

        {result ? (
          <div role="group" aria-label={t('Résultat du vote')}>
            <Space wrap>
              <Tag color={resultColor(result.result)}>{resultLabel(result.result)}</Tag>
              <Text>
                {t('Pour {{for}} · Contre {{against}} · Abstention {{abstain}} — sur {{total}} tantièmes', {
                  for: result.sharesFor,
                  against: result.sharesAgainst,
                  abstain: result.sharesAbstain,
                  total: result.totalShares
                })}
              </Text>
            </Space>
          </div>
        ) : null}

        {resolution.myVotes.length > 0 ? (
          <Space direction="vertical" size={4}>
            {resolution.myVotes.map(vote => {
              const lot = view.myLots.find(item => item.lotId === vote.lotId);
              return (
                <Text key={vote.lotId} type="secondary">
                  {t('Lot {{lotNumber}} : {{vote}}', {
                    lotNumber: lot?.lotNumber ?? '',
                    vote: voteChoiceLabel(vote.vote)
                  })}
                  {vote.source === 'MANAGER' ? ` — ${voteSourceLabel(vote.source)}` : ''}
                </Text>
              );
            })}
          </Space>
        ) : null}

        {confirmedNotice && notice ? (
          <Alert
            type="success"
            showIcon
            message={t('Vote enregistré : {{vote}}', { vote: voteChoiceLabel(notice.vote) })}
          />
        ) : null}

        {open && lockedLots.length > 0 ? (
          <Alert
            type="info"
            showIcon
            message={t(
              'Le vote du lot {{lots}} a été saisi par le syndic : vous ne pouvez plus le modifier depuis cette page.',
              { lots: lockedLots.map(lot => lot.lotNumber).join(', ') }
            )}
          />
        ) : null}

        {open && !votingAllowed && !view.me.joined ? (
          <Alert type="info" showIcon message={t("Rejoignez l'assemblée pour voter.")} />
        ) : null}

        {votingAllowed ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong>{t('Pour tous mes lots')}</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBlockStart: 8 }}>
                {VOTE_CHOICES.map(choice => (
                  <Button
                    key={choice}
                    size="large"
                    style={{ flex: '1 1 30%', minWidth: 96 }}
                    loading={busy}
                    disabled={busy || allLotIds.length === 0}
                    onClick={() => onVote(resolution.id, allLotIds, choice)}
                  >
                    {voteChoiceLabel(choice)}
                  </Button>
                ))}
              </div>
            </div>
            {view.myLots.length > 1 ? (
              <div>
                <Text strong>{t('Lot par lot')}</Text>
                <Space direction="vertical" size={8} style={{ width: '100%', marginBlockStart: 8 }}>
                  {view.myLots.map(lot => {
                    const current = voteByLot.get(lot.lotId);
                    return (
                      <div key={lot.lotId} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <Text style={{ minWidth: 80 }}>{t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber })}</Text>
                        {VOTE_CHOICES.map(choice => (
                          <Button
                            key={choice}
                            size="small"
                            type={current?.vote === choice ? 'primary' : 'default'}
                            disabled={busy || lockedLotIds.has(lot.lotId)}
                            aria-label={t('Lot {{lotNumber}} : {{vote}}', {
                              lotNumber: lot.lotNumber,
                              vote: voteChoiceLabel(choice)
                            })}
                            onClick={() => onVote(resolution.id, [lot.lotId], choice)}
                          >
                            {voteChoiceLabel(choice)}
                          </Button>
                        ))}
                      </div>
                    );
                  })}
                </Space>
              </div>
            ) : null}
            {allLotIds.length > 0 ? (
              <Text type="secondary">{t('Vous pouvez modifier votre vote tant que le vote est ouvert.')}</Text>
            ) : null}
          </Space>
        ) : null}
      </Space>
    </Card>
  );
};

/* --------------------------------------------------------------------- page */

/**
 * Page publique « AG en direct » (spec 043). Le lien personnel porte le jeton
 * dans le fragment ; la page le retire de la barre d'adresse et l'envoie dans le
 * corps des requêtes. Interrogation toutes les 3 s, en pause quand l'onglet est
 * masqué, arrêtée quand l'assemblée est terminée ou le lien invalide.
 */
export const MeetingLivePage: React.FC = () => {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [stale, setStale] = useState(false);
  const [joining, setJoining] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, VoteNotice>>({});
  const [visioOn, setVisioOn] = useState(false);
  const [visioTab, setVisioTab] = useState<'visio' | 'votes'>('visio');
  const wide = Boolean(Grid.useBreakpoint().lg);
  const tokenRef = useRef<string | null | undefined>(undefined);
  const stateRef = useRef<ViewState>(state);
  stateRef.current = state;
  const joiningRef = useRef(false);
  const votingRef = useRef(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t('Assemblée générale en direct');
    const removeMeta = installMeta([
      { name: 'robots', content: t('noindex, nofollow') },
      { name: 'referrer', content: 'no-referrer' }
    ]);
    return () => {
      document.title = previousTitle;
      removeMeta();
    };
  }, []);

  const poll = useCallback(async (): Promise<number | false> => {
    // Le fragment n'est lu qu'une fois, dans l'effet : il survit ainsi au double montage de StrictMode.
    if (tokenRef.current === undefined) tokenRef.current = consumeToken();
    const token = tokenRef.current;
    if (!token) {
      setState({ kind: 'invalid' });
      return false;
    }
    const result = await fetchPublicMeetingState(token);
    if (result.status === 'ok') {
      setStale(false);
      setState(previous => ({ kind: 'ok', view: newest(previous, result.view) }));
      if (isOver(result.view)) {
        // L'assemblée est terminée : le jeton n'a plus d'usage, ne pas le garder en stockage.
        forgetToken();
        return false;
      }
      return LIVE_POLL_INTERVAL_MS;
    }
    if (result.status === 'invalid') {
      forgetToken();
      setState({ kind: 'invalid' });
      return false;
    }
    // Un 429 ou une panne passagère ne vident pas l'écran déjà obtenu.
    if (stateRef.current.kind === 'ok') setStale(true);
    else setState({ kind: result.status });
    return LIVE_POLL_RETRY_INTERVAL_MS;
  }, []);

  const { refresh } = useVisiblePolling(poll);

  const applyActionFailure = (status: string, message?: string) => {
    if (status === 'conflict') {
      setActionError(message || t("Le vote n'est plus ouvert ou l'assemblée n'est plus en cours."));
      refresh();
    } else if (status === 'rate_limited') {
      setActionError(t('Trop de tentatives, réessayez dans quelques instants.'));
    } else if (status === 'unavailable') {
      setActionError(t('Connexion impossible pour le moment, réessayez.'));
    } else {
      setActionError(t("Action impossible. Votre lien n'est peut-être plus valide."));
    }
  };

  const onJoin = async () => {
    const token = tokenRef.current;
    if (!token || joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    setActionError(null);
    const result = await joinPublicMeeting(token);
    joiningRef.current = false;
    setJoining(false);
    if (result.status === 'ok') {
      setState(previous => ({ kind: 'ok', view: newest(previous, result.view) }));
      return;
    }
    applyActionFailure(result.status, 'message' in result ? result.message : undefined);
  };

  const onVote = async (resolutionId: string, lotIds: string[], vote: VoteChoice) => {
    const token = tokenRef.current;
    if (!token || votingRef.current || lotIds.length === 0) return;
    votingRef.current = true;
    setVotingId(resolutionId);
    setActionError(null);
    const result = await votePublicMeeting(
      token,
      resolutionId,
      lotIds.map(lotId => ({ lotId, vote }))
    );
    votingRef.current = false;
    setVotingId(null);
    if (result.status === 'ok') {
      setState(previous => ({ kind: 'ok', view: newest(previous, result.view) }));
      setNotices(previous => ({ ...previous, [resolutionId]: { lotIds, vote } }));
      return;
    }
    applyActionFailure(result.status, 'message' in result ? result.message : undefined);
  };

  const getVisioToken = useCallback(async (): Promise<VisioJoinInfo> => {
    const token = tokenRef.current;
    if (!token) throw new Error(visioFailureMessage({ status: 'invalid' }));
    const result = await fetchPublicVisioToken(token);
    if (result.status === 'ok') return result.data;
    throw new Error(visioFailureMessage(result));
  }, []);

  const raiseHand = useCallback(async (raised: boolean): Promise<void> => {
    const token = tokenRef.current;
    if (!token) throw new Error(visioFailureMessage({ status: 'invalid' }));
    const result = await setPublicHandRaised(token, raised);
    if (result.status !== 'ok') throw new Error(visioFailureMessage(result));
  }, []);

  // L'avis de confirmation s'efface quand le vote est clos.
  useEffect(() => {
    if (state.kind !== 'ok') return;
    setNotices(previous => {
      const stillOpen = Object.keys(previous).filter(id =>
        state.view.resolutions.some(resolution => resolution.id === id && resolution.voteStatus === 'OPEN')
      );
      if (stillOpen.length === Object.keys(previous).length) return previous;
      return Object.fromEntries(stillOpen.map(id => [id, previous[id]]));
    });
  }, [state]);

  const view = state.kind === 'ok' ? state.view : null;
  const status = view?.meeting.status;

  const visioAvailable = Boolean(view?.visio?.enabled) && status === 'IN_PROGRESS' && Boolean(view?.me.joined);
  // Fin de l'AG ou lien perdu : la salle est démontée (donc déconnectée).
  const showRoom = visioOn && visioAvailable;

  const visioCard =
    visioAvailable && !showRoom ? (
      <Card size="small" title={t("Visio de l'assemblée")}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">
            {t("Suivez l'assemblée en vidéo et levez la main pour demander la parole. Le vote reste sur cette page.")}
          </Text>
          <Button type="primary" size="large" block onClick={() => setVisioOn(true)}>
            {t('Rejoindre la visio')}
          </Button>
        </Space>
      </Card>
    ) : null;

  const renderBlocks = (view: LiveMeetingPublicView) => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {stale ? (
        <Alert
          type="warning"
          showIcon
          message={t('Connexion instable : les informations affichées peuvent être en retard.')}
        />
      ) : null}
      <MeetingHeader view={view} />

      {status === 'CANCELLED' ? <Result status="info" title={t('Cette assemblée a été annulée.')} /> : null}

      {status === 'PLANNED' ? (
        <Alert
          type="info"
          showIcon
          message={t("L'assemblée n'a pas encore commencé")}
          description={t('Cette page se met à jour toute seule dès que la séance est ouverte. Ne la fermez pas.')}
        />
      ) : null}

      {status === 'COMPLETED' ? (
        <Alert
          type="success"
          showIcon
          message={t('Assemblée terminée')}
          description={t('Voici les résultats des résolutions.')}
        />
      ) : null}

      {actionError ? (
        <Alert type="error" showIcon closable onClose={() => setActionError(null)} message={actionError} />
      ) : null}

      {(status === 'PLANNED' || status === 'IN_PROGRESS') && !view.me.joined ? (
        <Card size="small">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text>{t('Bonjour {{name}}.', { name: view.me.name })}</Text>
            <Text type="secondary">
              {t("Rejoignez l'assemblée pour que votre présence soit enregistrée et pouvoir voter.")}
            </Text>
            <Button type="primary" size="large" block loading={joining} onClick={() => void onJoin()}>
              {t("Rejoindre l'assemblée")}
            </Button>
          </Space>
        </Card>
      ) : null}

      {(status === 'PLANNED' || status === 'IN_PROGRESS') && view.me.joined && !actionError ? (
        <Alert
          type="success"
          showIcon
          message={t("Vous avez rejoint l'assemblée, {{name}}.", { name: view.me.name })}
        />
      ) : null}

      {visioCard}

      {status !== 'CANCELLED' ? <QuorumCard view={view} /> : null}
      {status !== 'CANCELLED' ? <MyLotsCard view={view} /> : null}

      {status === 'PLANNED' && view.meeting.agenda.length > 0 ? (
        <Card size="small" title={t('Ordre du jour')}>
          <ol style={{ marginBlock: 0, paddingInlineStart: 20 }}>
            {view.meeting.agenda
              .slice()
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map(item => (
                <li key={`${item.orderIndex}-${item.title}`}>{item.title}</li>
              ))}
          </ol>
        </Card>
      ) : null}

      {status === 'PLANNED' || status === 'IN_PROGRESS' || status === 'COMPLETED' ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            {t('Résolutions')}
          </Title>
          {view.resolutions.length === 0 ? (
            <Text type="secondary">{t("Aucune résolution n'a été soumise au vote.")}</Text>
          ) : (
            view.resolutions.map(resolution => (
              <ResolutionCard
                key={resolution.id}
                view={view}
                resolution={resolution}
                busy={votingId === resolution.id}
                notice={notices[resolution.id] ?? null}
                onVote={(resolutionId, lotIds, vote) => void onVote(resolutionId, lotIds, vote)}
              />
            ))
          )}
        </Space>
      ) : null}
    </Space>
  );

  const room = (
    <Suspense
      fallback={
        <div style={{ textAlign: 'center', padding: 32 }} role="status">
          <Spin aria-label={t('Connexion à la visio…')} />
        </div>
      }
    >
      <MeetingVisioRoom
        role="participant"
        getToken={getVisioToken}
        onRaiseHand={raiseHand}
        onRefreshSignal={refresh}
        title={t("Visio de l'assemblée")}
      />
    </Suspense>
  );

  const pageStyle: React.CSSProperties = { maxWidth: showRoom && wide ? 1440 : 640, marginInline: 'auto' };

  return (
    <div style={{ minHeight: '100vh', padding: '16px', background: 'var(--color-bg-layout, #f5f5f5)' }}>
      <div style={pageStyle} aria-live={showRoom ? undefined : 'polite'}>
        {state.kind === 'loading' ? (
          <div style={{ textAlign: 'center', padding: 64 }} role="status">
            <Spin size="large" aria-label={t("Ouverture de l'assemblée")} />
          </div>
        ) : null}
        {state.kind === 'invalid' ? (
          <Result
            status="warning"
            title={t('Lien invalide ou expiré')}
            subTitle={t(
              "Demandez un nouveau lien à votre syndic ou ouvrez l'assemblée depuis votre espace copropriétaire."
            )}
          />
        ) : null}
        {state.kind === 'rate_limited' ? (
          <Result status="warning" title={t('Trop de tentatives, réessayez dans quelques minutes.')} />
        ) : null}
        {state.kind === 'unavailable' ? (
          <Result
            status="warning"
            title={t('Service momentanément indisponible, réessayez dans quelques minutes.')}
            subTitle={t('Cette page se met à jour toute seule.')}
          />
        ) : null}

        {view && !showRoom ? renderBlocks(view) : null}

        {view && showRoom && wide ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 3fr) minmax(360px, 2fr)',
              gap: 16,
              alignItems: 'start'
            }}
          >
            <div style={{ position: 'sticky', insetBlockStart: 16, height: 'calc(100vh - 32px)' }}>{room}</div>
            <div aria-live="polite">{renderBlocks(view)}</div>
          </div>
        ) : null}

        {view && showRoom && !wide ? (
          <Tabs
            activeKey={visioTab}
            onChange={key => setVisioTab(key === 'votes' ? 'votes' : 'visio')}
            items={[
              {
                key: 'visio',
                label: t('Visio'),
                forceRender: true,
                children: <div style={{ height: 'calc(100vh - 120px)', minHeight: 320 }}>{room}</div>
              },
              {
                key: 'votes',
                label: (
                  <Badge dot={hasPendingVote(view)} offset={[6, 0]}>
                    {t('Votes')}
                  </Badge>
                ),
                forceRender: true,
                children: <div aria-live="polite">{renderBlocks(view)}</div>
              }
            ]}
          />
        ) : null}
      </div>
    </div>
  );
};

export default MeetingLivePage;
