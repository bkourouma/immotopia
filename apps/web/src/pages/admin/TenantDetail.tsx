import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import {
  getTenant,
  getTenantStats,
  Tenant,
  TenantStats,
  suspendTenant,
  activateTenant,
} from '../../services/tenant-service';
import { getTenantModules, updateTenantModules } from '../../services/module-service';
import { getSubscription } from '../../services/subscription-service';
import {
  listMembers,
  Member,
  disableMember,
  enableMember,
} from '../../services/membership-service';
import {
  Building2,
  ArrowLeft,
  Edit,
  Shield,
  CreditCard,
  BarChart3,
  Settings,
  AlertTriangle,
  CheckCircle,
  Users,
  Plus,
  Eye,
  UserX,
  UserCheck,
} from 'lucide-react';

export const TenantDetail: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'modules' | 'subscription' | 'stats' | 'collaborators'>(
    'overview'
  );

  useEffect(() => {
    if (tenantId) {
      loadTenant();
    }
  }, [tenantId]);

  const loadTenant = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [tenantResponse, statsResponse] = await Promise.all([
        getTenant(tenantId),
        getTenantStats(tenantId).catch(() => null),
      ]);
      if (tenantResponse.success) {
        setTenant(tenantResponse.data);
        if (statsResponse?.success) {
          setStats(statsResponse.data);
        }
      } else {
        setError('Erreur lors du chargement du tenant');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement du tenant');
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!tenantId || !window.confirm('Etes-vous sur de vouloir suspendre ce tenant ?')) return;
    try {
      await suspendTenant(tenantId);
      await loadTenant();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la suspension');
    }
  };
  const handleActivate = async () => {
    if (!tenantId || !window.confirm('Etes-vous sur de vouloir activer ce tenant ?')) return;
    try {
      await activateTenant(tenantId);
      await loadTenant();
    } catch (err: any) {
      alert(err.response?.data?.message || "Erreur lors de l'activation");
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      ACTIVE: 'bg-green-100 text-green-800',
      SUSPENDED: 'bg-red-100 text-red-800',
      INACTIVE: 'bg-gray-100 text-gray-800',
    };
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          styles[status as keyof typeof styles] || styles.INACTIVE
        }`}
      >
        {status === 'ACTIVE' ? 'Actif' : status === 'SUSPENDED' ? 'Suspendu' : 'Inactif'}
      </span>
    );
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

  if (error || !tenant) {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">{error || 'Tenant introuvable'}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/tenants')}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{tenant.name}</h1>
              <p className="mt-2 text-sm text-slate-600">{tenant.legalName || tenant.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(tenant.status)}
            {tenant.status === 'ACTIVE' ? (
              <button
                onClick={handleSuspend}
                className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Suspendre
              </button>
            ) : (
              <button
                onClick={handleActivate}
                className="inline-flex items-center px-4 py-2 border border-green-300 rounded-md shadow-sm text-sm font-medium text-green-700 bg-white hover:bg-green-50"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Activer
              </button>
            )}
            <button
              onClick={() => navigate(`/admin/tenants/${tenantId}/edit`)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Edit className="h-4 w-4 mr-2" />
              Modifier
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Vue d\'ensemble', icon: Building2 },
              { id: 'collaborators', label: 'Collaborateurs', icon: Users },
              { id: 'modules', label: 'Modules', icon: Settings },
              { id: 'subscription', label: 'Abonnement', icon: CreditCard },
              { id: 'stats', label: 'Statistiques', icon: BarChart3 },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={` whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nom</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nom legal</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.legalName || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.contactEmail || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Telephone</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.contactPhone || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ville</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.city || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Pays</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.country || '-'}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'collaborators' && (
            <div>
              <CollaboratorsTab tenantId={tenantId!} />
            </div>
          )}

          {activeTab === 'modules' && (
            <div>
              <ModulesTab tenantId={tenantId!} />
            </div>
          )}

          {activeTab === 'subscription' && (
            <div>
              <SubscriptionTab tenantId={tenantId!} />
            </div>
          )}

          {activeTab === 'stats' && stats && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Proprietes</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalProperties}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Clients</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalClients}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Collaborateurs</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalCollaborators}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Modules actifs</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.activeModules}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

// Collaborators Tab Component
const CollaboratorsTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, [tenantId]);

  const loadMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listMembers(tenantId, { limit: 50 });
      if (response.success) {
        setMembers(response.data.members);
      } else {
        setError('Erreur lors du chargement des collaborateurs');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des collaborateurs');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    try {
      if (currentStatus === 'ACTIVE') {
        await disableMember(tenantId, userId);
      } else {
        await enableMember(tenantId, userId);
      }
      await loadMembers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la modification');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      ACTIVE: 'bg-green-100 text-green-800',
      PENDING_INVITE: 'bg-yellow-100 text-yellow-800',
      DISABLED: 'bg-red-100 text-red-800',
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          styles[status as keyof typeof styles] || styles.DISABLED
        }`}
      >
        {status === 'ACTIVE'
          ? 'Actif'
          : status === 'PENDING_INVITE'
          ? 'Invitation en attente'
          : 'Desactive'}
      </span>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Chargement...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Collaborateurs ({members.length})</h3>
        <button
          onClick={() => navigate(`/admin/tenants/${tenantId}/collaborators/invite`)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Inviter
        </button>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Users className="h-12 w-12 mx-auto text-gray-400" />
          <p className="mt-2">Aucun collaborateur</p>
        </div>
      ) : (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Utilisateur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Roles
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Derniere connexion
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <Users className="h-6 w-6 text-blue-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {member.user.fullName || member.user.email}
                        </div>
                        <div className="text-sm text-gray-500">{member.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {member.roles.map((role) => (
                        <span
                          key={role.id}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {role.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(member.status)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {member.user.lastLoginAt
                      ? new Date(member.user.lastLoginAt).toLocaleDateString('fr-FR')
                      : 'Jamais'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/admin/tenants/${tenantId}/collaborators/${member.userId}`)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Voir les details"
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      {member.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handleToggleStatus(member.userId, member.status)}
                          className="text-red-600 hover:text-red-900"
                          title="Desactiver"
                        >
                          <UserX className="h-5 w-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleStatus(member.userId, member.status)}
                          className="text-green-600 hover:text-green-900"
                          title="Activer"
                        >
                          <UserCheck className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Modules Tab Component
const ModulesTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadModules();
  }, [tenantId]);

  const loadModules = async () => {
    try {
      const response = await getTenantModules(tenantId);
      if (response.success && response.data) {
        setModules(response.data.modules || []);
      } else {
        setModules([]);
      }
    } catch (err) {
      console.error('Error loading modules:', err);
      setModules([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = async (moduleKey: string, enabled: boolean) => {
    try {
      await updateTenantModules(tenantId, {
        modules: [{ moduleKey, enabled: !enabled }],
      });
      await loadModules();
    } catch (err) {
      alert('Erreur lors de la mise a jour du module');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Chargement...</div>;
  }

  if (!modules || modules.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Aucun module disponible
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {modules.map((module, index) => (
        <div
          key={module.id || module.moduleKey || `module-${index}`}
          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
        >
          <div>
            <h3 className="font-medium text-gray-900">{module.moduleKey}</h3>
            <p className="text-sm text-gray-500">
              {module.enabled ? 'Active' : 'Desactive'}
            </p>
          </div>
          <button
            onClick={() => toggleModule(module.moduleKey, module.enabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              module.enabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                module.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      ))}
    </div>
  );
};

// Subscription Tab Component
const SubscriptionTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscription();
  }, [tenantId]);

  const loadSubscription = async () => {
    try {
      const response = await getSubscription(tenantId);
      if (response.success) {
        setSubscription(response.data);
      }
    } catch (err) {
      console.error('Error loading subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Chargement...</div>;
  }

  if (!subscription) {
    return <div className="text-center py-8 text-gray-500">Aucun abonnement</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Plan</label>
        <p className="mt-1 text-sm text-gray-900">{subscription.plan}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Cycle de facturation</label>
        <p className="mt-1 text-sm text-gray-900">{subscription.billingCycle}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Statut</label>
        <p className="mt-1 text-sm text-gray-900">{subscription.status}</p>
      </div>
    </div>
  );
};




