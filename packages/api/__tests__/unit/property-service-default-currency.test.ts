/**
 * Devise par défaut d'un bien : XOF (franc CFA), comme le schéma Prisma, et non EUR.
 * Garde de régression sur la source : `createProperty` charge trop de dépendances (Prisma,
 * abonnements, références) pour être exercée ici sans base.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('property-service : devise par défaut', () => {
  const source = readFileSync(join(__dirname, '../../src/services/property-service.ts'), 'utf8');

  it('retombe sur XOF quand aucune devise n’est fournie', () => {
    expect(source).toContain("currency: data.currency || 'XOF'");
  });

  it('ne retombe plus sur EUR', () => {
    expect(source).not.toMatch(/currency:[^\n]*\|\|\s*'EUR'/);
  });
});
