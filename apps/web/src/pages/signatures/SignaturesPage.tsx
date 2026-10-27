import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, DatePicker, Empty, Input, Popconfirm, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import type { Dayjs } from 'dayjs';
import { Table } from '../../components/primitives';
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
const { RangePicker } = DatePicker;
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
  const [status, setStatus] = useState<SignatureRequestStatus | undefined>();
  const [kind, setKind] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [range, setRange] = useState<[string, string] | undefined>();
  const [page, setPage] = useState(1);
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
    const common = { kind, q: q.trim() || undefined, from: range?.[0], to: range?.[1] };
    const filters: SignatureAdminFilters = {
      ...common,
      status,
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir
    };
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
  }, [status, kind, q, range, page, sortBy, sortDir]);

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
    setPage(pagination.current ?? 1);
  };

  const pick = (next: SignatureRequestStatus | undefined) => {
    setStatus(next);
    setPage(1);
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

      <Space wrap size="small">
        <Select
          allowClear
          placeholder={t('Type de document')}
          aria-label={t('Type de document')}
          style={{ minWidth: 200 }}
          value={kind}
          onChange={value => {
            setKind(value);
            setPage(1);
          }}
          options={SIGNATURE_KINDS.map(value => ({ value, label: kindLabel(value) }))}
        />
        <Input.Search
          allowClear
          placeholder={t('Rechercher un document ou un signataire')}
          aria-label={t('Rechercher')}
          style={{ minWidth: 240 }}
          onSearch={value => {
            setQ(value);
            setPage(1);
          }}
        />
        <RangePicker
          onChange={(values: null | (Dayjs | null)[]) => {
            setRange(
              values?.[0] && values?.[1] ? [values[0].format('YYYY-MM-DD'), values[1].format('YYYY-MM-DD')] : undefined
            );
            setPage(1);
          }}
        />
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
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={items}
        exportable={false}
        scroll={{ x: 'max-content' }}
        onChange={handleTableChange as any}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false }}
        locale={{
          emptyText: <Empty description={<Text type="secondary">{t('Aucune demande de signature')}</Text>} />
        }}
      />

      <SignatureDetailDrawer requestId={detailId} onClose={() => setDetailId(null)} />
    </Space>
  );
};

export default SignaturesPage;
