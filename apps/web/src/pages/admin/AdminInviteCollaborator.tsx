import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { inviteCollaborator, InviteCollaboratorRequest } from '../../services/invitation-service';
import { getTenant, Tenant } from '../../services/tenant-service';
import apiClient from '../../utils/api-client';
import { ArrowLeft, Mail, Users } from 'lucide-react';

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: 'PLATFORM' | 'TENANT';
}

export const AdminInviteCollaborator: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState<InviteCollaboratorRequest>({
    email: '',
    roleIds: [],
  });

  useEffect(() => {
    if (tenantId) {
      loadTenant();
      loadRoles();
    }
  }, [tenantId]);

  const loadTenant = async () => {
    if (!tenantId) return;
    try {
      const response = await getTenant(tenantId);
      if (response.success) {
        setTenant(response.data);
      }
    } catch (err) {
      console.error('Error loading tenant:', err);
    }
  };

  const loadRoles = async () => {
    try {
      const response = await apiClient.get('/roles?scope=TENANT');
      if (response.data.success) {
        setRoles(response.data.data || []);
      }
    } catch (err) {
      console.error('Error loading roles:', err);
      setRoles([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (formData.roleIds.length === 0) {
      setError('Veuillez selectionner au moins un role');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await inviteCollaborator(tenantId, formData);
      if (response.success) {
        alert('Invitation envoyee avec succes');
        navigate(`/admin/tenants/${tenantId}`);
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
            onClick={() => navigate(`/admin/tenants/${tenantId}`)}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Inviter un collaborateur</h1>
            <p className="mt-2 text-sm text-slate-600">
              {tenant ? `Tenant: ${tenant.name}` : 'Chargement...'}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              <p className="text-sm text-blue-800">
                Une invitation sera envoyee par email au collaborateur.
              </p>
            </div>
          </div>

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
              Roles <span className="text-red-500">*</span>
            </label>
            {roles.length === 0 ? (
              <div className="text-center py-4">
                <Users className="h-8 w-8 mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">Chargement des roles...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.roleIds.includes(role.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
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

          <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate(`/admin/tenants/${tenantId}`)}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || formData.roleIds.length === 0}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Envoi en cours...' : 'Envoyer l\'invitation'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};
