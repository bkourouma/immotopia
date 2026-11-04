import React, { useMemo, useState } from 'react';
import { Pagination, Space } from 'antd';
import { ListSearch, StateBlock } from '../../../components/primitives';
import { propertyTypeLabel } from '../../../components/copilot/copilot-labels';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import type { ExternalAccessViewProperty } from '../../../types/external-access';
import { t } from '../../../i18n/t';
import { PropertyCard } from './PropertyCard';

/** Biens par page : une carte porte jusqu'à six tableaux, on en montre peu à la fois. */
const PROPERTIES_PER_PAGE = 5;

// Accesseurs stables (hors composant) : le filtrage reste mémoïsé. Le type de bien
// n'existe dans la réponse qu'avec la rubrique « Titres et propriété ».
const TEXTE_RECHERCHE = [
  (p: ExternalAccessViewProperty) => p.reference,
  (p: ExternalAccessViewProperty) => p.title,
  (p: ExternalAccessViewProperty) => p.address,
  (p: ExternalAccessViewProperty) => p.city,
  (p: ExternalAccessViewProperty) => (p.titles ? propertyTypeLabel(p.titles.propertyType) : undefined)
];
const ACCESSEURS = { type: (p: ExternalAccessViewProperty) => p.titles?.propertyType };

const propertyKey = (property: ExternalAccessViewProperty) => `${property.reference}-${property.title}`;

interface Props {
  properties: ExternalAccessViewProperty[];
  currency: string;
  busyRef: string | null;
  onDownload: (documentRef: string) => void;
  /** Impression : tous les biens, toutes les rubriques, sans barre ni pagination. */
  printAll: boolean;
}

/**
 * Biens de l'accès partagé : recherche et pagination LOCALES sur ce que la page
 * a déjà reçu (aucun appel réseau, rien de la vue dans l'URL hormis les critères
 * saisis par le visiteur).
 */
export const PropertiesSection: React.FC<Props> = ({ properties, currency, busyRef, onDownload, printAll }) => {
  const typeOptions = useMemo(() => {
    const codes = Array.from(
      new Set(properties.map(p => p.titles?.propertyType).filter((code): code is string => Boolean(code)))
    );
    return codes.map(code => ({ value: code, label: propertyTypeLabel(code) }));
  }, [properties]);

  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Référence, titre, adresse, ville…')
    },
    ...(typeOptions.length > 0
      ? [
          {
            key: 'type',
            type: 'multiSelect' as const,
            label: t('Type de bien'),
            primary: true,
            options: typeOptions
          }
        ]
      : [])
  ];

  // Onglet ouvert par bien : conservé quand l'impression empile les rubriques puis rend la main.
  const [tabs, setTabs] = useState<Record<string, string>>({});

  const local = useLocalListSearch<ExternalAccessViewProperty>(properties, {
    ariaLabel: t('Rechercher dans les biens'),
    defaultPageSize: PROPERTIES_PER_PAGE,
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  if (printAll) {
    return (
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        {properties.map(property => (
          <PropertyCard
            key={propertyKey(property)}
            property={property}
            currency={currency}
            busyRef={busyRef}
            onDownload={onDownload}
            activeKey={tabs[propertyKey(property)]}
            onActiveKeyChange={key => setTabs(previous => ({ ...previous, [propertyKey(property)]: key }))}
            stacked
          />
        ))}
      </Space>
    );
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <div className="external-access-no-print">
        <ListSearch {...local.searchProps} />
      </div>
      {local.total === 0 ? (
        <StateBlock
          variant="no-results"
          actions={[{ label: t('Effacer les critères'), onClick: local.clear, primary: true }]}
        />
      ) : (
        local.pageItems.map(property => (
          <PropertyCard
            key={propertyKey(property)}
            property={property}
            currency={currency}
            busyRef={busyRef}
            onDownload={onDownload}
            activeKey={tabs[propertyKey(property)]}
            onActiveKeyChange={key => setTabs(previous => ({ ...previous, [propertyKey(property)]: key }))}
          />
        ))
      )}
      <nav className="external-access-no-print" aria-label={t('Pagination des biens')} style={{ textAlign: 'center' }}>
        <Pagination
          current={local.page}
          pageSize={local.pageSize}
          total={local.total}
          showSizeChanger={false}
          hideOnSinglePage
          onChange={page => local.setPage(page)}
        />
      </nav>
    </Space>
  );
};
