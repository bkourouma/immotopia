import React from 'react';
import { PageHeader } from '../../components/primitives/PageHeader';
import { t } from '../../i18n/t';

/**
 * Squelette posé par l'étape des fondations du lot 041 (plan.md §3.1) : un
 * composant nommé qui rend son en-tête, pour que `App.tsx` compile dès l'étape
 * 1. Le contenu de l'écran (onglet « WhatsApp » : inscriptions, quota,
 * passerelle, simulateur, mesures) appartient au territoire W5 (ecrans.md §5).
 */
export function StockWhatsapp(): React.ReactElement {
  return (
    <PageHeader
      title={t('Inventaire par WhatsApp')}
      subtitle={t('Chefs de chantier, quota du mois et état de la passerelle')}
    />
  );
}

export default StockWhatsapp;
