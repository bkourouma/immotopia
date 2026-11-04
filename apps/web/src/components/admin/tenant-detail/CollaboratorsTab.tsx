import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { App } from 'antd';
import { Eye, Plus, UserCheck, UserX, Users } from 'lucide-react';
import {
  disableMember,
  enableMember,
  listMembers,
  type Member,
  type MembershipFilters
} from '../../../services/membership-service';
import { listRoles, type Role } from '../../../services/role-service';
import { useListSearch } from '../../../hooks/useListSearch';
import { collectAllPages } from '../../../utils/table-export/collect';
import { Table } from '../../primitives';
import { getRoleLabelFr } from '../../../constants/permissions-labels';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

const STATUS_STYLES = {
  ACTIVE: 'bg-green-100 text-green-800',
  PENDING_INVITE: 'bg-yellow-100 text-yellow-800',
  DISABLED: 'bg-red-100 text-red-800'
} as const;

function statusBadge(status: string) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        STATUS_STYLES[status as keyof typeof STATUS_STYLES] || STATUS_STYLES.DISABLED
      }`}
    >
      {status === 'ACTIVE' ? t('Actif') : status === 'PENDING_INVITE' ? t('Invitation en attente') : t('Désactivé')}
    </span>
  );
}

/**
 * Onglet Collaborateurs de la fiche agence : liste paginée par le serveur
 * (GET /tenants/:tenantId/users, `page` + `limit`), au lieu des 50 premiers
 * collaborateurs sans suite.
 */
export const CollaboratorsTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Une réponse tardive d'une autre page ne doit pas écraser la dernière demandée.
  const latest = useRef(0);

  // Rôles d'agence pour le critère « Rôle » ; un échec laisse le critère sans options.
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => {
    let cancelled = false;
    listRoles('TENANT')
      .then(found => {
        if (!cancelled) setRoles(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Recherche multicritères (état dans l'URL, préfixe `collab` : l'onglet partage l'écran de l'agence).
  const search = useListSearch({
    paramPrefix: 'collab',
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom ou e-mail…') },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: [
          { value: 'ACTIVE', label: t('Actif') },
          { value: 'PENDING_INVITE', label: t('Invitation en attente') },
          { value: 'DISABLED', label: t('Désactivé') }
        ]
      },
      {
        key: 'role',
        type: 'select',
        label: t('Rôle'),
        primary: true,
        api: 'roleId',
        options: roles.map(role => ({ value: role.id, label: getRoleLabelFr(role.key, role.name).name }))
      }
    ]
  });
  const paramsKey = JSON.stringify(search.apiParams);

  const loadMembers = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const response = await listMembers(tenantId, JSON.parse(paramsKey) as MembershipFilters);
      if (request !== latest.current) return;
      if (response.success) {
        setMembers(response.data.members);
        setTotal(response.data.pagination?.total ?? response.data.members.length);
      } else {
        setError(t('Erreur lors du chargement des collaborateurs'));
      }
    } catch (err: any) {
      if (request !== latest.current) return;
      setError(err.response?.data?.message || t('Erreur lors du chargement des collaborateurs'));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [tenantId, paramsKey]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

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

  const columns: ColumnsType<Member> = [
    {
      title: t('Utilisateur'),
      key: 'user',
      render: (_, member) => (
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10">
            <div className="h-10 w-10 rounded-full bg-primary-bg flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="ms-4">
            <div className="text-sm font-medium text-gray-900">{member.user.fullName || member.user.email}</div>
            <div className="text-sm text-gray-500">{member.user.email}</div>
          </div>
        </div>
      )
    },
    {
      title: t('Rôles'),
      key: 'roles',
      render: (_, member) => (
        <div className="flex flex-wrap gap-1">
          {member.roles.map(role => (
            <span
              key={role.id}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-bg text-primary-active"
            >
              {getRoleLabelFr(role.key, role.name).name}
            </span>
          ))}
        </div>
      )
    },
    { title: t('Statut'), key: 'status', render: (_, member) => statusBadge(member.status) },
    {
      title: t('Dernière connexion'),
      key: 'lastLoginAt',
      render: (_, member) =>
        member.user.lastLoginAt ? new Date(member.user.lastLoginAt).toLocaleDateString(activeLocale()) : t('Jamais')
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, member) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => navigate(`/admin/tenants/${tenantId}/collaborators/${member.userId}`)}
            className="text-primary hover:text-primary-active"
            title={t('Voir les détails')}
          >
            <Eye className="h-5 w-5" />
          </button>
          {member.status === 'ACTIVE' ? (
            <button
              onClick={() => handleToggleStatus(member.userId, member.status)}
              className="text-red-600 hover:text-red-900"
              title={t('Désactiver')}
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
      )
    }
  ];

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
        <h3 className="text-lg font-medium text-gray-900">{t('Collaborateurs ({{count}})', { count: total })}</h3>
        <button
          onClick={() => navigate(`/admin/tenants/${tenantId}/collaborators/invite`)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4 me-2" />
          {t('Inviter')}
        </button>
      </div>

      <Table<Member>
        search={search.searchProps}
        exportFilename={t('Collaborateurs')}
        exportFetchAll={() =>
          collectAllPages<Member>(async (page, limit) => {
            const response = await listMembers(tenantId, {
              ...(search.filterParams as MembershipFilters),
              page,
              limit
            });
            return { items: response.data?.members ?? [], total: response.data?.pagination?.total ?? 0 };
          })
        }
        rowKey="id"
        columns={columns}
        dataSource={members}
        loading={loading}
        scroll={{ x: 'max-content' }}
        aria-label={t('Collaborateurs')}
        locale={search.isFiltered ? undefined : { emptyText: t('Aucun collaborateur') }}
        pagination={search.tablePagination(total)}
      />
    </div>
  );
};
