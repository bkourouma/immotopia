import { prisma } from '../../../utils/database';
import { NotFoundError } from '../../../middleware/error-middleware';

/**
 * Gardes de références du lot assurances (spec 032). Chaque identifiant reçu
 * d'une requête est cherché avec l'agence ET le bien attendus : une référence
 * d'une autre agence ou d'un autre bien lève la même `NotFoundError` qu'un
 * objet inexistant. Le bien lui-même est résolu par `getPropertyForTenant`
 * avant tout appel ici.
 */

export const NOT_FOUND_DOCUMENT = 'Document introuvable.';
export const NOT_FOUND_POLICY = "Police d'assurance introuvable.";
export const NOT_FOUND_TICKET = 'Ticket de maintenance introuvable.';
export const NOT_FOUND_EXPENSE = 'Dépense introuvable.';

/**
 * `null`/`undefined` : rien à vérifier. `PropertyDocument.tenantId` est nul sur
 * les anciennes lignes : le bien (déjà vérifié pour l'agence) en répond, comme
 * dans `lib/properties/document-files.ts`.
 */
export async function assertDocumentOfProperty(
  tenantId: string,
  propertyId: string,
  documentId: string | null | undefined
): Promise<void> {
  if (!documentId) return;
  const found = await prisma.propertyDocument.findFirst({
    where: { id: documentId, propertyId, OR: [{ tenantId }, { tenantId: null }] },
    select: { id: true }
  });
  if (!found) throw new NotFoundError(NOT_FOUND_DOCUMENT);
}

export async function assertPolicyOfProperty(tenantId: string, propertyId: string, policyId: string) {
  const policy = await prisma.insurancePolicy.findFirst({ where: { id: policyId, tenantId, propertyId } });
  if (!policy) throw new NotFoundError(NOT_FOUND_POLICY);
  return policy;
}

export async function assertTicketOfProperty(
  tenantId: string,
  propertyId: string,
  ticketId: string | null | undefined
): Promise<void> {
  if (!ticketId) return;
  const found = await prisma.maintenanceTicket.findFirst({
    where: { id: ticketId, tenant_id: tenantId, property_id: propertyId },
    select: { id: true }
  });
  if (!found) throw new NotFoundError(NOT_FOUND_TICKET);
}

export async function assertExpenseOfProperty(
  tenantId: string,
  propertyId: string,
  expenseId: string | null | undefined
): Promise<void> {
  if (!expenseId) return;
  const found = await prisma.propertyExpense.findFirst({
    where: { id: expenseId, tenantId, propertyId },
    select: { id: true }
  });
  if (!found) throw new NotFoundError(NOT_FOUND_EXPENSE);
}
