import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Space, Typography, Button, Tag, Progress, Dropdown } from 'antd';
import { PlusOutlined, EditOutlined, BankOutlined, MoreOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { listTenants, Tenant, TenantFilters, type ProvisionTenantResult } from '../../services/tenant-service';
import { listCatalog, type CatalogEntry } from '../../services/subscription-v2-service';
import { getSubscriptionSummaries, type SubscriptionSummary } from '../../services/subscription-extras-service';
import { CreateTenantDrawer } from '../../components/admin/CreateTenantDrawer';
import { Table, PageHeader, StatusTag, StateBlock } from '../../components/primitives';
import { useListSearch } from '../../hooks/useListSearch';
import { collectAllPages } from '../../utils/table-export/collect';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

export const TenantsList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  // Ouvert directement à l'arrivée depuis /admin/tenants/new (TenantCreate.tsx
  // redirige ici plutôt que de dupliquer le formulaire).
  const [createOpen, setCreateOpen] = useState(
    Boolean((location.state as { openCreate?: boolean } | null)?.openCreate)
  );

  // Recherche multicritères (état dans l'URL). « Proche de la limite » est un
  // critère de l'API, calculé avant la pagination (jamais sur la page reçue).
  const search = useListSearch({
    apiNames: { sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Nom, identifiant, e-mail, ville…')
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        primary: true,
        options: [
          { value: 'ACTIVE', label: t('Actif') },
          { value: 'SUSPENDED', label: t('Suspendu') }
        ]
      },
      { key: 'nearLimit', type: 'boolean', label: t('Proche de la limite'), primary: true }
    ]
  });

  // Packs, % de lots utilisés et prochaine échéance : le catalogue est global
  // (chargé une fois), le résumé de toute la page arrive en UNE requête
  // (`GET /admin/subscriptions/summaries`, vague 3) — plus de N+1.
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SubscriptionSummary>>({});

  // Export : les résumés des agences des autres pages.
  const exportSummariesRef = useRef<Record<string, SubscriptionSummary>>({});
  const summaryOf = (tenantId: string): SubscriptionSummary | undefined =>
    exportSummariesRef.current[tenantId] ?? summaries[tenantId];

  useEffect(() => {
    listCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  // Une réponse tardive d'une ancienne recherche ne doit pas écraser la dernière.
  const latest = useRef(0);
  const paramsKey = JSON.stringify(search.apiParams);
  useEffect(() => {
    const request = ++latest.current;
    const loadTenants = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await listTenants(JSON.parse(paramsKey) as TenantFilters);
        if (request !== latest.current) return;
        if (response.success && response.data) {
          const list = response.data.tenants || [];
          setTenants(list);
          setTotal(response.data.pagination?.total ?? list.length);
          // Un résumé indisponible n'empêche pas d'afficher la liste.
          const found = await getSubscriptionSummaries(list.map(tenant => tenant.id)).catch(() => ({}));
          if (request === latest.current) setSummaries(found);
        } else {
          setError(t('Erreur lors du chargement des tenants'));
          setTenants([]);
          setTotal(0);
        }
      } catch (err: any) {
        if (request !== latest.current) return;
        setError(err.response?.data?.message || t('Erreur lors du chargement des tenants'));
        setTenants([]);
        setTotal(0);
      } finally {
        if (request === latest.current) setLoading(false);
      }
    };
    void loadTenants();
  }, [paramsKey]);

  // L'état de navigation ne doit servir qu'une fois : un retour arrière ou un
  // rafraîchissement ne doit pas rouvrir le panneau tout seul.
  useEffect(() => {
    if ((location.state as { openCreate?: boolean } | null)?.openCreate) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => {
    // Même critères, nouvelle lecture (après une création d'agence).
    latest.current += 1;
    setLoading(true);
    setError(null);
    listTenants(JSON.parse(paramsKey) as TenantFilters)
      .then(async response => {
        const list = response.data?.tenants ?? [];
        setTenants(list);
        setTotal(response.data?.pagination?.total ?? list.length);
        setSummaries(await getSubscriptionSummaries(list.map(tenant => tenant.id)).catch(() => ({})));
      })
      .catch(() => setError(t('Erreur lors du chargement des tenants')))
      .finally(() => setLoading(false));
  };

  const fetchAllTenants = () =>
    collectAllPages<Tenant>(async (page, limit) => {
      // Mêmes critères que la liste affichée (dont « proche de la limite »).
      const response = await listTenants({ ...(search.filterParams as TenantFilters), page, limit });
      const list = response.data?.tenants ?? [];
      const pageSummaries = await getSubscriptionSummaries(list.map(tenant => tenant.id)).catch(() => ({}));
      exportSummariesRef.current = { ...exportSummariesRef.current, ...pageSummaries };
      return { items: list, total: response.data?.pagination?.total ?? 0 };
    });

  const columns: ColumnsType<Tenant> = [
    {
      title: t('Nom'),
      dataIndex: 'name',
      key: 'name',
      exportValue: record => `${record.name} — ${record.slug}`,
      render: (_, record) => (
        <Space>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--color-primary-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <BankOutlined style={{ fontSize: 20, color: 'var(--color-primary)' }} />
          </div>
          <div>
            <Text strong>{record.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.slug}
            </Text>
          </div>
        </Space>
      )
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <StatusTag status={status} />
    },
    {
      title: t('Packs'),
      key: 'packs',
      exportValue: record =>
        (summaryOf(record.id)?.packs ?? []).map(code => catalog.find(c => c.code === code)?.name ?? code).join(', '),
      render: (_, record) => {
        const summary = summaries[record.id];
        if (!summary) return <Text type="secondary">—</Text>;
        if (summary.packs.length === 0) return <Text type="secondary">{t('Aucun')}</Text>;
        return (
          <Space size={4} wrap>
            {summary.packs.map(code => (
              <Tag key={code}>{catalog.find(c => c.code === code)?.name ?? code}</Tag>
            ))}
          </Space>
        );
      }
    },
    {
      title: t('% de lots utilisés'),
      key: 'lotsUsage',
      exportValue: record => summaryOf(record.id)?.lotsUsagePercent ?? null,
      render: (_, record) => {
        const percent = summaries[record.id]?.lotsUsagePercent ?? null;
        if (percent === null) return <Text type="secondary">—</Text>;
        return (
          <Progress
            percent={Math.min(100, percent)}
            size="small"
            status={percent >= 100 ? 'exception' : 'normal'}
            strokeColor={
              percent >= 100
                ? 'var(--color-error-text)'
                : percent >= 80
                  ? 'var(--color-warning-text)'
                  : 'var(--color-success-text)'
            }
            style={{ minWidth: 120 }}
          />
        );
      }
    },
    {
      title: t('Prochaine échéance'),
      key: 'nextDue',
      exportValue: record => {
        const date = summaryOf(record.id)?.nextDueAt;
        return date ? new Date(date).toLocaleDateString(activeLocale()) : '';
      },
      render: (_, record) => {
        const date = summaries[record.id]?.nextDueAt;
        return date ? new Date(date).toLocaleDateString(activeLocale()) : '—';
      }
    },
    {
      title: t('Email'),
      dataIndex: 'contactEmail',
      key: 'contactEmail',
      render: (email: string) => email || '-'
    },
    {
      title: t('Dernière activité'),
      dataIndex: 'lastActivityAt',
      key: 'lastActivityAt',
      render: (date: string) => (date ? new Date(date).toLocaleDateString(activeLocale()) : '-')
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            onClick={() => navigate(`/admin/tenants/${record.id}`)}
            aria-label={t("Ouvrir la fiche de l'agence {{value}}", { value: record.name })}
            style={{ minHeight: 44 }}
          >
            {t('Ouvrir')}
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'edit',
                  icon: <EditOutlined />,
                  label: t('Modifier'),
                  onClick: () => navigate(`/admin/tenants/${record.id}/edit`)
                }
              ]
            }}
          >
            <Button
              type="text"
              icon={<MoreOutlined />}
              aria-label={t("Autres actions pour l'agence {{value}}", { value: record.name })}
              style={{ minWidth: 44, minHeight: 44 }}
            />
          </Dropdown>
        </Space>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <PageHeader
          title={t('Agences')}
          subtitle={t('Gérez toutes les agences de la plateforme')}
          primaryAction={{ label: t('Nouvelle agence'), icon: <PlusOutlined />, onClick: () => setCreateOpen(true) }}
        />

        <Table<Tenant>
          aria-label={t('Agences')}
          helpId="administration.plateforme-agences.liste.tableau"
          search={search.searchProps}
          exportFilename={t('Agences')}
          exportFetchAll={fetchAllTenants}
          rowKey="id"
          columns={columns}
          dataSource={tenants}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={search.tablePagination(total)}
          locale={{
            emptyText: error ? (
              <StateBlock variant="error" description={error} onRetry={reload} />
            ) : search.isFiltered ? (
              <StateBlock variant="no-results" />
            ) : (
              <StateBlock
                variant="empty"
                title={t('Aucune agence trouvée')}
                actions={[{ label: t('Nouvelle agence'), onClick: () => setCreateOpen(true), primary: true }]}
              />
            )
          }}
        />
      </Space>

      <CreateTenantDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(_result: ProvisionTenantResult) => {
          reload();
        }}
      />
    </>
  );
};
