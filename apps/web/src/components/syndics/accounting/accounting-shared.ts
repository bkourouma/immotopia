import type { QueryClient } from '@tanstack/react-query';
import { listChartOfAccounts } from '../../../services/syndic-service';
import type { ChartOfAccount } from '../../../types/syndic-types';
import type { SelectCriterion } from '../../../utils/list-search';
import { t } from '../../../i18n/t';

/** Racine des clés React Query de la comptabilité : une invalidation de ce préfixe rafraîchit tous les onglets. */
export const accountingKey = (tenantId: string, syndicId: string, ...rest: unknown[]) =>
  ['syndic-accounting', tenantId, syndicId, ...rest] as const;

export const ENTRIES_PAGE_SIZE = 20;
export const LEDGER_PAGE_SIZE = 50;
export const LOCAL_PAGE_SIZE_BALANCE = 50;
export const LOCAL_PAGE_SIZE_LISTS = 20;

/**
 * Préfixes d'URL des barres de recherche : un par tableau, sans point.
 * `?ecr.q=loyer&bal.class=4,5&plan.page=2` ; l'onglet reste dans `?tab=`.
 */
export const ENTRIES_PREFIX = 'ecr';
export const LEDGER_PREFIX = 'gl';
export const BALANCE_PREFIX = 'bal';
export const PLAN_PREFIX = 'plan';
export const JOURNALS_PREFIX = 'jnl';

export type AccountingTabKey = 'ecritures' | 'grand-livre' | 'balance' | 'plan' | 'journaux';
export const ACCOUNTING_TABS: AccountingTabKey[] = ['ecritures', 'grand-livre', 'balance', 'plan', 'journaux'];
export const DEFAULT_ACCOUNTING_TAB: AccountingTabKey = 'ecritures';

/** Modifie l'URL (clé absente ou `undefined` = retrait). */
export type UpdateParams = (patch: Record<string, string | undefined>) => void;

export interface AccountingTabProps {
  tenantId: string;
  syndicId: string;
  params: URLSearchParams;
  updateParams: UpdateParams;
  /** Plan comptable complet, chargé une fois au montage de l'écran. */
  accounts: ChartOfAccount[];
}

/** Ligne d'une écriture telle que l'API la renvoie (le type partagé n'embarque pas compte ni lot). */
export interface EntryLineView {
  id: string;
  account?: { accountNumber: string; accountName: string } | null;
  lot?: { lotNumber: string } | null;
  debit: number | string;
  credit: number | string;
  label: string;
}

export const accountLabel = (account: { accountNumber: string; accountName: string }) =>
  `${account.accountNumber} - ${account.accountName}`;

export const accountTypeLabel = (type: ChartOfAccount['accountType']): string => {
  switch (type) {
    case 'ASSET':
      return t('Actif (bilan)');
    case 'LIABILITY':
      return t('Passif');
    case 'EQUITY':
      return t('Capitaux propres');
    case 'INCOME':
      return t('Produit');
    case 'EXPENSE':
      return t('Charge');
    default:
      return type;
  }
};

export const ACCOUNT_TYPE_VALUES: Array<ChartOfAccount['accountType']> = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE'
];

/** Classes du plan SYSCOHADA (1 à 9), valeurs en chaîne pour l'URL. */
export const accountClassOptions = () =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map(value => ({ value: String(value), label: `${t('Classe')} ${value}` }));

interface AccountCriterionOptions {
  key: string;
  label: string;
  /** Nom du paramètre d'API (`accountId`). */
  api: string;
  primary?: boolean;
  tenantId: string;
  syndicId: string;
  queryClient: QueryClient;
}

/**
 * Critère « Compte » à options DISTANTES : 20 résultats au plus, recherchés par le serveur
 * (`listChartOfAccounts({ search, limit: 20 })`). Le libellé d'une valeur venue de l'URL est
 * retrouvé dans le plan, lu une fois (même clé de cache que l'écran, aucune requête de plus
 * quand il est déjà chargé).
 */
export function accountCriterion({
  key,
  label,
  api,
  primary,
  tenantId,
  syndicId,
  queryClient
}: AccountCriterionOptions): SelectCriterion {
  return {
    key,
    type: 'select',
    label,
    primary,
    api,
    placeholder: t('Choisissez un compte'),
    loadOptions: async term => {
      const found = await listChartOfAccounts(tenantId, syndicId, { search: term || undefined, limit: 20 });
      return found.map(account => ({ value: account.id, label: accountLabel(account) }));
    },
    resolveLabel: async id => {
      const plan = await queryClient.fetchQuery({
        queryKey: accountingKey(tenantId, syndicId, 'plan'),
        queryFn: () => listChartOfAccounts(tenantId, syndicId),
        staleTime: 60_000
      });
      const account = plan.find(candidate => candidate.id === id);
      return account ? accountLabel(account) : undefined;
    }
  };
}
