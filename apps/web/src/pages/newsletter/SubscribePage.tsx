import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Typography } from 'antd';
import { SubscriptionForm } from '../../components/newsletter/SubscriptionForm';

/**
 * Page publique d'inscription à une newsletter.
 * Utilise le token dans l'URL : /newsletter/subscribe?token=lst_xxxx
 */
export function SubscribePage() {
  const [searchParams] = useSearchParams();
  const listToken = searchParams.get('token') || undefined;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ maxWidth: 420, width: '100%' }}>
        <Typography.Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>
          Inscription à la newsletter
        </Typography.Title>
        {listToken ? (
          <SubscriptionForm listToken={listToken} submitLabel="S'inscrire" showName={true} />
        ) : (
          <Typography.Text type="secondary">
            Lien d'inscription invalide. Utilisez le lien fourni dans l'invitation.
          </Typography.Text>
        )}
      </Card>
    </div>
  );
}
