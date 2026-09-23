import React, { useEffect, useState } from 'react';
import { Alert, Modal, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { compareInspections, InspectionCompareRow } from '../../../services/lease-inspections-service';
import { conditionLabel } from './inspection-constants';
import { t } from '../../../i18n/t';

interface InspectionCompareModalProps {
  open: boolean;
  tenantId: string;
  leaseId: string;
  onClose: () => void;
}

/** Tableau de comparaison entre l'état des lieux d'entrée et celui de sortie. */
export const InspectionCompareModal: React.FC<InspectionCompareModalProps> = ({ open, tenantId, leaseId, onClose }) => {
  const [rows, setRows] = useState<InspectionCompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    compareInspections(tenantId, leaseId)
      .then(response => {
        if (!cancelled) setRows(response.data.rows);
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
      render: (_, row) => (
        <span>
          {conditionLabel(row.exitCondition)}
          {row.degraded && (
            <Tag color="red" style={{ marginInlineStart: 6 }}>
              {t('Dégradé')}
            </Tag>
          )}
        </span>
      )
    }
  ];

  return (
    <Modal
      title={t('Comparaison entrée et sortie')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnHidden
    >
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      <Table
        rowKey={row => `${row.roomId}-${row.itemId}`}
        dataSource={rows}
        columns={columns}
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content' }}
        rowClassName={row => (row.degraded ? 'inspection-compare-row-degraded' : '')}
        onRow={row => ({ style: row.degraded ? { background: '#fff1f0' } : undefined })}
      />
    </Modal>
  );
};

export default InspectionCompareModal;
