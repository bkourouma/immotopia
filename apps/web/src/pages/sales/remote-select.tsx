import React, { useEffect, useState } from 'react';
import { Select, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { t } from '../../i18n/t';

/**
 * Sélecteur à recherche distante des formulaires de vente (bien, acquéreur).
 *
 * Il remplace les `limit: 500` : à l'ouverture il charge les 20 premières
 * entrées, puis interroge l'API 300 ms après la dernière frappe (le terme part
 * dans la requête, `filterOption={false}` : l'API filtre, pas le navigateur).
 *
 * Le contrat de valeur ne change pas : `value` est l'identifiant, `onChange`
 * reçoit l'identifiant ou `null`. Le libellé d'une valeur absente des options
 * (formulaire d'édition, valeur préremplie) est retrouvé par son identifiant
 * (`resolve`), ou repris du choix de l'utilisateur.
 */

/** Nombre d'options demandées à l'API par requête. */
export const REMOTE_SELECT_LIMIT = 20;
const SEARCH_DELAY_MS = 300;

export interface RemoteOption {
  value: string;
  label: string;
}

export interface RemoteSelectProps {
  tenantId: string;
  /** Nom de cache React Query (unique par type d'entité). */
  scope: string;
  /** Charge au plus {@link REMOTE_SELECT_LIMIT} options correspondant au terme (vide = les premières). */
  load: (term: string) => Promise<RemoteOption[]>;
  /** Libellé d'un identifiant absent des options chargées. */
  resolve: (id: string) => Promise<string | undefined>;
  notFound: string;
  placeholder: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  id?: string;
  size?: SelectProps['size'];
}

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export const RemoteSelect: React.FC<RemoteSelectProps> = ({
  tenantId,
  scope,
  load,
  resolve,
  notFound,
  placeholder,
  value,
  onChange,
  disabled,
  style,
  id,
  size
}) => {
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<RemoteOption | undefined>(undefined);
  const debounced = useDebounced(term.trim(), SEARCH_DELAY_MS);
  const selected = value ?? undefined;

  const { data: found, isFetching } = useQuery({
    queryKey: queryKey(scope, tenantId, { q: debounced, limit: REMOTE_SELECT_LIMIT }),
    queryFn: () => load(debounced),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference,
    placeholderData: keepPreviousData
  });

  const loaded = found ?? [];
  const inOptions = selected !== undefined && loaded.some(option => option.value === selected);
  const knownLabel = picked && picked.value === selected ? picked.label : undefined;

  // Valeur préremplie, absente des 20 options et jamais choisie ici : on va chercher son libellé.
  const { data: resolvedLabel } = useQuery({
    queryKey: queryKey(`${scope}-label`, tenantId, { id: selected ?? null }),
    queryFn: () => resolve(selected as string),
    enabled: Boolean(tenantId && selected && !inOptions && !knownLabel),
    staleTime: STALE_TIME.reference
  });

  const options: RemoteOption[] =
    selected !== undefined && !inOptions
      ? [{ value: selected, label: knownLabel ?? resolvedLabel ?? t('Chargement…') }, ...loaded]
      : loaded;

  return (
    <Select<string, RemoteOption>
      id={id}
      size={size}
      style={style ?? { width: '100%' }}
      value={selected}
      onChange={(next, option) => {
        const choice = Array.isArray(option) ? option[0] : option;
        setPicked(next && choice ? { value: next, label: String(choice.label) } : undefined);
        onChange?.(next ?? null);
      }}
      allowClear
      placeholder={placeholder}
      disabled={disabled}
      loading={isFetching}
      notFoundContent={isFetching ? <Spin size="small" /> : notFound}
      showSearch
      filterOption={false}
      onSearch={setTerm}
      // Menu refermé : on repart de la liste complète à la prochaine ouverture.
      onOpenChange={open => {
        if (!open) setTerm('');
      }}
      options={options}
    />
  );
};
