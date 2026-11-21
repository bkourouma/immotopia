import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyEmail, resendVerification } from '../services/auth-service';
import { t } from '../i18n/t';

export const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'resend'>('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage(t('Token de vérification manquant.'));
      return;
    }

    const verify = async () => {
      try {
        await verifyEmail(token);
        setStatus('success');
        setMessage(t('Email vérifié avec succès ! Vous allez être redirigé vers la page de connexion...'));
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } catch (error: any) {
        setStatus('error');
        setMessage(error.response?.data?.message || t("Une erreur est survenue lors de la vérification de l'email."));
      }
    };

    verify();
  }, [searchParams, navigate]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setMessage(t('Veuillez entrer votre adresse email.'));
      return;
    }

    // Un seul envoi à la fois : évite les doubles clics qui multiplient les e-mails.
    if (isResending) return;
    setIsResending(true);
    try {
      await resendVerification(email);
      setStatus('resend');
      setMessage(
        t("Si cette adresse email existe et n'est pas encore vérifiée, un nouvel email de vérification a été envoyé.")
      );
    } catch (error: any) {
      setMessage(error.response?.data?.message || t("Une erreur est survenue lors de l'envoi de l'email."));
    } finally {
      setIsResending(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('Vérification de votre email en cours...')}</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-md rounded-lg p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-semibold text-gray-900">{t('Email vérifié !')}</h1>
            <p className="mt-2 text-sm text-gray-600">{message}</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              {t('Aller à la page de connexion')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-md rounded-lg p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-semibold text-gray-900">{t('Erreur de vérification')}</h1>
            <p role="alert" className="mt-2 text-sm text-red-600">
              {message}
            </p>
            <p className="mt-2 text-sm text-gray-600">
              {t('Le lien est peut-être expiré. Saisissez votre adresse pour en recevoir un nouveau.')}
            </p>

            <form onSubmit={handleResend} className="mt-6">
              <div className="text-start">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  {t('Adresse email')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="mt-1 block w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                  placeholder={t('vous@example.com')}
                />
              </div>
              <button
                type="submit"
                disabled={isResending}
                aria-busy={isResending}
                className="mt-4 w-full flex justify-center items-center min-h-[44px] py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResending ? t('Envoi en cours...') : t("Renvoyer l'email de vérification")}
              </button>
            </form>

            <button
              onClick={() => navigate('/login')}
              className="mt-4 w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              {t('Retour à la connexion')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Resend success
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-md rounded-lg p-6">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">{t('Email envoyé')}</h1>
          <p className="mt-2 text-sm text-gray-600">{message}</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          >
            {t('Retour à la connexion')}
          </button>
        </div>
      </div>
    </div>
  );
};
