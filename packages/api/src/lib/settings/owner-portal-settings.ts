import { z } from 'zod';
import { prisma } from '../../utils/database';

/**
 * Réglage du portail propriétaire (lot P5) : masquage de la vue patrimoine et
 * de ses rubriques (valorisation, rendement, emprunts, travaux, documents).
 *
 * Tant que l'agence n'a rien enregistré, la lecture renvoie les valeurs par
 * défaut ci-dessous (tout actif) SANS les écrire — même patron que
 * `lib/settings/finance-settings.ts`.
 */

export interface OwnerPortalSettingsDto {
  patrimonyEnabled: boolean;
  patrimonyShowValuation: boolean;
  patrimonyShowYield: boolean;
  patrimonyShowLoans: boolean;
  patrimonyShowWorks: boolean;
  patrimonyShowDocuments: boolean;
}

export const DEFAULT_OWNER_PORTAL_SETTINGS: OwnerPortalSettingsDto = {
  patrimonyEnabled: true,
  patrimonyShowValuation: true,
  patrimonyShowYield: true,
  patrimonyShowLoans: true,
  patrimonyShowWorks: true,
  patrimonyShowDocuments: true
};

export const updateOwnerPortalSettingsSchema = z
  .object({
    patrimonyEnabled: z.boolean(),
    patrimonyShowValuation: z.boolean(),
    patrimonyShowYield: z.boolean(),
    patrimonyShowLoans: z.boolean(),
    patrimonyShowWorks: z.boolean(),
    patrimonyShowDocuments: z.boolean()
  })
  .partial()
  .strict();

export type UpdateOwnerPortalSettingsInput = z.infer<typeof updateOwnerPortalSettingsSchema>;

function toDto(row: {
  patrimonyEnabled: boolean;
  patrimonyShowValuation: boolean;
  patrimonyShowYield: boolean;
  patrimonyShowLoans: boolean;
  patrimonyShowWorks: boolean;
  patrimonyShowDocuments: boolean;
}): OwnerPortalSettingsDto {
  return {
    patrimonyEnabled: row.patrimonyEnabled,
    patrimonyShowValuation: row.patrimonyShowValuation,
    patrimonyShowYield: row.patrimonyShowYield,
    patrimonyShowLoans: row.patrimonyShowLoans,
    patrimonyShowWorks: row.patrimonyShowWorks,
    patrimonyShowDocuments: row.patrimonyShowDocuments
  };
}

export async function getOwnerPortalSettings(tenantId: string): Promise<OwnerPortalSettingsDto> {
  const row = await prisma.ownerPortalSettings.findUnique({ where: { tenantId } });
  return row ? toDto(row) : { ...DEFAULT_OWNER_PORTAL_SETTINGS };
}

export async function updateOwnerPortalSettings(
  tenantId: string,
  input: UpdateOwnerPortalSettingsInput,
  userId: string | undefined
): Promise<OwnerPortalSettingsDto> {
  const current = await getOwnerPortalSettings(tenantId);
  const data = {
    patrimonyEnabled: input.patrimonyEnabled ?? current.patrimonyEnabled,
    patrimonyShowValuation: input.patrimonyShowValuation ?? current.patrimonyShowValuation,
    patrimonyShowYield: input.patrimonyShowYield ?? current.patrimonyShowYield,
    patrimonyShowLoans: input.patrimonyShowLoans ?? current.patrimonyShowLoans,
    patrimonyShowWorks: input.patrimonyShowWorks ?? current.patrimonyShowWorks,
    patrimonyShowDocuments: input.patrimonyShowDocuments ?? current.patrimonyShowDocuments,
    updatedByUserId: userId ?? null
  };
  const row = await prisma.ownerPortalSettings.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data
  });
  return toDto(row);
}
