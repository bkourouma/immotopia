import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Empty,
  List,
  Popconfirm,
  Row,
  Space,
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
  getPortalPseudoRoles
} from '../../navigation/menu-catalog';
import type { MenuCatalogEntry } from '../../navigation/menu-catalog';
import type { PersonaId } from '../../navigation/model';
import { getNavigation } from '../../navigation/model';
import { getPermissionLabelFr, getPermissionGroupLabelFr, getRoleLabelFr } from '../../constants/permissions-labels';
import { ListSearch, PageHeader, SkeletonDetail, StateBlock, useConfirmAction } from '../../components/primitives';
import { useLocalListSearch } from '../../utils/list-search';
import { MenuTenantSelect, MenuScopeChoice, sameMenuScope } from '../../components/admin/MenuTenantSelect';
import { t } from '../../i18n/t';
import { HelpButton, HelpSectionTitle, helpAnchor } from '../../help';
import { localizedRecord } from '../../i18n/localized';

const { Text } = Typography;

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

/** Une entrée de menu et la section qui la porte (liste à plat pour la recherche locale). */
interface MenuRow {
  sectionId: string;
  entry: MenuCatalogEntry;
}

// Accesseurs de la recherche locale : constantes de module (identité stable).
const PERMISSION_TEXT = [
  (p: Permission) => p.key,
  (p: Permission) => getPermissionLabelFr(p.key, p.description ?? undefined).label,
  (p: Permission) => getPermissionLabelFr(p.key, p.description ?? undefined).description,
  (p: Permission) => getPermissionGroupLabelFr(p.key.split('_')[0])
];
const MENU_TEXT = [
  (row: MenuRow) => row.entry.label,
  (row: MenuRow) => row.entry.href,
  (row: MenuRow) => row.entry.children.map(child => child.label)
];

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

const SCOPE_TAGS: Record<ManagedRole['scope'], { color: string; label: string }> = localizedRecord(() => ({
  PLATFORM: { color: 'blue', label: t('Plateforme') },
  TENANT: { color: 'green', label: t('Agence') },
  PORTAL: { color: 'purple', label: t('Portail client') }
}));

/**
 * Menus qu'on ne peut pas couper.
 *
 * Retirer « Administration » au super-administrateur lui retirerait l'écran
 * même où l'on rallume les menus : il n'y aurait plus, dans l'interface, aucun
 * chemin pour revenir en arrière. La case reste donc verrouillée.
 */
const LOCKED_MENU_KEYS = new Set(['super-admin.administration', 'super-admin.administration.admin-roles']);

export const RolesPermissions: React.FC = () => {
  const confirmAction = useConfirmAction();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [menuAccess, setMenuAccess] = useState<MenuAccessMap>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  /** Permissions du rôle sélectionné, par identifiant (grille) et par clé (défauts de menus). */
  const [rolePermissionIds, setRolePermissionIds] = useState<Set<string>>(new Set());
  /** Dernière version enregistrée des permissions : sert à détecter les modifications. */
  const [savedPermissionIds, setSavedPermissionIds] = useState<Set<string>>(new Set());
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const [initToken, setInitToken] = useState(0);
  const [rolePermissionKeys, setRolePermissionKeys] = useState<Set<string> | null>(null);
  const [loadingRole, setLoadingRole] = useState(false);

  /** Périmètre réglé (rôles d'agence et portails) : défaut commun ou une agence. */
  const [choice, setChoice] = useState<MenuScopeChoice | null>(null);
  /** Réglages propres à l'agence choisie (vide pour le défaut et la plateforme). */
  const [ownAccess, setOwnAccess] = useState<MenuAccessMap>({});
  const [reloadToken, setReloadToken] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [loadingMenuAccess, setLoadingMenuAccess] = useState(false);

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

    const portals: ManagedRole[] = getPortalPseudoRoles().map(pseudo => ({
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
        const [rolesData, permissionsData] = await Promise.all([listRoles(), listPermissions()]);
        if (cancelled) return;
        setRoles(rolesData);
        setPermissions(permissionsData);
        setSelectedKey(current => current ?? rolesData[0]?.key ?? getPortalPseudoRoles()[0].key);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message || t('Erreur lors du chargement des données'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initToken]);

  /** Les rôles de plateforme se règlent sans agence ; tous les autres exigent un choix. */
  const needsTenant = !!selectedRole && selectedRole.scope !== 'PLATFORM';
  const scopeTenantId = needsTenant && choice?.kind === 'tenant' ? choice.id : null;
  const awaitingTenant = needsTenant && !choice;
  const tenantMode = needsTenant && choice?.kind === 'tenant';
  const defaultMode = needsTenant && choice?.kind === 'default';

  /**
   * Recharge les réglages du périmètre affiché : le défaut (ou la plateforme),
   * et, pour une agence, ses réglages propres en plus.
   */
  useEffect(() => {
    setMenuAccess({});
    setOwnAccess({});
    if (awaitingTenant) {
      setLoadingMenuAccess(false);
      return;
    }
    let cancelled = false;
    setLoadingMenuAccess(true);
    Promise.all([
      listMenuAccess(null),
      scopeTenantId ? listMenuAccess(scopeTenantId) : Promise.resolve({} as MenuAccessMap)
    ])
      .then(([base, own]) => {
        if (cancelled) return;
        setMenuAccess(base);
        setOwnAccess(own);
      })
      .catch(() => {
        if (cancelled) return;
        setMenuAccess({});
        setOwnAccess({});
      })
      .finally(() => {
        if (!cancelled) setLoadingMenuAccess(false);
      });
    return () => {
      cancelled = true;
    };
  }, [awaitingTenant, scopeTenantId, reloadToken]);

  /** Charge les permissions du rôle sélectionné — source des états par défaut. */
  useEffect(() => {
    if (!selectedRole) return;

    // Un persona de portail n'a pas de permissions RBAC : `null` le signale, et
    // tous ses menus sont ouverts par défaut.
    if (!selectedRole.id) {
      setRolePermissionIds(new Set());
      setSavedPermissionIds(new Set());
      setRolePermissionKeys(null);
      return;
    }

    let cancelled = false;
    setLoadingRole(true);

    getRole(selectedRole.id)
      .then(role => {
        if (cancelled) return;
        setRolePermissionIds(new Set(role.permissions?.map(p => p.id) ?? []));
        setSavedPermissionIds(new Set(role.permissions?.map(p => p.id) ?? []));
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
    const own = tenantMode ? ownAccess[selectedRole.key] : undefined;
    const hasOwn = !!own && Object.keys(own).length > 0;
    return resolveMenuMap(selectedRole.persona, rolePermissionKeys, hasOwn ? own : menuAccess[selectedRole.key]);
  }, [selectedRole?.persona, selectedRole?.key, rolePermissionKeys, menuAccess, ownAccess, tenantMode]);

  /** L'agence choisie a-t-elle un réglage propre pour ce rôle ? */
  const hasOwnSetting = tenantMode && !!selectedRole && Object.keys(ownAccess[selectedRole.key] ?? {}).length > 0;

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

  const permsDirty = useMemo(
    () =>
      rolePermissionIds.size !== savedPermissionIds.size ||
      Array.from(rolePermissionIds).some(id => !savedPermissionIds.has(id)),
    [rolePermissionIds, savedPermissionIds]
  );
  const anyDirty = menusDirty || permsDirty;

  // Garde de sortie : fermer l'onglet avec des réglages non enregistrés demande confirmation.
  useEffect(() => {
    if (!anyDirty) return undefined;
    const avertir = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  }, [anyDirty]);

  const menuCounts = useMemo(() => {
    const keys = Object.keys(menuDraft);
    return { enabled: keys.filter(key => menuDraft[key]).length, total: keys.length };
  }, [menuDraft]);

  const handleSelectChoice = (next: MenuScopeChoice | null) => {
    if (sameMenuScope(next, choice)) return;
    if (!menusDirty) {
      setChoice(next);
      return;
    }
    confirmAction({
      title: t('Abandonner les modifications ?'),
      description: t("Les menus modifiés ne sont pas enregistrés : changer d'agence les fera perdre."),
      okText: t("Changer d'agence"),
      cancelText: t('Rester'),
      danger: true,
      onConfirm: () => setChoice(next)
    });
  };

  // Recharger la page efface les réglages non enregistrés : on demande d'abord.
  const handleReload = () => {
    if (!anyDirty) {
      window.location.reload();
      return;
    }
    confirmAction({
      title: t('Abandonner les modifications ?'),
      description: t('Les réglages modifiés ne sont pas enregistrés : recharger la page les fera perdre.'),
      okText: t('Recharger'),
      cancelText: t('Rester'),
      danger: true,
      onConfirm: () => window.location.reload()
    });
  };

  const handleSelectRole = (role: ManagedRole) => {
    if (role.key === selectedKey) return;
    const select = () => {
      setSelectedKey(role.key);
      setSuccess(null);
      setError(null);
    };
    if (!anyDirty) {
      select();
      return;
    }
    confirmAction({
      title: t('Abandonner les modifications ?'),
      description: t('Les réglages modifiés ne sont pas enregistrés : changer de rôle les fera perdre.'),
      okText: t('Changer de rôle'),
      cancelText: t('Rester'),
      danger: true,
      onConfirm: select
    });
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
      const saved = await updateMenuAccess(selectedRole.key, menuDraft, scopeTenantId);
      if (tenantMode) setOwnAccess(prev => ({ ...prev, [selectedRole.key]: saved }));
      else setMenuAccess(prev => ({ ...prev, [selectedRole.key]: saved }));
      setSuccess(t('Menus de « {{name}} » enregistrés.', { name: selectedRole.name }));
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors de la mise à jour des menus'));
    } finally {
      setSavingMenus(false);
    }
  };

  /** Efface le réglage propre de l'agence : elle retombe sur le défaut. */
  const handleRevertToDefault = async () => {
    if (!selectedRole || !scopeTenantId) return;
    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      await updateMenuAccess(selectedRole.key, {}, scopeTenantId);
      setReloadToken(n => n + 1);
      setSuccess(t('Menus de « {{name}} » enregistrés.', { name: selectedRole.name }));
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors de la mise à jour des menus'));
    } finally {
      setResetting(false);
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
      setSavedPermissionIds(new Set(updated.permissions?.map(p => p.id) ?? []));
      setRolePermissionKeys(new Set(updated.permissions?.map(p => p.key) ?? []));
      setRoles(prev => prev.map(r => (r.id === updated.id ? { ...r, ...updated } : r)));
      setSuccess(t('Permissions mises à jour avec succès.'));
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors de la mise à jour des permissions'));
    } finally {
      setSavingPermissions(false);
    }
  };

  // Recherche locale dans les permissions (état dans l'URL, préfixe `perm`).
  const permissionList = useMemo(
    () => permissions.filter(perm => !perm.key.startsWith('COMMUNICATION_')),
    [permissions]
  );
  const permissionSearch = useLocalListSearch<Permission>(permissionList, {
    paramPrefix: 'perm',
    defaultPageSize: 1000,
    text: PERMISSION_TEXT,
    predicates: { granted: (perm, wanted) => rolePermissionIds.has(perm.id) === wanted },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Permission, description, groupe…')
      },
      {
        key: 'granted',
        type: 'boolean',
        label: t('Accordée au rôle'),
        primary: true,
        tristate: true,
        trueLabel: t('Accordées'),
        falseLabel: t('Non accordées')
      }
    ]
  });

  const groupedPermissions = useMemo(() => {
    return permissionSearch.filtered.reduce<Record<string, Permission[]>>((acc, perm) => {
      const prefix = perm.key.split('_')[0];
      (acc[prefix] ||= []).push(perm);
      return acc;
    }, {});
  }, [permissionSearch.filtered]);

  // Recherche locale dans les entrées de menu (préfixe `menu`).
  const menuRows = useMemo<MenuRow[]>(
    () => sections.flatMap(section => section.entries.map(entry => ({ sectionId: section.id, entry }))),
    [sections]
  );
  const menuSearch = useLocalListSearch<MenuRow>(menuRows, {
    paramPrefix: 'menu',
    defaultPageSize: 1000,
    text: MENU_TEXT,
    predicates: { active: (row, wanted) => Boolean(menuDraft[row.entry.menuKey]) === wanted },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Menu ou sous-menu…')
      },
      {
        key: 'active',
        type: 'boolean',
        label: t('État du menu'),
        primary: true,
        tristate: true,
        trueLabel: t('Actifs'),
        falseLabel: t('Inactifs')
      }
    ]
  });

  if (loading) {
    return <SkeletonDetail />;
  }

  if (error && roles.length === 0) {
    return <StateBlock variant="error" description={error} onRetry={() => setInitToken(n => n + 1)} />;
  }

  const permissionGroupKeys = Object.keys(groupedPermissions);
  const openGroupKeys = permissionGroupKeys.filter(key => !closedGroups.includes(key));

  const personaLabel = selectedRole?.persona ? getNavigation()[selectedRole.persona].label : null;

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
                      style={{ minHeight: 32 }}
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
          <HelpButton size="small" helpId="administration.pilotage.roles.menus" />
          <Tag color={SCOPE_TAGS[selectedRole.scope].color}>{SCOPE_TAGS[selectedRole.scope].label}</Tag>
          {!awaitingTenant && (
            <Badge
              count={t('{{enabled}}/{{total}} actifs', { enabled: menuCounts.enabled, total: menuCounts.total })}
              style={{ background: 'var(--ant-color-fill-secondary, #f0f0f0)', color: 'rgba(0,0,0,0.65)' }}
            />
          )}
          {tenantMode && !loadingMenuAccess && (
            <Tag color={hasOwnSetting ? 'orange' : 'default'}>
              {hasOwnSetting ? t("Réglage propre à l'agence") : t('Hérite du défaut')}
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space wrap>
          {menusDirty && <Text type="warning">{t('Modifications non enregistrées')}</Text>}
          {hasOwnSetting && (
            <Popconfirm
              title={t('Revenir au défaut ?')}
              description={t('Cette agence reprendra le réglage par défaut : son réglage propre sera supprimé.')}
              okText={t('Revenir au défaut')}
              cancelText={t('Annuler')}
              onConfirm={handleRevertToDefault}
            >
              <Button loading={resetting} style={{ minHeight: 44 }}>
                {t('Revenir au défaut')}
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title={t('Rétablir les valeurs par défaut ?')}
            description={t(
              "Les menus reprendront l'état déduit des permissions du rôle. Rien n'est enregistré tant que vous n'avez pas cliqué sur Enregistrer."
            )}
            okText={t('Rétablir')}
            cancelText={t('Annuler')}
            onConfirm={handleResetMenus}
          >
            <Button icon={<UndoOutlined />} style={{ minHeight: 44 }}>
              {t('Valeurs par défaut')}
            </Button>
          </Popconfirm>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveMenus}
            loading={savingMenus}
            disabled={!menusDirty || awaitingTenant}
            style={{ minHeight: 44 }}
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
              {t(
                "Les catégories et les entrées ci-dessous sont exactement celles du menu latéral de ce persona. Par défaut, une entrée est active quand les permissions du rôle l'autorisent ; la désactiver la retire du menu, de la barre d'onglets mobile et du tiroir de navigation. Ce réglage cache une entrée, il ne remplace pas un contrôle d'accès : les permissions restent réglées dans l'onglet voisin."
              )}
            </Text>
          }
        />

        <Text type="secondary">
          {!needsTenant
            ? t("Ces réglages s'appliquent à la plateforme.")
            : tenantMode
              ? t('Ces réglages remplacent le défaut pour cette agence seulement.')
              : null}
        </Text>
        {needsTenant && <MenuTenantSelect value={choice} onChange={handleSelectChoice} />}
        {defaultMode && (
          <Alert
            type="warning"
            showIcon
            title={t("Ces réglages s'appliquent à toutes les agences qui n'ont pas leur propre réglage.")}
          />
        )}

        {awaitingTenant ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Choisissez une agence pour régler ses menus.')} />
        ) : loadingRole || loadingMenuAccess ? (
          <SkeletonDetail rows={4} />
        ) : (
          <>
            <ListSearch {...menuSearch.searchProps} aria-label={t('Rechercher dans les menus')} />
            {menuSearch.isFiltered && menuSearch.filtered.length === 0 && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucun menu ne correspond aux critères.')} />
            )}
            {sections.map(section => {
              const rows = menuSearch.filtered.filter(row => row.sectionId === section.id);
              if (rows.length === 0) return null;
              return (
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
                  {rows.map(row => renderMenuEntry(row.entry))}
                </div>
              );
            })}
          </>
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
            {t(
              "{{role}} n'est pas un rôle RBAC : son périmètre vient du rattachement à l'agence (bail ou bien), pas de permissions. Seuls ses menus se règlent, dans l'onglet voisin.",
              { role: selectedRole.name }
            )}
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
          <HelpButton size="small" helpId="administration.pilotage.roles.permissions" />
          <Tag color={SCOPE_TAGS[selectedRole.scope].color}>{SCOPE_TAGS[selectedRole.scope].label}</Tag>
          <Tag>{t('{{count}} permissions accordées', { count: rolePermissionIds.size })}</Tag>
        </Space>
      }
      extra={
        <Space wrap>
          {permsDirty && <Text type="warning">{t('Modifications non enregistrées')}</Text>}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSavePermissions}
            loading={savingPermissions}
            disabled={!permsDirty}
            style={{ minHeight: 44 }}
          >
            {t('Enregistrer')}
          </Button>
        </Space>
      }
    >
      {selectedRole.description && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {selectedRole.description}
        </Text>
      )}

      {loadingRole ? (
        <SkeletonDetail rows={4} />
      ) : permissionList.length === 0 ? (
        <Empty description={t('Aucune permission disponible')} />
      ) : (
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <ListSearch {...permissionSearch.searchProps} aria-label={t('Rechercher dans les permissions')} />
          {permissionSearch.isFiltered && Object.keys(groupedPermissions).length === 0 && (
            <Empty description={t('Aucune permission ne correspond aux critères.')} />
          )}
          <Collapse
            ghost
            activeKey={openGroupKeys}
            onChange={keys => {
              const open = Array.isArray(keys) ? keys.map(String) : [String(keys)];
              setClosedGroups(permissionGroupKeys.filter(key => !open.includes(key)));
            }}
            items={Object.entries(groupedPermissions).map(([prefix, perms]) => {
              const grantedCount = perms.filter(permission => rolePermissionIds.has(permission.id)).length;
              return {
                key: prefix,
                label: (
                  <Space wrap>
                    <Text strong style={{ fontSize: 13 }}>
                      {getPermissionGroupLabelFr(prefix)}
                    </Text>
                    <Tag>{t('{{granted}} sur {{total}}', { granted: grantedCount, total: perms.length })}</Tag>
                  </Space>
                ),
                children: (
                  <Row gutter={[16, 12]}>
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
                            style={{ alignItems: 'flex-start', marginInlineEnd: 0, minHeight: 44 }}
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
                )
              };
            })}
          />
        </Space>
      )}
    </Card>
  );

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        title={t('Rôles, menus et permissions')}
        subtitle={t("Choisissez un rôle, puis réglez les menus qu'il voit et les permissions qu'il détient.")}
      />

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
        <Col xs={24} lg={7} xl={6} {...helpAnchor('roles-liste')}>
          <Card
            title={<HelpSectionTitle title={t('Rôles')} helpId="administration.pilotage.roles.liste" />}
            size="small"
            extra={
              <Tooltip title={t('Recharger les rôles et les menus')}>
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={handleReload}
                  aria-label={t('Recharger')}
                  style={{ minWidth: 44, minHeight: 44 }}
                />
              </Tooltip>
            }
          >
            <List
              dataSource={managedRoles}
              renderItem={role => {
                const isSelected = selectedKey === role.key;
                const sameScope = (role.scope !== 'PLATFORM') === needsTenant;
                const shown = tenantMode ? ownAccess : menuAccess;
                const overrideCount = sameScope ? Object.values(shown[role.key] ?? {}).length : 0;
                return (
                  <List.Item
                    key={role.key}
                    style={{
                      cursor: 'pointer',
                      minHeight: 44,
                      background: isSelected ? 'var(--ant-color-primary-bg)' : undefined,
                      borderRadius: 6,
                      marginBottom: 4,
                      paddingInlineStart: 8,
                      borderInlineStart: isSelected ? '3px solid var(--ant-color-primary)' : '3px solid transparent'
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectRole(role)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectRole(role);
                      }
                    }}
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
                          <Tag color={SCOPE_TAGS[role.scope].color}>{SCOPE_TAGS[role.scope].label}</Tag>
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

        <Col xs={24} lg={17} xl={18} {...helpAnchor('roles-onglets')}>
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
