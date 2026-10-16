import React, { useState } from 'react';
import { App, Card, Button, Space, Typography, Alert, Tag, Popconfirm } from 'antd';
import {
  GlobalOutlined,
  EyeInvisibleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { Property } from '../../types/property-types';
import { apiFieldErrors } from './property-api-errors';
import { publishProperty, unpublishProperty } from '../../services/property-service';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
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
      message.success(t('Propriété publiée avec succès'));
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      // Refus métier : l'API liste chaque condition manquante dans `errors`.
      const conditions = apiFieldErrors(error).map(entry => entry.message);
      if (conditions.length > 0) {
        setValidationErrors(conditions);
      } else {
        setValidationErrors([error.response?.data?.message || t('Erreur lors de la publication')]);
      }
      message.error(t('Erreur lors de la publication'));
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    setPublishing(true);
    try {
      await unpublishProperty(tenantId, property.id);
      message.success(t('Propriété retirée du portail public'));
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || t('Erreur lors de la dépublication'));
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
              {t('Publication')}
            </Typography.Title>
            <Text type="secondary">
              {property.isPublished
                ? t('Cette propriété est visible sur le portail public')
                : t("Cette propriété n'est pas publiée")}
            </Text>
          </div>
          {property.isPublished ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              {t('Publié')}
            </Tag>
          ) : (
            <Tag icon={<EyeInvisibleOutlined />}>{t('Non publié')}</Tag>
          )}
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Alert
            message={t('Conditions de publication non remplies')}
            description={
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
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
              title={t('Retirer du portail public')}
              description={t('Êtes-vous sûr de vouloir retirer cette propriété du portail public ?')}
              onConfirm={handleUnpublish}
              okText={t('Oui')}
              cancelText={t('Non')}
            >
              <Button icon={<EyeInvisibleOutlined />} loading={publishing} block>
                {t('Retirer du portail public')}
              </Button>
            </Popconfirm>
          ) : (
            <Button type="primary" icon={<GlobalOutlined />} onClick={handlePublish} loading={publishing} block>
              {t('Publier sur le portail public')}
            </Button>
          )}
        </div>

        {/* Publication Info */}
        {property.isPublished && property.publishedAt && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('Publié le')}{' '}
            {new Date(property.publishedAt).toLocaleDateString(activeLocale(), {
              dateStyle: 'long'
            })}
          </Text>
        )}
      </Space>
    </Card>
  );
};
