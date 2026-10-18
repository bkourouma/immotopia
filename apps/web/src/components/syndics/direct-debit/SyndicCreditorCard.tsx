import { useSyndicDirectDebitRights } from './useSyndicDirectDebitRights';
import React, { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Space, Spin, Tag } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import type { CreditorDto } from '../../../services/direct-debit-service';
import { saveSyndicCreditor, SyndicCreditorInput } from '../../../services/syndic-direct-debit-service';
import { apiErrorMessage } from '../../rental/direct-debit/direct-debit-shared';
import { SYNDIC_DD_KEYS } from './keys';
import { t } from '../../../i18n/t';

interface CreditorFormValues {
  label: string;
  bankName?: string;
  bankAccountRef?: string;
  creditorIdentifier?: string;
  collectionDay: number;
  prenotificationBusinessDays: number;
  maxConsecutiveRejects: number;
}

const DEFAULTS = { collectionDay: 5, prenotificationBusinessDays: 5, maxConsecutiveRejects: 2 };

interface SyndicCreditorCardProps {
  tenantId: string;
  syndicId: string;
  creditor: CreditorDto | null | undefined;
  loading: boolean;
  /** Message d'erreur de chargement. */
  error?: string | null;
}

/** Valeurs actuelles du créancier, au format du `PUT` (qui remplace). */
function toInput(creditor: CreditorDto): SyndicCreditorInput {
  return {
    label: creditor.label,
    ...(creditor.bankName ? { bankName: creditor.bankName } : {}),
    ...(creditor.bankAccountRef ? { bankAccountRef: creditor.bankAccountRef } : {}),
    ...(creditor.creditorIdentifier ? { creditorIdentifier: creditor.creditorIdentifier } : {}),
    collectionDay: creditor.collectionDay,
    prenotificationBusinessDays: creditor.prenotificationBusinessDays,
    maxConsecutiveRejects: creditor.maxConsecutiveRejects,
    isActive: creditor.isActive
  };
}

/**
 * Carte « Compte de prélèvement du syndicat » (spec 042, P4, §9.6) : le
 * créancier est le compte bancaire du syndicat, un seul par syndicat. Pas de
 * frais de rejet en copropriété.
 */
export const SyndicCreditorCard: React.FC<SyndicCreditorCardProps> = ({
  tenantId,
  syndicId,
  creditor,
  loading,
  error
}) => {
  const { message } = App.useApp();
  const { canManage } = useSyndicDirectDebitRights(tenantId);
  const queryClient = useQueryClient();
  const [form] = Form.useForm<CreditorFormValues>();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: SYNDIC_DD_KEYS.creditorPrefix(tenantId) });

  const openModal = () => {
    form.resetFields();
    form.setFieldsValue(
      creditor
        ? {
            label: creditor.label,
            bankName: creditor.bankName ?? '',
            bankAccountRef: creditor.bankAccountRef ?? '',
            creditorIdentifier: creditor.creditorIdentifier ?? '',
            collectionDay: creditor.collectionDay,
            prenotificationBusinessDays: creditor.prenotificationBusinessDays,
            maxConsecutiveRejects: creditor.maxConsecutiveRejects
          }
        : DEFAULTS
    );
    setOpen(true);
  };

  const handleSubmit = async () => {
    let values: CreditorFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const clean = (value?: string) => (value?.trim() ? value.trim() : undefined);
    const input: SyndicCreditorInput = {
      label: values.label.trim(),
      ...(clean(values.bankName) ? { bankName: clean(values.bankName) } : {}),
      ...(clean(values.bankAccountRef) ? { bankAccountRef: clean(values.bankAccountRef) } : {}),
      ...(clean(values.creditorIdentifier) ? { creditorIdentifier: clean(values.creditorIdentifier) } : {}),
      collectionDay: values.collectionDay,
      prenotificationBusinessDays: values.prenotificationBusinessDays,
      maxConsecutiveRejects: values.maxConsecutiveRejects,
      isActive: creditor ? creditor.isActive : true
    };
    setSaving(true);
    try {
      await saveSyndicCreditor(tenantId, syndicId, input);
      message.success(creditor ? t('Compte de prélèvement mis à jour') : t('Compte de prélèvement créé'));
      setOpen(false);
      await refresh();
    } catch (err) {
      message.error(apiErrorMessage(err, t("Erreur lors de l'enregistrement du compte de prélèvement")));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!creditor) return;
    setSaving(true);
    try {
      await saveSyndicCreditor(tenantId, syndicId, { ...toInput(creditor), isActive: !creditor.isActive });
      message.success(creditor.isActive ? t('Compte de prélèvement désactivé') : t('Compte de prélèvement activé'));
      await refresh();
    } catch (err) {
      message.error(apiErrorMessage(err, t('Erreur lors de la mise à jour du compte de prélèvement')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={t('Compte de prélèvement du syndicat')}
      extra={
        canManage ? (
          <Space wrap>
            {creditor && (
              <Button onClick={() => void handleToggle()} disabled={saving}>
                {creditor.isActive ? t('Désactiver') : t('Activer')}
              </Button>
            )}
            <Button type="primary" onClick={openModal} disabled={saving || loading}>
              {creditor ? t('Modifier') : t('Configurer le compte')}
            </Button>
          </Space>
        ) : null
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message={t(
            "Les prélèvements des charges sont encaissés sur le compte bancaire du syndicat, pas sur celui de l'agence. Le numéro d'émetteur est attribué par la banque une fois la convention signée."
          )}
        />
        {error && <Alert type="error" showIcon message={error} />}
        {loading ? (
          <Spin />
        ) : creditor ? (
          <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
            <Descriptions.Item label={t('Libellé')}>{creditor.label}</Descriptions.Item>
            <Descriptions.Item label={t('Statut')}>
              <Tag color={creditor.isActive ? 'success' : 'default'}>
                {creditor.isActive ? t('Actif') : t('Inactif')}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('Banque')}>{creditor.bankName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label={t('Compte du syndicat')}>
              {creditor.bankAccountRef ? <bdi dir="ltr">{creditor.bankAccountRef}</bdi> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t("Numéro d'émetteur")}>
              {creditor.creditorIdentifier ? (
                <bdi dir="ltr">{creditor.creditorIdentifier}</bdi>
              ) : (
                <Tag color="warning">{t('Convention non signée')}</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('Jour de collecte')}>{creditor.collectionDay}</Descriptions.Item>
            <Descriptions.Item label={t('Prénotification (jours ouvrés)')}>
              {creditor.prenotificationBusinessDays}
            </Descriptions.Item>
            <Descriptions.Item label={t('Seuil de suspension')}>{creditor.maxConsecutiveRejects}</Descriptions.Item>
            <Descriptions.Item label={t('Mandats ouverts')}>{creditor.openMandateCount}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Alert
            type="warning"
            showIcon
            message={t(
              'Aucun compte de prélèvement configuré pour ce syndicat : configurez-le avant de créer des mandats.'
            )}
          />
        )}
      </Space>

      <Modal
        open={open}
        title={creditor ? t('Modifier le compte de prélèvement') : t('Configurer le compte de prélèvement')}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        okButtonProps={{ loading: saving }}
        onOk={() => void handleSubmit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        forceRender
      >
        <Form form={form} name="syndicCreditor" layout="vertical" autoComplete="off">
          <Form.Item
            name="label"
            label={t('Libellé')}
            rules={[
              { required: true, whitespace: true, message: t('Le libellé est obligatoire') },
              { max: 120, message: t('120 caractères au plus') }
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="bankName" label={t('Banque')} rules={[{ max: 120, message: t('120 caractères au plus') }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="bankAccountRef"
            label={t('Compte du syndicat')}
            rules={[{ max: 64, message: t('64 caractères au plus') }]}
          >
            <Input dir="ltr" style={{ textAlign: 'start' }} />
          </Form.Item>
          <Form.Item
            name="creditorIdentifier"
            label={t("Numéro d'émetteur")}
            rules={[{ max: 32, message: t('32 caractères au plus') }]}
            extra={t("Laissez vide tant que la convention n'est pas signée.")}
          >
            <Input dir="ltr" style={{ textAlign: 'start' }} />
          </Form.Item>
          <Form.Item name="collectionDay" label={t('Jour de collecte (1 à 28)')} rules={[{ required: true }]}>
            <InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="prenotificationBusinessDays"
            label={t('Prénotification (jours ouvrés avant le prélèvement)')}
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={30} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="maxConsecutiveRejects"
            label={t('Seuil de suspension (rejets consécutifs)')}
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={10} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
