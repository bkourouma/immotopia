import React, { useState, useEffect } from 'react';
import { App, Card, Button, Input, Modal, Form, Space, Typography, Tag, Spin, Empty, Row, Col, Alert } from 'antd';
import { PlusOutlined, FolderOpenOutlined, TagOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../components/dashboard/dashboard-layout';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { listTags, createTag, listContacts, CrmTag } from '../services/crm-service';

const { Title, Text } = Typography;

export const ClientGroups: React.FC = () => {
  const { message } = App.useApp();

  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const [form] = Form.useForm();
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (tenantMembership?.tenantId) {
      loadTags();
      loadTagCounts();
    }
  }, [tenantMembership?.tenantId]);

  useEffect(() => {
    if (showCreateModal) {
      form.resetFields();
      form.setFieldsValue({ color: '#3B82F6' });
    }
  }, [showCreateModal, form]);

  const loadTags = async () => {
    if (!tenantMembership?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listTags(tenantMembership.tenantId);
      if (response.success) {
        setTags(response.data);
      } else {
        setError('Erreur lors du chargement des groupes');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des groupes');
    } finally {
      setLoading(false);
    }
  };

  const loadTagCounts = async () => {
    if (!tenantMembership?.tenantId) return;
    try {
      // Load all contacts with their tags to count
      const response = await listContacts(tenantMembership.tenantId, { limit: 1000 });
      if (response.success) {
        const counts: Record<string, number> = {};
        response.contacts.forEach(contact => {
          contact.tags?.forEach((tag: CrmTag) => {
            counts[tag.id] = (counts[tag.id] || 0) + 1;
          });
        });
        setTagCounts(counts);
      }
    } catch (err) {
      console.error('Error loading tag counts:', err);
    }
  };

  const handleCreateTag = async (values: { name: string; color: string }) => {
    if (!tenantMembership?.tenantId || !values.name.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const response = await createTag(tenantMembership.tenantId, values.name.trim(), values.color || '#3B82F6');
      if (response.success) {
        setTags([...tags, response.data]);
        setShowCreateModal(false);
        form.resetFields();
        message.success('Groupe créé avec succès');
        await loadTagCounts();
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Erreur lors de la création du groupe';
      setError(errorMsg);
      message.error(errorMsg);
    } finally {
      setCreating(false);
    }
  };

  const handleViewGroup = (tagId: string) => {
    navigate(`/clients?tag=${tagId}`);
  };

  const predefinedColors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316' // Orange
  ];

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Groupes de clients
            </Title>
            <Text type="secondary">Organisez vos clients en groupes (tags) pour une meilleure gestion</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreateModal(true)}>
            Nouveau groupe
          </Button>
        </div>

        {error && <Alert message={error} type="error" showIcon closable onClose={() => setError(null)} />}

        {loading ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">Chargement des groupes...</Text>
              </div>
            </div>
          </Card>
        ) : tags.length === 0 ? (
          <Card>
            <Empty
              image={<FolderOpenOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
              description={
                <Space direction="vertical" size="small">
                  <Title level={4} style={{ margin: 0 }}>
                    Aucun groupe
                  </Title>
                  <Text type="secondary">Créez votre premier groupe pour organiser vos clients</Text>
                </Space>
              }
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreateModal(true)}>
                Créer un groupe
              </Button>
            </Empty>
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {tags.map(tag => (
              <Col xs={24} sm={12} lg={8} key={tag.id}>
                <Card hoverable onClick={() => handleViewGroup(tag.id)} style={{ cursor: 'pointer' }}>
                  <Space size="middle" style={{ width: '100%' }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        backgroundColor: tag.color || '#1890ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <TagOutlined style={{ fontSize: 24, color: '#fff' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Title level={5} style={{ margin: 0, marginBottom: 4 }}>
                        {tag.name}
                      </Title>
                      <Text type="secondary">
                        {tagCounts[tag.id] || 0} client{(tagCounts[tag.id] || 0) !== 1 ? 's' : ''}
                      </Text>
                    </div>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        )}

        {/* Create Tag Modal */}
        <Modal
          title="Nouveau groupe"
          open={showCreateModal}
          onCancel={() => {
            setShowCreateModal(false);
            setError(null);
            form.resetFields();
          }}
          footer={null}
          width={500}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={values => handleCreateTag({ name: values.name, color: values.color || '#3B82F6' })}
            initialValues={{ color: '#3B82F6' }}
          >
            <Form.Item
              label="Nom du groupe"
              name="name"
              rules={[{ required: true, message: 'Le nom du groupe est requis' }]}
            >
              <Input placeholder="Ex: VIP, Nouveaux clients, etc." autoFocus />
            </Form.Item>

            <Form.Item label="Couleur" name="color" rules={[{ required: true, message: 'La couleur est requise' }]}>
              <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.color !== currentValues.color}>
                {({ getFieldValue }) => {
                  const selectedColor = getFieldValue('color') || '#3B82F6';
                  return (
                    <Space wrap>
                      {predefinedColors.map(color => (
                        <Button
                          key={color}
                          type="text"
                          onClick={() => form.setFieldsValue({ color })}
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            backgroundColor: color,
                            border: selectedColor === color ? '3px solid #000' : '2px solid transparent',
                            padding: 0
                          }}
                        />
                      ))}
                    </Space>
                  );
                }}
              </Form.Item>
            </Form.Item>

            <Form.Item>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button
                  onClick={() => {
                    setShowCreateModal(false);
                    setError(null);
                    form.resetFields();
                  }}
                >
                  Annuler
                </Button>
                <Button type="primary" htmlType="submit" loading={creating}>
                  Créer
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </DashboardLayout>
  );
};
