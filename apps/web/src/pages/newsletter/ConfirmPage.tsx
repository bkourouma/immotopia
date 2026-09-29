import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Result, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import apiClient from '../../utils/api-client';
import { t } from '../../i18n/t';

export function ConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');
  // React.StrictMode rejoue l'effet en développement, et un lien rechargé le
  // rejoue aussi : sans garde, le second appel (déjà confirmé) écrasait le succès.
  const confirmedToken = useRef<string | null>(null);

  useEffect(() => {
    if (token && confirmedToken.current === token) return;
    if (!token) {
      setStatus('error');
      setMessage(t('Lien de confirmation invalide.'));
      return;
    }
    confirmedToken.current = token;
    (async () => {
      try {
        const { data } = await apiClient.get('/newsletter/confirm', { params: { token } });
        setStatus(data?.success ? 'success' : 'error');
        setMessage(data?.message || t('Votre inscription a été confirmée.'));
      } catch (err: any) {
        setStatus('error');
        setMessage(err?.response?.data?.message || t('Impossible de contacter le serveur. Réessayez plus tard.'));
      }
    })();
  }, [token]);

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip={t('Confirmation en cours...')} />
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
            title={t('Inscription confirmée')}
            subTitle={message}
            extra={
              <a href="/" className="ant-btn ant-btn-primary">
                {t("Retour à l'accueil")}
              </a>
            }
          />
        ) : (
          <Result
            status="error"
            icon={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
            title={t('Erreur')}
            subTitle={message}
            extra={
              <a href="/" className="ant-btn ant-btn-primary">
                {t("Retour à l'accueil")}
              </a>
            }
          />
        )}
      </Card>
    </div>
  );
}
