import { dealTypeLabel, dealStageLabel } from '../../utils/crm-labels';
import { formatMoney, PageHeader, StateBlock, SkeletonDetail, ConfirmAction } from '../primitives';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { contactDisplayName } from '../../utils/contact-display';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Button, Space, Typography, Tag, Empty, Row, Col, Descriptions, Modal } from 'antd';
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
  MessageOutlined,
  WhatsAppOutlined
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
import { t } from '../../i18n/t';
import { PortalEmailNotice } from './PortalEmailNotice';
import { useAgencyFeatures } from '../../hooks/useAgencyFeatures';
import { getContactRoleLabel } from '../../utils/crm-utils';
import { HelpSectionTitle } from '../../help';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

interface ContactDetailProps {
  tenantId: string;
  contactId: string;
}

export const ContactDetail: React.FC<ContactDetailProps> = ({ tenantId, contactId }) => {
  const { message } = App.useApp();

  const navigate = useNavigate();
  const { isDesktop } = useBreakpoint();
  // Affaires et activités relèvent de la fonctionnalité CRM, pas du socle.
  const { has: possede } = useAgencyFeatures(tenantId);
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
      message.success(t('Contact converti avec succès'));
      await loadContact();
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la conversion du contact'));
    }
  };

  const handleCreateDeal = async (data: CreateCrmDealRequest) => {
    setDealLoading(true);
    try {
      await createDeal(tenantId, data);
      setShowDealDialog(false);
      message.success(t('Affaire créée avec succès'));
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
      message.success(t('Activité créée avec succès'));
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
      message.success(t('Rôle supprimé avec succès'));
      await loadContact();
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la suppression du rôle'));
    } finally {
      setRemovingRoleId(null);
    }
  };

  const handleUpdateRoles = async (roles: string[]) => {
    try {
      await updateContactRoles(tenantId, contactId, roles);
      setShowManageRolesDialog(false);
      message.success(t('Rôles mis à jour avec succès'));
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
        setError(t('Erreur lors du chargement du contact'));
      }
    } catch (err: any) {
      console.error('Error loading contact:', err);
      setError(t('Impossible de charger ce contact. Vérifiez votre connexion puis réessayez.'));
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string }> = {
      LEAD: { label: t('Prospect'), color: 'blue' },
      ACTIVE_CLIENT: { label: t('Client actif'), color: 'green' },
      ARCHIVED: { label: t('Archivé'), color: 'default' }
    };
    const config = statusConfig[status] || statusConfig.ARCHIVED;
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getDealStageLabel = (stage: string): string => {
    if (stage === 'APPOINTMENT') return t('Rendez-vous');
    return dealStageLabel(stage);
  };

  if (loading && !contact) {
    return <SkeletonDetail aria-label={t('Chargement du contact')} />;
  }

  if (error) {
    return <StateBlock variant="error" description={error} onRetry={loadContact} />;
  }

  if (!contact) {
    return (
      <StateBlock
        variant="empty"
        title={t('Contact non trouvé')}
        description={t("Ce contact n'existe plus ou n'appartient pas à votre agence.")}
        actions={[
          {
            label: t('Retour aux contacts'),
            onClick: () => navigate(`/tenant/${tenantId}/crm/contacts`),
            primary: true
          }
        ]}
      />
    );
  }

  const displayName = contactDisplayName(contact);

  const phoneToCall = contact.phonePrimary || contact.phone || '';
  const whatsappDigits = (contact.whatsappNumber || '').replace(/\D/g, '');
  const hasActiveRoles = contact.roles && contact.roles.some((r: any) => r.active);
  const canConvert = contact.status === 'LEAD' || (contact.status === 'ACTIVE_CLIENT' && !hasActiveRoles);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* En-tête : nom, statut, action principale, puis gestes rapides (appeler, WhatsApp, e-mail) */}
      <PageHeader
        title={displayName}
        subtitle={getStatusTag(contact.status)}
        breadcrumbs={[{ label: t('Contacts'), to: `/tenant/${tenantId}/crm/contacts` }, { label: displayName }]}
        primaryAction={{
          label: t('Modifier'),
          icon: <EditOutlined />,
          onClick: () => navigate(`/tenant/${tenantId}/crm/contacts/${contactId}/edit`)
        }}
        secondaryActions={
          canConvert
            ? [{ key: 'convert', label: t('Convertir'), onClick: () => setShowConvertDialog(true) }]
            : undefined
        }
      />
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {(phoneToCall || whatsappDigits || contact.email) && (
            <Space
              wrap
              size="small"
              style={{ width: '100%' }}
              role="group"
              aria-label={t('Contacter {{nom}}', { nom: displayName })}
            >
              {phoneToCall && (
                <Button href={`tel:${phoneToCall}`} icon={<PhoneOutlined />} size={isDesktop ? 'middle' : 'large'}>
                  {t('Appeler')}
                </Button>
              )}
              {whatsappDigits && (
                <Button
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<WhatsAppOutlined />}
                  size={isDesktop ? 'middle' : 'large'}
                >
                  {'WhatsApp'}
                </Button>
              )}
              {contact.email && (
                <Button href={`mailto:${contact.email}`} icon={<MailOutlined />} size={isDesktop ? 'middle' : 'large'}>
                  {t('Envoyer un e-mail')}
                </Button>
              )}
            </Space>
          )}

          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item
              label={
                <Space>
                  <MailOutlined /> {t('Email')}
                </Space>
              }
            >
              {contact.email || <Text type="secondary">{t('Aucun email')}</Text>}
              {contact.portalAccountEmailNotice && (
                <div>
                  <PortalEmailNotice notice={contact.portalAccountEmailNotice} />
                </div>
              )}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <Space>
                  <PhoneOutlined /> {t('Téléphone')}
                </Space>
              }
            >
              {contact.phonePrimary || contact.phone || <Text type="secondary">{t('Aucun téléphone')}</Text>}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <Space>
                  <MessageOutlined /> {'WhatsApp'}
                </Space>
              }
            >
              {contact.whatsappNumber || <Text type="secondary">{t('Aucun numéro WhatsApp')}</Text>}
            </Descriptions.Item>
            {contact.source && (
              <Descriptions.Item
                label={
                  <Space>
                    <TagOutlined /> {t('Source')}
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
                    <CalendarOutlined /> {t('Dernière interaction')}
                  </Space>
                }
              >
                {new Date(contact.lastInteractionAt).toLocaleDateString(activeLocale())}
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('Créé le')}>
              {new Date(contact.createdAt).toLocaleDateString(activeLocale())}
            </Descriptions.Item>
            <Descriptions.Item label={t('Modifié le')}>
              {new Date(contact.updatedAt).toLocaleDateString(activeLocale())}
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
                  <HelpSectionTitle title={t('Rôles')} helpId="commercial.contacts.detail.roles" />
                </Space>
              }
              extra={
                <Button type="link" icon={<PlusOutlined />} onClick={() => setShowManageRolesDialog(true)}>
                  {t('Ajouter')}
                </Button>
              }
            >
              {contact.roles && contact.roles.length > 0 ? (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {contact.roles
                    .filter((role: any) => role.active)
                    .map((role: any) => (
                      <Card key={role.id} size="small" style={{ border: '1px solid var(--border-subtle)' }}>
                        <div className="it-toolbar">
                          <Space wrap>
                            <Text strong>{getContactRoleLabel(role.role)}</Text>
                            <Tag color="success" icon={<CheckCircleOutlined />}>
                              {t('Actif')}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {new Date(role.startedAt).toLocaleDateString(activeLocale())}
                            </Text>
                          </Space>
                          <ConfirmAction
                            title={t('Retirer le rôle {{role}} de {{nom}} ?', {
                              role: getContactRoleLabel(role.role),
                              nom: displayName
                            })}
                            description={t('Le contact ne sera plus associé à ce rôle.')}
                            okText={t('Retirer')}
                            danger
                            onConfirm={() => handleRemoveRole(role.id)}
                          >
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              loading={removingRoleId === role.id}
                              aria-label={t('Retirer le rôle {{role}}', { role: getContactRoleLabel(role.role) })}
                              style={{ minWidth: 44, minHeight: isDesktop ? undefined : 44 }}
                            />
                          </ConfirmAction>
                        </div>
                      </Card>
                    ))}
                  {contact.roles.filter((role: any) => role.active).length === 0 && (
                    <Empty description={t('Aucun rôle actif')} image={false} style={{ padding: '24px 0' }} />
                  )}
                </Space>
              ) : (
                <Empty description={t('Aucun rôle assigné')} image={false} style={{ padding: '24px 0' }} />
              )}
            </Card>

            {/* Tags */}
            <Card
              title={
                <Space>
                  <TagOutlined />
                  <HelpSectionTitle
                    title={`${t('Tags')}${contact.tags && contact.tags.length > 0 ? ` (${contact.tags.length})` : ''}`}
                    helpId="commercial.contacts.detail.tags"
                  />
                </Space>
              }
              extra={
                <Button type="link" icon={<PlusOutlined />} onClick={() => setShowTagManager(true)}>
                  {t('Gérer')}
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
                <Empty description={t('Aucun tag')} image={false} style={{ padding: '24px 0' }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowTagManager(true)}>
                    {t('Ajouter')}
                  </Button>
                </Empty>
              )}
            </Card>
          </Space>
        </Col>

        {/* Deals - Column 2 */}
        {possede('CRM') && (
          <Col xs={24} lg={12}>
            <Card
              title={
                <Space>
                  <ProjectOutlined />
                  <HelpSectionTitle
                    title={`${t('Affaires')}${contact.deals && contact.deals.length > 0 ? ` (${contact.deals.length})` : ''}`}
                    helpId="commercial.contacts.detail.affaires"
                  />
                </Space>
              }
              extra={
                <Button type="link" icon={<PlusOutlined />} onClick={() => setShowDealDialog(true)}>
                  {t('Ajouter')}
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
                      style={{ border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                    >
                      <div className="it-toolbar">
                        <Space>
                          <Text strong>{dealTypeLabel(deal.type)}</Text>
                          <Text type="secondary">- {getDealStageLabel(deal.stage)}</Text>
                        </Space>
                        {deal.budgetMax && <Text strong>{formatMoney(deal.budgetMax)}</Text>}
                      </div>
                    </Card>
                  ))}
                </Space>
              ) : (
                <Empty description={t('Aucune affaire associée')} image={false} style={{ padding: '24px 0' }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowDealDialog(true)}>
                    {t('Créer')}
                  </Button>
                </Empty>
              )}
            </Card>
          </Col>
        )}
      </Row>

      {/* Activities Timeline - Full Width */}
      {possede('CRM') && (
        <Card
          title={
            <Space>
              <ThunderboltOutlined />
              <HelpSectionTitle title={t('Chronologie des activités')} helpId="commercial.contacts.detail.activites" />
            </Space>
          }
          extra={
            <Button type="link" icon={<PlusOutlined />} onClick={() => setShowActivityForm(true)}>
              {t('Ajouter')}
            </Button>
          }
        >
          {contact.recentActivities && contact.recentActivities.length > 0 ? (
            <ActivityTimeline activities={contact.recentActivities} tenantId={tenantId} contactId={contactId} />
          ) : (
            <Empty description={t('Aucune activité récente')} image={false} style={{ padding: '24px 0' }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowActivityForm(true)}>
                {t('Créer')}
              </Button>
            </Empty>
          )}
        </Card>
      )}

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
        title={t('Nouvelle activité')}
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
