import React, { useState, useEffect } from 'react';
import { Modal, Input, Tag, Button, Space, Typography, Spin, Empty } from 'antd';
import { PlusOutlined, TagOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons';
import { listTags, assignTag, removeTag, getContactTags, CrmTag } from '../../services/crm-service';

const { Search } = Input;
const { Title, Text } = Typography;

interface TagManagerProps {
  tenantId: string;
  contactId: string;
  contactName: string;
  onClose: () => void;
  onTagsUpdated?: () => void;
  open?: boolean;
}

export const TagManager: React.FC<TagManagerProps> = ({
  tenantId,
  contactId,
  contactName,
  onClose,
  onTagsUpdated,
  open = true,
}) => {
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [contactTags, setContactTags] = useState<CrmTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [tenantId, contactId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tagsResponse, contactTagsResponse] = await Promise.all([
        listTags(tenantId),
        getContactTags(tenantId, contactId),
      ]);

      if (tagsResponse.success) {
        setAllTags(tagsResponse.data);
      }
      if (contactTagsResponse.success) {
        setContactTags(contactTagsResponse.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des tags');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTag = async (tagId: string) => {
    setProcessing(tagId);
    setError(null);
    try {
      const response = await assignTag(tenantId, contactId, tagId);
      if (response.success) {
        // Reload contact tags
        const contactTagsResponse = await getContactTags(tenantId, contactId);
        if (contactTagsResponse.success) {
          setContactTags(contactTagsResponse.data);
        }
        onTagsUpdated?.();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l\'assignation du tag');
    } finally {
      setProcessing(null);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    setProcessing(tagId);
    setError(null);
    try {
      const response = await removeTag(tenantId, contactId, tagId);
      if (response.success) {
        // Reload contact tags
        const contactTagsResponse = await getContactTags(tenantId, contactId);
        if (contactTagsResponse.success) {
          setContactTags(contactTagsResponse.data);
        }
        onTagsUpdated?.();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la suppression du tag');
    } finally {
      setProcessing(null);
    }
  };

  const isTagAssigned = (tagId: string) => {
    return contactTags.some((tag) => tag.id === tagId);
  };

  const filteredTags = allTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableTags = filteredTags.filter((tag) => !isTagAssigned(tag.id));
  const assignedTags = filteredTags.filter((tag) => isTagAssigned(tag.id));

  return (
    <Modal
      title={
        <Space>
          <TagOutlined style={{ color: '#1890ff' }} />
          <span>Gérer les tags</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Fermer
        </Button>,
      ]}
      width={800}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Text type="secondary">{contactName}</Text>

        {error && (
          <div style={{ marginBottom: 16 }}>
            <Text type="danger">{error}</Text>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">Chargement...</Text>
            </div>
          </div>
        ) : (
          <>
            {/* Search */}
            <Search
              placeholder="Rechercher un tag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              prefix={<SearchOutlined />}
              allowClear
            />

            {/* Assigned Tags */}
            <div>
              <Title level={5}>
                <Space>
                  <TagOutlined />
                  <span>Tags assignés ({contactTags.length})</span>
                </Space>
              </Title>
              {assignedTags.length === 0 ? (
                <Empty
                  description={
                    searchTerm
                      ? 'Aucun tag assigné ne correspond à votre recherche'
                      : 'Aucun tag assigné'
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : (
                <Space wrap>
                  {assignedTags.map((tag) => (
                    <Tag
                      key={tag.id}
                      color={tag.color || '#1890ff'}
                      closable
                      onClose={() => handleRemoveTag(tag.id)}
                      closeIcon={
                        processing === tag.id ? (
                          <Spin size="small" />
                        ) : (
                          <CloseOutlined />
                        )
                      }
                      style={{
                        fontSize: '14px',
                        padding: '4px 12px',
                        marginBottom: '8px',
                      }}
                    >
                      {tag.name}
                    </Tag>
                  ))}
                </Space>
              )}
            </div>

            {/* Available Tags */}
            <div>
              <Title level={5}>
                <Space>
                  <PlusOutlined />
                  <span>Tags disponibles ({availableTags.length})</span>
                </Space>
              </Title>
              {availableTags.length === 0 ? (
                <Empty
                  description={
                    searchTerm
                      ? 'Aucun tag disponible ne correspond à votre recherche'
                      : 'Tous les tags sont déjà assignés'
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : (
                <Space wrap>
                  {availableTags.map((tag) => (
                    <Tag
                      key={tag.id}
                      color={tag.color || '#1890ff'}
                      style={{
                        fontSize: '14px',
                        padding: '4px 12px',
                        marginBottom: '8px',
                        cursor: 'pointer',
                        border: `2px solid ${tag.color || '#1890ff'}`,
                        backgroundColor: 'transparent',
                      }}
                      onClick={() => handleAssignTag(tag.id)}
                      icon={processing === tag.id ? <Spin size="small" /> : <PlusOutlined />}
                    >
                      {tag.name}
                    </Tag>
                  ))}
                </Space>
              )}
            </div>
          </>
        )}
      </Space>
    </Modal>
  );
};
