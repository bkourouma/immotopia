import React, { useRef, useState } from 'react';
import { Alert, Button, Card, Space, Tag } from 'antd';
import { t } from '../../i18n/t';
import { copilotService } from '../../services/copilot-service';
import type { FollowUpProposal } from '../../types/copilot';
import { taskPriorities } from './AssistantTasks';

export function FollowUpCard({
  tenantId,
  proposal,
  streaming
}: {
  tenantId: string;
  proposal: FollowUpProposal;
  streaming?: boolean;
}) {
  const [status, setStatus] = useState(proposal.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const deciding = useRef(false);
  async function decide(confirm: boolean) {
    if (deciding.current) return;
    deciding.current = true;
    setBusy(true);
    setError(false);
    try {
      setStatus((await copilotService.decideFollowUp(tenantId, proposal.id, confirm)).status);
    } catch {
      setError(true);
    } finally {
      deciding.current = false;
      setBusy(false);
    }
  }
  const labels = {
    task: t('Créer une tâche'),
    notify: t('Notifier des collègues'),
    email: t('Envoyer par e-mail'),
    schedule: t('Programmer un rapport')
  };
  const states = {
    PENDING: t('À confirmer'),
    DECLINED: t('Annulée'),
    FAILED: t('Action en échec'),
    CONFIRMED: proposal.kind === 'email' ? t('Envoi mis en file') : t('Confirmée')
  };
  const { display } = proposal;
  const schedule = display.schedule;
  const frequencies = { daily: t('Quotidien'), weekly: t('Hebdomadaire'), monthly: t('Mensuel') };
  const weekdays = [t('Lundi'), t('Mardi'), t('Mercredi'), t('Jeudi'), t('Vendredi'), t('Samedi'), t('Dimanche')];
  const day =
    schedule?.frequency === 'weekly'
      ? weekdays[(schedule.day ?? 1) - 1]
      : schedule?.frequency === 'monthly'
        ? t('Jour {{day}} du mois', { day: schedule.day ?? 1 })
        : '';
  return (
    <Card size="small" title={labels[proposal.kind]} extra={<Tag>{states[status]}</Tag>}>
      <p>
        {t('Destinataires')} · {display.recipients.join(' · ')}
      </p>
      {display.title && <p>{display.title}</p>}
      {display.priority && (
        <p>
          {t('Priorité')} · {taskPriorities()[display.priority]}
        </p>
      )}
      {display.dueDate && (
        <p>
          {t('Échéance')} · {display.dueDate}
        </p>
      )}
      {display.artifactTitle && (
        <p>
          {t('Analyse')} · {display.artifactTitle}
        </p>
      )}
      {display.formats?.length && (
        <p>
          {t('Formats')} · {display.formats.map(format => format.toUpperCase()).join(', ')}
        </p>
      )}
      {schedule && (
        <p>{[frequencies[schedule.frequency], day, schedule.time, schedule.timeZone].filter(Boolean).join(' · ')}</p>
      )}
      {display.message && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{display.message}</p>}
      {display.sharesAnalysis && (
        <p>{t('La confirmation partage aussi l’analyse en lecture seule avec les collègues sélectionnés.')}</p>
      )}
      {error && <Alert type="error" message={t('Impossible de traiter la décision. Réessayez.')} />}
      {status === 'PENDING' && (
        <Space wrap>
          <Button type="primary" disabled={streaming || busy} onClick={() => void decide(true)}>
            {t('Confirmer')}
          </Button>
          <Button disabled={streaming || busy} onClick={() => void decide(false)}>
            {t('Annuler')}
          </Button>
        </Space>
      )}
    </Card>
  );
}
