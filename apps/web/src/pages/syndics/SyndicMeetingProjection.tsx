import React, { useCallback, useEffect, useState } from 'react';
import { Progress, Spin } from 'antd';
import { getLiveMeeting } from '../../services/syndic-service';
import type { LiveMeetingAdminView, LiveResolutionRow } from '../../types/syndic-live-types';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';
import {
  clampPercent,
  formatDateTime,
  meetingTypeTitle,
  resultColor,
  resultLabel,
  voteStatusLabel
} from '../../components/syndics/live/live-labels';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

// Écran de salle : couleurs posées ici (pas de thème clair/sombre), gros caractères, contraste élevé.
const SCREEN: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b1220',
  color: '#f8fafc',
  padding: 'clamp(16px, 4vw, 48px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'clamp(16px, 3vw, 40px)',
  fontSize: 'clamp(18px, 2.2vw, 32px)'
};
const PANEL: React.CSSProperties = {
  background: '#162036',
  borderRadius: 16,
  padding: 'clamp(16px, 2.5vw, 32px)'
};
const MUTED: React.CSSProperties = { color: '#94a3b8' };

const ResultRow: React.FC<{ resolution: LiveResolutionRow }> = ({ resolution }) => {
  const result = resolution.tally.result;
  const tone = resultColor(result);
  const colors: Record<string, string> = { green: '#22c55e', red: '#ef4444', orange: '#f59e0b', default: '#94a3b8' };
  return (
    <div style={{ ...PANEL, display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' }}>
      <div style={{ flex: '1 1 320px', fontWeight: 600 }}>{resolution.title}</div>
      <div style={{ color: colors[tone] ?? colors.default, fontWeight: 700 }}>{resultLabel(result)}</div>
      <div style={MUTED}>
        {t('Pour {{for}} · Contre {{against}} · Abstention {{abstain}}', {
          for: resolution.tally.sharesFor,
          against: resolution.tally.sharesAgainst,
          abstain: resolution.tally.sharesAbstain
        })}
      </div>
    </div>
  );
};

const OpenResolution: React.FC<{ resolution: LiveResolutionRow; totalLots: number }> = ({ resolution, totalLots }) => {
  const percent = totalLots > 0 ? clampPercent((resolution.ballotCount / totalLots) * 100) : 0;
  return (
    <div style={{ ...PANEL, borderInlineStart: '8px solid #22c55e' }}>
      <div style={{ ...MUTED, fontSize: '0.7em', textTransform: 'uppercase', letterSpacing: 1 }}>
        {voteStatusLabel('OPEN')}
      </div>
      <div style={{ fontSize: '1.6em', fontWeight: 700, marginBlock: 8 }}>{resolution.title}</div>
      {resolution.description ? <div style={MUTED}>{resolution.description}</div> : null}
      <div style={{ marginBlockStart: 16 }}>
        {t('Participation : {{voted}} lot(s) sur {{total}}', { voted: resolution.ballotCount, total: totalLots })}
      </div>
      <Progress percent={percent} showInfo={false} strokeColor="#22c55e" trailColor="#334155" />
      <div style={{ marginBlockStart: 8 }}>
        {t('Pour {{for}} · Contre {{against}} · Abstention {{abstain}}', {
          for: resolution.tally.sharesFor,
          against: resolution.tally.sharesAgainst,
          abstain: resolution.tally.sharesAbstain
        })}
      </div>
    </div>
  );
};

/**
 * Écran de projection d'une AG (spec 043, D11) : lecture seule, pour la salle.
 * Quorum, résolution(s) en cours de vote avec participation, résultats des votes clos.
 */
export const SyndicMeetingProjection: React.FC = () => {
  const { tenantId, syndicId, meetingId } = useSyndicRouteContext();
  const [live, setLive] = useState<LiveMeetingAdminView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = t("Projection de l'assemblée");
    return () => {
      document.title = previous;
    };
  }, []);

  const load = useCallback(async (): Promise<number | false | void> => {
    if (!tenantId || !syndicId || !meetingId) return false;
    try {
      const view = await getLiveMeeting(tenantId, syndicId, meetingId);
      setLive(view);
      setFailed(false);
      if (view.meeting.status === 'COMPLETED' || view.meeting.status === 'CANCELLED') return false;
    } catch {
      // On garde le dernier état affiché ; la lecture suivante réessaie.
      setFailed(true);
    }
    return undefined;
  }, [tenantId, syndicId, meetingId]);

  useVisiblePolling(load);

  if (!live) {
    return (
      <div style={{ ...SCREEN, alignItems: 'center', justifyContent: 'center' }} role="status">
        {failed ? <div>{t('Impossible de charger la séance en direct')}</div> : <Spin size="large" />}
      </div>
    );
  }

  const { meeting, attendance, resolutions } = live;
  const open = resolutions.filter(resolution => resolution.voteStatus === 'OPEN');
  const closed = resolutions.filter(resolution => resolution.voteStatus === 'CLOSED');
  const pending = resolutions.filter(resolution => resolution.voteStatus === 'PENDING');
  const quorum = clampPercent(attendance.quorumPercent);

  return (
    <div style={SCREEN}>
      <header>
        <div style={{ fontSize: '1.5em', fontWeight: 700 }}>{meeting.syndicate.name}</div>
        <div style={MUTED}>
          {meetingTypeTitle(meeting.type)} — {formatDateTime(meeting.scheduledAt)}
        </div>
        {failed ? <div style={{ color: '#f59e0b', fontSize: '0.7em' }}>{t('Connexion instable')}</div> : null}
        {meeting.status === 'PLANNED' ? (
          <div style={{ marginBlockStart: 8 }}>{t("L'assemblée va bientôt commencer")}</div>
        ) : null}
        {meeting.status === 'COMPLETED' ? <div style={{ marginBlockStart: 8 }}>{t('Assemblée terminée')}</div> : null}
      </header>

      <section style={PANEL} aria-label={t('Quorum')}>
        <div style={MUTED}>{t('Quorum')}</div>
        <div style={{ fontSize: '3em', fontWeight: 800, lineHeight: 1.1 }}>{quorum} %</div>
        <Progress percent={quorum} showInfo={false} strokeColor="#38bdf8" trailColor="#334155" />
        <div style={{ marginBlockStart: 8 }}>
          {t('{{represented}} / {{total}} tantièmes représentés · {{lots}} / {{totalLots}} lots', {
            represented: attendance.representedShares,
            total: attendance.totalShares,
            lots: attendance.representedLots,
            totalLots: attendance.totalLots
          })}
        </div>
      </section>

      {open.map(resolution => (
        <OpenResolution key={resolution.id} resolution={resolution} totalLots={attendance.totalLots} />
      ))}

      {closed.length > 0 ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-label={t('Résultats')}>
          <div style={MUTED}>{t('Résultats')}</div>
          {closed.map(resolution => (
            <ResultRow key={resolution.id} resolution={resolution} />
          ))}
        </section>
      ) : null}

      {open.length === 0 && pending.length > 0 && meeting.status === 'IN_PROGRESS' ? (
        <div style={MUTED}>{t('Prochain vote : {{title}}', { title: pending[0].title })}</div>
      ) : null}
    </div>
  );
};

export default SyndicMeetingProjection;
