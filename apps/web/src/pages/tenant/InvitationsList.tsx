import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Button, Tag, Space, Empty, Typography } from 'antd';
import { MailOutlined, PlusOutlined, ReloadOutlined, CloseOutlined } from '@ant-design/icons';
import { resendInvitation, revokeInvitation } from '../../services/invitation-service';
import apiClient from '../../utils/api-client';
import type { ColumnsType } from 'antd/es/table';
import { ConfirmAction, PageHeader, StateBlock, Table } from '../../components/primitives';
import { useLocalListSearch } from '../../utils/list-search';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

interface Invitation {
  id: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string;
  roleIds: string[];
}

// Statut affiché : une invitation en attente dont la date est passée est « expirée ».
const effectiveStatus = (invitation: Invitation): string =>
  invitation.status === 'PENDING' && new Date(invitation.expiresAt) < new Date() ? 'EXPIRED' : invitation.status;

// Stables : déclarés hors du composant (filtrage mémoïsé).
const INVITATION_TEXT = [(invitation: Invitation) => invitation.email];
const INVITATION_ACCESSORS = {
  status: effectiveStatus,
  invitedAt: (invitation: Invitation) => invitation.invitedAt
};

export const InvitationsList: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId) {
      loadInvitations();
    }
  }, [tenantId]);

  const loadInvitations = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/tenants/${tenantId}/invitations`);
      if (response.data.success) {
        setInvitations(response.data.data || []);
      } else {
        setError(t('Erreur lors du chargement des invitations'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des invitations'));
    } finally {
      setLoading(false);
    }
  };

  // Invitations reçues en entier : recherche et pagination locales, état dans l'URL.
  const local = useLocalListSearch<Invitation>(invitations, {
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Adresse e-mail…') },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: [
          { value: 'PENDING', label: t('En attente') },
          { value: 'ACCEPTED', label: t('Acceptée') },
          { value: 'REVOKED', label: t('Révoquée') },
          { value: 'EXPIRED', label: t('Expirée') }
        ]
      },
      { key: 'invited', type: 'dateRange', label: t("Date d'invitation"), primary: true }
    ],
    text: INVITATION_TEXT,
    accessors: { status: INVITATION_ACCESSORS.status, invited: INVITATION_ACCESSORS.invitedAt }
  });

  const handleResend = async (invitationId: string) => {
    if (!tenantId) return;
    try {
      await resendInvitation(tenantId, invitationId);
      await loadInvitations();
      message.success(t('Invitation renvoyée avec succès'));
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du renvoi'));
    }
  };

  const handleRevoke = async (invitationId: string) => {
    if (!tenantId) return;
    try {
      await revokeInvitation(tenantId, invitationId);
      await loadInvitations();
      message.success(t('Invitation révoquée avec succès'));
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la révocation'));
    }
  };

  const getStatusTag = (status: string, expiresAt: string) => {
    const isExpired = new Date(expiresAt) < new Date();
    const statusConfig = {
      PENDING: { color: isExpired ? 'default' : 'warning', text: isExpired ? t('Expirée') : t('En attente') },
      ACCEPTED: { color: 'success', text: t('Acceptée') },
      REVOKED: { color: 'error', text: t('Révoquée') },
      EXPIRED: { color: 'default', text: t('Expirée') }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const columns: ColumnsType<Invitation> = [
    {
      title: t('Email'),
      dataIndex: 'email',
      key: 'email',
      width: 250,
      render: (email: string) => <Text strong>{email}</Text>
    },
    {
      title: t('Statut'),
      key: 'status',
      width: 150,
      render: (_, record) => getStatusTag(record.status, record.expiresAt)
    },
    {
      title: t("Date d'invitation"),
      dataIndex: 'invitedAt',
      key: 'invitedAt',
      width: 150,
      render: (date: string) => new Date(date).toLocaleDateString(activeLocale())
    },
    {
      title: t('Expiration'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      width: 150,
      render: (date: string) => new Date(date).toLocaleDateString(activeLocale())
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      width: 150,
      render: (_, record) => {
        const canAct = record.status === 'PENDING' && !isExpired(record.expiresAt);
        return (
          <Space>
            {canAct && (
              <>
                <ConfirmAction
                  title={t("Renvoyer l'invitation à {{email}} ?", { email: record.email })}
                  onConfirm={() => handleResend(record.id)}
                  okText={t('Oui, renvoyer')}
                  cancelText={t('Non')}
                >
                  <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    title={t('Renvoyer')}
                    aria-label={t("Renvoyer l'invitation à {{email}}", { email: record.email })}
                    style={{ minWidth: 44, minHeight: 44 }}
                  />
                </ConfirmAction>
                <ConfirmAction
                  title={t("Révoquer l'invitation de {{email}} ?", { email: record.email })}
                  description={t('Le lien reçu ne fonctionnera plus. Vous pourrez réinviter cette personne.')}
                  onConfirm={() => handleRevoke(record.id)}
                  okText={t('Oui, révoquer')}
                  cancelText={t('Non')}
                  danger
                >
                  <Button
                    type="text"
                    danger
                    icon={<CloseOutlined />}
                    title={t('Révoquer')}
                    aria-label={t("Révoquer l'invitation de {{email}}", { email: record.email })}
                    style={{ minWidth: 44, minHeight: 44 }}
                  />
                </ConfirmAction>
              </>
            )}
          </Space>
        );
      }
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <PageHeader
          title={t('Invitations')}
          subtitle={t('Gérez les invitations envoyées aux collaborateurs')}
          primaryAction={{
            label: t('Nouvelle invitation'),
            icon: <PlusOutlined />,
            onClick: () => navigate(`/tenant/${tenantId}/invite`)
          }}
        />

        {/* Error Message */}
        {error && (
          <StateBlock
            variant="error"
            description={error}
            actions={[{ label: t('Réessayer'), onClick: loadInvitations, primary: true }]}
          />
        )}

        {/* Invitations Table */}
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <Table
              {...local.tableProps}
              aria-label={t('Invitations')}
              helpId="administration.equipe.invitations.tableau"
              exportFilename={t('Invitations')}
              exportFetchAll={local.exportAll}
              columns={columns}
              rowKey="id"
              loading={loading}
              scroll={{ x: 'max-content' }}
              locale={
                local.isFiltered ? undefined : { emptyText: <Empty description={t('Aucune invitation trouvée')} /> }
              }
            />
          </div>
        </Card>
      </Space>
    </>
  );
};
