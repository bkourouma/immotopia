/**
 * Point d'entrée des sources de document signables (spec 044) : importe les
 * enregistrements (`register.ts`) puis expose le registre. Tout code du noyau
 * passe par ici, jamais par un fichier de source directement.
 */
import './register';

export {
  findSignatureSource,
  getSignatureSource,
  registeredSignatureKinds,
  registerSignatureSource,
  resetSignatureSourcesForTests
} from './registry';
export { SourceChangedError } from './types';
export type {
  DefaultSigner,
  LoadedSource,
  SignatureDocumentSource,
  SourceCancelReason,
  SourceCtx,
  SourceRequestView
} from './types';
