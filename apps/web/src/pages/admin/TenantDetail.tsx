import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTenant,
  getTenantStats,
  Tenant,
  TenantStats,
  suspendTenant,
  activateTenant
} from '../../services/tenant-service';
import { getTenantModules, updateTenantModules } from '../../services/module-service';
import { listMembers, Member, disableMember, enableMember } from '../../services/membership-service';
import type { TenantWithBranding } from '../../services/tenant-branding-service';
import { SubscriptionTab } from '../../components/admin/tenant-detail/SubscriptionTab';
import { InvoicesTab } from '../../components/admin/tenant-detail/InvoicesTab';
import { ActivityTab } from '../../components/admin/tenant-detail/ActivityTab';
import {
  Building2,
  ArrowLeft,
  Edit,
  Shield,
  CreditCard,
  Receipt,
  Activity,
  BarChart3,
  Settings,
  AlertTriangle,
  CheckCircle,
  Users,
  Plus,
  Eye,
  UserX,
  UserCheck
} from 'lucide-react';
import { App } from 'antd';
import { useConfirmAction } from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
export const TenantDetail: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'modules' | 'subscription' | 'invoices' | 'activity' | 'stats' | 'collaborators'
  >('overview');

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
        getTenantStats(tenantId).catch(() => null)
      ]);
      if (tenantResponse.success) {
        setTenant(tenantResponse.data);
        if (statsResponse?.success) {
          setStats(statsResponse.data);
        }
      } else {
        setError(t('Erreur lors du chargement du tenant'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement du tenant'));
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = () => {
    if (!tenantId) return;
    confirmAction({
      title: t("Suspendre l'agence « {{value}} » ?", { value: tenant?.name ?? tenantId }),
      description: t("Ses collaborateurs perdent l'accès jusqu'à réactivation."),
      okText: t('Suspendre'),
      danger: true,
      onConfirm: async () => {
        try {
          await suspendTenant(tenantId);
          await loadTenant();
          message.success(t('Agence suspendue'));
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors de la suspension'));
        }
      }
    });
  };
  const handleActivate = () => {
    if (!tenantId) return;
    confirmAction({
      title: t("Activer l'agence « {{value}} » ?", { value: tenant?.name ?? tenantId }),
      okText: t('Activer'),
      onConfirm: async () => {
        try {
          await activateTenant(tenantId);
          await loadTenant();
          message.success(t('Agence activée'));
        } catch (err: any) {
          message.error(err.response?.data?.message || t("Erreur lors de l'activation"));
        }
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      ACTIVE: 'bg-green-100 text-green-800',
      SUSPENDED: 'bg-red-100 text-red-800',
      INACTIVE: 'bg-gray-100 text-gray-800'
    };
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          styles[status as keyof typeof styles] || styles.INACTIVE
        }`}
      >
        {status === 'ACTIVE' ? t('Actif') : status === 'SUSPENDED' ? t('Suspendu') : t('Inactif')}
      </span>
    );
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </>
    );
  }

  if (error || !tenant) {
    return (
      <>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">{error || t('Tenant introuvable')}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/admin/tenants')} className="text-gray-600 hover:text-gray-900">
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
                <AlertTriangle className="h-4 w-4 me-2" />
                {t('Suspendre')}
              </button>
            ) : (
              <button
                onClick={handleActivate}
                className="inline-flex items-center px-4 py-2 border border-green-300 rounded-md shadow-sm text-sm font-medium text-green-700 bg-white hover:bg-green-50"
              >
                <CheckCircle className="h-4 w-4 me-2" />
                {t('Activer')}
              </button>
            )}
            <button
              onClick={() => navigate(`/admin/tenants/${tenantId}/edit`)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Edit className="h-4 w-4 me-2" />
              {t('Modifier')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: t("Vue d'ensemble"), icon: Building2 },
              { id: 'collaborators', label: t('Collaborateurs'), icon: Users },
              { id: 'modules', label: t('Modules'), icon: Settings },
              { id: 'subscription', label: t('Abonnement'), icon: CreditCard },
              { id: 'invoices', label: t('Factures'), icon: Receipt },
              { id: 'activity', label: t('Activité'), icon: Activity },
              { id: 'stats', label: t('Statistiques'), icon: BarChart3 }
            ].map(tab => (
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
              <div className="flex items-center gap-4">
                {(tenant as TenantWithBranding).logoUrl ? (
                  <img
                    src={(tenant as TenantWithBranding).logoUrl ?? undefined}
                    alt={t("Logo de l'agence")}
                    style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
                  />
                ) : (
                  <div className="h-16 w-16 rounded bg-gray-100 flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-gray-400" />
                  </div>
                )}
                {tenant.brandingPrimaryColor && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('Couleur de marque')}</label>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        style={{
                          display: 'inline-block',
                          width: 20,
                          height: 20,
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: tenant.brandingPrimaryColor,
                          border: '1px solid var(--border-default)'
                        }}
                      />
                      <span className="text-sm text-gray-900">{tenant.brandingPrimaryColor}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Nom')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Nom legal')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.legalName || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Email')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.contactEmail || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Telephone')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.contactPhone || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Ville')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.city || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Pays')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.country || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Site web')}</label>
                  <p className="mt-1 text-sm text-gray-900">{tenant.website || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('Statut')}</label>
                  <p className="mt-1 text-sm text-gray-900">{getStatusBadge(tenant.status)}</p>
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
              <SubscriptionTab tenantId={tenantId!} tenantName={tenant.name} />
            </div>
          )}

          {activeTab === 'invoices' && (
            <div>
              <InvoicesTab tenantId={tenantId!} />
            </div>
          )}

          {activeTab === 'activity' && (
            <div>
              <ActivityTab tenantId={tenantId!} />
            </div>
          )}

          {activeTab === 'stats' && stats && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('Proprietes')}</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalProperties}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('Clients')}</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalClients}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('Collaborateurs')}</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalCollaborators}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('Modules actifs')}</label>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.activeModules}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// Collaborators Tab Component
const CollaboratorsTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message } = App.useApp();
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
        setError(t('Erreur lors du chargement des collaborateurs'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des collaborateurs'));
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
      message.error(err.response?.data?.message || t('Erreur lors de la modification'));
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      ACTIVE: 'bg-green-100 text-green-800',
      PENDING_INVITE: 'bg-yellow-100 text-yellow-800',
      DISABLED: 'bg-red-100 text-red-800'
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          styles[status as keyof typeof styles] || styles.DISABLED
        }`}
      >
        {status === 'ACTIVE' ? t('Actif') : status === 'PENDING_INVITE' ? t('Invitation en attente') : t('Desactive')}
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
        <h3 className="text-lg font-medium text-gray-900">
          {t('Collaborateurs (')}
          {members.length})
        </h3>
        <button
          onClick={() => navigate(`/admin/tenants/${tenantId}/collaborators/invite`)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 me-2" />
          {t('Inviter')}
        </button>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Users className="h-12 w-12 mx-auto text-gray-400" />
          <p className="mt-2">{t('Aucun collaborateur')}</p>
        </div>
      ) : (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('Utilisateur')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('Roles')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('Statut')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('Derniere connexion')}
                </th>
                <th className="px-6 py-3 text-end text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {members.map(member => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <Users className="h-6 w-6 text-blue-600" />
                        </div>
                      </div>
                      <div className="ms-4">
                        <div className="text-sm font-medium text-gray-900">
                          {member.user.fullName || member.user.email}
                        </div>
                        <div className="text-sm text-gray-500">{member.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {member.roles.map(role => (
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
                      ? new Date(member.user.lastLoginAt).toLocaleDateString(activeLocale())
                      : t('Jamais')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-end text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/admin/tenants/${tenantId}/collaborators/${member.userId}`)}
                        className="text-blue-600 hover:text-blue-900"
                        title={t('Voir les details')}
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      {member.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handleToggleStatus(member.userId, member.status)}
                          className="text-red-600 hover:text-red-900"
                          title={t('Desactiver')}
                        >
                          <UserX className="h-5 w-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleStatus(member.userId, member.status)}
                          className="text-green-600 hover:text-green-900"
                          title={t('Activer')}
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
  const { message } = App.useApp();
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
        modules: [{ moduleKey, enabled: !enabled }]
      });
      await loadModules();
    } catch (err) {
      message.error(t('Erreur lors de la mise à jour du module'));
    }
  };

  if (loading) {
    return <div className="text-center py-8">Chargement...</div>;
  }

  if (!modules || modules.length === 0) {
    return <div className="text-center py-8 text-gray-500">{t('Aucun module disponible')}</div>;
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
            <p className="text-sm text-gray-500">{module.enabled ? t('Active') : t('Desactive')}</p>
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

