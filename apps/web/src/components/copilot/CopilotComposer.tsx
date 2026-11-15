import React, { useRef, useState } from 'react';
import { AudioOutlined, PaperClipOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Input, Space } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { appendDictation, useSpeechDictation } from '../../hooks/useSpeechDictation';
import { useRecordedDictation } from '../../hooks/useRecordedDictation';
import { t } from '../../i18n/t';
import { useLanguage } from '../../i18n/useLanguage';

export interface CopilotComposerProps {
  value: string;
  onChange(value: string): void;
  /** Reçoit le texte brut ; l'appelant le nettoie et ignore le vide. */
  onSubmit(value: string): void;
  onStop(): void;
  streaming: boolean;
  transcribe?(audio: Blob, signal: AbortSignal, durationSeconds: number): Promise<string>;
  files?: File[];
  onFilesChange?(files: File[]): void;
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
  transcribe,
  files = [],
  onFilesChange,
  maxChars,
  maxRows = 8,
  inputRef
}) => {
  const { language } = useLanguage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState('');
  function addFiles(selection: FileList | null) {
    if (!selection?.length) return;
    const pending = [...files, ...Array.from(selection)];
    if (
      pending.length > 5 ||
      pending.some(file => file.size === 0 || file.size > 10 * 1024 * 1024 || !/\.(csv|txt|xlsx|pdf)$/i.test(file.name))
    ) {
      setFileError(t('Ajoutez jusqu’à cinq fichiers CSV, TXT, XLSX ou PDF de 10 Mo chacun.'));
      return;
    }
    setFileError('');
    onFilesChange?.(pending);
  }
  const dictation = useSpeechDictation({
    language,
    onFinal: text => onChange(appendDictation(value, text))
  });
  const recorded = useRecordedDictation(dictation.supported ? undefined : transcribe, text => {
    onChange(appendDictation(value, text).slice(0, maxChars));
  });
  const listening = dictation.listening || recorded.phase === 'recording';
  const recordingBusy = recorded.phase !== 'idle';
  const dictationError = dictation.error || recorded.error;
  const microphoneLabel = listening ? t('Arrêter la dictée') : t('Dicter un message');
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
            if (!streaming && !recordingBusy && (value.trim() || files.length)) onSubmit(value);
          }
        }}
        maxLength={maxChars}
        autoSize={{ minRows: 1, maxRows }}
        placeholder={dictation.listening ? t('Parlez, je vous écoute…') : t('Écrivez votre message…')}
        aria-label={t('Votre message')}
        style={{ resize: 'none', padding: 'var(--space-1) 0' }}
      />
      {onFilesChange && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,.xlsx,.pdf"
            multiple
            hidden
            onChange={event => {
              addFiles(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
          {fileError && <div role="alert">{fileError}</div>}
          {files.length > 0 && (
            <Space wrap style={{ marginBlockEnd: 8 }}>
              {files.map((file, index) => (
                <Button
                  key={index}
                  size="small"
                  disabled={streaming}
                  onClick={() => {
                    setFileError('');
                    onFilesChange(files.filter((_, i) => i !== index));
                  }}
                  aria-label={t('Retirer {{name}}', { name: file.name })}
                >
                  <span dir="auto">{file.name}</span> ×
                </Button>
              ))}
            </Space>
          )}
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {listening && (
            <span role="status" style={{ color: 'var(--color-danger, #cf1322)', fontSize: 'var(--text-sm, 13px)' }}>
              {t('Écoute en cours…')}
            </span>
          )}
          {recorded.phase === 'processing' && <span role="status">{t('Transcription en cours…')}</span>}
          {!listening && dictationError && (
            <span role="status" style={{ color: 'var(--text-secondary, #8c8c8c)', fontSize: 'var(--text-sm, 13px)' }}>
              {dictationError}
            </span>
          )}
        </div>
        {onFilesChange && (
          <Button
            type="text"
            shape="circle"
            icon={<PaperClipOutlined aria-hidden />}
            onClick={() => fileInput.current?.click()}
            disabled={streaming || files.length >= 5}
            aria-label={t('Joindre des fichiers')}
            title={t('Joindre des fichiers')}
          />
        )}
        {(dictation.supported || recorded.supported) && (
          <Button
            type={listening ? 'primary' : 'text'}
            danger={listening}
            shape="circle"
            icon={<AudioOutlined />}
            onClick={dictation.supported ? dictation.toggle : () => void recorded.toggle()}
            disabled={streaming || (recordingBusy && !listening)}
            aria-pressed={listening}
            aria-label={microphoneLabel}
            title={microphoneLabel}
          />
        )}
        {streaming ? (
          <Button shape="circle" icon={<StopOutlined />} onClick={onStop} aria-label={t('Arrêter la réponse')} />
        ) : (
          <Button
            type="primary"
            shape="circle"
            icon={<SendOutlined />}
            disabled={recordingBusy || (!value.trim() && files.length === 0)}
            onClick={() => onSubmit(value)}
            aria-label={t('Envoyer')}
          />
        )}
      </div>
    </div>
  );
};
