import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { DashboardLayout } from '../components/dashboard/dashboard-layout';
import { Building2, Users, TrendingUp, DollarSign } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Tableau de bord</h1>
          <p className="mt-2 text-sm text-slate-600">
            Bienvenue, {user.fullName || user.email}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden rounded-lg shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-slate-500 truncate">
                      Propriétés
                    </dt>
                    <dd className="text-2xl font-bold text-slate-900">24</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3">
              <div className="text-sm">
                <Link to="/properties" className="font-medium text-blue-600 hover:text-blue-500">
                  Voir tout
                </Link>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden rounded-lg shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-slate-500 truncate">
                      Clients
                    </dt>
                    <dd className="text-2xl font-bold text-slate-900">156</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3">
              <div className="text-sm">
                <Link to="/clients" className="font-medium text-blue-600 hover:text-blue-500">
                  Voir tout
                </Link>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden rounded-lg shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-slate-500 truncate">
                      Revenus (mois)
                    </dt>
                    <dd className="text-2xl font-bold text-slate-900">45 000 000 FCFA</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3">
              <div className="text-sm">
                <Link to="/reports" className="font-medium text-blue-600 hover:text-blue-500">
                  Voir rapport
                </Link>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden rounded-lg shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-slate-500 truncate">
                      Transactions
                    </dt>
                    <dd className="text-2xl font-bold text-slate-900">89</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3">
              <div className="text-sm">
                <Link to="/transactions" className="font-medium text-blue-600 hover:text-blue-500">
                  Voir tout
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Activités récentes</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    Nouvelle propriété ajoutée
                  </p>
                  <p className="text-sm text-slate-500">
                    Villa moderne à Cocody - 3 chambres, 2 salles de bain
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Il y a 2 heures</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    Nouveau client enregistré
                  </p>
                  <p className="text-sm text-slate-500">
                    Jean Kouassi - Intéressé par location
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Il y a 5 heures</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-yellow-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    Transaction complétée
                  </p>
                  <p className="text-sm text-slate-500">
                    Vente d'appartement - 25 000 000 FCFA
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Hier</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Informations du compte</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-sm font-medium text-slate-500">Nom complet</dt>
                <dd className="mt-1 text-sm text-slate-900">{user.fullName || 'Non renseigné'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Email</dt>
                <dd className="mt-1 text-sm text-slate-900">{user.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Rôle</dt>
                <dd className="mt-1 text-sm text-slate-900">
                  {user.globalRole === 'SUPER_ADMIN' ? 'Super Administrateur' : 'Utilisateur'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Date d'inscription</dt>
                <dd className="mt-1 text-sm text-slate-900">{formatDate(user.createdAt)}</dd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

