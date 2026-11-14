import type { HelpEntry } from '../../types';
import accueil from './fr/accueil';
import entites from './fr/entites';
import actifs from './fr/actifs';
import projections from './fr/projections';
import releves from './fr/releves';
import importation from './fr/importation';
import terrains from './fr/terrains';
import assurances from './fr/assurances';
import accestiers from './fr/acces-tiers';
import bien from './fr/bien';

/**
 * Fiches d'aide du module « patrimoine » (fr) : simple concatenation des zones
 * de `./fr/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
