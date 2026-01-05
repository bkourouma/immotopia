import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PasswordStrength } from '../../components/PasswordStrength';

export const AcceptInvitePage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [token, setToken] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        const inviteToken = searchParams.get('token');
        if (inviteToken) {
            setToken(inviteToken);
        } else {
            setErrors({ general: 'Token d\'invitation manquant ou invalide.' });
        }
    }, [searchParams]);

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        // Full name validation
        if (!fullName.trim()) {
            newErrors.fullName = 'Le nom complet est requis.';
        }

        // Password validation
        if (!password) {
            newErrors.password = 'Le mot de passe est requis.';
        } else {
            if (password.length < 8) {
                newErrors.password = 'Le mot de passe doit contenir au moins 8 caractères.';
            } else if (!/[A-Z]/.test(password)) {
                newErrors.password = 'Le mot de passe doit contenir au moins une majuscule.';
            } else if (!/[a-z]/.test(password)) {
                newErrors.password = 'Le mot de passe doit contenir au moins une minuscule.';
            } else if (!/[0-9]/.test(password)) {
                newErrors.password = 'Le mot de passe doit contenir au moins un chiffre.';
            } else if (!/[^A-Za-z0-9]/.test(password)) {
                newErrors.password = 'Le mot de passe doit contenir au moins un caractère spécial.';
            }
        }

        // Confirm password validation
        if (!confirmPassword) {
            newErrors.confirmPassword = 'La confirmation du mot de passe est requise.';
        } else if (password !== confirmPassword) {
            newErrors.confirmPassword = 'Les mots de passe ne correspondent pas.';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        setErrors({});

        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch('/api/collaborators/accept-invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    token,
                    password,
                    fullName
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setSuccessMessage('Invitation acceptée avec succès ! Redirection...');
                setTimeout(() => {
                    navigate('/login?invite=accepted');
                }, 2000);
            } else {
                setErrors({
                    general: data.message || 'Une erreur est survenue lors de l\'acceptation de l\'invitation.'
                });
            }
        } catch (err) {
            setErrors({
                general: 'Une erreur est survenue. Veuillez réessayer.'
            });
            console.error('Accept invite error:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (setter: React.Dispatch<React.SetStateAction<string>>, field: string) => {
        return (e: React.ChangeEvent<HTMLInputElement>) => {
            setter(e.target.value);
            // Clear error when user starts typing
            if (errors[field]) {
                setErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors[field];
                    return newErrors;
                });
            }
        };
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Accepter l'invitation
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Créez votre mot de passe pour rejoindre l'équipe
                    </p>
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
                        {/* Full Name */}
                        <div>
                            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                                Nom complet
                            </label>
                            <input
                                id="fullName"
                                name="fullName"
                                type="text"
                                required
                                value={fullName}
                                onChange={handleChange(setFullName, 'fullName')}
                                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${errors.fullName ? 'border-red-300' : 'border-gray-300'
                                    } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                                placeholder="Jean Dupont"
                            />
                            {errors.fullName && <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>}
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                Mot de passe
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={password}
                                onChange={handleChange(setPassword, 'password')}
                                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${errors.password ? 'border-red-300' : 'border-gray-300'
                                    } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                                placeholder="••••••••"
                            />
                            <PasswordStrength password={password} />
                            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                                Confirmer le mot de passe
                            </label>
                            <input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={confirmPassword}
                                onChange={handleChange(setConfirmPassword, 'confirmPassword')}
                                className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                                    } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                                placeholder="••••••••"
                            />
                            {errors.confirmPassword && (
                                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
                            )}
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={isSubmitting || !token}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Acceptation en cours...' : 'Accepter l\'invitation'}
                        </button>
                    </div>

                    <div className="text-center text-sm">
                        <a href="/login" className="font-medium text-blue-600 hover:text-blue-500">
                            Retour à la connexion
                        </a>
                    </div>
                </form>
            </div>
        </div>
    );
};

