import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataView, ListSearch, MoneyValue, StateBlock } from '../../../../components/primitives';
import { useListSearch } from '../../../../hooks/useListSearch';
import {
  getMandantOwnerLedger,
  getMandantOwners,
  UNASSIGNED_OWNER
} from '../../../../services/accounting-exports-service';
import type { MandantFundsNature, MandantOwnerRow } from '../../../../services/accounting-exports-service';
import { t } from '../../../../i18n/t';
import {
  AccountingFrame,
  ExportButtons,
  accountingQueryKey,
  useAccountingExport,
  useAccountingPeriod
} from '../shared';
import { ControleMandants } from './ControleMandants';
import { DetailMandant } from './DetailMandant';
import { SelecteurVue } from './SelecteurVue';
import { LIMITE_LIGNES, LIMITE_PROPRIETAIRES, useMandantUrl } from './useMandantUrl';

const { Text } = Typography;

const MAX_PAGE_SIZE = 100;

/** Libellé affiché d'un propriétaire : les lignes sans compte de tiers sont « Non réparti ». */
const libelleProprietaire = (row: MandantOwnerRow) =>
  row.ownerKey === UNASSIGNED_OWNER ? t('Non réparti') : row.ownerLabel;

/**
 * Grand livre auxiliaire des mandants : la liste paginée des propriétaires
 * avec leurs soldes ; un clic pose `owner` dans l'URL et charge, à la demande,
 * les lignes de ce propriétaire (paginées par le serveur).
 */
export const GrandLivreAuxiliaire: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { from, to } = useAccountingPeriod();
  const { vue, owner, pageLignes, maj } = useMandantUrl();
  // Liste des propriétaires : recherche par nom (paramètre d'API `search`).
  const search = useListSearch({
    criteria: [{ key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom du mandant') }],
    defaultPageSize: LIMITE_PROPRIETAIRES,
    apiNames: { sort: false }
  });
  // Détail d'un propriétaire : filtre de nature. La pagination du détail
  // (`page-lignes`) reste gérée par `maj` ; le hook ne sert qu'à lire la valeur.
  const detailSearch = useListSearch({
    criteria: [
      {
        key: 'nature',
        type: 'select',
        label: t('Nature'),
        primary: true,
        options: [
          { value: 'CURRENT', label: t('Compte courant') },
          { value: 'DEPOSIT', label: t('Dépôt de garantie') },
          { value: 'UNALLOCATED', label: t('À affecter') }
        ]
      }
    ],
    apiNames: { sort: false }
  });
  const nature = detailSearch.filterParams.nature as MandantFundsNature | undefined;
  const limit = Math.min(search.pageSize, MAX_PAGE_SIZE);
  const { exportEnCours, exporter } = useAccountingExport(tenantId);

  const liste = useQuery({
    queryKey: accountingQueryKey('mandant-owners', tenantId, { from, to, ...search.apiParams, limit }),
    queryFn: () => getMandantOwners(tenantId as string, { from, to, ...search.apiParams, limit }),
    enabled: Boolean(tenantId) && !owner,
    placeholderData: keepPreviousData
  });

  const detail = useQuery({
    queryKey: accountingQueryKey('mandant-ledger', tenantId, {
      from,
      to,
      owner,
      nature: nature ?? '',
      page: pageLignes,
      limit: LIMITE_LIGNES
    }),
    queryFn: () =>
      getMandantOwnerLedger(tenantId as string, { from, to, owner, nature, page: pageLignes, limit: LIMITE_LIGNES }),
    enabled: Boolean(tenantId) && Boolean(owner),
    placeholderData: keepPreviousData
  });

  // Le changement de nature remet `page-lignes` à zéro (et non `page`, celle de la liste).
  const detailBinding = useMemo(
    () => ({
      ...detailSearch.searchProps,
      'aria-label': t('Filtrer les lignes du mandant'),
      resultCount: detail.data?.total,
      onChange: (next: Record<string, unknown>) =>
        maj({ nature: (next.nature as string | undefined) || undefined, 'page-lignes': undefined }),
      onClear: () => maj({ nature: undefined, 'page-lignes': undefined })
    }),
    [detailSearch.searchProps, detail.data?.total, maj]
  );

  const ouvrir = useCallback(
    (ownerKey: string) => maj({ owner: ownerKey, nature: undefined, 'page-lignes': undefined }),
    [maj]
  );
  const retour = useCallback(() => maj({ owner: undefined, nature: undefined, 'page-lignes': undefined }), [maj]);

  const columns = useMemo<ColumnsType<MandantOwnerRow>>(
    () => [
      {
        title: t('Mandant'),
        key: 'mandant',
        render: (_, r) => (
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => ouvrir(r.ownerKey)}>
            {libelleProprietaire(r)}
          </Button>
        )
      },
      {
        title: t("Solde d'ouverture"),
        key: 'ouverture',
        align: 'end',
        render: (_, r) => <MoneyValue value={r.openingBalance} signed />
      },
      { title: t('Débit'), key: 'debit', align: 'end', render: (_, r) => <MoneyValue value={r.totalDebit} /> },
      { title: t('Crédit'), key: 'credit', align: 'end', render: (_, r) => <MoneyValue value={r.totalCredit} /> },
      {
        title: t('Solde de clôture'),
        key: 'cloture',
        align: 'end',
        render: (_, r) => <MoneyValue value={r.closingBalance} signed />
      }
    ],
    [ouvrir]
  );

  const renderCard = useCallback(
    (r: MandantOwnerRow) => (
      <Card size="small" style={{ marginBlockEnd: 'var(--space-3)' }}>
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => ouvrir(r.ownerKey)}>
          {libelleProprietaire(r)}
        </Button>
        <div>
          {t("Solde d'ouverture")} : <MoneyValue value={r.openingBalance} signed />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>
            {t('Débit')} : <MoneyValue value={r.totalDebit} />
          </span>
          <span>
            {t('Crédit')} : <MoneyValue value={r.totalCredit} />
          </span>
        </div>
        <div>
          <Text strong>
            {t('Solde de clôture')} : <MoneyValue value={r.closingBalance} signed />
          </Text>
        </div>
      </Card>
    ),
    [ouvrir]
  );

  if (!tenantId) return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;

  const data = liste.data;
  const exportParams = owner ? { from, to, owner, nature } : { from, to, ...search.filterParams };

  const filtres = (
    <div>
      <div style={{ marginBlockEnd: 'var(--space-3)' }}>
        <SelecteurVue vue={vue} maj={maj} />
      </div>
      {owner ? (
        <ListSearch {...detailBinding} />
      ) : (
        <ListSearch {...search.searchProps} aria-label={t('Rechercher un mandant')} resultCount={data?.total} />
      )}
    </div>
  );

  return (
    <AccountingFrame
      sync={owner ? detail.data?.sync : data?.sync}
      filters={filtres}
      actions={
        <ExportButtons
          loadingKey={exportEnCours}
          onExport={format =>
            exporter('mandant-subledger', format, exportParams, `${t('Grand livre auxiliaire des mandants')}.${format}`)
          }
        />
      }
    >
      {owner ? (
        <DetailMandant
          query={detail}
          pageLignes={pageLignes}
          maj={maj}
          onBack={retour}
          isFiltered={detailSearch.isFiltered}
        />
      ) : (
        <>
          <ControleMandants
            control={data?.control}
            accountNumber={data?.accountNumber}
            message={t(
              "Le grand livre auxiliaire des mandants ne coïncide pas avec le solde général du compte : signalez-le à l'éditeur."
            )}
          />
          <DataView<MandantOwnerRow>
            aria-label={t('Grand livre auxiliaire des mandants')}
            columns={columns}
            items={data?.items ?? []}
            total={data?.total ?? 0}
            page={search.page}
            pageSize={limit}
            onPageChange={search.dataViewProps.onPageChange}
            loading={liste.isPending}
            isReloading={liste.isFetching && !liste.isPending}
            error={liste.isError ? t('Impossible de charger le grand livre auxiliaire des mandants.') : null}
            onRetry={() => void liste.refetch()}
            isFiltered={search.isFiltered}
            onClearFilters={search.clear}
            emptyDescription={t('Aucun mouvement de mandant sur cette période.')}
            renderCard={renderCard}
            rowKey={r => r.ownerKey}
            export={false}
          />
          {data && data.items.length > 0 && (
            <div
              data-testid="totaux-mandants"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginBlockStart: 'var(--space-3)' }}
            >
              <Text strong>{t('Total')}</Text>
              <Text strong>
                {t("Solde d'ouverture")} : <MoneyValue value={data.totals.openingBalance} signed />
              </Text>
              <Text strong>
                {t('Débit')} : <MoneyValue value={data.totals.totalDebit} />
              </Text>
              <Text strong>
                {t('Crédit')} : <MoneyValue value={data.totals.totalCredit} />
              </Text>
              <Text strong>
                {t('Solde de clôture')} : <MoneyValue value={data.totals.closingBalance} signed />
              </Text>
            </div>
          )}
        </>
      )}
    </AccountingFrame>
  );
};

export default GrandLivreAuxiliaire;
