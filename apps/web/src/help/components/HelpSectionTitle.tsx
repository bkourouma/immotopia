import React from 'react';
import { HelpButton } from './HelpButton';

export interface HelpSectionTitleProps {
  title: React.ReactNode;
  helpId: string;
}

/** Titre de section suivi du « ? » de sa fiche d'aide. */
export function HelpSectionTitle({ title, helpId }: HelpSectionTitleProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      {title}
      <HelpButton size="small" helpId={helpId} />
    </span>
  );
}

export default HelpSectionTitle;
