import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Typography, Space, Button, Spin, Divider, Input, Select, Form } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import { TicketStatusBadge } from '../../../components/maintenance/TicketStatusBadge';
import { TicketTimeline } from '../../../components/maintenance/TicketTimeline';
import { CommentThread } from '../../../components/maintenance/CommentThread';
import { AttachmentList } from '../../../components/maintenance/AttachmentList';
import { VendorSelect } from '../../../components/maintenance/VendorSelect';
import { managerMaintenanceService } from '../../../services/maintenance-service';
import {
  TicketDetail as TicketDetailType,
  MaintenanceTicketStatus,
  MaintenanceTicketPriority
} from '../../../types/maintenance-types';
import { useAuth } from '../../../hooks/useAuth';
import { formatTicketDate } from '../../../utils/date-utils';
import { t } from '../../../i18n/t';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const categoryLabels: Record<string, string> = {
  PLUMBING: 'Plomberie',
  ELECTRICITY: t('Électricité'),
  AC: 'Climatisation',
  OTHER: 'Autre'
};

const priorityLabels: Record<string, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: t('Élevée'),
  URGENT: 'Urgente'
};

const statusLabels: Record<MaintenanceTicketStatus, string> = {
  [MaintenanceTicketStatus.DECLARED]: t('Déclaré'),
  [MaintenanceTicketStatus.IN_PROGRESS]: t('En cours'),
  [MaintenanceTicketStatus.ASSIGNED]: t('Assigné'),
  [MaintenanceTicketStatus.RESOLVED]: t('Résolu'),
  [MaintenanceTicketStatus.CANCELED]: t('Annulé')
};

/**
 * Etapes atteignables depuis l'etape courante.
 *
 * Le serveur refuse les autres (`validateStatusTransition`, cote API). Tant que
 * cette liste n'etait pas reprise ici, le selecteur proposait les cinq etapes :
 * un gestionnaire pouvait choisir « Assigne » depuis « Declare », voir l'ecran
 * afficher son choix, et n'apprendre qu'au rechargement que rien n'avait ete
 * enregistre. Le refus existait, il arrivait trop tard.
 *
 * La liste inclut toujours l'etape courante, sans quoi le formulaire afficherait
 * un champ vide a l'ouverture.
 */
const NEXT_STATUSES: Record<MaintenanceTicketStatus, MaintenanceTicketStatus[]> = {
  [MaintenanceTicketStatus.DECLARED]: [MaintenanceTicketStatus.IN_PROGRESS, MaintenanceTicketStatus.CANCELED],
  [MaintenanceTicketStatus.IN_PROGRESS]: [MaintenanceTicketStatus.ASSIGNED, MaintenanceTicketStatus.CANCELED],
  [MaintenanceTicketStatus.ASSIGNED]: [MaintenanceTicketStatus.RESOLVED],
  [MaintenanceTicketStatus.RESOLVED]: [],
  [MaintenanceTicketStatus.CANCELED]: []
};

export const TicketDetail: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId, ticketId } = useParams<{ tenantId: string; ticketId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [form] = Form.useForm();
  const [ticket, setTicket] = useState<TicketDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    if (effectiveTenantId && ticketId) {
      loadTicket();
    }
  }, [effectiveTenantId, ticketId]);

  const loadTicket = async () => {
    if (!effectiveTenantId || !ticketId) return;

    setLoading(true);
    try {
      const response = await managerMaintenanceService.getTicket(effectiveTenantId, ticketId);
      if (response.success) {
        setTicket(response.data);
        form.setFieldsValue({
          status: response.data.status,
          priority: response.data.priority,
          assignedVendorId: response.data.assignedVendorId,
          resolutionNotes: response.data.resolutionNotes
        });
      }
    } catch (error) {
      console.error('Error loading ticket:', error);
      message.error(t('Erreur lors du chargement du ticket'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    if (!effectiveTenantId || !ticketId) return;

    setSaving(true);
    try {
      await managerMaintenanceService.updateTicket(effectiveTenantId, ticketId, {
        status: values.status,
        priority: values.priority,
        assignedVendorId: values.assignedVendorId,
        resolutionNotes: values.resolutionNotes
      });
      message.success(t('Ticket mis à jour avec succès'));
      await loadTicket();
    } catch (error: any) {
      message.error(error.response?.data?.message || t('Erreur lors de la mise à jour du ticket'));
      // Le serveur a refuse : l'ecran doit revenir a ce qui est reellement
      // enregistre. Sans ce rechargement, le formulaire continuait d'afficher
      // le statut et le prestataire choisis — un gestionnaire pouvait quitter
      // la page en croyant l'intervention planifiee alors que rien n'avait ete
      // ecrit.
      await loadTicket();
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!effectiveTenantId || !ticketId || !commentContent.trim()) return;

    setSubmittingComment(true);
    try {
      await managerMaintenanceService.addComment(effectiveTenantId, ticketId, commentContent);
      setCommentContent('');
      message.success(t('Commentaire ajouté'));
      await loadTicket();
    } catch (error: any) {
      message.error(error.response?.data?.message || t("Erreur lors de l'ajout du commentaire"));
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <>
        <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: '50px' }} />
      </>
    );
  }

  if (!ticket) {
    return (
      <>
        <Card>
          <Text>{t('Ticket introuvable')}</Text>
        </Card>
      </>
    );
  }

  const formattedCreatedDate = formatTicketDate(ticket.createdAt);

  return (
    <>
      <div style={{ padding: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/tenant/${effectiveTenantId}/admin/maintenance/tickets`)}
          >
            {t('Retour à la liste')}
          </Button>

          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div className="it-toolbar it-toolbar--start">
                <div>
                  <Title level={3} style={{ margin: 0 }}>
                    {ticket.title}
                  </Title>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    {t('Créé le')} {formattedCreatedDate}
                  </Text>
                </div>
                <TicketStatusBadge status={ticket.status} />
              </div>

              <Divider />

              <Form form={form} layout="vertical" onFinish={handleSave}>
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <div>
                    <Title level={5}>{t('Informations')}</Title>
                    <Space direction="vertical" size="small">
                      <div>
                        <Text strong>{t('Catégorie:')} </Text>
                        <Text>{categoryLabels[ticket.category] || ticket.category}</Text>
                      </div>
                      {ticket.property && (
                        <div>
                          <Text strong>{t('Propriété:')} </Text>
                          <Text>{ticket.property.address}</Text>
                        </div>
                      )}
                      {ticket.tenantContact && (
                        <div>
                          <Text strong>Locataire: </Text>
                          <Text>
                            {ticket.tenantContact.firstName} {ticket.tenantContact.lastName}
                          </Text>
                        </div>
                      )}
                      {ticket.assignedVendor && (
                        <div>
                          <Text strong>{t('Prestataire assigné:')} </Text>
                          <Text>{ticket.assignedVendor.name}</Text>
                          {ticket.assignedVendor.phone && (
                            <Text type="secondary" style={{ marginInlineStart: 8 }}>
                              ({ticket.assignedVendor.phone})
                            </Text>
                          )}
                        </div>
                      )}
                    </Space>
                  </div>

                  <Form.Item
                    name="status"
                    label={t('Statut')}
                    extra={
                      NEXT_STATUSES[ticket.status].length === 0
                        ? t('Ce ticket est arrivé au bout de son parcours : son statut ne change plus.')
                        : undefined
                    }
                  >
                    <Select showSearch optionFilterProp="children" disabled={NEXT_STATUSES[ticket.status].length === 0}>
                      {[ticket.status, ...NEXT_STATUSES[ticket.status]].map(statut => (
                        <Option key={statut} value={statut}>
                          {statusLabels[statut]}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item name="priority" label={t('Priorité')}>
                    <Select showSearch optionFilterProp="children">
                      <Option value={MaintenanceTicketPriority.LOW}>{t('Faible')}</Option>
                      <Option value={MaintenanceTicketPriority.MEDIUM}>{t('Moyenne')}</Option>
                      <Option value={MaintenanceTicketPriority.HIGH}>{t('Élevée')}</Option>
                      <Option value={MaintenanceTicketPriority.URGENT}>{t('Urgente')}</Option>
                    </Select>
                  </Form.Item>

                  <Form.Item name="assignedVendorId" label={t('Prestataire assigné')}>
                    <VendorSelect tenantId={effectiveTenantId || ''} />
                  </Form.Item>

                  <Form.Item name="resolutionNotes" label={t('Notes de résolution')}>
                    <TextArea rows={4} placeholder={t('Ajouter des notes de résolution...')} />
                  </Form.Item>

                  <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                      {t('Enregistrer les modifications')}
                    </Button>
                  </Form.Item>
                </Space>
              </Form>

              <Divider />

              <div>
                <Title level={5}>{t('Description')}</Title>
                <Paragraph>{ticket.description}</Paragraph>
              </div>

              {ticket.locationDetails && (
                <div>
                  <Title level={5}>{t('Détails de localisation')}</Title>
                  <Paragraph>{ticket.locationDetails}</Paragraph>
                </div>
              )}

              <Divider />

              <div>
                <Title level={5}>{t('Historique des statuts')}</Title>
                <TicketTimeline statusHistory={ticket.statusHistory || []} />
              </div>

              <Divider />

              <div>
                <Title level={5}>{t('Pièces jointes')}</Title>
                {effectiveTenantId && (
                  <AttachmentList attachments={ticket.attachments || []} tenantId={effectiveTenantId} />
                )}
              </div>

              <Divider />

              <div>
                <Title level={5}>{t('Commentaires')}</Title>
                <CommentThread comments={ticket.comments || []} />

                <div style={{ marginTop: 16 }}>
                  <TextArea
                    rows={4}
                    placeholder={t('Ajouter un commentaire...')}
                    value={commentContent}
                    onChange={e => setCommentContent(e.target.value)}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    style={{ marginTop: 8 }}
                    onClick={handleAddComment}
                    loading={submittingComment}
                    disabled={!commentContent.trim()}
                  >
                    {t('Envoyer')}
                  </Button>
                </div>
              </div>
            </Space>
          </Card>
        </Space>
      </div>
    </>
  );
};
