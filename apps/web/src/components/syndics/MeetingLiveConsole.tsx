import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Alert, Button, Card, Col, Input, Modal, Progress, Row, Space, Statistic, Typography } from 'antd';
import {
  closeResolutionVote,
  getLiveMeeting,
  meetingRecordingFileUrl,
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
import type { MeetingProxy, MeetingStatus } from '../../types/syndic-types';
import { liveBackoffDelay, useVisiblePolling } from '../../hooks/useVisiblePolling';
import { LiveLotsTable, type ContactOption, type LotAttendanceChange } from './live/LiveLotsTable';
import { apiErrorText as errorText, useMeetingRecordings, useMeetingVisio } from './visio/use-meeting-visio';
import { LiveParticipantsTable } from './live/LiveParticipantsTable';
import { LiveResolutionsPanel } from './live/LiveResolutionsPanel';
import { MeetingVisioCard } from './visio/MeetingVisioCard';
import { MeetingDiscussionCard } from './visio/MeetingDiscussionCard';
import { useMeetingDiscussion } from './visio/use-meeting-discussion';
import { MeetingRecordingsCard } from './visio/MeetingRecordingsCard';
import { contactName } from './meeting-governance';
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
  /** Procurations de l'AG : permettent de pré-remplir le mandataire d'un lot « Représenté ». */
  proxies?: MeetingProxy[];
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

/** Les compteurs de participants sont déjà dans `/direct` : la liste détaillée n'est relue qu'un cycle sur trois. */
export const PARTICIPANTS_POLL_EVERY = 3;

/** Empreinte stable d'une réponse : l'horloge serveur change à chaque lecture sans rien changer à l'écran. */
function fingerprint(value: unknown): string {
  if (value && typeof value === 'object' && 'serverTime' in value) {
    return JSON.stringify({ ...(value as object), serverTime: null });
  }
  return JSON.stringify(value);
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
 * Interrogation toutes les 5 s pendant la séance, en pause onglet masqué ou menu d'émargement ouvert.
 */
export const MeetingLiveConsole: React.FC<MeetingLiveConsoleProps> = ({
  tenantId,
  syndicId,
  meetingId,
  meetingStatus,
  videoConferenceUrl,
  refreshKey,
  proxies,
  onMeetingChanged,
  onLiveChanged
}) => {
  const { message } = App.useApp();
  const [live, setLive] = useState<LiveMeetingAdminView | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipantView[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Lots dont un émargement est en cours : seule leur ligne est désactivée.
  const [busyLotIds, setBusyLotIds] = useState<ReadonlySet<string>>(() => new Set());
  // Un menu déroulant de la table est ouvert : le rafraîchissement est suspendu pour ne pas absorber le clic.
  const [lotMenuOpen, setLotMenuOpen] = useState(false);
  const [busyResolutionId, setBusyResolutionId] = useState<string | null>(null);
  const [busyContactId, setBusyContactId] = useState<string | null>(null);
  const [shownLink, setShownLink] = useState<{ name: string; url: string } | null>(null);
  const [videoDraft, setVideoDraft] = useState<string | null>(null);
  const [savingVideo, setSavingVideo] = useState(false);
  const [visioRoomOpen, setVisioRoomOpen] = useState(false);

  const frozen = meetingStatus === 'COMPLETED' || meetingStatus === 'CANCELLED';
  const inProgress = meetingStatus === 'IN_PROGRESS';
  const lastSignature = useRef<string | null>(null);
  const onLiveChangedRef = useRef(onLiveChanged);
  onLiveChangedRef.current = onLiveChanged;
  // Garde de séquence : chaque mutation (début et fin) incrémente le compteur ; une lecture lancée
  // avant la dernière mutation appliquée est périmée et ne doit pas écraser la vue.
  const mutationSeq = useRef(0);
  // Empreintes de ce qui est à l'écran : une lecture identique ne déclenche aucun rendu.
  const liveFingerprint = useRef<string | null>(null);
  const participantsFingerprint = useRef<string | null>(null);
  // Cycles de lecture écoulés et échecs consécutifs (attente croissante au-delà du premier).
  const cycleRef = useRef(0);
  const failuresRef = useRef(0);
  // La liste des participants se relit tout de suite au premier chargement, au changement d'AG/de statut
  // et après une action qui la modifie (lien délivré ou révoqué).
  const forceParticipants = useRef(true);
  const resetToken = `${tenantId}|${syndicId}|${meetingId}|${meetingStatus}|${refreshKey ?? ''}`;
  useEffect(() => {
    forceParticipants.current = true;
  }, [resetToken]);

  /** Applique une vue en direct (lecture ou réponse d'une action) ; ne touche l'état que si elle diffère. */
  const applyLive = useCallback((view: LiveMeetingAdminView) => {
    const next = fingerprint(view);
    if (liveFingerprint.current !== next) {
      liveFingerprint.current = next;
      setLive(view);
    }
    const signature = liveSignature(view);
    if (lastSignature.current !== null && lastSignature.current !== signature) {
      void onLiveChangedRef.current?.();
    }
    lastSignature.current = signature;
  }, []);

  const load = useCallback(async (): Promise<number | false | void> => {
    const seqAtStart = mutationSeq.current;
    const withParticipants = forceParticipants.current || cycleRef.current % PARTICIPANTS_POLL_EVERY === 0;
    cycleRef.current += 1;
    try {
      const [view, list] = await Promise.all([
        getLiveMeeting(tenantId, syndicId, meetingId),
        withParticipants ? listMeetingParticipants(tenantId, syndicId, meetingId) : Promise.resolve(null)
      ]);
      // Une mutation a eu lieu pendant la lecture : cette vue est périmée, la prochaine lecture la remplacera.
      if (mutationSeq.current !== seqAtStart) return frozen ? false : undefined;
      if (withParticipants) forceParticipants.current = false;
      applyLive(view);
      if (list) {
        const next = fingerprint(list);
        if (participantsFingerprint.current !== next) {
          participantsFingerprint.current = next;
          setParticipants(list);
        }
      }
      setError(null);
      failuresRef.current = 0;
    } catch (err) {
      // Un échec passager garde les dernières données à l'écran ; attente croissante (10 s, puis 15 s).
      setError(errorText(err, t('Impossible de charger la séance en direct')));
      failuresRef.current += 1;
      return frozen ? false : liveBackoffDelay(failuresRef.current);
    }
    // Interrogation tant que l'AG n'est ni terminée ni annulée (les copropriétaires rejoignent avant l'ouverture).
    return frozen ? false : undefined;
  }, [tenantId, syndicId, meetingId, frozen, applyLive]);

  const { refresh } = useVisiblePolling(load, { enabled: !lotMenuOpen, resetKey: resetToken });

  // Visio intégrée et enregistrement (spec 045) : lectures et actions dans leurs hooks.
  const visioState = useMeetingVisio({
    tenantId,
    syndicId,
    meetingId,
    meetingStatus,
    onLinksRevoked: refresh
  });
  const { visio, visioEnabled, inVisioContactIds } = visioState;
  const recordingState = useMeetingRecordings({
    tenantId,
    syndicId,
    meetingId,
    meetingStatus,
    // La liste est indépendante de `/visio` : elle se lit toujours, pour garder l'arrêt manuel accessible.
    enabled: true,
    activeId: visioState.activeRecording?.id ?? null,
    onChanged: visioState.refreshVisio
  });

  const discussionState = useMeetingDiscussion({ tenantId, syndicId, meetingId, meetingStatus });
  const { discussion } = discussionState;

  // Mandataire de la procuration, par mandant (votant du lot) : sert au « Représenté » en un clic.
  const proxyHolders = useMemo(() => {
    const byGrantor: Record<string, ContactOption> = {};
    (proxies ?? []).forEach(proxy => {
      byGrantor[proxy.grantorContactId] = {
        contactId: proxy.representativeContactId,
        name: contactName(proxy.representative)
      };
    });
    return byGrantor;
  }, [proxies]);

  const contacts = useMemo(() => {
    const merged = uniqueContacts(live, participants);
    // Un mandataire extérieur aux votants doit rester sélectionnable (et afficher son nom).
    Object.values(proxyHolders).forEach(holder => {
      if (!merged.some(contact => contact.contactId === holder.contactId)) merged.push(holder);
    });
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }, [live, participants, proxyHolders]);

  const setLotsBusy = useCallback((lotIds: string[], busy: boolean) => {
    setBusyLotIds(previous => {
      const next = new Set(previous);
      lotIds.forEach(id => (busy ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  // La réponse d'un émargement porte déjà la vue complète : pas de relecture redondante derrière.
  const runAction = useCallback(
    async (lotIds: string[], action: () => Promise<LiveMeetingAdminView>, okText: string, failText: string) => {
      setLotsBusy(lotIds, true);
      mutationSeq.current += 1;
      try {
        const view = await action();
        mutationSeq.current += 1;
        applyLive(view);
        message.success(okText);
      } catch (err) {
        message.error(errorText(err, failText));
      } finally {
        setLotsBusy(lotIds, false);
      }
    },
    [applyLive, message, setLotsBusy]
  );

  const handleSetLot = useCallback(
    (lotId: string, data: LotAttendanceChange) =>
      void runAction(
        [lotId],
        () => setLotAttendance(tenantId, syndicId, meetingId, lotId, data),
        t('Émargement enregistré'),
        t('Émargement impossible')
      ),
    [runAction, tenantId, syndicId, meetingId]
  );

  const handleBulk = useCallback(
    (lotIds: string[], status: 'PRESENT' | 'ABSENT') =>
      void runAction(
        lotIds,
        () => setBulkAttendance(tenantId, syndicId, meetingId, { lotIds, status, mode: 'IN_PERSON' }),
        t('Émargement enregistré'),
        t('Émargement impossible')
      ),
    [runAction, tenantId, syndicId, meetingId]
  );

  const handleVote = async (resolutionId: string, open: boolean) => {
    setBusyResolutionId(resolutionId);
    mutationSeq.current += 1;
    try {
      const call = open ? openResolutionVote : closeResolutionVote;
      const view = await call(tenantId, syndicId, meetingId, resolutionId);
      mutationSeq.current += 1;
      applyLive(view);
      message.success(open ? t('Vote ouvert') : t('Vote clos'));
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
      forceParticipants.current = true;
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
      forceParticipants.current = true;
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
            'Vérifiez les participants et leurs liens personnels, puis ouvrez la séance : le quorum et les votes se mettent à jour ici toutes les 5 secondes.'
          )}
        />
      ) : null}

      <Space wrap>
        <Button href={projectionPath} target="_blank" rel="noopener noreferrer">
          {t('Projeter')}
        </Button>
        {!frozen ? <Text type="secondary">{t('Mise à jour automatique toutes les 5 secondes')}</Text> : null}
      </Space>

      {live ? <QuorumPanel live={live} /> : null}

      {visioState.visioError || visio?.degraded ? (
        <Alert
          type="warning"
          showIcon
          message={t('Visio intégrée : état indisponible pour le moment')}
          description={t(
            "La salle et les participants n'ont pas pu être relus. L'arrêt de l'enregistrement reste possible plus bas."
          )}
          action={
            <Button size="small" onClick={() => visioState.refreshVisio()}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}

      {visioEnabled && visio ? (
        <MeetingVisioCard
          visio={visio}
          frozen={frozen}
          roomOpen={visioRoomOpen && !frozen}
          onToggleRoom={() => setVisioRoomOpen(open => !open)}
          getToken={visioState.getToken}
          busyParticipantId={visioState.busyVisioId}
          onSpeak={(participant, allowed) => void visioState.speak(participant, allowed)}
          onMute={(participant, sources) => void visioState.mute(participant, sources)}
          onLockMedia={locked => void visioState.lockMedia(locked)}
          lockBusy={visioState.lockBusy}
          onRemove={visioState.remove}
          inProgress={visioState.inProgress}
          recordingBusy={recordingState.busy}
          onStartRecording={() => void recordingState.start()}
          onStopRecording={() => void recordingState.stop()}
          failedRecording={recordingState.latestFailed}
          listActiveRecording={frozen ? null : recordingState.listActive}
          discussion={discussionState.discussionEnabled && inProgress ? discussionState.roomAdapter : undefined}
          onWriting={(participant, allowed) => void visioState.writing(participant, allowed)}
          busyWritingParticipantId={visioState.busyWritingId}
        />
      ) : null}

      {discussion ? (
        <MeetingDiscussionCard
          discussion={discussion}
          inProgress={inProgress}
          frozen={frozen}
          busyOpen={discussionState.busyOpen}
          busyMessageId={discussionState.busyMessageId}
          onToggleOpen={open => void discussionState.toggleOpen(open)}
          onHide={(item, hidden) => void discussionState.setHidden(item.id, hidden)}
          onSend={discussionState.send}
        />
      ) : null}

      {visioState.recordingConfigured || recordingState.recordings.length > 0 ? (
        <MeetingRecordingsCard
          recordings={recordingState.recordings}
          fileUrl={(recordingId, download) =>
            meetingRecordingFileUrl(tenantId, syndicId, meetingId, recordingId, download)
          }
          busyRecordingId={recordingState.busyRecordingId}
          processingSlow={recordingState.processingSlow}
          onDelete={recording => void recordingState.remove(recording)}
          onRetry={recording => void recordingState.retry(recording)}
          onDownload={recording => void recordingState.download(recording)}
          activeRecording={visioEnabled && visio ? null : recordingState.listActive}
          frozen={frozen}
          stopBusy={recordingState.busy}
          onStop={() => void recordingState.stop()}
        />
      ) : null}

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
          proxyHolders={proxyHolders}
          readOnly={frozen}
          busyLotIds={busyLotIds}
          onMenuOpenChange={setLotMenuOpen}
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
          inVisioContactIds={visioEnabled ? inVisioContactIds : undefined}
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
