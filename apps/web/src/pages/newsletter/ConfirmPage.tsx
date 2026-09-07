import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Result, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import apiClient from '../../utils/api-client';

export function ConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Lien de confirmation invalide.');
      return;
    }
    (async () => {
      try {
        const { data } = await apiClient.get('/newsletter/confirm', { params: { token } });
        setStatus(data?.success ? 'success' : 'error');
        setMessage(data?.message || 'Votre inscription a été confirmée.');
      } catch (err: any) {
        setStatus('error');
        setMessage(err?.response?.data?.message || 'Impossible de contacter le serveur. Réessayez plus tard.');
      }
    })();
  }, [token]);

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Confirmation en cours..." />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ maxWidth: 480, width: '100%' }}>
        {status === 'success' ? (
          <Result
            status="success"
            icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            title="Inscription confirmée"
            subTitle={message}
            extra={
              <a href="/" className="ant-btn ant-btn-primary">
                Retour à l'accueil
              </a>
            }
          />
        ) : (
          <Result
            status="error"
            icon={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
            title="Erreur"
            subTitle={message}
            extra={
              <a href="/" className="ant-btn ant-btn-primary">
                Retour à l'accueil
              </a>
            }
          />
        )}
      </Card>
    </div>
  );
}
