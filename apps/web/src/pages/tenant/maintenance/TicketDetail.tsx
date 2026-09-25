import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Typography, Space, Button, Spin, Divider, Input, Popconfirm } from 'antd';
import { ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import { TicketStatusBadge } from '../../../components/maintenance/TicketStatusBadge';
import { TicketTimeline } from '../../../components/maintenance/TicketTimeline';
import { CommentThread } from '../../../components/maintenance/CommentThread';
import { AttachmentList } from '../../../components/maintenance/AttachmentList';
import { tenantMaintenanceService } from '../../../services/maintenance-service';
import { TicketDetail as TicketDetailType, MaintenanceTicketStatus } from '../../../types/maintenance-types';
import { useAuth } from '../../../hooks/useAuth';
import { formatTicketDate } from '../../../utils/date-utils';
import { t } from '../../../i18n/t';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

function categoryLabels(): Record<string, string> {
  return {
    PLUMBING: t('Plomberie'),
    ELECTRICITY: t('Électricité'),
    AC: t('Climatisation'),
    OTHER: t('Autre')
  };
}

function priorityLabels(): Record<string, string> {
  return {
    LOW: t('Faible'),
    MEDIUM: t('Moyenne'),
    HIGH: t('Élevée'),
    URGENT: t('Urgente')
  };
}

export const TicketDetail: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId, ticketId } = useParams<{ tenantId: string; ticketId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [ticket, setTicket] = useState<TicketDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentContent, setCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (effectiveTenantId && ticketId) {
      loadTicket();
    }
  }, [effectiveTenantId, ticketId]);

  const loadTicket = async () => {
    if (!effectiveTenantId || !ticketId) return;

    setLoading(true);
    try {
      const response = await tenantMaintenanceService.getTicket(effectiveTenantId, ticketId);
      if (response.success) {
        setTicket(response.data);
      }
    } catch (error) {
      console.error('Error loading ticket:', error);
      message.error(t('Erreur lors du chargement du ticket'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!effectiveTenantId || !ticketId || !commentContent.trim()) return;

    setSubmittingComment(true);
    try {
      // Use tenantContactId from ticket if available, otherwise undefined
      // The backend will try to get it from user context if not provided
      await tenantMaintenanceService.addComment(effectiveTenantId, ticketId, commentContent, ticket?.tenantContactId);
      setCommentContent('');
      message.success(t('Commentaire ajouté'));
      await loadTicket(); // Reload to get updated comments
    } catch (error: any) {
      message.error(error.response?.data?.message || t("Erreur lors de l'ajout du commentaire"));
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCancelTicket = async () => {
    if (!effectiveTenantId || !ticketId) return;

    setCanceling(true);
    try {
      await tenantMaintenanceService.cancelTicket(effectiveTenantId, ticketId);
      message.success(t('Ticket annulé'));
      await loadTicket(); // Reload to get updated status
    } catch (error: any) {
      message.error(error.response?.data?.message || t("Erreur lors de l'annulation du ticket"));
    } finally {
      setCanceling(false);
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
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance`)}>
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

              <div>
                <Text strong>{t('Catégorie:')} </Text>
                <Text>{categoryLabels()[ticket.category] || ticket.category}</Text>
                <Text strong style={{ marginInlineStart: 16 }}>
                  {t('Priorité:')}{' '}
                </Text>
                <Text>{priorityLabels()[ticket.priority] || ticket.priority}</Text>
              </div>

              {ticket.property && (
                <div>
                  <Text strong>{t('Propriété:')} </Text>
                  <Text>{ticket.property.address}</Text>
                </div>
              )}

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

              {ticket.status === MaintenanceTicketStatus.DECLARED && (
                <Popconfirm
                  title={t('Êtes-vous sûr de vouloir annuler ce ticket ?')}
                  onConfirm={handleCancelTicket}
                  okText={t('Oui')}
                  cancelText={t('Non')}
                >
                  <Button danger loading={canceling}>
                    {t('Annuler le ticket')}
                  </Button>
                </Popconfirm>
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
