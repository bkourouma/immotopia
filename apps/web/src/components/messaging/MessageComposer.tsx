import React, { useState } from 'react';
import { Button, Input } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { t } from '../../i18n/t';
import { MESSAGE_MAX_LENGTH } from '../../services/messaging-service';

interface MessageComposerProps {
  /** Rejette en cas d'échec : le texte est alors conservé. */
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
}

export function MessageComposer({ onSend, disabled }: MessageComposerProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const body = value.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    try {
      await onSend(body);
      setValue('');
    } catch {
      // Le parent signale l'erreur ; on garde le texte pour un nouvel essai.
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, padding: 12, alignItems: 'flex-end' }}>
      <Input.TextArea
        value={value}
        onChange={event => setValue(event.target.value.slice(0, MESSAGE_MAX_LENGTH))}
        onKeyDown={event => {
          // Entrée envoie, Maj+Entrée saute une ligne (une composition IME n'envoie pas).
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          }
        }}
        maxLength={MESSAGE_MAX_LENGTH}
        autoSize={{ minRows: 1, maxRows: 6 }}
        placeholder={t('Écrire un message')}
        aria-label={t('Écrire un message')}
        disabled={disabled}
      />
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={() => void submit()}
        loading={sending}
        disabled={disabled || value.trim().length === 0}
        aria-label={t('Envoyer')}
      />
    </div>
  );
}

export default MessageComposer;
