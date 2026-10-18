import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Descriptions, Input, Result, Segmented, Space, Spin, Typography } from 'antd';
import {
  declinePublicSignature,
  fetchPublicExternalLink,
  fetchPublicSignature,
  fetchPublicSignatureBlob,
  publicSignatureFileUrl,
  requestPublicOtp,
  submitPublicSignature,
  verifyPublicOtp,
  type PublicResult
} from '../../services/signature-service';
import type { PublicFailure, PublicSignatureDto, SignatureMode } from '../../types/signature-types';
import { SignaturePad } from './SignaturePad';
import { roleLabel } from './signature-labels';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Paragraph, Text, Title } = Typography;

type View =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; data: PublicSignatureDto }
  | { kind: 'signed'; requestStatus: 'COMPLETED' | 'PARTIALLY_SIGNED' }
  | { kind: 'declined' };

interface PublicSigningFlowProps {
  token: string;
  /** Appelé après une signature ou un refus enregistré (mode « sur place »). */
  onDone?: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(activeLocale());
}

/** Message affiché pour un échec d'appel public, selon le statut HTTP et le code métier. */
function failureMessage(failure: PublicFailure, action: 'otp' | 'verify' | 'sign' | 'external'): string {
  if (failure.code === 'SIGNATURE_OTP_INVALID') {
    const left = Number(failure.details?.attemptsRemaining ?? failure.details?.remainingAttempts);
    return Number.isFinite(left) && left >= 0
      ? t('Code incorrect ou expiré. Essais restants : {{n}}.', { n: left })
      : t('Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.');
  }
  if (failure.code === 'SIGNATURE_NOT_YOUR_TURN') {
    return t("Ce n'est pas encore votre tour de signer.");
  }
  if (failure.status === 'conflict') {
    return t("Le document a été modifié depuis l'envoi. Contactez l'agence pour recevoir une nouvelle demande.");
  }
  if (failure.status === 'rate_limited') {
    return failure.code === 'RATE_LIMITED' && failure.retryAfterSeconds
      ? t('Trop de tentatives. Réessayez dans {{n}} s.', { n: Math.ceil(failure.retryAfterSeconds) })
      : t("Nombre d'envois atteint : contactez l'agence.");
  }
  if (failure.status === 'unavailable') {
    return t('Service momentanément indisponible. Réessayez dans un instant.');
  }
  if (failure.httpStatus === 404) {
    return t('Lien invalide ou expiré');
  }
  if (action === 'external') {
    return t("Le lien de signature n'a pas pu être obtenu. Réessayez dans un instant.");
  }
  return action === 'otp'
    ? t("Le code n'a pas pu être envoyé. Réessayez dans un instant.")
    : t('Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.');
}

/**
 * Parcours de signature d'un signataire, par jeton : lecture du PDF, consentement,
 * code (hors « sur place »), signature saisie ou dessinée, refus motivé.
 * Réutilisé par la page publique `/signer/:token` et par la modale « sur place ».
 */
export const PublicSigningFlow: React.FC<PublicSigningFlowProps> = ({ token, onDone }) => {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [mode, setMode] = useState<SignatureMode>('TYPED');
  const [typed, setTyped] = useState('');
  const [drawn, setDrawn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  // Types « code avant consultation » : jeton remis après la vérification du code, PDF lu en blob.
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setViewToken(null);
    setCode('');
    setView({ kind: 'loading' });
    void fetchPublicSignature(token).then((result: PublicResult<PublicSignatureDto>) => {
      if (!alive) return;
      setView(
        result.status === 'ok'
          ? { kind: 'ok', data: result.data }
          : { kind: result.status === 'conflict' ? 'invalid' : result.status }
      );
    });
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  /** Le jeton de consultation a expiré (15 min) ou n'est plus accepté : retour à l'étape du code. */
  const expireView = useCallback(() => {
    setViewToken(null);
    setCode('');
    setOtpSentTo(null);
    setError(t('Votre vérification a expiré : recevez un nouveau code pour continuer.'));
  }, []);

  useEffect(() => {
    setPdfUrl(null);
    setPdfError(null);
    if (!viewToken) return undefined;
    let alive = true;
    let created: string | null = null;
    void fetchPublicSignatureBlob(token, viewToken).then(result => {
      if (!alive) return;
      if (result.status === 'ok') {
        created = URL.createObjectURL(result.data);
        setPdfUrl(created);
      } else if (result.httpStatus === 404) {
        expireView();
      } else {
        setPdfError(t("Le document n'a pas pu être chargé. Réessayez dans un instant."));
      }
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [token, viewToken, expireView]);

  const sendCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await requestPublicOtp(token);
    setBusy(false);
    if (result.status === 'ok') {
      setOtpSentTo(result.data.sentTo);
      setCountdown(Math.max(0, Math.round(result.data.retryAfterSeconds || 0)));
    } else {
      if (result.retryAfterSeconds) setCountdown(Math.ceil(result.retryAfterSeconds));
      setError(failureMessage(result, 'otp'));
    }
  }, [token]);

  if (view.kind === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (view.kind === 'invalid') {
    return (
      <Result
        status="404"
        title={t('Lien invalide ou expiré')}
        subTitle={t("Ce lien de signature n'existe pas ou n'est plus valable. Contactez l'agence qui vous l'a envoyé.")}
      />
    );
  }
  if (view.kind === 'rate_limited') {
    return <Result status="warning" title={t('Trop de demandes')} subTitle={t('Réessayez dans quelques minutes.')} />;
  }
  if (view.kind === 'unavailable') {
    return (
      <Result
        status="error"
        title={t('Service momentanément indisponible')}
        subTitle={t('Réessayez dans un instant.')}
      />
    );
  }
  if (view.kind === 'signed') {
    return (
      <Result
        status="success"
        title={t('Merci, votre signature est enregistrée')}
        subTitle={
          view.requestStatus === 'COMPLETED'
            ? t("Toutes les signatures sont réunies : l'agence vous enverra le document signé.")
            : t("Les autres signataires vont être sollicités. L'agence vous enverra le document signé.")
        }
      />
    );
  }
  if (view.kind === 'declined') {
    return (
      <Result
        status="info"
        title={t('Vous avez refusé de signer')}
        subTitle={t("L'agence a été informée. Aucune signature n'a été enregistrée.")}
      />
    );
  }

  const { request, signer, consentText } = view.data;

  if (signer.status === 'SIGNED') {
    return <Result status="success" title={t('Vous avez déjà signé ce document')} />;
  }
  if (signer.status === 'DECLINED' || request.status === 'DECLINED') {
    return <Result status="info" title={t('Cette signature a été refusée')} />;
  }
  if (request.status === 'EXPIRED') {
    return (
      <Result
        status="warning"
        title={t('Cette demande a expiré')}
        subTitle={t("Demandez à l'agence de vous envoyer un nouveau lien.")}
      />
    );
  }
  if (request.status === 'CANCELED') {
    return <Result status="warning" title={t("Cette demande a été annulée par l'agence")} />;
  }
  if (request.status === 'COMPLETED') {
    return <Result status="success" title={t('Ce document est déjà entièrement signé')} />;
  }

  if (view.data.canSign === false) {
    return (
      <Result
        status="info"
        title={t("Ce n'est pas encore votre tour")}
        subTitle={t('Vous recevrez votre lien de signature dès que les signataires précédents auront signé.')}
      />
    );
  }

  const inPerson = signer.channel === 'IN_PERSON';
  const needsCode = !inPerson;
  // Le code est alors vérifié AVANT toute consultation ; la signature porte le jeton de consultation.
  const codeBeforeView = view.data.codeRequiredBeforeView === true;
  const external = codeBeforeView && view.data.external === true;
  // Sur place, seule la signature dessinée est admise.
  const effectiveMode: SignatureMode = inPerson ? 'DRAWN' : mode;
  const signatureValue = effectiveMode === 'TYPED' ? typed.trim() : (drawn ?? '');
  const canSign = codeBeforeView
    ? Boolean(viewToken) && consent && signatureValue.length > 0 && !busy
    : consent && signatureValue.length > 0 && (!needsCode || code.trim().length >= 4) && !busy;

  const finish = (next: View) => {
    setView(next);
    onDone?.();
  };

  const sign = async () => {
    setBusy(true);
    setError(null);
    const input = {
      ...(needsCode && !codeBeforeView ? { code: code.trim() } : {}),
      consent: true as const,
      signature: { mode: effectiveMode, value: signatureValue }
    };
    // Les autres types gardent EXACTEMENT leur appel : le jeton de consultation n'existe que pour « code avant consultation ».
    const result =
      codeBeforeView && viewToken
        ? await submitPublicSignature(token, input, viewToken)
        : await submitPublicSignature(token, input);
    setBusy(false);
    if (result.status === 'ok') {
      finish({
        kind: 'signed',
        requestStatus: result.data?.requestStatus === 'COMPLETED' ? 'COMPLETED' : 'PARTIALLY_SIGNED'
      });
    } else if (codeBeforeView && result.httpStatus === 404) {
      expireView();
    } else {
      setError(failureMessage(result, 'sign'));
    }
  };

  const verifyCode = async () => {
    setBusy(true);
    setError(null);
    const result = await verifyPublicOtp(token, code.trim());
    setBusy(false);
    if (result.status === 'ok' && result.data?.viewToken) {
      setViewToken(result.data.viewToken);
      setCode('');
    } else {
      setError(
        result.status === 'ok'
          ? t('Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.')
          : failureMessage(result, 'verify')
      );
    }
  };

  const continueExternal = async () => {
    if (!viewToken) return;
    setBusy(true);
    setError(null);
    const result = await fetchPublicExternalLink(token, viewToken);
    if (result.status === 'ok' && result.data?.url) {
      // La page quitte l'application : on reste « occupé » jusqu'au changement de page.
      window.location.assign(result.data.url);
      return;
    }
    setBusy(false);
    if (result.status !== 'ok' && result.httpStatus === 404) {
      expireView();
    } else {
      setError(
        result.status === 'ok'
          ? t("Le lien de signature n'a pas pu être obtenu. Réessayez dans un instant.")
          : failureMessage(result, 'external')
      );
    }
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    const cleaned = reason.trim() || undefined;
    const result =
      codeBeforeView && viewToken
        ? await declinePublicSignature(token, cleaned, viewToken)
        : await declinePublicSignature(token, cleaned);
    setBusy(false);
    if (result.status === 'ok') {
      finish({ kind: 'declined' });
    } else {
      setError(t("Le refus n'a pas pu être enregistré. Réessayez dans un instant."));
    }
  };

  const fileUrl = publicSignatureFileUrl(token);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Title level={4} style={{ marginBottom: 4 }}>
          {request.title}
        </Title>
        <Text type="secondary">
          {t('Signataire : {{nom}} ({{role}})', { nom: signer.fullName, role: roleLabel(signer.role) })}
        </Text>
      </div>

      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label={t('Valable jusqu’au')}>{formatDate(request.expiresAt)}</Descriptions.Item>
      </Descriptions>

      {codeBeforeView ? (
        viewToken ? (
          <div>
            {pdfUrl ? (
              <>
                <iframe
                  title={t('Document à signer')}
                  src={pdfUrl}
                  style={{
                    width: '100%',
                    height: '60vh',
                    minHeight: 320,
                    border: '1px solid #d1d5db',
                    borderRadius: 8
                  }}
                />
                <a href={pdfUrl} download={`${request.title}.pdf`}>
                  {t('Télécharger le document (PDF)')}
                </a>
              </>
            ) : pdfError ? (
              <Alert type="error" showIcon message={pdfError} />
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin />
              </div>
            )}
          </div>
        ) : (
          <div>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={t('Le document s’affichera après la vérification de votre code.')}
            />
            <Paragraph style={{ marginBottom: 8 }}>
              {otpSentTo
                ? t('Un code a été envoyé à {{contact}}.', { contact: otpSentTo })
                : t('Pour confirmer votre identité, recevez un code sur {{contact}}.', {
                    contact: signer.maskedContact
                  })}
            </Paragraph>
            <Space wrap>
              <Button onClick={() => void sendCode()} disabled={busy || countdown > 0}>
                {countdown > 0
                  ? t('Renvoyer le code dans {{n}} s', { n: countdown })
                  : otpSentTo
                    ? t('Renvoyer le code')
                    : t('Recevoir le code')}
              </Button>
              <Input
                value={code}
                onChange={event => setCode(event.target.value.replace(/\s/g, ''))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder={t('Code reçu')}
                aria-label={t('Code reçu')}
                style={{ width: 140 }}
              />
              <Button type="primary" disabled={busy || code.trim().length < 4} onClick={() => void verifyCode()}>
                {t('Vérifier le code')}
              </Button>
            </Space>
          </div>
        )
      ) : (
        <div>
          <iframe
            title={t('Document à signer')}
            src={fileUrl}
            style={{ width: '100%', height: '60vh', minHeight: 320, border: '1px solid #d1d5db', borderRadius: 8 }}
          />
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" download>
            {t('Télécharger le document (PDF)')}
          </a>
        </div>
      )}

      {!(codeBeforeView && (!viewToken || external)) && (
        <Checkbox checked={consent} onChange={event => setConsent(event.target.checked)}>
          {consentText}
        </Checkbox>
      )}

      {needsCode && !codeBeforeView && (
        <div>
          <Paragraph style={{ marginBottom: 8 }}>
            {otpSentTo
              ? t('Un code a été envoyé à {{contact}}.', { contact: otpSentTo })
              : t('Pour confirmer votre identité, recevez un code sur {{contact}}.', { contact: signer.maskedContact })}
          </Paragraph>
          <Space wrap>
            <Button onClick={() => void sendCode()} disabled={busy || countdown > 0}>
              {countdown > 0
                ? t('Renvoyer le code dans {{n}} s', { n: countdown })
                : otpSentTo
                  ? t('Renvoyer le code')
                  : t('Recevoir le code')}
            </Button>
            <Input
              value={code}
              onChange={event => setCode(event.target.value.replace(/\s/g, ''))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder={t('Code reçu')}
              aria-label={t('Code reçu')}
              style={{ width: 140 }}
            />
          </Space>
        </div>
      )}

      {!(codeBeforeView && (!viewToken || external)) && (
        <div>
          {!inPerson && (
            <Segmented<SignatureMode>
              value={mode}
              onChange={value => {
                setMode(value);
                // Un ancien dessin ne doit jamais être soumis après un aller-retour.
                setDrawn(null);
              }}
              options={[
                { label: t('Saisir mon nom'), value: 'TYPED' },
                { label: t('Dessiner'), value: 'DRAWN' }
              ]}
              style={{ marginBottom: 12 }}
            />
          )}
          {effectiveMode === 'TYPED' ? (
            <Input
              value={typed}
              onChange={event => setTyped(event.target.value)}
              placeholder={t('Tapez votre nom complet')}
              aria-label={t('Tapez votre nom complet')}
              size="large"
              style={{ fontStyle: 'italic' }}
            />
          ) : (
            <SignaturePad onChange={setDrawn} />
          )}
        </div>
      )}

      {error && <Alert type="error" showIcon message={error} />}

      {external && viewToken && (
        <Button type="primary" size="large" block loading={busy} onClick={() => void continueExternal()}>
          {t('Continuer vers la signature')}
        </Button>
      )}

      {!(codeBeforeView && (!viewToken || external)) && (
        <Button type="primary" size="large" block disabled={!canSign} loading={busy} onClick={() => void sign()}>
          {t('Signer le document')}
        </Button>
      )}

      {codeBeforeView && !viewToken ? null : declining ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input.TextArea
            value={reason}
            onChange={event => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('Motif du refus (facultatif)')}
            aria-label={t('Motif du refus (facultatif)')}
          />
          <Space>
            <Button danger loading={busy} onClick={() => void decline()}>
              {t('Confirmer le refus')}
            </Button>
            <Button onClick={() => setDeclining(false)}>{t('Annuler')}</Button>
          </Space>
        </Space>
      ) : (
        <Button type="link" danger onClick={() => setDeclining(true)} style={{ paddingInlineStart: 0 }}>
          {t('Refuser de signer')}
        </Button>
      )}
    </Space>
  );
};
