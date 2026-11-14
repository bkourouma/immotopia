import type { HelpEntry } from '../../types';
import accueil from './en/accueil';
import entites from './en/entites';
import actifs from './en/actifs';
import projections from './en/projections';
import releves from './en/releves';
import importation from './en/importation';
import terrains from './en/terrains';
import assurances from './en/assurances';
import accestiers from './en/acces-tiers';
import bien from './en/bien';

/**
 * Fiches d'aide du module « patrimoine » (en) : simple concatenation des zones
 * de `./en/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
