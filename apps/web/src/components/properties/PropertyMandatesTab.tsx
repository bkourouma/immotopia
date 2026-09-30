import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Popconfirm, Select, Space, Spin, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { PropertyOwnershipType } from '../../types/property-types';
import type { PropertyMandate } from '../../types/property-types';
import { createMandate, getPropertyMandates, revokeMandate, updateProperty } from '../../services/property-service';
import { listContacts } from '../../services/crm-service';
import { contactDisplayName } from '../../utils/contact-display';
import { PropertyMandateForm } from './PropertyMandateForm';
import { apiErrorMessage } from '../patrimoine/patrimoine-labels';
import { feedback } from '../../lib/feedback';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text } = Typography;

type MandateRow = PropertyMandate & { owner?: { id: string; email: string; fullName?: string | null } | null };

interface Props {
  tenantId: string;
  propertyId: string;
  /** Nom du propriétaire du bien, repli quand le mandat ne porte pas de nom. */
  ownerName?: string;
  /** Bien de l'agence : propose de le confier à un propriétaire (il devient un bien de client). */
  ownershipType?: string;
  /** Rechargement de la fiche après changement de détention. */
  onOwnershipChanged?: () => void;
}

const formatDate = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString(activeLocale()) : '—';

/**
 * Onglet « Mandat de gestion » d'un bien de client : mandats actifs, création
 * (`PropertyMandateForm`) et résiliation. Monté seulement pour un bien CLIENT
 * et une agence qui n'est pas « détenue en propre » (l'API refuse sinon).
 */
export const PropertyMandatesTab: React.FC<Props> = ({
  tenantId,
  propertyId,
  ownerName,
  ownershipType,
  onOwnershipChanged
}) => {
  if (ownershipType === 'TENANT') {
    return <ConfierAUnProprietaire tenantId={tenantId} propertyId={propertyId} onDone={onOwnershipChanged} />;
  }
  return <MandatsDuBien tenantId={tenantId} propertyId={propertyId} ownerName={ownerName} />;
};

/** Bien de l'agence : le confier à un client propriétaire, avant d'y créer un mandat. */
const ConfierAUnProprietaire: React.FC<{ tenantId: string; propertyId: string; onDone?: () => void }> = ({
  tenantId,
  propertyId,
  onDone
}) => {
  const [contacts, setContacts] = useState<Array<{ email: string; label: string }>>([]);
  const [email, setEmail] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listContacts(tenantId, { limit: 1000 })
      .then(response => {
        if (!response.success) return;
        setContacts(
          response.contacts
            .filter(contact => contact.roles?.some(role => role.active))
            .map(contact => ({ email: contact.email, label: contactDisplayName(contact) }))
        );
      })
      .catch(() => undefined);
  }, [tenantId]);

  const confier = async () => {
    if (!email) return;
    setSaving(true);
    try {
      await updateProperty(tenantId, propertyId, { ownershipType: PropertyOwnershipType.CLIENT, ownerEmail: email });
      feedback.success(t('Bien confié au propriétaire : vous pouvez maintenant créer le mandat.'));
      onDone?.();
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Impossible de confier ce bien.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('Confier ce bien à un propriétaire')}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">
          {t(
            "Ce bien appartient à l'agence. Choisissez le client propriétaire pour en faire un bien de client et créer son mandat de gestion."
          )}
        </Text>
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          placeholder={t('Sélectionner un propriétaire')}
          value={email}
          onChange={setEmail}
          options={contacts.map(contact => ({ value: contact.email, label: contact.label }))}
        />
        <Button type="primary" disabled={!email} loading={saving} onClick={confier}>
          {t('Confier ce bien')}
        </Button>
      </Space>
    </Card>
  );
};

const MandatsDuBien: React.FC<Pick<Props, 'tenantId' | 'propertyId' | 'ownerName'>> = ({
  tenantId,
  propertyId,
  ownerName
}) => {
  const [mandates, setMandates] = useState<MandateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMandates((await getPropertyMandates(tenantId, propertyId)) as MandateRow[]);
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Impossible de charger les mandats.')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (mandateId: string) => {
    setRevokingId(mandateId);
    try {
      await revokeMandate(tenantId, propertyId, mandateId);
      feedback.success(t('Mandat résilié.'));
      await load();
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Résiliation impossible.')));
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) return <Spin />;

  const hasActive = mandates.some(mandate => mandate.isActive);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {creating && (
        <Card title={t('Nouveau mandat de gestion')}>
          <PropertyMandateForm
            propertyId={propertyId}
            onCancel={() => setCreating(false)}
            onSubmit={async data => {
              await createMandate(tenantId, propertyId, {
                startDate: data.startDate,
                endDate: data.endDate,
                notes: data.notes
              });
              setCreating(false);
              feedback.success(t('Mandat créé.'));
              await load();
            }}
          />
        </Card>
      )}
      <Card
        title={t('Mandat de gestion')}
        extra={
          !hasActive && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              {t('Créer un mandat')}
            </Button>
          )
        }
      >
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={mandates}
          pagination={false}
          locale={{ emptyText: t('Aucun mandat de gestion pour ce bien.') }}
          columns={[
            {
              title: t('Propriétaire'),
              key: 'owner',
              render: (_: unknown, record: MandateRow) =>
                record.owner?.fullName || ownerName || record.owner?.email || '—'
            },
            { title: t('Début'), dataIndex: 'startDate', render: formatDate },
            { title: t('Fin'), dataIndex: 'endDate', render: formatDate },
            { title: t('Notes'), dataIndex: 'notes', render: (value?: string) => value || '—' },
            {
              title: t('Actions'),
              key: 'actions',
              render: (_: unknown, record: MandateRow) =>
                record.isActive ? (
                  <Popconfirm title={t('Résilier ce mandat ?')} onConfirm={() => revoke(record.id)}>
                    <Button danger size="small" loading={revokingId === record.id}>
                      {t('Résilier')}
                    </Button>
                  </Popconfirm>
                ) : (
                  <Text type="secondary">{t('Résilié')}</Text>
                )
            }
          ]}
        />
      </Card>
    </Space>
  );
};
