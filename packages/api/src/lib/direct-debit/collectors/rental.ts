import type { DirectDebitCollector } from './types';

const notImplemented = () => new Error('Encaisseur RENTAL_LEASE : à réaliser (spec 042 §8.6)');

/** Encaisseur des loyers (bail) : corps à réaliser, voir data-model §8.6. */
export const rentalCollector: DirectDebitCollector = {
  scope: 'RENTAL_LEASE',
  keepsActiveKeyOnSettle: true,
  async settleTx() {
    throw notImplemented();
  },
  async reverseTx() {
    throw notImplemented();
  },
  async applyRejectFeeTx() {
    throw notImplemented();
  }
};
