import React from 'react';
import { PageHeader } from '../../components/primitives/PageHeader';
import { t } from '../../i18n/t';

/**
 * Squelette posé par l'étape des fondations du lot 041 (plan.md §3.1) : un
 * composant nommé qui rend son en-tête, pour que `App.tsx` compile dès l'étape
 * 1. Le contenu de l'écran (réconciliation, visualiseur de preuve) appartient
 * au territoire W5 (ecrans.md §3 et §4).
 */
export function StockComptagesTerrain(): React.ReactElement {
  return (
    <PageHeader
      title={t('Comptages terrain')}
      subtitle={t('Stock théorique et dernier comptage physique, par lieu et par article')}
    />
  );
}

export default StockComptagesTerrain;
