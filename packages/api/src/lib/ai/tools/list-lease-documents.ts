import { z } from 'zod';
import { RentalDocumentType } from '@prisma/client';
import { listDocuments } from '../../../services/rental-document-service';
import type { CopilotToolDefinition, DocumentCardItem } from '../contracts';
import { assertToolPermission, clampLimit, isoDay, loadLeaseSummary, MAX_TOOL_ITEMS, outcome } from './tool-utils';

const PERMISSION = 'RENTAL_DOCUMENTS_VIEW';

const inputSchema = z
  .object({
    leaseId: z.string().uuid(),
    type: z.nativeEnum(RentalDocumentType).optional(),
    limit: z.number().int().min(1).max(MAX_TOOL_ITEMS).optional()
  })
  .strict();

interface RentalDocRow {
  id: string;
  type: string;
  status: string | null;
  document_number?: string | null;
  title?: string | null;
  issued_at?: Date | string | null;
  created_at?: Date | string | null;
  file_path?: string | null;
}

export const listLeaseDocumentsTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'list_lease_documents',
  description:
    "Liste les documents de location (contrat, quittances, relevés) d'un bail de l'agence. Au plus 10 documents.",
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['leaseId'],
    properties: {
      leaseId: { type: 'string', format: 'uuid', description: "Identifiant d'un bail, obtenu par search_leases." },
      type: { type: 'string', enum: Object.values(RentalDocumentType) },
      limit: { type: 'integer', minimum: 1, maximum: MAX_TOOL_ITEMS }
    }
  },
  requiredPermission: PERMISSION,
  feature: 'RENTAL',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    const lease = await loadLeaseSummary(ctx.tenantId, input.leaseId);
    ctx.seenLeaseIds.add(lease.id);
    const { data } = await listDocuments(
      ctx.tenantId,
      { leaseId: lease.id, type: input.type },
      { page: 1, limit: clampLimit(input.limit) }
    );

    // Projection explicite : ni chemin de fichier, ni auteur, ni paiement.
    const items: DocumentCardItem[] = (data as unknown as RentalDocRow[])
      .slice(0, clampLimit(input.limit))
      .map(doc => ({
        id: doc.id,
        kind: 'rental',
        label: doc.document_number || doc.title || doc.type,
        type: doc.type,
        status: doc.status ?? null,
        date: isoDay(doc.issued_at ?? doc.created_at),
        downloadable: Boolean(doc.file_path) && doc.status !== 'VOID'
      }));

    return outcome(
      { leaseNumber: lease.leaseNumber, count: items.length, items },
      { type: 'document_list', scope: 'lease', items }
    );
  }
};
