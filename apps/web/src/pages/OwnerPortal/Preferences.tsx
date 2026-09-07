import React, { useState, useEffect } from 'react';
import { Card, Switch, Typography, Spin, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';

const { Title, Paragraph } = Typography;

export default function OwnerPreferences() {
  const [loading, setLoading] = useState(true);
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const res = await ownerPortalService.getPreferences();
      if (res.data?.success && res.data?.data) {
        setNewsletterConsent(res.data.data.newsletterConsent ?? false);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e.response?.data?.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleNewsletterChange = async (checked: boolean) => {
    try {
      setSaving(true);
      await ownerPortalService.updatePreferences({ newsletterConsent: checked });
      setNewsletterConsent(checked);
      message.success(checked ? 'Vous recevrez les newsletters.' : 'Vous ne recevrez plus les newsletters.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <Title level={4}>Préférences</Title>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <MailOutlined style={{ fontSize: 24, color: '#1890ff', marginTop: 4 }} />
          <div>
            <Typography.Text strong>Recevoir la newsletter</Typography.Text>
            <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 8 }}>
              Acceptez de recevoir les newsletters et communications de votre agence (actualités, conseils, offres).
            </Paragraph>
            <Switch
              checked={newsletterConsent}
              onChange={handleNewsletterChange}
              loading={saving}
              checkedChildren="Oui"
              unCheckedChildren="Non"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
