import React from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Form, Input, Modal, Select, Spin } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryKey, STALE_TIME } from '../../../../lib/query-keys';
import {
  createStockWhatsappRegistration,
  listStockWhatsappEligibleMembers,
  listStockWhatsappEligibleSites
} from '../../../../services/finance-stock-whatsapp-service';
import type { RegistrationWithCode, SiteRef } from '../../../../types/finance-stock-whatsapp-types';
import { handleApiError } from '../../../../utils/error-handler';
import { t } from '../../../../i18n/t';
import { apiErrorOf } from './whatsapp-labels';

export const STOCK_WHATSAPP_ELIGIBLE_MEMBERS_ENTITY = 'stock-whatsapp-eligible-members';
export const STOCK_WHATSAPP_ELIGIBLE_SITES_ENTITY = 'stock-whatsapp-eligible-sites';

/** Nombre de chantiers affectables à une inscription (spec W3). */
export const MAX_REGISTRATION_SITES = 10;

interface RegistrationFormValues {
  userId?: string;
  phone?: string;
  siteIds?: string[];
}

export interface RegistrationFormProps {
  tenantId: string;
  open: boolean;
  onClose: () => void;
  /** `201` : l'inscription et son code, affiché une fois par le parent. */
  onCreated: (registration: RegistrationWithCode) => void;
}

/** Règle commune « 1 à 10 chantiers », réutilisée par la modification des chantiers. */
export function siteIdsRules() {
  return [
    {
      validator: async (_rule: unknown, value: string[] | undefined) => {
        const n = value?.length ?? 0;
        if (n < 1) throw new Error(t('Choisissez au moins un chantier.'));
        if (n > MAX_REGISTRATION_SITES) throw new Error(t('Dix chantiers au plus.'));
      }
    }
  ];
}

/** Options des chantiers : seuls les éligibles sont choisissables. */
export function siteOptions(sites: SiteRef[]) {
  return sites.map(site => ({ value: site.siteId, label: site.name, disabled: !site.eligible }));
}

/** Noms des chantiers refusés par le serveur (`data.siteIds`), pour le message sur le champ. */
export function refusedSiteNames(data: Record<string, unknown> | null, sites: SiteRef[]): string {
  const ids = Array.isArray(data?.siteIds) ? (data?.siteIds as unknown[]).filter(id => typeof id === 'string') : [];
  return ids.map(id => sites.find(site => site.siteId === id)?.name ?? String(id)).join(', ');
}

/**
 * Fenêtre « Inscrire un chef de chantier » (ecrans §5.2). Le corps envoyé ne
 * porte que `userId`, `phone` et `siteIds` ; chaque erreur du serveur se pose
 * sur le champ qu'elle concerne.
 */
export const RegistrationForm: React.FC<RegistrationFormProps> = ({ tenantId, open, onClose, onCreated }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<RegistrationFormValues>();

  const membres = useQuery({
    queryKey: queryKey(STOCK_WHATSAPP_ELIGIBLE_MEMBERS_ENTITY, tenantId),
    queryFn: () => listStockWhatsappEligibleMembers(tenantId),
    enabled: open,
    staleTime: 0
  });
  const chantiers = useQuery({
    queryKey: queryKey(STOCK_WHATSAPP_ELIGIBLE_SITES_ENTITY, tenantId),
    queryFn: () => listStockWhatsappEligibleSites(tenantId),
    enabled: open,
    staleTime: STALE_TIME.list
  });

  const mutation = useMutation({
    mutationFn: (values: Required<RegistrationFormValues>) =>
      createStockWhatsappRegistration(tenantId, {
        userId: values.userId,
        phone: values.phone,
        siteIds: values.siteIds
      }),
    onSuccess: created => {
      form.resetFields();
      onCreated(created);
    },
    onError: error => {
      const { code, message: serveur, data } = apiErrorOf(error);
      const texte = serveur ?? handleApiError(error);
      switch (code) {
        case 'STOCK_WHATSAPP_PHONE_INVALID':
        case 'STOCK_WHATSAPP_PHONE_UNAVAILABLE':
          form.setFields([{ name: 'phone', errors: [texte] }]);
          return;
        case 'STOCK_WHATSAPP_SITE_NOT_ELIGIBLE': {
          const noms = refusedSiteNames(data, chantiers.data ?? []);
          form.setFields([
            {
              name: 'siteIds',
              errors: [noms ? t('Chantiers non éligibles : {{names}}', { names: noms }) : texte]
            }
          ]);
          void chantiers.refetch();
          return;
        }
        case 'STOCK_WHATSAPP_SITES_REQUIRED':
          form.setFields([{ name: 'siteIds', errors: [texte] }]);
          return;
        case 'STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE':
        case 'STOCK_WHATSAPP_MEMBER_ALREADY_REGISTERED':
          form.setFields([{ name: 'userId', errors: [texte] }]);
          void membres.refetch();
          return;
        default:
          message.error(texte);
      }
    }
  });

  const listeMembres = membres.data ?? [];
  const aucunChef = membres.isSuccess && listeMembres.length === 0;

  return (
    <Modal
      open={open}
      title={t('Inscrire un chef de chantier')}
      okText={t('Inscrire')}
      cancelText={t('Annuler')}
      okButtonProps={{ loading: mutation.isPending, disabled: aucunChef }}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={() => {
        void form
          .validateFields()
          .then(values => mutation.mutate(values as Required<RegistrationFormValues>))
          .catch(() => undefined);
      }}
      destroyOnHidden
    >
      {membres.isPending || chantiers.isPending ? (
        <Spin />
      ) : (
        <Form form={form} layout="vertical" preserve={false} name="stock-whatsapp-registration">
          <Form.Item
            name="userId"
            label={t('Chef de chantier')}
            rules={[{ required: true, message: t('Choisissez le chef de chantier.') }]}
            extra={
              aucunChef ? (
                <span>
                  {t('Aucun membre n’a le rôle Chef de chantier. Attribuez-le dans Paramètres › Collaborateurs.')}{' '}
                  <Link to={`/tenant/${tenantId}/collaborators`}>{t('Ouvrir les collaborateurs')}</Link>
                </span>
              ) : undefined
            }
          >
            <Select
              showSearch
              optionFilterProp="label"
              disabled={aucunChef}
              options={listeMembres.map(membre => ({
                value: membre.userId,
                label: membre.registered ? t('{{name}} (déjà inscrit)', { name: membre.label }) : membre.label,
                disabled: membre.registered
              }))}
            />
          </Form.Item>

          <Form.Item
            name="phone"
            label={t('Numéro WhatsApp')}
            extra={t('Format ivoirien accepté (07 12 34 56 78) ou international (+225…).')}
            rules={[{ required: true, whitespace: true, message: t('Saisissez le numéro WhatsApp.') }]}
          >
            <Input inputMode="tel" autoComplete="tel" maxLength={40} />
          </Form.Item>

          <Form.Item
            name="siteIds"
            label={t('Chantiers')}
            extra={t('Seuls les chantiers ouverts et basculés au stock sont proposés.')}
            rules={siteIdsRules()}
          >
            <Select mode="multiple" optionFilterProp="label" options={siteOptions(chantiers.data ?? [])} />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            title={t(
              'Le chef de chantier enverra un code au numéro WhatsApp d’ImmoTopia. Ce message prouve qu’il utilise bien ce numéro et vaut son accord pour recevoir les réponses du bot.'
            )}
          />
        </Form>
      )}
    </Modal>
  );
};

export default RegistrationForm;
