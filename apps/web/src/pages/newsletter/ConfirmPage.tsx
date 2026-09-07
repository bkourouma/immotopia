import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Result, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';

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
        const res = await fetch(`${API_URL}/newsletter/confirm?token=${encodeURIComponent(token)}`, {
          method: 'GET',
          credentials: 'include'
        });
        const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
        setStatus(data.success ? 'success' : 'error');
        setMessage(data.message || (res.ok ? 'Votre inscription a été confirmée.' : 'Une erreur est survenue.'));
      } catch {
        setStatus('error');
        setMessage('Impossible de contacter le serveur. Réessayez plus tard.');
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
