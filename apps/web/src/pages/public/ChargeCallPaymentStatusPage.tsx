import React, { useEffect, useRef, useState } from 'react';
import { Descriptions, Result, Spin } from 'antd';
import {
  fetchPublicChargeCallPaymentStatus,
  type ChargeCallPaymentStatusDto,
  type ChargeCallPaymentStatusResult
} from '../../services/charge-call-payment-link-service';
import { MoneyValue } from '../../components/primitives';
import { t } from '../../i18n/t';

/** Intervalle entre deux lectures du statut tant que le paiement est en cours. */
export const STATUS_POLL_INTERVAL_MS = 3000;
/** Délai de reprise après un 429 ou une panne passagère, une fois un état obtenu. */
export const STATUS_POLL_RETRY_INTERVAL_MS = 6000;
/** Borne totale du sondage : environ 2 minutes. */
export const STATUS_POLL_MAX_MS = 120000;
/** Clé de `sessionStorage` : permet à un rechargement de reprendre la vérification. */
export const STATUS_CODE_STORAGE_KEY = 'immotopia:charge-call-payment-code';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; payment: ChargeCallPaymentStatusDto; timedOut: boolean; canResume: boolean };

function storeCode(code: string): boolean {
  try {
    window.sessionStorage.setItem(STATUS_CODE_STORAGE_KEY, code);
    return window.sessionStorage.getItem(STATUS_CODE_STORAGE_KEY) === code;
  } catch {
    return false;
  }
}

function forgetCode(): void {
  try {
    window.sessionStorage.removeItem(STATUS_CODE_STORAGE_KEY);
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

/**
 * Lit le code de paiement dans `?paiement=` puis efface toute la query de la barre
 * d'adresse. À défaut (rechargement), reprend le code gardé dans `sessionStorage`.
 * Le code n'est qu'un identifiant à demander au serveur, jamais une preuve.
 */
function consumeCode(): { code: string | null; stored: boolean } {
  const fromUrl = new URLSearchParams(window.location.search).get('paiement')?.trim() ?? '';
  try {
    window.history.replaceState(null, '', window.location.pathname);
  } catch {
    // Sans importance : le code est déjà lu.
  }
  if (fromUrl) return { code: fromUrl, stored: storeCode(fromUrl) };
  try {
    const kept = window.sessionStorage.getItem(STATUS_CODE_STORAGE_KEY)?.trim() ?? '';
    return { code: kept || null, stored: Boolean(kept) };
  } catch {
    return { code: null, stored: false };
  }
}

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

const PaymentSummary: React.FC<{ payment: ChargeCallPaymentStatusDto }> = ({ payment }) => (
  <Descriptions column={1} size="small" bordered style={{ textAlign: 'start', maxWidth: 420, marginInline: 'auto' }}>
    <Descriptions.Item label={t('Copropriété')}>{payment.syndicateName}</Descriptions.Item>
    <Descriptions.Item label={t('Période')}>{payment.period}</Descriptions.Item>
    <Descriptions.Item label={t('Montant')}>
      <bdi dir="ltr">
        <MoneyValue value={payment.amount} currency={payment.currency} />
      </bdi>
    </Descriptions.Item>
  </Descriptions>
);

/**
 * Page publique de retour de paiement d'un appel de charges (spec 042). Le statut
 * affiché vient uniquement de la réponse du serveur, qui le tient du fournisseur :
 * l'adresse (`?paiement=…&statut=…`) ne prouve rien. Le serveur présente un paiement
 * en vérification comme « en cours » et un paiement expiré comme « annulé ».
 */
export const ChargeCallPaymentStatusPage: React.FC = () => {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  // Le code survit au double montage de React.StrictMode : la query n'est lue qu'une fois.
  const codeRef = useRef<{ code: string | null; stored: boolean } | undefined>(undefined);
  // Première lecture partagée entre les deux montages de StrictMode : un seul POST initial.
  const firstRequestRef = useRef<Promise<ChargeCallPaymentStatusResult> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t('Statut du paiement');
    const removeMeta = installMeta([
      { name: 'robots', content: t('noindex, nofollow') },
      { name: 'referrer', content: 'no-referrer' }
    ]);
    return () => {
      document.title = previousTitle;
      removeMeta();
    };
  }, []);

  useEffect(() => {
    if (codeRef.current === undefined) codeRef.current = consumeCode();
    const { code, stored } = codeRef.current;
    if (!code) {
      setView({ kind: 'invalid' });
      return undefined;
    }
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    const startedAt = startedAtRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: ChargeCallPaymentStatusDto | null = null;

    const expired = () => Date.now() - startedAt >= STATUS_POLL_MAX_MS;

    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        void fetchPublicChargeCallPaymentStatus(code).then(handle);
      }, delay);
    };

    const handle = (result: ChargeCallPaymentStatusResult) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        last = result.payment;
        const pending = result.payment.status === 'PENDING';
        if (!pending) forgetCode();
        const timedOut = pending && expired();
        setView({ kind: 'ok', payment: result.payment, timedOut, canResume: stored });
        if (pending && !timedOut) schedule(STATUS_POLL_INTERVAL_MS);
        return;
      }
      // Un 429 ou une panne passagère ne remplacent pas un « en cours » déjà obtenu :
      // on le garde à l'écran et on reprend le sondage un peu plus tard, dans la même borne.
      if (last && (result.status === 'rate_limited' || result.status === 'unavailable')) {
        if (expired()) setView({ kind: 'ok', payment: last, timedOut: true, canResume: stored });
        else schedule(STATUS_POLL_RETRY_INTERVAL_MS);
        return;
      }
      if (result.status === 'invalid') forgetCode();
      setView({ kind: result.status });
    };

    if (!firstRequestRef.current) firstRequestRef.current = fetchPublicChargeCallPaymentStatus(code);
    void firstRequestRef.current.then(handle);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const payment = view.kind === 'ok' ? view.payment : null;

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px', background: 'var(--color-bg-layout, #f5f5f5)' }}>
      <div style={{ maxWidth: 560, marginInline: 'auto' }} role="status" aria-live="polite">
        {view.kind === 'loading' ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <Spin size="large" aria-label={t('Vérification du paiement')} />
          </div>
        ) : null}
        {view.kind === 'invalid' ? <Result status="warning" title={t('Lien invalide ou expiré')} /> : null}
        {view.kind === 'rate_limited' ? (
          <Result status="warning" title={t('Trop de tentatives, réessayez dans quelques minutes.')} />
        ) : null}
        {view.kind === 'unavailable' ? (
          <Result status="warning" title={t('Service momentanément indisponible, réessayez dans quelques minutes.')} />
        ) : null}
        {payment?.status === 'SUCCESS' ? (
          <Result
            status="success"
            title={t('Paiement reçu')}
            subTitle={t('Merci, votre paiement est enregistré. Un reçu vous sera adressé par votre syndic.')}
          >
            <PaymentSummary payment={payment} />
          </Result>
        ) : null}
        {payment?.status === 'FAILED' ? (
          <Result
            status="error"
            title={t('Le paiement a échoué')}
            subTitle={t("Aucun paiement n'a été enregistré. Rouvrez le lien reçu de votre syndic pour réessayer.")}
          >
            <PaymentSummary payment={payment} />
          </Result>
        ) : null}
        {payment?.status === 'CANCELED' ? (
          <Result
            status="info"
            title={t('Paiement annulé')}
            subTitle={t(
              "Aucun paiement n'a été enregistré. Si le délai est dépassé, demandez un nouveau lien à votre syndic."
            )}
          >
            <PaymentSummary payment={payment} />
          </Result>
        ) : null}
        {view.kind === 'ok' && payment?.status === 'PENDING' ? (
          <Result
            icon={view.timedOut ? undefined : <Spin size="large" aria-label={t('Paiement en cours de vérification')} />}
            status={view.timedOut ? 'info' : undefined}
            title={
              view.timedOut ? t('Vérification en cours, revenez plus tard') : t('Paiement en cours de vérification')
            }
            subTitle={
              view.timedOut
                ? view.canResume
                  ? t(
                      'Votre paiement est peut-être encore en cours de traitement. Rechargez cette page pour reprendre la vérification.'
                    )
                  : t(
                      "Votre paiement est peut-être encore en cours de traitement. Contactez votre syndic pour en connaître l'état."
                    )
                : t('Cette page se met à jour toute seule. Ne la fermez pas.')
            }
          >
            <PaymentSummary payment={payment} />
          </Result>
        ) : null}
      </div>
    </div>
  );
};

export default ChargeCallPaymentStatusPage;
