import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { register } from '../services/auth-service';
import { PasswordStrength } from '../components/PasswordStrength';
import { RegisterData } from '../types/auth-types';
import { API_ORIGIN } from '../config/api';
import { t } from '../i18n/t';

/** Champs que le formulaire sait afficher sous leur saisie. */
const CHAMPS_DU_FORMULAIRE = ['fullName', 'email', 'password', 'confirmPassword'];

/**
 * Traduit le refus du serveur en erreurs d'écran.
 *
 * Une erreur de champ s'affiche sous sa saisie, mais le bandeau `general` est
 * TOUJOURS posé : sans lui, un refus portant sur un champ que le formulaire ne
 * montre pas (ou une erreur de champ passée inaperçue plus bas dans la page)
 * laissait l'écran muet, sans que la personne sache que l'inscription avait
 * échoué.
 */
function erreursDeInscription(error: unknown): Record<string, string> {
  const data = (
    error as {
      response?: { data?: { message?: string; errors?: Array<{ field?: string; message?: string }> } };
    } | null
  )?.response?.data;
  const details = Array.isArray(data?.errors) ? data.errors : [];

  if (details.length === 0) {
    return { general: data?.message || t("Une erreur est survenue lors de l'inscription.") };
  }

  const errors: Record<string, string> = {};
  const horsFormulaire: string[] = [];
  details.forEach(detail => {
    if (detail.field && CHAMPS_DU_FORMULAIRE.includes(detail.field)) {
      errors[detail.field] = detail.message ?? '';
    } else if (detail.message) {
      horsFormulaire.push(detail.message);
    }
  });

  const bandeau: string[] = [];
  if (Object.keys(errors).length > 0) {
    bandeau.push(t("L'inscription a été refusée : vérifiez les champs signalés."));
  }
  bandeau.push(...horsFormulaire);
  errors.general = bandeau.length > 0 ? bandeau.join(' ') : t("Une erreur est survenue lors de l'inscription.");
  return errors;
}

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<RegisterData>({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleGoogleLogin = (): void => {
    // Redirect to Google OAuth endpoint
    const apiUrl = API_ORIGIN;
    window.location.href = `${apiUrl}/api/auth/google`;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Email validation
    if (!formData.email) {
      newErrors.email = t("L'adresse email est requise.");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('Veuillez entrer une adresse email valide.');
    }

    // Full name validation
    if (!formData.fullName.trim()) {
      newErrors.fullName = t('Le nom complet est requis.');
    } else if (formData.fullName.trim().length > 100) {
      newErrors.fullName = t('Le nom complet ne peut pas dépasser 100 caractères.');
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = t('Le mot de passe est requis.');
    } else {
      if (formData.password.length < 8) {
        newErrors.password = t('Le mot de passe doit contenir au moins 8 caractères.');
      } else if (!/[A-Z]/.test(formData.password)) {
        newErrors.password = t('Le mot de passe doit contenir au moins une majuscule.');
      } else if (!/[a-z]/.test(formData.password)) {
        newErrors.password = t('Le mot de passe doit contenir au moins une minuscule.');
      } else if (!/[0-9]/.test(formData.password)) {
        newErrors.password = t('Le mot de passe doit contenir au moins un chiffre.');
      } else if (!/[^A-Za-z0-9]/.test(formData.password)) {
        newErrors.password = t('Le mot de passe doit contenir au moins un caractère spécial.');
      }
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t('La confirmation du mot de passe est requise.');
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('Les mots de passe ne correspondent pas.');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSuccessMessage('');
    setErrors({});

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Remove role from formData as it's not needed in new architecture
      const { ...registrationData } = formData;
      await register(registrationData);
      setSuccessMessage(t('Inscription réussie ! Veuillez vérifier votre email pour activer votre compte.'));
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (error: any) {
      setErrors(erreursDeInscription(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">{t('Créer un compte')}</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('Ou')}{' '}
            <a href="/login" className="font-medium text-primary hover:text-primary">
              {t('connectez-vous à votre compte existant')}
            </a>
          </p>
        </div>

        {/* Google OAuth Button */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">{t('Ou continuer avec')}</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {t("S'inscrire avec Google")}
            </button>
          </div>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {successMessage && (
            <div className="rounded-md bg-green-50 p-4">
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          )}
          {errors.general && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{errors.general}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                {t('Nom complet')}
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={formData.fullName}
                onChange={handleChange}
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
                  errors.fullName ? 'border-red-300' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm`}
                placeholder={t('Jean Dupont')}
              />
              {errors.fullName && <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                {t('Adresse email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
                  errors.email ? 'border-red-300' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm`}
                placeholder={t('vous@example.com')}
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                {t('Mot de passe')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={handleChange}
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
                  errors.password ? 'border-red-300' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm`}
                placeholder="••••••••"
              />
              <PasswordStrength password={formData.password} />
              {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                {t('Confirmer le mot de passe')}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
                  errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm`}
                placeholder="••••••••"
              />
              {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('Inscription en cours...') : t("S'inscrire")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
