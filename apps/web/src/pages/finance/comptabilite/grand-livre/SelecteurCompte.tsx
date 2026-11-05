import React, { useEffect, useMemo, useState } from 'react';
import { Select } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchAccountingAccounts } from '../../../../services/accounting-exports-service';
import type { AccountOption } from '../../../../services/accounting-exports-service';
import { t } from '../../../../i18n/t';
import { accountingQueryKey } from '../shared';

export const DELAI_RECHERCHE_COMPTE_MS = 300;

interface SelecteurCompteProps {
  tenantId: string;
  from: string;
  to: string;
  /** Numéro du compte choisi ('' si aucun). */
  value: string;
  /** Intitulé du compte choisi, connu une fois le grand livre chargé. */
  currentName?: string;
  onChange: (accountNumber: string) => void;
}

/** Sélecteur de compte : recherche côté serveur (comptes mouvementés sur la période), saisie temporisée. */
export const SelecteurCompte: React.FC<SelecteurCompteProps> = ({
  tenantId,
  from,
  to,
  value,
  currentName,
  onChange
}) => {
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    const minuteur = setTimeout(() => setRecherche(saisie.trim()), DELAI_RECHERCHE_COMPTE_MS);
    return () => clearTimeout(minuteur);
  }, [saisie]);

  const query = useQuery({
    queryKey: accountingQueryKey('accounts', tenantId, { search: recherche, from, to, withMovements: true }),
    queryFn: () => searchAccountingAccounts(tenantId, { search: recherche, withMovements: true, from, to }),
    placeholderData: keepPreviousData
  });

  const options = useMemo(() => {
    const liste = (query.data ?? []).map((a: AccountOption) => ({
      value: a.accountNumber,
      label: `${a.accountNumber} — ${a.accountName}`
    }));
    // Le compte choisi reste affichable même s'il ne figure pas dans les résultats de la recherche.
    if (value && !liste.some(o => o.value === value)) {
      liste.unshift({ value, label: currentName ? `${value} — ${currentName}` : value });
    }
    return liste;
  }, [query.data, value, currentName]);

  return (
    <div style={{ minWidth: 280 }}>
      <label htmlFor="comptabilite-grand-livre-compte">{t('Compte')}</label>
      <Select
        id="comptabilite-grand-livre-compte"
        style={{ width: '100%' }}
        showSearch
        allowClear
        filterOption={false}
        placeholder={t('Choisir un compte')}
        value={value || undefined}
        options={options}
        loading={query.isFetching}
        onSearch={setSaisie}
        onChange={valeur => onChange(valeur ?? '')}
        onOpenChange={ouvert => {
          if (!ouvert) setSaisie('');
        }}
      />
    </div>
  );
};
