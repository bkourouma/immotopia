import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Spin, Alert, Button, Descriptions, Checkbox, Space, Typography } from 'antd';
import { ArrowLeftOutlined, EditOutlined, KeyOutlined, LogoutOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import {
  getMember,
  updateMember,
  resetMemberPassword,
  revokeMemberSessions,
  Member
} from '../../services/membership-service';
import apiClient from '../../utils/api-client';
import { getRoleLabelFr } from '../../constants/permissions-labels';
import { useConfirmAction } from '../../components/primitives';

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'Actif',
  PENDING_INVITE: 'Invitation en attente',
  INACTIVE: 'Désactivé'
};

export const CollaboratorDetail: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();

  const { tenantId, userId } = useParams<{ tenantId: string; userId: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<Member | null>(null);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  useEffect(() => {
    if (tenantId && userId) {
      loadMember();
      loadAvailableRoles();
    }
  }, [tenantId, userId]);

  const loadMember = async () => {
    if (!tenantId || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getMember(tenantId, userId);
      if (response.success) {
        setMember(response.data);
        setSelectedRoleIds(response.data.roles.map(r => r.id));
      } else {
        setError('Erreur lors du chargement du collaborateur');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement du collaborateur');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableRoles = async () => {
    try {
      const response = await apiClient.get('/roles?scope=TENANT');
      if (response.data.success) {
        setAvailableRoles(response.data.data || []);
      }
    } catch (err) {
      console.error('Error loading roles:', err);
    }
  };

  const handleSaveRoles = async () => {
    if (!tenantId || !userId) return;
    setSavingRoles(true);
    try {
      await updateMember(tenantId, userId, { roleIds: selectedRoleIds });
      await loadMember();
      message.success('Rôles mis à jour avec succès');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setSavingRoles(false);
    }
  };

  const handleResetPassword = () => {
    if (!tenantId || !userId) return;
    confirmAction({
      title: 'Réinitialiser le mot de passe',
      description: "Êtes-vous sûr de vouloir réinitialiser le mot de passe ? Un email sera envoyé à l'utilisateur.",
      okText: 'Réinitialiser',
      cancelText: 'Annuler',
      onConfirm: async () => {
        try {
          await resetMemberPassword(tenantId, userId, { sendEmail: true });
          message.success("Mot de passe réinitialisé. Un email a été envoyé à l'utilisateur.");
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Erreur lors de la réinitialisation');
        }
      }
    });
  };

  const handleRevokeSessions = () => {
    if (!tenantId || !userId) return;
    confirmAction({
      title: 'Révoquer les sessions',
      description: 'Êtes-vous sûr de vouloir révoquer toutes les sessions de cet utilisateur ?',
      okText: 'Révoquer',
      cancelText: 'Annuler',
      danger: true,
      onConfirm: async () => {
        try {
          await revokeMemberSessions(tenantId, userId);
          message.success('Toutes les sessions ont été révoquées');
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Erreur lors de la révocation');
        }
      }
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
          <Spin size="large" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !member) {
    return (
      <DashboardLayout>
        <Alert type="error" showIcon message={error || 'Collaborateur introuvable'} style={{ margin: 16 }} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <Space align="center" wrap>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/tenant/${tenantId}/collaborators`)}
            aria-label="Retour"
          />
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {member.user.fullName || member.user.email}
            </Typography.Title>
            <Typography.Text type="secondary">{member.user.email}</Typography.Text>
          </div>
        </Space>

        {/* User Info & Roles */}
        <Card title="Informations du collaborateur">
          <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
            <Descriptions.Item label="Email">{member.user.email}</Descriptions.Item>
            <Descriptions.Item label="Nom complet">{member.user.fullName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Statut">{statusLabels[member.status] ?? member.status}</Descriptions.Item>
            <Descriptions.Item label="Dernière connexion">
              {member.user.lastLoginAt ? new Date(member.user.lastLoginAt).toLocaleString('fr-FR') : 'Jamais'}
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 24 }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
              Rôles
            </Typography.Text>
            {availableRoles.length === 0 ? (
              <Typography.Text type="secondary">Chargement des rôles...</Typography.Text>
            ) : (
              <>
                <Checkbox.Group
                  value={selectedRoleIds}
                  onChange={ids => setSelectedRoleIds(ids as string[])}
                  style={{ width: '100%', display: 'block' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {availableRoles.map(role => {
                      const { name: labelFr, description: descFr } = getRoleLabelFr(
                        role.key,
                        role.name,
                        role.description
                      );
                      return (
                        <Checkbox key={role.id} value={role.id}>
                          <Space direction="vertical" size={0}>
                            <Typography.Text>{labelFr}</Typography.Text>
                            {descFr && (
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {descFr}
                              </Typography.Text>
                            )}
                          </Space>
                        </Checkbox>
                      );
                    })}
                  </Space>
                </Checkbox.Group>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={handleSaveRoles}
                  loading={savingRoles}
                  style={{ marginTop: 16 }}
                >
                  Enregistrer les rôles
                </Button>
              </>
            )}
          </div>

          {/* Actions */}
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
              Actions
            </Typography.Text>
            <Space wrap>
              <Button icon={<KeyOutlined />} onClick={handleResetPassword}>
                Réinitialiser le mot de passe
              </Button>
              <Button icon={<LogoutOutlined />} onClick={handleRevokeSessions} danger>
                Révoquer les sessions
              </Button>
            </Space>
          </div>
        </Card>
      </Space>
    </DashboardLayout>
  );
};
