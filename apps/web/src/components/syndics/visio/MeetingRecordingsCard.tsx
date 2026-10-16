import React, { useState } from 'react';
import { Button, Card, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MeetingRecordingStatus, MeetingRecordingView } from '../../../types/syndic-live-types';
import { formatDateTime } from '../live/live-labels';
import { t } from '../../../i18n/t';

const { Text } = Typography;

const STATUS_COLOR: Record<MeetingRecordingStatus, string> = {
  RECORDING: 'red',
  PROCESSING: 'processing',
  AVAILABLE: 'green',
  FAILED: 'error',
  DELETED: 'default'
};

export function recordingStatusLabel(status: MeetingRecordingStatus): string {
  switch (status) {
    case 'RECORDING':
      return t('En cours');
    case 'PROCESSING':
      return t('En traitement');
    case 'AVAILABLE':
      return t('Disponible');
    case 'FAILED':
      return t('Échec');
    default:
      return t('Supprimé');
  }
}

/** « 1 h 02 min 05 s », « 12 min 03 s » ou « 45 s » ; tiret si inconnue. */
export function formatRecordingDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '-';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min ${String(s).padStart(2, '0')} s`;
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}

/** Taille lisible (Ko, Mo, Go) ; tiret si inconnue. */
export function formatRecordingSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '-';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(value >= 10 ? 0 : 1);
  return `${text} ${units[unit]}`;
}

interface MeetingRecordingsCardProps {
  recordings: MeetingRecordingView[];
  /** Construit l'URL authentifiée du flux (lecteur) ou du téléchargement. */
  fileUrl: (recordingId: string, download: boolean) => string;
  busyRecordingId: string | null;
  onDelete: (recording: MeetingRecordingView) => void;
}

export const MeetingRecordingsCard: React.FC<MeetingRecordingsCardProps> = ({
  recordings,
  fileUrl,
  busyRecordingId,
  onDelete
}) => {
  const [playing, setPlaying] = useState<MeetingRecordingView | null>(null);

  const columns: ColumnsType<MeetingRecordingView> = [
    {
      title: t('Statut'),
      key: 'status',
      render: (_: unknown, recording) => (
        <Space direction="vertical" size={0}>
          <Tag color={STATUS_COLOR[recording.status]} style={{ margin: 0 }}>
            {recordingStatusLabel(recording.status)}
          </Tag>
          {recording.status === 'FAILED' && recording.failureReason ? (
            <Text type="danger">{recording.failureReason}</Text>
          ) : null}
        </Space>
      )
    },
    { title: t('Début'), key: 'startedAt', render: (_: unknown, recording) => formatDateTime(recording.startedAt) },
    {
      title: t('Durée'),
      key: 'duration',
      render: (_: unknown, recording) => formatRecordingDuration(recording.durationSeconds)
    },
    {
      title: t('Taille'),
      key: 'size',
      render: (_: unknown, recording) => formatRecordingSize(recording.fileSize)
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, recording) => {
        const busy = busyRecordingId === recording.id;
        return (
          <Space wrap>
            {recording.status === 'AVAILABLE' ? (
              <>
                <Button size="small" type="primary" onClick={() => setPlaying(recording)}>
                  {t('Lire')}
                </Button>
                <Button
                  size="small"
                  href={fileUrl(recording.id, true)}
                  download
                  aria-label={t("Télécharger l'enregistrement du {{date}}", {
                    date: formatDateTime(recording.startedAt)
                  })}
                >
                  {t('Télécharger')}
                </Button>
              </>
            ) : null}
            {recording.status === 'AVAILABLE' || recording.status === 'FAILED' ? (
              <Popconfirm
                title={t("Supprimer l'enregistrement ?")}
                description={t('Le fichier sera effacé définitivement. Cette action est irréversible.')}
                okText={t('Supprimer')}
                cancelText={t('Annuler')}
                okButtonProps={{ danger: true }}
                onConfirm={() => onDelete(recording)}
              >
                <Button
                  size="small"
                  danger
                  loading={busy}
                  disabled={busyRecordingId !== null}
                  aria-label={t("Supprimer l'enregistrement du {{date}}", {
                    date: formatDateTime(recording.startedAt)
                  })}
                >
                  {t('Supprimer')}
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        );
      }
    }
  ];

  return (
    <Card size="small" title={t('Enregistrements')}>
      <Table<MeetingRecordingView>
        size="small"
        rowKey="id"
        dataSource={recordings}
        columns={columns}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
        locale={{ emptyText: t('Aucun enregistrement pour cette assemblée') }}
      />
      <Modal
        open={playing !== null}
        title={playing ? t('Enregistrement du {{date}}', { date: formatDateTime(playing.startedAt) }) : ''}
        footer={null}
        width={860}
        destroyOnHidden
        onCancel={() => setPlaying(null)}
      >
        {playing ? (
          // Flux authentifié par le cookie de session ; `Range` géré par le serveur.
          <video
            controls
            preload="metadata"
            src={fileUrl(playing.id, false)}
            style={{ width: '100%', maxHeight: '70vh', background: '#000' }}
          />
        ) : null}
      </Modal>
    </Card>
  );
};

export default MeetingRecordingsCard;
