import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import {
  getMember,
  updateMember,
  resetMemberPassword,
  revokeMemberSessions,
  disableMember,
  enableMember,
  Member
} from '../../services/membership-service';
import apiClient from '../../utils/api-client';
import { ArrowLeft, Edit, Key, LogOut, UserX, UserCheck, Users } from 'lucide-react';
import { App, Typography } from 'antd';
import { useConfirmAction } from '../../components/primitives';

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export const AdminCollaboratorDetail: React.FC = () => {
  const { message, modal } = App.useApp();
  const confirmAction = useConfirmAction();
  const { tenantId, userId } = useParams<{ tenantId: string; userId: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<Member | null>(null);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tenantId && userId) {
      loadMember();
      loadAvailableRoles();
    }
  }, [tenantId, userId]);

  const loadMember = async () => {
    if (!tenantId || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getMember(tenantId, userId);
      if (response.success) {
        setMember(response.data);
        setSelectedRoleIds(response.data.roles.map(r => r.id));
      } else {
        setError('Erreur lors du chargement du collaborateur');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement du collaborateur');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableRoles = async () => {
    try {
      const response = await apiClient.get('/roles?scope=TENANT');
      if (response.data.success) {
        setAvailableRoles(response.data.data || []);
      }
    } catch (err) {
      console.error('Error loading roles:', err);
    }
  };

  const handleSaveRoles = async () => {
    if (!tenantId || !userId) return;
    setSaving(true);
    try {
      await updateMember(tenantId, userId, { roleIds: selectedRoleIds });
      await loadMember();
      message.success('Rôles mis à jour avec succès');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = () => {
    if (!tenantId || !userId) return;
    confirmAction({
      title: `Réinitialiser le mot de passe de ${member?.user?.fullName ?? 'ce collaborateur'} ?`,
      description: "Un email sera envoyé à l'utilisateur.",
      okText: 'Réinitialiser',
      danger: true,
      onConfirm: async () => {
        try {
          const response = await resetMemberPassword(tenantId, userId, { sendEmail: true });
          const newPassword = response.data?.newPassword;
          if (newPassword) {
            // Le mot de passe régénéré était affiché dans un dialogue natif :
            // ni copiable, ni masquable, ni journalisable (§5.7). Il passe par
            // une modale AntD avec bouton de copie.
            modal.info({
              title: 'Nouveau mot de passe',
              content: (
                <div>
                  <Typography.Paragraph copyable={{ text: newPassword }} code>
                    {newPassword}
                  </Typography.Paragraph>
                  <Typography.Text type="secondary">
                    Un email a été envoyé à l'utilisateur. Ce mot de passe ne sera plus affiché.
                  </Typography.Text>
                </div>
              ),
              okText: 'Fermer'
            });
          } else {
            message.success("Mot de passe réinitialisé. Un email a été envoyé à l'utilisateur.");
          }
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Erreur lors de la réinitialisation');
        }
      }
    });
  };

  const handleRevokeSessions = () => {
    if (!tenantId || !userId) return;
    confirmAction({
      title: 'Révoquer toutes les sessions de ce collaborateur ?',
      description: 'Il devra se reconnecter sur tous ses appareils.',
      okText: 'Révoquer',
      danger: true,
      onConfirm: async () => {
        try {
          await revokeMemberSessions(tenantId, userId);
          message.success('Toutes les sessions ont été révoquées');
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Erreur lors de la révocation');
        }
      }
    });
  };

  const handleToggleStatus = () => {
    if (!tenantId || !userId || !member) return;
    const disabling = member.status === 'ACTIVE';
    confirmAction({
      title: `${disabling ? 'Désactiver' : 'Activer'} ${member.user?.fullName ?? 'ce collaborateur'} ?`,
      okText: disabling ? 'Désactiver' : 'Activer',
      danger: disabling,
      onConfirm: async () => {
        try {
          if (disabling) {
            await disableMember(tenantId, userId);
          } else {
            await enableMember(tenantId, userId);
          }
          await loadMember();
          message.success(disabling ? 'Collaborateur désactivé' : 'Collaborateur activé');
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Erreur lors de la modification');
        }
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      ACTIVE: 'bg-green-100 text-green-800',
      PENDING_INVITE: 'bg-yellow-100 text-yellow-800',
      DISABLED: 'bg-red-100 text-red-800'
    };
    const labels = {
      ACTIVE: 'Actif',
      PENDING_INVITE: 'Invitation en attente',
      DISABLED: 'Desactive'
    };
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          styles[status as keyof typeof styles] || styles.DISABLED
        }`}
      >
        {labels[status as keyof typeof labels] || status}
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

  if (error || !member) {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">{error || 'Collaborateur introuvable'}</p>
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
              onClick={() => navigate(`/admin/tenants/${tenantId}`)}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">{member.user.fullName || member.user.email}</h1>
                <p className="mt-1 text-sm text-slate-600">{member.user.email}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">{getStatusBadge(member.status)}</div>
        </div>

        {/* User Info */}
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-medium text-gray-900">Informations</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <p className="mt-1 text-sm text-gray-900">{member.user.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nom complet</label>
              <p className="mt-1 text-sm text-gray-900">{member.user.fullName || '-'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email verifie</label>
              <p className="mt-1 text-sm text-gray-900">{member.user.emailVerified ? 'Oui' : 'Non'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Derniere connexion</label>
              <p className="mt-1 text-sm text-gray-900">
                {member.user.lastLoginAt ? new Date(member.user.lastLoginAt).toLocaleString('fr-FR') : 'Jamais'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Membre depuis</label>
              <p className="mt-1 text-sm text-gray-900">{new Date(member.createdAt).toLocaleDateString('fr-FR')}</p>
            </div>
            {member.invitedAt && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Invite le</label>
                <p className="mt-1 text-sm text-gray-900">{new Date(member.invitedAt).toLocaleDateString('fr-FR')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Roles */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Roles</h2>
          {availableRoles.length === 0 ? (
            <p className="text-sm text-gray-500">Chargement des roles...</p>
          ) : (
            <div className="space-y-2">
              {availableRoles.map(role => (
                <label
                  key={role.id}
                  className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.includes(role.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedRoleIds([...selectedRoleIds, role.id]);
                      } else {
                        setSelectedRoleIds(selectedRoleIds.filter(id => id !== role.id));
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div className="ml-3">
                    <div className="text-sm font-medium text-gray-900">{role.name}</div>
                    {role.description && <div className="text-sm text-gray-500">{role.description}</div>}
                  </div>
                </label>
              ))}
              <button
                onClick={handleSaveRoles}
                disabled={saving}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                <Edit className="h-4 w-4 mr-2" />
                {saving ? 'Enregistrement...' : 'Enregistrer les roles'}
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Actions</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleResetPassword}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Key className="h-4 w-4 mr-2" />
              Reinitialiser le mot de passe
            </button>
            <button
              onClick={handleRevokeSessions}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Revoquer les sessions
            </button>
            <button
              onClick={handleToggleStatus}
              className={`inline-flex items-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium ${
                member.status === 'ACTIVE'
                  ? 'border-red-300 text-red-700 bg-white hover:bg-red-50'
                  : 'border-green-300 text-green-700 bg-white hover:bg-green-50'
              }`}
            >
              {member.status === 'ACTIVE' ? (
                <>
                  <UserX className="h-4 w-4 mr-2" />
                  Desactiver le compte
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2" />
                  Activer le compte
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};
