import { Alert, Button, DatePicker, Empty, Form, Input, Select, Space, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useState } from 'react';
import type { Dayjs } from 'dayjs';
import { formatNumber } from '../../i18n/format';
import { t } from '../../i18n/t';
import {
  downloadAiUsage,
  listAiUsage,
  type AssistantUsageFilters,
  type AssistantUsageItem,
  type AssistantUsageReport
} from '../../services/ai-settings-service';
import { handleApiError } from '../../utils/error-handler';

const pageSize = 25;
const { Text } = Typography;
type FormValues = Omit<AssistantUsageFilters, 'from' | 'to'> & { period?: [Dayjs, Dayjs] };

export function AssistantUsageList() {
  const [filters, setFilters] = useState<AssistantUsageFilters>({});
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<AssistantUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [form] = Form.useForm<FormValues>();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listAiUsage(filters, offset, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setReport(data);
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(handleApiError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, offset, retry]);

  const modes = {
    standard: t('Standard'),
    deep: t('Approfondi'),
    fast: t('Rapide'),
    rewrite: t('Réécriture'),
    transcription: t('Transcription de la dictée')
  };
  const statuses = {
    ok: t('Réussi'),
    error: t('Erreur'),
    aborted: t('Interrompu'),
    refused: t('Refusé'),
    truncated: t('Tronqué')
  };
  const providers = {
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic',
    fake: t('Faux (recette)'),
    openai: 'OpenAI',
    google: t('Google Gemini')
  };
  const number = (value: number | null) => (value === null ? '—' : formatNumber(value));
  const apply = (next: AssistantUsageFilters) => {
    setOffset(0);
    setFilters(next);
  };
  const columns: TableColumnsType<AssistantUsageItem> = [
    {
      title: t('Agence / compte'),
      key: 'account',
      render: (_value, row) => (
        <Space direction="vertical" size={0}>
          <Button
            type="link"
            size="small"
            style={{ paddingInline: 0 }}
            onClick={() => apply({ ...filters, tenantId: row.tenantId })}
          >
            {row.agency ?? '—'}
          </Button>
          {row.userId && row.account && (
            <Button
              type="link"
              size="small"
              style={{ paddingInline: 0 }}
              onClick={() => apply({ ...filters, userId: row.userId ?? undefined })}
            >
              {row.account}
            </Button>
          )}
        </Space>
      )
    },
    {
      title: t('Fournisseur / modèle'),
      key: 'model',
      render: (_value, row) => (
        <Space direction="vertical" size={0}>
          <Text>{providers[row.provider]}</Text>
          <Text type="secondary">{row.model ?? '—'}</Text>
        </Space>
      )
    },
    {
      title: t('Mode / résultat'),
      key: 'status',
      render: (_value, row) => `${modes[row.mode]} · ${statuses[row.status]}`
    },
    { title: t('Appels'), dataIndex: 'calls', render: number },
    {
      title: t('Jetons en entrée / sortie'),
      key: 'tokens',
      render: (_value, row) => `${number(row.inputTokens)} / ${number(row.outputTokens)}`
    },
    {
      title: t('Cache lu / écrit'),
      key: 'cache',
      render: (_value, row) => `${number(row.cacheReadTokens)} / ${number(row.cacheWriteTokens)}`
    },
    {
      title: t('Coût communiqué (USD)'),
      key: 'cost',
      render: (_value, row) => (
        <Space direction="vertical" size={0}>
          <Text>
            <bdi>{row.costUsd ?? t('Inconnu')}</bdi>
          </Text>
          {row.unknownCosts > 0 && (
            <Text type="secondary">{t('Appels sans coût communiqué : {{count}}', { count: row.unknownCosts })}</Text>
          )}
        </Space>
      )
    },
    { title: t('Durée moyenne (ms)'), dataIndex: 'averageDurationMs', render: number },
    { title: t('Durée audio estimée (s)'), dataIndex: 'audioSeconds', render: value => number(value ?? null) }
  ];

  async function exportCsv() {
    if (!report) return;
    setExporting(true);
    setError(null);
    try {
      await downloadAiUsage({ ...filters, from: report.from, to: report.to });
    } catch (reason) {
      setError(handleApiError(reason));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={({ period, model, ...next }) =>
          apply({
            ...next,
            tenantId: filters.tenantId,
            userId: filters.userId,
            model: model?.trim() || undefined,
            from: period?.[0].format('YYYY-MM-DD'),
            to: period?.[1].format('YYYY-MM-DD')
          })
        }
      >
        <Space wrap align="end">
          <Form.Item name="period" label={t('Période (UTC)')}>
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item name="provider" label={t('Fournisseur')}>
            <Select
              allowClear
              style={{ minWidth: 115 }}
              options={Object.entries(providers).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="model" label={t('Modèle')}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="mode" label={t('Mode')}>
            <Select
              allowClear
              style={{ minWidth: 115 }}
              options={Object.entries(modes).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="status" label={t('Résultat')}>
            <Select
              allowClear
              style={{ minWidth: 115 }}
              options={Object.entries(statuses).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button htmlType="submit" style={{ minHeight: 44 }}>
                {t('Filtrer')}
              </Button>
              <Button
                style={{ minHeight: 44 }}
                onClick={() => {
                  form.resetFields();
                  apply({});
                }}
              >
                {t('Réinitialiser')}
              </Button>
            </Space>
          </Form.Item>
        </Space>
      </Form>
      {error && (
        <Alert
          type="error"
          showIcon
          role="alert"
          message={error}
          action={
            <Button size="small" onClick={() => setRetry(value => value + 1)}>
              {t('Réessayer')}
            </Button>
          }
        />
      )}
      <Space wrap>
        {report && (
          <Text type="secondary">
            {report.from} – {report.to} UTC
          </Text>
        )}
        {(filters.userId || filters.tenantId) && (
          <Text type="secondary">{t('Filtre de compte ou d’agence actif')}</Text>
        )}
        <Button
          style={{ minHeight: 44 }}
          loading={exporting}
          disabled={loading || !report}
          onClick={() => void exportCsv()}
        >
          {t('Exporter en CSV')}
        </Button>
      </Space>
      <Table
        size="small"
        scroll={{ x: 1050 }}
        loading={loading}
        pagination={false}
        rowKey={row => JSON.stringify([row.tenantId, row.userId, row.provider, row.model, row.mode, row.status])}
        columns={columns}
        dataSource={report?.items ?? []}
        locale={{
          emptyText: (
            <Empty
              description={
                filters.tenantId ||
                filters.userId ||
                filters.provider ||
                filters.model ||
                filters.mode ||
                filters.status
                  ? t('Aucun usage ne correspond aux filtres.')
                  : t('Aucun usage enregistré sur cette période.')
              }
            />
          )
        }}
      />
      <Space wrap>
        <Button
          style={{ minHeight: 44 }}
          disabled={!offset || loading}
          onClick={() => setOffset(value => value - pageSize)}
        >
          {t('Précédent')}
        </Button>
        <Button
          style={{ minHeight: 44 }}
          disabled={!report?.hasNext || loading}
          onClick={() => setOffset(value => value + pageSize)}
        >
          {t('Suivant')}
        </Button>
      </Space>
    </Space>
  );
}
