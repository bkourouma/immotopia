import { SignatureDocumentKind } from '@prisma/client';
import { SIGNATURE_DOCUMENT_KINDS } from '../../src/config/env';

describe('types de document signables', () => {
  it("la liste littérale de la configuration reste alignée sur l'enum Prisma", () => {
    expect([...SIGNATURE_DOCUMENT_KINDS].sort()).toEqual(Object.values(SignatureDocumentKind).sort());
  });
});
