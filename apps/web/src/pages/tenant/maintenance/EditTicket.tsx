import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Form, Input, Select, Button, Space, Typography, Spin, Alert } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { tenantMaintenanceService } from '../../../services/maintenance-service';
import {
  MaintenanceTicketCategory,
  MaintenanceTicketPriority,
  MaintenanceTicketStatus,
  TicketDetail
} from '../../../types/maintenance-types';
import { useAuth } from '../../../hooks/useAuth';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

export const EditTicket: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId, ticketId } = useParams<{ tenantId: string; ticketId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [loadingTicket, setLoadingTicket] = useState(true);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);

  useEffect(() => {
    if (effectiveTenantId && ticketId) {
      loadTicket();
    }
  }, [effectiveTenantId, ticketId]);

  const loadTicket = async () => {
    if (!effectiveTenantId || !ticketId) return;

    setLoadingTicket(true);
    try {
      const response = await tenantMaintenanceService.getTicket(effectiveTenantId, ticketId);
      if (response.success && response.data) {
        const ticketData = response.data;
        setTicket(ticketData);

        // Check if ticket can be edited
        if (ticketData.status !== MaintenanceTicketStatus.DECLARED) {
          message.warning('Seuls les tickets avec le statut "Déclaré" peuvent être modifiés');
          navigate(`/tenant/${effectiveTenantId}/maintenance/${ticketId}`);
          return;
        }

        // Populate form with ticket data
        form.setFieldsValue({
          title: ticketData.title,
          category: ticketData.category,
          priority: ticketData.priority,
          description: ticketData.description,
          locationDetails: ticketData.locationDetails || ''
        });
      }
    } catch (error: any) {
      console.error('Error loading ticket:', error);
      const errorMessage = error.response?.data?.message || 'Erreur lors du chargement du ticket';
      message.error(errorMessage);
      navigate(`/tenant/${effectiveTenantId}/maintenance`);
    } finally {
      setLoadingTicket(false);
    }
  };

  const handleSubmit = async (values: any) => {
    if (!effectiveTenantId || !ticketId) return;

    setLoading(true);
    try {
      const updateData: {
        title?: string;
        description?: string;
        category?: MaintenanceTicketCategory;
        priority?: MaintenanceTicketPriority;
        locationDetails?: string;
      } = {};

      // Only include fields that have changed
      if (values.title !== ticket?.title) {
        updateData.title = values.title;
      }
      if (values.description !== ticket?.description) {
        updateData.description = values.description;
      }
      if (values.category !== ticket?.category) {
        updateData.category = values.category;
      }
      if (values.priority !== ticket?.priority) {
        updateData.priority = values.priority;
      }
      if (values.locationDetails !== (ticket?.locationDetails || '')) {
        updateData.locationDetails = values.locationDetails || undefined;
      }

      // Check if there are any changes
      if (Object.keys(updateData).length === 0) {
        message.info('Aucune modification à apporter');
        return;
      }

      const response = await tenantMaintenanceService.updateTicket(effectiveTenantId, ticketId, updateData);

      if (response.success) {
        message.success('Ticket modifié avec succès');
        navigate(`/tenant/${effectiveTenantId}/maintenance/${ticketId}`);
      }
    } catch (error: any) {
      console.error('Error updating ticket:', error);
      const errorMessage = error.response?.data?.message || 'Erreur lors de la modification du ticket';

      if (errorMessage.includes('Déclaré')) {
        message.error('Seuls les tickets avec le statut "Déclaré" peuvent être modifiés');
      } else {
        message.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loadingTicket) {
    return (
      <>
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (!ticket) {
    return (
      <>
        <div style={{ padding: '24px' }}>
          <Alert
            message="Ticket introuvable"
            description="Le ticket demandé n'existe pas ou vous n'avez pas l'autorisation de le consulter."
            type="error"
            showIcon
            action={
              <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance`)}>Retour à la liste</Button>
            }
          />
        </div>
      </>
    );
  }

  if (ticket.status !== MaintenanceTicketStatus.DECLARED) {
    return (
      <>
        <div style={{ padding: '24px' }}>
          <Alert
            message="Modification impossible"
            description="Seuls les tickets avec le statut 'Déclaré' peuvent être modifiés."
            type="warning"
            showIcon
            action={
              <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance/${ticketId}`)}>
                Voir le ticket
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ padding: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance/${ticketId}`)}
          >
            Retour au ticket
          </Button>

          <Card>
            <Title level={2}>Modifier le ticket de maintenance</Title>

            <Alert
              message="Information"
              description="Vous pouvez modifier le titre, la description, la catégorie, la priorité et les détails de localisation. La propriété et le bail ne peuvent pas être modifiés."
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />

            <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ maxWidth: 800 }}>
              <Form.Item
                name="title"
                label="Titre"
                rules={[
                  { required: true, message: 'Veuillez saisir un titre' },
                  { min: 3, message: 'Le titre doit contenir au moins 3 caractères' },
                  { max: 200, message: 'Le titre ne peut pas dépasser 200 caractères' }
                ]}
              >
                <Input placeholder="Ex: Fuite d'eau dans la salle de bain" />
              </Form.Item>

              <Form.Item
                name="category"
                label="Catégorie"
                rules={[{ required: true, message: 'Veuillez sélectionner une catégorie' }]}
              >
                <Select placeholder="Sélectionner une catégorie">
                  <Option value={MaintenanceTicketCategory.PLUMBING}>Plomberie</Option>
                  <Option value={MaintenanceTicketCategory.ELECTRICITY}>Électricité</Option>
                  <Option value={MaintenanceTicketCategory.AC}>Climatisation</Option>
                  <Option value={MaintenanceTicketCategory.OTHER}>Autre</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="priority"
                label="Priorité"
                rules={[{ required: true, message: 'Veuillez sélectionner une priorité' }]}
              >
                <Select placeholder="Sélectionner une priorité">
                  <Option value={MaintenanceTicketPriority.LOW}>Faible</Option>
                  <Option value={MaintenanceTicketPriority.MEDIUM}>Moyenne</Option>
                  <Option value={MaintenanceTicketPriority.HIGH}>Élevée</Option>
                  <Option value={MaintenanceTicketPriority.URGENT}>Urgente</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="description"
                label="Description"
                rules={[
                  { required: true, message: 'Veuillez saisir une description' },
                  { min: 10, message: 'La description doit contenir au moins 10 caractères' },
                  { max: 5000, message: 'La description ne peut pas dépasser 5000 caractères' }
                ]}
              >
                <TextArea rows={6} placeholder="Décrivez le problème en détail..." />
              </Form.Item>

              <Form.Item
                name="locationDetails"
                label="Détails de localisation (optionnel)"
                rules={[{ max: 500, message: 'Les détails ne peuvent pas dépasser 500 caractères' }]}
              >
                <TextArea rows={3} placeholder="Ex: Salle de bain principale, sous l'évier" />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                    Enregistrer les modifications
                  </Button>
                  <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance/${ticketId}`)}>
                    Annuler
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Space>
      </div>
    </>
  );
};
