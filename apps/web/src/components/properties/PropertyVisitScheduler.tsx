import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Form, Input, Select, Button, DatePicker, TimePicker, Space, Typography, Alert, Row, Col } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  UserOutlined,
  ProjectOutlined,
  AimOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { PropertyVisitType, PropertyVisitGoal } from '../../types/property-types';
import { scheduleVisit } from '../../services/property-service';
import { listDeals } from '../../services/crm-service';
import { Deal } from '../../types/crm-types';
import { listMembers, Member } from '../../services/membership-service';
import { ContactSearchableSelect } from './ContactSearchableSelect';
import { getDealTypeLabel } from '../../utils/crm-utils';
import { t } from '../../i18n/t';

const { TextArea } = Input;
const { Text } = Typography;

interface PropertyVisitSchedulerProps {
  propertyId: string;
  tenantId: string;
  onVisitScheduled?: () => void;
  initialContactId?: string;
  initialDealId?: string;
}

export const PropertyVisitScheduler: React.FC<PropertyVisitSchedulerProps> = ({
  propertyId,
  tenantId,
  onVisitScheduled,
  initialContactId,
  initialDealId
}) => {
  const { message } = App.useApp();

  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    loadMembers();
    if (initialContactId) {
      loadDeals(initialContactId);
      form.setFieldsValue({ contactId: initialContactId });
    }
    if (initialDealId) {
      form.setFieldsValue({ dealId: initialDealId });
    }
  }, [initialContactId, initialDealId]);

  const loadDeals = async (contactId: string) => {
    if (!contactId) return;
    setLoadingDeals(true);
    try {
      const response = await listDeals(tenantId, { page: 1, limit: 100, contactId });
      if (response.success) {
        setDeals(response.deals || []);
      }
    } catch (error) {
      console.error('Error loading deals:', error);
    } finally {
      setLoadingDeals(false);
    }
  };

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const response = await listMembers(tenantId, { page: 1, limit: 500, status: 'ACTIVE' });
      if (response.success) {
        setMembers(response.data.members || []);
      }
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setLoadingMembers(false);
    }
  };

  /**
   * Contact choisi, SUIVI. `form.getFieldValue('contactId')` lu pendant le
   * rendu ne s'abonne à rien : l'apparition du champ « Affaire » ne tenait
   * qu'au re-rendu provoqué incidemment par `loadDeals`. La mise en page à
   * deux colonnes en dépend maintenant, `useWatch` la rend explicite.
   */
  const contactId = Form.useWatch('contactId', form);

  const handleContactChange = (contactId: string) => {
    form.setFieldsValue({ contactId, dealId: undefined });
    if (contactId) {
      loadDeals(contactId);
    } else {
      setDeals([]);
    }
  };

  const goalOptions = [
    { value: PropertyVisitGoal.CONTACT_TAKING, label: t('Prise de contact') },
    { value: PropertyVisitGoal.NETWORKING, label: t('Mise en relation') },
    { value: PropertyVisitGoal.EVALUATION, label: t('Évaluation') },
    { value: PropertyVisitGoal.CONTRACT_SIGNING, label: t('Signature du contrat') },
    { value: PropertyVisitGoal.FOLLOW_UP, label: t('Suivi') },
    { value: PropertyVisitGoal.NEGOTIATION, label: t('Négociation') },
    { value: PropertyVisitGoal.OTHER, label: t('Autre') }
  ];

  const handleSubmit = async (values: any) => {
    setLoading(true);

    try {
      const scheduledDate = values.scheduledDate as Dayjs;
      const scheduledTime = values.scheduledTime as Dayjs;

      if (!scheduledDate || !scheduledTime) {
        message.error(t("La date et l'heure sont requises"));
        setLoading(false);
        return;
      }

      // Combine date and time
      const scheduledDateTime = scheduledDate
        .hour(scheduledTime.hour())
        .minute(scheduledTime.minute())
        .second(0)
        .millisecond(0);

      if (scheduledDateTime.isBefore(dayjs())) {
        message.error(t("La date et l'heure doivent être dans le futur"));
        setLoading(false);
        return;
      }

      await scheduleVisit(tenantId, propertyId, {
        contactId: values.contactId || undefined,
        dealId: values.dealId || undefined,
        visitType: PropertyVisitType.VISIT,
        goal: values.goal || undefined,
        scheduledAt: scheduledDateTime.toISOString(),
        // Ni `duration` ni `collaboratorIds` : les deux champs ont été retirés
        // du formulaire. Tous deux sont facultatifs côté API (`duration Int?`,
        // et le calendrier n'affiche « (n min) » que si la durée existe), la
        // visite est donc enregistrée sans eux plutôt qu'avec une valeur que
        // personne n'a saisie. Un collaborateur reste désignable par « Assigné
        // à », qui couvrait déjà le besoin.
        location: values.location || undefined,
        assignedToUserId: values.assignedToUserId || undefined,
        notes: values.notes || undefined
      });

      // Show success message
      setSuccessMessage(t('Visite planifiée avec succès !'));
      message.success(t('Visite planifiée avec succès !'));

      // Reset form
      form.resetFields();

      if (onVisitScheduled) {
        onVisitScheduled();
      }

      // Redirect to calendar after 1.5 seconds
      setTimeout(() => {
        navigate(`/tenant/${tenantId}/properties/visits/calendar`);
      }, 1500);
    } catch (error: any) {
      console.error('Error scheduling visit:', error);
      message.error(error.response?.data?.error || t('Erreur lors de la planification de la visite'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      {/* Success Message */}
      {successMessage && (
        <Alert
          message={t('Succès')}
          description={
            <Space>
              <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />
              <span>{successMessage}</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('Redirection en cours...')}
              </Text>
            </Space>
          }
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/*
        Deux champs par ligne à partir de 576 px.

        Ce formulaire vivait dans une colonne étroite de la fiche du bien, où
        l'empilement d'un champ par ligne était la seule mise en page possible.
        Il occupe désormais la largeur d'un onglet : quatorze lignes pour huit
        champs y laissaient deux tiers de la largeur vides et repoussaient le
        bouton sous la ligne de flottaison.

        Trois contrôles restent pleine largeur, faute de tenir en demi-colonne :
        la liste défilante des collaborateurs, la zone de notes et le bouton.
      */}
      <Row gutter={16}>
        {/* Contact */}
        <Col xs={24} sm={12}>
          <Form.Item
            label={
              <Space>
                <UserOutlined />
                {t('Contact')}
              </Space>
            }
            name="contactId"
            rules={[{ required: true, message: t('Le contact est requis.') }]}
          >
            <ContactSearchableSelect
              tenantId={tenantId}
              value={contactId}
              onChange={handleContactChange}
              placeholder={t('Rechercher un contact...')}
            />
          </Form.Item>
        </Col>

        {/* Objectif */}
        <Col xs={24} sm={12}>
          <Form.Item
            label={
              <Space>
                <AimOutlined />
                {t('Objectif')}
              </Space>
            }
            name="goal"
            rules={[{ required: true, message: t("L'objectif est requis.") }]}
          >
            <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner un objectif')} allowClear>
              {goalOptions.map(option => (
                <Select.Option key={option.value} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        {/* Affaire : n'apparaît qu'une fois le contact choisi, sur sa propre
            ligne. La demi-colonne vide qui la suit garde « Date » et « Heure »
            appariées : sans elle, « Date » remonterait à côté d'« Affaire » et
            tout le reste se décalerait au moment où l'on choisit un contact. */}
        {contactId && (
          <>
            <Col xs={24} sm={12}>
              <Form.Item
                label={
                  <Space>
                    <ProjectOutlined />
                    {t('Affaire (optionnel)')}
                  </Space>
                }
                name="dealId"
              >
                <Select
                  showSearch
                  optionFilterProp="children"
                  placeholder={t('Aucune affaire')}
                  loading={loadingDeals}
                  allowClear
                >
                  {deals.map(deal => (
                    <Select.Option key={deal.id} value={deal.id}>
                      {getDealTypeLabel(deal.type)} - {deal.stage}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={0} sm={12} aria-hidden="true" />
          </>
        )}

        {/* Date */}
        <Col xs={24} sm={12}>
          <Form.Item
            label={
              <Space>
                <CalendarOutlined />
                {t('Date')}
              </Space>
            }
            name="scheduledDate"
            rules={[{ required: true, message: t('La date est requise') }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              disabledDate={current => current && current < dayjs().startOf('day')}
            />
          </Form.Item>
        </Col>

        {/* Heure */}
        <Col xs={24} sm={12}>
          <Form.Item
            label={
              <Space>
                <ClockCircleOutlined />
                {t('Heure')}
              </Space>
            }
            name="scheduledTime"
            rules={[{ required: true, message: t("L'heure est requise") }]}
          >
            <TimePicker style={{ width: '100%' }} format="HH:mm" />
          </Form.Item>
        </Col>

        {/* Lieu */}
        <Col xs={24} sm={12}>
          <Form.Item
            label={
              <Space>
                <EnvironmentOutlined />
                {t('Lieu (optionnel)')}
              </Space>
            }
            name="location"
          >
            <Input placeholder={t('Adresse de la propriété par défaut')} />
          </Form.Item>
        </Col>

        {/* Assigné à */}
        <Col xs={24} sm={12}>
          <Form.Item label={t('Assigné à (optionnel)')} name="assignedToUserId">
            <Select
              placeholder={t('Sélectionner un collaborateur')}
              // Reprend l'indicateur qui servait à la liste de collaborateurs
              // retirée : les deux consommaient la même requête.
              loading={loadingMembers}
              allowClear
              showSearch
              filterOption={(input, option) => {
                const label = String(option?.label || option?.children || '');
                return label.toLowerCase().includes(input.toLowerCase());
              }}
            >
              {members.map(member => (
                <Select.Option
                  key={member.user.id}
                  value={member.user.id}
                  label={member.user.fullName || member.user.email}
                >
                  {member.user.fullName || member.user.email}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        {/* Notes : zone de texte, pleine largeur. */}
        <Col xs={24}>
          <Form.Item
            label={
              <Space>
                <FileTextOutlined />
                {t('Notes (optionnel)')}
              </Space>
            }
            name="notes"
          >
            <TextArea rows={3} placeholder={t('Notes supplémentaires sur la visite...')} />
          </Form.Item>
        </Col>
      </Row>

      {/* Submit */}
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} icon={<CalendarOutlined />} block>
          {loading ? 'Planification...' : t('Planifier la visite')}
        </Button>
      </Form.Item>
    </Form>
  );
};
