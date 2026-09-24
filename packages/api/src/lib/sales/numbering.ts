/**
 * Numérotation annuelle des pièces du lot 9 (ventes immobilières).
 *
 * Même motif que `createOwnerPayout` (`lib/owner-account/service.ts`) et que
 * `lib/treasury/service.ts` : deux colonnes `year` + `sequence`, uniques par
 * tenant et par année, relues dans la transaction de la pièce — jamais de
 * compteur séparé qui pourrait diverger.
 */

/**
 * Le prochain numéro de séquence d'une année, pour un modèle donné.
 *
 * Le délégué Prisma est typé `any` côté signature : les surcharges générées
 * par `$extends` (voir `PrismaTransactionClient`) ne s'unifient pas avec une
 * forme structurelle unique d'un modèle à l'autre, alors que l'appel lui-même
 * — `findFirst({ where: { tenantId, year }, orderBy, select })` — est
 * identique partout. Chaque appelant passe `tx.saleMandate`, `tx.saleOffer`,
 * etc., déjà typés côté appelant.
 */
export async function nextSequenceTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate: { findFirst: (args: any) => Promise<{ sequence: number } | null> },
  tenantId: string,
  year: number
): Promise<number> {
  const last = await delegate.findFirst({
    where: { tenantId, year },
    orderBy: { sequence: 'desc' },
    select: { sequence: true }
  });
  return (last?.sequence ?? 0) + 1;
}

const pad = (sequence: number) => String(sequence).padStart(4, '0');

export const mandateNumber = (year: number, sequence: number) => `MV-${year}-${pad(sequence)}`;
export const offerNumber = (year: number, sequence: number) => `OA-${year}-${pad(sequence)}`;
export const agreementNumber = (year: number, sequence: number) => `CV-${year}-${pad(sequence)}`;
export const commissionNumber = (year: number, sequence: number) => `HT-${year}-${pad(sequence)}`;
export const commissionPaymentNumber = (year: number, sequence: number) => `RC-${year}-${pad(sequence)}`;
