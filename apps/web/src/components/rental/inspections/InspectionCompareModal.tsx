import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Col, Modal, Row, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  compareInspections,
  InspectionCompareRow,
  InspectionCompareSummary,
  InspectionMeterKey
} from '../../../services/lease-inspections-service';
import { conditionLabel } from './inspection-constants';
import { MoneyValue } from '../../primitives/MoneyValue';
import { StatCard } from '../../primitives/StatCard';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface InspectionCompareModalProps {
  open: boolean;
  tenantId: string;
  leaseId: string;
  onClose: () => void;
}

const DEGRADED_BACKGROUND = '#fff1f0';
const MISSING_BACKGROUND = '#f9f0ff';

/** Une ligne porte un écart : dégradé, manquant, baisse de quantité ou absent de la sortie. */
function hasGap(row: InspectionCompareRow): boolean {
  return row.degraded || row.missing || row.quantityDecrease > 0 || row.absentFromExit;
}

function rowBackground(row: InspectionCompareRow): string | undefined {
  if (row.degraded) return DEGRADED_BACKGROUND;
  if (row.missing || row.quantityDecrease > 0 || row.absentFromExit) return MISSING_BACKGROUND;
  return undefined;
}

function meterLabel(key: InspectionMeterKey): string {
  switch (key) {
    case 'electricity':
      return t('Électricité');
    case 'water':
      return t('Eau');
    default:
      return t('Gaz');
  }
}

function formatDifference(difference: number | null): React.ReactNode {
  if (difference === null) return '—';
  const formatted = difference.toLocaleString(activeLocale(), { maximumFractionDigits: 3 });
  if (difference < 0) {
    return (
      <span>
        {formatted}{' '}
        <Text type="secondary" style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>
          {t("Relevé de sortie inférieur à celui d'entrée")}
        </Text>
      </span>
    );
  }
  return formatted;
}

interface MeterRow {
  key: InspectionMeterKey;
  entry: string | null;
  exit: string | null;
  difference: number | null;
}

/** Synthèse en tête de la comparaison (CA-M4.9) : chiffres, clés et compteurs. */
const CompareSummaryBlock: React.FC<{ summary: InspectionCompareSummary }> = ({ summary }) => {
  const meterRows: MeterRow[] = (Object.keys(summary.meters) as InspectionMeterKey[])
    .map(key => ({ key, ...summary.meters[key] }))
    .filter(row => row.entry !== null || row.exit !== null);

  return (
    <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }} size="middle">
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <StatCard label={t('Manquants')} value={summary.missingCount} />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label={t('Baisses de quantité')} value={summary.quantityDecreaseCount} />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label={t('Dégradés')} value={summary.degradedCount} />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label={t('Valeur de remplacement des manquants')}
            value={<MoneyValue value={summary.missingValueTotal} />}
          />
        </Col>
      </Row>

      <div>
        <Text strong>{t('Clés')}</Text>
        <div>
          <Text>
            {t("Clés : {{entree}} à l'entrée, {{sortie}} à la sortie", {
              entree: summary.keys.entry ?? '—',
              sortie: summary.keys.exit ?? '—'
            })}
          </Text>
          {summary.keys.missing !== null && summary.keys.missing > 0 && (
            <Tag color="purple" style={{ marginInlineStart: 8 }}>
              {t('Clés manquantes : {{nombre}}', { nombre: summary.keys.missing })}
            </Tag>
          )}
        </div>
      </div>

      {meterRows.length > 0 && (
        <Table<MeterRow>
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={meterRows}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: t('Compteur'), key: 'meter', render: (_, row) => meterLabel(row.key) },
            { title: t("Relevé d'entrée"), key: 'entry', render: (_, row) => row.entry ?? '—' },
            { title: t('Relevé de sortie'), key: 'exit', render: (_, row) => row.exit ?? '—' },
            { title: t('Différence'), key: 'difference', render: (_, row) => formatDifference(row.difference) }
          ]}
        />
      )}
    </Space>
  );
};

function exitConditionCell(row: InspectionCompareRow): React.ReactNode {
  return (
    <span>
      {row.absentFromExit ? '—' : conditionLabel(row.exitCondition)}
      {row.missing && (
        <Tag color="purple" style={{ marginInlineStart: 6 }}>
          {t('Manquant')}
        </Tag>
      )}
      {row.quantityDecrease > 0 && (
        <Tag color="purple" style={{ marginInlineStart: 6 }}>
          {t('Baisse de quantité (−{{nombre}})', { nombre: row.quantityDecrease })}
        </Tag>
      )}
      {row.degraded && (
        <Tag color="red" style={{ marginInlineStart: 6 }}>
          {t('Dégradé')}
        </Tag>
      )}
      {row.absentFromExit && (
        <Tag color="purple" style={{ marginInlineStart: 6 }}>
          {t('Absent de la sortie')}
        </Tag>
      )}
    </span>
  );
}

/**
 * Comparaison entre l'état des lieux d'entrée et celui de sortie : synthèse
 * (manquants, baisses de quantité, dégradés, valeur des manquants, clés,
 * compteurs), puis le tableau élément par élément. Les écarts sont des
 * constats, sans qualification de leur cause.
 */
export const InspectionCompareModal: React.FC<InspectionCompareModalProps> = ({ open, tenantId, leaseId, onClose }) => {
  const [rows, setRows] = useState<InspectionCompareRow[]>([]);
  const [summary, setSummary] = useState<InspectionCompareSummary | null>(null);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    compareInspections(tenantId, leaseId)
      .then(response => {
        if (cancelled) return;
        setRows(response.data.rows);
        setSummary(response.data.summary ?? null);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.response?.data?.message || t('Erreur lors du chargement de la comparaison'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, leaseId]);

  const hasFurniture = rows.some(row => row.kind === 'FURNITURE');
  const visibleRows = useMemo(() => (gapsOnly ? rows.filter(hasGap) : rows), [rows, gapsOnly]);

  const columns: ColumnsType<InspectionCompareRow> = [
    { title: t('Pièce'), dataIndex: 'roomName', key: 'roomName' },
    { title: t('Élément'), dataIndex: 'label', key: 'label' },
    {
      title: t('État d’entrée'),
      key: 'entryCondition',
      render: (_, row) => conditionLabel(row.entryCondition)
    },
    {
      title: t('État de sortie'),
      key: 'exitCondition',
      render: (_, row) => exitConditionCell(row)
    },
    ...(hasFurniture
      ? [
          {
            title: t('Quantité (entrée → sortie)'),
            key: 'quantity',
            render: (_: unknown, row: InspectionCompareRow) =>
              row.kind === 'FURNITURE' ? `${row.entryQuantity ?? '—'} → ${row.exitQuantity ?? '—'}` : '—'
          }
        ]
      : []),
    {
      title: t('Valeur des manquants'),
      key: 'missingValue',
      render: (_, row) => <MoneyValue value={row.missingValue} />
    }
  ];

  return (
    <Modal
      title={t('Comparaison entrée et sortie')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      destroyOnHidden
    >
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      {summary && <CompareSummaryBlock summary={summary} />}
      <Space align="center" style={{ marginBottom: 12 }}>
        <Switch checked={gapsOnly} onChange={setGapsOnly} aria-label={t('Afficher seulement les écarts')} />
        <Text>{t('Afficher seulement les écarts')}</Text>
      </Space>
      <Table
        rowKey={row => `${row.roomId}-${row.itemId}`}
        dataSource={visibleRows}
        columns={columns}
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content' }}
        rowClassName={row => (row.degraded ? 'inspection-compare-row-degraded' : '')}
        onRow={row => {
          const background = rowBackground(row);
          return { style: background ? { background } : undefined };
        }}
      />
    </Modal>
  );
};

export default InspectionCompareModal;
