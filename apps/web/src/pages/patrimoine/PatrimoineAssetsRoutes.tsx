import React from 'react';
import { useMatch } from 'react-router-dom';
import { AssetDetailPage } from './AssetDetailPage';
import { AssetsPage } from './AssetsPage';
import { NetWorthPage } from './NetWorthPage';
import { NotFound } from '../../components/primitives/NotFound';

/**
 * Point d'entrée unique des écrans du patrimoine multi-actifs (lot 1).
 *
 * `App.tsx` ne charge qu'un seul module différé pour les trois écrans : chaque
 * `React.lazy` supplémentaire y coûte des octets sur le chemin critique, dont le
 * budget est mesuré par `npm run measure:entry` (REFONTE_UI_UX.md §8.1).
 */
const PatrimoineAssetsRoutes: React.FC = () => {
  const isNetWorth = useMatch('/tenant/:tenantId/patrimoine/valeur-nette');
  const isList = useMatch('/tenant/:tenantId/patrimoine/actifs');
  const isDetail = useMatch('/tenant/:tenantId/patrimoine/actifs/:assetId');

  if (isNetWorth) return <NetWorthPage />;
  if (isList) return <AssetsPage />;
  if (isDetail) return <AssetDetailPage />;
  // Tout autre chemin patrimoine inconnu : même écran que le joker global.
  return <NotFound />;
};

export default PatrimoineAssetsRoutes;
