import React, { useEffect, useRef, useState } from 'react';
import { Alert, Form, Input, Modal, Select } from 'antd';
import { t } from '../../i18n/t';
import { feedback } from '../../lib/feedback';
import { copilotService, type SavedAnalysis } from '../../services/copilot-service';

export function NotifyColleaguesDialog({
  tenantId,
  analysis,
  onClose
}: {
  tenantId: string;
  analysis?: SavedAnalysis;
  onClose(): void;
}) {
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [members, setMembers] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmation = useRef<{ payload: string; id: string }>();
  useEffect(() => {
    let active = true;
    void copilotService
      .listAnalysisRecipients(tenantId, true)
      .then(items => {
        if (active) setMembers(items);
      })
      .catch(() => {
        if (active) setError(t('Impossible de charger les destinataires.'));
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  async function send() {
    if (busy || !recipientIds.length || !message.trim()) return;
    setBusy(true);
    setError('');
    try {
      const input = {
        recipientIds,
        message: message.trim(),
        analysis: analysis ? { conversationId: analysis.conversationId, artifactId: analysis.artifactId } : undefined
      };
      const payload = JSON.stringify(input);
      if (confirmation.current?.payload !== payload) confirmation.current = { payload, id: crypto.randomUUID() };
      await copilotService.notifyColleagues(tenantId, { ...input, requestId: confirmation.current.id });
      feedback.success(t('Notification envoyée.'));
      onClose();
    } catch {
      setError(t('Impossible d’envoyer cette notification.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={t('Notifier des collègues')}
      confirmLoading={busy}
      okText={t('Confirmer l’envoi')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !recipientIds.length || !message.trim() }}
      onOk={() => void send()}
      onCancel={() => {
        if (!busy) onClose();
      }}
    >
      <p>{t('Le message apparaîtra dans la cloche des destinataires sélectionnés.')}</p>
      {analysis && (
        <p>
          {analysis.title} ·{' '}
          {t('La confirmation partage aussi l’analyse en lecture seule avec les collègues sélectionnés.')}
        </p>
      )}
      {error && <Alert type="error" message={error} />}
      <Form component={false} layout="vertical" disabled={busy}>
        <Form.Item label={t('Destinataires')} required>
          <Select
            mode="multiple"
            maxCount={20}
            aria-label={t('Destinataires')}
            value={recipientIds}
            onChange={setRecipientIds}
            options={members.map(member => ({ value: member.userId, label: member.displayName }))}
          />
        </Form.Item>
        <Form.Item label={t('Message')} required>
          <Input.TextArea
            aria-label={t('Message')}
            value={message}
            maxLength={1000}
            showCount
            onChange={event => setMessage(event.target.value)}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
