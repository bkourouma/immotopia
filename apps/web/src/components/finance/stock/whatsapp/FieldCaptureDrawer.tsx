import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Image,
  Input,
  Modal,
  Space,
  Spin,
  Tooltip,
  Typography
} from 'antd';
import { CopyOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { detailKey, entityKeyPrefix } from '../../../../lib/query-keys';
import { useBreakpoint } from '../../../../hooks/useBreakpoint';
import {
  getStockFieldCapture,
  getStockFieldCaptureFile,
  listStockWhatsappSessionMessages,
  removeStockFieldCapturePhoto
} from '../../../../services/finance-stock-whatsapp-service';
import type { CaptureView } from '../../../../types/finance-stock-whatsapp-types';
import { STOCK_COUNT_STATUS_DISPLAY } from '../../../../types/finance-stock-controle-types';
import { formatQuantity } from '../../../../types/finance-stock-inventaire-types';
import { StatusTag } from '../../../primitives/StatusTag';
import { StateBlock } from '../../../primitives/StateBlock';
import { SkeletonDetail } from '../../../primitives/Skeleton';
import { handleApiError } from '../../../../utils/error-handler';
import { formatPercent } from '../../../../i18n/format';
import { t } from '../../../../i18n/t';
import { ConversationThread } from './ConversationThread';
import {
  apiErrorOf,
  captureOutcomeLabel,
  formatDate,
  formatDateTime,
  formatTime,
  inventoryHref,
  shortHash,
  viaLabel,
  visionFailureLabel,
  visionMethodLabel,
  visionQualityLabel
} from './whatsapp-labels';

/** Entité de cache du détail d'une capture. */
export const STOCK_FIELD_CAPTURE_ENTITY = 'stock-field-capture';
/** Entité de cache de la liste des comptages terrain (relue après un retrait de photo). */
export const STOCK_FIELD_COUNTS_ENTITY = 'stock-field-counts';

export interface FieldCaptureDrawerProps {
  tenantId: string;
  /** `null` : tiroir fermé. */
  captureId: string | null;
  onClose: () => void;
}

/**
 * W-E3 — Visualiseur de preuve (ecrans §4). Ouvert par `?capture=<captureId>`
 * sur Comptages terrain et sur l'Inventaire.
 *
 * Ne montre que ce que le serveur rend : aucune quantité théorique, aucun
 * écart (une capture n'en porte pas). La photo se lit en blob à l'ouverture,
 * jamais par un lien direct.
 */
export const FieldCaptureDrawer: React.FC<FieldCaptureDrawerProps> = ({ tenantId, captureId, onClose }) => {
  const { isMobile } = useBreakpoint();
  const open = Boolean(captureId);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('Comptage par photo')}
      size={isMobile ? '100%' : 640}
      destroyOnHidden
    >
      {captureId && <CaptureDetail tenantId={tenantId} captureId={captureId} />}
    </Drawer>
  );
};

const CaptureDetail: React.FC<{ tenantId: string; captureId: string }> = ({ tenantId, captureId }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [conversationOuverte, setConversationOuverte] = useState(false);
  const [retraitOuvert, setRetraitOuvert] = useState(false);

  const query = useQuery({
    queryKey: detailKey(STOCK_FIELD_CAPTURE_ENTITY, tenantId, captureId),
    queryFn: () => getStockFieldCapture(tenantId, captureId),
    staleTime: 10_000
  });

  if (query.isPending) return <SkeletonDetail aria-label={t('Chargement du comptage par photo')} />;
  if (query.error) {
    const { status } = apiErrorOf(query.error);
    return (
      <StateBlock
        variant={status === 403 ? 'forbidden' : 'error'}
        description={handleApiError(query.error)}
        actions={status === 403 ? [] : [{ label: t('Réessayer'), onClick: () => void query.refetch(), primary: true }]}
      />
    );
  }

  const capture = query.data;
  const relire = () => {
    void queryClient.invalidateQueries({ queryKey: detailKey(STOCK_FIELD_CAPTURE_ENTITY, tenantId, captureId) });
    void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_COUNTS_ENTITY, tenantId) });
  };

  return (
    <div>
      <section aria-label={t('Photo')}>
        <CapturePhoto tenantId={tenantId} capture={capture} />
      </section>

      <Divider />
      <ProofSection capture={capture} />

      <Divider />
      <AnalysisSection capture={capture} />

      <Divider />
      <ChefSection tenantId={tenantId} capture={capture} />

      {capture.canReadConversation && capture.sessionId && (
        <div style={{ marginBlockStart: 16 }}>
          {!conversationOuverte ? (
            <Button icon={<MessageOutlined />} onClick={() => setConversationOuverte(true)}>
              {t('Voir la conversation')}
            </Button>
          ) : (
            <SessionConversation tenantId={tenantId} sessionId={capture.sessionId} captureId={capture.id} />
          )}
        </div>
      )}

      {capture.canRemovePhoto && capture.hasPhoto && !capture.photoRemoved && (
        <div style={{ marginBlockStart: 24 }}>
          <Button danger icon={<DeleteOutlined />} onClick={() => setRetraitOuvert(true)}>
            {t('Retirer la photo')}
          </Button>
        </div>
      )}

      <RemovePhotoModal
        open={retraitOuvert}
        tenantId={tenantId}
        captureId={capture.id}
        onClose={() => setRetraitOuvert(false)}
        onDone={removed => {
          setRetraitOuvert(false);
          if (removed) {
            queryClient.setQueryData(detailKey(STOCK_FIELD_CAPTURE_ENTITY, tenantId, captureId), removed);
            message.success(t('Photo retirée. Le comptage et l’empreinte restent.'));
          } else {
            message.info(t('La photo avait déjà été retirée.'));
          }
          relire();
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Photo (ecrans §4.1)
// ---------------------------------------------------------------------------

const photoFrameStyle: React.CSSProperties = {
  minHeight: 180,
  borderRadius: 8,
  border: '1px solid var(--border-default, #d9d9d9)',
  background: 'var(--surface-sunken, #f5f5f5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  textAlign: 'center'
};

const CapturePhoto: React.FC<{ tenantId: string; capture: CaptureView }> = ({ tenantId, capture }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const lisible = capture.hasPhoto && !capture.photoRemoved;

  useEffect(() => {
    if (!lisible) return undefined;
    let url: string | null = null;
    let cancelled = false;
    setObjectUrl(null);
    setFailed(false);
    getStockFieldCaptureFile(tenantId, capture.id)
      .then(blob => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [tenantId, capture.id, lisible]);

  if (capture.photoRemoved || !capture.hasPhoto) {
    const retrait = capture.photoRemoved;
    return (
      <div style={photoFrameStyle} data-testid="capture-photo-removed">
        <Typography.Text type="secondary">
          {retrait
            ? t('Photo retirée le {{date}} par {{name}} — motif : {{reason}}', {
                date: formatDate(retrait.at),
                name: retrait.byLabel ?? '—',
                reason: retrait.reason ?? '—'
              })
            : t('Photo retirée')}
        </Typography.Text>
      </div>
    );
  }

  if (failed) {
    return (
      <div style={photoFrameStyle}>
        <Typography.Text type="secondary">{t('La photo n’a pas pu être chargée.')}</Typography.Text>
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div style={photoFrameStyle}>
        <Spin />
      </div>
    );
  }

  return (
    <Image
      src={objectUrl}
      alt={t('Photo du stock envoyée par le chef de chantier')}
      style={{ maxHeight: 360, objectFit: 'contain' }}
      width="100%"
    />
  );
};

// ---------------------------------------------------------------------------
// Preuve (ecrans §4.2)
// ---------------------------------------------------------------------------

const ProofSection: React.FC<{ capture: CaptureView }> = ({ capture }) => {
  const { message } = App.useApp();

  const copier = async () => {
    if (!capture.sha256) return;
    try {
      await navigator.clipboard.writeText(capture.sha256);
      message.success(t('Empreinte copiée'));
    } catch {
      message.error(t('La copie a échoué.'));
    }
  };

  return (
    <section aria-label={t('Preuve')}>
      <Typography.Title level={5}>{t('Preuve')}</Typography.Title>
      <Descriptions column={1} size="small">
        <Descriptions.Item label={t('Reçue')}>
          {t('Reçue le {{date}} à {{time}} (heure du serveur)', {
            date: formatDate(capture.receivedAt),
            time: formatTime(capture.receivedAt)
          })}
        </Descriptions.Item>
        {capture.sha256 && (
          <Descriptions.Item label={t('Empreinte')}>
            <Space wrap>
              <Tooltip title={t('Empreinte enregistrée : toute modification du fichier serait détectable.')}>
                <Typography.Text code>{t('Empreinte : {{hash}}', { hash: shortHash(capture.sha256) })}</Typography.Text>
              </Tooltip>
              <Button size="small" icon={<CopyOutlined />} onClick={() => void copier()}>
                {t('Copier l’empreinte complète')}
              </Button>
            </Space>
          </Descriptions.Item>
        )}
        <Descriptions.Item label={t('Canal')}>
          {t('Reçue par : {{via}}', { via: viaLabel(capture.via) })}
        </Descriptions.Item>
        <Descriptions.Item label={t('Chef de chantier')}>{capture.chefLabel ?? '—'}</Descriptions.Item>
        <Descriptions.Item label={t('Chantier')}>{capture.siteName ?? '—'}</Descriptions.Item>
      </Descriptions>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Analyse (ecrans §4.3)
// ---------------------------------------------------------------------------

const AnalysisSection: React.FC<{ capture: CaptureView }> = ({ capture }) => {
  const analyse = capture.analysis ?? null;
  const echec = capture.vision?.failureReason ?? null;
  const unite = capture.unit ?? null;

  return (
    <section aria-label={t('Analyse')}>
      <Typography.Title level={5}>{t('Analyse')}</Typography.Title>

      {(echec || capture.outcome === 'FAILED') && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBlockEnd: 12 }}
          title={t('L’analyse n’a pas abouti')}
          description={echec ? visionFailureLabel(echec) : undefined}
        />
      )}

      <Descriptions column={1} size="small">
        <Descriptions.Item label={t('Article')}>
          {capture.itemLabel ? (
            <span>
              {capture.itemLabel}
              {capture.itemReference && (
                <Typography.Text type="secondary" style={{ marginInlineStart: 6 }}>
                  {capture.itemReference}
                </Typography.Text>
              )}
              {capture.itemImposed && (
                <Typography.Text type="secondary" style={{ display: 'block' }}>
                  {t('choisi par le chef de chantier')}
                </Typography.Text>
              )}
            </span>
          ) : (
            '—'
          )}
        </Descriptions.Item>

        {analyse && (
          <>
            <Descriptions.Item label={t('Méthode')}>
              <span>{visionMethodLabel(analyse.method)}</span>
              <Typography.Text type="secondary" style={{ display: 'block' }}>
                {t('Unités de face : {{n}}', { n: analyse.visibleUnits })}
                {analyse.layers !== null && analyse.columns !== null && (
                  <>
                    {' · '}
                    {t('Couches × colonnes : {{layers}} × {{columns}}', {
                      layers: analyse.layers,
                      columns: analyse.columns
                    })}
                  </>
                )}
                {analyse.depthRows !== null && (
                  <>
                    {' · '}
                    {t('Rangées en profondeur : {{n}}', { n: analyse.depthRows })}
                  </>
                )}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('Total proposé par l’IA')}>
              {formatQuantity(analyse.proposedTotal, unite)}
            </Descriptions.Item>
            <Descriptions.Item label={t('Confiance')}>
              {formatPercent(Math.round(analyse.confidence * 100), 0)}
            </Descriptions.Item>
            <Descriptions.Item label={t('Qualité de la photo')}>
              {visionQualityLabel(analyse.quality)}
            </Descriptions.Item>
          </>
        )}
      </Descriptions>

      {analyse?.explanation && (
        <blockquote
          style={{
            margin: '8px 0',
            paddingInlineStart: 12,
            borderInlineStart: '3px solid var(--border-default, #d9d9d9)',
            whiteSpace: 'pre-wrap'
          }}
        >
          {analyse.explanation}
        </blockquote>
      )}

      {(capture.vision?.provider || capture.vision?.model) && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('Fournisseur : {{provider}} · modèle : {{model}}', {
            provider: capture.vision?.provider ?? '—',
            model: capture.vision?.model ?? '—'
          })}
          {typeof capture.vision?.analysisMs === 'number' && (
            <> · {t('durée : {{seconds}} s', { seconds: (capture.vision.analysisMs / 1000).toFixed(1) })}</>
          )}
        </Typography.Text>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Ce que le chef a fait (ecrans §4.4)
// ---------------------------------------------------------------------------

const ChefSection: React.FC<{ tenantId: string; capture: CaptureView }> = ({ tenantId, capture }) => {
  const unite = capture.unit ?? null;
  const statut = capture.countStatus ? STOCK_COUNT_STATUS_DISPLAY[capture.countStatus] : null;

  return (
    <section aria-label={t('Ce que le chef a fait')}>
      <Typography.Title level={5}>{t('Ce que le chef a fait')}</Typography.Title>
      <Descriptions column={1} size="small">
        <Descriptions.Item label={t('Issue')}>
          <span data-testid="capture-outcome">{captureOutcomeLabel(capture.outcome)}</span>
        </Descriptions.Item>
        {capture.confirmedQuantity !== null && capture.confirmedQuantity !== undefined && (
          <Descriptions.Item label={t('Quantité retenue')}>
            {formatQuantity(capture.confirmedQuantity, unite)}
          </Descriptions.Item>
        )}
        {capture.mergeMode && (
          <Descriptions.Item label={t('Comptage existant')}>
            {capture.mergeMode === 'ADD'
              ? t('Ajoutée au comptage existant : ligne portée à {{quantity}}', {
                  quantity: formatQuantity(capture.lineQuantityAfter ?? null, unite)
                })
              : t('A remplacé le comptage existant')}
          </Descriptions.Item>
        )}
        {capture.confirmedAt && (
          <Descriptions.Item label={t('Confirmée')}>{formatDateTime(capture.confirmedAt)}</Descriptions.Item>
        )}
        {capture.countId && (
          <Descriptions.Item label={t('Inventaire')}>
            <Space wrap>
              {statut && <StatusTag status={capture.countStatus} tone={statut.tone} label={statut.label} />}
              <Link to={inventoryHref(tenantId, capture.countId)}>{t('Ouvrir l’inventaire')}</Link>
            </Space>
          </Descriptions.Item>
        )}
      </Descriptions>
    </section>
  );
};

const SessionConversation: React.FC<{ tenantId: string; sessionId: string; captureId: string }> = ({
  tenantId,
  sessionId,
  captureId
}) => {
  const query = useQuery({
    queryKey: detailKey('stock-whatsapp-session-messages', tenantId, sessionId),
    queryFn: () => listStockWhatsappSessionMessages(tenantId, sessionId),
    staleTime: 10_000
  });

  if (query.isPending) return <Spin />;
  if (query.error) {
    const { code } = apiErrorOf(query.error);
    return (
      <Alert
        type="warning"
        showIcon
        title={
          code === 'STOCK_WHATSAPP_CONVERSATION_FORBIDDEN'
            ? t('La conversation ne vous est pas ouverte.')
            : handleApiError(query.error)
        }
      />
    );
  }
  return (
    <section aria-label={t('Extrait de conversation')}>
      <Typography.Title level={5}>{t('Extrait de conversation')}</Typography.Title>
      <ConversationThread messages={query.data} highlightCaptureId={captureId} />
    </section>
  );
};

// ---------------------------------------------------------------------------
// Retrait de la photo (ecrans §4.5)
// ---------------------------------------------------------------------------

interface RemovePhotoModalProps {
  open: boolean;
  tenantId: string;
  captureId: string;
  onClose: () => void;
  /** `removed` : la capture relue ; `null` : la photo était déjà retirée (409). */
  onDone: (removed: CaptureView | null) => void;
}

const RemovePhotoModal: React.FC<RemovePhotoModalProps> = ({ open, tenantId, captureId, onClose, onDone }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ reason: string }>();

  const mutation = useMutation({
    mutationFn: (reason: string) => removeStockFieldCapturePhoto(tenantId, captureId, { reason }),
    onSuccess: removed => {
      form.resetFields();
      onDone(removed);
    },
    onError: error => {
      if (apiErrorOf(error).code === 'STOCK_WHATSAPP_PHOTO_ALREADY_REMOVED') {
        form.resetFields();
        onDone(null);
        return;
      }
      message.error(handleApiError(error));
    }
  });

  return (
    <Modal
      open={open}
      title={t('Retirer cette photo ?')}
      okText={t('Retirer la photo')}
      okButtonProps={{ danger: true, loading: mutation.isPending }}
      cancelText={t('Annuler')}
      onCancel={onClose}
      onOk={() => {
        void form
          .validateFields()
          .then(values => mutation.mutate(values.reason.trim()))
          .catch(() => undefined);
      }}
      destroyOnHidden
    >
      <Typography.Paragraph>
        {t(
          'Le fichier sera effacé. Le comptage et l’empreinte restent. Faites-le par exemple si la photo montre une personne.'
        )}
      </Typography.Paragraph>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="reason"
          label={t('Motif')}
          rules={[
            {
              validator: async (_rule, value: string | undefined) => {
                const longueur = (value ?? '').trim().length;
                if (longueur < 3 || longueur > 500) {
                  throw new Error(t('Le motif compte de 3 à 500 caractères.'));
                }
              }
            }
          ]}
        >
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default FieldCaptureDrawer;
