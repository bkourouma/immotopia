import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { Edit, Key, LogOut, UserX, UserCheck } from 'lucide-react';
import { App, Button, Input, Modal, Typography } from 'antd';
import { PageHeader, SkeletonDetail, StateBlock, StatusTag, useConfirmAction } from '../../components/primitives';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';

import { activeLocale } from '../../i18n/format';
interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export const AdminCollaboratorDetail: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const { tenantId, userId } = useParams<{ tenantId: string; userId: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<Member | null>(null);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [passwordShown, setPasswordShown] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

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
        setError(t('Erreur lors du chargement du collaborateur'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement du collaborateur'));
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
    } finally {
      setRolesLoading(false);
    }
  };

  const initialRoleIds = member ? member.roles.map(r => r.id) : [];
  const rolesDirty =
    member !== null &&
    (selectedRoleIds.length !== initialRoleIds.length || selectedRoleIds.some(id => !initialRoleIds.includes(id)));

  // Garde de sortie : un changement de rôle non enregistré ne se perd pas en silence.
  useEffect(() => {
    if (!rolesDirty) return undefined;
    const avertir = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  }, [rolesDirty]);

  const handleSaveRoles = async () => {
    if (!tenantId || !userId) return;
    setSaving(true);
    try {
      await updateMember(tenantId, userId, { roleIds: selectedRoleIds });
      await loadMember();
      message.success(t('Rôles mis à jour avec succès'));
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la mise à jour'));
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = async () => {
    if (!revealedPassword) return;
    try {
      await navigator.clipboard.writeText(revealedPassword);
      setPasswordCopied(true);
    } catch {
      message.error(t('Copie impossible : affichez le mot de passe et copiez-le à la main.'));
    }
  };

  const closePasswordModal = () => {
    setRevealedPassword(null);
    setPasswordShown(false);
    setPasswordCopied(false);
  };

  const handleResetPassword = () => {
    if (!tenantId || !userId) return;
    confirmAction({
      title: t('Réinitialiser le mot de passe de {{value}} ?', {
        value: member?.user?.fullName ?? t('ce collaborateur')
      }),
      description: t("Un email sera envoyé à l'utilisateur."),
      okText: t('Réinitialiser'),
      danger: true,
      onConfirm: async () => {
        try {
          const response = await resetMemberPassword(tenantId, userId, { sendEmail: true });
          const newPassword = response.data?.newPassword;
          if (newPassword) {
            // Le mot de passe régénéré est masqué par défaut, copiable, et
            // annoncé comme affiché une seule fois.
            setPasswordShown(false);
            setPasswordCopied(false);
            setRevealedPassword(newPassword);
          } else {
            message.success(t("Mot de passe réinitialisé. Un email a été envoyé à l'utilisateur."));
          }
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors de la réinitialisation'));
        }
      }
    });
  };

  const handleRevokeSessions = () => {
    if (!tenantId || !userId) return;
    confirmAction({
      title: t('Révoquer toutes les sessions de {{value}} ?', {
        value: member?.user?.fullName ?? t('ce collaborateur')
      }),
      description: t('Il devra se reconnecter sur tous ses appareils.'),
      okText: t('Révoquer'),
      danger: true,
      onConfirm: async () => {
        try {
          await revokeMemberSessions(tenantId, userId);
          message.success(t('Toutes les sessions ont été révoquées'));
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors de la révocation'));
        }
      }
    });
  };

  const handleToggleStatus = () => {
    if (!tenantId || !userId || !member) return;
    const disabling = member.status === 'ACTIVE';
    const name = member.user?.fullName ?? t('ce collaborateur');
    confirmAction({
      title: disabling ? t('Désactiver {{value}} ?', { value: name }) : t('Activer {{value}} ?', { value: name }),
      description: disabling
        ? t('Il ne pourra plus se connecter tant que le compte reste désactivé.')
        : t('Il pourra de nouveau se connecter.'),
      okText: disabling ? t('Désactiver') : t('Activer'),
      danger: disabling,
      onConfirm: async () => {
        try {
          if (disabling) {
            await disableMember(tenantId, userId);
          } else {
            await enableMember(tenantId, userId);
          }
          await loadMember();
          message.success(disabling ? t('Collaborateur désactivé') : t('Collaborateur activé'));
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors de la modification'));
        }
      }
    });
  };

  if (loading && !member) {
    return <SkeletonDetail />;
  }

  if (error || !member) {
    return (
      <StateBlock
        variant="error"
        title={t('Collaborateur introuvable')}
        description={error || t('Collaborateur introuvable')}
        actions={[
          { label: t('Réessayer'), onClick: () => void loadMember(), primary: true },
          { label: t("Retour à l'agence"), onClick: () => navigate(`/admin/tenants/${tenantId}`) }
        ]}
      />
    );
  }

  const memberName = member.user.fullName || member.user.email;
  const isActive = member.status === 'ACTIVE';
  const statusTag =
    member.status === 'ACTIVE' ? (
      <StatusTag status="ACTIVE" label={t('Actif')} />
    ) : member.status === 'PENDING_INVITE' ? (
      <StatusTag status="PENDING" label={t('Invitation en attente')} />
    ) : (
      <StatusTag status="INACTIVE" tone="danger" label={t('Désactivé')} />
    );

  const infoRows: Array<[string, React.ReactNode]> = [
    [t('Email'), member.user.email],
    [t('Nom complet'), member.user.fullName || '-'],
    [t('Email vérifié'), member.user.emailVerified ? t('Oui') : t('Non')],
    [
      t('Dernière connexion'),
      member.user.lastLoginAt ? new Date(member.user.lastLoginAt).toLocaleString(activeLocale()) : t('Jamais')
    ],
    [t('Membre depuis'), new Date(member.createdAt).toLocaleDateString(activeLocale())]
  ];
  if (member.invitedAt) {
    infoRows.push([t('Invité le'), new Date(member.invitedAt).toLocaleDateString(activeLocale())]);
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title={memberName}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              {member.user.email} {statusTag}
            </span>
          }
          breadcrumbs={[
            { label: t('Agences'), to: '/admin/tenants' },
            { label: t("Retour à l'agence"), to: `/admin/tenants/${tenantId}` },
            { label: memberName }
          ]}
          primaryAction={{
            label: t('Enregistrer les rôles'),
            icon: <Edit className="h-4 w-4" />,
            onClick: () => void handleSaveRoles(),
            loading: saving,
            disabled: !rolesDirty,
            disabledReason: t('Aucun changement de rôle à enregistrer')
          }}
        />

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-medium text-gray-900">{t('Informations')}</h2>
          <dl className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {infoRows.map(([label, value]) => (
              <div key={label}>
                <dt className="block text-sm font-medium text-gray-700">{label}</dt>
                <dd className="mt-1 text-sm text-gray-900 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">
            <HelpSectionTitle title={t('Rôles')} helpId="administration.plateforme-agences.collaborateur.roles" />
          </h2>
          {rolesLoading ? (
            <p className="text-sm text-gray-500" role="status">
              {t('Chargement des rôles...')}
            </p>
          ) : availableRoles.length === 0 ? (
            <p className="text-sm text-gray-500">{t('Aucun rôle disponible pour le moment.')}</p>
          ) : (
            <div className="space-y-2">
              {availableRoles.map(role => (
                <label
                  key={role.id}
                  className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  style={{ minHeight: 44 }}
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
                    className="h-5 w-5 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <div className="ms-3">
                    <div className="text-sm font-medium text-gray-900">{role.name}</div>
                    {role.description && <div className="text-sm text-gray-500">{role.description}</div>}
                  </div>
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  type="primary"
                  onClick={() => void handleSaveRoles()}
                  loading={saving}
                  disabled={!rolesDirty}
                  style={{ minHeight: 44 }}
                >
                  {saving ? t('Enregistrement...') : t('Enregistrer les rôles')}
                </Button>
                {rolesDirty && (
                  <Typography.Text type="warning" role="status">
                    {t('Modifications non enregistrées')}
                  </Typography.Text>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">
            <HelpSectionTitle title={t('Actions')} helpId="administration.plateforme-agences.collaborateur.actions" />
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button icon={<Key className="h-4 w-4" />} onClick={handleResetPassword} style={{ minHeight: 44 }}>
              {t('Réinitialiser le mot de passe')}
            </Button>
            <Button icon={<LogOut className="h-4 w-4" />} onClick={handleRevokeSessions} style={{ minHeight: 44 }}>
              {t('Révoquer les sessions')}
            </Button>
            <Button
              danger={isActive}
              icon={isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
              onClick={handleToggleStatus}
              style={{ minHeight: 44 }}
            >
              {isActive ? t('Désactiver le compte') : t('Activer le compte')}
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={revealedPassword !== null}
        title={t('Nouveau mot de passe')}
        onCancel={closePasswordModal}
        mask={{ closable: false }}
        footer={
          <Button type="primary" onClick={closePasswordModal} style={{ minHeight: 44 }}>
            {t('Fermer')}
          </Button>
        }
      >
        <div className="space-y-3">
          <Typography.Text type="warning" strong>
            {t('Ce mot de passe ne sera plus affiché une fois cette fenêtre fermée.')}
          </Typography.Text>
          <Input
            readOnly
            dir="ltr"
            aria-label={t('Nouveau mot de passe')}
            type={passwordShown ? 'text' : 'password'}
            value={revealedPassword ?? ''}
            style={{ minHeight: 44 }}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPasswordShown(v => !v)} style={{ minHeight: 44 }}>
              {passwordShown ? t('Masquer') : t('Afficher')}
            </Button>
            <Button onClick={() => void copyPassword()} style={{ minHeight: 44 }}>
              {passwordCopied ? t('Copié') : t('Copier')}
            </Button>
          </div>
          <Typography.Text type="secondary">{t("Un email a été envoyé à l'utilisateur.")}</Typography.Text>
        </div>
      </Modal>
    </>
  );
};
