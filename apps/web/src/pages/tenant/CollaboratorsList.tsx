import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card, Button, Tag, Space, Avatar, Popconfirm, Alert, Typography } from 'antd';
import { UserOutlined, PlusOutlined, EyeOutlined, UserDeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { listMembers, Member, disableMember, enableMember } from '../../services/membership-service';
import { listRoles } from '../../services/role-service';
import { getRoleLabelFr } from '../../constants/permissions-labels';
import type { ColumnsType } from 'antd/es/table';
import { Table } from '../../components/primitives';
import { useListSearch } from '../../hooks/useListSearch';
import { queryKey, entityKeyPrefix, STALE_TIME } from '../../lib/query-keys';
import { collectAllPages } from '../../utils/table-export/collect';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

/**
 * Collaborateurs — exemple « liste paginée serveur » de la recherche
 * multicritères (guide : `docs/architecture/recherche-listes.md`).
 *
 * Le patron en trois gestes :
 * 1. `useListSearch` déclare les critères (libellés en `t()`, dans le corps du
 *    composant) ; l'état vit dans l'URL : `?q=kou&status=ACTIVE,DISABLED&role=<id>&page=2`.
 * 2. `search.apiParams` (critères + page + limite) alimente `useQuery` et sa clé :
 *    changer un critère relance la requête, `keepPreviousData` garde la page
 *    affichée pendant ce temps.
 * 3. `<Table search pagination>` rend la barre, le compteur et l'état « aucun
 *    résultat ». L'export réutilise `search.filterParams` : mêmes critères que la liste.
 */
export const CollaboratorsList: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Rôles de l'agence, chargés une fois ; un échec laisse simplement le critère sans options.
  const { data: roles } = useQuery({
    queryKey: queryKey('roles', tenantId, { scope: 'TENANT' }),
    queryFn: () => listRoles('TENANT'),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const search = useListSearch({
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
        options: (roles ?? []).map(role => ({ value: role.id, label: getRoleLabelFr(role.key, role.name).name }))
      }
    ]
  });

  const {
    data,
    isFetching,
    error: queryError
  } = useQuery({
    queryKey: queryKey('members', tenantId, search.apiParams),
    queryFn: () => listMembers(tenantId as string, search.apiParams),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const members = data?.data?.members ?? [];
  const total = data?.data?.pagination?.total ?? 0;
  const error = queryError
    ? (queryError as { response?: { data?: { message?: string } } }).response?.data?.message ||
      t('Erreur lors du chargement des collaborateurs')
    : null;

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    if (!tenantId) return;
    try {
      if (currentStatus === 'ACTIVE') {
        await disableMember(tenantId, userId);
        message.success(t('Collaborateur désactivé avec succès'));
      } else {
        await enableMember(tenantId, userId);
        message.success(t('Collaborateur activé avec succès'));
      }
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('members', tenantId) });
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la modification'));
    }
  };

  const getStatusTag = (status: string) => {
    const statusConfig = {
      ACTIVE: { color: 'success', text: t('Actif') },
      PENDING_INVITE: { color: 'warning', text: t('Invitation en attente') },
      DISABLED: { color: 'error', text: t('Désactivé') }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DISABLED;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns: ColumnsType<Member> = [
    {
      title: t('Utilisateur'),
      key: 'user',
      width: 250,
      exportValue: record =>
        record.user.fullName ? `${record.user.fullName} — ${record.user.email}` : record.user.email,
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <div>{record.user.fullName || record.user.email}</div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.user.email}
            </Text>
          </div>
        </Space>
      )
    },
    {
      title: t('Rôles'),
      key: 'roles',
      width: 200,
      exportValue: record => record.roles.map(role => role.name).join(', '),
      render: (_, record) => (
        <Space size="small" wrap>
          {record.roles.map(role => (
            <Tag key={role.id} color="blue">
              {getRoleLabelFr(role.key, role.name).name}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: t('Dernière connexion'),
      key: 'lastLogin',
      width: 150,
      render: (_, record) =>
        record.user.lastLoginAt ? new Date(record.user.lastLoginAt).toLocaleDateString(activeLocale()) : t('Jamais')
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/tenant/${tenantId}/collaborators/${record.userId}`)}
            title={t('Voir les détails')}
          />
          {record.status === 'ACTIVE' ? (
            <Popconfirm
              title={t('Désactiver le collaborateur')}
              description={t('Êtes-vous sûr de vouloir désactiver ce collaborateur ?')}
              onConfirm={() => handleToggleStatus(record.userId, record.status)}
              okText={t('Oui')}
              cancelText={t('Non')}
            >
              <Button type="text" danger icon={<UserDeleteOutlined />} title={t('Désactiver')} />
            </Popconfirm>
          ) : (
            <Popconfirm
              title={t('Activer le collaborateur')}
              description={t('Êtes-vous sûr de vouloir activer ce collaborateur ?')}
              onConfirm={() => handleToggleStatus(record.userId, record.status)}
              okText={t('Oui')}
              cancelText={t('Non')}
            >
              <Button type="text" icon={<CheckCircleOutlined />} title={t('Activer')} />
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div className="it-toolbar it-toolbar--start">
          <div>
            <Title level={2} style={{ margin: 0 }}>
              {t('Collaborateurs')}
            </Title>
            <Text type="secondary">{t('Gérez les collaborateurs de votre agence')}</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/tenant/${tenantId}/invite`)}>
            {t('Inviter un collaborateur')}
          </Button>
        </div>

        {/* Error Message */}
        {error && <Alert message={t('Erreur')} description={error} type="error" showIcon />}

        {/* Members Table */}
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <Table
              aria-label={t('Collaborateurs')}
              helpId="administration.equipe.collaborateurs.tableau"
              search={search.searchProps}
              exportFilename={t('Collaborateurs')}
              exportFetchAll={() =>
                collectAllPages<Member>(async (page, limit) => {
                  const response = await listMembers(tenantId as string, { ...search.filterParams, page, limit });
                  return { items: response.data?.members ?? [], total: response.data?.pagination?.total ?? 0 };
                })
              }
              columns={columns}
              dataSource={members}
              rowKey="id"
              loading={isFetching}
              scroll={{ x: 'max-content' }}
              pagination={search.tablePagination(total)}
              // Sous critère, la Table affiche seule « aucun résultat » + Effacer.
              locale={search.isFiltered ? undefined : { emptyText: t('Aucun collaborateur pour le moment.') }}
            />
          </div>
        </Card>
      </Space>
    </>
  );
};
