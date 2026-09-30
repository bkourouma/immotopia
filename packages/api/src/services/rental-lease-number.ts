import { prisma } from '../utils/database';

/**
 * Generate a unique lease number in format BAIL-YYYY-XXXX
 * @param tenantId - Tenant ID
 * @returns Generated lease number
 */
export async function generateLeaseNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = 'BAIL';

  // Numéro suivant = plus grand numéro existant de l'année + 1, et non le
  // nombre de baux + 1 : après la suppression d'un bail, « count + 1 »
  // retombait sur un numéro déjà pris (doublon P2002).
  const existing = await prisma.rentalLease.findMany({
    where: {
      tenant_id: tenantId,
      lease_number: {
        startsWith: `${prefix}-${year}-`
      }
    },
    select: { lease_number: true }
  });
  let maxSequence = 0;
  for (const row of existing) {
    const match = /^BAIL-\d{4}-(\d+)$/.exec(row.lease_number ?? '');
    if (match) maxSequence = Math.max(maxSequence, parseInt(match[1], 10));
  }

  // Generate sequential number (1-indexed, zero-padded to 4 digits)
  const sequenceNumber = (maxSequence + 1).toString().padStart(4, '0');

  return `${prefix}-${year}-${sequenceNumber}`;
}

/** Violation de l'unicité (agence, numéro de bail). */
export function isLeaseNumberCollision(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } } | null;
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  return Array.isArray(target) ? target.includes('lease_number') : String(target ?? '').includes('lease_number');
}
