import { env } from '../../../config/env';
import type { SignatureProvider } from '../types';
import { createDisabledProvider, signatureDisabledError } from './disabled';
import { createInternalProvider } from './internal';
import { createLogProvider } from './log';

/**
 * Choix du fournisseur de signature (spec 044, SG-R13), selon
 * `env.SIGNATURE_PROVIDER` (`disabled` par défaut). Fabrique mise en cache,
 * comme `lib/stock-whatsapp/transport`.
 */

let cached: { id: string; provider: SignatureProvider } | null = null;

export function getSignatureProvider(): SignatureProvider {
  const id = env.SIGNATURE_PROVIDER;
  if (cached && cached.id === id) return cached.provider;
  const provider =
    id === 'internal' ? createInternalProvider() : id === 'log' ? createLogProvider() : createDisabledProvider();
  cached = { id, provider };
  return provider;
}

/** Oublie le fournisseur mémorisé (tests qui changent `env`). */
export function resetSignatureProviderForTests(): void {
  cached = null;
}

/** Refuse clairement toute demande quand le fournisseur est `disabled`. */
export function assertSignatureProviderEnabled(): SignatureProvider {
  const provider = getSignatureProvider();
  if (provider.id === 'disabled') throw signatureDisabledError();
  return provider;
}
