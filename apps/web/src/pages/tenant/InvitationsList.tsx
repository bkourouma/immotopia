import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Table, Card, Button, Tag, Space, Popconfirm, Alert, Empty, Typography } from 'antd';
import { MailOutlined, PlusOutlined, ReloadOutlined, CloseOutlined } from '@ant-design/icons';
import { resendInvitation, revokeInvitation } from '../../services/invitation-service';
import apiClient from '../../utils/api-client';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;

interface Invitation {
  id: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string;
  roleIds: string[];
}

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
        setError('Erreur lors du chargement des invitations');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des invitations');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (invitationId: string) => {
    if (!tenantId) return;
    try {
      await resendInvitation(tenantId, invitationId);
      await loadInvitations();
      message.success('Invitation renvoyée avec succès');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors du renvoi');
    }
  };

  const handleRevoke = async (invitationId: string) => {
    if (!tenantId) return;
    try {
      await revokeInvitation(tenantId, invitationId);
      await loadInvitations();
      message.success('Invitation révoquée avec succès');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la révocation');
    }
  };

  const getStatusTag = (status: string, expiresAt: string) => {
    const isExpired = new Date(expiresAt) < new Date();
    const statusConfig = {
      PENDING: { color: isExpired ? 'default' : 'warning', text: isExpired ? 'Expirée' : 'En attente' },
      ACCEPTED: { color: 'success', text: 'Acceptée' },
      REVOKED: { color: 'error', text: 'Révoquée' },
      EXPIRED: { color: 'default', text: 'Expirée' }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const columns: ColumnsType<Invitation> = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 250,
      render: (email: string) => <Text strong>{email}</Text>
    },
    {
      title: 'Statut',
      key: 'status',
      width: 150,
      render: (_, record) => getStatusTag(record.status, record.expiresAt)
    },
    {
      title: "Date d'invitation",
      dataIndex: 'invitedAt',
      key: 'invitedAt',
      width: 150,
      render: (date: string) => new Date(date).toLocaleDateString('fr-FR')
    },
    {
      title: 'Expiration',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      width: 150,
      render: (date: string) => new Date(date).toLocaleDateString('fr-FR')
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      width: 150,
      render: (_, record) => {
        const canAct = record.status === 'PENDING' && !isExpired(record.expiresAt);
        return (
          <Space>
            {canAct && (
              <>
                <Popconfirm
                  title="Renvoyer l'invitation"
                  description="Êtes-vous sûr de vouloir renvoyer cette invitation ?"
                  onConfirm={() => handleResend(record.id)}
                  okText="Oui"
                  cancelText="Non"
                >
                  <Button type="text" icon={<ReloadOutlined />} title="Renvoyer" />
                </Popconfirm>
                <Popconfirm
                  title="Révoquer l'invitation"
                  description="Êtes-vous sûr de vouloir révoquer cette invitation ?"
                  onConfirm={() => handleRevoke(record.id)}
                  okText="Oui"
                  cancelText="Non"
                >
                  <Button type="text" danger icon={<CloseOutlined />} title="Révoquer" />
                </Popconfirm>
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
        <div className="it-toolbar it-toolbar--start">
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Invitations
            </Title>
            <Text type="secondary">Gérez les invitations envoyées aux collaborateurs</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/tenant/${tenantId}/invite`)}>
            Nouvelle invitation
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        {/* Invitations Table */}
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <Table
              columns={columns}
              dataSource={invitations}
              rowKey="id"
              loading={loading}
              scroll={{ x: 'max-content' }}
              locale={{
                emptyText: <Empty description="Aucune invitation trouvée" />
              }}
            />
          </div>
        </Card>
      </Space>
    </>
  );
};
