import React, { useEffect, useRef, useState } from 'react';
import { Alert, Form, Input, Modal, Select } from 'antd';
import { t } from '../../i18n/t';
import { copilotService, type SavedAnalysis, type TaskPriority } from '../../services/copilot-service';
import { taskPriorities } from './AssistantTasks';

export function CreateAssistantTaskDialog({
  tenantId,
  analysis,
  onClose,
  onCreated
}: {
  tenantId: string;
  analysis?: SavedAnalysis;
  onClose(): void;
  onCreated(id: string): void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [assigneeId, setAssigneeId] = useState<string>();
  const [recipients, setRecipients] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmation = useRef<{ payload: string; id: string }>();
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
    if (!title.trim() || !assigneeId || busy) return;
    setError('');
    setBusy(true);
    try {
      const input = {
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate || undefined,
        priority,
        assigneeId,
        analysis: analysis ? { conversationId: analysis.conversationId, artifactId: analysis.artifactId } : undefined
      };
      const payload = JSON.stringify(input);
      if (confirmation.current?.payload !== payload) confirmation.current = { payload, id: crypto.randomUUID() };
      const result = await copilotService.createTask(tenantId, { ...input, requestId: confirmation.current.id });
      onCreated(result.id);
    } catch {
      setError(t('Impossible de créer cette tâche.'));
    } finally {
      setBusy(false);
    }
  }

  const labels = taskPriorities();
  return (
    <Modal
      open
      title={t('Créer une tâche')}
      confirmLoading={busy}
      okText={t('Confirmer la création')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !title.trim() || !assigneeId }}
      onOk={() => void submit()}
      onCancel={() => {
        if (!busy) onClose();
      }}
    >
      {analysis && (
        <p>
          {analysis.title} ·{' '}
          {t('Si vous assignez la tâche à un collègue, il recevra aussi un accès en lecture seule à l’analyse.')}
        </p>
      )}
      {error && <Alert type="error" message={error} />}
      <Form component={false} layout="vertical" disabled={busy}>
        <Form.Item label={t('Titre')} required>
          <Input
            aria-label={t('Titre')}
            value={title}
            maxLength={120}
            onChange={event => setTitle(event.target.value)}
          />
        </Form.Item>
        <Form.Item label={t('Description')}>
          <Input.TextArea
            aria-label={t('Description')}
            value={description}
            maxLength={2000}
            onChange={event => setDescription(event.target.value)}
          />
        </Form.Item>
        <Form.Item label={t('Collaborateur assigné')} required>
          <Select
            aria-label={t('Collaborateur assigné')}
            value={assigneeId}
            onChange={setAssigneeId}
            options={recipients.map(item => ({ value: item.userId, label: item.displayName }))}
          />
        </Form.Item>
        <Form.Item label={t('Échéance')}>
          <Input
            type="date"
            aria-label={t('Échéance')}
            value={dueDate}
            onChange={event => setDueDate(event.target.value)}
          />
        </Form.Item>
        <Form.Item label={t('Priorité')}>
          <Select<TaskPriority>
            aria-label={t('Priorité')}
            value={priority}
            onChange={setPriority}
            options={(['low', 'normal', 'high'] as const).map(value => ({ value, label: labels[value] }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
