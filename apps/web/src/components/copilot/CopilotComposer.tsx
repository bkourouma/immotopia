import React from 'react';
import { AudioOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { appendDictation, useSpeechDictation } from '../../hooks/useSpeechDictation';
import { t } from '../../i18n/t';
import { useLanguage } from '../../i18n/useLanguage';

export interface CopilotComposerProps {
  value: string;
  onChange(value: string): void;
  /** Reçoit le texte brut ; l'appelant le nettoie et ignore le vide. */
  onSubmit(value: string): void;
  onStop(): void;
  streaming: boolean;
  maxChars?: number;
  maxRows?: number;
  inputRef?: React.Ref<TextAreaRef>;
}

/**
 * Zone de saisie d'ImmoCopilot, commune au tiroir et à la page : Entrée envoie,
 * Maj+Entrée saute une ligne, la zone grandit avec le texte. Porte le bouton de
 * dictée (masqué si le navigateur n'a pas la Web Speech API).
 */
export const CopilotComposer: React.FC<CopilotComposerProps> = ({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  maxChars,
  maxRows = 8,
  inputRef
}) => {
  const { language } = useLanguage();
  const dictation = useSpeechDictation({
    language,
    onFinal: text => onChange(appendDictation(value, text))
  });
  // Le texte provisoire s'affiche à la suite de la saisie, sans y être encore écrit.
  const shown = dictation.interim ? appendDictation(value, dictation.interim) : value;

  return (
    <div
      style={{
        border: '1px solid var(--border-subtle, #d9d9d9)',
        borderRadius: 'var(--radius-lg, 12px)',
        background: 'var(--surface-card, #fff)',
        padding: 'var(--space-2) var(--space-3)'
      }}
    >
      <Input.TextArea
        ref={inputRef}
        variant="borderless"
        value={shown}
        // Pendant la reconnaissance, le texte provisoire n'est pas éditable.
        onChange={e => {
          if (!dictation.interim) onChange(e.target.value);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!streaming) onSubmit(value);
          }
        }}
        maxLength={maxChars}
        autoSize={{ minRows: 1, maxRows }}
        placeholder={dictation.listening ? t('Parlez, je vous écoute…') : t('Écrivez votre message…')}
        aria-label={t('Votre message')}
        style={{ resize: 'none', padding: 'var(--space-1) 0' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {dictation.listening && (
            <span role="status" style={{ color: 'var(--color-danger, #cf1322)', fontSize: 'var(--text-sm, 13px)' }}>
              {t('Écoute en cours…')}
            </span>
          )}
          {!dictation.listening && dictation.error && (
            <span role="status" style={{ color: 'var(--text-secondary, #8c8c8c)', fontSize: 'var(--text-sm, 13px)' }}>
              {dictation.error}
            </span>
          )}
        </div>
        {dictation.supported && (
          <Button
            type={dictation.listening ? 'primary' : 'text'}
            danger={dictation.listening}
            shape="circle"
            icon={<AudioOutlined />}
            onClick={dictation.toggle}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? t('Arrêter la dictée') : t('Dicter un message')}
            title={dictation.listening ? t('Arrêter la dictée') : t('Dicter un message')}
          />
        )}
        {streaming ? (
          <Button shape="circle" icon={<StopOutlined />} onClick={onStop} aria-label={t('Arrêter la réponse')} />
        ) : (
          <Button
            type="primary"
            shape="circle"
            icon={<SendOutlined />}
            disabled={!value.trim()}
            onClick={() => onSubmit(value)}
            aria-label={t('Envoyer')}
          />
        )}
      </div>
    </div>
  );
};
