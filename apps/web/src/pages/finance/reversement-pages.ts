/**
 * Relais de chargement des écrans de l'espace « Reversements et commissions ».
 *
 * Même raison que `stock-pages.ts` : un `import()` écrit dans `App.tsx` laisse
 * dans le chunk d'entrée (budget §8.1) le nom haché de l'écran, ceux de ses
 * chunks partagés et sa liste de dépendances à précharger, qui ne se compresse
 * presque pas. `App.tsx` charge paresseusement ce relais minuscule, qui porte
 * les `import()` des écrans ; chaque écran garde son propre chunk, et le relais
 * n'est téléchargé qu'une fois par session.
 */
import type { ComponentType } from 'react';

type LazyPage = Promise<{ default: ComponentType }>;

export const loadComptesProprietaires = (): LazyPage =>
  import('./ComptesProprietaires').then(m => ({ default: m.ComptesProprietaires }));
export const loadCompteProprietaire = (): LazyPage =>
  import('./CompteProprietaire').then(m => ({ default: m.CompteProprietaire }));
export const loadAssociations = (): LazyPage => import('./Associations').then(m => ({ default: m.Associations }));
export const loadAssociation = (): LazyPage => import('./Association').then(m => ({ default: m.Association }));
export const loadCommissionsAgents = (): LazyPage =>
  import('./CommissionsAgents').then(m => ({ default: m.CommissionsAgents }));
