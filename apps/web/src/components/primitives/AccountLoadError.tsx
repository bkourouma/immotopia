import React, { useEffect, useRef, useState } from 'react';
import { StateBlock } from './StateBlock';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/t';

/**
 * `<AccountLoadError>` — le compte ou l'agence n'ont pas pu être chargés parce
 * que l'API ne répond pas (réseau coupé, délai, 5xx).
 *
 * Ce n'est ni une perte de session (on ne renvoie pas vers la connexion), ni
 * « aucune agence » (on ne sait pas encore). Un seul geste : réessayer.
 */
export const AccountLoadError: React.FC = () => {
  const { retryLoad } = useAuth();
  const anchor = useRef<HTMLDivElement>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    anchor.current?.focus();
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryLoad?.();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div ref={anchor} tabIndex={-1} style={{ outline: 'none' }} data-testid="account-load-error">
      <StateBlock
        variant="error"
        title={t('Impossible de charger votre compte.')}
        description={t('Le service ne répond pas. Vérifiez votre connexion, puis réessayez.')}
        detail={retrying ? t('Nouvelle tentative…') : undefined}
        actions={[{ label: t('Réessayer'), onClick: handleRetry, primary: true }]}
      />
    </div>
  );
};
