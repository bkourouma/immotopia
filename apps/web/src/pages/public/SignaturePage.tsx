import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Result } from 'antd';
import { PublicSigningFlow } from '../../components/signature/PublicSigningFlow';
import { t } from '../../i18n/t';

/**
 * Page publique `/signer/:token` (spec 044) : hors coquille authentifiée,
 * mobile d'abord. Le jeton est le seul élément de l'URL ; la page demande
 * aux moteurs de ne pas l'indexer et de ne pas transmettre l'adresse en referrer.
 */
export const SignaturePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  useEffect(() => {
    const metas = [
      { name: 'robots', content: t('noindex, nofollow') },
      { name: 'referrer', content: 'no-referrer' }
    ].map(({ name, content }) => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', name);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
      return meta;
    });
    return () => metas.forEach(meta => meta.remove());
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '16px 12px' }}>
      {token ? (
        <Card>
          <PublicSigningFlow token={token} />
        </Card>
      ) : (
        <Result status="404" title={t('Lien invalide ou expiré')} />
      )}
    </main>
  );
};
