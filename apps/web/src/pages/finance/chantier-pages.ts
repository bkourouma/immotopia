/**
 * Relais de chargement des écrans de l'espace « Suivi des chantiers ».
 *
 * Même raison que `stock-pages.ts` : un `import()` écrit dans `App.tsx` laisse
 * dans le chunk d'entrée (budget §8.1) le nom haché de l'écran, ceux de ses
 * chunks partagés et sa liste de dépendances à précharger, qui ne se compresse
 * presque pas. `App.tsx` charge paresseusement ce relais minuscule, qui porte
 * les `import()` des écrans ; chaque écran garde son propre chunk.
 */
import type { ComponentType } from 'react';

type LazyPage = Promise<{ default: ComponentType }>;

export const loadChantiers = (): LazyPage => import('./Chantiers').then(m => ({ default: m.Chantiers }));
export const loadChantierDetail = (): LazyPage => import('./ChantierDetail').then(m => ({ default: m.ChantierDetail }));
export const loadBudgetChantier = (): LazyPage => import('./BudgetChantier').then(m => ({ default: m.BudgetChantier }));
export const loadClotureChantier = (): LazyPage =>
  import('./ClotureChantier').then(m => ({ default: m.ClotureChantier }));
export const loadTableauDeBordChantiers = (): LazyPage =>
  import('./TableauDeBordChantiers').then(m => ({ default: m.TableauDeBordChantiers }));
export const loadBauxDeTerrain = (): LazyPage => import('./BauxDeTerrain').then(m => ({ default: m.BauxDeTerrain }));
export const loadBailDeTerrain = (): LazyPage => import('./BailDeTerrain').then(m => ({ default: m.BailDeTerrain }));
