import React, { useState, useEffect, useCallback } from 'react';
import { App, Card, Space, Switch, Typography } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { PageHeader, SkeletonList, StateBlock } from '../../components/primitives';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';

const { Paragraph } = Typography;

export default function OwnerPreferences() {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  // Un échec de lecture ne doit pas afficher l'interrupteur sur « Non » : ce serait un faux réglage.
  const [loadFailed, setLoadFailed] = useState(false);

  // Memoise sur `message`, seule dependance externe, elle-meme stable :
  // le contexte d'<App> est memoise (antd/es/app/App.js). Sans useCallback, la
  // fonction serait recreee a chaque rendu et l'effet tournerait en boucle.
  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const res = await ownerPortalService.getPreferences();
      if (res.data?.success && res.data?.data) {
        setNewsletterConsent(res.data.data.newsletterConsent ?? false);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLoadFailed(true);
      message.error(e.response?.data?.message || t('Erreur lors du chargement'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleNewsletterChange = async (checked: boolean) => {
    try {
      setSaving(true);
      await ownerPortalService.updatePreferences({ newsletterConsent: checked });
      setNewsletterConsent(checked);
      message.success(checked ? t('Vous recevrez les newsletters.') : t('Vous ne recevrez plus les newsletters.'));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e.response?.data?.message || t('Erreur lors de la mise à jour'));
    } finally {
      setSaving(false);
    }
  };

  const header = <PageHeader title={t('Préférences')} />;

  if (loading) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {header}
        <SkeletonList rows={1} aria-label={t('Chargement des préférences')} />
      </Space>
    );
  }

  if (loadFailed) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {header}
        <StateBlock
          variant="error"
          title={t('Impossible de charger vos préférences')}
          actions={[{ label: t('Réessayer'), onClick: () => void loadPreferences(), primary: true }]}
        />
      </Space>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {header}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <MailOutlined style={{ fontSize: 24, color: '#1890ff', marginTop: 4 }} />
          <div>
            <Typography.Text strong>
              <HelpSectionTitle
                title={t('Recevoir la newsletter')}
                helpId="portails.proprietaire.preferences.newsletter"
              />
            </Typography.Text>
            <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 8 }}>
              {t(
                'Acceptez de recevoir les newsletters et communications de votre agence (actualités, conseils, offres).'
              )}
            </Paragraph>
            <Switch
              checked={newsletterConsent}
              onChange={handleNewsletterChange}
              loading={saving}
              aria-label={t('Recevoir la newsletter')}
              checkedChildren={t('Oui')}
              unCheckedChildren={t('Non')}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
