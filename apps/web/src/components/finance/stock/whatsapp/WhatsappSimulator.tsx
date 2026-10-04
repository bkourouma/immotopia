import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Select, Space, Typography, Upload } from 'antd';
import { CameraOutlined, ClockCircleOutlined, SendOutlined } from '@ant-design/icons';
import {
  advanceStockWhatsappSimulatorClock,
  getStockWhatsappSimulatorConversation,
  injectStockWhatsappSimulatorMessage
} from '../../../../services/finance-stock-whatsapp-service';
import type {
  ConversationMessage,
  RegistrationView,
  SessionView,
  SimulatorPhotoMessage,
  SimulatorTextOrReply
} from '../../../../types/finance-stock-whatsapp-types';
import { handleApiError } from '../../../../utils/error-handler';
import { t } from '../../../../i18n/t';
import { ConversationThread } from './ConversationThread';
import { apiErrorOf, registrationStatusDisplay, sessionStateLabel } from './whatsapp-labels';

/** Valeur du choix « Numéro inconnu » dans la liste des expéditeurs. */
const FREE_PHONE = '__numero_libre__';
const POLL_EVERY_MS = 2_000;
const POLL_DURING_MS = 30_000;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface WhatsappSimulatorProps {
  tenantId: string;
  registrations: RegistrationView[];
}

type Target = { registrationId?: string; freePhone?: string };

/** Fusionne une relecture incrémentale (`after`) dans le fil, sans doublon. */
function mergeMessages(current: ConversationMessage[], incoming: ConversationMessage[]): ConversationMessage[] {
  if (incoming.length === 0) return current;
  const vus = new Set(current.map(message => message.id));
  const ajout = incoming.filter(message => !vus.has(message.id));
  if (ajout.length === 0) return current;
  return [...current, ...ajout].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Sous-onglet « Simulateur » (ecrans §5.3) — transport `log` seulement : la
 * page ne le monte que si `overview.simulatorAvailable` est vrai.
 *
 * Fil relu après chaque envoi, puis toutes les 2 s pendant 30 s
 * (`?after=` : relecture incrémentale).
 */
export const WhatsappSimulator: React.FC<WhatsappSimulatorProps> = ({ tenantId, registrations }) => {
  const { message } = App.useApp();
  // Inscriptions révoquées en fin de liste : elles servent à jouer le refus M06.
  const ordered = [
    ...registrations.filter(registration => registration.status !== 'REVOKED'),
    ...registrations.filter(registration => registration.status === 'REVOKED')
  ];
  const [sender, setSender] = useState<string | undefined>(ordered[0]?.id);
  const [sendRefused, setSendRefused] = useState<string | null>(null);
  const [freePhone, setFreePhone] = useState('');
  const [text, setText] = useState('');
  const [caption, setCaption] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [session, setSession] = useState<SessionView | null>(null);
  const [sending, setSending] = useState(false);

  const target: Target | null =
    sender === FREE_PHONE
      ? freePhone.trim()
        ? { freePhone: freePhone.trim() }
        : null
      : sender
        ? { registrationId: sender }
        : null;
  const targetKey = target ? (target.registrationId ?? `libre:${target.freePhone}`) : '';
  const senderRevoked = registrations.some(
    registration => registration.id === sender && registration.status === 'REVOKED'
  );

  const lastAt = useRef<string | undefined>(undefined);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<Target | null>(target);
  targetRef.current = target;

  const refresh = useCallback(
    async (full = false) => {
      const cible = targetRef.current;
      if (!cible) return;
      try {
        const conversation = await getStockWhatsappSimulatorConversation(tenantId, {
          ...cible,
          after: full ? undefined : lastAt.current
        });
        const recus = conversation.messages ?? [];
        setMessages(prev => {
          const fusion = full ? mergeMessages([], recus) : mergeMessages(prev, recus);
          lastAt.current = fusion.length > 0 ? fusion[fusion.length - 1].createdAt : undefined;
          return fusion;
        });
        if (conversation.session !== undefined) setSession(conversation.session ?? null);
      } catch (error) {
        message.error(handleApiError(error));
      }
    },
    [tenantId, message]
  );

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (pollStop.current) clearTimeout(pollStop.current);
    pollTimer.current = null;
    pollStop.current = null;
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimer.current = setInterval(() => void refresh(), POLL_EVERY_MS);
    pollStop.current = setTimeout(stopPolling, POLL_DURING_MS);
  }, [refresh, stopPolling]);

  // Changement d'expéditeur : fil relu en entier.
  useEffect(() => {
    stopPolling();
    lastAt.current = undefined;
    setMessages([]);
    setSession(null);
    setSendRefused(null);
    if (targetKey) void refresh(true);
  }, [targetKey, refresh, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const send = async (
    payload:
      | Omit<SimulatorTextOrReply, 'registrationId' | 'freePhone'>
      | Omit<SimulatorPhotoMessage, 'registrationId' | 'freePhone'>
  ) => {
    if (!target) return false;
    setSending(true);
    try {
      await injectStockWhatsappSimulatorMessage(tenantId, { ...target, ...payload } as
        SimulatorTextOrReply | SimulatorPhotoMessage);
      setSendRefused(null);
      await refresh();
      startPolling();
      return true;
    } catch (error) {
      // Refus du serveur (numéro inscrit, inscription révoquée dont le numéro
      // est actif ailleurs…) : affiché sous l'expéditeur, jusqu'au prochain envoi.
      setSendRefused(apiErrorOf(error).message ?? handleApiError(error));
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendText = async () => {
    const contenu = text.trim();
    if (!contenu) return;
    if (await send({ text: contenu })) setText('');
  };

  const sendPhoto = async (file: File) => {
    if (!PHOTO_TYPES.includes(file.type)) {
      message.error(t('Format refusé : JPEG, PNG ou WebP seulement.'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      message.error(t('Photo trop lourde : 10 Mo au plus.'));
      return;
    }
    if (await send({ file, fileName: file.name, caption: caption.trim() || undefined })) setCaption('');
  };

  const advance = async (minutes: 10 | 30) => {
    if (!session) return;
    setSending(true);
    try {
      await advanceStockWhatsappSimulatorClock(tenantId, session.id, { minutes });
      await refresh();
      startPolling();
    } catch (error) {
      message.error(apiErrorOf(error).message ?? handleApiError(error));
    } finally {
      setSending(false);
    }
  };

  const sessionOuverte = Boolean(session && session.state !== 'CLOSED');

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert type="warning" showIcon title={t('Simulateur de recette : les messages ne partent pas sur WhatsApp.')} />

      <Form layout="vertical">
        <Form.Item label={t('Expéditeur')}>
          <Select
            value={sender}
            onChange={value => setSender(value)}
            options={[
              ...ordered.map(registration => ({
                value: registration.id,
                label: `${registration.userLabel} — ${registrationStatusDisplay(registration.status).label}`
              })),
              { value: FREE_PHONE, label: t('Numéro inconnu') }
            ]}
            aria-label={t('Expéditeur')}
          />
        </Form.Item>
        {sender === FREE_PHONE && (
          <Form.Item label={t('Numéro de l’expéditeur')}>
            <Input
              inputMode="tel"
              maxLength={40}
              value={freePhone}
              onChange={event => setFreePhone(event.target.value)}
            />
          </Form.Item>
        )}
        {senderRevoked && (
          <Alert
            type="info"
            showIcon
            title={t('Inscription révoquée : le bot doit répondre que l’accès est retiré.')}
          />
        )}
      </Form>

      {sendRefused && (
        <Alert
          type="error"
          showIcon
          closable={{ onClose: () => setSendRefused(null) }}
          title={t('Message refusé par le serveur')}
          description={sendRefused}
        />
      )}

      <Card
        size="small"
        title={t('Conversation')}
        extra={
          session ? <Typography.Text type="secondary">{sessionStateLabel(session.state)}</Typography.Text> : undefined
        }
      >
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <ConversationThread
            messages={messages}
            replyDisabled={sending || !target}
            onReply={item => void send({ replyId: item.id, replyTitle: item.title })}
          />
        </div>
      </Card>

      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder={t('Écrire un message')}
          aria-label={t('Écrire un message')}
          maxLength={1000}
          value={text}
          disabled={!target}
          onChange={event => setText(event.target.value)}
          onPressEnter={() => void sendText()}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={sending}
          disabled={!target || !text.trim()}
          onClick={() => void sendText()}
        >
          {t('Envoyer')}
        </Button>
      </Space.Compact>

      <Form layout="vertical">
        <Form.Item
          label={t('Légende')}
          extra={t(
            'Le fournisseur de recette lit les directives fake:… de la légende (fake:dark, fake:unknown, fake:item=REF;total=60;conf=0.5).'
          )}
        >
          <Input maxLength={200} value={caption} onChange={event => setCaption(event.target.value)} />
        </Form.Item>
        <Upload
          accept="image/jpeg,image/png,image/webp"
          showUploadList={false}
          disabled={!target || sending}
          beforeUpload={file => {
            void sendPhoto(file);
            return Upload.LIST_IGNORE;
          }}
        >
          <Button icon={<CameraOutlined />} disabled={!target || sending}>
            {t('Envoyer une photo')}
          </Button>
        </Upload>
      </Form>

      {sessionOuverte && (
        <Space wrap>
          <Button icon={<ClockCircleOutlined />} disabled={sending} onClick={() => void advance(10)}>
            {t('Avancer de 10 minutes')}
          </Button>
          <Button icon={<ClockCircleOutlined />} disabled={sending} onClick={() => void advance(30)}>
            {t('Avancer de 30 minutes')}
          </Button>
        </Space>
      )}
    </Space>
  );
};

export default WhatsappSimulator;
