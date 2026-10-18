import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Modal, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, CloseOutlined, FilePdfOutlined } from '@ant-design/icons';
import { formatMoney } from '../../primitives';
import {
  DeclarationLineView,
  PrefillField,
  SyndicDeclarationRow,
  getSyndicDeclaration,
  getSyndicDeclarationProof
} from '../../../services/syndic-declared-payment-service';
import { t } from '../../../i18n/t';
import {
  DECLARATION_NOT_PENDING_CODE,
  STATUS_COLOR,
  alertView,
  apiErrorCode,
  apiErrorMessage,
  formatDateTime,
  formatPhone,
  hasDuplicateSuspicion,
  operatorLabel,
  prefillFieldLabel,
  rejectReasonLabel,
  statusLabel
} from './helpers';

const { Text, Paragraph } = Typography;

const PREFILL_FIELDS: PrefillField[] = ['operator', 'amount', 'paidAt', 'transactionReference', 'payerPhone'];

export interface DeclarationDrawerProps {
  tenantId: string;
  syndicId: string;
  /** Déclaration à examiner ; `null` = tiroir fermé. */
  declarationId: string | null;
  /** Vrai par défaut : droit de valider et de rejeter. */
  canEdit?: boolean;
  /** Change quand la déclaration a pu être modifiée ailleurs : recharge le détail. */
  refreshToken?: number;
  onClose: () => void;
  onApprove: (row: SyndicDeclarationRow) => void;
  onReject: (row: SyndicDeclarationRow) => void;
  /** La déclaration n'est plus en attente : la liste doit se rafraîchir. */
  onStale?: () => void;
}

type LoadError = 'NOT_FOUND' | 'OTHER' | null;

interface ProofState {
  url: string | null;
  type: string;
  loading: boolean;
  failed: boolean;
}

const NO_PROOF: ProofState = { url: null, type: '', loading: false, failed: false };

/** Témoin R27 : un champ lu par l'IA, retouché ou non par le déclarant. */
const AiWitness: React.FC<{ row: SyndicDeclarationRow; field: PrefillField }> = ({ row, field }) => {
  if (!row.aiPrefilled) return null;
  const edited = row.aiEditedFields.includes(field);
  return edited ? (
    <Tag color="orange">{t('Lu par l’IA, retouché par le déclarant')}</Tag>
  ) : (
    <Tag color="blue">{t('Lu par l’IA')}</Tag>
  );
};

/** Valeur d'un champ suivi par l'IA, avec une petite pastille « IA » et son témoin. */
const FieldWithWitness: React.FC<{ row: SyndicDeclarationRow; field: PrefillField; children: React.ReactNode }> = ({
  row,
  field,
  children
}) => {
  if (!row.aiPrefilled) return <>{children}</>;
  const edited = row.aiEditedFields.includes(field);
  return (
    <Space size={4} wrap>
      <span>{children}</span>
      <Tag
        color={edited ? 'orange' : 'blue'}
        title={edited ? t('Lu par l’IA, retouché par le déclarant') : t('Lu par l’IA')}
      >
        {edited ? t('IA, retouché') : t('IA')}
      </Tag>
    </Space>
  );
};

/** Détail d'une déclaration pour le gestionnaire (contrat §1.7 et §1.8, règles R17 et R27). */
export const DeclarationDrawer: React.FC<DeclarationDrawerProps> = ({
  tenantId,
  syndicId,
  declarationId,
  canEdit = true,
  refreshToken = 0,
  onClose,
  onApprove,
  onReject,
  onStale
}) => {
  const [row, setRow] = useState<SyndicDeclarationRow | null>(null);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [proof, setProof] = useState<ProofState>(NO_PROOF);
  const [proofAttempt, setProofAttempt] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const lastStatus = useRef<{ id: string; status: string } | null>(null);
  const onStaleRef = useRef(onStale);
  onStaleRef.current = onStale;

  const load = useCallback(async () => {
    if (!declarationId) return;
    setLoadError(null);
    try {
      const result = await getSyndicDeclaration(tenantId, syndicId, declarationId);
      const previous = lastStatus.current;
      if (previous && previous.id === result.id && previous.status === 'PENDING' && result.status !== 'PENDING') {
        onStaleRef.current?.();
      }
      lastStatus.current = { id: result.id, status: result.status };
      setRow(result);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (apiErrorCode(e) === DECLARATION_NOT_PENDING_CODE) onStaleRef.current?.();
      setRow(null);
      setLoadError(status === 404 ? 'NOT_FOUND' : 'OTHER');
      setErrorText(apiErrorMessage(e, t('Impossible de charger la déclaration')));
    }
  }, [tenantId, syndicId, declarationId]);

  useEffect(() => {
    if (!declarationId) {
      setRow(null);
      setLoadError(null);
      lastStatus.current = null;
      return;
    }
    if (lastStatus.current && lastStatus.current.id !== declarationId) {
      lastStatus.current = null;
      setRow(null);
    }
    void load();
  }, [declarationId, refreshToken, load]);

  // Capture : flux privé authentifié, converti en URL `blob:` révoquée au démontage
  // et à chaque changement de déclaration (aucune fuite).
  const proofId = row && row.hasProof ? row.id : null;
  useEffect(() => {
    if (!proofId) {
      setProof(NO_PROOF);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setProof({ ...NO_PROOF, loading: true });
    getSyndicDeclarationProof(tenantId, syndicId, proofId)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setProof({ url: objectUrl, type: blob.type || '', loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setProof({ ...NO_PROOF, failed: true });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tenantId, syndicId, proofId, proofAttempt]);

  useEffect(() => {
    setZoomOpen(false);
  }, [declarationId]);

  const pending = row?.status === 'PENDING';

  const renderProof = (current: SyndicDeclarationRow) => {
    if (!current.hasProof) return <Text type="secondary">{t('Aucune capture jointe')}</Text>;
    if (proof.loading) return <Skeleton.Image active />;
    if (proof.failed) {
      return (
        <Space wrap>
          <Text type="secondary">{t('Capture indisponible')}</Text>
          <Button size="small" onClick={() => setProofAttempt(value => value + 1)}>
            {t('Réessayer')}
          </Button>
        </Space>
      );
    }
    if (!proof.url) return null;
    if (proof.type.startsWith('image/')) {
      return (
        <>
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label={t('Agrandir la capture')}
            style={{ border: 0, padding: 0, background: 'none', cursor: 'zoom-in', maxWidth: '100%' }}
          >
            <img
              src={proof.url}
              alt={t('Capture du paiement déclaré')}
              style={{ maxWidth: '100%', maxHeight: 360, display: 'block' }}
            />
          </button>
          <Modal
            open={zoomOpen}
            onCancel={() => setZoomOpen(false)}
            footer={null}
            width="min(100vw, 960px)"
            title={t('Capture du paiement déclaré')}
            destroyOnHidden
          >
            <img src={proof.url} alt={t('Capture agrandie')} style={{ maxWidth: '100%', display: 'block' }} />
          </Modal>
        </>
      );
    }
    if (proof.type === 'application/pdf') {
      return (
        <Button icon={<FilePdfOutlined aria-hidden />} href={proof.url} target="_blank" rel="noopener noreferrer">
          {t('Ouvrir la capture (PDF)')}
        </Button>
      );
    }
    return <Text type="secondary">{t('Capture indisponible')}</Text>;
  };

  const lineColumns = (): ColumnsType<DeclarationLineView['chargeCalls'][number]> => [
    { title: t('Appel'), dataIndex: 'period', key: 'period' },
    {
      title: t('Reste dû actuel'),
      dataIndex: 'remainingDue',
      key: 'remainingDue',
      align: 'end',
      render: (value: number) => formatMoney(value)
    }
  ];

  const renderLines = (current: SyndicDeclarationRow) => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {current.lines.map(line => (
        <div key={line.id}>
          <Space wrap size={8} style={{ marginBottom: 8 }}>
            <Text strong>{t('Lot {{lot}}', { lot: line.lot.lotNumber })}</Text>
            <Text>{t('déclaré : {{montant}}', { montant: formatMoney(line.amount) })}</Text>
            {line.acceptedAmount !== null && line.acceptedAmount !== line.amount ? (
              <Text type="warning">{t('retenu : {{montant}}', { montant: formatMoney(line.acceptedAmount) })}</Text>
            ) : null}
          </Space>
          {line.chargeCalls.length === 0 ? (
            <div>
              <Text type="secondary">{t('Plus anciens appels ouverts du lot d’abord')}</Text>
            </div>
          ) : (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              columns={lineColumns()}
              dataSource={line.chargeCalls}
              scroll={{ x: 'max-content' }}
            />
          )}
        </div>
      ))}
    </Space>
  );

  const renderDocuments = (current: SyndicDeclarationRow) => {
    const documents = current.lines.flatMap(line => line.documents);
    if (documents.length === 0) return null;
    return (
      <Space size={4} wrap>
        {documents.map(doc => (
          <Tag key={doc.id}>{`${doc.kind === 'RECEIPT' ? t('Reçu') : t('Quittance')} ${doc.number}`}</Tag>
        ))}
      </Space>
    );
  };

  const renderAiBox = (current: SyndicDeclarationRow) => {
    if (!current.aiPrefilled) return null;
    return (
      <Alert
        type="info"
        showIcon={false}
        style={{ marginBottom: 16 }}
        message={t('Pré-rempli par IA')}
        description={
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text type="secondary">
              {t('Comparez ces champs avec le relevé de l’opérateur : l’IA ne valide rien.')}
            </Text>
            {PREFILL_FIELDS.map(field => (
              <Space key={field} size={8} wrap>
                <Text>{prefillFieldLabel(field)}</Text>
                <AiWitness row={current} field={field} />
              </Space>
            ))}
          </Space>
        }
      />
    );
  };

  const renderDetails = (current: SyndicDeclarationRow) => {
    const reviewed = current.status === 'APPROVED' || current.status === 'REJECTED';
    return (
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('Déclarant')}>
          <Space size={4} wrap>
            <span>{current.declaredBy.name}</span>
            {current.declaredBy.type === 'MANAGER' ? <Tag>{t('Gestionnaire')}</Tag> : null}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label={t('Numéro payeur')}>
          <FieldWithWitness row={current} field="payerPhone">
            {formatPhone(current.payerPhone)}
          </FieldWithWitness>
        </Descriptions.Item>
        <Descriptions.Item label={t('Numéro de réception')}>
          <FieldWithWitness row={current} field="operator">
            {`${operatorLabel(current.receivingNumber.operator)} · ${formatPhone(current.receivingNumber.phoneNumber)} · ${current.receivingNumber.holderName}`}
          </FieldWithWitness>
        </Descriptions.Item>
        <Descriptions.Item label={t('Montant déclaré')}>
          <FieldWithWitness row={current} field="amount">
            {formatMoney(current.amount)}
          </FieldWithWitness>
        </Descriptions.Item>
        <Descriptions.Item label={t('Date et heure du paiement')}>
          <FieldWithWitness row={current} field="paidAt">
            {formatDateTime(current.paidAt)}
          </FieldWithWitness>
        </Descriptions.Item>
        <Descriptions.Item label={t('Référence')}>
          <FieldWithWitness row={current} field="transactionReference">
            <Text copyable={{ text: current.transactionReference }}>{current.transactionReference}</Text>
          </FieldWithWitness>
        </Descriptions.Item>
        {current.comment ? (
          <Descriptions.Item label={t('Commentaire')}>
            <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{current.comment}</Paragraph>
          </Descriptions.Item>
        ) : null}
        <Descriptions.Item label={t('Déposée le')}>{formatDateTime(current.createdAt)}</Descriptions.Item>
        {reviewed ? (
          <>
            {current.acceptedAmount !== null ? (
              <Descriptions.Item label={t('Montant retenu')}>{formatMoney(current.acceptedAmount)}</Descriptions.Item>
            ) : null}
            {current.acceptedPaidAt ? (
              <Descriptions.Item label={t('Date retenue')}>{formatDateTime(current.acceptedPaidAt)}</Descriptions.Item>
            ) : null}
            <Descriptions.Item label={t('Traitée par')}>{current.reviewedByName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label={t('Traitée le')}>{formatDateTime(current.reviewedAt)}</Descriptions.Item>
            {current.rejectReason ? (
              <Descriptions.Item label={t('Motif de rejet')}>
                {rejectReasonLabel(current.rejectReason)}
              </Descriptions.Item>
            ) : null}
            {current.reviewNote ? (
              <Descriptions.Item label={t('Note de revue')}>
                <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{current.reviewNote}</Paragraph>
              </Descriptions.Item>
            ) : null}
            {renderDocuments(current) ? (
              <Descriptions.Item label={t('Documents émis')}>{renderDocuments(current)}</Descriptions.Item>
            ) : null}
          </>
        ) : null}
      </Descriptions>
    );
  };

  const renderBody = () => {
    if (loadError === 'NOT_FOUND') return <Empty description={t('Déclaration introuvable')} />;
    if (loadError === 'OTHER') {
      return (
        <Alert
          type="error"
          showIcon
          message={errorText}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      );
    }
    if (!row) return <Skeleton active />;
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {pending && row.alerts.length > 0 ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {row.alerts.map((alert, index) => {
              const view = alertView(alert, row);
              return <Alert key={`${alert.kind}-${index}`} type={view.severity} showIcon message={view.text} />;
            })}
          </Space>
        ) : null}
        {renderAiBox(row)}
        <section aria-label={t('Paiement déclaré')}>
          <Typography.Title level={5}>{t('Paiement déclaré')}</Typography.Title>
          {renderDetails(row)}
        </section>
        <section aria-label={t('Lots et appels visés')}>
          <Typography.Title level={5}>{t('Lots et appels visés')}</Typography.Title>
          {renderLines(row)}
        </section>
        <section aria-label={t('Capture')}>
          <Typography.Title level={5}>{t('Capture')}</Typography.Title>
          {renderProof(row)}
        </section>
      </Space>
    );
  };

  const footer = (() => {
    if (!row) return null;
    if (!pending) return <Text type="secondary">{t('Cette déclaration a déjà été traitée.')}</Text>;
    if (!canEdit) return null;
    return (
      <Space wrap>
        <Button type="primary" icon={<CheckOutlined aria-hidden />} onClick={() => onApprove(row)}>
          {t('Valider')}
        </Button>
        <Button danger icon={<CloseOutlined aria-hidden />} onClick={() => onReject(row)}>
          {t('Rejeter')}
        </Button>
      </Space>
    );
  })();

  return (
    <Drawer
      open={declarationId !== null}
      onClose={onClose}
      width="min(100vw, 640px)"
      destroyOnHidden
      title={
        row ? (
          <Space size={4} wrap>
            <span>{t('Paiement déclaré')}</span>
            <Tag color={STATUS_COLOR[row.status]}>{statusLabel(row.status)}</Tag>
            {pending && row.overdue ? <Tag color="red">{t('En retard')}</Tag> : null}
            {pending && hasDuplicateSuspicion(row) ? <Tag color="orange">{t('Doublon suspecté')}</Tag> : null}
          </Space>
        ) : (
          t('Paiement déclaré')
        )
      }
      footer={footer}
    >
      {renderBody()}
    </Drawer>
  );
};

export default DeclarationDrawer;
