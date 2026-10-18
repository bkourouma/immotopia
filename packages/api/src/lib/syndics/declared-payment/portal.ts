import { t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import type { CoOwnerPortalScope } from '../coowner-portal';
import { cancelDeclaration } from './declaration-cancel';
import { createDeclaration, type CreateDeclarationInput } from './declaration-create';
import { getCoOwnerDeclaration, listCoOwnerDeclarations as listCoOwnerDeclarationsQuery } from './declaration-queries';
import { notifyDeclarationReceived } from './notifications';
import { getDeclaredPaymentAvailability } from './settings';
import {
  MAX_DECLARATION_AMOUNT,
  type CoOwnerDeclaration,
  type CoOwnerDeclaredAvailability,
  type DeclarationStatus,
  type Pagination
} from './types';

/**
 * Paiement mobile money déclaré, côté portail copropriétaire (spec 047, contrats §2).
 *
 * Aucun identifiant d'agence, de contact ou de copropriété n'est cru d'un corps :
 * l'agence et le périmètre viennent de la garde du portail (`scope`). Une copropriété,
 * un lot, un appel ou une déclaration hors de ce périmètre répond comme un objet
 * inexistant (404). Le droit SYNDIC de l'agence est vérifié par le moteur à la
 * création (403 `SYNDIC_FEATURE_DENIED`) ; en lecture, il rend `available: false`.
 */

function syndicateNotFound(): NotFoundError {
  return new NotFoundError(t('Copropriété introuvable ou inaccessible.'));
}

/** §2.1 : disponibilité du paiement déclaré pour UNE copropriété du périmètre. */
export async function getCoOwnerDeclaredAvailability(
  scope: CoOwnerPortalScope,
  syndicateId: string
): Promise<CoOwnerDeclaredAvailability> {
  if (!scope.syndicateIds.includes(syndicateId)) throw syndicateNotFound();

  const { available, settings, receivingNumbers } = await getDeclaredPaymentAvailability(scope.tenantId, syndicateId);
  return {
    syndicateId,
    available,
    // Aucun numéro n'est livré quand la copropriété n'accepte pas (encore) les déclarations.
    receivingNumbers: available ? receivingNumbers : [],
    payerInstructions: available ? settings.payerInstructions : null,
    proofRequired: settings.proofRequired,
    // PR3 : la lecture IA n'est pas encore branchée.
    aiPrefillAvailable: false,
    maxAmount: MAX_DECLARATION_AMOUNT
  };
}

/**
 * §2.4 : crée une déclaration `PENDING`. Le déclarant enregistré est le contact de la
 * session propriétaire du premier lot visé (contrats §2.4) ; un lot hors périmètre
 * lève le même 404 que sa copropriété inconnue, avant toute écriture.
 */
export async function createCoOwnerDeclaration(
  scope: CoOwnerPortalScope,
  body: CreateDeclarationInput & { syndicId: string },
  proof?: { buffer: Buffer; originalname?: string; mimetype?: string } | null
): Promise<CoOwnerDeclaration> {
  const { syndicId, ...input } = body;
  if (!scope.syndicateIds.includes(syndicId)) throw syndicateNotFound();

  const firstLotId = input.lines[0]?.lotId;
  const firstLot = scope.lots.find(lot => lot.lotId === firstLotId && lot.syndicateId === syndicId);
  if (!firstLot) throw new NotFoundError(t('Lot introuvable ou inaccessible pour cette copropriété.'));

  const { declarationId } = await createDeclaration({
    tenantId: scope.tenantId,
    syndicateId: syndicId,
    actor: { type: 'COOWNER', scope, contactId: firstLot.contactId },
    input,
    proof: proof ?? null
  });

  // Hors transaction, sans jamais lever : l'accusé ne conditionne pas la déclaration.
  notifyDeclarationReceived(scope.tenantId, declarationId);
  return getCoOwnerDeclaration(scope, declarationId);
}

/** §2.5 : déclarations dont toutes les lignes portent sur des lots du périmètre. */
export async function listCoOwnerDeclarations(
  scope: CoOwnerPortalScope,
  params: { status?: DeclarationStatus | 'ALL'; page?: number; limit?: number }
): Promise<{ items: CoOwnerDeclaration[]; pagination: Pagination }> {
  return listCoOwnerDeclarationsQuery(scope, {
    status: params.status && params.status !== 'ALL' ? params.status : undefined,
    page: params.page,
    limit: params.limit
  });
}

/** §2.6 : annulation par le déclarant, tant que la déclaration est en attente. */
export async function cancelCoOwnerDeclaration(
  scope: CoOwnerPortalScope,
  declarationId: string
): Promise<CoOwnerDeclaration> {
  await cancelDeclaration({ scope, declarationId });
  return getCoOwnerDeclaration(scope, declarationId);
}
