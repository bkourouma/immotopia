import type { HelpEntry } from '../../types';
import caisse from './ar/caisse';
import comptabilite from './ar/comptabilite';
import facturation from './ar/facturation';
import fournisseurs from './ar/fournisseurs';
import chantiers from './ar/chantiers';
import stock from './ar/stock';
import stockControle from './ar/stock-controle';
import personnel from './ar/personnel';

/**
 * Fiches d'aide du module « finance » (ar) : simple concatenation des zones
 * de `./ar/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
