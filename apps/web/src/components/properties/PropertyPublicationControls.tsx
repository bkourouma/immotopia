import React, { useState } from 'react';
import { App, Card, Button, Space, Typography, Alert, Tag } from 'antd';
import {
  GlobalOutlined,
  EyeInvisibleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { Property } from '../../types/property-types';
import { apiErrorText, apiFieldErrors } from './property-api-errors';
import { ConfirmAction } from '../primitives';
import { publishProperty, unpublishProperty } from '../../services/property-service';
import { HelpSectionTitle } from '../../help';
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
        setValidationErrors([apiErrorText(error, t('Erreur lors de la publication'))]);
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
      message.error(apiErrorText(error, t('Erreur lors de la dépublication')));
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
              <HelpSectionTitle title={t('Publication')} helpId="commercial.biens.modifier.publication" />
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
            <ConfirmAction
              title={t('Retirer « {{title}} » du portail public ?', { title: property.title })}
              description={t(
                'Le bien ne sera plus visible du public. Vous pourrez le publier à nouveau quand vous voulez.'
              )}
              onConfirm={handleUnpublish}
              okText={t('Retirer du portail')}
            >
              <Button icon={<EyeInvisibleOutlined />} loading={publishing} disabled={publishing} block>
                {t('Retirer du portail public')}
              </Button>
            </ConfirmAction>
          ) : (
            <Button
              type="primary"
              icon={<GlobalOutlined />}
              onClick={handlePublish}
              loading={publishing}
              disabled={publishing}
              block
            >
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
