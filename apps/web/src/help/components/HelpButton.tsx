import React from 'react';
import { Button } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { t } from '../../i18n/t';
import { useHelp } from '../help-context';
import { useHelpEntry } from '../registry';

export interface HelpButtonProps {
  helpId: string;
  size?: 'small' | 'middle' | 'large';
  /** Texte visible a cote de l'icone. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Petit « ? » qui ouvre la fiche d'aide `helpId` dans le panneau. */
export function HelpButton({ helpId, size = 'middle', label, className, style }: HelpButtonProps) {
  const { available, openHelp } = useHelp();
  const { entry, status } = useHelpEntry(available ? helpId : null);

  if (!available) return null;

  if (status === 'missing') {
    if (!import.meta.env.DEV) return null;
    return (
      <span
        data-testid="help-missing"
        title={`${t('aide manquante')} : ${helpId}`}
        style={{
          fontSize: 'var(--font-size-xs, 11px)',
          color: 'var(--color-text-tertiary, #8c8c8c)',
          border: '1px dashed currentColor',
          borderRadius: 4,
          padding: '0 4px'
        }}
      >
        {t('aide manquante')}
      </span>
    );
  }

  if (status !== 'ready' || !entry) return null;

  const tooltip = `${t('Aide')} : ${entry.title}`;
  const small = size === 'small';
  return (
    <Button
      type="text"
      size={size}
      className={className}
      icon={<QuestionCircleOutlined />}
      aria-label={tooltip}
      aria-haspopup="dialog"
      title={tooltip}
      data-help-id={helpId}
      onClick={event => {
        event.stopPropagation();
        openHelp(helpId);
      }}
      style={{
        minWidth: small ? 24 : 32,
        minHeight: small ? 24 : 32,
        ...(small ? { padding: 0 } : null),
        ...style
      }}
    >
      {label}
    </Button>
  );
}

export default HelpButton;
