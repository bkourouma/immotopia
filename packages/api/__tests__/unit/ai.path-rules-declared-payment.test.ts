import { isSensitivePath } from '../../src/lib/ai/gateway/path-rules';
import { getCatalogEntries } from '../../src/lib/ai/gateway/catalog';

/**
 * Spec 047 : les numéros de réception mobile money (qui reçoivent l'argent) et les captures de
 * paiement ne sont jamais des lectures ou des écritures ordinaires de l'assistant.
 */
describe('passerelle IA : chemins sensibles du paiement déclaré', () => {
  const base = '/api/tenants/:tenantId/syndics/:syndicId';

  it.each([
    `${base}/numeros-reception`,
    `${base}/numeros-reception/:numberId`,
    `${base}/paiements-declares/:declarationId/preuve`
  ])('%s est sensible', path => {
    expect(isSensitivePath(path)).toBe(true);
  });

  it('les autres routes du paiement déclaré restent des chemins ordinaires', () => {
    expect(isSensitivePath(`${base}/paiements-declares`)).toBe(false);
    expect(isSensitivePath(`${base}/paiements-declares/reglages`)).toBe(false);
  });

  it('le catalogue commité marque comme sensibles les routes de numéros et de preuve qu’il contient', () => {
    const entries = getCatalogEntries().filter(
      entry => /numeros-reception|\/preuve$/.test(entry.path) && /syndics\/:syndicId/.test(entry.path)
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter(entry => !entry.sensitive).map(entry => entry.id)).toEqual([]);
  });
});

/** Locatif (contrat 049) : numéros de réception, compte d'encaissement, reversements, preuve, réglages, relances. */
describe('passerelle IA : chemins sensibles du paiement locatif', () => {
  const base = '/api/tenants/:tenantId/rental';

  it.each([
    `${base}/receiving-numbers`,
    `${base}/receiving-numbers/:numberId`,
    `${base}/online-payments/collection-account/payouts`,
    `${base}/collection-account`,
    `/api/tenants/:tenantId/owner-accounts/:ownerClientId/payouts`,
    `${base}/payment-declarations/:declarationId/proof`,
    `${base}/declared-payment/settings`,
    `${base}/payment-reminders`
  ])('%s est sensible', path => {
    expect(isSensitivePath(path)).toBe(true);
  });

  it('les déclarations elles-mêmes restent des chemins ordinaires', () => {
    expect(isSensitivePath(`${base}/payment-declarations`)).toBe(false);
    expect(isSensitivePath(`${base}/payment-declarations/:declarationId`)).toBe(false);
  });

  it('le catalogue commité ne contient aucune de ces routes en non sensible', () => {
    const entries = getCatalogEntries().filter(entry =>
      /\/rental\/(receiving-numbers|collection-account|declared-payment|payment-reminders)|\/payouts|payment-declarations\/:declarationId\/proof/.test(
        entry.path
      )
    );
    expect(entries.filter(entry => !entry.sensitive).map(entry => entry.id)).toEqual([]);
  });
});
