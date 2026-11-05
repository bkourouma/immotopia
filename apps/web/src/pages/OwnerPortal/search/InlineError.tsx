import { Alert } from 'antd';
import { t } from '../../../i18n/t';

/** Erreur affichée dans la carte de la liste : la barre de recherche reste accessible. */
export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert
      message={t('Erreur')}
      description={message}
      type="error"
      showIcon
      style={{ marginBottom: 'var(--space-4)' }}
    />
  );
}
