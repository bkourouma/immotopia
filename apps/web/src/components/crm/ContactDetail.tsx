import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  App,
  Card,
  Button,
  Space,
  Typography,
  Tag,
  Avatar,
  Alert,
  Spin,
  Empty,
  Row,
  Col,
  Descriptions,
  Popconfirm,
  Modal,
  Divider
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  CalendarOutlined,
  TagOutlined,
  ProjectOutlined,
  ThunderboltOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  MessageOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import {
  getContact,
  convertContact,
  removeContactRole,
  updateContactRoles,
  CrmContact,
  CrmContactDetail,
  createDeal,
  CreateCrmDealRequest,
  createActivity,
  CreateCrmActivityRequest
} from '../../services/crm-service';
import { ActivityTimeline } from './ActivityTimeline';
import { ConvertContactDialog } from './ConvertContactDialog';
import { ManageRolesDialog } from './ManageRolesDialog';
import { TagManager } from './TagManager';
import { AddDealDialog } from './AddDealDialog';
import { ActivityForm } from './ActivityForm';

const { Title, Text } = Typography;

interface ContactDetailProps {
  tenantId: string;
  contactId: string;
}

export const ContactDetail: React.FC<ContactDetailProps> = ({ tenantId, contactId }) => {
  const { message } = App.useApp();

  const navigate = useNavigate();
  const [contact, setContact] = useState<CrmContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showManageRolesDialog, setShowManageRolesDialog] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showDealDialog, setShowDealDialog] = useState(false);
  const [dealLoading, setDealLoading] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [removingRoleId, setRemovingRoleId] = useState<string | null>(null);

  useEffect(() => {
    loadContact();
  }, [tenantId, contactId]);

  const handleConvert = async (roles: string[]) => {
    try {
      await convertContact(tenantId, contactId, roles);
      setShowConvertDialog(false);
      message.success('Contact converti avec succès');
      await loadContact();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la conversion du contact');
    }
  };

  const handleCreateDeal = async (data: CreateCrmDealRequest) => {
    setDealLoading(true);
    try {
      await createDeal(tenantId, data);
      setShowDealDialog(false);
      message.success('Affaire créée avec succès');
      await loadContact();
    } catch (err: any) {
      throw err;
    } finally {
      setDealLoading(false);
    }
  };

  const handleCreateActivity = async (data: CreateCrmActivityRequest) => {
    setActivityLoading(true);
    try {
      await createActivity(tenantId, data);
      setShowActivityForm(false);
      message.success('Activité créée avec succès');
      await loadContact();
    } catch (err: any) {
      throw err;
    } finally {
      setActivityLoading(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    setRemovingRoleId(roleId);
    try {
      await removeContactRole(tenantId, contactId, roleId);
      message.success('Rôle supprimé avec succès');
      await loadContact();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la suppression du rôle');
    } finally {
      setRemovingRoleId(null);
    }
  };

  const handleUpdateRoles = async (roles: string[]) => {
    try {
      await updateContactRoles(tenantId, contactId, roles);
      setShowManageRolesDialog(false);
      message.success('Rôles mis à jour avec succès');
      await loadContact();
    } catch (err: any) {
      throw err;
    }
  };

  const loadContact = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getContact(tenantId, contactId);
      if (response.success) {
        setContact(response.data);
      } else {
        setError('Erreur lors du chargement du contact');
      }
    } catch (err: any) {
      console.error('Error loading contact:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement du contact');
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string }> = {
      LEAD: { label: 'Prospect', color: 'blue' },
      ACTIVE_CLIENT: { label: 'Client actif', color: 'green' },
      ARCHIVED: { label: 'Archivé', color: 'default' }
    };
    const config = statusConfig[status] || statusConfig.ARCHIVED;
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getDealStageLabel = (stage: string): string => {
    const labels: Record<string, string> = {
      NEW: 'Nouveau',
      QUALIFIED: 'Qualifié',
      APPOINTMENT: 'Rendez-vous',
      VISIT: 'Visite',
      NEGOTIATION: 'Négociation',
      WON: 'Gagné',
      LOST: 'Perdu'
    };
    return labels[stage] || stage;
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Chargement du contact...</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Erreur"
        description={error}
        type="error"
        showIcon
        action={
          <Button size="small" onClick={loadContact}>
            Réessayer
          </Button>
        }
      />
    );
  }

  if (!contact) {
    return (
      <Empty description="Contact non trouvé" image={<UserOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />} />
    );
  }

  const displayName =
    contact.firstName || contact.lastName
      ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
      : contact.email || 'Contact sans nom';

  const hasActiveRoles = contact.roles && contact.roles.some((r: any) => r.active);
  const canConvert = contact.status === 'LEAD' || (contact.status === 'ACTIVE_CLIENT' && !hasActiveRoles);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 16
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Space>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${tenantId}/crm/contacts`)}>
                  Retour
                </Button>
                <div>
                  <Space align="center">
                    <Avatar size={64} icon={<UserOutlined />} />
                    <div>
                      <Title level={2} style={{ margin: 0 }}>
                        {displayName}
                      </Title>
                      {getStatusTag(contact.status)}
                    </div>
                  </Space>
                </div>
              </Space>
            </div>
            <Space>
              {canConvert && <Button onClick={() => setShowConvertDialog(true)}>Convertir</Button>}
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => navigate(`/tenant/${tenantId}/crm/contacts/${contactId}/edit`)}
              >
                Modifier
              </Button>
            </Space>
          </div>

          <Divider style={{ margin: '16px 0' }} />

          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item
              label={
                <Space>
                  <MailOutlined /> Email
                </Space>
              }
            >
              {contact.email || <Text type="secondary">Aucun email</Text>}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <Space>
                  <PhoneOutlined /> Téléphone
                </Space>
              }
            >
              {contact.phonePrimary || contact.phone || <Text type="secondary">Aucun téléphone</Text>}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <Space>
                  <MessageOutlined /> WhatsApp
                </Space>
              }
            >
              {contact.whatsappNumber || <Text type="secondary">Aucun numéro WhatsApp</Text>}
            </Descriptions.Item>
            {contact.source && (
              <Descriptions.Item
                label={
                  <Space>
                    <TagOutlined /> Source
                  </Space>
                }
              >
                {contact.source}
              </Descriptions.Item>
            )}
            {contact.lastInteractionAt && (
              <Descriptions.Item
                label={
                  <Space>
                    <CalendarOutlined /> Dernière interaction
                  </Space>
                }
              >
                {new Date(contact.lastInteractionAt).toLocaleDateString('fr-FR')}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Créé le">
              {new Date(contact.createdAt).toLocaleDateString('fr-FR')}
            </Descriptions.Item>
            <Descriptions.Item label="Modifié le">
              {new Date(contact.updatedAt).toLocaleDateString('fr-FR')}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>

      {/* Convert Dialog */}
      {showConvertDialog && contact && (
        <ConvertContactDialog
          contactName={displayName}
          onSubmit={handleConvert}
          onCancel={() => setShowConvertDialog(false)}
        />
      )}

      {/* Manage Roles Dialog */}
      {showManageRolesDialog && contact && (
        <ManageRolesDialog
          open={showManageRolesDialog}
          contactName={displayName}
          currentRoles={contact.roles?.filter((r: any) => r.active).map((r: any) => r.role) || []}
          onSubmit={handleUpdateRoles}
          onCancel={() => setShowManageRolesDialog(false)}
        />
      )}

      {/* Grid Layout - 2 columns */}
      <Row gutter={[16, 16]}>
        {/* Roles & Tags - Column 1 */}
        <Col xs={24} lg={12}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Roles */}
            <Card
              title={
                <Space>
                  <UserOutlined />
                  Rôles
                </Space>
              }
              extra={
                <Button type="link" icon={<PlusOutlined />} onClick={() => setShowManageRolesDialog(true)}>
                  Ajouter
                </Button>
              }
            >
              {contact.roles && contact.roles.length > 0 ? (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {contact.roles
                    .filter((role: any) => role.active)
                    .map((role: any) => (
                      <Card key={role.id} size="small" style={{ border: '1px solid #f0f0f0' }}>
                        <div className="it-toolbar">
                          <Space>
                            <Text strong>{role.role}</Text>
                            <Tag color="success" icon={<CheckCircleOutlined />}>
                              Actif
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {new Date(role.startedAt).toLocaleDateString('fr-FR')}
                            </Text>
                          </Space>
                          <Popconfirm
                            title="Supprimer ce rôle"
                            description="Êtes-vous sûr de vouloir supprimer ce rôle ?"
                            onConfirm={() => handleRemoveRole(role.id)}
                            okText="Oui"
                            cancelText="Non"
                          >
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              loading={removingRoleId === role.id}
                              size="small"
                            />
                          </Popconfirm>
                        </div>
                      </Card>
                    ))}
                  {contact.roles.filter((role: any) => role.active).length === 0 && (
                    <Empty description="Aucun rôle actif" image={false} style={{ padding: '24px 0' }} />
                  )}
                </Space>
              ) : (
                <Empty description="Aucun rôle assigné" image={false} style={{ padding: '24px 0' }} />
              )}
            </Card>

            {/* Tags */}
            <Card
              title={
                <Space>
                  <TagOutlined />
                  Groupes {contact.tags && contact.tags.length > 0 && `(${contact.tags.length})`}
                </Space>
              }
              extra={
                <Button type="link" icon={<PlusOutlined />} onClick={() => setShowTagManager(true)}>
                  Gérer
                </Button>
              }
            >
              {contact.tags && contact.tags.length > 0 ? (
                <Space wrap>
                  {contact.tags.map((tag: any) => (
                    <Tag key={tag.id} color={tag.color || '#1890ff'} icon={<TagOutlined />}>
                      {tag.name}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Empty description="Aucun groupe" image={false} style={{ padding: '24px 0' }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowTagManager(true)}>
                    Ajouter
                  </Button>
                </Empty>
              )}
            </Card>
          </Space>
        </Col>

        {/* Deals - Column 2 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ProjectOutlined />
                Affaires {contact.deals && contact.deals.length > 0 && `(${contact.deals.length})`}
              </Space>
            }
            extra={
              <Button type="link" icon={<PlusOutlined />} onClick={() => setShowDealDialog(true)}>
                Ajouter
              </Button>
            }
          >
            {contact.deals && contact.deals.length > 0 ? (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {contact.deals.map((deal: any) => (
                  <Card
                    key={deal.id}
                    size="small"
                    hoverable
                    onClick={() => navigate(`/tenant/${tenantId}/crm/deals/${deal.id}`)}
                    style={{ border: '1px solid #f0f0f0', cursor: 'pointer' }}
                  >
                    <div className="it-toolbar">
                      <Space>
                        <Text strong>{deal.type}</Text>
                        <Text type="secondary">- {getDealStageLabel(deal.stage)}</Text>
                      </Space>
                      {deal.budgetMax && (
                        <Text strong>{deal.budgetMax.toLocaleString('fr-FR', { style: 'decimal' })} FCFA</Text>
                      )}
                    </div>
                  </Card>
                ))}
              </Space>
            ) : (
              <Empty description="Aucune affaire associée" image={false} style={{ padding: '24px 0' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowDealDialog(true)}>
                  Créer
                </Button>
              </Empty>
            )}
          </Card>
        </Col>
      </Row>

      {/* Activities Timeline - Full Width */}
      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            Chronologie des activités
          </Space>
        }
        extra={
          <Button type="link" icon={<PlusOutlined />} onClick={() => setShowActivityForm(true)}>
            Ajouter
          </Button>
        }
      >
        {contact.recentActivities && contact.recentActivities.length > 0 ? (
          <ActivityTimeline activities={contact.recentActivities} tenantId={tenantId} contactId={contactId} />
        ) : (
          <Empty description="Aucune activité récente" image={false} style={{ padding: '24px 0' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowActivityForm(true)}>
              Créer
            </Button>
          </Empty>
        )}
      </Card>

      {/* Tag Manager Modal */}
      {showTagManager && contact && (
        <TagManager
          open={showTagManager}
          tenantId={tenantId}
          contactId={contactId}
          contactName={displayName}
          onClose={() => setShowTagManager(false)}
          onTagsUpdated={loadContact}
        />
      )}

      {/* Add Deal Dialog */}
      {showDealDialog && contact && (
        <AddDealDialog
          tenantId={tenantId}
          contactId={contactId}
          contactName={displayName}
          onSubmit={handleCreateDeal}
          onCancel={() => setShowDealDialog(false)}
          loading={dealLoading}
        />
      )}

      {/* Add Activity Modal */}
      <Modal
        title="Nouvelle activité"
        open={showActivityForm}
        onCancel={() => setShowActivityForm(false)}
        footer={null}
        width={800}
      >
        <ActivityForm
          tenantId={tenantId}
          contactId={contactId}
          onSubmit={handleCreateActivity}
          onCancel={() => setShowActivityForm(false)}
          loading={activityLoading}
        />
      </Modal>
    </Space>
  );
};
