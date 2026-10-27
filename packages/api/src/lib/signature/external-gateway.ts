import { listChainedEvents } from './events';

/**
 * Référence d'un signataire chez le prestataire externe (spec 042 §10, SIG-S6), relevée dans
 * l'événement CREATED de la demande (`providerSignerRefs`, par position). Ce n'est pas un secret :
 * seul le lien de signature, lu en direct chez le prestataire, en est un.
 */
export async function providerSignerRef(tenantId: string, requestId: string, position: number): Promise<string | null> {
  const events = await listChainedEvents(tenantId, requestId);
  const created = events.find(event => event.type === 'CREATED');
  const refs = (created?.payload as { providerSignerRefs?: unknown } | null)?.providerSignerRefs;
  if (!Array.isArray(refs)) return null;
  const ref = refs[position];
  return typeof ref === 'string' && ref ? ref : null;
}
