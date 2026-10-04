import React, { useEffect, useState } from 'react';
import { Alert, App, Collapse, Drawer, Form, Input, Modal, Select, Space, Spin, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { detailKey, queryKey, STALE_TIME } from '../../../../lib/query-keys';
import { useBreakpoint } from '../../../../hooks/useBreakpoint';
import {
  listStockWhatsappEligibleSites,
  listStockWhatsappSessionMessages,
  listStockWhatsappSessions,
  revokeStockWhatsappRegistration,
  updateStockWhatsappRegistrationSites
} from '../../../../services/finance-stock-whatsapp-service';
import type { RegistrationView, SessionView } from '../../../../types/finance-stock-whatsapp-types';
import { handleApiError } from '../../../../utils/error-handler';
import { t } from '../../../../i18n/t';
import { ConversationThread } from './ConversationThread';
import { STOCK_WHATSAPP_ELIGIBLE_SITES_ENTITY, refusedSiteNames, siteIdsRules, siteOptions } from './RegistrationForm';
import { apiErrorOf, formatDateTime, sessionCloseReasonLabel, sessionStateLabel } from './whatsapp-labels';

// ---------------------------------------------------------------------------
// Modifier les chantiers
// ---------------------------------------------------------------------------

export interface RegistrationSitesModalProps {
  tenantId: string;
  registration: RegistrationView | null;
  onClose: () => void;
  onSaved: (registration: RegistrationView) => void;
}

/** « Modifier les chantiers » (ecrans §5.2) : 1 à 10 chantiers éligibles, remplace la liste. */
export const RegistrationSitesModal: React.FC<RegistrationSitesModalProps> = ({
  tenantId,
  registration,
  onClose,
  onSaved
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ siteIds: string[] }>();
  const open = Boolean(registration);

  const chantiers = useQuery({
    queryKey: queryKey(STOCK_WHATSAPP_ELIGIBLE_SITES_ENTITY, tenantId),
    queryFn: () => listStockWhatsappEligibleSites(tenantId),
    enabled: open,
    staleTime: STALE_TIME.list
  });

  useEffect(() => {
    if (registration) form.setFieldsValue({ siteIds: registration.sites.map(site => site.siteId) });
  }, [registration, form]);

  const mutation = useMutation({
    mutationFn: (siteIds: string[]) =>
      updateStockWhatsappRegistrationSites(tenantId, (registration as RegistrationView).id, { siteIds }),
    onSuccess: saved => onSaved(saved),
    onError: error => {
      const { code, message: serveur, data } = apiErrorOf(error);
      const texte = serveur ?? handleApiError(error);
      if (code === 'STOCK_WHATSAPP_SITE_NOT_ELIGIBLE' || code === 'STOCK_WHATSAPP_SITES_REQUIRED') {
        const noms = refusedSiteNames(data, chantiers.data ?? []);
        form.setFields([
          { name: 'siteIds', errors: [noms ? t('Chantiers non éligibles : {{names}}', { names: noms }) : texte] }
        ]);
        return;
      }
      message.error(texte);
    }
  });

  // Un chantier déjà affecté mais devenu inéligible reste visible (barré) pour être retiré.
  const options = siteOptions(chantiers.data ?? []);
  for (const site of registration?.sites ?? []) {
    if (!options.some(option => option.value === site.siteId)) {
      options.push({ value: site.siteId, label: site.name, disabled: true });
    }
  }

  return (
    <Modal
      open={open}
      title={t('Modifier les chantiers')}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      okButtonProps={{ loading: mutation.isPending }}
      onCancel={onClose}
      onOk={() => {
        void form
          .validateFields()
          .then(values => mutation.mutate(values.siteIds))
          .catch(() => undefined);
      }}
      destroyOnHidden
    >
      {chantiers.isPending ? (
        <Spin />
      ) : (
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="siteIds"
            label={t('Chantiers')}
            extra={t('Seuls les chantiers ouverts et basculés au stock sont proposés.')}
            rules={siteIdsRules()}
          >
            <Select mode="multiple" optionFilterProp="label" options={options} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Révoquer
// ---------------------------------------------------------------------------

export interface RevokeRegistrationModalProps {
  tenantId: string;
  registration: RegistrationView | null;
  onClose: () => void;
  onRevoked: (registration: RegistrationView) => void;
}

/** « Révoquer » (ecrans §5.2) : motif facultatif, 500 caractères au plus. */
export const RevokeRegistrationModal: React.FC<RevokeRegistrationModalProps> = ({
  tenantId,
  registration,
  onClose,
  onRevoked
}) => {
  const { message } = App.useApp();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (registration) setReason('');
  }, [registration]);

  const mutation = useMutation({
    mutationFn: () => revokeStockWhatsappRegistration(tenantId, (registration as RegistrationView).id, { reason }),
    onSuccess: revoked => onRevoked(revoked),
    onError: error => message.error(apiErrorOf(error).message ?? handleApiError(error))
  });

  return (
    <Modal
      open={Boolean(registration)}
      title={t('Révoquer l’accès')}
      okText={t('Révoquer')}
      cancelText={t('Annuler')}
      okButtonProps={{ danger: true, loading: mutation.isPending }}
      onCancel={onClose}
      onOk={() => mutation.mutate()}
      destroyOnHidden
    >
      <Typography.Paragraph>
        {t(
          'Révoquer l’accès de {{name}} ? Le bot refusera ses prochains messages. Une photo en attente de réponse sera abandonnée.',
          { name: registration?.userLabel ?? '' }
        )}
      </Typography.Paragraph>
      <label htmlFor="stock-whatsapp-revoke-reason">
        <Typography.Text>{t('Motif')}</Typography.Text>
      </label>
      <Input.TextArea
        id="stock-whatsapp-revoke-reason"
        rows={3}
        maxLength={500}
        showCount
        value={reason}
        onChange={event => setReason(event.target.value)}
        placeholder={t('Facultatif')}
      />
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Conversations d'une inscription
// ---------------------------------------------------------------------------

export interface RegistrationSessionsDrawerProps {
  tenantId: string;
  registration: RegistrationView | null;
  onClose: () => void;
}

/** « Voir les conversations » (ecrans §5.2) : les sessions de l'inscription, et leur fil à la demande. */
export const RegistrationSessionsDrawer: React.FC<RegistrationSessionsDrawerProps> = ({
  tenantId,
  registration,
  onClose
}) => {
  const { isMobile } = useBreakpoint();
  const open = Boolean(registration);

  const sessions = useQuery({
    queryKey: queryKey('stock-whatsapp-sessions', tenantId, { registrationId: registration?.id }),
    queryFn: () => listStockWhatsappSessions(tenantId, { registrationId: (registration as RegistrationView).id }),
    enabled: open,
    staleTime: 10_000
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('Conversations de {{name}}', { name: registration?.userLabel ?? '' })}
      size={isMobile ? '100%' : 560}
      destroyOnHidden
    >
      {sessions.isPending ? (
        <Spin />
      ) : sessions.error ? (
        <Alert type="error" showIcon title={handleApiError(sessions.error)} />
      ) : sessions.data.data.length === 0 ? (
        <Typography.Text type="secondary">{t('Aucune conversation.')}</Typography.Text>
      ) : (
        <Collapse
          items={sessions.data.data.map(session => ({
            key: session.id,
            label: <SessionLabel session={session} />,
            children: <SessionMessages tenantId={tenantId} sessionId={session.id} />
          }))}
        />
      )}
    </Drawer>
  );
};

const SessionLabel: React.FC<{ session: SessionView }> = ({ session }) => (
  <Space direction="vertical" size={0}>
    <span>
      {formatDateTime(session.openedAt)}
      {session.siteName ? ` · ${session.siteName}` : ''}
    </span>
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      {session.state === 'CLOSED'
        ? [t('Close'), sessionCloseReasonLabel(session.closeReason)].filter(Boolean).join(' · ')
        : sessionStateLabel(session.state)}
      {typeof session.capturesCount === 'number' ? ` · ${t('{{n}} photo(s)', { n: session.capturesCount })}` : ''}
    </Typography.Text>
  </Space>
);

const SessionMessages: React.FC<{ tenantId: string; sessionId: string }> = ({ tenantId, sessionId }) => {
  const query = useQuery({
    queryKey: detailKey('stock-whatsapp-session-messages', tenantId, sessionId),
    queryFn: () => listStockWhatsappSessionMessages(tenantId, sessionId),
    staleTime: 10_000
  });
  if (query.isPending) return <Spin />;
  if (query.error) return <Alert type="warning" showIcon title={handleApiError(query.error)} />;
  return <ConversationThread messages={query.data} />;
};
