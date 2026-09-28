import { prisma } from '../../utils/database';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { assertFundCurrency, assertFundOfSyndicate } from './fund-credits';

/**
 * Affectation d'un appel de charges ou d'un poste de budget a un fonds de la
 * copropriete (`fund-credits.ts` pour la regle de credit).
 *
 * Le changement vaut pour les sommes affectees ENSUITE a l'appel : les credits
 * deja passes au journal du fonds ne sont ni annules ni recalcules. `fundId`
 * nul retire l'affectation.
 *
 * Isolation : l'appel, le poste et le fonds doivent appartenir a la
 * copropriete de l'agence ; sinon la meme 404 qu'un objet inexistant.
 */

export async function setChargeCallFundByTenant(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string,
  fundId: string | null,
  actorUserId?: string | null
) {
  const call = await prisma.chargeCall.findFirst({
    where: { id: chargeCallId, syndicateId, syndicate: { tenantId } },
    select: { id: true, currency: true, fundId: true }
  });
  if (!call) throw new NotFoundError('Appel de charges introuvable ou inaccessible');
  if (fundId) {
    const fund = await assertFundOfSyndicate(prisma, tenantId, syndicateId, fundId);
    assertFundCurrency(fund, call.currency);
  }

  const updated = await prisma.chargeCall.update({
    where: { id: call.id },
    data: { fundId },
    select: { id: true, fundId: true }
  });
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SYNDICATE_FUND_ASSIGNMENT_CHANGED,
      entityType: 'CHARGE_CALL',
      entityId: call.id,
      payload: { syndicateId, previousFundId: call.fundId, fundId }
    });
  }
  return updated;
}

export async function setBudgetLineFundByTenant(
  tenantId: string,
  syndicateId: string,
  budgetId: string,
  lineId: string,
  fundId: string | null,
  actorUserId?: string | null
) {
  const line = await prisma.budgetLineItem.findFirst({
    where: { id: lineId, budgetId, budget: { syndicateId, syndicate: { tenantId } } },
    select: { id: true, fundId: true, budget: { select: { currency: true, status: true } } }
  });
  if (!line) throw new NotFoundError('Ligne budgétaire introuvable pour cette copropriété');
  if (line.budget.status === 'CLOSED') {
    throw new ConflictError('Budget clôturé : il ne peut plus être modifié.');
  }
  if (fundId) {
    const fund = await assertFundOfSyndicate(prisma, tenantId, syndicateId, fundId);
    assertFundCurrency(fund, line.budget.currency);
  }

  const updated = await prisma.budgetLineItem.update({
    where: { id: line.id },
    data: { fundId },
    select: { id: true, fundId: true }
  });
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SYNDICATE_FUND_ASSIGNMENT_CHANGED,
      entityType: 'BUDGET_LINE_ITEM',
      entityId: line.id,
      payload: { syndicateId, budgetId, previousFundId: line.fundId, fundId }
    });
  }
  return updated;
}
