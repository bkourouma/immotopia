import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  Typography,
  message,
  Spin
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../../components/dashboard/dashboard-layout';
import { FileUploader } from '../../../components/maintenance/FileUploader';
import { tenantMaintenanceService } from '../../../services/maintenance-service';
import {
  CreateTicketRequest,
  MaintenanceTicketCategory,
  MaintenanceTicketPriority
} from '../../../types/maintenance-types';
import { listProperties, Property } from '../../../services/property-service';
import { listLeases, RentalLease, RentalLeaseStatus } from '../../../services/rental-service';
import { useAuth } from '../../../hooks/useAuth';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

export const CreateTicket: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [leases, setLeases] = useState<RentalLease[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(undefined);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  useEffect(() => {
    if (effectiveTenantId) {
      loadProperties();
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    if (effectiveTenantId && selectedPropertyId) {
      loadLeases();
    } else {
      setLeases([]);
      form.setFieldsValue({ leaseId: undefined });
    }
  }, [effectiveTenantId, selectedPropertyId]);

  const loadProperties = async () => {
    if (!effectiveTenantId) return;

    try {
      const response = await listProperties(effectiveTenantId, { status: 'RENTED' });
      setProperties(response.properties);
    } catch (error) {
      console.error('Error loading properties:', error);
    }
  };

  const loadLeases = async () => {
    if (!effectiveTenantId || !selectedPropertyId) return;

    try {
      const response = await listLeases(effectiveTenantId, {
        propertyId: selectedPropertyId,
        status: RentalLeaseStatus.ACTIVE
      });
      const activeLeases = response.data || [];
      setLeases(activeLeases);
      
      // Auto-select lease if there's only one
      if (activeLeases.length === 1) {
        form.setFieldsValue({ leaseId: activeLeases[0].id });
      } else {
        form.setFieldsValue({ leaseId: undefined });
      }
    } catch (error) {
      console.error('Error loading leases:', error);
      setLeases([]);
    }
  };

  const handleSubmit = async (values: any) => {
    if (!effectiveTenantId) return;

    // Validate that property has active lease before submitting
    if (!values.propertyId) {
      message.error('Veuillez sélectionner une propriété');
      return;
    }

    // Check if there are active leases for the selected property
    if (leases.length === 0 && selectedPropertyId === values.propertyId) {
      message.error('Cette propriété n\'a pas de bail actif. Vous devez avoir un bail actif pour créer un ticket de maintenance.');
      return;
    }

    setLoading(true);
    try {
      const ticketData: CreateTicketRequest = {
        title: values.title,
        category: values.category,
        priority: values.priority,
        description: values.description,
        locationDetails: values.locationDetails,
        propertyId: values.propertyId,
        leaseId: values.leaseId || undefined // Send undefined if not provided, backend will find active lease
      };

      const response = await tenantMaintenanceService.createTicket(effectiveTenantId, ticketData);

      if (response.success && response.data) {
        const createdTicketId = response.data.id;

        // Upload files if any
        if (uploadedFiles.length > 0) {
          try {
            await Promise.all(
              uploadedFiles.map((file) =>
                tenantMaintenanceService.uploadAttachment(
                  effectiveTenantId,
                  createdTicketId,
                  file
                )
              )
            );
          } catch (uploadError) {
            console.error('Error uploading files:', uploadError);
            message.warning('Ticket créé mais certaines pièces jointes n\'ont pas pu être uploadées');
          }
        }

        message.success('Ticket créé avec succès');
        navigate(`/tenant/${effectiveTenantId}/maintenance/${createdTicketId}`);
      }
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      const errorMessage = error.response?.data?.message || 'Erreur lors de la création du ticket';
      
      // Provide more helpful error message for lease validation
      if (errorMessage.includes('Bail actif introuvable')) {
        message.error('Cette propriété n\'a pas de bail actif. Veuillez contacter votre gestionnaire pour activer un bail avant de créer un ticket de maintenance.');
      } else {
        message.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance`)}
          >
            Retour à la liste
          </Button>

          <Card>
            <Title level={2}>Créer un ticket de maintenance</Title>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              style={{ maxWidth: 800 }}
            >
              <Form.Item
                name="propertyId"
                label="Propriété"
                rules={[{ required: true, message: 'Veuillez sélectionner une propriété' }]}
              >
                <Select
                  placeholder="Sélectionner une propriété"
                  onChange={(value) => setSelectedPropertyId(value)}
                  showSearch
                  filterOption={(input, option) => {
                    const label = typeof option?.label === 'string'
                      ? option.label
                      : String(option?.children || '');
                    return label.toLowerCase().includes(input.toLowerCase());
                  }}
                  optionFilterProp="label"
                >
                  {properties.map((property) => {
                    const ownerLabel = property.owner?.fullName?.trim() || property.internalReference;
                    const label = property.containerParent
                      ? `${ownerLabel} - ${property.title} ( ${property.containerParent.title} )`
                      : `${ownerLabel} - ${property.title}`;
                    return (
                      <Option key={property.id} value={property.id} label={label}>
                        {label}
                      </Option>
                    );
                  })}
                </Select>
              </Form.Item>

              {leases.length > 0 && (
                <Form.Item
                  name="leaseId"
                  label={leases.length === 1 ? "Bail" : "Bail"}
                  tooltip={leases.length === 1 
                    ? "Le bail actif a été sélectionné automatiquement"
                    : "Sélectionnez le bail associé si vous en avez plusieurs pour cette propriété"}
                >
                  <Select 
                    placeholder={leases.length === 1 ? "Bail sélectionné automatiquement" : "Sélectionner un bail"} 
                    allowClear={leases.length > 1}
                    disabled={leases.length === 1}
                  >
                    {leases.map((lease) => (
                      <Option key={lease.id} value={lease.id}>
                        {lease.lease_number} - {lease.start_date.split('T')[0]}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              )}
              
              {selectedPropertyId && leases.length === 0 && (
                <Form.Item>
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#fff7e6', 
                    border: '1px solid #ffd591',
                    borderRadius: '4px',
                    color: '#d46b08'
                  }}>
                    ⚠️ Cette propriété n'a pas de bail actif. Vous devez avoir un bail actif pour créer un ticket de maintenance.
                  </div>
                </Form.Item>
              )}

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
                <TextArea
                  rows={6}
                  placeholder="Décrivez le problème en détail..."
                />
              </Form.Item>

              <Form.Item
                name="locationDetails"
                label="Détails de localisation (optionnel)"
                rules={[
                  { max: 500, message: 'Les détails ne peuvent pas dépasser 500 caractères' }
                ]}
              >
                <TextArea
                  rows={3}
                  placeholder="Ex: Salle de bain principale, sous l'évier"
                />
              </Form.Item>

              <Form.Item label="Pièces jointes (optionnel)">
                <FileUploader
                  onFilesChange={setUploadedFiles}
                  maxFiles={10}
                  maxSize={5}
                />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    loading={loading}
                  >
                    Créer le ticket
                  </Button>
                  <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance`)}>
                    Annuler
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Space>
      </div>
    </DashboardLayout>
  );
};
