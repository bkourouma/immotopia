import React, { useEffect, useState } from 'react';
import { Alert, Button, Modal, Space, Table, Tag, theme, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UploadOutlined } from '@ant-design/icons';
import {
  applyReturnFile,
  previewReturnFile,
  type ReturnApplyDto,
  type ReturnPreviewDto,
  type ReturnRecordDto
} from '../../../services/direct-debit-service';
import { formatMoney } from '../../primitives';
import { apiErrorMessage, formatDate, formatDay, returnSkipReasonLabel } from './direct-debit-shared';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface ReturnImportModalProps {
  tenantId: string;
  open: boolean;
  onClose: () => void;
  /** Appelée après une application réussie (le fichier a été importé), avant la fermeture. */
  onApplied: (result: ReturnApplyDto) => void;
}

function actionLabel(action: ReturnRecordDto['action']): string {
  switch (action) {
    case 'SETTLE':
      return t('Constater le règlement');
    case 'REJECT':
      return t('Constater le rejet');
    default:
      return t('Ignorée');
  }
}

const ACTION_COLOR: Record<ReturnRecordDto['action'], string> = {
  SETTLE: 'success',
  REJECT: 'error',
  SKIP: 'default'
};

const SummaryCounts: React.FC<{ summary: ReturnPreviewDto['summary'] }> = ({ summary }) => (
  <Space wrap size={[16, 4]}>
    <span>{t('Règlements : {{n}}', { n: summary.settle })}</span>
    <span>{t('Rejets : {{n}}', { n: summary.reject })}</span>
    <span>{t('Ignorées : {{n}}', { n: summary.skip })}</span>
    <span>{t('Erreurs de lecture : {{n}}', { n: summary.errors })}</span>
  </Space>
);

const AppliedCounts: React.FC<{ summary: ReturnApplyDto['appliedSummary'] }> = ({ summary }) => (
  <Space wrap size={[16, 4]}>
    <span>{t('Réglées : {{n}}', { n: summary.settled })}</span>
    <span>{t('Rejetées : {{n}}', { n: summary.rejected })}</span>
    <span>{t('En échec : {{n}}', { n: summary.failed })}</span>
  </Space>
);

/** Rejet d'une ligne déjà constatée réglée : annule un encaissement et sa quittance. */
function isLateReject(record: ReturnRecordDto): boolean {
  return record.action === 'REJECT' && record.match?.lineStatus === 'SETTLED';
}

const ReadErrors: React.FC<{ errors: ReturnPreviewDto['errors'] }> = ({ errors }) => {
  if (errors.length === 0) return null;
  return (
    <Alert
      type="warning"
      showIcon
      message={t('Lignes illisibles du fichier : {{n}}', { n: errors.length })}
      description={
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {errors.map(item => (
            <li key={`${item.row}-${item.message}`}>
              {t('Ligne {{row}} : {{message}}', { row: item.row, message: item.message })}
            </li>
          ))}
        </ul>
      }
    />
  );
};

/**
 * « Importer un retour de la banque » (spec 042, P3, §8.5 et §8.10) : fenêtre
 * en deux temps. Dépôt du fichier CSV et aperçu du rapprochement (rien n'est
 * écrit), puis « Appliquer » qui relit le même fichier et constate chaque
 * ligne retenue.
 */
export const ReturnImportModal: React.FC<ReturnImportModalProps> = ({ tenantId, open, onClose, onApplied }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ReturnPreviewDto | null>(null);
  const [applied, setApplied] = useState<ReturnApplyDto | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { token } = theme.useToken();

  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(null);
      setApplied(null);
      setBusy(null);
      setError(null);
      setConfirming(false);
    }
  }, [open]);

  const handleFile = async (next: File) => {
    setFile(next);
    setPreview(null);
    setError(null);
    setConfirming(false);
    setBusy('preview');
    try {
      setPreview(await previewReturnFile(tenantId, next));
    } catch (err) {
      setError(apiErrorMessage(err, t('Erreur lors de la lecture du fichier de retour')));
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async () => {
    if (!file) return;
    setBusy('apply');
    setError(null);
    try {
      const result = await applyReturnFile(tenantId, file);
      setApplied(result);
      setConfirming(false);
      onApplied(result);
    } catch (err) {
      // 400 (plafond) et 409 (déjà appliqué, application en cours) : le message de l'API est affiché tel quel.
      setConfirming(false);
      setError(apiErrorMessage(err, t("Erreur lors de l'application du fichier de retour")));
    } finally {
      setBusy(null);
    }
  };

  const columns: ColumnsType<ReturnRecordDto> = [
    { title: t('Ligne du fichier'), dataIndex: 'row', key: 'row', width: 90 },
    {
      title: t("Référence d'opération"),
      key: 'reference',
      render: (_value, record) => <bdi dir="ltr">{record.operationReference}</bdi>
    },
    {
      title: t('Retour de la banque'),
      key: 'outcome',
      render: (_value, record) => (
        <div>
          <Tag color={record.outcome === 'SETTLED' ? 'success' : 'error'}>
            {record.outcome === 'SETTLED' ? t('Réglée') : t('Rejetée')}
          </Tag>
          <div>
            <Text type="secondary">{formatDay(record.date)}</Text>
          </div>
        </div>
      )
    },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      render: (_value, record) => formatMoney(record.amount)
    },
    {
      title: t('Action'),
      key: 'action',
      render: (_value, record) => (
        <div>
          <Tag color={ACTION_COLOR[record.action]}>{actionLabel(record.action)}</Tag>
          {isLateReject(record) && <Tag color="warning">{t('Rejet tardif')}</Tag>}
        </div>
      )
    },
    {
      title: t("Raison de l'écart"),
      key: 'skipReason',
      render: (_value, record) => (record.skipReason ? returnSkipReasonLabel(record.skipReason) : '—')
    },
    {
      title: t('Ligne rapprochée'),
      key: 'match',
      render: (_value, record) =>
        record.match ? (
          <div>
            <bdi dir="ltr">{record.match.remittanceReference}</bdi>
            {record.match.debtorName ? <div>{record.match.debtorName}</div> : null}
            <Text type="secondary">{formatMoney(record.match.lineAmount)}</Text>
          </div>
        ) : (
          '—'
        )
    }
  ];

  const nothingToApply = !preview || preview.summary.settle + preview.summary.reject === 0;

  const lateCount = preview?.records.filter(isLateReject).length ?? 0;

  const footer = applied ? (
    <Button type="primary" onClick={onClose}>
      {t('Fermer')}
    </Button>
  ) : confirming ? (
    <Space key="confirm">
      <Button onClick={() => setConfirming(false)} disabled={busy !== null}>
        {t('Retour')}
      </Button>
      <Button
        type="primary"
        danger
        loading={busy === 'apply'}
        disabled={busy !== null}
        onClick={() => void handleApply()}
      >
        {t("Confirmer l'application")}
      </Button>
    </Space>
  ) : (
    <Space key="review">
      <Button onClick={onClose}>{t('Fermer')}</Button>
      <Button key="apply" type="primary" disabled={nothingToApply || busy !== null} onClick={() => setConfirming(true)}>
        {t('Appliquer')}
      </Button>
    </Space>
  );

  const failed = applied?.results.filter(item => !item.ok) ?? [];
  const failedCount = applied ? Math.max(applied.appliedSummary.failed, failed.length) : 0;

  return (
    <Modal
      open={open}
      title={t('Importer un retour de la banque')}
      width={960}
      footer={footer}
      onCancel={onClose}
      destroyOnHidden
    >
      {applied ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type={failedCount > 0 ? 'warning' : 'success'}
            showIcon
            message={
              failedCount > 0
                ? t('Fichier {{name}} importé avec des constats en échec.', { name: applied.fileName })
                : t('Fichier {{name}} importé.', { name: applied.fileName })
            }
            description={<AppliedCounts summary={applied.appliedSummary} />}
          />
          {failed.length > 0 && (
            <Alert
              type="error"
              showIcon
              message={t('Constats en échec : {{n}}', { n: failed.length })}
              description={
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  {failed.map(item => (
                    <li key={`${item.row}-${item.lineId}`}>
                      {t('Ligne {{row}} : {{message}}', {
                        row: item.row,
                        message: item.error ?? t('Erreur inconnue')
                      })}
                    </li>
                  ))}
                </ul>
              }
            />
          )}
          <ReadErrors errors={applied.errors} />
        </Space>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <p style={{ margin: 0 }}>
            {t(
              "Déposez le fichier CSV de retour de la banque (colonnes reference_operation, statut, date, montant, code_rejet, motif). L'aperçu ne modifie rien : les constats ne sont écrits qu'à « Appliquer »."
            )}
          </p>
          <Upload
            accept=".csv,text/csv"
            maxCount={1}
            showUploadList={false}
            beforeUpload={next => {
              void handleFile(next);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} loading={busy === 'preview'} disabled={busy !== null}>
              {file ? t('Choisir un autre fichier') : t('Choisir un fichier CSV')}
            </Button>
          </Upload>
          {file && (
            <Text type="secondary">
              <bdi dir="ltr">{file.name}</bdi>
            </Text>
          )}
          {error && <Alert type="error" showIcon message={error} />}
          {preview && (
            <>
              {preview.alreadyImported && (
                <Alert
                  type="warning"
                  showIcon
                  message={t('Ce fichier a déjà été importé le {{date}}.', {
                    date: formatDate(preview.alreadyImported.importedAt)
                  })}
                />
              )}
              {confirming && (
                <Alert
                  type="warning"
                  showIcon
                  message={t("Confirmer l'application du fichier ?")}
                  description={t(
                    '{{settle}} règlements créent des encaissements et des quittances ; {{reject}} rejets, dont {{late}} rejets tardifs qui annulent des encaissements et leurs quittances.',
                    { settle: preview.summary.settle, reject: preview.summary.reject, late: lateCount }
                  )}
                />
              )}
              <SummaryCounts summary={preview.summary} />
              <ReadErrors errors={preview.errors} />
              {preview.records.length === 0 ? (
                <Alert type="info" showIcon message={t('Le fichier ne contient aucune ligne exploitable.')} />
              ) : (
                <Table<ReturnRecordDto>
                  rowKey="row"
                  size="small"
                  columns={columns}
                  dataSource={preview.records}
                  pagination={false}
                  onRow={record => (isLateReject(record) ? { style: { background: token.colorWarningBg } } : {})}
                  scroll={{ x: 'max-content', y: 360 }}
                />
              )}
            </>
          )}
        </Space>
      )}
    </Modal>
  );
};
