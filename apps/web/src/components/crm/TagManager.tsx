import React, { useState, useEffect } from 'react';
import { Modal, Input, Tag, Button, Space, Typography, Spin, Empty, ColorPicker } from 'antd';
import { PlusOutlined, TagOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons';
import { listTags, assignTag, removeTag, getContactTags, createTag, CrmTag } from '../../services/crm-service';
import { writeErrorMessage } from '../../utils/error-handler';
import { t } from '../../i18n/t';

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
  open = true
}) => {
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [contactTags, setContactTags] = useState<CrmTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#1890ff');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [tenantId, contactId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tagsResponse, contactTagsResponse] = await Promise.all([
        listTags(tenantId),
        getContactTags(tenantId, contactId)
      ]);

      if (tagsResponse.success) {
        setAllTags(tagsResponse.data);
      }
      if (contactTagsResponse.success) {
        setContactTags(contactTagsResponse.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des tags'));
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
      setError(err.response?.data?.message || t("Erreur lors de l'assignation du tag"));
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
      setError(err.response?.data?.message || t('Erreur lors de la suppression du tag'));
    } finally {
      setProcessing(null);
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const response = await createTag(tenantId, name, newTagColor);
      if (response.success) {
        setNewTagName('');
        setAllTags(prev => [...prev, response.data]);
        // Le nouveau tag est assigné au contact tout de suite.
        await handleAssignTag(response.data.id);
      }
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setError(t('Un tag portant ce nom existe déjà.'));
      } else {
        setError(
          writeErrorMessage(
            err,
            t('Erreur lors de la création du tag'),
            t("Vous n'avez pas les droits nécessaires pour créer un tag.")
          )
        );
      }
    } finally {
      setCreating(false);
    }
  };

  const isTagAssigned = (tagId: string) => {
    return contactTags.some(tag => tag.id === tagId);
  };

  const filteredTags = allTags.filter(tag => tag.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const availableTags = filteredTags.filter(tag => !isTagAssigned(tag.id));
  const assignedTags = filteredTags.filter(tag => isTagAssigned(tag.id));

  return (
    <Modal
      title={
        <Space>
          <TagOutlined style={{ color: '#1890ff' }} />
          <span>{t('Gérer les tags')}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          {t('Fermer')}
        </Button>
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
              <Text type="secondary">{t('Chargement...')}</Text>
            </div>
          </div>
        ) : (
          <>
            {/* Search */}
            <Search
              placeholder={t('Rechercher un tag...')}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              prefix={<SearchOutlined />}
              allowClear
            />

            {/* Création d'un tag */}
            <Space.Compact style={{ width: '100%' }}>
              <ColorPicker
                value={newTagColor}
                onChange={color => setNewTagColor(color.toHexString())}
                aria-label={t('Couleur du tag')}
              />
              <Input
                placeholder={t('Nom du nouveau tag')}
                value={newTagName}
                maxLength={50}
                onChange={e => setNewTagName(e.target.value)}
                onPressEnter={handleCreateTag}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                loading={creating}
                disabled={!newTagName.trim()}
                onClick={handleCreateTag}
              >
                {t('Créer le tag')}
              </Button>
            </Space.Compact>

            {/* Assigned Tags */}
            <div>
              <Title level={5}>
                <Space>
                  <TagOutlined />
                  <span>
                    {t('Tags assignés (')}
                    {contactTags.length})
                  </span>
                </Space>
              </Title>
              {assignedTags.length === 0 ? (
                <Empty
                  description={
                    searchTerm ? t('Aucun tag assigné ne correspond à votre recherche') : t('Aucun tag assigné')
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : (
                <Space wrap>
                  {assignedTags.map(tag => (
                    <Tag
                      key={tag.id}
                      color={tag.color || '#1890ff'}
                      closable
                      onClose={() => handleRemoveTag(tag.id)}
                      closeIcon={processing === tag.id ? <Spin size="small" /> : <CloseOutlined />}
                      style={{
                        fontSize: '14px',
                        padding: '4px 12px',
                        marginBottom: '8px'
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
                  <span>
                    {t('Tags disponibles (')}
                    {availableTags.length})
                  </span>
                </Space>
              </Title>
              {availableTags.length === 0 ? (
                <Empty
                  description={
                    searchTerm
                      ? t('Aucun tag disponible ne correspond à votre recherche')
                      : t('Tous les tags sont déjà assignés')
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : (
                <Space wrap>
                  {availableTags.map(tag => (
                    <Tag
                      key={tag.id}
                      color={tag.color || '#1890ff'}
                      style={{
                        fontSize: '14px',
                        padding: '4px 12px',
                        marginBottom: '8px',
                        cursor: 'pointer',
                        border: `2px solid ${tag.color || '#1890ff'}`,
                        backgroundColor: 'transparent'
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
