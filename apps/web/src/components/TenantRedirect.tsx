import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Redirection vers une destination d'agence (REFONTE_UI_UX.md §4.3).
 *
 * Trois fusions du Lot 1 laissent derrière elles des URL en circulation, qu'on
 * ne casse pas — on les redirige :
 *
 *   - **Clients → CRM › Contacts.** Deux listes de personnes, deux interfaces,
 *     deux emplacements de menu, pour la même entité. `/clients/new` était
 *     d'ailleurs *déjà* une redirection vers le formulaire de contact CRM.
 *   - **Transactions → Affaires CRM**, filtrées par type. La page n'affichait
 *     qu'un `Empty` et deux liens : trois clics pour atteindre l'information.
 *   - **Rapports → Relevés du Patrimoine.** Quatre cartes de redirection, rien
 *     d'autre.
 *
 * Sans appartenance à une agence, la redirection retombe sur le tableau de
 * bord plutôt que de construire une URL contenant `undefined`.
 */
export interface TenantRedirectProps {
  /** Chemin relatif à l'agence, sans barre initiale. */
  to: string;
  /** Paramètres de requête ajoutés à la destination. */
  query?: Record<string, string>;
  /** Paramètres de requête recopiés depuis l'URL d'origine, s'ils existent. */
  keepParams?: string[];
}

export const TenantRedirect: React.FC<TenantRedirectProps> = ({ to, query, keepParams }) => {
  const { tenantMembership } = useAuth();
  const [searchParams] = useSearchParams();

  const tenantId = tenantMembership?.tenantId;
  if (!tenantId) return <Navigate to="/dashboard" replace />;

  const params = new URLSearchParams(query);
  for (const key of keepParams ?? []) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }

  const suffix = params.toString();
  return <Navigate to={`/tenant/${tenantId}/${to}${suffix ? `?${suffix}` : ''}`} replace />;
};
