/**
 * Relais de chargement des écrans de l'espace « Fournisseurs et commandes ».
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

export const loadFournisseurs = (): LazyPage => import('./Fournisseurs').then(m => ({ default: m.Fournisseurs }));
export const loadBalanceFournisseurs = (): LazyPage =>
  import('./BalanceFournisseurs').then(m => ({ default: m.BalanceFournisseurs }));
export const loadFactureFournisseur = (): LazyPage =>
  import('./FactureFournisseur').then(m => ({ default: m.FactureFournisseur }));
export const loadBonsDeCommande = (): LazyPage => import('./BonsDeCommande').then(m => ({ default: m.BonsDeCommande }));
export const loadBonDeCommande = (): LazyPage => import('./BonDeCommande').then(m => ({ default: m.BonDeCommande }));
