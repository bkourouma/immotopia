import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { inviteCollaborator, InviteCollaboratorRequest } from '../../services/invitation-service';
import apiClient from '../../utils/api-client';
import { ArrowLeft } from 'lucide-react';

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: 'PLATFORM' | 'TENANT';
}

export const InviteCollaborator: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [formData, setFormData] = useState<InviteCollaboratorRequest>({
    email: '',
    roleIds: [],
  });

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      // Fetch tenant roles - you may need to create this endpoint
      // For now, using a placeholder
      const response = await apiClient.get('/roles?scope=TENANT');
      if (response.data.success) {
        setRoles(response.data.data || []);
      }
    } catch (err) {
      console.error('Error loading roles:', err);
      // Set default roles if API fails
      setRoles([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (formData.roleIds.length === 0) {
      setError('Veuillez sélectionner au moins un rôle');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await inviteCollaborator(tenantId, formData);
      if (response.success) {
        navigate(`/tenant/${tenantId}/invitations`);
      } else {
        setError(response.message || 'Erreur lors de l\'invitation');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l\'invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleToggle = (roleId: string) => {
    setFormData((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/tenant/${tenantId}/collaborators`)}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Inviter un collaborateur</h1>
            <p className="mt-2 text-sm text-slate-600">Envoyer une invitation à un nouvel utilisateur</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Rôles <span className="text-red-500">*</span>
            </label>
            {roles.length === 0 ? (
              <p className="text-sm text-gray-500">Chargement des rôles...</p>
            ) : (
              <div className="space-y-2">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.roleIds.includes(role.id)}
                      onChange={() => handleRoleToggle(role.id)}
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
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate(`/tenant/${tenantId}/collaborators`)}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || formData.roleIds.length === 0}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Envoi...' : 'Envoyer l\'invitation'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};





