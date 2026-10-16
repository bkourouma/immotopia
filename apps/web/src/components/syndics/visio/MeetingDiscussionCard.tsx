import React from 'react';
import { Button, Card, Space, Switch, Tag, Typography } from 'antd';
import type { ManagerDiscussionMessageView, ManagerDiscussionView } from '../../../types/syndic-live-types';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { BidiText, DiscussionComposer } from './VisioDiscussionPanel';

const { Text } = Typography;

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(activeLocale(), { dateStyle: 'short', timeStyle: 'short' });
}

interface MessageRowProps {
  message: ManagerDiscussionMessageView;
  readOnly: boolean;
  busy: boolean;
  onHide: (message: ManagerDiscussionMessageView, hidden: boolean) => void;
}

/** Ligne de la vue du gestionnaire : le texte d'un message masqué reste lisible, grisé. Texte React uniquement. */
const MessageRow: React.FC<MessageRowProps> = ({ message, readOnly, busy, onHide }) => (
  <li style={{ listStyle: 'none', marginBlockEnd: 10 }}>
    <Space size={6} wrap align="center">
      <Text strong>
        <BidiText>{message.authorName}</BidiText>
      </Text>
      {message.authorKind === 'MANAGER' ? <Tag style={{ margin: 0 }}>{t('Gestionnaire')}</Tag> : null}
      <Text type="secondary">
        <time dateTime={message.createdAt}>{formatStamp(message.createdAt)}</time>
      </Text>
      {message.hidden ? (
        <Tag color="orange" style={{ margin: 0 }}>
          {t('masqué')}
        </Tag>
      ) : null}
      {!readOnly ? (
        <Button
          size="small"
          type="link"
          disabled={busy}
          aria-label={
            message.hidden
              ? t('Rétablir le message de {{name}}', { name: message.authorName })
              : t('Masquer le message de {{name}}', { name: message.authorName })
          }
          onClick={() => onHide(message, !message.hidden)}
        >
          {message.hidden ? t('Rétablir') : t('Masquer')}
        </Button>
      ) : null}
    </Space>
    <div
      style={{
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        opacity: message.hidden ? 0.55 : undefined
      }}
    >
      <BidiText>{message.body}</BidiText>
    </div>
  </li>
);

interface MeetingDiscussionCardProps {
  discussion: ManagerDiscussionView;
  /** AG en cours : seul moment où le gestionnaire écrit. */
  inProgress: boolean;
  /** AG terminée ou annulée : lecture seule. */
  frozen: boolean;
  busyOpen: boolean;
  busyMessageId: string | null;
  onToggleOpen: (open: boolean) => void;
  onHide: (message: ManagerDiscussionMessageView, hidden: boolean) => void;
  onSend: (body: string) => Promise<void>;
}

/**
 * Carte « Discussion » de la console (spec 046) : interrupteur d'ouverture, liste complète
 * (masqués compris), masquage, saisie du gestionnaire. Après la séance : lecture seule,
 * et seulement s'il y a des messages.
 */
export const MeetingDiscussionCard: React.FC<MeetingDiscussionCardProps> = ({
  discussion,
  inProgress,
  frozen,
  busyOpen,
  busyMessageId,
  onToggleOpen,
  onHide,
  onSend
}) => {
  const hasMessages = discussion.messages.length > 0;
  if (!(discussion.enabled && !frozen) && !hasMessages) return null;

  return (
    <Card
      size="small"
      title={t('Discussion')}
      extra={
        !frozen ? (
          <Space size={8}>
            <Text id="discussion-open-label">{t('Discussion ouverte aux copropriétaires')}</Text>
            <Switch
              checked={discussion.open}
              loading={busyOpen}
              aria-labelledby="discussion-open-label"
              onChange={onToggleOpen}
            />
          </Space>
        ) : null
      }
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {frozen ? (
          <Text type="secondary">{t('Séance terminée : la discussion est en lecture seule.')}</Text>
        ) : !discussion.open ? (
          <Text type="secondary">
            {inProgress
              ? t('Discussion fermée aux copropriétaires : vous pouvez encore écrire.')
              : t('Discussion fermée aux copropriétaires')}
          </Text>
        ) : null}

        <div
          style={{ maxHeight: 320, overflowY: 'auto' }}
          role="log"
          aria-live="polite"
          tabIndex={0}
          aria-label={t('Messages de la discussion')}
        >
          {hasMessages ? (
            <ul style={{ margin: 0, padding: 0 }}>
              {discussion.messages.map(message => (
                <MessageRow
                  key={message.id}
                  message={message}
                  readOnly={frozen}
                  busy={busyMessageId === message.id}
                  onHide={onHide}
                />
              ))}
            </ul>
          ) : (
            <Text type="secondary">{t("Aucun message pour l'instant.")}</Text>
          )}
        </div>

        {inProgress && discussion.enabled ? (
          <DiscussionComposer canWrite maxLength={discussion.maxLength} send={onSend} bordered={false} />
        ) : null}
      </Space>
    </Card>
  );
};

export default MeetingDiscussionCard;
