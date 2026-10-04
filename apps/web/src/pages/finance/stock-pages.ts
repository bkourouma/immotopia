/**
 * Relais de chargement des écrans de l'espace « Gestion du stock ».
 *
 * Pourquoi ce module existe : chaque `import()` écrit dans `App.tsx` laisse
 * dans le chunk d'entrée (budget §8.1, `scripts/measure-entry.mjs`) le nom
 * haché de l'écran, celui de chacun de ses chunks partagés propres, et la liste
 * de ses ~70 dépendances à précharger. Ces listes d'index ne se compressent
 * presque pas : les trois écrans du lot 040 coûtaient à eux seuls plusieurs
 * centaines d'octets gzip au premier rendu de /login.
 *
 * `App.tsx` importe donc paresseusement CE module, minuscule, et c'est lui qui
 * porte les `import()` des écrans : leurs listes de préchargement vivent dans
 * son chunk, chargé seulement quand on ouvre un écran du stock. Chaque écran
 * garde son propre chunk. Un nouvel onglet du stock s'ajoute ICI, pas dans
 * `App.tsx`, et ne coûte alors plus rien au chemin critique.
 */
import type { ComponentType } from 'react';

type LazyPage = Promise<{ default: ComponentType }>;

export const loadStock = (): LazyPage => import('./Stock').then(m => ({ default: m.Stock }));
export const loadStockMagasin = (): LazyPage => import('./StockMagasin').then(m => ({ default: m.StockMagasin }));
export const loadStockInventaire = (): LazyPage =>
  import('./StockInventaire').then(m => ({ default: m.StockInventaire }));
export const loadStockPreneurs = (): LazyPage => import('./StockPreneurs').then(m => ({ default: m.StockPreneurs }));
export const loadStockControle = (): LazyPage => import('./StockControle').then(m => ({ default: m.StockControle }));
export const loadStockReferentiel = (): LazyPage =>
  import('./StockReferentiel').then(m => ({ default: m.StockReferentiel }));
export const loadStockChantier = (): LazyPage => import('./StockChantier').then(m => ({ default: m.StockChantier }));
