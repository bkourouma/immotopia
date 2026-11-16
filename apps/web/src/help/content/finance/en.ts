import type { HelpEntry } from '../../types';
import caisse from './en/caisse';
import comptabilite from './en/comptabilite';
import facturation from './en/facturation';
import fournisseurs from './en/fournisseurs';
import chantiers from './en/chantiers';
import stock from './en/stock';
import stockControle from './en/stock-controle';
import personnel from './en/personnel';

/**
 * Fiches d'aide du module « finance » (en) : simple concatenation des zones
 * de `./en/<zone>.ts` (voir docs/aide/GUIDE_REDACTION.md, « Decoupage par zone »).
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
