import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, Modal, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getExternalAccessGrant,
  getExternalAccessScopeOptions,
  listExternalAccessGrants,
  revokeExternalAccessGrant
} from '../../../services/external-access-service';
import type {
  ExternalAccessGrantDetail,
  ExternalAccessGrantSummary,
  ExternalAccessScopeOptions
} from '../../../types/external-access';
import { useAuth } from '../../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { PageHeader, StateBlock, SkeletonList } from '../../../components/primitives';
import { apiErrorMessage } from '../../../components/patrimoine/patrimoine-labels';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { ExternalAccessLinkReveal, ExternalAccessSendLinkModal, type RevealedLink } from './ExternalAccessLinkModals';
import { ExternalAccessLogModal } from './ExternalAccessLogModal';
import { ExternalAccessWizard } from './ExternalAccessWizard';
import { accessSectionLabel, accessStatusColor, accessStatusLabel, accessTypeLabel } from './external-access-labels';

const { Text } = Typography;

const DEFAULT_MAX_LINK_TTL_DAYS = 30;

type WizardState = { open: false } | { open: true; grant: ExternalAccessGrantDetail | null };

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString(activeLocale()) : '—';
}

function expiryLabel(grant: ExternalAccessGrantSummary): string {
  return grant.permanent ? t('Permanent') : formatDate(grant.expiresAt);
}

function scopeLabel(grant: ExternalAccessGrantSummary): string {
  const parts = [t('{{count}} bien(s)', { count: grant.propertyCount })];
  if (grant.entityCount > 0) parts.push(t('{{count}} entité(s)', { count: grant.entityCount }));
  if (grant.documentCount > 0) parts.push(t('{{count}} document(s)', { count: grant.documentCount }));
  return parts.join(' · ');
}

/**
 * `<ExternalAccessPage>` — « Accès partagés » (spec 034) : les accès en lecture
 * seule accordés à un notaire, un expert-comptable ou un banquier. Création
 * guidée, modification, renvoi d'un lien (URL affichée une seule fois),
 * révocation et journal des consultations.
 */
export const ExternalAccessPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const agence = tenantId || tenantMembership?.tenantId;

  const [wizard, setWizard] = useState<WizardState>({ open: false });
  const [sendFor, setSendFor] = useState<ExternalAccessGrantSummary | null>(null);
  const [logFor, setLogFor] = useState<ExternalAccessGrantSummary | null>(null);
  const [revokeFor, setRevokeFor] = useState<ExternalAccessGrantSummary | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revealed, setRevealed] = useState<RevealedLink | null>(null);
  const [opening, setOpening] = useState(false);

  const grantsQuery = useQuery({
    queryKey: queryKey('external-access', agence),
    queryFn: () => listExternalAccessGrants(agence as string),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });
  const optionsQuery = useQuery({
    queryKey: queryKey('external-access-options', agence),
    queryFn: () => getExternalAccessScopeOptions(agence as string),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.reference
  });
  const options: ExternalAccessScopeOptions | undefined = optionsQuery.data;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKey('external-access', agence) });

  const openEdit = async (grant: ExternalAccessGrantSummary) => {
    if (!agence) return;
    setOpening(true);
    try {
      setWizard({ open: true, grant: await getExternalAccessGrant(agence, grant.id) });
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible de charger cet accès.')));
    } finally {
      setOpening(false);
    }
  };

  const confirmRevoke = async () => {
    if (!agence || !revokeFor) return;
    setRevoking(true);
    try {
      await revokeExternalAccessGrant(agence, revokeFor.id);
      message.success(t('Accès révoqué : les liens ne fonctionnent plus.'));
      setRevokeFor(null);
      await invalidate();
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible de révoquer cet accès.')));
    } finally {
      setRevoking(false);
    }
  };

  if (!agence) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucune agence sélectionnée')}
        description={t('Votre compte doit être rattaché à une agence pour gérer les accès partagés.')}
      />
    );
  }

  const startCreate = () => {
    if (!options) {
      message.error(t('Les options de partage ne sont pas encore chargées, réessayez dans un instant.'));
      return;
    }
    setWizard({ open: true, grant: null });
  };
  const grants = grantsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title={t('Accès partagés')}
        subtitle={t('Accès en lecture seule pour vos notaires, experts-comptables et banquiers')}
        primaryAction={{
          label: t('Nouvel accès'),
          icon: <PlusOutlined />,
          onClick: startCreate
        }}
      />

      {optionsQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les options de partage (biens, entités, propriétaires).')}
          actions={[{ label: t('Réessayer'), onClick: () => optionsQuery.refetch(), primary: true }]}
        />
      ) : null}

      {grantsQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les accès partagés.')}
          actions={[{ label: t('Réessayer'), onClick: () => grantsQuery.refetch(), primary: true }]}
        />
      ) : grantsQuery.isPending ? (
        <SkeletonList rows={5} aria-label={t('Accès partagés en cours de chargement')} />
      ) : grants.length === 0 ? (
        <StateBlock
          variant="empty"
          description={t('Aucun accès partagé pour le moment.')}
          actions={[{ label: t('Nouvel accès'), primary: true, onClick: startCreate }]}
        />
      ) : (
        <Table<ExternalAccessGrantSummary>
          rowKey="id"
          pagination={false}
          scroll={{ x: 'max-content' }}
          dataSource={grants}
          columns={[
            {
              title: t('Statut'),
              dataIndex: 'status',
              render: (_: unknown, grant) => (
                <Tag color={accessStatusColor(grant.status)}>{accessStatusLabel(grant.status)}</Tag>
              )
            },
            {
              title: t('Bénéficiaire'),
              render: (_: unknown, grant) => (
                <Space orientation="vertical" size={0}>
                  <Text strong>{grant.recipientName}</Text>
                  <Text type="secondary">{accessTypeLabel(grant.type)}</Text>
                </Space>
              )
            },
            {
              title: t('Périmètre'),
              render: (_: unknown, grant) => (
                <Space orientation="vertical" size={0}>
                  <Text>{scopeLabel(grant)}</Text>
                  {grant.ownerName ? <Text type="secondary">{grant.ownerName}</Text> : null}
                </Space>
              )
            },
            {
              title: t('Rubriques'),
              render: (_: unknown, grant) => (
                <Space size={[4, 4]} wrap>
                  {grant.sections.map(section => (
                    <Tag key={section}>{accessSectionLabel(section)}</Tag>
                  ))}
                </Space>
              )
            },
            { title: t('Expiration'), render: (_: unknown, grant) => expiryLabel(grant) },
            {
              title: t('Dernière consultation'),
              render: (_: unknown, grant) => (
                <Space orientation="vertical" size={0}>
                  <Text>{formatDate(grant.lastViewedAt)}</Text>
                  <Text type="secondary">{t('{{count}} consultation(s)', { count: grant.viewCount })}</Text>
                </Space>
              )
            },
            {
              title: t('Actions'),
              align: 'end' as const,
              render: (_: unknown, grant) => {
                const live = grant.status === 'ACTIVE' || grant.status === 'EXPIRING';
                return (
                  <Space size="small" wrap>
                    {grant.status !== 'REVOKED' ? (
                      <Button
                        size="small"
                        aria-label={t('Modifier {{name}}', { name: grant.recipientName })}
                        disabled={opening || !options}
                        onClick={() => openEdit(grant)}
                      >
                        {t('Modifier')}
                      </Button>
                    ) : null}
                    {live ? (
                      <Button
                        size="small"
                        aria-label={t('Renvoyer un lien à {{name}}', { name: grant.recipientName })}
                        onClick={() => setSendFor(grant)}
                      >
                        {t('Renvoyer un lien')}
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      aria-label={t('Journal de {{name}}', { name: grant.recipientName })}
                      onClick={() => setLogFor(grant)}
                    >
                      {t('Journal')}
                    </Button>
                    {grant.status !== 'REVOKED' ? (
                      <Button
                        size="small"
                        danger
                        aria-label={t('Révoquer {{name}}', { name: grant.recipientName })}
                        onClick={() => setRevokeFor(grant)}
                      >
                        {t('Révoquer')}
                      </Button>
                    ) : null}
                  </Space>
                );
              }
            }
          ]}
        />
      )}

      {wizard.open && options ? (
        <ExternalAccessWizard
          tenantId={agence}
          options={options}
          grant={wizard.grant}
          onClose={() => setWizard({ open: false })}
          onUpdated={() => {
            setWizard({ open: false });
            void invalidate();
          }}
          onCreated={result => {
            setWizard({ open: false });
            setRevealed({
              recipientName: result.grant.recipientName,
              link: result.link,
              email: result.email
            });
            void invalidate();
          }}
        />
      ) : null}

      <ExternalAccessSendLinkModal
        key={sendFor?.id ?? 'none'}
        tenantId={agence}
        grant={sendFor}
        maxLinkTtlDays={options?.maxLinkTtlDays ?? DEFAULT_MAX_LINK_TTL_DAYS}
        onClose={() => setSendFor(null)}
        onSent={link => {
          setSendFor(null);
          setRevealed(link);
          void invalidate();
        }}
      />

      <ExternalAccessLinkReveal revealed={revealed} onClose={() => setRevealed(null)} />

      <ExternalAccessLogModal tenantId={agence} grant={logFor} onClose={() => setLogFor(null)} />

      <Modal
        open={revokeFor !== null}
        title={revokeFor ? t('Révoquer l’accès de {{name}} ?', { name: revokeFor.recipientName }) : ''}
        onCancel={() => setRevokeFor(null)}
        onOk={confirmRevoke}
        okText={t('Révoquer')}
        cancelText={t('Annuler')}
        okButtonProps={{ danger: true }}
        confirmLoading={revoking}
        destroyOnHidden
      >
        <Text>
          {t(
            'Le bénéficiaire perdra immédiatement l’accès et tous ses liens cesseront de fonctionner. Cette action est définitive.'
          )}
        </Text>
      </Modal>
    </>
  );
};

export default ExternalAccessPage;
