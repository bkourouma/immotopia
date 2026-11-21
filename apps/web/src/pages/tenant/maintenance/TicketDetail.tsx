import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Typography, Space, Button, Divider, Input } from 'antd';
import { ArrowLeftOutlined, PaperClipOutlined, SendOutlined } from '@ant-design/icons';
import { TicketStatusBadge } from '../../../components/maintenance/TicketStatusBadge';
import { TicketTimeline } from '../../../components/maintenance/TicketTimeline';
import { CommentThread } from '../../../components/maintenance/CommentThread';
import { AttachmentList } from '../../../components/maintenance/AttachmentList';
import { FileUploader } from '../../../components/maintenance/FileUploader';
import { tenantMaintenanceService } from '../../../services/maintenance-service';
import { TicketDetail as TicketDetailType, MaintenanceTicketStatus } from '../../../types/maintenance-types';
import { useAuth } from '../../../hooks/useAuth';
import { formatTicketDate } from '../../../utils/date-utils';
import { ConfirmAction, PageHeader, SkeletonDetail, StateBlock } from '../../../components/primitives';
import { t } from '../../../i18n/t';
import { HelpSectionTitle } from '../../../help';
import { localizedRecord } from '../../../i18n/localized';

const { Title, Text, Paragraph } = Typography;

/** Nombre maximum de pièces jointes par ticket (règle de l'API : `validateFileUpload`). */
const MAX_ATTACHMENTS = 10;
const { TextArea } = Input;

const categoryLabels: Record<string, string> = localizedRecord(() => ({
  PLUMBING: 'Plomberie',
  ELECTRICITY: t('Électricité'),
  AC: 'Climatisation',
  OTHER: 'Autre'
}));

const priorityLabels: Record<string, string> = localizedRecord(() => ({
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: t('Élevée'),
  URGENT: 'Urgente'
}));

export const TicketDetail: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId, ticketId } = useParams<{ tenantId: string; ticketId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [ticket, setTicket] = useState<TicketDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [canceling, setCanceling] = useState(false);
  // Pièces à ajouter après coup : l'écran de création annonce « vous pouvez la rajouter
  // depuis le ticket », mais aucun écran ne permettait de le faire.
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (effectiveTenantId && ticketId) {
      loadTicket();
    }
  }, [effectiveTenantId, ticketId]);

  const loadTicket = async () => {
    if (!effectiveTenantId || !ticketId) return;

    setLoading(true);
    setLoadError(false);
    try {
      const response = await tenantMaintenanceService.getTicket(effectiveTenantId, ticketId);
      if (response.success) {
        setTicket(response.data);
      }
    } catch (error) {
      console.error('Error loading ticket:', error);
      setLoadError(true);
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

  const handleUploadFiles = async () => {
    if (!effectiveTenantId || !ticketId || newFiles.length === 0 || uploading) return;

    setUploading(true);
    try {
      const results = await Promise.allSettled(
        newFiles.map(file => tenantMaintenanceService.uploadAttachment(effectiveTenantId, ticketId, file))
      );
      const failed = newFiles.filter((_, index) => results[index].status === 'rejected');
      if (failed.length > 0) {
        message.warning({
          content: t("Certaines pièces jointes n'ont pas pu être envoyées : {{files}}.", {
            files: failed.map(file => file.name).join(', ')
          }),
          duration: 10
        });
      } else {
        message.success(t('Pièces jointes ajoutées'));
      }
      // Les fichiers envoyés ne restent pas dans la sélection : seuls les échecs peuvent être renvoyés.
      setNewFiles([]);
      setUploaderKey(key => key + 1);
      await loadTicket();
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <SkeletonDetail aria-label={t('Chargement du ticket')} />
      </div>
    );
  }

  if (loadError || !ticket) {
    return (
      <div style={{ padding: '24px' }}>
        <StateBlock
          variant={loadError ? 'error' : 'empty'}
          title={loadError ? undefined : t('Ticket introuvable')}
          description={loadError ? undefined : t("Ce ticket n'existe plus ou n'est pas accessible.")}
          actions={[
            ...(loadError ? [{ label: t('Réessayer'), onClick: loadTicket, primary: true }] : []),
            { label: t('Retour à la liste'), onClick: () => navigate(`/tenant/${effectiveTenantId}/maintenance`) }
          ]}
        />
      </div>
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
              <PageHeader
                title={ticket.title}
                subtitle={`${t('Créé le')} ${formattedCreatedDate}`}
                extra={
                  <HelpSectionTitle
                    title={<TicketStatusBadge status={ticket.status} />}
                    helpId="commercial.maintenance.detail.statut"
                  />
                }
              />

              <div>
                <Text strong>{t('Catégorie:')} </Text>
                <Text>{categoryLabels[ticket.category] || ticket.category}</Text>
                <Text strong style={{ marginInlineStart: 16 }}>
                  {t('Priorité:')}{' '}
                </Text>
                <Text>{priorityLabels[ticket.priority] || ticket.priority}</Text>
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
                <ConfirmAction
                  title={t('Annuler le ticket « {{title}} » ?', { title: ticket.title })}
                  description={t('Le ticket passera au statut Annulé.')}
                  okText={t('Oui, annuler le ticket')}
                  cancelText={t('Non, le garder')}
                  danger
                  onConfirm={handleCancelTicket}
                >
                  <Button danger loading={canceling}>
                    {t('Annuler le ticket')}
                  </Button>
                </ConfirmAction>
              )}

              <Divider />

              <div>
                <Title level={5}>
                  <HelpSectionTitle
                    title={t('Historique des statuts')}
                    helpId="commercial.maintenance.detail.historique"
                  />
                </Title>
                <TicketTimeline statusHistory={ticket.statusHistory || []} />
              </div>

              <Divider />

              <div>
                <Title level={5}>
                  <HelpSectionTitle title={t('Pièces jointes')} helpId="commercial.maintenance.detail.pieces-jointes" />
                </Title>
                {effectiveTenantId && (
                  <AttachmentList
                    attachments={ticket.attachments || []}
                    source={{ kind: 'agency', tenantId: effectiveTenantId }}
                  />
                )}

                {ticket.status !== MaintenanceTicketStatus.CANCELED &&
                  (MAX_ATTACHMENTS - (ticket.attachments || []).length > 0 ? (
                    <div style={{ marginTop: 16 }}>
                      <FileUploader
                        key={uploaderKey}
                        onFilesChange={setNewFiles}
                        maxFiles={MAX_ATTACHMENTS - (ticket.attachments || []).length}
                        maxSize={5}
                      />
                      <Button
                        icon={<PaperClipOutlined />}
                        style={{ marginTop: 8 }}
                        onClick={handleUploadFiles}
                        loading={uploading}
                        disabled={newFiles.length === 0}
                      >
                        {t('Ajouter les pièces jointes')}
                      </Button>
                    </div>
                  ) : (
                    <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                      {t('Nombre maximum de pièces jointes atteint pour ce ticket.')}
                    </Text>
                  ))}
              </div>

              <Divider />

              <div>
                <Title level={5}>
                  <HelpSectionTitle title={t('Commentaires')} helpId="commercial.maintenance.detail.commentaires" />
                </Title>
                <CommentThread comments={ticket.comments || []} />

                <div style={{ marginTop: 16 }}>
                  <TextArea
                    rows={4}
                    placeholder={t('Ajouter un commentaire...')}
                    aria-label={t('Ajouter un commentaire')}
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
