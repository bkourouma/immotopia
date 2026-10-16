import React, { useEffect, useState } from 'react';
import { App, Alert, Button, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { createSignatureRequest, fetchSignatureContext } from '../../services/signature-service';
import type { SignatureKind, SignatureRequestDto, SignerChannel, SignerInput } from '../../types/signature-types';
import { channelLabel, roleLabel, SIGNER_ROLES } from './signature-labels';
import { t } from '../../i18n/t';

const { Text } = Typography;

const CHANNELS: SignerChannel[] = ['EMAIL', 'WHATSAPP', 'SMS', 'IN_PERSON'];

interface SendForSignatureModalProps {
  open: boolean;
  kind: SignatureKind;
  targetId: string;
  /** Signataires préremplis à partir du document (locataire, co-locataires, bailleur…). */
  defaultSigners: SignerInput[];
  /** Faux quand le SMS n'est pas activé sur le serveur (`SignatureTargetContext.smsAvailable`). */
  smsAvailable?: boolean;
  onClose: () => void;
  onCreated: (request: SignatureRequestDto) => void;
}

function emptySigner(): SignerInput {
  return { role: 'LOCATAIRE', fullName: '', channel: 'EMAIL', contact: '' };
}

function isComplete(signer: SignerInput): boolean {
  if (!signer.fullName.trim()) return false;
  return signer.channel === 'IN_PERSON' || signer.contact.trim().length > 0;
}

/** Modale « Envoyer pour signature » : liste de signataires, canal et contact de chacun. */
export const SendForSignatureModal: React.FC<SendForSignatureModalProps> = ({
  open,
  kind,
  targetId,
  defaultSigners,
  smsAvailable: smsAvailableProp,
  onClose,
  onCreated
}) => {
  const { message } = App.useApp();
  const [signers, setSigners] = useState<SignerInput[]>([]);
  const [sequential, setSequential] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number>(14);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsFromContext, setSmsFromContext] = useState<boolean | undefined>(undefined);
  // La prop explicite prime ; sinon on lit le contexte de la cible.
  const smsAvailable = smsAvailableProp ?? smsFromContext;

  useEffect(() => {
    if (!open || smsAvailableProp !== undefined) return undefined;
    let active = true;
    (async () => {
      try {
        const context = await fetchSignatureContext(kind, targetId);
        if (active && typeof context?.smsAvailable === 'boolean') setSmsFromContext(context.smsAvailable);
      } catch {
        // Échec : SMS reste proposé, le serveur refusera clairement si besoin.
      }
    })();
    return () => {
      active = false;
    };
  }, [open, kind, targetId, smsAvailableProp]);

  useEffect(() => {
    if (open) {
      setSigners(defaultSigners.length > 0 ? defaultSigners.map(signer => ({ ...signer })) : [emptySigner()]);
      setError(null);
    }
    // Les préremplissages sont relus à chaque ouverture, pas à chaque rendu du parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (index: number, patch: Partial<SignerInput>) =>
    setSigners(prev => prev.map((signer, i) => (i === index ? { ...signer, ...patch } : signer)));

  const canSubmit = signers.length > 0 && signers.every(isComplete) && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const request = await createSignatureRequest({
        kind,
        targetId,
        // `contactId` (si connu) part avec le signataire : l'API l'exige pour WHATSAPP et SMS.
        signers: signers.map(({ phoneKnown: _phoneKnown, ...signer }) => ({
          ...signer,
          fullName: signer.fullName.trim(),
          contact: signer.channel === 'IN_PERSON' ? '' : signer.contact.trim()
        })),
        sequential,
        expiresInDays
      });
      message.success(t('Demande de signature envoyée'));
      onCreated(request);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || t("Impossible d'envoyer la demande de signature"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('Envoyer pour signature')}
      onCancel={onClose}
      width={720}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('Annuler')}
        </Button>,
        <Button key="send" type="primary" loading={submitting} disabled={!canSubmit} onClick={() => void submit()}>
          {t('Envoyer')}
        </Button>
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {signers.map((signer, index) => (
          <div
            key={index}
            data-testid="signer-row"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
          >
            <Select
              value={signer.role}
              onChange={role => update(index, { role })}
              aria-label={t('Rôle')}
              style={{ width: 140 }}
              options={SIGNER_ROLES.map(role => ({ value: role, label: roleLabel(role) }))}
            />
            <Input
              value={signer.fullName}
              onChange={event => update(index, { fullName: event.target.value })}
              placeholder={t('Nom complet')}
              aria-label={t('Nom complet')}
              style={{ flex: '1 1 160px', minWidth: 140 }}
            />
            <Select
              value={signer.channel}
              onChange={channel => update(index, { channel })}
              aria-label={t('Canal')}
              style={{ width: 120 }}
              options={CHANNELS.map(channel => {
                // WhatsApp et SMS ne sont offerts que pour un signataire lié à un contact CRM.
                const phoneChannel = channel === 'WHATSAPP' || channel === 'SMS';
                const noPhone = phoneChannel && Boolean(signer.contactId) && signer.phoneKnown === false;
                const smsOff = channel === 'SMS' && smsAvailable === false;
                const blocked = phoneChannel && (!signer.contactId || noPhone);
                const reason = smsOff
                  ? t("Le SMS n'est pas activé sur ce serveur.")
                  : noPhone
                    ? t('Numéro indisponible')
                    : t('Lier à un contact CRM');
                return {
                  value: channel,
                  disabled: blocked || smsOff,
                  label: blocked || smsOff ? `${channelLabel(channel)} — ${reason}` : channelLabel(channel)
                };
              })}
            />
            {signer.channel !== 'IN_PERSON' && (
              <Input
                value={signer.contact}
                onChange={event => update(index, { contact: event.target.value })}
                placeholder={
                  signer.channel === 'EMAIL'
                    ? t('Adresse e-mail')
                    : signer.phoneKnown === false
                      ? t('Numéro masqué')
                      : signer.channel === 'SMS'
                        ? t('Numéro de téléphone (SMS)')
                        : t('Numéro WhatsApp')
                }
                aria-label={t('Contact')}
                inputMode={signer.channel === 'EMAIL' ? 'email' : 'tel'}
                style={{ flex: '1 1 180px', minWidth: 150 }}
              />
            )}
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={t('Retirer ce signataire')}
              disabled={signers.length <= 1}
              onClick={() => setSigners(prev => prev.filter((_, i) => i !== index))}
            />
          </div>
        ))}

        <Button icon={<PlusOutlined />} onClick={() => setSigners(prev => [...prev, emptySigner()])}>
          {t('Ajouter un signataire')}
        </Button>

        <Space wrap size="large">
          <Space>
            <Switch checked={sequential} onChange={setSequential} aria-label={t('Signature dans l’ordre')} />
            <Text>{t('Signature dans l’ordre de la liste')}</Text>
          </Space>
          <Space>
            <Text>{t('Valable')}</Text>
            <InputNumber
              min={1}
              max={30}
              value={expiresInDays}
              onChange={value => setExpiresInDays(Number(value) || 14)}
              aria-label={t('Durée de validité en jours')}
            />
            <Text>{t('jours')}</Text>
          </Space>
        </Space>

        {error && <Alert type="error" showIcon message={error} />}
      </Space>
    </Modal>
  );
};
