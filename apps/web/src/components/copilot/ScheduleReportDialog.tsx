import React, { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal, Select } from 'antd';
import { t } from '../../i18n/t';
import {
  copilotService,
  type ReportFormat,
  type ReportSchedule,
  type SavedAnalysis
} from '../../services/copilot-service';

export function ScheduleReportDialog({
  tenantId,
  analysis,
  onClose,
  onCreated
}: {
  tenantId: string;
  analysis: SavedAnalysis;
  onClose(): void;
  onCreated(): void;
}) {
  const [frequency, setFrequency] = useState<ReportSchedule['frequency']>('weekly');
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('08:00');
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [formats, setFormats] = useState<ReportFormat[]>(['pdf']);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void copilotService
      .listAnalysisRecipients(tenantId, true)
      .then(items => {
        if (active) setRecipients(items);
      })
      .catch(() => {
        if (active) setError(t('Impossible de charger les destinataires.'));
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const clock = { time, timeZone: timeZone.trim() };
      new Intl.DateTimeFormat('en', { timeZone: clock.timeZone });
      await copilotService.createScheduledReport(tenantId, {
        conversationId: analysis.conversationId,
        artifactId: analysis.artifactId,
        schedule: frequency === 'daily' ? { ...clock, frequency } : { ...clock, frequency, day },
        formats,
        recipientIds
      });
      onCreated();
    } catch (failure) {
      setError(failure instanceof RangeError ? t('Fuseau horaire invalide.') : t('Impossible de préparer ce rapport.'));
    } finally {
      setBusy(false);
    }
  }

  const weekdays = [t('Lundi'), t('Mardi'), t('Mercredi'), t('Jeudi'), t('Vendredi'), t('Samedi'), t('Dimanche')];
  return (
    <Modal
      open
      title={t('Programmer un rapport')}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={() => void submit()}
      okText={t('Enregistrer le brouillon')}
      cancelText={t('Annuler')}
      confirmLoading={busy}
      okButtonProps={{ disabled: !recipientIds.length || !formats.length || !timeZone.trim() }}
    >
      <p>{analysis.title}</p>
      <p>
        {t(
          'Le rapport sera envoyé selon les droits communs à chaque destinataire et au propriétaire de l’analyse. Activez le brouillon dans Rapports pour commencer les envois.'
        )}
      </p>
      {error && <Alert type="error" message={error} />}
      <Form component={false} layout="vertical" disabled={busy}>
        <Form.Item label={t('Fréquence')}>
          <Select<ReportSchedule['frequency']>
            aria-label={t('Fréquence')}
            value={frequency}
            onChange={value => {
              setFrequency(value);
              setDay(1);
            }}
            options={[
              { value: 'daily', label: t('Quotidien') },
              { value: 'weekly', label: t('Hebdomadaire') },
              { value: 'monthly', label: t('Mensuel') }
            ]}
          />
        </Form.Item>
        {frequency !== 'daily' && (
          <Form.Item label={frequency === 'weekly' ? t('Jour de la semaine') : t('Jour du mois')}>
            <Select
              aria-label={frequency === 'weekly' ? t('Jour de la semaine') : t('Jour du mois')}
              value={day}
              onChange={setDay}
              options={
                frequency === 'weekly'
                  ? weekdays.map((label, i) => ({ value: i + 1, label }))
                  : Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
              }
            />
          </Form.Item>
        )}
        <Form.Item label={t('Heure')}>
          <Select
            aria-label={t('Heure')}
            showSearch
            value={time}
            onChange={setTime}
            options={Array.from({ length: 96 }, (_, i) => {
              const value = `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`;
              return { value, label: value };
            })}
          />
        </Form.Item>
        <Form.Item label={t('Fuseau horaire')}>
          <Input
            aria-label={t('Fuseau horaire')}
            value={timeZone}
            onChange={event => setTimeZone(event.target.value)}
            placeholder="Africa/Abidjan"
            maxLength={100}
          />
        </Form.Item>
        <Form.Item label={t('Formats')}>
          <Select
            mode="multiple"
            aria-label={t('Formats')}
            value={formats}
            onChange={setFormats}
            options={[
              { value: 'pdf', label: 'PDF' },
              { value: 'xlsx', label: 'Excel' },
              { value: 'csv', label: 'CSV' }
            ]}
          />
        </Form.Item>
        <Form.Item label={t('Destinataires')}>
          <Select
            mode="multiple"
            maxCount={20}
            aria-label={t('Destinataires')}
            value={recipientIds}
            onChange={setRecipientIds}
            options={recipients.map(({ userId, displayName }) => ({ value: userId, label: displayName }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
