import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Alert, Button, Card, Checkbox, Form, Input, Space, Typography } from 'antd';
import { ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import { InviteCollaboratorRequest, inviteCollaborator } from '../../services/invitation-service';
import apiClient from '../../utils/api-client';
import { getRoleLabelFr } from '../../constants/permissions-labels';

const { Title, Text } = Typography;

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: 'PLATFORM' | 'TENANT';
}

export const InviteCollaborator: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    setRolesLoading(true);
    setRolesError(null);

    try {
      const response = await apiClient.get('/roles?scope=TENANT');
      const payload = response.data;

      const roleData = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.roles)
            ? payload.roles
            : [];

      setRoles(roleData as Role[]);
    } catch (err: any) {
      console.error('Error loading roles:', err);
      setRoles([]);
      setRolesError(err.response?.data?.message || 'Impossible de charger les roles. Veuillez reessayer.');
    } finally {
      setRolesLoading(false);
    }
  };

  const handleSubmit = async (values: { email: string }) => {
    if (!tenantId) return;

    setHasTriedSubmit(true);

    if (selectedRoles.length === 0) {
      setError('Veuillez selectionner au moins un role');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData: InviteCollaboratorRequest = {
        email: values.email,
        roleIds: selectedRoles
      };

      const response = await inviteCollaborator(tenantId, formData);
      if (response.success) {
        message.success('Invitation envoyee avec succes');
        navigate(`/tenant/${tenantId}/invitations`);
      } else {
        setError(response.message || "Erreur lors de l'invitation");
      }
    } catch (err: any) {
      const apiMessage = err.response?.data?.message || "Erreur lors de l'invitation";
      setError(
        apiMessage.includes('plus actif')
          ? `${apiMessage} Veuillez activer le tenant (parametres ou administration) puis reessayer.`
          : apiMessage
      );
      message.error(apiMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (roleId: string, checked: boolean) => {
    setSelectedRoles(prevSelectedRoles =>
      checked ? [...prevSelectedRoles, roleId] : prevSelectedRoles.filter(id => id !== roleId)
    );
    setError(null);
  };

  const handleRoleCardClick = (roleId: string) => {
    setSelectedRoles(prevSelectedRoles => {
      const isAlreadySelected = prevSelectedRoles.includes(roleId);
      if (isAlreadySelected) {
        return prevSelectedRoles.filter(id => id !== roleId);
      }
      return [...prevSelectedRoles, roleId];
    });
    setError(null);
  };

  return (
    <>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/tenant/${tenantId}/collaborators`)}
          />
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Inviter un collaborateur
            </Title>
            <Text type="secondary">Envoyer une invitation a un nouvel utilisateur</Text>
          </div>
        </div>

        <Card>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{
              email: ''
            }}
          >
            {error && (
              <Alert
                message="Erreur"
                description={error}
                type="error"
                showIcon
                closable
                onClose={() => setError(null)}
                style={{ marginBottom: 24 }}
              />
            )}

            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: "L'email est requis" },
                { type: 'email', message: 'Email invalide' }
              ]}
            >
              <Input type="email" placeholder="email@example.com" size="large" />
            </Form.Item>

            <Form.Item
              label="Roles"
              required
              validateStatus={
                hasTriedSubmit && !rolesLoading && roles.length > 0 && selectedRoles.length === 0 ? 'error' : ''
              }
              help={
                hasTriedSubmit && !rolesLoading && roles.length > 0 && selectedRoles.length === 0
                  ? 'Veuillez selectionner au moins un role'
                  : ''
              }
            >
              {rolesLoading ? (
                <Text type="secondary">Chargement des roles...</Text>
              ) : rolesError ? (
                <Space orientation="vertical">
                  <Text type="danger">{rolesError}</Text>
                  <Button onClick={loadRoles}>Reessayer</Button>
                </Space>
              ) : roles.length === 0 ? (
                <Space orientation="vertical">
                  <Text type="secondary">Aucun rôle disponible pour cette agence.</Text>
                  <Button onClick={loadRoles}>Recharger</Button>
                </Space>
              ) : (
                <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                  {roles.map(role => {
                    const { name: labelFr, description: descFr } = getRoleLabelFr(
                      role.key,
                      role.name,
                      role.description
                    );

                    return (
                      <Card
                        key={role.id}
                        size="small"
                        hoverable
                        onClick={() => handleRoleCardClick(role.id)}
                        style={{
                          border: selectedRoles.includes(role.id) ? '1px solid #1890ff' : '1px solid #d9d9d9',
                          backgroundColor: selectedRoles.includes(role.id) ? '#e6f7ff' : '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        <Checkbox
                          checked={selectedRoles.includes(role.id)}
                          onChange={e => handleRoleChange(role.id, e.target.checked)}
                          onClick={e => e.stopPropagation()}
                        >
                          <div style={{ marginLeft: 8 }}>
                            <div style={{ fontWeight: 500 }}>{labelFr}</div>
                            {descFr && (
                              <Text type="secondary" style={{ fontSize: '12px' }}>
                                {descFr}
                              </Text>
                            )}
                          </div>
                        </Checkbox>
                      </Card>
                    );
                  })}
                </Space>
              )}
            </Form.Item>

            <Form.Item>
              <Space>
                <Button onClick={() => navigate(`/tenant/${tenantId}/collaborators`)}>Annuler</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SendOutlined />}
                  loading={loading}
                  disabled={selectedRoles.length === 0 || rolesLoading || roles.length === 0}
                >
                  {loading ? 'Envoi...' : "Envoyer l'invitation"}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Space>
    </>
  );
};
