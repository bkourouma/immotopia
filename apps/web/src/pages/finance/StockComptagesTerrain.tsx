import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Select, Space, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/primitives/PageHeader';
import { StateBlock } from '../../components/primitives/StateBlock';
import { ModuleNotIncluded } from '../../components/primitives/ModuleNotIncluded';
import { DataView } from '../../components/primitives/DataView';
import { DataCard } from '../../components/primitives/DataCard';
import { FilterSheet } from '../../components/primitives/FilterSheet';
import { MoneyValue } from '../../components/primitives/MoneyValue';
import { StatusTag } from '../../components/primitives/StatusTag';
import { SkeletonTable } from '../../components/primitives/Skeleton';
import { StockQuantityCell } from '../../components/finance/stock/StockQuantityCell';
import { StockBlindBanner } from '../../components/finance/stock/StockBlindBanner';
import {
  FieldCaptureDrawer,
  STOCK_FIELD_COUNTS_ENTITY
} from '../../components/finance/stock/whatsapp/FieldCaptureDrawer';
import { useCaptureDrawerParam } from '../../components/finance/stock/whatsapp/useFieldCaptures';
import { STOCK_WHATSAPP_REGISTRATIONS_ENTITY } from '../../components/finance/stock/whatsapp/WhatsappRegistrationsTab';
import {
  formatDateTime,
  inventoryHref,
  isForbiddenError
} from '../../components/finance/stock/whatsapp/whatsapp-labels';
import { useStockFieldContext } from '../../hooks/useStockFieldContext';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { listStockFieldCounts, listStockWhatsappRegistrations } from '../../services/finance-stock-whatsapp-service';
import type { FieldCountRow, StockCountSource } from '../../types/finance-stock-whatsapp-types';
import type { StockMeta } from '../../types/finance-stock-controle-types';
import { STOCK_COUNT_STATUS_DISPLAY } from '../../types/finance-stock-controle-types';
import { formatQuantity } from '../../types/finance-stock-inventaire-types';
import { isModuleNotIncludedError } from '../../utils/module-not-included';
import { handleApiError } from '../../utils/error-handler';
import { t } from '../../i18n/t';

const PAGE_SIZE = 50;

function sourceParam(value: string | null): StockCountSource | undefined {
  return value === 'WHATSAPP' || value === 'WEB' ? value : undefined;
}

/** Les masques valent pour toute la liste : valeurs visibles d'après la 1re page, lieux masqués réunis. */
function mergeMeta(metas: StockMeta[]): StockMeta {
  if (metas.length === 0) return { valuesVisible: false, blindLocationIds: [] };
  const blind = new Set<string>();
  for (const meta of metas) for (const id of meta.blindLocationIds ?? []) blind.add(id);
  return {
    valuesVisible: metas.every(meta => meta.valuesVisible),
    blindLocationIds: [...blind],
    nextCursor: metas[metas.length - 1].nextCursor ?? null
  };
}

const LastCountCell: React.FC<{ row: FieldCountRow }> = ({ row }) => {
  const last = row.lastCount;
  if (!last) return <span>—</span>;
  if (last.countedQuantity === null || last.countedQuantity === undefined) {
    return <Typography.Text type="secondary">{t('Non compté')}</Typography.Text>;
  }
  return <span>{formatQuantity(last.countedQuantity, row.unit)}</span>;
};

const SourceCell: React.FC<{ row: FieldCountRow }> = ({ row }) => {
  const last = row.lastCount;
  if (!last?.countSource) return <span>—</span>;
  return (
    <Space direction="vertical" size={0}>
      {last.countSource === 'WHATSAPP' ? (
        <StatusTag status="WHATSAPP" tone="info" label={t('WhatsApp')} />
      ) : (
        <StatusTag status="WEB" tone="neutral" label={t('Web')} />
      )}
      {last.outcome === 'CORRECTED' && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('corrigé')}
        </Typography.Text>
      )}
    </Space>
  );
};

const CountedAtCell: React.FC<{ row: FieldCountRow }> = ({ row }) => {
  const at = row.lastCount?.countedAtServer;
  if (!at) return <span>—</span>;
  return (
    <Tooltip title={t('heure du serveur')}>
      <span>{formatDateTime(at)}</span>
    </Tooltip>
  );
};

/**
 * W-E2 — Comptages terrain (ecrans §3). Stock théorique et dernier comptage
 * physique, par lieu et par article, sous les masques du lot 040 : une
 * quantité masquée se lit « Comptage en cours », une valeur absente fait
 * disparaître sa colonne. Aucune colonne d'écart, aucune vignette : la photo
 * ne se lit qu'à l'ouverture du visualiseur.
 */
export function StockComptagesTerrain(): React.ReactElement {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { captureId, openCapture, closeCapture } = useCaptureDrawerParam();
  const contexte = useStockFieldContext(tenantId);
  const ctx = contexte.data?.data;
  const canManage = Boolean(ctx?.abilities.canManageSettings);

  const [siteId, setSiteId] = useState<string | undefined>(undefined);
  const locationId = params.get('lieu') ?? undefined;
  const itemId = params.get('article') ?? undefined;
  const source = sourceParam(params.get('source'));

  const setParam = (cle: string, valeur: string | undefined) =>
    setParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (valeur) next.set(cle, valeur);
        else next.delete(cle);
        return next;
      },
      { replace: true }
    );

  const filtres = { siteId, locationId, itemId, source };
  const activeCount = Object.values(filtres).filter(Boolean).length;

  const liste = useInfiniteQuery({
    queryKey: queryKey(STOCK_FIELD_COUNTS_ENTITY, tenantId, filtres),
    queryFn: ({ pageParam }) =>
      listStockFieldCounts(tenantId as string, { ...filtres, cursor: pageParam ?? undefined, limit: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.meta.nextCursor ?? null,
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const rows = useMemo(() => liste.data?.pages.flatMap(page => page.data) ?? [], [liste.data]);
  const meta = useMemo(() => mergeMeta(liste.data?.pages.map(page => page.meta) ?? []), [liste.data]);
  const blind = useMemo(() => new Set(meta.blindLocationIds), [meta]);

  const sansInscription = useQuery({
    queryKey: queryKey(STOCK_WHATSAPP_REGISTRATIONS_ENTITY, tenantId),
    queryFn: () => listStockWhatsappRegistrations(tenantId as string),
    enabled: Boolean(tenantId) && canManage && liste.isSuccess && rows.length === 0,
    staleTime: STALE_TIME.list
  });

  const header = (
    <PageHeader
      title={t('Comptages terrain')}
      subtitle={t('Stock théorique et dernier comptage physique, par lieu et par article')}
    />
  );

  if (!tenantId) return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;

  const refus = contexte.error ?? liste.error;
  if (refus && isModuleNotIncludedError(refus)) return <ModuleNotIncluded />;
  if (refus && isForbiddenError(refus)) {
    return (
      <>
        {header}
        <StateBlock
          variant="forbidden"
          title={t('Le stock ne vous est pas ouvert')}
          description={t(
            'Votre rôle ne comprend pas la consultation du stock. Demandez à l’administrateur de l’agence de vous attribuer le rôle Magasinier ou un rôle qui la comprend.'
          )}
        />
      </>
    );
  }

  const sites = ctx?.sites ?? [];
  const locations = (ctx?.locations ?? []).filter(location => !siteId || location.siteId === siteId);
  const items = ctx?.items ?? [];
  const showValues = meta.valuesVisible;
  const rappelNonComptes = rows.some(
    row => row.lastCount?.countStatus === 'COUNTED' && row.lastCount?.countSource === 'WHATSAPP'
  );

  const valeurCell = (row: FieldCountRow) => {
    if (row.theoreticalValue !== null && row.theoreticalValue !== undefined) {
      return <MoneyValue value={row.theoreticalValue} />;
    }
    return blind.has(row.locationId) ? <StockQuantityCell quantity={null} /> : null;
  };

  const inventaireCell = (row: FieldCountRow) => {
    const last = row.lastCount;
    if (!last?.countId) return <span>—</span>;
    const statut = last.countStatus ? STOCK_COUNT_STATUS_DISPLAY[last.countStatus] : null;
    return (
      <Space direction="vertical" size={2}>
        {statut && <StatusTag status={last.countStatus} tone={statut.tone} label={statut.label} />}
        <Link to={inventoryHref(tenantId, last.countId)}>{t('Ouvrir l’inventaire')}</Link>
      </Space>
    );
  };

  const photoCell = (row: FieldCountRow) => {
    const last = row.lastCount;
    if (!last?.captureId) return null;
    if (!last.hasPhoto) return <Typography.Text type="secondary">{t('Photo retirée')}</Typography.Text>;
    const id = last.captureId;
    return (
      <Button size="small" onClick={() => openCapture(id)}>
        {t('Voir la photo')}
      </Button>
    );
  };

  const columns: ColumnsType<FieldCountRow> = [
    {
      title: t('Lieu'),
      key: 'location',
      render: (_v, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.locationLabel}</span>
          {row.siteName && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.siteName}
            </Typography.Text>
          )}
        </Space>
      )
    },
    {
      title: t('Article'),
      key: 'item',
      render: (_v, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.itemLabel}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.itemReference}
          </Typography.Text>
        </Space>
      )
    },
    {
      title: t('Stock théorique'),
      key: 'theoretical',
      align: 'end',
      render: (_v, row) => <StockQuantityCell quantity={row.theoreticalQuantity ?? null} unit={row.unit} />
    },
    ...(showValues
      ? [
          {
            title: t('Valeur'),
            key: 'value',
            align: 'end' as const,
            render: (_v: unknown, row: FieldCountRow) => valeurCell(row)
          }
        ]
      : []),
    { title: t('Dernier comptage'), key: 'last', align: 'end', render: (_v, row) => <LastCountCell row={row} /> },
    { title: t('Date et heure'), key: 'at', render: (_v, row) => <CountedAtCell row={row} /> },
    { title: t('Compté par'), key: 'by', render: (_v, row) => row.lastCount?.countedByLabel ?? '—' },
    { title: t('Source'), key: 'source', render: (_v, row) => <SourceCell row={row} /> },
    { title: t('Inventaire'), key: 'count', render: (_v, row) => inventaireCell(row) },
    { title: t('Photo'), key: 'photo', render: (_v, row) => photoCell(row) }
  ];

  const emptyAction =
    canManage && sansInscription.isSuccess && sansInscription.data.length === 0
      ? {
          label: t('Inscrire un chef de chantier'),
          onClick: () => navigate(`/tenant/${tenantId}/finance/stock/whatsapp?onglet=inscriptions`)
        }
      : undefined;

  return (
    <>
      {header}
      <Typography.Paragraph type="secondary">
        {t(
          'Les comptages faits par WhatsApp entrent dans l’inventaire du lieu. Le stock ne change qu’à la validation de l’inventaire, par une autre personne que celle qui a compté.'
        )}
      </Typography.Paragraph>

      <FilterSheet
        activeCount={activeCount}
        title={t('Filtrer')}
        onClear={() => {
          setSiteId(undefined);
          setParams(
            prev => {
              const next = new URLSearchParams(prev);
              ['lieu', 'article', 'source'].forEach(cle => next.delete(cle));
              return next;
            },
            { replace: true }
          );
        }}
      >
        <Select
          allowClear
          placeholder={t('Chantier')}
          aria-label={t('Chantier')}
          style={{ minWidth: 200 }}
          value={siteId}
          onChange={value => setSiteId(value)}
          options={sites.map(site => ({ value: site.id, label: site.name }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('Lieu')}
          aria-label={t('Lieu')}
          style={{ minWidth: 200 }}
          value={locationId}
          onChange={value => setParam('lieu', value)}
          options={locations.map(location => ({ value: location.id, label: location.label }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('Article')}
          aria-label={t('Article')}
          style={{ minWidth: 220 }}
          value={itemId}
          onChange={value => setParam('article', value)}
          options={items.map(item => ({ value: item.id, label: `${item.reference} — ${item.label}` }))}
        />
        <Select
          placeholder={t('Source du dernier comptage')}
          aria-label={t('Source du dernier comptage')}
          style={{ minWidth: 200 }}
          value={source ?? 'ALL'}
          onChange={value => setParam('source', value === 'ALL' ? undefined : value)}
          options={[
            { value: 'ALL', label: t('Toutes les sources') },
            { value: 'WHATSAPP', label: t('WhatsApp') },
            { value: 'WEB', label: t('Web') }
          ]}
        />
      </FilterSheet>

      {locationId && blind.has(locationId) && (
        <div style={{ marginBlockEnd: 16 }}>
          <StockBlindBanner variant="count" />
        </div>
      )}

      {rappelNonComptes && (
        <Alert
          type="info"
          showIcon
          style={{ marginBlockEnd: 16 }}
          title={t(
            'Un inventaire clos par WhatsApp crée une ligne « non comptée » pour chaque article du lieu qui n’a pas été photographié. Le validateur peut les écarter en une fois depuis l’inventaire.'
          )}
        />
      )}

      {liste.isPending ? (
        <SkeletonTable rows={6} columns={columns.length} aria-label={t('Comptages terrain en cours de chargement')} />
      ) : (
        <DataView<FieldCountRow>
          aria-label={t('Comptages terrain')}
          items={rows}
          total={rows.length}
          page={1}
          pageSize={Math.max(rows.length, 1)}
          paginated={false}
          onPageChange={() => undefined}
          isReloading={liste.isFetching && !liste.isFetchingNextPage}
          error={liste.error ? handleApiError(liste.error) : null}
          onRetry={() => void liste.refetch()}
          emptyDescription={t('Aucun comptage pour ces filtres.')}
          emptyAction={emptyAction}
          rowKey={row => `${row.locationId}:${row.itemId}`}
          columns={columns}
          scrollX={1200}
          renderCard={row => (
            <DataCard
              title={row.itemLabel}
              subtitle={`${row.itemReference} · ${row.locationLabel}`}
              status={<SourceCell row={row} />}
              fields={[
                {
                  label: t('Stock théorique'),
                  value: <StockQuantityCell quantity={row.theoreticalQuantity ?? null} unit={row.unit} />
                },
                ...(showValues ? [{ label: t('Valeur'), value: valeurCell(row) }] : []),
                { label: t('Dernier comptage'), value: <LastCountCell row={row} /> },
                { label: t('Date et heure'), value: <CountedAtCell row={row} /> },
                { label: t('Compté par'), value: row.lastCount?.countedByLabel ?? '—' },
                { label: t('Inventaire'), value: inventaireCell(row) },
                { label: t('Photo'), value: photoCell(row) }
              ]}
            />
          )}
        />
      )}

      {liste.hasNextPage && (
        <div style={{ textAlign: 'center', marginBlockStart: 16 }}>
          <Button loading={liste.isFetchingNextPage} onClick={() => void liste.fetchNextPage()}>
            {t('Charger plus')}
          </Button>
        </div>
      )}

      <FieldCaptureDrawer tenantId={tenantId} captureId={captureId} onClose={closeCapture} />
    </>
  );
}

export default StockComptagesTerrain;
