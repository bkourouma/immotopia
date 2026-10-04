import React from 'react';
import { PageHeader } from '../../components/primitives/PageHeader';
import { t } from '../../i18n/t';

/**
 * Squelette posé par l'étape des fondations du lot 040 (plan.md §3.1) : un
 * composant nommé qui rend son en-tête, pour que `App.tsx` compile dès l'étape
 * 1. Le contenu de l'écran appartient au territoire WEB-2 (ecrans.md).
 */
export function StockMagasin(): React.ReactElement {
  return (
    <PageHeader
      title={t('Magasin')}
      subtitle={t('Recevoir, sortir, transférer et compter le stock depuis le terrain.')}
    />
  );
}

export default StockMagasin;
