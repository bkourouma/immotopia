import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Drawer, Empty, Space, Spin, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import { copilotService, type AssistantTask } from '../../services/copilot-service';

export function taskPriorities() {
  return { low: t('Basse'), normal: t('Normale'), high: t('Haute') };
}

export function AssistantTasks({
  tenantId,
  focus,
  onClose,
  onCreate
}: {
  tenantId: string;
  focus?: string;
  onClose(): void;
  onCreate(): void;
}) {
  const [items, setItems] = useState<AssistantTask[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState<string>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void copilotService
      .listTasks(tenantId, cursor, cursor ? undefined : focus, controller.signal)
      .then(page => {
        if (controller.signal.aborted) return;
        setItems(previous =>
          cursor ? [...previous, ...page.items.filter(task => !previous.some(item => item.id === task.id))] : page.items
        );
        setNext(page.nextCursor);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t('Impossible de charger les tâches.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tenantId, focus, cursor, revision]);

  function refresh() {
    setCursor(undefined);
    setRevision(value => value + 1);
  }

  async function toggle(task: AssistantTask) {
    setChanging(task.id);
    try {
      await copilotService.setTaskCompleted(tenantId, task.id, !task.completedAt);
      refresh();
    } catch {
      setError(t('Impossible de modifier cette tâche.'));
    } finally {
      setChanging(undefined);
    }
  }

  const priorities = taskPriorities();
  return (
    <Drawer
      open
      size="min(780px, 100vw)"
      title={t('Tâches')}
      onClose={onClose}
      extra={
        <Button type="primary" onClick={onCreate}>
          {t('Créer une tâche')}
        </Button>
      }
    >
      <div style={{ display: 'grid', gap: 12 }} aria-busy={loading}>
        {error && <Alert type="error" message={error} action={<Button onClick={refresh}>{t('Réessayer')}</Button>} />}
        {loading && <Spin />}
        {!loading && !error && !items.length && <Empty description={t('Aucune tâche à afficher.')} />}
        {items.map(task => {
          const link = task.analysis
            ? '?' +
              new URLSearchParams({ fil: task.analysis.conversationId, analyse: task.analysis.artifactId }).toString()
            : task.shareId
              ? '?' + new URLSearchParams({ partage: task.shareId }).toString()
              : undefined;
          return (
            <Card key={task.id} title={task.title} extra={<Tag>{task.completedAt ? t('Terminée') : t('À faire')}</Tag>}>
              <p>
                {t('Créée par {{creator}} · Assignée à {{assignee}}', {
                  creator: task.creator.fullName,
                  assignee: task.assignee.fullName
                })}
              </p>
              <p>
                {t('Priorité')} · {priorities[task.priority]}
              </p>
              {task.dueDate && (
                <p>
                  {t('Échéance')} ·{' '}
                  {new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(
                    new Date(task.dueDate)
                  )}
                </p>
              )}
              {task.description && (
                <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{task.description}</p>
              )}
              <Space wrap>
                {link && <Link to={link}>{t('Ouvrir l’analyse')}</Link>}
                {task.canComplete && (
                  <Button disabled={loading || !!changing} onClick={() => void toggle(task)}>
                    {task.completedAt ? t('Rouvrir la tâche') : t('Terminer la tâche')}
                  </Button>
                )}
              </Space>
            </Card>
          );
        })}
        {next && !error && (
          <Button disabled={loading} onClick={() => setCursor(next)}>
            {t('Afficher plus')}
          </Button>
        )}
      </div>
    </Drawer>
  );
}
