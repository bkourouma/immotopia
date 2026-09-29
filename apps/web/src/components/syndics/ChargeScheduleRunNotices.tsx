import React, { useState } from 'react';
import { Button, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useConfirmAction } from '../primitives';
import { resendChargeScheduleRunNotices } from '../../services/syndic-charge-schedule-service';
import { ChargeScheduleRun } from '../../types/syndic-types';
import { t } from '../../i18n/t';
import { stripRawMailDetail } from './charge-schedule-notes';

const { Text } = Typography;

/**
 * Détail des avis (envoyés / non envoyés, raison par raison) d'une exécution
 * de programmation, et bouton de renvoi — anomalie recette, correctif Syndic
 * (page « Programmation des appels de charges »). Avant ce correctif, seul
 * un total « N avis non envoyé(s) » était visible, la raison réservée à une
 * infobulle au survol, et aucun moyen de renvoyer un avis manqué. Utilisé à
 * la fois dans la liste des programmations (dernière exécution) et dans
 * l'historique des exécutions (`SyndicChargeSchedules.tsx`).
 */

const EMAIL_NOT_CONFIGURED_MARKER = "envoi d'e-mails non configuré sur le serveur";
const NOTIFICATION_DISABLED_MARKER = 'notification e-mail désactivée';

const EMAIL_NOT_CONFIGURED_HINT = t(
  "L'envoi d'e-mails n'est pas configuré sur le serveur : contactez l'administrateur de la plateforme."
);
const NOTIFICATION_DISABLED_HINT = t(
  'La notification « Appel de charges émis » est désactivée pour cette agence : activez-la dans Communication > Notifications e-mail.'
);

function parseReasonLines(notes: string | null): string[] {
  if (!notes) return [];
  return notes.split('\n').filter(Boolean).map(stripRawMailDetail);
}

export interface ChargeScheduleRunNoticesProps {
  run: ChargeScheduleRun | null;
  tenantId: string | null | undefined;
  syndicId: string | null | undefined;
  scheduleId: string;
  /** Appelé après un renvoi réussi, pour recharger la programmation et/ou l'historique. */
  onResent?: () => void;
}

export const ChargeScheduleRunNotices: React.FC<ChargeScheduleRunNoticesProps> = ({
  run,
  tenantId,
  syndicId,
  scheduleId,
  onResent
}) => {
  const confirmAction = useConfirmAction();
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!run) return <Text type="secondary">{t('Aucune')}</Text>;

  const reasonLines = parseReasonLines(run.notes);
  const hasEmailNotConfigured = reasonLines.some(line => line.includes(EMAIL_NOT_CONFIGURED_MARKER));
  const hasNotificationDisabled = reasonLines.some(line => line.includes(NOTIFICATION_DISABLED_MARKER));
  const canResend = run.status === 'SUCCESS' && Boolean(run.batchId) && run.notificationsSkipped > 0;

  const handleResend = () => {
    if (!tenantId || !syndicId) return;
    confirmAction({
      title: t('Renvoyer les avis non envoyés ?'),
      description: t(
        '{{count}} avis seront retentés (e-mail et WhatsApp) pour les appels de cette exécution encore dus et sans avis envoyé.',
        { count: run.notificationsSkipped }
      ),
      okText: t('Renvoyer'),
      onConfirm: async () => {
        setResending(true);
        setMessage(null);
        try {
          const result = await resendChargeScheduleRunNotices(tenantId, syndicId, scheduleId, run.id);
          setMessage({
            type: 'success',
            text:
              result.stillSkipped > 0
                ? t('{{sent}} avis envoyé(s), {{skipped}} toujours non envoyé(s).', {
                    sent: result.resent,
                    skipped: result.stillSkipped
                  })
                : t('{{sent}} avis envoyé(s).', { sent: result.resent })
          });
          onResent?.();
        } catch (err: any) {
          setMessage({ type: 'error', text: err.response?.data?.error || t('Renvoi impossible') });
        } finally {
          setResending(false);
        }
      }
    });
  };

  return (
    <Space direction="vertical" size={2} style={{ maxWidth: 360 }}>
      <Text>
        {t('{{sent}} avis envoyé(s)', { sent: run.notificationsSent })}
        {run.notificationsSkipped > 0
          ? ` · ${t('{{skipped}} non envoyé(s)', { skipped: run.notificationsSkipped })}`
          : ''}
      </Text>
      {reasonLines.map(line => (
        <Text key={line} type="warning" style={{ fontSize: 12 }}>
          {line}
        </Text>
      ))}
      {hasEmailNotConfigured ? (
        <Text type="danger" style={{ fontSize: 12 }}>
          {EMAIL_NOT_CONFIGURED_HINT}
        </Text>
      ) : null}
      {hasNotificationDisabled ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {NOTIFICATION_DISABLED_HINT}
        </Text>
      ) : null}
      {canResend ? (
        <Button size="small" icon={<ReloadOutlined />} loading={resending} onClick={handleResend}>
          {t('Renvoyer les avis non envoyés')}
        </Button>
      ) : null}
      {message ? (
        <Text type={message.type === 'success' ? 'success' : 'danger'} style={{ fontSize: 12 }}>
          {message.text}
        </Text>
      ) : null}
    </Space>
  );
};
