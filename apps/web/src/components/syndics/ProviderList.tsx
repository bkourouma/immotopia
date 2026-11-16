import React, { useMemo } from 'react';
import { Avatar, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { Table } from '../primitives';
import { MaintenanceContract, ServiceProvider } from '../../types/syndic-types';
import { localizedList } from '../../i18n/localized';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
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

type ContractState = 'ACTIVE' | 'ENDED' | 'NONE';

/** Situation contractuelle du prestataire avec CETTE copropriété. */
function contractState(provider: ProviderWithContracts): ContractState {
  const { active, ended } = contractsSummary(provider);
  if (active > 0) return 'ACTIVE';
  return ended > 0 ? 'ENDED' : 'NONE';
}

const CONTRACT_STATE_OPTIONS = localizedList(() => [
  { value: 'ACTIVE', label: t('Contrat actif') },
  { value: 'ENDED', label: t('Contrats terminés seulement') },
  { value: 'NONE', label: t('Aucun contrat') }
]);

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [
  (provider: ProviderWithContracts) => provider.name,
  (provider: ProviderWithContracts) => provider.specialty,
  (provider: ProviderWithContracts) => provider.phone,
  (provider: ProviderWithContracts) => provider.email
];
const ACCESSEURS = {
  specialty: (provider: ProviderWithContracts) => provider.specialty,
  contract: contractState
};

export interface ProviderListProps {
  providers: ProviderWithContracts[];
  loading?: boolean;
  /** Colonne d'actions propre à l'écran appelant (ex. Modifier/Supprimer). */
  renderActions?: (provider: ProviderWithContracts) => React.ReactNode;
}

/**
 * Les prestataires de l'agence, vus depuis une copropriété. La liste arrive en
 * entier (bornée par l'agence) : recherche et pagination LOCALES, préfixe
 * d'URL « pr ». Le critère « Contrat » sépare ceux qui ont un contrat avec
 * CETTE copropriété des autres.
 */
export const ProviderList: React.FC<ProviderListProps> = ({ providers, loading = false, renderActions }) => {
  // Sous contrat actif d'abord (puis nombre de contrats), puis ordre alphabétique.
  const sorted = useMemo(
    () =>
      [...providers].sort(
        (a, b) =>
          contractsSummary(b).active - contractsSummary(a).active ||
          (b.contracts ?? []).length - (a.contracts ?? []).length ||
          a.name.localeCompare(b.name, 'fr')
      ),
    [providers]
  );
  const specialtyOptions = useMemo(
    () =>
      Array.from(
        new Set(providers.map(provider => provider.specialty?.trim()).filter((value): value is string => !!value))
      )
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(value => ({ value, label: value })),
    [providers]
  );

  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom, spécialité, téléphone, e-mail…') },
    { key: 'contract', type: 'select', label: t('Contrat'), primary: true, options: CONTRACT_STATE_OPTIONS },
    { key: 'specialty', type: 'select', label: t('Spécialité'), primary: true, options: specialtyOptions }
  ];
  const local = useLocalListSearch<ProviderWithContracts>(sorted, {
    paramPrefix: 'pr',
    ariaLabel: t('Rechercher dans les prestataires'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const columns: ColumnsType<ProviderWithContracts> = [
    {
      title: t('Prestataire'),
      key: 'name',
      exportValue: provider => (provider.specialty ? `${provider.name} — ${provider.specialty}` : provider.name),
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
      exportValue: provider => [provider.phone, provider.email].filter(Boolean).join(' — '),
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
      exportValue: provider => {
        const { active, ended } = contractsSummary(provider);
        if (active === 0 && ended === 0) return t('Aucun contrat');
        return [
          active > 0 ? (active === 1 ? t('1 actif') : t('{{count}} actifs', { count: active })) : '',
          ended > 0 ? (ended === 1 ? t('1 terminé') : t('{{count}} terminés', { count: ended })) : ''
        ]
          .filter(Boolean)
          .join(' — ');
      },
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
    <Table<ProviderWithContracts>
      {...local.tableProps}
      helpId="syndic.prestataires.tableau"
      aria-label={t('Prestataires')}
      exportFilename={t('Prestataires')}
      exportFetchAll={local.exportAll}
      rowKey="id"
      columns={columns}
      loading={loading}
      locale={local.isFiltered ? undefined : { emptyText: t('Aucun prestataire') }}
      scroll={{ x: 'max-content' }}
    />
  );
};
