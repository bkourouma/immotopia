import React, { useEffect, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';
import { t } from '../../i18n/t';
import { getOnlinePayment, type CoOwnerOnlineCheckout } from '../../services/coowner-portal-service';
import { isNotFound } from './portal-error';

/** Intervalle et durée maximale du suivi (contrat 042 §2.4 : toutes les 3 s, environ 2 minutes). */
export const RETURN_POLL_INTERVAL_MS = 3_000;
export const RETURN_POLL_MAX_MS = 120_000;

/** Format du code de paiement (`IMS-` + 20 caractères) ; tout autre paramètre d'URL est ignoré. */
const PAYMENT_CODE_PATTERN = /^IMS-[A-Za-z0-9]{20}$/;

export function isPaymentCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && PAYMENT_CODE_PATTERN.test(value);
}

type ReturnState =
  | { kind: 'loading' }
  | { kind: 'checkout'; checkout: CoOwnerOnlineCheckout }
  | { kind: 'timeout'; checkout: CoOwnerOnlineCheckout }
  | { kind: 'notFound' }
  | { kind: 'error' };

interface Props {
  codePaiement: string;
  /** Appelé une fois, quand le suivi s'arrête (état définitif, délai écoulé ou erreur) : rafraîchit la liste. */
  onSettled?: () => void;
  intervalMs?: number;
  maxMs?: number;
}

/**
 * Bandeau de retour du fournisseur de paiement — `/copropriete/appels?paiement=<code>`.
 *
 * L'adresse ne prouve rien : n'importe qui peut y écrire `?paiement=…`. Seul le
 * statut lu à l'API (`GET /paiements-en-ligne/:codePaiement`, limité aux lots du
 * copropriétaire connecté) décide de ce qui s'affiche.
 */
export const OnlinePaymentReturn: React.FC<Props> = ({
  codePaiement,
  onSettled,
  intervalMs = RETURN_POLL_INTERVAL_MS,
  maxMs = RETURN_POLL_MAX_MS
}) => {
  const [state, setState] = useState<ReturnState>({ kind: 'loading' });
  const settledRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    settledRef.current = false;

    const settle = () => {
      if (settledRef.current) return;
      settledRef.current = true;
      onSettledRef.current?.();
    };

    const poll = async () => {
      try {
        const checkout = await getOnlinePayment(codePaiement);
        if (cancelled) return;
        // Définitif : tout sauf « en attente », et « en attente d'une décision du syndic »
        // (inutile d'interroger toutes les 3 s ce que seul un humain tranchera).
        if (checkout.status !== 'PENDING' || checkout.underReview) {
          setState({ kind: 'checkout', checkout });
          settle();
          return;
        }
        if (Date.now() - startedAt >= maxMs) {
          setState({ kind: 'timeout', checkout });
          settle();
          return;
        }
        setState({ kind: 'checkout', checkout });
        timer = setTimeout(() => void poll(), intervalMs);
      } catch (error) {
        if (cancelled) return;
        setState({ kind: isNotFound(error) ? 'notFound' : 'error' });
        settle();
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [codePaiement, intervalMs, maxMs]);

  const style = { marginBottom: 16 };

  if (state.kind === 'notFound') {
    return (
      <Alert
        type="warning"
        showIcon
        closable
        message={t('Paiement introuvable.')}
        description={t("Ce paiement n'existe pas ou ne concerne pas vos lots.")}
        style={style}
      />
    );
  }

  if (state.kind === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        closable
        message={t('Impossible de vérifier ce paiement.')}
        description={t('Actualisez la page dans quelques instants : le paiement apparaîtra dès sa confirmation.')}
        style={style}
      />
    );
  }

  if (state.kind === 'loading') {
    return (
      <Alert
        type="info"
        showIcon
        icon={<Spin size="small" />}
        message={t('Vérification du paiement en cours…')}
        style={style}
      />
    );
  }

  const { checkout } = state;
  const periods = checkout.periods.join(', ');

  if (state.kind === 'timeout') {
    return (
      <Alert
        type="warning"
        showIcon
        closable
        message={t('La confirmation prend plus de temps que prévu.')}
        description={t(
          "Le délai de suivi est écoulé. Si vous avez payé, le règlement apparaîtra automatiquement dès que le fournisseur l'aura confirmé ; sinon, vous pouvez refaire un paiement."
        )}
        style={style}
      />
    );
  }

  if (checkout.status === 'SUCCESS') {
    return (
      <Alert
        type="success"
        showIcon
        closable
        message={t('Paiement confirmé.')}
        description={
          <>
            {periods ? <div>{t('Appels réglés : {{periods}}.', { periods })}</div> : null}
            {checkout.documents.length > 0 ? (
              <div>
                {t('Numéro(s) de reçu : {{numbers}}.', {
                  numbers: checkout.documents.map(document => document.number).join(', ')
                })}
              </div>
            ) : (
              <div>{t('Votre reçu sera disponible dans « Quittances » dans quelques instants.')}</div>
            )}
          </>
        }
        style={style}
      />
    );
  }

  if (checkout.status === 'FAILED') {
    return (
      <Alert
        type="error"
        showIcon
        closable
        message={t('Le paiement a échoué.')}
        description={t("Aucun montant n'a été enregistré. Vous pouvez réessayer.")}
        style={style}
      />
    );
  }

  if (checkout.status === 'CANCELED') {
    return (
      <Alert
        type="warning"
        showIcon
        closable
        message={t('Le paiement a été annulé ou a expiré.')}
        description={t("Aucun montant n'a été enregistré. Vous pouvez réessayer.")}
        style={style}
      />
    );
  }

  if (checkout.underReview) {
    return (
      <Alert
        type="info"
        showIcon
        closable
        message={t('Paiement en cours de vérification par le syndic.')}
        description={t(
          'Votre règlement a bien été reçu mais demande une vérification. Vous serez informé dès sa validation ; inutile de payer une seconde fois.'
        )}
        style={style}
      />
    );
  }

  return (
    <Alert
      type="info"
      showIcon
      icon={<Spin size="small" />}
      message={t('Confirmation du paiement en cours…')}
      description={t('Cela prend en général quelques secondes.')}
      style={style}
    />
  );
};
