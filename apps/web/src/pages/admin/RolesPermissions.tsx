import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  List,
  Popconfirm,
  Row,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import {
  AppstoreOutlined,
  CheckOutlined,
  LockOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  UndoOutlined
} from '@ant-design/icons';
import {
  listRoles,
  getRole,
  listPermissions,
  updateRolePermissions,
  Role,
  Permission
} from '../../services/role-service';
import { listMenuAccess, updateMenuAccess, MenuAccessMap } from '../../services/role-menu-service';
import {
  catalogForPersona,
  defaultMenuMap,
  personaForRoleKey,
  resolveMenuMap,
  PORTAL_PSEUDO_ROLES
} from '../../navigation/menu-catalog';
import type { MenuCatalogEntry } from '../../navigation/menu-catalog';
import type { PersonaId } from '../../navigation/model';
import { NAVIGATION } from '../../navigation/model';
import { getPermissionLabelFr, getPermissionGroupLabelFr, getRoleLabelFr } from '../../constants/permissions-labels';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

/**
 * Admin › Rôles et permissions.
 *
 * L'écran ne montrait que des permissions techniques : une grille de cases
 * `RENTAL_LEASES_VIEW`, `CRM_DEALS_EDIT`, `MAINTENANCE_ADMIN`. On y réglait des
 * verrous sans jamais voir les portes — impossible de répondre à la seule
 * question que pose réellement un administrateur : **qu'est-ce que cette
 * personne verra dans son menu ?**
 *
 * L'onglet « Menus » répond à cette question, et il y répond avec l'arbre
 * exact de la sidebar, découpé par les mêmes catégories (« Parc immobilier »,
 * « Gestion locative », « Patrimoine et entretien », …). Il couvre les quatre
 * personas, y compris le propriétaire et le locataire, qui n'ont pas de ligne
 * dans `roles` mais ont bel et bien une navigation à régler.
 *
 * L'onglet « Permissions » conserve la grille d'origine : les deux réglages ne
 * font pas la même chose. Une permission dit ce qu'une requête a le droit de
 * faire ; un menu dit ce que l'interface propose. Couper un menu ne remplace
 * pas un contrôle d'accès — c'est d'ailleurs pourquoi l'état **par défaut**
 * d'un menu est déduit des permissions du rôle.
 */

/** Rôle tel que cet écran le manipule : ligne de `roles` **ou** pseudo-rôle de portail. */
interface ManagedRole {
  key: string;
  /** `null` pour les personas de portail, qui n'existent pas en base. */
  id: string | null;
  name: string;
  description: string;
  scope: 'PLATFORM' | 'TENANT' | 'PORTAL';
  persona: PersonaId | null;
}

function SCOPE_TAGS(): Record<ManagedRole['scope'], { color: string; label: string }> {
  return {
    PLATFORM: { color: 'blue', label: t('Plateforme') },
    TENANT: { color: 'green', label: t('Agence') },
    PORTAL: { color: 'purple', label: t('Portail client') }
  };
}

/**
 * Menus qu'on ne peut pas couper.
 *
 * Retirer « Administration » au super-administrateur lui retirerait l'écran
 * même où l'on rallume les menus : il n'y aurait plus, dans l'interface, aucun
 * chemin pour revenir en arrière. La case reste donc verrouillée.
 */
const LOCKED_MENU_KEYS = new Set(['super-admin.administration', 'super-admin.administration.admin-roles']);

export const RolesPermissions: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [menuAccess, setMenuAccess] = useState<MenuAccessMap>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  /** Permissions du rôle sélectionné, par identifiant (grille) et par clé (défauts de menus). */
  const [rolePermissionIds, setRolePermissionIds] = useState<Set<string>>(new Set());
  const [rolePermissionKeys, setRolePermissionKeys] = useState<Set<string> | null>(null);
  const [loadingRole, setLoadingRole] = useState(false);

  const [menuDraft, setMenuDraft] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [savingMenus, setSavingMenus] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /** Rôles de la base, plus les deux personas de portail. */
  const managedRoles: ManagedRole[] = useMemo(() => {
    const fromDb: ManagedRole[] = roles.map(role => {
      const fr = getRoleLabelFr(role.key, role.name, role.description);
      return {
        key: role.key,
        id: role.id,
        name: fr.name,
        description: fr.description || role.description || '',
        scope: role.scope,
        persona: personaForRoleKey(role.key)
      };
    });

    const portals: ManagedRole[] = PORTAL_PSEUDO_ROLES().map(pseudo => ({
      key: pseudo.key,
      id: null,
      name: pseudo.name,
      description: pseudo.description,
      scope: 'PORTAL',
      persona: pseudo.persona
    }));

    // Plateforme, puis agence, puis portails : l'ordre du plus large au plus
    // étroit, qui est aussi l'ordre dans lequel on raisonne sur les accès.
    const rank = { PLATFORM: 0, TENANT: 1, PORTAL: 2 } as const;
    return [...fromDb, ...portals].sort((a, b) => rank[a.scope] - rank[b.scope] || a.name.localeCompare(b.name));
  }, [roles]);

  const selectedRole = useMemo(
    () => managedRoles.find(role => role.key === selectedKey) ?? null,
    [managedRoles, selectedKey]
  );

  const sections = useMemo(
    () => (selectedRole?.persona ? catalogForPersona(selectedRole.persona) : []),
    [selectedRole?.persona]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [rolesData, permissionsData, menuAccessData] = await Promise.all([
          listRoles(),
          listPermissions(),
          listMenuAccess().catch(() => ({}) as MenuAccessMap)
        ]);
        if (cancelled) return;
        setRoles(rolesData);
        setPermissions(permissionsData);
        setMenuAccess(menuAccessData);
        setSelectedKey(current => current ?? rolesData[0]?.key ?? PORTAL_PSEUDO_ROLES()[0].key);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message || t('Erreur lors du chargement des données'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Charge les permissions du rôle sélectionné — source des états par défaut. */
  useEffect(() => {
    if (!selectedRole) return;

    // Un persona de portail n'a pas de permissions RBAC : `null` le signale, et
    // tous ses menus sont ouverts par défaut.
    if (!selectedRole.id) {
      setRolePermissionIds(new Set());
      setRolePermissionKeys(null);
      return;
    }

    let cancelled = false;
    setLoadingRole(true);

    getRole(selectedRole.id)
      .then(role => {
        if (cancelled) return;
        setRolePermissionIds(new Set(role.permissions?.map(p => p.id) ?? []));
        setRolePermissionKeys(new Set(role.permissions?.map(p => p.key) ?? []));
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.response?.data?.message || t('Erreur lors du chargement des permissions du rôle'));
      })
      .finally(() => {
        if (!cancelled) setLoadingRole(false);
      });

    return () => {
      cancelled = true;
    };
    // `selectedRole` est mémoïsé sur (rôles, clé sélectionnée) : le citer en
    // entier ne relance pas l'appel à chaque rendu.
  }, [selectedRole]);

  /** Carte enregistrée : les défauts du rôle, écrasés par les décisions prises. */
  const savedMenuMap = useMemo(() => {
    if (!selectedRole?.persona) return {};
    return resolveMenuMap(selectedRole.persona, rolePermissionKeys, menuAccess[selectedRole.key]);
  }, [selectedRole?.persona, selectedRole?.key, rolePermissionKeys, menuAccess]);

  // Le brouillon repart de l'enregistré à chaque changement de rôle ou de
  // chargement de permissions.
  useEffect(() => {
    setMenuDraft(savedMenuMap);
  }, [savedMenuMap]);

  const defaults = useMemo(
    () => (selectedRole?.persona ? defaultMenuMap(selectedRole.persona, rolePermissionKeys) : {}),
    [selectedRole?.persona, rolePermissionKeys]
  );

  const menusDirty = useMemo(
    () => Object.keys(savedMenuMap).some(key => Boolean(savedMenuMap[key]) !== Boolean(menuDraft[key])),
    [savedMenuMap, menuDraft]
  );

  const menuCounts = useMemo(() => {
    const keys = Object.keys(menuDraft);
    return { enabled: keys.filter(key => menuDraft[key]).length, total: keys.length };
  }, [menuDraft]);

  const handleSelectRole = (role: ManagedRole) => {
    setSelectedKey(role.key);
    setSuccess(null);
    setError(null);
  };

  /**
   * Bascule une entrée de premier niveau, et entraîne ses sous-entrées.
   *
   * Sans cet entraînement, couper « CRM » laisserait cinq sous-entrées cochées
   * sous un parent éteint : un état que le menu ne sait pas représenter, et que
   * personne ne saurait relire.
   */
  const toggleEntry = useCallback((entry: MenuCatalogEntry, enabled: boolean) => {
    setMenuDraft(prev => {
      const next = { ...prev, [entry.menuKey]: enabled };
      for (const child of entry.children) {
        next[child.menuKey] = enabled;
      }
      return next;
    });
  }, []);

  const toggleChild = useCallback((menuKey: string, enabled: boolean) => {
    setMenuDraft(prev => ({ ...prev, [menuKey]: enabled }));
  }, []);

  const handleResetMenus = () => {
    setMenuDraft(defaults);
  };

  const handleSaveMenus = async () => {
    if (!selectedRole) return;
    setSavingMenus(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateMenuAccess(selectedRole.key, menuDraft);
      setMenuAccess(prev => ({ ...prev, [selectedRole.key]: saved }));
      setSuccess(t('Menus de « {{name}} » enregistrés.', { name: selectedRole.name }));
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors de la mise à jour des menus'));
    } finally {
      setSavingMenus(false);
    }
  };

  const handlePermissionToggle = (permissionId: string) => {
    setRolePermissionIds(prev => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedRole?.id) return;
    setSavingPermissions(true);
    setError(null);
    setSuccess(null);
    try {
      await updateRolePermissions(selectedRole.id, Array.from(rolePermissionIds));
      const updated = await getRole(selectedRole.id);
      setRolePermissionIds(new Set(updated.permissions?.map(p => p.id) ?? []));
      setRolePermissionKeys(new Set(updated.permissions?.map(p => p.key) ?? []));
      setRoles(prev => prev.map(r => (r.id === updated.id ? { ...r, ...updated } : r)));
      setSuccess(t('Permissions mises à jour avec succès.'));
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors de la mise à jour des permissions'));
    } finally {
      setSavingPermissions(false);
    }
  };

  const groupedPermissions = useMemo(() => {
    return permissions
      .filter(perm => !perm.key.startsWith('COMMUNICATION_'))
      .reduce<Record<string, Permission[]>>((acc, perm) => {
        const prefix = perm.key.split('_')[0];
        (acc[prefix] ||= []).push(perm);
        return acc;
      }, {});
  }, [permissions]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 256 }}>
        <Spin size="large" />
      </div>
    );
  }

  const personaLabel = selectedRole?.persona ? NAVIGATION()[selectedRole.persona].label : null;

  const renderMenuEntry = (entry: MenuCatalogEntry) => {
    const locked = LOCKED_MENU_KEYS.has(entry.menuKey);
    const enabled = Boolean(menuDraft[entry.menuKey]);
    const customised = Boolean(defaults[entry.menuKey]) !== enabled;

    return (
      <div
        key={entry.menuKey}
        style={{
          border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 8,
          background: enabled ? undefined : 'var(--ant-color-fill-quaternary, #fafafa)',
          opacity: enabled ? 1 : 0.75
        }}
      >
        <Row align="middle" gutter={12} wrap={false}>
          <Col flex="none" style={{ fontSize: 18, color: 'var(--ant-color-primary)' }}>
            {entry.icon}
          </Col>
          <Col flex="auto" style={{ minWidth: 0 }}>
            <Space size={8} wrap>
              <Text strong>{entry.label}</Text>
              {locked && (
                <Tooltip title={t('Menu indispensable pour revenir régler les accès : il ne peut pas être coupé.')}>
                  <Tag icon={<LockOutlined />} color="default">
                    {t('Verrouillé')}
                  </Tag>
                </Tooltip>
              )}
              {customised && !locked && <Tag color="orange">{t('Personnalisé')}</Tag>}
            </Space>
            {entry.href && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {entry.href}
                </Text>
              </div>
            )}
          </Col>
          <Col flex="none">
            <Switch
              checked={enabled}
              disabled={locked}
              onChange={value => toggleEntry(entry, value)}
              aria-label={t('Activer le menu {{label}}', { label: entry.label })}
            />
          </Col>
        </Row>

        {entry.children.length > 0 && (
          <div style={{ marginTop: 12, paddingInlineStart: 30 }}>
            <Row gutter={[12, 6]}>
              {entry.children.map(child => {
                const childLocked = LOCKED_MENU_KEYS.has(child.menuKey);
                return (
                  <Col xs={24} md={12} key={child.menuKey}>
                    <Checkbox
                      checked={Boolean(menuDraft[child.menuKey])}
                      // Une sous-entrée sous un parent éteint n'est atteignable
                      // par aucun chemin : la laisser cochable serait un leurre.
                      disabled={!enabled || childLocked}
                      onChange={event => toggleChild(child.menuKey, event.target.checked)}
                    >
                      <Text style={{ fontSize: 13 }}>{child.label}</Text>
                    </Checkbox>
                  </Col>
                );
              })}
            </Row>
          </div>
        )}
      </div>
    );
  };

  const menusTab = !selectedRole ? (
    <Card>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Sélectionnez un rôle pour régler ses menus')} />
    </Card>
  ) : !selectedRole.persona ? (
    <Card>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t("Le rôle « {{name}} » n'est rattaché à aucune navigation : il n'a pas de menus à régler.", {
          name: selectedRole.name
        })}
      />
    </Card>
  ) : (
    <Card
      title={
        <Space wrap>
          <AppstoreOutlined />
          <span>
            {t('Menus —')} {selectedRole.name}
          </span>
          <Tag color={SCOPE_TAGS()[selectedRole.scope].color}>{SCOPE_TAGS()[selectedRole.scope].label}</Tag>
          <Badge
            count={`${menuCounts.enabled}/${menuCounts.total} actifs`}
            style={{ background: 'var(--ant-color-fill-secondary, #f0f0f0)', color: 'rgba(0,0,0,0.65)' }}
          />
        </Space>
      }
      extra={
        <Space>
          <Popconfirm
            title={t('Rétablir les valeurs par défaut ?')}
            description={t(
              "Les menus reprendront l'état déduit des permissions du rôle. Rien n'est enregistré tant que vous n'avez pas cliqué sur Enregistrer."
            )}
            okText={t('Rétablir')}
            cancelText={t('Annuler')}
            onConfirm={handleResetMenus}
          >
            <Button icon={<UndoOutlined />}>{t('Valeurs par défaut')}</Button>
          </Popconfirm>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveMenus}
            loading={savingMenus}
            disabled={!menusDirty}
          >
            {t('Enregistrer')}
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          title={personaLabel ? t('Navigation « {{personaLabel}} »', { personaLabel: personaLabel }) : t('Navigation')}
          description={
            <Text type="secondary" style={{ fontSize: 13 }}>
              Les catégories et les entrées ci-dessous sont exactement celles du menu latéral de ce persona. Par défaut,
              une entrée est active quand les permissions du rôle l'autorisent&nbsp;; la désactiver la retire du menu,
              de la barre d'onglets mobile et du tiroir de navigation. Ce réglage cache une entrée, il ne remplace pas
              un contrôle d'accès&nbsp;: les permissions restent réglées dans l'onglet voisin.
            </Text>
          }
        />

        {loadingRole ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : (
          sections.map(section => (
            <div key={section.id}>
              <Text
                strong
                style={{
                  display: 'block',
                  marginBottom: 10,
                  fontSize: 12,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))'
                }}
              >
                {section.label}
              </Text>
              {section.entries.map(renderMenuEntry)}
            </div>
          ))
        )}
      </Space>
    </Card>
  );

  const permissionsTab = !selectedRole ? (
    <Card>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Sélectionnez un rôle pour gérer ses permissions')} />
    </Card>
  ) : !selectedRole.id ? (
    <Card>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span>
            {selectedRole.name} n'est pas un rôle RBAC&nbsp;: son périmètre vient du rattachement à l'agence (bail ou
            bien), pas de permissions. Seuls ses menus se règlent, dans l'onglet voisin.
          </span>
        }
      />
    </Card>
  ) : (
    <Card
      title={
        <Space wrap>
          <SafetyCertificateOutlined />
          <span>
            {t('Permissions —')} {selectedRole.name}
          </span>
          <Tag color={SCOPE_TAGS()[selectedRole.scope].color}>{SCOPE_TAGS()[selectedRole.scope].label}</Tag>
        </Space>
      }
      extra={
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSavePermissions} loading={savingPermissions}>
          {t('Enregistrer')}
        </Button>
      }
    >
      {selectedRole.description && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {selectedRole.description}
        </Text>
      )}

      {loadingRole ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : Object.keys(groupedPermissions).length === 0 ? (
        <Empty description={t('Aucune permission disponible')} />
      ) : (
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          {Object.entries(groupedPermissions).map(([prefix, perms]) => (
            <div key={prefix}>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
                {getPermissionGroupLabelFr(prefix)}
              </Text>
              <Row gutter={[16, 8]}>
                {perms.map(permission => {
                  const isChecked = rolePermissionIds.has(permission.id);
                  const { label, description } = getPermissionLabelFr(
                    permission.key,
                    permission.description ?? undefined
                  );
                  return (
                    <Col xs={24} md={12} key={permission.id}>
                      <Checkbox
                        checked={isChecked}
                        onChange={() => handlePermissionToggle(permission.id)}
                        style={{ alignItems: 'flex-start', marginInlineEnd: 0 }}
                      >
                        <Space orientation="vertical" size={0}>
                          <Space>
                            <span>{label}</span>
                            {isChecked && <CheckOutlined style={{ color: 'var(--ant-color-success)' }} />}
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {description}
                          </Text>
                        </Space>
                      </Checkbox>
                    </Col>
                  );
                })}
              </Row>
            </div>
          ))}
        </Space>
      )}
    </Card>
  );

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          {t('Rôles, menus et permissions')}
        </Title>
        <Text type="secondary">
          {t("Choisissez un rôle, puis réglez les menus qu'il voit et les permissions qu'il détient.")}
        </Text>
      </div>

      {error && (
        <Alert title={t('Erreur')} description={error} type="error" showIcon closable onClose={() => setError(null)} />
      )}

      {success && (
        <Alert
          title={t('Succès')}
          description={success}
          type="success"
          showIcon
          closable
          onClose={() => setSuccess(null)}
        />
      )}

      <Row gutter={24}>
        <Col xs={24} lg={7} xl={6}>
          <Card
            title={t('Rôles')}
            size="small"
            extra={
              <Tooltip title={t('Recharger les rôles et les menus')}>
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => window.location.reload()}
                  aria-label={t('Recharger')}
                />
              </Tooltip>
            }
          >
            <List
              dataSource={managedRoles}
              renderItem={role => {
                const isSelected = selectedKey === role.key;
                const overrideCount = Object.values(menuAccess[role.key] ?? {}).length;
                return (
                  <List.Item
                    key={role.key}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'var(--ant-color-primary-bg)' : undefined,
                      borderRadius: 6,
                      marginBottom: 4,
                      paddingInlineStart: 8,
                      borderInlineStart: isSelected ? '3px solid var(--ant-color-primary)' : '3px solid transparent'
                    }}
                    onClick={() => handleSelectRole(role)}
                  >
                    <List.Item.Meta
                      avatar={
                        <SafetyCertificateOutlined
                          style={{ fontSize: 20, color: isSelected ? 'var(--ant-color-primary)' : undefined }}
                        />
                      }
                      title={<Text strong={isSelected}>{role.name}</Text>}
                      description={
                        <Space size={4} wrap>
                          <Tag color={SCOPE_TAGS()[role.scope].color}>{SCOPE_TAGS()[role.scope].label}</Tag>
                          {overrideCount > 0 && <Tag color="orange">{t('Menus personnalisés')}</Tag>}
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={17} xl={18}>
          <Tabs
            defaultActiveKey="menus"
            items={[
              { key: 'menus', label: t('Menus accessibles'), children: menusTab },
              { key: 'permissions', label: t('Permissions détaillées'), children: permissionsTab }
            ]}
          />
        </Col>
      </Row>
    </Space>
  );
};
