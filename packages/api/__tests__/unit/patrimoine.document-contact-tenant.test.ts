/**
 * Balayage B6 (lib/patrimoine/queries.ts) — `createPropertyDocument` ecrit un
 * `ownerContactId` optionnel (CrmContact) recu du corps de la requete sans
 * jamais verifier qu'il appartient a la meme agence que le bien : un contact
 * d'une autre agence pouvait etre attache a un document patrimoine.
 */

const propertyFindFirst = jest.fn();
const contactFindFirst = jest.fn();
const documentCreate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: { findFirst: (...a: any[]) => propertyFindFirst(...a) },
    crmContact: { findFirst: (...a: any[]) => contactFindFirst(...a) },
    patrimonyDocument: { create: (...a: any[]) => documentCreate(...a) }
  }
}));

import { createPropertyDocument } from '../../src/lib/patrimoine/queries';

beforeEach(() => {
  jest.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: 'p1', tenantId: 'tenant-A' });
  documentCreate.mockResolvedValue({ id: 'doc-1' });
});

describe('createPropertyDocument — ownerContactId verifie par agence', () => {
  it("refuse un ownerContactId d'une autre agence", async () => {
    contactFindFirst.mockResolvedValue(null);

    await expect(
      createPropertyDocument('tenant-A', 'p1', {
        title: 'Titre de propriete',
        type: 'TITLE_DEED',
        fileUrl: '/uploads/doc.pdf',
        ownerContactId: 'contact-autre-agence'
      })
    ).rejects.toThrow();
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it('accepte un ownerContactId de la meme agence', async () => {
    contactFindFirst.mockResolvedValue({ id: 'contact-1' });

    const result = await createPropertyDocument('tenant-A', 'p1', {
      title: 'Titre de propriete',
      type: 'TITLE_DEED',
      fileUrl: '/uploads/doc.pdf',
      ownerContactId: 'contact-1'
    });

    expect(result.id).toBe('doc-1');
  });

  it('accepte l\'absence d\'ownerContactId (champ optionnel)', async () => {
    const result = await createPropertyDocument('tenant-A', 'p1', {
      title: 'Titre de propriete',
      type: 'TITLE_DEED',
      fileUrl: '/uploads/doc.pdf'
    });

    expect(result.id).toBe('doc-1');
    expect(contactFindFirst).not.toHaveBeenCalled();
  });
});
