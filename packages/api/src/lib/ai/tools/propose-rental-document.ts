import { z } from 'zod';
import { DocumentType, RentalDocumentStatus, RentalDocumentType, RentalPaymentStatus } from '@prisma/client';
import { resolveTemplate } from '../../../services/document-template-service';
import { logAuditEvent } from '../../../services/audit-service';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { AuditActionKey } from '../../../types/audit-types';
import { currentLanguage, t } from '../../../i18n';
import type { ActionProposal, CopilotToolDefinition, DocumentCardItem, GenerateRentalDocumentArgs } from '../contracts';
import { signProposal } from '../proposal-token';
import { assertToolPermission, isoDay, loadLeaseSummary, outcome } from './tool-utils';

const PERMISSION = 'RENTAL_DOCUMENTS_GENERATE';
/** Le téléchargement de la carte exige aussi la lecture : sans elle, la proposition mènerait à un 403. */
const VIEW_PERMISSION = 'RENTAL_DOCUMENTS_VIEW';
/** Durée maximale d'un relevé, en mois. */
export const MAX_STATEMENT_MONTHS = 12;

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const inputSchema = z
  .object({
    docType: z.enum(['RENT_RECEIPT', 'RENT_STATEMENT']),
    leaseId: z.string().uuid(),
    period: z.string().regex(PERIOD).optional(),
    startDate: z.string().regex(DAY).optional(),
    endDate: z.string().regex(DAY).optional()
  })
  .strict();

type Input = z.infer<typeof inputSchema>;

type NotPossibleReason =
  | 'lease_not_seen'
  | 'NO_PAYMENT'
  | 'NO_INSTALLMENT'
  | 'NO_TEMPLATE'
  | 'MISSING_PERIOD'
  | 'INVALID_PERIOD'
  | 'PERIOD_TOO_LONG';

const notPossible = (reason: NotPossibleReason, hint: string) => outcome({ status: 'NOT_POSSIBLE', reason, hint });

function parseDay(value: string): Date | null {
  if (!DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat(currentLanguage(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`)
  );
}

/** Un modèle actif existe-t-il ? Le message de l'exception n'est jamais exposé. */
async function hasTemplate(tenantId: string, docType: DocumentType): Promise<boolean> {
  try {
    await resolveTemplate(tenantId, docType);
    return true;
  } catch (error) {
    logger.warn('ImmoCopilot : aucun modèle de document disponible', { tenantId, docType, error });
    return false;
  }
}

function proposalOutcome(
  ctx: { tenantId: string; userId: string },
  args: GenerateRentalDocumentArgs,
  summary: ActionProposal['summary']
) {
  const { token, claims } = signProposal({ userId: ctx.userId, tenantId: ctx.tenantId, args });
  const expiresAt = new Date(claims.exp * 1000).toISOString();
  logAuditEvent({
    actorUserId: ctx.userId,
    tenantId: ctx.tenantId,
    actionKey: AuditActionKey.AI_PROPOSAL_ISSUED,
    entityType: 'AI_PROPOSAL',
    entityId: claims.jti,
    payload: { docType: args.docType, leaseId: args.leaseId }
  });
  const proposal: ActionProposal = {
    proposalId: claims.jti,
    token,
    expiresAt,
    action: 'GENERATE_RENTAL_DOCUMENT',
    documentType: args.docType,
    summary
  };
  // Le jeton n'est JAMAIS renvoyé au modèle : il ne sort que par l'événement d'interface.
  return outcome(
    {
      status: 'PROPOSAL_READY',
      proposalId: claims.jti,
      documentType: args.docType,
      leaseNumber: summary.leaseNumber,
      renterName: summary.renterName,
      periodLabel: summary.periodLabel,
      amount: summary.amount,
      currency: summary.currency,
      expiresAt,
      note: "Aucun document n'a été généré. L'utilisateur doit confirmer la proposition dans l'interface ; ne prétends pas l'avoir fait."
    },
    { type: 'action_proposal', proposal }
  );
}

async function proposeReceipt(input: Input, ctx: { tenantId: string; userId: string }) {
  const match = input.period ? PERIOD.exec(input.period) : null;
  if (!input.period) return notPossible('MISSING_PERIOD', 'Précise la période (AAAA-MM) de la quittance.');
  if (!match) return notPossible('INVALID_PERIOD', 'La période doit être au format AAAA-MM.');
  const periodYear = Number(match[1]);
  const periodMonth = Number(match[2]);

  const lease = await loadLeaseSummary(ctx.tenantId, input.leaseId);

  const installment = await prisma.rentalInstallment.findFirst({
    where: { tenant_id: ctx.tenantId, lease_id: lease.id, period_year: periodYear, period_month: periodMonth },
    select: { id: true }
  });
  if (!installment) return notPossible('NO_INSTALLMENT', "Ce bail n'a pas d'échéance pour cette période.");

  const allocations = await prisma.rentalPaymentAllocation.findMany({
    where: { tenant_id: ctx.tenantId, installment_id: installment.id },
    select: {
      payment: { select: { id: true, status: true, lease_id: true, amount: true, currency: true, succeeded_at: true } }
    }
  });
  const payments = allocations
    .map(allocation => allocation.payment)
    .filter(payment => payment && payment.status === RentalPaymentStatus.SUCCESS && payment.lease_id === lease.id)
    .sort((a, b) => (b.succeeded_at?.getTime() ?? 0) - (a.succeeded_at?.getTime() ?? 0));
  const payment = payments[0];
  if (!payment)
    return notPossible('NO_PAYMENT', 'Aucun paiement encaissé pour cette période : pas de quittance possible.');

  // Quittance FINAL déjà émise pour ce paiement : on la montre, on ne propose rien.
  const existing = await prisma.rentalDocument.findFirst({
    where: {
      tenant_id: ctx.tenantId,
      type: RentalDocumentType.RENT_RECEIPT,
      status: RentalDocumentStatus.FINAL,
      payment_id: payment.id
    },
    select: { id: true, document_number: true, status: true, issued_at: true, file_path: true }
  });
  if (existing) {
    const item: DocumentCardItem = {
      id: existing.id,
      kind: 'rental',
      label: existing.document_number || RentalDocumentType.RENT_RECEIPT,
      type: RentalDocumentType.RENT_RECEIPT,
      status: existing.status,
      date: isoDay(existing.issued_at),
      downloadable: Boolean(existing.file_path)
    };
    return outcome(
      { status: 'ALREADY_EXISTS', leaseNumber: lease.leaseNumber, items: [item] },
      { type: 'document_list', scope: 'lease', items: [item] }
    );
  }

  if (!(await hasTemplate(ctx.tenantId, DocumentType.RENT_RECEIPT))) {
    return notPossible('NO_TEMPLATE', "Aucun modèle de quittance n'est disponible pour l'agence.");
  }

  return proposalOutcome(
    ctx,
    { docType: 'RENT_RECEIPT', leaseId: lease.id, paymentId: payment.id, installmentId: installment.id },
    {
      leaseId: lease.id,
      leaseNumber: lease.leaseNumber,
      propertyLabel: lease.propertyLabel,
      renterName: lease.renterName,
      periodLabel: formatMonth(periodYear, periodMonth),
      amount: payment.amount.toString(),
      currency: payment.currency || lease.currency
    }
  );
}

async function proposeStatement(input: Input, ctx: { tenantId: string; userId: string }) {
  if (!input.startDate || !input.endDate) {
    return notPossible('MISSING_PERIOD', 'Précise les dates de début et de fin (AAAA-MM-JJ) du relevé.');
  }
  const start = parseDay(input.startDate);
  const end = parseDay(input.endDate);
  if (!start || !end || end < start) return notPossible('INVALID_PERIOD', 'Les dates du relevé sont invalides.');
  const limit = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + MAX_STATEMENT_MONTHS, start.getUTCDate())
  );
  if (end >= limit) {
    return notPossible('PERIOD_TOO_LONG', `Un relevé couvre au plus ${MAX_STATEMENT_MONTHS} mois.`);
  }

  const lease = await loadLeaseSummary(ctx.tenantId, input.leaseId);
  if (!(await hasTemplate(ctx.tenantId, DocumentType.RENT_STATEMENT))) {
    return notPossible('NO_TEMPLATE', "Aucun modèle de relevé n'est disponible pour l'agence.");
  }

  return proposalOutcome(
    ctx,
    { docType: 'RENT_STATEMENT', leaseId: lease.id, startDate: input.startDate, endDate: input.endDate },
    {
      leaseId: lease.id,
      leaseNumber: lease.leaseNumber,
      propertyLabel: lease.propertyLabel,
      renterName: lease.renterName,
      periodLabel: t('Du {{start}} au {{end}}', { start: formatDay(input.startDate), end: formatDay(input.endDate) }),
      amount: null,
      currency: lease.currency
    }
  );
}

export const proposeRentalDocumentTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'propose_rental_document',
  description:
    "Prépare une PROPOSITION de quittance de loyer (docType RENT_RECEIPT, période AAAA-MM, exige un paiement encaissé) ou de relevé de compte (RENT_STATEMENT, dates de début et de fin, 12 mois maximum). N'écrit rien : l'utilisateur doit confirmer dans l'interface.",
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['docType', 'leaseId'],
    properties: {
      docType: { type: 'string', enum: ['RENT_RECEIPT', 'RENT_STATEMENT'] },
      leaseId: { type: 'string', format: 'uuid', description: "Identifiant d'un bail, obtenu par search_leases." },
      period: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'Quittance : mois AAAA-MM.' },
      startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Relevé : début AAAA-MM-JJ.' },
      endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Relevé : fin AAAA-MM-JJ.' }
    }
  },
  requiredPermission: PERMISSION,
  additionalPermissions: [VIEW_PERMISSION],
  feature: 'RENTAL',
  kind: 'proposal',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    assertToolPermission(ctx, VIEW_PERMISSION);
    // Garde anti-injection : un titre de bien ou un nom de locataire piégé, lu dans un résultat
    // d'outil, ne doit pas faire proposer un document pour un AUTRE bail. Seuls comptent les baux
    // réellement présentés dans cette requête (résultats d'outils ou écran vérifié).
    if (!ctx.seenLeaseIds.has(input.leaseId)) {
      return notPossible(
        'lease_not_seen',
        "Ce bail n'a pas été identifié dans cette conversation : appelle d'abord search_leases (ou list_lease_documents) pour le retrouver, puis réessaie avec l'identifiant renvoyé."
      );
    }
    return input.docType === 'RENT_RECEIPT' ? proposeReceipt(input, ctx) : proposeStatement(input, ctx);
  }
};
