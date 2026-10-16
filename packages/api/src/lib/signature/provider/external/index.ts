/**
 * Fabrique du client de signature externe (spec 044, lot S6). Pour ajouter un
 * prestataire : implémenter `ExternalSignatureClient`, l'enregistrer dans
 * `build()` et ajouter sa valeur à l'enum `SIGNATURE_PROVIDER` (config/env.ts).
 */
import { env } from '../../../../config/env';
import type { ExternalSignatureClient } from './types';
import { createYousignClient } from './yousign';

export * from './types';
export { createYousignClient } from './yousign';

let cached: ExternalSignatureClient | null | undefined;

function build(): ExternalSignatureClient | null {
  if (env.SIGNATURE_PROVIDER === 'yousign') {
    return createYousignClient({
      apiKey: env.YOUSIGN_API_KEY,
      baseUrl: env.YOUSIGN_API_BASE_URL,
      webhookSecret: env.YOUSIGN_WEBHOOK_SECRET,
      timeoutMs: env.SIGNATURE_PROVIDER_TIMEOUT_MS,
      signatureLevel: env.YOUSIGN_SIGNATURE_LEVEL
    });
  }
  return null;
}

/** Niveaux de signature qui rendent le fournisseur « qualifié » au sens de SG-R1 (avancé ou qualifié). */
export function isQualifiedSignatureLevel(level: string): boolean {
  return level === 'advanced_electronic_signature' || level === 'qualified_electronic_signature';
}

/** Client du prestataire externe configuré, ou null (fournisseur interne, log ou désactivé). */
export function getExternalSignatureClient(): ExternalSignatureClient | null {
  if (cached === undefined) cached = build();
  return cached;
}

/** Client dont l'identifiant correspond au prestataire externe configuré, sinon null. */
export function getExternalSignatureClientById(id: string): ExternalSignatureClient | null {
  const client = getExternalSignatureClient();
  return client && client.id === id ? client : null;
}

export function resetExternalSignatureClientForTests(): void {
  cached = undefined;
}
