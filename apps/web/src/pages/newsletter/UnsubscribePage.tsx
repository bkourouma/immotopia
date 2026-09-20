import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Result, Button, Checkbox, Form, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import apiClient from '../../utils/api-client';
import { t } from '../../i18n/t';

export function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'form' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');
  const [unsubscribeAll, setUnsubscribeAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('Lien de désinscription invalide ou expiré.'));
      return;
    }
    setStatus('form');
  }, [token]);

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const { data } = await apiClient.post('/newsletter/unsubscribe', { token, unsubscribeAll });
      if (data?.success) {
        setStatus('success');
        setMessage(
          unsubscribeAll ? t('Vous êtes désabonné de toutes nos listes.') : t('Vous avez été désabonné avec succès.')
        );
      } else {
        setStatus('error');
        setMessage(
          data?.message ||
            t(
              'Ce lien de désinscription est invalide ou a déjà été utilisé. Utilisez le lien présent dans un email plus récent.'
            )
        );
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.response?.data?.message || t('Impossible de contacter le serveur. Réessayez plus tard.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Card style={{ maxWidth: 480 }}>
          <Result
            status="error"
            title={t('Lien invalide')}
            subTitle={t('Le lien de désinscription est invalide ou a expiré.')}
          />
        </Card>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Chargement..." />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ maxWidth: 480, width: '100%' }}>
        {status === 'form' ? (
          <>
            <Result
              icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              title={t('Confirmer la désinscription')}
              subTitle={t('Souhaitez-vous vous désabonner de cette newsletter ?')}
            />
            <Form onFinish={handleSubmit} layout="vertical">
              <Form.Item>
                <Checkbox checked={unsubscribeAll} onChange={e => setUnsubscribeAll(e.target.checked)}>
                  {t('Me désabonner de toutes les newsletters de cet organisme')}
                </Checkbox>
              </Form.Item>
              <Form.Item>
                <Button type="primary" danger htmlType="submit" loading={submitting} block>
                  {t('Confirmer la désinscription')}
                </Button>
              </Form.Item>
            </Form>
          </>
        ) : status === 'success' ? (
          <Result
            status="success"
            title={t('Désinscription effectuée')}
            subTitle={message}
            extra={
              <Button type="primary" href="/">
                {t("Retour à l'accueil")}
              </Button>
            }
          />
        ) : (
          <Result
            status="error"
            title={t('Erreur')}
            subTitle={message}
            extra={
              <Button type="primary" href="/">
                {t("Retour à l'accueil")}
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
}
