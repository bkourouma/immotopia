import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AssetDetailPage } from './AssetDetailPage';
import { AssetsPage } from './AssetsPage';
import { NetWorthPage } from './NetWorthPage';
import { ProjectionsPage } from './ProjectionsPage';
import { NotFound } from '../../components/primitives/NotFound';

/**
 * Point d'entrée unique des écrans du patrimoine multi-actifs (lot 1).
 *
 * `App.tsx` ne charge qu'un seul module différé pour les écrans (valeur nette, actifs, projections) : chaque
 * `React.lazy` supplémentaire y coûte des octets sur le chemin critique, dont le
 * budget est mesuré par `npm run measure:entry` (REFONTE_UI_UX.md §8.1).
 *
 * Routes descendantes, relatives au joker `patrimoine/*` d'`App.tsx` : elles
 * seules exposent `:assetId` à `useParams`. Avec `useMatch`, la fiche d'un
 * actif ne recevait pas son identifiant et restait vide.
 */
const PatrimoineAssetsRoutes: React.FC = () => (
  <Routes>
    <Route path="valeur-nette" element={<NetWorthPage />} />
    <Route path="projections" element={<ProjectionsPage />} />
    <Route path="actifs" element={<AssetsPage />} />
    <Route path="actifs/:assetId" element={<AssetDetailPage />} />
    {/* Tout autre chemin patrimoine inconnu : même écran que le joker global. */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default PatrimoineAssetsRoutes;
