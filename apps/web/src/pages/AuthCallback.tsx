import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMe } from '../services/auth-service';

/**
 * OAuth Callback Page
 * Handles the redirect from Google OAuth
 */
export const AuthCallback: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Authentification en cours...');

    useEffect(() => {
        const handleCallback = async () => {
            const success = searchParams.get('success');
            const error = searchParams.get('error');

            if (error) {
                setStatus('error');
                setMessage(`Erreur d'authentification: ${error}`);
                setTimeout(() => {
                    navigate('/login');
                }, 3000);
                return;
            }

            if (success === 'true') {
                try {
                    // Verify authentication by calling /api/auth/me
                    // This will use the cookies set by the backend
                    const response = await getMe();

                    if (response.success && response.user) {
                        setStatus('success');
                        setMessage('Connexion réussie ! Redirection...');

                        // Force a page reload to update the AuthContext
                        // The AuthContext will automatically call getMe() on mount
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 1000);
                    } else {
                        throw new Error('Impossible de récupérer les informations utilisateur');
                    }
                } catch (err: any) {
                    console.error('Auth verification error:', err);
                    setStatus('error');
                    setMessage('Erreur lors de la vérification de l\'authentification.');
                    setTimeout(() => {
                        navigate('/login');
                    }, 3000);
                }
            } else {
                setStatus('error');
                setMessage('Une erreur est survenue lors de l\'authentification.');
                setTimeout(() => {
                    navigate('/login');
                }, 3000);
            }
        };

        handleCallback();
    }, [searchParams, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 text-center">
                {status === 'loading' && (
                    <>
                        <div className="flex justify-center">
                            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
                        </div>
                        <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                            {message}
                        </h2>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="flex justify-center">
                            <svg
                                className="h-16 w-16 text-green-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <h2 className="mt-6 text-3xl font-extrabold text-green-600">
                            {message}
                        </h2>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="flex justify-center">
                            <svg
                                className="h-16 w-16 text-red-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <h2 className="mt-6 text-3xl font-extrabold text-red-600">
                            {message}
                        </h2>
                    </>
                )}
            </div>
        </div>
    );
};
