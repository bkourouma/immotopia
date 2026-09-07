import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Form,
  Input,
  Select,
  Button,
  DatePicker,
  TimePicker,
  Checkbox,
  Space,
  Typography,
  Alert,
  Spin,
  message,
  Row,
  Col,
} from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  UserOutlined,
  ProjectOutlined,
  AimOutlined,
  TeamOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { PropertyVisitType, PropertyVisitGoal } from '../../types/property-types';
import { scheduleVisit } from '../../services/property-service';
import { listDeals } from '../../services/crm-service';
import { Deal } from '../../types/crm-types';
import { listMembers, Member } from '../../services/membership-service';
import { ContactSearchableSelect } from './ContactSearchableSelect';
import { getDealTypeLabel } from '../../utils/crm-utils';

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
  initialDealId,
}) => {
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

  const handleContactChange = (contactId: string) => {
    form.setFieldsValue({ contactId, dealId: undefined });
    if (contactId) {
      loadDeals(contactId);
    } else {
      setDeals([]);
    }
  };

  const goalOptions = [
    { value: PropertyVisitGoal.CONTACT_TAKING, label: 'Prise de contact' },
    { value: PropertyVisitGoal.NETWORKING, label: 'Mise en relation' },
    { value: PropertyVisitGoal.EVALUATION, label: 'Évaluation' },
    { value: PropertyVisitGoal.CONTRACT_SIGNING, label: 'Signature du contrat' },
    { value: PropertyVisitGoal.FOLLOW_UP, label: 'Suivi' },
    { value: PropertyVisitGoal.NEGOTIATION, label: 'Négociation' },
    { value: PropertyVisitGoal.OTHER, label: 'Autre' },
  ];

  const handleSubmit = async (values: any) => {
    setLoading(true);

    try {
      const scheduledDate = values.scheduledDate as Dayjs;
      const scheduledTime = values.scheduledTime as Dayjs;

      if (!scheduledDate || !scheduledTime) {
        message.error('La date et l\'heure sont requises');
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
        message.error('La date et l\'heure doivent être dans le futur');
        setLoading(false);
        return;
      }

      await scheduleVisit(tenantId, propertyId, {
        contactId: values.contactId || undefined,
        dealId: values.dealId || undefined,
        visitType: PropertyVisitType.VISIT,
        goal: values.goal || undefined,
        scheduledAt: scheduledDateTime.toISOString(),
        duration: values.duration ? parseInt(values.duration, 10) : undefined,
        location: values.location || undefined,
        assignedToUserId: values.assignedToUserId || undefined,
        collaboratorIds: values.collaboratorIds && values.collaboratorIds.length > 0 ? values.collaboratorIds : undefined,
        notes: values.notes || undefined,
      });

      // Show success message
      setSuccessMessage('Visite planifiée avec succès !');
      message.success('Visite planifiée avec succès !');

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
      message.error(error.response?.data?.error || 'Erreur lors de la planification de la visite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        duration: '60',
        collaboratorIds: [],
      }}
    >
      {/* Success Message */}
      {successMessage && (
        <Alert
          message="Succès"
          description={
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span>{successMessage}</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Redirection en cours...
              </Text>
            </Space>
          }
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Contact */}
      <Form.Item
        label={
          <Space>
            <UserOutlined />
            Contact (optionnel)
          </Space>
        }
        name="contactId"
      >
        <ContactSearchableSelect
          tenantId={tenantId}
          value={form.getFieldValue('contactId')}
          onChange={handleContactChange}
          placeholder="Rechercher un contact..."
        />
      </Form.Item>

      {/* Deal */}
      {form.getFieldValue('contactId') && (
        <Form.Item
          label={
            <Space>
              <ProjectOutlined />
              Affaire (optionnel)
            </Space>
          }
          name="dealId"
        >
          <Select
            placeholder="Aucune affaire"
            loading={loadingDeals}
            allowClear
          >
            {deals.map((deal) => (
              <Select.Option key={deal.id} value={deal.id}>
                {getDealTypeLabel(deal.type)} - {deal.stage}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      )}

      {/* Goal */}
      <Form.Item
        label={
          <Space>
            <AimOutlined />
            Objectif (optionnel)
          </Space>
        }
        name="goal"
      >
        <Select placeholder="Sélectionner un objectif" allowClear>
          {goalOptions.map((option) => (
            <Select.Option key={option.value} value={option.value}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      {/* Date and Time */}
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            label={
              <Space>
                <CalendarOutlined />
                Date
              </Space>
            }
            name="scheduledDate"
            rules={[{ required: true, message: 'La date est requise' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label={
              <Space>
                <ClockCircleOutlined />
                Heure
              </Space>
            }
            name="scheduledTime"
            rules={[{ required: true, message: 'L\'heure est requise' }]}
          >
            <TimePicker
              style={{ width: '100%' }}
              format="HH:mm"
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Duration */}
      <Form.Item
        label="Durée (minutes)"
        name="duration"
      >
        <Input
          type="number"
          min={15}
          step={15}
          placeholder="60"
        />
      </Form.Item>

      {/* Location */}
      <Form.Item
        label={
          <Space>
            <EnvironmentOutlined />
            Lieu (optionnel)
          </Space>
        }
        name="location"
      >
        <Input
          placeholder="Adresse de la propriété par défaut"
        />
      </Form.Item>

      {/* Assigned To */}
      <Form.Item
        label="Assigné à (optionnel)"
        name="assignedToUserId"
      >
          <Select
            placeholder="Sélectionner un collaborateur"
            allowClear
            showSearch
            filterOption={(input, option) => {
              const label = String(option?.label || option?.children || '');
              return label.toLowerCase().includes(input.toLowerCase());
            }}
          >
          {members.map((member) => (
            <Select.Option key={member.user.id} value={member.user.id} label={member.user.fullName || member.user.email}>
              {member.user.fullName || member.user.email}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      {/* Collaborators */}
      <Form.Item
        label={
          <Space>
            <TeamOutlined />
            Collaborateurs (optionnel)
          </Space>
        }
        name="collaboratorIds"
      >
        {loadingMembers ? (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <Spin />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              Chargement des collaborateurs...
            </Text>
          </div>
        ) : members.length === 0 ? (
          <Text type="secondary">Aucun collaborateur disponible</Text>
        ) : (
          <Checkbox.Group style={{ width: '100%' }}>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 4, padding: 8 }}>
              {members.map((member) => (
                <div key={member.user.id} style={{ padding: '4px 0' }}>
                  <Checkbox value={member.user.id}>
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        {member.user.fullName || member.user.email}
                      </div>
                      {member.user.fullName && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {member.user.email}
                        </Text>
                      )}
                    </div>
                  </Checkbox>
                </div>
              ))}
            </div>
          </Checkbox.Group>
        )}
      </Form.Item>

      {/* Notes */}
      <Form.Item
        label={
          <Space>
            <FileTextOutlined />
            Notes (optionnel)
          </Space>
        }
        name="notes"
      >
        <TextArea
          rows={3}
          placeholder="Notes supplémentaires sur la visite..."
        />
      </Form.Item>

      {/* Submit */}
      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          icon={<CalendarOutlined />}
          block
        >
          {loading ? 'Planification...' : 'Planifier la visite'}
        </Button>
      </Form.Item>
    </Form>
  );
};
