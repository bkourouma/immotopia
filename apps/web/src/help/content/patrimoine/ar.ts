import type { HelpEntry } from '../../types';
import accueil from './ar/accueil';
import entites from './ar/entites';
import actifs from './ar/actifs';
import projections from './ar/projections';
import releves from './ar/releves';
import importation from './ar/importation';
import terrains from './ar/terrains';
import assurances from './ar/assurances';
import accestiers from './ar/acces-tiers';
import bien from './ar/bien';

/**
 * Fiches d'aide du module « patrimoine » (ar) : simple concatenation des zones
 * de `./ar/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [
  ...accueil,
  ...entites,
  ...actifs,
  ...projections,
  ...releves,
  ...importation,
  ...terrains,
  ...assurances,
  ...accestiers,
  ...bien
];

export default entries;
