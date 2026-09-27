import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, DeleteOutlined, ExportOutlined } from '@ant-design/icons';
import {
  deleteTenantDataExport,
  downloadTenantDataExport,
  listTenantDataExports,
  requestTenantDataExport,
  type TenantDataExport,
  type TenantDataExportStatus
} from '../../../services/tenant-data-export-service';
import { StatusTag, useConfirmAction, type StatusTone } from '../../primitives';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/**
 * Onglet Export des données de la fiche agence (lot S7, besoin 8) —
 * archive ZIP complète (un CSV par type de donnée, récapitulatif Excel,
 * fichiers joints), disponible 7 jours. Un seul export QUEUED/RUNNING à la
 * fois par agence ; on rafraîchit toutes les 5 s tant que l'un d'eux est en
 * cours, pour refléter sa progression sans que l'utilisateur ait à recharger.
 */

const POLL_INTERVAL_MS = 5000;

const STATUS_LABEL: Record<TenantDataExportStatus, { tone: StatusTone; label: string }> = {
  QUEUED: { tone: 'neutral', label: t('En attente') },
  RUNNING: { tone: 'info', label: t('En cours') },
  READY: { tone: 'success', label: t('Prêt') },
  FAILED: { tone: 'danger', label: t('Échoué') },
  EXPIRED: { tone: 'neutral', label: t('Expiré') }
};

const ACTIVE_STATUSES: TenantDataExportStatus[] = ['QUEUED', 'RUNNING'];

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(activeLocale());
}

function errorMessage(err: any, fallback: string): string {
  return err?.response?.data?.message || fallback;
}

export const DataExportTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const [exports, setExports] = useState<TenantDataExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listTenantDataExports(tenantId);
      setExports(data);
      return data;
    } catch (err: any) {
      message.error(errorMessage(err, t('Erreur lors du chargement des exports')));
      return [];
    } finally {
      setLoading(false);
    }
  }, [tenantId, message]);

  useEffect(() => {
    load();
  }, [load]);

  // Rafraîchissement toutes les 5 s tant qu'un export est QUEUED ou RUNNING ;
  // arrêt automatique dès que ce n'est plus le cas, et au démontage.
  useEffect(() => {
    const hasActive = exports.some(e => ACTIVE_STATUSES.includes(e.status));
    if (hasActive && !timerRef.current) {
      timerRef.current = setInterval(() => {
        load();
      }, POLL_INTERVAL_MS);
    } else if (!hasActive && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [exports, load]);

  const handleRequest = () => {
    confirmAction({
      title: t('Préparer un export des données de cette agence ?'),
      description: t(
        'Une archive ZIP complète sera préparée : un fichier CSV par type de données, un récapitulatif Excel et les fichiers joints. Elle sera disponible 7 jours.'
      ),
      okText: t('Préparer un export'),
      onConfirm: async () => {
        setRequesting(true);
        try {
          await requestTenantDataExport(tenantId);
          message.success(t('Export demandé'));
          await load();
        } catch (err: any) {
          if (err?.response?.status === 409) {
            message.error(t('Un export est déjà en cours'));
          } else {
            message.error(errorMessage(err, t("Erreur lors de la demande d'export")));
          }
        } finally {
          setRequesting(false);
        }
      }
    });
  };

  const handleDownload = async (row: TenantDataExport) => {
    setDownloadingId(row.id);
    try {
      await downloadTenantDataExport(tenantId, row.id);
    } catch (err: any) {
      if (err?.response?.status === 410 || err?.response?.data?.code === 'EXPORT_EXPIRED') {
        message.error(t('Archive expirée, préparez un nouvel export'));
        await load();
      } else {
        message.error(errorMessage(err, t('Téléchargement impossible')));
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = (row: TenantDataExport) => {
    confirmAction({
      title: t('Supprimer cet export ?'),
      okText: t('Supprimer'),
      danger: true,
      onConfirm: async () => {
        try {
          await deleteTenantDataExport(tenantId, row.id);
          message.success(t('Export supprimé'));
          await load();
        } catch (err: any) {
          message.error(errorMessage(err, t('Erreur lors de la suppression')));
        }
      }
    });
  };

  const columns: ColumnsType<TenantDataExport> = [
    { title: t('Demandé le'), dataIndex: 'createdAt', key: 'createdAt', render: formatDateTime },
    {
      title: t('Demandé par'),
      key: 'requestedBy',
      render: (_, r) => r.requestedBy.fullName || r.requestedBy.email || '—'
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: TenantDataExportStatus) => {
        const info = STATUS_LABEL[status];
        return <StatusTag status={status} tone={info?.tone} label={info?.label} />;
      }
    },
    { title: t('Taille'), key: 'size', render: (_, r) => formatSize(r.sizeBytes) },
    {
      title: t('Tables / lignes / fichiers'),
      key: 'counts',
      render: (_, r) => `${r.modelCount ?? '—'} / ${r.rowCount ?? '—'} / ${r.fileCount ?? '—'}`
    },
    {
      title: t('Fichiers manquants'),
      dataIndex: 'missingFileCount',
      key: 'missingFileCount',
      render: (v: number | null) => (v ?? 0) || '—'
    },
    { title: t('Expiration'), dataIndex: 'expiresAt', key: 'expiresAt', render: formatDateTime },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, r) => (
        <Space wrap>
          {r.status === 'READY' && (
            <Button
              size="small"
              icon={<DownloadOutlined />}
              loading={downloadingId === r.id}
              onClick={() => handleDownload(r)}
            >
              {t('Télécharger')}
            </Button>
          )}
          {r.status !== 'RUNNING' && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>
              {t('Supprimer')}
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Text type="secondary">
        {t(
          "L'export génère une archive ZIP complète des données de cette agence : un fichier CSV par type de données, un récapitulatif Excel et les fichiers joints. L'archive reste disponible 7 jours."
        )}
      </Text>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBlock: 'var(--space-4)' }}>
        <Button type="primary" icon={<ExportOutlined />} loading={requesting} onClick={handleRequest}>
          {t('Préparer un export')}
        </Button>
      </div>

      <Table<TenantDataExport>
        rowKey="id"
        columns={columns}
        dataSource={exports}
        loading={loading}
        scroll={{ x: 'max-content' }}
        aria-label={t('Exports des données')}
        pagination={false}
        locale={{ emptyText: t('Aucun export pour cette agence') }}
      />
    </div>
  );
};
