import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Empty, List, Modal, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import {
  cancelSignatureRequest,
  fetchSignatureFile,
  listSignatureRequests,
  reissueInPersonToken,
  remindSignatureRequest
} from '../../services/signature-service';
import type { SignatureKind, SignatureRequestDto, SignerDto, SignerInput } from '../../types/signature-types';
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
  fileLabel
}) => {
  const { message } = App.useApp();
  const [requests, setRequests] = useState<SignatureRequestDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [inPerson, setInPerson] = useState<{ signer: SignerDto; token: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await listSignatureRequests({ targetType, targetId }));
    } catch (err: any) {
      setError(err?.response?.data?.message || t('Erreur lors du chargement des signatures'));
    }
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

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
        <Text type="secondary">{t('Signature électronique du document, signataire par signataire.')}</Text>
        <Button type="primary" onClick={() => setSendOpen(true)} disabled={hasOpen}>
          {t('Envoyer pour signature')}
        </Button>
      </Space>

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
        onClose={() => setSendOpen(false)}
        onCreated={handleCreated}
      />

      <Modal
        open={inPerson !== null}
        title={inPerson ? t('Signature sur place : {{nom}}', { nom: inPerson.signer.fullName }) : ''}
        onCancel={() => setInPerson(null)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {inPerson && <PublicSigningFlow token={inPerson.token} onDone={() => void load()} />}
      </Modal>
    </Space>
  );
};
