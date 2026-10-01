import React, { useState } from 'react';
import { Alert, App, Button, Card, DatePicker, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import {
  getAuditIntegrity,
  type AuditIntegrityChainHead,
  type AuditIntegrityFinding,
  type AuditIntegrityParams,
  type AuditIntegrityReport,
  type AuditIntegrityStatus
} from '../../services/audit-service';
import { getAuditVisibilityLabelFr } from '../../constants/audit-labels';
import { dateFormat, formatNumber } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text } = Typography;
const { RangePicker } = DatePicker;

type ApiError = { response?: { status?: number; data?: { message?: string } } };

const API_DAY_FORMAT = 'YYYY-MM-DD';
const HASH_PREVIEW_LENGTH = 12;

function statusLabel(status: AuditIntegrityStatus): string {
  switch (status) {
    case 'OK':
      return t('Conforme');
    case 'EXPIRED':
      return t('Purgée après rétention');
    case 'LATE_ROWS':
      return t('Lignes arrivées après le scellement');
    case 'ROWS_MISSING':
      return t('Lignes manquantes');
    case 'ALTERED':
      return t('Contenu altéré');
    default:
      return status;
  }
}

function formatDay(day: string): string {
  return dayjs(day).format(dateFormat('short'));
}

function errorMessage(err: unknown): string {
  const { response } = err as ApiError;
  if (response?.data?.message) return response.data.message;
  if (response?.status === 429) {
    return t('Trop de vérifications à la suite : patientez quelques minutes avant de relancer.');
  }
  return t("Erreur lors de la vérification de l'intégrité du journal");
}

function buildColumns(tone: 'error' | 'warning'): ColumnsType<AuditIntegrityFinding> {
  return [
    { title: t('Date'), key: 'sealDate', render: (_, row) => formatDay(row.sealDate) },
    { title: t('Agence'), key: 'tenantKey', render: (_, row) => row.tenantKey },
    { title: t('Visibilité'), key: 'visibility', render: (_, row) => getAuditVisibilityLabelFr(row.visibility) },
    {
      title: t('Statut'),
      key: 'status',
      render: (_, row) => <Tag color={tone}>{statusLabel(row.status)}</Tag>
    },
    {
      title: t('Lignes scellées'),
      key: 'sealedRows',
      align: 'end',
      render: (_, row) => formatNumber(row.sealedRows)
    },
    {
      title: t('Lignes trouvées'),
      key: 'foundRows',
      align: 'end',
      render: (_, row) => formatNumber(row.foundRows)
    }
  ];
}

function FindingsTable({ rows, tone }: { rows: AuditIntegrityFinding[]; tone: 'error' | 'warning' }) {
  return (
    <Table<AuditIntegrityFinding>
      size="small"
      style={{ marginTop: 12 }}
      rowKey={row => `${row.sealDate}|${row.tenantKey}|${row.visibility}`}
      columns={buildColumns(tone)}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 'max-content' }}
    />
  );
}

/** Tête de chaîne : hash tronqué (complet en infobulle) et bouton copier. */
function ChainHead({ head }: { head: AuditIntegrityChainHead }) {
  const { message } = App.useApp();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(head.chainHash);
      message.success(t('Empreinte copiée.'));
    } catch {
      message.error(t("Impossible de copier l'empreinte — copiez-la manuellement."));
    }
  };

  return (
    <Space size={4} wrap>
      <Text type="secondary">
        {t('Tête de la chaîne : scellé n° {{seq}} du {{date}}, empreinte', {
          seq: head.seq,
          date: formatDay(head.sealDate)
        })}
      </Text>
      <Tooltip title={head.chainHash}>
        <Text code>{`${head.chainHash.slice(0, HASH_PREVIEW_LENGTH)}…`}</Text>
      </Tooltip>
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined />}
        aria-label={t("Copier l'empreinte complète")}
        onClick={() => void copy()}
      />
    </Space>
  );
}

function ReportView({ report }: { report: AuditIntegrityReport }) {
  const { chain, partitions } = report;
  const head = chain.head ? <ChainHead head={chain.head} /> : null;
  const noTamper = partitions.tampered.length === 0;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {report.ok ? (
        <Alert
          type="success"
          showIcon
          message={t('Journal intègre')}
          description={
            <Space direction="vertical" size={4}>
              <Text>
                {t('{{checked}} partition(s) vérifiée(s) sur {{seals}} scellé(s) : aucune altération détectée.', {
                  checked: formatNumber(partitions.checked),
                  seals: formatNumber(chain.sealsChecked)
                })}
              </Text>
              {head}
            </Space>
          }
        />
      ) : (
        <Alert
          type="error"
          showIcon
          message={t('Intégrité du journal compromise')}
          description={
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {!chain.ok && (
                <Text>
                  {chain.brokenAtSeq !== undefined
                    ? t('La chaîne des scellés est rompue au scellé n° {{seq}}.', { seq: chain.brokenAtSeq })
                    : t('La chaîne des scellés est rompue.')}
                </Text>
              )}
              {noTamper && chain.ok && <Text>{t('Le journal ne correspond plus à ses scellés.')}</Text>}
              {!noTamper && (
                <>
                  <Text>
                    {t('{{count}} partition(s) ne correspondent plus au scellé :', {
                      count: formatNumber(partitions.tampered.length)
                    })}
                  </Text>
                  <FindingsTable rows={partitions.tampered} tone="error" />
                </>
              )}
              {head}
            </Space>
          }
        />
      )}

      {partitions.lateRows.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t(
            "Lignes arrivées après le scellement : pas forcément une altération (écriture tardive d'un service)"
          )}
          description={<FindingsTable rows={partitions.lateRows} tone="warning" />}
        />
      )}

      {partitions.expired > 0 && (
        <Text type="secondary">
          {t(
            '{{count}} partition(s) purgée(s) après la durée de rétention : situation normale, leur scellé reste dans la chaîne.',
            { count: formatNumber(partitions.expired) }
          )}
        </Text>
      )}

      {partitions.truncated && (
        <Alert
          type="info"
          showIcon
          message={t(
            'Le résultat est tronqué : restreignez la période pour obtenir toutes les anomalies de cette vérification.'
          )}
        />
      )}
    </Space>
  );
}

/**
 * Carte « Intégrité du journal » de la console d'audit plateforme. La
 * vérification relit les scellés et recompte les partitions : aucun appel au
 * montage, uniquement sur clic (10 appels par 10 minutes côté API).
 */
export const AuditIntegrityCard: React.FC = () => {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AuditIntegrityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    const params: AuditIntegrityParams = range
      ? { from: range[0].format(API_DAY_FORMAT), to: range[1].format(API_DAY_FORMAT) }
      : {};
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const response = await getAuditIntegrity(params);
      setReport(response.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card size="small" title={t('Intégrité du journal')} extra={<SafetyCertificateOutlined />}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">
          {t(
            'Contrôle que les scellés quotidiens du journal se chaînent et correspondent toujours aux lignes enregistrées. Sans période, les 500 derniers scellés sont vérifiés.'
          )}
        </Text>
        <Space wrap>
          <RangePicker
            value={range}
            onChange={dates => setRange(dates?.[0] && dates[1] ? [dates[0], dates[1]] : null)}
            format={dateFormat('short')}
            allowClear
            disabled={loading}
            aria-label={t('Période')}
          />
          <Button type="primary" icon={<SafetyCertificateOutlined />} loading={loading} onClick={() => void verify()}>
            {t("Vérifier l'intégrité")}
          </Button>
        </Space>
        {error && <Alert type="error" showIcon message={t('Erreur')} description={error} />}
        {report && <ReportView report={report} />}
      </Space>
    </Card>
  );
};
