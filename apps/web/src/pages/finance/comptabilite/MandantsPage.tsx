import React from 'react';
import { BalanceAuxiliaire } from './mandants/BalanceAuxiliaire';
import { GrandLivreAuxiliaire } from './mandants/GrandLivreAuxiliaire';
import { useMandantUrl } from './mandants/useMandantUrl';

/**
 * Mandants : grand livre auxiliaire (propriétaires puis détail à la demande)
 * et balance auxiliaire à une date. La vue est portée par l'URL (`vue`,
 * `grand-livre` par défaut) ; chaque vue pose son propre cadre comptable.
 */
export const MandantsPage: React.FC = () => {
  const { vue } = useMandantUrl();
  return vue === 'balance' ? <BalanceAuxiliaire /> : <GrandLivreAuxiliaire />;
};

export default MandantsPage;
