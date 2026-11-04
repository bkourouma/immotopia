import React, { createContext, useContext } from 'react';
import { Button, Card, Descriptions, Typography } from 'antd';
import { MoneyValue, Table, statusLabel } from '../../../components/primitives';
import { accessSectionLabel } from '../../patrimoine/external-access/external-access-labels';
import {
  documentTypeLabel,
  expenseCategoryLabel,
  loanStatusLabel,
  valuationMethodLabel
} from '../../../components/patrimoine/patrimoine-labels';
import { legalFormLabel, fiscalCountryLabel } from '../../../components/patrimoine/entities/tax-labels';
import { propertyTypeLabel } from '../../../components/copilot/copilot-labels';
import type { ExternalAccessViewProperty } from '../../../types/external-access';
import type { AssetValuation, PropertyExpense, PropertyLoan } from '../../../types/patrimoine-types';
import type { FiscalCountry, HoldingEntityForm } from '../../../types/patrimoine-entities-types';
import { activeLocale, formatNumber, formatPercent } from '../../../i18n/format';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/** Tableaux de détail d'un seul bien : pages de 10, pas de barre (la recherche porte sur les biens). */
const TABLE_PAGINATION = { pageSize: 10, hideOnSinglePage: true, showSizeChanger: false } as const;

/**
 * Mise en page empilée (impression) : aucun tableau ne doit être coupé à 10 lignes.
 * Fourni par la carte du bien en mode `stacked`.
 */
export const PrintAllContext = createContext(false);

/** Tableau de détail : pages de 10 à l'écran, toutes les lignes à l'impression. */
const DetailTable = ((props: React.ComponentProps<typeof Table>) => {
  const printAll = useContext(PrintAllContext);
  return <Table {...props} pagination={printAll ? false : TABLE_PAGINATION} />;
}) as typeof Table;

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(activeLocale());
}

/** Clé de ligne stable pour les tableaux dont les lignes n'ont pas d'identifiant propre. */
function keyed<T extends object>(rows: T[]): Array<T & { rowKey: string }> {
  return rows.map((row, index) => ({ ...row, rowKey: String(index) }));
}

function billingFrequencyLabel(frequency: string): string {
  if (frequency === 'MONTHLY') return t('Mensuelle');
  if (frequency === 'QUARTERLY') return t('Trimestrielle');
  if (frequency === 'YEARLY' || frequency === 'ANNUAL') return t('Annuelle');
  return frequency;
}

function fileSizeLabel(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes >= 1_048_576) return `${formatNumber(bytes / 1_048_576, { maximumFractionDigits: 1 })} ${t('Mo')}`;
  return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} ${t('Ko')}`;
}

/** Un montant est toujours lu de gauche à droite, même dans une interface arabe. */
export const Money: React.FC<{ value: number | null | undefined; currency: string; signed?: boolean }> = ({
  value,
  currency,
  signed
}) => (
  <bdi dir="ltr">
    <MoneyValue value={value} currency={currency} signed={signed} />
  </bdi>
);

export const Percent: React.FC<{ value: number | null | undefined; emptyLabel?: string }> = ({ value, emptyLabel }) =>
  value === null || value === undefined ? <>{emptyLabel ?? '—'}</> : <bdi dir="ltr">{formatPercent(value, 2)}</bdi>;

// --- Rubriques ------------------------------------------------------------------------

interface PlainProps {
  /** Dans un onglet : le titre de la rubrique est celui de l'onglet, pas de carte autour. */
  plain?: boolean;
}

/** Une rubrique : carte titrée (mise en page empilée, impression) ou contenu nu (sous un onglet). */
const Section: React.FC<{ title: string; plain?: boolean; children: React.ReactNode }> = ({
  title,
  plain,
  children
}) =>
  plain ? (
    <div>{children}</div>
  ) : (
    <Card size="small" title={title}>
      {children}
    </Card>
  );

export const ValuationBlock: React.FC<{ data: NonNullable<ExternalAccessViewProperty['valuation']> }> = ({ data }) => (
  <Card size="small" title={accessSectionLabel('VALUATIONS')}>
    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
      <Descriptions.Item label={t('Valeur estimée')}>
        <Money value={data.estimatedValue} currency={data.currency} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Date d’estimation')}>{formatDate(data.valuatedAt)}</Descriptions.Item>
      <Descriptions.Item label={t('Coût d’acquisition')}>
        <Money value={data.acquisitionCost} currency={data.currency} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Plus-value latente')}>
        <Money value={data.latentCapitalGain} currency={data.currency} signed />
      </Descriptions.Item>
    </Descriptions>
    {data.history.length > 0 ? (
      <DetailTable
        exportFilename={accessSectionLabel('VALUATIONS')}
        size="small"
        rowKey="rowKey"
        scroll={{ x: 'max-content' }}
        dataSource={keyed(data.history)}
        columns={[
          { title: t('Date'), dataIndex: 'valuatedAt', render: (value: string) => formatDate(value) },
          {
            title: t('Méthode'),
            dataIndex: 'method',
            render: (value: string) => valuationMethodLabel(value as AssetValuation['method'])
          },
          {
            title: t('Valeur estimée'),
            dataIndex: 'estimatedValue',
            align: 'end' as const,
            render: (value: number) => <Money value={value} currency={data.currency} />
          }
        ]}
      />
    ) : null}
  </Card>
);

export const YieldBlock: React.FC<
  { data: NonNullable<ExternalAccessViewProperty['yield']>; currency: string } & PlainProps
> = ({ data, currency, plain }) => (
  <Section title={accessSectionLabel('YIELD_RATIOS')} plain={plain}>
    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
      <Descriptions.Item label={t('Rendement brut')}>
        <Percent value={data.grossYield} emptyLabel={t('Non valorisé')} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Rendement net')}>
        <Percent value={data.netYield} emptyLabel={t('Non valorisé')} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Rendement net-net')}>
        <Percent value={data.netNetYield} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Loyers annuels')}>
        <Money value={data.annualRent} currency={currency} />
      </Descriptions.Item>
      <Descriptions.Item label={t('Charges annuelles')}>
        <Money value={data.annualExpenses} currency={currency} />
      </Descriptions.Item>
    </Descriptions>
  </Section>
);

export const LoansBlock: React.FC<{ loans: NonNullable<ExternalAccessViewProperty['loans']> } & PlainProps> = ({
  loans,
  plain
}) => (
  <Section title={accessSectionLabel('LOANS')} plain={plain}>
    {loans.length === 0 ? (
      <Text type="secondary">{t('Aucun emprunt.')}</Text>
    ) : (
      <DetailTable
        exportFilename={accessSectionLabel('LOANS')}
        size="small"
        rowKey="rowKey"
        scroll={{ x: 'max-content' }}
        dataSource={keyed(loans)}
        columns={[
          { title: t('Prêteur'), dataIndex: 'lender' },
          {
            title: t('Capital emprunté'),
            dataIndex: 'capitalAmount',
            align: 'end' as const,
            render: (value: number, row) => <Money value={value} currency={row.currency} />
          },
          {
            title: t('Capital restant dû'),
            dataIndex: 'remainingCapital',
            align: 'end' as const,
            render: (value: number, row) => <Money value={value} currency={row.currency} />
          },
          { title: t('Taux'), dataIndex: 'interestRate', render: (value: number) => <Percent value={value} /> },
          {
            title: t('Mensualité'),
            dataIndex: 'monthlyPayment',
            align: 'end' as const,
            render: (value: number, row) => <Money value={value} currency={row.currency} />
          },
          { title: t('Début'), dataIndex: 'startDate', render: (value: string) => formatDate(value) },
          { title: t('Fin'), dataIndex: 'endDate', render: (value: string | null) => formatDate(value) },
          {
            title: t('Statut'),
            dataIndex: 'status',
            render: (value: string) => loanStatusLabel(value as PropertyLoan['status'])
          }
        ]}
      />
    )}
  </Section>
);

export const ExpensesBlock: React.FC<
  { data: NonNullable<ExternalAccessViewProperty['expenses']>; currency: string } & PlainProps
> = ({ data, currency, plain }) => (
  <Section title={accessSectionLabel('EXPENSES')} plain={plain}>
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 8,
        rowGap: 2,
        marginBlockEnd: 8,
        minWidth: 0,
        overflowWrap: 'anywhere'
      }}
    >
      <Text type="secondary">{t('Total des 12 derniers mois')} :</Text>
      <Money value={data.totalLast12Months} currency={currency} />
    </div>
    {data.items.length > 0 ? (
      <Text type="secondary" style={{ display: 'block', marginBlockEnd: 8 }}>
        {t('(détail sur 24 mois)')}
      </Text>
    ) : null}
    {data.items.length > 0 ? (
      <DetailTable
        exportFilename={accessSectionLabel('EXPENSES')}
        size="small"
        rowKey="rowKey"
        scroll={{ x: 'max-content' }}
        dataSource={keyed(data.items)}
        columns={[
          { title: t('Date'), dataIndex: 'date', render: (value: string) => formatDate(value) },
          {
            title: t('Catégorie'),
            dataIndex: 'category',
            render: (value: string) => expenseCategoryLabel(value as PropertyExpense['category'])
          },
          {
            title: t('Montant'),
            dataIndex: 'amount',
            align: 'end' as const,
            render: (value: number) => <Money value={value} currency={currency} />
          }
        ]}
      />
    ) : null}
  </Section>
);

export const RentsBlock: React.FC<
  { rents: NonNullable<ExternalAccessViewProperty['rents']>; currency: string } & PlainProps
> = ({ rents, currency, plain }) => (
  <Section title={accessSectionLabel('RENTS')} plain={plain}>
    {rents.length === 0 ? (
      <Text type="secondary">{t('Aucun bail.')}</Text>
    ) : (
      <DetailTable
        exportFilename={accessSectionLabel('RENTS')}
        size="small"
        rowKey="rowKey"
        scroll={{ x: 'max-content' }}
        dataSource={keyed(rents)}
        columns={[
          { title: t('Statut'), dataIndex: 'status', render: (value: string) => statusLabel(value) ?? value },
          { title: t('Début'), dataIndex: 'startDate', render: (value: string) => formatDate(value) },
          { title: t('Fin'), dataIndex: 'endDate', render: (value: string | null) => formatDate(value) },
          {
            title: t('Loyer'),
            dataIndex: 'rentAmount',
            align: 'end' as const,
            render: (value: number) => <Money value={value} currency={currency} />
          },
          {
            title: t('Charges'),
            dataIndex: 'chargesAmount',
            align: 'end' as const,
            render: (value: number | null) => <Money value={value} currency={currency} />
          },
          {
            title: t('Facturation'),
            dataIndex: 'billingFrequency',
            render: (value: string) => billingFrequencyLabel(value)
          }
        ]}
      />
    )}
  </Section>
);

export const TitlesBlock: React.FC<{ data: NonNullable<ExternalAccessViewProperty['titles']> } & PlainProps> = ({
  data,
  plain
}) => (
  <Section title={accessSectionLabel('TITLES_OWNERSHIP')} plain={plain}>
    <Descriptions column={{ xs: 1, sm: 2 }} size="small">
      <Descriptions.Item label={t('Type de bien')}>{propertyTypeLabel(data.propertyType)}</Descriptions.Item>
      <Descriptions.Item label={t('Surface')}>
        {data.surface === null ? '—' : <bdi dir="ltr">{`${formatNumber(data.surface)} m²`}</bdi>}
      </Descriptions.Item>
      <Descriptions.Item label={t('Quote-part du propriétaire')}>
        <Percent value={data.ownerSharePercent} />
      </Descriptions.Item>
      {data.otherHoldersSharePercent !== null && data.otherHoldersSharePercent !== undefined ? (
        <Descriptions.Item label={t('Part des autres détenteurs')}>
          <Percent value={data.otherHoldersSharePercent} />
        </Descriptions.Item>
      ) : null}
    </Descriptions>
    {data.holdings.length > 0 ? (
      <DetailTable
        exportFilename={accessSectionLabel('TITLES_OWNERSHIP')}
        size="small"
        rowKey="rowKey"
        scroll={{ x: 'max-content' }}
        dataSource={keyed(data.holdings)}
        columns={[
          { title: t('Entité détentrice'), dataIndex: 'entityName' },
          {
            title: t('Forme juridique'),
            dataIndex: 'legalForm',
            render: (value: string) => legalFormLabel(value as HoldingEntityForm)
          },
          {
            title: t('Pays'),
            dataIndex: 'country',
            render: (value: string) => fiscalCountryLabel(value as FiscalCountry)
          },
          { title: t('RCCM'), dataIndex: 'rccm', render: (value: string | null) => value ?? '—' },
          { title: t('Numéro fiscal'), dataIndex: 'taxId', render: (value: string | null) => value ?? '—' },
          { title: t('Quote-part'), dataIndex: 'sharePercent', render: (value: number) => <Percent value={value} /> }
        ]}
      />
    ) : null}
  </Section>
);

interface DocumentsBlockProps {
  documents: NonNullable<ExternalAccessViewProperty['documents']>;
  busyRef: string | null;
  onDownload: (documentRef: string) => void;
  plain?: boolean;
}

export const DocumentsBlock: React.FC<DocumentsBlockProps> = ({ documents, busyRef, onDownload, plain }) => (
  <Section title={accessSectionLabel('DOCUMENTS')} plain={plain}>
    {documents.length === 0 ? (
      <Text type="secondary">{t('Aucun document partagé.')}</Text>
    ) : (
      <DetailTable
        exportFilename={accessSectionLabel('DOCUMENTS')}
        size="small"
        rowKey="ref"
        scroll={{ x: 'max-content' }}
        dataSource={documents}
        columns={[
          { title: t('Document'), dataIndex: 'fileName' },
          { title: t('Type'), dataIndex: 'documentType', render: (value: string) => documentTypeLabel(value) },
          { title: t('Taille'), dataIndex: 'fileSize', render: (value: number | null) => fileSizeLabel(value) },
          {
            title: t('Action'),
            exportable: false,
            align: 'end' as const,
            render: (_: unknown, row) => (
              <span className="external-access-no-print">
                <Button
                  size="small"
                  loading={busyRef === row.ref}
                  aria-label={t('Télécharger {{name}}', { name: row.fileName })}
                  onClick={() => onDownload(row.ref)}
                >
                  {t('Télécharger')}
                </Button>
              </span>
            )
          }
        ]}
      />
    )}
  </Section>
);
