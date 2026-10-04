import React from 'react';
import { PageHeader } from '../../components/primitives/PageHeader';
import { t } from '../../i18n/t';

/**
 * Squelette posé par l'étape des fondations du lot 040 (plan.md §3.1) : un
 * composant nommé qui rend son en-tête, pour que `App.tsx` compile dès l'étape
 * 1. Le contenu de l'écran appartient au territoire WEB-3 (ecrans.md).
 */
export function StockControle(): React.ReactElement {
  return (
    <PageHeader title={t('Contrôle du stock')} subtitle={t('Alertes, indicateurs et réglages de contrôle du stock.')} />
  );
}

export default StockControle;
