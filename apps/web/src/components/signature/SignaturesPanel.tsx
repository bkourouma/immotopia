import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Empty, List, Modal, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import {
  cancelSignatureRequest,
  fetchSignatureFile,
  listSignatureRequests,
  reissueInPersonToken,
  remindSignatureRequest
} from '../../services/signature-service';
import type {
  SignatureKind,
  SignatureRequestDto,
  SignerChannel,
  SignerDto,
  SignerInput
} from '../../types/signature-types';
import { SendForSignatureModal } from './SendForSignatureModal';
import { PublicSigningFlow } from './PublicSigningFlow';
import { channelLabel, isOpenRequest, requestStatusLabel, roleLabel, signerStatusLabel } from './signature-labels';
import { activeLocale } from '../../i18n/format';
import { describeDownloadError } from '../../utils/download-error';
import { saveBlob } from '../../utils/save-blob';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface SignaturesPanelProps {
  kind: SignatureKind;
  /** Type de cible côté API (filtre de liste), ex. `RentalLease`. */
  targetType: string;
  targetId: string;
  defaultSigners: SignerInput[];
  /** Nom de base des PDF téléchargés. */
  fileLabel: string;
  /** SG-R1 : le type de document exige un prestataire qualifié ; l'envoi est alors désactivé. */
  providerRequired?: boolean;
  /** S6 : le fournisseur actif est un prestataire externe (invitations par e-mail du prestataire, ni code ni signature sur place). */
  externalProvider?: boolean;
  /** Le statut de la cible interdit un nouvel envoi (ex. compromis déjà signé) ; l'historique reste visible. */
  sendDisabled?: boolean;
  /** Canaux admis à l'envoi (ex. jamais « sur place » pour un mandat de prélèvement). */
  allowedChannels?: SignerChannel[];
  /** Libellé du bouton d'envoi (« Envoyer pour signature » par défaut). */
  sendLabel?: string;
  /** Relit les demandes à cet intervalle (ms) tant qu'une demande est ouverte, pour voir une signature faite entre-temps. */
  pollMs?: number;
  /** Appelé quand l'état des demandes a changé (envoi, annulation, signature, scellement) : le parent peut se rafraîchir. */
  onChanged?: () => void;
  /** Appelé à chaque chargement avec « une demande est ouverte ». */
  onOpenChange?: (hasOpen: boolean) => void;
}

function dateLabel(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(activeLocale());
}

/**
 * Panneau « Signatures » d'un document : demandes, statut par signataire,
 * relance, annulation, PDF source ou scellé, signature sur place.
 */
export const SignaturesPanel: React.FC<SignaturesPanelProps> = ({
  kind,
  targetType,
  targetId,
  defaultSigners,
  fileLabel,
  providerRequired = false,
  externalProvider = false,
  sendDisabled = false,
  allowedChannels,
  sendLabel,
  pollMs,
  onChanged,
  onOpenChange
}) => {
  const { message } = App.useApp();
  const [requests, setRequests] = useState<SignatureRequestDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [inPerson, setInPerson] = useState<{ signer: SignerDto; token: string } | null>(null);

  // Empreinte des états connus : une évolution (scellement par un tiers, annulation) prévient le parent.
  const fingerprint = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await listSignatureRequests({ targetType, targetId });
      setRequests(list);
      const print = list.map(request => `${request.id}:${request.status}`).join('|');
      const changed = fingerprint.current !== null && fingerprint.current !== print;
      fingerprint.current = print;
      onOpenChange?.(list.some(request => isOpenRequest(request.status)));
      if (changed) onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.message || t('Erreur lors du chargement des signatures'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Ouvre le flux sur place ; le jeton est réémis car la liste ne le renvoie jamais. */
  const openInPerson = async (request: SignatureRequestDto, signer: SignerDto) => {
    try {
      const { inPersonUrlToken } = await reissueInPersonToken(request.id, signer.id);
      setInPerson({ signer, token: inPersonUrlToken });
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("Impossible d'ouvrir la signature sur place"));
    }
  };

  /** Après la création : la réponse porte les jetons sur place, on ouvre le premier signataire concerné. */
  const handleCreated = (request: SignatureRequestDto) => {
    const first = [...request.signers]
      .sort((a, b) => a.position - b.position)
      .find(signer => signer.channel === 'IN_PERSON' && signer.inPersonUrlToken && signer.status !== 'SIGNED');
    if (first?.inPersonUrlToken) setInPerson({ signer: first, token: first.inPersonUrlToken });
    void load();
  };

  const remind = async (request: SignatureRequestDto) => {
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

  const cancel = async (request: SignatureRequestDto) => {
    try {
      await cancelSignatureRequest(request.id);
      message.success(t('Demande annulée'));
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("Impossible d'annuler la demande"));
    }
  };

  const download = async (request: SignatureRequestDto, variant: 'source' | 'signed') => {
    try {
      const blob = await fetchSignatureFile(request.id, variant);
      saveBlob(blob, `${fileLabel}-${variant === 'signed' ? 'signe' : 'source'}.pdf`);
    } catch (err) {
      message.error(await describeDownloadError(err));
    }
  };

  const hasOpen = (requests ?? []).some(request => isOpenRequest(request.status));

  useEffect(() => {
    if (!pollMs || !hasOpen) return undefined;
    const timer = window.setInterval(() => void load(), pollMs);
    return () => window.clearInterval(timer);
  }, [pollMs, hasOpen, load]);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
        <Text type="secondary">{t('Signature électronique du document, signataire par signataire.')}</Text>
        <Button type="primary" onClick={() => setSendOpen(true)} disabled={hasOpen || providerRequired || sendDisabled}>
          {sendLabel ?? t('Envoyer pour signature')}
        </Button>
      </Space>

      {providerRequired && (
        <Alert
          type="warning"
          showIcon
          message={t('Signature électronique indisponible pour ce document : un prestataire qualifié est requis')}
        />
      )}
      {externalProvider && !providerRequired && (
        <Alert
          type="info"
          showIcon
          data-testid="signature-external-provider"
          message={t(
            'Signature en ligne via le prestataire : les signataires reçoivent l’invitation par e-mail du prestataire.'
          )}
        />
      )}
      {error && <Alert type="error" showIcon message={error} />}
      {!requests && !error && <Spin />}
      {requests && requests.length === 0 && (
        <Empty description={t("Ce document n'a pas encore été envoyé pour signature")} />
      )}

      {(requests ?? []).map(request => {
        const status = requestStatusLabel(request.status);
        const open = isOpenRequest(request.status);
        return (
          <Card
            key={request.id}
            size="small"
            data-testid="signature-request"
            title={
              <Space wrap>
                <Tag color={status.color}>{status.label}</Tag>
                <Text type="secondary">
                  {t('Envoyée le {{date}}', { date: dateLabel(request.createdAt) })}
                  {open ? ` · ${t('expire le {{date}}', { date: dateLabel(request.expiresAt) })}` : ''}
                </Text>
              </Space>
            }
            extra={
              <Space wrap>
                <Button size="small" onClick={() => void download(request, 'source')}>
                  {t('PDF source')}
                </Button>
                {request.status === 'COMPLETED' && (
                  <Button size="small" type="primary" onClick={() => void download(request, 'signed')}>
                    {t('PDF signé')}
                  </Button>
                )}
                {open && (
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
                        {t('Annuler la demande')}
                      </Button>
                    </Popconfirm>
                  </>
                )}
              </Space>
            }
          >
            <List
              size="small"
              dataSource={[...request.signers].sort((a, b) => a.position - b.position)}
              renderItem={signer => {
                const signerStatus = signerStatusLabel(signer.status);
                return (
                  <List.Item
                    actions={
                      open &&
                      signer.channel === 'IN_PERSON' &&
                      signer.status !== 'SIGNED' &&
                      signer.status !== 'DECLINED'
                        ? [
                            <Button key="in-person" size="small" onClick={() => void openInPerson(request, signer)}>
                              {t('Signer sur place')}
                            </Button>
                          ]
                        : []
                    }
                  >
                    <Space wrap>
                      <Text strong>{signer.fullName}</Text>
                      <Text type="secondary">
                        {roleLabel(signer.role)} · {channelLabel(signer.channel)}
                        {signer.contactMasked ? ` · ${signer.contactMasked}` : ''}
                      </Text>
                      <Tag color={signerStatus.color}>{signerStatus.label}</Tag>
                      {signer.signedAt && <Text type="secondary">{dateLabel(signer.signedAt)}</Text>}
                    </Space>
                  </List.Item>
                );
              }}
            />
          </Card>
        );
      })}

      <SendForSignatureModal
        open={sendOpen}
        kind={kind}
        targetId={targetId}
        defaultSigners={defaultSigners}
        allowedChannels={allowedChannels}
        onClose={() => setSendOpen(false)}
        onCreated={handleCreated}
      />

      <Modal
        open={inPerson !== null}
        title={inPerson ? t('Signature sur place : {{nom}}', { nom: inPerson.signer.fullName }) : ''}
        onCancel={() => setInPerson(null)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        {inPerson && <PublicSigningFlow token={inPerson.token} onDone={() => void load()} />}
      </Modal>
    </Space>
  );
};
