import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  inviteCollaborator,
  InviteCollaboratorRequest,
  isInvitationEmailNotSent
} from '../../services/invitation-service';
import { getTenant, Tenant } from '../../services/tenant-service';
import apiClient from '../../utils/api-client';
import { getRoleLabelFr } from '../../constants/permissions-labels';
import { Mail } from 'lucide-react';
import { App, Button, Input } from 'antd';
import { PageHeader } from '../../components/primitives';
import { t } from '../../i18n/t';
import { HelpButton } from '../../help';

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: 'PLATFORM' | 'TENANT';
}

export const AdminInviteCollaborator: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState<InviteCollaboratorRequest>({
    email: '',
    roleIds: []
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
      setError(t('Veuillez sélectionner au moins un rôle'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await inviteCollaborator(tenantId, formData);
      if (response.success) {
        const warning = t(
          "Invitation créée, mais l'e-mail n'a pas pu être envoyé. Utilisez « Renvoyer » pour réessayer."
        );
        if (isInvitationEmailNotSent(response, warning)) {
          // Invitation créée mais e-mail non parti : ne pas annoncer un succès.
          message.warning(response.message || warning);
        } else {
          message.success(t('Invitation envoyée avec succès'));
        }
        navigate(`/admin/tenants/${tenantId}`);
      } else {
        setError(response.message || t("Erreur lors de l'invitation"));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t("Erreur lors de l'invitation"));
    } finally {
      setLoading(false);
    }
  };

  const handleRoleToggle = (roleId: string) => {
    setFormData(prev => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId) ? prev.roleIds.filter(id => id !== roleId) : [...prev.roleIds, roleId]
    }));
  };

  const dirty = formData.email.trim() !== '' || formData.roleIds.length > 0;
  useEffect(() => {
    if (!dirty || loading) return undefined;
    const avertir = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  }, [dirty, loading]);

  const tenantName = tenant?.name ?? t('Chargement...');

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title={t('Inviter un collaborateur')}
          subtitle={tenant ? t('Agence : {{value}}', { value: tenant.name }) : t('Chargement...')}
          breadcrumbs={[
            { label: t('Agences'), to: '/admin/tenants' },
            { label: tenantName, to: `/admin/tenants/${tenantId}` },
            { label: t('Inviter un collaborateur') }
          ]}
        />

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4" role="alert">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="bg-primary-bg border border-primary-border rounded-md p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <p className="text-sm text-primary-active">
                {t('Une invitation sera envoyée par e-mail au collaborateur.')}
              </p>
              <HelpButton size="small" helpId="administration.plateforme-agences.invitation.formulaire" />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              {t('Email')} <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              id="email"
              name="email"
              required
              autoComplete="off"
              inputMode="email"
              size="large"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@example.com"
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700">
              {t('Rôles')} <span className="text-red-500">*</span>
            </p>
            <p className="mb-3 text-sm text-gray-500">
              {t('Le rôle décide de ce que le collaborateur peut voir et faire. Cochez-en au moins un.')}
            </p>
            {roles.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500" role="status">
                {t('Chargement des rôles...')}
              </p>
            ) : (
              <div className="space-y-2">
                {roles.map(role => {
                  const { name: labelFr, description: descFr } = getRoleLabelFr(role.key, role.name, role.description);
                  return (
                    <label
                      key={role.id}
                      style={{ minHeight: 44 }}
                      className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.roleIds.includes(role.id)
                          ? 'border-primary bg-primary-bg'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.roleIds.includes(role.id)}
                        onChange={() => handleRoleToggle(role.id)}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                      <div className="ms-3">
                        <div className="text-sm font-medium text-gray-900">{labelFr}</div>
                        {descFr && <div className="text-sm text-gray-500">{descFr}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-gray-200">
            <Button onClick={() => navigate(`/admin/tenants/${tenantId}`)} disabled={loading} style={{ minHeight: 44 }}>
              {t('Annuler')}
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              disabled={loading || formData.roleIds.length === 0}
              style={{ minHeight: 44 }}
            >
              {loading ? t('Envoi en cours...') : t("Envoyer l'invitation")}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
};
