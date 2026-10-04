/**
 * Point d'entrée unique du lot 041 vers le lot 040 (inventaire et pièces jointes).
 *
 * Le lot 041 n'appelle le stock que par ces six éléments, dont le lot 040 a
 * figé les signatures (`specs/040-controle-stock/plan.md` §11). Ce module se
 * contente de les réexporter : tout le lot 041 les importe d'ici, ce qui permet
 * aux tests unitaires de simuler ce seul module (`jest.mock('…/lot040-bridge')`)
 * et au test d'intégration `stock-whatsapp-inventaire` de jouer le vrai code.
 */
export { createStockCountTx, setStockCountLineTx, closeStockCountTx } from '../finance/stock-inventaire';
export { detectStockFileKind, stripImageMetadata, sha256Hex } from '../finance/stock-pieces-jointes';
export type { StockFileKind } from '../finance/stock-pieces-jointes';
