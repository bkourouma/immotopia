/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Doublure de `lib/payment-gateway/availability` pour les tests qui simulent déjà la configuration
 * de la passerelle : disponible = `isConfigUsable(config)` (comportement d'avant le contrat 049 §2.8),
 * droit RENTAL toujours accordé. La règle durcie a ses propres tests (rental-online-availability).
 */
export function makeAvailabilityMock(getConfigModule: () => any) {
  const resolve = async (tenantId: string) => {
    const configModule = getConfigModule();
    const config = await configModule.loadConfig(tenantId);
    const usable = Boolean(configModule.isConfigUsable(config));
    return {
      usable,
      unavailableReason: usable ? null : 'NOT_CONFIGURED',
      mode: config?.mode ?? null,
      simulated: config?.mode === 'SIMULATOR',
      feesPaidBy: config?.feesPaidBy ?? null,
      simulatorAvailable: true,
      encryptionAvailable: true,
      config
    };
  };
  const unavailableError = () => {
    const { BadRequestError, ErrorCode } = jest.requireActual('../../src/middleware/error-middleware');
    const error = new BadRequestError("Le paiement en ligne n'est pas disponible pour cette agence.");
    error.code = ErrorCode.RENTAL_ONLINE_PAYMENT_UNAVAILABLE;
    return error;
  };
  return {
    rentalOnlineUnavailableError: unavailableError,
    resolveRentalOnlineAvailability: resolve,
    isRentalFeatureAllowed: async () => true,
    assertRentalOnlinePaymentAllowed: async () => undefined,
    assertRentalOnlinePaymentUsable: async (tenantId: string) => {
      const availability = await resolve(tenantId);
      if (!availability.usable) throw unavailableError();
      return availability;
    }
  };
}
