import type { HelpEntry } from '../../types';
import caisse from './fr/caisse';
import comptabilite from './fr/comptabilite';
import facturation from './fr/facturation';
import fournisseurs from './fr/fournisseurs';
import chantiers from './fr/chantiers';
import stock from './fr/stock';
import stockControle from './fr/stock-controle';
import personnel from './fr/personnel';

/**
 * Fiches d'aide du module « finance » (fr) : simple concatenation des zones
 * de `./fr/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
 */
const entries: HelpEntry[] = [
  ...caisse,
  ...comptabilite,
  ...facturation,
  ...fournisseurs,
  ...chantiers,
  ...stock,
  ...stockControle,
  ...personnel
];

export default entries;
