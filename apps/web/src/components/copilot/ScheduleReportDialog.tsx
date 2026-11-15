import React, { useEffect, useRef, useState } from 'react';
import { Alert, Form, Input, Modal, Select } from 'antd';
import { useAssistantTranslation } from '../../i18n/useAssistantTranslation';
import {
  copilotService,
  type ReportFormat,
  type ReportSchedule,
  type SavedAnalysis
} from '../../services/copilot-service';

export function ScheduleReportDialog({
  tenantId,
  analysis,
  immediate,
  agencyTimeZone = 'UTC',
  onClose,
  onCreated
}: {
  tenantId: string;
  analysis: SavedAnalysis;
  immediate: boolean;
  agencyTimeZone?: string;
  onClose(): void;
  onCreated(): void;
}) {
  const { t } = useAssistantTranslation();
  const [frequency, setFrequency] = useState<ReportSchedule['frequency']>('weekly');
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('08:00');
  const [timeZone, setTimeZone] = useState<string>();
  const [formats, setFormats] = useState<ReportFormat[]>(['pdf']);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [error, setError] = useState<'load' | 'timezone' | 'submit'>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const confirmation = useRef<{ payload: string; key: string }>();
  useEffect(() => {
    let active = true;
    void copilotService
      .listAnalysisRecipients(tenantId, true)
      .then(items => {
        if (active) setRecipients(items);
      })
      .catch(() => {
        if (active) setError('load');
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const input = {
        conversationId: analysis.conversationId,
        artifactId: analysis.artifactId,
        formats,
        recipientIds
      };
      if (immediate) {
        const email = { ...input, message: message.trim() || undefined };
        const payload = JSON.stringify(email);
        if (confirmation.current?.payload !== payload) {
          confirmation.current = { payload, key: crypto.randomUUID() };
        }
        await copilotService.queueImmediateReport(tenantId, { ...email, requestId: confirmation.current.key });
      } else {
        const override = timeZone?.trim();
        const clock = { time, timeZone: override || undefined };
        if (override) new Intl.DateTimeFormat('en', { timeZone: override });
        await copilotService.createScheduledReport(tenantId, {
          ...input,
          schedule: frequency === 'daily' ? { ...clock, frequency } : { ...clock, frequency, day }
        });
      }
      onCreated();
    } catch (failure) {
      setError(failure instanceof RangeError ? 'timezone' : 'submit');
    } finally {
      setBusy(false);
    }
  }

  const errors = {
    load: t('Impossible de charger les destinataires.'),
    timezone: t('Fuseau horaire invalide.'),
    submit: immediate ? t('Impossible de mettre le rapport en file d’envoi.') : t('Impossible de préparer ce rapport.')
  };
  const weekdays = [t('Lundi'), t('Mardi'), t('Mercredi'), t('Jeudi'), t('Vendredi'), t('Samedi'), t('Dimanche')];
  return (
    <Modal
      open
      title={immediate ? t('Envoyer par e-mail') : t('Programmer un rapport')}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={() => void submit()}
      okText={immediate ? t('Confirmer l’envoi') : t('Enregistrer le brouillon')}
      cancelText={t('Annuler')}
      confirmLoading={busy}
      okButtonProps={{ disabled: !recipientIds.length || !formats.length }}
    >
      <p>{analysis.title}</p>
      <p>
        {immediate
          ? t(
              'Les destinataires recevront une pièce jointe calculée selon leurs droits communs avec le propriétaire de l’analyse.'
            )
          : t(
              'Le rapport sera envoyé selon les droits communs à chaque destinataire et au propriétaire de l’analyse. Activez le brouillon dans Rapports pour commencer les envois.'
            )}
      </p>
      {immediate && (
        <p>{t('La confirmation partage aussi l’analyse en lecture seule avec les collègues sélectionnés.')}</p>
      )}
      {error && <Alert type="error" message={errors[error]} />}
      <Form component={false} layout="vertical" disabled={busy}>
        {immediate ? (
          <Form.Item label={t('Message facultatif')}>
            <Input.TextArea
              aria-label={t('Message facultatif')}
              value={message}
              maxLength={2000}
              onChange={event => setMessage(event.target.value)}
            />
          </Form.Item>
        ) : (
          <>
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
                value={timeZone ?? agencyTimeZone}
                onChange={event => setTimeZone(event.target.value)}
                placeholder={agencyTimeZone}
                maxLength={100}
              />
            </Form.Item>
          </>
        )}
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
