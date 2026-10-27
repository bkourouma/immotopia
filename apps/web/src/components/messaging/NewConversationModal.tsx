import React, { useEffect, useState } from 'react';
import { App, Checkbox, Empty, Input, Modal, Spin } from 'antd';
import { t } from '../../i18n/t';
import {
  addParticipants,
  createConversation,
  getDirectory,
  type ConversationSummary,
  type MessagingParticipant,
  type MessagingScope
} from '../../services/messaging-service';
import { ParticipantKindTag } from './ParticipantKindTag';

interface NewConversationModalProps {
  open: boolean;
  scope: MessagingScope;
  onClose: () => void;
  onDone: (conversation: ConversationSummary) => void;
  /** `add` : ajout à un groupe existant (`conversationId` requis), sinon création. */
  mode?: 'create' | 'add';
  conversationId?: string;
  excludeUserIds?: string[];
}

export function NewConversationModal({
  open,
  scope,
  onClose,
  onDone,
  mode = 'create',
  conversationId,
  excludeUserIds = []
}: NewConversationModalProps) {
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<MessagingParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      getDirectory(scope, query.trim())
        .then(result => {
          if (!cancelled) setPeople(result);
        })
        .catch(() => {
          if (!cancelled) message.error(t('Impossible de charger le répertoire'));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected([]);
      setTitle('');
    }
  }, [open]);

  const visible = people.filter(p => !excludeUserIds.includes(p.userId));
  const toggle = (userId: string) =>
    setSelected(current => (current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]));

  const submit = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      const conversation =
        mode === 'add' && conversationId
          ? await addParticipants(scope, conversationId, selected)
          : await createConversation(scope, {
              participantUserIds: selected,
              // Un seul participant sans titre = discussion directe ; le titre n'a de sens que pour un groupe.
              ...(selected.length > 1 && title.trim() ? { title: title.trim() } : {})
            });
      onDone(conversation);
      onClose();
    } catch {
      message.error(t('Action impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      title={mode === 'add' ? t('Ajouter des participants') : t('Nouvelle conversation')}
      okText={mode === 'add' ? t('Ajouter') : t('Démarrer')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: selected.length === 0, loading: submitting }}
      destroyOnHidden
    >
      <Input.Search
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={t('Rechercher une personne')}
        allowClear
        style={{ marginBlockEnd: 8 }}
      />
      <Spin spinning={loading}>
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {visible.length === 0 && !loading ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucune personne trouvée')} />
          ) : (
            visible.map(person => (
              <div key={person.userId} style={{ padding: '6px 4px' }}>
                <Checkbox checked={selected.includes(person.userId)} onChange={() => toggle(person.userId)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {person.label}
                    <ParticipantKindTag kind={person.kind} />
                  </span>
                </Checkbox>
              </div>
            ))
          )}
        </div>
      </Spin>
      {mode === 'create' && selected.length > 1 ? (
        <Input
          value={title}
          onChange={event => setTitle(event.target.value)}
          maxLength={120}
          placeholder={t('Titre du groupe (facultatif)')}
          style={{ marginBlockStart: 12 }}
        />
      ) : null}
    </Modal>
  );
}

export default NewConversationModal;
