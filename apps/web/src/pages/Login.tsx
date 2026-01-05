import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoginCredentials } from '../types/auth-types';
import { Shield, Building2, User, Users, Home, Crown } from 'lucide-react';

// Test users for quick login (matching seeded database)
const TEST_USERS = [
  {
    email: 'admin@immobillier.com',
    password: 'Admin@123456',
    name: 'Super Administrateur',
    role: 'SUPER_ADMIN',
    category: 'platform',
    icon: Crown,
    color: 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 border-purple-400 text-white',
    badge: 'Platform Admin'
  },
  {
    email: 'visitor@immobillier.com',
    password: 'Test@123456',
    name: 'Visiteur Non Lié',
    role: 'VISITOR',
    category: 'public',
    icon: User,
    color: 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-900',
    badge: 'Public User'
  },
  {
    email: 'admin1@agence-mali.com',
    password: 'Test@123456',
    name: 'Amadou Koné',
    role: 'ADMIN @ Agence Mali',
    category: 'tenant-admin',
    icon: Building2,
    color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-900',
    badge: 'Tenant Admin'
  },
  {
    email: 'admin2@bamako-immo.com',
    password: 'Test@123456',
    name: 'Fatima Traoré',
    role: 'ADMIN @ Bamako Immo',
    category: 'tenant-admin',
    icon: Building2,
    color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-900',
    badge: 'Tenant Admin'
  },
  {
    email: 'agent@agence-mali.com',
    password: 'Test@123456',
    name: 'Moussa Diarra',
    role: 'AGENT @ Agence Mali',
    category: 'collaborator',
    icon: Users,
    color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-900',
    badge: 'Collaborator'
  },
  {
    email: 'proprietaire@gmail.com',
    password: 'Test@123456',
    name: 'Ibrahim Sanogo',
    role: 'PROPRIÉTAIRE (Owner)',
    category: 'client',
    icon: Home,
    color: 'bg-green-50 hover:bg-green-100 border-green-200 text-green-900',
    badge: 'Owner Client'
  },
  {
    email: 'locataire@gmail.com',
    password: 'Test@123456',
    name: 'Mariam Coulibaly',
    role: 'LOCATAIRE (Renter)',
    category: 'client',
    icon: Home,
    color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200 text-yellow-900',
    badge: 'Renter Client'
  }
];

// Group users by category
const groupedUsers = {
  platform: TEST_USERS.filter(u => u.category === 'platform'),
  'tenant-admin': TEST_USERS.filter(u => u.category === 'tenant-admin'),
  collaborator: TEST_USERS.filter(u => u.category === 'collaborator'),
  client: TEST_USERS.filter(u => u.category === 'client'),
  public: TEST_USERS.filter(u => u.category === 'public'),
};

const categoryLabels = {
  platform: { label: 'Platform Administration', icon: Shield },
  'tenant-admin': { label: 'Tenant Administrators', icon: Building2 },
  collaborator: { label: 'Collaborators', icon: Users },
  client: { label: 'Clients', icon: Home },
  public: { label: 'Public Users', icon: User },
};

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, error, clearError, isLoading } = useAuth();
  const [formData, setFormData] = useState<LoginCredentials>({
    email: '',
    password: ''
  });
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) {
      newErrors.email = 'L\'adresse email est requise.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Veuillez entrer une adresse email valide.';
    }

    if (!formData.password) {
      newErrors.password = 'Le mot de passe est requis.';
    }

    setLocalErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    clearError();
    setLocalErrors({});

    if (!validateForm()) {
      return;
    }

    try {
      await login(formData);
      navigate('/dashboard');
    } catch (error: any) {
      // Error is handled by AuthContext
      console.error('Login error:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (localErrors[name]) {
      setLocalErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
    clearError();
  };

  const handleQuickLogin = async (user: typeof TEST_USERS[0]): Promise<void> => {
    clearError();
    setLocalErrors({});
    setFormData({
      email: user.email,
      password: user.password
    });

    try {
      await login({
        email: user.email,
        password: user.password
      });
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Quick login error:', error);
    }
  };

  const handleGoogleLogin = (): void => {
    const apiUrl = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:8001';
    window.location.href = `${apiUrl}/api/auth/google`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-white rounded-full p-3 shadow-lg">
              <Shield className="h-10 w-10 text-indigo-600" />
            </div>
          </div>
          <h2 className="text-4xl font-extrabold text-gray-900 mb-2">
            Bienvenue sur ImmoPro
          </h2>
          <p className="text-lg text-gray-600">
            Connectez-vous à votre compte ou{' '}
            <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
              créez un nouveau compte
            </Link>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Login Section */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Crown className="h-5 w-5 text-yellow-500" />
                <h3 className="text-lg font-semibold text-gray-900">Connexion rapide</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Sélectionnez un compte de test pour vous connecter automatiquement
              </p>
              
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {Object.entries(groupedUsers).map(([category, users]) => {
                  if (users.length === 0) return null;
                  const categoryInfo = categoryLabels[category as keyof typeof categoryLabels];
                  const Icon = categoryInfo.icon;
                  
                  return (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center gap-2 px-2 py-1">
                        <Icon className="h-4 w-4 text-gray-500" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {categoryInfo.label}
                        </span>
                      </div>
                      {users.map((user) => {
                        const UserIcon = user.icon;
                        return (
                          <button
                            key={user.email}
                            type="button"
                            onClick={() => handleQuickLogin(user)}
                            disabled={isLoading}
                            className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all duration-200 ${user.color} disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md transform hover:scale-[1.02]`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`flex-shrink-0 p-2 rounded-lg ${
                                user.category === 'platform' 
                                  ? 'bg-white/20' 
                                  : 'bg-white'
                              }`}>
                                <UserIcon className={`h-5 w-5 ${
                                  user.category === 'platform' 
                                    ? 'text-white' 
                                    : 'text-gray-600'
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold truncate ${
                                  user.category === 'platform' 
                                    ? 'text-white' 
                                    : 'text-gray-900'
                                }`}>
                                  {user.name}
                                </p>
                                <p className={`text-xs truncate ${
                                  user.category === 'platform' 
                                    ? 'text-white/80' 
                                    : 'text-gray-600'
                                }`}>
                                  {user.email}
                                </p>
                                <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded ${
                                  user.category === 'platform'
                                    ? 'bg-white/20 text-white'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {user.badge}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Manual Login Form */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Connexion manuelle</h3>
            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Adresse email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    localErrors.email 
                      ? 'border-red-300 bg-red-50' 
                      : 'border-gray-300 bg-gray-50 hover:bg-white'
                  }`}
                  placeholder="vous@example.com"
                />
                {localErrors.email && (
                  <p className="mt-1 text-sm text-red-600">{localErrors.email}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    localErrors.password 
                      ? 'border-red-300 bg-red-50' 
                      : 'border-gray-300 bg-gray-50 hover:bg-white'
                  }`}
                  placeholder="••••••••"
                />
                {localErrors.password && (
                  <p className="mt-1 text-sm text-red-600">{localErrors.password}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                    Se souvenir de moi
                  </label>
                </div>
                <div className="text-sm">
                  <Link 
                    to="/forgot-password" 
                    className="font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02]"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connexion en cours...
                  </>
                ) : (
                  'Se connecter'
                )}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">Ou continuer avec</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border-2 border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
                Se connecter avec Google
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

