import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Typography, Descriptions, Avatar, Space, Tag, Spin, Divider, Select } from 'antd';
import { UserOutlined, MailOutlined, SafetyCertificateOutlined, GlobalOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/t';
import { useLanguage } from '../../i18n/useLanguage';
import { LANGUAGE_CODES, LANGUAGES, type Language } from '../../i18n/config';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

export const ProfilePage: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { language, setLanguage, isSwitching } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement...')} />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(activeLocale(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        {t('Mon profil')}
      </Title>

      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Avatar src={user.avatarUrl} size={80} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {user.fullName || t('Utilisateur')}
              </Title>
              <Text type="secondary">{user.email}</Text>
              <div style={{ marginTop: 8 }}>
                <Tag color={user.globalRole === 'SUPER_ADMIN' ? 'purple' : 'blue'}>
                  {user.globalRole === 'SUPER_ADMIN' ? t('Administrateur') : t('Utilisateur')}
                </Tag>
                {user.emailVerified && (
                  <Tag icon={<SafetyCertificateOutlined />} color="success">
                    {t('Email vérifié')}
                  </Tag>
                )}
              </div>
            </div>
          </div>

          <Divider />

          <Descriptions title={t('Informations du compte')} column={1} bordered size="small">
            <Descriptions.Item
              label={
                <>
                  <MailOutlined /> {t('Email')}
                </>
              }
            >
              {user.email}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <>
                  <UserOutlined /> {t('Nom complet')}
                </>
              }
            >
              {user.fullName || '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('Compte créé le')}>{formatDate(user.createdAt)}</Descriptions.Item>
            <Descriptions.Item label={t('Dernière mise à jour')}>{formatDate(user.updatedAt)}</Descriptions.Item>
          </Descriptions>

          <Divider />

          <div>
            <Title level={5} style={{ marginTop: 0 }}>
              {t('Langue')}
            </Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              {t(
                'Ce choix vaut pour l’interface et pour les e-mails que nous vous envoyons. Il vous suit d’un appareil à l’autre.'
              )}
            </Text>
            <Select
              value={language}
              onChange={(next: Language) => void setLanguage(next)}
              loading={isSwitching}
              style={{ minWidth: 220 }}
              aria-label={t('Changer la langue')}
              prefix={<GlobalOutlined />}
              options={LANGUAGE_CODES.map(code => ({
                value: code,
                // Chaque langue s'ecrit dans sa propre langue : qui cherche
                // l'arabe ne sait pas forcement lire « Arabe » en francais.
                label: (
                  <span lang={code} dir={LANGUAGES[code].dir}>
                    {LANGUAGES[code].nativeName}
                  </span>
                )
              }))}
            />
          </div>

          <Divider />

          <div>
            <Link to="/forgot-password">{t('Changer le mot de passe')}</Link>
          </div>
        </Space>
      </Card>
    </div>
  );
};
