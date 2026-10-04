import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from 'antd';
import { listTenants, Tenant } from '../../services/tenant-service';
import { t } from '../../i18n/t';

interface MenuTenantSelectProps {
  value: string | null;
  onChange: (tenantId: string | null) => void;
  disabled?: boolean;
}

/**
 * Sélecteur d'agence de l'onglet « Menus » : les coupures de menu se règlent
 * agence par agence. Recherche côté serveur, car la liste peut être longue.
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

  return (
    <Select
      showSearch
      allowClear
      filterOption={false}
      value={value ?? undefined}
      loading={loading}
      disabled={disabled}
      placeholder={t('Choisir une agence')}
      aria-label={t('Agence')}
      style={{ width: '100%', maxWidth: 360 }}
      onSearch={search => void load(search.trim())}
      onChange={next => onChange(next ?? null)}
      options={tenants.map(tenant => ({ value: tenant.id, label: tenant.name }))}
    />
  );
};
