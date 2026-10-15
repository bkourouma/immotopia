import type { SignatureDocumentKind } from '@prisma/client';
import { BadRequestError } from '../../../middleware/error-middleware';
import type { SignatureDocumentSource } from './types';

/**
 * Registre des sources de document signables (spec 043). Une source s'enregistre
 * en fin de son fichier (`registerSignatureSource(source)`) ; `sources/register.ts`
 * importe ces fichiers, une ligne par source.
 */
const sources = new Map<SignatureDocumentKind, SignatureDocumentSource>();

export function registerSignatureSource(source: SignatureDocumentSource): void {
  sources.set(source.kind, source);
}

/** Source d'un type de document, ou `undefined` s'il n'est pas (encore) signable. */
export function findSignatureSource(kind: string): SignatureDocumentSource | undefined {
  return sources.get(kind as SignatureDocumentKind);
}

/** Source d'un type de document ; 400 clair si aucune n'est enregistrée. */
export function getSignatureSource(kind: string): SignatureDocumentSource {
  const source = findSignatureSource(kind);
  if (!source) throw new BadRequestError('Ce type de document ne peut pas encore être signé.');
  return source;
}

export function registeredSignatureKinds(): SignatureDocumentKind[] {
  return [...sources.keys()];
}

/** Vide le registre (tests). */
export function resetSignatureSourcesForTests(): void {
  sources.clear();
}
