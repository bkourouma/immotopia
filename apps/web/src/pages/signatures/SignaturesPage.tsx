import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Empty, Popconfirm, Space, Tag, Typography } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import { Table } from '../../components/primitives';
import { useListSearch } from '../../hooks/useListSearch';
import {
  cancelSignatureRequest,
  fetchSignatureFile,
  fetchSignatureSummary,
  listSignaturesPage,
  remindSignatureRequest
} from '../../services/signature-admin-service';
import type {
  SignatureAdminFilters,
  SignatureAdminRequestDto,
  SignatureSortField,
  SignatureSummary
} from '../../services/signature-admin-service';
import type { SignatureRequestStatus } from '../../types/signature-types';
import { isOpenRequest, requestStatusLabel } from '../../components/signature/signature-labels';
import { activeLocale } from '../../i18n/format';
import { describeDownloadError } from '../../utils/download-error';
import { saveBlob } from '../../utils/save-blob';
import { t } from '../../i18n/t';
import { SignatureDetailDrawer } from './SignatureDetailDrawer';
import { SIGNATURE_KINDS, SIGNATURE_STATUSES, kindLabel } from './signature-admin-labels';

const { Title, Text } = Typography;
const PAGE_SIZE = 25;

function dateLabel(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(activeLocale());
}

function fileSlug(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'document';
}

/** Page « Signatures » : suivi de toutes les demandes de signature de l'agence. */
const SignaturesPage: React.FC = () => {
  const { message } = App.useApp();
  // Recherche multicritères (état dans l'URL). La rangée de compteurs par statut
  // reste au-dessus : elle pilote le même critère « Statut ».
  const search = useListSearch({
    defaultPageSize: PAGE_SIZE,
    apiNames: { limit: 'pageSize', sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Titre du document, nom du signataire…'),
        api: 'q'
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        primary: true,
        options: SIGNATURE_STATUSES.map(value => ({ value, label: requestStatusLabel(value).label }))
      },
      {
        key: 'kind',
        type: 'select',
        label: t('Type de document'),
        primary: true,
        options: SIGNATURE_KINDS.map(value => ({ value, label: kindLabel(value) }))
      },
      { key: 'period', type: 'dateRange', label: t('Période de création'), api: ['from', 'to'] }
    ]
  });
  const status = search.values.status as SignatureRequestStatus | undefined;
  const paramsKey = JSON.stringify(search.apiParams);
  const filterKey = JSON.stringify(search.filterParams);
  const [sortBy, setSortBy] = useState<SignatureSortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [items, setItems] = useState<SignatureAdminRequestDto[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<SignatureSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Une réponse tardive d'un ancien filtre ne doit pas écraser la dernière.
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError(null);
    const { status: _status, ...common } = JSON.parse(filterKey) as Record<string, string>;
    const filters = { ...JSON.parse(paramsKey), sortBy, sortDir } as SignatureAdminFilters;
    try {
      const [result, counts] = await Promise.all([
        listSignaturesPage(filters),
        fetchSignatureSummary(common).catch(() => null)
      ]);
      if (current !== sequence.current) return;
      setItems(result.items);
      setTotal(result.total);
      if (counts) setSummary(counts);
    } catch (err: any) {
      if (current !== sequence.current) return;
      setError(err?.response?.data?.message || t('Erreur lors du chargement des signatures'));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [paramsKey, filterKey, sortBy, sortDir]);

  useEffect(() => {
    void load();
  }, [load]);

  const remind = async (request: SignatureAdminRequestDto) => {
    try {
      const { reminded, failed } = await remindSignatureRequest(request.id);
      if (failed > 0) {
        message.warning(t('Rappel envoyé à {{reminded}} signataire(s), échec pour {{failed}}', { reminded, failed }));
      } else if (reminded === 0) {
        message.info(t('Aucun signataire à relancer'));
      } else {
        message.success(t('Rappel envoyé à {{n}} signataire(s) en attente', { n: reminded }));
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("Impossible d'envoyer le rappel"));
    }
  };

  const cancel = async (request: SignatureAdminRequestDto) => {
    try {
      await cancelSignatureRequest(request.id);
      message.success(t('Demande annulée'));
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("Impossible d'annuler la demande"));
    }
  };

  const download = async (request: SignatureAdminRequestDto) => {
    const signed = request.status === 'COMPLETED' && request.hasSignedFile !== false;
    try {
      const blob = await fetchSignatureFile(request.id, signed ? 'signed' : 'source');
      saveBlob(blob, `${fileSlug(request.title)}-${signed ? 'signe' : 'source'}.pdf`);
    } catch (err) {
      message.error(await describeDownloadError(err));
    }
  };

  const columns: ColumnsType<SignatureAdminRequestDto> = [
    {
      title: t('Document'),
      dataIndex: 'title',
      key: 'title',
      sorter: true,
      sortOrder: sortBy === 'title' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (_: unknown, request) => (
        <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => setDetailId(request.id)}>
          {request.title}
        </Button>
      )
    },
    { title: t('Type'), dataIndex: 'kind', key: 'kind', render: (value: string) => kindLabel(value) },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      sorter: true,
      sortOrder: sortBy === 'status' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (value: SignatureRequestStatus) => {
        const info = requestStatusLabel(value);
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: t('Signataires'),
      key: 'signers',
      render: (_: unknown, request) =>
        t('{{signed}}/{{total}} signés', {
          signed: request.signers.filter(signer => signer.status === 'SIGNED').length,
          total: request.signers.length
        })
    },
    {
      title: t('Créée le'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      sorter: true,
      sortDirections: ['descend', 'ascend', 'descend'],
      sortOrder: sortBy === 'createdAt' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (value: string) => dateLabel(value)
    },
    {
      title: t('Échéance'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      sorter: true,
      sortOrder: sortBy === 'expiresAt' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (value: string) => dateLabel(value)
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, request) => (
        <Space wrap size="small">
          <Button size="small" onClick={() => void download(request)}>
            {t('Télécharger')}
          </Button>
          {request.canEdit === true && isOpenRequest(request.status) && (
            <>
              <Button size="small" onClick={() => void remind(request)}>
                {t('Relancer')}
              </Button>
              <Popconfirm
                title={t('Annuler cette demande de signature ?')}
                okText={t('Annuler la demande')}
                cancelText={t('Retour')}
                onConfirm={() => void cancel(request)}
              >
                <Button size="small" danger>
                  {t('Annuler')}
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      )
    }
  ];

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: unknown,
    sorter: SorterResult<SignatureAdminRequestDto> | SorterResult<SignatureAdminRequestDto>[]
  ) => {
    const one = Array.isArray(sorter) ? sorter[0] : sorter;
    if (one?.order && one.columnKey) {
      setSortBy(one.columnKey as SignatureSortField);
      setSortDir(one.order === 'ascend' ? 'asc' : 'desc');
    } else {
      setSortBy('createdAt');
      setSortDir('desc');
    }
    // Un changement de tri repart de la première page ; la pagination vient de la barre.
    if (!pagination || pagination.current === search.page) search.setPage(1);
  };

  const pick = (next: SignatureRequestStatus | undefined) => {
    search.setValues({ status: next });
  };

  const countOf = (value: SignatureRequestStatus) => summary?.byStatus?.[value] ?? 0;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Title level={2} style={{ margin: 0 }}>
        {t('Signatures')}
      </Title>

      <Space wrap size="small" data-testid="signature-counters">
        <Button
          type={status === undefined ? 'primary' : 'default'}
          aria-pressed={status === undefined}
          onClick={() => pick(undefined)}
        >
          {t('Toutes')} ({summary?.total ?? 0})
        </Button>
        {SIGNATURE_STATUSES.map(value => (
          <Button
            key={value}
            type={status === value ? 'primary' : 'default'}
            aria-pressed={status === value}
            onClick={() => pick(value)}
          >
            {requestStatusLabel(value).label} ({countOf(value)})
          </Button>
        ))}
      </Space>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      )}

      <Table<SignatureAdminRequestDto>
        rowKey="id"
        helpId="locatif.signatures.liste.tableau"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={items}
        exportable={false}
        scroll={{ x: 'max-content' }}
        onChange={handleTableChange as any}
        aria-label={t('Demandes de signature')}
        search={search.searchProps}
        pagination={search.tablePagination(total)}
        locale={
          search.isFiltered
            ? undefined
            : { emptyText: <Empty description={<Text type="secondary">{t('Aucune demande de signature')}</Text>} /> }
        }
      />

      <SignatureDetailDrawer requestId={detailId} onClose={() => setDetailId(null)} />
    </Space>
  );
};

export default SignaturesPage;
