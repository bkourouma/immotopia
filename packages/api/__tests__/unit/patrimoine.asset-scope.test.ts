import { assetScopeData, assetScopeWhere } from '../../src/lib/patrimoine/asset-scope';

describe('asset-scope', () => {
  const realEstate = { id: 'asset-1', propertyId: 'property-1' };
  const other = { id: 'asset-2', propertyId: null };

  it('un actif immobilier lié à un bien filtre par propertyId', () => {
    expect(assetScopeWhere(realEstate)).toEqual({ propertyId: 'property-1' });
  });

  it('un autre actif filtre par assetId', () => {
    expect(assetScopeWhere(other)).toEqual({ assetId: 'asset-2' });
  });

  it("l'écriture pose une seule clé, jamais les deux", () => {
    expect(assetScopeData(realEstate)).toEqual({ propertyId: 'property-1' });
    expect(assetScopeData(other)).toEqual({ assetId: 'asset-2' });
    expect(Object.keys(assetScopeData(realEstate))).toHaveLength(1);
    expect(Object.keys(assetScopeData(other))).toHaveLength(1);
  });
});
