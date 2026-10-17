import type { DirectDebitCollector } from './types';

/**
 * Encaisseur SYNDIC_LOT (spec 042 §9.3) : ÉCHAFAUDAGE du lot P4.
 *
 * À réaliser : `settleTx` enregistre le paiement de charges
 * (`recordLotPaymentTx`, méthode et origine `DIRECT_DEBIT`) puis émet reçus et
 * quittances ; `reverseTx` refuse (aucune contre-passation d'un `ChargePayment`) ;
 * `applyRejectFeeTx` ne refacture rien.
 */
const notImplemented = (): never => {
  throw new Error('Encaisseur SYNDIC_LOT : à réaliser (spec 042 §9.3)');
};

export const syndicCollector: DirectDebitCollector = {
  scope: 'SYNDIC_LOT',
  // Le lot redevient prélevable pour ses appels suivants une fois la ligne réglée.
  keepsActiveKeyOnSettle: false,
  settleTx: async () => notImplemented(),
  reverseTx: async () => notImplemented(),
  applyRejectFeeTx: async () => notImplemented()
};
