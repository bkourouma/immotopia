import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, SwapOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n/t';

/**
 * `<TenantSwitcher>` — sélecteur d'agence de l'en-tête (lot F, plan §F3).
 *
 * Invisible pour un utilisateur rattaché à une seule agence : c'est
 * `availableTenants` qui en décide, pas ce composant — `AuthContext` ne le
 * remplit qu'avec les agences ACTIVE du persona courant (collaborateur ou
 * client de portail), jamais moins de deux entrées n'ayant aucun intérêt à
 * afficher un sélecteur.
 *
 * Changer d'agence vide le cache React Query : les données affichées
 * (biens, baux, factures…) appartiennent à l'agence précédente, et les
 * laisser en cache les ferait apparaître, un instant, sous la nouvelle.
 */
export const TenantSwitcher: React.FC = () => {
  const { availableTenants } = useAuth();

  // Le cache React Query n'est sollicite que s'il y a vraiment un choix a
  // proposer : une coquille rendue sans QueryClientProvider (tests, ecrans
  // autonomes) reste ainsi utilisable pour un utilisateur d'une seule agence.
  if (!availableTenants || availableTenants.length <= 1) {
    return null;
  }

  return <TenantSwitcherMenu />;
};

const TenantSwitcherMenu: React.FC = () => {
  const { availableTenants, activeTenantId, switchTenant } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const current = availableTenants.find(tenant => tenant.id === activeTenantId) ?? availableTenants[0];

  const handleSelect = (tenantId: string) => {
    if (tenantId === activeTenantId) return;
    switchTenant(tenantId);
    queryClient.clear();
    navigate('/dashboard');
  };

  const items: MenuProps['items'] = availableTenants.map(tenant => ({
    key: tenant.id,
    label: (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>{tenant.name}</span>
        {tenant.id === activeTenantId && <CheckOutlined style={{ fontSize: 12, color: 'var(--color-primary)' }} />}
      </span>
    ),
    onClick: () => handleSelect(tenant.id)
  }));

  return (
    <Dropdown
      menu={{ items, selectedKeys: activeTenantId ? [activeTenantId] : [] }}
      placement="bottomRight"
      trigger={['click']}
    >
      <Button
        type="text"
        icon={<SwapOutlined />}
        aria-label={t("Changer d'agence")}
        style={{ height: 'auto', padding: 'var(--space-1) var(--space-3)', maxWidth: 220 }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 160,
            display: 'inline-block',
            verticalAlign: 'middle'
          }}
        >
          {current?.name}
        </span>
      </Button>
    </Dropdown>
  );
};
