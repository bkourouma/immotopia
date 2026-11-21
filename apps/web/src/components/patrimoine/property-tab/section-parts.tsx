import React from 'react';
import { StateBlock } from '../../primitives';
import { t } from '../../../i18n/t';

/** Précision commune aux suppressions de l'onglet : il n'y a pas de corbeille. */
export const SUPPRESSION_DEFINITIVE = (): string => t('Cette suppression est définitive.');

/** Erreur de chargement d'une rubrique, posée à l'endroit des données absentes. */
export const SectionError: React.FC<{ title: string; detail?: string; onRetry?: () => void }> = ({
  title,
  detail,
  onRetry
}) => <StateBlock variant="error" title={title} detail={detail} onRetry={onRetry} />;

/** État vide d'une rubrique, avec l'action utile (secondaire : le bouton d'en-tête reste l'action primaire). */
export const SectionEmpty: React.FC<{ title: string; addLabel: string; onAdd?: () => void }> = ({
  title,
  addLabel,
  onAdd
}) => <StateBlock variant="empty" title={title} actions={onAdd ? [{ label: addLabel, onClick: onAdd }] : []} />;

/** Props communes des champs de montant : séparateurs de milliers, saisie numérique au clavier mobile. */
export const montantProps = {
  min: 0,
  style: { width: '100%' },
  inputMode: 'decimal' as const,
  formatter: (value: string | number | undefined) => {
    if (value === undefined || value === null || value === '') return '';
    const [entier, decimales] = `${value}`.split('.');
    const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return decimales === undefined ? groupe : `${groupe}.${decimales}`;
  },
  parser: (value: string | undefined) => (value ?? '').replace(/\s/g, '')
};
