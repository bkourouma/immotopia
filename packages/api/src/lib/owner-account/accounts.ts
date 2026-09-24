import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest } from '../errors';
import { ensureOperationalJournalTx } from '../finance/accounting';
import {
  AgencyFinanceSettingsDto,
  DEFAULT_MANAGEMENT_FEE_ACCOUNT,
  DEFAULT_OWNER_FUNDS_ACCOUNT,
  DEFAULT_VAT_COLLECTED_ACCOUNT,
  DEFAULT_WITHHOLDING_ACCOUNT
} from '../settings/finance-settings';

/**
 * Comptes comptables de la gestion locative.
 *
 * Numérotation de la consolidation SYSCOHADA (lot 10) : 4731 « Mandants »
 * pour les fonds détenus pour les propriétaires, 70611 pour les honoraires,
 * 4432 pour leur TVA, 4478 pour la retenue à la source. Chaque numéro se
 * change dans les paramètres financiers ; le nouveau vaut pour les écritures à
 * venir, celles déjà passées restent où elles sont, comme toute écriture
 * verrouillée.
 *
 * La trésorerie (caisses, banques, Mobile Money, valeurs à encaisser) ne se
 * résout plus ici mais dans `lib/treasury/accounts.ts` : chaque pièce dit quel
 * compte elle a réellement touché.
 */
export const OWNER_FUNDS_ACCOUNT = DEFAULT_OWNER_FUNDS_ACCOUNT;
/** Ancien compte provisoire des fonds propriétaires, avant le lot 10. */
export const LEGACY_OWNER_FUNDS_ACCOUNT = '4712';
/** @deprecated Lot 10 : la caisse se résout par `lib/treasury/accounts.ts`. */
export const CASH_ACCOUNT = '571';
/** @deprecated Lot 10 : la banque se résout par `lib/treasury/accounts.ts`. */
export const BANK_ACCOUNT = '521';
export const SUPPLIERS_ACCOUNT = '401';

export interface RentalAccounts {
  ownerFunds: string;
  fees: string;
  vat: string;
  withholding: string;
  suppliers: string;
  /** Produit des pénalités revenant à l'agence ; nul quand elles vont au propriétaire. */
  penaltyIncome: string | null;
}

type AccountTypeName = 'ASSET' | 'LIABILITY' | 'INCOME';

export async function ensureRentalAccountsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  settings: AgencyFinanceSettingsDto
): Promise<RentalAccounts> {
  const penaltyToAgency = settings.penaltyBeneficiary === 'AGENCY' && Boolean(settings.penaltyIncomeAccountNumber);
  const specs: Array<{ key: keyof RentalAccounts; number: string; name: string; type: AccountTypeName }> = [
    {
      key: 'ownerFunds',
      number: settings.ownerFundsAccountNumber ?? OWNER_FUNDS_ACCOUNT,
      name: 'Mandants',
      type: 'LIABILITY'
    },
    {
      key: 'fees',
      number: settings.managementFeeAccountNumber ?? DEFAULT_MANAGEMENT_FEE_ACCOUNT,
      name: 'Honoraires de gestion locative',
      type: 'INCOME'
    },
    {
      key: 'vat',
      number: settings.vatCollectedAccountNumber ?? DEFAULT_VAT_COLLECTED_ACCOUNT,
      name: 'TVA facturée sur prestations de services',
      type: 'LIABILITY'
    },
    {
      key: 'withholding',
      number: settings.withholdingAccountNumber ?? DEFAULT_WITHHOLDING_ACCOUNT,
      name: 'Retenues à la source sur loyers',
      type: 'LIABILITY'
    },
    { key: 'suppliers', number: SUPPLIERS_ACCOUNT, name: 'Fournisseurs', type: 'LIABILITY' }
  ];
  if (penaltyToAgency) {
    specs.push({
      key: 'penaltyIncome',
      number: settings.penaltyIncomeAccountNumber as string,
      name: 'Pénalités de retard',
      type: 'INCOME'
    });
  }

  // Deux rôles sur un même compte rendraient les écritures illisibles, et le
  // solde des propriétaires se confondrait avec les honoraires de l'agence.
  const numbers = specs.map(spec => spec.number);
  if (new Set(numbers).size !== numbers.length) {
    throw badRequest(
      'Deux comptes de la gestion locative portent le même numéro : corrigez-les dans les paramètres financiers.'
    );
  }

  const existing = await tx.chartOfAccount.findMany({
    where: { tenantId, scope: 'OPERATIONS', accountNumber: { in: numbers } },
    select: { id: true, accountNumber: true }
  });
  const byNumber = new Map(existing.map(account => [account.accountNumber, account.id]));

  const result = { penaltyIncome: null } as RentalAccounts;
  for (const spec of specs) {
    let id = byNumber.get(spec.number);
    if (!id) {
      const created = await tx.chartOfAccount.create({
        data: {
          tenantId,
          syndicateId: null,
          scope: 'OPERATIONS',
          accountNumber: spec.number,
          accountName: spec.name,
          accountClass: Number(spec.number[0]),
          accountType: spec.type
        },
        select: { id: true }
      });
      id = created.id;
    }
    (result as unknown as Record<string, string>)[spec.key] = id;
  }
  return result;
}

/** Journaux opérationnels par exercice, créés à la demande et mis en cache. */
export function journalResolver(tx: PrismaTransactionClient, tenantId: string) {
  const cache = new Map<string, Promise<string>>();
  return (date: Date, type: 'GENERAL' | 'CASH' | 'BANK'): Promise<string> => {
    const year = date.getUTCFullYear();
    const key = `${year}:${type}`;
    let journal = cache.get(key);
    if (!journal) {
      journal = ensureOperationalJournalTx(tx, tenantId, year, type);
      cache.set(key, journal);
    }
    return journal;
  };
}
