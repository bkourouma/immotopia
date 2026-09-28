import React, { useMemo, useState } from 'react';
import { Avatar, Segmented, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { MaintenanceContract, ServiceProvider } from '../../types/syndic-types';
import { t } from '../../i18n/t';

const { Text } = Typography;

/**
 * `ServiceProvider` (types/syndic-types.ts) ne déclare pas `contracts` : le
 * champ n'existe que sur la réponse de `GET .../prestataires`
 * (`listServiceProvidersBySyndicate`, côté API), qui inclut pour chaque
 * prestataire de l'agence ses contrats FILTRÉS sur cette copropriété. Type
 * local plutôt que de toucher `syndic-types.ts` (hors territoire).
 */
export interface ProviderWithContracts extends ServiceProvider {
  contracts?: MaintenanceContract[];
}

/** Initiales du prestataire pour sa pastille : « Hydro-Tech Plomberie » → « HP ». */
function initials(name: string): string {
  const words = name.split(/[\s\-–—&'’]+/).filter(word => /^[\p{L}\p{N}]/u.test(word));
  return (
    words
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || '?'
  );
}

function contractsSummary(provider: ProviderWithContracts) {
  const contracts = provider.contracts ?? [];
  return {
    active: contracts.filter(contract => contract.status === 'ACTIVE').length,
    ended: contracts.filter(contract => contract.status !== 'ACTIVE').length
  };
}

type Filter = 'contracted' | 'all';

export interface ProviderListProps {
  providers: ProviderWithContracts[];
  loading?: boolean;
  /** Colonne d'actions propre à l'écran appelant (ex. Modifier/Supprimer). */
  renderActions?: (provider: ProviderWithContracts) => React.ReactNode;
}

/**
 * Les prestataires de l'agence, vus depuis une copropriété. La liste est
 * commune à toute l'agence : le filtre montre d'abord ceux qui ont un contrat
 * avec CETTE copropriété, les autres restant accessibles d'un clic.
 */
export const ProviderList: React.FC<ProviderListProps> = ({ providers, loading = false, renderActions }) => {
  const contracted = useMemo(() => providers.filter(provider => (provider.contracts ?? []).length > 0), [providers]);
  const [filter, setFilter] = useState<Filter>(contracted.length > 0 ? 'contracted' : 'all');

  const rows = useMemo(() => {
    const source = filter === 'contracted' ? contracted : providers;
    // Sous contrat d'abord (contrats actifs, puis nombre de contrats), puis
    // ordre alphabétique.
    return [...source].sort(
      (a, b) =>
        contractsSummary(b).active - contractsSummary(a).active ||
        (b.contracts ?? []).length - (a.contracts ?? []).length ||
        a.name.localeCompare(b.name, 'fr')
    );
  }, [filter, contracted, providers]);

  const columns: ColumnsType<ProviderWithContracts> = [
    {
      title: t('Prestataire'),
      key: 'name',
      render: (_: unknown, provider) => (
        <Space size={12} align="center">
          <Avatar
            style={{ background: 'var(--color-accent-bg)', color: 'var(--color-accent-strong)', fontWeight: 600 }}
          >
            {initials(provider.name)}
          </Avatar>
          <div>
            <Text strong style={{ display: 'block' }}>
              {provider.name}
            </Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {provider.specialty || t('Spécialité non renseignée')}
            </Text>
          </div>
        </Space>
      )
    },
    {
      title: t('Contact'),
      key: 'contact',
      render: (_: unknown, provider) =>
        provider.phone || provider.email ? (
          <Space direction="vertical" size={2}>
            {provider.phone ? (
              <a href={`tel:${provider.phone}`} style={{ whiteSpace: 'nowrap' }}>
                <PhoneOutlined style={{ marginInlineEnd: 6 }} />
                {provider.phone}
              </a>
            ) : null}
            {provider.email ? (
              <a href={`mailto:${provider.email}`} style={{ whiteSpace: 'nowrap' }}>
                <MailOutlined style={{ marginInlineEnd: 6 }} />
                {provider.email}
              </a>
            ) : null}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        )
    },
    {
      title: t('Contrats'),
      key: 'contracts',
      width: 200,
      render: (_: unknown, provider) => {
        const { active, ended } = contractsSummary(provider);
        if (active === 0 && ended === 0) return <Tag>{t('Aucun contrat')}</Tag>;
        return (
          <Space size={4} wrap>
            {active > 0 ? (
              <Tag color="green">{active === 1 ? t('1 actif') : t('{{count}} actifs', { count: active })}</Tag>
            ) : null}
            {ended > 0 ? <Tag>{ended === 1 ? t('1 terminé') : t('{{count}} terminés', { count: ended })}</Tag> : null}
          </Space>
        );
      }
    }
  ];

  if (renderActions) {
    columns.push({
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_: unknown, provider) => renderActions(provider)
    });
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'contracted', label: t('Sous contrat ({{count}})', { count: contracted.length }) },
          { value: 'all', label: t('Tous ({{count}})', { count: providers.length }) }
        ]}
      />
      <Table<ProviderWithContracts>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        locale={{ emptyText: t('Aucun prestataire') }}
        scroll={{ x: 'max-content' }}
      />
    </Space>
  );
};
