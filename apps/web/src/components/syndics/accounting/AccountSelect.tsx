import React, { useEffect, useMemo, useState } from 'react';
import { Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listChartOfAccounts } from '../../../services/syndic-service';
import type { ChartOfAccount } from '../../../types/syndic-types';
import { t } from '../../../i18n/t';
import { accountLabel, accountingKey } from './accounting-shared';

const SEARCH_DELAY_MS = 300;
const SEARCH_LIMIT = 20;

interface AccountSelectProps {
  tenantId: string;
  syndicId: string;
  value?: string;
  onChange: (accountId: string | undefined) => void;
  /** Plan déjà chargé : sert d'options tant que rien n'est saisi (aucune requête). */
  accounts: ChartOfAccount[];
  /** Libellé du compte choisi, affiché même s'il n'est pas parmi les résultats. */
  selectedLabel?: string;
  allowClear?: boolean;
  placeholder?: string;
  ariaLabel: string;
}

/**
 * Sélecteur de compte à recherche DISTANTE : à la saisie (après 300 ms), la requête
 * `listChartOfAccounts({ search, limit: 20 })` fournit les options. Sans saisie, les
 * 20 premiers comptes du plan déjà chargé : aucune requête supplémentaire.
 */
export const AccountSelect: React.FC<AccountSelectProps> = ({
  tenantId,
  syndicId,
  value,
  onChange,
  accounts,
  selectedLabel,
  allowClear,
  placeholder,
  ariaLabel
}) => {
  const [typed, setTyped] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(typed.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [typed]);

  const searching = debounced.length > 0;
  const { data: found, isFetching } = useQuery({
    queryKey: accountingKey(tenantId, syndicId, 'account-search', debounced),
    queryFn: () => listChartOfAccounts(tenantId, syndicId, { search: debounced, limit: SEARCH_LIMIT }),
    enabled: searching
  });

  const options = useMemo(() => {
    const source = searching ? (found ?? []) : accounts.slice(0, SEARCH_LIMIT);
    const list = source.map(account => ({ value: account.id, label: accountLabel(account) }));
    if (value && !list.some(option => option.value === value)) {
      list.unshift({ value, label: selectedLabel ?? value });
    }
    return list;
  }, [searching, found, accounts, value, selectedLabel]);

  return (
    <Select
      showSearch
      allowClear={allowClear}
      filterOption={false}
      value={value}
      options={options}
      loading={searching && isFetching}
      placeholder={placeholder ?? t('Compte')}
      aria-label={ariaLabel}
      style={{ minWidth: 260 }}
      onSearch={setTyped}
      onChange={next => onChange((next as string | undefined) || undefined)}
      onOpenChange={open => {
        if (!open) setTyped('');
      }}
    />
  );
};
