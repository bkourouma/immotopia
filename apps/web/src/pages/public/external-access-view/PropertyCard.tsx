import React, { useState } from 'react';
import { Card, Descriptions, Space, Tabs, Typography } from 'antd';
import { accessSectionLabel } from '../../patrimoine/external-access/external-access-labels';
import type { ExternalAccessViewProperty } from '../../../types/external-access';
import { t } from '../../../i18n/t';
import {
  DocumentsBlock,
  ExpensesBlock,
  LoansBlock,
  Percent,
  PrintAllContext,
  RentsBlock,
  TitlesBlock,
  ValuationBlock,
  YieldBlock
} from './blocks';

const { Text } = Typography;

export interface PropertyCardProps {
  property: ExternalAccessViewProperty;
  currency: string;
  busyRef: string | null;
  onDownload: (documentRef: string) => void;
  /**
   * Mise en page empilée complète (impression) : toutes les rubriques l'une sous
   * l'autre, sans onglets. Sinon : une rubrique par onglet.
   */
  stacked?: boolean;
  /** Onglet ouvert, gardé par le parent : il survit au passage par la mise en page empilée (impression). */
  activeKey?: string;
  onActiveKeyChange?: (key: string) => void;
}

const OVERVIEW = 'overview';

const cardTitle = (property: ExternalAccessViewProperty) => (
  <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{`${property.reference} — ${property.title}`}</span>
);

/** Identification du bien (adresse, quote-part). */
const Identification: React.FC<{ property: ExternalAccessViewProperty }> = ({ property }) => (
  <Descriptions column={{ xs: 1, sm: 2 }} size="small">
    <Descriptions.Item label={t('Adresse')}>
      {[property.address, property.city].filter(Boolean).join(', ') || '—'}
    </Descriptions.Item>
    {property.sharePercent !== null ? (
      <Descriptions.Item label={t('Quote-part du propriétaire')}>
        <Percent value={property.sharePercent} />
      </Descriptions.Item>
    ) : null}
  </Descriptions>
);

/** Valorisation, ou l'indication qu'il n'y en a pas lorsque la rubrique est accordée mais vide. */
const Valuation: React.FC<{ property: ExternalAccessViewProperty }> = ({ property }) => (
  <>
    {property.valuation ? <ValuationBlock data={property.valuation} /> : null}
    {property.valuation === null ? (
      <Card size="small" title={accessSectionLabel('VALUATIONS')}>
        <Text type="secondary">{t('Aucune valorisation.')}</Text>
      </Card>
    ) : null}
  </>
);

/**
 * Une carte par bien : identification, puis SEULES les rubriques présentes dans
 * la réponse. En affichage normal chaque rubrique a son onglet (contenu monté
 * seulement à l'ouverture) ; en mode `stacked` tout est empilé, comme avant.
 */
export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  currency,
  busyRef,
  onDownload,
  stacked,
  activeKey: controlledKey,
  onActiveKeyChange
}) => {
  const [localKey, setLocalKey] = useState<string>(OVERVIEW);
  const activeKey = controlledKey ?? localKey;
  const setActiveKey = (key: string) => {
    setLocalKey(key);
    onActiveKeyChange?.(key);
  };

  if (stacked) {
    return (
      <Card title={cardTitle(property)} styles={{ header: { height: 'auto', whiteSpace: 'normal' } }}>
        <PrintAllContext.Provider value>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Identification property={property} />
            <Valuation property={property} />
            {property.yield ? <YieldBlock data={property.yield} currency={currency} /> : null}
            {property.loans ? <LoansBlock loans={property.loans} /> : null}
            {property.expenses ? <ExpensesBlock data={property.expenses} currency={currency} /> : null}
            {property.rents ? <RentsBlock rents={property.rents} currency={currency} /> : null}
            {property.titles ? <TitlesBlock data={property.titles} /> : null}
            {property.documents ? (
              <DocumentsBlock documents={property.documents} busyRef={busyRef} onDownload={onDownload} />
            ) : null}
          </Space>
        </PrintAllContext.Provider>
      </Card>
    );
  }

  const items = [
    {
      key: OVERVIEW,
      label: t('Aperçu'),
      children: (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Identification property={property} />
          <Valuation property={property} />
        </Space>
      )
    },
    ...(property.yield
      ? [
          {
            key: 'YIELD_RATIOS',
            label: accessSectionLabel('YIELD_RATIOS'),
            children: <YieldBlock data={property.yield} currency={currency} plain />
          }
        ]
      : []),
    ...(property.loans
      ? [{ key: 'LOANS', label: accessSectionLabel('LOANS'), children: <LoansBlock loans={property.loans} plain /> }]
      : []),
    ...(property.expenses
      ? [
          {
            key: 'EXPENSES',
            label: accessSectionLabel('EXPENSES'),
            children: <ExpensesBlock data={property.expenses} currency={currency} plain />
          }
        ]
      : []),
    ...(property.rents
      ? [
          {
            key: 'RENTS',
            label: accessSectionLabel('RENTS'),
            children: <RentsBlock rents={property.rents} currency={currency} plain />
          }
        ]
      : []),
    ...(property.titles
      ? [
          {
            key: 'TITLES_OWNERSHIP',
            label: accessSectionLabel('TITLES_OWNERSHIP'),
            children: <TitlesBlock data={property.titles} plain />
          }
        ]
      : []),
    ...(property.documents
      ? [
          {
            key: 'DOCUMENTS',
            label: accessSectionLabel('DOCUMENTS'),
            children: <DocumentsBlock documents={property.documents} busyRef={busyRef} onDownload={onDownload} plain />
          }
        ]
      : [])
  ];

  return (
    <Card title={cardTitle(property)} styles={{ header: { height: 'auto', whiteSpace: 'normal' } }}>
      {items.length === 1 ? (
        // Aucune rubrique à part : pas de barre d'onglets inutile.
        items[0].children
      ) : (
        <Tabs destroyOnHidden activeKey={activeKey} onChange={setActiveKey} items={items} />
      )}
    </Card>
  );
};
