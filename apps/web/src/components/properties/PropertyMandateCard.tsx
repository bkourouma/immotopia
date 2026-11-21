import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Modal, Space, Typography } from 'antd';
import { createMandate, getProperty, getPropertyMandates, revokeMandate } from '../../services/property-service';
import dayjs from 'dayjs';
import { PropertyOwnershipType } from '../../types/property-types';
import { PropertyMandateForm } from './PropertyMandateForm';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';
import { ConfirmAction, StateBlock } from '../primitives';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { apiErrorText } from './property-api-errors';
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
  const { isMobile } = useBreakpoint();

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
      setErreur(apiErrorText(e, t('Impossible de charger le mandat de gestion.')));
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
    return erreur ? (
      <StateBlock
        variant="error"
        title={t('Mandat de gestion indisponible')}
        description={erreur}
        onRetry={() => void charger()}
      />
    ) : null;
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
      message.error(apiErrorText(e, t('Une erreur est survenue lors de la révocation du mandat')));
    } finally {
      setRevocation(false);
    }
  };

  return (
    <Card title={<HelpSectionTitle title={t('Mandat de gestion')} helpId="commercial.biens.detail.mandats" />}>
      {
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
            <ConfirmAction
              title={t('Révoquer le mandat de {{nom}} ?', {
                nom: mandatActif.owner?.fullName || mandatActif.owner?.email || t('ce propriétaire')
              })}
              description={t("L'agence ne gérera plus ce bien. Vous pourrez créer un nouveau mandat ensuite.")}
              okText={t('Révoquer')}
              danger
              onConfirm={revoquer}
            >
              <Button danger loading={revocation} disabled={revocation}>
                {t('Révoquer le mandat')}
              </Button>
            </ConfirmAction>
          ) : (
            <Button type="primary" onClick={() => setModaleOuverte(true)}>
              {t('Créer un mandat de gestion')}
            </Button>
          )}
        </Space>
      }

      <Modal
        title={t('Créer un mandat de gestion')}
        open={modaleOuverte}
        onCancel={() => setModaleOuverte(false)}
        footer={null}
        destroyOnHidden
        width={isMobile ? '100%' : 520}
        style={isMobile ? { top: 0, maxWidth: '100vw', margin: 0 } : undefined}
      >
        <PropertyMandateForm propertyId={propertyId} onSubmit={creer} onCancel={() => setModaleOuverte(false)} />
      </Modal>
    </Card>
  );
};

export default PropertyMandateCard;
