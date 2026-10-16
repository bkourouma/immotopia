import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Modal, Popconfirm, Space, Spin, Typography } from 'antd';
import { createMandate, getProperty, getPropertyMandates, revokeMandate } from '../../services/property-service';
import dayjs from 'dayjs';
import { PropertyOwnershipType } from '../../types/property-types';
import { PropertyMandateForm } from './PropertyMandateForm';
import { t } from '../../i18n/t';
import { dateFormat } from '../../i18n/format';

const { Text } = Typography;

interface PropertyMandateCardProps {
  tenantId: string;
  propertyId: string;
}

interface Mandat {
  id: string;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  owner?: { fullName?: string | null; email?: string | null } | null;
}

/**
 * Mandat de gestion d'un bien d'un propriétaire client (`ownershipType` CLIENT,
 * spec 005) : consulter, créer et révoquer le mandat de l'agence.
 *
 * La carte ne s'affiche que pour un bien en mandat de gestion : un bien de
 * l'agence (TENANT) n'a pas de mandat, et la carte reste alors invisible. Le
 * mandat est créé avec le bien par l'assistant ; le formulaire ne sert qu'à en
 * poser un nouveau après une révocation.
 */
export const PropertyMandateCard: React.FC<PropertyMandateCardProps> = ({ tenantId, propertyId }) => {
  const { message } = App.useApp();

  const [applicable, setApplicable] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mandats, setMandats] = useState<Mandat[]>([]);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [revocation, setRevocation] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const bien = await getProperty(tenantId, propertyId);
      if (bien.ownershipType !== PropertyOwnershipType.CLIENT) {
        setApplicable(false);
        return;
      }
      setApplicable(true);
      setMandats(await getPropertyMandates(tenantId, propertyId));
    } catch (e: any) {
      setApplicable(false);
      setErreur(e?.response?.data?.error || e?.response?.data?.message || null);
    } finally {
      setChargement(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (chargement) {
    return null;
  }
  if (!applicable) {
    return erreur ? <Alert type="error" message={erreur} showIcon /> : null;
  }

  const mandatActif = mandats[0];

  const creer = async (data: { propertyId: string; startDate: string; endDate?: string; notes?: string }) => {
    await createMandate(tenantId, propertyId, {
      startDate: data.startDate,
      endDate: data.endDate,
      notes: data.notes
    });
    setModaleOuverte(false);
    message.success(t('Mandat de gestion créé.'));
    await charger();
  };

  const revoquer = async () => {
    if (!mandatActif) return;
    setRevocation(true);
    try {
      await revokeMandate(tenantId, propertyId, mandatActif.id);
      message.success(t('Mandat de gestion révoqué.'));
      await charger();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('Une erreur est survenue lors de la révocation du mandat'));
    } finally {
      setRevocation(false);
    }
  };

  return (
    <Card title={t('Mandat de gestion')}>
      {chargement ? (
        <Spin />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {mandatActif ? (
            <Space direction="vertical" size={2}>
              <Text>
                {t('Propriétaire')}
                {' : '}
                <Text strong>{mandatActif.owner?.fullName || mandatActif.owner?.email || '—'}</Text>
              </Text>
              <Text>
                {t('Date de début')}
                {' : '}
                {dayjs(mandatActif.startDate).format(dateFormat('short'))}
              </Text>
              {mandatActif.endDate && (
                <Text>
                  {t('Date de fin')}
                  {' : '}
                  {dayjs(mandatActif.endDate).format(dateFormat('short'))}
                </Text>
              )}
              {mandatActif.notes && <Text type="secondary">{mandatActif.notes}</Text>}
            </Space>
          ) : (
            <Text type="secondary">{t("Aucun mandat de gestion actif pour l'agence.")}</Text>
          )}

          {mandatActif ? (
            <Popconfirm
              title={t('Révoquer le mandat de gestion ?')}
              okText={t('Révoquer')}
              cancelText={t('Annuler')}
              okButtonProps={{ danger: true }}
              onConfirm={revoquer}
            >
              <Button danger loading={revocation}>
                {t('Révoquer le mandat')}
              </Button>
            </Popconfirm>
          ) : (
            <Button type="primary" onClick={() => setModaleOuverte(true)}>
              {t('Créer un mandat de gestion')}
            </Button>
          )}
        </Space>
      )}

      <Modal
        title={t('Créer un mandat de gestion')}
        open={modaleOuverte}
        onCancel={() => setModaleOuverte(false)}
        footer={null}
        destroyOnHidden
      >
        <PropertyMandateForm propertyId={propertyId} onSubmit={creer} onCancel={() => setModaleOuverte(false)} />
      </Modal>
    </Card>
  );
};

export default PropertyMandateCard;
