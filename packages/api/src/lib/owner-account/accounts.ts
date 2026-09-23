import type { PaymentMethod, RentalPaymentMethod } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest } from '../errors';
import { ensureOperationalJournalTx } from '../finance/accounting';
import type { AgencyFinanceSettingsDto } from '../settings/finance-settings';

/**
 * Comptes comptables de la gestion locative.
 *
 * Le compte des fonds des propriétaires n'a pas de valeur par défaut dans les
 * paramètres : un cabinet le numérote à sa façon. Tant que l'agence ne l'a pas
 * fixé, les écritures vont au 4712 « Créditeurs divers », PROVISOIREMENT. Le
 * numéro choisi ensuite dans les paramètres vaut pour les écritures à venir ;
 * celles déjà passées restent où elles sont, comme toute écriture verrouillée.
 */
export const PROVISIONAL_OWNER_FUNDS_ACCOUNT = '4712';
export const CASH_ACCOUNT = '571';
export const BANK_ACCOUNT = '521';

export interface RentalAccounts {
  ownerFunds: string;
  fees: string;
  vat: string;
  cash: string;
  bank: string;
}

type AccountTypeName = 'ASSET' | 'LIABILITY' | 'INCOME';

export async function ensureRentalAccountsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  settings: AgencyFinanceSettingsDto
): Promise<RentalAccounts> {
  const specs: Array<{ key: keyof RentalAccounts; number: string; name: string; type: AccountTypeName }> = [
    {
      key: 'ownerFunds',
      number: settings.ownerFundsAccountNumber ?? PROVISIONAL_OWNER_FUNDS_ACCOUNT,
      name: 'Propriétaires mandants',
      type: 'LIABILITY'
    },
    {
      key: 'fees',
      number: settings.managementFeeAccountNumber ?? '706',
      name: 'Honoraires de gestion',
      type: 'INCOME'
    },
    {
      key: 'vat',
      number: settings.vatCollectedAccountNumber ?? '4432',
      name: 'TVA facturée sur prestations de services',
      type: 'LIABILITY'
    },
    { key: 'cash', number: CASH_ACCOUNT, name: 'Caisse', type: 'ASSET' },
    { key: 'bank', number: BANK_ACCOUNT, name: 'Banques', type: 'ASSET' }
  ];

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

  const result = {} as RentalAccounts;
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
    result[spec.key] = id;
  }
  return result;
}

/** L'espèce passe par la caisse ; tout le reste, par la banque. */
export function treasuryFor(
  method: PaymentMethod | RentalPaymentMethod | string,
  accounts: RentalAccounts
): { accountId: string; journal: 'CASH' | 'BANK' } {
  return method === 'CASH'
    ? { accountId: accounts.cash, journal: 'CASH' }
    : { accountId: accounts.bank, journal: 'BANK' };
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
