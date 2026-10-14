import React, { useState } from 'react';
import { App, Button, Dropdown, Space, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { MoreOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { entityKeyPrefix } from '../../../../lib/query-keys';
import { regenerateStockWhatsappActivationCode } from '../../../../services/finance-stock-whatsapp-service';
import type { RegistrationView, RegistrationWithCode, SiteRef } from '../../../../types/finance-stock-whatsapp-types';
import { DataView } from '../../../primitives/DataView';
import { DataCard } from '../../../primitives/DataCard';
import { StatusTag } from '../../../primitives/StatusTag';
import { handleApiError } from '../../../../utils/error-handler';
import { t } from '../../../../i18n/t';
import { ActivationCodeModal } from './ActivationCodeModal';
import { RegistrationForm } from './RegistrationForm';
import { RegistrationSessionsDrawer, RegistrationSitesModal, RevokeRegistrationModal } from './RegistrationDialogs';
import {
  apiErrorOf,
  formatDateTime,
  registrationAccessReasonLabel,
  registrationStatusDisplay,
  siteIneligibleReasonLabel
} from './whatsapp-labels';

export const STOCK_WHATSAPP_REGISTRATIONS_ENTITY = 'stock-whatsapp-registrations';

export interface WhatsappRegistrationsTabProps {
  tenantId: string;
  registrations: RegistrationView[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Numéro du bot de la vue d'ensemble (repli de la fenêtre du code). */
  botNumber?: string | null;
}

const SiteTags: React.FC<{ sites: SiteRef[] }> = ({ sites }) => (
  <Space size={[4, 4]} wrap>
    {sites.map(site =>
      site.eligible ? (
        <StatusTag key={site.siteId} status="SITE" tone="neutral" label={site.name} />
      ) : (
        <Tooltip key={site.siteId} title={siteIneligibleReasonLabel(site.ineligibleReason)}>
          <span style={{ textDecoration: 'line-through' }} data-testid="site-ineligible">
            <StatusTag status="SITE" tone="neutral" label={site.name} />
          </span>
        </Tooltip>
      )
    )}
  </Space>
);

const StatusCell: React.FC<{ registration: RegistrationView }> = ({ registration }) => {
  const display = registrationStatusDisplay(registration.status);
  return (
    <Space direction="vertical" size={2}>
      <StatusTag status={registration.status} tone={display.tone} label={display.label} />
      {registration.status === 'PENDING_ACTIVATION' && registration.activationExpiresAt && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('jusqu’au {{date}}', { date: formatDateTime(registration.activationExpiresAt) })}
        </Typography.Text>
      )}
    </Space>
  );
};

const AccessCell: React.FC<{ registration: RegistrationView }> = ({ registration }) => {
  if (registration.status === 'REVOKED' || registration.access?.ok !== false) return null;
  return (
    <StatusTag
      status="ACCESS"
      tone="warning"
      label={registrationAccessReasonLabel(registration.access.reason ?? null)}
    />
  );
};

/**
 * Sous-onglet « Chefs de chantier » (ecrans §5.2). Le numéro s'affiche masqué
 * (`phoneMasked`) dans la liste ; le code d'activation n'est montré qu'une
 * fois, juste après la création ou la régénération.
 */
export const WhatsappRegistrationsTab: React.FC<WhatsappRegistrationsTabProps> = ({
  tenantId,
  registrations,
  loading,
  error,
  onRetry,
  botNumber
}) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [codeShown, setCodeShown] = useState<RegistrationWithCode | null>(null);
  const [editing, setEditing] = useState<RegistrationView | null>(null);
  const [revoking, setRevoking] = useState<RegistrationView | null>(null);
  const [conversations, setConversations] = useState<RegistrationView | null>(null);

  const reload = () =>
    void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_WHATSAPP_REGISTRATIONS_ENTITY, tenantId) });

  const regenerate = useMutation({
    mutationFn: (registrationId: string) => regenerateStockWhatsappActivationCode(tenantId, registrationId),
    onSuccess: withCode => {
      setCodeShown(withCode);
      reload();
    },
    onError: err => message.error(apiErrorOf(err).message ?? handleApiError(err))
  });

  const actions = (registration: RegistrationView): MenuProps['items'] => {
    const items: NonNullable<MenuProps['items']> = [];
    if (registration.status !== 'REVOKED') {
      items.push({ key: 'sites', label: t('Modifier les chantiers'), onClick: () => setEditing(registration) });
    }
    if (registration.status === 'PENDING_ACTIVATION') {
      items.push({
        key: 'code',
        label: t('Régénérer le code'),
        onClick: () => regenerate.mutate(registration.id)
      });
    }
    items.push({
      key: 'conversations',
      label: t('Voir les conversations'),
      onClick: () => setConversations(registration)
    });
    if (registration.status !== 'REVOKED') {
      items.push({ key: 'revoke', label: t('Révoquer'), danger: true, onClick: () => setRevoking(registration) });
    }
    return items;
  };

  const columns: ColumnsType<RegistrationView> = [
    { title: t('Chef'), key: 'chef', render: (_v, r) => r.userLabel },
    { title: t('Téléphone'), key: 'phone', render: (_v, r) => <span dir="ltr">{r.phoneMasked}</span> },
    { title: t('Chantiers'), key: 'sites', render: (_v, r) => <SiteTags sites={r.sites} /> },
    { title: t('État'), key: 'status', render: (_v, r) => <StatusCell registration={r} /> },
    { title: t('Accès'), key: 'access', render: (_v, r) => <AccessCell registration={r} /> },
    { title: t('Dernier message'), key: 'last', render: (_v, r) => formatDateTime(r.lastInboundAt) },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_v, r) => (
        <Dropdown menu={{ items: actions(r) }} trigger={['click']}>
          <Button icon={<MoreOutlined />} aria-label={t('Actions de {{name}}', { name: r.userLabel })} />
        </Dropdown>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBlockEnd: 12 }}>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setFormOpen(true)}>
          {t('Inscrire un chef de chantier')}
        </Button>
      </div>

      <DataView<RegistrationView>
        aria-label={t('Chefs de chantier inscrits')}
        items={registrations}
        total={registrations.length}
        page={1}
        pageSize={Math.max(registrations.length, 1)}
        paginated={false}
        onPageChange={() => undefined}
        loading={loading}
        error={error}
        onRetry={onRetry}
        emptyDescription={t('Aucun chef de chantier inscrit.')}
        rowKey={r => r.id}
        columns={columns}
        scrollX={900}
        renderCard={r => (
          <DataCard
            title={r.userLabel}
            subtitle={<span dir="ltr">{r.phoneMasked}</span>}
            status={<StatusCell registration={r} />}
            fields={[
              { label: t('Chantiers'), value: <SiteTags sites={r.sites} /> },
              { label: t('Accès'), value: <AccessCell registration={r} /> },
              { label: t('Dernier message'), value: formatDateTime(r.lastInboundAt) }
            ]}
            secondaryActions={actions(r)}
          />
        )}
      />

      <Typography.Paragraph type="secondary" style={{ marginBlockStart: 16 }}>
        {t(
          'Le numéro sert seulement à reconnaître le chef de chantier. Les photos reçues sont analysées par un service d’intelligence artificielle et conservées comme preuve de l’inventaire. Informez vos chefs de chantier avant de les inscrire.'
        )}
      </Typography.Paragraph>

      <RegistrationForm
        tenantId={tenantId}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={created => {
          setFormOpen(false);
          setCodeShown(created);
          reload();
        }}
      />

      <ActivationCodeModal registration={codeShown} fallbackBotNumber={botNumber} onClose={() => setCodeShown(null)} />

      <RegistrationSitesModal
        tenantId={tenantId}
        registration={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          message.success(t('Chantiers enregistrés'));
          reload();
        }}
      />

      <RevokeRegistrationModal
        tenantId={tenantId}
        registration={revoking}
        onClose={() => setRevoking(null)}
        onRevoked={() => {
          setRevoking(null);
          message.success(t('Accès révoqué'));
          reload();
        }}
      />

      <RegistrationSessionsDrawer
        tenantId={tenantId}
        registration={conversations}
        onClose={() => setConversations(null)}
      />
    </div>
  );
};

export default WhatsappRegistrationsTab;
