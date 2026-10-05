import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from 'antd';
import { listTenants, Tenant } from '../../services/tenant-service';
import { t } from '../../i18n/t';

/** Périmètre choisi : le défaut de toutes les agences, ou une agence précise. */
export type MenuScopeChoice = { kind: 'default' } | { kind: 'tenant'; id: string };

/** Valeur interne de l'option « Toutes les agences » : elle ne sort pas de ce composant. */
const DEFAULT_OPTION = '__default__';

/** Deux choix désignent-ils le même périmètre ? */
export function sameMenuScope(a: MenuScopeChoice | null, b: MenuScopeChoice | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'default' || b.kind === 'default') return a.kind === b.kind;
  return a.id === b.id;
}

interface MenuTenantSelectProps {
  value: MenuScopeChoice | null;
  onChange: (choice: MenuScopeChoice | null) => void;
  disabled?: boolean;
}

/**
 * Sélecteur de périmètre de l'onglet « Menus » : le défaut commun à toutes les
 * agences, ou une agence qui a son propre réglage. Recherche côté serveur, car
 * la liste d'agences peut être longue.
 */
export const MenuTenantSelect: React.FC<MenuTenantSelectProps> = ({ value, onChange, disabled }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const lastRequest = useRef(0);

  const load = useCallback(async (search?: string) => {
    const requestId = ++lastRequest.current;
    setLoading(true);
    try {
      const response = await listTenants({ limit: 50, ...(search ? { search } : {}) });
      if (requestId === lastRequest.current) setTenants(response.data?.tenants ?? []);
    } catch {
      if (requestId === lastRequest.current) setTenants([]);
    } finally {
      if (requestId === lastRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = value === null ? undefined : value.kind === 'default' ? DEFAULT_OPTION : value.id;

  return (
    <Select
      showSearch
      allowClear
      filterOption={false}
      value={selected}
      loading={loading}
      disabled={disabled}
      placeholder={t('Choisir une agence')}
      aria-label={t('Agence')}
      style={{ width: '100%', maxWidth: 360 }}
      onSearch={search => void load(search.trim())}
      onChange={(next: string | undefined) => {
        if (!next) onChange(null);
        else if (next === DEFAULT_OPTION) onChange({ kind: 'default' });
        else onChange({ kind: 'tenant', id: next });
      }}
      options={[
        { value: DEFAULT_OPTION, label: t('Toutes les agences (défaut)') },
        ...tenants.map(tenant => ({ value: tenant.id, label: tenant.name }))
      ]}
    />
  );
};
