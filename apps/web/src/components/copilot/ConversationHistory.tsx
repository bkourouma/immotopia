import React, { useEffect, useState } from 'react';
import { Button, Input, Modal, Space, Switch, Typography } from 'antd';
import { useAssistantTranslation } from '../../i18n/useAssistantTranslation';
import { feedback } from '../../lib/feedback';
import { copilotService } from '../../services/copilot-service';
import type { AssistantConversationSummary } from '../../types/copilot';

interface Props {
  tenantId: string;
  activeId: string | null;
  disabled: boolean;
  refresh: number;
  onSelect(id: string | null): void;
  onArchive(id: string, archived: boolean): void;
}

export function ConversationHistory({ tenantId, activeId, disabled, refresh, onSelect, onArchive }: Props) {
  const { t } = useAssistantTranslation();
  const [q, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<AssistantConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [limit, setLimit] = useState(1);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<AssistantConversationSummary>();
  const [remove, setRemove] = useState<AssistantConversationSummary>();
  const [title, setTitle] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows: AssistantConversationSummary[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < limit; page++) {
          const result = await copilotService.listConversations(tenantId, { q, archived, cursor });
          if (cancelled) return;
          rows.push(...result.items);
          cursor = result.nextCursor;
          if (!cursor) break;
        }
        if (!cancelled) {
          setItems(rows);
          setNextCursor(cursor);
        }
      } catch {
        if (!cancelled) feedback.error(t('L’historique des conversations n’a pas pu être chargé.'));
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tenantId, q, archived, limit, refresh, revision]);

  async function mutate(run: () => Promise<void>, close?: () => void) {
    setBusy(true);
    try {
      await run();
      setRevision(value => value + 1);
      close?.();
    } catch {
      feedback.error(t('La conversation n’a pas pu être modifiée.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <Input
        aria-label={t('Rechercher une conversation')}
        placeholder={t('Rechercher une conversation')}
        value={q}
        maxLength={200}
        onChange={event => {
          setQuery(event.target.value);
          setLimit(1);
        }}
      />
      <Space>
        <Switch
          aria-label={t('Conversations archivées')}
          checked={archived}
          onChange={value => {
            setArchived(value);
            setLimit(1);
          }}
        />
        <Typography.Text>{t('Archivées')}</Typography.Text>
      </Space>
      <ul
        style={{
          display: 'grid',
          alignContent: 'start',
          gap: 8,
          overflowY: 'auto',
          margin: 0,
          padding: 0,
          listStyle: 'none'
        }}
      >
        {items.map(item => (
          <li key={item.id}>
            <Button
              block
              type={item.id === activeId ? 'primary' : 'text'}
              disabled={disabled}
              aria-current={item.id === activeId ? 'true' : undefined}
              onClick={() => onSelect(item.id)}
              style={{ justifyContent: 'flex-start', overflow: 'hidden' }}
            >
              <Typography.Text ellipsis={{ tooltip: item.title }} style={{ color: 'inherit' }}>
                {item.title}
              </Typography.Text>
            </Button>
            {item.id === activeId && (
              <Space wrap size={2}>
                <Button
                  size="small"
                  type="link"
                  disabled={busy || disabled}
                  onClick={() => {
                    setRename(item);
                    setTitle(item.title);
                  }}
                >
                  {t('Renommer')}
                </Button>
                <Button
                  size="small"
                  type="link"
                  disabled={busy || disabled}
                  onClick={() =>
                    void mutate(() => copilotService.updateConversation(tenantId, item.id, { pinned: !item.pinned }))
                  }
                >
                  {item.pinned ? t('Désépingler') : t('Épingler')}
                </Button>
                <Button
                  size="small"
                  type="link"
                  disabled={busy || disabled}
                  onClick={() =>
                    void mutate(
                      () => copilotService.updateConversation(tenantId, item.id, { archived: !item.archived }),
                      () => onArchive(item.id, !item.archived)
                    )
                  }
                >
                  {item.archived ? t('Désarchiver') : t('Archiver')}
                </Button>
                <Button size="small" danger type="link" disabled={busy || disabled} onClick={() => setRemove(item)}>
                  {t('Supprimer')}
                </Button>
              </Space>
            )}
          </li>
        ))}
      </ul>
      {nextCursor && (
        <Button type="link" onClick={() => setLimit(value => value + 1)}>
          {t('Charger plus')}
        </Button>
      )}
      <Modal
        open={!!rename}
        title={t('Renommer la conversation')}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        onCancel={() => setRename(undefined)}
        confirmLoading={busy}
        okButtonProps={{ disabled: !title.trim() }}
        onOk={() =>
          rename &&
          void mutate(
            () => copilotService.updateConversation(tenantId, rename.id, { title: title.trim() }),
            () => setRename(undefined)
          )
        }
      >
        <Input
          aria-label={t('Titre de la conversation')}
          value={title}
          maxLength={200}
          onChange={event => setTitle(event.target.value)}
        />
      </Modal>
      <Modal
        open={!!remove}
        title={t('Supprimer la conversation')}
        okText={t('Supprimer')}
        cancelText={t('Annuler')}
        onCancel={() => setRemove(undefined)}
        okButtonProps={{ danger: true }}
        confirmLoading={busy}
        onOk={() =>
          remove &&
          void mutate(
            () => copilotService.deleteConversation(tenantId, remove.id),
            () => {
              setRemove(undefined);
              onSelect(null);
            }
          )
        }
      >
        {remove?.title}
      </Modal>
    </div>
  );
}
