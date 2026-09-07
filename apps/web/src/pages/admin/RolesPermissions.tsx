import React, { useState, useEffect } from 'react';
import {
  Card,
  List,
  Typography,
  Button,
  Alert,
  Spin,
  Empty,
  Checkbox,
  Space,
  Row,
  Col,
  Tag,
} from 'antd';
import { SafetyCertificateOutlined, SaveOutlined, CheckOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import {
  listRoles,
  getRole,
  listPermissions,
  updateRolePermissions,
  Role,
  Permission,
} from '../../services/role-service';
import {
  getPermissionLabelFr,
  getPermissionGroupLabelFr,
  getRoleLabelFr,
} from '../../constants/permissions-labels';

const { Title, Text } = Typography;

export const RolesPermissions: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedRole) {
      loadRolePermissions();
    }
  }, [selectedRole]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesData, permissionsData] = await Promise.all([
        listRoles(),
        listPermissions(),
      ]);
      setRoles(rolesData);
      setPermissions(permissionsData);
      if (rolesData.length > 0 && !selectedRole) {
        setSelectedRole(rolesData[0]);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const loadRolePermissions = async () => {
    if (!selectedRole) return;
    try {
      const role = await getRole(selectedRole.id);
      setRolePermissions(new Set(role.permissions?.map((p) => p.id) || []));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des permissions du rôle');
    }
  };

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setSuccess(null);
  };

  const handlePermissionToggle = (permissionId: string) => {
    setRolePermissions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateRolePermissions(selectedRole.id, Array.from(rolePermissions));
      setSuccess('Permissions mises à jour avec succès');
      const updatedRole = await getRole(selectedRole.id);
      setSelectedRole(updatedRole);
      setRoles((prev) => prev.map((r) => (r.id === updatedRole.id ? updatedRole : r)));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour des permissions');
    } finally {
      setSaving(false);
    }
  };

  const permissionsWithoutCommunication = permissions.filter(
    (perm) => !perm.key.startsWith('COMMUNICATION_')
  );

  const groupedPermissions = permissionsWithoutCommunication.reduce(
    (acc, perm) => {
      const prefix = perm.key.split('_')[0];
      if (!acc[prefix]) {
        acc[prefix] = [];
      }
      acc[prefix].push(perm);
      return acc;
    },
    {} as Record<string, Permission[]>,
  );

  const getRoleDisplayName = (role: Role) => {
    const fr = getRoleLabelFr(role.key, role.name, role.description);
    return fr.name;
  };

  const getRoleDisplayDescription = (role: Role) => {
    const fr = getRoleLabelFr(role.key, role.name, role.description);
    return fr.description;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 256 }}>
          <Spin size="large" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Gestion des Rôles et Permissions
          </Title>
          <Text type="secondary">Configurez les permissions pour chaque rôle</Text>
        </div>

        {error && (
          <Alert
            message="Erreur"
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {success && (
          <Alert
            message="Succès"
            description={success}
            type="success"
            showIcon
            closable
            onClose={() => setSuccess(null)}
          />
        )}

        <Row gutter={24}>
          <Col xs={24} lg={6}>
            <Card title="Rôles" size="small">
              <List
                dataSource={roles}
                renderItem={(role) => {
                  const isSelected = selectedRole?.id === role.id;
                  return (
                    <List.Item
                      key={role.id}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'var(--ant-color-primary-bg)' : undefined,
                        borderRadius: 6,
                        marginBottom: 4,
                        borderLeft: isSelected ? '3px solid var(--ant-color-primary)' : '3px solid transparent',
                      }}
                      onClick={() => handleRoleSelect(role)}
                    >
                      <List.Item.Meta
                        avatar={<SafetyCertificateOutlined style={{ fontSize: 20, color: isSelected ? 'var(--ant-color-primary)' : undefined }} />}
                        title={<Text strong={isSelected}>{getRoleDisplayName(role)}</Text>}
                        description={
                          <Tag color={role.scope === 'PLATFORM' ? 'blue' : 'green'}>
                            {role.scope === 'PLATFORM' ? 'Plateforme' : 'Tenant'}
                          </Tag>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            </Card>
          </Col>

          <Col xs={24} lg={18}>
            {selectedRole ? (
              <Card
                title={
                  <Space>
                    <span>Permissions – {getRoleDisplayName(selectedRole)}</span>
                    <Tag color={selectedRole.scope === 'PLATFORM' ? 'blue' : 'green'}>
                      {selectedRole.scope === 'PLATFORM' ? 'Plateforme' : 'Tenant'}
                    </Tag>
                  </Space>
                }
                extra={
                  <Button
                    type="primary"
                    icon={saving ? undefined : <SaveOutlined />}
                    onClick={handleSave}
                    loading={saving}
                  >
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                }
              >
                {(getRoleDisplayDescription(selectedRole) || selectedRole.description) && (
                  <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    {getRoleDisplayDescription(selectedRole) || selectedRole.description}
                  </Text>
                )}

                {Object.entries(groupedPermissions).length === 0 ? (
                  <Empty description="Aucune permission disponible" />
                ) : (
                  <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    {Object.entries(groupedPermissions).map(([prefix, perms]) => {
                      const groupLabel = getPermissionGroupLabelFr(prefix);
                      return (
                        <div key={prefix}>
                          <Text strong style={{ fontSize: 13, color: 'rgba(0,0,0,0.75)', display: 'block', marginBottom: 12 }}>
                            {groupLabel}
                          </Text>
                          <Row gutter={[16, 8]}>
                            {perms.map((permission) => {
                              const isChecked = rolePermissions.has(permission.id);
                              const { label: permLabel, description: permDesc } = getPermissionLabelFr(
                                permission.key,
                                permission.description ?? undefined
                              );
                              return (
                                <Col xs={24} md={12} key={permission.id}>
                                  <Checkbox
                                    checked={isChecked}
                                    onChange={() => handlePermissionToggle(permission.id)}
                                    style={{ alignItems: 'flex-start', marginRight: 0 }}
                                  >
                                    <Space direction="vertical" size={0}>
                                      <Space>
                                        <span>{permLabel}</span>
                                        {isChecked && <CheckOutlined style={{ color: 'var(--ant-color-success)' }} />}
                                      </Space>
                                      <Text type="secondary" style={{ fontSize: 12 }}>
                                        {permDesc}
                                      </Text>
                                    </Space>
                                  </Checkbox>
                                </Col>
                              );
                            })}
                          </Row>
                        </div>
                      );
                    })}
                  </Space>
                )}
              </Card>
            ) : (
              <Card>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Sélectionnez un rôle pour gérer ses permissions"
                />
              </Card>
            )}
          </Col>
        </Row>
      </Space>
    </DashboardLayout>
  );
};
