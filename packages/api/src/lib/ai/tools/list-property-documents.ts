import { z } from 'zod';
import { getDocuments } from '../../../services/property-document-service';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import type { CopilotToolDefinition, DocumentCardItem } from '../contracts';
import { assertToolPermission, isoDay, MAX_TOOL_ITEMS, outcome } from './tool-utils';

const PERMISSION = 'PROPERTIES_VIEW';

const inputSchema = z
  .object({
    propertyId: z.string().uuid(),
    includeExpired: z.boolean().optional()
  })
  .strict();

interface PropertyDocRow {
  id: string;
  documentType: string;
  fileName: string;
  expirationDate?: Date | string | null;
  createdAt?: Date | string | null;
}

export const listPropertyDocumentsTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'list_property_documents',
  description:
    "Liste les pièces du dossier d'un bien de l'agence (titre foncier, mandat, plans…). Au plus 10 documents.",
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['propertyId'],
    properties: {
      propertyId: {
        type: 'string',
        format: 'uuid',
        description: "Identifiant d'un bien, obtenu par search_properties."
      },
      includeExpired: { type: 'boolean', description: 'Inclure les documents expirés (défaut : oui).' }
    }
  },
  requiredPermission: PERMISSION,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    // Appartenance vérifiée ici (NotFoundError si autre agence), puis par le service.
    const property = await getPropertyForTenant(input.propertyId, ctx.tenantId);
    const documents = await getDocuments(property.id, ctx.tenantId, input.includeExpired ?? true);

    const now = Date.now();
    const rows = documents as unknown as PropertyDocRow[];
    const items: DocumentCardItem[] = rows.slice(0, MAX_TOOL_ITEMS).map(doc => {
      const expired = doc.expirationDate ? new Date(doc.expirationDate).getTime() <= now : false;
      return {
        id: doc.id,
        kind: 'property',
        label: doc.fileName,
        type: doc.documentType,
        status: expired ? 'EXPIRED' : 'VALID',
        date: isoDay(doc.createdAt),
        downloadable: true,
        propertyId: property.id
      };
    });

    return outcome(
      { total: rows.length, count: items.length, items },
      { type: 'document_list', scope: 'property', items }
    );
  }
};
