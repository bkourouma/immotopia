import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Spin, Drawer } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  HomeOutlined,
  TeamOutlined,
  FileTextOutlined,
  SettingOutlined,
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  SafetyOutlined,
  CreditCardOutlined,
  UserAddOutlined,
  MailOutlined,
  MessageOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
  UserSwitchOutlined,
  RiseOutlined,
  KeyOutlined,
  CodeOutlined,
  ToolOutlined
} from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useSidebar } from '../../context/SidebarContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const { Sider } = Layout;

interface NavItem {
  title: string;
  href?: string;
  icon: React.ReactNode;
  children?: { title: string; href: string; key: string }[];
  requiredRole?: 'SUPER_ADMIN' | 'TENANT_USER' | 'PUBLIC';
  key: string;
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, tenantMembership, tenantClient, isLoadingMembership } = useAuth();
  const { isMobileSidebarOpen, closeMobileSidebar } = useSidebar();
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [lastSyndicId, setLastSyndicId] = useState<string | null>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Determine user type
  const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN';
  const isTenantUser = !isSuperAdmin && tenantMembership !== null;
  const isTenantClient = !isSuperAdmin && !isTenantUser && tenantClient !== null;
  const isPublicUser = !isSuperAdmin && !isTenantUser && !isTenantClient && !isLoadingMembership;

  const currentSyndicContext = useMemo(() => {
    const match = location.pathname.match(/^\/tenant\/([^/]+)\/syndics\/([^/]+)/);
    if (!match) return null;

    const [, tenantId, syndicId] = match;
    if (!tenantId || !syndicId) return null;

    return { tenantId, syndicId };
  }, [location.pathname]);

  useEffect(() => {
    const tenantId = tenantMembership?.tenantId;
    if (!tenantId) {
      setLastSyndicId(null);
      return;
    }

    const storedSyndicId = localStorage.getItem(`last-syndic:${tenantId}`);
    setLastSyndicId(storedSyndicId || null);
  }, [tenantMembership?.tenantId]);

  useEffect(() => {
    const tenantId = tenantMembership?.tenantId;
    if (!tenantId || !currentSyndicContext?.syndicId) {
      return;
    }

    localStorage.setItem(`last-syndic:${tenantId}`, currentSyndicContext.syndicId);
    setLastSyndicId(currentSyndicContext.syndicId);
  }, [currentSyndicContext?.syndicId, tenantMembership?.tenantId]);

  const syndicChildren = useMemo(() => {
    const tenantId = currentSyndicContext?.tenantId || tenantMembership?.tenantId;
    const syndicId = currentSyndicContext?.syndicId || lastSyndicId;
    const syndicsListHref = tenantId ? `/tenant/${tenantId}/syndics` : '/dashboard';
    const syndicBaseHref = tenantId && syndicId ? `/tenant/${tenantId}/syndics/${syndicId}` : null;
    const withFallback = (suffix?: string, section?: string) => {
      if (!syndicBaseHref) {
        if (section) {
          return `${syndicsListHref}?openSyndicSection=${section}`;
        }
        return syndicsListHref;
      }
      return suffix ? `${syndicBaseHref}/${suffix}` : syndicBaseHref;
    };

    return [
      { title: 'Copropriétés', href: syndicsListHref, key: 'syndics-list' },
      { title: 'Fiche syndic', href: withFallback(undefined, 'detail'), key: 'syndics-detail' },
      { title: 'Gérer les lots', href: withFallback('lots', 'lots'), key: 'syndics-lots' },
      { title: 'Gérer les charges', href: withFallback('charges', 'charges'), key: 'syndics-charges' },
      { title: 'Gérer les AG', href: withFallback('assemblees', 'assemblees'), key: 'syndics-meetings' },
      { title: 'Prestataires', href: withFallback('prestataires', 'prestataires'), key: 'syndics-providers' },
      { title: 'Documents', href: withFallback('documents', 'documents'), key: 'syndics-documents' },
      { title: 'Finances', href: withFallback('finances', 'finances'), key: 'syndics-finances' },
      { title: 'Recouvrement', href: withFallback('recouvrement', 'recouvrement'), key: 'syndics-recovery' },
      { title: 'Comptabilité', href: withFallback('comptabilite', 'comptabilite'), key: 'syndics-accounting' },
      { title: 'Budgets', href: withFallback('budgets', 'budgets'), key: 'syndics-budgets' },
      {
        title: 'Profils & incidents',
        href: withFallback('profils-incidents', 'profils-incidents'),
        key: 'syndics-profiles-incidents'
      }
    ];
  }, [currentSyndicContext, lastSyndicId, tenantMembership?.tenantId]);

  // Platform Admin Navigation (SUPER_ADMIN only)
  const adminNavigationItems: NavItem[] = [
    {
      key: 'dashboard',
      title: 'Tableau de bord',
      href: '/dashboard',
      icon: <DashboardOutlined />,
      requiredRole: 'SUPER_ADMIN'
    },
    {
      key: 'administration',
      title: 'Administration',
      icon: <SafetyOutlined />,
      requiredRole: 'SUPER_ADMIN',
      children: [
        { title: 'Tenants', href: '/admin/tenants', key: 'admin-tenants' },
        { title: 'Rôles & Permissions', href: '/admin/roles-permissions', key: 'admin-roles' },
        { title: 'Statistiques', href: '/admin/statistics', key: 'admin-statistics' },
        { title: "Journaux d'audit", href: '/admin/audit', key: 'admin-audit' }
      ]
    }
  ];

  // Tenant User Navigation (Tenant collaborators only)
  const tenantNavigationItems: NavItem[] = [
    {
      key: 'dashboard',
      title: 'Tableau de bord',
      href: '/dashboard',
      icon: <DashboardOutlined />,
      requiredRole: 'TENANT_USER'
    },
    {
      key: 'gestion',
      title: 'Gestion',
      icon: <TeamOutlined />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Collaborateurs', href: `/tenant/${tenantMembership?.tenantId}/collaborators`, key: 'collaborators' },
        { title: 'Invitations', href: `/tenant/${tenantMembership?.tenantId}/invitations`, key: 'invitations' },
        { title: 'Paramètres', href: `/tenant/${tenantMembership?.tenantId}/settings`, key: 'settings' }
      ]
    },
    {
      key: 'properties',
      title: 'Propriétés',
      icon: <HomeOutlined />,
      requiredRole: 'TENANT_USER',
      children: [
        {
          title: 'Toutes les propriétés',
          href: `/tenant/${tenantMembership?.tenantId}/properties`,
          key: 'properties-list'
        },
        {
          title: 'Calendrier des visites',
          href: `/tenant/${tenantMembership?.tenantId}/properties/visits/calendar`,
          key: 'visits-calendar'
        },
        {
          title: 'Ajouter une propriété',
          href: `/tenant/${tenantMembership?.tenantId}/properties/new`,
          key: 'properties-new'
        }
      ]
    },
    {
      key: 'patrimoine',
      title: 'Patrimoine',
      icon: <BankOutlined />,
      requiredRole: 'TENANT_USER',
      children: [
        {
          title: 'Vue consolidée',
          href: `/tenant/${tenantMembership?.tenantId}/patrimoine`,
          key: 'patrimoine-overview'
        },
        {
          title: 'Performance',
          href: `/tenant/${tenantMembership?.tenantId}/patrimoine/performance`,
          key: 'patrimoine-performance'
        },
        {
          title: 'Travaux',
          href: `/tenant/${tenantMembership?.tenantId}/patrimoine/work-programs`,
          key: 'patrimoine-work-programs'
        },
        {
          title: 'Relevés',
          href: `/tenant/${tenantMembership?.tenantId}/patrimoine/statements`,
          key: 'patrimoine-statements'
        }
      ]
    },
    {
      key: 'syndic',
      title: 'Syndic',
      icon: <BankOutlined />,
      requiredRole: 'TENANT_USER',
      children: syndicChildren
    },
    {
      key: 'clients',
      title: 'Clients',
      icon: <TeamOutlined />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Tous les clients', href: '/clients', key: 'clients-list' },
        { title: 'Groupes', href: '/clients/groups', key: 'clients-groups' }
      ]
    },
    {
      key: 'transactions',
      title: 'Transactions',
      icon: <FileTextOutlined />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Toutes les transactions', href: '/transactions', key: 'transactions-list' },
        { title: 'Ventes', href: '/transactions/sales', key: 'transactions-sales' },
        { title: 'Locations', href: '/transactions/rentals', key: 'transactions-rentals' }
      ]
    },
    {
      key: 'reports',
      title: 'Rapports',
      href: '/reports',
      icon: <BarChartOutlined />,
      requiredRole: 'TENANT_USER'
    },
    {
      key: 'crm',
      title: 'CRM',
      icon: <RiseOutlined />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Tableau de bord', href: `/tenant/${tenantMembership?.tenantId}/crm/dashboard`, key: 'crm-dashboard' },
        { title: 'Calendrier', href: `/tenant/${tenantMembership?.tenantId}/crm/calendar`, key: 'crm-calendar' },
        { title: 'Contacts', href: `/tenant/${tenantMembership?.tenantId}/crm/contacts`, key: 'crm-contacts' },
        {
          title: 'Nouveau contact',
          href: `/tenant/${tenantMembership?.tenantId}/crm/contacts/new`,
          key: 'crm-contacts-new'
        },
        { title: 'Affaires', href: `/tenant/${tenantMembership?.tenantId}/crm/deals`, key: 'crm-deals' },
        { title: 'Activités', href: `/tenant/${tenantMembership?.tenantId}/crm/activities`, key: 'crm-activities' }
      ]
    },
    {
      key: 'rental',
      title: 'Gestion Locative',
      icon: <KeyOutlined />,
      requiredRole: 'TENANT_USER',
      children: [
        { title: 'Baux', href: `/tenant/${tenantMembership?.tenantId}/rental/leases`, key: 'rental-leases' },
        {
          title: 'Nouveau bail',
          href: `/tenant/${tenantMembership?.tenantId}/rental/leases/new`,
          key: 'rental-leases-new'
        },
        {
          title: 'Échéances',
          href: `/tenant/${tenantMembership?.tenantId}/rental/installments`,
          key: 'rental-installments'
        },
        { title: 'Paiements', href: `/tenant/${tenantMembership?.tenantId}/rental/payments`, key: 'rental-payments' },
        {
          title: 'Templates de documents',
          href: `/tenant/${tenantMembership?.tenantId}/documents/templates`,
          key: 'documents-templates'
        }
      ]
    },
    {
      key: 'maintenance',
      title: 'Maintenance',
      icon: <ToolOutlined />,
      requiredRole: 'TENANT_USER',
      children: [
        {
          title: 'Mes tickets',
          href: `/tenant/${tenantMembership?.tenantId}/maintenance`,
          key: 'maintenance-tickets-tenant'
        },
        {
          title: 'Nouveau ticket',
          href: `/tenant/${tenantMembership?.tenantId}/maintenance/new`,
          key: 'maintenance-tickets-new'
        },
        {
          title: 'Gestion des tickets',
          href: `/tenant/${tenantMembership?.tenantId}/admin/maintenance/tickets`,
          key: 'maintenance-tickets-admin'
        },
        {
          title: 'Prestataires',
          href: `/tenant/${tenantMembership?.tenantId}/admin/maintenance/vendors`,
          key: 'maintenance-vendors'
        }
      ]
    },
    {
      key: 'communication',
      title: 'Communication',
      icon: <MailOutlined />,
      requiredRole: 'TENANT_USER',
      children: [
        {
          title: 'Notifications email',
          href: `/tenant/${tenantMembership?.tenantId}/communication/email-notifications`,
          key: 'communication-email-notifications'
        },
        {
          title: 'Notifications WhatsApp',
          href: `/tenant/${tenantMembership?.tenantId}/communication/whatsapp-notifications`,
          key: 'communication-whatsapp-notifications'
        },
        {
          title: 'Message Groupe WhatsApp',
          href: `/tenant/${tenantMembership?.tenantId}/communication/whatsapp-group-message`,
          key: 'communication-whatsapp-group-message'
        },
        {
          title: 'Newsletter',
          href: `/tenant/${tenantMembership?.tenantId}/newsletter/lists`,
          key: 'newsletter-lists'
        },
        {
          title: 'Campagnes',
          href: `/tenant/${tenantMembership?.tenantId}/newsletter/campaigns`,
          key: 'newsletter-campaigns'
        },
        {
          title: 'Templates',
          href: `/tenant/${tenantMembership?.tenantId}/newsletter/templates`,
          key: 'newsletter-templates'
        }
      ]
    }
  ];

  // Public User Navigation (can see multiple tenants)
  const publicNavigationItems: NavItem[] = [
    {
      key: 'dashboard',
      title: 'Tableau de bord',
      href: '/dashboard',
      icon: <DashboardOutlined />,
      requiredRole: 'PUBLIC'
    },
    {
      key: 'properties',
      title: 'Propriétés',
      icon: <HomeOutlined />,
      requiredRole: 'PUBLIC',
      children: [
        { title: 'Toutes les propriétés', href: '/properties', key: 'properties-list' },
        { title: 'Catégories', href: '/properties/categories', key: 'properties-categories' }
      ]
    }
  ];

  // Select navigation based on user type (memoized to prevent unnecessary re-renders)
  const navigationItems: NavItem[] = useMemo(() => {
    if (isSuperAdmin) {
      return adminNavigationItems;
    } else if (isTenantUser && !isLoadingMembership) {
      return tenantNavigationItems;
    } else if (isPublicUser && !isLoadingMembership) {
      return publicNavigationItems;
    }
    return [];
  }, [isSuperAdmin, isTenantUser, isTenantClient, isPublicUser, isLoadingMembership, tenantMembership?.tenantId]);

  // Convert NavItem[] to Ant Design Menu items
  const convertToMenuItems = (items: NavItem[]): MenuProps['items'] => {
    return items.map(item => {
      if (item.children) {
        return {
          key: item.key,
          icon: item.icon,
          label: item.title,
          children: item.children.map(child => ({
            key: child.key || child.href,
            label: child.title
          }))
        };
      }
      return {
        key: item.key || item.href || '',
        icon: item.icon,
        label: item.title
      };
    });
  };

  // Helper function to normalize paths by replacing dynamic segments with placeholders
  const normalizePath = (path: string): string => {
    // Remove query strings
    let normalized = path.split('?')[0];

    // Replace UUIDs with placeholder
    normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');

    // Replace numeric IDs
    normalized = normalized.replace(/\/\d+/g, '/:id');

    return normalized;
  };

  // Helper function to match paths with dynamic parameters
  const matchPath = (currentPath: string, patternPath: string, exactOnly: boolean = false): boolean => {
    // Remove query strings
    const current = currentPath.split('?')[0];
    let pattern = patternPath.split('?')[0];

    // Replace template variables with actual tenantId if available
    if (pattern.includes('${tenantMembership?.tenantId}') && tenantMembership?.tenantId) {
      pattern = pattern.replace(/\${tenantMembership\?\.tenantId}/g, tenantMembership.tenantId);
    }

    // Exact match (always check first)
    if (current === pattern) return true;

    // If exactOnly is true, don't check for prefix matches
    if (exactOnly) {
      // Normalize both paths to compare structure (replace UUIDs and IDs)
      const normalizedCurrent = normalizePath(current);
      const normalizedPattern = normalizePath(pattern);
      return normalizedCurrent === normalizedPattern;
    }

    // Normalize both paths to compare structure (replace UUIDs and IDs)
    const normalizedCurrent = normalizePath(current);
    const normalizedPattern = normalizePath(pattern);

    // Check if normalized paths match exactly
    if (normalizedCurrent === normalizedPattern) return true;

    // Check if current path starts with pattern (for nested routes)
    // Only allow prefix matching if the next segment in current path is NOT a direct child
    // This prevents matching `/rental/leases` when on `/rental/leases/new`
    if (current.startsWith(pattern + '/')) {
      // Additional check: if pattern is a parent of other menu items,
      // only match if there's no exact match for a sibling route
      // This is handled by checking children first in the useEffect
      return true;
    }

    // Check if normalized current starts with normalized pattern
    if (normalizedCurrent.startsWith(normalizedPattern + '/')) return true;

    return false;
  };

  // Update selected keys based on current location
  useEffect(() => {
    if (isLoadingMembership || navigationItems.length === 0) return;

    const currentPath = location.pathname;
    const keys: string[] = [];
    const open: string[] = [];

    navigationItems.forEach(item => {
      // First check children (more specific matches first)
      if (item.children) {
        // Check for exact matches first (most specific)
        let activeChild = item.children.find(child => {
          const current = currentPath.split('?')[0];
          let pattern = child.href.split('?')[0];
          if (pattern.includes('${tenantMembership?.tenantId}') && tenantMembership?.tenantId) {
            pattern = pattern.replace(/\${tenantMembership\?\.tenantId}/g, tenantMembership.tenantId);
          }
          return current === pattern;
        });

        // If no exact match, try normalized exact matching (but prioritize longer/more specific paths)
        if (!activeChild) {
          // Sort children by href length (longest first) to prioritize more specific routes
          const sortedChildren = [...item.children].sort((a, b) => b.href.length - a.href.length);
          activeChild = sortedChildren.find(child => {
            // Use exactOnly=true to avoid matching sibling routes (e.g., /leases matching /leases/new)
            return matchPath(currentPath, child.href, true);
          });
        }

        // Last resort: allow prefix matching only if no exact or normalized match was found
        // This handles truly nested routes like /properties/:id/edit
        if (!activeChild) {
          activeChild = item.children.find(child => {
            return matchPath(currentPath, child.href, false);
          });
        }

        if (activeChild) {
          keys.push(activeChild.key || activeChild.href);
          open.push(item.key);
          return; // Don't check parent item if child is active
        }
      }
      // Then check parent items (only if no child was matched)
      if (item.href && matchPath(currentPath, item.href)) {
        keys.push(item.key);
      }
    });

    setSelectedKeys(keys);
    setOpenKeys(open);
  }, [location.pathname, navigationItems, isLoadingMembership]);

  const menuItems = useMemo(() => convertToMenuItems(navigationItems), [navigationItems]);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    // Find the href for this key
    const findHref = (items: NavItem[]): string | null => {
      for (const item of items) {
        if (item.key === key || item.href === key) {
          return item.href || null;
        }
        if (item.children) {
          for (const child of item.children) {
            if (child.key === key || child.href === key) {
              return child.href || null;
            }
          }
        }
      }
      return null;
    };

    const href = findHref(navigationItems);
    if (href) {
      navigate(href);
      // Close mobile sidebar after navigation
      closeMobileSidebar();
    }
  };

  // Render sidebar content (logo + menu)
  const renderSidebarContent = () => (
    <>
      {/* Logo Section */}
      <div
        style={{
          display: 'flex',
          height: 64,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #1e293b',
          padding: '0 24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: '#1890ff'
            }}
          >
            <HomeOutlined style={{ fontSize: 24, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>ImmoPro</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Gestion Immobilière</div>
          </div>
        </div>
      </div>

      {/* Navigation Section */}
      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={selectedKeys}
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        onClick={handleMenuClick}
        items={menuItems}
        style={{
          height: 'calc(100vh - 64px)',
          overflowY: 'auto',
          backgroundColor: '#0f172a',
          borderRight: 0
        }}
      />
    </>
  );

  if (isLoadingMembership) {
    const loadingContent = (
      <>
        <div
          style={{
            display: 'flex',
            height: 64,
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #1e293b',
            padding: '0 24px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                backgroundColor: '#1890ff'
              }}
            >
              <HomeOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>ImmoPro</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Gestion Immobilière</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      </>
    );

    return (
      <>
        {/* Desktop Sidebar */}
        {isDesktop && (
          <Sider
            width={256}
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              bottom: 0,
              backgroundColor: '#0f172a',
              zIndex: 30
            }}
          >
            {loadingContent}
          </Sider>
        )}

        {/* Mobile Drawer */}
        {!isDesktop && (
          <Drawer
            title={null}
            placement="left"
            closable={false}
            onClose={closeMobileSidebar}
            open={isMobileSidebarOpen}
            width={256}
            bodyStyle={{ padding: 0, backgroundColor: '#0f172a' }}
            style={{ zIndex: 50 }}
          >
            {loadingContent}
          </Drawer>
        )}
      </>
    );
  }

  return (
    <>
      {/* Desktop Sidebar */}
      {isDesktop && (
        <Sider
          width={256}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            backgroundColor: '#0f172a',
            zIndex: 30
          }}
        >
          {renderSidebarContent()}
        </Sider>
      )}

      {/* Mobile Drawer */}
      {!isDesktop && (
        <Drawer
          title={null}
          placement="left"
          closable={false}
          onClose={closeMobileSidebar}
          open={isMobileSidebarOpen}
          width={256}
          bodyStyle={{ padding: 0, backgroundColor: '#0f172a' }}
          style={{ zIndex: 50 }}
        >
          {renderSidebarContent()}
        </Drawer>
      )}
    </>
  );
}
