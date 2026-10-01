import { prisma } from '../../utils/database';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { runWithTenantContext } from '../../utils/tenant-context';
import { invalidSecureLinkError, recordSecureLinkView, verifySecureLink } from '../secure-links';

/**
 * Rapport mensuel d'un propriétaire, lu par son lien sécurisé (lot A3).
 *
 * Seul le jeton compte : le relevé est celui que désigne `link.objectId`, dans
 * l'agence du lien. Aucun identifiant de bien, d'agence ou de propriétaire venu
 * de la requête n'entre dans une requête Prisma.
 */

export const OWNER_STATEMENT_OBJECT_TYPE = 'OwnerStatement';

export interface OwnerMonthlyReportDto {
  agencyName: string;
  ownerName: string;
  /** 'YYYY-MM' */
  period: string;
  currency: string;
  /** ISO */
  expiresAt: string;
  totals: {
    totalRentDue: number;
    totalRevenue: number;
    totalArrears: number;
    managementFees: number;
    managementFeesVat: number;
    totalExpenses: number;
    /** Retenue à la source déduite du net (lignes `OTHER`). */
    withholdingTax: number;
    /** Dépôt de garantie conservé, ajouté au net (lignes `OTHER`). */
    depositRetained: number;
    /** Le net affiché vient toujours d'ici, jamais d'une somme côté client. */
    netAmount: number;
  };
  properties: Array<{
    reference: string;
    title: string;
    lines: Array<{ label: string; type: string; amount: number }>;
    /** Net du bien : somme signée de ses lignes ; la somme des biens égale `totals.netAmount`. */
    subtotal: number;
  }>;
}

/** Postes qui viennent en déduction du revenu du propriétaire. */
const DEDUCTION_TYPES = new Set(['MANAGEMENT_FEE', 'MANAGEMENT_FEE_VAT', 'EXPENSE_DEDUCTED', 'ADVANCE']);

/**
 * Les deux seules lignes `OTHER` que produit le calcul du relevé
 * (`owner-statement-computation.ts`), reconnues à leur libellé français fixe :
 * la retenue à la source se déduit, le dépôt de garantie conservé s'ajoute.
 * Même convention que `owner-statement-helpers.ts` côté web.
 */
const WITHHOLDING_LABEL_PREFIX = 'Retenue à la source';
const DEPOSIT_RETAINED_LABEL_PREFIX = 'Dépôt de garantie conservé';

const num = (value: unknown): number => Number(value ?? 0);
const round2 = (value: number): number => Math.round(value * 100) / 100;

export async function getOwnerMonthlyReportByToken(
  token: string,
  ctx: { ip?: string; userAgent?: string }
): Promise<OwnerMonthlyReportDto> {
  const link = await verifySecureLink(token, 'OWNER_MONTHLY_REPORT');
  if (link.objectType !== OWNER_STATEMENT_OBJECT_TYPE) throw invalidSecureLinkError();

  const dto = await runWithTenantContext({ tenantId: link.tenantId }, async () => {
    const statement = await prisma.ownerStatement.findFirst({
      where: { id: link.objectId, tenantId: link.tenantId },
      select: {
        period: true,
        currency: true,
        totalRentDue: true,
        totalRevenue: true,
        totalArrears: true,
        totalManagementFees: true,
        totalManagementFeesVat: true,
        totalExpenses: true,
        netAmount: true,
        tenant: { select: { name: true } },
        // Nom seulement : ni e-mail, ni téléphone, ni pièce d'identité.
        owner: { select: { firstName: true, lastName: true, legalName: true, contactType: true } },
        items: {
          select: {
            propertyId: true,
            label: true,
            type: true,
            amount: true,
            property: { select: { internalReference: true, title: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    if (!statement) return null;

    const owner = statement.owner;
    const personName = [owner?.firstName, owner?.lastName].filter(Boolean).join(' ');
    const ownerName =
      (owner?.contactType === 'COMPANY' && owner.legalName ? owner.legalName : personName) || t('Propriétaire');

    // Regroupement par bien : la clé interne ne sort jamais dans la réponse.
    let withholdingTax = 0;
    let depositRetained = 0;
    const byProperty = new Map<string, OwnerMonthlyReportDto['properties'][number]>();
    for (const item of statement.items) {
      let group = byProperty.get(item.propertyId);
      if (!group) {
        group = {
          reference: item.property?.internalReference ?? '',
          title: item.property?.title ?? '',
          lines: [],
          subtotal: 0
        };
        byProperty.set(item.propertyId, group);
      }
      const amount = num(item.amount);
      group.lines.push({ label: item.label, type: item.type, amount });
      if (item.type === 'RENT_COLLECTED') group.subtotal += amount;
      else if (DEDUCTION_TYPES.has(item.type)) group.subtotal -= amount;
      else if (item.type === 'OTHER' && item.label.startsWith(WITHHOLDING_LABEL_PREFIX)) {
        group.subtotal -= amount;
        withholdingTax += amount;
      } else if (item.type === 'OTHER' && item.label.startsWith(DEPOSIT_RETAINED_LABEL_PREFIX)) {
        group.subtotal += amount;
        depositRetained += amount;
      }
    }

    return {
      agencyName: statement.tenant?.name ?? '',
      ownerName,
      period: statement.period,
      currency: statement.currency,
      expiresAt: link.expiresAt.toISOString(),
      totals: {
        totalRentDue: num(statement.totalRentDue),
        totalRevenue: num(statement.totalRevenue),
        totalArrears: num(statement.totalArrears),
        managementFees: num(statement.totalManagementFees),
        managementFeesVat: num(statement.totalManagementFeesVat),
        totalExpenses: num(statement.totalExpenses),
        withholdingTax: round2(withholdingTax),
        depositRetained: round2(depositRetained),
        netAmount: num(statement.netAmount)
      },
      properties: Array.from(byProperty.values()).map(group => ({ ...group, subtotal: round2(group.subtotal) }))
    } satisfies OwnerMonthlyReportDto;
  });

  // Relevé disparu : même refus que tout jeton invalide, et aucune consultation journalisée.
  if (!dto) throw invalidSecureLinkError();

  // La consultation n'est enregistrée qu'après succès, et son échec ne
  // transforme pas une lecture réussie en erreur : seul l'identifiant du lien
  // et le type de l'erreur sont journalisés (jamais le jeton ni le message).
  try {
    await recordSecureLinkView(link, ctx);
  } catch (error) {
    logger.warn('Secure link view could not be recorded', {
      linkId: link.id,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
  }
  return dto;
}
