import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import {
  getMember,
  updateMember,
  resetMemberPassword,
  revokeMemberSessions,
  Member,
} from '../../services/membership-service';
import apiClient from '../../utils/api-client';
import { ArrowLeft, Edit, Key, LogOut, UserX, UserCheck } from 'lucide-react';

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export const CollaboratorDetail: React.FC = () => {
  const { tenantId, userId } = useParams<{ tenantId: string; userId: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<Member | null>(null);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

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
        setSelectedRoleIds(response.data.roles.map((r) => r.id));
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
    try {
      await updateMember(tenantId, userId, { roleIds: selectedRoleIds });
      await loadMember();
      alert('Rôles mis à jour avec succès');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la mise à jour');
    }
  };

  const handleResetPassword = async () => {
    if (!tenantId || !userId) return;
    if (!window.confirm('Êtes-vous sûr de vouloir réinitialiser le mot de passe ?')) return;
    try {
      const response = await resetMemberPassword(tenantId, userId, { sendEmail: true });
      alert('Mot de passe réinitialisé. Un email a été envoyé à l\'utilisateur.');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la réinitialisation');
    }
  };

  const handleRevokeSessions = async () => {
    if (!tenantId || !userId) return;
    if (!window.confirm('Êtes-vous sûr de vouloir révoquer toutes les sessions ?')) return;
    try {
      await revokeMemberSessions(tenantId, userId);
      alert('Toutes les sessions ont été révoquées');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la révocation');
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
              onClick={() => navigate(`/tenant/${tenantId}/collaborators`)}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {member.user.fullName || member.user.email}
              </h1>
              <p className="mt-2 text-sm text-slate-600">{member.user.email}</p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
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
              <label className="block text-sm font-medium text-gray-700">Statut</label>
              <p className="mt-1 text-sm text-gray-900">
                {member.status === 'ACTIVE'
                  ? 'Actif'
                  : member.status === 'PENDING_INVITE'
                  ? 'Invitation en attente'
                  : 'Désactivé'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Dernière connexion</label>
              <p className="mt-1 text-sm text-gray-900">
                {member.user.lastLoginAt
                  ? new Date(member.user.lastLoginAt).toLocaleString('fr-FR')
                  : 'Jamais'}
              </p>
            </div>
          </div>

          {/* Roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Rôles</label>
            {availableRoles.length === 0 ? (
              <p className="text-sm text-gray-500">Chargement des rôles...</p>
            ) : (
              <div className="space-y-2">
                {availableRoles.map((role) => (
                  <label
                    key={role.id}
                    className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.includes(role.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRoleIds([...selectedRoleIds, role.id]);
                        } else {
                          setSelectedRoleIds(selectedRoleIds.filter((id) => id !== role.id));
                        }
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900">{role.name}</div>
                      {role.description && (
                        <div className="text-sm text-gray-500">{role.description}</div>
                      )}
                    </div>
                  </label>
                ))}
                <button
                  onClick={handleSaveRoles}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Enregistrer les rôles
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Actions</h3>
            <div className="flex gap-4">
              <button
                onClick={handleResetPassword}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Key className="h-4 w-4 mr-2" />
                Réinitialiser le mot de passe
              </button>
              <button
                onClick={handleRevokeSessions}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Révoquer les sessions
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};





