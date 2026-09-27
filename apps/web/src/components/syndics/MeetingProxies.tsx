import React, { useMemo, useState } from 'react';
import { App, Alert, Button, Card, Form, Modal, Popconfirm, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { listContacts } from '../../services/crm-service';
import { createMeetingProxy, deleteMeetingProxy } from '../../services/syndic-service';
import { MeetingContact, MeetingLot, MeetingProxy } from '../../types/syndic-types';
import { contactName, lotOwnerId } from './meeting-governance';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface MeetingProxiesProps {
  tenantId: string;
  syndicId: string;
  meetingId: string;
  proxies: MeetingProxy[];
  lots: MeetingLot[];
  /** AG cloturee ou annulee : pouvoirs en lecture seule. */
  readOnly?: boolean;
  onChanged: () => Promise<void> | void;
}

interface ContactOption {
  value: string;
  label: string;
}

/**
 * Pouvoirs (mandats) d'une AG. Le mandant est un coproprietaire d'un lot de la
 * copropriete ; le mandataire, n'importe quel contact de l'agence autre que lui.
 * L'API revalide chaque regle.
 */
export const MeetingProxies: React.FC<MeetingProxiesProps> = ({
  tenantId,
  syndicId,
  meetingId,
  proxies,
  lots,
  readOnly = false,
  onChanged
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ grantorContactId: string; representativeContactId: string }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [grantorId, setGrantorId] = useState<string | undefined>();

  // Mandants possibles : les coproprietaires des lots, chacun une fois, avec ses lots.
  const grantorOptions = useMemo(() => {
    const byOwner = new Map<string, { contact?: MeetingContact | null; lotLabels: string[] }>();
    for (const lot of lots) {
      const ownerId = lotOwnerId(lot);
      if (!ownerId) continue;
      const entry = byOwner.get(ownerId) ?? { contact: lot.owner, lotLabels: [] };
      entry.lotLabels.push(formatLotLabel(lot));
      byOwner.set(ownerId, entry);
    }
    return Array.from(byOwner.entries()).map(([id, entry]) => ({
      value: id,
      label: `${entry.contact ? contactName(entry.contact) : id} (${entry.lotLabels.join(', ')})`
    }));
  }, [lots]);

  const lotsByOwner = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const lot of lots) {
      const ownerId = lotOwnerId(lot);
      if (!ownerId) continue;
      map.set(ownerId, [...(map.get(ownerId) ?? []), formatLotLabel(lot)]);
    }
    return map;
  }, [lots]);

  const representativeOptions = useMemo(() => {
    // Les coproprietaires sont aussi des mandataires possibles, meme si la liste CRM echoue.
    const merged = new Map<string, string>();
    for (const option of grantorOptions) merged.set(option.value, option.label);
    for (const option of contactOptions) if (!merged.has(option.value)) merged.set(option.value, option.label);
    return Array.from(merged.entries())
      .filter(([value]) => value !== grantorId)
      .map(([value, label]) => ({ value, label }));
  }, [contactOptions, grantorOptions, grantorId]);

  const openModal = async () => {
    form.resetFields();
    setGrantorId(undefined);
    setOpen(true);
    setContactsError(null);
    try {
      const result = await listContacts(tenantId, { page: 1, limit: 200 });
      setContactOptions(
        (result.contacts || []).map(contact => ({
          value: contact.id,
          label: contactName(contact)
        }))
      );
    } catch {
      setContactOptions([]);
      setContactsError(t('Liste des contacts CRM indisponible'));
    }
  };

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await createMeetingProxy(tenantId, syndicId, meetingId, values);
      message.success(t('Pouvoir enregistré'));
      setOpen(false);
      await onChanged();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Enregistrement du pouvoir impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (proxyId: string) => {
    setRemovingId(proxyId);
    try {
      await deleteMeetingProxy(tenantId, syndicId, meetingId, proxyId);
      message.success(t('Pouvoir retiré'));
      await onChanged();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Retrait du pouvoir impossible'));
    } finally {
      setRemovingId(null);
    }
  };

  const columns: ColumnsType<MeetingProxy> = [
    {
      title: t('Mandant'),
      key: 'grantor',
      render: (_: unknown, proxy) => contactName(proxy.grantor)
    },
    {
      title: t('Lots'),
      key: 'lots',
      render: (_: unknown, proxy) => (lotsByOwner.get(proxy.grantorContactId) ?? []).join(', ') || '-'
    },
    {
      title: t('Mandataire'),
      key: 'representative',
      render: (_: unknown, proxy) => contactName(proxy.representative)
    },
    ...(readOnly
      ? []
      : [
          {
            title: t('Actions'),
            key: 'actions',
            align: 'end' as const,
            render: (_: unknown, proxy: MeetingProxy) => (
              <Popconfirm
                title={t('Retirer ce pouvoir ?')}
                okText={t('Oui')}
                cancelText={t('Non')}
                onConfirm={() => handleRemove(proxy.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} loading={removingId === proxy.id}>
                  {t('Retirer')}
                </Button>
              </Popconfirm>
            )
          }
        ])
  ];

  return (
    <Card
      title={t('Pouvoirs')}
      extra={
        readOnly ? null : (
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => void openModal()}
            disabled={grantorOptions.length === 0}
          >
            {t('Ajouter un pouvoir')}
          </Button>
        )
      }
    >
      {grantorOptions.length === 0 && !readOnly ? (
        <Text type="secondary">{t("Aucun lot n'a de copropriétaire : aucun pouvoir possible.")}</Text>
      ) : null}
      <Table
        scroll={{ x: 'max-content' }}
        rowKey="id"
        size="small"
        dataSource={proxies}
        columns={columns}
        pagination={false}
        locale={{ emptyText: t('Aucun pouvoir enregistré') }}
      />

      <Modal
        title={t('Ajouter un pouvoir')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void handleCreate()}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        {contactsError ? (
          <Alert type="warning" showIcon message={contactsError} style={{ marginBlockEnd: 12 }} />
        ) : null}
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('Mandant (copropriétaire représenté)')}
            name="grantorContactId"
            rules={[{ required: true, message: t('Le mandant est obligatoire') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={grantorOptions}
              onChange={(value: string) => {
                setGrantorId(value);
                if (form.getFieldValue('representativeContactId') === value) {
                  form.setFieldValue('representativeContactId', undefined);
                }
              }}
            />
          </Form.Item>
          <Form.Item
            label={t('Mandataire')}
            name="representativeContactId"
            rules={[{ required: true, message: t('Le mandataire est obligatoire') }]}
          >
            <Select showSearch optionFilterProp="label" options={representativeOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
