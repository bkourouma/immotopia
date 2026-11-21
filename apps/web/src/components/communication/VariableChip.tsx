import React from 'react';
import { Tag } from 'antd';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { t } from '../../i18n/t';

export interface VariableChipProps {
  /** Nom de la variable, sans accolades. */
  name: string;
  /** Appelé au clic, à Entrée ou à Espace. Absent : la pastille reste inerte (lecture seule). */
  onActivate?: () => void;
  /** Aide au survol (description de la variable). */
  title?: string;
  /** Le clic copie la variable au lieu de l'insérer (libellé accessible adapté). */
  copy?: boolean;
}

/**
 * Pastille de variable `{{nom}}` utilisable au clavier et au doigt.
 *
 * L'ancienne pastille était un `<Tag onClick>` : impossible à atteindre avec
 * Tab, et trop basse pour le doigt. Ici : rôle bouton, `tabIndex`, activation
 * à Entrée/Espace, et hauteur d'au moins 44 px sous 992 px.
 */
export const VariableChip: React.FC<VariableChipProps> = ({ name, onActivate, title, copy = false }) => {
  const { isDesktop } = useBreakpoint();
  const label = `{{${name}}}`;

  if (!onActivate) {
    return <Tag style={{ marginBottom: 4 }}>{label}</Tag>;
  }

  return (
    <Tag
      role="button"
      tabIndex={0}
      title={title}
      aria-label={copy ? t('Copier la variable {{name}}', { name }) : t('Insérer la variable {{name}}', { name })}
      onClick={onActivate}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      style={{
        cursor: 'pointer',
        marginBottom: 4,
        ...(isDesktop ? {} : { minHeight: 44, display: 'inline-flex', alignItems: 'center', paddingInline: 12 })
      }}
    >
      {label}
    </Tag>
  );
};
