import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Ancienne adresse de la comptabilité de l'agence : `/finance/comptabilite`
 * affichait quatre onglets `?tab=`. Chaque onglet est désormais une sous-page
 * (`pages/finance/comptabilite/`) ; cette route ne fait que rediriger, pour
 * que les signets et les liens de `Caisse.tsx` et `Tresorerie.tsx` continuent
 * de marcher.
 *
 * `?tab=` désigne la sous-page (inconnu ou absent : le journal) et disparaît
 * de l'adresse ; tous les autres paramètres (`from`, `to`, `journal`,
 * `account`, `date-mandants`…) sont conservés tels quels.
 */

const SOUS_PAGE_PAR_ONGLET: Record<string, string> = {
  journal: 'journal',
  'grand-livre': 'grand-livre',
  'balance-generale': 'balance',
  mandants: 'mandants'
};

export const Comptabilite: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { search } = useLocation();

  const params = new URLSearchParams(search);
  const onglet = params.get('tab') ?? '';
  params.delete('tab');
  const sousPage = Object.prototype.hasOwnProperty.call(SOUS_PAGE_PAR_ONGLET, onglet)
    ? SOUS_PAGE_PAR_ONGLET[onglet]
    : 'journal';
  const reste = params.toString();

  return (
    <Navigate
      replace
      to={{
        pathname: `/tenant/${tenantId}/finance/comptabilite/${sousPage}`,
        search: reste ? `?${reste}` : ''
      }}
    />
  );
};

export default Comptabilite;
