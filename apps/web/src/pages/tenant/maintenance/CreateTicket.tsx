import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Form, Input, Select, Button, Space, Typography, Spin } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { FileUploader } from '../../../components/maintenance/FileUploader';
import { tenantMaintenanceService } from '../../../services/maintenance-service';
import {
  CreateTicketRequest,
  MaintenanceTicketCategory,
  MaintenanceTicketPriority
} from '../../../types/maintenance-types';
import { listProperties, Property } from '../../../services/property-service';
import { useAuth } from '../../../hooks/useAuth';
import { onAntFormValidationFailed } from '../../../lib/antFormFailure';
import { t } from '../../../i18n/t';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

export const CreateTicket: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  // Bien choisi : son libellé reste affiché même quand une recherche ne le renvoie plus.
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearch = useRef(0);

  // Recherche distante (20 biens au plus) : plus de liste de 100 biens chargée d'avance.
  const loadProperties = useCallback(
    async (q?: string) => {
      if (!effectiveTenantId) return;
      const request = ++latestSearch.current;
      setPropertiesLoading(true);
      try {
        const response = await listProperties(effectiveTenantId, { q: q?.trim() || undefined, limit: 20 });
        if (request === latestSearch.current) setProperties(response.properties);
      } catch (error) {
        console.error('Error loading properties:', error);
      } finally {
        if (request === latestSearch.current) setPropertiesLoading(false);
      }
    },
    [effectiveTenantId]
  );

  useEffect(() => {
    void loadProperties();
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      latestSearch.current += 1;
    };
  }, [loadProperties]);

  const handlePropertySearch = (input: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void loadProperties(input), 300);
  };

  const propertyLabel = (property: Property): string => {
    const ownerLabel = property.owner?.fullName?.trim() || property.internalReference;
    return property.containerParent
      ? `${ownerLabel} - ${property.title} ( ${property.containerParent.title} )`
      : `${ownerLabel} - ${property.title}`;
  };

  // Le bien déjà choisi reste dans les options, même hors des 20 résultats courants.
  const propertyOptions = (() => {
    const options = properties.map(property => ({ value: property.id, label: propertyLabel(property) }));
    if (selectedProperty && !options.some(option => option.value === selectedProperty.id)) {
      options.unshift({ value: selectedProperty.id, label: propertyLabel(selectedProperty) });
    }
    return options;
  })();

  const handleSubmit = async (values: any) => {
    if (!effectiveTenantId) return;

    if (!values.propertyId) {
      message.error(t('Veuillez sélectionner une propriété'));
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
        propertyId: values.propertyId
      };

      const response = await tenantMaintenanceService.createTicket(effectiveTenantId, ticketData);

      if (response.success && response.data) {
        const createdTicketId = response.data.id;

        /**
         * Envoi des pièces jointes, une requête par fichier (§8.4, « 1+N »).
         *
         * Le §8.4 demande un POST multipart unique, comme le fait déjà le
         * portail locataire. Ce n'est pas faisable ici sans changer le format
         * de requête de `POST …/maintenance/tenant/tickets`, qui est
         * aujourd'hui en JSON : les pièces jointes ont leur propre endpoint,
         * un fichier à la fois. Modifier ce contrat sort du périmètre.
         *
         * Ce qui est corrigé, c'est le symptôme que le §8.4 nomme :
         * « état incohérent si échec ». `Promise.all` abandonnait au premier
         * rejet — les fichiers suivants n'étaient même pas tentés —, et
         * l'utilisateur recevait « certaines pièces jointes » sans savoir
         * lesquelles, ni qu'il devait les rajouter.
         *
         * `allSettled` tente tous les fichiers, et le message nomme ceux qui
         * ont échoué.
         */
        if (uploadedFiles.length > 0) {
          const resultats = await Promise.allSettled(
            uploadedFiles.map(file =>
              tenantMaintenanceService.uploadAttachment(effectiveTenantId, createdTicketId, file)
            )
          );

          const echoues = uploadedFiles.filter((_, index) => resultats[index].status === 'rejected');

          if (echoues.length > 0) {
            message.warning({
              content: t(
                "Ticket créé. {{length}} pièce{{value}} jointe{{value2}} n'a pas pu être envoyée : {{value3}}. Vous pouvez la rajouter depuis le ticket.",
                {
                  length: echoues.length,
                  value: echoues.length > 1 ? 's' : '',
                  value2: echoues.length > 1 ? 's' : '',
                  value3: echoues.map(f => f.name).join(', ')
                }
              ),
              // Le message nomme des fichiers : il doit rester lisible le temps
              // de les retrouver.
              duration: 10
            });
            navigate(`/tenant/${effectiveTenantId}/maintenance/${createdTicketId}`);
            return;
          }
        }

        message.success(t('Ticket créé avec succès'));
        navigate(`/tenant/${effectiveTenantId}/maintenance/${createdTicketId}`);
      }
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      const errorMessage = error.response?.data?.message || t('Erreur lors de la création du ticket');

      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ padding: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance`)}>
            {t('Retour à la liste')}
          </Button>

          <Card>
            <Title level={2}>{t('Créer un ticket de maintenance')}</Title>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              onFinishFailed={onAntFormValidationFailed(form)}
              style={{ maxWidth: 800 }}
            >
              <Form.Item
                name="propertyId"
                label={t('Propriété')}
                rules={[{ required: true, message: t('Veuillez sélectionner une propriété') }]}
              >
                <Select
                  placeholder={t('Sélectionner une propriété')}
                  showSearch
                  filterOption={false}
                  onSearch={handlePropertySearch}
                  onChange={(id: string) =>
                    setSelectedProperty(properties.find(property => property.id === id) ?? selectedProperty)
                  }
                  loading={propertiesLoading}
                  options={propertyOptions}
                  notFoundContent={propertiesLoading ? t('Chargement…') : t('Aucun bien trouvé')}
                />
              </Form.Item>

              <Form.Item
                name="title"
                label={t('Titre')}
                rules={[
                  { required: true, message: t('Veuillez saisir un titre') },
                  { min: 3, message: t('Le titre doit contenir au moins 3 caractères') },
                  { max: 200, message: t('Le titre ne peut pas dépasser 200 caractères') }
                ]}
              >
                <Input placeholder={t("Ex: Fuite d'eau dans la salle de bain")} />
              </Form.Item>

              <Form.Item
                name="category"
                label={t('Catégorie')}
                rules={[{ required: true, message: t('Veuillez sélectionner une catégorie') }]}
              >
                <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner une catégorie')}>
                  <Option value={MaintenanceTicketCategory.PLUMBING}>{t('Plomberie')}</Option>
                  <Option value={MaintenanceTicketCategory.ELECTRICITY}>{t('Électricité')}</Option>
                  <Option value={MaintenanceTicketCategory.AC}>{t('Climatisation')}</Option>
                  <Option value={MaintenanceTicketCategory.OTHER}>{t('Autre')}</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="priority"
                label={t('Priorité')}
                rules={[{ required: true, message: t('Veuillez sélectionner une priorité') }]}
              >
                <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner une priorité')}>
                  <Option value={MaintenanceTicketPriority.LOW}>{t('Faible')}</Option>
                  <Option value={MaintenanceTicketPriority.MEDIUM}>{t('Moyenne')}</Option>
                  <Option value={MaintenanceTicketPriority.HIGH}>{t('Élevée')}</Option>
                  <Option value={MaintenanceTicketPriority.URGENT}>{t('Urgente')}</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="description"
                label={t('Description')}
                rules={[
                  { required: true, message: t('Veuillez saisir une description') },
                  { min: 10, message: t('La description doit contenir au moins 10 caractères') },
                  { max: 5000, message: t('La description ne peut pas dépasser 5000 caractères') }
                ]}
              >
                <TextArea rows={6} placeholder={t('Décrivez le problème en détail...')} />
              </Form.Item>

              <Form.Item
                name="locationDetails"
                label={t('Détails de localisation (optionnel)')}
                rules={[{ max: 500, message: t('Les détails ne peuvent pas dépasser 500 caractères') }]}
              >
                <TextArea rows={3} placeholder={t("Ex: Salle de bain principale, sous l'évier")} />
              </Form.Item>

              <Form.Item label={t('Pièces jointes (optionnel)')}>
                <FileUploader onFilesChange={setUploadedFiles} maxFiles={10} maxSize={5} />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                    {t('Créer le ticket')}
                  </Button>
                  <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/maintenance`)}>{t('Annuler')}</Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Space>
      </div>
    </>
  );
};
