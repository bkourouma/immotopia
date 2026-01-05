import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { getGlobalStatistics, GlobalStatistics } from '../../services/statistics-service';
import { Building2, Users, CreditCard, BarChart3, TrendingUp, Shield } from 'lucide-react';

export const Statistics: React.FC = () => {
  const [stats, setStats] = useState<GlobalStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getGlobalStatistics();
      if (response.success) {
        setStats(response.data);
      } else {
        setError('Erreur lors du chargement des statistiques');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !stats) {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">{error || 'Erreur lors du chargement'}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Statistiques Globales</h1>
          <p className="mt-2 text-sm text-slate-600">Vue d'ensemble de la plateforme</p>
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
                      Total Tenants
                    </dt>
                    <dd className="text-2xl font-bold text-slate-900">{stats.totalTenants}</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3">
              <div className="text-sm">
                <span className="text-green-600 font-medium">{stats.activeTenants} actifs</span>
                {stats.suspendedTenants > 0 && (
                  <span className="ml-2 text-red-600">{stats.suspendedTenants} suspendus</span>
                )}
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
                      Collaborateurs
                    </dt>
                    <dd className="text-2xl font-bold text-slate-900">
                      {stats.totalCollaborators}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3">
              <div className="text-sm">
                <span className="text-green-600 font-medium">
                  {stats.activeCollaborators} actifs
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden rounded-lg shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CreditCard className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-slate-500 truncate">
                      Abonnements
                    </dt>
                    <dd className="text-2xl font-bold text-slate-900">
                      {stats.totalSubscriptions}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3">
              <div className="text-sm">
                <span className="text-green-600 font-medium">
                  {stats.activeSubscriptions} actifs
                </span>
                {stats.cancelledSubscriptions > 0 && (
                  <span className="ml-2 text-red-600">
                    {stats.cancelledSubscriptions} annulés
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden rounded-lg shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BarChart3 className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-slate-500 truncate">
                      Modules Activés
                    </dt>
                    <dd className="text-2xl font-bold text-slate-900">
                      {Object.keys(stats.moduleActivations).length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3">
              <div className="text-sm text-slate-500">
                {Object.entries(stats.moduleActivations)
                  .slice(0, 2)
                  .map(([key, value]) => (
                    <span key={key} className="mr-2">
                      {key}: {value}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Module Activations Detail */}
        {Object.keys(stats.moduleActivations).length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Activations par Module</h2>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(stats.moduleActivations).map(([moduleKey, count]) => (
                <div key={moduleKey} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="text-sm font-medium text-gray-700">{moduleKey}</span>
                  <span className="text-sm font-bold text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};





