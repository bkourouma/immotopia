import type { SignatureProvider } from '../../types';
import type { ExternalSignatureClient } from './types';

/**
 * Adaptateur entre un client de prestataire externe (lot S6) et le contrat
 * `SignatureProvider` du noyau. Le prestataire invite lui-même les signataires :
 * `deliver` n'envoie donc rien. `qualified` (SG-R1) dépend du niveau de signature
 * demandé au prestataire : faux (signature simple) tant que le niveau n'est pas
 * avancé ou qualifié.
 */
export function createExternalProvider(
  client: ExternalSignatureClient,
  options: { qualified?: boolean } = {}
): SignatureProvider {
  return {
    id: client.id,
    qualified: options.qualified ?? false,
    external: client,
    async createRequest(input) {
      if (!input.external) throw new Error('EXTERNAL_INPUT_MISSING');
      const created = await client.create({
        requestId: input.requestId,
        title: input.external.title,
        pdf: input.external.pdf,
        language: input.external.language,
        sequential: input.external.sequential,
        expiresAt: input.external.expiresAt,
        signers: input.external.signers
      });
      return { providerRef: created.providerRef, signerRefs: created.signerRefs };
    },
    async cancel(_requestId, ctx) {
      if (!ctx?.providerRef) return;
      await client.cancel(ctx.providerRef);
    },
    async deliver() {
      return { ok: false, reason: 'UNSUPPORTED' };
    }
  };
}

export function isExternalProvider(provider: SignatureProvider): provider is SignatureProvider & {
  external: ExternalSignatureClient;
} {
  return Boolean(provider.external);
}
