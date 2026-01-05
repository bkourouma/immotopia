import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { resendInvitation, revokeInvitation } from '../../services/invitation-service';
import apiClient from '../../utils/api-client';
import { Mail, RefreshCw, X } from 'lucide-react';

interface Invitation {
  id: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string;
  roleIds: string[];
}

export const InvitationsList: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId) {
      loadInvitations();
    }
  }, [tenantId]);

  const loadInvitations = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      // You may need to create this endpoint
      const response = await apiClient.get(`/tenants/${tenantId}/invitations`);
      if (response.data.success) {
        setInvitations(response.data.data || []);
      } else {
        setError('Erreur lors du chargement des invitations');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des invitations');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (invitationId: string) => {
    if (!tenantId) return;
    try {
      await resendInvitation(tenantId, invitationId);
      await loadInvitations();
      alert('Invitation renvoyée avec succès');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors du renvoi');
    }
  };

  const handleRevoke = async (invitationId: string) => {
    if (!tenantId || !window.confirm('Êtes-vous sûr de vouloir révoquer cette invitation ?'))
      return;
    try {
      await revokeInvitation(tenantId, invitationId);
      await loadInvitations();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la révocation');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      ACCEPTED: 'bg-green-100 text-green-800',
      REVOKED: 'bg-red-100 text-red-800',
      EXPIRED: 'bg-gray-100 text-gray-800',
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          styles[status as keyof typeof styles] || styles.PENDING
        }`}
      >
        {status === 'PENDING'
          ? 'En attente'
          : status === 'ACCEPTED'
          ? 'Acceptée'
          : status === 'REVOKED'
          ? 'Révoquée'
          : 'Expirée'}
      </span>
    );
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Invitations</h1>
            <p className="mt-2 text-sm text-slate-600">
              Gérez les invitations envoyées aux collaborateurs
            </p>
          </div>
          <button
            onClick={() => navigate(`/tenant/${tenantId}/invite`)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Nouvelle invitation
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Invitations List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement...</p>
          </div>
        ) : invitations.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Mail className="h-12 w-12 text-gray-400 mx-auto" />
            <p className="mt-4 text-gray-600">Aucune invitation trouvée</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date d'invitation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expiration
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invitations.map((invitation) => (
                  <tr key={invitation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{invitation.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(invitation.status)}
                      {invitation.status === 'PENDING' && isExpired(invitation.expiresAt) && (
                        <span className="ml-2 text-xs text-red-600">(Expirée)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(invitation.invitedAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(invitation.expiresAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {invitation.status === 'PENDING' && !isExpired(invitation.expiresAt) && (
                          <>
                            <button
                              onClick={() => handleResend(invitation.id)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Renvoyer"
                            >
                              <RefreshCw className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleRevoke(invitation.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Révoquer"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </>
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
    </DashboardLayout>
  );
};





