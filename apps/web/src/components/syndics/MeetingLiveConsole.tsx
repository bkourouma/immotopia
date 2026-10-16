import React, { useCallback, useMemo, useRef, useState } from 'react';
import { App, Alert, Button, Card, Col, Input, Modal, Progress, Row, Space, Statistic, Typography } from 'antd';
import {
  closeResolutionVote,
  getLiveMeeting,
  issueParticipantLink,
  listMeetingParticipants,
  openResolutionVote,
  revokeParticipantLinks,
  setBulkAttendance,
  setLotAttendance,
  updateMeeting
} from '../../services/syndic-service';
import { isSafeVideoUrl } from '../../services/public-meeting-live-service';
import type { LiveMeetingAdminView, MeetingParticipantView } from '../../types/syndic-live-types';
import type { MeetingStatus } from '../../types/syndic-types';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';
import { LiveLotsTable, type ContactOption, type LotAttendanceChange } from './live/LiveLotsTable';
import { LiveParticipantsTable } from './live/LiveParticipantsTable';
import { LiveResolutionsPanel } from './live/LiveResolutionsPanel';
import { clampPercent } from './live/live-labels';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Ancre de la saisie de vote existante (carte « Ordre du jour et votes » du détail). */
export const MANUAL_VOTE_ANCHOR_ID = 'meeting-vote-entry';

interface MeetingLiveConsoleProps {
  tenantId: string;
  syndicId: string;
  meetingId: string;
  meetingStatus: MeetingStatus;
  /** Valeur enregistrée de l'URL de visio (fiche de l'AG). */
  videoConferenceUrl?: string | null;
  /** Change quand la fiche de l'AG a été rechargée (vote saisi à la main…) : relance une lecture. */
  refreshKey?: string;
  /** Appelé après une modification de la fiche (URL de visio) pour la recharger. */
  onMeetingChanged?: () => void | Promise<void>;
  /**
   * Appelé quand la vue en direct a changé (votes, état d'un vote, quorum, statut) :
   * la fiche rafraîchit alors ses blocs du bas en silence.
   */
  onLiveChanged?: () => void | Promise<void>;
}

/** Empreinte de ce qui alimente les blocs du bas de la fiche (quorum, votes, résultats). */
function liveSignature(view: LiveMeetingAdminView): string {
  const resolutions = view.resolutions
    .map(
      resolution =>
        `${resolution.id}:${resolution.voteStatus}:${resolution.ballotCount}:${resolution.tally.sharesFor}:` +
        `${resolution.tally.sharesAgainst}:${resolution.tally.sharesAbstain}:` +
        resolution.votes.map(vote => `${vote.lotId}${vote.vote}${vote.source}${vote.updatedAt}`).join(',')
    )
    .join('|');
  const { attendance } = view;
  return `${view.meeting.status}#${attendance.quorumPercent}:${attendance.representedShares}:${attendance.representedLots}#${resolutions}`;
}

const CLIPBOARD_TIMEOUT_MS = 2000;

/** Copie dans le presse-papiers ; faux si indisponible, refusé ou sans réponse (jamais de journal du texte). */
async function copyToClipboard(text: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!navigator.clipboard?.writeText) return false;
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CLIPBOARD_TIMEOUT_MS);
      })
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function errorText(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof message === 'string' && message ? message : fallback;
}

function uniqueContacts(live: LiveMeetingAdminView | null, participants: MeetingParticipantView[]): ContactOption[] {
  const byId = new Map<string, ContactOption>();
  participants.forEach(participant => byId.set(participant.contactId, participant));
  live?.lots.forEach(lot => lot.voters.forEach(voter => byId.set(voter.contactId, voter)));
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

const QuorumPanel: React.FC<{ live: LiveMeetingAdminView }> = ({ live }) => {
  const { attendance, participants } = live;
  const present = attendance.presentLots ?? 0;
  const represented = attendance.representedOnlyLots ?? 0;
  return (
    <Card size="small" title={t('Quorum')}>
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} md={10}>
          <Statistic title={t('Quorum')} value={clampPercent(attendance.quorumPercent)} suffix="%" />
          <Progress percent={clampPercent(attendance.quorumPercent)} aria-label={t('Jauge de quorum')} />
          <Text type="secondary">
            {t('{{represented}} / {{total}} tantièmes représentés', {
              represented: attendance.representedShares,
              total: attendance.totalShares
            })}
          </Text>
        </Col>
        <Col xs={8} md={4}>
          <Statistic title={t('Présents')} value={present} />
        </Col>
        <Col xs={8} md={4}>
          <Statistic title={t('Représentés')} value={represented} />
        </Col>
        <Col xs={8} md={3}>
          <Statistic title={t('En ligne')} value={attendance.onlineLots ?? 0} />
        </Col>
        <Col xs={24} md={3}>
          <Text type="secondary">
            {t('{{joined}} / {{invited}} ont rejoint · {{online}} en ligne', {
              joined: participants.joined,
              invited: participants.invited,
              online: participants.online
            })}
          </Text>
        </Col>
      </Row>
    </Card>
  );
};

/**
 * Console « En direct » du détail d'une AG (spec 043) : quorum, émargement des
 * lots, ouverture et clôture des votes, participants et liens personnels.
 * Interrogation toutes les 3 s pendant la séance, en pause onglet masqué.
 */
export const MeetingLiveConsole: React.FC<MeetingLiveConsoleProps> = ({
  tenantId,
  syndicId,
  meetingId,
  meetingStatus,
  videoConferenceUrl,
  refreshKey,
  onMeetingChanged,
  onLiveChanged
}) => {
  const { message } = App.useApp();
  const [live, setLive] = useState<LiveMeetingAdminView | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipantView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyResolutionId, setBusyResolutionId] = useState<string | null>(null);
  const [busyContactId, setBusyContactId] = useState<string | null>(null);
  const [shownLink, setShownLink] = useState<{ name: string; url: string } | null>(null);
  const [videoDraft, setVideoDraft] = useState<string | null>(null);
  const [savingVideo, setSavingVideo] = useState(false);

  const frozen = meetingStatus === 'COMPLETED' || meetingStatus === 'CANCELLED';
  const inProgress = meetingStatus === 'IN_PROGRESS';
  const lastSignature = useRef<string | null>(null);
  const onLiveChangedRef = useRef(onLiveChanged);
  onLiveChangedRef.current = onLiveChanged;

  const load = useCallback(async (): Promise<number | false | void> => {
    try {
      const [view, list] = await Promise.all([
        getLiveMeeting(tenantId, syndicId, meetingId),
        listMeetingParticipants(tenantId, syndicId, meetingId)
      ]);
      setLive(view);
      setParticipants(list);
      setError(null);
      const signature = liveSignature(view);
      if (lastSignature.current !== null && lastSignature.current !== signature) {
        void onLiveChangedRef.current?.();
      }
      lastSignature.current = signature;
    } catch (err) {
      // Un échec passager garde les dernières données à l'écran.
      setError(errorText(err, t('Impossible de charger la séance en direct')));
    }
    // Interrogation tant que l'AG n'est ni terminée ni annulée (les copropriétaires rejoignent avant l'ouverture).
    return frozen ? false : undefined;
  }, [tenantId, syndicId, meetingId, frozen]);

  const { refresh } = useVisiblePolling(load, { resetKey: `${meetingStatus}|${refreshKey ?? ''}` });

  const contacts = useMemo(() => uniqueContacts(live, participants), [live, participants]);

  const runAction = async (action: () => Promise<LiveMeetingAdminView>, okText: string, failText: string) => {
    setBusy(true);
    try {
      setLive(await action());
      message.success(okText);
      refresh();
    } catch (err) {
      message.error(errorText(err, failText));
    } finally {
      setBusy(false);
    }
  };

  const handleSetLot = (lotId: string, data: LotAttendanceChange) =>
    void runAction(
      () => setLotAttendance(tenantId, syndicId, meetingId, lotId, data),
      t('Émargement enregistré'),
      t('Émargement impossible')
    );

  const handleBulk = (lotIds: string[], status: 'PRESENT' | 'ABSENT') =>
    void runAction(
      () => setBulkAttendance(tenantId, syndicId, meetingId, { lotIds, status, mode: 'IN_PERSON' }),
      t('Émargement enregistré'),
      t('Émargement impossible')
    );

  const handleVote = async (resolutionId: string, open: boolean) => {
    setBusyResolutionId(resolutionId);
    try {
      const call = open ? openResolutionVote : closeResolutionVote;
      setLive(await call(tenantId, syndicId, meetingId, resolutionId));
      message.success(open ? t('Vote ouvert') : t('Vote clos'));
      refresh();
    } catch (err) {
      message.error(errorText(err, open ? t('Ouverture du vote impossible') : t('Clôture du vote impossible')));
    } finally {
      setBusyResolutionId(null);
    }
  };

  const handleCopyLink = async (participant: MeetingParticipantView) => {
    setBusyContactId(participant.contactId);
    try {
      const { url } = await issueParticipantLink(tenantId, syndicId, meetingId, participant.contactId);
      if (await copyToClipboard(url)) {
        setShownLink(null);
        message.success(t('Lien copié'));
      } else {
        // Presse-papiers indisponible, refusé ou muet : on affiche le lien à copier à la main.
        setShownLink({ name: participant.name, url });
      }
      refresh();
    } catch (err) {
      message.error(errorText(err, t('Génération du lien impossible')));
    } finally {
      setBusyContactId(null);
    }
  };

  const handleCopyShown = async () => {
    if (!shownLink) return;
    if (await copyToClipboard(shownLink.url)) {
      message.success(t('Lien copié'));
      setShownLink(null);
    } else {
      message.warning(t('Copie impossible : sélectionnez le lien et copiez-le à la main.'));
    }
  };

  const handleRevoke = async (participant: MeetingParticipantView) => {
    setBusyContactId(participant.contactId);
    try {
      const { revoked } = await revokeParticipantLinks(tenantId, syndicId, meetingId, participant.contactId);
      setShownLink(null);
      message.success(t('{{count}} lien(s) révoqué(s)', { count: revoked }));
      refresh();
    } catch (err) {
      message.error(errorText(err, t('Révocation impossible')));
    } finally {
      setBusyContactId(null);
    }
  };

  const savedVideo = videoConferenceUrl ?? '';
  const videoValue = videoDraft ?? savedVideo;
  const videoTrimmed = videoValue.trim();
  const videoInvalid = videoTrimmed !== '' && !isSafeVideoUrl(videoTrimmed);

  const handleSaveVideo = async () => {
    if (videoInvalid) return;
    setSavingVideo(true);
    try {
      await updateMeeting(tenantId, syndicId, meetingId, {
        videoConferenceUrl: videoTrimmed === '' ? null : videoTrimmed
      });
      message.success(t('Lien de visioconférence enregistré'));
      setVideoDraft(null);
      await onMeetingChanged?.();
      refresh();
    } catch (err) {
      message.error(errorText(err, t('Enregistrement impossible')));
    } finally {
      setSavingVideo(false);
    }
  };

  const scrollToManualVote = () => {
    document.getElementById(MANUAL_VOTE_ANCHOR_ID)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const projectionPath = `/tenant/${tenantId}/syndics/${syndicId}/assemblees/${meetingId}/projection`;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {error ? (
        <Alert
          type="warning"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={() => refresh()}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}

      {meetingStatus === 'PLANNED' ? (
        <Alert
          type="info"
          showIcon
          message={t('Préparation de la séance')}
          description={t(
            'Vérifiez les participants et leurs liens personnels, puis ouvrez la séance : le quorum et les votes se mettent à jour ici toutes les 3 secondes.'
          )}
        />
      ) : null}

      <Space wrap>
        <Button href={projectionPath} target="_blank" rel="noopener noreferrer">
          {t('Projeter')}
        </Button>
        {!frozen ? <Text type="secondary">{t('Mise à jour automatique toutes les 3 secondes')}</Text> : null}
      </Space>

      {live ? <QuorumPanel live={live} /> : null}

      <Card size="small" title={t('Visioconférence')}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={videoValue}
            placeholder={t('https://… (lien Zoom, Meet, Teams…)')}
            aria-label={t('Lien de visioconférence')}
            status={videoInvalid ? 'error' : undefined}
            disabled={frozen}
            maxLength={2000}
            onChange={event => setVideoDraft(event.target.value)}
          />
          <Button
            type="primary"
            loading={savingVideo}
            disabled={frozen || videoInvalid || videoTrimmed === savedVideo}
            onClick={() => void handleSaveVideo()}
          >
            {t('Enregistrer')}
          </Button>
        </Space.Compact>
        {videoInvalid ? <Text type="danger">{t('Le lien doit commencer par https://')}</Text> : null}
      </Card>

      <Card size="small" title={t('Lots et émargement')}>
        <LiveLotsTable
          lots={live?.lots ?? []}
          contacts={contacts}
          readOnly={frozen}
          busy={busy}
          onSetLot={handleSetLot}
          onBulk={handleBulk}
        />
      </Card>

      <Card size="small" title={t('Résolutions en direct')}>
        <LiveResolutionsPanel
          resolutions={live?.resolutions ?? []}
          totalLots={live?.attendance.totalLots ?? 0}
          canControlVotes={inProgress}
          busyResolutionId={busyResolutionId}
          onOpen={id => void handleVote(id, true)}
          onClose={id => void handleVote(id, false)}
          onManualEntry={scrollToManualVote}
          showManualEntry={!frozen}
        />
      </Card>

      <Card size="small" title={t('Participants et liens personnels')}>
        <LiveParticipantsTable
          participants={participants}
          readOnly={frozen}
          busyContactId={busyContactId}
          onCopyLink={participant => void handleCopyLink(participant)}
          onRevoke={participant => void handleRevoke(participant)}
        />
      </Card>
      <Modal
        open={shownLink !== null}
        title={t('Lien personnel')}
        onCancel={() => setShownLink(null)}
        footer={[
          <Button key="copy" type="primary" onClick={() => void handleCopyShown()}>
            {t('Copier')}
          </Button>,
          <Button key="close" onClick={() => setShownLink(null)}>
            {t('Fermer')}
          </Button>
        ]}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text>{t('Copiez ce lien et transmettez-le à {{name}}', { name: shownLink?.name ?? '' })}</Text>
          <Input
            readOnly
            value={shownLink?.url ?? ''}
            aria-label={t('Lien personnel')}
            onFocus={event => event.target.select()}
          />
        </Space>
      </Modal>
    </Space>
  );
};

export default MeetingLiveConsole;
