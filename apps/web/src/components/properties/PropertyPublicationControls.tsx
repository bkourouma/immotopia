import React, { useState } from 'react';
import { App, Card, Button, Space, Typography, Alert, Tag, Popconfirm } from 'antd';
import {
  GlobalOutlined,
  EyeInvisibleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { Property } from '../../types/property-types';
import { publishProperty, unpublishProperty } from '../../services/property-service';

const { Text } = Typography;

interface PropertyPublicationControlsProps {
  property: Property;
  tenantId: string;
  onUpdate?: () => void;
}

export const PropertyPublicationControls: React.FC<PropertyPublicationControlsProps> = ({
  property,
  tenantId,
  onUpdate
}) => {
  const { message } = App.useApp();

  const [publishing, setPublishing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handlePublish = async () => {
    setPublishing(true);
    setValidationErrors([]);
    try {
      await publishProperty(tenantId, property.id);
      message.success('Propriété publiée avec succès');
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Erreur lors de la publication';
      if (errorMessage.includes('requirements not met')) {
        const errors = errorMessage.split(':')[1]?.split(',') || [errorMessage];
        setValidationErrors(errors.map((e: string) => e.trim()));
      } else {
        setValidationErrors([errorMessage]);
      }
      message.error('Erreur lors de la publication');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    setPublishing(true);
    try {
      await unpublishProperty(tenantId, property.id);
      message.success('Propriété retirée du portail public');
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Erreur lors de la dépublication');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Publication Status */}
        <div className="it-toolbar it-toolbar--start">
          <div>
            <Typography.Title level={5} style={{ margin: 0, marginBottom: 4 }}>
              Publication
            </Typography.Title>
            <Text type="secondary">
              {property.isPublished
                ? 'Cette propriété est visible sur le portail public'
                : "Cette propriété n'est pas publiée"}
            </Text>
          </div>
          {property.isPublished ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              Publié
            </Tag>
          ) : (
            <Tag icon={<EyeInvisibleOutlined />}>Non publié</Tag>
          )}
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Alert
            message="Conditions de publication non remplies"
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            }
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
          />
        )}

        {/* Actions */}
        <div>
          {property.isPublished ? (
            <Popconfirm
              title="Retirer du portail public"
              description="Êtes-vous sûr de vouloir retirer cette propriété du portail public ?"
              onConfirm={handleUnpublish}
              okText="Oui"
              cancelText="Non"
            >
              <Button icon={<EyeInvisibleOutlined />} loading={publishing} block>
                Retirer du portail public
              </Button>
            </Popconfirm>
          ) : (
            <Button type="primary" icon={<GlobalOutlined />} onClick={handlePublish} loading={publishing} block>
              Publier sur le portail public
            </Button>
          )}
        </div>

        {/* Publication Info */}
        {property.isPublished && property.publishedAt && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Publié le{' '}
            {new Date(property.publishedAt).toLocaleDateString('fr-FR', {
              dateStyle: 'long'
            })}
          </Text>
        )}
      </Space>
    </Card>
  );
};
