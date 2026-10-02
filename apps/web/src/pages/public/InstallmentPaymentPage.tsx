import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Descriptions, Result, Space, Spin, Tag, Typography } from 'antd';
import {
  fetchPublicInstallmentPayment,
  isSafeCheckoutUrl,
  startPublicInstallmentPayment,
  type PublicInstallmentPaymentResult
} from '../../services/public-installment-payment-service';
import type {
  InstallmentPaymentMethod,
  InstallmentPaymentPublicDto
} from '../../types/installment-payment-public-types';
import { MoneyValue } from '../../components/primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import { redirectToExternalUrl } from '../../utils/external-redirect';

const { Title, Text } = Typography;

type ViewState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; payment: InstallmentPaymentPublicDto };

type ActionError = 'conflict' | 'review_pending' | 'rate_limited' | 'unavailable' | 'bad_url' | null;

/**
 * Lit le jeton dans le fragment (`#<jeton>`) puis retire le fragment de la barre
 * d'adresse : il ne reste ni dans l'historique ni dans une capture d'écran.
 */
function consumeTokenFromHash(): string | null {
  const token = window.location.hash.replace(/^#/, '').trim();
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  } catch {
    // Sans importance : le jeton est déjà lu.
  }
  return token || null;
}

/** Ajoute des balises <meta> le temps que la page est montée ; retourne le nettoyage. */
function installMeta(entries: Array<{ name: string; content: string }>): () => void {
  const created = entries.map(({ name, content }) => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    document.head.appendChild(meta);
    return meta;
  });
  return () => created.forEach(meta => meta.remove());
}

/** (2026, 9) -> « septembre 2026 » dans la langue affichée. */
function periodLabel(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  if (Number.isNaN(date.getTime())) return `${month}/${year}`;
  return date.toLocaleDateString(activeLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(activeLocale(), { timeZone: 'UTC' });
}

function reviewPendingMessage(): string {
  return t("Votre paiement est en cours de vérification par l'agence. Contactez votre agence si le problème persiste.");
}

function methodLabel(method: InstallmentPaymentMethod): string {
  if (method === 'WAVE') return t('Wave');
  if (method === 'ORANGE_MONEY') return t('Orange Money');
  if (method === 'MTN_MONEY') return t('MTN Money');
  if (method === 'MOOV_MONEY') return t('Moov Money');
  return method;
}

function actionErrorMessage(error: Exclude<ActionError, null>): string {
  if (error === 'review_pending') return reviewPendingMessage();
  if (error === 'conflict') {
    return t('Un paiement est déjà en cours pour cette échéance. Patientez quelques minutes puis réessayez.');
  }
  if (error === 'rate_limited') return t('Trop de tentatives, réessayez dans quelques minutes.');
  if (error === 'bad_url') return t("Le paiement n'a pas pu être lancé. Réessayez ou contactez votre agence.");
  return t('Service momentanément indisponible, réessayez dans quelques minutes.');
}

/**
 * Page publique de paiement d'un loyer (lien sécurisé, spec 039). Sans session :
 * le jeton vient du fragment de l'adresse et part dans le corps d'un POST. Le montant
 * affiché est celui du serveur ; l'URL de paiement est celle du serveur, suivie
 * seulement si elle est absolue en https (jamais construite par la page).
 */
export const InstallmentPaymentPage: React.FC = () => {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [paying, setPaying] = useState(false);
  const [actionError, setActionError] = useState<ActionError>(null);
  const [attempt, setAttempt] = useState(0);
  // Le jeton survit au double montage de React.StrictMode : le fragment n'est lu qu'une fois.
  const tokenRef = useRef<string | null | undefined>(undefined);
  // Requête d'ouverture partagée entre les deux montages de StrictMode : un seul POST par jeton.
  const requestRef = useRef<{ token: string; promise: Promise<PublicInstallmentPaymentResult> } | null>(null);
  const payingRef = useRef(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t('Paiement du loyer');
    const removeMeta = installMeta([
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' }
    ]);
    return () => {
      document.title = previousTitle;
      removeMeta();
    };
  }, []);

  // Un nouveau jeton collé dans la barre d'adresse (même page) relance l'ouverture.
  useEffect(() => {
    const onHashChange = () => {
      const token = consumeTokenFromHash();
      if (!token) return;
      tokenRef.current = token;
      requestRef.current = null;
      payingRef.current = false;
      setPaying(false);
      setActionError(null);
      setView({ kind: 'loading' });
      setAttempt(value => value + 1);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Retour depuis la page du fournisseur (bouton « précédent », cache arrière/avant) :
  // la page est restaurée telle quelle, bouton bloqué sur « en cours ». On le libère.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      payingRef.current = false;
      setPaying(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    if (tokenRef.current === undefined) tokenRef.current = consumeTokenFromHash();
    const token = tokenRef.current;
    if (!token) {
      setView({ kind: 'invalid' });
      return undefined;
    }
    if (requestRef.current?.token !== token) {
      requestRef.current = { token, promise: fetchPublicInstallmentPayment(token) };
    }
    let cancelled = false;
    void requestRef.current.promise.then(result => {
      if (cancelled) return;
      if (result.status === 'ok') setView({ kind: 'ok', payment: result.payment });
      else setView({ kind: result.status });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const onPay = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    setActionError(null);
    const result = await startPublicInstallmentPayment(token);
    // Un autre jeton est arrivé pendant l'appel (hashchange) : ce résultat ne le concerne pas.
    if (tokenRef.current !== token) return;
    if (result.status === 'ok') {
      if (isSafeCheckoutUrl(result.checkoutUrl)) {
        // On reste « en cours » : la page quitte pour le fournisseur de paiement.
        redirectToExternalUrl(result.checkoutUrl);
        return;
      }
      setActionError('bad_url');
    } else if (result.status === 'invalid') {
      setView({ kind: 'invalid' });
    } else if (result.status === 'conflict') {
      setActionError(result.reviewPending ? 'review_pending' : 'conflict');
    } else {
      setActionError(result.status);
    }
    payingRef.current = false;
    setPaying(false);
  }, []);

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px', background: 'var(--color-bg-layout, #f5f5f5)' }}>
      <div style={{ maxWidth: 560, marginInline: 'auto' }}>
        {view.kind === 'loading' ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <Spin size="large" aria-label={t('Chargement du paiement')} />
          </div>
        ) : null}
        {view.kind === 'invalid' ? <Result status="warning" title={t('Lien invalide ou expiré')} /> : null}
        {view.kind === 'rate_limited' ? (
          <Result status="warning" title={t('Trop de tentatives, réessayez dans quelques minutes.')} />
        ) : null}
        {view.kind === 'unavailable' ? (
          <Result status="warning" title={t('Service momentanément indisponible, réessayez dans quelques minutes.')} />
        ) : null}
        {view.kind === 'ok' ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">{view.payment.agencyName}</Text>
              <Title level={2} style={{ margin: 0 }}>
                {t('Paiement du loyer — {{period}}', {
                  period: periodLabel(view.payment.periodYear, view.payment.periodMonth)
                })}
              </Title>
            </div>

            {view.payment.simulated ? (
              <Alert
                type="info"
                showIcon
                message={t('Mode test')}
                description={t('Ce paiement est simulé : aucun argent ne sera débité.')}
              />
            ) : null}
            {view.payment.reviewPending ? <Alert type="warning" showIcon message={reviewPendingMessage()} /> : null}
            {view.payment.paymentInProgress && !view.payment.reviewPending ? (
              <Alert
                type="warning"
                showIcon
                message={t(
                  "Un paiement est déjà en cours pour cette échéance. Si vous l'avez déjà lancé, patientez quelques minutes avant de réessayer."
                )}
              />
            ) : null}

            <Card>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={t('Période')}>
                  {periodLabel(view.payment.periodYear, view.payment.periodMonth)}
                </Descriptions.Item>
                <Descriptions.Item label={t('Échéance')}>{dateLabel(view.payment.dueDate)}</Descriptions.Item>
                <Descriptions.Item label={t('Montant dû')}>
                  <strong style={{ fontSize: 20 }}>
                    <bdi dir="ltr">
                      <MoneyValue value={view.payment.amountDue} currency={view.payment.currency} />
                    </bdi>
                  </strong>
                </Descriptions.Item>
                <Descriptions.Item label={t('Moyens de paiement')}>
                  <Space size={[4, 4]} wrap>
                    {view.payment.paymentMethods.map(method => (
                      <Tag key={method}>{methodLabel(method)}</Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {actionError ? <Alert type="error" showIcon message={actionErrorMessage(actionError)} /> : null}

            <Button
              type="primary"
              size="large"
              block
              loading={paying}
              disabled={paying || view.payment.reviewPending}
              onClick={() => void onPay()}
            >
              {t('Payer maintenant')}
            </Button>

            <Text type="secondary">
              {t('Ce lien expire le {{date}}.', {
                date: new Date(view.payment.expiresAt).toLocaleString(activeLocale())
              })}
            </Text>
          </Space>
        ) : null}
      </div>
    </div>
  );
};

export default InstallmentPaymentPage;
