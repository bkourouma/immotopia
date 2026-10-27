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
